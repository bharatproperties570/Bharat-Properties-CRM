import { useTheme } from '../../context/ThemeContext';

const DealAnalysis = ({ deal, isMarkingLost, handleMarkAsLost, setDeal }) => {
    const { isDark } = useTheme();
    if (!isMarkingLost && deal.stage !== 'Closed Lost') return null;

    return (
        <div style={{
            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
            borderRadius: '16px',
            border: '1px solid #fee2e2',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.08)',
            overflow: 'hidden',
            marginBottom: '16px',
            animation: 'slideInRight 0.3s ease'
        }}>
            <div style={{
                padding: '14px 20px',
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fef2f2',
                borderBottom: '1px solid #fee2e2',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-exclamation-triangle"></i> Loss Analysis
                </span>
                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>LOST</span>
            </div>

            <div style={{ padding: '20px' }}>
                {deal.stage === 'Closed Lost' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Selected Reasons</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(deal.closingDetails?.lossReasons || ['Price Issue']).map((r, i) => (
                                <span key={i} style={{ padding: '4px 10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569' }}>
                                    {r}
                                </span>
                            ))}
                        </div>
                        {deal.closingDetails?.remarks && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Closure Remarks</div>
                                <p style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-main)' : '#1e293b', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '10px', borderRadius: '8px', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', margin: 0 }}>
                                    {deal.closingDetails.remarks}
                                </p>
                            </div>
                        )}
                        {(deal.closingDetails?.lostPrice || deal.closingDetails?.lostDate) && (
                            <div style={{ marginTop: '8px', display: 'flex', gap: '16px' }}>
                                {deal.closingDetails?.lostPrice && (
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Market Price</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                                            ₹{Number(deal.closingDetails.lostPrice).toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                )}
                                {deal.closingDetails?.lostDate && (
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Closure Date</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                                            {new Date(deal.closingDetails.lostDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '10px' }}>Primary Reasons (Select)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {['Price Mismatch', 'Location Issue', 'Lost to Competitor', 'Budget Constraints', 'Regulatory Issues', 'Delayed Decision'].map((reason) => (
                                    <button
                                        key={reason}
                                        onClick={() => {
                                            const current = deal.closingDetails?.lossReasons || [];
                                            const next = current.includes(reason) ? current.filter(r => r !== reason) : [...current, reason];
                                            setDeal(prev => ({
                                                ...prev,
                                                closingDetails: { ...prev.closingDetails, lossReasons: next }
                                            }));
                                        }}
                                        style={{
                                            padding: '8px',
                                            background: (deal.closingDetails?.lossReasons || []).includes(reason) ? '#ef4444' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                            border: `1px solid ${(deal.closingDetails?.lossReasons || []).includes(reason) ? '#ef4444' : '#e2e8f0'}`,
                                            color: (deal.closingDetails?.lossReasons || []).includes(reason) ? '#fff' : isDark ? 'var(--text-main)' : '#475569',
                                            borderRadius: '8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {reason}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Manual Remarks</div>
                            <textarea
                                placeholder="Add detailed reason for loss..."
                                value={deal.closingDetails?.remarks || ''}
                                onChange={(e) => setDeal(prev => ({
                                    ...prev,
                                    closingDetails: { ...prev.closingDetails, remarks: e.target.value }
                                }))}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                    fontSize: '0.8rem',
                                    minHeight: '80px',
                                    outline: 'none',
                                    resize: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Lost Deal Price (Optional)</div>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 600, fontSize: '0.85rem' }}>₹</span>
                                    <input
                                        type="number"
                                        placeholder="Enter market price"
                                        value={deal.closingDetails?.lostPrice || ''}
                                        onChange={(e) => setDeal(prev => ({
                                            ...prev,
                                            closingDetails: { ...prev.closingDetails, lostPrice: e.target.value ? Number(e.target.value) : '' }
                                        }))}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px 10px 28px',
                                            borderRadius: '10px',
                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                            fontSize: '0.8rem',
                                            outline: 'none',
                                            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                            color: isDark ? 'var(--text-main)' : '#1e293b'
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Lost Date (Optional)</div>
                                <input
                                    type="date"
                                    value={deal.closingDetails?.lostDate ? new Date(deal.closingDetails.lostDate).toISOString().split('T')[0] : ''}
                                    onChange={(e) => setDeal(prev => ({
                                        ...prev,
                                        closingDetails: { ...prev.closingDetails, lostDate: e.target.value }
                                    }))}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                        fontSize: '0.8rem',
                                        outline: 'none',
                                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                        color: isDark ? 'var(--text-main)' : '#1e293b'
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => handleMarkAsLost({ 
                                primaryReasons: deal.closingDetails?.lossReasons, 
                                remarks: deal.closingDetails?.remarks,
                                lostPrice: deal.closingDetails?.lostPrice,
                                lostDate: deal.closingDetails?.lostDate
                            })}
                            style={{
                                padding: '12px',
                                background: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                            }}
                        >
                            CONFIRM DEAL LOSS
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DealAnalysis;
