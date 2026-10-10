import React from 'react';

export const Button = ({
  children,
  onClick,
  variant = 'primary', // primary, secondary, danger, ghost
  size = 'md', // sm, md, lg
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  icon = null,
  style = {},
  ...props
}) => {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 0.2s ease',
    border: '1px solid transparent',
  };

  const sizeStyles = {
    sm: { padding: '6px 12px', fontSize: '0.8rem' },
    md: { padding: '10px 16px', fontSize: '0.9rem' },
    lg: { padding: '12px 24px', fontSize: '1rem' },
  };

  const variantStyles = {
    primary: {
      background: '#3b82f6',
      color: '#fff',
    },
    secondary: {
      background: '#f1f5f9',
      color: '#475569',
      border: '1px solid #e2e8f0',
    },
    danger: {
      background: '#ef4444',
      color: '#fff',
    },
    ghost: {
      background: 'transparent',
      color: '#3b82f6',
    }
  };

  const combinedStyle = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={combinedStyle}
      className={`ui-button ${className}`}
      {...props}
    >
      {loading ? (
        <i className="fas fa-spinner fa-spin"></i>
      ) : icon ? (
        <i className={icon}></i>
      ) : null}
      {children}
    </button>
  );
};

export const IconButton = ({ icon, ...props }) => {
    return <Button icon={icon} {...props}>{''}</Button>
}
