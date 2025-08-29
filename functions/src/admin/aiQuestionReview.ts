/**
 * AI-Powered Question Review Module
 * Provides comprehensive AI review, clinical validation, and regeneration capabilities
 * for the admin question review interface
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { searchNCBI, searchOpenAlex } from '../util/externalSearch';
import { parseGeminiResponse } from '../util/geminiResponseParser';

const db = admin.firestore();

// ABD Guidelines for question review (extracted from boardStyleGeneration.ts)
const ABD_GUIDELINES = `
ABD BOARD EXAM QUESTION WRITING STANDARDS:

1. QUESTION PURPOSE & COGNITIVE LEVEL
   - Test clinical reasoning and application, NOT simple recall
   - Require synthesis of information and clinical decision-making
   - Focus on common conditions and important clinical scenarios

2. QUESTION STRUCTURE (Type A Format)
   - Clinical vignette stem with complete patient scenario
   - Clear, direct lead-in question
   - 5 homogeneous options (1 correct + 4 plausible distractors)

3. CLINICAL VIGNETTE REQUIREMENTS
   - Patient demographics (age, gender, race when relevant)
   - Chief complaint with duration
   - Relevant history (medical, family, social, medications)
   - Complete physical examination findings
   - Laboratory/diagnostic results when appropriate
   - Pertinent negatives to rule out differentials

4. BOTTOM-UP APPROACH
   - Present clinical findings first
   - Require deduction of diagnosis or management
   - Mirror real clinical encounters

5. COVER-THE-OPTIONS RULE
   - Question must be answerable without seeing options
   - Stem contains all necessary information

6. OPTION QUALITY STANDARDS
   - All options from same category (all diagnoses or all treatments)
   - Similar length and grammatical structure
   - No absolute terms (always, never, all, none)
   - Plausible distractors that could be considered
   - No grammatical or length cues

7. DIFFICULTY TARGETING
   - Aim for 70-80% correct response rate
   - Not too easy (>90%) or too hard (<60%)

8. MEDICAL ACCURACY
   - Evidence-based, current medical knowledge
   - Clinically relevant and important

9. EDUCATIONAL VALUE
   - Each question teaches a concept or pattern
   - Explanation reinforces learning points
`;

// Interface definitions
interface AIReviewRequest {
  questionId: string;
  questionData: {
    stem: string;
    leadIn: string;
    options: Array<{ text: string }>;
    keyIndex: number;
    explanation: string;
    citations?: Array<{ source: string }>;
    difficulty?: number;
    qualityScore?: number;
  };
}

interface ClinicalValidationRequest {
  questionData: {
    stem: string;
    explanation: string;
  };
}

interface RegenerationRequest {
  questionId: string;
  questionData: any;
  adminFeedback: string;
  previousReview?: any;
}

interface AIReviewResult {
  success: boolean;
  aiAssessment?: {
    medicalAccuracy: {
      score: number;
      issues: string[];
      strengths: string[];
    };
    abdCompliance: {
      score: number;
      issues: string[];
      strengths: string[];
    };
    clinicalRealism: {
      score: number;
      feedback: string[];
    };
    educationalValue: {
      score: number;
      suggestions: string[];
    };
    overallQuality: {
      score: number;
      summary: string;
    };
  };
  clinicalValidation?: {
    accuracy: string;
    evidenceFound: boolean;
    sources: string[];
    concerns: string[];
  };
  recommendations?: string[];
  timestamp?: number;
  error?: string;
}

/**
 * Call Gemini API with robust error handling using structured text format
 */
async function callGeminiAPI(prompt: string, operation: string): Promise<string> {
  const client = getRobustGeminiClient({
    maxRetries: 3,
    fallbackToFlash: true,
    timeout: 120000 // 2 minutes as per user guidance
  });

  const result = await client.generateText({
    prompt,
    operation: `ai_review_${operation}_structured`, // Use structured format to avoid truncation
    preferredModel: 'gemini-2.5-pro',
    temperature: 0.3 // Lower temperature for consistent medical content
  });

  if (result.success && result.text) {
    return result.text;
  }

  throw new Error(result.error || `Failed to call Gemini API for ${operation}`);
}

/**
 * Extract medical entities and concepts from question text for search
 */
