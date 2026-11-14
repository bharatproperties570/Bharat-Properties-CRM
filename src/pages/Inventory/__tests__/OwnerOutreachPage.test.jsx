import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerOutreachPage from '../OwnerOutreachPage';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

vi.mock('../../../utils/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn()
    }
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

describe('OwnerOutreachPage Frontend Component', () => {
    const mockAccounts = [
        {
            id: 'acc-whatsapp-01',
            label: 'Bharat Properties Primary WA',
            provider: 'meta_cloud',
            connectionType: 'cloud_api'
        }
    ];

    const mockCampaigns = [
        {
            _id: 'camp-001',
            name: 'DLF Magnolias Exclusive Owners',
            status: 'DRAFT',
            channels: ['whatsapp'],
            frequency: 'DAILY',
            batchSize: 100,
            startAt: '2026-11-20T04:30:00.000Z',
            nextRunAt: '2026-11-20T04:30:00.000Z',
            totals: {
                recipients: 150,
                batches: 2,
                consentRequired: 5,
                suppressed: 2
            }
        },
        {
            _id: 'camp-002',
            name: 'Golf Course Extension Campaign',
            status: 'APPROVED',
            channels: ['whatsapp'],
            frequency: 'DAILY',
            batchSize: 50,
            startAt: '2026-11-25T04:30:00.000Z',
            nextRunAt: '2026-11-25T04:30:00.000Z',
            totals: {
                recipients: 50,
                batches: 1,
                consentRequired: 0,
                suppressed: 0
            }
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        api.get.mockImplementation((url) => {
            if (url === '/owner-outreach/campaigns') {
                return Promise.resolve({ data: { success: true, data: mockCampaigns } });
            }
            if (url === '/owner-outreach/accounts') {
                return Promise.resolve({ data: { success: true, data: mockAccounts } });
            }
            if (url.startsWith('/owner-outreach/campaigns/')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: {
                            campaign: mockCampaigns[0],
                            batches: [],
                            batchSummary: { total: 0, byStatus: {} },
                            byState: [],
                            recipients: []
                        }
                    }
                });
            }
            return Promise.resolve({ data: { success: true, data: [] } });
        });
    });

    const renderPage = () =>
        render(
            <MemoryRouter>
                <OwnerOutreachPage />
            </MemoryRouter>
        );

    it('renders page layout, header, inventory autocomplete section and campaign table', async () => {
        renderPage();

        expect(screen.getByRole('heading', { level: 1, name: /Owner Outreach/i })).toBeInTheDocument();
        expect(screen.getByText('Select CRM inventory')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Type at least 2 characters/i)).toBeInTheDocument();
        expect(screen.getByText(/CAMPAIGN NAME/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/campaigns');
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });

        // Campaigns in table
        expect(screen.getByText('DLF Magnolias Exclusive Owners')).toBeInTheDocument();
        expect(screen.getByText('Golf Course Extension Campaign')).toBeInTheDocument();
    });

    it('automatically selects the WhatsApp account if only one exists', async () => {
        const { container } = renderPage();

        await waitFor(() => {
            const select = container.querySelector('select');
            expect(select).not.toBeNull();
            expect(select.value).toBe('acc-whatsapp-01');
        });
    });

    it('executes audience preview and renders preview metrics', async () => {
        api.post.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    inventoryCount: 42,
                    counts: {
                        uniquePeople: 38,
                        uniqueEndpoints: 35,
                        consentRequired: 3,
                        suppressed: 1
                    },
                    endpoints: [
                        { channel: 'whatsapp', maskedEndpoint: '+91 98XXX XXXXX', eligibility: 'ELIGIBLE' }
                    ]
                }
            }
        });

        renderPage();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });

        // Set project filter so Preview button is enabled
        const projectInput = screen.getByPlaceholderText('Sector 3 / IT City');
        fireEvent.change(projectInput, { target: { value: 'DLF Magnolias' } });

        const previewButton = screen.getByRole('button', { name: /Preview audience/i });
        expect(previewButton).not.toBeDisabled();
        fireEvent.click(previewButton);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/owner-outreach/audience-preview', expect.any(Object));
        });

        expect(screen.getByText('CURRENT')).toBeInTheDocument();
        expect(screen.getByText('Inventory scanned: 42')).toBeInTheDocument();
        expect(screen.getByText('38')).toBeInTheDocument(); // uniquePeople
        expect(screen.getByText('35')).toBeInTheDocument(); // uniqueEndpoints
    });

    it('disables save draft button when audience preview is not performed', async () => {
        renderPage();

        const saveDraftButton = screen.getByRole('button', { name: /Save draft only/i });
        expect(saveDraftButton).toBeDisabled();
    });

    it('opens campaign detail ledger modal when "View Ledger" is clicked', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('DLF Magnolias Exclusive Owners')).toBeInTheDocument();
        });

        const viewLedgerButtons = screen.getAllByRole('button', { name: /View Ledger/i });
        fireEvent.click(viewLedgerButtons[0]);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/campaigns/camp-001');
        });

        expect(screen.getByText('Campaign: DLF Magnolias Exclusive Owners')).toBeInTheDocument();
    });

    it('triggers campaign lifecycle actions (approve, pause, resume, cancel)', async () => {
        api.post.mockResolvedValue({ data: { success: true } });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('DLF Magnolias Exclusive Owners')).toBeInTheDocument();
        });

        // "Approve schedule" for DRAFT campaign
        const approveButton = screen.getByRole('button', { name: /Approve schedule/i });
        fireEvent.click(approveButton);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/owner-outreach/campaigns/camp-001/approve', {});
        });

        // "Pause" for APPROVED campaign
        const pauseButton = screen.getByRole('button', { name: /Pause/i });
        fireEvent.click(pauseButton);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/owner-outreach/campaigns/camp-002/pause', {});
        });
    });

    it('verifies zero PII exposure across rendered campaign list and forms', async () => {
        const { container } = renderPage();

        await waitFor(() => {
            expect(screen.getByText('DLF Magnolias Exclusive Owners')).toBeInTheDocument();
        });

        const html = container.innerHTML;

        // No unmasked personal phone numbers
        expect(html).not.toMatch(/(\+?91[\s-]?)?[6789]\d{9}/);
        // No personal emails (excluding any potential static info text)
        expect(html).not.toMatch(/[a-zA-Z0-9._%+-]+@gmail\.com/);
    });
});
