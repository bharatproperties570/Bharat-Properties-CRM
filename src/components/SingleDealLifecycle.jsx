import React, { useMemo, useState } from 'react';
import {
    CheckCircle,
    Circle,
    Users,
    Home,
    TrendingUp,
    AlertCircle,
    Phone,
    FileText,
    X,
    Activity as ActivityIcon
} from 'lucide-react';

/**
 * SingleDealLifecycle Component (Enhanced + Interactive)
 * Premium arrow-based lifecycle tracker for a single deal with Activity Ledger.
 */

const STAGES = [
    { id: 'Open', label: 'Open', subStages: ['Open', 'New'], icon: RadioIcon, color: '#6366f1' },
    { id: 'Quote', label: 'Quote', subStages: ['Quote'], icon: FileText, color: '#8b5cf6' },
    { id: 'Negotiation', label: 'Negotiation', subStages: ['Negotiation'], icon: TrendingUp, color: '#f59e0b' },
    { id: 'Closed', label: 'Closed', subStages: ['Booked', 'Closed', 'Won', 'Lost', 'Unqualified', 'Closed Won', 'Closed Lost'], icon: CheckCircle, color: '#10b981' }
];

function RadioIcon({ size, color }) {
    return <Circle size={size} color={color} fill={color + '22'} />;
}

