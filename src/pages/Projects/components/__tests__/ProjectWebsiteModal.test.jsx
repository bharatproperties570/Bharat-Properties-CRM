import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectWebsiteModal from '../ProjectWebsiteModal';
import toast from 'react-hot-toast';

vi.mock('../../../context/ThemeContext', () => ({
    useTheme: () => ({ isDark: false })
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

describe('ProjectWebsiteModal (Enterprise Website Publication)', () => {
    const mockOnClose = vi.fn();
    const mockOnUpdateSuccess = vi.fn();

    const draftProject = {
        _id: 'proj_123',
        name: 'Skyline Enclave',
        isPublished: false,
        address: { location: 'Sector 62, Gurgaon' },
        reraNumber: 'HRERA-GGM-2024-99'
    };

    const publishedProject = {
        _id: 'proj_456',
        name: 'Emerald Bay',
        isPublished: true,
        publishedAt: '2026-01-15T10:00:00.000Z',
        address: { location: 'Golf Course Extension, Gurgaon' },
        websiteMetadata: {
            slug: 'emerald-bay-golf-course'
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders null when isOpen is false', () => {
        const { container } = render(
            <ProjectWebsiteModal
                isOpen={false}
                onClose={mockOnClose}
                project={draftProject}
                onUpdateSuccess={mockOnUpdateSuccess}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders Draft status and Publish button when project is unpublished', () => {
        render(
            <ProjectWebsiteModal
                isOpen={true}
                onClose={mockOnClose}
                project={draftProject}
                onUpdateSuccess={mockOnUpdateSuccess}
            />
        );

        expect(screen.getByText('Publish to Website Catalog')).toBeInTheDocument();
        expect(screen.getByText(/STATUS: UNPUBLISHED \(DRAFT\)/)).toBeInTheDocument();
        expect(screen.getByText('Skyline Enclave')).toBeInTheDocument();
        expect(screen.getByText('HRERA-GGM-2024-99')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Confirm & Go Live/i })).toBeInTheDocument();
    });

    it('calls onUpdateSuccess with isPublished: true when publishing', async () => {
        mockOnUpdateSuccess.mockResolvedValueOnce({ success: true });

        render(
            <ProjectWebsiteModal
                isOpen={true}
                onClose={mockOnClose}
                project={draftProject}
                onUpdateSuccess={mockOnUpdateSuccess}
            />
        );

        const publishBtn = screen.getByRole('button', { name: /Confirm & Go Live/i });
        fireEvent.click(publishBtn);

        await waitFor(() => {
            expect(mockOnUpdateSuccess).toHaveBeenCalledWith(
                expect.objectContaining({
                    isPublished: true,
                    publishedAt: expect.any(String),
                    websiteMetadata: expect.objectContaining({
                        slug: 'skyline-enclave'
                    })
                })
            );
            expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Project is now LIVE'));
            expect(mockOnClose).toHaveBeenCalled();
        });
    });

    it('renders Live status and unpublish option when project is published', async () => {
        render(
            <ProjectWebsiteModal
                isOpen={true}
                onClose={mockOnClose}
                project={publishedProject}
                onUpdateSuccess={mockOnUpdateSuccess}
            />
        );

        expect(screen.getByText('Website Catalog Settings')).toBeInTheDocument();
        expect(screen.getByText(/STATUS: LIVE ON WEBSITE/)).toBeInTheDocument();
        expect(screen.getByText('PUBLIC')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Unpublish/i })).toBeInTheDocument();
    });

    it('handles unpublishing flow with confirmation', async () => {
        mockOnUpdateSuccess.mockResolvedValueOnce({ success: true });

        render(
            <ProjectWebsiteModal
                isOpen={true}
                onClose={mockOnClose}
                project={publishedProject}
                onUpdateSuccess={mockOnUpdateSuccess}
            />
        );

        // Click initial unpublish
        const unpublishBtn = screen.getByRole('button', { name: /Unpublish/i });
        fireEvent.click(unpublishBtn);

        // Shows confirmation warning
        expect(screen.getByText(/Are you sure you want to take this project offline/i)).toBeInTheDocument();

        // Click "Yes, Take Offline"
        const confirmBtn = screen.getByRole('button', { name: /Yes, Take Offline/i });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockOnUpdateSuccess).toHaveBeenCalledWith({
                isPublished: false
            });
            expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('unpublished and reverted to Draft'));
            expect(mockOnClose).toHaveBeenCalled();
        });
    });
});
