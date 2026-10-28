import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DealFinancialSection from '../DealFinancialSection';

// Mock useTheme from ThemeContext
vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false }),
    ThemeProvider: ({ children }) => children,
}));

describe('DealFinancialSection Component', () => {
    const mockDeal = {
        _id: 'deal-101',
        dealId: 'DL-001',
        price: 8500000,
        expectedRevenue: 170000,
        expectedClosingDate: '2026-12-31',
        paymentMilestones: [
            { name: 'Booking Advance', amount: 500000, percentage: 5.88, status: 'Received' },
            { name: 'Agreement Signing', amount: 1500000, percentage: 17.65, status: 'Pending' }
        ],
        negotiationRounds: [
            {
                _id: 'rnd-1',
                date: '2026-10-15',
                offerBy: 'Rajesh Sharma',
                buyerOffer: 8000000,
                ownerCounter: 8400000,
                status: 'Countered',
                notes: 'Requested flexible possession'
            },
            {
                _id: 'rnd-2',
                date: '2026-10-20',
                offerBy: 'Developer Desk',
                buyerOffer: 8200000,
                ownerCounter: 8300000,
                status: 'Accepted',
                notes: 'Agreed on 83L final'
            }
        ]
    };

    test('renders negotiation history table with 5 columns when rounds exist', () => {
        render(
            <DealFinancialSection
                deal={mockDeal}
                setIsOfferModalOpen={vi.fn()}
                isReadOnly={false}
            />
        );

        // Verify column headers in DataTable
        expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Offer By' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Counter' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();

        // Verify row contents
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument();
        expect(screen.getByText('Requested flexible possession')).toBeInTheDocument();
        expect(screen.getByText('Developer Desk')).toBeInTheDocument();
        expect(screen.getByText('Countered')).toBeInTheDocument();
        expect(screen.getByText('Accepted')).toBeInTheDocument();
    });

    test('renders empty state when negotiation rounds array is empty', () => {
        const emptyDeal = {
            ...mockDeal,
            negotiationRounds: []
        };

        render(
            <DealFinancialSection
                deal={emptyDeal}
                setIsOfferModalOpen={vi.fn()}
                isReadOnly={false}
            />
        );

        expect(screen.getByText('No Offers Yet')).toBeInTheDocument();
        expect(screen.getByText('Start the negotiation by adding the first offer.')).toBeInTheDocument();
    });

    test('calls setIsOfferModalOpen when NEW OFFER button is clicked', () => {
        const mockSetIsOfferModalOpen = vi.fn();

        render(
            <DealFinancialSection
                deal={mockDeal}
                setIsOfferModalOpen={mockSetIsOfferModalOpen}
                isReadOnly={false}
            />
        );

        const newOfferButton = screen.getByRole('button', { name: /new offer/i });
        expect(newOfferButton).toBeInTheDocument();

        fireEvent.click(newOfferButton);
        expect(mockSetIsOfferModalOpen).toHaveBeenCalledWith(true);
    });

    test('hides NEW OFFER button in read-only mode', () => {
        render(
            <DealFinancialSection
                deal={mockDeal}
                setIsOfferModalOpen={vi.fn()}
                isReadOnly={true}
            />
        );

        expect(screen.queryByRole('button', { name: /new offer/i })).not.toBeInTheDocument();
    });
});
