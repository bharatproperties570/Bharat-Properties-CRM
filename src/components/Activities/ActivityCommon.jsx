
export const ModalOverlay = ({ isOpen, children }) => (
    <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out'
    }}>
        {children}
    </div>
);

export const FormLabel = ({ children, required, style }) => (
    <label style={{
        display: 'block',
        fontSize: '0.8rem',
        fontWeight: 700,
        color: '#475569',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
        ...style
    }}>
        {children} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
);

export const FormInput = ({ hasError, ...props }) => (
    <input
        {...props}
        style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '10px',
            border: `1px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
            fontSize: '0.9rem',
            color: '#1e293b',
            outline: 'none',
            transition: 'all 0.2s',
            backgroundColor: '#f8fafc',
            ...props.style
        }}
    />
);

export const FormSelect = ({ hasError, children, ...props }) => (
    <div style={{ position: 'relative' }}>
        <select
            {...props}
            style={{
                width: '100%',
                padding: '10px 12px',
                paddingRight: '32px',
                borderRadius: '10px',
                border: `1px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
                fontSize: '0.9rem',
                color: '#1e293b',
                outline: 'none',
                transition: 'all 0.2s',
                backgroundColor: '#f8fafc',
                appearance: 'none',
                cursor: 'pointer',
                ...props.style
            }}
        >
            {children}
        </select>
        <div style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#64748b',
            fontSize: '0.8rem'
        }}>
            <i className="fas fa-chevron-down"></i>
        </div>
    </div>
);

export const SectionTitle = ({ icon, children, color = '#334155', style }) => (
    <h4 style={{
        margin: '0 0 12px 0',
        fontSize: '0.9rem',
        fontWeight: 700,
        color: color,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        ...style
    }}>
        {icon && <i className={icon}></i>}
        {children}
    </h4>
);

export const ActivityCard = ({ children, background = '#f8fafc', borderColor = '#e2e8f0', style }) => (
    <div style={{
        backgroundColor: background,
        padding: '16px',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        marginBottom: '16px',
        ...style
    }}>
        {children}
    </div>
);
