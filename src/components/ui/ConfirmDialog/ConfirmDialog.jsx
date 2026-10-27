import React, { useId } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary', // primary, danger
  isLoading = false,
  icon = 'fas fa-exclamation-triangle'
}) => {
  const titleId = useId();
  const descId = useId();

  const handleClose = () => {
    if (!isLoading && typeof onCancel === 'function') {
      onCancel();
    }
  };

  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === 'string') {
      return <i className={icon} aria-hidden="true"></i>;
    }
    return null;
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
        {cancelText}
      </Button>
      <Button variant={confirmVariant} onClick={onConfirm} loading={isLoading} disabled={isLoading}>
        {confirmText}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      hideCloseButton={true}
      closeOnEscape={!isLoading}
      closeOnBackdrop={!isLoading}
      role="alertdialog"
      aria-labelledby={titleId}
      footer={footer}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px', paddingTop: '12px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: confirmVariant === 'danger' ? '#fef2f2' : '#eff6ff',
          color: confirmVariant === 'danger' ? '#ef4444' : '#3b82f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
        }}>
          {renderIcon()}
        </div>
        <h3 id={titleId} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        <p id={descId} style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', lineHeight: '1.5' }}>
          {message}
        </p>
      </div>
    </Modal>
  );
};
