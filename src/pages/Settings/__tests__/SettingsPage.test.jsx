import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage';

// Mock API and CRM hooks
const mockDeleteRole = vi.fn();
const mockDeleteTeam = vi.fn();
const mockRefreshData = vi.fn();
const mockUseUsers = vi.fn();
const mockUseTeams = vi.fn();
const mockUseUserContext = vi.fn();
const mockMutateDeleteUser = vi.fn();
const mockMutateToggleStatus = vi.fn();

vi.mock('../../../utils/api', () => ({
  API_BASE_URL: 'http://localhost:5001/api',
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}));

vi.mock('../../../utils/crmHooks', () => ({
  useUsers: () => mockUseUsers(),
  useActiveUsers: () => ({ data: [] }),
  useTeams: () => mockUseTeams(),
  useDeleteUserMutation: () => ({ mutateAsync: mockMutateDeleteUser }),
  useToggleUserStatusMutation: () => ({ mutateAsync: mockMutateToggleStatus }),
  useAddUserMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) }),
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) })
}));

vi.mock('../../../context/UserContext', () => ({
  useUserContext: () => mockUseUserContext()
}));

// Synthetic test data
const syntheticRoles = [
  {
    _id: 'role-super-admin',
    id: 'role-super-admin',
    name: 'Super Admin',
    description: 'Full system privileges and root authority',
    isSystemRole: true,
    department: 'Executive'
  },
  {
    _id: 'role-sales-agent',
    id: 'role-sales-agent',
    name: 'Sales Executive',
    description: 'Handles client lead pipeline and site visits',
    isSystemRole: false,
    department: 'Sales'
  },
  {
    _id: 'role-marketing-lead',
    id: 'role-marketing-lead',
    name: 'Marketing Specialist',
    description: 'Manages marketing campaigns and templates',
    isSystemRole: false,
    department: 'Marketing'
  }
];

const syntheticUsers = [
  {
    _id: 'user-001',
    id: 'user-001',
    fullName: 'Rohan Sharma',
    name: 'Rohan Sharma',
    email: 'rohan.sharma@example.com',
    mobile: '9876543210',
    username: 'rohansharma',
    role: 'role-sales-agent',
    department: 'Sales',
    designation: 'Senior Agent',
    lastLogin: '2026-10-25T10:30:00.000Z',
    status: 'Active',
    isActive: true
  },
  {
    _id: 'user-002',
    id: 'user-002',
    fullName: 'Priya Patel',
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '9876543211',
    username: 'priyapatel',
    role: { _id: 'role-campaign-specialist', name: 'Campaign Specialist' },
    department: 'Marketing',
    designation: 'Campaign Lead',
    lastLogin: null,
    status: 'Inactive',
    isActive: false
  },
  {
    _id: 'user-owner',
    id: 'user-owner',
    fullName: 'Bharat Admin',
    name: 'Bharat Admin',
    email: 'bharatproperties570@gmail.com',
    username: 'bharatowner',
    role: 'role-super-admin',
    department: 'Management',
    designation: 'Owner',
    status: 'Active',
    isActive: true
  },
  {
    _id: 'admin-001',
    id: 'admin-001',
    fullName: 'System Admin',
    name: 'System Admin',
    email: 'admin@bharatproperties.com',
    username: 'sysadmin',
    role: 'role-super-admin',
    department: 'IT',
    designation: 'Administrator',
    status: 'Active',
    isActive: true
  }
];

const syntheticTeams = [
  {
    _id: 'team-north-delhi',
    id: 'team-north-delhi',
    name: 'North Delhi Sales',
    department: 'sales',
    manager: {
      _id: 'user-001',
      fullName: 'Rohan Sharma'
    },
    memberCount: 5
  },
  {
    _id: 'team-gurgaon-commercial',
    id: 'team-gurgaon-commercial',
    name: 'Gurgaon Commercial',
    department: 'commercial',
    manager: null,
    memberCount: 0
  }
];

