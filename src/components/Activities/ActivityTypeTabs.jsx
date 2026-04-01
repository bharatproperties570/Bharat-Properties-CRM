
const ActivityTypeTabs = ({ activeType, onTypeChange }) => {
    const types = [
        { id: 'Call', icon: 'fas fa-phone-alt', color: '#3b82f6', label: 'Call' },
        { id: 'Meeting', icon: 'fas fa-users', color: '#a855f7', label: 'Meeting' },
        { id: 'Site Visit', icon: 'fas fa-map-marked-alt', color: '#10b981', label: 'Site Visit' },
        { id: 'Email', icon: 'fas fa-envelope', color: '#f97316', label: 'Email' },
        { id: 'Task', icon: 'fas fa-tasks', color: '#6366f1', label: 'Task' }
    ];

    return (
        <div style={{
            display: 'flex',
            gap: '8px',
            padding: '4px',
            background: '#f1f5f9',
            borderRadius: '12px',
            marginBottom: '24px'
        }}>
            {types.map(type => (
                <button
                    key={type.id}
                    onClick={() => onTypeChange(type.id)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        backgroundColor: activeType === type.id ? '#fff' : 'transparent',
                        color: activeType === type.id ? type.color : '#64748b',
                        boxShadow: activeType === type.id ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
                    }}
                >
                    <i className={type.icon} style={{ fontSize: '1rem' }}></i>
                    {type.label}
                </button>
            ))}
        </div>
    );
};

export default ActivityTypeTabs;
