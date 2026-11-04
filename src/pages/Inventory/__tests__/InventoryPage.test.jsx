import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryPage from '../InventoryPageV2';
import { useInventories, useUsers, useTeams } from '../../../utils/crmHooks';

// ─── SPIES & HOOK MOCKS ────────────────────────────────────────────────────────

const mockDeleteInventory = vi.fn().mockResolvedValue({});
const mockBulkDeleteInventory = vi.fn().mockResolvedValue({});
const mockUpdateInventory = vi.fn().mockResolvedValue({});
const mockFireEvent = vi.fn();

vi.mock('../../../utils/crmHooks', () => ({
  useInventories: vi.fn(),
  useUsers: vi.fn(),
  useTeams: vi.fn(),
  useUpdateInventoryMutation: () => ({ mutateAsync: mockUpdateInventory }),
  useDeleteInventoryMutation: () => ({ mutateAsync: mockDeleteInventory }),
  useBulkDeleteInventoryMutation: () => ({ mutateAsync: mockBulkDeleteInventory }),
}));

// Mock useDebounce to return value immediately for synchronous search testing
vi.mock('../../../hooks/useDebounce', () => ({
  default: (val) => val,
  useDebounce: (val) => val,
}));

// Mock contexts
vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, mode: 'light' }),
}));

vi.mock('../../../context/UserContext', () => ({
  useUserContext: () => ({
    currentUser: { _id: 'admin-1', email: 'bharatproperties570@gmail.com', isAdmin: true, role: 'Admin' },
    roles: [{ name: 'Admin', moduleAccess: { inventory: { view: true, create: true, edit: true, delete: true } } }],
    loading: false,
  }),
}));

vi.mock('../../../context/CallContext', () => ({
  useCall: () => ({}),
}));

vi.mock('../../../context/TriggersContext', () => ({
  useTriggers: () => ({ fireEvent: mockFireEvent }),
}));

const mockSizes = [
  { id: 'size-camellias', name: '4 BHK Luxury - 3500 Sq.Ft.', unitType: '4 BHK', totalArea: 3500, resultMetric: 'Sq.Ft.' }
];

vi.mock('../../../context/PropertyConfigContext', () => ({
  usePropertyConfig: () => ({
    sizes: mockSizes,
    getLookupValue: (type, val) => {
      if (!val) return '';
      if (typeof val === 'object') return val.lookup_value || val.name || val.label || val._id || '';
      return String(val);
    },
  }),
}));

// Mock child modals and map components
vi.mock('../../../components/UploadModal', () => ({ default: () => null }));
vi.mock('../../../components/AddInventoryDocumentModal', () => ({ default: () => null }));
vi.mock('../../../components/AddInventoryModal', () => ({ default: () => null }));
vi.mock('../../../components/AddOwnerModal', () => ({ default: () => null }));
vi.mock('../../../components/SocialPostModal', () => ({ default: () => null }));

vi.mock('../../Communication/components/ComposeEmailModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="compose-email-modal">
        <button onClick={onClose}>Close Email</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/SendMessageModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="send-message-modal">
        <button onClick={onClose}>Close Message</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/ManageTagsModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="manage-tags-modal">
        <button onClick={onClose}>Close Tags</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/InventoryFeedbackModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="inventory-feedback-modal">
        <button onClick={onClose}>Close Feedback</button>
      </div>
    ) : null,
}));

vi.mock('../components/InventoryFilterPanel', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="inventory-filter-panel">
        <button onClick={onClose}>Close Filter</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/AddDealModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="add-deal-modal">
        <button onClick={onClose}>Close Deal</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/modals/BulkUpdateInventoryModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="bulk-update-modal">
        <button onClick={onClose}>Close Bulk Update</button>
      </div>
    ) : null,
}));

vi.mock('../../../components/ProfessionalMap', () => ({
  default: () => <div data-testid="professional-map">Map View Active</div>,
}));

vi.mock('../components/InventoryMapList', () => ({
  default: () => <div data-testid="inventory-map-list">Map List Panel</div>,
}));

// Helper to render with fresh QueryClientProvider
const renderInventoryPage = (props = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryPage {...props} />
    </QueryClientProvider>
  );
};

// ─── TEST SUITE ────────────────────────────────────────────────────────────────

