import React, { useMemo, useState } from 'react';
import { Box, Paper, Typography, Grid, Button, Checkbox, FormControlLabel, TextField, Alert, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ControlledSelect } from '../../components/form/ControlledSelect';
import { ControlledNumber } from '../../components/form/ControlledNumber';
import { useRunEvaluation, type EvaluationRequest } from './useRunEvaluation';
import MultiSelectTaxonomy from '../../components/MultiSelectTaxonomy';
import { buildEvaluationRequestPayload, buildTopicsFromTaxonomy, validateCounts, type Counts, type TaxonomySelectionEntry } from './payload';

const PIPELINE_OPTIONS = [
  { value: 'boardStyle', label: 'Clinical Vignette (Board-Style)' },
  { value: 'optimizedOrchestrator', label: 'Optimized Orchestrator' },
  { value: 'hybridRouter', label: 'Hybrid Router' }
];

// const DIFFICULTY_OPTIONS = [
//   { value: 'Basic', label: 'Basic' },
//   { value: 'Intermediate', label: 'Intermediate' },
//   { value: 'Advanced', label: 'Advanced' }
// ];

interface RunPanelProps {
  defaultTopics?: string[];
}

export const RunPanel: React.FC<RunPanelProps> = ({ defaultTopics = [] }) => {
  const navigate = useNavigate();
  const { start, isLoading, error } = useRunEvaluation();

  const [pipelines, setPipelines] = useState<string[]>(['boardStyle']);
  const [counts, setCounts] = useState<Counts>({ Basic: 5, Intermediate: 0, Advanced: 0 });
  const totalCount = useMemo(()=> (counts.Basic + counts.Intermediate + counts.Advanced), [counts]);
  const [freeformTopics, setFreeformTopics] = useState<string[]>(defaultTopics);
  const [taxonomyValue, setTaxonomyValue] = useState<TaxonomySelectionEntry[]>([]);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [leadInMix, setLeadInMix] = useState(true);
  const [topicSpread, setTopicSpread] = useState(true);
  const [includeImages, setIncludeImages] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!pipelines.length) return 'Please select at least one pipeline.';
    const v = validateCounts(counts);
    if (!v.ok) return v.errors[0];
    const derivedTopics = buildTopicsFromTaxonomy(taxonomyValue);
    const combinedTopics = Array.from(new Set([...(freeformTopics||[]), ...derivedTopics]));
    if (combinedTopics.length === 0) return 'Select at least one topic (free-text or taxonomy).';
    return null;
  };

  const onSubmit = async () => {
    const v = validate();
    if (v) { setFormError(v); return; }
    setFormError(null);
    const payload = buildEvaluationRequestPayload({
      pipelines,
      counts,
      taxonomyValue,
      seed,
      diversity: { leadInMix, topicSpread, includeImages }
    });
    // Merge in freeform topics if provided
    const derivedTopics = payload.topics || [];
    const combinedTopics = Array.from(new Set([...(freeformTopics||[]), ...derivedTopics]));
    const req: EvaluationRequest = {
      ...payload,
      topics: combinedTopics.length ? combinedTopics : undefined,
    } as EvaluationRequest;
    const jobId = await start(req);
    navigate(`/admin/evaluation-v2?jobId=${encodeURIComponent(jobId)}`);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Configure Evaluation</Typography>
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ControlledSelect
            label="Pipelines"
            value={pipelines}
            onChange={(v) => setPipelines(v as string[])}
            options={PIPELINE_OPTIONS}
            multiple
            placeholder="Select one or more pipelines"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Per-difficulty counts (max 50 total)</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
              <ControlledNumber label="Basic" value={counts.Basic} onChange={(v)=> setCounts(c=>({ ...c, Basic: v }))} min={0} max={50} />
              <ControlledNumber label="Intermediate" value={counts.Intermediate} onChange={(v)=> setCounts(c=>({ ...c, Intermediate: v }))} min={0} max={50} />
              <ControlledNumber label="Advanced" value={counts.Advanced} onChange={(v)=> setCounts(c=>({ ...c, Advanced: v }))} min={0} max={50} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="caption" color={totalCount > 50 ? 'error' : 'text.secondary'}>
                Total: {totalCount}/50
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            label="Topics (comma-separated)"
            value={freeformTopics.join(', ')}
            onChange={(e)=> setFreeformTopics(e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}
            placeholder="e.g., Psoriasis, Atopic dermatitis, Acne vulgaris"
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" gutterBottom>Taxonomy selection</Typography>
          <MultiSelectTaxonomy value={taxonomyValue as any} onChange={(v)=> setTaxonomyValue(v as any)} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            size="small"
            label="Random Seed (optional)"
            value={seed ?? ''}
            onChange={(e)=> setSeed(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="e.g., 42"
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel control={<Checkbox checked={leadInMix} onChange={(e)=>setLeadInMix(e.target.checked)} />} label="Diverse lead-ins" />
            <FormControlLabel control={<Checkbox checked={topicSpread} onChange={(e)=>setTopicSpread(e.target.checked)} />} label="Balanced topic spread" />
            <FormControlLabel control={<Checkbox checked={includeImages} onChange={(e)=>setIncludeImages(e.target.checked)} />} label="Prefer image/histo items" />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Note: Image items require alt text and captions for accessibility.
          </Typography>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button variant="outlined" onClick={()=>{ setPipelines(['boardStyle']); setCounts({ Basic: 5, Intermediate: 0, Advanced: 0 }); setFreeformTopics(defaultTopics); setTaxonomyValue([]); setSeed(undefined); setLeadInMix(true); setTopicSpread(true); setIncludeImages(false); }}>Reset</Button>
            <Button variant="contained" onClick={onSubmit} disabled={isLoading}>{isLoading ? 'Starting...' : 'Run Evaluation'}</Button>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};
