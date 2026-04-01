
const DealStakeholders = ({ deal }) => {
    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #fff, #f8fafc)'
    };

    const sectionTitleStyle = {
        fontSize: '0.95rem',
        fontWeight: 900,
        color: '#0f172a',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    };

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div style={cardStyle}>
            <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>
                    <i className="fas fa-user-tie text-indigo-600"></i> Key Stakeholders
                </h3>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {deal.inventoryId?.owners?.length > 0 && (
                    <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '10px' }}>Primary Owners</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {deal.inventoryId.owners.map((owner, idx) => (
                                <div key={idx} style={{ padding: '12px', background: 'linear-gradient(to right, #f0fdf4, #fff)', borderRadius: '14px', border: '1px solid #dcfce7', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', background: '#10b981', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.8rem' }}>
                                        {getInitials(owner.name)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#064e3b' }}>{owner.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>{owner.phones?.[0]?.number || 'NO PHONE'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '10px' }}>Deal Internal Team</label>
                    <div style={{ padding: '12px', background: 'linear-gradient(to right, #f5f3ff, #fff)', borderRadius: '14px', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', background: '#4f46e5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.8rem' }}>
                            {getInitials(deal.assignedTo?.name || 'U')}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#312e81' }}>{deal.assignedTo?.name || 'Unassigned'}</div>
                            <div style={{ fontSize: '0.7rem', color: '#4f46e5', fontWeight: 600 }}>RM / Deal Custodian</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DealStakeholders;
