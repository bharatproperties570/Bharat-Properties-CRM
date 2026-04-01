
export const PriceCard = ({ label, value, subValue, theme = 'indigo', isDiff = false, isStatus = false }) => {
    const colors = {
        indigo: { bg: '#eef2ff', text: '#4338ca', border: '#e0e7ff', icon: 'fa-tag' },
        blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#dbeafe', icon: 'fa-file-invoice-dollar' },
        green: { bg: '#ecfdf5', text: '#047857', border: '#d1fae5', icon: 'fa-chart-line' },
        red: { bg: '#fef2f2', text: '#b91c1c', border: '#fee2e2', icon: 'fa-chart-line' },
        orange: { bg: '#fff7ed', text: '#c2410c', border: '#ffedd5', icon: 'fa-handshake' }
    };
    const c = colors[theme] || colors.indigo;

    return (
        <div style={{
            background: c.bg, padding: '20px', borderRadius: '16px', border: `1px solid ${c.border}`,
            display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s'
        }} className="hover:shadow-md">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, color: c.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <i className={`fas ${c.icon}`} style={{ fontSize: '0.8rem', color: c.text, opacity: 0.5 }}></i>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                {isStatus ? value : (isDiff && value > 0 ? '+' : '') + (typeof value === 'number' ? `₹${value.toLocaleString('en-IN')}` : value)}
            </div>
            {subValue && <div style={{ fontSize: '0.65rem', fontWeight: 700, color: c.text, opacity: 0.8, textTransform: 'uppercase' }}>{subValue}</div>}
        </div>
    );
};

export const DetailField = ({ label, value, icon }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {icon && <i className={`fas ${icon}`} style={{ fontSize: '0.6rem' }}></i>}
            {label}
        </span>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{value || 'N/A'}</span>
    </div>
);

export const TabItem = ({ id, label, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '12px 20px', background: 'none', border: 'none',
            fontSize: '0.8rem', fontWeight: 800, color: active ? '#4f46e5' : '#64748b',
            cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
            textTransform: 'uppercase', letterSpacing: '0.05em'
        }}
    >
        {label}
        {active && <div style={{ position: 'absolute', bottom: '-2px', left: 0, width: '100%', height: '2px', background: '#4f46e5' }}></div>}
    </button>
);

export const TableContainer = ({ children }) => (
    <div style={{ width: '100%', overflowX: 'auto' }}>
        {children}
    </div>
);

export const MediaViewerModal = ({ isOpen, onClose, data }) => {
    if (!isOpen || !data) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.95)', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px', backdropFilter: 'blur(10px)'
        }}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: '20px', right: '20px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', transition: 'all 0.2s'
                }}
            >
                <i className="fas fa-times"></i>
            </button>

            <div style={{ maxWidth: '90%', maxHeight: '80%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {data.type === 'image' ? (
                    <img
                        src={data.url || data.previewUrl || data.path}
                        alt={data.title}
                        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                    />
                ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', maxWidth: '1000px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                        {data.ytId ? (
                            <iframe
                                width="100%"
                                height="100%"
                                src={`https://www.youtube.com/embed/${data.ytId}?autoplay=1`}
                                title={data.title}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <video
                                src={data.url}
                                controls
                                autoPlay
                                style={{ width: '100%', height: '100%' }}
                            ></video>
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px 0' }}>{data.title || data.category || 'Media File'}</h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: 600 }}>{data.type === 'video' ? 'Video File' : 'Image File'}</p>
            </div>
        </div>
    );
};
