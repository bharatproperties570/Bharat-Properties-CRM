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

  it('respects closeOnBackdrop=false', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="No Backdrop Close" closeOnBackdrop={false}>
        <p>Persistent content</p>
      </Modal>
    );

    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(handleClose).not.toHaveBeenCalled();
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

  // --- Fix 1: Focus restoration stability on parent rerenders and DOM removal ---

  it('does NOT jump focus or trigger focus restoration when parent rerenders with a new onClose identity', () => {
    const TestRerender = () => {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button data-testid="parent-counter" onClick={() => setCount((c) => c + 1)}>
            Count: {count}
          </button>
          {/* New onClose function reference created on every render */}
          <Modal isOpen={true} onClose={() => {}} title="Stable Modal">
            <input data-testid="modal-input" placeholder="Type here" />
          </Modal>
        </div>
      );
    };

    render(<TestRerender />);

    const modalInput = screen.getByTestId('modal-input');
    modalInput.focus();
    expect(document.activeElement).toBe(modalInput);

    // Parent rerenders by triggering counter
    fireEvent.click(screen.getByTestId('parent-counter'));

    // Focus MUST remain inside the modal dialog on the input
    expect(document.activeElement).toBe(modalInput);
  });

  it('handles closing gracefully without throwing exceptions when the original trigger was removed from DOM', () => {
    const TestTriggerRemoval = () => {
      const [open, setOpen] = useState(false);
      const [showTrigger, setShowTrigger] = useState(true);

      return (
        <div>
          {showTrigger && (
            <button
              data-testid="volatile-trigger"
              onClick={() => {
                setOpen(true);
                setShowTrigger(false); // Trigger unmounts from DOM
              }}
            >
              Open and Delete Trigger
            </button>
          )}
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Orphaned Modal">
            <button data-testid="dismiss-btn" onClick={() => setOpen(false)}>
              Dismiss
            </button>
          </Modal>
        </div>
      );
    };

    render(<TestTriggerRemoval />);

    const trigger = screen.getByTestId('volatile-trigger');
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.queryByTestId('volatile-trigger')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Closing modal must not throw error even though trigger is gone
    expect(() => {
      fireEvent.click(screen.getByTestId('dismiss-btn'));
    }).not.toThrow();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // --- Fix 2: Focus trapping and keyboard navigation ---

  it('implements Tab and Shift+Tab focus trapping across focusable descendants', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Focus Trap Dialog">
        <input data-testid="first-field" placeholder="First" />
        <input data-testid="middle-field" placeholder="Middle" />
        <button data-testid="last-action">Last</button>
      </Modal>
    );

    // Notice: with title, the close button is the very first focusable element
    const closeBtn = screen.getByRole('button', { name: /close modal/i });
    const firstField = screen.getByTestId('first-field');
    const middleField = screen.getByTestId('middle-field');
    const lastAction = screen.getByTestId('last-action');

    // Tab from lastAction must wrap to closeBtn
    lastAction.focus();
    expect(document.activeElement).toBe(lastAction);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from closeBtn must wrap to lastAction
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastAction);

    // Normal typing in an input does not trigger tab trap
    middleField.focus();
    fireEvent.change(middleField, { target: { value: 'Hello' } });
    expect(middleField.value).toBe('Hello');
  });

  it('keeps focus on dialog container when no focusable descendants exist', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} hideCloseButton={true}>
        <p data-testid="static-text">Purely informational content without interactive elements</p>
      </Modal>
    );

    const dialog = screen.getByTestId('modal-dialog');
    expect(document.activeElement).toBe(dialog);

    // Pressing Tab keeps focus on the dialog container
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(dialog);

    // Pressing Shift+Tab keeps focus on the dialog container
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dialog);
  });
});
