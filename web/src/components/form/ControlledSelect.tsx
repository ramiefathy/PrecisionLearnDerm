import React from 'react';
import { TextField, MenuItem, Chip, Box } from '@mui/material';

interface Option { value: string; label: string; }

interface ControlledSelectProps {
  label: string;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  options: Option[];
  multiple?: boolean;
  placeholder?: string;
  error?: string;
}

export const ControlledSelect: React.FC<ControlledSelectProps> = ({ label, value, onChange, options, multiple = false, placeholder, error }) => {
  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value as any}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v as any);
      }}
      SelectProps={{
        multiple,
        renderValue: (selected) => {
          if (!multiple) return options.find(o => o.value === selected)?.label || '';
          const sel = selected as string[];
          return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {sel.map((val) => (
                <Chip key={val} label={options.find(o => o.value === val)?.label || val} size="small" />
              ))}
            </Box>
          );
        }
      }}
      helperText={error || placeholder}
      error={!!error}
      size="small"
    >
      {options.map(opt => (
        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
      ))}
    </TextField>
  );
};
