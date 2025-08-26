import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export interface PipelineStage {
  status: 'pending' | 'running' | 'complete' | 'error' | 'skipped' | string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  message?: string;
  progress?: number;
  details?: any;
}

interface PipelineProgressProps {
  stages: Record<string, PipelineStage>;
  currentStage?: string;
  percentComplete?: number;
  estimatedTimeRemaining?: number;
  pipeline?: 'orchestrated' | 'simplified';
  compact?: boolean;
}

export default function PipelineProgress({
  stages,
  currentStage,
  percentComplete = 0,
  estimatedTimeRemaining,
  pipeline = 'orchestrated',
  compact = false
}: PipelineProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const formatDuration = (ms?: number) => {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };
  
  const getStageIcon = (status: string) => {
    switch (status) {
      case 'complete': return '✅';
      case 'running': return '🔄';
      case 'error': return '❌';
      case 'skipped': return '⏭️';
      default: return '⏳';
    }
  };
  
  
  const getProgressBarColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-400';
      case 'running': return 'bg-blue-400';
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-200';
    }
  };
  
  // Define stage order and groupings for orchestrated pipeline
  const orchestratedStageGroups: Array<{
    name: string;
    stages: string[];
    parallel: boolean;
    subStages?: Record<string, string[]>;
  }> = [
    {
      name: 'Initialization',
      stages: ['initialization'],
      parallel: false
    },
    {
      name: 'Context & Research',
      stages: ['context', 'search'],
      parallel: true,
      subStages: {
        search: ['ncbi_search', 'openAlex_search']
      }
    },
    {
      name: 'Question Generation',
      stages: ['drafting'],
      parallel: true,
      subStages: {
        drafting: ['basic_drafting', 'advanced_drafting', 'difficult_drafting']
      }
    },
    {
      name: 'Quality Assurance',
      stages: ['review', 'scoring'],
      parallel: true
    },
    {
      name: 'Refinement',
      stages: ['refinement'],
      parallel: false
    },
    {
      name: 'Finalization',
      stages: ['saving'],
      parallel: false
    }
  ];
  
  const simplifiedStageGroups: Array<{
    name: string;
    stages: string[];
    parallel: boolean;
    subStages?: Record<string, string[]>;
  }> = [
    {
      name: 'Initialization',
      stages: ['initialization'],
      parallel: false
    },
    {
      name: 'Question Generation',
      stages: ['drafting'],
      parallel: false
    },
    {
      name: 'Saving',
      stages: ['saving'],
      parallel: false
    }
  ];
  
  const stageGroups = pipeline === 'orchestrated' ? orchestratedStageGroups : simplifiedStageGroups;
  
  if (compact) {
    // Compact horizontal progress bar
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Pipeline Progress</h3>
          <span className="text-xs text-gray-500">
            {percentComplete}% Complete
          </span>
        </div>
        
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentComplete}%` }}
            className="absolute h-full bg-gradient-to-r from-blue-400 to-purple-500"
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        
        {currentStage && (
          <div className="mt-2 text-xs text-gray-600">
            Current: {currentStage}
            {estimatedTimeRemaining && (
              <span className="ml-2">
                • ETA: {formatDuration(estimatedTimeRemaining)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
  
  // Full pipeline visualization
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {pipeline === 'orchestrated' ? 'Multi-Agent Pipeline' : 'Simple Pipeline'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Processing with {Object.keys(stages).length} stages
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">{percentComplete}%</div>
          <p className="text-xs text-gray-600">Complete</p>
        </div>
      </div>
      
      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentComplete}%` }}
            className="absolute h-full bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        {estimatedTimeRemaining && (
          <div className="mt-2 flex justify-between text-xs text-gray-600">
            <span>Elapsed: {formatDuration(elapsedTime * 1000)}</span>
            <span>ETA: {formatDuration(estimatedTimeRemaining)}</span>
          </div>
        )}
      </div>
      
      {/* Stage Groups */}
      <div className="space-y-4">
        {stageGroups.map((group) => (
          <div key={group.name} className="border-l-2 border-gray-200 pl-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {group.name}
              {group.parallel && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  (Parallel Execution)
                </span>
              )}
            </h3>
            
            <div className={group.parallel ? 'space-y-2' : 'space-y-2'}>
              {group.stages.map(stageId => {
                const stage = stages[stageId];
                if (!stage) return null;
                
                const hasSubStages = group.subStages?.[stageId];
                
                return (
                  <div key={stageId}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getStageIcon(stage.status)}</span>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">
                            {stageId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                          <span className="text-xs text-gray-500">
                            {stage.duration ? formatDuration(stage.duration) : 
                             stage.status === 'running' ? 'Running...' : '--'}
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          {stage.status === 'running' && stage.progress !== undefined ? (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${stage.progress}%` }}
                              className={`h-full ${getProgressBarColor(stage.status)}`}
                              transition={{ duration: 0.3 }}
                            />
                          ) : (
                            <div className={`h-full ${
                              stage.status === 'complete' ? 'w-full' : 'w-0'
                            } ${getProgressBarColor(stage.status)}`} />
                          )}
                        </div>
                        
                        {/* Stage Message */}
                        {stage.message && (
                          <p className="text-xs text-gray-600 mt-1">{stage.message}</p>
                        )}
                        
                        {/* Sub-stages for parallel operations */}
                        {hasSubStages && (
                          <div className="mt-2 ml-4 space-y-1 border-l-2 border-gray-100 pl-3">
                            {group.subStages![stageId].map((subStageId: string) => {
                              const subStage = stages[subStageId];
                              if (!subStage) {
                                // Create placeholder for sub-stages
                                return (
                                  <div key={subStageId} className="flex items-center gap-2">
                                    <span className="text-xs">⏳</span>
                                    <span className="text-xs text-gray-500">
                                      {subStageId.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                );
                              }
                              
                              return (
                                <div key={subStageId} className="flex items-center gap-2">
                                  <span className="text-xs">{getStageIcon(subStage.status)}</span>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-700">
                                        {subStageId.replace(/_/g, ' ')}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {subStage.duration ? formatDuration(subStage.duration) : '--'}
                                      </span>
                                    </div>
                                    {subStage.status === 'running' && (
                                      <div className="mt-0.5 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full w-full bg-blue-400 animate-pulse" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Status Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold text-green-600">
              {Object.values(stages).filter(s => s.status === 'complete').length}
            </div>
            <div className="text-xs text-gray-600">Complete</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-blue-600">
              {Object.values(stages).filter(s => s.status === 'running').length}
            </div>
            <div className="text-xs text-gray-600">Running</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-600">
              {Object.values(stages).filter(s => s.status === 'pending').length}
            </div>
            <div className="text-xs text-gray-600">Pending</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-red-600">
              {Object.values(stages).filter(s => s.status === 'error').length}
            </div>
            <div className="text-xs text-gray-600">Errors</div>
          </div>
        </div>
      </div>
    </div>
  );
}