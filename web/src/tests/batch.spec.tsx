import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BatchQuizRunner } from '../components/BatchQuizRunner';

vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
    getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', async () => {
    const actual = await vi.importActual('firebase/auth');
    return {
        ...actual,
        getAuth: vi.fn(() => ({
            onAuthStateChanged: vi.fn(),
        })),
    };
});

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual,
        getFirestore: vi.fn(() => ({})),
        updateDoc: vi.fn(),
        doc: vi.fn(),
        collection: vi.fn(),
        getDocs: vi.fn(),
        orderBy: vi.fn(),
        query: vi.fn(),
        limit: vi.fn(),
        startAfter: vi.fn(),
    };
});

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
