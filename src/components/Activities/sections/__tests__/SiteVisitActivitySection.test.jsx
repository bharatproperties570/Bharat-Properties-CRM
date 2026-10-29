import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SiteVisitActivitySection from '../SiteVisitActivitySection';
import toast from 'react-hot-toast';

vi.mock('../../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../../ActivityCommon', () => ({
    FormLabel: ({ children }) => <label>{children}</label>,
    FormSelect: ({ children, hasError, ...props }) => <select {...props}>{children}</select>,
    ActivityCard: ({ children }) => <div>{children}</div>,
    SectionTitle: ({ children }) => <h3>{children}</h3>
}));

const mockFormData = {
    type: 'Site Visit',
    status: 'Scheduled',
    purpose: 'Initial Visit',
    details: {
        journeyUrl: 'https://bharatproperties.co/journey/mock~token~123',
        journeyToken: 'mock~token~123'
    },
    visitedProperties: [
        {
            order: 0,
            project: 'DLF The Arbour',
            unitNo: 'Unit 402',
            status: 'READY'
        },
        {
            order: 1,
            project: 'M3M Golfestate',
            unitNo: 'Unit 1001',
            status: 'LOCKED',
            isLocked: true
        }
    ]
};

const mockProjects = [
    { _id: 'proj1', name: 'DLF The Arbour', blocks: [] },
    { _id: 'proj2', name: 'M3M Golfestate', blocks: [] }
];

describe('SiteVisitActivitySection & JourneyProgressTracker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock navigator.clipboard
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue()
            }
        });
        // Mock window.open
        window.open = vi.fn();
    });

    it('1. Renders Journey Tracker with link actions and property badges', () => {
        render(
            <SiteVisitActivitySection
                formData={mockFormData}
                handleChange={vi.fn()}
                errors={{}}
                projects={mockProjects}
                view="full"
            />
        );

        expect(screen.getByText(/client mobile journey tracker/i)).toBeInTheDocument();
        expect(screen.getByText(/copy link/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
        expect(screen.getAllByText(/DLF The Arbour/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/M3M Golfestate/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/ready to visit/i)).toBeInTheDocument();
        expect(screen.getByText(/locked/i)).toBeInTheDocument();
    });

    it('2. Copies journey link to clipboard when "Copy Link" is clicked', () => {
        render(
            <SiteVisitActivitySection
                formData={mockFormData}
                handleChange={vi.fn()}
                errors={{}}
                projects={mockProjects}
                view="full"
            />
        );

        const copyBtn = screen.getByRole('button', { name: /copy link/i });
        fireEvent.click(copyBtn);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            'https://bharatproperties.co/journey/mock~token~123'
        );
        expect(toast.success).toHaveBeenCalledWith('Client Journey link copied to clipboard!');
    });

    it('3. Opens WhatsApp share URL with pre-filled message when "Share WhatsApp" is clicked', () => {
        render(
            <SiteVisitActivitySection
                formData={mockFormData}
                handleChange={vi.fn()}
                errors={{}}
                projects={mockProjects}
                view="full"
            />
        );

        const waBtn = screen.getByRole('button', { name: /whatsapp/i });
        fireEvent.click(waBtn);

        expect(window.open).toHaveBeenCalledWith(
            expect.stringContaining('https://wa.me/?text='),
            '_blank'
        );
    });

    it('4. Omits Journey Tracker when journey URL and properties are absent', () => {
        const emptyFormData = {
            type: 'Site Visit',
            status: 'Scheduled',
            details: {},
            visitedProperties: []
        };

        render(
            <SiteVisitActivitySection
                formData={emptyFormData}
                handleChange={vi.fn()}
                errors={{}}
                view="full"
            />
        );

        expect(screen.queryByText(/client mobile journey tracker/i)).not.toBeInTheDocument();
    });
});
