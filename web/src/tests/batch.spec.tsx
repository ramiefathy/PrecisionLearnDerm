import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchQuizRunner } from '../components/BatchQuizRunner';

vi.mock('../lib/api', () => {
  let counter = 0;
  return {
    api: {
      pe: {
        nextItem: vi.fn().mockImplementation(async () => ({ itemId: `x${counter++}`, preview: { difficulty: 0 } }))
      },
      items: { get: vi.fn().mockResolvedValue({ stem: 'S', leadIn: 'L', options: [{text:'A'},{text:'B'},{text:'C'},{text:'D'}], keyIndex: 0, topicIds: [] }) }
    }
  };
});

describe('BatchQuizRunner', () => {
  it('renders loading then content', async () => {
    render(<BatchQuizRunner/>);
    const items = await screen.findAllByText('S');
    expect(items.length).toBeGreaterThan(0);
  });
});
