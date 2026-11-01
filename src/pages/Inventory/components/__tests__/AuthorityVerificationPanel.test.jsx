import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthorityVerificationPanel from '../AuthorityVerificationPanel';
import { authorityAPI } from '../../../../utils/api';

// Mock contexts
const mockCurrentUser = {
    _id: 'user-123',
    fullName: 'Test Auditor',
    isAdmin: true,
    role: {
        approvalRights: {
            approveAuthorityChanges: true
        }
    }
};

vi.mock('../../../../context/UserContext', () => ({
    useUserContext: () => ({
        currentUser: mockCurrentUser
    })
}));

vi.mock('../../../../utils/api', () => ({
    authorityAPI: {
        getLinks: vi.fn(),
        saveLink: vi.fn(),
        getHistory: vi.fn(),
        createRun: vi.fn(),
        processRun: vi.fn(),
        getRunById: vi.fn(),
        submitReview: vi.fn(),
        applyApprovedChanges: vi.fn()
    }
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

describe('AuthorityVerificationPanel Frontend Component', () => {
    const mockInventory = {
        _id: 'inv-456',
        unitNo: '101',
        sector: '14',
        city: 'Panchkula',
        projectName: 'Urban Heights',
        status: 'Available',
        authorityVerification: {
            authorityCode: 'HSVP',
            propertyId: '101',
            lastVerifiedAt: '2026-10-30T00:00:00.000Z',
            snapshotContentHash: 'a1b2c3d4e5f67890abcdef1234567890'
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        authorityAPI.getLinks.mockResolvedValue({ success: true, data: [] });
        authorityAPI.getHistory.mockResolvedValue({ success: true, data: [] });
    });

    it('renders the header and the mandatory demonstration fixture banner', async () => {
        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        expect(screen.getByText(/Government Authority Verification/i)).toBeInTheDocument();
        expect(screen.getByText(/DEMONSTRATION FIXTURE DATA:/i)).toBeInTheDocument();
        expect(screen.getByText(/authorizationStatus: NOT_OBTAINED/i)).toBeInTheDocument();
    });

    it('renders all three target authority selector tabs (HSVP, GMADA, CHD)', () => {
        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        expect(screen.getByRole('button', { name: /^HSVP$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^GMADA$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^CHD$/i })).toBeInTheDocument();
    });

    it('displays the current verified status and cryptographic snapshot hash', () => {
        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        expect(screen.getByText('VERIFIED')).toBeInTheDocument();
        expect(screen.getByText(/a1b2c3d4e5f678/i)).toBeInTheDocument();
    });

    it('pre-populates identity mapping inputs from inventory coordinates', async () => {
        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        await waitFor(() => {
            const plotInput = screen.getByPlaceholderText(/e\.g\. 101 or P-14/i);
            const sectorInput = screen.getByPlaceholderText(/e\.g\. 14/i);
            expect(plotInput.value).toBe('101');
            expect(sectorInput.value).toBe('14');
        });
    });

    it('executes demonstration verification workflow and displays proposed changes', async () => {
        authorityAPI.createRun.mockResolvedValue({
            success: true,
            data: { _id: 'run-999', authorityCode: 'HSVP', status: 'CREATED' }
        });

        authorityAPI.processRun.mockResolvedValue({
            success: true,
            data: { status: 'COMPLETED' }
        });

        authorityAPI.getRunById.mockResolvedValue({
            success: true,
            data: {
                run: { _id: 'run-999', status: 'COMPLETED' },
                items: [{
                    _id: 'item-888',
                    status: 'SUCCEEDED',
                    matchStatus: 'EXACT_MATCH',
                    reviewerDecision: 'PENDING',
                    proposedChanges: [
                        {
                            field: 'authorityVerification.propertyAreaValue',
                            currentValue: 250,
                            proposedValue: 350,
                            changeType: 'UPDATE'
                        },
                        {
                            field: 'authorityVerification.allotmentDate',
                            currentValue: null,
                            proposedValue: '2020-01-15',
                            changeType: 'NEW'
                        }
                    ]
                }]
            }
        });

        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        const verifyBtn = screen.getByRole('button', { name: /Verify Record \(Demo\)/i });
        fireEvent.click(verifyBtn);

        await waitFor(() => {
            expect(authorityAPI.createRun).toHaveBeenCalledWith(expect.objectContaining({
                authorityCode: 'HSVP',
                isFixtureMode: true
            }));
            expect(screen.getByText(/Verification Comparison & Proposed Changes/i)).toBeInTheDocument();
            expect(screen.getByText(/propertyAreaValue/i)).toBeInTheDocument();
            expect(screen.getByText('350')).toBeInTheDocument();
        });
    });

    it('disables the Apply action for synthetic fixture records with explicit warning label', async () => {
        authorityAPI.getRunById.mockResolvedValue({
            success: true,
            data: {
                run: { _id: 'run-999', status: 'COMPLETED', isFixtureMode: true, provenance: 'SYNTHETIC_FIXTURE' },
                items: [{
                    _id: 'item-888',
                    status: 'SUCCEEDED',
                    matchStatus: 'EXACT_MATCH',
                    reviewerDecision: 'APPROVED',
                    isSynthetic: true,
                    provenance: 'SYNTHETIC_FIXTURE',
                    proposedChanges: [
                        {
                            field: 'authorityVerification.propertyAreaValue',
                            currentValue: 250,
                            proposedValue: 350,
                            changeType: 'UPDATE',
                            approved: true
                        }
                    ]
                }]
            }
        });

        authorityAPI.createRun.mockResolvedValue({
            success: true,
            data: { _id: 'run-999', authorityCode: 'HSVP', status: 'CREATED', isFixtureMode: true }
        });
        authorityAPI.processRun.mockResolvedValue({ success: true, data: { status: 'COMPLETED' } });

        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        const verifyBtn = screen.getByRole('button', { name: /Verify Record \(Demo\)/i });
        fireEvent.click(verifyBtn);

        await waitFor(() => {
            const applyDisabledBtn = screen.getByRole('button', { name: /Apply Prohibited \(Synthetic Demonstration Data\)/i });
            expect(applyDisabledBtn).toBeInTheDocument();
            expect(applyDisabledBtn).toBeDisabled();
            expect(screen.getByText(/Live authorization required/i)).toBeInTheDocument();
        });
    });

    it('renders verification history using actual controller response structure keyed by authority code', async () => {
        const mockControllerHistory = {
            success: true,
            data: {
                HSVP: {
                    link: { authorityCode: 'HSVP', propertyId: '101', sectorNumber: '14' },
                    snapshots: [{
                        _id: 'snap-hsvp-1',
                        authorityCode: 'HSVP',
                        contentHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
                        observedAt: '2026-10-30T04:00:00.000Z',
                        dataQualityStatus: 'COMPLETE',
                        isSealed: true
                    }]
                },
                GMADA: {
                    link: { authorityCode: 'GMADA', propertyId: 'Plot 45', sectorNumber: 'Sector 66A' },
                    snapshots: [{
                        _id: 'snap-gmada-1',
                        authorityCode: 'GMADA',
                        contentHash: 'b2c3d4e5f6a17890abcdef1234567890abcdef1234567890abcdef1234567890',
                        observedAt: '2026-10-29T10:00:00.000Z',
                        dataQualityStatus: 'COMPLETE',
                        isSealed: true
                    }]
                },
                CHD: {
                    link: { authorityCode: 'CHD', propertyId: 'House 1024', sectorNumber: 'Sector 17' },
                    snapshots: [{
                        _id: 'snap-chd-1',
                        authorityCode: 'CHD',
                        contentHash: 'c3d4e5f6a1b27890abcdef1234567890abcdef1234567890abcdef1234567890',
                        observedAt: '2026-10-28T08:00:00.000Z',
                        dataQualityStatus: 'COMPLETE',
                        isSealed: true
                    }]
                }
            }
        };

        authorityAPI.getHistory.mockResolvedValue(mockControllerHistory);

        render(<AuthorityVerificationPanel inventory={mockInventory} />);

        // History button shows aggregate count across all authorities (3)
        const historyBtn = await screen.findByRole('button', { name: /History \(3\)/i });
        expect(historyBtn).toBeInTheDocument();

        // Click to open history modal
        fireEvent.click(historyBtn);

        // Verify snapshots for HSVP, GMADA, and CHD are rendered
        await waitFor(() => {
            expect(screen.getByText(/Verification & Snapshot History/i)).toBeInTheDocument();
            expect(screen.getByText(/HSVP Snapshot/i)).toBeInTheDocument();
            expect(screen.getByText(/GMADA Snapshot/i)).toBeInTheDocument();
            expect(screen.getByText(/CHD Snapshot/i)).toBeInTheDocument();
            expect(screen.getByText(/SHA-256: a1b2c3d4e5f67890/i)).toBeInTheDocument();
            expect(screen.getByText(/SHA-256: b2c3d4e5f6a17890/i)).toBeInTheDocument();
            expect(screen.getByText(/SHA-256: c3d4e5f6a1b27890/i)).toBeInTheDocument();
        });
    });
});
