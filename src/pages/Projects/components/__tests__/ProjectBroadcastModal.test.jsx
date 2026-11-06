import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectBroadcastModal from '../ProjectBroadcastModal';

let passedProps = null;
vi.mock('../../../Deals/components/DealBroadcastModal', () => ({
    default: (props) => {
        passedProps = props;
        return props.isOpen ? <div data-testid="underlying-deal-broadcast-modal">Deal Broadcast Engine Active</div> : null;
    }
}));

describe('ProjectBroadcastModal (Phase 2 Enterprise Omnichannel Broadcast)', () => {
    beforeEach(() => {
        passedProps = null;
        vi.clearAllMocks();
    });

    const mockProject = {
        _id: 'proj_godrej_101',
        name: 'Godrej Palm Retreat',
        reraNumber: 'RC/REP/HARERA/GGM/2024/99',
        pricing: { basePrice: { amount: 15000000 } }
    };

    const mockDeals = [
        { _id: 'deal_1', title: 'Tower 1 - 3BHK', price: 15000000 },
        { _id: 'deal_2', title: 'Tower 2 - 4BHK Luxury', price: 25000000 }
    ];

    it('renders null when isOpen is false', () => {
        const { container } = render(
            <ProjectBroadcastModal
                isOpen={false}
                onClose={vi.fn()}
                project={mockProject}
                deals={mockDeals}
            />
        );
        expect(container.firstChild).toBeNull();
        expect(passedProps).toBeNull();
    });

    it('delegates to DealBroadcastModal with project and dealIds populated when isOpen is true', () => {
        const mockClose = vi.fn();
        const mockSuccess = vi.fn();

        render(
            <ProjectBroadcastModal
                isOpen={true}
                onClose={mockClose}
                project={mockProject}
                deals={mockDeals}
                onSuccess={mockSuccess}
            />
        );

        expect(screen.getByTestId('underlying-deal-broadcast-modal')).toBeInTheDocument();
        expect(passedProps).not.toBeNull();
        expect(passedProps.isOpen).toBe(true);
        expect(passedProps.project).toEqual(mockProject);
        expect(passedProps.projectId).toBe('proj_godrej_101');
        expect(passedProps.selectedDeals).toEqual(mockDeals);
        expect(passedProps.dealIds).toEqual(['deal_1', 'deal_2']);
        expect(passedProps.onClose).toBe(mockClose);
        expect(passedProps.onSuccess).toBe(mockSuccess);
    });

    it('handles project with 0 deals safely without throwing', () => {
        render(
            <ProjectBroadcastModal
                isOpen={true}
                onClose={vi.fn()}
                project={mockProject}
                deals={[]}
            />
        );

        expect(screen.getByTestId('underlying-deal-broadcast-modal')).toBeInTheDocument();
        expect(passedProps.dealIds).toEqual([]);
        expect(passedProps.selectedDeals).toEqual([]);
        expect(passedProps.projectId).toBe('proj_godrej_101');
    });
});
