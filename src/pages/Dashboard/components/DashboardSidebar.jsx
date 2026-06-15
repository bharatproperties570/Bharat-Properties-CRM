import { memo, useState } from 'react';
import { renderValue } from '../../../utils/renderUtils';
import SLAWidget from './SLAWidget';
import TeamLeaderboardWidget from './TeamLeaderboardWidget';

const DashboardSidebar = ({ metrics, users, onNavigate }) => {
    const { agenda, allAlerts, availability } = metrics;
    const [agendaFilter, setAgendaFilter] = useState('today'); // 'today', 'overdue', 'pending'

    const activityColor = (type) => {
        switch (type?.toLowerCase()) {
            case 'call': return '#6366f1';
            case 'meeting': return '#10b981';
            case 'site_visit': return '#f59e0b';
            case 'email': return '#8b5cf6';
            default: return '#64748b';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Today's Agenda */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>MISSION AGENDA</h3>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', cursor: 'pointer' }} onClick={() => onNavigate('activities')}>VIEW ALL</div>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--panel-bg)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    {['today', 'overdue', 'pending'].map(filter => (
                        <button
                            key={filter}
                            onClick={() => setAgendaFilter(filter)}
                            style={{
                                flex: 1,
                                padding: '8px 0',
                                borderRadius: '8px',
                                border: 'none',
                                background: agendaFilter === filter ? '#6366f1' : 'transparent',
                                color: agendaFilter === filter ? '#fff' : 'var(--text-muted)',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: agendaFilter === filter ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none'
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                    {[
                        { label: 'Followup', icon: 'fas fa-phone-alt', color: '#6366f1', key: 'Followup' },
                        { label: 'Site Visit', icon: 'fas fa-map-marker-alt', color: '#f59e0b', key: 'Site Visit' },
                        { label: 'Meeting', icon: 'fas fa-handshake', color: '#10b981', key: 'Meeting' }
                    ].map(kpi => (
                        <div key={kpi.key} style={{ background: 'var(--panel-bg)', padding: '12px', borderRadius: '14px', border: '1px solid var(--border-light)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                                <i className={`${kpi.icon} fa-sm`}></i>
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>
                                {agenda.stats?.[kpi.key]?.[agendaFilter] || 0}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase' }}>{kpi.label}</div>
                        </div>
                    ))}
                </div>

                {(() => {
                    const filteredVisits = agenda.siteVisits.filter(v => {
                        if (agendaFilter === 'today') return v.time.includes('Today');
                        if (agendaFilter === 'overdue') return v.time.includes('Overdue') || v.time.includes('Yesterday');
                        return !v.time.includes('Today') && !v.time.includes('Overdue') && !v.time.includes('Yesterday');
                    });
                    const filteredTasks = agenda.tasks.filter(t => {
                        if (agendaFilter === 'today') return t.time.includes('Today');
                        if (agendaFilter === 'overdue') return t.time.includes('Overdue') || t.time.includes('Yesterday');
                        return !t.time.includes('Today') && !t.time.includes('Overdue') && !t.time.includes('Yesterday');
                    });

                    if (filteredVisits.length === 0 && filteredTasks.length === 0) {
                        return (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <div style={{ width: '48px', height: '48px', background: 'var(--border-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#475569' }}>
                                    <i className="fas fa-calendar-check fa-xl"></i>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>NO {agendaFilter.toUpperCase()} TASKS DETECTED</p>
                            </div>
                        );
                    }

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {filteredVisits.map((visit, idx) => (
                                <div key={`v-${idx}`} style={{ display: 'flex', gap: '14px', padding: '16px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f59e0b', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)' }}>
                                        <i className="fas fa-user-friends"></i>
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{visit.target || 'Site Visit'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{visit.time} • {visit.client}</div>
                                    </div>
                                </div>
                            ))}
                            {filteredTasks.map((task, idx) => (
                                <div key={`t-${idx}`} style={{ display: 'flex', gap: '14px', padding: '12px', borderBottom: '1px solid var(--border-light)' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: activityColor(task.type), marginTop: '6px', flexShrink: 0, boxShadow: `0 0 8px ${activityColor(task.type)}` }}></div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{task.title}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>{task.time} • {task.target}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>

            {/* AI Alert Hub */}
            <div className="glass-card" style={{ padding: '24px', background: 'var(--gradient-dark)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ width: '36px', height: '36px', background: '#6366f1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)' }}>
                        <i className="fas fa-robot"></i>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>AI ALERT HUB</h3>
                        <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, margin: 0 }}>CRITICAL INTELLIGENCE</p>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {allAlerts.slice(0, 4).map((alert, idx) => (
                        <div key={idx} style={{ padding: '16px', background: 'var(--panel-bg)', borderRadius: '16px', border: '1px solid var(--border-light)', borderLeft: '4px solid #f43f5e' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{renderValue(alert.title)}</div>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '6px 0 0 0', lineHeight: 1.4, fontWeight: 500 }}>{renderValue(alert.message)}</p>
                            <div style={{ marginTop: '12px', fontSize: '0.65rem', fontWeight: 800, color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>RESOLVE NOW <i className="fas fa-chevron-right" style={{ fontSize: '0.5rem' }}></i></div>
                        </div>
                    ))}
                    {allAlerts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: '0.75rem', fontWeight: 600 }}>SCANNING THREATS... ALL CLEAR</div>
                    )}
                </div>
            </div>

            {/* Team Pulse */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '20px', letterSpacing: '0.05em' }}>TEAM PULSE</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    {[
                        { label: 'ACTIVE', val: availability.totalIn, color: '#10b981' },
                        { label: 'OFFLINE', val: availability.totalNotIn, color: '#f59e0b' },
                        { label: 'LEAVE', val: availability.totalOnLeave, color: '#6366f1' }
                    ].map((st, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: st.color }}>{st.val || 0}</div>
                            <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 800, marginTop: '2px' }}>{st.label}</div>
                        </div>
                    ))}
                </div>
                <div style={{ height: '6px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: '70%', background: '#10b981', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}></div>
                    <div style={{ width: '20%', background: '#f59e0b' }}></div>
                    <div style={{ width: '10%', background: '#6366f1' }}></div>
                </div>
            </div>

            {/* NEW ENTERPRISE WIDGETS */}
            <SLAWidget metrics={metrics} />
            <TeamLeaderboardWidget users={users || []} metrics={metrics} />
        </div>
    );
};

export default memo(DashboardSidebar);
