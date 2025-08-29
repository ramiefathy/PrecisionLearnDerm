/**
 * Enhanced Scoring Agent with ABD-Specific Medical Expertise
 * Provides comprehensive board-question evaluation using dermatology-specific rubrics
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { parseGeminiResponse } from '../util/geminiResponseParser';
import { getGeminiApiKey, GEMINI_API_KEY } from '../util/config';

const db = admin.firestore();

// ABD-specific scoring rubric aligned with board standards
interface ABDScoringRubric {
  // Clinical Excellence (0-25 points)
  clinicalAccuracy: number;         // 0-5: Medical correctness and evidence-based content
  clinicalRelevance: number;        // 0-5: Board relevance and high-yield topics
  clinicalComplexity: number;       // 0-5: Appropriate cognitive level for boards
  differentialReasoning: number;    // 0-5: Quality of differential diagnosis thinking
  patientPresentation: number;      // 0-5: Realistic clinical scenario

  // Question Construction (0-25 points)
  stemClarity: number;              // 0-5: Clear, focused clinical vignette
  optionHomogeneity: number;        // 0-5: Parallel structure and plausibility
  singleBestAnswer: number;         // 0-5: Clear best answer without ambiguity
  distractorQuality: number;        // 0-5: Plausible wrong answers from real misconceptions
  technicalFlaws: number;           // 0-5: Absence of cues, grammar errors, length patterns

  // Educational Value (0-25 points)
  explanationDepth: number;         // 0-5: Comprehensive rationale for each option
  learningObjectives: number;       // 0-5: Clear educational goals
  conceptIntegration: number;       // 0-5: Links multiple concepts appropriately
  clinicalPearls: number;           // 0-5: High-yield teaching points
  evidenceBase: number;             // 0-5: Citations and guideline references

  // Psychometric Properties (0-25 points)
  difficultyCalibration: number;   // 0-5: Appropriate difficulty for target audience
  discriminationPotential: number;  // 0-5: Ability to differentiate knowledge levels
  guessResistance: number;         // 0-5: Difficulty of guessing correct answer
  coverOptionsTest: number;        // 0-5: Can answer from stem alone (should fail)
  itemWritingRules: number;        // 0-5: Adherence to NBME item-writing guidelines
}

interface EnhancedScoringResult {
  totalScore: number;              // 0-100 total
  rubric: ABDScoringRubric;
  detailedFeedback: {
    strengths: string[];
    weaknesses: string[];
    criticalIssues: string[];
    improvementSuggestions: string[];
  };
  qualityTier: 'Exceptional' | 'Strong' | 'Acceptable' | 'Needs Improvement' | 'Unacceptable';
  boardReadiness: boolean;
  recommendedActions: string[];
  scoredAt: any;
  scoredBy: string;
  confidence: number;              // 0-1 confidence in scoring
}

interface ImprovementRecommendation {
  criterion: keyof ABDScoringRubric;
  currentScore: number;
  targetScore: number;
  specificActions: string[];
  examples: string[];
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
}

/**
 * Generate ABD-aligned scoring prompt with medical expertise
 */
