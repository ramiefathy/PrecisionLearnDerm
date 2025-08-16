import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLogsPage from '../pages/AdminLogsPage';
import { getDocs } from 'firebase/firestore';

vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
    getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', async () => {
    const actual = await vi.importActual('firebase/auth');
    return {
        ...actual,
        getAuth: vi.fn(() => ({})),
    };
});

vi.mock('../lib/firebase', async () => {
    const actual = await vi.importActual('../lib/firebase');
    return {
        ...actual,
        db: {},
    };
});

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual,
        getFirestore: vi.fn(() => ({})),
        collection: vi.fn(),
        getDocs: vi.fn(),
        orderBy: vi.fn(),
        query: vi.fn(),
        limit: vi.fn(),
        startAfter: vi.fn(),
    };
});

const mockLogs = [
  { id: '1', at: { toDate: () => new Date('2024-01-01T12:00:00Z') }, level: 'info', message: 'User logged in' },
  { id: '2', at: { toDate: () => new Date('2024-01-01T12:01:00Z') }, level: 'warn', message: 'Deprecated API used' },
  { id: '3', at: { toDate: () => new Date('2024-01-01T12:02:00Z') }, level: 'error', message: 'Failed to fetch data' },
];

describe('AdminLogsPage', () => {
  it('renders logs and allows filtering and searching', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: mockLogs.map(log => ({ id: log.id, data: () => log })),
    });

    render(<AdminLogsPage />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('User logged in')).toBeInTheDocument();
      expect(screen.getByText('Deprecated API used')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch data')).toBeInTheDocument();
    });

    // Filter by level
    const levelSelect = screen.getByRole('combobox');
    await user.selectOptions(levelSelect, 'warn');

    expect(screen.queryByText('User logged in')).not.toBeInTheDocument();
    expect(screen.getByText('Deprecated API used')).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch data')).not.toBeInTheDocument();

    // Search
    const searchInput = screen.getByPlaceholderText('Search logs...');
    await user.clear(searchInput);
    await user.type(searchInput, 'data');

    // reset level filter
    await user.selectOptions(levelSelect, 'all');

    expect(screen.queryByText('User logged in')).not.toBeInTheDocument();
    expect(screen.queryByText('Deprecated API used')).not.toBeInTheDocument();
    expect(screen.getByText('Failed to fetch data')).toBeInTheDocument();
  });
});
