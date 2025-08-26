import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PipelineOutputs {
  generation?: {
    method: string;
    model?: string;
    entityUsed?: string;
    completenessScore?: number;
    rawOutput?: any;
    timestamp: string;
    duration?: number;
    prompt?: string;
  };
  validation?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    score: number;
    timestamp: string;
  };
  review?: {
    originalQuestion: any;
    correctedItem?: any;
    changes: string[];
    reviewNotes: string[];
    qualityMetrics?: any;
    timestamp: string;
    duration?: number;
  };
  scoring?: {
    totalScore: number;
    rubric: any;
    needsRewrite: boolean;
    iterations?: any[];
    timestamp: string;
  };
}

interface PipelineViewerProps {
  pipelineOutputs?: PipelineOutputs;
  iterationHistory?: any[];
  scoringData?: any;
}

export default function PipelineViewer({ pipelineOutputs, iterationHistory, scoringData }: PipelineViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const formatJson = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getMethodBadgeColor = (method: string) => {
    if (method?.includes('ai')) return 'bg-purple-100 text-purple-700';
    if (method?.includes('fallback')) return 'bg-orange-100 text-orange-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 text-green-700';
    if (score >= 70) return 'bg-blue-100 text-blue-700';
    if (score >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  if (!pipelineOutputs && !iterationHistory && !scoringData) {
    return (
      <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
        No pipeline data available for this question
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <span className="text-purple-600">🔬</span>
        Generation Pipeline Details
      </h4>

      {/* Generation Phase */}
      {pipelineOutputs?.generation && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('generation')}
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between hover:bg-gradient-to-r hover:from-purple-100 hover:to-indigo-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-purple-600">⚡</span>
              <span className="font-medium text-gray-900">Generation Phase</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getMethodBadgeColor(pipelineOutputs.generation.method)}`}>
                {pipelineOutputs.generation.method}
              </span>
              {pipelineOutputs.generation.model && (
                <span className="text-xs text-gray-500">
                  {pipelineOutputs.generation.model}
                </span>
              )}
              {pipelineOutputs.generation.duration && (
                <span className="text-xs text-gray-400">
                  {formatDuration(pipelineOutputs.generation.duration)}
                </span>
              )}
            </div>
            <span className="text-gray-400">
              {expandedSections.has('generation') ? '▼' : '▶'}
            </span>
          </button>
          
          <AnimatePresence>
            {expandedSections.has('generation') && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-gray-50 space-y-3">
                  {pipelineOutputs.generation.entityUsed && (
                    <div>
                      <span className="text-xs font-medium text-gray-600">Entity Used:</span>
                      <span className="ml-2 text-sm text-gray-800">{pipelineOutputs.generation.entityUsed}</span>
                      {pipelineOutputs.generation.completenessScore && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Score: {pipelineOutputs.generation.completenessScore})
                        </span>
                      )}
                    </div>
                  )}
                  
                  {pipelineOutputs.generation.prompt && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Prompt:</div>
                      <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40 overflow-y-auto">
                        {pipelineOutputs.generation.prompt}
                      </pre>
                    </div>
                  )}
                  
                  {pipelineOutputs.generation.rawOutput && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Raw Output:</div>
                      <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-60 overflow-y-auto">
                        {formatJson(pipelineOutputs.generation.rawOutput)}
                      </pre>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Generated at: {new Date(pipelineOutputs.generation.timestamp).toLocaleString()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Validation Phase */}
      {pipelineOutputs?.validation && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('validation')}
            className="w-full px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 flex items-center justify-between hover:bg-gradient-to-r hover:from-blue-100 hover:to-cyan-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-blue-600">✓</span>
              <span className="font-medium text-gray-900">Validation Phase</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getScoreBadgeColor(pipelineOutputs.validation.score)}`}>
                Score: {pipelineOutputs.validation.score}
              </span>
              {pipelineOutputs.validation.isValid ? (
                <span className="text-xs text-green-600">✓ Valid</span>
              ) : (
                <span className="text-xs text-red-600">✗ Invalid</span>
              )}
            </div>
            <span className="text-gray-400">
              {expandedSections.has('validation') ? '▼' : '▶'}
            </span>
          </button>
          
          <AnimatePresence>
            {expandedSections.has('validation') && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-gray-50 space-y-3">
                  {pipelineOutputs.validation.errors?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-red-600 mb-1">Errors:</div>
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {(pipelineOutputs.validation.errors || []).map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {pipelineOutputs.validation.warnings?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-yellow-600 mb-1">Warnings:</div>
                      <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                        {(pipelineOutputs.validation.warnings || []).map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Validated at: {new Date(pipelineOutputs.validation.timestamp).toLocaleString()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Review Phase */}
      {pipelineOutputs?.review && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('review')}
            className="w-full px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center justify-between hover:bg-gradient-to-r hover:from-green-100 hover:to-emerald-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-green-600">📝</span>
              <span className="font-medium text-gray-900">Review Phase</span>
              {pipelineOutputs.review.changes?.length > 0 && (
                <span className="text-xs text-green-600">
                  {pipelineOutputs.review.changes?.length || 0} changes
                </span>
              )}
              {pipelineOutputs.review.duration && (
                <span className="text-xs text-gray-400">
                  {formatDuration(pipelineOutputs.review.duration)}
                </span>
              )}
            </div>
            <span className="text-gray-400">
              {expandedSections.has('review') ? '▼' : '▶'}
            </span>
          </button>
          
          <AnimatePresence>
            {expandedSections.has('review') && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-gray-50 space-y-3">
                  {pipelineOutputs.review.changes?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Changes Made:</div>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {(pipelineOutputs.review.changes || []).map((change, idx) => (
                          <li key={idx}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {pipelineOutputs.review.reviewNotes?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Review Notes:</div>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {(pipelineOutputs.review.reviewNotes || []).map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {pipelineOutputs.review.qualityMetrics && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Quality Metrics:</div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(pipelineOutputs.review.qualityMetrics).map(([key, value]) => (
                          <div key={key} className="bg-white p-2 rounded border border-gray-200">
                            <span className="text-xs text-gray-600">{key.replace(/_/g, ' ')}:</span>
                            <span className="ml-2 text-sm font-medium text-gray-800">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {pipelineOutputs.review.originalQuestion && (
                    <details className="cursor-pointer">
                      <summary className="text-xs font-medium text-gray-600 hover:text-gray-800">
                        View Original Question (before review)
                      </summary>
                      <pre className="mt-2 text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40 overflow-y-auto">
                        {formatJson(pipelineOutputs.review.originalQuestion)}
                      </pre>
                    </details>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Reviewed at: {new Date(pipelineOutputs.review.timestamp).toLocaleString()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Scoring Phase */}
      {(pipelineOutputs?.scoring || scoringData) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('scoring')}
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 flex items-center justify-between hover:bg-gradient-to-r hover:from-orange-100 hover:to-red-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-orange-600">📊</span>
              <span className="font-medium text-gray-900">Scoring Phase</span>
              {(pipelineOutputs?.scoring?.totalScore || scoringData?.totalScore) && (
                <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  Score: {pipelineOutputs?.scoring?.totalScore || scoringData?.totalScore}/25
                </span>
              )}
              {pipelineOutputs?.scoring?.needsRewrite && (
                <span className="text-xs text-red-600">Needs Rewrite</span>
              )}
            </div>
            <span className="text-gray-400">
              {expandedSections.has('scoring') ? '▼' : '▶'}
            </span>
          </button>
          
          <AnimatePresence>
            {expandedSections.has('scoring') && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-gray-50 space-y-3">
                  {(pipelineOutputs?.scoring?.rubric || scoringData?.rubric) && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 mb-1">Scoring Rubric:</div>
                      <div className="space-y-1">
                        {Object.entries(pipelineOutputs?.scoring?.rubric || scoringData?.rubric || {}).map(([category, score]) => (
                          <div key={category} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                            <span className="text-xs text-gray-600">{category.replace(/_/g, ' ')}:</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full"
                                  style={{ width: `${(Number(score) / 5) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-800">{String(score)}/5</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {pipelineOutputs?.scoring?.timestamp && (
                    <div className="text-xs text-gray-500">
                      Scored at: {new Date(pipelineOutputs.scoring.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Iterations (if available) */}
      {iterationHistory && iterationHistory.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('iterations')}
            className="w-full px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-100 hover:to-purple-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-indigo-600">🔄</span>
              <span className="font-medium text-gray-900">Improvement Iterations</span>
              <span className="text-xs text-indigo-600">
                {iterationHistory?.length || 0} iterations
              </span>
            </div>
            <span className="text-gray-400">
              {expandedSections.has('iterations') ? '▼' : '▶'}
            </span>
          </button>
          
          <AnimatePresence>
            {expandedSections.has('iterations') && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-gray-50 space-y-3">
                  {iterationHistory.map((iteration, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Iteration {idx + 1}</span>
                        {iteration.score && (
                          <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            Score: {iteration.score}/25
                          </span>
                        )}
                      </div>
                      {iteration.improvements && (
                        <div className="text-xs text-gray-600">
                          <div className="font-medium mb-1">Improvements:</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {iteration.improvements.map((imp: string, impIdx: number) => (
                              <li key={impIdx}>{imp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {iteration.feedback && (
                        <div className="mt-2 text-xs text-gray-500 italic">
                          {iteration.feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