function generateABDScoringPrompt(questionItem: any, previousFeedback?: any): string {
  // Format the question for evaluation
  const formattedQuestion = formatQuestionForScoring(questionItem);
  
  return `You are Dr. Sarah Chen, MD, FAAD, a board-certified dermatologist with 20 years of experience as:
- Chief examiner for the American Board of Dermatology
- Psychometrician specializing in medical education assessment
- Author of dermatology board review materials
- Clinical professor of dermatology at a major academic center

Evaluate this dermatology board question using the comprehensive ABD-aligned rubric below.

QUESTION TO EVALUATE:
${formattedQuestion}

${previousFeedback ? `PREVIOUS FEEDBACK TO ADDRESS:
${JSON.stringify(previousFeedback, null, 2)}` : ''}

EVALUATION RUBRIC (Score each criterion 0-5):

## CLINICAL EXCELLENCE (25 points total)
1. Clinical Accuracy (0-5):
   - 0: Contains medical errors or outdated information
   - 1: Mostly accurate but some questionable content
   - 2: Generally accurate with minor issues
   - 3: Accurate with standard medical knowledge
   - 4: Highly accurate with current guidelines
   - 5: Exemplary accuracy with cutting-edge evidence

2. Clinical Relevance (0-5):
   - 0: Not relevant to dermatology boards
   - 1: Marginally relevant, low-yield topic
   - 2: Somewhat relevant, moderate yield
   - 3: Relevant, good board topic
   - 4: Highly relevant, high-yield topic
   - 5: Core board concept, must-know material

3. Clinical Complexity (0-5):
   - 0: Too simple, pure recall
   - 1: Basic recall with minimal reasoning
   - 2: Simple application of knowledge
   - 3: Moderate clinical reasoning required
   - 4: Complex clinical reasoning and synthesis
   - 5: Expert-level differential diagnosis and management

4. Differential Reasoning (0-5):
   - 0: No differential thinking required
   - 1: Minimal differential consideration
   - 2: Basic differential diagnosis
   - 3: Good differential reasoning
   - 4: Excellent differential with subtle distinctions
   - 5: Masterful differential with nuanced thinking

5. Patient Presentation (0-5):
   - 0: Unrealistic or incomplete presentation
   - 1: Poor presentation with missing key details
   - 2: Basic presentation, somewhat artificial
   - 3: Good presentation, reasonably realistic
   - 4: Very realistic clinical scenario
   - 5: Perfectly realistic, could be actual patient

## QUESTION CONSTRUCTION (25 points total)
6. Stem Clarity (0-5):
   - 0: Confusing, ambiguous, or misleading
   - 1: Multiple issues with clarity
   - 2: Some clarity issues
   - 3: Generally clear with minor issues
   - 4: Very clear and focused
   - 5: Perfectly clear, unambiguous, focused

7. Option Homogeneity (0-5):
   - 0: Options vary wildly in structure/length
   - 1: Poor parallel structure
   - 2: Some parallel structure issues
   - 3: Good parallel structure
   - 4: Very good homogeneity
   - 5: Perfect parallel structure and balance

8. Single Best Answer (0-5):
   - 0: Multiple correct answers or no clear best
   - 1: Ambiguous best answer
   - 2: Somewhat ambiguous
   - 3: Clear best answer with minor issues
   - 4: Very clear single best answer
   - 5: Unambiguously single best answer

9. Distractor Quality (0-5):
   - 0: Obviously wrong or nonsensical
   - 1: Poor distractors, easily eliminated
   - 2: Weak distractors
   - 3: Good distractors, somewhat plausible
   - 4: Very good distractors, quite plausible
   - 5: Excellent distractors from real misconceptions

10. Technical Flaws (0-5):
    - 0: Multiple serious flaws (grammar, cues, patterns)
    - 1: Several technical issues
    - 2: Some technical issues
    - 3: Minor technical issues
    - 4: Very minor or no issues
    - 5: Flawless technical construction

## EDUCATIONAL VALUE (25 points total)
11. Explanation Depth (0-5):
    - 0: No or incorrect explanation
    - 1: Minimal explanation
    - 2: Basic explanation
    - 3: Good explanation with rationale
    - 4: Comprehensive explanation
    - 5: Exceptional explanation with deep insights

12. Learning Objectives (0-5):
    - 0: No clear learning objective
    - 1: Vague learning objective
    - 2: Basic learning objective
    - 3: Clear learning objective
    - 4: Multiple clear objectives
    - 5: Comprehensive learning objectives

13. Concept Integration (0-5):
    - 0: Single isolated fact
    - 1: Minimal concept integration
    - 2: Some concept integration
    - 3: Good integration of concepts
    - 4: Very good multi-concept integration
    - 5: Masterful integration across domains

14. Clinical Pearls (0-5):
    - 0: No teaching points
    - 1: Basic teaching point
    - 2: Some useful pearls
    - 3: Good clinical pearls
    - 4: Excellent high-yield pearls
    - 5: Exceptional pearls with practice-changing insights

15. Evidence Base (0-5):
    - 0: No evidence or citations
    - 1: Minimal evidence
    - 2: Some evidence mentioned
    - 3: Good evidence base
    - 4: Strong evidence with guidelines
    - 5: Comprehensive evidence with current literature

## PSYCHOMETRIC PROPERTIES (25 points total)
16. Difficulty Calibration (0-5):
    - 0: Completely inappropriate difficulty
    - 1: Poor difficulty calibration
    - 2: Somewhat appropriate
    - 3: Good difficulty for boards
    - 4: Very well calibrated
    - 5: Perfectly calibrated difficulty

17. Discrimination Potential (0-5):
    - 0: Cannot discriminate knowledge levels
    - 1: Poor discrimination
    - 2: Some discrimination
    - 3: Good discrimination potential
    - 4: Very good discrimination
    - 5: Excellent discrimination power

18. Guess Resistance (0-5):
    - 0: Easy to guess correctly
    - 1: Somewhat guessable
    - 2: Moderate guess resistance
    - 3: Good guess resistance
    - 4: Very difficult to guess
    - 5: Essentially guess-proof

19. Cover-Options Test (0-5):
    - 0: Can easily answer without options (FAIL)
    - 1: Mostly answerable without options
    - 2: Somewhat answerable
    - 3: Difficult without options
    - 4: Very difficult without options
    - 5: Impossible without options (PASS)

20. Item-Writing Rules (0-5):
    - 0: Violates multiple NBME rules
    - 1: Several violations
    - 2: Some violations
    - 3: Minor violations
    - 4: Very minor issues
    - 5: Perfect adherence to guidelines

PROVIDE COMPREHENSIVE FEEDBACK INCLUDING:
1. Specific strengths with examples
2. Specific weaknesses with examples
3. Critical issues that must be addressed
4. Detailed improvement suggestions with examples
5. Board-readiness assessment
6. Priority actions for improvement

OUTPUT YOUR EVALUATION IN STRUCTURED TEXT FORMAT:
=== SCORING RESULTS ===

CLINICAL EXCELLENCE SCORES:
- Clinical Accuracy: [0-5]
- Clinical Relevance: [0-5]
- Clinical Complexity: [0-5]
- Differential Reasoning: [0-5]
- Patient Presentation: [0-5]
Subtotal: [X/25]

QUESTION CONSTRUCTION SCORES:
- Stem Clarity: [0-5]
- Option Homogeneity: [0-5]
- Single Best Answer: [0-5]
- Distractor Quality: [0-5]
- Technical Flaws: [0-5]
Subtotal: [X/25]

EDUCATIONAL VALUE SCORES:
- Explanation Depth: [0-5]
- Learning Objectives: [0-5]
- Concept Integration: [0-5]
- Clinical Pearls: [0-5]
- Evidence Base: [0-5]
Subtotal: [X/25]

PSYCHOMETRIC PROPERTIES SCORES:
- Difficulty Calibration: [0-5]
- Discrimination Potential: [0-5]
- Guess Resistance: [0-5]
- Cover-Options Test: [0-5]
- Item-Writing Rules: [0-5]
Subtotal: [X/25]

TOTAL SCORE: [X/100]

=== DETAILED FEEDBACK ===

STRENGTHS:
• [Specific strength 1 with example]
• [Specific strength 2 with example]
• [Specific strength 3 with example]

WEAKNESSES:
• [Specific weakness 1 with example]
• [Specific weakness 2 with example]
• [Specific weakness 3 with example]

CRITICAL ISSUES:
• [Critical issue 1 requiring immediate attention]
• [Critical issue 2 requiring immediate attention]

IMPROVEMENT SUGGESTIONS:
• [Detailed suggestion 1 with specific example]
• [Detailed suggestion 2 with specific example]
• [Detailed suggestion 3 with specific example]
• [Detailed suggestion 4 with specific example]

BOARD READINESS: [YES/NO]
Justification: [Explain why question is or isn't board-ready]

RECOMMENDED PRIORITY ACTIONS:
1. [Most critical action with specific steps]
2. [Second priority action with specific steps]
3. [Third priority action with specific steps]

CONFIDENCE IN SCORING: [0.0-1.0]
Rationale: [Explain confidence level in this evaluation]`;
}

