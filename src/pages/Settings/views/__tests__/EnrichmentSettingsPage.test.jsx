import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EnrichmentSettingsPage from '../EnrichmentSettingsPage';
import { enrichmentAPI } from '../../../../utils/api';

// Mock enrichmentAPI
vi.mock('../../../../utils/api', () => ({
  enrichmentAPI: {
    getRules: vi.fn(),
    saveKeywordRule: vi.fn(),
    deleteKeywordRule: vi.fn(),
    saveGeneralRule: vi.fn(),
  },
}));

describe('EnrichmentSettingsPage with DataTable', () => {
  const mockKeywordRules = [
    {
      _id: 'kw-1',
      keyword: 'urgent sale',
      autoTag: 'Motivated Seller',
      roleType: 'Seller',
      intentImpact: 25,
      isActive: true,
    },
    {
      _id: 'kw-2',
      keyword: 'time pass',
      autoTag: 'Non Serious',
      roleType: 'Buyer',
      intentImpact: -30,
      isActive: false,
    },
  ];

  const mockGeneralRules = [
    {
      type: 'formula',
      config: [
        { label: 'Requirement Depth', weight: 30, key: 'reqDepth' },
        { label: 'Timeline Urgency', weight: 20, key: 'timeline' },
        { label: 'Budget Clarity', weight: 20, key: 'budget' },
        { label: 'Visit Readiness', weight: 20, key: 'visit' },
        { label: 'Response Speed', weight: 10, key: 'response' },
      ],
    },
    {
      type: 'classification',
      config: [
        { label: 'Serious Buyer', min: 80, max: 100, color: '#ef4444', key: 'serious' },
        { label: 'Qualified', min: 60, max: 80, color: '#f59e0b', key: 'qualified' },
        { label: 'Explorer', min: 40, max: 60, color: '#3b82f6', key: 'explorer' },
        { label: 'Low Intent', min: 0, max: 40, color: 'var(--text-muted)', key: 'low' },
      ],
    },
    {
      type: 'margin',
      config: { enabled: true, ageThreshold: 45, priceGapThreshold: 10 },
    },
    {
      type: 'autodispatch',
      config: { enabled: false, threshold: 70, maxProperties: 3, cooldownDays: 3 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    enrichmentAPI.getRules.mockResolvedValue({
      success: true,
      data: {
        keywordRules: mockKeywordRules,
        generalRules: mockGeneralRules,
      },
    });
    enrichmentAPI.saveKeywordRule.mockResolvedValue({ success: true });
    enrichmentAPI.deleteKeywordRule.mockResolvedValue({ success: true });
    enrichmentAPI.saveGeneralRule.mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders loading state initially and then displays page title and tabs', async () => {
    render(<EnrichmentSettingsPage />);

    expect(screen.getByText(/Loading Rules.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Prospecting & Enrichment/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Keyword Detection')).toBeInTheDocument();
    expect(screen.getByText('Intent Formula')).toBeInTheDocument();
    expect(screen.getByText('Classification Engine')).toBeInTheDocument();
    expect(screen.getByText('Margin Detection')).toBeInTheDocument();
    expect(screen.getByText('Auto-Dispatch Policy')).toBeInTheDocument();
  });

  it('renders Keyword Rules inside DataTable with semantic columns and populated rows', async () => {
    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // 5 named column headers + 1 action column header
    expect(screen.getByRole('columnheader', { name: 'Keyword' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Auto Tag' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Role Detect' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Intent Impact' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();

    // Row 1 values
    expect(screen.getByText('"urgent sale"')).toBeInTheDocument();
    expect(screen.getByText('Motivated Seller')).toBeInTheDocument();
    expect(screen.getByText('Seller')).toBeInTheDocument();
    expect(screen.getByText('+25%')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();

    // Row 2 values
    expect(screen.getByText('"time pass"')).toBeInTheDocument();
    expect(screen.getByText('Non Serious')).toBeInTheDocument();
    expect(screen.getByText('Buyer')).toBeInTheDocument();
    expect(screen.getByText('-30%')).toBeInTheDocument();
    expect(screen.getByText('INACTIVE')).toBeInTheDocument();
  });

  it('renders empty message when no keyword rules exist', async () => {
    enrichmentAPI.getRules.mockResolvedValueOnce({
      success: true,
      data: { keywordRules: [], generalRules: [] },
    });

    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('No keyword rules defined yet.')).toBeInTheDocument();
    });
  });

  it('opens modal to create a new keyword and submits form', async () => {
    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ Add Keyword/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Keyword/i }));

    expect(screen.getByRole('heading', { level: 2, name: 'New Keyword Rule' })).toBeInTheDocument();

    // Fill in keyword form
    const keywordInput = screen.getByPlaceholderText('e.g. ROI');
    const tagInput = screen.getByPlaceholderText('e.g. Investor');

    fireEvent.change(keywordInput, { target: { value: 'distress' } });
    fireEvent.change(tagInput, { target: { value: 'Distress Property' } });

    const saveButton = screen.getByRole('button', { name: 'Save Rule' });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(enrichmentAPI.saveKeywordRule).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'distress',
        autoTag: 'Distress Property',
        roleType: 'Buyer',
        intentImpact: 15,
        isActive: true,
      })
    );
  });

  it('opens modal in edit mode with existing values when edit icon is clicked', async () => {
    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByTitle('Edit Rule')).toHaveLength(2);
    });

    const editButtons = screen.getAllByTitle('Edit Rule');
    fireEvent.click(editButtons[0]);

    expect(screen.getByRole('heading', { level: 2, name: 'Edit Keyword Rule' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('urgent sale')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Motivated Seller')).toBeInTheDocument();
  });

  it('prompts confirmation and deletes rule when delete icon is clicked', async () => {
    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByTitle('Delete Rule')).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByTitle('Delete Rule');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this keyword rule?');
    expect(enrichmentAPI.deleteKeywordRule).toHaveBeenCalledWith('kw-1');
  });

  it('handles API fetch failure gracefully and displays error toast', async () => {
    enrichmentAPI.getRules.mockRejectedValueOnce(new Error('Network error'));

    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch enrichment rules')).toBeInTheDocument();
    });
  });

  it('switches between tabs (Formula, Classification, Margin) and renders controls', async () => {
    render(<EnrichmentSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Intent Formula')).toBeInTheDocument();
    });

    // Switch to Formula tab
    fireEvent.click(screen.getByText('Intent Formula'));
    expect(screen.getByText('Intent Index Formula')).toBeInTheDocument();
    expect(screen.getByText('Requirement Depth')).toBeInTheDocument();

    // Switch to Classification tab
    fireEvent.click(screen.getByText('Classification Engine'));
    expect(screen.getByText('Score Thresholds')).toBeInTheDocument();
    expect(screen.getByText(/Serious Buyer/i)).toBeInTheDocument();

    // Switch to Margin tab
    fireEvent.click(screen.getByText('Margin Detection'));
    expect(screen.getByText('Margin Opportunity Engine')).toBeInTheDocument();
    expect(screen.getByText('Inventory Age Threshold')).toBeInTheDocument();
  });
});
