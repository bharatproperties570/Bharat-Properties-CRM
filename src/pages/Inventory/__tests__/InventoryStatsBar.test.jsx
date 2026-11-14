import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InventoryStatsBar from '../components/InventoryStatsBar';

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

describe('InventoryStatsBar Component', () => {
    const defaultProps = {
        statusFilter: '',
        setStatusFilter: vi.fn(),
        activeCount: 42,
        inactiveCount: 7,
        setCurrentPage: vi.fn(),
        onNavigate: vi.fn(),
        onOpenOwnerOutreach: vi.fn()
    };

    it('renders Owner Outreach button immediately to the left of the Deal Intake button', () => {
        const { container } = render(<InventoryStatsBar {...defaultProps} />);

        const outreachBtn = screen.getByRole('button', { name: /Owner Outreach/i });
        const dealIntakeBtn = screen.getByRole('button', { name: /Deal Intake Engine/i });

        expect(outreachBtn).toBeInTheDocument();
        expect(dealIntakeBtn).toBeInTheDocument();

        // Verify Owner Outreach has proper title and aria-label
        expect(outreachBtn).toHaveAttribute('title', 'Owner Outreach');
        expect(outreachBtn).toHaveAttribute('aria-label', 'Owner Outreach');

        // Verify positional relationship: outreach button comes immediately before deal intake button
        const actionButtonsContainer = outreachBtn.parentElement;
        const buttons = actionButtonsContainer.querySelectorAll('button');
        expect(buttons.length).toBe(2);
        expect(buttons[0]).toBe(outreachBtn);
        expect(buttons[1]).toBe(dealIntakeBtn);
    });

    it('calls onOpenOwnerOutreach when the Owner Outreach button is clicked', () => {
        const onOpenOwnerOutreach = vi.fn();
        render(<InventoryStatsBar {...defaultProps} onOpenOwnerOutreach={onOpenOwnerOutreach} />);

        const outreachBtn = screen.getByRole('button', { name: /Owner Outreach/i });
        fireEvent.click(outreachBtn);

        expect(onOpenOwnerOutreach).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigate with "deal-intake" when the Deal Intake button is clicked', () => {
        const onNavigate = vi.fn();
        render(<InventoryStatsBar {...defaultProps} onNavigate={onNavigate} />);

        const dealIntakeBtn = screen.getByRole('button', { name: /Deal Intake Engine/i });
        fireEvent.click(dealIntakeBtn);

        expect(onNavigate).toHaveBeenCalledWith('deal-intake');
    });
});