/**
 * Format question for scoring evaluation
 */
function formatQuestionForScoring(questionItem: any): string {
  const stem = questionItem.stem || questionItem.clinical_vignette || '';
  const leadIn = questionItem.leadIn || questionItem.lead_in || '';
  
  // Handle various option formats
  let options = '';
  if (Array.isArray(questionItem.options)) {
    options = questionItem.options.map((opt: any, idx: number) => 
      `${String.fromCharCode(65 + idx)}) ${opt.text || opt}`
    ).join('\n');
  } else if (typeof questionItem.options === 'object') {
    options = Object.keys(questionItem.options).sort().map(key => 
      `${key}) ${questionItem.options[key]}`
    ).join('\n');
  }
  
  const correctAnswer = questionItem.correctAnswer || 
    (typeof questionItem.keyIndex === 'number' ? String.fromCharCode(65 + questionItem.keyIndex) : '');
  
  const explanation = questionItem.explanation || questionItem.rationale || '';
  
  return `
CLINICAL VIGNETTE:
${stem}

QUESTION:
${leadIn}

OPTIONS:
${options}

CORRECT ANSWER: ${correctAnswer}

EXPLANATION:
${explanation}
`;
}

/**
 * Parse structured text response from Gemini
 */
function parseScoringResponse(responseText: string): EnhancedScoringResult {
  try {
    // Parse scores from each section
    const clinicalScores = extractSectionScores(responseText, 'CLINICAL EXCELLENCE SCORES');
    const constructionScores = extractSectionScores(responseText, 'QUESTION CONSTRUCTION SCORES');
    const educationalScores = extractSectionScores(responseText, 'EDUCATIONAL VALUE SCORES');
    const psychometricScores = extractSectionScores(responseText, 'PSYCHOMETRIC PROPERTIES SCORES');
    
    // Extract total score
    const totalMatch = responseText.match(/TOTAL SCORE:\s*(\d+)\/100/);
    const totalScore = totalMatch ? parseInt(totalMatch[1]) : 
      Object.values({...clinicalScores, ...constructionScores, ...educationalScores, ...psychometricScores})
        .reduce((sum, val) => sum + val, 0);
    
    // Extract feedback sections
    const strengths = extractBulletPoints(responseText, 'STRENGTHS:');
    const weaknesses = extractBulletPoints(responseText, 'WEAKNESSES:');
    const criticalIssues = extractBulletPoints(responseText, 'CRITICAL ISSUES:');
    const improvements = extractBulletPoints(responseText, 'IMPROVEMENT SUGGESTIONS:');
    
    // Extract board readiness
    const boardReadyMatch = responseText.match(/BOARD READINESS:\s*(YES|NO)/i);
    const boardReadiness = boardReadyMatch ? boardReadyMatch[1].toUpperCase() === 'YES' : false;
    
    // Extract recommended actions
    const recommendedActions = extractNumberedList(responseText, 'RECOMMENDED PRIORITY ACTIONS:');
    
    // Extract confidence
    const confidenceMatch = responseText.match(/CONFIDENCE IN SCORING:\s*([\d.]+)/);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8;
    
    // Determine quality tier
    let qualityTier: EnhancedScoringResult['qualityTier'];
    if (totalScore >= 90) qualityTier = 'Exceptional';
    else if (totalScore >= 75) qualityTier = 'Strong';
    else if (totalScore >= 60) qualityTier = 'Acceptable';
    else if (totalScore >= 40) qualityTier = 'Needs Improvement';
    else qualityTier = 'Unacceptable';
    
    return {
      totalScore,
      rubric: {
        clinicalAccuracy: clinicalScores['Clinical Accuracy'] || 3,
        clinicalRelevance: clinicalScores['Clinical Relevance'] || 3,
        clinicalComplexity: clinicalScores['Clinical Complexity'] || 3,
        differentialReasoning: clinicalScores['Differential Reasoning'] || 3,
        patientPresentation: clinicalScores['Patient Presentation'] || 3,
        stemClarity: constructionScores['Stem Clarity'] || 3,
        optionHomogeneity: constructionScores['Option Homogeneity'] || 3,
        singleBestAnswer: constructionScores['Single Best Answer'] || 3,
        distractorQuality: constructionScores['Distractor Quality'] || 3,
        technicalFlaws: constructionScores['Technical Flaws'] || 3,
        explanationDepth: educationalScores['Explanation Depth'] || 3,
        learningObjectives: educationalScores['Learning Objectives'] || 3,
        conceptIntegration: educationalScores['Concept Integration'] || 3,
        clinicalPearls: educationalScores['Clinical Pearls'] || 3,
        evidenceBase: educationalScores['Evidence Base'] || 3,
        difficultyCalibration: psychometricScores['Difficulty Calibration'] || 3,
        discriminationPotential: psychometricScores['Discrimination Potential'] || 3,
        guessResistance: psychometricScores['Guess Resistance'] || 3,
        coverOptionsTest: psychometricScores['Cover-Options Test'] || 3,
        itemWritingRules: psychometricScores['Item-Writing Rules'] || 3,
      },
      detailedFeedback: {
        strengths,
        weaknesses,
        criticalIssues,
        improvementSuggestions: improvements
      },
      qualityTier,
      boardReadiness,
      recommendedActions,
      scoredAt: admin.firestore.FieldValue.serverTimestamp(),
      scoredBy: 'enhanced-abd-scoring-agent',
      confidence
    };
    
  } catch (error) {
    logError('enhanced_scoring.parse_error', { error: error instanceof Error ? error.message : String(error) });
    
    // Return default scores if parsing fails
    return generateDefaultScores();
  }
}

