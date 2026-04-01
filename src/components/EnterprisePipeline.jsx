import { useMemo, useState } from 'react';
import {
    CheckCircle,
    Clock,
    Phone,
    Users,
    Home,
    TrendingUp,
    Info,
    MessageSquare,
    Activity as ActivityIcon,
    X,
    User
} from 'lucide-react';

/**
 * Compact Arrow-Style Lead Lifecycle Pipeline View
 * 
 * Features:
 * - Ultra-compact chevron/arrow-shaped interlocking stages
 * - Halved section height with ZERO data loss
 * - Data completely retained inside the arrows
 * - Smart pulse integration and Time tracking
 * - Click to open full Activity Ledger (side panel remains premium)
 */

const MAIN_STAGES = [
    { id: 'incoming', label: 'Incoming', subStages: ['New'], icon: Info, color: '#6366f1' },
    { id: 'prospect', label: 'Prospect', subStages: ['Prospect', 'Qualified'], icon: Users, color: '#8b5cf6' },
    { id: 'opportunity', label: 'Opportunity', subStages: ['Opportunity'], icon: TrendingUp, color: '#f59e0b' },
    { id: 'negotiations', label: 'Negotiations', subStages: ['Negotiation', 'Booking', 'Booked'], icon: Home, color: '#f97316' },
    { id: 'closed', label: 'Closed', subStages: ['Closed Won', 'Won', 'Closed Lost', 'Lost', 'Unqualified', 'Stalled'], icon: CheckCircle, color: '#10b981' }
];

