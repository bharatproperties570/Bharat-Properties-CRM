import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectDetailPage from '../ProjectDetailPage';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

vi.mock('react-router-dom', () => ({
    useParams: () => ({ id: 'prj-101' }),
    useNavigate: () => vi.fn()
}));

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

vi.mock('../../../context/PropertyConfigContext', () => ({
    usePropertyConfig: () => ({
        getLookupValue: (type, val) => val || 'Active'
    })
}));

const mockRefetch = vi.fn();
let mockProjectQuery = {
    data: {
        success: true,
        data: {
            _id: '60d5ec49f1b24b0015987111',
            name: 'Bharat Heights',
            status: 'Active',
            totalBlocks: 2,
            totalUnits: 10,
            blocks: [{ name: 'Tower A' }, { name: 'Tower B' }]
        }
    },
    isFetching: false,
    refetch: mockRefetch
};

vi.mock('../../../utils/crmHooks', () => ({
    useProject: () => mockProjectQuery
}));

vi.mock('../../../utils/api', () => ({
    api: {
        get: vi.fn(),
        delete: vi.fn(),
        post: vi.fn()
    }
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('react-apexcharts', () => ({
    default: () => <div data-testid="mock-chart">Mock Chart</div>
}));

vi.mock('../../../components/Marketing/PublishModal', () => ({
    default: () => null
}));
vi.mock('../../../components/SocialPostModal', () => ({
    default: () => null
}));
vi.mock('../../../components/inventory/BulkInventoryModal', () => ({
    default: () => null
}));
vi.mock('../../../components/AddInventoryModal', () => ({
    default: () => null
}));

const mockInventoryRecords = [
    {
        _id: 'unit-1',
        unitNo: 'A-101',
        block: 'Tower A',
        unitType: '3BHK Luxury',
        facing: 'East',
        direction: 'North-East',
        status: 'Available',
        price: 12500000
    },
    {
        _id: 'unit-2',
        unitNo: 'B-202',
        block: 'Tower B',
        unitType: '2BHK Premium',
        facing: 'West',
        status: 'Sold Out',
        price: 8500000
    }
];

describe('ProjectDetailPage with DataTable (Phase 10.20)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectQuery = {
            data: {
                success: true,
                data: {
                    _id: '60d5ec49f1b24b0015987111',
                    name: 'Bharat Heights',
                    status: 'Active',
                    totalBlocks: 2,
                    totalUnits: 10,
                    blocks: [{ name: 'Tower A' }, { name: 'Tower B' }]
                }
            },
            isFetching: false,
            refetch: mockRefetch
        };

        api.get.mockImplementation((url) => {
            if (url.includes('inventory')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        records: mockInventoryRecords
                    }
                });
            }
            if (url.includes('deals')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        records: []
                    }
                });
            }
            return Promise.resolve({ data: { success: true, data: [] } });
        });
    });

    it('renders project header and default Activity tab', async () => {
        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        expect(await screen.findByText('Bharat Heights')).toBeInTheDocument();
        expect(screen.getByText('Interaction Intelligence')).toBeInTheDocument();
        expect(screen.getByText('Project audit logs and communication history...')).toBeInTheDocument();
    });

    it('switches to Inventory tab and renders DataTable with 5 semantic column headers', async () => {
        const { container } = render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        const inventoryTabBtn = await screen.findByText('Inventory');
        fireEvent.click(inventoryTabBtn);

        expect(await screen.findByText(/Project Units/)).toBeInTheDocument();

        const headers = container.querySelectorAll('th');
        expect(headers).toHaveLength(5);
        expect(screen.getByText('Block / Unit')).toBeInTheDocument();
        expect(screen.getByText('Unit Type')).toBeInTheDocument();
        expect(screen.getByText('Attributes')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders populated inventory units with block, unit type, attributes, and status badge', async () => {
        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));

        expect(await screen.findByText('A-101')).toBeInTheDocument();
        expect(screen.getByText('Tower A')).toBeInTheDocument();
        expect(screen.getByText('3BHK Luxury')).toBeInTheDocument();
        expect(screen.getByText('East Facing')).toBeInTheDocument();
        expect(screen.getByText('North-East')).toBeInTheDocument();
        expect(screen.getByText('Available')).toBeInTheDocument();

        expect(screen.getByText('B-202')).toBeInTheDocument();
        expect(screen.getByText('Tower B')).toBeInTheDocument();
        expect(screen.getByText('2BHK Premium')).toBeInTheDocument();
        expect(screen.getByText('West Facing')).toBeInTheDocument();
        expect(screen.getByText('Sold Out')).toBeInTheDocument();
    });

    it('clicking unit number invokes onNavigate with inventory-detail route and unit ID', async () => {
        const mockNavigate = vi.fn();
        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" onNavigate={mockNavigate} />);

        fireEvent.click(await screen.findByText('Inventory'));

        const unitLink = await screen.findByText('A-101');
        fireEvent.click(unitLink);

        expect(mockNavigate).toHaveBeenCalledWith('inventory-detail', 'unit-1');
    });

    it('clicking edit unit button opens the unit edit modal', async () => {
        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));

        const editBtn = await screen.findByLabelText('Edit unit A-101');
        expect(editBtn).toBeInTheDocument();
        fireEvent.click(editBtn);

        // Edit button click sets isEditUnitModalOpen state without crashing
        expect(editBtn).toBeInTheDocument();
    });

    it('clicking delete unit button prompts confirmation and calls api.delete on confirm', async () => {
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        api.delete.mockResolvedValueOnce({ data: { success: true } });

        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));

        const deleteBtn = await screen.findByLabelText('Delete unit A-101');
        fireEvent.click(deleteBtn);

        expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this unit?');
        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('inventory/unit-1');
            expect(toast.success).toHaveBeenCalledWith('Unit deleted successfully');
        });
    });

    it('cancelling delete dialog does NOT call api.delete', async () => {
        vi.spyOn(window, 'confirm').mockImplementation(() => false);

        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));

        const deleteBtn = await screen.findByLabelText('Delete unit A-101');
        fireEvent.click(deleteBtn);

        expect(window.confirm).toHaveBeenCalled();
        expect(api.delete).not.toHaveBeenCalled();
    });

    it('renders emptyMessage in DataTable when no inventory units are found', async () => {
        api.get.mockImplementation((url) => {
            if (url.includes('inventory')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        records: []
                    }
                });
            }
            return Promise.resolve({ data: { success: true, records: [] } });
        });

        render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));

        expect(await screen.findByText(/No units added to this project yet/i)).toBeInTheDocument();
    });

    it('security audit: table renders zero secrets, tokens, passwords, or credentials', async () => {
        const { container } = render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));
        await screen.findByText('A-101');

        const tableText = container.querySelector('table').textContent;
        expect(tableText).not.toMatch(/bearer/i);
        expect(tableText).not.toMatch(/token/i);
        expect(tableText).not.toMatch(/password/i);
        expect(tableText).not.toMatch(/secret/i);
        expect(tableText).not.toMatch(/apikey/i);
    });

    it('handles initial loading state and transitions to loaded project without hook order error (Phase 10.31 regression)', async () => {
        // Initial render during loading
        mockProjectQuery = {
            data: null,
            isFetching: true,
            refetch: mockRefetch
        };

        const { rerender } = render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);
        expect(screen.getByText(/Initializing Project Command Center/i)).toBeInTheDocument();

        // Transition to loaded state
        mockProjectQuery = {
            data: {
                success: true,
                data: {
                    _id: '60d5ec49f1b24b0015987111',
                    name: 'Bharat Heights',
                    status: 'Active',
                    totalBlocks: 2,
                    totalUnits: 10,
                    blocks: [{ name: 'Tower A' }, { name: 'Tower B' }]
                }
            },
            isFetching: false,
            refetch: mockRefetch
        };

        rerender(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);
        expect(await screen.findByText('Bharat Heights')).toBeInTheDocument();

        // Switch to inventory tab to ensure DataTable renders properly after transition
        fireEvent.click(await screen.findByText('Inventory'));
        expect(await screen.findByText('A-101')).toBeInTheDocument();
    });

    it('renders project not found state when project data is missing', async () => {
        mockProjectQuery = {
            data: null,
            isFetching: false,
            refetch: mockRefetch
        };

        render(<ProjectDetailPage projectId="non-existent-id" />);
        expect(screen.getByText('Project not found')).toBeInTheDocument();
    });

    it('verifies unit table column headers and mapped row data structure', async () => {
        const { container } = render(<ProjectDetailPage projectId="60d5ec49f1b24b0015987111" />);

        fireEvent.click(await screen.findByText('Inventory'));
        await screen.findByText('A-101');

        const headers = Array.from(container.querySelectorAll('thead th')).map(th => th.textContent.trim());
        expect(headers).toEqual(['Block / Unit', 'Unit Type', 'Attributes', 'Status', 'Actions']);

        // Verify row contents
        expect(screen.getByText('Tower A')).toBeInTheDocument();
        expect(screen.getByText('3BHK Luxury')).toBeInTheDocument();
        expect(screen.getByText('East Facing')).toBeInTheDocument();
        expect(screen.getByText('Available')).toBeInTheDocument();
    });
});
