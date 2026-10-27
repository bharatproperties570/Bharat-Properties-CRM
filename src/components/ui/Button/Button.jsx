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
    opacity: disabled ? 0.6 : (loading ? 0.8 : 1),
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

  const resolvedSize = sizeStyles[size] || sizeStyles.md;
  const resolvedVariant = variantStyles[variant] || variantStyles.primary;

  const combinedStyle = {
    ...baseStyle,
    ...resolvedSize,
    ...resolvedVariant,
    ...style
  };

  const handleClick = (e) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    if (onClick) {
      onClick(e);
    }
  };

  const renderIcon = () => {
    if (loading) {
      return <i className="fas fa-spinner fa-spin" aria-hidden="true" data-testid="button-spinner"></i>;
    }
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === 'string') {
      return <i className={icon} aria-hidden="true"></i>;
    }
    return null;
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      aria-disabled={disabled || loading ? 'true' : undefined}
      style={combinedStyle}
      className={`ui-button ${className}`}
      {...props}
    >
      {renderIcon()}
      {children}
    </button>
  );
};

export const IconButton = ({
  icon,
  'aria-label': ariaLabel,
  title,
  size = 'md',
  style = {},
  ...props
}) => {
  const accessibleName = ariaLabel || title || (typeof icon === 'string' ? icon.replace(/fa[srb]? fa-/, '').replace(/-/g, ' ') : 'button');

  const iconSizeStyles = {
    sm: { padding: '6px', minWidth: '32px', minHeight: '32px' },
    md: { padding: '10px', minWidth: '40px', minHeight: '40px' },
    lg: { padding: '12px', minWidth: '48px', minHeight: '48px' }
  };

  const combinedIconStyle = {
    ...(iconSizeStyles[size] || iconSizeStyles.md),
    ...style
  };

  return (
    <Button
      icon={icon}
      size={size}
      style={combinedIconStyle}
      aria-label={accessibleName}
      title={title || ariaLabel}
      {...props}
    >
      {''}
    </Button>
  );
};
