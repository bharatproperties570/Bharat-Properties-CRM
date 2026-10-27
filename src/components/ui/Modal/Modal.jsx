import React, { useEffect, useRef, useId } from 'react';
import { IconButton } from '../Button/Button';

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
  'aria-labelledby': ariaLabelledBy
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // Save triggering element to restore focus on close
    previousFocusRef.current = document.activeElement;

    // Move focus inside the dialog
    if (modalRef.current) {
      modalRef.current.focus();
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape' && closeOnEscape && typeof onClose === 'function') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, closeOnEscape, onClose]);

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
    outline: 'none'
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
    if (e.target === e.currentTarget && closeOnBackdrop && typeof onClose === 'function') {
      onClose();
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
        aria-label={ariaLabel}
        tabIndex={-1}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        data-testid="modal-dialog"
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
