/**
 * Live Evaluation Logs Component
 * Shows real-time streaming output from evaluation process
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
  Alert,
  TextField
} from '@mui/material';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  limit,
  type QuerySnapshot,
  type DocumentData
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

interface LogEntry {
  id: string;
  type: 'test_start' | 'test_complete' | 'test_error' | 'generation_progress' | 'evaluation_complete';
  timestamp: string;
  testIndex?: number;
  pipeline?: string;
  topic?: string;
  difficulty?: string;
  message: string;
  stage?: string;
  details?: any;
  success?: boolean;
  latency?: number;
  quality?: number;
  detailedScores?: {
    overall: number;
    boardStyle: number;
    accuracy: number;
    detail: number;
    distractors: number;
    boardNotes: string;
  };
  aiScores?: {
    overall: number;
    boardReady: string;
    clinicalRealism: number;
    medicalAccuracy: number;
    distractorQuality: number;
    cueingAbsence: number;
    strengths: string[];
    weaknesses: string[];
  };
  error?: string;
  overall?: any;
}

interface LiveEvaluationLogsProps {
  jobId: string;
  maxHeight?: number;
}

export const LiveEvaluationLogs: React.FC<LiveEvaluationLogsProps> = ({
  jobId,
  maxHeight = 600
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setLoading(true);
    
    // Set up real-time listener for live logs
    const logsQuery = query(
      collection(db, 'evaluationJobs', jobId, 'liveLogs'),
      orderBy('createdAt', 'asc'),
      limit(500) // Limit to last 500 logs
    );

    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const newLogs: LogEntry[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          newLogs.push({
            id: doc.id,
            ...data
          } as LogEntry);
        });

        setLogs(newLogs);
        setLoading(false);

        // Auto-scroll to bottom if enabled
        if (autoScroll && logsEndRef.current) {
          logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      },
      (error) => {
        console.error('Error listening to live logs:', error);
        setLoading(false);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [jobId, autoScroll]);

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'test_complete':
        return <CheckCircleIcon color="success" fontSize="small" />;
      case 'test_error':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'test_start':
        return <PlayArrowIcon color="primary" fontSize="small" />;
      case 'evaluation_complete':
        return <CheckCircleIcon color="success" fontSize="small" />;
      default:
        return <InfoIcon color="action" fontSize="small" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const filteredLogs = logs.filter(log => {
    // Filter by type
    if (filterType !== 'all' && log.type !== filterType) {
      return false;
    }

    // Filter by search text
    if (filter) {
      const searchText = filter.toLowerCase();
      return (
        log.message?.toLowerCase().includes(searchText) ||
        log.pipeline?.toLowerCase().includes(searchText) ||
        log.topic?.toLowerCase().includes(searchText) ||
        log.stage?.toLowerCase().includes(searchText)
      );
    }

    return true;
  });

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 2 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">
            Live Evaluation Logs
          </Typography>
          <Chip 
            label={`${filteredLogs.length} logs`} 
            size="small" 
            color="primary"
            variant="outlined"
          />
          {loading && <CircularProgress size={20} />}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}>
            <IconButton 
              size="small"
              onClick={() => setAutoScroll(!autoScroll)}
              color={autoScroll ? 'primary' : 'default'}
              aria-label={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Clear logs">
            <IconButton size="small" onClick={clearLogs} aria-label="Clear logs">
              <ClearIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
            <IconButton 
              size="small"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse logs' : 'Expand logs'}
            >
              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Filters */}
      <Collapse in={isExpanded}>
        <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <FilterListIcon fontSize="small" color="action" />
          
          <TextField
            size="small"
            placeholder="Search logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{ flexGrow: 0.5 }}
          />

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label="All"
              size="small"
              onClick={() => setFilterType('all')}
              color={filterType === 'all' ? 'primary' : 'default'}
              variant={filterType === 'all' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Tests"
              size="small"
              onClick={() => setFilterType('test_start')}
              color={filterType === 'test_start' ? 'primary' : 'default'}
              variant={filterType === 'test_start' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Progress"
              size="small"
              onClick={() => setFilterType('generation_progress')}
              color={filterType === 'generation_progress' ? 'info' : 'default'}
              variant={filterType === 'generation_progress' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Errors"
              size="small"
              onClick={() => setFilterType('test_error')}
              color={filterType === 'test_error' ? 'error' : 'default'}
              variant={filterType === 'test_error' ? 'filled' : 'outlined'}
            />
          </Box>
        </Box>

        {/* Logs List */}
        <Box 
          sx={{ 
            maxHeight: maxHeight,
            overflowY: 'auto',
            bgcolor: 'background.default',
            borderRadius: 1,
            p: 1
          }}
        >
          {filteredLogs.length === 0 ? (
            <Alert severity="info" sx={{ m: 2 }}>
              No logs yet. Waiting for evaluation to start...
            </Alert>
          ) : (
            <List dense>
              {filteredLogs.map((log, index) => (
                <ListItem 
                  key={log.id || index}
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getLogIcon(log.type)}
                        <Typography 
                          variant="body2" 
                          component="span"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          [{formatTimestamp(log.timestamp)}]
                        </Typography>
                        {log.pipeline && (
                          <Chip 
                            label={log.pipeline} 
                            size="small" 
                            variant="outlined"
                            color="primary"
                          />
                        )}
                        {log.stage && (
                          <Chip 
                            label={log.stage} 
                            size="small" 
                            variant="outlined"
                            color="info"
                          />
                        )}
                        {log.latency && (
                          <Chip 
                            label={`${(log.latency / 1000).toFixed(1)}s`} 
                            size="small" 
                            variant="outlined"
                            color="default"
                          />
                        )}
                        {log.quality && (
                          <Chip 
                            label={`Q: ${log.quality}/10`} 
                            size="small" 
                            variant="outlined"
                            color={log.quality >= 7 ? 'success' : 'warning'}
                          />
                        )}
                        {log.aiScores && (
                          <>
                            <Chip 
                              label={`AI: ${log.aiScores.overall}%`} 
                              size="small" 
                              variant="filled"
                              color={log.aiScores.overall >= 70 ? 'success' : log.aiScores.overall >= 50 ? 'warning' : 'error'}
                            />
                            <Chip 
                              label={log.aiScores.boardReady} 
                              size="small" 
                              variant="outlined"
                              color={
                                log.aiScores.boardReady === 'ready' ? 'success' : 
                                log.aiScores.boardReady === 'minor_revision' ? 'info' :
                                log.aiScores.boardReady === 'major_revision' ? 'warning' : 'error'
                              }
                            />
                          </>
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography 
                          variant="body2" 
                          component="div"
                          color={log.type === 'test_error' ? 'error' : 'text.primary'}
                        >
                          {log.message}
                        </Typography>
                        {log.aiScores && (
                          <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                            <Typography variant="caption" component="div" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                              AI Board-Style Evaluation:
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                              <Chip label={`Clinical: ${log.aiScores?.clinicalRealism ?? 0}%`} size="small" />
                              <Chip label={`Accuracy: ${log.aiScores?.medicalAccuracy ?? 0}%`} size="small" />
                              <Chip label={`Distractors: ${log.aiScores?.distractorQuality ?? 0}%`} size="small" />
                              <Chip label={`Cueing: ${log.aiScores?.cueingAbsence ?? 0}%`} size="small" />
                            </Box>
                            {log.aiScores.strengths && log.aiScores.strengths.length > 0 && (
                              <Typography variant="caption" component="div" sx={{ color: 'success.main' }}>
                                ✓ {log.aiScores.strengths.join(' • ')}
                              </Typography>
                            )}
                            {log.aiScores.weaknesses && log.aiScores.weaknesses.length > 0 && (
                              <Typography variant="caption" component="div" sx={{ color: 'warning.main' }}>
                                ⚠ {log.aiScores.weaknesses.join(' • ')}
                              </Typography>
                            )}
                          </Box>
                        )}
                        {log.details && (
                          <Typography 
                            variant="caption" 
                            component="div"
                            sx={{ 
                              mt: 0.5,
                              fontFamily: 'monospace',
                              color: 'text.secondary',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}
                          >
                            {typeof log.details === 'object' 
                              ? JSON.stringify(log.details, null, 2)
                              : log.details}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
          <div ref={logsEndRef} />
        </Box>
      </Collapse>
    </Paper>
  );
};
