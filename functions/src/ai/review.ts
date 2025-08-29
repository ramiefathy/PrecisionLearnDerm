import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { getGeminiApiKey, GEMINI_API_KEY } from '../util/config';

const db = admin.firestore();

// Using centralized robust Gemini client for consistency

interface ReviewResult {
  correctedItem: any;
  reviewNotes: string[];
  changes: Array<{
    field: string;
    original: string;
    corrected: string;
    reason: string;
  }>;
  qualityMetrics: {
    medical_accuracy: number;
    clarity: number;
    realism: number;
    educational_value: number;
  };
  recommendations: string[];
  reviewedAt: any;
  reviewedBy: string;
}

/**
 * Use robust Gemini client with consistent safety settings and retry logic
 */
async function callGeminiAPI(prompt: string): Promise<string> {
  try {
    logInfo('review.client_init', { message: 'Attempting to initialize GoogleGenAI client for review operation' });
    
    // Check if we have API key configured
    const hasApiKey = getGeminiApiKey();
    if (!hasApiKey) {
      logError('review.api_key_missing', { message: 'No Gemini API key found in configuration' });
      throw new Error('GEMINI_API_KEY is not configured. Please set the Firebase secret.');
    } else {
      logInfo('review.api_key_found', { message: 'Gemini API key appears to be set' });
    }
    
    const client = getRobustGeminiClient({
      maxRetries: 3,
      fallbackToFlash: true,
      timeout: 120000 // 2 minutes for review operations
    });
    
    logInfo('review.client_ready', { message: 'GoogleGenAI client initialized successfully, making API call' });

    const result = await client.generateText({
      prompt,
      operation: 'review_mcq_structured', // Uses structured text format to avoid truncation
      preferredModel: 'gemini-2.5-pro',
      temperature: 0.3 // Lower temperature for consistent medical content
    });

    if (result.success && result.text) {
      logInfo('review.api_success', { message: 'Gemini API call completed successfully', responseLength: result.text.length });
      return result.text;
    }

    logError('review.api_failed', { message: 'Gemini API call failed', error: result.error, success: result.success });
    throw new Error(result.error || 'Review API call failed');
    
  } catch (error) {
    logError('review.gemini_error', { 
      message: 'callGeminiAPI error',
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : 'No stack trace'
    });
    throw error; // Re-throw to preserve the original error
  }
}

function generateReviewPrompt(draftItem: any): string {
  return `You are Dr. Sarah Chen, MD, a board-certified dermatologist and medical education expert with 15 years of experience in academic medicine and question development for dermatology board examinations.

Your task is to perform a comprehensive review of this dermatology multiple-choice question for medical accuracy, educational value, and clinical realism.

QUESTION TO REVIEW:
\`\`\`json
${JSON.stringify(draftItem, null, 2)}
\`\`\`

REVIEW CRITERIA:
1. **Medical Accuracy**: Current evidence-based practice, correct pathophysiology, appropriate diagnostic/treatment approaches
2. **Clinical Realism**: Realistic patient presentations, appropriate demographics, logical clinical scenarios
3. **Content Clarity**: Clear, unambiguous language; appropriate medical terminology; grammatically correct
4. **Educational Value**: Learning objectives met, appropriate difficulty level, meaningful explanations
5. **Answer Quality**: One clearly correct answer, plausible distractors, appropriate homogeneity
6. **Explanation Quality**: Comprehensive rationale, why correct answer is right, why distractors are wrong

PROVIDE YOUR RESPONSE IN THIS EXACT STRUCTURED FORMAT:

MEDICAL_ACCURACY_ISSUES:
- Issue description with specific correction needed
- Another issue if applicable

CLARITY_IMPROVEMENTS:
- Specific language or clarity improvements needed
- Another improvement if applicable

CLINICAL_REALISM_FEEDBACK:
- Comments on patient presentation realism
- Additional feedback if applicable

EDUCATIONAL_ENHANCEMENTS:
- Suggestions to improve learning value
- Additional suggestions if applicable

CORRECTED_STEM:
[Improved clinical vignette - only provide if changes are needed, otherwise write "NO_CHANGES"]

CORRECTED_LEAD_IN:
[Improved question prompt - only provide if changes are needed, otherwise write "NO_CHANGES"]

CORRECTED_OPTIONS:
A) [Option A text - provide all options even if only some change]
B) [Option B text]
C) [Option C text]
D) [Option D text]
E) [Option E text]

CORRECTED_EXPLANATION:
[Enhanced explanation with complete rationale]

QUALITY_SCORES:
Medical Accuracy: [Score 0-100]
Clarity: [Score 0-100]
Realism: [Score 0-100]
Educational Value: [Score 0-100]

OVERALL_ASSESSMENT:
[Brief summary of question quality and main improvements made]

RECOMMENDATIONS:
- Specific actionable recommendation for future questions
- Another recommendation if applicable

IMPORTANT GUIDELINES:
- Only suggest changes that genuinely improve the question
- Maintain the original clinical scenario essence unless medically inaccurate
- Ensure all corrections follow current dermatological practice standards
- Verify that the correct answer remains unambiguously correct
- Ensure distractors are plausible but clearly incorrect to an expert
- Score each dimension 0-100 based on quality level`;
}

