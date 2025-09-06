import { Box, Typography, IconButton, Switch, Stack, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  onRefresh?: () => void;
  autoRefresh?: boolean;
  onToggleAutoRefresh?: (value: boolean) => void;
}

export default function AdminPageHeader({
  title,
  subtitle,
  loading,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh
}: AdminPageHeaderProps) {
  return (
    <Box
      data-testid="admin-page-header"
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        py: 2,
        px: 3,
        position: 'sticky',
        top: 0,
        zIndex: 1
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h5">{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {(onRefresh || onToggleAutoRefresh) && (
          <Stack direction="row" spacing={2} alignItems="center">
            {onToggleAutoRefresh && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">Auto-refresh</Typography>
                <Switch
                  size="small"
                  checked={Boolean(autoRefresh)}
                  onChange={e => onToggleAutoRefresh(e.target.checked)}
                  inputProps={{ 'aria-label': 'auto refresh toggle' }}
                />
              </Stack>
            )}
            {onRefresh && (
              <IconButton onClick={onRefresh} disabled={loading} aria-label="refresh">
                {loading ? <CircularProgress size={24} /> : <RefreshIcon />}
              </IconButton>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