/**
 * Extract scores from a section
 */
function extractSectionScores(text: string, sectionHeader: string): Record<string, number> {
  const scores: Record<string, number> = {};
  
  // Find the section
  const sectionStart = text.indexOf(sectionHeader);
  if (sectionStart === -1) return scores;
  
  const sectionEnd = text.indexOf('Subtotal:', sectionStart);
  const sectionText = text.substring(sectionStart, sectionEnd > -1 ? sectionEnd + 50 : sectionStart + 500);
  
  // Extract individual scores
  const scorePattern = /[-•]\s*([^:]+):\s*(\d+)/g;
  let match;
  while ((match = scorePattern.exec(sectionText)) !== null) {
    const criterion = match[1].trim();
    const score = parseInt(match[2]);
    scores[criterion] = score;
  }
  
  return scores;
}

/**
 * Extract bullet points from a section
 */
function extractBulletPoints(text: string, header: string): string[] {
  const points: string[] = [];
  
  const headerIndex = text.indexOf(header);
  if (headerIndex === -1) return points;
  
  // Find the end of this section (next header or end of text)
  const nextHeaders = ['STRENGTHS:', 'WEAKNESSES:', 'CRITICAL ISSUES:', 'IMPROVEMENT SUGGESTIONS:', 'BOARD READINESS:', 'RECOMMENDED PRIORITY ACTIONS:'];
  let sectionEnd = text.length;
  
  for (const nextHeader of nextHeaders) {
    const nextIndex = text.indexOf(nextHeader, headerIndex + header.length);
    if (nextIndex > -1 && nextIndex < sectionEnd) {
      sectionEnd = nextIndex;
    }
  }
  
  const sectionText = text.substring(headerIndex + header.length, sectionEnd);
  
  // Extract bullet points
  const bulletPattern = /[•·]\s*([^\n•·]+)/g;
  let match;
  while ((match = bulletPattern.exec(sectionText)) !== null) {
    const point = match[1].trim();
    if (point.length > 0) {
      points.push(point);
    }
  }
  
  return points;
}

