import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportsPage from '../ReportsPage';
import { pricingAPI } from '../../../utils/pricingAPI';

let mockDashboardStats = {
    data: {
        inventoryHealth: { healthScore: 85, statusStats: [{ status: 'Available', count: 10 }] },
        performance: { salesPerformance: [{ agent: 'Agent John', count: 5, totalValue: 50000000 }] },
        activityCounts: { Calls: 40, Meetings: 15, SiteVisits: 8, Proposals: 5 },
        leads: { totalLeads: 120, leadsByStage: [{ stage: 'Hot', count: 25 }, { stage: 'Warm', count: 45 }] },
        deals: { totalDeals: 18 }
    },
    isLoading: false
};

vi.mock('../../../utils/crmHooks', () => ({
    useDashboardStats: () => mockDashboardStats
}));

vi.mock('react-apexcharts', () => ({
    default: () => <div data-testid="mock-chart">Mock ApexChart</div>
}));

vi.mock('react-hot-toast', () => ({
    default: {
        promise: vi.fn((promise) => promise),
        success: vi.fn(),
        error: vi.fn()
    }
}));

const mockMarketPulse = {
    hotMarkets: [
        {
            location: 'Golf Course Road, Gurgaon',
            subCategory: 'Luxury High-Rise',
            avgClosedRPU: 18500,
            areaUnit: 'PER_SQ_FT',
            trend: 'upward',
            trendPct: 8.4,
            dealCount: 14,
            avgNegotiationGapPct: 2.1
        }
    ],
    stableMarkets: [
        {
            location: 'Sohna Road, Gurgaon',
            subCategory: 'Mid-Segment Residential',
            avgClosedRPU: 9200,
            areaUnit: 'PER_SQ_FT',
            trend: 'stable',
            trendPct: 0.5,
            dealCount: 9,
            avgNegotiationGapPct: 4.8
        }
    ],
    downMarkets: [
        {
            location: 'Faridabad Express, Sector 75',
            subCategory: 'Commercial Office',
            avgClosedRPU: 6400,
            areaUnit: 'PER_SQ_FT',
            trend: 'downward',
            trendPct: -5.2,
            dealCount: 3,
            avgNegotiationGapPct: 8.7
        }
    ]
};

vi.mock('../../../utils/pricingAPI', () => ({
    pricingAPI: {
        getMarketPulse: vi.fn(),
        aggregate: vi.fn()
    },
    POSITIONING_CONFIG: {},
    TREND_CONFIG: {},
    formatINRFull: (val) => val ? `₹${val.toLocaleString()}` : '₹0'
}));

