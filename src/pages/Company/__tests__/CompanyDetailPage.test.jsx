import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompanyDetailPage from '../CompanyDetailPage';
import { api } from '../../../utils/api';

vi.mock('react-router-dom', () => ({
    useParams: () => ({ id: 'comp-101' }),
    useNavigate: () => vi.fn()
}));

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false }),
    ThemeProvider: ({ children }) => children,
}));

vi.mock('react-apexcharts', () => ({
    default: () => <div data-testid="mock-chart">Mock Chart</div>
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

const mockCompany = {
    _id: 'comp-101',
    name: 'DLF CyberCity Developers',
    companyType: 'Developer',
    industry: 'Real Estate',
    source: 'Direct Mandate',
    gstNumber: '07AAAAA0000A1Z5',
    relationshipType: 'Tier 1 Partner',
    commissionAgreementStatus: 'Active',
    isPreferredPartner: true,
    creditLimit: 50000000,
    outstandingAmount: 1200000,
    partnerScore: 92,
    createdAt: '2025-01-01',
    updatedAt: '2026-01-01',
    owner: { name: 'Admin User' },
    agreementDetails: {
        agreementType: 'Exclusive Mandate',
        standardCommission: '2.5%',
        validUntil: '2027-12-31'
    },
    incentiveSlabs: [
        { slabName: 'Tier 1 Silver', minRevenue: 10000000, maxRevenue: 50000000, kicker: 0.5 },
        { slabName: 'Tier 2 Gold', minRevenue: 50000000, maxRevenue: 100000000, kicker: 1.0 }
    ],
    employees: [
        { name: 'Amit', surname: 'Verma', designation: 'VP Sales', phones: [{ phoneNumber: '9876543210' }] }
    ],
    documents: [
        { _id: 'doc-1', name: 'Master_Agreement.pdf', type: 'PDF', url: 'https://example.com/doc.pdf', uploadedAt: '2026-02-01' }
    ]
};

vi.mock('../../../utils/crmHooks', () => ({
    useCompany: () => ({
        data: mockCompany,
        isLoading: false
    })
}));

vi.mock('../../../utils/api', () => ({
    api: {
        get: vi.fn()
    }
}));

describe('CompanyDetailPage Component - DataTable Migration', () => {
    const mockOnNavigate = vi.fn();
    const mockOnAddProject = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        api.get.mockImplementation((url) => {
            if (url.startsWith('projects?developerId=')) {
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                _id: 'proj-1',
                                name: 'DLF Crest',
                                address: { locality: 'Sector 54, Golf Course Road' },
                                status: 'Active'
                            }
                        ]
                    }
                });
            }
            if (url.startsWith('deals?projectIds=')) {
                return Promise.resolve({
                    data: {
                        records: [
                            {
                                _id: 'deal-1',
                                dealId: 'DLF-D1',
                                projectName: 'DLF Crest',
                                unitNo: 'Tower A-402',
                                stage: 'Negotiation',
                                price: 15000000
                            }
                        ]
                    }
                });
            }
            if (url.startsWith('inventory?projectIds=')) {
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                _id: 'inv-1',
                                unitNo: 'Tower A-402',
                                projectName: 'DLF Crest',
                                status: 'Available',
                                price: 15000000
                            }
                        ]
                    }
                });
            }
            if (url.includes('associated-assets')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: {
                            properties: [],
                            deals: []
                        }
                    }
                });
            }
            return Promise.resolve({ data: {} });
        });
    });

    it('renders Linked Projects table with DataTable columns and data', async () => {
        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Sector 54, Golf Course Road')).toBeInTheDocument();
        });

        // DataTable column headers for Linked Projects
        expect(screen.getByRole('columnheader', { name: 'Project Name' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Location' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Launch Status' })).toBeInTheDocument();

        // Project name present across rendered tables
        expect(screen.getAllByText('DLF Crest').length).toBeGreaterThan(0);

        // Navigation button
        const viewBtn = screen.getByRole('button', { name: 'View' });
        expect(viewBtn).toBeInTheDocument();
        fireEvent.click(viewBtn);
        expect(mockOnNavigate).toHaveBeenCalledWith('project-detail', 'proj-1');
    });

    it('renders Linked Inventory table with DataTable columns and status', async () => {
        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Tower A-402')).toBeInTheDocument();
        });

        // DataTable column headers for Linked Inventory
        expect(screen.getByRole('columnheader', { name: 'Unit' })).toBeInTheDocument();
        expect(screen.getAllByRole('columnheader', { name: 'Project' }).length).toBeGreaterThan(0);
        expect(screen.getByRole('columnheader', { name: 'Price' })).toBeInTheDocument();
        expect(screen.getAllByText('Available').length).toBeGreaterThan(0);
    });

    it('renders Linked Deals table with DataTable columns and stage', async () => {
        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('DLF-D1')).toBeInTheDocument();
        });

        // DataTable column headers for Linked Deals
        expect(screen.getByRole('columnheader', { name: 'Deal ID' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Stage' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
        expect(screen.getByText('Negotiation')).toBeInTheDocument();
    });

    it('renders Documents tab with DataTable and document action', async () => {
        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('DLF CyberCity Developers')).toBeInTheDocument();
        });

        // Switch to Documents tab
        const documentsTabBtn = screen.getByRole('button', { name: /Documents/i });
        fireEvent.click(documentsTabBtn);

        // Verify Documents DataTable
        expect(screen.getByRole('columnheader', { name: 'Document Name' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Date Added' })).toBeInTheDocument();

        expect(screen.getByText('Master_Agreement.pdf')).toBeInTheDocument();
        expect(screen.getByText('View / Download')).toHaveAttribute('href', 'https://example.com/doc.pdf');
    });

    it('renders empty states when associated data arrays are empty', async () => {
        api.get.mockImplementation(() => Promise.resolve({ data: { data: [], records: [] } }));

        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('No projects registered under this developer.')).toBeInTheDocument();
        });

        expect(screen.getByText('No linked inventory.')).toBeInTheDocument();
        expect(screen.getByText('No linked deals.')).toBeInTheDocument();
    });

    it('retains specialized Incentive Slabs calculation table in Commission Structure tab', async () => {
        render(
            <CompanyDetailPage
                onBack={vi.fn()}
                onNavigate={mockOnNavigate}
                onAddProject={mockOnAddProject}
                onAddInventory={vi.fn()}
                onAddDeal={vi.fn()}
                onAddContact={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('DLF CyberCity Developers')).toBeInTheDocument();
        });

        // Switch to Commission tab
        const commissionTabBtn = screen.getByRole('button', { name: /Commission Structure/i });
        fireEvent.click(commissionTabBtn);

        expect(screen.getByText('Tier 1 Silver')).toBeInTheDocument();
        expect(screen.getByText('+0.5%')).toBeInTheDocument();
        expect(screen.getByText('Tier 2 Gold')).toBeInTheDocument();
        expect(screen.getByText('+1%')).toBeInTheDocument();
    });
});
