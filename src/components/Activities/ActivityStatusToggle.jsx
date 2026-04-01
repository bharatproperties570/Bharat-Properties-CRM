
const ActivityStatusToggle = ({ status, onStatusChange }) => {
    const isCompleted = status === 'Completed';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: isCompleted ? '#ecfdf5' : '#f8fafc',
            borderRadius: '12px',
            border: `1px solid ${isCompleted ? '#10b981' : '#e2e8f0'}`,
            marginBottom: '20px',
            transition: 'all 0.3s ease'
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isCompleted ? '#065f46' : '#475569' }}>
                    Activity Status: <span style={{ color: isCompleted ? '#059669' : '#3b82f6' }}>{status}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: isCompleted ? '#059669' : '#64748b', fontWeight: 600 }}>
                    {isCompleted ? 'This activity will be marked as finished and outcomes will be logged.' : 'This activity is scheduled for later.'}
                </div>
            </div>
            
            <button
                onClick={() => onStatusChange(isCompleted ? 'Not Started' : 'Completed')}
                style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isCompleted ? '#10b981' : '#e2e8f0',
                    color: isCompleted ? '#fff' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                }}
            >
                {isCompleted ? (
                    <>
                        <i className="fas fa-check-circle"></i> Completed
                    </>
                ) : (
                    <>
                        <i className="far fa-clock"></i> Mark Completed
                    </>
                )}
            </button>
        </div>
    );
};

export default ActivityStatusToggle;
