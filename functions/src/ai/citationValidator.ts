/**
 * Citation-Based Validation System
 * Validates medical accuracy by checking claims against provided citations
 * Uses lightweight LLM calls for factual consistency checking
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey } from '../util/config';
import { logInfo, logError } from '../util/logging';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Interfaces
interface CitationCheck {
  citation: string;
  claim: string;
  supported: 'YES' | 'NO' | 'PARTIAL' | 'UNCLEAR';
  confidence: number;
  reasoning: string;
}

interface ValidationResult {
  overallSupported: boolean;
  confidence: number;
  checks: CitationCheck[];
  needsHumanReview: boolean;
  reviewReason?: string;
}

interface MedicalClaim {
  text: string;
  type: 'diagnosis' | 'treatment' | 'pathophysiology' | 'epidemiology';
  importance: 'critical' | 'important' | 'supportive';
}

/**
 * Main validation function - checks if explanation is supported by citations
 */
export async function validateCitations(
  explanation: string,
  citations: string[],
  topic: string
): Promise<ValidationResult> {
  try {
    if (!citations || citations.length === 0) {
      return {
        overallSupported: false,
        confidence: 0,
        checks: [],
        needsHumanReview: true,
        reviewReason: 'No citations provided for medical claims'
      };
    }

    // Extract medical claims from explanation
    const claims = await extractMedicalClaims(explanation, topic);
    
    // Check each claim against citations
    const checks: CitationCheck[] = [];
    
    for (const claim of claims) {
      // Find most relevant citation for this claim
      const relevantCitation = await findRelevantCitation(claim.text, citations);
      
      if (relevantCitation) {
        const check = await checkClaimAgainstCitation(claim.text, relevantCitation);
        checks.push(check);
      } else {
        checks.push({
          citation: 'No relevant citation found',
          claim: claim.text,
          supported: 'UNCLEAR',
          confidence: 0,
          reasoning: 'No citation addresses this specific claim'
        });
      }
    }

    // Calculate overall support and confidence
    const result = calculateOverallSupport(checks, claims);
    
    logInfo('citation_validation_complete', {
      topic,
      totalClaims: claims.length,
      totalCitations: citations.length,
      overallSupported: result.overallSupported,
      confidence: result.confidence,
      needsReview: result.needsHumanReview
    });

    return result;

  } catch (error: any) {
    logError('citation_validation_failed', {
      topic,
      error: error.message
    });

    return {
      overallSupported: false,
      confidence: 0,
      checks: [],
      needsHumanReview: true,
      reviewReason: `Validation failed: ${error.message}`
    };
  }
}

/**
 * Extract medical claims from explanation text
 */
