import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

const STATUS_OPTIONS = ['Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'];
const HEALTH_OPTIONS = ['On Track', 'At Risk', 'Delayed', 'Critical'];

const chipStyle = (active) => ({
    padding: '5px 12px',
    borderRadius: '99px',
    border: active ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
    background: active ? '#eef2ff' : '#fff',
    color: active ? '#4f46e5' : '#64748b',
    fontWeight: active ? 700 : 500,
    fontSize: '0.78rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
});

const healthChipColor = {
    'On Track': { active: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' }, dot: '#22c55e' },
    'At Risk':  { active: { bg: '#fffbeb', border: '#f59e0b', text: '#b45309' }, dot: '#f59e0b' },
    'Delayed':  { active: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c' }, dot: '#ef4444' },
    'Critical': { active: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' }, dot: '#dc2626' },
};

export default function BookingFilterPanel({ isOpen, onClose, onApply, currentFilters = {} }) {
    const [filters, setFilters] = useState({
        status: [],
        health: [],
        salesAgent: '',
        channelPartner: '',
        project: '',
        dateFrom: '',
        dateTo: '',
        minValue: '',
        maxValue: '',
        ...currentFilters
    });

    const [agents, setAgents] = useState([]);
    const [projects, setProjects] = useState([]);
    const [channelPartners, setChannelPartners] = useState([]);
    const [loadingAgents, setLoadingAgents] = useState(false);

    const activeCount = [
        filters.status.length > 0,
        filters.health.length > 0,
        !!filters.salesAgent,
        !!filters.channelPartner,
        !!filters.project,
        !!filters.dateFrom || !!filters.dateTo,
        !!filters.minValue || !!filters.maxValue,
    ].filter(Boolean).length;

    useEffect(() => {
        if (!isOpen) return;
        const loadOptions = async () => {
            setLoadingAgents(true);
            try {
                const [agentsRes, projectsRes, cpRes] = await Promise.all([
                    api.get('/users?role=sales&limit=100'),
                    api.get('/projects?limit=100'),
                    api.get('/contacts?limit=100&tag=channel-partner'),
                ]);
                if (agentsRes.data.success) setAgents(agentsRes.data.data || agentsRes.data.users || []);
                if (projectsRes.data.success) setProjects(projectsRes.data.data || []);
                if (cpRes.data.success) setChannelPartners(cpRes.data.data || cpRes.data.contacts || []);
            } catch (e) {
                // silently fail — filters still work without dropdown options
            } finally {
                setLoadingAgents(false);
            }
        };
        loadOptions();
    }, [isOpen]);

    const toggleChip = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: prev[field].includes(value)
                ? prev[field].filter(v => v !== value)
                : [...prev[field], value]
        }));
    };

    const set = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));

    const reset = () => {
        const blank = { status: [], health: [], salesAgent: '', channelPartner: '', project: '', dateFrom: '', dateTo: '', minValue: '', maxValue: '' };
        setFilters(blank);
        onApply(blank);
    };

    const apply = () => {
        onApply(filters);
        onClose();
    };

    if (!isOpen) return null;

    const labelStyle = { fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', display: 'block' };
    const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', color: '#0f172a', outline: 'none', background: '#fff', boxSizing: 'border-box' };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 1000, backdropFilter: 'blur(1px)' }} />

            {/* Panel */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
                background: '#fff', zIndex: 1001, display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
                animation: 'slideInRight 0.22s ease-out'
            }}>
                <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-sliders-h" style={{ color: '#6366f1' }} /> Advanced Filters
                            {activeCount > 0 && (
                                <span style={{ background: '#6366f1', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px' }}>{activeCount}</span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>Filter bookings by multiple criteria</div>
                    </div>
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: '#64748b', fontSize: '1rem' }}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                {/* Filter Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* ── Status ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-tag" style={{ marginRight: 6 }} />Deal Status</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {STATUS_OPTIONS.map(s => (
                                <button key={s} style={chipStyle(filters.status.includes(s))} onClick={() => toggleChip('status', s)}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Health ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-heartbeat" style={{ marginRight: 6 }} />Deal Health</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {HEALTH_OPTIONS.map(h => {
                                const conf = healthChipColor[h];
                                const active = filters.health.includes(h);
                                return (
                                    <button key={h} onClick={() => toggleChip('health', h)} style={{
                                        padding: '5px 12px', borderRadius: '99px',
                                        border: active ? `1.5px solid ${conf.active.border}` : '1.5px solid #e2e8f0',
                                        background: active ? conf.active.bg : '#fff',
                                        color: active ? conf.active.text : '#64748b',
                                        fontWeight: active ? 700 : 500, fontSize: '0.78rem',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: conf.dot, display: 'inline-block' }} />
                                        {h}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Booking Date Range ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-calendar-alt" style={{ marginRight: 6 }} />Booking Date Range</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From</label>
                                <input type="date" style={inputStyle} value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To</label>
                                <input type="date" style={inputStyle} value={filters.dateTo} onChange={e => set('dateTo', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* ── Deal Value Range ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-rupee-sign" style={{ marginRight: 6 }} />Deal Value (₹)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Min</label>
                                <input type="number" placeholder="e.g. 1000000" style={inputStyle} value={filters.minValue} onChange={e => set('minValue', e.target.value)} />
                                {filters.minValue && <div style={{ fontSize: '0.7rem', color: '#6366f1', marginTop: '2px' }}>₹{fmt(filters.minValue)}</div>}
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max</label>
                                <input type="number" placeholder="e.g. 10000000" style={inputStyle} value={filters.maxValue} onChange={e => set('maxValue', e.target.value)} />
                                {filters.maxValue && <div style={{ fontSize: '0.7rem', color: '#6366f1', marginTop: '2px' }}>₹{fmt(filters.maxValue)}</div>}
                            </div>
                        </div>
                        {/* Quick value range presets */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Under 50L', min: '', max: '5000000' },
                                { label: '50L–1Cr', min: '5000000', max: '10000000' },
                                { label: '1Cr–3Cr', min: '10000000', max: '30000000' },
                                { label: 'Above 3Cr', min: '30000000', max: '' },
                            ].map(p => (
                                <button key={p.label} onClick={() => setFilters(prev => ({ ...prev, minValue: p.min, maxValue: p.max }))}
                                    style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: (filters.minValue === p.min && filters.maxValue === p.max) ? '#eef2ff' : '#f8fafc', color: '#475569', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Project ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-building" style={{ marginRight: 6 }} />Project</span>
                        {projects.length > 0 ? (
                            <select style={inputStyle} value={filters.project} onChange={e => set('project', e.target.value)}>
                                <option value="">All Projects</option>
                                {projects.map(p => <option key={p._id} value={p.name || p.projectName}>{p.name || p.projectName}</option>)}
                            </select>
                        ) : (
                            <input style={inputStyle} placeholder="Search project name..." value={filters.project} onChange={e => set('project', e.target.value)} />
                        )}
                    </div>

                    {/* ── Sales Agent ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-user-tie" style={{ marginRight: 6 }} />Sales Agent</span>
                        {loadingAgents ? (
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Loading agents...</div>
                        ) : agents.length > 0 ? (
                            <select style={inputStyle} value={filters.salesAgent} onChange={e => set('salesAgent', e.target.value)}>
                                <option value="">All Agents</option>
                                {agents.map(a => <option key={a._id} value={a._id}>{a.fullName || a.name}</option>)}
                            </select>
                        ) : (
                            <input style={inputStyle} placeholder="Agent ID or name..." value={filters.salesAgent} onChange={e => set('salesAgent', e.target.value)} />
                        )}
                    </div>

                    {/* ── Channel Partner ── */}
                    <div>
                        <span style={labelStyle}><i className="fas fa-handshake" style={{ marginRight: 6 }} />Channel Partner</span>
                        {channelPartners.length > 0 ? (
                            <select style={inputStyle} value={filters.channelPartner} onChange={e => set('channelPartner', e.target.value)}>
                                <option value="">All Channel Partners</option>
                                {channelPartners.map(cp => <option key={cp._id} value={cp._id}>{cp.name}</option>)}
                            </select>
                        ) : (
                            <input style={inputStyle} placeholder="Channel partner name..." value={filters.channelPartner} onChange={e => set('channelPartner', e.target.value)} />
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', background: '#fff' }}>
                    <button onClick={reset} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                        <i className="fas fa-times-circle" style={{ marginRight: '6px' }} />Clear All
                    </button>
                    <button onClick={apply} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <i className="fas fa-check" />Apply Filters {activeCount > 0 ? `(${activeCount})` : ''}
                    </button>
                </div>
            </div>
        </>
    );
}