/**
 * Extract numbered list items
 */
function extractNumberedList(text: string, header: string): string[] {
  const items: string[] = [];
  
  const headerIndex = text.indexOf(header);
  if (headerIndex === -1) return items;
  
  // Find section bounds
  const nextHeaders = ['CONFIDENCE IN SCORING:', '==='];
  let sectionEnd = text.length;
  
  for (const nextHeader of nextHeaders) {
    const nextIndex = text.indexOf(nextHeader, headerIndex + header.length);
    if (nextIndex > -1 && nextIndex < sectionEnd) {
      sectionEnd = nextIndex;
    }
  }
  
  const sectionText = text.substring(headerIndex + header.length, sectionEnd);
  
  // Extract numbered items
  const numberedPattern = /\d+\.\s*([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/g;
  let match;
  while ((match = numberedPattern.exec(sectionText)) !== null) {
    const item = match[1].trim().replace(/\n/g, ' ');
    if (item.length > 0) {
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Generate default scores when parsing fails
 */
function generateDefaultScores(): EnhancedScoringResult {
  return {
    totalScore: 60,
    rubric: {
      clinicalAccuracy: 3,
      clinicalRelevance: 3,
      clinicalComplexity: 3,
      differentialReasoning: 3,
      patientPresentation: 3,
      stemClarity: 3,
      optionHomogeneity: 3,
      singleBestAnswer: 3,
      distractorQuality: 3,
      technicalFlaws: 3,
      explanationDepth: 3,
      learningObjectives: 3,
      conceptIntegration: 3,
      clinicalPearls: 3,
      evidenceBase: 3,
      difficultyCalibration: 3,
      discriminationPotential: 3,
      guessResistance: 3,
      coverOptionsTest: 3,
      itemWritingRules: 3,
    },
    detailedFeedback: {
      strengths: ['Question evaluated with default scoring due to processing error'],
      weaknesses: ['Full evaluation could not be completed'],
      criticalIssues: ['Manual review recommended'],
      improvementSuggestions: ['Re-run scoring for complete evaluation']
    },
    qualityTier: 'Acceptable',
    boardReadiness: false,
    recommendedActions: ['Manual review required', 'Re-run enhanced scoring'],
    scoredAt: admin.firestore.FieldValue.serverTimestamp(),
    scoredBy: 'enhanced-abd-scoring-agent-fallback',
    confidence: 0.3
  };
}

/**
 * Generate improvement recommendations based on scores
 */
function generateImprovementRecommendations(result: EnhancedScoringResult): ImprovementRecommendation[] {
  const recommendations: ImprovementRecommendation[] = [];
  const rubric = result.rubric;
  
  // Analyze each criterion and generate recommendations for low scores
  const criteriaMap: { [key in keyof ABDScoringRubric]: { category: string; targetScore: number; priority: 'Critical' | 'High' | 'Medium' | 'Low' } } = {
    clinicalAccuracy: { category: 'Clinical Excellence', targetScore: 5, priority: 'Critical' },
    clinicalRelevance: { category: 'Clinical Excellence', targetScore: 4, priority: 'High' },
    clinicalComplexity: { category: 'Clinical Excellence', targetScore: 4, priority: 'High' },
    differentialReasoning: { category: 'Clinical Excellence', targetScore: 4, priority: 'Medium' },
    patientPresentation: { category: 'Clinical Excellence', targetScore: 4, priority: 'Medium' },
    stemClarity: { category: 'Question Construction', targetScore: 5, priority: 'Critical' },
    optionHomogeneity: { category: 'Question Construction', targetScore: 4, priority: 'High' },
    singleBestAnswer: { category: 'Question Construction', targetScore: 5, priority: 'Critical' },
    distractorQuality: { category: 'Question Construction', targetScore: 4, priority: 'High' },
    technicalFlaws: { category: 'Question Construction', targetScore: 5, priority: 'Critical' },
    explanationDepth: { category: 'Educational Value', targetScore: 4, priority: 'Medium' },
    learningObjectives: { category: 'Educational Value', targetScore: 4, priority: 'Medium' },
    conceptIntegration: { category: 'Educational Value', targetScore: 3, priority: 'Low' },
    clinicalPearls: { category: 'Educational Value', targetScore: 4, priority: 'Medium' },
    evidenceBase: { category: 'Educational Value', targetScore: 3, priority: 'Low' },
    difficultyCalibration: { category: 'Psychometric Properties', targetScore: 4, priority: 'High' },
    discriminationPotential: { category: 'Psychometric Properties', targetScore: 4, priority: 'High' },
    guessResistance: { category: 'Psychometric Properties', targetScore: 4, priority: 'Medium' },
    coverOptionsTest: { category: 'Psychometric Properties', targetScore: 5, priority: 'High' },
    itemWritingRules: { category: 'Psychometric Properties', targetScore: 5, priority: 'Critical' }
  };
  
  // Generate recommendations for each criterion below target
  for (const [criterion, config] of Object.entries(criteriaMap)) {
    const currentScore = rubric[criterion as keyof ABDScoringRubric];
    if (currentScore < config.targetScore) {
      recommendations.push(generateSpecificRecommendation(
        criterion as keyof ABDScoringRubric,
        currentScore,
        config.targetScore,
        config.priority
      ));
    }
  }
  
  // Sort by priority
  const priorityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}

/**
 * Generate specific recommendation for a criterion
 */
function generateSpecificRecommendation(
  criterion: keyof ABDScoringRubric,
  currentScore: number,
  targetScore: number,
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
): ImprovementRecommendation {
  const recommendationMap: { [key in keyof ABDScoringRubric]: { actions: string[]; examples: string[] } } = {
    clinicalAccuracy: {
      actions: [
        'Verify all medical facts against current guidelines',
        'Update any outdated treatment recommendations',
        'Ensure dosages and frequencies are accurate',
        'Check diagnostic criteria against DSM-5 or current standards'
      ],
      examples: [
        'Instead of "topical steroids", specify "high-potency topical corticosteroids (e.g., clobetasol propionate 0.05%)"',
        'Update melanoma staging to current AJCC 8th edition criteria'
      ]
    },
    clinicalRelevance: {
      actions: [
        'Focus on high-yield board topics',
        'Include conditions commonly tested on ABD exams',
        'Emphasize differential diagnosis of similar presentations',
        'Address current treatment guidelines'
      ],
      examples: [
        'Focus on melanoma, BCC, SCC rather than rare tumors',
        'Include psoriasis, atopic dermatitis, acne as core topics'
      ]
    },
    clinicalComplexity: {
      actions: [
        'Add layers of clinical reasoning',
        'Include relevant lab results or imaging',
        'Present competing differential diagnoses',
        'Require synthesis of multiple findings'
      ],
      examples: [
        'Add: "Laboratory studies reveal elevated IgE and eosinophilia"',
        'Include: "Dermoscopy shows arborizing vessels and ulceration"'
      ]
    },
    differentialReasoning: {
      actions: [
        'Include key distinguishing features in stem',
        'Make distractors represent realistic differentials',
        'Require analysis of subtle differences',
        'Test pattern recognition skills'
      ],
      examples: [
        'Include both psoriasis and eczema as options with distinguishing features',
        'Present similar-appearing tumors requiring dermoscopic differentiation'
      ]
    },
    patientPresentation: {
      actions: [
        'Add realistic demographic details',
        'Include relevant social/occupational history',
        'Describe progression over time',
        'Add pertinent negatives'
      ],
      examples: [
        'A 45-year-old construction worker with 6-month history...',
        'Previously tried OTC hydrocortisone without improvement...'
      ]
    },
    stemClarity: {
      actions: [
        'Remove ambiguous language',
        'Focus on single clear question',
        'Eliminate unnecessary information',
        'Use standard medical terminology'
      ],
      examples: [
        'Replace "rash" with "erythematous, scaly plaques"',
        'Change "sometime ago" to "3 months ago"'
      ]
    },
    optionHomogeneity: {
      actions: [
        'Make all options similar length',
        'Use parallel grammatical structure',
        'Keep same level of detail',
        'Avoid outliers in format'
      ],
      examples: [
        'All options should be single diagnoses or all treatment pairs',
        'Maintain consistent format: "Diagnosis with specific treatment"'
      ]
    },
    singleBestAnswer: {
      actions: [
        'Ensure only one option is definitively correct',
        'Remove partial credit scenarios',
        'Clarify stem to eliminate ambiguity',
        'Test single concept clearly'
      ],
      examples: [
        'Specify "MOST appropriate initial treatment" not just "treatment"',
        'Add "Which ONE of the following..." to clarify single selection'
      ]
    },
    distractorQuality: {
      actions: [
        'Base on common misconceptions',
        'Include frequently confused conditions',
        'Use plausible but incorrect options',
        'Avoid obviously wrong choices'
      ],
      examples: [
        'Include lichen planus as distractor for psoriasis question',
        'Use outdated treatments that were once standard'
      ]
    },
    technicalFlaws: {
      actions: [
        'Fix grammatical errors',
        'Remove length cues',
        'Eliminate absolute terms',
        'Check for unintended hints'
      ],
      examples: [
        'Avoid "always" or "never" in options',
        'Ensure correct answer isn\'t longest option'
      ]
    },
    explanationDepth: {
      actions: [
        'Explain why correct answer is best',
        'Detail why each distractor is wrong',
        'Include pathophysiology',
        'Add clinical context'
      ],
      examples: [
        'Explain mechanism: "TNF-alpha inhibition reduces..."',
        'Clarify: "Option B is incorrect because lupus typically spares..."'
      ]
    },
    learningObjectives: {
      actions: [
        'State clear educational goal',
        'Link to board competencies',
        'Define measurable outcome',
        'Align with curriculum'
      ],
      examples: [
        'Objective: Recognize clinical features of morphea',
        'Competency: Differentiate inflammatory from neoplastic conditions'
      ]
    },
    conceptIntegration: {
      actions: [
        'Connect basic science to clinical',
        'Link diagnosis to treatment',
        'Integrate multiple systems',
        'Show relationships between concepts'
      ],
      examples: [
        'Connect immunology to therapeutic mechanism',
        'Link genetics to disease presentation'
      ]
    },
    clinicalPearls: {
      actions: [
        'Add high-yield teaching points',
        'Include board-relevant tips',
        'Highlight key distinctions',
        'Provide memory aids'
      ],
      examples: [
        'Pearl: "Herald patch precedes generalized eruption by 1-2 weeks"',
        'Tip: "Remember the 4 Ps of lichen planus: Purple, Pruritic, Polygonal, Papules"'
      ]
    },
    evidenceBase: {
      actions: [
        'Cite current guidelines',
        'Reference landmark studies',
        'Include evidence levels',
        'Note recent updates'
      ],
      examples: [
        'Per AAD 2024 psoriasis guidelines...',
        'Based on NEJM 2023 melanoma surveillance study...'
      ]
    },
    difficultyCalibration: {
      actions: [
        'Adjust complexity for target audience',
        'Balance recall vs reasoning',
        'Consider typical pass rates',
        'Calibrate to board standards'
      ],
      examples: [
        'For residents: Include more complex differentials',
        'For boards: Focus on must-know conditions'
      ]
    },
    discriminationPotential: {
      actions: [
        'Test meaningful knowledge differences',
        'Avoid trivial distinctions',
        'Focus on clinically relevant discrimination',
        'Separate competent from excellent'
      ],
      examples: [
        'Test understanding of mechanism not memorization',
        'Differentiate related but distinct conditions'
      ]
    },
    guessResistance: {
      actions: [
        'Make all options equally plausible',
        'Avoid patterns in correct answers',
        'Remove obvious eliminators',
        'Require specific knowledge'
      ],
      examples: [
        'All treatment options should be real drugs',
        'Include multiple acceptable but suboptimal choices'
      ]
    },
    coverOptionsTest: {
      actions: [
        'Ensure stem requires options to answer',
        'Avoid leading to single diagnosis',
        'Include necessary ambiguity',
        'Test discrimination not recall'
      ],
      examples: [
        'Present features common to multiple conditions',
        'Require options to determine best answer'
      ]
    },
    itemWritingRules: {
      actions: [
        'Follow NBME guidelines strictly',
        'Use standard formatting',
        'Apply consistent style',
        'Check all technical rules'
      ],
      examples: [
        'Place age and gender at start of stem',
        'Use "most likely" not "pathognomonic"'
      ]
    }
  };
  
  return {
    criterion,
    currentScore,
    targetScore,
    specificActions: recommendationMap[criterion].actions,
    examples: recommendationMap[criterion].examples,
    priority
  };
}

/**
 * Main scoring function using enhanced ABD rubric
 */
export async function scoreWithABDRubric(
  questionItem: any,
  previousFeedback?: any
): Promise<EnhancedScoringResult> {
  try {
    logInfo('enhanced_scoring.start', { 
      questionId: questionItem.id || 'unknown',
      hasPreviousFeedback: !!previousFeedback 
    });
    
    // Generate the scoring prompt
    const prompt = generateABDScoringPrompt(questionItem, previousFeedback);
    
    // Get Gemini client with robust error handling
    const geminiClient = getRobustGeminiClient({
      maxRetries: 3,
      timeout: 30000,
      fallbackToFlash: true
    });
    
    // Call Gemini API with structured text response (not JSON mode)
    const response = await geminiClient.generateText({
      prompt,
      operation: 'enhanced_abd_scoring',
      temperature: 0.3, // Lower temperature for more consistent scoring
      preferredModel: 'gemini-2.5-pro'
    });
    
    // Parse the structured response
    if (!response.success || !response.text) {
      throw new Error(`Enhanced scoring failed: ${response.error || 'No response text'}`);
    }
    
    const scoringResult = parseScoringResponse(response.text);
    
    // Log the scoring result
    logInfo('enhanced_scoring.complete', {
      questionId: questionItem.id || 'unknown',
      totalScore: scoringResult.totalScore,
      qualityTier: scoringResult.qualityTier,
      boardReadiness: scoringResult.boardReadiness,
      confidence: scoringResult.confidence
    });
    
    return scoringResult;
    
  } catch (error) {
    logError('enhanced_scoring.error', {
      error: error instanceof Error ? error.message : String(error),
      questionId: questionItem.id || 'unknown'
    });
    
    // Return default scores on error
    return generateDefaultScores();
  }
}

/**
 * Generate actionable feedback for improvement
 */
export async function generateActionableFeedback(
  scoringResult: EnhancedScoringResult,
  questionItem: any
): Promise<ImprovementRecommendation[]> {
  const recommendations = generateImprovementRecommendations(scoringResult);
  
  // Log recommendations
  logInfo('enhanced_scoring.recommendations', {
    questionId: questionItem.id || 'unknown',
    totalRecommendations: recommendations.length,
    criticalCount: recommendations.filter(r => r.priority === 'Critical').length,
    highCount: recommendations.filter(r => r.priority === 'High').length
  });
  
  return recommendations;
}

/**
 * Export for use in orchestrator
 */
export async function scoreMCQWithABDRubric(questionItem: any): Promise<{
  scores: {
    clinicalRelevance: number;
    clarity: number;
    singleBestAnswer: number;
    difficulty: number;
    educationalValue: number;
  };
  totalScore: number;
  success: boolean;
  retries: number;
}> {
  try {
    const result = await scoreWithABDRubric(questionItem);
    
    // Map to simplified interface for backward compatibility
    return {
      scores: {
        clinicalRelevance: Math.round((result.rubric.clinicalRelevance / 5) * 5),
        clarity: Math.round((result.rubric.stemClarity / 5) * 5),
        singleBestAnswer: Math.round((result.rubric.singleBestAnswer / 5) * 5),
        difficulty: Math.round((result.rubric.difficultyCalibration / 5) * 5),
        educationalValue: Math.round((result.rubric.explanationDepth / 5) * 5)
      },
      totalScore: Math.round((result.totalScore / 100) * 25), // Convert to 25-point scale
      success: true,
      retries: 0
    };
  } catch (error) {
    logError('scoreMCQWithABDRubric error', { error });
    throw error;
  }
}

/**
 * Main Firebase Cloud Function export for enhanced ABD scoring
 */
export const enhancedScoring = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes for comprehensive scoring
    memory: '1GB',
    secrets: [GEMINI_API_KEY]
  })
  .https.onCall(async (data: any, context) => {
    try {
      const { questionItem, includeRecommendations = false } = data;

      if (!questionItem) {
        throw new Error('Missing required parameter: questionItem');
      }

      // Perform enhanced scoring with ABD rubric
      const scoringResult = await scoreWithABDRubric(questionItem);

      let recommendations = undefined;
      if (includeRecommendations) {
        recommendations = generateImprovementRecommendations(scoringResult);
      }

      return {
        success: true,
        data: {
          ...scoringResult,
          recommendations
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      logError('enhanced_scoring.function_error', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  });