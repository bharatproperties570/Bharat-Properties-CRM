import { memo, useState } from 'react';
import { renderValue } from '../../../utils/renderUtils';
import SLAWidget from './SLAWidget';
import TeamLeaderboardWidget from './TeamLeaderboardWidget';

/* ─── Injected CSS ─────────────────────────────────────────────── */
const SIDEBAR_STYLES = `
  @keyframes sb-pulse-dot {
    0%, 100% { opacity: 1;   transform: scale(1);   }
    50%       { opacity: 0.4; transform: scale(0.75); }
  }
  @keyframes sb-slide-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .sb-alert-card {
    animation: sb-slide-in 0.25s ease both;
  }
  .sb-task-row {
    transition: background 0.15s ease;
    border-radius: 10px;
  }
  .sb-task-row:hover {
    background: rgba(99, 102, 241, 0.05) !important;
  }
  .sb-view-all-btn {
    transition: background 0.15s ease, color 0.15s ease;
  }
  .sb-view-all-btn:hover {
    background: rgba(99,102,241,0.12) !important;
    color: #818cf8 !important;
  }
  .sb-kpi-micro:hover {
    border-color: var(--accent-primary, #6366f1) !important;
    transform: translateY(-2px);
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
`;

/* ─── Activity type icon map ───────────────────────────────────── */
const ACTIVITY_ICONS = {
    call:       { icon: 'fas fa-phone-alt', color: '#6366f1' },
    meeting:    { icon: 'fas fa-handshake', color: '#10b981' },
    site_visit: { icon: 'fas fa-map-marker-alt', color: '#f59e0b' },
    email:      { icon: 'fas fa-envelope', color: '#8b5cf6' },
};
const getActivityMeta = (type) =>
    ACTIVITY_ICONS[type?.toLowerCase()] || { icon: 'fas fa-tasks', color: '#64748b' };

/* ─── Alert severity → accent color ───────────────────────────── */
const alertBorderColor = (alert) => {
    const sev = alert.severity?.toLowerCase?.() || '';
    if (sev === 'critical' || sev === 'high') return '#f43f5e';
    if (sev === 'medium' || sev === 'warning') return '#f59e0b';
    return '#6366f1';
};

