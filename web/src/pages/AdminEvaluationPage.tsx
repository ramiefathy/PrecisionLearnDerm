/**
 * Admin Evaluation Page
 * Main page for pipeline evaluation with integrated components
 */

import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Button,
  CircularProgress,
  Chip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { EvaluationConfigForm } from '../components/evaluation/EvaluationConfigForm';
import { EvaluationProgressMonitor } from '../components/evaluation/EvaluationProgressMonitor';
import { EvaluationResultsDisplay } from '../components/evaluation/EvaluationResultsDisplay';
import { LiveEvaluationLogs } from '../components/evaluation/LiveEvaluationLogs';
import { EvaluationDashboard } from '../components/evaluation/EvaluationDashboard';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

type EvaluationStep = 'configure' | 'running' | 'results' | 'history';

interface EvaluationConfig {
  basicCount: number;
  advancedCount: number;
  veryDifficultCount: number;
  pipelines: string[];
  topics: string[];
}

interface EvaluationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results?: any;
  createdAt?: any;
  config?: {
    pipelines: string[];
    topics: string[];
    basicCount: number;
    advancedCount: number;
    veryDifficultCount: number;
  };
}

const AdminEvaluationPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [currentStep, setCurrentStep] = useState<EvaluationStep>('configure');
  const [jobId, setJobId] = useState<string | null>(null);
  const [evaluationResults, setEvaluationResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousJobs, setPreviousJobs] = useState<EvaluationJob[]>([]);
  const [runningJob, setRunningJob] = useState<EvaluationJob | null>(null);

  // Load existing jobs when user is available (route already enforces admin)
  useEffect(() => {
    if (user) {
      loadExistingJobs();
    }
  }, [user]);
  
  const loadExistingJobs = async () => {
    try {
      // Check for running jobs
      const runningQuery = query(
        collection(db, 'evaluationJobs'),
        where('status', 'in', ['pending', 'running']),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const runningSnapshot = await getDocs(runningQuery);
      if (!runningSnapshot.empty) {
        const runningJobData = {
          id: runningSnapshot.docs[0].id,
          ...runningSnapshot.docs[0].data()
        } as EvaluationJob;
        setRunningJob(runningJobData);
        setJobId(runningJobData.id);
        setCurrentStep('running');
      }
      
      // Load previous completed jobs
      const historyQuery = query(
        collection(db, 'evaluationJobs'),
        where('status', 'in', ['completed', 'failed']),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const historySnapshot = await getDocs(historyQuery);
      const jobs = historySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EvaluationJob));
      setPreviousJobs(jobs);
    } catch (error) {
      console.error('Failed to load existing jobs:', error);
    }
  };

  const handleStartEvaluation = async (config: EvaluationConfig) => {
    try {
      setLoading(true);
      setError(null);
      
      // Call Firebase function to start evaluation
      const startPipelineEvaluation = httpsCallable(functions, 'startPipelineEvaluation');
      const result = await startPipelineEvaluation(config);
      
      const data = result.data as any;
      
      if (data.success && data.jobId) {
        setJobId(data.jobId);
        setCurrentStep('running');
        
        // Show estimated time
        if (data.estimatedDuration) {
          console.log(`Evaluation started. Estimated duration: ${data.estimatedDuration} seconds`);
        }
      } else {
        throw new Error(data.message || 'Failed to start evaluation');
      }
    } catch (error: any) {
      console.error('Failed to start evaluation:', error);
      setError(error.message || 'Failed to start evaluation');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluationComplete = async (job: EvaluationJob) => {
    try {
      if (job.status === 'completed' && job.results) {
        setEvaluationResults(job.results);
        setCurrentStep('results');
      } else if (job.status === 'failed') {
        setError('Evaluation failed. Please check the error details and try again.');
        // Optionally fetch full error details
        if (jobId) {
          const jobDoc = await getDoc(doc(db, 'evaluationJobs', jobId));
          if (jobDoc.exists()) {
            const jobData = jobDoc.data();
            console.error('Evaluation failed:', jobData.results?.errors);
          }
        }
      }
    } catch (error) {
      console.error('Failed to process evaluation results:', error);
      setError('Failed to process evaluation results');
    }
  };

  const handleNewEvaluation = () => {
    setCurrentStep('configure');
    setJobId(null);
    setEvaluationResults(null);
    setError(null);
  };

  const handleCancel = () => {
    // If we have results, show them; otherwise go back to config
    if (evaluationResults) {
      setCurrentStep('results');
    } else {
      handleNewEvaluation();
    }
  };

  const getStepIndex = (step: EvaluationStep): number => {
    switch (step) {
      case 'configure':
        return 0;
      case 'running':
        return 1;
      case 'results':
        return 2;
      case 'history':
        return 3;
      default:
        return 0;
    }
  };

  // AdminRoute and ProtectedRoute gate access; no local guard needed

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Pipeline Evaluation System
          </Typography>
          <Box>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/admin')}
              sx={{ mr: 1 }}
            >
              Back to Admin
            </Button>
            {currentStep !== 'configure' && (
              <Button
                startIcon={<RestartAltIcon />}
                onClick={handleNewEvaluation}
                variant="outlined"
              >
                New Evaluation
              </Button>
            )}
          </Box>
        </Box>

        {/* Stepper */}
        <Stepper activeStep={getStepIndex(currentStep)} sx={{ mb: 3 }}>
          <Step>
            <StepLabel>Configure Evaluation</StepLabel>
          </Step>
          <Step>
            <StepLabel>Running Tests</StepLabel>
          </Step>
          <Step>
            <StepLabel>View Results</StepLabel>
          </Step>
        </Stepper>

        {/* Description */}
        {currentStep === 'configure' && (
          <Alert severity="info">
            Configure your pipeline evaluation parameters below. Select the number of questions 
            to generate for each difficulty level, choose which pipelines to test, and specify 
            the topics to use for testing.
          </Alert>
        )}
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Show running job alert if exists */}
      {runningJob && currentStep === 'configure' && (
        <Alert 
          severity="warning" 
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => {
              setJobId(runningJob.id);
              setCurrentStep('running');
            }}>
              View Progress
            </Button>
          }
        >
          An evaluation is currently running. You can view its progress or start a new one.
        </Alert>
      )}

      {/* Previous Evaluations List */}
      {currentStep === 'configure' && previousJobs.length > 0 && (
        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Recent Evaluations
          </Typography>
          <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
            {previousJobs.map((job) => (
              <Box 
                key={job.id}
                sx={{ 
                  p: 2, 
                  mb: 1, 
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
                onClick={() => {
                  if (job.status === 'completed' && job.results) {
                    setJobId(job.id);
                    setEvaluationResults(job.results);
                    setCurrentStep('results');
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2">
                      {job.createdAt ? 
                        new Date((job.createdAt as any)?.toDate ? (job.createdAt as any).toDate() : job.createdAt).toLocaleString() :
                        'Unknown time'
                      }
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {job.config ? 
                        `${job.config.pipelines.join(', ')} • ${job.config.topics.length} topics` :
                        'No configuration data'
                      }
                    </Typography>
                  </Box>
                  <Chip 
                    label={job.status} 
                    size="small"
                    color={job.status === 'completed' ? 'success' : 'error'}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Main Content */}
      {currentStep === 'configure' && (
        <EvaluationConfigForm
          onSubmit={handleStartEvaluation}
          isLoading={loading}
        />
      )}

      {currentStep === 'running' && jobId && (
        <Box>
          {/* Comprehensive Dashboard */}
          <EvaluationDashboard jobId={jobId} />
          
          {/* Live Logs */}
          <Box sx={{ mt: 3 }}>
            <LiveEvaluationLogs jobId={jobId} maxHeight={400} />
          </Box>
          
          {/* Legacy Progress Monitor (optional) */}
          <Box sx={{ mt: 3 }}>
            <EvaluationProgressMonitor
              jobId={jobId}
              onComplete={handleEvaluationComplete}
              onCancel={handleCancel}
            />
          </Box>
        </Box>
      )}

      {currentStep === 'results' && evaluationResults && jobId && (
        <Box>
          {/* Show comprehensive dashboard for results */}
          <EvaluationDashboard jobId={jobId} />
          
          {/* Legacy results display */}
          <Box sx={{ mt: 3 }}>
            <EvaluationResultsDisplay
              results={evaluationResults}
              jobId={jobId}
              onNewEvaluation={handleNewEvaluation}
            />
          </Box>
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      )}
    </Container>
  );
};

export default AdminEvaluationPage;