async function extractMedicalClaims(explanation: string, topic: string): Promise<MedicalClaim[]> {
  const apiKey = getGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Use fast model for claim extraction
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.2, // Low temperature for consistent extraction
      maxOutputTokens: 1024
    }
  });

  const prompt = `Extract specific medical claims from this dermatology explanation that require citation support.

TOPIC: ${topic}

EXPLANATION:
${explanation}

Extract claims that are:
1. FACTUAL STATEMENTS about medical conditions, treatments, or pathophysiology
2. STATISTICAL DATA (prevalence, success rates, etc.)
3. TREATMENT RECOMMENDATIONS or clinical guidelines
4. DIAGNOSTIC CRITERIA or clinical features

For each claim, classify as:
- Type: diagnosis, treatment, pathophysiology, epidemiology
- Importance: critical (affects patient safety), important (affects outcomes), supportive (background info)

FORMAT (one claim per line):
CLAIM: [exact text from explanation]
TYPE: [diagnosis/treatment/pathophysiology/epidemiology] 
IMPORTANCE: [critical/important/supportive]

Extract claims now:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    return parseClaimsFromText(text);
  } catch (error: any) {
    logError('claim_extraction_failed', { topic, error: error.message });
    
    // Fallback: Simple regex-based claim extraction
    return extractClaimsSimple(explanation);
  }
}

/**
 * Parse claims from LLM response
 */
function parseClaimsFromText(text: string): MedicalClaim[] {
  const claims: MedicalClaim[] = [];
  const lines = text.split('\n');
  
  let currentClaim: Partial<MedicalClaim> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('CLAIM:')) {
      if (currentClaim.text) {
        // Save previous claim
        claims.push(currentClaim as MedicalClaim);
      }
      currentClaim = {
        text: trimmed.replace('CLAIM:', '').trim(),
        type: 'diagnosis',
        importance: 'important'
      };
    } else if (trimmed.startsWith('TYPE:')) {
      const type = trimmed.replace('TYPE:', '').trim().toLowerCase();
      if (['diagnosis', 'treatment', 'pathophysiology', 'epidemiology'].includes(type)) {
        currentClaim.type = type as any;
      }
    } else if (trimmed.startsWith('IMPORTANCE:')) {
      const importance = trimmed.replace('IMPORTANCE:', '').trim().toLowerCase();
      if (['critical', 'important', 'supportive'].includes(importance)) {
        currentClaim.importance = importance as any;
      }
    }
  }
  
  // Add final claim
  if (currentClaim.text) {
    claims.push(currentClaim as MedicalClaim);
  }
  
  return claims.filter(claim => claim.text && claim.text.length > 10);
}

/**
 * Simple fallback claim extraction using patterns
 */
function extractClaimsSimple(explanation: string): MedicalClaim[] {
  const claims: MedicalClaim[] = [];
  
  // Split into sentences
  const sentences = explanation.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    
    // Look for factual statements
    if (containsMedicalFactPattern(trimmed)) {
      claims.push({
        text: trimmed,
        type: determineMedicalType(trimmed),
        importance: determineImportance(trimmed)
      });
    }
  }
  
  return claims;
}

/**
 * Check if sentence contains medical fact patterns
 */
function containsMedicalFactPattern(text: string): boolean {
  const patterns = [
    /is caused by/i,
    /results from/i,
    /characterized by/i,
    /presents with/i,
    /treated with/i,
    /first-line treatment/i,
    /diagnostic criteria/i,
    /prevalence of/i,
    /occurs in \d+%/i,
    /associated with/i,
    /pathognomonic for/i
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

/**
 * Determine medical claim type
 */
function determineMedicalType(text: string): MedicalClaim['type'] {
  if (/treat|therapy|medication|drug/i.test(text)) return 'treatment';
  if (/cause|pathogenesis|mechanism/i.test(text)) return 'pathophysiology';
  if (/prevalence|incidence|rate|percent/i.test(text)) return 'epidemiology';
  return 'diagnosis';
}

/**
 * Determine claim importance
 */
function determineImportance(text: string): MedicalClaim['importance'] {
  if (/contraindicated|dangerous|avoid|caution|toxicity/i.test(text)) return 'critical';
  if (/first-line|standard|recommended|treatment|diagnosis/i.test(text)) return 'important';
  return 'supportive';
}

/**
 * Find most relevant citation for a claim
 */
async function findRelevantCitation(claim: string, citations: string[]): Promise<string | null> {
  if (citations.length === 1) return citations[0];
  
  // Simple relevance scoring based on keyword overlap
  let bestCitation = null;
  let bestScore = 0;
  
  const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  for (const citation of citations) {
    const citationWords = citation.toLowerCase().split(/\s+/);
    const overlap = claimWords.filter(word => citationWords.some(cw => cw.includes(word) || word.includes(cw)));
    const score = overlap.length / claimWords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestCitation = citation;
    }
  }
  
  return bestScore > 0.2 ? bestCitation : citations[0]; // Return best match or first citation
}

/**
 * Check if claim is supported by citation using LLM
 */
async function checkClaimAgainstCitation(claim: string, citation: string): Promise<CitationCheck> {
  const apiKey = getGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Use fast model for validation
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1, // Very low temperature for consistency
      maxOutputTokens: 512
    }
  });

  const prompt = `You are a medical fact-checker. Determine if the CLAIM is supported by the CITATION.

CITATION: ${citation}

CLAIM: ${claim}

Your task: Does the citation support, contradict, or fail to address the claim?

Respond with:
SUPPORTED: [YES/NO/PARTIAL/UNCLEAR]
CONFIDENCE: [0-100]
REASONING: [Brief explanation of your assessment]

Guidelines:
- YES: Citation clearly supports the claim
- NO: Citation contradicts the claim  
- PARTIAL: Citation supports part of the claim but not all
- UNCLEAR: Citation doesn't provide enough information
- Confidence: How certain are you (0=not at all, 100=completely certain)

Respond now:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    return parseValidationResponse(text, claim, citation);
  } catch (error: any) {
    logError('citation_check_failed', { claim: claim.substring(0, 100), error: error.message });
    
    return {
      citation,
      claim,
      supported: 'UNCLEAR',
      confidence: 0,
      reasoning: `Validation failed: ${error.message}`
    };
  }
}

/**
 * Parse validation response from LLM
 */