/* ─── DashboardSidebar ─────────────────────────────────────────── */
const DashboardSidebar = ({ metrics, users, onNavigate }) => {
    const { agenda, allAlerts, availability } = metrics;
    const [agendaFilter, setAgendaFilter] = useState('today');

    /* ── Team Pulse bar widths from real data ── */
    const total = (availability.totalIn || 0) + (availability.totalNotIn || 0) + (availability.totalOnLeave || 0);
    const pctActive  = total > 0 ? Math.round(((availability.totalIn      || 0) / total) * 100) : 0;
    const pctOffline = total > 0 ? Math.round(((availability.totalNotIn   || 0) / total) * 100) : 0;
    const pctLeave   = total > 0 ? (100 - pctActive - pctOffline) : 0;

    /* ── Filtered agenda items ── */
    const filteredVisits = agenda.siteVisits.filter(v => {
        if (agendaFilter === 'today')   return v.time.includes('Today');
        if (agendaFilter === 'overdue') return v.time.includes('Overdue') || v.time.includes('Yesterday');
        return !v.time.includes('Today') && !v.time.includes('Overdue') && !v.time.includes('Yesterday');
    });
    const filteredTasks = agenda.tasks.filter(t => {
        if (agendaFilter === 'today')   return t.time.includes('Today');
        if (agendaFilter === 'overdue') return t.time.includes('Overdue') || t.time.includes('Yesterday');
        return !t.time.includes('Today') && !t.time.includes('Overdue') && !t.time.includes('Yesterday');
    });

    const hasItems = filteredVisits.length > 0 || filteredTasks.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <style>{SIDEBAR_STYLES}</style>

            {/* ═══ MISSION AGENDA ═══════════════════════════════════ */}
            <div className="glass-card" style={{ padding: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                            <i className="fas fa-calendar-alt fa-sm"></i>
                        </div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>
                            MISSION AGENDA
                        </h3>
                    </div>

                    {/* VIEW ALL — styled button */}
                    <button
                        className="sb-view-all-btn"
                        onClick={() => onNavigate('activities')}
                        style={{
                            fontSize: '0.65rem', fontWeight: 800, color: '#6366f1',
                            border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: '8px', padding: '5px 10px',
                            background: 'rgba(99,102,241,0.07)',
                            cursor: 'pointer', letterSpacing: '0.04em',
                        }}
                    >
                        VIEW ALL <i className="fas fa-chevron-right" style={{ fontSize: '0.5rem' }}></i>
                    </button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', background: 'var(--panel-bg)', padding: '5px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    {['today', 'overdue', 'pending'].map(f => (
                        <button
                            key={f}
                            onClick={() => setAgendaFilter(f)}
                            style={{
                                flex: 1, padding: '7px 0',
                                borderRadius: '8px', border: 'none',
                                background: agendaFilter === f ? '#6366f1' : 'transparent',
                                color: agendaFilter === f ? '#fff' : 'var(--text-muted)',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: agendaFilter === f ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                            }}
                        >
                            {f}
                            {/* Show overdue count badge */}
                            {f === 'overdue' && (() => {
                                const cnt = agenda.tasks.filter(t => t.time.includes('Overdue') || t.time.includes('Yesterday')).length;
                                return cnt > 0 ? (
                                    <span style={{
                                        marginLeft: '5px', background: '#f43f5e', color: '#fff',
                                        fontSize: '0.55rem', fontWeight: 900, padding: '1px 5px',
                                        borderRadius: '10px', verticalAlign: 'middle',
                                    }}>{cnt}</span>
                                ) : null;
                            })()}
                        </button>
                    ))}
                </div>

                {/* KPI micro-cards: Followup / Site Visit / Meeting */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    {[
                        { label: 'Followup',   icon: 'fas fa-phone-alt',       color: '#6366f1', key: 'Followup'   },
                        { label: 'Site Visit', icon: 'fas fa-map-marker-alt',   color: '#f59e0b', key: 'Site Visit' },
                        { label: 'Meeting',    icon: 'fas fa-handshake',         color: '#10b981', key: 'Meeting'   },
                    ].map(kpi => {
                        const cnt = agenda.stats?.[kpi.key]?.[agendaFilter] || 0;
                        return (
                            <div
                                key={kpi.key}
                                className="sb-kpi-micro"
                                style={{
                                    background: cnt > 0 ? `${kpi.color}10` : 'var(--panel-bg)',
                                    padding: '12px 8px', borderRadius: '14px',
                                    border: cnt > 0 ? `1px solid ${kpi.color}30` : '1px solid var(--border-light)',
                                    textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    cursor: 'default',
                                }}
                            >
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '8px',
                                    background: `${kpi.color}18`, color: kpi.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: '8px',
                                }}>
                                    <i className={`${kpi.icon} fa-sm`}></i>
                                </div>
                                <div style={{
                                    fontSize: '1.25rem', fontWeight: 900,
                                    color: cnt > 0 ? kpi.color : 'var(--text-muted)',
                                    lineHeight: 1,
                                }}>
                                    {cnt}
                                </div>
                                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {kpi.label}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Agenda items or empty state */}
                {!hasItems ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div style={{
                            width: '52px', height: '52px', background: 'rgba(99,102,241,0.08)',
                            border: '1px dashed rgba(99,102,241,0.25)',
                            borderRadius: '50%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', margin: '0 auto 14px', color: '#6366f1',
                        }}>
                            <i className="fas fa-calendar-check fa-lg"></i>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 4px' }}>
                            {agendaFilter === 'today'   && 'All clear for today!'}
                            {agendaFilter === 'overdue' && 'No overdue tasks — great work!'}
                            {agendaFilter === 'pending' && 'No pending tasks ahead.'}
                        </p>
                        <p style={{ fontSize: '0.65rem', color: '#475569', margin: 0, fontWeight: 500 }}>
                            {agendaFilter === 'today'   && 'Schedule new activities to stay ahead.'}
                            {agendaFilter === 'overdue' && 'Keep your follow-ups on time.'}
                            {agendaFilter === 'pending' && 'Use the pipeline to plan your next move.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Site visit rows */}
                        {filteredVisits.map((visit, idx) => (
                            <div
                                key={`v-${idx}`}
                                style={{
                                    display: 'flex', gap: '12px', padding: '14px',
                                    background: 'rgba(245,158,11,0.05)', borderRadius: '14px',
                                    border: '1px solid rgba(245,158,11,0.12)',
                                    animation: 'sb-slide-in 0.2s ease both',
                                    animationDelay: `${idx * 0.05}s`,
                                }}
                            >
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '11px',
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    color: '#fff', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', flexShrink: 0,
                                    boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
                                }}>
                                    <i className="fas fa-map-marker-alt fa-sm"></i>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.83rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {visit.target || 'Site Visit'}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '3px' }}>
                                        {visit.time} • {visit.client}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Task rows */}
                        {filteredTasks.map((task, idx) => {
                            const meta = getActivityMeta(task.type);
                            return (
                                <div
                                    key={`t-${idx}`}
                                    className="sb-task-row"
                                    style={{
                                        display: 'flex', gap: '12px', padding: '10px 8px',
                                        borderBottom: idx < filteredTasks.length - 1 ? '1px solid var(--border-light)' : 'none',
                                        animation: 'sb-slide-in 0.2s ease both',
                                        animationDelay: `${(filteredVisits.length + idx) * 0.05}s`,
                                    }}
                                >
                                    {/* Activity type icon instead of plain colored square */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '7px',
                                        background: `${meta.color}15`, color: meta.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0, marginTop: '2px',
                                    }}>
                                        <i className={`${meta.icon}`} style={{ fontSize: '0.65rem' }}></i>
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>
                                            {task.title}
                                        </div>
                                        <div style={{ fontSize: '0.63rem', color: '#64748b', fontWeight: 700, marginTop: '3px' }}>
                                            {task.time} • {task.target}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══ AI ALERT HUB ═════════════════════════════════════ */}
            <div className="glass-card" style={{ padding: '24px', background: 'var(--gradient-dark)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '36px', height: '36px', background: '#6366f1',
                            borderRadius: '10px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: '#fff',
                            boxShadow: '0 0 18px rgba(99,102,241,0.45)',
                        }}>
                            <i className="fas fa-robot fa-sm"></i>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>
                                AI ALERT HUB
                            </h3>
                            <p style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, margin: 0, letterSpacing: '0.05em' }}>
                                CRITICAL INTELLIGENCE
                            </p>
                        </div>
                    </div>

                    {/* Alert count badge */}
                    {allAlerts.length > 0 && (
                        <div style={{
                            background: '#f43f5e', color: '#fff',
                            fontSize: '0.65rem', fontWeight: 900,
                            padding: '3px 9px', borderRadius: '20px',
                            boxShadow: '0 0 12px rgba(244,63,94,0.4)',
                            letterSpacing: '0.02em',
                        }}>
                            {allAlerts.length} ACTIVE
                        </div>
                    )}
                </div>

                {/* Alert cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allAlerts.slice(0, 4).map((alert, idx) => (
                        <div
                            key={idx}
                            className="sb-alert-card"
                            style={{
                                padding: '14px 16px',
                                background: 'var(--panel-bg)',
                                borderRadius: '14px',
                                border: '1px solid var(--border-light)',
                                borderLeft: `4px solid ${alertBorderColor(alert)}`,
                                animationDelay: `${idx * 0.07}s`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                {/* Pulse dot per alert */}
                                <div
                                    style={{
                                        width: '7px', height: '7px', borderRadius: '50%',
                                        background: alertBorderColor(alert),
                                        boxShadow: `0 0 6px ${alertBorderColor(alert)}`,
                                        animation: 'sb-pulse-dot 1.6s ease-in-out infinite',
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>
                                    {renderValue(alert.title)}
                                </div>
                            </div>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.45, fontWeight: 500 }}>
                                {renderValue(alert.message)}
                            </p>
                            <div style={{
                                fontSize: '0.63rem', fontWeight: 800, color: '#6366f1',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                letterSpacing: '0.03em',
                            }}>
                                RESOLVE NOW <i className="fas fa-arrow-right" style={{ fontSize: '0.55rem' }}></i>
                            </div>
                        </div>
                    ))}

                    {/* All clear state */}
                    {allAlerts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '28px 0' }}>
                            <div style={{
                                width: '48px', height: '48px', background: 'rgba(16,185,129,0.1)',
                                border: '1px solid rgba(16,185,129,0.25)',
                                borderRadius: '50%', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', margin: '0 auto 14px', color: '#10b981',
                            }}>
                                <i className="fas fa-shield-alt fa-lg"></i>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700, margin: '0 0 4px', letterSpacing: '0.04em' }}>
                                ALL SYSTEMS CLEAR
                            </p>
                            <p style={{ fontSize: '0.62rem', color: '#475569', margin: 0, fontWeight: 500 }}>
                                No active threats detected
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ TEAM PULSE ═══════════════════════════════════════ */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                        <i className="fas fa-heartbeat fa-sm"></i>
                    </div>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>
                        TEAM PULSE
                    </h3>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    {[
                        { label: 'ACTIVE',   val: availability.totalIn      || 0, color: '#10b981' },
                        { label: 'OFFLINE',  val: availability.totalNotIn   || 0, color: '#f59e0b' },
                        { label: 'ON LEAVE', val: availability.totalOnLeave || 0, color: '#6366f1' },
                    ].map((st, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: st.color, lineHeight: 1 }}>
                                {st.val}
                            </div>
                            <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 800, marginTop: '4px', letterSpacing: '0.05em' }}>
                                {st.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Progress bar — REAL data (not hardcoded) */}
                <div style={{ height: '7px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
                    {pctActive > 0 && (
                        <div style={{
                            width: `${pctActive}%`, background: '#10b981',
                            boxShadow: '0 0 10px rgba(16,185,129,0.4)',
                            transition: 'width 0.6s ease',
                        }} />
                    )}
                    {pctOffline > 0 && (
                        <div style={{ width: `${pctOffline}%`, background: '#f59e0b', transition: 'width 0.6s ease' }} />
                    )}
                    {pctLeave > 0 && (
                        <div style={{ width: `${pctLeave}%`, background: '#6366f1', transition: 'width 0.6s ease' }} />
                    )}
                </div>

                {/* Percentage legend */}
                {total > 0 && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                        {[
                            { label: 'Active',   pct: pctActive,  color: '#10b981' },
                            { label: 'Offline',  pct: pctOffline, color: '#f59e0b' },
                            { label: 'On Leave', pct: pctLeave,   color: '#6366f1' },
                        ].map((l, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.color }} />
                                {l.label} {l.pct}%
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ ENTERPRISE WIDGETS ═══════════════════════════════ */}
            <SLAWidget metrics={metrics} />
            <TeamLeaderboardWidget users={users || []} metrics={metrics} />
        </div>
    );
};

export default memo(DashboardSidebar);
