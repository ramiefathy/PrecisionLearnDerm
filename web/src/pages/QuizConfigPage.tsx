import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../app/store';
import type { QuizConfig } from '../app/store';

const ALL_TOPICS = [
  'Acne and Related Disorders',
  'Atopic Dermatitis',
  'Psoriasis',
  'Seborrheic Dermatitis',
  'Contact Dermatitis',
  'Urticaria and Angioedema',
  'Bullous Diseases',
  'Connective Tissue Diseases',
  'Vasculitis',
  'Infectious Diseases',
  'Mycoses',
  'Viral Infections',
  'Parasitic Infestations',
  'Benign Tumors',
  'Malignant Tumors',
  'Melanoma',
  'Drug Eruptions',
  'Photosensitivity',
  'Hair Disorders',
  'Nail Disorders',
  'Genodermatoses',
  'Pediatric Dermatology',
  'Dermatopathology'
];

export default function QuizConfigPage() {
  const navigate = useNavigate();
  const { activeQuiz, setActiveQuiz } = useAppStore();
  
  // Initialize from activeQuiz if it exists (from TopicSelectionPage)
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    activeQuiz?.config?.topicIds || []
  );
  const [questionCount, setQuestionCount] = useState(activeQuiz?.config?.numQuestions || 25);
  const [progressionMode, setProgressionMode] = useState<'one-by-one' | 'batch'>(
    activeQuiz?.config?.progressionMode || 'one-by-one'
  );
  const [timed, setTimed] = useState(activeQuiz?.config?.timed || false);
  const [timeLimit, setTimeLimit] = useState(activeQuiz?.config?.durationMins || 30);

  const handleTopicToggle = (topic: string) => {
    setSelectedTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  const handleSelectAll = () => {
    setSelectedTopics(ALL_TOPICS);
  };

  const handleClearAll = () => {
    setSelectedTopics([]);
  };

  const handleStart = () => {
    const config: QuizConfig = {
      numQuestions: questionCount,
      timed,
      durationMins: timeLimit,
      progressionMode,
      captureConfidence: true,
      topicIds: selectedTopics.length > 0 ? selectedTopics : ALL_TOPICS,
    };
    
    const quiz = {
      startedAt: Date.now(),
      items: [],
      answers: {},
      config,
      currentIndex: 0,
      schemaVersion: 1
    };
    
    setActiveQuiz(quiz);
    navigate('/quiz/play');
  };

  const canStart = true; // Always allow start (will use all topics if none selected)

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/quiz/topics')}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configure Your Quiz</h1>
              <p className="text-gray-600">Customize your learning experience</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quiz Mode */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-4">Learning Mode</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setProgressionMode('one-by-one')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    progressionMode === 'one-by-one'
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-left">
                    <div className="text-lg font-semibold text-gray-900 mb-1">Step-by-Step</div>
                    <div className="text-sm text-gray-600">
                      See explanations immediately after each question
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={() => setProgressionMode('batch')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    progressionMode === 'batch'
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-left">
                    <div className="text-lg font-semibold text-gray-900 mb-1">Exam Style</div>
                    <div className="text-sm text-gray-600">
                      Answer all questions first, then review
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>

            {/* Question Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Question Settings</h2>
              
              <div className="space-y-6">
                {/* Question Count */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Number of Questions: <span className="text-blue-600">{questionCount}</span>
                  </label>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">5</span>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-sm text-gray-500">50</span>
                  </div>
                </div>

                {/* Timing */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Time Limit
                    </label>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={timed}
                        onChange={(e) => setTimed(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable timer</span>
                    </div>
                  </div>
                  
                  {timed && (
                    <div className="grid grid-cols-4 gap-2">
                      {[15, 30, 60, 90].map((minutes) => (
                        <button
                          key={minutes}
                          onClick={() => setTimeLimit(minutes)}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            timeLimit === minutes
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {minutes}m
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Topic Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Topics</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleClearAll}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                {ALL_TOPICS.map((topic) => (
                  <label
                    key={topic}
                    className="flex items-center p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTopics.includes(topic)}
                      onChange={() => handleTopicToggle(topic)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-3 text-sm text-gray-700">{topic}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Summary Panel */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100 sticky top-8"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Quiz Summary</h2>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Mode</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {progressionMode === 'one-by-one' ? 'Step-by-Step' : 'Exam Style'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Questions</span>
                  <span className="text-sm font-semibold text-blue-600">{questionCount}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Timer</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {timed ? `${timeLimit} min` : 'Unlimited'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Topics</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedTopics.length > 0 ? selectedTopics.length : 'All'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleStart}
                disabled={!canStart}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                Start Quiz
              </button>

              <div className="mt-4 text-center text-xs text-gray-500">
                Estimated time: {Math.round(questionCount * 1.5)}-{Math.round(questionCount * 2.5)} min
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </main>
  );
}