describe('ReportsPage with DataTable (Phase 10.21)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardStats = {
            data: {
                inventoryHealth: { healthScore: 85, statusStats: [{ status: 'Available', count: 10 }] },
                performance: { salesPerformance: [{ agent: 'Agent John', count: 5, totalValue: 50000000 }] },
                activityCounts: { Calls: 40, Meetings: 15, SiteVisits: 8, Proposals: 5 },
                leads: { totalLeads: 120, leadsByStage: [{ stage: 'Hot', count: 25 }] },
                deals: { totalDeals: 18 }
            },
            isLoading: false
        };

        pricingAPI.getMarketPulse.mockResolvedValue({
            status: 'success',
            data: mockMarketPulse
        });
        pricingAPI.aggregate.mockResolvedValue({
            status: 'success',
            data: { count: 1 }
        });
    });

    it('renders default Strategic Insights tab without crashing', async () => {
        render(<ReportsPage />);
        expect(screen.getByText('Strategic Insights')).toBeInTheDocument();
        expect(screen.getByText('Project Health Alert')).toBeInTheDocument();
    });

    it('switches to Price Intelligence tab and renders DataTable with 7 column headers', async () => {
        const { container } = render(<ReportsPage />);

        const priceIntelTab = screen.getByText('Price Intelligence');
        fireEvent.click(priceIntelTab);

        expect(await screen.findByText('Price Intelligence Analytics')).toBeInTheDocument();

        const headers = container.querySelectorAll('th');
        expect(headers).toHaveLength(7);
        expect(screen.getByText('Location')).toBeInTheDocument();
        expect(screen.getByText('Sub-Category')).toBeInTheDocument();
        expect(screen.getByText('Avg Rate')).toBeInTheDocument();
        expect(screen.getByText('Unit')).toBeInTheDocument();
        expect(screen.getByText('Trend')).toBeInTheDocument();
        expect(screen.getByText('Deals')).toBeInTheDocument();
        expect(screen.getByText('Negotiation Gap')).toBeInTheDocument();
    });

    it('renders populated Hot Markets benchmark records in DataTable', async () => {
        render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));

        expect(await screen.findByText('Golf Course Road, Gurgaon')).toBeInTheDocument();
        expect(screen.getByText('Luxury High-Rise')).toBeInTheDocument();
        expect(screen.getByText('₹18,500')).toBeInTheDocument();
        expect(screen.getByText('per Sq.Ft.')).toBeInTheDocument();
        expect(screen.getByText('+8.4%')).toBeInTheDocument();
        expect(screen.getByText('14')).toBeInTheDocument();
        expect(screen.getByText('2.1%')).toBeInTheDocument();
    });

    it('switching to Stable view updates DataTable with stable markets', async () => {
        render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));
        await screen.findByText('Golf Course Road, Gurgaon');

        const stableTabBtn = screen.getByRole('button', { name: /Stable/i });
        fireEvent.click(stableTabBtn);

        expect(await screen.findByText('Sohna Road, Gurgaon')).toBeInTheDocument();
        expect(screen.getByText('Mid-Segment Residential')).toBeInTheDocument();
        expect(screen.getByText('₹9,200')).toBeInTheDocument();
        expect(screen.getByText('+0.5%')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
        expect(screen.getByText('4.8%')).toBeInTheDocument();
    });

    it('switching to Declining view updates DataTable with down markets', async () => {
        const { container } = render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));
        await screen.findByText('Golf Course Road, Gurgaon');

        const downTabBtn = screen.getByRole('button', { name: /Declining/i });
        fireEvent.click(downTabBtn);

        expect(await screen.findByText('Faridabad Express, Sector 75')).toBeInTheDocument();
        expect(screen.getByText('Commercial Office')).toBeInTheDocument();
        expect(screen.getByText('₹6,400')).toBeInTheDocument();
        expect(screen.getByText('-5.2%')).toBeInTheDocument();
        const table = container.querySelector('table');
        expect(within(table).getByText('3')).toBeInTheDocument();
        expect(within(table).getByText('8.7%')).toBeInTheDocument();
    });

    it('renders emptyMessage in DataTable when a market category has no records', async () => {
        pricingAPI.getMarketPulse.mockResolvedValueOnce({
            status: 'success',
            data: {
                hotMarkets: [],
                stableMarkets: [],
                downMarkets: []
            }
        });

        render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));

        expect(await screen.findByText(/No Market Benchmarks Yet/i)).toBeInTheDocument();
    });

    it('clicking Refresh Benchmarks button invokes pricingAPI.aggregate', async () => {
        render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));
        await screen.findByText('Golf Course Road, Gurgaon');

        const refreshBtn = screen.getByText('Refresh Benchmarks (90d)');
        fireEvent.click(refreshBtn);

        expect(pricingAPI.aggregate).toHaveBeenCalledWith({ trailingDays: 90 });
    });

    it('security audit: table renders zero secrets, tokens, passwords, or credentials', async () => {
        const { container } = render(<ReportsPage />);

        fireEvent.click(screen.getByText('Price Intelligence'));
        await screen.findByText('Golf Course Road, Gurgaon');

        const tableText = container.querySelector('table').textContent;
        expect(tableText).not.toMatch(/bearer/i);
        expect(tableText).not.toMatch(/token/i);
        expect(tableText).not.toMatch(/password/i);
        expect(tableText).not.toMatch(/secret/i);
        expect(tableText).not.toMatch(/apikey/i);
    });
});
