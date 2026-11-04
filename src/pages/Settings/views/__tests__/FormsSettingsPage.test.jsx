import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FormsSettingsPage from '../FormsSettingsPage';
import { api } from '../../../../utils/api';
import { toast } from 'react-hot-toast';

vi.mock('../../../../utils/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FormsSettingsPage Component with DataTable', () => {
  const mockLeadForms = [
    {
      _id: 'lead-form-001',
      name: 'Luxury Villa Lead Form',
      slug: 'luxury-villa-lead',
      isActive: true,
      createdAt: '2026-01-15T10:00:00Z',
      analytics: { views: 120, submissions: 15 },
    },
  ];

  const mockDealForms = [
    {
      _id: 'deal-form-001',
      name: 'Commercial Deal Intake',
      slug: 'commercial-deal-intake',
      isActive: false,
      createdAt: '2026-01-10T10:00:00Z',
      analytics: { views: 45, submissions: 3 },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    api.get.mockImplementation((endpoint) => {
      if (endpoint === 'lead-forms') {
        return Promise.resolve({ data: { data: mockLeadForms } });
      }
      if (endpoint === 'deal-forms') {
        return Promise.resolve({ data: { data: mockDealForms } });
      }
      if (endpoint === 'feedback-forms') {
        return Promise.resolve({ data: { data: [] } });
      }
      if (endpoint === 'dynamic-forms') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('renders deployed forms inside DataTable with names, types, views, submissions, and status', async () => {
    const { container } = render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    // Confirms DataTable wrapper and table element are present
    expect(container.querySelector('.ui-datatable')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeInTheDocument();

    expect(screen.getByText('/public/form/luxury-villa-lead')).toBeInTheDocument();
    expect(screen.getAllByText('Lead Capture').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    expect(screen.getByText('Commercial Deal Intake')).toBeInTheDocument();
    expect(screen.getByText('/public/form/commercial-deal-intake')).toBeInTheDocument();
    expect(screen.getByText('Deal Capture')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders action buttons (View Public, Copy Link, Edit) for each form', async () => {
    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const viewButtons = screen.getAllByTitle('View Public');
    const copyButtons = screen.getAllByTitle('Copy Link');
    const editButtons = screen.getAllByTitle('Edit');

    expect(viewButtons).toHaveLength(2);
    expect(copyButtons).toHaveLength(2);
    expect(editButtons).toHaveLength(2);
  });

  it('copy link action writes form public URL to clipboard and triggers success feedback', async () => {
    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy Link');
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/public/form/luxury-villa-lead`
      );
      expect(toast.success).toHaveBeenCalledWith('Form link copied to clipboard!');
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  it('copy link action displays error toast when clipboard writeText rejects and never shows success', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Permission denied'));

    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy Link');
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy form link');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('copy link action displays error feedback safely when Clipboard API is unavailable', async () => {
    const originalClipboard = navigator.clipboard;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      render(<FormsSettingsPage setActiveTab={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByTitle('Copy Link');
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy form link');
      });
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    }
  });

  it('copy link failure does not trigger Edit, View Public, or unintended row navigation', async () => {
    const mockSetActiveTab = vi.fn();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('NotAllowedError'));

    render(<FormsSettingsPage setActiveTab={mockSetActiveTab} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy Link');
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy form link');
    });
    expect(mockSetActiveTab).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('clicking Edit button triggers setActiveTab with the form category', async () => {
    const mockSetActiveTab = vi.fn();
    render(<FormsSettingsPage setActiveTab={mockSetActiveTab} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('Edit');
    fireEvent.click(editButtons[0]);

    // First form is sorted by date: Luxury Villa Lead Form has category 'lead-capture'
    expect(mockSetActiveTab).toHaveBeenCalledWith('lead-capture');
  });

  it('filters forms dynamically based on search input', async () => {
    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search forms...');
    fireEvent.change(searchInput, { target: { value: 'Commercial' } });

    expect(screen.queryByText('Luxury Villa Lead Form')).not.toBeInTheDocument();
    expect(screen.getByText('Commercial Deal Intake')).toBeInTheDocument();
  });

  it('displays empty state when no forms match search criteria', async () => {
    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search forms...');
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Form XYZ' } });

    expect(screen.getByText('No forms found')).toBeInTheDocument();
  });

  it('renders loading indicator while fetching forms', () => {
    // Hangs the API call to check initial loading state
    api.get.mockImplementation(() => new Promise(() => {}));

    render(<FormsSettingsPage setActiveTab={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading data\.\.\./i)).toBeInTheDocument();
  });

  it('supports navigation via top action "Add New Form" and category cards', async () => {
    const mockSetActiveTab = vi.fn();
    render(<FormsSettingsPage setActiveTab={mockSetActiveTab} />);

    await waitFor(() => {
      expect(screen.getByText('Luxury Villa Lead Form')).toBeInTheDocument();
    });

    const createBtn = screen.getByText(/Add New Form/i);
    fireEvent.click(createBtn);
    expect(mockSetActiveTab).toHaveBeenCalledWith('custom-forms');

    const leadCaptureCard = screen.getByText('Forms for landing pages and PPC.').closest('div');
    fireEvent.click(leadCaptureCard);
    expect(mockSetActiveTab).toHaveBeenCalledWith('lead-capture');
  });
});
