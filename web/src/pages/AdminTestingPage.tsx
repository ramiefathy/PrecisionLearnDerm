import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { generateQuestionsRobust } from '../lib/streamingApi';
import { toast } from '../components/Toast';
import AgentOutputViewer from '../components/AgentOutputViewer';
import type { AgentOutput } from '../components/AgentOutputViewer';
import PipelineProgress from '../components/PipelineProgress';
import { MCQBatchDisplay } from '../components/MCQDisplay';
import { useGenerationProgress } from '../hooks/useGenerationProgress';
import { useAuth } from '../contexts/AuthContext';

interface TestResult {
  id: string;
  testName: string;
  endpoint: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startTime: number;
  endTime?: number;
  duration?: number;
  result?: any;
  error?: string;
  logs: string[];
  agentOutputs?: AgentOutput[];
}


type Difficulty = 'Basic' | 'Advanced' | 'Very Difficult';

export default function AdminTestingPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedTest, setSelectedTest] = useState<string>('orchestrator');
  const [topic, setTopic] = useState('Melanoma');
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<Difficulty>>(new Set(['Basic', 'Advanced', 'Very Difficult']));
  const [currentLogs, setCurrentLogs] = useState<string[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [agentOutputs, setAgentOutputs] = useState<AgentOutput[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Get current user from auth context
  const { user } = useAuth();
  
  // Use the generation progress hook
  const { progress } = useGenerationProgress(currentSessionId);

  // Available test scenarios
  const testScenarios = [
    {
      id: 'orchestrator',
      name: 'Multi-Agent Orchestrator',
      description: 'Full pipeline with search, summarization, drafting, review, and scoring',
      endpoint: 'orchestrateGeneration',
      category: 'ai'
    },
    {
      id: 'streaming',
      name: 'Streaming Generation (No Timeout)',
      description: 'Uses HTTP streaming to bypass 70-second timeout limitation',
      endpoint: 'streamingGeneration',
      category: 'ai',
      useStreaming: true
    },
    {
      id: 'enhanced',
      name: 'Enhanced Pipeline',
      description: 'Enhanced generation with validation and quality controls',
      endpoint: 'generateEnhancedMcq',
      category: 'ai'
    },
    {
      id: 'simple',
      name: 'Simple Generation',
      description: 'Basic AI question generation without multi-agent pipeline',
      endpoint: 'generateMcq',
      category: 'ai'
    },
    {
      id: 'review',
      name: 'Review Agent',
      description: 'Test the review agent with optimized architecture',
      endpoint: 'reviewMcqV2',
      category: 'ai'
    },
    {
      id: 'scoring',
      name: 'Scoring Agent',
      description: 'Test the scoring agent independently',
      endpoint: 'scoreMcq',
      category: 'ai'
    },
    {
      id: 'batch',
      name: 'Batch Generation',
      description: 'Generate multiple questions in batch',
      endpoint: 'generateQuestionQueue',
      category: 'admin'
    },
    {
      id: 'perTopic',
      name: 'Per-Topic Generation',
      description: 'Generate questions for each topic category',
      endpoint: 'generatePerTopic',
      category: 'admin'
    }
  ];

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setCurrentLogs(prev => [...prev, logMessage]);
  };

  const runTest = async (scenario: typeof testScenarios[0]) => {
    const testId = `${scenario.id}-${Date.now()}`;
    const testResult: TestResult = {
      id: testId,
      testName: scenario.name,
      endpoint: scenario.endpoint,
      status: 'pending',
      startTime: Date.now(),
      logs: []
    };

    // Add to results
    setTestResults(prev => [...prev, testResult]);
    
    // Update to running
    setTestResults(prev => prev.map(r => 
      r.id === testId ? { ...r, status: 'running' as const } : r
    ));

    addLog(`Starting test: ${scenario.name}`);
    addLog(`Endpoint: ${scenario.endpoint}`);

    try {
      let result: any;
      
      // Check if this is a streaming test
      if ((scenario as any).useStreaming) {
        addLog(`🚀 Using HTTP streaming to bypass 70-second timeout...`);
        
        result = await generateQuestionsRobust(
          topic,
          Array.from(selectedDifficulties),
          {
            preferStreaming: true,
            onProgress: (progress) => {
              addLog(`📊 Progress: ${JSON.stringify(progress)}`);
              // Update test result with progress
              setTestResults(prev => prev.map(r => 
                r.id === testId 
                  ? { ...r, logs: [...r.logs, `Progress: ${JSON.stringify(progress)}`] } 
                  : r
              ));
            },
            onChunk: (chunk) => {
              addLog(`📝 Chunk received (${chunk.length} chars)`);
            },
            onComplete: (data) => {
              addLog(`✅ Streaming complete`);
              // Extract sessionId for progress tracking
              const sessionId = data?.sessionId;
              if (sessionId) {
                setCurrentSessionId(sessionId);
              }
            },
            onError: (error) => {
              addLog(`❌ Streaming error: ${error.message}`);
            }
          }
        );
      } else {
        // Regular API call
        // Prepare payload based on test type
        const payload = (() => {
        switch (scenario.id) {
          case 'orchestrator':
            return {
              topic,
              difficulties: Array.from(selectedDifficulties), // Only send selected difficulties
              userId: user?.uid || 'test_user', // Use actual user ID or test fallback
              enableProgress: true, // Enable progress tracking
              useStreaming: true // Enable streaming for agent outputs
            };
          case 'enhanced':
            return {
              topicIds: [topic.toLowerCase().replace(/\s+/g, '_')],
              difficulty: selectedDifficulties.has('Basic') ? 0.3 : selectedDifficulties.has('Advanced') ? 0.6 : 0.9,
              useAI: true,
              strictMode: true
            };
          case 'simple':
            return {
              topicIds: [topic.toLowerCase().replace(/\s+/g, '_')],
              difficulty: selectedDifficulties.has('Basic') ? 0.3 : selectedDifficulties.has('Advanced') ? 0.6 : 0.9
            };
          case 'review':
          case 'reviewV2':
            return {
              question: {
                stem: "A 45-year-old patient presents with a pigmented lesion...",
                leadIn: "What is the most likely diagnosis?",
                options: [
                  { text: "Melanoma" },
                  { text: "Seborrheic keratosis" },
                  { text: "Nevus" },
                  { text: "Basal cell carcinoma" },
                  { text: "Dermatofibroma" }
                ],
                correctAnswer: 0,
                explanation: "The clinical features suggest melanoma."
              }
            };
          case 'scoring':
            return {
              question: {
                stem: "A patient presents with symptoms...",
                leadIn: "What is the best treatment?",
                options: [
                  { text: "Option A", isCorrect: true },
                  { text: "Option B", isCorrect: false },
                  { text: "Option C", isCorrect: false },
                  { text: "Option D", isCorrect: false },
                  { text: "Option E", isCorrect: false }
                ],
                explanation: "Treatment explanation here."
              }
            };
          case 'batch':
            return { count: 5 };
          case 'perTopic':
            return { perTopic: 2 };
          default:
            return {};
          }
        })();

        addLog(`Payload: ${JSON.stringify(payload, null, 2)}`);
        
        // Call the appropriate API endpoint
        const apiPath = scenario.category === 'admin' 
          ? (api.admin as any)[scenario.endpoint]
          : (api as any)[scenario.category][scenario.endpoint];
        
        if (typeof apiPath !== 'function') {
          throw new Error(`API endpoint not found: ${scenario.category}.${scenario.endpoint}`);
        }
        
        result = await apiPath(payload);
      }
      
      // Extract sessionId for progress tracking
      const sessionId = result?.sessionId || result?.data?.sessionId;
      if (sessionId) {
        setCurrentSessionId(sessionId);
        addLog(`📊 Progress tracking enabled: ${sessionId}`);
      }
      
      // Log the full result structure for debugging
      console.log('[AdminTestingPage] Full API result:', result);
      addLog(`Result structure: ${JSON.stringify(Object.keys(result || {}), null, 2)}`);
      
      // Extract agent outputs if present
      const extractedAgentOutputs = result?.agentOutputs || result?.data?.agentOutputs || [];
      
      // Update global agent outputs state for live display
      if (extractedAgentOutputs.length > 0) {
        setAgentOutputs(extractedAgentOutputs);
      }
      
      // Log questions structure for debugging
      if (result?.questions) {
        const questionKeys = Object.keys(result.questions);
        addLog(`Questions generated for difficulties: ${questionKeys.join(', ')}`);
        
        // Log each question's structure
        questionKeys.forEach(difficulty => {
          const q = result.questions[difficulty];
          if (q) {
            addLog(`${difficulty} question has: stem=${!!q.stem}, options=${!!q.options}, correctAnswer=${!!q.correctAnswer}, explanation=${!!q.explanation}`);
          }
        });
      }
      
      // Update test result with success
      setTestResults(prev => prev.map(r => 
        r.id === testId 
          ? { 
              ...r, 
              status: 'success' as const,
              endTime: Date.now(),
              duration: Date.now() - r.startTime,
              result,
              logs: [...r.logs, ...currentLogs],
              agentOutputs: extractedAgentOutputs
            } 
          : r
      ));
      
      addLog(`✅ Test completed successfully`);
      toast.success('Test Completed', `${scenario.name} finished successfully`);
      
    } catch (error: any) {
      console.error('[AdminTestingPage] Test failed:', error);
      
      // Update test result with error
      setTestResults(prev => prev.map(r => 
        r.id === testId 
          ? { 
              ...r, 
              status: 'error' as const,
              endTime: Date.now(),
              duration: Date.now() - r.startTime,
              error: error.message || 'Unknown error',
              logs: [...r.logs, ...currentLogs]
            } 
          : r
      ));
      
      addLog(`❌ Test failed: ${error.message}`);
      addLog(`Error stack: ${error.stack}`);
      toast.error('Test Failed', error.message);
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    setCurrentLogs([]);
    
    for (const scenario of testScenarios) {
      await runTest(scenario);
      // Add delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsRunning(false);
  };

  const runSelectedTest = async () => {
    const scenario = testScenarios.find(s => s.id === selectedTest);
    if (!scenario) return;
    
    setIsRunning(true);
    setCurrentLogs([]);
    await runTest(scenario);
    setIsRunning(false);
  };

  const clearResults = () => {
    setTestResults([]);
    setCurrentLogs([]);
    setCurrentSessionId(null);
    setAgentOutputs([]);
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600';
      case 'running': return 'bg-blue-100 text-blue-600 animate-pulse';
      case 'success': return 'bg-green-100 text-green-600';
      case 'error': return 'bg-red-100 text-red-600';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'success': return '✅';
      case 'error': return '❌';
    }
  };

  const renderQuestionResult = (result: any) => {
    if (!result) return null;

    // Handle orchestrator result (multiple questions) - check for new format first
    const questionsData = result.questions || result;
    
    // Check if we have at least one valid difficulty with MCQ structure
    const hasValidQuestions = ['Basic', 'Advanced', 'Very Difficult'].some(difficulty => {
      const q = questionsData[difficulty];
      return q && q.stem && q.options && q.correctAnswer && q.explanation;
    });
    
    if (hasValidQuestions) {
      // Filter out only the actual question difficulty levels with valid MCQ structure
      const cleanQuestionsData = {
        ...(questionsData.Basic && questionsData.Basic.stem && { Basic: questionsData.Basic }),
        ...(questionsData.Advanced && questionsData.Advanced.stem && { Advanced: questionsData.Advanced }),
        ...(questionsData['Very Difficult'] && questionsData['Very Difficult'].stem && { 'Very Difficult': questionsData['Very Difficult'] })
      };
      
      console.log('Rendering MCQBatchDisplay with questions:', cleanQuestionsData);
      
      // Use the MCQBatchDisplay component for better visualization
      return (
        <MCQBatchDisplay
          questions={cleanQuestionsData}
          topic={topic}
        />
      );
    }

    // Handle single question result
    if (result.question || result.stem) {
      const question = result.question || result;
      return (
        <div className="space-y-2 text-sm">
          {question.stem && (
            <div>
              <span className="font-medium">Stem:</span>
              <p className="text-gray-600 mt-1">{question.stem}</p>
            </div>
          )}
          {question.leadIn && (
            <div>
              <span className="font-medium">Lead-in:</span> {question.leadIn}
            </div>
          )}
          {question.options && (
            <div>
              <span className="font-medium">Options:</span>
              <ol className="list-decimal list-inside mt-1 text-gray-600">
                {(() => {
                  // Debug logging to understand data structure
                  console.log('Question options structure:', {
                    isArray: Array.isArray(question.options),
                    type: typeof question.options,
                    sample: question.options?.[0] || question.options?.A,
                    full: question.options
                  });

                  // Handle both array and object formats
                  let optionsArray: any[] = [];
                  
                  if (Array.isArray(question.options)) {
                    // Format: [{text: "..."}, ...] or ["...", ...]
                    optionsArray = question.options;
                  } else if (typeof question.options === 'object' && question.options !== null) {
                    // Format: {A: "...", B: "...", C: "...", D: "..."}
                    optionsArray = Object.entries(question.options).map(([key, value]) => ({
                      text: value,
                      label: key
                    }));
                  } else {
                    console.error('Unexpected options format:', question.options);
                    return <li className="text-red-500">[Invalid options format]</li>;
                  }
                  
                  return optionsArray.map((opt: any, idx: number) => (
                    <li key={idx} className={opt.isCorrect ? 'font-semibold text-green-600' : ''}>
                      {(() => {
                        // Robust rendering with extensive type checking
                        if (typeof opt === 'string' || typeof opt === 'number') {
                          return String(opt);
                        }
                        if (typeof opt === 'object' && opt !== null) {
                          if (typeof opt.text === 'string') {
                            return opt.text;
                          }
                          if (opt.label && typeof opt.text === 'string') {
                            return `${opt.label}) ${opt.text}`;
                          }
                          // Handle case where value might be nested
                          if (typeof opt === 'object' && Object.keys(opt).length === 1) {
                            const value = Object.values(opt)[0];
                            if (typeof value === 'string' || typeof value === 'number') {
                              return String(value);
                            }
                          }
                        }
                        // Fallback - never render an object directly
                        console.error('Unexpected option format:', opt);
                        return '[Invalid option format]';
                      })()}
                    </li>
                  ));
                })()}
              </ol>
            </div>
          )}
          {question.explanation && (
            <div>
              <span className="font-medium">Explanation:</span>
              <p className="text-gray-600 mt-1">{question.explanation}</p>
            </div>
          )}
        </div>
      );
    }

    // Default JSON display
    return (
      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Pipeline Testing</h1>
              <p className="text-gray-600">Test and debug the multi-agent question generation pipeline</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={clearResults}
                disabled={isRunning}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                Clear Results
              </button>
              <button
                onClick={runAllTests}
                disabled={isRunning}
                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {isRunning ? 'Running...' : 'Run All Tests'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Test Configuration */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">Test Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Scenario
                  </label>
                  <select
                    value={selectedTest}
                    onChange={(e) => setSelectedTest(e.target.value)}
                    disabled={isRunning}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {testScenarios.map(scenario => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {testScenarios.find(s => s.id === selectedTest)?.description}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Topic
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isRunning}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Melanoma, Psoriasis"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty Levels
                  </label>
                  <div className="space-y-2">
                    {/* All Difficulties Checkbox */}
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDifficulties.size === 3}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDifficulties(new Set(['Basic', 'Advanced', 'Very Difficult']));
                          } else {
                            setSelectedDifficulties(new Set());
                          }
                        }}
                        disabled={isRunning}
                        className="rounded text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium">All Difficulties</span>
                    </label>
                    
                    <div className="ml-6 space-y-1">
                      {/* Individual Difficulty Checkboxes */}
                      {(['Basic', 'Advanced', 'Very Difficult'] as Difficulty[]).map((diff) => (
                        <label key={diff} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDifficulties.has(diff)}
                            onChange={(e) => {
                              const newSet = new Set(selectedDifficulties);
                              if (e.target.checked) {
                                newSet.add(diff);
                              } else {
                                newSet.delete(diff);
                              }
                              setSelectedDifficulties(newSet);
                            }}
                            disabled={isRunning}
                            className="rounded text-blue-500 focus:ring-blue-500"
                          />
                          <span className="text-sm">
                            {diff === 'Basic' ? '🟢 Basic (Easy)' : 
                             diff === 'Advanced' ? '🟡 Advanced (Medium)' : 
                             '🔴 Very Difficult (Hard)'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {selectedDifficulties.size === 0 && (
                    <p className="text-xs text-red-500 mt-1">Please select at least one difficulty level</p>
                  )}
                </div>

                <button
                  onClick={runSelectedTest}
                  disabled={isRunning}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {isRunning ? 'Running...' : 'Run Selected Test'}
                </button>
              </div>
            </div>
          </div>

          {/* Test Results */}
          <div className="lg:col-span-2 space-y-4">
            {/* Live Logs */}
            {currentLogs.length > 0 && (
              <div className="bg-black rounded-xl shadow-lg p-4">
                <h3 className="text-green-400 font-mono text-sm mb-2">Live Output</h3>
                <div className="font-mono text-xs text-green-300 space-y-1 max-h-40 overflow-y-auto">
                  {currentLogs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Progress Display */}
            {progress && currentSessionId && (
              <PipelineProgress
                stages={progress.stages}
                currentStage={progress.currentStage}
                percentComplete={progress.percentComplete}
                estimatedTimeRemaining={progress.estimatedTimeRemaining}
                pipeline={progress.pipeline}
                compact={false}
              />
            )}
            
            {/* Agent Outputs Display */}
            {agentOutputs.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Agent Outputs</h2>
                {agentOutputs.map((agent, idx) => (
                  <AgentOutputViewer 
                    key={`${agent.name}-${idx}`} 
                    agent={agent} 
                    isExpanded={agent.status === 'running' || agent.status === 'error'}
                  />
                ))}
              </div>
            )}

            {/* Test Results */}
            <AnimatePresence>
              {testResults.map((result) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-xl shadow-lg overflow-hidden"
                >
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedResult(expandedResult === result.id ? null : result.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getStatusIcon(result.status)}</span>
                        <div>
                          <h3 className="font-semibold text-gray-900">{result.testName}</h3>
                          <p className="text-sm text-gray-500">
                            Endpoint: {result.endpoint}
                            {result.duration && ` • Duration: ${(result.duration / 1000).toFixed(2)}s`}
                          </p>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                        {result.status}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedResult === result.id && (
                    <div className="border-t border-gray-200 p-4 space-y-4">
                      {result.error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <h4 className="font-medium text-red-900 mb-1">Error</h4>
                          <p className="text-sm text-red-700">{result.error}</p>
                        </div>
                      )}

                      {result.result && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Result</h4>
                          {renderQuestionResult(result.result)}
                        </div>
                      )}

                      {result.agentOutputs && result.agentOutputs.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-4">🤖 Agent Outputs</h4>
                          <div className="space-y-3">
                            {result.agentOutputs.map((agent, idx) => (
                              <AgentOutputViewer 
                                key={`${agent.name}-${idx}`} 
                                agent={agent} 
                                isExpanded={false}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {result.logs.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Execution Logs</h4>
                          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600 max-h-40 overflow-y-auto">
                            {result.logs.map((log, idx) => (
                              <div key={idx}>{log}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {testResults.length === 0 && !isRunning && (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <div className="text-6xl mb-4">🧪</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tests Run Yet</h3>
                <p className="text-gray-600">Select a test scenario and click "Run Selected Test" to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
