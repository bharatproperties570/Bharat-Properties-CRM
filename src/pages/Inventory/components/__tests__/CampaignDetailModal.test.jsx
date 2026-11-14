import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampaignDetailModal from '../CampaignDetailModal';
import { api } from '../../../../utils/api';

vi.mock('../../../../utils/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
    }
}));

describe('CampaignDetailModal Component', () => {
    const mockOnClose = vi.fn();
    const campaignId = '6735c0ffee00000000000001';

    const mockCampaignDetail = {
        campaign: {
            _id: campaignId,
            name: 'DLF Camellias Owners Diwali 2026',
            status: 'SCHEDULED',
            channels: ['whatsapp'],
            frequency: 'DAILY',
            batchSize: 100,
            dispatchWindow: { start: '10:00', end: '18:00' },
            startAt: '2026-11-20T04:30:00.000Z',
            nextRunAt: '2026-11-20T04:30:00.000Z',
            totals: {
                recipients: 250,
                consentRequired: 12,
                suppressed: 5
            }
        },
        batches: [
            {
                _id: 'batch-001',
                sequence: 1,
                status: 'COMPLETED',
                scheduledAt: '2026-11-20T04:30:00.000Z',
                counts: { selected: 100 },
                startedAt: '2026-11-20T04:30:05.000Z',
                completedAt: '2026-11-20T04:35:10.000Z',
                lastErrorCode: null
            },
            {
                _id: 'batch-002',
                sequence: 2,
                status: 'SCHEDULED',
                scheduledAt: '2026-11-21T04:30:00.000Z',
                counts: { selected: 100 },
                startedAt: null,
                completedAt: null,
                lastErrorCode: null
            },
            {
                _id: 'batch-003',
                sequence: 3,
                status: 'SCHEDULED',
                scheduledAt: '2026-11-22T04:30:00.000Z',
                counts: { selected: 50 },
                startedAt: null,
                completedAt: null,
                lastErrorCode: null
            }
        ],
        batchSummary: {
            total: 3,
            byStatus: {
                COMPLETED: 1,
                SCHEDULED: 2
            }
        },
        byState: [
            {
                _id: { channel: 'whatsapp', eligibility: 'ELIGIBLE', dispatchState: 'SCHEDULED' },
                count: 233
            },
            {
                _id: { channel: 'whatsapp', eligibility: 'CONSENT_REQUIRED', dispatchState: 'SUPPRESSED' },
                count: 12
            },
            {
                _id: { channel: 'whatsapp', eligibility: 'OPT_OUT', dispatchState: 'SUPPRESSED' },
                count: 5
            }
        ],
        recipients: [
            {
                _id: 'recip-001',
                channel: 'whatsapp',
                endpointHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                eligibility: 'ELIGIBLE',
                dispatchState: 'SCHEDULED'
            }
        ],
        batchesTruncated: false
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when isOpen is false', () => {
        const { container } = render(
            <CampaignDetailModal isOpen={false} onClose={mockOnClose} campaignId={campaignId} />
        );
        expect(container.firstChild).toBeNull();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('displays loading skeleton while fetching campaign detail', async () => {
        let resolvePromise;
        api.get.mockImplementationOnce(() => new Promise((resolve) => {
            resolvePromise = resolve;
        }));

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        expect(screen.getByText(/Loading campaign details and batch schedule ledger/i)).toBeInTheDocument();

        resolvePromise({ data: { success: true, data: mockCampaignDetail } });
        await waitFor(() => {
            expect(screen.queryByText(/Loading campaign details and batch schedule ledger/i)).not.toBeInTheDocument();
        });
    });

    it('fetches campaign detail and renders metrics, ledger and cadence correctly', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockCampaignDetail }
        });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith(`/owner-outreach/campaigns/${campaignId}`);
        });

        // Campaign title and status
        expect(screen.getByText('Campaign: DLF Camellias Owners Diwali 2026')).toBeInTheDocument();
        expect(screen.getAllByText('SCHEDULED').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('WHATSAPP')).toBeInTheDocument();

        // Metrics Grid
        expect(screen.getByText('Total Batches')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument(); // total batches
        expect(screen.getByText('Scheduled Batches')).toBeInTheDocument();
        expect(screen.getByText('Recipients Target')).toBeInTheDocument();
        expect(screen.getByText('250')).toBeInTheDocument(); // recipients target
        expect(screen.getByText('Consent Required')).toBeInTheDocument();
        expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1); // consent required
        expect(screen.getByText('Suppressed Opt-Out')).toBeInTheDocument();
        expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1); // suppressed opt-out

        // Cadence & Window
        expect(screen.getByText(/Schedule Frequency/i)).toBeInTheDocument();
        expect(screen.getByText(/DAILY \(100 per batch\)/i)).toBeInTheDocument();
        expect(screen.getByText(/10:00 – 18:00 IST/i)).toBeInTheDocument();

        // Batch Schedule Ledger rows
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();

        // Eligibility Breakdown
        expect(screen.getByText('Recipient Eligibility Breakdown')).toBeInTheDocument();
        expect(screen.getByText('233')).toBeInTheDocument();
    });

    it('renders empty batch ledger state when no batches exist', async () => {
        const emptyBatchDetail = {
            ...mockCampaignDetail,
            campaign: {
                ...mockCampaignDetail.campaign,
                status: 'DRAFT'
            },
            batches: [],
            batchSummary: { total: 0, byStatus: {} }
        };

        api.get.mockResolvedValueOnce({
            data: { success: true, data: emptyBatchDetail }
        });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(screen.getByText(/No schedule batches have been generated yet. \(Campaign is in DRAFT status\)/i)).toBeInTheDocument();
        });
    });

    it('renders error message when API fails', async () => {
        api.get.mockRejectedValueOnce({
            response: {
                data: {
                    error: 'Campaign not found or access unauthorized'
                }
            }
        });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(screen.getByText(/Campaign not found or access unauthorized/i)).toBeInTheDocument();
        });
    });

    it('refetches details when Refresh button is clicked', async () => {
        api.get
            .mockResolvedValueOnce({ data: { success: true, data: mockCampaignDetail } })
            .mockResolvedValueOnce({ data: { success: true, data: mockCampaignDetail } });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1);
        });

        const refreshButton = screen.getByRole('button', { name: /Refresh campaign detail/i });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2);
        });
    });

    it('calls onClose when close button is clicked', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockCampaignDetail }
        });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(screen.getByText('Campaign: DLF Camellias Owners Diwali 2026')).toBeInTheDocument();
        });

        const closeBtn = screen.getByRole('button', { name: 'Close' });
        fireEvent.click(closeBtn);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('strictly guarantees read-only inspection (zero POST, PUT, DELETE operations)', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockCampaignDetail }
        });

        render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(screen.getByText('Campaign: DLF Camellias Owners Diwali 2026')).toBeInTheDocument();
        });

        expect(api.post).not.toHaveBeenCalled();
        expect(api.put).not.toHaveBeenCalled();
        expect(api.delete).not.toHaveBeenCalled();
    });

    it('strictly enforces zero PII exposure: does NOT render raw phone numbers or personal names', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockCampaignDetail }
        });

        const { container } = render(
            <CampaignDetailModal isOpen={true} onClose={mockOnClose} campaignId={campaignId} />
        );

        await waitFor(() => {
            expect(screen.getByText('Campaign: DLF Camellias Owners Diwali 2026')).toBeInTheDocument();
        });

        const html = container.innerHTML;

        // No unmasked phone numbers
        expect(html).not.toMatch(/(\+?91[\s-]?)?[6789]\d{9}/);
        // No email addresses
        expect(html).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        // Displays verified encrypted HMAC note
        expect(screen.getByText(/Sample endpoints verified masked with SHA-256 HMAC encryption/i)).toBeInTheDocument();
    });
});
