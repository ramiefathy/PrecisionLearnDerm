import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import * as https from 'https';
import { URL } from 'url';

const db = admin.firestore();

// Gemini AI configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-pro'; // Using Gemini 2.5 Pro - Google's most intelligent AI model

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

async function callGeminiAPI(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.3, // Lower temperature for more consistent medical content
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
      } as any
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const responseData = JSON.parse(data);
            if (!responseData.candidates || !responseData.candidates[0] || !responseData.candidates[0].content) {
              reject(new Error('Invalid Gemini API response structure'));
              return;
            }
            resolve(responseData.candidates[0].content.parts[0].text);
          } catch (e) {
            reject(new Error(`Failed to parse Gemini API response: ${e}`));
          }
        } else {
          reject(new Error(`Gemini API error: ${res.statusCode} ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.write(JSON.stringify(requestBody));
    req.end();
  });
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

PROVIDE YOUR RESPONSE IN THIS EXACT JSON FORMAT:
{
  "medical_accuracy_issues": [
    "Issue description with specific correction needed"
  ],
  "clarity_improvements": [
    "Specific language or clarity improvements needed"
  ],
  "clinical_realism_feedback": [
    "Comments on patient presentation realism"
  ],
  "educational_enhancements": [
    "Suggestions to improve learning value"
  ],
  "corrected_stem": "Improved clinical vignette (only if changes needed)",
  "corrected_lead_in": "Improved question prompt (only if changes needed)",
  "corrected_options": [
    {"text": "Option A text"},
    {"text": "Option B text"},
    {"text": "Option C text"},
    {"text": "Option D text"}
  ],
  "corrected_explanation": "Enhanced explanation with complete rationale",
  "quality_scores": {
    "medical_accuracy": 85,
    "clarity": 90,
    "realism": 88,
    "educational_value": 92
  },
  "overall_assessment": "Brief summary of question quality and main improvements made",
  "recommendations": [
    "Specific actionable recommendations for future questions"
  ]
}

IMPORTANT GUIDELINES:
- Only suggest changes that genuinely improve the question
- Maintain the original clinical scenario essence unless medically inaccurate
- Ensure all corrections follow current dermatological practice standards
- Verify that the correct answer remains unambiguously correct
- Ensure distractors are plausible but clearly incorrect to an expert
- Score each dimension 0-100 based on quality level`;
}

async function processReviewCore(draftItem: any, draftId: string): Promise<ReviewResult> {
  const reviewPrompt = generateReviewPrompt(draftItem);
  
  try {
    const geminiResponse = await callGeminiAPI(reviewPrompt);
    const reviewData = JSON.parse(geminiResponse);
    
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
    logError('review.gemini_error', {
      draftId,
      error: error.message
    });
    
    // Fallback review for error cases
    return {
      correctedItem: draftItem,
      reviewNotes: [`AI review failed: ${error.message}. Manual review recommended.`],
      changes: [],
      qualityMetrics: {
        medical_accuracy: 75,
        clarity: 75,
        realism: 75,
        educational_value: 75
      },
      recommendations: ['Manual review recommended due to AI processing error'],
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: 'ai-review-agent-fallback'
    };
  }
}

// Cloud Function wrapper for processReview
export const processReview = functions.https.onCall(async (data: any, context) => {
  try {
    const { item } = data || {};
    
    if (!item) {
      throw new Error('Missing required parameter: item');
    }
    
    const reviewResult = await processReviewInternal(item, `review_${Date.now()}`);
    
    return {
      success: true,
      ...reviewResult
    };
    
  } catch (error: any) {
    console.error('Error reviewing question:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
});

async function processReviewInternal(draftItem: any, draftId: string): Promise<ReviewResult> {
  return await processReviewCore(draftItem, draftId);
}
