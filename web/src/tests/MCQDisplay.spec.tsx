import { render, screen } from '@testing-library/react';
import MCQDisplay, { MCQData, MCQBatchDisplay } from '../components/MCQDisplay';

describe('MCQDisplay', () => {
  it('renders text from nested option object', () => {
    const question: MCQData = {
      stem: 'stem',
      options: {
        A: { text: { text: 'Nested A' } },
        B: { text: 'B' },
        C: { text: 'C' },
        D: { text: 'D' },
      },
      correctAnswer: 'A',
      explanation: 'exp',
    };
    render(<MCQDisplay question={question} />);
    expect(screen.getByText('Nested A')).toBeInTheDocument();
  });
});

describe('MCQBatchDisplay', () => {
  it('shows message when questions missing', () => {
    render(<MCQBatchDisplay topic="Derm" />);
    expect(
      screen.getByText(/No questions available to display/i)
    ).toBeInTheDocument();
  });

  it('defaults active tab to available question', () => {
    const questions = {
      Advanced: {
        stem: 'Only question',
        options: {
          A: { text: 'Option A' },
          B: { text: 'Option B' },
          C: { text: 'Option C' },
          D: { text: 'Option D' },
        },
        correctAnswer: 'A',
        explanation: 'exp',
      },
    };
    render(<MCQBatchDisplay topic="Derm" questions={questions} />);
    expect(screen.getByText('Only question')).toBeInTheDocument();
  });
});
