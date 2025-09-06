import { vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../lib/firebase';
import type { ReactElement, ReactNode } from 'react';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
}

const authState: AuthState = {
  user: null,
  profile: null,
  loading: false,
  profileLoading: false,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../components/Toast', () => ({
  ToastContainer: () => null,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastContainer } from '../components/Toast';

interface Options {
  route?: string;
  auth?: Partial<AuthState>;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', auth }: Options = {}
): RenderResult {
  Object.assign(authState, auth);
  const theme = createTheme();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <ThemeProvider theme={theme}>
          <ToastContainer />
          {children}
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );

  return render(ui, { wrapper: Wrapper });
}
