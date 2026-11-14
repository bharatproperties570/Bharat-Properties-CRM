import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';

describe('Sidebar Component', () => {
    const defaultProps = {
        currentView: 'inventory',
        onNavigate: vi.fn(),
        isSuperAdmin: false,
        isOpen: true,
        isCollapsed: false,
        toggleCollapse: vi.fn()
    };

    it('does not contain the Owner Outreach navigation link in the sidebar', () => {
        render(<Sidebar {...defaultProps} />);

        expect(screen.queryByTitle('Owner Outreach')).toBeNull();
        expect(screen.queryByText(/Owner Outreach/i)).toBeNull();
    });

    it('preserves standard navigation items (inventory, deals, projects, communication)', () => {
        render(<Sidebar {...defaultProps} />);

        expect(screen.getByTitle('Inventory')).toBeInTheDocument();
        expect(screen.getByTitle('Deals')).toBeInTheDocument();
        expect(screen.getByTitle('Projects')).toBeInTheDocument();
        expect(screen.getByTitle('Communication')).toBeInTheDocument();
    });
});
