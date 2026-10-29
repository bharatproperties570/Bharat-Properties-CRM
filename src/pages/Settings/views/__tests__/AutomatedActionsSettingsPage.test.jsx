import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutomatedActionsSettingsPage from '../AutomatedActionsSettingsPage';

// Shared mock context value
let mockActions = [];
let mockAuditLogs = [];
const mockToggleAction = vi.fn();
const mockDeleteAction = vi.fn();

vi.mock('../../../../context/AutomatedActionsContext', () => ({
  useAutomatedActions: () => ({
    actions: mockActions,
    auditLogs: mockAuditLogs,
    toggleAction: mockToggleAction,
    deleteAction: mockDeleteAction,
  }),
}));

vi.mock('../../../../components/CreateAutomatedActionModal', () => ({
  default: ({ isOpen, onClose, editData }) =>
    isOpen ? (
      <div data-testid="mock-create-action-modal">
        <span>Modal Open: {editData ? editData.name : 'New Action'}</span>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

describe('AutomatedActionsSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockActions = [
      {
        _id: 'action-001',
        name: 'Auto-assign Lead on Form Submit',
        targetModule: 'leads',
        actionType: 'update_field',
        invokedByTrigger: 'form_submission',
        isActive: true,
      },
      {
        _id: 'action-002',
        name: 'Lock Unit on Booking Deposit',
        targetModule: 'inventory',
        actionType: 'lock_inventory',
        invokedByTrigger: 'booking_deposit_received',
        isActive: false,
      },
    ];

    mockAuditLogs = [
      {
        actionId: 'action-001',
        actionName: 'Auto-assign Lead on Form Submit',
        entityId: 'lead_998822',
        timestamp: '2026-10-28T08:30:00.000Z',
        success: true,
        executionTime: 18,
      },
      {
        actionId: 'action-002',
        actionName: 'Lock Unit on Booking Deposit',
        entityId: 'unit_404',
        timestamp: '2026-10-28T09:15:00.000Z',
        success: false,
        executionTime: 42,
      },
    ];
  });

  it('renders Action List tab by default with actions details and create button', () => {
    render(<AutomatedActionsSettingsPage />);

    expect(screen.getByText('Action List')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Create Action/i })).toBeInTheDocument();

    expect(screen.getByText('Auto-assign Lead on Form Submit')).toBeInTheDocument();
    expect(screen.getByText('action-001')).toBeInTheDocument();
    expect(screen.getByText('leads')).toBeInTheDocument();
    expect(screen.getByText('update field')).toBeInTheDocument();
    expect(screen.getByText('form submission')).toBeInTheDocument();

    expect(screen.getByText('Lock Unit on Booking Deposit')).toBeInTheDocument();
    expect(screen.getByText('action-002')).toBeInTheDocument();
    expect(screen.getByText('inventory')).toBeInTheDocument();
  });

  it('switches between Action List and Audit Logs tabs', () => {
    render(<AutomatedActionsSettingsPage />);

    // Initially on Action List
    expect(screen.getByRole('button', { name: /\+ Create Action/i })).toBeInTheDocument();

    // Click Audit Logs
    fireEvent.click(screen.getByText('Audit Logs'));

    // + Create Action button should be hidden on Audit Logs tab
    expect(screen.queryByRole('button', { name: /\+ Create Action/i })).not.toBeInTheDocument();

    // Switch back to Action List
    fireEvent.click(screen.getByText('Action List'));
    expect(screen.getByRole('button', { name: /\+ Create Action/i })).toBeInTheDocument();
  });

  it('renders Audit Logs inside DataTable with headers and formatted data', () => {
    const { container } = render(<AutomatedActionsSettingsPage />);

    fireEvent.click(screen.getByText('Audit Logs'));

    // DataTable container and table elements are rendered
    expect(container.querySelector('.ui-datatable')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeInTheDocument();

    // Verify table headers
    expect(screen.getByRole('columnheader', { name: /Time/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Action/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Entity/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Execution/i })).toBeInTheDocument();

    // Verify row 1 (success)
    expect(screen.getByText('Auto-assign Lead on Form Submit')).toBeInTheDocument();
    expect(screen.getByText('lead_998822')).toBeInTheDocument();
    const successBadge = screen.getByText('SUCCESS');
    expect(successBadge).toBeInTheDocument();
    expect(screen.getByText('18ms')).toBeInTheDocument();

    // Verify row 2 (failed)
    expect(screen.getByText('Lock Unit on Booking Deposit')).toBeInTheDocument();
    expect(screen.getByText('unit_404')).toBeInTheDocument();
    const failedBadge = screen.getByText('FAILED');
    expect(failedBadge).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('displays empty message in DataTable when auditLogs is empty', () => {
    mockAuditLogs = [];
    render(<AutomatedActionsSettingsPage />);

    fireEvent.click(screen.getByText('Audit Logs'));

    expect(screen.getByText(/No audit logs yet/i)).toBeInTheDocument();
  });

  it('displays empty state in Action List when actions is empty', () => {
    mockActions = [];
    render(<AutomatedActionsSettingsPage />);

    expect(screen.getByText('No Automated Actions defined yet')).toBeInTheDocument();
    expect(screen.getByText(/Create safe, repetitive tasks/i)).toBeInTheDocument();
  });

  it('calls toggleAction when toggling an action status', () => {
    const { container } = render(<AutomatedActionsSettingsPage />);

    // Toggle switch is the container div with the round slider
    const toggleSwitches = container.querySelectorAll('div[style*="border-radius: 10px"]');
    expect(toggleSwitches.length).toBe(2);

    fireEvent.click(toggleSwitches[0]);
    expect(mockToggleAction).toHaveBeenCalledWith('action-001');

    fireEvent.click(toggleSwitches[1]);
    expect(mockToggleAction).toHaveBeenCalledWith('action-002');
  });

  it('calls deleteAction when clicking delete button', () => {
    const { container } = render(<AutomatedActionsSettingsPage />);

    const deleteButtons = container.querySelectorAll('button i.fa-trash');
    expect(deleteButtons.length).toBe(2);

    fireEvent.click(deleteButtons[0].parentElement);
    expect(mockDeleteAction).toHaveBeenCalledWith('action-001');
  });

  it('opens CreateAutomatedActionModal for editing and creating actions', () => {
    const { container } = render(<AutomatedActionsSettingsPage />);

    // Modal is initially not open
    expect(screen.queryByTestId('mock-create-action-modal')).not.toBeInTheDocument();

    // Click "+ Create Action"
    fireEvent.click(screen.getByRole('button', { name: /\+ Create Action/i }));
    expect(screen.getByTestId('mock-create-action-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: New Action')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    expect(screen.queryByTestId('mock-create-action-modal')).not.toBeInTheDocument();

    // Click Edit button on first action
    const editButtons = container.querySelectorAll('button i.fa-edit');
    expect(editButtons.length).toBe(2);

    fireEvent.click(editButtons[0].parentElement);
    expect(screen.getByTestId('mock-create-action-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: Auto-assign Lead on Form Submit')).toBeInTheDocument();
  });
});
