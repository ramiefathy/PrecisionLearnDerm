import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from 'firebase-functions';
import { config } from './config';

interface QuotaState {
  requestsThisMinute: number;
  requestsToday: number;
  lastMinuteReset: number;
  lastDayReset: number;
  consecutiveErrors: number;
  isRateLimited: boolean;
  rateLimitedUntil: number;
}

export class GeminiQuotaManager {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private quotaState: QuotaState;
  
  // Free tier limits (conservative estimates)
  private readonly REQUESTS_PER_MINUTE_LIMIT = 15;
  private readonly REQUESTS_PER_DAY_LIMIT = 1500;
  private readonly MIN_REQUEST_INTERVAL = 4000; // 4 seconds between requests
  private readonly MAX_RETRIES = 3;
  private readonly BACKOFF_BASE = 5000; // 5 second base backoff

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.gemini.model });
    
    this.quotaState = {
      requestsThisMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now(),
      consecutiveErrors: 0,
      isRateLimited: false,
      rateLimitedUntil: 0
    };
  }

  private resetCountersIfNeeded(): void {
    const now = Date.now();
    
    // Reset minute counter
    if (now - this.quotaState.lastMinuteReset >= 60000) {
      this.quotaState.requestsThisMinute = 0;
      this.quotaState.lastMinuteReset = now;
    }
    
    // Reset day counter
    if (now - this.quotaState.lastDayReset >= 24 * 60 * 60 * 1000) {
      this.quotaState.requestsToday = 0;
      this.quotaState.lastDayReset = now;
    }
    
    // Check if rate limit period has expired
    if (this.quotaState.isRateLimited && now > this.quotaState.rateLimitedUntil) {
      this.quotaState.isRateLimited = false;
      this.quotaState.consecutiveErrors = 0;
      logger.info('Rate limit period expired, resuming normal operation');
    }
  }

  private canMakeRequest(): boolean {
    this.resetCountersIfNeeded();
    
    if (this.quotaState.isRateLimited) {
      return false;
    }
    
    return this.quotaState.requestsThisMinute < this.REQUESTS_PER_MINUTE_LIMIT &&
           this.quotaState.requestsToday < this.REQUESTS_PER_DAY_LIMIT;
  }

  private async waitForRateLimit(): Promise<void> {
    const waitTime = Math.max(
      this.MIN_REQUEST_INTERVAL,
      this.quotaState.consecutiveErrors * this.BACKOFF_BASE
    );
    
    logger.info(`Rate limiting: waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  private handleQuotaError(error: any): void {
    this.quotaState.consecutiveErrors++;
    
    if (error.message.includes('429') || error.message.includes('quota')) {
      // Extract retry delay from error if available
      let retryDelay = 60000; // Default 1 minute
      
      try {
        const retryMatch = error.message.match(/retryDelay":"(\d+)s"/);
        if (retryMatch) {
          retryDelay = parseInt(retryMatch[1]) * 1000;
        }
      } catch (e) {
        // Use default
      }
      
      this.quotaState.isRateLimited = true;
      this.quotaState.rateLimitedUntil = Date.now() + Math.max(retryDelay, 60000);
      
      logger.warn('Quota exceeded, implementing rate limiting', {
        retryDelay,
        rateLimitedUntil: new Date(this.quotaState.rateLimitedUntil).toISOString(),
        consecutiveErrors: this.quotaState.consecutiveErrors
      });
    }
  }

  async generateWithQuotaManagement(prompt: string, maxRetries: number = this.MAX_RETRIES): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if we can make a request
        if (!this.canMakeRequest()) {
          if (this.quotaState.isRateLimited) {
            const waitTime = this.quotaState.rateLimitedUntil - Date.now();
            throw new Error(`Rate limited. Please wait ${Math.ceil(waitTime / 1000)} seconds before trying again.`);
          } else {
            throw new Error(`Daily or per-minute quota would be exceeded. Requests today: ${this.quotaState.requestsToday}, this minute: ${this.quotaState.requestsThisMinute}`);
          }
        }

        // Wait between requests to avoid hitting rate limits
        if (this.quotaState.consecutiveErrors > 0) {
          await this.waitForRateLimit();
        }

        logger.info(`Gemini API request attempt ${attempt}/${maxRetries}`, {
          requestsThisMinute: this.quotaState.requestsThisMinute,
          requestsToday: this.quotaState.requestsToday,
          consecutiveErrors: this.quotaState.consecutiveErrors
        });

        // Make the actual request
        const response = await this.model.generateContent(prompt);
        const text = response.response.text();

        // Success - update counters and reset error count
        this.quotaState.requestsThisMinute++;
        this.quotaState.requestsToday++;
        this.quotaState.consecutiveErrors = 0;

        logger.info('Gemini API request successful', {
          responseLength: text.length,
          requestsThisMinute: this.quotaState.requestsThisMinute,
          requestsToday: this.quotaState.requestsToday
        });

        return text;

      } catch (error) {
        const isQuotaError = error instanceof Error && 
          (error.message.includes('429') || error.message.includes('quota'));

        if (isQuotaError) {
          this.handleQuotaError(error);
          
          if (attempt === maxRetries) {
            throw new Error(`Gemini API quota exhausted after ${maxRetries} attempts. Daily quota may be exceeded. Please try again later or upgrade your API plan.`);
          }
          
          // Wait progressively longer for quota errors
          const backoffTime = Math.min(30000, attempt * 10000); // Cap at 30 seconds
          logger.warn(`Quota error on attempt ${attempt}, waiting ${backoffTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          
        } else {
          // Non-quota error - don't retry
          logger.error('Non-quota error in Gemini API request', {
            error: error instanceof Error ? error.message : String(error),
            attempt
          });
          throw error;
        }
      }
    }

    throw new Error(`Failed to complete Gemini API request after ${maxRetries} attempts`);
  }

  async healthCheck(): Promise<{ healthy: boolean; quotaStatus: QuotaState; canMakeRequest: boolean }> {
    this.resetCountersIfNeeded();
    
    return {
      healthy: this.canMakeRequest() && !this.quotaState.isRateLimited,
      quotaStatus: { ...this.quotaState },
      canMakeRequest: this.canMakeRequest()
    };
  }

  getQuotaStatus(): QuotaState & { canMakeRequest: boolean } {
    this.resetCountersIfNeeded();
    return {
      ...this.quotaState,
      canMakeRequest: this.canMakeRequest()
    };
  }

  // Reset quota state (for testing or manual reset)
  resetQuotaState(): void {
    this.quotaState = {
      requestsThisMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now(),
      consecutiveErrors: 0,
      isRateLimited: false,
      rateLimitedUntil: 0
    };
    
    logger.info('Quota state manually reset');
  }
}

// Export singleton instance
let quotaManagerInstance: GeminiQuotaManager | null = null;

export function getGeminiQuotaManager(): GeminiQuotaManager {
  if (!quotaManagerInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }
    quotaManagerInstance = new GeminiQuotaManager(apiKey);
  }
  return quotaManagerInstance;
}