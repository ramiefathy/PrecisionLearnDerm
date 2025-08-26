import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseStructuredText, StructuredTextDisplay } from './StructuredTextParser';

export interface AgentOutput {
  name: string;
  icon: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime?: number;
  endTime?: number;
  duration?: number;
  streamedChunks: string[];
  fullOutput: string;
  result?: any;
  error?: string;
  model?: string;
  promptPreview?: string;
  phase?: 'searching' | 'drafting' | 'reviewing' | 'scoring' | 'finalizing';
  subAgents?: AgentOutput[];
}

interface AgentOutputViewerProps {
  agent: AgentOutput;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export default function AgentOutputViewer({ agent, isExpanded = true, onToggle }: AgentOutputViewerProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const [showFullOutput, setShowFullOutput] = useState(false);
  
  useEffect(() => {
    setLocalExpanded(isExpanded);
  }, [isExpanded]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'pending': return 'bg-gray-100 border-gray-300';
      case 'running': return 'bg-blue-50 border-blue-400 animate-pulse';
      case 'complete': return 'bg-green-50 border-green-400';
      case 'error': return 'bg-red-50 border-red-400';
    }
  };

  const getStatusIcon = () => {
    switch (agent.status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'complete': return '✅';
      case 'error': return '❌';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatJson = (obj: any) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className={`border-2 rounded-lg overflow-hidden transition-all ${getStatusColor()}`}>
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.icon}</span>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{agent.name}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                {getStatusIcon()}
                <span className="capitalize">{agent.status}</span>
              </span>
              {agent.duration && (
                <span className="text-gray-400">• {formatDuration(agent.duration)}</span>
              )}
              {agent.model && (
                <span className="text-gray-400">• {agent.model}</span>
              )}
            </div>
          </div>
        </div>
        <span className="text-gray-400 text-xl">
          {localExpanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Content */}
      <AnimatePresence>
        {localExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t"
          >
            <div className="p-4 space-y-4 bg-white bg-opacity-50">
              {/* Streaming Output */}
              {agent.streamedChunks && agent.streamedChunks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">
                      {agent.status === 'running' ? '🔴 Live Streaming Output' : '📝 Thought Process'}
                    </h4>
                    {agent.status === 'complete' && (
                      <button
                        onClick={() => setShowFullOutput(!showFullOutput)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showFullOutput ? 'Show Parsed Output' : 'Show Raw Output'}
                      </button>
                    )}
                  </div>
                  
                  {!showFullOutput ? (
                    // Try to parse and display structured content
                    (() => {
                      const fullText = (agent.streamedChunks || []).join('');
                      const parsedContent = parseStructuredText(fullText);
                      
                      // If we can parse it as structured content, show the formatted view
                      if (parsedContent.type !== 'raw') {
                        return (
                          <StructuredTextDisplay 
                            content={parsedContent} 
                            isStreaming={agent.status === 'running'}
                          />
                        );
                      }
                      
                      // Otherwise, show the raw streaming view
                      return (
                        <div className="bg-gray-900 text-green-400 rounded-lg p-3 font-mono text-xs max-h-96 overflow-y-auto">
                          {(agent.streamedChunks || []).map((chunk, idx) => (
                            <div key={idx} className="mb-1">
                              {agent.status === 'running' && idx === (agent.streamedChunks?.length || 0) - 1 && (
                                <span className="inline-block w-2 h-3 bg-green-400 animate-pulse mr-1" />
                              )}
                              <span className="opacity-90">
                                {typeof chunk === 'string' ? chunk : 
                                 typeof chunk === 'object' && chunk !== null && typeof (chunk as any).text === 'string' ? (chunk as any).text :
                                 typeof chunk === 'object' ? JSON.stringify(chunk) : String(chunk)}
                              </span>
                            </div>
                          ))}
                          {agent.status === 'running' && (
                            <span className="inline-block w-2 h-3 bg-green-400 animate-pulse" />
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    // Show raw output when toggled
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {agent.fullOutput || (agent.streamedChunks || []).map(chunk => 
                          typeof chunk === 'string' ? chunk : 
                          typeof chunk === 'object' && chunk !== null && typeof (chunk as any).text === 'string' ? (chunk as any).text :
                          typeof chunk === 'object' ? JSON.stringify(chunk) : String(chunk)
                        ).join('')}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Waiting State */}
              {agent.status === 'pending' && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-3xl mb-2">⏳</div>
                  <p className="text-sm">Waiting for previous agents to complete...</p>
                </div>
              )}

              {/* Error State */}
              {agent.status === 'error' && agent.error && (
                <div className="bg-red-100 border border-red-300 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-red-800 mb-1">Error</h4>
                  <p className="text-sm text-red-700">{agent.error}</p>
                </div>
              )}

              {/* Result */}
              {agent.result && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">📊 Result</h4>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    {typeof agent.result === 'object' ? (
                      <pre className="text-xs font-mono overflow-x-auto">
                        {formatJson(agent.result)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-800">{agent.result}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Prompt Preview */}
              {agent.promptPreview && (
                <details className="cursor-pointer">
                  <summary className="text-xs font-medium text-gray-600 hover:text-gray-800">
                    View Prompt Sent to AI
                  </summary>
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <pre className="text-xs font-mono overflow-x-auto max-h-40">
                      {agent.promptPreview}
                    </pre>
                  </div>
                </details>
              )}

              {/* Timing Information */}
              {agent.startTime && (
                <div className="text-xs text-gray-500 pt-2 border-t">
                  Started: {new Date(agent.startTime).toLocaleTimeString()}
                  {agent.endTime && (
                    <> • Completed: {new Date(agent.endTime).toLocaleTimeString()}</>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}