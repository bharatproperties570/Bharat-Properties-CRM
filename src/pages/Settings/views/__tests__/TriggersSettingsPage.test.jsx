import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TriggersSettingsPage from '../TriggersSettingsPage';

// Shared mock state
let mockTriggers = [];
let mockExecutionLogs = [];
let mockStats = { totalFired: 20, successCount: 16 };
const mockToggleTrigger = vi.fn();
const mockDeleteTrigger = vi.fn().mockResolvedValue({ success: true });
const mockDuplicateTrigger = vi.fn((id) => ({
  id: `${id}-copy`,
  name: 'New Lead Auto-responder (Copy)',
  module: 'leads',
  event: 'lead_created',
  priority: 2,
  conditions: { rules: [{ field: 'source', operator: 'equals', value: 'website' }] },
  actions: [{ type: 'send_whatsapp' }],
  isActive: false,
}));
const mockGetTriggerStats = vi.fn((id) =>
  id === 'trig-1' ? { totalFired: 15, successRate: 90 } : { totalFired: 5, successRate: 60 }
);

vi.mock('../../../../context/TriggersContext', () => ({
  useTriggers: () => ({
    triggers: mockTriggers,
    executionLogs: mockExecutionLogs,
    stats: mockStats,
    toggleTrigger: mockToggleTrigger,
    deleteTrigger: mockDeleteTrigger,
    duplicateTrigger: mockDuplicateTrigger,
    getTriggerStats: mockGetTriggerStats,
  }),
}));

