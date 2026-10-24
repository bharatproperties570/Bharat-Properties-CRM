import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClientSiteVisitJourneyPage from '../ClientSiteVisitJourneyPage';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

vi.mock('react-router-dom', () => ({
    useParams: () => ({ token: 'mock-valid-token' }),
    useNavigate: () => vi.fn()
}));

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

const mockJourneyData = {
    clientName: 'Rajesh Sharma',
    scheduledDate: '2026-10-25',
    scheduledTime: '11:00 AM',
    salesperson: {
        name: 'Amit Kumar',
        mobile: '+91 98765 43210'
    },
    totalProperties: 2,
    completedProperties: 0,
    properties: [
        {
            order: 0,
            inventoryId: 'prop-1',
            project: 'DLF The Arbour',
            unit: 'Tower A - Unit 402',
            status: 'READY',
            isLocked: false,
            price: '₹ 8.50 Cr',
            size: '3950 Sq.Ft.',
            category: '4 BHK Luxury',
            facing: 'North-East',
            location: {
                city: 'Gurugram',
                address: 'Sector 63, Golf Course Extension, Gurugram',
                navigationUrl: 'https://maps.google.com/?q=DLF+Arbour'
            },
            photos: ['https://example.com/photo1.jpg']
        },
        {
            order: 1,
            inventoryId: 'prop-2',
            project: 'M3M Golfestate',
            unit: 'Unit Details Locked',
            status: 'LOCKED',
            isLocked: true,
            location: {
                city: 'Gurugram',
                navigationUrl: null
            }
        }
    ]
};

describe('ClientSiteVisitJourneyPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('1. Displays loading skeleton while fetching journey data', () => {
        api.get.mockReturnValue(new Promise(() => {}));

        render(<ClientSiteVisitJourneyPage />);

        expect(screen.getByText(/loading your site visit itinerary/i)).toBeInTheDocument();
        expect(screen.getByText(/bharat properties experience/i)).toBeInTheDocument();
    });

    it('2. Renders client name, salesperson, and itinerary when API succeeds', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockJourneyData }
        });

        render(<ClientSiteVisitJourneyPage />);

        await waitFor(() => {
            expect(screen.getByText(/rajesh sharma/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/amit kumar/i)).toBeInTheDocument();
        expect(screen.getByText(/DLF The Arbour/i)).toBeInTheDocument();
        expect(screen.getByText(/M3M Golfestate/i)).toBeInTheDocument();
        expect(screen.getByText(/₹ 8.50 Cr/i)).toBeInTheDocument();
    });

    it('3. Keeps locked property details hidden with masked label and no navigation button', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockJourneyData }
        });

        render(<ClientSiteVisitJourneyPage />);

        await waitFor(() => {
            expect(screen.getByText(/DLF The Arbour/i)).toBeInTheDocument();
        });

        // Unlocked property has navigation button
        const navButton = screen.getByRole('button', { name: /navigate with google maps/i });
        expect(navButton).toBeInTheDocument();

        // Locked property shows masked state
        expect(screen.getByText(/unit details protected/i)).toBeInTheDocument();
        expect(screen.getByText(/unit number, price, and google maps directions will unlock automatically/i)).toBeInTheDocument();
    });

    it('4. Displays error alert when token is invalid or expired', async () => {
        const errorResponse = {
            response: {
                status: 403,
                data: { message: 'Invalid or expired journey token' }
            }
        };
        api.get.mockRejectedValueOnce(errorResponse);

        render(<ClientSiteVisitJourneyPage />);

        await waitFor(() => {
            expect(screen.getByText(/this journey link has expired or is no longer valid/i)).toBeInTheDocument();
        });

        // Shows contact office support
        expect(screen.getByText(/contact office support/i)).toBeInTheDocument();
    });

    it('5. Allows feedback submission and prevents duplicate clicks while request is pending', async () => {
        api.get.mockResolvedValueOnce({
            data: { success: true, data: mockJourneyData }
        });

        let resolveSubmit;
        api.post.mockReturnValue(new Promise((resolve) => {
            resolveSubmit = resolve;
        }));

        render(<ClientSiteVisitJourneyPage />);

        await waitFor(() => {
            expect(screen.getByText(/DLF The Arbour/i)).toBeInTheDocument();
        });

        // Open feedback modal
        const feedbackBtn = screen.getByRole('button', { name: /submit property feedback/i });
        fireEvent.click(feedbackBtn);

        // Verify modal opened
        expect(screen.getByText(/your honest impression/i)).toBeInTheDocument();

        // Fill in comments
        const textarea = screen.getByPlaceholderText(/what stood out/i);
        fireEvent.change(textarea, { target: { value: 'Great layout and high floor.' } });

        // Submit feedback
        const confirmSubmitBtn = screen.getByRole('button', { name: /confirm & unlock next property/i });
        fireEvent.click(confirmSubmitBtn);

        // Verify button is disabled during in-flight submission
        expect(confirmSubmitBtn).toBeDisabled();
        expect(screen.getByText(/recording feedback/i)).toBeInTheDocument();

        // Resolve submission
        resolveSubmit({
            data: { success: true, message: 'Feedback recorded successfully!' }
        });

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/feedback recorded successfully/i));
        });
    });

    it('6. Handles cancelled visit status (HTTP 410)', async () => {
        api.get.mockRejectedValueOnce({
            response: {
                status: 410,
                data: { message: 'Cancelled' }
            }
        });

        render(<ClientSiteVisitJourneyPage />);

        await waitFor(() => {
            expect(screen.getByText(/this site visit has been cancelled/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/contact office support/i)).toBeInTheDocument();
    });
});
