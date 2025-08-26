import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface MCQData {
  stem: string;
  options: { A: string; B: string; C: string; D: string };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty?: 'Basic' | 'Advanced' | 'Very Difficult';
  topic?: string;
}

interface MCQDisplayProps {
  question: MCQData;
  showAnswer?: boolean;
  compact?: boolean;
  onAnswerReveal?: () => void;
}

export default function MCQDisplay({ 
  question, 
  showAnswer = true, 
  compact = false,
  onAnswerReveal 
}: MCQDisplayProps) {
  const [revealAnswer, setRevealAnswer] = useState(showAnswer);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  
  const handleRevealAnswer = () => {
    setRevealAnswer(true);
    onAnswerReveal?.();
  };
  
  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'Basic':
        return { bg: 'bg-green-100', text: 'text-green-700', icon: '🟢' };
      case 'Advanced':
        return { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🟡' };
      case 'Very Difficult':
        return { bg: 'bg-red-100', text: 'text-red-700', icon: '🔴' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', icon: '⚪' };
    }
  };
  
  const difficultyStyle = getDifficultyColor(question.difficulty);
  
  const getOptionStyle = (letter: string) => {
    if (!revealAnswer && !selectedAnswer) {
      return 'bg-white hover:bg-gray-50 border-gray-200 cursor-pointer';
    }
    
    if (revealAnswer && letter === question.correctAnswer) {
      return 'bg-green-50 border-green-400 ring-2 ring-green-400';
    }
    
    if (selectedAnswer === letter && letter !== question.correctAnswer) {
      return 'bg-red-50 border-red-400';
    }
    
    if (selectedAnswer && letter !== selectedAnswer) {
      return 'bg-gray-50 border-gray-200 opacity-60';
    }
    
    return 'bg-white border-gray-200';
  };
  
  const getOptionIcon = (letter: string) => {
    if (!revealAnswer) return null;
    if (letter === question.correctAnswer) return '✅';
    if (selectedAnswer === letter && letter !== question.correctAnswer) return '❌';
    return null;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-lg overflow-hidden ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      {/* Header with difficulty and topic */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {question.difficulty && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${difficultyStyle.bg} ${difficultyStyle.text}`}>
              <span>{difficultyStyle.icon}</span>
              {question.difficulty}
            </span>
          )}
          {question.topic && (
            <span className="text-sm text-gray-500">
              {question.topic}
            </span>
          )}
        </div>
      </div>
      
      {/* Clinical Vignette */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Clinical Vignette</h3>
        <p className={`text-gray-800 leading-relaxed ${compact ? 'text-sm' : 'text-base'}`}>
          {question.stem}
        </p>
      </div>
      
      {/* Answer Options */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Select the Best Answer</h3>
        <div className="space-y-2">
          {Object.entries(question.options).map(([letter, text]) => (
            <motion.div
              key={letter}
              whileHover={!revealAnswer ? { scale: 1.01 } : {}}
              whileTap={!revealAnswer ? { scale: 0.99 } : {}}
              onClick={() => !revealAnswer && setSelectedAnswer(letter)}
              className={`relative p-3 rounded-lg border-2 transition-all ${getOptionStyle(letter)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <span className={`font-semibold ${
                    revealAnswer && letter === question.correctAnswer ? 'text-green-700' : 'text-gray-700'
                  }`}>
                    {letter})
                  </span>
                  <span className={`flex-1 ${compact ? 'text-sm' : 'text-base'}`}>
                    {(() => {
                      // Ensure text is always a string to prevent React Error #31
                      if (typeof text === 'string' || typeof text === 'number') {
                        return String(text);
                      }
                      if (typeof text === 'object' && text !== null && typeof (text as any).text === 'string') {
                        return (text as any).text;
                      }
                      if (typeof text === 'object') {
                        return JSON.stringify(text);
                      }
                      return String(text);
                    })()}
                  </span>
                </div>
                {getOptionIcon(letter) && (
                  <span className="text-lg ml-2">{getOptionIcon(letter)}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Action Buttons */}
      {!revealAnswer && (
        <div className="flex justify-center mb-4">
          <button
            onClick={handleRevealAnswer}
            disabled={!selectedAnswer && !showAnswer}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              selectedAnswer || showAnswer
                ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {selectedAnswer ? 'Check Answer' : 'Reveal Answer'}
          </button>
        </div>
      )}
      
      {/* Explanation */}
      <AnimatePresence>
        {revealAnswer && question.explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Explanation</h3>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className={`text-gray-800 leading-relaxed ${compact ? 'text-sm' : 'text-base'}`}>
                  {question.explanation}
                </p>
              </div>
              {selectedAnswer && selectedAnswer !== question.correctAnswer && (
                <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    💡 <strong>Learning Point:</strong> The correct answer is {question.correctAnswer}. 
                    Review the explanation to understand why this is the best choice.
                  </p>
                </div>
              )}
              {selectedAnswer && selectedAnswer === question.correctAnswer && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    🎉 <strong>Excellent!</strong> You selected the correct answer.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Batch display component for multiple questions
interface MCQBatchDisplayProps {
  questions: {
    Basic?: MCQData;
    Advanced?: MCQData;
    'Very Difficult'?: MCQData;
  };
  topic: string;
}

export function MCQBatchDisplay({ questions, topic }: MCQBatchDisplayProps) {
  // Handle null/undefined questions gracefully
  if (!questions) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-300 rounded-lg">
        <p className="text-yellow-800">No questions available to display.</p>
      </div>
    );
  }
  
  // Filter out only valid difficulty keys and ensure they have valid MCQ data
  const validDifficulties: Array<'Basic' | 'Advanced' | 'Very Difficult'> = ['Basic', 'Advanced', 'Very Difficult'];
  const availableTabs = validDifficulties.filter(difficulty => {
    const question = questions[difficulty];
    return question && question.stem && question.options && question.correctAnswer && question.explanation;
  });
  
  const [activeTab, setActiveTab] = useState<'Basic' | 'Advanced' | 'Very Difficult'>(
    availableTabs.length > 0 ? availableTabs[0] : 'Basic'
  );
  
  // Handle case where no questions were successfully generated
  if (availableTabs.length === 0) {
    return (
      <div className="p-6 bg-red-50 border border-red-300 rounded-lg">
        <p className="text-red-800">Failed to generate questions. Please try again.</p>
      </div>
    );
  }
  
  const getDifficultyStyle = (difficulty: string, isActive: boolean) => {
    const baseStyle = 'px-4 py-2 rounded-lg font-medium text-sm transition-all';
    
    if (!isActive) {
      return `${baseStyle} bg-gray-100 text-gray-600 hover:bg-gray-200`;
    }
    
    switch (difficulty) {
      case 'Basic':
        return `${baseStyle} bg-green-500 text-white`;
      case 'Advanced':
        return `${baseStyle} bg-yellow-500 text-white`;
      case 'Very Difficult':
        return `${baseStyle} bg-red-500 text-white`;
      default:
        return `${baseStyle} bg-gray-500 text-white`;
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Topic Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 rounded-lg">
        <h2 className="text-xl font-bold">Generated Questions: {topic}</h2>
        <p className="text-sm opacity-90 mt-1">
          {availableTabs.length} difficulty level{availableTabs.length > 1 ? 's' : ''} generated
        </p>
      </div>
      
      {/* Difficulty Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex gap-2">
          {availableTabs.map(difficulty => (
            <button
              key={difficulty}
              onClick={() => setActiveTab(difficulty)}
              className={getDifficultyStyle(difficulty, activeTab === difficulty)}
            >
              {difficulty === 'Basic' && '🟢'} 
              {difficulty === 'Advanced' && '🟡'} 
              {difficulty === 'Very Difficult' && '🔴'} {difficulty}
            </button>
          ))}
        </div>
      )}
      
      {/* Active Question Display */}
      <AnimatePresence mode="wait">
        {questions && questions[activeTab] && questions[activeTab]!.stem && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <MCQDisplay 
              question={{ ...questions[activeTab]!, difficulty: activeTab, topic }} 
              showAnswer={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}