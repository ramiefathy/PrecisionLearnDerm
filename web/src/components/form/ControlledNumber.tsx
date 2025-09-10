import React from 'react';
import { TextField } from '@mui/material';

interface ControlledNumberProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
}

export const ControlledNumber: React.FC<ControlledNumberProps> = ({ label, value, onChange, min = 1, max = 50, step = 1, error }) => {
  return (
    <TextField
      type="number"
      fullWidth
      size="small"
      label={label}
      value={value}
      inputProps={{ min, max, step }}
      onChange={(e) => {
        const v = Number(e.target.value);
        onChange(isNaN(v) ? min : v);
      }}
      error={!!error}
      helperText={error || undefined}
    />
  );
};
