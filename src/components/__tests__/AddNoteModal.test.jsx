import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddNoteModal from '../AddNoteModal';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

vi.mock('../../utils/api', () => ({
  api: {
    post: vi.fn()
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('AddNoteModal (Design System Adoption Pilot)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal dialog with textarea input and action buttons', () => {
    render(
      <AddNoteModal
        isOpen={true}
        onClose={() => {}}
        entityId="deal-123"
        entityType="Deal"
        onNoteAdded={() => {}}
      />
    );

    expect(screen.getByRole('dialog', { name: /add quick note/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/note content/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save note/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('prevents saving empty note and warns user via toast', async () => {
    render(
      <AddNoteModal
        isOpen={true}
        onClose={() => {}}
        entityId="deal-123"
        entityType="Deal"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save note/i }));

    expect(toast.error).toHaveBeenCalledWith('Please enter a note');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('successfully submits note, calls onNoteAdded, and closes modal', async () => {
    const handleClose = vi.fn();
    const handleNoteAdded = vi.fn();

    api.post.mockResolvedValueOnce({
      data: { success: true }
    });

    render(
      <AddNoteModal
        isOpen={true}
        onClose={handleClose}
        entityId="deal-123"
        entityType="Deal"
        onNoteAdded={handleNoteAdded}
      />
    );

    const textarea = screen.getByLabelText(/note content/i);
    fireEvent.change(textarea, { target: { value: 'Client requested revised quotation.' } });

    fireEvent.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('activities', expect.objectContaining({
        entityId: 'deal-123',
        entityType: 'Deal',
        type: 'Note',
        description: 'Client requested revised quotation.'
      }));
      expect(toast.success).toHaveBeenCalledWith('Note added successfully');
      expect(handleNoteAdded).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