function parseValidationResponse(text: string, claim: string, citation: string): CitationCheck {
  const supportedMatch = text.match(/SUPPORTED:\s*(YES|NO|PARTIAL|UNCLEAR)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/);
  const reasoningMatch = text.match(/REASONING:\s*([^\n]+)/i);
  
  const supported = (supportedMatch?.[1]?.toUpperCase() as any) || 'UNCLEAR';
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
  const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';
  
  return {
    citation,
    claim,
    supported,
    confidence,
    reasoning
  };
}

/**
 * Calculate overall support from individual checks
 */
function calculateOverallSupport(checks: CitationCheck[], claims: MedicalClaim[]): ValidationResult {
  if (checks.length === 0) {
    return {
      overallSupported: false,
      confidence: 0,
      checks,
      needsHumanReview: true,
      reviewReason: 'No claims could be validated'
    };
  }
  
  // Weight by claim importance
  let totalWeight = 0;
  let supportedWeight = 0;
  let totalConfidence = 0;
  
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const claim = claims[i];
    
    const weight = claim?.importance === 'critical' ? 3 : 
                  claim?.importance === 'important' ? 2 : 1;
    
    totalWeight += weight;
    totalConfidence += check.confidence;
    
    if (check.supported === 'YES') {
      supportedWeight += weight;
    } else if (check.supported === 'PARTIAL') {
      supportedWeight += weight * 0.5;
    }
  }
  
  const supportRatio = supportedWeight / totalWeight;
  const avgConfidence = totalConfidence / checks.length;
  
  // Determine if human review is needed
  const needsHumanReview = 
    supportRatio < 0.8 ||  // Less than 80% support
    avgConfidence < 70 ||  // Low confidence
    checks.some(c => c.supported === 'NO') || // Any contradictions
    checks.some(c => claims.find((cl, idx) => idx === checks.indexOf(c))?.importance === 'critical' && c.supported !== 'YES');
  
  let reviewReason: string | undefined;
  if (needsHumanReview) {
    if (supportRatio < 0.8) reviewReason = 'Insufficient citation support';
    else if (avgConfidence < 70) reviewReason = 'Low validation confidence';
    else if (checks.some(c => c.supported === 'NO')) reviewReason = 'Citations contradict claims';
    else reviewReason = 'Critical claims not fully supported';
  }
  
  return {
    overallSupported: supportRatio >= 0.8 && avgConfidence >= 70,
    confidence: Math.round(avgConfidence),
    checks,
    needsHumanReview,
    reviewReason
  };
}

/**
 * Queue question for human review
 */
export async function queueForHumanReview(
  questionId: string,
  validationResult: ValidationResult,
  mcq: any,
  topic: string
): Promise<void> {
  try {
    await db.collection('human_review_queue').add({
      questionId,
      topic,
      mcq,
      validationResult,
      queuedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      priority: validationResult.reviewReason?.includes('Critical') ? 'high' : 'normal',
      reviewType: 'citation_validation'
    });
    
    logInfo('question_queued_for_review', {
      questionId,
      topic,
      reason: validationResult.reviewReason,
      priority: validationResult.reviewReason?.includes('Critical') ? 'high' : 'normal'
    });
  } catch (error: any) {
    logError('review_queue_failed', { questionId, topic, error: error.message });
  }
}

/**
 * Get validation statistics for monitoring
 */
export async function getValidationStats(timeWindow: 'hour' | 'day' | 'week' = 'day'): Promise<any> {
  const now = Date.now();
  const windowMs = timeWindow === 'hour' ? 3600000 : 
                  timeWindow === 'day' ? 86400000 : 
                  604800000; // week
  
  const since = new Date(now - windowMs);
  
  try {
    const reviewQueue = await db.collection('human_review_queue')
      .where('queuedAt', '>=', since)
      .get();
    
    const validationLogs = await db.collection('validation_logs')
      .where('timestamp', '>=', since)
      .get();
    
    const stats = {
      totalValidations: validationLogs.size,
      needingReview: reviewQueue.size,
      autoApproved: validationLogs.docs.filter(doc => 
        doc.data().result?.overallSupported === true && !doc.data().result?.needsHumanReview
      ).length,
      averageConfidence: validationLogs.docs.length > 0 ? 
        validationLogs.docs.reduce((sum, doc) => 
          sum + (doc.data().result?.confidence || 0), 0
        ) / validationLogs.docs.length : 0,
      timeWindow,
      generatedAt: new Date().toISOString()
    };
    
    return stats;
  } catch (error: any) {
    logError('validation_stats_failed', { error: error.message });
    return null;
  }
}