import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/api', () => ({
  api: {
    admin: {
      getQuestionQueue: vi.fn().mockResolvedValue({
        questions: [{
          id: 'q1',
          draftItem: {
            stem: 'Initial stem',
            leadIn: 'What is the diagnosis?',
            options: [{ text: 'A' }, { text: 'B' }],
            keyIndex: 0,
            explanation: 'Because',
          },
        }],
      }),
      regenerateQuestion: vi.fn().mockResolvedValue({
        success: true,
        regeneratedQuestion: {
          stem: 'Updated stem',
          leadIn: 'Updated lead in',
          options: [{ text: 'C' }, { text: 'D' }],
          correctAnswer: 'A',
          explanation: 'New explanation',
        },
      }),
      reviewQuestion: vi.fn().mockResolvedValue({ shouldRefill: false }),
    },
  },
}));

// Lazy import page after mocks
const AdminQuestionIterationPage = (
  await import('../pages/AdminQuestionIterationPage')
).default;

describe('AdminQuestionIterationPage', () => {
  it('updates question after regeneration', async () => {
    render(<AdminQuestionIterationPage />);
    // initial question
    expect(await screen.findByText('Initial stem')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/enter feedback/i);
    await userEvent.type(input, 'make it harder');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText('Updated stem')).toBeInTheDocument());
  });
});
