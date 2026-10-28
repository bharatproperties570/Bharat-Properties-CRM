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

  // --- Strengthened parent-rerender regression tests ---

  it('does NOT jump focus or trigger premature focus restoration when parent rerenders with a new onClose identity', () => {
    let triggerRef = null;

    const ParentWrapper = ({ isOpen, onClose, iteration }) => {
      return (
        <div>
          <button
            data-testid="external-trigger"
            ref={(el) => { triggerRef = el; }}
          >
            Launch Dialog ({iteration})
          </button>
          <Modal isOpen={isOpen} onClose={onClose} title="Deterministic Test">
            <input data-testid="modal-field" placeholder="Active input field" />
            <button data-testid="modal-save">Save</button>
          </Modal>
        </div>
      );
    };

    // Initial render with modal closed
    const onCloseA = vi.fn();
    const { rerender } = render(
      <ParentWrapper isOpen={false} onClose={onCloseA} iteration={1} />
    );

    triggerRef.focus();
    expect(document.activeElement).toBe(triggerRef);

    // Open the modal
    const onCloseB = vi.fn();
    rerender(<ParentWrapper isOpen={true} onClose={onCloseB} iteration={2} />);

    // Explicitly focus the input inside the modal
    const modalField = screen.getByTestId('modal-field');
    modalField.focus();
    expect(document.activeElement).toBe(modalField);

    // Cause parent to rerender while isOpen remains true and onClose receives a brand new function identity.
    // Notice: NO simulated click is used, eliminating JSDOM synthetic click ambiguity.
    const onCloseC = vi.fn();
    rerender(<ParentWrapper isOpen={true} onClose={onCloseC} iteration={3} />);

    // 1. Verify the input remains document.activeElement after the rerender
    expect(document.activeElement).toBe(modalField);

    // 2. Verify focus restoration has NOT occurred prematurely
    expect(document.activeElement).not.toBe(triggerRef);

    // 3. Separately verify that closing the modal restores focus to the original trigger when connected
    const onCloseD = vi.fn();
    rerender(<ParentWrapper isOpen={false} onClose={onCloseD} iteration={4} />);
    expect(document.activeElement).toBe(triggerRef);
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

  // --- Keyboard focus-trap boundary audit tests ---

  it('implements Tab and Shift+Tab focus trapping across focusable descendants', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Focus Trap Dialog">
        <input data-testid="first-field" placeholder="First" />
        <input data-testid="middle-field" placeholder="Middle" />
        <button data-testid="last-action">Last</button>
      </Modal>
    );

    // In a titled modal, the close button is the first focusable element
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

  it('wraps to last element when Shift+Tab is pressed while dialog container is focused', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Container Focus Dialog">
        <input data-testid="solo-input" placeholder="Solo" />
        <button data-testid="solo-button">Submit</button>
      </Modal>
    );

    const dialog = screen.getByTestId('modal-dialog');
    const soloButton = screen.getByTestId('solo-button');
    const closeBtn = screen.getByRole('button', { name: /close modal/i });

    // Focus the container itself
    dialog.focus();
    expect(document.activeElement).toBe(dialog);

    // Shift+Tab from container wraps to last element (soloButton)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(soloButton);

    // Tab from container moves to first element (closeBtn)
    dialog.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);
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

  it('excludes disabled, hidden, and aria-hidden descendants from focus trapping', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} hideCloseButton={true}>
        <button data-testid="active-first">Active First</button>
        <button disabled data-testid="disabled-btn">Disabled</button>
        <div style={{ display: 'none' }}>
          <button data-testid="hidden-display-btn">Display None</button>
        </div>
        <div aria-hidden="true">
          <button data-testid="aria-hidden-btn">Aria Hidden</button>
        </div>
        <button data-testid="active-last">Active Last</button>
      </Modal>
    );

    const activeFirst = screen.getByTestId('active-first');
    const activeLast = screen.getByTestId('active-last');

    activeLast.focus();
    expect(document.activeElement).toBe(activeLast);

    // Tab from activeLast should skip disabled/hidden buttons and wrap directly to activeFirst
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(activeFirst);

    // Shift+Tab from activeFirst should wrap directly back to activeLast
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(activeLast);
  });

  // --- Phase 10.2.1 Targeted Accessibility Hardening Tests ---

  it('excludes contenteditable="false" from focusable elements unless explicitly given non-negative tabindex', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} hideCloseButton={true}>
        <button data-testid="start-btn">Start</button>
        <div contentEditable="false" suppressContentEditableWarning={true} data-testid="non-editable-div">Readonly text</div>
        <button data-testid="end-btn">End</button>
        <div contentEditable="false" suppressContentEditableWarning={true} data-testid="trailing-non-editable">Trailing non-editable</div>
      </Modal>
    );

    const startBtn = screen.getByTestId('start-btn');
    const endBtn = screen.getByTestId('end-btn');

    // Because trailing-non-editable is contenteditable="false", endBtn must be the last focusable element
    startBtn.focus();
    expect(document.activeElement).toBe(startBtn);

    // Shift+Tab from startBtn wraps to endBtn (skipping trailing-non-editable)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(endBtn);

    // Tab from endBtn wraps back to startBtn
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(startBtn);

    // Now test that contenteditable="true" is recognized as a focusable boundary element
    rerender(
      <Modal isOpen={true} onClose={() => {}} hideCloseButton={true}>
        <button data-testid="start-btn">Start</button>
        <div contentEditable="true" suppressContentEditableWarning={true} data-testid="editable-last">Editable Last</div>
      </Modal>
    );

    const editableLast = screen.getByTestId('editable-last');
    startBtn.focus();

    // Shift+Tab from startBtn should wrap to editableLast
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(editableLast);

    // Now test that contenteditable="false" WITH tabindex="0" is also recognized as focusable
    rerender(
      <Modal isOpen={true} onClose={() => {}} hideCloseButton={true}>
        <button data-testid="start-btn">Start</button>
        <div contentEditable="false" suppressContentEditableWarning={true} tabIndex={0} data-testid="tabindexed-last">Tabindexed Last</div>
      </Modal>
    );

    const tabindexedLast = screen.getByTestId('tabindexed-last');
    startBtn.focus();

    // Shift+Tab from startBtn should wrap to tabindexedLast
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(tabindexedLast);
  });

  it('protects core accessibility contracts (aria-modal, tabIndex) against caller prop overrides', () => {
    render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Protected Modal"
        aria-modal="false"
        tabIndex={0}
        data-custom-attr="preserved-custom-prop"
      >
        <p>Protected body</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: /protected modal/i });
    // aria-modal must remain "true"
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // tabIndex must remain -1 for focus container management
    expect(dialog).toHaveAttribute('tabIndex', '-1');
    // Unrelated caller prop is preserved
    expect(dialog).toHaveAttribute('data-custom-attr', 'preserved-custom-prop');
  });

  it('preserves caller onClick on dialog container while isolating backdrop clicks', () => {
    const handleDialogClick = vi.fn();
    const handleClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={handleClose} onClick={handleDialogClick} title="Click Isolation">
        <p>Dialog Body</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);

    // Caller dialog onClick fired
    expect(handleDialogClick).toHaveBeenCalledTimes(1);
    // Backdrop close handler was NOT triggered
    expect(handleClose).not.toHaveBeenCalled();
  });
});
