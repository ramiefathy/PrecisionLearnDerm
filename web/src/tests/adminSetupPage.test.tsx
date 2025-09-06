import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../lib/api', () => {
  const listAdmins = vi.fn();
  listAdmins
    .mockImplementationOnce(() =>
      Promise.resolve({
        success: true,
        data: {
          admins: [
            {
              uid: '1',
              email: 'admin@example.com',
              adminGrantedAt: new Date('2024-01-01'),
              adminGrantedBy: 'system',
            },
          ],
        },
      })
    )
    .mockImplementationOnce(() =>
      Promise.resolve({
        success: true,
        data: {
          admins: [
            {
              uid: '1',
              email: 'admin@example.com',
              adminGrantedAt: new Date('2024-01-01'),
              adminGrantedBy: 'system',
            },
          ],
        },
      })
    )
    .mockImplementationOnce(() => Promise.reject(new Error('Network error')));

  return {
    api: {
      admin: {
        listAdmins,
        getQuestionQueue: vi.fn().mockResolvedValue({ questions: [] }),
        getQuestionBankStats: vi.fn().mockResolvedValue({ totalQuestions: 0, averageQuality: 0 }),
        grantAdminRole: vi.fn(),
        revokeAdminRole: vi.fn(),
      },
      util: { seedDatabase: vi.fn() },
    },
  };
});

import AdminSetupPage from '../pages/AdminSetupPage';
import { toast } from '../components/Toast';

describe('AdminSetupPage admin user loading', () => {
  it('shows error toast and retains existing admins on load failure', async () => {
    render(
      <MemoryRouter>
        <AdminSetupPage />
      </MemoryRouter>
    );

    await screen.findByText('admin@example.com', undefined, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });
});
