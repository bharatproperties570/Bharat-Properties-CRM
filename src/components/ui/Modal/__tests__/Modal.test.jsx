import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal Primitive', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Modal Body</p>
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog container with role="dialog", aria-modal="true", and aria-labelledby', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Create Lead">
        <p>Modal Body Content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: /create lead/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Modal Body Content')).toBeInTheDocument();
  });

  it('invokes onClose when clicking close button', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Edit Deal">
        <p>Content</p>
      </Modal>
    );

    const closeBtn = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('hides close button when hideCloseButton is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Locked View" hideCloseButton={true}>
        <p>Content</p>
      </Modal>
    );

    expect(screen.queryByRole('button', { name: /close modal/i })).not.toBeInTheDocument();
  });

  it('invokes onClose on backdrop click but preserves dialog on inner clicks', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Backdrop Test">
        <button data-testid="inner-action">Inside Dialog</button>
      </Modal>
    );

    // Inner click: must stop propagation
    fireEvent.click(screen.getByTestId('inner-action'));
    expect(handleClose).not.toHaveBeenCalled();

    // Backdrop click: invokes onClose
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles Escape key to close modal unless closeOnEscape is false', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    handleClose.mockClear();
    rerender(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test" closeOnEscape={false}>
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('restores focus to previous active element upon closing', () => {
    const TestComponent = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="trigger-btn" onClick={() => setOpen(true)}>
            Open Dialog
          </button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Focus Restoration">
            <button data-testid="close-btn" onClick={() => setOpen(false)}>
              Close Inside
            </button>
          </Modal>
        </div>
      );
    };

    render(<TestComponent />);

    const trigger = screen.getByTestId('trigger-btn');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open modal
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