vi.mock('../../../../components/CreateTriggerModal', () => ({
  default: ({ isOpen, onClose, editData }) =>
    isOpen ? (
      <div data-testid="mock-create-trigger-modal">
        <span>Modal Open: {editData ? editData.name : 'New Trigger'}</span>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

describe('TriggersSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTriggers = [
      {
        id: 'trig-1',
        name: 'New Lead Welcome Message',
        module: 'leads',
        event: 'lead_created',
        priority: 1,
        conditions: { rules: [{ field: 'status', operator: 'equals', value: 'new' }] },
        actions: [{ type: 'send_whatsapp' }, { type: 'assign_agent' }],
        isActive: true,
      },
      {
        id: 'trig-2',
        name: 'High Value Deal Stage Escalation',
        module: 'deals',
        event: 'deal_stage_changed',
        priority: 5,
        conditions: { rules: [] },
        actions: [{ type: 'notify_manager' }],
        isActive: false,
      },
    ];

    mockExecutionLogs = [
      {
        _id: 'log-1',
        executedAt: '2026-03-01T10:00:00.000Z',
        triggerName: 'New Lead Welcome Message',
        event: 'Lead Created',
        success: true,
        totalExecutionTime: 125,
        actionLogs: [
          { action: 'send_whatsapp', status: 'delivered' },
          { action: 'assign_agent', status: 'success' },
        ],
      },
      {
        _id: 'log-2',
        executedAt: '2026-03-02T14:30:00.000Z',
        triggerName: 'High Value Deal Stage Escalation',
        event: 'Deal Stage Changed',
        success: false,
        totalExecutionTime: 450,
        actionLogs: [
          { action: 'notify_manager', status: 'failed: timeout' },
        ],
      },
    ];

    mockStats = { totalFired: 20, successCount: 16 };
  });

  it('renders header, create trigger button, and stats cards', () => {
    render(<TriggersSettingsPage />);

    expect(screen.getByRole('heading', { level: 2, name: /Triggers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Trigger/i })).toBeInTheDocument();

    expect(screen.getByText('Active Triggers')).toBeInTheDocument();
    expect(screen.getByText('Total Fired')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Avg Execution')).toBeInTheDocument();

    // 1 active trigger and 1 priority
    expect(screen.getAllByText('1')).toHaveLength(2);
    // Total fired: 20
    expect(screen.getByText('20')).toBeInTheDocument();
    // Success rate: 80% (16 / 20)
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders Triggers tab with DataTable semantics and all 8 columns', () => {
    render(<TriggersSettingsPage />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Verify 8 column headers (2 columns named Actions)
    expect(screen.getByRole('columnheader', { name: /Trigger Name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Module/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Event/i })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: /Actions/i })).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: /Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Stats/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();

    // Row contents
    expect(screen.getByText('New Lead Welcome Message')).toBeInTheDocument();
    expect(screen.getByText('1 condition(s)')).toBeInTheDocument();
    expect(screen.getByText('2 action(s)')).toBeInTheDocument();
    expect(screen.getByText('Fired: 15')).toBeInTheDocument();
    expect(screen.getByText('Success: 90%')).toBeInTheDocument();

    expect(screen.getByText('High Value Deal Stage Escalation')).toBeInTheDocument();
    expect(screen.getByText('0 condition(s)')).toBeInTheDocument();
    expect(screen.getByText('1 action(s)')).toBeInTheDocument();
    expect(screen.getByText('Fired: 5')).toBeInTheDocument();
    expect(screen.getByText('Success: 60%')).toBeInTheDocument();
  });

  it('filters triggers by search query', () => {
    render(<TriggersSettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search triggers...');
    fireEvent.change(searchInput, { target: { value: 'Welcome' } });

    expect(screen.getByText('New Lead Welcome Message')).toBeInTheDocument();
    expect(screen.queryByText('High Value Deal Stage Escalation')).not.toBeInTheDocument();
  });

  it('filters triggers by module dropdown', () => {
    render(<TriggersSettingsPage />);

    const moduleSelect = screen.getByDisplayValue('All Modules');
    fireEvent.change(moduleSelect, { target: { value: 'deals' } });

    expect(screen.queryByText('New Lead Welcome Message')).not.toBeInTheDocument();
    expect(screen.getByText('High Value Deal Stage Escalation')).toBeInTheDocument();
  });

  it('filters triggers by status dropdown', () => {
    render(<TriggersSettingsPage />);

    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'active' } });

    expect(screen.getByText('New Lead Welcome Message')).toBeInTheDocument();
    expect(screen.queryByText('High Value Deal Stage Escalation')).not.toBeInTheDocument();
  });

  it('toggles trigger active state on status button click', () => {
    render(<TriggersSettingsPage />);

    const activeBadgeBtn = screen.getByRole('button', { name: 'Active' });
    fireEvent.click(activeBadgeBtn);

    expect(mockToggleTrigger).toHaveBeenCalledWith('trig-1');
  });

  it('opens edit modal when edit icon is clicked', () => {
    render(<TriggersSettingsPage />);

    const editButtons = screen.getAllByTitle('Edit Trigger');
    expect(editButtons.length).toBe(2);

    fireEvent.click(editButtons[0]);

    expect(screen.getByTestId('mock-create-trigger-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: New Lead Welcome Message')).toBeInTheDocument();
  });

  it('duplicates trigger and opens modal when duplicate icon is clicked', () => {
    render(<TriggersSettingsPage />);

    const duplicateButtons = screen.getAllByTitle('Duplicate Trigger');
    expect(duplicateButtons.length).toBe(2);

    fireEvent.click(duplicateButtons[0]);

    expect(mockDuplicateTrigger).toHaveBeenCalledWith('trig-1');
    expect(screen.getByTestId('mock-create-trigger-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: New Lead Auto-responder (Copy)')).toBeInTheDocument();
  });

  it('opens delete confirmation modal and invokes deleteTrigger on confirmation', async () => {
    render(<TriggersSettingsPage />);

    const deleteButtons = screen.getAllByTitle('Delete Trigger');
    expect(deleteButtons.length).toBe(2);

    // Click delete on trig-1
    fireEvent.click(deleteButtons[0]);

    // Delete modal appears
    expect(screen.getByRole('heading', { level: 3, name: /Delete Trigger\?/i })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    // Click Confirm Delete inside modal
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(mockDeleteTrigger).toHaveBeenCalledWith('trig-1');
  });

  it('switches to Execution Logs tab and renders logs DataTable with 6 columns', () => {
    render(<TriggersSettingsPage />);

    const logsTabButton = screen.getByRole('button', { name: 'Execution Logs' });
    fireEvent.click(logsTabButton);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // 6 column headers
    expect(screen.getByRole('columnheader', { name: /Timestamp/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Trigger/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Event/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^Time$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Actions taken/i })).toBeInTheDocument();

    // Log rows
    expect(screen.getByText('New Lead Welcome Message')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('125ms')).toBeInTheDocument();
    expect(screen.getByText('send_whatsapp: delivered, assign_agent: success')).toBeInTheDocument();

    expect(screen.getByText('High Value Deal Stage Escalation')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('450ms')).toBeInTheDocument();
    expect(screen.getByText('notify_manager: failed: timeout')).toBeInTheDocument();
  });

  it('renders empty state when no triggers match filter', () => {
    mockTriggers = [];
    render(<TriggersSettingsPage />);

    expect(screen.getByText('No triggers found')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first trigger to automate responses to system events')
    ).toBeInTheDocument();
  });

  it('renders empty state when no execution logs exist', () => {
    mockExecutionLogs = [];
    render(<TriggersSettingsPage />);

    const logsTabButton = screen.getByRole('button', { name: 'Execution Logs' });
    fireEvent.click(logsTabButton);

    expect(screen.getByText('No execution logs yet')).toBeInTheDocument();
  });
});
