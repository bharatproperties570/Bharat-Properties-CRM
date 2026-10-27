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

  // --- Fix 3: Accessible description and title binding on role="alertdialog" ---

  it('associates both title (aria-labelledby) and message (aria-describedby) with role="alertdialog"', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Archive Inventory Unit"
        message="This action will remove the property from active public searches."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    const title = screen.getByText('Archive Inventory Unit');
    const message = screen.getByText('This action will remove the property from active public searches.');

    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(dialog).toHaveAttribute('aria-describedby', message.id);
    expect(title.id).toBeTruthy();
    expect(message.id).toBeTruthy();
  });

  it('preserves caller-provided aria-describedby and aria-labelledby overrides', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Custom Title"
        message="Custom Message"
        aria-labelledby="custom-title-id"
        aria-describedby="custom-desc-id"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'custom-title-id');
    expect(dialog).toHaveAttribute('aria-describedby', 'custom-desc-id');
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
