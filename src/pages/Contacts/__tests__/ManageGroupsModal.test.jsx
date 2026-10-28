import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManageGroupsModal from '../components/ManageGroupsModal';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockOnClose = vi.fn();

vi.mock('../../../utils/api', () => ({
  api: {
    get: (...args) => mockApiGet(...args),
    post: (...args) => mockApiPost(...args),
    delete: (...args) => mockApiDelete(...args)
  }
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false })
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const syntheticGroups = [
  {
    _id: 'group-001',
    id: 'group-001',
    name: 'VIP Investors',
    category: 'Contact',
    color: '#3b82f6'
  },
  {
    _id: 'group-002',
    id: 'group-002',
    name: 'First-time Buyers',
    category: 'Contact',
    color: '#10b981'
  }
];

describe('Contacts ManageGroupsModal with DataTable (Phase 10.19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({
      data: { success: true, data: syntheticGroups }
    });
    mockApiPost.mockResolvedValue({
      data: { success: true }
    });
    mockApiDelete.mockResolvedValue({
      data: { success: true }
    });
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<ManageGroupsModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal header, create form, and DataTable with 3 column headers when open', async () => {
    const { container } = render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Manage Contact Groups')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. VIP Clients')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('NAME')).toBeInTheDocument();
      expect(screen.getByText('CATEGORY')).toBeInTheDocument();
      expect(screen.getByText('ACTION')).toBeInTheDocument();
    });

    const headers = container.querySelectorAll('th');
    expect(headers).toHaveLength(3);
  });

  it('renders populated contact groups with color indicators and category text', async () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('VIP Investors')).toBeInTheDocument();
      expect(screen.getByText('First-time Buyers')).toBeInTheDocument();
    });

    const categoryBadges = screen.getAllByText('Contact');
    expect(categoryBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders emptyMessage ("No groups created yet") when groups list is empty', async () => {
    mockApiGet.mockResolvedValue({
      data: { success: true, data: [] }
    });

    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('No groups created yet')).toBeInTheDocument();
    });
  });

  it('submitting form creates a new contact group and refreshes group list', async () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const nameInput = screen.getByPlaceholderText('e.g. VIP Clients');
    fireEvent.change(nameInput, { target: { value: 'High Net Worth' } });

    const addBtn = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/contact-groups', expect.objectContaining({
        name: 'High Net Worth'
      }));
    });
  });

  it('clicking delete button prompts confirmation and invokes api.delete', async () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete group VIP Investors/i })).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /Delete group VIP Investors/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure?');
    expect(mockApiDelete).toHaveBeenCalledWith('/contact-groups/group-001');
  });

  it('cancelling delete dialog aborts deletion and does NOT call api.delete', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false);

    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete group VIP Investors/i })).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /Delete group VIP Investors/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('clicking close button invokes onClose callback', () => {
    render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('security audit: table renders zero secrets, tokens, or credentials', async () => {
    const { container } = render(<ManageGroupsModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('VIP Investors')).toBeInTheDocument();
    });

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});