describe('InventoryPage Baseline Verification (Phase 10.7.1)', () => {
  const mockUsers = [
    { _id: 'user-001', fullName: 'Amit Verma' },
    { _id: 'user-002', fullName: 'Sanjay Gupta' },
  ];

  const mockTeams = [
    { _id: 'team-001', name: 'Sales Core' },
    { _id: 'team-002', name: 'Commercial Leasing' },
  ];

  const mockInventoryItems = [
    {
      _id: 'inv-001',
      unitNo: 'A-101',
      status: 'Active',
      primaryDealIntent: 'sell',
      category: 'Residential',
      subCategory: 'Apartment',
      isCorner: true,
      sizeId: 'size-camellias',
      projectName: 'DLF The Camellias',
      block: 'Tower 1',
      address: {
        locality: 'Golf Course Road',
        city: 'Gurugram',
        pincode: '122002',
      },
      orientation: 'North-East',
      direction: 'East',
      roadWidth: '60 Meter',
      owners: [
        {
          _id: 'owner-101',
          name: 'Rajesh Kumar',
          phones: [{ number: '+91 98111 22233' }],
          personalAddress: {
            hNo: '12',
            street: 'MG Road',
            locality: 'Sector 29',
            city: 'Gurugram',
            pincode: '122001',
          },
        },
      ],
      associates: [
        {
          contact: {
            _id: 'assoc-201',
            name: 'Priya Sharma',
            phones: [{ number: '+91 99999 88888' }],
          },
        },
      ],
      history: [
        {
          type: 'Feedback',
          details: {
            result: 'Interested in Negotiation',
            reason: 'Price slightly high',
          },
          date: '2026-10-25T10:00:00.000Z',
        },
      ],
      followUpDate: '2026-11-05T00:00:00.000Z',
      assignedTo: 'user-001',
      team: 'team-001',
      updatedAt: '2026-10-26T14:30:00.000Z',
    },
    {
      _id: 'inv-002',
      unitNo: 'B-202',
      status: 'InActive',
      primaryDealIntent: 'rent',
      category: 'Commercial',
      subCategory: 'Office Space',
      isTwoSideOpen: true,
      totalLandAreaText: '2500 Sq.Ft.',
      projectName: 'Cyber City Hub',
      block: 'Building 10',
      address: {
        locality: 'DLF Phase 2',
        city: 'Gurugram',
      },
      orientation: 'South',
      owners: [
        {
          _id: 'owner-102',
          name: 'Anita Desai',
          phones: [{ number: '+91 98222 33344' }],
        },
      ],
      associates: [],
      history: [],
      assignedTo: 'user-002',
      team: 'team-002',
      updatedAt: '2026-10-24T11:00:00.000Z',
    },
    {
      _id: 'inv-003',
      unitNo: 'C-303',
      status: 'Active',
      primaryDealIntent: 'lease',
      category: 'Industrial',
      subCategory: 'Warehouse',
      sizeConfig: '500 Sq Yd',
      projectName: 'Manesar Logistic Park',
      address: {
        location: 'Sector 8 IMT',
        city: 'Manesar',
      },
      owners: [
        {
          name: 'Deepak Verma',
          ownerPhone: '+91 98333 44455',
        },
      ],
      associates: [],
      history: [],
      assignedTo: { fullName: 'Direct Agent' },
      team: ['team-001', 'team-002'],
      updatedAt: '2026-10-20T08:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useUsers.mockReturnValue({ data: mockUsers });
    useTeams.mockReturnValue({ data: mockTeams });
    useInventories.mockReturnValue({
      data: {
        records: mockInventoryItems,
        totalCount: 3,
        totalPages: 1,
        activeCount: 2,
        inactiveCount: 1,
        categoryStats: [
          { category: 'Residential', count: 1 },
          { category: 'Commercial', count: 1 },
          { category: 'Industrial', count: 1 },
        ],
      },
      isLoading: false,
    });
  });

  // ─── A. PAGE AND DATA RENDERING ─────────────────────────────────────────────

  describe('A. Page and Column Data Rendering', () => {
    it('renders inventory table with all 8 column headers and representative records', () => {
      renderInventoryPage();

      // Check 8 table headers
      expect(screen.getByText('Property Details')).toBeInTheDocument();
      expect(screen.getByText('Project & Location')).toBeInTheDocument();
      expect(screen.getByText('Orientation')).toBeInTheDocument();
      expect(screen.getByText('Owner Profile')).toBeInTheDocument();
      expect(screen.getByText('Associate Contact')).toBeInTheDocument();
      expect(screen.getByText('Interaction')).toBeInTheDocument();
      expect(screen.getByText('Assignment')).toBeInTheDocument();

      // Unit numbers rendered
      expect(screen.getByText('A-101')).toBeInTheDocument();
      expect(screen.getByText('B-202')).toBeInTheDocument();
      expect(screen.getByText('C-303')).toBeInTheDocument();
    });

    it('formats Property Details column with category, unit type, and size formatting', () => {
      renderInventoryPage();

      // Unit type chips
      expect(screen.getByText('CORNER')).toBeInTheDocument();
      expect(screen.getByText('TWO SIDE OPEN')).toBeInTheDocument();

      // Categories and Subcategories
      expect(screen.getByText(/Residential \| Apartment/i)).toBeInTheDocument();
      expect(screen.getByText(/Commercial \| Office Space/i)).toBeInTheDocument();
      expect(screen.getByText(/Industrial \| Warehouse/i)).toBeInTheDocument();

      // Size Master and Land Area formatting
      expect(screen.getByText('4 BHK Luxury - 3500 Sq.Ft.')).toBeInTheDocument();
      expect(screen.getByText('2500 Sq.Ft.')).toBeInTheDocument();
      expect(screen.getByText('500 Sq Yd')).toBeInTheDocument();
    });

    it('formats Project and Location details including Block tag and Pincode', () => {
      renderInventoryPage();

      expect(screen.getByText('DLF The Camellias')).toBeInTheDocument();
      expect(screen.getByText(/Golf Course Road, Gurugram - 122002/i)).toBeInTheDocument();
      expect(screen.getByText('BLOCK: Tower 1')).toBeInTheDocument();

      expect(screen.getByText('Cyber City Hub')).toBeInTheDocument();
      expect(screen.getByText('BLOCK: Building 10')).toBeInTheDocument();

      expect(screen.getByText('Manesar Logistic Park')).toBeInTheDocument();
    });

    it('formats Orientation, Direction, and Road Width icons and labels', () => {
      renderInventoryPage();

      expect(screen.getByText('North-East')).toBeInTheDocument();
      expect(screen.getByText('East')).toBeInTheDocument();
      expect(screen.getByText('60 Meter')).toBeInTheDocument();
      expect(screen.getByText('South')).toBeInTheDocument();
    });

    it('formats Owner Profile with name, phone, and nested address', () => {
      renderInventoryPage();

      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
      expect(screen.getByText('+91 98111 22233')).toBeInTheDocument();
      expect(screen.getByText(/12, MG Road, Sector 29, Gurugram, 122001/i)).toBeInTheDocument();

      expect(screen.getByText('Anita Desai')).toBeInTheDocument();
      expect(screen.getByText('+91 98222 33344')).toBeInTheDocument();

      expect(screen.getByText('Deepak Verma')).toBeInTheDocument();
    });

    it('formats Associate Contact and displays double dash (--) when absent', () => {
      renderInventoryPage();

      expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
      expect(screen.getByText('+91 99999 88888')).toBeInTheDocument();

      // inv-002 and inv-003 have no associates, displaying '--'
      const dashes = screen.getAllByText('--');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('formats Interaction column with Active/Inactive badge, feedback, and follow-up', () => {
      renderInventoryPage();

      // Feedback outcome and reason
      expect(screen.getByText('Interested in Negotiation')).toBeInTheDocument();
      expect(screen.getByText('(Price slightly high)')).toBeInTheDocument();
      expect(screen.getByText(/Follow-up:/i)).toBeInTheDocument();

      // Fallback for record without feedback
      const noFeedback = screen.getAllByText('No Recent Feedback');
      expect(noFeedback.length).toBeGreaterThanOrEqual(1);
    });

    it('formats Assignment column with user avatar initials, user name, and team name', () => {
      renderInventoryPage();

      expect(screen.getByText('Amit Verma')).toBeInTheDocument();
      expect(screen.getByText('Sales Core')).toBeInTheDocument();

      expect(screen.getByText('Sanjay Gupta')).toBeInTheDocument();
      expect(screen.getByText('Commercial Leasing')).toBeInTheDocument();

      // Multi-team fallback string
      expect(screen.getByText('Sales Core, Commercial Leasing')).toBeInTheDocument();
      expect(screen.getByText('Direct Agent')).toBeInTheDocument();
    });
  });

  // ─── B. DATA QUERYING AND SERVER-SIDE PAGINATION ───────────────────────────

  describe('B. Data Querying and Server-Side Pagination', () => {
    it('passes default pagination, sort, and status parameters to useInventories', () => {
      renderInventoryPage();

      expect(useInventories).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 25,
          sortBy: 'unitNo',
          sortOrder: 1,
          statusCategory: '',
        }),
        expect.any(Object)
      );
    });

    it('updates limit parameter when changing records-per-page select dropdown', () => {
      renderInventoryPage();

      const perPageSelect = screen.getByRole('combobox');
      fireEvent.change(perPageSelect, { target: { value: '50' } });

      expect(useInventories).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 50,
        }),
        expect.any(Object)
      );
    });

    it('displays total records count accurately', () => {
      renderInventoryPage();

      expect(screen.getByText(/Total:/i)).toBeInTheDocument();
      expect(screen.getByText(/3 Properties/i)).toBeInTheDocument();
    });

    it('passes statusCategory parameter when clicking Active and Inactive tabs', () => {
      renderInventoryPage();

      // Click Inactive tab
      const inactiveTab = screen.getByText(/Inactive \(1\)/i);
      fireEvent.click(inactiveTab);

      expect(useInventories).toHaveBeenLastCalledWith(
        expect.objectContaining({
          statusCategory: 'InActive',
        }),
        expect.any(Object)
      );

      // Click Active tab
      const activeTab = screen.getByText(/Active \(2\)/i);
      fireEvent.click(activeTab);

      expect(useInventories).toHaveBeenLastCalledWith(
        expect.objectContaining({
          statusCategory: 'Active',
        }),
        expect.any(Object)
      );
    });

    it('passes search term only when length is at least 2 characters', () => {
      renderInventoryPage();

      const searchInput = screen.getByPlaceholderText('Search by ID, Project or Owner...');

      // 1 char: search should be undefined
      fireEvent.change(searchInput, { target: { value: 'D' } });
      expect(useInventories).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: undefined,
        }),
        expect.any(Object)
      );

      // >= 2 chars: search passed
      fireEvent.change(searchInput, { target: { value: 'DLF' } });
      expect(useInventories).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: 'DLF',
        }),
        expect.any(Object)
      );
    });
  });

  // ─── C. SELECTION AND BULK ACTIONS ─────────────────────────────────────────

  describe('C. Selection and Bulk Actions', () => {
    it('manages individual selection and select-all toggle', () => {
      renderInventoryPage();

      const checkboxes = screen.getAllByRole('checkbox');
      // Index 0: Select All, Index 1: inv-001, Index 2: inv-002, Index 3: inv-003
      expect(checkboxes.length).toBe(4);

      // Select inv-001
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('1 Selected')).toBeInTheDocument();

      // Select inv-002 (total 2)
      fireEvent.click(checkboxes[2]);
      expect(screen.getByText('2 Selected')).toBeInTheDocument();

      // Deselect inv-001 (total 1)
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText('1 Selected')).toBeInTheDocument();

      // Select all
      fireEvent.click(checkboxes[0]);
      expect(screen.getByText('3 Selected')).toBeInTheDocument();

      // Clear all
      fireEvent.click(checkboxes[0]);
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();
    });

    it('reveals single-item action buttons when exactly 1 property is selected', () => {
      const mockOnAddActivity = vi.fn();
      renderInventoryPage({ onAddActivity: mockOnAddActivity });

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // select inv-001

      expect(screen.getByTitle('Edit Property')).toBeInTheDocument();
      expect(screen.getByTitle('Add Activity')).toBeInTheDocument();
      expect(screen.getByTitle('Create Deal')).toBeInTheDocument();
      expect(screen.getByTitle('Match Lead')).toBeInTheDocument();
      expect(screen.getByTitle('Message Owner')).toBeInTheDocument();
      expect(screen.getByTitle('Email Owner')).toBeInTheDocument();
      expect(screen.getByTitle('Upload Files')).toBeInTheDocument();
      expect(screen.getByTitle('Manage Documents')).toBeInTheDocument();
      expect(screen.getByTitle('Feedback')).toBeInTheDocument();

      // Click Add Activity button
      const activityBtn = screen.getByTitle('Add Activity');
      fireEvent.click(activityBtn);
      expect(mockOnAddActivity).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'inv-001', type: 'Inventory' }),
        ]),
        expect.objectContaining({ inventory: expect.objectContaining({ _id: 'inv-001' }) })
      );
    });

    it('triggers bulk delete mutation when confirmed from bulk actions toolbar', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderInventoryPage();

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // select inv-001
      fireEvent.click(checkboxes[2]); // select inv-002

      expect(screen.getByText('2 Selected')).toBeInTheDocument();

      const deleteBtn = screen.getByTitle('Delete');
      await act(async () => {
        fireEvent.click(deleteBtn);
      });

      expect(confirmSpy).toHaveBeenCalledWith('Delete 2 properties?');
      expect(mockBulkDeleteInventory).toHaveBeenCalledWith({
        ids: ['inv-001', 'inv-002'],
      });

      confirmSpy.mockRestore();
    });

    it('opens Create Deal, Message, and Email modals from selection toolbar', () => {
      renderInventoryPage();

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // select inv-001

      // Deal modal
      fireEvent.click(screen.getByTitle('Create Deal'));
      expect(screen.getByTestId('add-deal-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close Deal'));

      // Message modal
      fireEvent.click(screen.getByTitle('Message Owner'));
      expect(screen.getByTestId('send-message-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close Message'));

      // Email modal
      fireEvent.click(screen.getByTitle('Email Owner'));
      expect(screen.getByTestId('compose-email-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close Email'));
    });

    it('triggers inventory matching event when clicking Match in toolbar', () => {
      renderInventoryPage();

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // select inv-001

      const matchBtn = screen.getByTitle('Match Lead');
      fireEvent.click(matchBtn);

      expect(mockFireEvent).toHaveBeenCalledWith(
        'inventory_matching_requested',
        expect.objectContaining({ _id: 'inv-001' })
      );
    });
  });

  // ─── D. INTERACTIVE NAVIGATION TARGETS & CLICK ISOLATION ───────────────────

  describe('D. Interactive Navigation Targets & Click Isolation', () => {
    it('navigates to inventory-detail route when clicking unit number badge', () => {
      const mockOnNavigate = vi.fn();
      renderInventoryPage({ onNavigate: mockOnNavigate });

      const unitBadge = screen.getByText('A-101');
      fireEvent.click(unitBadge);

      expect(mockOnNavigate).toHaveBeenCalledWith('inventory-detail', 'inv-001');
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();
    });

    it('navigates to contact-detail route when clicking owner name link', () => {
      const mockOnNavigate = vi.fn();
      renderInventoryPage({ onNavigate: mockOnNavigate });

      const ownerName = screen.getByText('Rajesh Kumar');
      fireEvent.click(ownerName);

      expect(mockOnNavigate).toHaveBeenCalledWith('contact-detail', 'owner-101');
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();
    });

    it('navigates to contact-detail route when clicking associate contact link', () => {
      const mockOnNavigate = vi.fn();
      renderInventoryPage({ onNavigate: mockOnNavigate });

      const assocName = screen.getByText('Priya Sharma');
      fireEvent.click(assocName);

      expect(mockOnNavigate).toHaveBeenCalledWith('contact-detail', 'assoc-201');
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();
    });

    it('toggles selection when clicking anywhere on row under existing InventoryTable implementation', () => {
      renderInventoryPage();

      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();

      // Click on row cell (e.g. DLF The Camellias)
      const projectCell = screen.getByText('DLF The Camellias');
      fireEvent.click(projectCell);

      // In existing InventoryTable, row click toggles selection
      expect(screen.getByText('1 Selected')).toBeInTheDocument();

      // Clicking again toggles off
      fireEvent.click(projectCell);
      expect(screen.queryByText(/Selected/i)).not.toBeInTheDocument();
    });
  });

  // ─── E. VISUAL STATE & ALTERNATE VIEWS ─────────────────────────────────────

  describe('E. Visual State and Alternate Views', () => {
    it('renders empty state feedback when inventory records are empty', () => {
      useInventories.mockReturnValue({
        data: {
          records: [],
          totalCount: 0,
          totalPages: 1,
          activeCount: 0,
          inactiveCount: 0,
        },
        isLoading: false,
      });

      renderInventoryPage();

      expect(screen.getByText('No inventory found matching your criteria.')).toBeInTheDocument();
      expect(screen.getByText('No inventory records found.')).toBeInTheDocument();
    });

    it('renders loading spinner overlay when data is refreshing', () => {
      useInventories.mockReturnValue({
        data: { records: mockInventoryItems, totalCount: 3, totalPages: 1 },
        isLoading: true,
      });

      renderInventoryPage();

      expect(screen.getByText('REFRESHING INVENTORY...')).toBeInTheDocument();
    });

    it('switches between List View and Map View seamlessly', () => {
      renderInventoryPage();

      // Initially in List View
      expect(screen.getByText('Property Details')).toBeInTheDocument();
      expect(screen.queryByTestId('professional-map')).not.toBeInTheDocument();

      // Switch to Map View
      const mapBtn = screen.getByRole('button', { name: /Map View/i });
      fireEvent.click(mapBtn);

      expect(screen.getByTestId('professional-map')).toBeInTheDocument();
      expect(screen.getByTestId('inventory-map-list')).toBeInTheDocument();

      // Switch back to List View
      const listBtn = screen.getByRole('button', { name: /List View/i });
      fireEvent.click(listBtn);

      expect(screen.getByText('Property Details')).toBeInTheDocument();
      expect(screen.queryByTestId('professional-map')).not.toBeInTheDocument();
    });
  });
});
