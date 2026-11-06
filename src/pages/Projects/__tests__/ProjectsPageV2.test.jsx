import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectsPage from '../ProjectsPageV2';

const mockProject = {
    _id: 'proj_999',
    name: 'M3M Crown Luxury',
    status: 'Ready to Move',
    category: ['Residential'],
    blocks: [{ name: 'Tower A' }],
    address: { location: 'Sector 111, Gurgaon' },
    isPublished: true,
    publishedAt: '2026-11-01T10:00:00.000Z',
    team: [{ _id: 'team_1', name: 'Sales Alpha' }]
};

vi.mock('../../../hooks/useProjectList', () => ({
    useProjectList: () => ({
        projects: [mockProject],
        loading: false,
        totalRecords: 1,
        totalPages: 1,
        currentPage: 1,
        setCurrentPage: vi.fn(),
        recordsPerPage: 10,
        setRecordsPerPage: vi.fn(),
        searchTerm: '',
        setSearchTerm: vi.fn(),
        filters: {},
        setFilters: vi.fn(),
        sortConfig: { label: 'A-Z Name', by: 'name', order: 1 },
        setSortConfig: vi.fn(),
        setProjects: vi.fn(),
        refresh: vi.fn()
    })
}));

vi.mock('../../../utils/crmHooks', () => ({
    useTeams: () => ({ data: [{ _id: 'team_1', name: 'Sales Alpha' }] }),
    useDeleteProjectMutation: () => ({ mutateAsync: vi.fn() }),
    useUpdateProjectMutation: () => ({ mutateAsync: vi.fn() })
}));

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

vi.mock('../../../context/UserContext', () => ({
    useUserContext: () => ({ currentUser: { role: 'admin' } })
}));

vi.mock('../../../context/PropertyConfigContext', () => ({
    usePropertyConfig: () => ({
        getLookupValue: vi.fn((type, val) => val || 'Ready to Move')
    })
}));

vi.mock('../../../hooks/usePermissions', () => ({
    default: () => ({ hasPermission: () => true }),
    PermissionGate: ({ children }) => children
}));

let capturedWebsiteProps = null;
vi.mock('../components/ProjectWebsiteModal', () => ({
    default: (props) => {
        capturedWebsiteProps = props;
        return props.isOpen ? <div data-testid="project-website-modal-open">Website Modal Active</div> : null;
    }
}));

let capturedBroadcastProps = null;
vi.mock('../components/ProjectBroadcastModal', () => ({
    default: (props) => {
        capturedBroadcastProps = props;
        return props.isOpen ? <div data-testid="project-broadcast-modal-open">Broadcast Modal Active</div> : null;
    }
}));

let capturedSocialProps = null;
vi.mock('../../../components/SocialPostModal', () => ({
    default: (props) => {
        capturedSocialProps = props;
        return props.isOpen ? <div data-testid="social-promote-modal-open">Promote Modal Active</div> : null;
    }
}));

vi.mock('../../../components/AddProjectModal', () => ({ default: () => null }));
vi.mock('../../../components/AddProjectPriceModal', () => ({ default: () => null }));
vi.mock('../../../components/UploadModal', () => ({ default: () => null }));
vi.mock('../../../components/AddDocumentModal', () => ({ default: () => null }));
vi.mock('../components/ProjectFilterPanel', () => ({ default: () => null }));
vi.mock('../../../components/ProfessionalMap', () => ({ default: () => null }));
vi.mock('../../../components/PremiumSearchBar', () => ({ default: () => <input placeholder="search" /> }));

describe('ProjectsPageV2 - Action Toolbar Alignment (Broadcast, Promote, Publish)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedWebsiteProps = null;
        capturedBroadcastProps = null;
        capturedSocialProps = null;
    });

    it('renders project row and reveals Broadcast, Promote, and Publish toolbar action buttons on selection', () => {
        render(<ProjectsPage onNavigate={vi.fn()} />);

        // Project name is rendered
        expect(screen.getByText('M3M Crown Luxury')).toBeInTheDocument();

        // Select the project via checkbox
        const checkbox = screen.getAllByRole('checkbox')[1]; // item checkbox
        fireEvent.click(checkbox);

        // Action panel shows 1 Selected
        expect(screen.getByText('1 Selected')).toBeInTheDocument();

        // Action buttons are present
        expect(screen.getByRole('button', { name: /broadcast/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
    });

    it('clicking Broadcast button opens ProjectBroadcastModal with selected project', () => {
        render(<ProjectsPage onNavigate={vi.fn()} />);

        const checkbox = screen.getAllByRole('checkbox')[1];
        fireEvent.click(checkbox);

        const broadcastBtn = screen.getByRole('button', { name: /broadcast/i });
        fireEvent.click(broadcastBtn);

        expect(screen.getByTestId('project-broadcast-modal-open')).toBeInTheDocument();
        expect(capturedBroadcastProps.isOpen).toBe(true);
        expect(capturedBroadcastProps.project._id).toBe(mockProject._id);
    });

    it('clicking Promote button opens SocialPostModal with selected project data', () => {
        render(<ProjectsPage onNavigate={vi.fn()} />);

        const checkbox = screen.getAllByRole('checkbox')[1];
        fireEvent.click(checkbox);

        const promoteBtn = screen.getByRole('button', { name: /promote/i });
        fireEvent.click(promoteBtn);

        expect(screen.getByTestId('social-promote-modal-open')).toBeInTheDocument();
        expect(capturedSocialProps.isOpen).toBe(true);
        expect(capturedSocialProps.initialData.name).toBe(mockProject.name);
        expect(capturedSocialProps.initialData.id).toBe(mockProject._id);
    });

    it('clicking Publish button opens ProjectWebsiteModal with selected project data', () => {
        render(<ProjectsPage onNavigate={vi.fn()} />);

        const checkbox = screen.getAllByRole('checkbox')[1];
        fireEvent.click(checkbox);

        const publishBtn = screen.getByRole('button', { name: /publish/i });
        fireEvent.click(publishBtn);

        expect(screen.getByTestId('project-website-modal-open')).toBeInTheDocument();
        expect(capturedWebsiteProps.isOpen).toBe(true);
        expect(capturedWebsiteProps.project._id).toBe(mockProject._id);
    });
});
