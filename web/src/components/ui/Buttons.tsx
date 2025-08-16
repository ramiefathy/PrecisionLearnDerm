import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  variant?: 'gradient' | 'muted';
};

export function GradientButton({ children, loading, className, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
    >
      {loading ? '...' : children}
    </button>
  );
}

export function Button({ variant = 'gradient', ...rest }: Props) {
  if (variant === 'muted') {
    return <MutedButton {...rest} />;
  }
  return <GradientButton {...rest} />;
}

export function MutedButton({ children, loading, className, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`px-4 py-2 rounded-xl border-2 border-gray-300 bg-white font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
    >
      {loading ? '...' : children}
    </button>
  );
} 