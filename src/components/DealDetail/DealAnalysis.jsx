
const DealAnalysis = ({ deal, isMarkingLost, handleMarkAsLost, setDeal }) => {
    if (!isMarkingLost && deal.stage !== 'Closed Lost') return null;

    return (
        <div style={{
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid #fee2e2',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.08)',
            overflow: 'hidden',
            marginBottom: '16px',
            animation: 'slideInRight 0.3s ease'
        }}>
            <div style={{
                padding: '14px 20px',
                background: '#fef2f2',
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
                                <span key={i} style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>
                                    {r}
                                </span>
                            ))}
                        </div>
                        {deal.closingDetails?.remarks && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px' }}>Closure Remarks</div>
                                <p style={{ fontSize: '0.8rem', color: '#1e293b', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', margin: 0 }}>
                                    {deal.closingDetails.remarks}
                                </p>
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
                                            background: (deal.closingDetails?.lossReasons || []).includes(reason) ? '#ef4444' : '#fff',
                                            border: `1px solid ${(deal.closingDetails?.lossReasons || []).includes(reason) ? '#ef4444' : '#e2e8f0'}`,
                                            color: (deal.closingDetails?.lossReasons || []).includes(reason) ? '#fff' : '#475569',
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
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.8rem',
                                    minHeight: '80px',
                                    outline: 'none',
                                    resize: 'none'
                                }}
                            />
                        </div>

                        <button
                            onClick={() => handleMarkAsLost({ primaryReasons: deal.closingDetails?.lossReasons, remarks: deal.closingDetails?.remarks })}
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
