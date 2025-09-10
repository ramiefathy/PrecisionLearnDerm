import { Container, Box, Typography } from '@mui/material';
import { RunPanel } from './RunPanel';

export default function EvaluationPage() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>Run Pipeline Evaluation</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure pipelines, difficulty, and topics. Results will stream live with dashboards and logs.
        </Typography>
      </Box>
      <RunPanel />
    </Container>
  );
}
