import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types matching backend structure
interface PipelineOutputs {
  generation?: {
    method: string;
    model?: string;
    prompt?: string;
    rawOutput?: string;
    timestamp: string;
    duration?: number;
  };
  webSearch?: {
    performed: boolean;
    query: string;
    ncbi: {
      searched: boolean;
      resultCount: number;
      topResults: any[];
      duration: number;
      error?: string;
    };
    openAlex: {
      searched: boolean;
      resultCount: number;
      topResults: any[];
      duration: number;
      error?: string;
    };
    cachedResult: boolean;
  };
  review?: {
    performed: boolean;
    feedback: string[];
    suggestions: string[];
    qualityIssues: string[];
    overallAssessment: string;
    duration: number;
  };
  scoring?: {
    performed: boolean;
    rubric: any;
    totalScore: number;
    passed: boolean;
    duration: number;
  };
  refinements?: Array<{
    iteration: number;
    trigger: string;
    changes: string[];
    newScore: number;
  }>;
  performance?: {
    totalDuration: number;
    apiCalls: number;
    cacheHits: number;
  };
}

interface EnhancedPipelineViewerProps {
  pipelineOutputs?: PipelineOutputs;
}

// Main Component
export default function EnhancedPipelineViewer({ 
  pipelineOutputs
}: EnhancedPipelineViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'flow' | 'timeline' | 'raw'>('flow');

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (!pipelineOutputs) {
    return (
      <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
        No pipeline data available for this question
      </div>
    );
  }

  // Pipeline Flow Visualization
  const PipelineFlow = () => {
    const stages = [
      { 
        key: 'context', 
        label: 'Context', 
        icon: '📚', 
        active: !!pipelineOutputs.generation,
        color: 'purple'
      },
      { 
        key: 'search', 
        label: 'Web Search', 
        icon: '🔍', 
        active: !!pipelineOutputs.webSearch?.performed,
        color: 'blue'
      },
      { 
        key: 'draft', 
        label: 'Drafting', 
        icon: '✍️', 
        active: true,
        color: 'indigo'
      },
      { 
        key: 'review', 
        label: 'Review', 
        icon: '👁️', 
        active: !!pipelineOutputs.review?.performed,
        color: 'green'
      },
      { 
        key: 'score', 
        label: 'Scoring', 
        icon: '📊', 
        active: !!pipelineOutputs.scoring?.performed,
        color: 'yellow'
      },
      { 
        key: 'refine', 
        label: 'Refinement', 
        icon: '🔄', 
        active: !!(pipelineOutputs.refinements && (pipelineOutputs.refinements?.length || 0) > 0),
        color: 'orange'
      }
    ];

    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Pipeline Flow</h3>
        <div className="flex items-center justify-between">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.key}>
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: stage.active ? 1 : 0.3 }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl
                  ${stage.active 
                    ? `bg-gradient-to-br from-${stage.color}-400 to-${stage.color}-600 text-white shadow-lg` 
                    : 'bg-gray-200 text-gray-400'}`}>
                  {stage.icon}
                </div>
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                  <span className={`text-xs ${stage.active ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                </div>
              </motion.div>
              {i < stages.length - 1 && (
                <div className="flex-1 h-0.5 mx-2">
                  <motion.div 
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: stages[i + 1].active ? 1 : 0.3 }}
                    transition={{ delay: i * 0.1 + 0.2 }}
                    className={`h-full origin-left ${
                      stages[i + 1].active ? 'bg-gradient-to-r from-gray-400 to-gray-300' : 'bg-gray-200'
                    }`} 
                  />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  // Web Search Details Component
  const WebSearchDetails = () => {
    if (!pipelineOutputs.webSearch) return null;

    const { ncbi, openAlex, query, cachedResult } = pipelineOutputs.webSearch;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2">
            <span>🔍</span> Web Search Results
            {cachedResult && (
              <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded">CACHED</span>
            )}
          </h4>
          <button
            onClick={() => toggleSection('search')}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {expandedSections.has('search') ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {expandedSections.has('search') && (
          <AnimatePresence>
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3"
            >
              <div className="bg-white rounded p-3">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Search Query:</strong> 
                  <code className="bg-gray-100 px-2 py-1 rounded ml-2">{query}</code>
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {/* NCBI Results */}
                <div className="bg-white rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-gray-700">NCBI PubMed</h5>
                    <span className="text-xs text-gray-500">
                      {ncbi.resultCount} results • {formatDuration(ncbi.duration)}
                    </span>
                  </div>
                  {ncbi.error ? (
                    <p className="text-red-600 text-xs">{ncbi.error}</p>
                  ) : (
                    <div className="space-y-2">
                      {ncbi.topResults?.slice(0, 3).map((result: any, i: number) => (
                        <div key={i} className="text-xs border-l-2 border-blue-300 pl-2">
                          <p className="font-medium text-gray-700">{result.title}</p>
                          {result.pmid && (
                            <p className="text-gray-500">PMID: {result.pmid}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* OpenAlex Results */}
                <div className="bg-white rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-gray-700">OpenAlex</h5>
                    <span className="text-xs text-gray-500">
                      {openAlex.resultCount} results • {formatDuration(openAlex.duration)}
                    </span>
                  </div>
                  {openAlex.error ? (
                    <p className="text-red-600 text-xs">{openAlex.error}</p>
                  ) : (
                    <div className="space-y-2">
                      {openAlex.topResults?.slice(0, 3).map((result: any, i: number) => (
                        <div key={i} className="text-xs border-l-2 border-indigo-300 pl-2">
                          <p className="font-medium text-gray-700">{result.title}</p>
                          {result.doi && (
                            <p className="text-gray-500">DOI: {result.doi}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    );
  };

  // Scoring Details Component
  const ScoringDetails = () => {
    if (!pipelineOutputs.scoring?.performed) return null;

    const { rubric, totalScore, passed } = pipelineOutputs.scoring;
    const maxScore = 25;
    const percentage = (totalScore / maxScore) * 100;

    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-indigo-900 flex items-center gap-2">
            <span>📊</span> Quality Scoring
            <span className={`text-xs px-2 py-0.5 rounded ${
              passed ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'
            }`}>
              {passed ? 'PASSED' : 'FAILED'}
            </span>
          </h4>
          <span className="text-lg font-bold text-indigo-900">
            {totalScore}/{maxScore}
          </span>
        </div>

        <div className="bg-white rounded p-3">
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Overall Score</span>
              <span>{percentage.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5 }}
                className={`h-2 rounded-full ${
                  percentage >= 80 ? 'bg-green-500' :
                  percentage >= 60 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
              />
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(rubric || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          star <= (value as number) ? 'text-yellow-500' : 'text-gray-300'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">
                    {String(value)}/5
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Review Details Component
  const ReviewDetails = () => {
    if (!pipelineOutputs.review?.performed) return null;

    const { feedback, suggestions, qualityIssues, overallAssessment } = pipelineOutputs.review;

    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-green-900 flex items-center gap-2">
            <span>👁️</span> Review Agent Analysis
            {overallAssessment && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                overallAssessment === 'excellent' ? 'bg-green-200 text-green-700' :
                overallAssessment === 'good' ? 'bg-blue-200 text-blue-700' :
                overallAssessment === 'needs-improvement' ? 'bg-yellow-200 text-yellow-700' :
                'bg-red-200 text-red-700'
              }`}>
                {overallAssessment.toUpperCase()}
              </span>
            )}
          </h4>
          <button
            onClick={() => toggleSection('review')}
            className="text-xs text-green-600 hover:text-green-800"
          >
            {expandedSections.has('review') ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {expandedSections.has('review') && (
          <div className="space-y-3">
            {feedback && (feedback?.length || 0) > 0 && (
              <div className="bg-white rounded p-3">
                <h5 className="font-medium text-gray-700 mb-2">Feedback:</h5>
                <ul className="text-sm space-y-1">
                  {feedback.map((item: string, i: number) => (
                    <li key={i} className="text-gray-600 flex items-start gap-2">
                      <span className="text-green-600">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {suggestions && (suggestions?.length || 0) > 0 && (
              <div className="bg-white rounded p-3">
                <h5 className="font-medium text-gray-700 mb-2">Suggestions:</h5>
                <ul className="text-sm space-y-1">
                  {suggestions.map((item: string, i: number) => (
                    <li key={i} className="text-gray-600 flex items-start gap-2">
                      <span className="text-blue-600">💡</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {qualityIssues && (qualityIssues?.length || 0) > 0 && (
              <div className="bg-red-50 rounded p-3 border border-red-200">
                <h5 className="font-medium text-red-700 mb-2">Quality Issues:</h5>
                <ul className="text-sm space-y-1">
                  {qualityIssues.map((item: string, i: number) => (
                    <li key={i} className="text-red-600 flex items-start gap-2">
                      <span>⚠️</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Performance Metrics Component
  const PerformanceMetrics = () => {
    const perf = pipelineOutputs.performance;
    if (!perf) return null;

    return (
      <div className="bg-gray-50 rounded-lg p-4 mt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Performance Metrics</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatDuration(perf.totalDuration)}
            </p>
            <p className="text-xs text-gray-500">Total Time</p>
          </div>
          <div className="bg-white rounded p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{perf.apiCalls}</p>
            <p className="text-xs text-gray-500">API Calls</p>
          </div>
          <div className="bg-white rounded p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{perf.cacheHits}</p>
            <p className="text-xs text-gray-500">Cache Hits</p>
          </div>
        </div>
      </div>
    );
  };

  // Refinements Component
  const RefinementsDetails = () => {
    if (!pipelineOutputs.refinements || (pipelineOutputs.refinements?.length || 0) === 0) return null;

    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
        <h4 className="font-semibold text-orange-900 flex items-center gap-2 mb-3">
          <span>🔄</span> Refinement History
          <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded">
            {pipelineOutputs.refinements?.length || 0} iterations
          </span>
        </h4>

        <div className="space-y-3">
          {pipelineOutputs.refinements.map((refinement, i) => (
            <div key={i} className="bg-white rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <h5 className="font-medium text-gray-700">
                  Iteration {refinement.iteration}
                </h5>
                <span className="text-xs bg-orange-100 px-2 py-1 rounded">
                  Score: {refinement.newScore}/25
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                <strong>Trigger:</strong> {refinement.trigger}
              </p>
              <ul className="text-sm space-y-1">
                {refinement.changes.map((change: string, j: number) => (
                  <li key={j} className="text-gray-600 flex items-start gap-2">
                    <span className="text-orange-600">→</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        {['flow', 'timeline', 'raw'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab 
                ? 'text-indigo-600 border-b-2 border-indigo-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'flow' ? '🔄 Flow' : tab === 'timeline' ? '⏱️ Timeline' : '📄 Raw Data'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'flow' && (
        <>
          <PipelineFlow />
          <WebSearchDetails />
          <ReviewDetails />
          <ScoringDetails />
          <RefinementsDetails />
          <PerformanceMetrics />
        </>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Execution Timeline</h3>
          <div className="space-y-3">
            {/* Timeline items */}
            {pipelineOutputs.generation && (
              <div className="flex gap-3">
                <div className="w-20 text-xs text-gray-500 text-right">
                  {formatDuration(pipelineOutputs.generation.duration)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Generation</div>
                  <div className="text-xs text-gray-600">
                    Model: {pipelineOutputs.generation.model}
                  </div>
                </div>
              </div>
            )}
            {pipelineOutputs.webSearch?.performed && (
              <div className="flex gap-3">
                <div className="w-20 text-xs text-gray-500 text-right">
                  {formatDuration(
                    (pipelineOutputs.webSearch.ncbi.duration || 0) + 
                    (pipelineOutputs.webSearch.openAlex.duration || 0)
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Web Search</div>
                  <div className="text-xs text-gray-600">
                    NCBI & OpenAlex parallel search
                  </div>
                </div>
              </div>
            )}
            {pipelineOutputs.review?.performed && (
              <div className="flex gap-3">
                <div className="w-20 text-xs text-gray-500 text-right">
                  {formatDuration(pipelineOutputs.review.duration)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Review</div>
                  <div className="text-xs text-gray-600">
                    Quality assessment: {pipelineOutputs.review.overallAssessment}
                  </div>
                </div>
              </div>
            )}
            {pipelineOutputs.scoring?.performed && (
              <div className="flex gap-3">
                <div className="w-20 text-xs text-gray-500 text-right">
                  {formatDuration(pipelineOutputs.scoring.duration)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Scoring</div>
                  <div className="text-xs text-gray-600">
                    Score: {pipelineOutputs.scoring.totalScore}/25
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="bg-gray-900 rounded-lg p-4">
          <pre className="text-xs text-green-400 overflow-x-auto">
            {JSON.stringify(pipelineOutputs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}