import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';
import { formatIndianCurrency } from '../../../utils/numberToWords';

function MarketingTab({ dealId, deal, onRefresh }) {
    const [loading, setLoading] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [groups, setGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [channels, setChannels] = useState({ whatsapp: true, email: false });
    const [sending, setSending] = useState(false);

    useEffect(() => {
        fetchAnalytics();
        fetchGroups();
    }, [dealId]);

    const fetchAnalytics = async () => {
        try {
            const res = await api.get(`/marketing/broadcast/analytics/${dealId}`);
            if (res.data?.success) setAnalytics(res.data.data);
        } catch (error) {
            console.error("Analytics fetch error:", error);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await api.get('/company-groups');
            if (res.data?.success) setGroups(res.data.data || []);
        } catch (error) {
            console.error("Groups fetch error:", error);
        }
    };

    const handleSanitize = async () => {
        setLoading(true);
        try {
            await api.post(`/deals/${dealId}/sanitize`);
            toast.success("Deal sanitized for broadcast!");
            onRefresh();
        } catch (error) {
            toast.error("Failed to sanitize deal");
        } finally {
            setLoading(false);
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

        setSending(true);
        try {
            const res = await api.post('/marketing/broadcast/bna', {
                dealId,
                groupIds: selectedGroups,
                channels: selectedChannels
            });
            if (res.data.success) {
                toast.success(`Broadcast launched to ${res.data.dispatchCount} brokers!`);
                fetchAnalytics();
            }
        } catch (error) {
            toast.error("Broadcast failed");
        } finally {
            setSending(false);
        }
    };

    const meta = deal?.broadcastMetadata;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Sanitization Section */}
            <div className="glass-card" style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#10b981', marginRight: '8px' }}></i>
                            Deal Sanitization
                        </h4>
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                            Remove sensitive info (Owner contacts, exact unit no) before broadcasting.
                        </p>
                    </div>
                    <button 
                        className={`btn-${meta?.isReady ? 'outline' : 'primary'}`} 
                        onClick={handleSanitize}
                        disabled={loading}
                        style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                    >
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : (meta?.isReady ? 'Update Metadata' : 'Sanitize & Prepare')}
                    </button>
                </div>

                {meta?.isReady && (
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>PREVIEW CONTENT</span>
                            <span style={{ fontSize: '0.65rem', color: '#10b981' }}><i className="fas fa-check-circle"></i> Ready for BNA</span>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{meta.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>{meta.description}</div>
                            
                            <div style={{ display: 'flex', gap: '15px', marginTop: '8px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}><i className="fas fa-tag"></i> {meta.price}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}><i className="fas fa-map-marker-alt"></i> {meta.location}</div>
                            </div>

                            {/* 🧠 SENIOR PROFESSIONAL: New Detailed Sections Preview */}
                            {meta.detailedSections && meta.detailedSections.map((sec, idx) => (
                                <div key={idx} style={{ marginTop: '10px' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>{sec.title}</div>
                                    <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '0.7rem', color: '#475569' }}>
                                        {sec.lines.map((line, lidx) => (
                                            <li key={lidx} style={{ marginBottom: '2px' }}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Broadcast Section */}
            {meta?.isReady && (
                <div className="glass-card" style={{ padding: '20px' }}>
                    <h4 style={{ margin: '0 0 15px', fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
                        <i className="fas fa-bullhorn" style={{ color: 'var(--primary-color)', marginRight: '8px' }}></i>
                        Network Broadcast
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Group Selection */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '10px' }}>SELECT BROKER GROUPS</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {groups.map(g => (
                                    <button 
                                        key={g._id}
                                        onClick={() => {
                                            if (selectedGroups.includes(g._id)) setSelectedGroups(selectedGroups.filter(id => id !== g._id));
                                            else setSelectedGroups([...selectedGroups, g._id]);
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            border: '1px solid',
                                            borderColor: selectedGroups.includes(g._id) ? g.color : '#e2e8f0',
                                            background: selectedGroups.includes(g._id) ? g.color : '#fff',
                                            color: selectedGroups.includes(g._id) ? '#fff' : '#475569',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {g.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Channel Selection */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '10px' }}>CHANNELS</label>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={channels.whatsapp} onChange={e => setChannels({...channels, whatsapp: e.target.checked})} />
                                    <i className="fab fa-whatsapp" style={{ color: '#128C7E' }}></i> WhatsApp
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={channels.email} onChange={e => setChannels({...channels, email: e.target.checked})} />
                                    <i className="fas fa-envelope" style={{ color: '#EF4444' }}></i> Email
                                </label>
                            </div>
                            
                            <button 
                                className="btn-primary" 
                                style={{ width: '100%', marginTop: '20px', padding: '12px' }}
                                onClick={handleBroadcast}
                                disabled={sending}
                            >
                                {sending ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-paper-plane"></i> Launch Broadcast</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Analytics Section */}
            {analytics && analytics.total > 0 && (
                <div className="glass-card" style={{ padding: '20px', borderTop: '4px solid var(--primary-color)' }}>
                    <h4 style={{ margin: '0 0 15px', fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
                        <i className="fas fa-chart-line" style={{ color: '#3b82f6', marginRight: '8px' }}></i>
                        Real-time Analytics
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', textAlign: 'center' }}>
                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{analytics.total}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b' }}>TOTAL REACH</div>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#166534' }}>{analytics.delivered}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534' }}>DELIVERED</div>
                        </div>
                        <div style={{ background: '#f5f3ff', padding: '10px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#5b21b6' }}>{analytics.read}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#5b21b6' }}>READ/OPEN</div>
                        </div>
                        <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '10px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#991b1b' }}>{analytics.failed}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#991b1b' }}>FAILED</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MarketingTab;
