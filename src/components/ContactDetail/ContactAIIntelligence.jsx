import React from 'react';

const ContactAIIntelligence = React.memo(function ContactAIIntelligence({
    contact,
    aiStats,
    recordType,
    dealStatus,
    expandedSections,
    toggleSection,
    renderLookup,
    showNotification
}) {
    if (recordType !== 'lead') return null;

    return (
        <>
            {/* AI Closing Probability Timeline */}
            <div className="glass-card" style={{ borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.3)', boxShadow: '0 8px 32px 0 rgba(79, 70, 229, 0.08)' }}>
                <div onClick={() => toggleSection('probability')} style={{ padding: '14px 20px', background: 'rgba(79, 70, 229, 0.05)', borderBottom: '1px solid rgba(79, 70, 229, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--premium-blue)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-chart-line"></i> AI Closing Probability
                    </span>
                    <i className={`fas fa-chevron-${expandedSections.includes('probability') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: 'var(--premium-blue)' }}></i>
                </div>
                {expandedSections.includes('probability') && (
                    <div style={{ padding: '20px' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--premium-blue)', letterSpacing: '-1px' }}>{aiStats.closingProbability.current}%</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>{aiStats.closingProbability.history}</div>
                            </div>
                            <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden', display: 'flex', border: '1px solid rgba(0,0,0,0.03)' }}>
                                <div style={{ width: `${aiStats.closingProbability.current}%`, background: 'linear-gradient(90deg, #4f46e5, #818cf8)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                            </div>
                        </div>
                        <div style={{ position: 'relative', paddingLeft: '24px' }}>
                            <div style={{ position: 'absolute', left: '4px', top: '5px', bottom: '5px', width: '2px', background: 'linear-gradient(to bottom, #4f46e5, #cbd5e1)' }}></div>
                            {aiStats.closingProbability.stages.map((st, i) => (
                                <div key={i} style={{ position: 'relative', marginBottom: '16px' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: '-24px',
                                        top: '4px',
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        background: dealStatus === 'lost' && st.status === 'active' ? '#ef4444' : st.status === 'completed' ? 'var(--premium-blue)' : st.status === 'active' ? '#ef4444' : '#e2e8f0',
                                        boxShadow: st.status === 'active' ? `0 0 10px ${dealStatus === 'lost' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` : 'none',
                                        zIndex: 2
                                    }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: st.status === 'active' ? 900 : 700, color: st.status === 'pending' ? '#94a3b8' : '#0f172a' }}>{st.label}</span>
                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800 }}>{st.prob}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', padding: '12px', borderRadius: '12px', border: '1px solid #dbeafe', fontSize: '0.75rem', color: '#1e40af', fontWeight: 700, marginTop: '10px', display: 'flex', gap: '8px' }}>
                            <i className="fas fa-lightbulb" style={{ marginTop: '2px' }}></i>
                            <span>{aiStats.closingProbability.insight}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* AI Deal Loss Analysis Module - Visible only when deal is lost and only for leads */}
            {dealStatus === 'lost' && (
                <div className="glass-card" style={{
                    borderRadius: '16px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.08)',
                    overflow: 'visible',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{
                        padding: '14px 20px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        borderBottom: '1px solid rgba(239, 68, 68, 0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderRadius: '16px 16px 0 0'
                    }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-exclamation-triangle"></i> AI Deal Loss Analysis
                        </span>
                        <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>LOST</span>
                    </div>

                    <div style={{ padding: '20px' }}>
                        {/* AI Loss Summary */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>AI Loss Summary</div>
                                <div style={{
                                    padding: '12px',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    lineHeight: '1.5',
                                    color: '#334155',
                                    border: '1px solid #f1f5f9',
                                    wordBreak: 'break-word'
                                }}>
                                    {aiStats.lossAnalysis.summary}
                                </div>
                        </div>

                        {/* Primary Reasons with Manual Override */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Primary Reasons</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {aiStats.lossAnalysis.primaryReasons.map((reason, i) => (
                                    <div key={i} style={{
                                        padding: '8px 12px',
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        position: 'relative'
                                    }}>
                                        <i className={`fas fa-${reason.icon}`} style={{ color: reason.type === 'auto' ? '#8b5cf6' : '#f59e0b', fontSize: '0.8rem' }}></i>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{reason.label}</span>
                                        <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>{reason.confidence}%</span>
                                        <button
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: '2px',
                                                cursor: 'pointer',
                                                color: '#94a3b8',
                                                fontSize: '0.7rem'
                                            }}
                                            title="Override Reason"
                                            onClick={() => showNotification('Edit Loss Reason modal opened.')}
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                    </div>
                                ))}
                                <button
                                    style={{
                                        padding: '8px 12px',
                                        background: 'none',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '10px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: '#64748b',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => showNotification('Add New Reason tool selected.')}
                                >
                                    + Add Reason
                                </button>
                            </div>
                        </div>

                        {/* Contributing Factors */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Contributing Factors</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {aiStats.lossAnalysis.contributingFactors.map((factor, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>{factor.label}</span>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            color: factor.impact === 'High' ? '#ef4444' : factor.impact === 'Medium' ? '#f59e0b' : '#3b82f6',
                                            background: factor.impact === 'High' ? '#fef2f2' : factor.impact === 'Medium' ? '#fffbeb' : '#eff6ff',
                                            padding: '2px 8px',
                                            borderRadius: '4px'
                                        }}>{factor.impact} Impact</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Re-engagement & Recovery */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>AI Recovery Path</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {aiStats.lossAnalysis.recoveryOptions.map((opt, i) => (
                                    <div key={i} style={{
                                        background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)',
                                        padding: '12px',
                                        borderRadius: '12px',
                                        border: '1px solid #dcfce7',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                                        }}>
                                            <i className={`fas fa-${opt.icon}`} style={{ color: '#16a34a', fontSize: '0.8rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065f46' }}>{opt.label}</div>
                                            <div style={{ fontSize: '0.6rem', color: '#166534', opacity: 0.8 }}>{opt.description}</div>
                                        </div>
                                        <button
                                            style={{
                                                background: '#16a34a',
                                                color: '#fff',
                                                border: 'none',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.6rem',
                                                fontWeight: 900,
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => showNotification(`Executing: ${opt.label}`)}
                                        >
                                            RUN
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* What could have saved this deal? */}
                        <div style={{ marginBottom: '20px', padding: '14px', background: 'rgba(79, 70, 229, 0.03)', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--premium-blue)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-lightbulb"></i> AI Retrospective
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {aiStats.lossAnalysis.couldHaveSaved.map((item, i) => (
                                    <div key={i}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>{item.label}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{item.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Feedback Loop */}
                        <div style={{
                            paddingTop: '16px',
                            borderTop: '1px solid #f1f5f9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Was this analysis accurate?</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem' }}
                                    onClick={() => showNotification('Feedback recorded: Helpful!')}
                                >
                                    <i className="far fa-thumbs-up" style={{ color: '#16a34a' }}></i>
                                </button>
                                <button
                                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem' }}
                                    onClick={() => showNotification('Feedback recorded: Improvement flagged.')}
                                >
                                    <i className="far fa-thumbs-down" style={{ color: '#ef4444' }}></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Intelligence Panel */}
            <div className="glass-card" style={{ borderRadius: '16px' }}>
                <div onClick={() => toggleSection('ai')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-microchip" style={{ color: '#8b5cf6' }}></i> AI Intelligence
                    </span>
                    <i className={`fas fa-chevron-${expandedSections.includes('ai') ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                </div>
                {expandedSections.includes('ai') && (
                    <div style={{ padding: '20px' }}>


                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>AI Nurture Lifecycle</div>
                            <div style={{ background: 'rgba(79, 70, 229, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--premium-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-robot"></i> {contact.customFields?.nurtureState?.replace('_', ' ') || 'INITIALIZING'}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', background: '#fff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        INTENT: {contact.intent_index || 0}%
                                    </div>
                                </div>

                                {/* Funnel Stepper */}
                                <div style={{ display: 'flex', gap: '4px', marginBottom: '15px' }}>
                                    {['LEAD_CREATED', 'WA_SENT', 'CALL_QUEUED', 'EMAIL_SENT', 'VISIT_BOOKED', 'HANDOFF'].map((s, idx) => {
                                        const states = ['LEAD_CREATED', 'WA_SENT', 'CALL_QUEUED', 'EMAIL_SENT', 'VISIT_BOOKED', 'HANDOFF'];
                                        const currentIdx = states.indexOf(contact.customFields?.nurtureState || 'LEAD_CREATED');
                                        const isActive = idx === currentIdx;
                                        const isCompleted = idx < currentIdx;

                                        return (
                                            <div key={s} style={{ 
                                                flex: 1, 
                                                height: '6px', 
                                                borderRadius: '3px',
                                                background: isActive ? 'var(--premium-blue)' : isCompleted ? '#818cf8' : '#e2e8f0',
                                                boxShadow: isActive ? '0 0 8px rgba(79, 70, 229, 0.4)' : 'none'
                                            }} title={s}></div>
                                        );
                                    })}
                                </div>

                                <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: '1.5', fontWeight: 600, wordBreak: 'break-word' }}>
                                    {contact.customFields?.nurtureState === 'CALL_QUEUED' ? (
                                        <span style={{ color: '#16a34a' }}>
                                            <i className="fas fa-phone-alt"></i> NurtureBot has queued an automated call to connect you with this lead.
                                        </span>
                                    ) : contact.customFields?.nurtureState === 'WA_SENT' ? (
                                        <span>WhatsApp introduction sent. Awaiting response or 24h timeout.</span>
                                    ) : contact.customFields?.nurtureState === 'EMAIL_SENT' ? (
                                        <span>Brochure & follow-up email delivered. Moving to Visit Booking phase soon.</span>
                                    ) : (
                                        <span>AI Agent is managing lead engagement and warming up for closing.</span>
                                    )}
                                </div>

                                <div style={{ marginTop: '12px', fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px' }}>
                                    Last automation action: {contact.customFields?.nurtureLastAdvancedAt ? new Date(contact.customFields.nurtureLastAdvancedAt).toLocaleString() : 'Just now'}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Lead Intelligence Continuity</div>
                            <div style={{ background: 'rgba(79, 70, 229, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--premium-blue)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-brain"></i> Intent High due to:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                                    <li>Converted Lead with Score <span style={{ color: aiStats.purchaseIntent.color, fontWeight: 800 }}>{aiStats.leadScore.total}</span></li>
                                    <li><span style={{ fontWeight: 800, color: '#0f172a' }}>{aiStats.leadScore.detail.match * 0.7 + 5 | 0} property matches</span> identified during lead stage</li>
                                    <li><span style={{ fontWeight: 800, color: '#0f172a' }}>{(aiStats.leadScore.detail.engagement / 10).toFixed(0)} recent calls</span></li>
                                </ul>
                                <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px', lineHeight: '1.4' }}>
                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px', color: '#f59e0b' }}></i>
                                    AI Learning: Deals from <span style={{ fontWeight: 800 }}>{renderLookup(aiStats.preferences.source)}</span> leads with score <span style={{ color: '#ef4444' }}>&lt;{aiStats.leadScore.total < 60 ? aiStats.leadScore.total : 60}</span> have <span style={{ color: '#ef4444', fontWeight: 800 }}>28% higher</span> loss risk.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {/* Card 1: Purchase Intent */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Purchase Intent</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: aiStats.purchaseIntent.color, display: 'flex', alignItems: 'center', gap: '8px' }}>{aiStats.purchaseIntent.level} {aiStats.purchaseIntent.emoji}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>Confidence</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a' }}>{aiStats.purchaseIntent.confidence}</div>
                                </div>
                            </div>

                            {/* Card: Deal Probability */}
                            <div style={{ background: 'rgba(79, 70, 229, 0.03)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--premium-blue)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Deal Probability</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--premium-blue)' }}>{aiStats.dealProbability.score}% <i className={`fas fa-arrow-${aiStats.dealProbability.trend}`} style={{ fontSize: '0.8rem' }}></i></div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ background: 'var(--premium-blue)', color: '#fff', fontSize: '0.55rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 900 }}>AI OPTIMIZED</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {aiStats.dealProbability.factors.map((f, i) => (
                                        <span key={i} style={{ fontSize: '0.65rem', background: '#fff', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(79, 70, 229, 0.1)', color: '#4b5563', fontWeight: 600 }}>{f}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Card 2: Risk Level */}
                            <div style={{ background: '#fff', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Risk Level</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: aiStats.riskLevel.color }}>{aiStats.riskLevel.status}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>Market Signal</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{aiStats.riskLevel.reason}</div>
                                </div>
                            </div>
                        </div>

                        {/* Next Best Action */}
                        <div style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', borderRadius: '16px', padding: '20px', color: '#fff', boxShadow: '0 10px 20px rgba(79, 70, 229, 0.3)' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <i className="fas fa-bolt"></i> Agent Playbook
                            </div>
                            <div style={{ fontSize: '1rem', color: '#fff', lineHeight: '1.4', fontWeight: 800, marginBottom: '20px' }}>
                                {aiStats.playbookAction}
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: '#fff', color: 'var(--premium-blue)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                    onClick={() => showNotification('Task creation initiated.')}
                                >
                                    Create Task
                                </button>
                                <button
                                    style={{ flex: 1, padding: '10px', fontSize: '0.75rem', fontWeight: 900, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                                    onClick={() => showNotification('WhatsApp integration coming soon.')}
                                >
                                    WhatsApp
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
});

ContactAIIntelligence.displayName = 'ContactAIIntelligence';

export default ContactAIIntelligence;
