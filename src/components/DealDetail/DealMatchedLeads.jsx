import { formatIndianCurrency } from '../../utils/numberToWords';

const DealMatchedLeads = ({ matchingLeads, onNavigate, deal }) => {
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

    return (
        <div style={cardStyle}>
            <div style={{ ...sectionHeaderStyle, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                <h3 style={sectionTitleStyle}>
                    <div style={{ width: '32px', height: '32px', background: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <i className="fas fa-bullseye text-emerald-600" style={{ fontSize: '0.9rem' }}></i>
                    </div>
                    <span style={{ color: '#166534' }}>Top Matched Leads</span>
                </h3>
                <button
                    onClick={() => onNavigate('inventory-matching', deal.inventoryId?._id || deal.inventoryId)}
                    style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                    Match Centre →
                </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {matchingLeads && matchingLeads.length > 0 ? matchingLeads.slice(0, 3).map((lead, idx) => (
                    <div key={idx} style={{
                        padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #f0fdf4',
                        boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.02)', transition: 'all 0.2s',
                        cursor: 'pointer', position: 'relative', overflow: 'hidden'
                    }} className="hover:shadow-md hover:border-emerald-200 group" onClick={() => onNavigate('lead-detail', lead._id)}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: lead.score >= 80 ? '#10b981' : lead.score >= 50 ? '#f59e0b' : '#64748b' }}></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingLeft: '8px' }}>
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>{lead.name}</h4>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-phone-alt" style={{ fontSize: '0.6rem', opacity: 0.7 }}></i> {lead.mobile || lead.phone || lead.contactDetails?.phones?.[0]?.number || 'No Phone'}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                    <span style={{
                                        fontSize: '1rem', fontWeight: 900, color: lead.score >= 80 ? '#059669' : '#d97706',
                                        display: 'block', lineHeight: 1
                                    }}>{lead.score || 0}%</span>
                                    <i className="fas fa-certificate" style={{ fontSize: '0.6rem', color: lead.score >= 80 ? '#10b981' : '#f59e0b' }}></i>
                                </div>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Match</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '8px', paddingTop: '8px', borderTop: '1px dashed #f1f5f9' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                    background: '#f1f5f9', color: '#475569', textTransform: 'uppercase'
                                }}>
                                    {lead.category || 'Lead'}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <i className="far fa-calendar-alt"></i> {Math.floor((new Date() - new Date(lead.createdAt || Date.now())) / (1000 * 60 * 60 * 24))}d old
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                    Budget: {formatIndianCurrency(lead.budget || lead.maxBudget || lead.minBudget || 0)}
                                </span>
                            </div>
                            <div style={{
                                background: '#ecfdf5', color: '#059669', borderRadius: '50%',
                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem'
                            }}>
                                <i className="fas fa-arrow-right"></i>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                        <i className="fas fa-search-location" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.3 }}></i>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>No Perfect Matches</p>
                        <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0' }}>Try adjusting match criteria in centre</p>
                        <button
                            onClick={() => onNavigate('inventory-matching', deal.inventoryId?._id || deal.inventoryId)}
                            style={{ marginTop: '12px', fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Go to Match Centre
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DealMatchedLeads;