function extractMedicalEntities(questionText: string): string[] {
  // Extract key medical terms, conditions, and procedures
  const medicalTermRegex = /\b(?:[A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+(?:syndrome|disease|disorder|carcinoma|melanoma|dermatitis|psoriasis|rash|lesion|condition)))\b/g;
  const entities: string[] = questionText.match(medicalTermRegex) || [];
  
  // Also extract age groups, demographics, and key clinical features
  const ageMatch = questionText.match(/(\d+)-year-old/);
  if (ageMatch) entities.push(`${ageMatch[1]} year old`);
  
  // Extract procedure names and diagnostic terms
  const procedureRegex = /\b(?:biopsy|excision|cryotherapy|laser|phototherapy|immunotherapy|chemotherapy)\b/gi;
  const procedures = questionText.match(procedureRegex) || [];
  entities.push(...procedures);
  
  // Deduplicate and return most relevant terms
  return [...new Set(entities)].slice(0, 5);
}

/**
 * Build comprehensive review prompt with ABD guidelines
 */
function buildReviewPrompt(questionData: any): string {
  return `You are Dr. Sarah Chen, MD, a board-certified dermatologist and medical education expert with 15 years of experience in academic medicine and question development for dermatology board examinations.

Your task is to perform a comprehensive review of this dermatology multiple-choice question for medical accuracy, educational value, and compliance with American Board of Dermatology (ABD) guidelines.

QUESTION TO REVIEW:
Stem: ${questionData.stem}
Lead-in: ${questionData.leadIn}
Options:
${questionData.options.map((opt: any, idx: number) => `${String.fromCharCode(65 + idx)}) ${opt.text}`).join('\n')}
Correct Answer: ${String.fromCharCode(65 + (questionData.keyIndex || 0))}
Explanation: ${questionData.explanation}

ABD GUIDELINES FOR REFERENCE:
${ABD_GUIDELINES}

PROVIDE YOUR RESPONSE IN THIS EXACT STRUCTURED FORMAT:

MEDICAL_ACCURACY_ASSESSMENT:
Score: [0-100]
Issues: [List specific medical accuracy issues, or "None identified" if no issues]
Strengths: [List medical accuracy strengths]

ABD_COMPLIANCE_ASSESSMENT:
Score: [0-100]
Issues: [List specific ABD guideline violations, or "None identified" if compliant]
Strengths: [List ABD compliance strengths]

CLINICAL_REALISM_ASSESSMENT:
Score: [0-100]
Feedback: [Comments on patient presentation realism and clinical scenario authenticity]

EDUCATIONAL_VALUE_ASSESSMENT:
Score: [0-100]
Suggestions: [Suggestions to improve educational value and learning objectives]

OVERALL_QUALITY_ASSESSMENT:
Score: [0-100]
Summary: [Brief overall quality assessment and main findings]

RECOMMENDATIONS:
- [Specific actionable recommendation 1]
- [Specific actionable recommendation 2]
- [Additional recommendations as needed]

IMPORTANT GUIDELINES:
- Provide specific, actionable feedback
- Score each dimension based on ABD standards
- Focus on evidence-based medical content
- Ensure clinical scenarios are realistic and educational
- Verify that the correct answer is unambiguously correct
- Check that distractors are plausible but clearly incorrect
- Consider current dermatological practice standards`;
}

/**
 * Build clinical validation prompt using web search results
 */
function buildValidationPrompt(questionData: any, ncbiResults: string, openAlexResults: string): string {
  return `You are a clinical validation specialist reviewing dermatology content for medical accuracy.

QUESTION CONTENT TO VALIDATE:
Stem: ${questionData.stem}
Explanation: ${questionData.explanation}

RESEARCH EVIDENCE FROM MEDICAL DATABASES:
NCBI/PubMed Results:
${ncbiResults}

OpenAlex Results:
${openAlexResults}

VALIDATION TASK:
Review the question content against the medical literature evidence. Provide validation in this structured format:

CLINICAL_ACCURACY:
[Assessment of whether the clinical information is accurate based on evidence]

EVIDENCE_SUPPORT:
Found: [true/false - whether supporting evidence was found in the search results]
Sources: [List relevant sources that support or contradict the content]

MEDICAL_CONCERNS:
[List any medical inaccuracies, outdated information, or questionable claims]

VALIDATION_SUMMARY:
[Overall assessment of clinical accuracy and evidence support]

Focus on:
- Accuracy of clinical presentations
- Correctness of diagnostic criteria
- Appropriateness of treatment recommendations
- Currency of medical information
- Evidence-based support for claims made`;
}

/**
 * Parse structured AI review response
 */
