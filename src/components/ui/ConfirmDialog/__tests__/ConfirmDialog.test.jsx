import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog Primitive', () => {
  it('renders alertdialog with title, message, and confirmation buttons', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Contact"
        message="Are you sure you want to permanently delete this contact?"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const dialog = screen.getByRole('alertdialog', { name: /delete contact/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to permanently delete this contact?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });

    expect(confirmBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('renders danger variant button for destructive confirmations', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Revoke Access"
        message="This user will immediately be logged out."
        confirmVariant="danger"
        confirmText="Revoke Now"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /revoke now/i });
    expect(confirmBtn.style.background).toBe('rgb(239, 68, 68)');
  });

  it('prevents accidental cancellation or double submission during isLoading', () => {
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Processing Payment"
        message="Please wait while the transaction completes."
        isLoading={true}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });

    expect(cancelBtn).toBeDisabled();
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute('aria-busy', 'true');

    // Attempting to cancel via button click is blocked
    fireEvent.click(cancelBtn);
    expect(handleCancel).not.toHaveBeenCalled();

    // Attempting to cancel via Escape key is blocked (Defect 9 regression test)
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleCancel).not.toHaveBeenCalled();

    // Attempting to cancel via backdrop click is blocked
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(handleCancel).not.toHaveBeenCalled();
  });
});
