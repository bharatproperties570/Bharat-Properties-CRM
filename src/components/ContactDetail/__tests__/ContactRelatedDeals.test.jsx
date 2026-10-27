import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactRelatedDeals from '../ContactRelatedDeals';

// Mock useTheme from ThemeContext
vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false }),
    ThemeProvider: ({ children }) => children,
}));

// Minimal mock functions
const mockToggleSection = vi.fn();
const mockShowNotification = vi.fn();
const mockOnNavigate = vi.fn();
const mockRenderValue = (val, fallback = '-', prefix = '') => (val !== undefined && val !== null ? `${prefix}${val}` : fallback);
const mockRenderLookup = (val, fallback = '-') => (val !== undefined && val !== null ? (typeof val === 'object' ? val.lookup_value || val.name : val) : fallback);

describe('ContactRelatedDeals Component', () => {
    test('renders matched deal details with match percentage and project name', () => {
        const matchedDeals = [
            {
                _id: 'deal1',
                unitNo: 'A-101',
                matchPercentage: 85,
                projectName: 'Sunrise Plot',
                location: 'Sector 2',
                price: 5000000,
                size: { value: 1200, unit: 'sqft' },
                subCategory: 'Plot',
            },
        ];

        render(
            <ContactRelatedDeals
                contact={{ requirement: 'Plot in Sector 2' }}
                recordType="lead"
                expandedSections={['matching', 'deals']}
                toggleSection={mockToggleSection}
                matchedDeals={matchedDeals}
                loadingMatches={false}
                renderValue={mockRenderValue}
                showNotification={mockShowNotification}
                activeDeals={[]}
                setIsAddDealModalOpen={vi.fn()}
                renderLookup={mockRenderLookup}
                onNavigate={mockOnNavigate}
            />
        );

        expect(screen.getByText('A-101')).toBeInTheDocument();
        expect(screen.getByText('85% Match')).toBeInTheDocument();
        expect(screen.getByText('Sunrise Plot')).toBeInTheDocument();
    });

    test('renders active pipeline deal with stage badge and formatted price', () => {
        const activeDeals = [
            {
                _id: 'deal2',
                unitNo: 'B-204',
                projectName: 'Palm Residency',
                location: 'Sector 4',
                price: 7500000,
                stage: 'Negotiation',
                subCategory: 'Apartment',
                intent: 'Sale',
                daysInStage: 4,
            },
        ];

        render(
            <ContactRelatedDeals
                contact={{}}
                recordType="contact"
                expandedSections={['deals']}
                toggleSection={mockToggleSection}
                matchedDeals={[]}
                loadingMatches={false}
                renderValue={mockRenderValue}
                showNotification={mockShowNotification}
                activeDeals={activeDeals}
                setIsAddDealModalOpen={vi.fn()}
                renderLookup={mockRenderLookup}
                onNavigate={mockOnNavigate}
            />
        );

        expect(screen.getByText(/B-204/)).toBeInTheDocument();
        expect(screen.getByText('NEGOTIATION')).toBeInTheDocument();
        expect(screen.getByText('Palm Residency')).toBeInTheDocument();
    });
});
