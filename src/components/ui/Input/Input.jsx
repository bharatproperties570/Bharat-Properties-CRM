import React from 'react';

export const Input = ({
  label,
  error,
  id,
  type = 'text',
  className = '',
  style = {},
  containerStyle = {},
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

  const generatedId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', ...containerStyle }} className={`ui-input-container ${className}`}>
      {label && <label htmlFor={generatedId} style={labelStyle}>{label}</label>}
      {type === 'textarea' ? (
          <textarea id={generatedId} style={{...inputStyle, minHeight: '80px', resize: 'vertical'}} {...props} />
      ) : (
          <input id={generatedId} type={type} style={inputStyle} {...props} />
      )}
      {error && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{error}</span>}
    </div>
  );
};
