import { motion, AnimatePresence } from 'framer-motion';
import { useGenerationProgress } from '../hooks/useGenerationProgress';
import { useState, useEffect } from 'react';

interface GenerationProgressProps {
  sessionId: string | null;
  topic?: string;
  pipeline?: string;
  onComplete?: () => void;
}

export default function GenerationProgress({ sessionId, topic, pipeline, onComplete }: GenerationProgressProps) {
  const { progress, isComplete, error, latestChunk, isStreaming } = useGenerationProgress(sessionId);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => {
    if (isComplete && onComplete) {
      onComplete();
    }
  }, [isComplete, onComplete]);
  
  if (!sessionId || !progress) return null;
  
  const stages = pipeline === 'orchestrated' ? [
    { key: 'initialization', label: 'Initializing', icon: '🚀', color: 'gray' },
    { key: 'context', label: 'Gathering Context', icon: '📚', color: 'purple' },
    { key: 'search', label: 'Searching Literature', icon: '🔍', color: 'blue' },
    { key: 'drafting', label: 'Drafting Question', icon: '✍️', color: 'indigo' },
    { key: 'review', label: 'Reviewing Quality', icon: '👁️', color: 'green' },
    { key: 'scoring', label: 'Scoring', icon: '📊', color: 'yellow' },
    { key: 'refinement', label: 'Refining', icon: '🔄', color: 'orange' },
    { key: 'saving', label: 'Saving', icon: '💾', color: 'pink' }
  ] : [
    { key: 'initialization', label: 'Initializing', icon: '🚀', color: 'gray' },
    { key: 'drafting', label: 'Generating', icon: '✍️', color: 'indigo' },
    { key: 'saving', label: 'Saving', icon: '💾', color: 'pink' }
  ];
  
  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };
  
  const getStageIcon = (status: string) => {
    switch (status) {
      case 'complete': return '✅';
      case 'running': return '⏳';
      case 'error': return '❌';
      case 'skipped': return '⏭️';
      default: return '⭕';
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-xl p-6 border border-gray-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Generating Questions{topic ? ` for: ${topic}` : ''}
          </h3>
          <p className="text-sm text-gray-500">
            {pipeline === 'orchestrated' ? 'Full Pipeline' : 'Simplified Pipeline'}
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-indigo-600">
            {progress.percentComplete}%
          </span>
          {progress.estimatedTimeRemaining && (
            <p className="text-xs text-gray-500">
              ~{formatDuration(progress.estimatedTimeRemaining)} remaining
            </p>
          )}
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="relative mb-6">
        <div className="w-full bg-gray-200 rounded-full h-3">
          <motion.div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full relative"
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentComplete}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {progress.percentComplete > 10 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <span className="text-xs text-white font-medium">
                  {progress.percentComplete}%
                </span>
              </div>
            )}
          </motion.div>
        </div>
      </div>
      
      {/* Stage Indicators */}
      <div className="space-y-2 mb-4">
        {stages.map((stage) => {
          const stageData = progress.stages[stage.key];
          if (!stageData) return null;
          
          const isActive = stageData.status === 'running';
          const isComplete = stageData.status === 'complete';
          
          return (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                isActive ? 'bg-indigo-50 border border-indigo-200' : 
                isComplete ? 'bg-green-50' : 
                'bg-gray-50'
              }`}
            >
              {/* Icon */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
                ${isActive ? 'bg-indigo-200 animate-pulse' : 
                  isComplete ? 'bg-green-200' : 
                  'bg-gray-200'}`}>
                {getStageIcon(stageData.status)}
              </div>
              
              {/* Stage Info */}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${
                    isActive ? 'text-indigo-700' :
                    isComplete ? 'text-green-700' :
                    'text-gray-600'
                  }`}>
                    {stage.label}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {stageData.progress !== undefined && isActive && (
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${stageData.progress}%` }}
                        />
                      </div>
                    )}
                    
                    {stageData.duration && (
                      <span className="text-xs text-gray-500">
                        {formatDuration(stageData.duration)}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Stage Message */}
                {stageData.message && isActive && (
                  <p className="text-xs text-gray-600 mt-1">
                    {stageData.message}
                  </p>
                )}
                
                {/* Stage Details */}
                {stageData.details && isActive && (
                  <div className="text-xs text-gray-500 mt-1 flex gap-3">
                    {Object.entries(stageData.details).slice(0, 3).map(([key, value]) => (
                      <span key={key}>
                        {key}: <strong>{String(value)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      
      {/* Streaming Content Preview */}
      {isStreaming && latestChunk && (
        <div className="mt-4 p-3 bg-gray-900 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-green-400 font-mono">STREAMING</span>
            <span className="text-xs text-green-400 animate-pulse">●</span>
          </div>
          <p className="text-xs text-green-300 font-mono line-clamp-3">
            {latestChunk}
          </p>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"
        >
          <p className="text-sm text-red-700 font-medium">Error: {error}</p>
        </motion.div>
      )}
      
      {/* Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-4 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        {showDetails ? 'Hide' : 'Show'} Technical Details
      </button>
      
      {/* Technical Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 p-3 bg-gray-50 rounded-lg"
          >
            <pre className="text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify(progress, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}