// Helper function to parse structured text response (order-independent and robust)
function parseStructuredReviewResponse(text: string): any {
  try {
    const cleanedText = text.trim() + '\n'; // Add newline to help regex
    const sections: { [key: string]: string } = {};
    
    // Define all possible section headers
    const sectionHeaders = [
      'MEDICAL_ACCURACY_ISSUES', 'CLARITY_IMPROVEMENTS', 
      'CLINICAL_REALISM_FEEDBACK', 'EDUCATIONAL_ENHANCEMENTS',
      'CORRECTED_STEM', 'CORRECTED_LEAD_IN', 'CORRECTED_OPTIONS',
      'CORRECTED_EXPLANATION', 'QUALITY_SCORES', 'OVERALL_ASSESSMENT',
      'RECOMMENDATIONS'
    ];

    // Order-independent regex that finds all sections regardless of order
    const sectionRegex = new RegExp(
      `^(${sectionHeaders.join('|')}):\\s*([\\s\\S]*?)(?=\\n(?:${sectionHeaders.join('|')}):|$)`, 
      'gim'
    );

    let match;
    while ((match = sectionRegex.exec(cleanedText)) !== null) {
      // Normalize header to lowercase and store the trimmed content
      const headerKey = match[1].trim().toLowerCase().replace(/_/g, '_');
      sections[headerKey] = match[2].trim();
    }

    // Helper function to extract list items from a section
    const extractListItems = (sectionText: string): string[] => {
      if (!sectionText) return [];
      return sectionText
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(item => item.length > 0);
    };

    // Helper function to check for "NO_CHANGES" more flexibly
    const hasChanges = (text: string): boolean => {
      if (!text) return false;
      const normalized = text.trim().toUpperCase().replace(/[_\s]+/g, '');
      return normalized !== 'NOCHANGES' && normalized !== 'NOCHANGE' && !normalized.includes('NOCHANGES');
    };

    // Extract all sections with safe fallbacks
    const medicalAccuracyText = sections['medical_accuracy_issues'] || '';
    const clarityText = sections['clarity_improvements'] || '';
    const realismText = sections['clinical_realism_feedback'] || '';
    const educationalText = sections['educational_enhancements'] || '';
    const correctedStem = sections['corrected_stem'] || '';
    const correctedLeadIn = sections['corrected_lead_in'] || '';
    const correctedExplanation = sections['corrected_explanation'] || '';
    const overallAssessment = sections['overall_assessment'] || '';
    const recommendationsText = sections['recommendations'] || '';
    
    // Extract options with better parsing
    const optionsText = sections['corrected_options'] || '';
    const optionLines = optionsText.split('\n').filter(line => line.trim());
    const correctedOptions: any[] = [];
    
    for (const line of optionLines) {
      const optionMatch = line.match(/([A-E])\)\s*(.+)/i);
      if (optionMatch) {
        correctedOptions.push({ text: optionMatch[2].trim() });
      }
    }
    
    // If we don't have exactly 5 options (board exam standard), clear the array to use original
    if (correctedOptions.length !== 5) {
      correctedOptions.length = 0;
    }
    
    // Parse quality scores with defaults
    const scoresText = sections['quality_scores'] || '';
    const scores: any = {
      medical_accuracy: 80,
      clarity: 80,
      realism: 80,
      educational_value: 80
    };
    
    // Parse individual scores with flexible matching
    const accuracyMatch = scoresText.match(/Medical\s+Accuracy[:\s]+(\d+)/i);
    if (accuracyMatch) scores.medical_accuracy = parseInt(accuracyMatch[1]);
    
    const clarityMatch = scoresText.match(/Clarity[:\s]+(\d+)/i);
    if (clarityMatch) scores.clarity = parseInt(clarityMatch[1]);
    
    const realismMatch = scoresText.match(/Realism[:\s]+(\d+)/i);
    if (realismMatch) scores.realism = parseInt(realismMatch[1]);
    
    const educationalMatch = scoresText.match(/Educational\s+Value[:\s]+(\d+)/i);
    if (educationalMatch) scores.educational_value = parseInt(educationalMatch[1]);
    
    return {
      medical_accuracy_issues: extractListItems(medicalAccuracyText),
      clarity_improvements: extractListItems(clarityText),
      clinical_realism_feedback: extractListItems(realismText),
      educational_enhancements: extractListItems(educationalText),
      corrected_stem: hasChanges(correctedStem) ? correctedStem : null,
      corrected_lead_in: hasChanges(correctedLeadIn) ? correctedLeadIn : null,
      corrected_options: correctedOptions.length > 0 ? correctedOptions : null,
      corrected_explanation: correctedExplanation || null,
      quality_scores: scores,
      overall_assessment: overallAssessment,
      recommendations: extractListItems(recommendationsText)
    };
    
  } catch (error) {
    logError('Failed to parse structured review response', { error });
    // Return a default structure to prevent crashes
    return {
      medical_accuracy_issues: [],
      clarity_improvements: [],
      clinical_realism_feedback: [],
      educational_enhancements: [],
      corrected_stem: null,
      corrected_lead_in: null,
      corrected_options: null,
      corrected_explanation: null,
      quality_scores: {
        medical_accuracy: 75,
        clarity: 75,
        realism: 75,
        educational_value: 75
      },
      overall_assessment: 'Review parsing failed, using original content',
      recommendations: []
    };
  }
}

