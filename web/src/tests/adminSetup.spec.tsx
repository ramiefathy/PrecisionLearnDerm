import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './utils';
import AdminSetupPage from '../pages/AdminSetupPage';

const apiMocks = vi.hoisted(() => ({
  revokeAdminRole: vi.fn().mockResolvedValue({ success: true }),
  listAdmins: vi.fn().mockResolvedValue({
    success: true,
    data: {
      admins: [
        {
          uid: '1',
          email: 'user@example.com',
          adminGrantedAt: null,
          adminGrantedBy: 'system',
        },
      ],
    },
  }),
  getQuestionQueue: vi.fn().mockResolvedValue({ questions: [] }),
  getQuestionBankStats: vi.fn().mockResolvedValue({ totalQuestions: 0, averageQuality: 0 }),
}));

vi.mock('../lib/api', () => ({
  api: {
    admin: {
      listAdmins: apiMocks.listAdmins,
      revokeAdminRole: apiMocks.revokeAdminRole,
      getQuestionQueue: apiMocks.getQuestionQueue,
      getQuestionBankStats: apiMocks.getQuestionBankStats,
    },
  },
}));

describe('AdminSetupPage revoke admin dialog', () => {
  it('confirms revocation with Enter', async () => {
    renderWithProviders(<AdminSetupPage />);
    const revokeBtn = await screen.findByRole('button', { name: /revoke/i });
    revokeBtn.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Enter}');
    expect(apiMocks.revokeAdminRole).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('cancels revocation with Escape', async () => {
    renderWithProviders(<AdminSetupPage />);
    const revokeBtn = await screen.findByRole('button', { name: /revoke/i });
    revokeBtn.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiMocks.revokeAdminRole).not.toHaveBeenCalled();
  });
});
