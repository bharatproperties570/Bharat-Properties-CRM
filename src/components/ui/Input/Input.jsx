import React, { useId } from 'react';

export const Input = ({
  label,
  error,
  id,
  type = 'text',
  className = '',
  style = {},
  containerStyle = {},
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}) => {
  const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: error ? '1px solid #ef4444' : '1px solid #e2e8f0',
    fontSize: '0.9rem',
    background: '#fff',
    color: '#0f172a',
    transition: 'border 0.2s',
    boxSizing: 'border-box',
    ...style
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '6px'
  };

  const defaultId = useId();
  const inputId = id || defaultId;
  const errorId = error ? `${inputId}-error` : undefined;

  const resolvedAriaDescribedBy = [ariaDescribedBy, errorId].filter(Boolean).join(' ') || undefined;
  const resolvedAriaInvalid = ariaInvalid !== undefined ? ariaInvalid : (Boolean(error) || undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', ...containerStyle }} className={`ui-input-container ${className}`}>
      {label && <label htmlFor={inputId} style={labelStyle}>{label}</label>}
      {type === 'textarea' ? (
        <textarea
          id={inputId}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          aria-describedby={resolvedAriaDescribedBy}
          aria-invalid={resolvedAriaInvalid}
          {...props}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          style={inputStyle}
          aria-describedby={resolvedAriaDescribedBy}
          aria-invalid={resolvedAriaInvalid}
          {...props}
        />
      )}
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}
        >
          {error}
        </span>
      )}
    </div>
  );
};
