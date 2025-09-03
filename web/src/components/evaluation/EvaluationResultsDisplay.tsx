/**
 * Evaluation Results Display Component
 * Comprehensive display of evaluation results with charts and analysis
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Chip,
  Alert,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Download as DownloadIcon,
  Speed as SpeedIcon,
  CheckCircle as SuccessIcon,
  Star as QualityIcon,
  Error as ErrorIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface EvaluationResults {
  byPipeline: Record<string, PipelineResult>;
  byCategory: Record<string, CategoryResult>;
  overall: OverallMetrics;
  errors: ErrorEntry[];
}

interface PipelineResult {
  pipeline: string;
  successRate: number;
  avgLatency: number;
  avgQuality: number;
  totalTests: number;
  successCount: number;
  failures: ErrorEntry[];
}

interface CategoryResult {
  category: string;
  successRate: number;
  avgLatency: number;
  avgQuality: number;
  testCount: number;
}

interface OverallMetrics {
  totalTests: number;
  totalSuccesses: number;
  overallSuccessRate: number;
  avgLatency: number;
  avgQuality: number;
  totalDuration: number;
}

interface ErrorEntry {
  timestamp: string;
  pipeline: string;
  topic: string;
  difficulty: string;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  context?: {
    attemptNumber?: number;
    partialResult?: any;
  };
}

interface EvaluationResultsDisplayProps {
  results: EvaluationResults;
  jobId: string;
  onNewEvaluation?: () => void;
}

export const EvaluationResultsDisplay: React.FC<EvaluationResultsDisplayProps> = ({
  results,
  jobId,
  onNewEvaluation
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [expandedError, setExpandedError] = useState<number | null>(null);

  // Prepare data for charts
  const pipelineChartData = Object.values(results.byPipeline).map(p => ({
    name: p.pipeline,
    successRate: Math.round(p.successRate * 100),
    avgLatency: Math.round(p.avgLatency),
    avgQuality: parseFloat(p.avgQuality.toFixed(1)),
    tests: p.totalTests
  }));

  const categoryChartData = Object.values(results.byCategory).map(c => ({
    name: c.category,
    successRate: Math.round(c.successRate * 100),
    avgLatency: Math.round(c.avgLatency),
    avgQuality: parseFloat(c.avgQuality.toFixed(1))
  }));

  const successPieData = [
    { name: 'Successful', value: results.overall.totalSuccesses, color: '#4CAF50' },
    { name: 'Failed', value: results.overall.totalTests - results.overall.totalSuccesses, color: '#f44336' }
  ];

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const downloadReport = () => {
    const report = {
      jobId,
      timestamp: new Date().toISOString(),
      results
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-report-${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getBestPipeline = () => {
    let bestPipeline = '';
    let bestScore = -1;
    
    Object.values(results.byPipeline).forEach(p => {
      // Weighted score: 40% success rate, 30% speed, 30% quality
      const speedScore = 1 - (p.avgLatency / 30000); // Normalize to 0-1
      const score = (p.successRate * 0.4) + (speedScore * 0.3) + ((p.avgQuality / 10) * 0.3);
      
      if (score > bestScore) {
        bestScore = score;
        bestPipeline = p.pipeline;
      }
    });
    
    return { pipeline: bestPipeline, score: bestScore };
  };

  const recommendation = getBestPipeline();

  return (
    <Box>
      {/* Header */}
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssessmentIcon />
            Evaluation Results
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadReport}
            >
              Download Report
            </Button>
            {onNewEvaluation && (
              <Button
                variant="contained"
                onClick={onNewEvaluation}
              >
                New Evaluation
              </Button>
            )}
          </Stack>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SuccessIcon color="success" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Success Rate
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {Math.round(results.overall.overallSuccessRate * 100)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {results.overall.totalSuccesses} / {results.overall.totalTests} tests
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SpeedIcon color="primary" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Avg Latency
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {(results.overall.avgLatency / 1000).toFixed(1)}s
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Per question generation
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <QualityIcon color="warning" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Avg Quality
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {results.overall.avgQuality.toFixed(1)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rule-based quality (0–100%)
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ErrorIcon color="error" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Total Errors
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {results.errors.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Across all pipelines
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Recommendation */}
      {recommendation.pipeline && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="subtitle1">
            <strong>Recommendation:</strong> Use <Chip label={recommendation.pipeline} size="small" color="primary" /> pipeline
          </Typography>
          <Typography variant="body2">
            Based on weighted analysis (40% success rate, 30% speed, 30% quality), {recommendation.pipeline} achieved the highest score of {(recommendation.score * 100).toFixed(1)}/100.
          </Typography>
        </Alert>
      )}

      {/* Detailed Results Tabs */}
      <Paper elevation={3} sx={{ p: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Pipeline Comparison" />
          <Tab label="Category Analysis" />
          <Tab label="Error Analysis" />
          <Tab label="Detailed Metrics" />
        </Tabs>

        {/* Pipeline Comparison Tab */}
        {activeTab === 0 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Success Rate by Pipeline</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pipelineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip />
                    <Bar dataKey="successRate" fill="#4CAF50" name="Success Rate (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Performance Metrics</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pipelineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip />
                    <Legend />
                    <Bar dataKey="avgLatency" fill="#2196F3" name="Latency (ms)" />
                    <Bar dataKey="avgQuality" fill="#FF9800" name="Quality (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </Grid>

              <Grid size={12}>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Pipeline</TableCell>
                        <TableCell align="center">Tests</TableCell>
                        <TableCell align="center">Success Rate</TableCell>
                        <TableCell align="center">Avg Latency</TableCell>
                        <TableCell align="center">Avg Quality</TableCell>
                        <TableCell align="center">Failures</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.values(results.byPipeline).map(p => (
                        <TableRow key={p.pipeline}>
                          <TableCell>
                            <Chip label={p.pipeline} size="small" />
                          </TableCell>
                          <TableCell align="center">{p.totalTests}</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={`${Math.round(p.successRate * 100)}%`}
                              color={p.successRate > 0.8 ? 'success' : p.successRate > 0.6 ? 'warning' : 'error'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">{(p.avgLatency / 1000).toFixed(1)}s</TableCell>
                          <TableCell align="center">{p.avgQuality.toFixed(1)}%</TableCell>
                          <TableCell align="center">
                            {p.failures.length > 0 && (
                              <Chip label={p.failures.length} color="error" size="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Category Analysis Tab */}
        {activeTab === 1 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="h6" gutterBottom>Success Rate by Category</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <ChartTooltip />
                    <Bar dataKey="successRate" fill="#4CAF50" name="Success Rate (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="h6" gutterBottom>Quality by Category</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <ChartTooltip />
                    <Bar dataKey="avgQuality" fill="#FF9800" name="Avg Quality" />
                  </BarChart>
                </ResponsiveContainer>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Error Analysis Tab */}
        {activeTab === 2 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Error Details ({results.errors.length} total)
            </Typography>
            
            {results.errors.length === 0 ? (
              <Alert severity="success">No errors encountered during evaluation!</Alert>
            ) : (
              <Box>
                {results.errors.slice(0, 20).map((error, index) => (
                  <Accordion
                    key={index}
                    expanded={expandedError === index}
                    onChange={() => setExpandedError(expandedError === index ? null : index)}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                        <Chip label={error.pipeline} size="small" color="primary" />
                        <Typography variant="body2">{error.topic}</Typography>
                        <Chip label={error.difficulty} size="small" variant="outlined" />
                        <Typography variant="caption" color="error" sx={{ ml: 'auto' }}>
                          {error.error.message.substring(0, 50)}...
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Typography variant="subtitle2">Error Message</Typography>
                          <Alert severity="error" sx={{ mt: 1 }}>
                            <Typography variant="body2">{error.error.message}</Typography>
                          </Alert>
                        </Grid>
                        
                        {error.error.stack && (
                          <Grid item xs={12}>
                            <Typography variant="subtitle2">Stack Trace</Typography>
                            <Paper sx={{ p: 2, bgcolor: 'grey.100', mt: 1 }}>
                              <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                {error.error.stack}
                              </Typography>
                            </Paper>
                          </Grid>
                        )}
                        
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">
                            Timestamp: {new Date(error.timestamp).toLocaleString()}
                          </Typography>
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                ))}
                
                {results.errors.length > 20 && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Showing first 20 errors. Download the full report to see all {results.errors.length} errors.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Detailed Metrics Tab */}
        {activeTab === 3 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Success Distribution</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={successPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {successPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Overall Statistics</Typography>
                <TableContainer>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell>Total Tests</TableCell>
                        <TableCell align="right">{results.overall.totalTests}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Successful Tests</TableCell>
                        <TableCell align="right">{results.overall.totalSuccesses}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Overall Success Rate</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${Math.round(results.overall.overallSuccessRate * 100)}%`}
                            color={results.overall.overallSuccessRate > 0.8 ? 'success' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Average Latency</TableCell>
                        <TableCell align="right">{(results.overall.avgLatency / 1000).toFixed(1)}s</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Average Quality Score</TableCell>
                        <TableCell align="right">{results.overall.avgQuality.toFixed(1)}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Total Duration</TableCell>
                        <TableCell align="right">{formatDuration(results.overall.totalDuration)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
    </Box>
  );
};
