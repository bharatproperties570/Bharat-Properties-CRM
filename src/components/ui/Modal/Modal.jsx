import React, { useEffect, useRef, useId } from 'react';
import { IconButton } from '../Button/Button';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex^="-"])'
].join(', ');

const isElementVisible = (el) => {
  if (!el) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isElementVisible);
};

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md', // sm, md, lg, xl, full
  hideCloseButton = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  role = 'dialog',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  style = {},
  className = '',
  ...props
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();

  // Stable refs for callbacks and dynamic toggles to prevent re-running focus effects on rerenders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;

  const restoreFocus = () => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && typeof target.focus === 'function') {
      if (typeof document !== 'undefined' && document.contains(target)) {
        try {
          target.focus();
        } catch (e) {
          // Ignore if target cannot be focused
        }
      }
    }
  };

  // Manage open/close focus transitions
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        // Save the element that triggered the modal
        if (typeof document !== 'undefined') {
          previousFocusRef.current = document.activeElement;
        }

        // Move initial focus into the dialog: first focusable element, or dialog container itself
        const focusables = getFocusableElements(modalRef.current);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else if (modalRef.current) {
          modalRef.current.focus();
        }
      }
    } else {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        restoreFocus();
      }
    }
  }, [isOpen]);

  // Ensure focus is restored if the modal unmounts while open
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        restoreFocus();
      }
    };
  }, []);

  // Keyboard navigation: Escape key and Tab / Shift+Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (closeOnEscapeRef.current && typeof onCloseRef.current === 'function') {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;

        const focusables = getFocusableElements(modalRef.current);

        if (focusables.length === 0) {
          // No focusable descendants: keep focus on dialog container
          e.preventDefault();
          modalRef.current.focus();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: wrap from first element or container back to last element
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: wrap from last element back to first element
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const sizeMap = {
    sm: '400px',
    md: '600px',
    lg: '800px',
    xl: '1000px',
    full: '95%'
  };

  const modalStyle = {
    background: '#fff',
    borderRadius: '16px',
    width: sizeMap[size] || sizeMap.md,
    maxWidth: '95%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    overflow: 'hidden',
    outline: 'none',
    ...style
  };

  const headerStyle = {
    padding: '20px 24px',
    borderBottom: '1px solid #f1f5f9',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fff'
  };

  const contentStyle = {
    padding: '24px',
    overflowY: 'auto',
    flex: 1
  };

  const footerStyle = {
    padding: '16px 24px',
    borderTop: '1px solid #f1f5f9',
    background: '#f8fafc',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop && typeof onCloseRef.current === 'function') {
      onCloseRef.current();
    }
  };

  const computedAriaLabelledBy = ariaLabelledBy || (title ? titleId : undefined);

  return (
    <div
      style={overlayStyle}
      onClick={handleBackdropClick}
      data-testid="modal-overlay"
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={computedAriaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        data-testid="modal-dialog"
        className={`ui-modal-dialog ${className}`.trim()}
        {...props}
      >
        {title && (
          <div style={headerStyle}>
            <h2 id={titleId} style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {title}
            </h2>
            {!hideCloseButton && (
              <IconButton icon="fas fa-times" variant="ghost" onClick={onClose} aria-label="Close modal" />
            )}
          </div>
        )}
        <div style={contentStyle}>
          {children}
        </div>
        {footer && (
          <div style={footerStyle}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