const EnterprisePipeline = ({ contact, activities = [] }) => {
    const [selectedStage, setSelectedStage] = useState(null);

    // ─── LIFECYCLE LOGIC (LIVEDATA FROM BACKEND) ──────────────────────────────
    const lifecycle = useMemo(() => {
        if (!contact) return null;

        const currentStageValue = contact.stage?.lookup_value || contact.stage?.name || contact.stage || 'New';
        const currentStageLabel = String(currentStageValue).toLowerCase();

        // 1. Recover sequence of stage changes from contact.stageHistory (Direct Backend Schema)
        const schemaHistory = (contact.stageHistory || []).map(sh => ({
            stage: sh.stage || 'New',
            enteredAt: sh.enteredAt,
            exitedAt: sh.exitedAt,
            agent: sh.triggeredByUser ? (sh.triggeredByUser.fullName || sh.triggeredByUser.name || 'System') : 'System'
        }));

        // 2. Recover sequence of stage changes from unified timeline Audit Logs (Redundancy check)
        const stageLogs = activities
            .filter(a => a.source === 'audit' && a.metadata?.eventType === 'stage_changed')
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const dynamicStageHistory = [...schemaHistory];
        let lastTime = contact.createdAt ? new Date(contact.createdAt).toISOString() : new Date().toISOString();
        let iterStage = 'New';

        if (dynamicStageHistory.length > 0) {
            const last = dynamicStageHistory[dynamicStageHistory.length - 1];
            if (last.exitedAt) lastTime = last.exitedAt;
        }

        // If schema history is empty, try to fallback to audit logs
        if (dynamicStageHistory.length === 0) {
            stageLogs.forEach(log => {
                const nextStageRaw = log.metadata?.changes?.after || 'Unknown';
                const nextStage = typeof nextStageRaw === 'object' && nextStageRaw
                    ? (nextStageRaw.lookup_value || nextStageRaw.name || String(nextStageRaw.id || nextStageRaw._id || nextStageRaw))
                    : String(nextStageRaw);


                const actorName = typeof log.actor === 'object' ? (log.actor.fullName || log.actor.name || log.actor.username || 'System') : (log.actor || 'System');
                dynamicStageHistory.push({
                    stage: String(iterStage),
                    enteredAt: lastTime,
                    exitedAt: log.timestamp,
                    agent: actorName
                }); iterStage = nextStage;
                lastTime = log.timestamp;
            });
        }

        // 3. Current active stage (if not already represented)
        const hasActiveStage = dynamicStageHistory.some(h => !h.exitedAt);
        if (!hasActiveStage) {
            const lastActor = stageLogs.length > 0 ? stageLogs[stageLogs.length - 1].actor : 'System';
            const lastActorName = typeof lastActor === 'object' ? (lastActor.fullName || lastActor.name || lastActor.username || 'System') : lastActor;

            dynamicStageHistory.push({
                stage: currentStageLabel,
                enteredAt: lastTime,
                exitedAt: null,
                agent: lastActorName
            });
        }

        // Process Stages
        let activeIdx = -1;
        const processedStages = MAIN_STAGES.map((ms, idx) => {
            // Find all history sections that map to this main stage
            const mappedHistories = dynamicStageHistory.filter(h =>
                ms.subStages.some(ss => ss.toLowerCase() === h.stage.toLowerCase())
            );

            // If a stage was visited multiple times, we'll take the earliest entry and latest exit
            const hasVisited = mappedHistories.length > 0;
            const historyItem = hasVisited ? mappedHistories[0] : null;
            const lastHistoryItem = hasVisited ? mappedHistories[mappedHistories.length - 1] : null;

            const isCurrent = ms.subStages.some(ss => ss.toLowerCase() === currentStageLabel);
            if (isCurrent) activeIdx = idx;

            // Derived Time Metrics
            const enteredDate = hasVisited && historyItem.enteredAt ? new Date(historyItem.enteredAt) : null;
            const exitedDate = hasVisited && lastHistoryItem.exitedAt ? new Date(lastHistoryItem.exitedAt) : null;

            let timeSpentLabel = "Pending";
            let daysSpent = 0;

            if (enteredDate) {
                const end = exitedDate || new Date();
                const diffTime = Math.abs(end - enteredDate);
                daysSpent = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                timeSpentLabel = `${daysSpent}d`;
            }

            // Filter activities that occurred while in this stage
            const actsInStage = activities.filter(a => {
                if (a.source === 'audit' && a.metadata?.eventType === 'stage_changed') return false; // Exclude raw stage change logs from ledger
                const t = new Date(a.timestamp);
                const afterEnter = enteredDate ? t >= enteredDate : false;
                const beforeExit = exitedDate ? t <= exitedDate : true;
                return afterEnter && beforeExit;
            });

            const stageActivities = {
                calls: actsInStage.filter(a => a.type === 'call').length,
                meetings: actsInStage.filter(a => a.type === 'meeting').length,
                visits: actsInStage.filter(a => a.type === 'site visit' || a.type === 'visit').length,
                followups: actsInStage.filter(a => a.type === 'note' || a.type === 'email' || a.type === 'task').length
            };
            const totalStageActivities = Object.values(stageActivities).reduce((a, b) => a + b, 0);

            // Build Ledger Data for Side Panel
            const ledger = actsInStage.map(a => {
                let icon = ActivityIcon;
                let color = '#64748b';
                const t = a.type.toLowerCase();
                if (t === 'call') { icon = Phone; color = '#10b981'; }
                else if (t === 'email') { icon = Info; color = '#3b82f6'; }
                else if (t === 'site visit' || t === 'visit') { icon = Home; color = '#4f46e5'; }
                else if (t === 'meeting') { icon = Users; color = '#f59e0b'; }

                const dateObj = new Date(a.timestamp);
                const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

                return {
                    type: a.type || 'Activity',
                    date: dateStr,
                    note: a.title + (a.description ? ` - ${a.description}` : ''),
                    agent: typeof a.actor === 'object' ? (a.actor.fullName || a.actor.name || a.actor.username || 'System') : (a.actor || 'System'),
                    icon,
                    color
                };
            });

            return {
                ...ms,
                status: isCurrent ? 'current' : (hasVisited ? 'completed' : 'future'),
                enteredDateStr: enteredDate ? enteredDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : null,
                exitedDateStr: exitedDate ? exitedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : null,
                timeSpentLabel,
                daysSpent,
                activities: stageActivities,
                totalActivities: totalStageActivities,
                isStuck: daysSpent > 14 && isCurrent,
                agent: lastHistoryItem?.agent || 'System',
                ledger
            };
        });

        // Calculate Transitions
        const transitions = [];
        for (let i = 0; i < processedStages.length - 1; i++) {
            const current = processedStages[i];
            const next = processedStages[i + 1];
            if (current.exitedDateStr && next.enteredDateStr) {
                // Approximate delay
                const diffTime = Math.abs(new Date(next.enteredDateStr) - new Date(current.exitedDateStr));
                const delay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                transitions.push({ delay: delay > 0 ? delay : null });
            } else {
                transitions.push({ delay: null });
            }
        }

        const isClosed = currentStageLabel.includes('won') || currentStageLabel.includes('lost') || currentStageLabel.includes('unqualified');
        const closedType = currentStageLabel.includes('won') ? 'won' : (currentStageLabel.includes('lost') ? 'lost' : 'unqualified');
        const totalLifecycleDays = processedStages.reduce((sum, s) => sum + s.daysSpent, 0);
        const totalLifecycleActivities = processedStages.reduce((sum, s) => sum + s.totalActivities, 0);

        return {
            stages: processedStages,
            transitions,
            activeIdx,
            isClosed,
            closedType,
            totals: { duration: totalLifecycleDays, activities: totalLifecycleActivities }
        };
    }, [contact, activities]);

    if (!lifecycle) return null;

    return (
        <div className="lifecycle-journey" style={{ width: '100%', position: 'relative' }}>
            <style>{`
                .journey-container {
                    display: flex;
                    align-items: stretch;
                    gap: 0;
                    overflow-x: auto;
                    padding: 8px 0;
                    scrollbar-width: none;
                    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));
                }
                .journey-container::-webkit-scrollbar { display: none; }

                .arrow-step {
                    position: relative;
                    flex: 1;
                    min-width: 250px;
                    margin-left: -14px;
                    padding: 12px 20px 12px 30px;
                    /* 16px arrow tip */
                    clip-path: polygon(0% 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 0% 100%, 16px 50%);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }
                .arrow-step.first {
                    margin-left: 0;
                    padding-left: 20px;
                    clip-path: polygon(0% 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 0% 100%);
                }
                .arrow-step.last {
                    padding-right: 20px;
                    clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 16px 50%);
                }

                .arrow-step.completed { 
                    background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 100%); 
                    color: #334155;
                }
                .arrow-step.current { 
                    background: linear-gradient(90deg, #eef2ff 0%, #c7d2fe 100%); 
                }
                .arrow-step.future { 
                    background: #f1f5f9; 
                    opacity: 0.65; 
                }
                .arrow-step.stuck { 
                    background: linear-gradient(90deg, #fef2f2 0%, #fecaca 100%); 
                }

                .arrow-step:hover {
                    transform: translateY(-2px);
                    filter: brightness(0.95);
                    z-index: 10;
                }

                @keyframes pulse-indigo {
                    0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(79, 70, 229, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
                }
                .pulse-box {
                    width: 8px; height: 8px; border-radius: 50%; background: #4f46e5;
                    animation: pulse-indigo 2s infinite;
                }

                .side-panel {
                    position: fixed; right: 0; top: 0; bottom: 0;
                    width: 420px;
                    background: #fff;
                    z-index: 10001; /* Higher than sticky header (100) and its containers */
                    box-shadow: -20px 0 80px rgba(0,0,0,0.15);
                    padding: 40px;
                    padding-top: 100px; /* Push content down to avoid covering by sticky header if not portal'd */
                    animation: slideRight 0.5s cubic-bezier(0.19, 1, 0.22, 1);
                    display: flex;
                    flex-direction: column;
                    border-left: 1px solid #e2e8f0;
                }
                @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .panel-overlay {
                    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 10000;
                    backdrop-filter: blur(8px);
                }
                .ledger-item {
                    border-left: 2px solid #e2e8f0;
                    padding-left: 20px;
                    padding-bottom: 24px;
                    position: relative;
                }
                .ledger-dot {
                    position: absolute; left: -7px; top: 0;
                    width: 12px; height: 12px; border-radius: 50%;
                    border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
            `}</style>

            <div className="journey-container no-scrollbar">
                {lifecycle.stages.map((stage, idx) => (
                    <div
                        key={stage.id}
                        className={`arrow-step ${stage.status} ${stage.isStuck ? 'stuck' : ''} ${idx === 0 ? 'first' : ''} ${idx === lifecycle.stages.length - 1 ? 'last' : ''}`}
                        onClick={() => stage.status !== 'future' && setSelectedStage(stage)}
                        title={`Agent: ${stage.agent}\nEntered: ${stage.enteredDateStr || '---'}\nExited: ${stage.exitedDateStr || 'Active'}`}
                    >
                        {/* Compact Header: Icon, Label, Pulse */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <stage.icon size={15} color={stage.status === 'future' ? '#94a3b8' : stage.color} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 850, color: stage.status === 'future' ? '#64748b' : '#0f172a', whiteSpace: 'nowrap' }}>{stage.label}</span>
                                {stage.status === 'current' && <div className="pulse-box" style={{ marginLeft: '4px' }} />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {stage.isStuck && <span style={{ fontSize: '0.55rem', color: '#ef4444', fontWeight: 900, background: '#fee2e2', padding: '2px 5px', borderRadius: '4px' }}>STUCK</span>}
                                {stage.status === 'completed' && <CheckCircle size={14} color="#10b981" weight="fill" />}
                            </div>
                        </div>

                        {/* Mid Row: In Time & Duration */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', marginBottom: '8px', color: '#475569' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <span><span style={{ fontWeight: 600 }}>IN:</span> <span style={{ fontWeight: 800, color: '#0f172a' }}>{stage.enteredDateStr ? stage.enteredDateStr : '--'}</span></span>
                                <span><span style={{ fontWeight: 600 }}>DUR:</span> <span style={{ fontWeight: 800, color: stage.isStuck ? '#ef4444' : '#0f172a' }}>{stage.timeSpentLabel}</span></span>
                            </div>
                            {idx < lifecycle.stages.length - 1 && lifecycle.transitions[idx].delay && (
                                <div style={{ background: 'rgba(255,255,255,0.7)', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#4f46e5', fontWeight: 800, fontSize: '0.55rem', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                    Wait: {lifecycle.transitions[idx].delay}d
                                </div>
                            )}
                        </div>

                        {/* Bottom Row: Activity Density */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.65rem', fontWeight: 700 }}>
                            <span style={{ background: 'rgba(255,255,255,0.5)', padding: '2px 6px', borderRadius: '4px', color: '#334155', border: '1px solid rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
                                {stage.totalActivities} Acts
                            </span>
                            <div style={{ display: 'flex', gap: '6px', color: '#475569', alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title="Calls"><Phone size={10} color="#10b981" /> {stage.activities.calls}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title="Notes"><MessageSquare size={10} color="#3b82f6" /> {stage.activities.followups}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title="Meetings"><Users size={10} color="#f59e0b" /> {stage.activities.meetings}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title="Visits"><Home size={10} color="#4f46e5" /> {stage.activities.visits}</span>
                            </div>
                        </div>

                        {/* Highly Compact Closed State Handling */}
                        {stage.id === 'closed' && lifecycle.isClosed && (
                            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(0,0,0,0.1)', fontSize: '0.65rem', fontWeight: 850, color: lifecycle.closedType === 'won' ? '#10b981' : '#ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{lifecycle.closedType.toUpperCase()} OUTCOME</span>
                                <span style={{ color: '#475569' }}>Total Life: <span style={{ color: '#0f172a' }}>{lifecycle.totals.duration}d</span></span>
                            </div>
                        )}
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
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.5px' }}>{selectedStage.label} Ledger</h2>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Technical Activity Sigs & Recordings</p>
                            </div>
                            <button onClick={() => setSelectedStage(null)} style={{ background: '#f1f5f9', border: 'none', padding: '12px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <X size={20} color="#0f172a" strokeWidth={3} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '150px', padding: '20px', background: '#f8fafc', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Current Owner</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 950, color: '#1e293b' }}>
                                    <User size={16} /> {selectedStage.agent}
                                </div>
                            </div>
                            <div style={{ flex: 1, minWidth: '150px', padding: '20px', background: '#f8fafc', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Time in Stage</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 950, color: '#4f46e5' }}>
                                    <Clock size={16} /> {selectedStage.timeSpentLabel}
                                </div>
                            </div>
                            {contact.unitNo && (
                                <div style={{ flex: 1, minWidth: '150px', padding: '20px', background: '#eff6ff', borderRadius: '18px', border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '6px' }}>Selected Unit</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 950, color: '#1d4ed8' }}>
                                        <Home size={16} /> #{contact.unitNo}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '15px' }} className="no-scrollbar">
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 950, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px' }}>Stage Activity Timeline</h4>
                            {selectedStage.ledger.map((item, i) => (
                                <div key={i} className="ledger-item">
                                    <div className="ledger-dot" style={{ background: item.color }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 950, color: item.color, textTransform: 'uppercase' }}>{item.type}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>{item.date}</span>
                                    </div>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 600, color: '#334155', lineHeight: '1.6' }}>{item.note}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>
                                        <User size={12} /> {item.agent}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                            <button style={{ width: '100%', padding: '16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: 950, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(79, 70, 229, 0.2)' }}>
                                OPEN FULL AUDIT LOG
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EnterprisePipeline;
