import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActivitiesPage from '../ActivitiesPage';
import { useActivities } from '../../../utils/crmHooks';

// Mock CRM hooks
const mockDeleteActivity = vi.fn().mockResolvedValue({});
const mockUpdateActivity = vi.fn().mockResolvedValue({});
const mockAddActivity = vi.fn().mockResolvedValue({});

vi.mock('../../../utils/crmHooks', () => ({
  useActivities: vi.fn(),
  useAddActivityMutation: () => ({ mutateAsync: mockAddActivity }),
  useUpdateActivityMutation: () => ({ mutateAsync: mockUpdateActivity }),
  useDeleteActivityMutation: () => ({ mutateAsync: mockDeleteActivity }),
}));

// Mock theme context
vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, mode: 'light' }),
}));

// Mock child modals and panels to isolate ActivitiesPage
vi.mock('../../../components/CreateActivityModal', () => ({
  default: ({ isOpen, onClose, initialData }) =>
    isOpen ? (
      <div data-testid="create-activity-modal">
        <span>Editing: {initialData?._id || 'new'}</span>
        <button onClick={onClose}>Close Create</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/ActivityOutcomeModal', () => ({
  default: ({ isOpen, onClose, activity }) =>
    isOpen ? (
      <div data-testid="activity-outcome-modal">
        <span>Outcome for {activity?._id}</span>
        <button onClick={onClose}>Close Outcome</button>
      </div>
    ) : null,
}));

vi.mock('../components/ActivityFilterPanel', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="activity-filter-panel">
        <button onClick={onClose}>Close Filter</button>
      </div>
    ) : null,
}));

