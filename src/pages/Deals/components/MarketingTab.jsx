import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

function MarketingTab({ dealId, deal, onRefresh }) {
    const [loading, setLoading] = useState(true);
    const [sanitizing, setSanitizing] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [groups, setGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [channels, setChannels] = useState({ whatsapp: true, email: true });
    const [sending, setSending] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [registry, setRegistry] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [groupsRes, templatesRes, analyticsRes, registryRes] = await Promise.all([
                    api.get('/company-groups'),
                    api.get('/marketing/whatsapp/templates'),
                    api.get(`/marketing/broadcast/analytics/${dealId}`),
                    api.get('/marketing/whatsapp/variable-registry').catch(() => ({ data: { success: true, data: { "1": "customer_name", "2": "property_list_default" } } }))
                ]);
                setGroups(groupsRes.data.data || []);
                // Only APPROVED templates
                const approved = (templatesRes.data.templates || []).filter(t => t.status === 'APPROVED');
                setTemplates(approved);
                if (analyticsRes.data?.success) setAnalytics(analyticsRes.data.data);
                setRegistry(registryRes.data?.data || {});
            } catch (err) {
                console.error("Failed to fetch broadcast data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [dealId]);

    const handleSanitize = async () => {
        setSanitizing(true);
        try {
            await api.post(`/deals/${dealId}/sanitize`);
            toast.success("Broadcast metadata updated!");
            onRefresh();
        } catch (error) {
            toast.error("Failed to prepare deal for broadcast");
        } finally {
            setSanitizing(false);
        }
    };

    const handleBroadcast = async () => {
        if (selectedGroups.length === 0) {
            toast.error("Please select at least one broker group");
            return;
        }
        const selectedChannels = Object.entries(channels).filter(([_, v]) => v).map(([k]) => k);
        if (selectedChannels.length === 0) {
            toast.error("Please select at least one channel");
            return;
        }
        // Template required only if WhatsApp is selected
        if (channels.whatsapp && !selectedTemplate) {
            toast.error("Select a WhatsApp template to send via WhatsApp");
            return;
        }

        setSending(true);
        try {
            const res = await api.post('/marketing/broadcast/bna', {
                dealId,
                groupIds: selectedGroups,
                channels: selectedChannels,
                templateId: selectedTemplate?.name,
                language: selectedTemplate?.language || 'en'
            });
            if (res.data.success) {
                toast.success(`Broadcast dispatched to ${res.data.dispatchCount} brokers!`);
                // Refresh analytics
                const aRes = await api.get(`/marketing/broadcast/analytics/${dealId}`);
                if (aRes.data?.success) setAnalytics(aRes.data.data);
            }
        } catch (error) {
            const errMsg = error.response?.data?.error || "Broadcast failed";
            toast.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    const meta = deal?.broadcastMetadata;

    // 🧠 Build live preview from selected template + deal metadata using Registry
    const templatePreview = useMemo(() => {
        if (!selectedTemplate || !meta) return null;
        const body = selectedTemplate.components?.find(c => c.type === 'BODY');
        if (!body) return null;

        // Simulate resolution logic
        const resolveSource = (source) => {
            switch(source) {
                case 'customer_name': return '[Broker Company Name]';
                case 'property_list_default':
                case 'matchListDefault':
                    return `1️⃣ 🏢 ${meta.title || 'Project'} | 📐 ${meta.features?.[0] || 'Size'} | 💰 ${meta.price || 'Price'}`;
                case 'property_list_detailed':
                case 'matchListDetailed':
                    return `1️⃣ 🏢 ${meta.title}\n📍 ${meta.location}\n💰 ${meta.price}\n📐 ${meta.features?.[0]}\n📝 ${meta.description}`;
                case 'projectName': return meta.title || '';
                case 'location': return meta.location || '';
                case 'price': return meta.price || '';
                case 'description': return meta.description || '';
                case 'agentMobile': return '87000 00000';
                default: return `[${source}]`;
            }
        };

        let preview = body.text;
        const varMatches = preview.match(/{{(\d+)}}/g) || [];
        
        varMatches.forEach(m => {
            const idx = m.replace(/[{}]/g, '');
            const config = registry[idx];
            const source = typeof config === 'object' ? config.source : config;
            const value = resolveSource(source);
            preview = preview.replace(m, value);
        });

        return preview;
    }, [selectedTemplate, meta, registry]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: '80px', background: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Step 1: Metadata Preparation ─────────────────────────── */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: meta?.isReady ? '16px' : '0' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: meta?.isReady ? '#dcfce7' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className={`fas ${meta?.isReady ? 'fa-check-circle' : 'fa-shield-alt'}`} style={{ color: meta?.isReady ? '#16a34a' : '#2563eb', fontSize: '14px' }}></i>
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                                {meta?.isReady ? 'Broadcast Ready' : 'Step 1 — Prepare Deal'}
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0 36px', fontSize: '0.72rem', color: '#64748b' }}>
                            {meta?.isReady
                                ? `Last updated: ${meta.lastSanitizedAt ? new Date(meta.lastSanitizedAt).toLocaleString('en-IN') : 'Recently'}`
                                : 'Sanitize deal data before broadcasting to brokers'}
                        </p>
                    </div>
                    <button
                        onClick={handleSanitize}
                        disabled={sanitizing}
                        style={{
                            padding: '8px 16px', fontSize: '0.78rem', fontWeight: 700,
                            borderRadius: '10px', border: '1px solid #e2e8f0',
                            background: meta?.isReady ? '#fff' : '#6366f1', color: meta?.isReady ? '#475569' : '#fff',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        {sanitizing ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${meta?.isReady ? 'fa-sync' : 'fa-bolt'}`}></i>}
                        {sanitizing ? 'Preparing...' : (meta?.isReady ? 'Refresh' : 'Prepare Now')}
                    </button>
                </div>

                {/* Deal Metadata Preview */}
                {meta?.isReady && (
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px' }}>DEAL DATA FOR BROADCAST</span>
                            <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>
                                <i className="fas fa-check-circle"></i> Verified
                            </span>
                        </div>
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>{meta.title}</div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1' }}>
                                    <i className="fas fa-tag" style={{ marginRight: '4px' }}></i>{meta.price}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    <i className="fas fa-map-marker-alt" style={{ marginRight: '4px' }}></i>{meta.location}
                                </span>
                            </div>
                            {meta.detailedSections?.map((sec, idx) => (
                                <div key={idx} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>{sec.title}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {sec.lines.map((line, li) => (
                                            <span key={li} style={{ fontSize: '0.7rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 8px', color: '#475569' }}>
                                                {line}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Step 2: Broadcast Configuration ──────────────────────── */}
            {meta?.isReady && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-bullhorn" style={{ color: '#d97706', fontSize: '13px' }}></i>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Step 2 — Configure Broadcast</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                        {/* LEFT: Template + Channels */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* WhatsApp Template */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                    WHATSAPP TEMPLATE <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                {templates.length === 0 ? (
                                    <div style={{ padding: '12px', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: '10px', fontSize: '0.75rem', color: '#92400e' }}>
                                        <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                                        No approved templates found. Create one in Meta Business Suite first.
                                    </div>
                                ) : (
                                    <select
                                        value={selectedTemplate?.name || ''}
                                        onChange={(e) => setSelectedTemplate(templates.find(t => t.name === e.target.value) || null)}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: '10px',
                                            border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600,
                                            background: '#fff', color: selectedTemplate ? '#0f172a' : '#94a3b8',
                                            outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">— Choose Approved Template —</option>
                                        {templates.map(t => (
                                            <option key={t.name} value={t.name}>
                                                {t.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <p style={{ margin: '6px 0 0', fontSize: '0.62rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                    <i className="fas fa-info-circle"></i> Meta templates ensure delivery even to brokers you've never messaged before.
                                </p>
                            </div>

                            {/* Channels */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>CHANNELS</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {[
                                        { key: 'whatsapp', icon: 'fab fa-whatsapp', color: '#128C7E', label: 'WhatsApp', note: 'Template required' },
                                        { key: 'email', icon: 'fas fa-envelope', color: '#ef4444', label: 'Email', note: 'Professional HTML' }
                                    ].map(ch => (
                                        <label key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: `1px solid ${channels[ch.key] ? '#e0e7ff' : '#f1f5f9'}`, borderRadius: '10px', background: channels[ch.key] ? '#f5f3ff' : '#fafafa', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={channels[ch.key]}
                                                onChange={e => setChannels({ ...channels, [ch.key]: e.target.checked })}
                                                style={{ accentColor: '#6366f1' }}
                                            />
                                            <i className={ch.icon} style={{ color: ch.color, fontSize: '16px' }}></i>
                                            <div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{ch.label}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{ch.note}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Group Selector + Launch */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>BROKER GROUPS</label>
                                {groups.length === 0 ? (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '12px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                        No broker groups found
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {groups.map(g => {
                                            const isSelected = selectedGroups.includes(g._id);
                                            return (
                                                <button
                                                    key={g._id}
                                                    onClick={() => {
                                                        if (isSelected) setSelectedGroups(selectedGroups.filter(id => id !== g._id));
                                                        else setSelectedGroups([...selectedGroups, g._id]);
                                                    }}
                                                    style={{
                                                        padding: '6px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                                        border: `1.5px solid ${isSelected ? g.color || '#6366f1' : '#e2e8f0'}`,
                                                        background: isSelected ? (g.color || '#6366f1') : '#fff',
                                                        color: isSelected ? '#fff' : '#475569',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', gap: '5px'
                                                    }}
                                                >
                                                    {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                    {g.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Launch Button */}
                            <button
                                onClick={handleBroadcast}
                                disabled={sending || selectedGroups.length === 0 || (channels.whatsapp && !selectedTemplate)}
                                style={{
                                    marginTop: 'auto', width: '100%', padding: '14px',
                                    borderRadius: '12px', border: 'none',
                                    background: sending || selectedGroups.length === 0 || (channels.whatsapp && !selectedTemplate)
                                        ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: sending || selectedGroups.length === 0 || (channels.whatsapp && !selectedTemplate) ? '#94a3b8' : '#fff',
                                    fontWeight: 900, fontSize: '0.85rem',
                                    cursor: (sending || selectedGroups.length === 0 || (channels.whatsapp && !selectedTemplate)) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
                                }}
                            >
                                {sending
                                    ? <><i className="fas fa-spinner fa-spin"></i> Dispatching...</>
                                    : <><i className="fas fa-paper-plane"></i> Launch Broadcast</>
                                }
                            </button>
                            {selectedGroups.length === 0 && (
                                <p style={{ margin: '-8px 0 0', fontSize: '0.65rem', color: '#f59e0b', textAlign: 'center' }}>
                                    <i className="fas fa-arrow-up"></i> Select at least one group
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 🔍 Template Preview — Live */}
                    {selectedTemplate && templatePreview && (
                        <div style={{ marginTop: '20px', padding: '16px', background: '#e8f5e9', borderRadius: '12px', border: '1px solid #a5d6a7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                <i className="fab fa-whatsapp" style={{ color: '#128C7E', fontSize: '14px' }}></i>
                                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#2e7d32', letterSpacing: '0.5px' }}>
                                    TEMPLATE PREVIEW — "{selectedTemplate.name}"
                                </span>
                            </div>
                            <div style={{
                                background: '#dcf8c6', padding: '12px 14px', borderRadius: '10px 10px 10px 0',
                                fontSize: '0.78rem', lineHeight: '1.6', color: '#1a1a1a',
                                whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxWidth: '90%',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}>
                                {templatePreview}
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.62rem', color: '#2e7d32', fontStyle: 'italic' }}>
                                <i className="fas fa-info-circle"></i> [Broker Name] will be replaced with each broker's actual company name at dispatch time.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Analytics Section ─────────────────────────────────────── */}
            {analytics && analytics.total > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', borderTop: '3px solid #6366f1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <i className="fas fa-chart-bar" style={{ color: '#6366f1', fontSize: '14px' }}></i>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Broadcast Analytics</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {[
                            { label: 'TOTAL REACH', val: analytics.total, bg: '#f8fafc', color: '#0f172a' },
                            { label: 'SENT', val: analytics.sent || analytics.total - (analytics.failed || 0), bg: '#f0fdf4', color: '#166534' },
                            { label: 'FAILED', val: analytics.failed, bg: '#fef2f2', color: '#991b1b' },
                            { label: 'CHANNELS', val: `${Object.entries(analytics.channels || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(' | ') || 'N/A'}`, bg: '#f5f3ff', color: '#5b21b6', small: true }
                        ].map((s, i) => (
                            <div key={i} style={{ background: s.bg, padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: s.small ? '0.65rem' : '1.3rem', fontWeight: 900, color: s.color, wordBreak: 'break-all' }}>{s.val}</div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: s.color, opacity: 0.7, marginTop: '2px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MarketingTab;
