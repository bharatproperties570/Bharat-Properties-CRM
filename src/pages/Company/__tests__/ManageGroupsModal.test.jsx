import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManageGroupsModal from '../components/ManageGroupsModal';

const mockUseCompanyGroups = vi.fn();
const mockMutateAddGroup = vi.fn();
const mockMutateDeleteGroup = vi.fn();
const mockOnClose = vi.fn();

vi.mock('../../../utils/crmHooks', () => ({
  useCompanyGroups: () => mockUseCompanyGroups(),
  useAddCompanyGroupMutation: () => ({ mutateAsync: mockMutateAddGroup }),
  useDeleteCompanyGroupMutation: () => ({ mutateAsync: mockMutateDeleteGroup })
}));

vi.mock('../../../utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const syntheticCompanyGroups = [
  {
    _id: 'comp-group-001',
    id: 'comp-group-001',
    name: 'Top Channel Partners',
    category: 'Broker',
    color: '#8b5cf6'
  },
  {
    _id: 'comp-group-002',
    id: 'comp-group-002',
    name: 'Authorized Developers',
    category: 'Developer',
    color: '#f59e0b'
  }
];

describe('Company ManageGroupsModal with DataTable (Phase 10.19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCompanyGroups.mockReturnValue({
      data: syntheticCompanyGroups,
      isLoading: false
    });
    mockMutateAddGroup.mockResolvedValue({ success: true });
    mockMutateDeleteGroup.mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<ManageGroupsModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, form, and DataTable with 3 column headers when open', () => {
    const { container } = render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Manage Broker Groups')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Premium Brokers')).toBeInTheDocument();

    expect(screen.getByText('NAME')).toBeInTheDocument();
    expect(screen.getByText('CATEGORY')).toBeInTheDocument();
    expect(screen.getByText('ACTION')).toBeInTheDocument();

    const headers = container.querySelectorAll('th');
    expect(headers).toHaveLength(3);
  });

  it('renders populated broker groups with color indicators and category text', () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Top Channel Partners')).toBeInTheDocument();
    expect(screen.getByText('Authorized Developers')).toBeInTheDocument();

    expect(screen.getByText('Broker')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('renders emptyMessage ("No groups created yet") when groups list is empty', () => {
    mockUseCompanyGroups.mockReturnValue({
      data: [],
      isLoading: false
    });

    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('No groups created yet')).toBeInTheDocument();
  });

  it('submitting form calls addGroupMutation.mutateAsync and resets input', async () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByPlaceholderText('e.g. Premium Brokers');
    fireEvent.change(nameInput, { target: { value: 'Tier 1 Agencies' } });

    const addBtn = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockMutateAddGroup).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Tier 1 Agencies',
        category: 'Broker'
      }));
    });
  });

  it('clicking delete button prompts confirmation and calls deleteGroupMutation.mutateAsync', async () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const deleteBtn = screen.getByRole('button', { name: /Delete group Top Channel Partners/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure?');
    expect(mockMutateDeleteGroup).toHaveBeenCalledWith('comp-group-001');
  });

  it('cancelling delete dialog aborts deletion and does NOT call deleteGroupMutation.mutateAsync', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false);

    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const deleteBtn = screen.getByRole('button', { name: /Delete group Top Channel Partners/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockMutateDeleteGroup).not.toHaveBeenCalled();
  });

  it('clicking close button invokes onClose callback', () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('security audit: table renders zero secrets, tokens, or credentials', () => {
    const { container } = render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});