describe('SettingsPage RolesList with DataTable (Phase 10.16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUsers.mockReturnValue({
      data: syntheticUsers,
      isLoading: false
    });

    mockUseTeams.mockReturnValue({
      data: syntheticTeams,
      isLoading: false
    });

    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'admin-001',
        email: 'admin@bharatproperties.com',
        role: { name: 'Super Admin' },
        dataScope: 'all'
      }
    });

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('renders Roles tab inside SettingsPage and displays DataTable with correct column headers', async () => {
    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    expect(screen.getByText('Role name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders populated role rows with stable identity and displays name and description', async () => {
    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Full system privileges and root authority')).toBeInTheDocument();

    expect(screen.getByText('Sales Executive')).toBeInTheDocument();
    expect(screen.getByText('Handles client lead pipeline and site visits')).toBeInTheDocument();

    expect(screen.getByText('Marketing Specialist')).toBeInTheDocument();
    expect(screen.getByText('Manages marketing campaigns and templates')).toBeInTheDocument();
  });

  it('renders emptyMessage ("No roles found.") when roles array is empty', async () => {
    mockUseUserContext.mockReturnValue({
      roles: [],
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'admin-001',
        email: 'admin@bharatproperties.com',
        role: { name: 'Admin' },
        dataScope: 'all'
      }
    });

    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    expect(screen.getByText('No roles found.')).toBeInTheDocument();
  });

  it('RBAC enforcement: Admin sees Edit/Delete buttons on custom roles, but NOT on system roles', async () => {
    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    expect(screen.getByRole('button', { name: /\+ New role/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Edit Sales Executive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Sales Executive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Marketing Specialist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Marketing Specialist/i })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Edit Super Admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Super Admin/i })).not.toBeInTheDocument();
  });

  it('RBAC enforcement: Non-admin user cannot see + New role button or any action buttons', async () => {
    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'agent-001',
        email: 'agent@bharatproperties.com',
        role: { name: 'Sales Executive' },
        dataScope: 'own'
      }
    });

    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    expect(screen.queryByRole('button', { name: /\+ New role/i })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Edit Sales Executive/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Sales Executive/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Marketing Specialist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Marketing Specialist/i })).not.toBeInTheDocument();
  });

  it('deleting a role with assigned users prompts warning message with user count and calls deleteRole(id, true)', async () => {
    mockDeleteRole.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    const deleteSalesExecBtn = screen.getByRole('button', { name: /Delete Sales Executive/i });
    fireEvent.click(deleteSalesExecBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Warning: 1 user(s) are currently assigned to the "Sales Executive" role')
    );
    expect(mockDeleteRole).toHaveBeenCalledWith('role-sales-agent', true);
  });

  it('deleting a role without assigned users prompts standard confirmation and calls deleteRole(id)', async () => {
    mockDeleteRole.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    const deleteMktgBtn = screen.getByRole('button', { name: /Delete Marketing Specialist/i });
    fireEvent.click(deleteMktgBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete the role "Marketing Specialist"?'
    );
    expect(mockDeleteRole).toHaveBeenCalledWith('role-marketing-lead');
  });

  it('cancelling deletion dialog aborts and does NOT invoke deleteRole', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false);

    render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    const deleteMktgBtn = screen.getByRole('button', { name: /Delete Marketing Specialist/i });
    fireEvent.click(deleteMktgBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteRole).not.toHaveBeenCalled();
  });

  it('security audit: table renders zero secrets, tokens, or hashes', async () => {
    const { container } = render(<SettingsPage />);

    const rolesTab = screen.getByText('Roles');
    fireEvent.click(rolesTab);

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/token/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});

