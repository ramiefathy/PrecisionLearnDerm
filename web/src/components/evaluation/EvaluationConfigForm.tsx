/**
 * Evaluation Configuration Form Component
 * Allows admins to configure pipeline evaluation parameters
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Alert,
  Chip,
  Slider
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';

interface EvaluationConfig {
  basicCount: number;
  advancedCount: number;
  veryDifficultCount: number;
  pipelines: string[];
  topics: string[];
}

interface EvaluationConfigFormProps {
  onSubmit: (config: EvaluationConfig) => void;
  isLoading?: boolean;
}

const DEFAULT_TOPICS = [
  'Psoriasis',
  'Melanoma diagnosis',
  'Atopic dermatitis',
  'Drug eruptions',
  'Pemphigus vulgaris',
  'Acne vulgaris',
  'Basal cell carcinoma',
  'Contact dermatitis',
  'Vitiligo',
  'Alopecia areata'
];

const PIPELINE_OPTIONS = [
  { value: 'boardStyle', label: 'Board Style', description: 'Fast, single MCQ generation (8.5s avg)' },
  { value: 'optimizedOrchestrator', label: 'Optimized Orchestrator', description: 'Multi-agent with research (23.7s avg)' },
  { value: 'hybridRouter', label: 'Hybrid Router', description: 'Intelligent routing (14.9s avg)' }
];

export const EvaluationConfigForm: React.FC<EvaluationConfigFormProps> = ({
  onSubmit,
  isLoading = false
}) => {
  const [config, setConfig] = useState<EvaluationConfig>({
    basicCount: 2,
    advancedCount: 2,
    veryDifficultCount: 1,
    pipelines: ['boardStyle', 'optimizedOrchestrator', 'hybridRouter'],
    topics: DEFAULT_TOPICS.slice(0, 5) // Default to first 5 topics
  });

  const [customTopic, setCustomTopic] = useState('');

  const handlePipelineToggle = (pipeline: string) => {
    setConfig(prev => ({
      ...prev,
      pipelines: prev.pipelines.includes(pipeline)
        ? prev.pipelines.filter(p => p !== pipeline)
        : [...prev.pipelines, pipeline]
    }));
  };

  const handleTopicToggle = (topic: string) => {
    setConfig(prev => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter(t => t !== topic)
        : [...prev.topics, topic]
    }));
  };

  const handleAddCustomTopic = () => {
    if (customTopic.trim() && !config.topics.includes(customTopic.trim())) {
      setConfig(prev => ({
        ...prev,
        topics: [...prev.topics, customTopic.trim()]
      }));
      setCustomTopic('');
    }
  };

  const calculateEstimatedTime = () => {
    const totalQuestions = 
      (config.basicCount + config.advancedCount + config.veryDifficultCount) * 
      config.topics.length;
    
    const avgTimePerPipeline = {
      boardStyle: 8.5,
      optimizedOrchestrator: 23.7,
      hybridRouter: 14.9
    };
    
    let totalTime = 0;
    config.pipelines.forEach(pipeline => {
      totalTime += totalQuestions * (avgTimePerPipeline[pipeline as keyof typeof avgTimePerPipeline] || 15);
    });
    
    return Math.ceil(totalTime / 60); // Convert to minutes
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.pipelines.length === 0) {
      alert('Please select at least one pipeline');
      return;
    }
    if (config.topics.length === 0) {
      alert('Please select at least one topic');
      return;
    }
    onSubmit(config);
  };

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <form onSubmit={handleSubmit}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          Evaluation Configuration
        </Typography>

        {/* Difficulty Counts */}
        <Box sx={{ mt: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Questions per Difficulty</Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <FormLabel>Basic Questions</FormLabel>
                <Slider
                  value={config.basicCount}
                  onChange={(_, value) => setConfig(prev => ({ ...prev, basicCount: value as number }))}
                  min={0}
                  max={10}
                  marks
                  valueLabelDisplay="auto"
                  disabled={isLoading}
                />
                <Typography variant="caption" color="text.secondary">
                  Per topic, per pipeline: {config.basicCount}
                </Typography>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <FormLabel>Advanced Questions</FormLabel>
                <Slider
                  value={config.advancedCount}
                  onChange={(_, value) => setConfig(prev => ({ ...prev, advancedCount: value as number }))}
                  min={0}
                  max={10}
                  marks
                  valueLabelDisplay="auto"
                  disabled={isLoading}
                />
                <Typography variant="caption" color="text.secondary">
                  Per topic, per pipeline: {config.advancedCount}
                </Typography>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <FormLabel>Very Difficult Questions</FormLabel>
                <Slider
                  value={config.veryDifficultCount}
                  onChange={(_, value) => setConfig(prev => ({ ...prev, veryDifficultCount: value as number }))}
                  min={0}
                  max={10}
                  marks
                  valueLabelDisplay="auto"
                  disabled={isLoading}
                />
                <Typography variant="caption" color="text.secondary">
                  Per topic, per pipeline: {config.veryDifficultCount}
                </Typography>
              </FormControl>
            </Grid>
          </Grid>
        </Box>

        {/* Pipeline Selection */}
        <Box sx={{ mt: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Pipelines to Test</Typography>
          <FormGroup>
            {PIPELINE_OPTIONS.map(pipeline => (
              <FormControlLabel
                key={pipeline.value}
                control={
                  <Checkbox
                    checked={config.pipelines.includes(pipeline.value)}
                    onChange={() => handlePipelineToggle(pipeline.value)}
                    disabled={isLoading}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">{pipeline.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pipeline.description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </FormGroup>
        </Box>

        {/* Topic Selection */}
        <Box sx={{ mt: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Topics ({config.topics.length} selected)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {DEFAULT_TOPICS.map(topic => (
              <Chip
                key={topic}
                label={topic}
                onClick={() => handleTopicToggle(topic)}
                color={config.topics.includes(topic) ? 'primary' : 'default'}
                variant={config.topics.includes(topic) ? 'filled' : 'outlined'}
                disabled={isLoading}
              />
            ))}
          </Box>
          
          {/* Custom Topic Input */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              size="small"
              placeholder="Add custom topic..."
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTopic()}
              disabled={isLoading}
            />
            <Button
              variant="outlined"
              onClick={handleAddCustomTopic}
              disabled={isLoading || !customTopic.trim()}
            >
              Add
            </Button>
          </Box>
          
          {/* Selected Custom Topics */}
          {config.topics.filter(t => !DEFAULT_TOPICS.includes(t)).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">Custom topics:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {config.topics.filter(t => !DEFAULT_TOPICS.includes(t)).map(topic => (
                  <Chip
                    key={topic}
                    label={topic}
                    size="small"
                    onDelete={() => handleTopicToggle(topic)}
                    color="secondary"
                    disabled={isLoading}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* Summary */}
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Total Tests:</strong>{' '}
            {(config.basicCount + config.advancedCount + config.veryDifficultCount) * 
             config.topics.length * config.pipelines.length} questions
          </Typography>
          <Typography variant="body2">
            <strong>Estimated Time:</strong> ~{calculateEstimatedTime()} minutes
          </Typography>
          <Typography variant="body2">
            <strong>Configuration:</strong>{' '}
            {config.pipelines.length} pipeline(s) × {config.topics.length} topic(s) × {' '}
            {config.basicCount + config.advancedCount + config.veryDifficultCount} questions per topic
          </Typography>
        </Alert>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          startIcon={<PlayArrowIcon />}
          disabled={isLoading || config.pipelines.length === 0 || config.topics.length === 0}
        >
          {isLoading ? 'Starting Evaluation...' : 'Start Evaluation'}
        </Button>
      </form>
    </Paper>
  );
};