function parseStructuredReviewResponse(text: string): any {
  try {
    const sections: { [key: string]: string } = {};
    
    // Extract each section using regex
    const sectionHeaders = [
      'MEDICAL_ACCURACY_ASSESSMENT', 'ABD_COMPLIANCE_ASSESSMENT',
      'CLINICAL_REALISM_ASSESSMENT', 'EDUCATIONAL_VALUE_ASSESSMENT',
      'OVERALL_QUALITY_ASSESSMENT', 'RECOMMENDATIONS'
    ];

    sectionHeaders.forEach(header => {
      const regex = new RegExp(`${header}:\\s*([\\s\\S]*?)(?=\\n(?:${sectionHeaders.join('|')}):|$)`, 'i');
      const match = text.match(regex);
      if (match) {
        sections[header] = match[1].trim();
      }
    });

    // Parse individual assessments
    const parseAssessment = (section: string) => {
      const scoreMatch = section.match(/Score:\s*(\d+)/);
      const issuesMatch = section.match(/Issues:\s*([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);
      const strengthsMatch = section.match(/Strengths:\s*([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);
      const feedbackMatch = section.match(/Feedback:\s*([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);
      const suggestionsMatch = section.match(/Suggestions:\s*([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);
      const summaryMatch = section.match(/Summary:\s*([\s\S]*?)(?=\n[A-Z]|\n\n|$)/);

      return {
        score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
        issues: issuesMatch ? issuesMatch[1].trim().split(/\n-\s*/).filter(Boolean) : [],
        strengths: strengthsMatch ? strengthsMatch[1].trim().split(/\n-\s*/).filter(Boolean) : [],
        feedback: feedbackMatch ? feedbackMatch[1].trim().split(/\n-\s*/).filter(Boolean) : [],
        suggestions: suggestionsMatch ? suggestionsMatch[1].trim().split(/\n-\s*/).filter(Boolean) : [],
        summary: summaryMatch ? summaryMatch[1].trim() : ''
      };
    };

    return {
      medicalAccuracy: parseAssessment(sections.MEDICAL_ACCURACY_ASSESSMENT || ''),
      abdCompliance: parseAssessment(sections.ABD_COMPLIANCE_ASSESSMENT || ''),
      clinicalRealism: parseAssessment(sections.CLINICAL_REALISM_ASSESSMENT || ''),
      educationalValue: parseAssessment(sections.EDUCATIONAL_VALUE_ASSESSMENT || ''),
      overallQuality: parseAssessment(sections.OVERALL_QUALITY_ASSESSMENT || ''),
      recommendations: sections.RECOMMENDATIONS ? 
        sections.RECOMMENDATIONS.split(/\n-\s*/).filter(Boolean).map(r => r.trim()) : []
    };
  } catch (error) {
    logError('parse_structured_review_error', { error: error instanceof Error ? error.message : String(error) });
    throw new Error('Failed to parse AI review response');
  }
}

/**
 * Parse clinical validation response
 */
function parseValidationResponse(text: string): any {
  try {
    const sections: { [key: string]: string } = {};
    
    const sectionHeaders = ['CLINICAL_ACCURACY', 'EVIDENCE_SUPPORT', 'MEDICAL_CONCERNS', 'VALIDATION_SUMMARY'];
    
    sectionHeaders.forEach(header => {
      const regex = new RegExp(`${header}:\\s*([\\s\\S]*?)(?=\\n(?:${sectionHeaders.join('|')}):|$)`, 'i');
      const match = text.match(regex);
      if (match) {
        sections[header] = match[1].trim();
      }
    });

    const evidenceSupport = sections.EVIDENCE_SUPPORT || '';
    const foundMatch = evidenceSupport.match(/Found:\s*(true|false)/i);
    const sourcesMatch = evidenceSupport.match(/Sources:\s*([\s\S]*?)(?=\n[A-Z]|$)/);

    return {
      accuracy: sections.CLINICAL_ACCURACY || '',
      evidenceFound: foundMatch ? foundMatch[1].toLowerCase() === 'true' : false,
      sources: sourcesMatch ? sourcesMatch[1].trim().split(/\n-\s*/).filter(Boolean) : [],
      concerns: sections.MEDICAL_CONCERNS ? sections.MEDICAL_CONCERNS.split(/\n-\s*/).filter(Boolean) : [],
      summary: sections.VALIDATION_SUMMARY || ''
    };
  } catch (error) {
    logError('parse_validation_error', { error: error instanceof Error ? error.message : String(error) });
    return {
      accuracy: 'Failed to parse validation results',
      evidenceFound: false,
      sources: [],
      concerns: ['Validation parsing failed'],
      summary: 'Could not complete clinical validation'
    };
  }
}

/**
 * Validate clinical content via web search
 */
async function validateClinicalContent(questionData: any): Promise<any> {
  try {
    logInfo('clinical_validation_started', { 
      stemLength: questionData.stem?.length || 0,
      explanationLength: questionData.explanation?.length || 0 
    });

    // Extract medical entities for targeted search
    const entities = extractMedicalEntities(questionData.stem + ' ' + questionData.explanation);
    const searchQuery = entities.join(' ');

    if (!searchQuery.trim()) {
      logInfo('clinical_validation_skipped', { reason: 'No medical entities found' });
      return {
        accuracy: 'Unable to extract medical entities for validation',
        evidenceFound: false,
        sources: [],
        concerns: ['No searchable medical terms identified'],
        summary: 'Clinical validation skipped due to insufficient medical content'
      };
    }

    logInfo('clinical_validation_search_started', { 
      searchQuery,
      entitiesFound: entities.length 
    });

    // Parallel searches for faster validation
    const [ncbiResults, openAlexResults] = await Promise.all([
      searchNCBI(searchQuery).catch(error => {
        logError('ncbi_search_failed', { error: error.message });
        return 'NCBI search failed: ' + error.message;
      }),
      searchOpenAlex(searchQuery).catch(error => {
        logError('openalex_search_failed', { error: error.message });
        return 'OpenAlex search failed: ' + error.message;
      })
    ]);

    logInfo('clinical_validation_search_completed', {
      ncbiResultsLength: ncbiResults.length,
      openAlexResultsLength: openAlexResults.length
    });

    // Use Gemini to validate clinical accuracy based on search results
    const validationPrompt = buildValidationPrompt(questionData, ncbiResults, openAlexResults);
    const validationResponse = await callGeminiAPI(validationPrompt, 'clinical_validation');

    const parsedValidation = parseValidationResponse(validationResponse);
    
    logInfo('clinical_validation_completed', {
      evidenceFound: parsedValidation.evidenceFound,
      sourcesCount: parsedValidation.sources.length,
      concernsCount: parsedValidation.concerns.length
    });

    return parsedValidation;
  } catch (error) {
    logError('clinical_validation_failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return {
      accuracy: 'Clinical validation failed due to system error',
      evidenceFound: false,
      sources: [],
      concerns: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      summary: 'Clinical validation could not be completed'
    };
  }
}

/**
 * Main AI review function with comprehensive assessment
 */
export const aiReviewQuestion = functions.https.onCall(async (data: AIReviewRequest, context) => {
  try {
    requireAdmin(context);
    
    const { questionId, questionData } = data;
    
    logInfo('ai_review_started', {
      questionId,
      stemLength: questionData.stem?.length || 0,
      optionsCount: questionData.options?.length || 0
    });

    // Validate input
    if (!questionData.stem || !questionData.options || questionData.options.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 
        'Question data must include stem and options');
    }

    // Parallel execution for speed
    const [aiReviewResponse, clinicalValidationResult] = await Promise.all([
      // Main AI review
      callGeminiAPI(buildReviewPrompt(questionData), 'comprehensive').catch(error => {
        logError('ai_review_failed', { error: error.message });
        throw error;
      }),
      // Clinical validation via web search
      validateClinicalContent(questionData).catch(error => {
        logError('clinical_validation_error', { error: error.message });
        // Don't fail the entire review if validation fails
        return {
          accuracy: 'Clinical validation unavailable',
          evidenceFound: false,
          sources: [],
          concerns: ['Validation service temporarily unavailable'],
          summary: 'Could not complete clinical validation'
        };
      })
    ]);

    // Parse AI review results
    const aiAssessment = parseStructuredReviewResponse(aiReviewResponse);

    const result: AIReviewResult = {
      success: true,
      aiAssessment,
      clinicalValidation: clinicalValidationResult,
      recommendations: aiAssessment.recommendations || [],
      timestamp: Date.now()
    };

    logInfo('ai_review_completed', {
      questionId,
      overallScore: aiAssessment.overallQuality?.score || 0,
      medicalAccuracyScore: aiAssessment.medicalAccuracy?.score || 0,
      abdComplianceScore: aiAssessment.abdCompliance?.score || 0,
      evidenceFound: clinicalValidationResult.evidenceFound,
      recommendationsCount: result.recommendations?.length || 0
    });

    return result;

  } catch (error: any) {
    logError('ai_review_error', { 
      questionId: data?.questionId,
      error: error instanceof Error ? error.message : String(error) 
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 
      `AI review failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Clinical content validation function (can be called independently)
 */
export const validateClinical = functions.https.onCall(async (data: ClinicalValidationRequest, context) => {
  try {
    requireAdmin(context);
    
    const { questionData } = data;
    
    logInfo('standalone_validation_started', {
      stemLength: questionData.stem?.length || 0,
      explanationLength: questionData.explanation?.length || 0
    });

    const validationResult = await validateClinicalContent(questionData);
    
    logInfo('standalone_validation_completed', {
      evidenceFound: validationResult.evidenceFound,
      concernsCount: validationResult.concerns?.length || 0
    });

    return {
      success: true,
      validation: validationResult,
      timestamp: Date.now()
    };

  } catch (error: any) {
    logError('standalone_validation_error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 
      `Clinical validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Regenerate question based on admin feedback
 */
export const regenerateQuestionWithFeedback = functions.https.onCall(async (data: RegenerationRequest, context) => {
  try {
    requireAdmin(context);
    
    const { questionId, questionData, adminFeedback, previousReview } = data;
    
    logInfo('question_regeneration_started', {
      questionId,
      feedbackLength: adminFeedback?.length || 0,
      hasPreviousReview: !!previousReview
    });

    // Validate input
    if (!adminFeedback || adminFeedback.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 
        'Admin feedback is required for question regeneration');
    }

    const regenerationPrompt = `You are Dr. Sarah Chen, MD, a board-certified dermatologist and expert in medical education, tasked with regenerating a dermatology board exam question based on specific admin feedback.

ORIGINAL QUESTION:
Stem: ${questionData.stem}
Lead-in: ${questionData.leadIn}
Options:
${questionData.options?.map((opt: any, idx: number) => `${String.fromCharCode(65 + idx)}) ${opt.text}`).join('\n') || 'No options provided'}
Correct Answer: ${String.fromCharCode(65 + (questionData.keyIndex || 0))}
Explanation: ${questionData.explanation}

ADMIN FEEDBACK:
${adminFeedback}

${previousReview ? `PREVIOUS AI REVIEW FINDINGS:
Overall Quality Score: ${previousReview.aiAssessment?.overallQuality?.score || 'N/A'}
Key Issues Identified: ${previousReview.aiAssessment?.overallQuality?.summary || 'N/A'}
Medical Accuracy Issues: ${previousReview.aiAssessment?.medicalAccuracy?.issues?.join('; ') || 'None'}
ABD Compliance Issues: ${previousReview.aiAssessment?.abdCompliance?.issues?.join('; ') || 'None'}
` : ''}

ABD GUIDELINES FOR COMPLIANCE:
${ABD_GUIDELINES}

REGENERATION TASK:
Create an improved version of this question that incorporates the admin's feedback while maintaining strict compliance with ABD guidelines and medical accuracy.

PROVIDE YOUR RESPONSE IN THIS EXACT STRUCTURED FORMAT:

IMPROVED_STEM:
[Complete clinical vignette incorporating feedback]

IMPROVED_LEAD_IN:
[Clear, direct question prompt]

IMPROVED_OPTIONS:
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
E) [Option E]

CORRECT_ANSWER:
[Letter of correct answer: A, B, C, D, or E]

IMPROVED_EXPLANATION:
[Enhanced explanation with complete rationale]

CHANGES_MADE:
- [Specific change 1 in response to feedback]
- [Specific change 2 in response to feedback]
- [Additional changes as needed]

QUALITY_IMPROVEMENTS:
- [How this addresses medical accuracy concerns]
- [How this improves ABD compliance]
- [How this enhances educational value]

IMPORTANT:
- Address ALL points in the admin feedback
- Ensure medical accuracy and evidence-based content
- Maintain ABD guideline compliance
- Preserve the educational intent while improving quality
- Ensure the correct answer remains unambiguously correct`;

    const regeneratedResponse = await callGeminiAPI(regenerationPrompt, 'regeneration');
    
    // Parse the regenerated question
    const parsedResponse = parseGeminiResponse(regeneratedResponse, 'structured_mcq');
    
    if (!parsedResponse.success) {
      throw new Error('Failed to parse regenerated question response');
    }

    const regeneratedQuestion = JSON.parse(parsedResponse.text || '{}');

    logInfo('question_regeneration_completed', {
      questionId,
      stemLength: regeneratedQuestion.stem?.length || 0,
      optionsCount: regeneratedQuestion.options?.length || 0,
      changesMade: regeneratedQuestion.changesMade?.length || 0
    });

    return {
      success: true,
      regeneratedQuestion,
      adminFeedback,
      timestamp: Date.now(),
      originalQuestionId: questionId
    };

  } catch (error: any) {
    logError('question_regeneration_error', { 
      questionId: data?.questionId,
      error: error instanceof Error ? error.message : String(error) 
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 
      `Question regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});