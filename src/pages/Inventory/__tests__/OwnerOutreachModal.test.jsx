import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OwnerOutreachModal from '../components/OwnerOutreachModal';
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

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false, theme: 'light' })
}));

describe('OwnerOutreachModal Component', () => {
    const mockAccounts = [
        {
            id: 'acc-whatsapp-primary',
            label: 'Bharat Properties Primary WA',
            provider: 'meta_cloud',
            connectionType: 'cloud_api'
        }
    ];

    const mockInitialInventory = [
        { id: 'inv-101', name: 'Plot 42, Sector 13' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockImplementation((url) => {
            if (url === '/owner-outreach/accounts') {
                return Promise.resolve({ data: { success: true, data: mockAccounts } });
            }
            if (url.startsWith('/owner-outreach/inventory/search')) {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: [
                            { id: 'inv-202', name: 'Villa 7, Palm Greens' }
                        ]
                    }
                });
            }
            return Promise.resolve({ data: { success: true, data: [] } });
        });
    });

    it('renders modal dialog with accessible title, form fields and safe planning notice', async () => {
        render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={vi.fn()}
                initialInventory={mockInitialInventory}
            />
        );

        expect(screen.getByRole('dialog', { name: /Owner Outreach — Campaign Planning/i })).toBeInTheDocument();
        expect(screen.getByText('Owner Outreach — Campaign Planning')).toBeInTheDocument();
        expect(screen.getByText(/Safe planning mode:/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Sector 3 Owner Update/i)).toBeInTheDocument();
        expect(screen.getByText('Select CRM Inventory')).toBeInTheDocument();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });
    });

    it('does not render modal content when isOpen is false', () => {
        const { container } = render(
            <OwnerOutreachModal
                isOpen={false}
                onClose={vi.fn()}
            />
        );

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('auto-selects WhatsApp account if single account is available', async () => {
        const { container } = render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={vi.fn()}
            />
        );

        await waitFor(() => {
            const select = container.querySelector('select');
            expect(select).not.toBeNull();
            expect(select.value).toBe('acc-whatsapp-primary');
        });
    });

    it('executes audience preview and displays metrics and masked endpoints', async () => {
        api.post.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    inventoryCount: 15,
                    counts: {
                        uniquePeople: 14,
                        uniqueEndpoints: 12,
                        consentRequired: 2,
                        suppressed: 0
                    },
                    endpoints: [
                        { channel: 'whatsapp', maskedEndpoint: '+91 98XXX XXXXX', eligibility: 'ELIGIBLE' }
                    ]
                }
            }
        });

        render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={vi.fn()}
                initialInventory={mockInitialInventory}
            />
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });

        const previewBtn = screen.getByRole('button', { name: /Preview audience/i });
        expect(previewBtn).not.toBeDisabled();
        fireEvent.click(previewBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/owner-outreach/audience-preview', expect.any(Object));
        });

        expect(screen.getByText('CURRENT')).toBeInTheDocument();
        expect(screen.getByText('Inventory scanned:')).toBeInTheDocument();
        expect(screen.getByText('14')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('submits campaign draft and invokes onSuccess and onClose callbacks', async () => {
        const handleSuccess = vi.fn();
        const handleClose = vi.fn();

        api.post
            .mockResolvedValueOnce({
                data: {
                    success: true,
                    data: {
                        inventoryCount: 10,
                        counts: { uniquePeople: 10, uniqueEndpoints: 10, consentRequired: 0, suppressed: 0 },
                        endpoints: []
                    }
                }
            })
            .mockResolvedValueOnce({
                data: { success: true, data: { _id: 'camp-new-123' } }
            });

        render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={handleClose}
                initialInventory={mockInitialInventory}
                onSuccess={handleSuccess}
            />
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });

        // Set name
        const nameInput = screen.getByPlaceholderText(/Sector 3 Owner Update/i);
        fireEvent.change(nameInput, { target: { value: 'Winter Outreach Sector 13' } });

        // Set start time
        const startInput = screen.getByLabelText(/Start Date & Time/i);
        fireEvent.change(startInput, { target: { value: '2026-11-20T10:00' } });

        // Preview audience first
        const previewBtn = screen.getByRole('button', { name: /Preview audience/i });
        fireEvent.click(previewBtn);

        await waitFor(() => {
            expect(screen.getByText('CURRENT')).toBeInTheDocument();
        });

        // Now save draft
        const saveDraftBtn = screen.getByRole('button', { name: /Save draft only/i });
        expect(saveDraftBtn).not.toBeDisabled();
        fireEvent.click(saveDraftBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/owner-outreach/campaigns', expect.objectContaining({
                name: 'Winter Outreach Sector 13',
                frequency: 'DAILY'
            }));
            expect(toast.success).toHaveBeenCalledWith('Draft saved. Koi message send nahi hua.');
            expect(handleSuccess).toHaveBeenCalled();
            expect(handleClose).toHaveBeenCalled();
        });
    });

    it('closes modal when cancel button is clicked', () => {
        const handleClose = vi.fn();
        render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={handleClose}
            />
        );

        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelBtn);

        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('ensures zero PII exposure and accurate HMAC-SHA-256 keyed hashing terminology', async () => {
        const { container } = render(
            <OwnerOutreachModal
                isOpen={true}
                onClose={vi.fn()}
                initialInventory={mockInitialInventory}
            />
        );

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/owner-outreach/accounts');
        });

        const html = container.innerHTML;
        // No raw phone numbers
        expect(html).not.toMatch(/(\+?91[\s-]?)?[6789]\d{9}/);
        // Accurate keyed hashing terminology
        expect(screen.getByText(/Endpoints are masked and protected using HMAC-SHA-256 keyed hashing/i)).toBeInTheDocument();
        expect(html).not.toMatch(/encrypted with SHA-256 HMAC/i);
        expect(html).not.toMatch(/HMAC encryption/i);
    });
});