const SingleDealLifecycle = ({ deal, activities = [] }) => {
    const [selectedStage, setSelectedStage] = useState(null);

    const lifecycleData = useMemo(() => {
        if (!deal) return null;

        const currentStageRaw = deal.stage || 'Open';
        const currentStage = currentStageRaw.toLowerCase();

        const historyData = deal.stageHistory && deal.stageHistory.length > 0
            ? deal.stageHistory
            : [];

        const processedStages = STAGES.map((ms, idx) => {
            const mappedEntries = (historyData || []).filter(h =>
                ms.subStages.some(ss => ss.toLowerCase() === (h.stage || '').toLowerCase())
            );

            const isCurrent = ms.subStages.some(ss => ss.toLowerCase() === currentStage);
            const hasVisited = mappedEntries.length > 0 || isCurrent;

            let enteredAt = mappedEntries.length > 0 ? mappedEntries[0].enteredAt : null;
            let exitedAt = mappedEntries.length > 0 ? mappedEntries[mappedEntries.length - 1].exitedAt : null;

            if (idx === 0 && !enteredAt) enteredAt = deal.createdAt;
            if (isCurrent) exitedAt = null;

            // Activity filtering for this stage
            const actsInStage = (activities || []).filter(a => {
                const aTime = new Date(a.timestamp).getTime();
                const startTime = enteredAt ? new Date(enteredAt).getTime() : 0;
                const endTime = exitedAt ? new Date(exitedAt).getTime() : Date.now();
                return enteredAt && aTime >= startTime && aTime <= endTime;
            });

            const duration = enteredAt ? Math.ceil(((exitedAt ? new Date(exitedAt).getTime() : Date.now()) - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

            const breakdown = {
                calls: actsInStage.filter(a => (a.type || '').toLowerCase().includes('call')).length,
                meetings: actsInStage.filter(a => (a.type || '').toLowerCase().includes('meeting')).length,
                visits: actsInStage.filter(a => (a.type || '').toLowerCase().includes('site visit') || (a.details?.purpose || '').toLowerCase().includes('site visit')).length,
                total: actsInStage.length
            };

            // Build Ledger Data
            const ledger = actsInStage.map(a => {
                let icon = ActivityIcon;
                let color = '#64748b';
                const t = (a.type || '').toLowerCase();
                if (t.includes('call')) { icon = Phone; color = '#10b981'; }
                else if (t.includes('email')) { icon = FileText; color = '#3b82f6'; }
                else if (t.includes('visit')) { icon = Home; color = '#4f46e5'; }
                else if (t.includes('meeting')) { icon = Users; color = '#f59e0b'; }

                return {
                    type: a.type || 'Activity',
                    date: new Date(a.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    note: a.title + (a.description ? ` - ${a.description}` : ''),
                    agent: typeof a.actor === 'object' ? (a.actor.fullName || a.actor.name || 'System') : (a.actor || 'System'),
                    icon,
                    color
                };
            }).reverse();

            return {
                ...ms,
                status: isCurrent ? 'current' : (hasVisited ? 'completed' : 'future'),
                enteredAt,
                exitedAt,
                duration: duration <= 0 ? 1 : duration,
                breakdown,
                agent: mappedEntries.length > 0 ? (mappedEntries[mappedEntries.length - 1].triggeredByUser?.fullName || mappedEntries[mappedEntries.length - 1].triggeredByUser?.name || 'System') : 'System',
                isStuck: duration > 10 && isCurrent,
                ledger
            };
        });

        const transitions = [];
        for (let i = 0; i < processedStages.length - 1; i++) {
            const current = processedStages[i];
            const next = processedStages[i + 1];
            if (current.exitedAt && next.enteredAt) {
                const waitTime = Math.ceil((new Date(next.enteredAt).getTime() - new Date(current.exitedAt).getTime()) / (1000 * 60 * 60 * 24));
                transitions.push({ wait: waitTime > 0 ? waitTime : null });
            } else {
                transitions.push({ wait: null });
            }
        }

        return { stages: processedStages, transitions };
    }, [deal, activities]);

    if (!deal || !lifecycleData) return null;

    return (
        <div style={{ margin: '0 32px 12px 32px' }}>
            <style>{`
                .deal-journey {
                    display: flex;
                    align-items: stretch;
                    gap: 0;
                    overflow-x: auto;
                    padding: 4px 0;
                    scrollbar-width: none;
                }
                .deal-journey::-webkit-scrollbar { display: none; }

                .deal-arrow {
                    position: relative;
                    flex: 1;
                    min-width: 220px;
                    margin-left: -14px;
                    padding: 16px 20px 16px 36px;
                    clip-path: polygon(0% 0%, calc(100% - 18px) 0%, 100% 50%, calc(100% - 18px) 100%, 0% 100%, 18px 50%);
                    transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                    display: flex;
                    flex-direction: column;
                    border: none;
                    cursor: pointer;
                    background: #fff;
                    box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.5);
                }

                .deal-arrow.first {
                    margin-left: 0;
                    padding-left: 24px;
                    clip-path: polygon(0% 0%, calc(100% - 18px) 0%, 100% 50%, calc(100% - 18px) 100%, 0% 100%);
                    border-radius: 12px 0 0 12px;
                }

                .deal-arrow.last {
                    padding-right: 24px;
                    clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 18px 50%);
                    border-radius: 0 12px 12px 0;
                }

                .deal-arrow.completed { 
                    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                    color: #166534; 
                }
                
                .deal-arrow.current { 
                    background: linear-gradient(135deg, var(--stage-color, #4f46e5) 0%, #3b82f6 100%);
                    color: #fff;
                    z-index: 20;
                    transform: scale(1.02);
                    box-shadow: 0 10px 40px var(--stage-color-shadow, rgba(79, 70, 229, 0.4)), inset 0 0 0 1px rgba(255,255,255,0.2);
                    border: none;
                }

                .deal-arrow.current::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                    animation: sweep 3s infinite;
                    opacity: 0.3;
                }

                @keyframes sweep {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }

                .deal-arrow.future { 
                    background: #f8fafc; 
                    color: #94a3b8;
                    opacity: 0.8;
                }

                .deal-arrow.stuck { 
                    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                    color: #991b1b;
                }

                .pulse-dot {
                    width: 10px; height: 10px; border-radius: 50%; background: #fff;
                    box-shadow: 0 0 15px #fff, 0 0 30px #fff;
                    animation: active-pulse 2s infinite;
                    border: 2px solid rgba(255,255,255,0.5);
                }
                @keyframes active-pulse {
                    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(255,255,255,0.7); }
                    70% { transform: scale(1.4); opacity: 0.6; box-shadow: 0 0 0 10px rgba(255,255,255,0); }
                    100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
                }

                .side-panel {
                    position: fixed; right: 0; top: 0; bottom: 0;
                    width: 420px; background: #fff; z-index: 10000;
                    box-shadow: -20px 0 80px rgba(0,0,0,0.15);
                    padding: 40px; display: flex; flex-direction: column;
                    border-left: 1px solid #e2e8f0;
                    animation: slideRight 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                }
                @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .panel-overlay {
                    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 9999;
                    backdrop-filter: blur(8px);
                }
                .ledger-item { border-left: 2px solid #e2e8f0; padding-left: 20px; padding-bottom: 24px; position: relative; }
                .ledger-dot { position: absolute; left: -7px; top: 0; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            `}</style>

            <div className="deal-journey">
                {lifecycleData.stages.map((stage, idx) => (
                    <div
                        key={stage.id}
                        className={`deal-arrow ${stage.status} ${stage.isStuck ? 'stuck' : ''} ${idx === 0 ? 'first' : ''} ${idx === lifecycleData.stages.length - 1 ? 'last' : ''}`}
                        style={{
                            '--stage-color': stage.color,
                            '--stage-color-shadow': `${stage.color}55`
                        }}
                        onClick={() => stage.status !== 'future' && setSelectedStage(stage)}
                    >
                        {/* 1. Header Row (Compact) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <stage.icon size={14} color={stage.status === 'current' ? '#fff' : (stage.status === 'future' ? '#94a3b8' : stage.color)} />
                                <span style={{ fontWeight: 900, fontSize: '0.75rem', color: stage.status === 'current' ? '#fff' : (stage.status === 'future' ? '#64748b' : '#0f172a'), textTransform: 'uppercase' }}>
                                    {stage.label}
                                </span>
                                {stage.status === 'current' && <div className="pulse-dot" />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {stage.status === 'completed' && <CheckCircle size={12} color="#166534" />}
                                {stage.isStuck && <AlertCircle size={12} color="#ef4444" />}
                            </div>
                        </div>

                        {/* 2. Unified Middle Row: Dates, Durations & Metrics */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.6rem', fontWeight: 700 }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ color: stage.status === 'current' ? 'rgba(255,255,255,0.9)' : '#0f172a' }}>{stage.enteredAt ? new Date(stage.enteredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '---'}</span>
                                <span style={{ color: stage.status === 'current' ? '#fff' : (stage.isStuck ? '#ef4444' : '#475569'), background: stage.status === 'current' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.03)', padding: '0 4px', borderRadius: '3px' }}>
                                    {stage.status !== 'future' ? `${stage.duration}d` : '--'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <Metric value={stage.breakdown.calls} icon={<Phone size={8} />} color={stage.status === 'current' ? '#fff' : "#3b82f6"} />
                                <Metric value={stage.breakdown.meetings} icon={<Users size={8} />} color={stage.status === 'current' ? '#fff' : "#8b5cf6"} />
                                <Metric value={stage.breakdown.visits} icon={<Home size={8} />} color={stage.status === 'current' ? '#fff' : "#10b981"} />
                            </div>
                        </div>

                        {/* 3. Footer: CRM Data / Milestones */}
                        <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: stage.status === 'current' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.03)' }}>
                            {stage.status === 'current' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', fontWeight: 950, color: '#fff', marginBottom: '1px' }}>
                                            <span>WIN {deal.dealProbability || 50}%</span>
                                        </div>
                                        <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.2)', borderRadius: '1px', overflow: 'hidden' }}>
                                            <div style={{ width: `${deal.dealProbability || 50}%`, height: '100%', background: '#fff' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                        <Badge label="T" active={deal.financialDetails?.token?.status === 'Completed'} isDark={true} />
                                        <Badge label="A" active={deal.financialDetails?.agreement?.status === 'Completed'} isDark={true} />
                                        <Badge label="R" active={deal.financialDetails?.registry?.status === 'Completed'} isDark={true} />
                                    </div>
                                </div>
                            )}
                            {stage.status === 'completed' && (
                                <div style={{ fontSize: '0.55rem', color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Users size={8} /> {stage.agent}
                                </div>
                            )}
                            {idx < lifecycleData.stages.length - 1 && lifecycleData.transitions[idx].wait && (
                                <div style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 5px', fontSize: '0.55rem', fontWeight: 800, color: '#4f46e5', zize: 100, boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                    {lifecycleData.transitions[idx].wait}d
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* SIDE PANEL LEDGER COMPONENT */}
            {selectedStage && (
                <>
                    <div className="panel-overlay" onClick={() => setSelectedStage(null)} />
                    <div className="side-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.5px' }}>{selectedStage.label} Activity</h2>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Technical Activity Sigs & Timeline</p>
                            </div>
                            <button onClick={() => setSelectedStage(null)} style={{ background: '#f1f5f9', border: 'none', padding: '10px', borderRadius: '12px', cursor: 'pointer' }}>
                                <X size={20} color="#0f172a" />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
                            {selectedStage.ledger.length > 0 ? (
                                selectedStage.ledger.map((item, i) => (
                                    <div key={i} className="ledger-item">
                                        <div className="ledger-dot" style={{ background: item.color }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 950, color: item.color, textTransform: 'uppercase' }}>{item.type}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>{item.date}</span>
                                        </div>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 600, color: '#334155', lineHeight: '1.5' }}>{item.note}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>
                                            <Users size={12} /> {item.agent}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                    <ActivityIcon size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
                                    <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>No specific activities recorded for this stage.</p>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                            <button onClick={() => setSelectedStage(null)} style={{ width: '100%', padding: '16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: 950, fontSize: '0.9rem', cursor: 'pointer' }}>
                                CLOSE LEDGER
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const Metric = ({ value, icon, color }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 4px', borderRadius: '4px',
        background: `${color}08`, border: `1px solid ${color}15`, color: color
    }}>
        {icon}
        <span style={{ fontSize: '0.55rem', fontWeight: 800 }}>{value}</span>
    </div>
);

const Badge = ({ label, active }) => (
    <div style={{
        fontSize: '0.45rem', fontWeight: 900, padding: '1px 4px', borderRadius: '3px',
        background: active ? '#dcfce7' : '#f1f5f9', color: active ? '#166534' : '#64748b',
        border: `1px solid ${active ? '#bcf0da' : '#e2e8f0'}`, letterSpacing: '0.5px'
    }}>
        {label}
    </div>
);

export default React.memo(SingleDealLifecycle);
