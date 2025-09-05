/**
 * Evaluation Progress Monitor Component
 * Real-time monitoring of evaluation job progress
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Alert,
  Button,
  CircularProgress,
  Divider,
  Card,
  CardContent,
  Stack
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  PlayArrow as RunningIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
// LiveEvaluationLogs removed to avoid duplication - now rendered in parent AdminEvaluationV2Page

interface EvaluationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: {
    basicCount: number;
    advancedCount: number;
    veryDifficultCount: number;
    pipelines: string[];
    topics: string[];
  };
  progress: {
    totalTests: number;
    completedTests: number;
    currentPipeline?: string;
    currentTopic?: string;
    currentDifficulty?: string;
  };
  results?: {
    errors?: Array<{
      timestamp: string;
      pipeline: string;
      topic: string;
      difficulty: string;
      error: {
        message: string;
      };
    }>;
  };
  createdAt: any;
  updatedAt: any;
  completedAt?: any;
}

interface EvaluationProgressMonitorProps {
  jobId: string;
  onComplete?: (job: EvaluationJob) => void;
  onCancel?: () => void;
}

export const EvaluationProgressMonitor: React.FC<EvaluationProgressMonitorProps> = ({
  jobId,
  onComplete,
  onCancel
}) => {
  const [job, setJob] = useState<EvaluationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentErrors, setRecentErrors] = useState<Array<any>>([]);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setError('No job ID provided');
      setLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    const setupListener = async () => {
      try {
        const jobRef = doc(db, 'evaluationJobs', jobId);
        
        unsubscribe = onSnapshot(
          jobRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const jobData = {
                id: snapshot.id,
                ...snapshot.data()
              } as EvaluationJob;
              
              setJob(jobData);
              
              // Extract recent errors
              if (jobData.results?.errors) {
                setRecentErrors(jobData.results.errors.slice(-5)); // Last 5 errors
              }
              
              // Check if completed
              if (jobData.status === 'completed' || jobData.status === 'failed') {
                if (onComplete) {
                  onComplete(jobData);
                }
              }
            } else {
              setError('Job not found');
            }
            setLoading(false);
          },
          (error) => {
            console.error('Error listening to job:', error);
            setError('Failed to monitor job progress');
            setLoading(false);
          }
        );
      } catch (error) {
        console.error('Failed to setup listener:', error);
        setError('Failed to setup progress monitoring');
        setLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [jobId, onComplete]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <PendingIcon color="action" />;
      case 'running':
        return <RunningIcon color="primary" />;
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'pending':
        return 'default';
      case 'running':
        return 'primary';
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const calculateProgress = () => {
    if (!job || !job.progress) return 0;
    if (job.progress.totalTests === 0) return 0;
    return (job.progress.completedTests / job.progress.totalTests) * 100;
  };

  const formatDuration = (startTime: any, endTime?: any) => {
    if (!startTime) return 'N/A';
    
    const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
    const end = endTime ? (endTime.toDate ? endTime.toDate() : new Date(endTime)) : new Date();
    
    const durationMs = end.getTime() - start.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading) {
    return (
      <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading evaluation progress...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {error}
        {onCancel && (
          <Button onClick={onCancel} sx={{ ml: 2 }}>
            Go Back
          </Button>
        )}
      </Alert>
    );
  }

  if (!job) {
    return (
      <Alert severity="warning">
        No job data available
        {onCancel && (
          <Button onClick={onCancel} sx={{ ml: 2 }}>
            Go Back
          </Button>
        )}
      </Alert>
    );
  }

  const handleCancelEvaluation = async () => {
    try {
      setCancelling(true);
      const cancelFn = httpsCallable(functions, 'cancelEvaluationJob');
      await cancelFn({ jobId });
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel evaluation');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(job.status)}
            Evaluation Progress
          </Typography>
        
        <Chip
          label={job.status.toUpperCase()}
          color={getStatusColor(job.status)}
          size="small"
          sx={{ mb: 2 }}
        />
      </Box>

      {/* Progress Bar */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2">
            Progress: {job.progress.completedTests} / {job.progress.totalTests} tests
          </Typography>
          <Typography variant="body2">
            {Math.round(calculateProgress())}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={calculateProgress()}
          sx={{ height: 10, borderRadius: 5 }}
        />
      </Box>

      {/* Current Activity */}
      {job.status === 'running' && job.progress.currentPipeline && (
        <Card sx={{ mb: 3, bgcolor: 'primary.50' }}>
          <CardContent>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Currently Testing
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">Pipeline</Typography>
                <Typography variant="body2">{job.progress.currentPipeline}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">Topic</Typography>
                <Typography variant="body2">{job.progress.currentTopic || 'N/A'}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">Difficulty</Typography>
                <Typography variant="body2">{job.progress.currentDifficulty || 'N/A'}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Configuration Summary */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>Configuration</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">Pipelines</Typography>
              {job.config.pipelines.map(pipeline => (
                <Chip key={pipeline} label={pipeline} size="small" variant="outlined" />
              ))}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" color="text.secondary">Questions per Topic</Typography>
            <Typography variant="body2">Basic: {job.config.basicCount}</Typography>
            <Typography variant="body2">Advanced: {job.config.advancedCount}</Typography>
            <Typography variant="body2">Very Difficult: {job.config.veryDifficultCount}</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="caption" color="text.secondary">Duration</Typography>
            <Typography variant="body2">
              {formatDuration(job.createdAt, job.completedAt)}
            </Typography>
          </Grid>
        </Grid>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Topics */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Topics ({job.config.topics.length})</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {job.config.topics.map(topic => (
            <Chip key={topic} label={topic} size="small" />
          ))}
        </Box>
      </Box>

      {/* Recent Errors */}
      {recentErrors.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box>
            <Typography variant="h6" gutterBottom color="error">
              Recent Errors ({recentErrors.length})
            </Typography>
            <List dense>
              {recentErrors.map((error, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={
                      <Typography variant="body2">
                        {error.pipeline} - {error.topic} ({error.difficulty})
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="error">
                        {error.error.message}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </>
      )}

      {/* Actions */}
      {job.status === 'running' && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={handleCancelEvaluation}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel Evaluation'}
          </Button>
        </Box>
      )}

      {(job.status === 'completed' || job.status === 'failed') && (
        <Alert 
          severity={job.status === 'completed' ? 'success' : 'error'}
          sx={{ mt: 3 }}
          action={
            onCancel && (
              <Button color="inherit" size="small" onClick={onCancel}>
                View Results
              </Button>
            )
          }
        >
          Evaluation {job.status === 'completed' ? 'completed successfully' : 'failed'}.
          {job.status === 'completed' && job.progress.completedTests && (
            <> Processed {job.progress.completedTests} tests in {formatDuration(job.createdAt, job.completedAt)}.</>
          )}
        </Alert>
      )}
      </Paper>

      {/* Note: Live Streaming Logs moved to AdminEvaluationV2Page to avoid duplication */}
    </>
  );
};