async function processReviewCore(draftItem: any, draftId: string): Promise<ReviewResult> {
  const reviewPrompt = generateReviewPrompt(draftItem);
  
  try {
    const geminiResponse = await callGeminiAPI(reviewPrompt);
    const reviewData = parseStructuredReviewResponse(geminiResponse);
    
    // Build corrected item with improvements
    const correctedItem = {
      ...draftItem,
      stem: reviewData.corrected_stem || draftItem.stem,
      leadIn: reviewData.corrected_lead_in || draftItem.leadIn,
      options: reviewData.corrected_options || draftItem.options,
      explanation: reviewData.corrected_explanation || draftItem.explanation,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Track changes made
    const changes: Array<{field: string, original: string, corrected: string, reason: string}> = [];
    
    if (reviewData.corrected_stem && reviewData.corrected_stem !== draftItem.stem) {
      changes.push({
        field: 'stem',
        original: draftItem.stem,
        corrected: reviewData.corrected_stem,
        reason: 'Improved clinical realism and accuracy'
      });
    }
    
    if (reviewData.corrected_lead_in && reviewData.corrected_lead_in !== draftItem.leadIn) {
      changes.push({
        field: 'leadIn',
        original: draftItem.leadIn,
        corrected: reviewData.corrected_lead_in,
        reason: 'Enhanced clarity and precision'
      });
    }
    
    if (reviewData.corrected_explanation && reviewData.corrected_explanation !== draftItem.explanation) {
      changes.push({
        field: 'explanation',
        original: draftItem.explanation,
        corrected: reviewData.corrected_explanation,
        reason: 'Improved educational value and completeness'
      });
    }
    
    // Compile review notes
    const reviewNotes = [
      ...reviewData.medical_accuracy_issues || [],
      ...reviewData.clarity_improvements || [],
      ...reviewData.clinical_realism_feedback || [],
      ...reviewData.educational_enhancements || []
    ];
    
    return {
      correctedItem,
      reviewNotes,
      changes,
      qualityMetrics: reviewData.quality_scores || {
        medical_accuracy: 80,
        clarity: 80,
        realism: 80,
        educational_value: 80
      },
      recommendations: reviewData.recommendations || [],
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: 'ai-review-agent'
    };
    
  } catch (error: any) {
    logError('review.gemini_error', { error, draftId });
    
    // No fallback - throw error to properly fail the operation
    throw new Error(`AI review failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Cloud Function wrapper for processReview
export const processReview = functions
  .runWith({
    timeoutSeconds: 180, // 3 minutes for review
    memory: '1GB',
    secrets: [GEMINI_API_KEY]
  })
  .https.onCall(async (data: any, context) => {
  try {
    logInfo('review.function_start', { 
      message: 'Review Agent function started',
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      contextAuth: !!context?.auth,
      contextUid: context?.auth?.uid
    });
    
    requireAdmin(context);
    const { item } = data || {};
    
    if (!item || typeof item !== 'object' || !item.stem || !item.options || !item.explanation) {
      logError('review.invalid_item', { 
        message: 'Invalid item provided to processReview',
        hasItem: !!item,
        itemType: typeof item,
        hasStem: !!(item && item.stem),
        hasOptions: !!(item && item.options),
        hasExplanation: !!(item && item.explanation),
        itemKeys: item ? Object.keys(item) : []
      });
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a valid "item" object.');
    }
    
    logInfo('review.process_start', {
      message: 'Processing review with valid item',
      stemLength: item.stem?.length || 0,
      optionsCount: Array.isArray(item.options) ? item.options.length : 0,
      explanationLength: item.explanation?.length || 0
    });
    
    const reviewResult = await processReviewInternal(item, `review_${Date.now()}`);
    
    logInfo('review.function_success', {
      message: 'Review Agent function completed successfully',
      hasResult: !!reviewResult,
      reviewNotesCount: reviewResult?.reviewNotes?.length || 0,
      changesCount: reviewResult?.changes?.length || 0
    });
    
    return {
      success: true,
      ...reviewResult
    };
    
  } catch (error: any) {
    logError('review.function_error', {
      message: 'Review Agent function failed with an unhandled error',
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      isHttpsError: error instanceof functions.https.HttpsError,
      httpsErrorCode: error instanceof functions.https.HttpsError ? error.code : 'N/A'
    });
    
    // Re-throw HttpsError as-is for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Wrap other errors in HttpsError for proper client handling
    throw new functions.https.HttpsError('internal', 'Review validation failed due to an internal server error.', {
      originalError: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
});

async function processReviewInternal(draftItem: any, draftId: string): Promise<ReviewResult> {
  return await processReviewCore(draftItem, draftId);
}

// Export internal version for use in other modules  
export async function reviewMCQInternal(draftItem: any): Promise<string> {
  const draftId = `review_${Date.now()}`;
  try {
    logInfo('[REVIEW_DEBUG] Starting reviewMCQInternal', { 
      draftId, 
      hasItem: !!draftItem,
      itemKeys: draftItem ? Object.keys(draftItem) : []
    });
    
    const reviewResult = await processReviewCore(draftItem, draftId);
    
    logInfo('[REVIEW_DEBUG] processReviewCore completed successfully', {
      draftId,
      hasResult: !!reviewResult,
      reviewNotesCount: reviewResult.reviewNotes?.length || 0,
      recommendationsCount: reviewResult.recommendations?.length || 0,
      hasQualityMetrics: !!reviewResult.qualityMetrics
    });
    
    // Return structured feedback as a string for orchestrator
    // Safely handle potentially undefined arrays
    const reviewNotes = Array.isArray(reviewResult.reviewNotes) ? reviewResult.reviewNotes : [];
    const recommendations = Array.isArray(reviewResult.recommendations) ? reviewResult.recommendations : [];
    const qualityMetrics = reviewResult.qualityMetrics || {};
    
    logInfo('[REVIEW_DEBUG] Feedback components check', {
      draftId,
      reviewNotesType: typeof reviewResult.reviewNotes,
      reviewNotesIsArray: Array.isArray(reviewResult.reviewNotes),
      reviewNotesLength: reviewNotes.length,
      recommendationsType: typeof reviewResult.recommendations,
      recommendationsIsArray: Array.isArray(reviewResult.recommendations),
      recommendationsLength: recommendations.length,
      hasQualityMetrics: !!qualityMetrics,
      qualityMetricsKeys: Object.keys(qualityMetrics)
    });
    
    const feedback = [
      ...reviewNotes,
      `Quality Scores: Medical Accuracy: ${qualityMetrics.medical_accuracy || 'N/A'}, Clarity: ${qualityMetrics.clarity || 'N/A'}, Realism: ${qualityMetrics.realism || 'N/A'}, Educational Value: ${qualityMetrics.educational_value || 'N/A'}`,
      ...recommendations
    ].join('\n');
    
    logInfo('[REVIEW_DEBUG] Feedback generated successfully', {
      draftId,
      feedbackLength: feedback.length,
      feedbackPreview: feedback.substring(0, 200)
    });
    
    return feedback;
  } catch (error) {
    logError('[REVIEW_DEBUG] reviewMCQInternal error', { error, draftId, errorMessage: error instanceof Error ? error.message : String(error) });
    throw new Error(`Review failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