describe('SettingsPage TeamsList with DataTable (Phase 10.17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUsers.mockReturnValue({
      data: syntheticUsers,
      isLoading: false
    });

    mockUseTeams.mockReturnValue({
      data: syntheticTeams,
      isLoading: false
    });

    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'admin-001',
        email: 'admin@bharatproperties.com',
        role: { name: 'Super Admin' },
        dataScope: 'all'
      }
    });

    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('renders Teams tab inside SettingsPage and displays DataTable with 5 semantic columns', async () => {
    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    // Verify all 5 table headers
    expect(screen.getByText('Team Name')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders populated team rows with stable identity, manager avatar/initials, and member count badge', async () => {
    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    // Team 1: North Delhi Sales
    expect(screen.getByText('North Delhi Sales')).toBeInTheDocument();
    expect(screen.getByText('sales')).toBeInTheDocument();
    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('RS')).toBeInTheDocument(); // Initials
    expect(screen.getByText('5 Members')).toBeInTheDocument();

    // Team 2: Gurgaon Commercial
    expect(screen.getByText('Gurgaon Commercial')).toBeInTheDocument();
    expect(screen.getByText('commercial')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument(); // Manager fallback
    expect(screen.getByText('0 Members')).toBeInTheDocument();
  });

  it('renders emptyMessage ("No teams found.") when teams list is empty', async () => {
    mockUseTeams.mockReturnValue({
      data: [],
      isLoading: false
    });

    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    expect(screen.getByText('No teams found.')).toBeInTheDocument();
  });

  it('RBAC enforcement: Admin sees + New Team button and Edit/Delete buttons on all teams', async () => {
    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    // Admin sees + New Team button
    expect(screen.getByRole('button', { name: /\+ New Team/i })).toBeInTheDocument();

    // Admin sees Edit and Delete action buttons
    expect(screen.getByRole('button', { name: /Edit North Delhi Sales/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete North Delhi Sales/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Gurgaon Commercial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Gurgaon Commercial/i })).toBeInTheDocument();
  });

  it('RBAC enforcement: Non-admin user cannot see + New Team button or any action buttons', async () => {
    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'agent-001',
        email: 'agent@bharatproperties.com',
        role: { name: 'Sales Executive' },
        dataScope: 'own'
      }
    });

    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    // + New Team button must not be visible
    expect(screen.queryByRole('button', { name: /\+ New Team/i })).not.toBeInTheDocument();

    // No Edit or Delete buttons visible
    expect(screen.queryByRole('button', { name: /Edit North Delhi Sales/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete North Delhi Sales/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Gurgaon Commercial/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Gurgaon Commercial/i })).not.toBeInTheDocument();
  });

  it('deleting a team prompts confirmation and calls deleteTeam(teamId)', async () => {
    mockDeleteTeam.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    const deleteBtn = screen.getByRole('button', { name: /Delete Gurgaon Commercial/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this team?');
    expect(mockDeleteTeam).toHaveBeenCalledWith('team-gurgaon-commercial');
  });

  it('cancelling deletion dialog aborts and does NOT invoke deleteTeam', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false);

    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    const deleteBtn = screen.getByRole('button', { name: /Delete Gurgaon Commercial/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteTeam).not.toHaveBeenCalled();
  });

  it('backend rejection when team has active members: shows error and does not indicate success', async () => {
    mockDeleteTeam.mockResolvedValue({
      success: false,
      error: 'Cannot delete team with 5 active members. Please reassign them first.'
    });

    render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    const deleteBtn = screen.getByRole('button', { name: /Delete North Delhi Sales/i });
    fireEvent.click(deleteBtn);

    expect(mockDeleteTeam).toHaveBeenCalledWith('team-north-delhi');

    // Wait for error toast to display
    await waitFor(() => {
      expect(screen.getByText(/Cannot delete team with 5 active members/i)).toBeInTheDocument();
    });

    // Success toast must NOT be displayed
    expect(screen.queryByText(/Team deleted successfully/i)).not.toBeInTheDocument();
  });

  it('security audit: Teams table renders zero secrets, tokens, or credentials', async () => {
    const { container } = render(<SettingsPage />);

    const teamsTab = screen.getByText('Teams');
    fireEvent.click(teamsTab);

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/token/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});

describe('SettingsPage UserList with DataTable (Phase 10.18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUsers.mockReturnValue({
      data: syntheticUsers,
      isLoading: false
    });

    mockUseTeams.mockReturnValue({
      data: syntheticTeams,
      isLoading: false
    });

    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'admin-001',
        email: 'admin@bharatproperties.com',
        role: { name: 'Super Admin' },
        dataScope: 'all'
      }
    });

    mockMutateDeleteUser.mockResolvedValue({ success: true });
    mockMutateToggleStatus.mockResolvedValue({ success: true });

    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('renders default Users tab inside SettingsPage and displays DataTable with 8 column headers (7 named + 1 action)', async () => {
    const { container } = render(<SettingsPage />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Designation')).toBeInTheDocument();
    expect(screen.getByText('User Name')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    const columnHeaders = container.querySelectorAll('th');
    expect(columnHeaders).toHaveLength(8);
  });

  it('renders populated active user rows with stable identity and formatted contact details', async () => {
    render(<SettingsPage />);

    // Active users: Rohan Sharma, Bharat Admin, System Admin
    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('rohan.sharma@example.com')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('rohansharma')).toBeInTheDocument();
    expect(screen.getByText('Senior Agent')).toBeInTheDocument();

    expect(screen.getByText('Bharat Admin')).toBeInTheDocument();
    expect(screen.getByText('System Admin')).toBeInTheDocument();

    // Inactive user Priya Patel should NOT appear in Active filter
    expect(screen.queryByText('Priya Patel')).not.toBeInTheDocument();
  });

  it('status filter toggle: clicking Inactive displays inactive users', async () => {
    render(<SettingsPage />);

    const inactiveFilterBtn = screen.getByText('Inactive');
    fireEvent.click(inactiveFilterBtn);

    expect(screen.getByText('Priya Patel')).toBeInTheDocument();
    expect(screen.getByText('priya.patel@example.com')).toBeInTheDocument();
    expect(screen.getByText('9876543211')).toBeInTheDocument();
    expect(screen.getByText('priyapatel')).toBeInTheDocument();

    // Active users should NOT appear
    expect(screen.queryByText('Rohan Sharma')).not.toBeInTheDocument();
  });

  it('filters users dynamically when typing in search input', async () => {
    render(<SettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'Rohan' } });

    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.queryByText('Bharat Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('System Admin')).not.toBeInTheDocument();
  });

  it('renders emptyMessage ("No users found.") when no users match filter or query', async () => {
    render(<SettingsPage />);

    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: 'NonexistentUserXYZ' } });

    expect(screen.getByText('No users found.')).toBeInTheDocument();
  });

  it('RBAC enforcement: Admin sees + New user button and action buttons', async () => {
    render(<SettingsPage />);

    expect(screen.getByRole('button', { name: /\+ New user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actions for Rohan Sharma/i })).toBeInTheDocument();
  });

  it('RBAC enforcement: Non-admin user cannot see + New user button or action buttons', async () => {
    mockUseUserContext.mockReturnValue({
      roles: syntheticRoles,
      loading: false,
      error: null,
      deleteRole: mockDeleteRole,
      deleteTeam: mockDeleteTeam,
      refreshData: mockRefreshData,
      currentUser: {
        _id: 'agent-001',
        email: 'agent@bharatproperties.com',
        role: { name: 'Sales Executive' },
        dataScope: 'own'
      }
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('button', { name: /\+ New user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for Rohan Sharma/i })).not.toBeInTheDocument();
  });

  it('clicking action caret opens dropdown menu with Edit, Reset Password, Delete, and Deactivate', async () => {
    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for Rohan Sharma/i });
    fireEvent.click(actionBtn);

    expect(screen.getByText('Edit User')).toBeInTheDocument();
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText('Delete User')).toBeInTheDocument();
    expect(screen.getByText('Deactivate User')).toBeInTheDocument();
  });

  it('self-deletion safeguard: attempting to delete own account displays error toast and does NOT call deleteUser', async () => {
    render(<SettingsPage />);

    // Current user is admin-001 (System Admin)
    const actionBtn = screen.getByRole('button', { name: /Actions for System Admin/i });
    fireEvent.click(actionBtn);

    const deleteOption = screen.getByText('Delete User');
    fireEvent.click(deleteOption);

    await waitFor(() => {
      expect(screen.getByText('You cannot delete your own account.')).toBeInTheDocument();
    });

    expect(mockMutateDeleteUser).not.toHaveBeenCalled();
  });

  it('protected owner safeguard: attempting to delete system owner displays error toast and does NOT call deleteUser', async () => {
    render(<SettingsPage />);

    // System owner is Bharat Admin (bharatproperties570@gmail.com)
    const actionBtn = screen.getByRole('button', { name: /Actions for Bharat Admin/i });
    fireEvent.click(actionBtn);

    const deleteOption = screen.getByText('Delete User');
    fireEvent.click(deleteOption);

    await waitFor(() => {
      expect(screen.getByText('System owner account cannot be deleted.')).toBeInTheDocument();
    });

    expect(mockMutateDeleteUser).not.toHaveBeenCalled();
  });

  it('self-inactivation safeguard: attempting to deactivate own account displays error toast and does NOT call toggleUserStatus', async () => {
    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for System Admin/i });
    fireEvent.click(actionBtn);

    const deactivateOption = screen.getByText('Deactivate User');
    fireEvent.click(deactivateOption);

    await waitFor(() => {
      expect(screen.getByText('You cannot deactivate your own account.')).toBeInTheDocument();
    });

    expect(mockMutateToggleStatus).not.toHaveBeenCalled();
  });

  it('system owner inactivation safeguard: attempting to deactivate system owner displays error toast and does NOT call toggleUserStatus', async () => {
    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for Bharat Admin/i });
    fireEvent.click(actionBtn);

    const deactivateOption = screen.getByText('Deactivate User');
    fireEvent.click(deactivateOption);

    await waitFor(() => {
      expect(screen.getByText('System owner account cannot be deactivated.')).toBeInTheDocument();
    });

    expect(mockMutateToggleStatus).not.toHaveBeenCalled();
  });

  it('admin deleting regular user prompts confirmation and invokes deleteUser mutation', async () => {
    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for Rohan Sharma/i });
    fireEvent.click(actionBtn);

    const deleteOption = screen.getByText('Delete User');
    fireEvent.click(deleteOption);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Are you sure you want to delete Rohan Sharma?'));
    expect(mockMutateDeleteUser).toHaveBeenCalledWith('user-001');

    await waitFor(() => {
      expect(screen.getByText('User deleted successfully')).toBeInTheDocument();
    });
  });

  it('cancelling deletion confirmation dialog does NOT call deleteUser mutation', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => false);

    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for Rohan Sharma/i });
    fireEvent.click(actionBtn);

    const deleteOption = screen.getByText('Delete User');
    fireEvent.click(deleteOption);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockMutateDeleteUser).not.toHaveBeenCalled();
  });

  it('password reset prompts confirmation and displays toast with destination email', async () => {
    render(<SettingsPage />);

    const actionBtn = screen.getByRole('button', { name: /Actions for Rohan Sharma/i });
    fireEvent.click(actionBtn);

    const resetOption = screen.getByText('Reset Password');
    fireEvent.click(resetOption);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to reset password for Rohan Sharma?');

    await waitFor(() => {
      expect(screen.getByText('Password reset link sent to rohan.sharma@example.com')).toBeInTheDocument();
    });
  });

  it('security audit: Users table renders zero secrets, tokens, or hashes', async () => {
    const { container } = render(<SettingsPage />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/password/i);
    expect(html).not.toMatch(/token/i);
    expect(html).not.toMatch(/bearer/i);
    expect(html).not.toMatch(/secret/i);
    expect(html).not.toMatch(/\$2[aby]\$/);
  });
});
