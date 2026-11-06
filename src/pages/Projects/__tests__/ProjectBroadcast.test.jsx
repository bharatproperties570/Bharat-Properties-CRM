import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectDetailPage from '../ProjectDetailPage';

vi.mock('react-router-dom', () => ({
    useParams: () => ({ id: 'proj_789' }),
    useNavigate: () => vi.fn()
}));

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

vi.mock('../../../context/PropertyConfigContext', () => ({
    usePropertyConfig: () => ({
        getLookupValue: vi.fn((type, val) => val || 'Active')
    })
}));

const mockProject = {
    _id: 'proj_789',
    name: 'Godrej Palm Retreat',
    status: 'Active',
    reraNumber: 'RC/REP/HARERA/GGM/2024/11',
    address: { location: 'Sector 150, Noida Express' },
    blocks: [{ name: 'Tower 1' }],
    pricing: {
        basePrice: { amount: 15000000, unit: 'total' }
    }
};

let capturedModalProps = null;
vi.mock('../components/ProjectBroadcastModal', () => ({
    default: (props) => {
        capturedModalProps = props;
        return props.isOpen ? <div data-testid="project-broadcast-modal-open">Broadcast Active</div> : null;
    }
}));

vi.mock('../components/ProjectWebsiteModal', () => ({ default: () => null }));
vi.mock('../../../components/SocialPostModal', () => ({ default: () => null }));
vi.mock('../../../components/inventory/BulkInventoryModal', () => ({ default: () => null }));
vi.mock('../../../components/AddInventoryModal', () => ({ default: () => null }));
vi.mock('../../../components/AddProjectPriceModal', () => ({ default: () => null }));
vi.mock('../components/ProjectKPIStrip', () => ({ default: () => null }));
vi.mock('../components/ProjectPricingSection', () => ({ default: () => null }));
vi.mock('../components/ProjectDocumentsSection', () => ({ default: () => null }));
vi.mock('../components/ProjectLeadsTab', () => ({ default: () => null }));
vi.mock('../components/ProjectActivityTab', () => ({ default: () => null }));
vi.mock('../components/ProjectAnalyticsTab', () => ({ default: () => null }));
vi.mock('../components/ProjectInventoryTab', () => ({ default: () => null }));
vi.mock('../components/ProjectDealsTab', () => ({ default: () => null }));

vi.mock('../../../utils/crmHooks', () => ({
    useProject: () => ({
        data: { success: true, data: mockProject },
        isFetching: false,
        refetch: vi.fn()
    }),
    useUpdateProjectMutation: () => ({
        mutateAsync: vi.fn().mockResolvedValue({ success: true })
    })
}));

vi.mock('../../../utils/api', () => ({
    api: {
        get: vi.fn().mockReturnValue(new Promise(() => {})), // Stay pending to avoid unhandled microtasks
        post: vi.fn().mockResolvedValue({ data: { success: true } }),
        put: vi.fn().mockResolvedValue({ data: { success: true } }),
        delete: vi.fn().mockResolvedValue({ data: { success: true } })
    }
}));

describe('ProjectDetailPage: Omnichannel Broadcast Integration', () => {
    beforeEach(() => {
        capturedModalProps = null;
        vi.clearAllMocks();
    });

    it('renders the "Broadcast Project" primary action button in header', () => {
        render(<ProjectDetailPage projectId="proj_789" />);

        const broadcastBtn = screen.getByRole('button', { name: /Broadcast Project/i });
        expect(broadcastBtn).toBeInTheDocument();
        expect(broadcastBtn.getAttribute('title')).toContain('Broadcast project to Matched Prospects');
    });

    it('triggers ProjectBroadcastModal when "Broadcast Project" is clicked', () => {
        render(<ProjectDetailPage projectId="proj_789" />);

        const broadcastBtn = screen.getByRole('button', { name: /Broadcast Project/i });
        fireEvent.click(broadcastBtn);

        expect(screen.getByTestId('project-broadcast-modal-open')).toBeInTheDocument();
        expect(capturedModalProps).not.toBeNull();
        expect(capturedModalProps.isOpen).toBe(true);
        expect(capturedModalProps.project).toEqual(expect.objectContaining({
            _id: 'proj_789',
            name: 'Godrej Palm Retreat'
        }));
    });

    it('triggers ProjectBroadcastModal from the Three-Dot operations menu', () => {
        render(<ProjectDetailPage projectId="proj_789" />);

        // Open three-dot menu
        const menuBtn = screen.getByTitle('Quick Actions Menu');
        fireEvent.click(menuBtn);

        // Click "Omnichannel Broadcast" menu item
        const menuItem = screen.getByText('Omnichannel Broadcast');
        expect(menuItem).toBeInTheDocument();
        fireEvent.click(menuItem);

        expect(screen.getByTestId('project-broadcast-modal-open')).toBeInTheDocument();
        expect(capturedModalProps.isOpen).toBe(true);
        expect(capturedModalProps.project._id).toBe('proj_789');
    });
});
