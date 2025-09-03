/**
 * Comprehensive Evaluation Dashboard with Real-time Visualizations
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Button,
  IconButton,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit as fsLimit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import AssessmentIcon from '@mui/icons-material/Assessment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { OverviewKPIs } from './OverviewKPIs';
import { PipelineQuadrant } from './PipelineQuadrant';
import { BoardReadinessBars } from './BoardReadinessBars';
import { OutliersFailures } from './OutliersFailures';
import { ScoreDistributions } from './ScoreDistributions';
import { TopicDifficultyHeatmap } from './TopicDifficultyHeatmap';
import { TimelinePanel } from './TimelinePanel';
import { useEvaluationData } from '../../hooks/useEvaluationData';
import type { EvaluationFilters, PipelineAggregate, ScoreSample } from '../../types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  ChartTooltip,
  Legend,
  Filler,
  zoomPlugin
);

interface EvaluationDashboardProps {
  jobId: string;
}

interface TestResult {
  id: string;
  testCase: {
    pipeline: string;
    topic: string;
    difficulty: string;
  };
  success: boolean;
  latency: number;
  quality?: number;
  result?: {
    stem?: string;
    leadIn?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
  };
  normalized?: {
    optionsArray?: string[];
    correctAnswerIndex?: number | null;
    correctAnswerLetter?: string | null;
  };
  aiScores?: {
    overall: number;
    boardReadiness: string;
    clinicalRealism: number;
    medicalAccuracy: number;
    distractorQuality: number;
    cueingAbsence: number;
    strengths: string[];
    weaknesses: string[];
  };
  aiScoresFlat?: {
    overall?: number | null;
    boardReadiness?: string | null;
    clinicalRealism?: number | null;
    medicalAccuracy?: number | null;
    distractorQuality?: number | null;
    cueingAbsence?: number | null;
  };
  detailedScores?: any;
}

interface JobData {
  status: string;
  progress?: {
    completedTests: number;
    totalTests: number;
  };
  results?: {
    overall?: {
      totalTests: number;
      totalSuccesses: number;
      overallSuccessRate: number;
      avgLatency: number;
      avgQuality: number;
    };
    byPipeline?: Record<string, any>;
    byCategory?: Record<string, any>;
  };
}

export const EvaluationDashboard: React.FC<EvaluationDashboardProps> = ({ jobId }) => {
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState<TestResult | null>(null);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  // New: simple filters (phase 1). Advanced saved filters can follow.
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [selectedTopics] = useState<string[]>([]);
  const [selectedDifficulties] = useState<string[]>([]);

  useEffect(() => {
    if (!jobId) return;

    // Listen to job document
    const jobUnsubscribe = onSnapshot(
      doc(db, 'evaluationJobs', jobId),
      (snapshot) => {
        if (snapshot.exists()) {
          setJobData(snapshot.data() as JobData);
        }
      }
    );

    // Listen to test results
    const resultsQuery = query(
      collection(db, 'evaluationJobs', jobId, 'testResults'),
      orderBy('createdAt', 'asc'),
      fsLimit(1000)
    );

    const resultsUnsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const results: TestResult[] = [];
        snapshot.forEach((doc) => {
          results.push({
            id: doc.id,
            ...doc.data()
          } as TestResult);
        });
        setTestResults(results);
        setLoading(false);
      }
    );

    return () => {
      jobUnsubscribe();
      resultsUnsubscribe();
    };
  }, [jobId, refreshTick]);

  // Calculate aggregate metrics
  const calculateMetrics = () => {
    const successfulTests = testResults.filter(r => r.success);
    const avgAIScore = successfulTests.reduce((sum, r) => 
      sum + (r.aiScoresFlat?.overall ?? (r.aiScores as any)?.overall ?? 0), 0) / (successfulTests.length || 1);
    
    const boardReadyCount = successfulTests.filter(r => {
      const br = r.aiScoresFlat?.boardReadiness ?? (r.aiScores as any)?.metadata?.boardReadiness ?? (r.aiScores as any)?.boardReadiness;
      return br === 'ready';
    }).length;
    
    const avgClinicalRealism = successfulTests.reduce((sum, r) => {
      const val = r.aiScoresFlat?.clinicalRealism ?? (r.aiScores as any)?.coreQuality?.clinicalRealism ?? (r.aiScores as any)?.clinicalRealism ?? 0;
      return sum + val;
    }, 0) / (successfulTests.length || 1);
    
    const avgMedicalAccuracy = successfulTests.reduce((sum, r) => {
      const val = r.aiScoresFlat?.medicalAccuracy ?? (r.aiScores as any)?.coreQuality?.medicalAccuracy ?? (r.aiScores as any)?.medicalAccuracy ?? 0;
      return sum + val;
    }, 0) / (successfulTests.length || 1);

    // Calculate rule-based scores averages
    const avgRuleBasedScore = successfulTests.reduce((sum, r) => 
      sum + (r.quality || 0), 0) / (successfulTests.length || 1);
    
    const avgDetailedScore = successfulTests.reduce((sum, r) => 
      sum + (r.detailedScores?.overall || 0), 0) / (successfulTests.length || 1);

    return {
      avgAIScore,
      boardReadyCount,
      avgClinicalRealism,
      avgMedicalAccuracy,
      avgRuleBasedScore,
      avgDetailedScore,
      totalTests: testResults.length,
      successfulTests: successfulTests.length
    };
  };

  const metrics = calculateMetrics();
  // Phase 1: derive aggregates using canonical fields and simple filters
  const filters: EvaluationFilters = {
    pipelines: selectedPipelines,
    topics: selectedTopics,
    difficulties: selectedDifficulties,
  };
  const { samples: aggSamples, aggregates, outliers, failures } = useEvaluationData(jobId, filters);

  const handleViewQuestion = (testResult: TestResult) => {
    setSelectedQuestion(testResult);
    setQuestionDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setQuestionDialogOpen(false);
    setSelectedQuestion(null);
  };

  // Prepare chart data
  const prepareTimeSeriesData = () => {
    const labels = testResults.map((_, idx) => `Test ${idx + 1}`);
    
    return {
      labels,
      datasets: [
        {
          label: 'AI Score (%)',
          data: testResults.map(r => r.aiScoresFlat?.overall ?? r.aiScores?.overall ?? 0),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        },
        {
          label: 'Clinical Realism (%)',
          data: testResults.map(r => r.aiScoresFlat?.clinicalRealism ?? (r.aiScores as any)?.coreQuality?.clinicalRealism ?? (r.aiScores as any)?.clinicalRealism ?? 0),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.1
        },
        {
          label: 'Medical Accuracy (%)',
          data: testResults.map(r => r.aiScoresFlat?.medicalAccuracy ?? (r.aiScores as any)?.coreQuality?.medicalAccuracy ?? (r.aiScores as any)?.medicalAccuracy ?? 0),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.1
        }
      ]
    };
  };

  const preparePipelineComparison = () => {
    const pipelines = [...new Set(testResults.map(r => r.testCase.pipeline))];
    const avgScoresByPipeline = pipelines.map(pipeline => {
      const pipelineTests = testResults.filter(r => r.testCase.pipeline === pipeline);
      return pipelineTests.reduce(
        (sum, r) => sum + (r.aiScoresFlat?.overall ?? (r.aiScores as any)?.overall ?? 0),
        0
      ) / 
             (pipelineTests.length || 1);
    });

    return {
      labels: pipelines,
      datasets: [{
        label: 'Average AI Score by Pipeline',
        data: avgScoresByPipeline,
        backgroundColor: [
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)'
        ],
        borderWidth: 1
      }]
    };
  };

  const prepareRadarData = () => {
    const latestTest = testResults[testResults.length - 1];
    if (!(latestTest?.aiScoresFlat || latestTest?.aiScores)) {
      return {
        labels: ['Clinical Realism', 'Medical Accuracy', 'Distractor Quality', 
                 'Cueing Absence', 'Overall Score', 'Generation Time'],
        datasets: [{
          label: 'No Data',
          data: [0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(200, 200, 200, 0.2)',
          borderColor: 'rgba(200, 200, 200, 1)',
          pointBackgroundColor: 'rgba(200, 200, 200, 1)'
        }]
      };
    }

    // Flatten nested AI scores safely
    const clinicalRealism = latestTest.aiScoresFlat?.clinicalRealism ?? (latestTest.aiScores as any)?.coreQuality?.clinicalRealism ?? (latestTest.aiScores as any)?.clinicalRealism ?? 0;
    const medicalAccuracy = latestTest.aiScoresFlat?.medicalAccuracy ?? (latestTest.aiScores as any)?.coreQuality?.medicalAccuracy ?? (latestTest.aiScores as any)?.medicalAccuracy ?? 0;
    const distractorQuality = latestTest.aiScoresFlat?.distractorQuality ?? (latestTest.aiScores as any)?.technicalQuality?.distractorQuality ?? (latestTest.aiScores as any)?.distractorQuality ?? 0;
    const cueingAbsence = latestTest.aiScoresFlat?.cueingAbsence ?? (latestTest.aiScores as any)?.technicalQuality?.cueingAbsence ?? (latestTest.aiScores as any)?.cueingAbsence ?? 0;
    const overall = latestTest.aiScoresFlat?.overall ?? (latestTest.aiScores as any)?.overall ?? 0;
    
    // Normalize latency to 0-100 scale (30s max, where faster is better)
    const latencyMs = latestTest.latency || 0;
    const latencyScore = Math.max(0, Math.min(100, 100 - (latencyMs / 30000) * 100));

    return {
      labels: ['Clinical Realism', 'Medical Accuracy', 'Distractor Quality', 
               'Cueing Absence', 'Overall Score', 'Generation Time'],
      datasets: [{
        label: 'Latest Question Quality (Streamlined)',
        data: [
          clinicalRealism,
          medicalAccuracy,
          distractorQuality,
          cueingAbsence,
          overall,
          latencyScore
        ],
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(255, 99, 132, 1)'
      }]
    };
  };

  const prepareScoreComparisonData = () => {
    const labels = testResults.map((_, idx) => `Test ${idx + 1}`);
    
    return {
      labels,
      datasets: [
        {
          label: 'AI Score (%)',
          data: testResults.map(r => r.aiScoresFlat?.overall ?? (r.aiScores as any)?.overall ?? 0),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        },
        {
          label: 'Rule-Based Score (%)',
          data: testResults.map(r => r.quality || 0),
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          tension: 0.1
        },
        {
          label: 'Detailed Score (%)',
          data: testResults.map(r => r.detailedScores?.overall || 0),
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          tension: 0.1
        }
      ]
    };
  };

  const prepareBoardReadinessData = () => {
    const readinessCount = {
      ready: 0,
      minor_revision: 0,
      major_revision: 0,
      reject: 0
    };

    testResults.forEach(r => {
      const readiness = r.aiScoresFlat?.boardReadiness ?? (r.aiScores as any)?.metadata?.boardReadiness ?? (r.aiScores as any)?.boardReadiness;
      if (readiness && readiness in readinessCount) {
        readinessCount[readiness as keyof typeof readinessCount]++;
      }
    });

    return {
      labels: ['Ready', 'Minor Revision', 'Major Revision', 'Reject'],
      datasets: [{
        data: Object.values(readinessCount),
        backgroundColor: [
          'rgba(75, 192, 192, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(255, 99, 132, 0.8)'
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(255, 99, 132, 1)'
        ],
        borderWidth: 1
      }]
    };
  };

  const exportResults = () => {
    const data = {
      jobId,
      timestamp: new Date().toISOString(),
      summary: metrics,
      testResults: testResults.map(r => ({
        ...r.testCase,
        success: r.success,
        latency: r.latency,
        aiScore: r.aiScoresFlat?.overall ?? r.aiScores?.overall,
        boardReadiness: r.aiScoresFlat?.boardReadiness ?? (r.aiScores as any)?.boardReadiness,
        clinicalRealism: r.aiScoresFlat?.clinicalRealism ?? (r.aiScores as any)?.clinicalRealism,
        medicalAccuracy: r.aiScoresFlat?.medicalAccuracy ?? (r.aiScores as any)?.medicalAccuracy
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-${jobId}-${Date.now()}.json`;
    a.click();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5">
            <AssessmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Evaluation Dashboard
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip 
              label={jobData?.status || 'Unknown'} 
              color={jobData?.status === 'completed' ? 'success' : 
                     jobData?.status === 'running' ? 'primary' : 'default'}
            />
            <IconButton aria-label="Refresh data" onClick={() => setRefreshTick((t) => t + 1)} size="small">
              <RefreshIcon />
            </IconButton>
            <Button
              startIcon={<DownloadIcon />}
              variant="outlined"
              size="small"
              onClick={exportResults}
            >
              Export
            </Button>
          </Box>
        </Box>
        
        {/* Progress Bar */}
        {jobData?.progress && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">
                Progress: {jobData.progress.completedTests}/{jobData.progress.totalTests} tests
              </Typography>
              <Typography variant="body2">
                {Math.round((jobData.progress.completedTests / jobData.progress.totalTests) * 100)}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={(jobData.progress.completedTests / jobData.progress.totalTests) * 100}
            />
          </Box>
        )}
      </Paper>

      {/* Key Metrics */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Average AI Score
              </Typography>
              <Typography variant="h4" color={metrics.avgAIScore >= 70 ? 'success.main' : 'warning.main'}>
                {Math.round(metrics.avgAIScore)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Board Ready
              </Typography>
              <Typography variant="h4" color="primary">
                {metrics.boardReadyCount}/{metrics.successfulTests}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Clinical Realism
              </Typography>
              <Typography variant="h4">
                {Math.round(metrics.avgClinicalRealism)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Medical Accuracy
              </Typography>
              <Typography variant="h4">
                {Math.round(metrics.avgMedicalAccuracy)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Success Rate
              </Typography>
              <Typography variant="h4" color="success.main">
                {Math.round((metrics.successfulTests / metrics.totalTests) * 100)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Total Tests
              </Typography>
              <Typography variant="h4">
                {metrics.totalTests}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Avg Rule-Based Score
              </Typography>
              <Typography variant="h4" color={metrics.avgRuleBasedScore >= 70 ? 'success.main' : 'warning.main'}>
                {Math.round(metrics.avgRuleBasedScore)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="caption">
                Avg Detailed Score
              </Typography>
              <Typography variant="h4" color={metrics.avgDetailedScore >= 70 ? 'success.main' : 'warning.main'}>
                {Math.round(metrics.avgDetailedScore)}%
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Phase 1: Overview and Insights */}
      <OverviewKPIs overall={aggregates.overall} />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PipelineQuadrant
            data={aggregates.byPipeline as PipelineAggregate[]}
            onSelect={(pl) => setSelectedPipelines(prev => prev.includes(pl) ? prev : [...prev, pl])}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BoardReadinessBars data={aggregates.byPipeline as PipelineAggregate[]} />
        </Grid>
      </Grid>

      <OutliersFailures
        worstAI={outliers.worstAI as ScoreSample[]}
        slowest={outliers.slowest as ScoreSample[]}
        failures={failures as ScoreSample[]}
        onOpen={(s) => {
          const target = testResults.find(tr => tr.id === s.id);
          if (target) {
            handleViewQuestion(target);
          }
        }}
      />

      {/* Tabs for different views */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)}>
          <Tab label="Score Progression" />
          <Tab label="Pipeline Comparison" />
          <Tab label="Quality Radar" />
          <Tab label="Board Readiness" />
          <Tab label="Distributions" />
          <Tab label="Heatmap" />
          <Tab label="Timeline" />
          <Tab label="Detailed Results" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Paper sx={{ p: 3 }}>
        {selectedTab === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>Score Progression</Typography>
            <Box sx={{ height: 400 }}>
              <Line 
                data={prepareTimeSeriesData()} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100
                    }
                  }
                }}
              />
            </Box>

            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>Score Type Comparison</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Comparison of AI scores, rule-based scores, and detailed quality scores
              </Typography>
              <Box sx={{ height: 400 }}>
                <Line 
                  data={prepareScoreComparisonData()} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                          display: true,
                          text: 'Score (%)'
                        }
                      }
                    },
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      }
                    }
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {selectedTab === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>Pipeline Comparison</Typography>
            <Box sx={{ height: 400 }}>
              <Bar 
                data={preparePipelineComparison()} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100
                    }
                  }
                }}
              />
            </Box>
          </Box>
        )}

        {selectedTab === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>Quality Dimensions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              All dimensions scored 0-100. Generation Time: higher score = faster generation (100 = instant, 0 = 30s+)
            </Typography>
            <Box sx={{ height: 400, display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '60%' }}>
                <Radar 
                  data={prepareRadarData()} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      r: {
                        beginAtZero: true,
                        max: 100
                      }
                    }
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {selectedTab === 3 && (
          <Box>
            <Typography variant="h6" gutterBottom>Board Readiness Distribution</Typography>
            <Box sx={{ height: 400, display: 'flex', justifyContent: 'center' }}>
              <Box sx={{ width: '40%' }}>
                <Doughnut 
                  data={prepareBoardReadinessData()} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {selectedTab === 4 && (
          <Box>
            <ScoreDistributions samples={aggSamples} />
          </Box>
        )}

        {selectedTab === 5 && (
          <Box>
            <TopicDifficultyHeatmap cells={aggregates.topicDifficulty} />
          </Box>
        )}

        {selectedTab === 6 && (
          <Box>
            <TimelinePanel
              aiSeries={aggSamples.map(s=> ({ x: s.createdAt, y: s.ai }))}
              latencySeries={aggSamples.map(s=> ({ x: s.createdAt, y: s.latency }))}
            />
          </Box>
        )}

        {selectedTab === 7 && (
          <Box>
            <Typography variant="h6" gutterBottom>Detailed Test Results</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Test #</TableCell>
                    <TableCell>Pipeline</TableCell>
                    <TableCell>Topic</TableCell>
                    <TableCell>Difficulty</TableCell>
                    <TableCell align="center">AI Score</TableCell>
                    <TableCell align="center">Board Ready</TableCell>
                    <TableCell align="center">Clinical</TableCell>
                    <TableCell align="center">Accuracy</TableCell>
                    <TableCell align="center">Time (s)</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {testResults.map((result, idx) => (
                    <TableRow key={result.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{result.testCase.pipeline}</TableCell>
                      <TableCell>{result.testCase.topic}</TableCell>
                      <TableCell>{result.testCase.difficulty}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={`${(result.aiScoresFlat?.overall ?? result.aiScores?.overall ?? 0)}%`}
                          size="small"
                          color={
                            ((result.aiScoresFlat?.overall ?? result.aiScores?.overall ?? 0) as number) >= 70 ? 'success' :
                            ((result.aiScoresFlat?.overall ?? result.aiScores?.overall ?? 0) as number) >= 50 ? 'warning' : 'error'
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={(result.aiScoresFlat?.boardReadiness ?? (result.aiScores as any)?.metadata?.boardReadiness ?? (result.aiScores as any)?.boardReadiness ?? 'N/A')}
                          size="small"
                          variant="outlined"
                          color={
                            (result.aiScoresFlat?.boardReadiness ?? (result.aiScores as any)?.metadata?.boardReadiness ?? (result.aiScores as any)?.boardReadiness) === 'ready' ? 'success' :
                            (result.aiScoresFlat?.boardReadiness ?? (result.aiScores as any)?.metadata?.boardReadiness ?? (result.aiScores as any)?.boardReadiness) === 'minor_revision' ? 'info' :
                            (result.aiScoresFlat?.boardReadiness ?? (result.aiScores as any)?.metadata?.boardReadiness ?? (result.aiScores as any)?.boardReadiness) === 'major_revision' ? 'warning' : 'error'
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        {(result.aiScoresFlat?.clinicalRealism ?? (result.aiScores as any)?.coreQuality?.clinicalRealism ?? (result.aiScores as any)?.clinicalRealism ?? 0)}%
                      </TableCell>
                      <TableCell align="center">
                        {(result.aiScoresFlat?.medicalAccuracy ?? (result.aiScores as any)?.coreQuality?.medicalAccuracy ?? (result.aiScores as any)?.medicalAccuracy ?? 0)}%
                      </TableCell>
                      <TableCell align="center">
                        {(result.latency / 1000).toFixed(1)}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          onClick={() => handleViewQuestion(result)}
                          size="small"
                          disabled={!result.result || !result.result.stem}
                          title={result.result?.stem ? "View Question" : "Question content not available"}
                          aria-label="View question"
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      {/* Summary Alert when Complete */}
      {jobData?.status === 'completed' && jobData?.results?.overall && (
        <Alert severity="success" sx={{ mt: 3 }}>
          <Typography variant="h6">Evaluation Complete!</Typography>
          <Typography variant="body2">
            Successfully evaluated {jobData.results.overall.totalTests} questions across multiple pipelines.
            Average quality score: {Math.round(metrics.avgAIScore)}%.
            {metrics.boardReadyCount} questions are board-ready without revision.
          </Typography>
        </Alert>
      )}

      {/* Question Viewing Dialog */}
      <Dialog
        open={questionDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Generated Question Details
          {selectedQuestion && (
            <Typography variant="subtitle2" color="text.secondary">
              Pipeline: {selectedQuestion.testCase.pipeline} | Topic: {selectedQuestion.testCase.topic} | 
              Difficulty: {selectedQuestion.testCase.difficulty} | 
              AI Score: {selectedQuestion.aiScoresFlat?.overall ?? (selectedQuestion.aiScores as any)?.overall ?? 0}%
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
              {selectedQuestion?.result ? (
                <Box>
              {/* Question Stem */}
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Clinical Vignette:
              </Typography>
              <Typography variant="body1" paragraph sx={{ 
                backgroundColor: 'grey.50', 
                p: 2, 
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'grey.300'
              }}>
                {selectedQuestion.result.stem || 'No question stem available'}
              </Typography>

              {/* Lead-in Question */}
              {selectedQuestion.result.leadIn && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    Question:
                  </Typography>
                  <Typography variant="body1" paragraph sx={{ 
                    fontWeight: 'bold',
                    fontSize: '1.1rem',
                    color: 'primary.main',
                    p: 2,
                    backgroundColor: 'primary.50',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'primary.200'
                  }}>
                    {selectedQuestion.result.leadIn}
                  </Typography>
                </>
              )}

              {/* Options */}
              {(() => {
                const normalized = selectedQuestion.normalized;
                const rawOptions: any = selectedQuestion.result?.options as any;
                const optionsArray: string[] = normalized?.optionsArray && normalized.optionsArray.length > 0
                  ? normalized.optionsArray
                  : Array.isArray(rawOptions)
                    ? rawOptions
                    : rawOptions && typeof rawOptions === 'object'
                      ? ['A','B','C','D','E'].map(k => rawOptions[k]).filter((v: any) => typeof v === 'string' && v.length > 0)
                      : [];
                const correctLetter = normalized?.correctAnswerLetter || (() => {
                  const correct = (selectedQuestion.result as any)?.correctAnswer;
                  return typeof correct === 'number' ? String.fromCharCode(65 + correct) : String(correct || '');
                })();
                return optionsArray.length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom>
                    Answer Options:
                  </Typography>
                  <List dense>
                    {optionsArray.map((option, index) => {
                      const letter = String.fromCharCode(65 + index);
                      const isCorrect = correctLetter && letter === correctLetter;
                      return (
                      <ListItem key={index} sx={{
                        backgroundColor: 
                          isCorrect ? 'success.50' : 'transparent',
                        borderRadius: 1,
                        mb: 0.5
                      }}>
                        <ListItemText
                          primary={`${letter}) ${option}`}
                        />
                        {isCorrect && <Chip label="Correct" color="success" size="small" />}
                      </ListItem>
                      );
                    })}
                  </List>
                </>
                );
              })()}

              {/* Correct Answer */}
              {(() => {
                const normalized = selectedQuestion.normalized;
                const hasCA = (normalized?.correctAnswerLetter != null) || (selectedQuestion.result?.correctAnswer !== undefined && selectedQuestion.result?.correctAnswer !== null);
                return hasCA;
              })() && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    Correct Answer:
                  </Typography>
                  <Typography variant="body1" sx={{ 
                    color: 'success.main',
                    fontWeight: 'bold',
                    fontSize: '1.1rem'
                  }}>
                    {selectedQuestion.normalized?.correctAnswerLetter || (() => {
                      const ca = (selectedQuestion.result as any)?.correctAnswer;
                      return typeof ca === 'number' ? String.fromCharCode(65 + ca) : String(ca);
                    })()}
                  </Typography>
                </>
              )}

              {/* Explanation */}
              {selectedQuestion.result.explanation && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    Clinical Explanation:
                  </Typography>
                  <Typography variant="body1" paragraph sx={{ 
                    backgroundColor: 'info.50', 
                    p: 2, 
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'info.200'
                  }}>
                    {selectedQuestion.result.explanation}
                  </Typography>
                </>
              )}

              {/* AI Scores */}
              {selectedQuestion.aiScores && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    AI Quality Assessment:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <Chip label={`Overall: ${(selectedQuestion.aiScoresFlat?.overall ?? selectedQuestion.aiScores?.overall ?? 0)}%`} color="primary" />
                    <Chip label={`Clinical Realism: ${(selectedQuestion.aiScoresFlat?.clinicalRealism ?? (selectedQuestion.aiScores as any)?.coreQuality?.clinicalRealism ?? (selectedQuestion.aiScores as any)?.clinicalRealism ?? 0)}%`} />
                    <Chip label={`Medical Accuracy: ${(selectedQuestion.aiScoresFlat?.medicalAccuracy ?? (selectedQuestion.aiScores as any)?.coreQuality?.medicalAccuracy ?? (selectedQuestion.aiScores as any)?.medicalAccuracy ?? 0)}%`} />
                    <Chip 
                      label={`Board Ready: ${(selectedQuestion.aiScoresFlat?.boardReadiness ?? (selectedQuestion.aiScores as any)?.metadata?.boardReadiness ?? (selectedQuestion.aiScores as any)?.boardReadiness ?? 'N/A')}`}
                      color={
                        (selectedQuestion.aiScoresFlat?.boardReadiness ?? (selectedQuestion.aiScores as any)?.metadata?.boardReadiness ?? (selectedQuestion.aiScores as any)?.boardReadiness) === 'ready' ? 'success' :
                        (selectedQuestion.aiScoresFlat?.boardReadiness ?? (selectedQuestion.aiScores as any)?.metadata?.boardReadiness ?? (selectedQuestion.aiScores as any)?.boardReadiness) === 'minor_revision' ? 'info' :
                        (selectedQuestion.aiScoresFlat?.boardReadiness ?? (selectedQuestion.aiScores as any)?.metadata?.boardReadiness ?? (selectedQuestion.aiScores as any)?.boardReadiness) === 'major_revision' ? 'warning' : 'default'
                      }
                    />
                  </Box>
                </>
              )}
            </Box>
          ) : (
            <Alert severity="warning">
              Question content is not available. This may happen if the question generation failed 
              or the data was not properly saved during evaluation.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
