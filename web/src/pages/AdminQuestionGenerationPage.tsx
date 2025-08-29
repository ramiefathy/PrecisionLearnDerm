import { useState } from 'react';
import { toast } from '../components/Toast';
import { api } from '../lib/api';
import { handleAdminError } from '../lib/errorHandler';
import GenerationProgress from '../components/GenerationProgress';
import TaxonomySelector from '../components/TaxonomySelector';

interface GenerationResult {
  success: boolean;
  questions?: any;
  generated?: number;
  topic?: string;
  difficulties?: string[];
  message?: string;
}

export default function AdminQuestionGenerationPage() {
  const [topic, setTopic] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>(['Basic', 'Advanced', 'Very Difficult']);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult | null>(null);
  const [useOrchestrated, setUseOrchestrated] = useState(true); // Default to orchestrated
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [generationSessionId, setGenerationSessionId] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [useCustomTopic, setUseCustomTopic] = useState(false);

  // Common dermatology topics for the dropdown
  const commonTopics = [
    'Psoriasis',
    'Atopic dermatitis',
    'Acne',
    'Melanoma',
    'Basal cell carcinoma',
    'Squamous cell carcinoma',
    'Eczema',
    'Rosacea',
    'Seborrheic dermatitis',
    'Contact dermatitis',
    'Lichen planus',
    'Vitiligo',
    'Alopecia areata',
    'Tinea infections',
    'Herpes simplex',
    'Herpes zoster',
    'Molluscum contagiosum',
    'Warts',
    'Keratosis pilaris',
    'Hidradenitis suppurativa'
  ];

  const difficulties = [
    { id: 'Basic', label: 'Basic', description: 'Foundational, high-yield concepts' },
    { id: 'Advanced', label: 'Advanced', description: 'Advanced clinical management' },
    { id: 'Very Difficult', label: 'Very Difficult', description: 'Esoteric knowledge and rare conditions' }
  ];

  const handleDifficultyChange = (difficulty: string) => {
    setSelectedDifficulties(prev => 
      prev.includes(difficulty)
        ? prev.filter(d => d !== difficulty)
        : [...prev, difficulty]
    );
  };

  const handleGenerate = async () => {
    const effectiveTopic = useCustomTopic ? topic.trim() : selectedEntity?.name;
    
    if (!effectiveTopic) {
      toast.error('Topic required', useCustomTopic 
        ? 'Please enter a topic for question generation' 
        : 'Please select a topic from the taxonomy or switch to custom topic entry'
      );
      return;
    }

    if (selectedDifficulties.length === 0) {
      toast.error('Difficulty required', 'Please select at least one difficulty level');
      return;
    }

    if (questionCount < 1 || questionCount > 50) {
      toast.error('Invalid count', 'Question count must be between 1 and 50');
      return;
    }

    try {
      setGenerating(true);
      setResults(null);
      setShowProgress(true);

      // Use the selected pipeline (orchestrated by default)
      const result = await api.admin.generateQuestions({
        topic: effectiveTopic,
        difficulties: selectedDifficulties,
        questionCount: questionCount,
        useABDGuidelines: !useOrchestrated, // Inverted: false for orchestrated, true for board-style
        focusArea: undefined, // Can be added as UI option later
        enableProgress: true, // Enable progress tracking
        enableStreaming: useOrchestrated // Enable streaming for orchestrated pipeline
        // TODO: Add taxonomy parameters for better organization when API supports it
        // taxonomyFilter: selectedCategory ? {
        //   category: selectedCategory,
        //   subcategory: selectedSubcategory,
        //   subSubcategory: selectedSubSubcategory
        // } : undefined
      }) as any; // Type assertion to access custom properties
      
      // Store session ID for progress monitoring
      if (result.sessionId) {
        setGenerationSessionId(result.sessionId);
      }

      const resultQuestions = result.questions || {};
      const generatedCount = Object.keys(resultQuestions).length;

      setResults({
        success: true,
        questions: resultQuestions,
        generated: generatedCount,
        topic: effectiveTopic,
        difficulties: selectedDifficulties,
        message: `Successfully generated ${generatedCount} questions`
      });

      toast.success(
        'Questions Generated!', 
        `Created ${generatedCount} questions for ${effectiveTopic}`
      );

    } catch (error: any) {
      console.error('Generation error:', error);
      setResults({
        success: false,
        message: error.message || 'Failed to generate questions'
      });
      handleAdminError(error, 'generate targeted questions');
    } finally {
      setGenerating(false);
      setShowProgress(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Targeted Question Generation</h1>
            <p className="text-gray-600">Generate questions for specific topics and difficulty levels</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Generation Form */}
          <div className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-xl border border-gray-200/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 grid place-items-center text-white text-xl">
                ✨
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Question Parameters</h2>
                <p className="text-gray-600 text-sm">Configure your question generation settings</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Topic Selection Mode Toggle */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">Topic Selection Method:</span>
                <button
                  type="button"
                  onClick={() => setUseCustomTopic(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    !useCustomTopic 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  📚 Knowledge Base
                </button>
                <button
                  type="button"
                  onClick={() => setUseCustomTopic(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    useCustomTopic 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ✏️ Custom Topic
                </button>
              </div>

              {/* Topic Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Topic <span className="text-red-500">*</span>
                </label>
                
                {useCustomTopic ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Enter topic name (e.g., Psoriasis, Melanoma)"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <div className="text-xs text-gray-500">
                      Common topics:
                      <div className="flex flex-wrap gap-1 mt-1">
                        {commonTopics.slice(0, 6).map(commonTopic => (
                          <button
                            key={commonTopic}
                            onClick={() => setTopic(commonTopic)}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-purple-100 rounded-md transition-colors"
                          >
                            {commonTopic}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-xl p-4 bg-white">
                    <TaxonomySelector
                      selectedCategory={selectedCategory}
                      selectedSubcategory={selectedSubcategory}
                      selectedSubSubcategory={selectedSubSubcategory}
                      selectedEntity={selectedEntity?.name}
                      onCategoryChange={setSelectedCategory}
                      onSubcategoryChange={setSelectedSubcategory}
                      onSubSubcategoryChange={setSelectedSubSubcategory}
                      onEntityChange={setSelectedEntity}
                      showEntitySelector={true}
                      showStats={false}
                    />
                  </div>
                )}
              </div>

              {/* Question Count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Questions <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Generate 1-50 questions (Note: Multiple difficulties will generate separate questions for each level)
                </p>
              </div>

              {/* Difficulty Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Difficulty Levels <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {difficulties.map(difficulty => (
                    <label
                      key={difficulty.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-purple-300 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDifficulties.includes(difficulty.id)}
                        onChange={() => handleDifficultyChange(difficulty.id)}
                        className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{difficulty.label}</div>
                        <div className="text-sm text-gray-600">{difficulty.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Pipeline Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Generation Pipeline
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    {showAdvancedOptions ? 'Hide' : 'Show'} Options
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUseOrchestrated(true)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      useOrchestrated 
                        ? 'border-indigo-500 bg-indigo-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🔬</span>
                      <span className="font-semibold">Orchestrated</span>
                      {useOrchestrated && <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded">DEFAULT</span>}
                    </div>
                    <p className="text-xs text-gray-600">
                      Research-backed with web search, review & scoring agents
                    </p>
                    <p className="text-xs text-indigo-600 mt-1">~60-90 seconds</p>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setUseOrchestrated(false)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      !useOrchestrated 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">⚡</span>
                      <span className="font-semibold">Simplified</span>
                      {!useOrchestrated && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">FAST</span>}
                    </div>
                    <p className="text-xs text-gray-600">
                      Direct generation following ABD guidelines
                    </p>
                    <p className="text-xs text-green-600 mt-1">~24 seconds</p>
                  </button>
                </div>
                
                {showAdvancedOptions && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                    <p className="font-semibold mb-1">Pipeline Details:</p>
                    {useOrchestrated ? (
                      <ul className="space-y-1 ml-4">
                        <li>• Searches NCBI PubMed & OpenAlex databases</li>
                        <li>• AI drafting agent creates initial question</li>
                        <li>• Review agent validates medical accuracy</li>
                        <li>• Scoring agent evaluates quality (refinement if needed)</li>
                        <li>• Saves complete pipeline data for transparency</li>
                      </ul>
                    ) : (
                      <ul className="space-y-1 ml-4">
                        <li>• Direct question generation using Gemini 2.5</li>
                        <li>• Follows American Board of Dermatology guidelines</li>
                        <li>• Optimized for speed and reliability</li>
                        <li>• Best for bulk generation tasks</li>
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generating || (useCustomTopic ? !topic.trim() : !selectedEntity) || selectedDifficulties.length === 0}
                className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Generating Questions...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>✨</span>
                    Generate Questions
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Results Display */}
          <div className="bg-white/80 backdrop-blur rounded-3xl p-8 shadow-xl border border-gray-200/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 grid place-items-center text-white text-xl">
                📊
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Generation Results</h2>
                <p className="text-gray-600 text-sm">View your generated questions</p>
              </div>
            </div>

            {!results && !generating && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-gray-400 to-gray-500 grid place-items-center text-white text-2xl mx-auto mb-4">
                  ⏳
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Generate</h3>
                <p className="text-gray-600">Configure your parameters and click generate to see results here.</p>
              </div>
            )}

            {generating && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 grid place-items-center text-white text-2xl mx-auto mb-4">
                  <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating Questions...</h3>
                <p className="text-gray-600">Using optimized AI pipeline to create high-quality questions.</p>
              </div>
            )}

            {results && (
              <div className="space-y-6">
                {results.success ? (
                  <>
                    {/* Success Summary */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-600 text-lg">✅</span>
                        <h4 className="font-semibold text-green-900">Generation Successful</h4>
                      </div>
                      <p className="text-green-700 text-sm">{results.message}</p>
                    </div>

                    {/* Question Details */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900">Generated Questions</h4>
                      
                      {results.questions && Object.entries(results.questions).map(([difficulty, question]: [string, any]) => (
                        <div key={difficulty} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-gray-900">{difficulty}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                              Generated
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Question:</strong> {question.stem?.substring(0, 150)}...
                          </div>
                          
                          <div className="text-xs text-gray-500">
                            Options: {Object.keys(question.options || {}).length} • 
                            Correct: {question.correctAnswer} • 
                            Explanation: {question.explanation ? 'Included' : 'Missing'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Next Steps */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">Next Steps</h4>
                      <p className="text-blue-700 text-sm mb-3">
                        Your questions have been generated! They are now available in the review queue.
                      </p>
                      <a
                        href="/admin/review"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        <span>📋</span>
                        Go to Review Queue
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-red-600 text-lg">❌</span>
                      <h4 className="font-semibold text-red-900">Generation Failed</h4>
                    </div>
                    <p className="text-red-700 text-sm">{results.message}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Monitoring Modal */}
      {showProgress && generationSessionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-2xl w-full mx-4">
            <GenerationProgress 
              sessionId={generationSessionId}
              topic={useCustomTopic ? topic : selectedEntity?.name || 'Selected Topic'}
              pipeline={useOrchestrated ? 'orchestrated' : 'simplified'}
              onComplete={() => {
                setTimeout(() => {
                  setShowProgress(false);
                }, 2000);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}