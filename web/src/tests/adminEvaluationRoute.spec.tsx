import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import AdminEvaluationV2Page from '../pages/AdminEvaluationV2Page';


vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: '1', email: 'admin@example.com' },
    profile: { role: 'admin', isAdmin: true },
    loading: false,
    profileLoading: false,
  }),
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

vi.mock('../lib/firebase', () => ({
  functions: {},
  db: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: { success: true, jobId: '1' } }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
}));

describe('Admin evaluation v2 route', () => {
  it('renders evaluation dashboard for admin user', { timeout: 20000 }, async () => {
    render(
      <MemoryRouter>
        <AdminEvaluationV2Page />
      </MemoryRouter>
    );

    // Poll for the <h1> to appear; retry up to 10 s
    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: /Pipeline Evaluation System/i,
          })
        ).toBeInTheDocument(),
      { timeout: 10000 }
    );
  });
});
