
export interface ParsedMCQ {
  stem: string;
  options: { A: string; B: string; C: string; D: string };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface ParsedScore {
  clinicalRelevance?: number;
  clarity?: number;
  singleBestAnswer?: number;
  difficulty?: number;
  educationalValue?: number;
  totalScore: number;
  feedback?: string;
  qualityTier?: string;
}

export interface ParsedReview {
  medicalAccuracy: number;
  educationalValue: number;
  difficultyAppropriate: boolean;
  distractorQuality: number;
  explanationClarity: number;
  boardRelevance: number;
  corrections?: string[];
  feedback?: string;
}

export type ParsedContent = 
  | { type: 'mcq'; data: ParsedMCQ }
  | { type: 'score'; data: ParsedScore }
  | { type: 'review'; data: ParsedReview }
  | { type: 'raw'; data: string };

export function parseStructuredText(text: string): ParsedContent {
  const trimmedText = text.trim();
  
  // Check for MCQ format
  if (trimmedText.includes('STEM:') && trimmedText.includes('OPTIONS:')) {
    return { type: 'mcq', data: parseMCQ(trimmedText) };
  }
  
  // Check for scoring format
  if (trimmedText.includes('totalScore') || trimmedText.includes('SCORE:')) {
    return { type: 'score', data: parseScore(trimmedText) };
  }
  
  // Check for review format
  if (trimmedText.includes('medicalAccuracy') && trimmedText.includes('educationalValue')) {
    return { type: 'review', data: parseReview(trimmedText) };
  }
  
  // Default to raw text
  return { type: 'raw', data: text };
}

function parseMCQ(text: string): ParsedMCQ {
  const mcq: ParsedMCQ = {
    stem: '',
    options: { A: '', B: '', C: '', D: '' },
    correctAnswer: 'A',
    explanation: ''
  };
  
  try {
    // Extract STEM
    const stemMatch = text.match(/STEM:\s*([\s\S]*?)(?=\n\s*OPTIONS:|$)/i);
    if (stemMatch) {
      mcq.stem = stemMatch[1].trim();
    }
    
    // Extract OPTIONS
    const optionsMatch = text.match(/OPTIONS:\s*([\s\S]*?)(?=\n\s*CORRECT_ANSWER:|$)/i);
    if (optionsMatch) {
      const optionsText = optionsMatch[1].trim();
      const optionLines = optionsText.split('\n').filter(line => line.trim());
      
      for (const line of optionLines) {
        const optionMatch = line.match(/([A-D])\)\s*(.+)/i);
        if (optionMatch) {
          const letter = optionMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
          mcq.options[letter] = optionMatch[2].trim();
        }
      }
    }
    
    // Extract CORRECT_ANSWER
    const answerMatch = text.match(/CORRECT_ANSWER:\s*([A-D])/i);
    if (answerMatch) {
      mcq.correctAnswer = answerMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
    }
    
    // Extract EXPLANATION
    const explanationMatch = text.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\s*$|$)/i);
    if (explanationMatch) {
      mcq.explanation = explanationMatch[1].trim();
    }
  } catch (error) {
    console.error('Error parsing MCQ:', error);
  }
  
  return mcq;
}

function parseScore(text: string): ParsedScore {
  const score: ParsedScore = { totalScore: 0 };
  
  try {
    // Try JSON parsing first
    if (text.includes('{')) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.scores) {
          score.clinicalRelevance = parsed.scores.clinicalRelevance;
          score.clarity = parsed.scores.clarity;
          score.singleBestAnswer = parsed.scores.singleBestAnswer;
          score.difficulty = parsed.scores.difficulty;
          score.educationalValue = parsed.scores.educationalValue;
        }
        score.totalScore = parsed.totalScore || 0;
        score.feedback = parsed.feedback;
        
        // Determine quality tier
        if (score.totalScore >= 22) score.qualityTier = 'Premium';
        else if (score.totalScore >= 18) score.qualityTier = 'High';
        else if (score.totalScore >= 15) score.qualityTier = 'Standard';
        else score.qualityTier = 'Needs Review';
      }
    } else {
      // Parse text format
      const totalMatch = text.match(/(?:totalScore|SCORE):\s*(\d+)/i);
      if (totalMatch) {
        score.totalScore = parseInt(totalMatch[1]);
      }
      
      const feedbackMatch = text.match(/(?:feedback|FEEDBACK):\s*(.*?)(?:\n|$)/i);
      if (feedbackMatch) {
        score.feedback = feedbackMatch[1].trim();
      }
    }
  } catch (error) {
    console.error('Error parsing score:', error);
  }
  
  return score;
}