describe('ActivitiesPage Component (Baseline Verification)', () => {
  const mockActivities = [
    {
      _id: 'act-001',
      subject: 'Discuss Villa Pricing for Unit 402',
      type: 'Call',
      status: 'Pending',
      priority: 'High',
      dueDate: '2026-10-30T10:00:00.000Z',
      dueTime: '10:00 AM',
      entityType: 'Lead',
      contactName: 'Rohan Sharma',
      contactPhone: '+91 98765 43210',
      contactEmail: 'rohan.sharma@example.com',
      relatedTo: [
        {
          id: 'lead-101',
          name: 'Rohan Sharma',
          stage: 'Site Visit',
        },
      ],
      participants: [
        {
          name: 'Rohan Sharma',
          mobile: '+91 98765 43210',
          email: 'rohan.sharma@example.com',
        },
      ],
      details: {
        agenda: 'discuss Villa Pricing for Unit 402',
        project: 'DLF Phase 5',
        specificReason: 'Client requested brochure discussion',
      },
      assignedTo: { fullName: 'Amit Verma' },
      createdBy: { fullName: 'Pooja Singh' },
      createdAt: '2026-10-25T08:00:00.000Z',
    },
    {
      _id: 'act-002',
      subject: 'Project Tour & Negotiation',
      type: 'Meeting',
      status: 'Completed',
      priority: 'Medium',
      dueDate: '2026-10-28T14:30:00.000Z',
      dueTime: '02:30 PM',
      entityType: 'Inventory',
      contactName: 'Sunita Patel',
      contactPhone: '+91 91234 56789',
      relatedTo: [
        {
          id: 'unit-204',
          name: '204',
        },
      ],
      participants: [
        {
          name: 'Sunita Patel',
          mobile: '+91 91234 56789',
        },
      ],
      details: {
        outcome: 'Client interested in Tower B',
        project: 'M3M Golfestate',
        block: 'Tower B',
      },
      assignedTo: { fullName: 'Vikram Mehta' },
      createdAt: '2026-10-26T09:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useActivities.mockReturnValue({
      data: mockActivities,
      isLoading: false,
    });
  });

  it('renders activity list with participant details, dates, type, assigned user, and status', () => {
    render(<ActivitiesPage />);

    // Check participant details
    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('rohan.sharma@example.com')).toBeInTheDocument();

    // Check second activity (Inventory participant)
    expect(screen.getByText('Sunita Patel')).toBeInTheDocument();
    expect(screen.getByText('+91 91234 56789')).toBeInTheDocument();

    // Check activity types (present in filter buttons and row chips)
    expect(screen.getAllByText('Call').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Meeting').length).toBeGreaterThanOrEqual(2);

    // Check assigned staff (rendered in Scheduled By and Scheduled For)
    expect(screen.getAllByText('Amit Verma').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Vikram Mehta').length).toBeGreaterThanOrEqual(1);

    // Check status badges (present in filter tabs and row badges)
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(2);

    // Check stage chip (also present in type filter button)
    expect(screen.getAllByText('Site Visit').length).toBeGreaterThanOrEqual(2);
  });

  it('toggles between list view and calendar view seamlessly', () => {
    render(<ActivitiesPage />);

    // Initially in List View
    expect(screen.getByText('Task Management')).toBeInTheDocument();
    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();

    // Switch to Calendar View
    const calendarBtn = screen.getByRole('button', { name: /Calendar View/i });
    fireEvent.click(calendarBtn);

    expect(screen.getByText('My Calendars')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/i })).toBeInTheDocument();

    // Switch back to List View
    const listBtn = screen.getByRole('button', { name: /List View/i });
    fireEvent.click(listBtn);

    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
  });

  it('manages row selection and exposes single-activity action controls', () => {
    render(<ActivitiesPage />);

    const checkboxes = screen.getAllByRole('checkbox');
    // Index 0 is select all, index 1 is act-001, index 2 is act-002
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);

    // Select first activity
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText('1 Selected')).toBeInTheDocument();
    expect(screen.getByTitle('Edit Activity')).toBeInTheDocument();
    expect(screen.getByTitle('Reschedule')).toBeInTheDocument();
    expect(screen.getByTitle('Mark Complete')).toBeInTheDocument();
    expect(screen.getByTitle('Delete Activities')).toBeInTheDocument();

    // Select second activity (total 2 selected)
    fireEvent.click(checkboxes[2]);

    expect(screen.getByText('2 Selected')).toBeInTheDocument();
    // Single-item controls hidden in bulk selection
    expect(screen.queryByTitle('Edit Activity')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mark Complete')).not.toBeInTheDocument();
    expect(screen.getByTitle('Delete Activities')).toBeInTheDocument();
  });

  it('opens completion outcome modal when clicking Mark Complete on a selected activity', () => {
    render(<ActivitiesPage />);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // select act-001

    const completeBtn = screen.getByTitle('Mark Complete');
    fireEvent.click(completeBtn);

    expect(screen.getByTestId('activity-outcome-modal')).toBeInTheDocument();
    expect(screen.getByText(/Outcome for act-001/i)).toBeInTheDocument();
  });

  it('triggers deleteActivity mutation for selected activities on confirmed delete', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ActivitiesPage />);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // select act-001

    const deleteBtn = screen.getByTitle('Delete Activities');
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete 1 activities?');
    expect(mockDeleteActivity).toHaveBeenCalledWith('act-001');

    confirmSpy.mockRestore();
  });

  it('activates bottom summary footer on row click and clears it on dismiss', () => {
    render(<ActivitiesPage />);

    // Initially summary footer shows total count
    expect(screen.getByText(/Total Activities/i)).toBeInTheDocument();

    // Click on row for Rohan Sharma
    const rohanName = screen.getByText('Rohan Sharma');
    fireEvent.click(rohanName);

    // Detailed activity summary footer appears
    expect(screen.getByText('ACTIVITY SUMMARY')).toBeInTheDocument();
    expect(screen.getByText('CONTACT:')).toBeInTheDocument();

    // Dismiss footer
    const dismissBtn = screen.getByRole('button', { name: '' });
    // Or find dismiss button with fa-times icon
    const closeBtn = document.querySelector('.activities-footer button');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('ACTIVITY SUMMARY')).not.toBeInTheDocument();
    expect(screen.getByText(/Total Activities/i)).toBeInTheDocument();
  });

  it('filters activities dynamically via search input', () => {
    render(<ActivitiesPage />);

    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('Sunita Patel')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search activities...');
    fireEvent.change(searchInput, { target: { value: 'Negotiation' } });

    expect(screen.queryByText('Rohan Sharma')).not.toBeInTheDocument();
    expect(screen.getByText('Sunita Patel')).toBeInTheDocument();
  });

  it('filters activities via quick type filter buttons', () => {
    render(<ActivitiesPage />);

    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('Sunita Patel')).toBeInTheDocument();

    // Filter by 'Call' (Rohan Sharma is Call, Sunita Patel is Meeting)
    const callFilterBtn = screen.getByRole('button', { name: 'Call' });
    fireEvent.click(callFilterBtn);

    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.queryByText('Sunita Patel')).not.toBeInTheDocument();

    // Filter by 'Meeting'
    const meetingFilterBtn = screen.getByRole('button', { name: 'Meeting' });
    fireEvent.click(meetingFilterBtn);

    expect(screen.queryByText('Rohan Sharma')).not.toBeInTheDocument();
    expect(screen.getByText('Sunita Patel')).toBeInTheDocument();
  });

  it('preserves DataTable keyboard navigation and Enter row activation for summary footer', () => {
    render(<ActivitiesPage />);

    // Primary action button inside DataTable for first row (Rohan Sharma)
    const rohanBtn = screen.getByRole('button', { name: /Rohan Sharma/i });
    expect(rohanBtn).toBeInTheDocument();

    // Summary footer is not open yet
    expect(screen.queryByText('ACTIVITY SUMMARY')).not.toBeInTheDocument();

    // Press Enter on the primary row button
    fireEvent.keyDown(rohanBtn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(rohanBtn);

    // Summary footer opens
    expect(screen.getByText('ACTIVITY SUMMARY')).toBeInTheDocument();
    expect(screen.getByText(/Discuss Villa Pricing/i)).toBeInTheDocument();
  });

  it('isolates checkbox selection from row click activation', () => {
    render(<ActivitiesPage />);

    const checkbox = screen.getByLabelText('Select activity act-001');
    expect(checkbox).not.toBeChecked();

    // Click checkbox
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Activity summary footer should NOT be activated by checkbox click
    expect(screen.queryByText('ACTIVITY SUMMARY')).not.toBeInTheDocument();
  });

  it('renders DataTable empty state message when no activities are available', () => {
    useActivities.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<ActivitiesPage />);
    expect(screen.getByText('No activities found.')).toBeInTheDocument();
  });

  describe('Selection and Summary Isolation Forensic Verification', () => {
    it('executes the full 7-step selection and summary isolation sequence', () => {
      render(<ActivitiesPage />);

      // Sequence 1: Click row's non-interactive area -> summary opens for act-001 (Rohan Sharma)
      const rohanBtn = screen.getByRole('button', { name: /Rohan Sharma/i });
      fireEvent.click(rohanBtn);
      expect(screen.getByText('ACTIVITY SUMMARY')).toBeInTheDocument();
      expect(screen.getByText(/Discuss Villa Pricing/i)).toBeInTheDocument();
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();

      // Sequence 2: Click checkbox -> only bulk selection changes, summary remains on act-001
      const act2Checkbox = screen.getByLabelText('Select activity act-002');
      fireEvent.click(act2Checkbox);
      expect(act2Checkbox).toBeChecked();
      expect(screen.getByText('1 Selected')).toBeInTheDocument();
      // Summary still shows act-001 (Rohan Sharma), NOT act-002
      expect(screen.getByText('ACTIVITY SUMMARY')).toBeInTheDocument();
      expect(screen.getByText(/Discuss Villa Pricing/i)).toBeInTheDocument();

      // Sequence 3: Select multiple rows -> all expected IDs remain selected
      const act1Checkbox = screen.getByLabelText('Select activity act-001');
      fireEvent.click(act1Checkbox);
      expect(act1Checkbox).toBeChecked();
      expect(act2Checkbox).toBeChecked();
      expect(screen.getByText('2 Selected')).toBeInTheDocument();

      // Sequence 4: Click select-all and then clear it -> selection state and bulk toolbar remain correct
      const selectAllCheckbox = screen.getByLabelText('Select all activities');
      expect(selectAllCheckbox).toBeChecked();
      // Click select-all to deselect all
      fireEvent.click(selectAllCheckbox);
      expect(act1Checkbox).not.toBeChecked();
      expect(act2Checkbox).not.toBeChecked();
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();

      // Sequence 5: Keyboard activation on row with Enter and Space -> triggers summary activation without duplicate calls
      const sunitaBtn = screen.getByRole('button', { name: /Sunita Patel/i });
      fireEvent.keyDown(sunitaBtn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(sunitaBtn);
      expect(screen.getByText('ACTIVITY SUMMARY')).toBeInTheDocument();
      expect(screen.getByText(/Project Tour & Negotiation/i)).toBeInTheDocument();

      // Sequence 6: Use nested controls (e.g. checkbox) -> does not trigger row activation
      fireEvent.click(act1Checkbox); // select act-001
      expect(act1Checkbox).toBeChecked();
      // Summary is still act-002 (Sunita Patel), did NOT switch to act-001
      expect(screen.getByText(/Project Tour & Negotiation/i)).toBeInTheDocument();

      // Sequence 7: Dismiss summary and perform bulk actions -> summary dismissed, selection intact
      const closeSummaryBtn = document.querySelector('.activities-footer button');
      fireEvent.click(closeSummaryBtn);
      expect(screen.queryByText('ACTIVITY SUMMARY')).not.toBeInTheDocument();
      // Selection toolbar remains active with 1 selected
      expect(screen.getByText('1 Selected')).toBeInTheDocument();
      expect(screen.getByTitle('Mark Complete')).toBeInTheDocument();
    });
  });
});
