/**
 * Admin Pipeline Evaluation Dashboard
 * Displays comprehensive evaluation results for all MCQ generation pipelines
 */

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Tab,
  Tabs
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import { 
  PlayArrow, 
  Assessment, 
  CheckCircle, 
  TrendingUp,
  Timer
} from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

interface PipelineMetrics {
  pipeline: string;
  successRate: number;
  avgLatency: number;
  avgQuality: number;
  totalTests: number;
  successCount: number;
}

interface CategoryMetrics {
  category: string;
  successRate: number;
  avgLatency: number;
  bestPipeline: string;
}

interface EvaluationSummary {
  timestamp: string;
  totalTests: number;
  byPipeline: { [key: string]: PipelineMetrics };
  byCategory: { [key: string]: CategoryMetrics };
  overall: {
    successRate: number;
    avgLatency: number;
    avgQuality: number;
  };
}

export default function AdminPipelineEvaluation() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<EvaluationSummary | null>(null);
  const [, setHistoricalData] = useState<EvaluationSummary[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load latest evaluation on mount
  useEffect(() => {
    loadLatestEvaluation();
    loadHistoricalData();
  }, []);

  const loadLatestEvaluation = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'pipelineEvaluations'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as EvaluationSummary;
          setCurrentSummary(data);
        }
        setLoading(false);
      });

      return unsubscribe;
    } catch (err) {
      console.error('Failed to load evaluation:', err);
      setError('Failed to load evaluation data');
      setLoading(false);
    }
  };

  const loadHistoricalData = async () => {
    try {
      const q = query(
        collection(db, 'pipelineEvaluations'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as EvaluationSummary);
        setHistoricalData(data);
      });

      return unsubscribe;
    } catch (err) {
      console.error('Failed to load historical data:', err);
    }
  };

  const runEvaluation = async () => {
    setRunning(true);
    setError(null);
    
    try {
      const runPipelineEvaluation = httpsCallable(functions, 'runPipelineEvaluation');
      const result = await runPipelineEvaluation();
      
      if (result.data) {
        // Refresh data
        await loadLatestEvaluation();
        setError(null);
      }
    } catch (err: any) {
      console.error('Evaluation failed:', err);
      setError(err.message || 'Failed to run evaluation');
    } finally {
      setRunning(false);
    }
  };

  const formatLatency = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Prepare data for charts
  const prepareChartData = () => {
    if (!currentSummary) return { pipeline: [], category: [], quality: [] };

    const pipelineData = Object.entries(currentSummary.byPipeline).map(([name, metrics]) => ({
      name,
      successRate: metrics.successRate * 100,
      avgLatency: metrics.avgLatency / 1000,
      avgQuality: metrics.avgQuality * 10
    }));

    const categoryData = Object.entries(currentSummary.byCategory).map(([name, metrics]) => ({
      name,
      successRate: metrics.successRate * 100,
      avgLatency: metrics.avgLatency / 1000
    }));

    const qualityData = Object.entries(currentSummary.byPipeline).map(([name, metrics]) => ({
      pipeline: name,
      speed: Math.max(0, 100 - (metrics.avgLatency / 400)),
      quality: metrics.avgQuality * 10,
      reliability: metrics.successRate * 100
    }));

    return { pipeline: pipelineData, category: categoryData, quality: qualityData };
  };

  const chartData = prepareChartData();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Pipeline Evaluation Dashboard
      </Typography>

      {/* Action Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid xs={12} md={6}>
              <Typography variant="body2" color="text.secondary">
                {currentSummary 
                  ? `Last evaluation: ${new Date(currentSummary.timestamp).toLocaleString()}`
                  : 'No evaluation data available'
                }
              </Typography>
            </Grid>
            <Grid xs={12} md={6} sx={{ textAlign: 'right' }}>
              <Button
                variant="contained"
                startIcon={running ? <CircularProgress size={20} /> : <PlayArrow />}
                onClick={runEvaluation}
                disabled={running}
              >
                {running ? 'Running Evaluation...' : 'Run New Evaluation'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      ) : currentSummary ? (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Overall Success Rate
                  </Typography>
                  <Typography variant="h4">
                    {formatPercentage(currentSummary.overall.successRate)}
                  </Typography>
                  <CheckCircle color="success" />
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Average Latency
                  </Typography>
                  <Typography variant="h4">
                    {formatLatency(currentSummary.overall.avgLatency)}
                  </Typography>
                  <Timer color="primary" />
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Total Tests Run
                  </Typography>
                  <Typography variant="h4">
                    {currentSummary.totalTests}
                  </Typography>
                  <Assessment color="info" />
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Pipelines Tested
                  </Typography>
                  <Typography variant="h4">
                    {Object.keys(currentSummary.byPipeline).length}
                  </Typography>
                  <TrendingUp color="secondary" />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabs for different views */}
          <Paper sx={{ mb: 3 }}>
            <Tabs value={selectedTab} onChange={(_e: any, v: number) => setSelectedTab(v)}>
              <Tab label="Pipeline Comparison" />
              <Tab label="Quality Analysis" />
              <Tab label="Category Performance" />
              <Tab label="Detailed Results" />
            </Tabs>
          </Paper>

          {/* Tab Content */}
          {selectedTab === 0 && (
            <Grid container spacing={3}>
              <Grid xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Success Rate by Pipeline
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData.pipeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="successRate" fill="#4caf50" name="Success Rate (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Average Latency by Pipeline
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData.pipeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avgLatency" fill="#2196f3" name="Latency (s)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {selectedTab === 1 && (
            <Grid container spacing={3}>
              <Grid xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Pipeline Quality Metrics
                    </Typography>
                    <ResponsiveContainer width="100%" height={400}>
                      <RadarChart data={chartData.quality}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="pipeline" />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} />
                        <Radar name="Speed" dataKey="speed" stroke="#ff9800" fill="#ff9800" fillOpacity={0.6} />
                        <Radar name="Quality" dataKey="quality" stroke="#4caf50" fill="#4caf50" fillOpacity={0.6} />
                        <Radar name="Reliability" dataKey="reliability" stroke="#2196f3" fill="#2196f3" fillOpacity={0.6} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {selectedTab === 2 && (
            <Grid container spacing={3}>
              <Grid xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Performance by Question Category
                    </Typography>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Category</TableCell>
                            <TableCell align="right">Success Rate</TableCell>
                            <TableCell align="right">Avg Latency</TableCell>
                            <TableCell align="right">Best Pipeline</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(currentSummary.byCategory).map(([category, metrics]) => (
                            <TableRow key={category}>
                              <TableCell>{category}</TableCell>
                              <TableCell align="right">
                                <Chip 
                                  label={formatPercentage(metrics.successRate)}
                                  color={metrics.successRate > 0.8 ? 'success' : 'warning'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell align="right">{formatLatency(metrics.avgLatency)}</TableCell>
                              <TableCell align="right">
                                <Chip label={metrics.bestPipeline} size="small" variant="outlined" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {selectedTab === 3 && (
            <Grid container spacing={3}>
              <Grid xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Detailed Pipeline Results
                    </Typography>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Pipeline</TableCell>
                            <TableCell align="right">Tests Run</TableCell>
                            <TableCell align="right">Successful</TableCell>
                            <TableCell align="right">Success Rate</TableCell>
                            <TableCell align="right">Avg Latency</TableCell>
                            <TableCell align="right">Avg Quality</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(currentSummary.byPipeline).map(([pipeline, metrics]) => (
                            <TableRow key={pipeline}>
                              <TableCell>
                                <Typography variant="subtitle2">{pipeline}</Typography>
                              </TableCell>
                              <TableCell align="right">{metrics.totalTests}</TableCell>
                              <TableCell align="right">{metrics.successCount}</TableCell>
                              <TableCell align="right">
                                <LinearProgress 
                                  variant="determinate" 
                                  value={metrics.successRate * 100}
                                  sx={{ width: 60, display: 'inline-flex' }}
                                />
                                <Typography variant="caption" sx={{ ml: 1 }}>
                                  {formatPercentage(metrics.successRate)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{formatLatency(metrics.avgLatency)}</TableCell>
                              <TableCell align="right">
                                {metrics.avgQuality ? `${metrics.avgQuality}/10` : 'N/A'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              No evaluation data available. Run an evaluation to see results.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
