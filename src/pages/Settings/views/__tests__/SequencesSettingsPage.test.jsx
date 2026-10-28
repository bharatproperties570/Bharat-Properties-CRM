import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SequencesSettingsPage from '../SequencesSettingsPage';

// Shared mock state
let mockSequences = [];
let mockEnrollments = [];
const mockToggleSequence = vi.fn();
const mockDeleteSequence = vi.fn().mockResolvedValue({ success: true });
const mockGetEnrollmentCount = vi.fn((id) => (id === 'seq-001' ? 14 : 0));

vi.mock('../../../../context/SequenceContext', () => ({
  useSequences: () => ({
    sequences: mockSequences,
    enrollments: mockEnrollments,
    toggleSequence: mockToggleSequence,
    deleteSequence: mockDeleteSequence,
    getEnrollmentCount: mockGetEnrollmentCount,
  }),
}));

vi.mock('../../../../components/CreateSequenceModal', () => ({
  default: ({ isOpen, onClose, editData }) =>
    isOpen ? (
      <div data-testid="mock-create-sequence-modal">
        <span>Modal Open: {editData ? editData.name : 'New Sequence'}</span>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

describe('SequencesSettingsPage with DataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSequences = [
      {
        _id: 'seq-001',
        name: 'Fresh Lead Nurture',
        purpose: 'Lead Conversion',
        trigger: { type: 'onCreated' },
        module: 'leads',
        active: true,
        steps: [
          { id: 1, type: 'WhatsApp' },
          { id: 2, type: 'Email' },
        ],
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        _id: 'seq-002',
        name: 'VIP Buyer Follow-up',
        purpose: 'High Value Deals',
        linkedTriggers: ['trig-1', 'trig-2'],
        module: 'deals',
        active: false,
        steps: [{ id: 1, type: 'SMS' }],
        createdAt: '2026-02-01T00:00:00Z',
      },
    ];

    mockEnrollments = [
      { id: 'enr-1', sequenceId: 'seq-001', status: 'active' },
      { id: 'enr-2', sequenceId: 'seq-001', status: 'completed' },
    ];
  });

  it('renders stats cards correctly', () => {
    render(<SequencesSettingsPage />);

    expect(screen.getByText('Active Sequences')).toBeInTheDocument();
    expect(screen.getByText('Total Enrolled')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Sequences')).toBeInTheDocument();

    // 1 active sequence, 1 total active enrollment (both show '1')
    expect(screen.getAllByText('1')).toHaveLength(2);
    // 50% completion rate (1/2)
    expect(screen.getByText('50%')).toBeInTheDocument();
    // 2 total sequences
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders sequences inside DataTable with all expected columns and headers', () => {
    const { container } = render(<SequencesSettingsPage />);

    // Verify DataTable wrapper and table element
    expect(container.querySelector('.ui-datatable')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeInTheDocument();

    // Headers
    expect(screen.getByRole('columnheader', { name: /Sequence Name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Trigger/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Steps/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Enrolled/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Actions/i })).toBeInTheDocument();

    // Row 1
    expect(screen.getByText('Fresh Lead Nurture')).toBeInTheDocument();
    expect(screen.getByText('Purpose: Lead Conversion')).toBeInTheDocument();
    expect(screen.getByText('onCreated')).toBeInTheDocument();
    expect(screen.getByText('2 Steps')).toBeInTheDocument();
    expect(screen.getByText('14 Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();

    // Row 2
    expect(screen.getByText('VIP Buyer Follow-up')).toBeInTheDocument();
    expect(screen.getByText('Purpose: High Value Deals')).toBeInTheDocument();
    expect(screen.getByText('2 Linked Triggers')).toBeInTheDocument();
    expect(screen.getByText('1 Steps')).toBeInTheDocument();
    expect(screen.getByText('0 Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paused' })).toBeInTheDocument();
  });

  it('displays empty message in DataTable when sequences list is empty', () => {
    mockSequences = [];
    mockEnrollments = [];
    render(<SequencesSettingsPage />);

    expect(screen.getByText('No sequences found')).toBeInTheDocument();
    expect(screen.getByText('Create your first sequence to get started')).toBeInTheDocument();
  });

  it('filters sequences by search input', () => {
    render(<SequencesSettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search sequences...');
    fireEvent.change(searchInput, { target: { value: 'VIP' } });

    expect(screen.getByText('VIP Buyer Follow-up')).toBeInTheDocument();
    expect(screen.queryByText('Fresh Lead Nurture')).not.toBeInTheDocument();

    // Filter with no match
    fireEvent.change(searchInput, { target: { value: 'nonexistent-seq' } });
    expect(screen.getByText('No sequences found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search or filters')).toBeInTheDocument();
  });

  it('filters sequences by status dropdown', () => {
    render(<SequencesSettingsPage />);

    const statusSelect = screen.getByDisplayValue('All Status');

    // Filter to active only
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    expect(screen.getByText('Fresh Lead Nurture')).toBeInTheDocument();
    expect(screen.queryByText('VIP Buyer Follow-up')).not.toBeInTheDocument();

    // Filter to paused only
    fireEvent.change(statusSelect, { target: { value: 'paused' } });
    expect(screen.queryByText('Fresh Lead Nurture')).not.toBeInTheDocument();
    expect(screen.getByText('VIP Buyer Follow-up')).toBeInTheDocument();
  });

  it('toggles sequence active/paused status', () => {
    render(<SequencesSettingsPage />);

    const activeButton = screen.getByRole('button', { name: 'Active' });
    fireEvent.click(activeButton);

    expect(mockToggleSequence).toHaveBeenCalledWith('seq-001');
  });

  it('opens CreateSequenceModal for new sequence and edit', () => {
    const { container } = render(<SequencesSettingsPage />);

    // Click "Create Sequence" button
    fireEvent.click(screen.getByRole('button', { name: /Create Sequence/i }));
    expect(screen.getByTestId('mock-create-sequence-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: New Sequence')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    expect(screen.queryByTestId('mock-create-sequence-modal')).not.toBeInTheDocument();

    // Click Edit on first row
    const editIcons = container.querySelectorAll('i.fa-edit');
    expect(editIcons.length).toBe(2);
    fireEvent.click(editIcons[0]);

    expect(screen.getByTestId('mock-create-sequence-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: Fresh Lead Nurture')).toBeInTheDocument();
  });

  it('duplicates sequence when clicking copy icon', () => {
    const { container } = render(<SequencesSettingsPage />);

    const copyIcons = container.querySelectorAll('i.fa-copy');
    expect(copyIcons.length).toBe(2);
    fireEvent.click(copyIcons[0]);

    expect(screen.getByTestId('mock-create-sequence-modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Open: Fresh Lead Nurture (Copy)')).toBeInTheDocument();
  });

  it('opens delete confirmation modal and triggers deleteSequence on confirm', async () => {
    const { container } = render(<SequencesSettingsPage />);

    const trashIcons = container.querySelectorAll('i.fa-trash-alt');
    expect(trashIcons.length).toBe(2);

    // Click trash icon on first sequence
    fireEvent.click(trashIcons[0]);

    expect(screen.getByText('Delete Sequence?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    // Click Delete in confirmation dialog
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    expect(mockDeleteSequence).toHaveBeenCalledWith('seq-001');
  });

  it('handles null, undefined, or missing sequence fields gracefully', () => {
    mockSequences = [
      {
        _id: 'seq-sparse',
        // name is missing
        // purpose is missing
        // trigger is missing
        // steps is missing
        active: true,
      },
      {
        _id: 'seq-module-only',
        name: 'Module Event Seq',
        module: 'deals',
        // trigger.type is missing
        active: false,
      },
    ];

    render(<SequencesSettingsPage />);

    // Fallbacks
    expect(screen.getByText('Untitled Sequence')).toBeInTheDocument();
    expect(screen.getAllByText('Purpose: N/A')).toHaveLength(2);
    expect(screen.getByText('Manual / Event')).toBeInTheDocument();
    expect(screen.getAllByText('0 Steps')).toHaveLength(2);

    // Module event fallback
    expect(screen.getByText('On deals Event')).toBeInTheDocument();
  });
});