function parseReview(text: string): ParsedReview {
  const review: ParsedReview = {
    medicalAccuracy: 0,
    educationalValue: 0,
    difficultyAppropriate: false,
    distractorQuality: 0,
    explanationClarity: 0,
    boardRelevance: 0
  };
  
  try {
    // Try JSON parsing first
    if (text.includes('{')) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        Object.assign(review, parsed);
      }
    } else {
      // Parse text format for individual scores
      const accuracyMatch = text.match(/medicalAccuracy:\s*(\d+)/i);
      if (accuracyMatch) review.medicalAccuracy = parseInt(accuracyMatch[1]);
      
      const eduMatch = text.match(/educationalValue:\s*(\d+)/i);
      if (eduMatch) review.educationalValue = parseInt(eduMatch[1]);
      
      const diffMatch = text.match(/difficultyAppropriate:\s*(true|false)/i);
      if (diffMatch) review.difficultyAppropriate = diffMatch[1] === 'true';
    }
  } catch (error) {
    console.error('Error parsing review:', error);
  }
  
  return review;
}

interface StructuredTextDisplayProps {
  content: ParsedContent;
  isStreaming?: boolean;
}

export function StructuredTextDisplay({ content, isStreaming = false }: StructuredTextDisplayProps) {
  if (content.type === 'mcq') {
    const mcq = content.data as ParsedMCQ;
    return (
      <div className="space-y-3 p-4 bg-white rounded-lg border border-gray-200">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Clinical Vignette</h4>
          <p className="text-sm text-gray-600">{mcq.stem}</p>
        </div>
        
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Answer Options</h4>
          <div className="space-y-1">
            {Object.entries(mcq.options).map(([letter, text]) => {
              // Ensure text is always a string to prevent React Error #31
              const textString = typeof text === 'string' ? text : 
                                typeof text === 'object' && text !== null && typeof (text as any).text === 'string' ? (text as any).text :
                                typeof text === 'object' ? JSON.stringify(text) : String(text);
              
              return (
                <div 
                  key={letter}
                  className={`p-2 rounded text-sm ${
                    mcq.correctAnswer === letter 
                      ? 'bg-green-50 border border-green-300 font-medium' 
                      : 'bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{letter})</span> {textString}
                </div>
              );
            })}
          </div>
        </div>
        
        {mcq.explanation && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Explanation</h4>
            <p className="text-sm text-gray-600">{mcq.explanation}</p>
          </div>
        )}
      </div>
    );
  }
  
  if (content.type === 'score') {
    const score = content.data as ParsedScore;
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Quality Score</h4>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            score.qualityTier === 'Premium' ? 'bg-purple-100 text-purple-700' :
            score.qualityTier === 'High' ? 'bg-green-100 text-green-700' :
            score.qualityTier === 'Standard' ? 'bg-blue-100 text-blue-700' :
            'bg-orange-100 text-orange-700'
          }`}>
            {score.qualityTier || 'Unrated'}
          </span>
        </div>
        
        <div className="text-2xl font-bold text-gray-900 mb-3">
          {score.totalScore}/25
        </div>
        
        {(score.clinicalRelevance !== undefined || score.clarity !== undefined) && (
          <div className="space-y-1 text-xs">
            {score.clinicalRelevance !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Clinical Relevance</span>
                <span className="font-medium">{score.clinicalRelevance}/5</span>
              </div>
            )}
            {score.clarity !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Clarity</span>
                <span className="font-medium">{score.clarity}/5</span>
              </div>
            )}
            {score.singleBestAnswer !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Single Best Answer</span>
                <span className="font-medium">{score.singleBestAnswer}/5</span>
              </div>
            )}
            {score.difficulty !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Difficulty</span>
                <span className="font-medium">{score.difficulty}/5</span>
              </div>
            )}
            {score.educationalValue !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Educational Value</span>
                <span className="font-medium">{score.educationalValue}/5</span>
              </div>
            )}
          </div>
        )}
        
        {score.feedback && (
          <p className="text-xs text-gray-600 mt-3 pt-3 border-t">{score.feedback}</p>
        )}
      </div>
    );
  }
  
  if (content.type === 'review') {
    const review = content.data as ParsedReview;
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Medical Review</h4>
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Medical Accuracy</span>
              <span className="font-medium">{review.medicalAccuracy}/5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Educational Value</span>
              <span className="font-medium">{review.educationalValue}/5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Distractor Quality</span>
              <span className="font-medium">{review.distractorQuality}/5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Board Relevance</span>
              <span className="font-medium">{review.boardRelevance}/5</span>
            </div>
          </div>
          
          {review.corrections && review.corrections.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <span className="text-gray-700 font-medium">Corrections:</span>
              <ul className="mt-1 space-y-1">
                {review.corrections.map((correction, idx) => {
                  // Ensure correction is always a string to prevent React Error #31
                  const correctionString = typeof correction === 'string' ? correction : 
                                          typeof correction === 'object' && correction !== null && typeof (correction as any).text === 'string' ? (correction as any).text :
                                          typeof correction === 'object' ? JSON.stringify(correction) : String(correction);
                  
                  return (
                    <li key={idx} className="text-gray-600">• {correctionString}</li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Raw text fallback
  return (
    <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
      <pre className="whitespace-pre-wrap">{content.data as string}</pre>
      {isStreaming && <span className="inline-block w-2 h-3 bg-green-400 animate-pulse ml-1" />}
    </div>
  );
}