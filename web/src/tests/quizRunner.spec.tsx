import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuizRunner } from '../components/QuizRunner';

vi.mock('../lib/api', () => ({
  api: {
    pe: {
      getPersonalizedQuestions: vi.fn().mockResolvedValue({ questions: [] }),
      nextItem: vi.fn().mockResolvedValue({
        item: {
          id: 'x1',
          stem: 'S',
          leadIn: 'L',
          options: [{ text: 'A' }, { text: 'B' }],
          keyIndex: 0,
          explanation: 'E',
          topicIds: [],
          difficulty: 0.5,
        }
      }),
      recordAnswer: vi.fn().mockResolvedValue({ success: true }),
      triggerAdaptiveGeneration: vi.fn().mockResolvedValue({ success: true, questionsGenerated: 0 })
    },
    items: {}
  }
}));

vi.mock('../components/TutorDrawer', () => ({ TutorDrawer: () => <div /> }));
vi.mock('../components/QuestionFeedback', () => ({ default: () => null }));
vi.mock('../components/Toast', () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock('../lib/markdown', () => ({ renderSafeMarkdown: (s: string) => s }));
vi.mock('../app/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ activeQuiz: { config: { numQuestions: 1 } } })
}));

vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(), collection: vi.fn() }));
vi.mock('../lib/firebase', () => ({ auth: { currentUser: { getIdToken: vi.fn(), uid: 'u1' } }, db: {} }));

describe('QuizRunner', () => {
  it('renders loading then question', async () => {
    render(
      <MemoryRouter>
        <QuizRunner />
      </MemoryRouter>
    );
    expect(screen.getByText(/Loading your next question/i)).toBeInTheDocument();
    await screen.findByText('S');
  });
});
