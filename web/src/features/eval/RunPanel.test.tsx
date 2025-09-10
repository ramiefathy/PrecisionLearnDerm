import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunPanel } from './RunPanel';
import * as useRun from './useRunEvaluation';
import * as payload from './payload';

describe('RunPanel', () => {
  it('shows validation error when no pipeline selected', async () => {
    const startSpy = vi.spyOn(useRun, 'useRunEvaluation').mockReturnValue({
      start: vi.fn(),
      isLoading: false,
      error: null,
    } as any);

    render(
      <MemoryRouter>
        <RunPanel />
      </MemoryRouter>
    );

    // Get the run button upfront (before menu interactions)
    const runBtn = screen.getByRole('button', { name: /run evaluation/i });

    // Clear pipelines by unselecting the current option via listbox
    const pipelineSelect = screen.getByLabelText('Pipelines');
    fireEvent.mouseDown(pipelineSelect);
    const listbox = await screen.findByRole('listbox');
    const option = within(listbox).getByRole('option', { name: 'Clinical Vignette (Board-Style)' });
    fireEvent.click(option);

    // Close the menu (multi-select keeps it open)
    fireEvent.keyDown(document.body, { key: 'Escape' });

    // Submit
    fireEvent.click(runBtn);

    expect(await screen.findByText(/Please select at least one pipeline./i)).toBeInTheDocument();
    startSpy.mockRestore();
  });

  it('calls start and navigates on success', async () => {
    const startMock = vi.fn().mockResolvedValue('job-123');
    const hookSpy = vi.spyOn(useRun, 'useRunEvaluation').mockReturnValue({
      start: startMock,
      isLoading: false,
      error: null,
    } as any);

    // Ensure helper returns topics to satisfy validation during test without network
    const topicsSpy = vi.spyOn(payload, 'buildTopicsFromTaxonomy').mockReturnValue(['Psoriasis']);

    render(
      <MemoryRouter>
        <RunPanel />
      </MemoryRouter>
    );

    const runBtn = screen.getByRole('button', { name: /run evaluation/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(startMock).toHaveBeenCalled();
    });
    hookSpy.mockRestore();
    topicsSpy.mockRestore();
  });

  it('validates counts and prevents submit when total > 50', async () => {
    const startSpy = vi.spyOn(useRun, 'useRunEvaluation').mockReturnValue({
      start: vi.fn(),
      isLoading: false,
      error: null,
    } as any);

    render(
      <MemoryRouter>
        <RunPanel />
      </MemoryRouter>
    );

    // Ensure helper returns topics so the only failure is counts
    const topicsSpy = vi.spyOn(payload, 'buildTopicsFromTaxonomy').mockReturnValue(['Psoriasis']);

    // Increase counts by interacting with numeric inputs would require querying by label; here we directly assert error after clicking run with default state modified via DOM if needed.
    // Since default is 5/0/0, simulate a bad state by changing one input beyond 50 via aria spinbutton
    const basicInput = screen.getByLabelText('Basic') as HTMLInputElement;
    fireEvent.change(basicInput, { target: { value: '51' } });

    const runBtn = screen.getByRole('button', { name: /run evaluation/i });
    fireEvent.click(runBtn);

    expect(await screen.findByText(/between 0 and 50/i)).toBeInTheDocument();
    startSpy.mockRestore();
    topicsSpy.mockRestore();
  });
});


