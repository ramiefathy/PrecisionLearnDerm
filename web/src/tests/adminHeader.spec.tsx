import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AdminLogsPage from '../pages/AdminLogsPage';
import AdminItemsPage from '../pages/AdminItemsPage';

vi.mock('../lib/api', () => ({
  api: {
    monitoring: { getLogs: vi.fn().mockResolvedValue([]) },
    items: { list: vi.fn().mockResolvedValue({ items: [] }) }
  }
}));

describe('AdminPageHeader', () => {
  it('renders in AdminLogsPage', async () => {
    render(<AdminLogsPage />);
    const header = await screen.findByTestId('admin-page-header');
    expect(header).toMatchSnapshot();
  });

  it('renders in AdminItemsPage', async () => {
    render(<AdminItemsPage />);
    const header = await screen.findByTestId('admin-page-header');
    expect(header).toMatchSnapshot();
  });
});

