import React, { useState, useEffect } from 'react';
import { enrichmentAPI } from '../../../utils/api';
import Toast from '../../../components/Toast';

const EnrichmentSettingsPage = () => {
    const [activeTab, setActiveTab] = useState('keywords'); // 'keywords', 'formula', 'classification', 'margin'
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState({ generalRules: [], keywordRules: [] });
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

    // Keyword Modal State
    const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
    const [editingKeyword, setEditingKeyword] = useState(null);
    const [keywordForm, setKeywordForm] = useState({
        keyword: '',
        autoTag: '',
        roleType: 'Buyer',
        intentImpact: 15,
        isActive: true
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            setLoading(true);
            const response = await enrichmentAPI.getRules();
            if (response.success) {
                setRules(response.data);
            }
        } catch (error) {
            showToast('Failed to fetch enrichment rules', 'error');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
    };

    const handleSaveKeyword = async () => {
        try {
            if (!keywordForm.keyword || !keywordForm.autoTag) {
                showToast('Keyword and Tag are required', 'error');
                return;
            }
            const data = editingKeyword ? { ...keywordForm, id: editingKeyword._id } : keywordForm;
            const response = await enrichmentAPI.saveKeywordRule(data);
            if (response.success) {
                showToast(editingKeyword ? 'Rule updated' : 'Rule created');
                fetchRules();
                setIsKeywordModalOpen(false);
            }
        } catch (error) {
            showToast('Error saving keyword rule', 'error');
        }
    };

    const handleDeleteKeyword = async (id) => {
        if (window.confirm('Are you sure you want to delete this rule?')) {
            try {
                await enrichmentAPI.deleteKeywordRule(id);
                showToast('Rule deleted');
                fetchRules();
            } catch (error) {
                showToast('Error deleting rule', 'error');
            }
        }
    };

    const tabs = [
        { id: 'keywords', label: 'Keyword Detection', icon: 'fa-search-plus' },
        { id: 'formula', label: 'Intent Formula', icon: 'fa-functions' },
        { id: 'classification', label: 'Classification Engine', icon: 'fa-tags' },
        { id: 'margin', label: 'Margin Detection', icon: 'fa-percentage' },
    ];

    const SectionHeader = ({ title, subtitle, icon, color = '#3b82f6' }) => (
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`fas ${icon}`} style={{ color: color, fontSize: '1.2rem' }}></i>
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{title}</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>{subtitle}</p>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, padding: '32px 40px', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {notification.show && <Toast message={notification.message} type={notification.type} onClose={() => setNotification({ ...notification, show: false })} />}

            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', margin: '0 0 8px 0' }}>Prospecting & Enrichment</h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '1rem' }}>Intelligence layer for lead intent detection and classification.</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '12px 4px',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: activeTab === tab.id ? 'var(--primary-color)' : '#94a3b8',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary-color)' : '3px solid transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className={`fas ${tab.icon}`}></i> {tab.label}
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}><i className="fas fa-spinner fa-spin"></i> Loading Rules...</div>
            ) : (
                <div style={{ flex: 1 }}>
                    {/* KEYWORDS TAB */}
                    {activeTab === 'keywords' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div style={{ fontSize: '0.9rem', color: '#64748b' }}>System scans notes, logs, and WhatsApp for these keywords to auto-apply intelligence.</div>
                                <button className="btn-primary" onClick={() => { setEditingKeyword(null); setKeywordForm({ keyword: '', autoTag: '', roleType: 'Buyer', intentImpact: 15, isActive: true }); setIsKeywordModalOpen(true); }} style={{ padding: '8px 16px', borderRadius: '6px' }}>+ Add Keyword</button>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Keyword</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Auto Tag</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Role Detect</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Intent Impact</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Status</th>
                                            <th style={{ padding: '16px', width: '80px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rules.keywordRules.length === 0 ? (
                                            <tr><td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No keyword rules defined yet.</td></tr>
                                        ) : rules.keywordRules.map(rule => (
                                            <tr key={rule._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px', fontWeight: 700, color: '#1e293b' }}>"{rule.keyword}"</td>
                                                <td style={{ padding: '16px' }}><span style={{ padding: '4px 10px', background: '#eff6ff', color: '#3b82f6', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>{rule.autoTag}</span></td>
                                                <td style={{ padding: '16px', fontWeight: 600, color: '#64748b' }}>{rule.roleType}</td>
                                                <td style={{ padding: '16px', fontWeight: 800, color: rule.intentImpact >= 0 ? '#10b981' : '#ef4444' }}>{rule.intentImpact >= 0 ? '+' : ''}{rule.intentImpact}%</td>
                                                <td style={{ padding: '16px', textAlign: 'center' }}><span style={{ padding: '4px 8px', borderRadius: '4px', background: rule.isActive ? '#dcfce7' : '#f1f5f9', color: rule.isActive ? '#166534' : '#64748b', fontSize: '0.7rem', fontWeight: 700 }}>{rule.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                                                <td style={{ padding: '16px', display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => { setEditingKeyword(rule); setKeywordForm({ ...rule }); setIsKeywordModalOpen(true); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><i className="fas fa-edit"></i></button>
                                                    <button onClick={() => handleDeleteKeyword(rule._id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}><i className="fas fa-trash-alt"></i></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* FORMULA TAB */}
                    {activeTab === 'formula' && (
                        <div style={{ maxWidth: '600px' }}>
                            <SectionHeader title="Intent Index Formula" subtitle="Weighted calculation of 0-100 score" icon="fa-calculator" color="#8b5cf6" />
                            <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px' }}>
                                {[
                                    { label: 'Requirement Depth', weight: 25, desc: 'How much profile data is filled (budget, location etc)' },
                                    { label: 'Timeline Urgency', weight: 25, desc: 'Immediate/Urgent timeline detection' },
                                    { label: 'Budget Clarity', weight: 20, desc: 'Fixed budget range provided' },
                                    { label: 'Visit Readiness', weight: 20, desc: 'Historical site visits or meetings' },
                                    { label: 'Response Speed', weight: 10, desc: 'Average time to reply or contact' },
                                ].map((item, i) => (
                                    <div key={i} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: i < 4 ? '1px dashed #f1f5f9' : 'none' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontWeight: 700, color: '#334155' }}>{item.label}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="number" defaultValue={item.weight} style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }} />
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>%</span>
                                            </div>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>{item.desc}</p>
                                    </div>
                                ))}
                                <button className="btn-primary" style={{ width: '100%', marginTop: '12px', padding: '12px' }}>Update Formula Weights</button>
                            </div>
                        </div>
                    )}

                    {/* CLASSIFICATION TAB */}
                    {activeTab === 'classification' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            <div>
                                <SectionHeader title="Score Thresholds" subtitle="Auto-label leads by Intent Index" icon="fa-thermometer-half" color="#f59e0b" />
                                <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px' }}>
                                    {[
                                        { label: 'Serious Buyer', min: 80, max: 100, color: '#ef4444' },
                                        { label: 'Qualified', min: 60, max: 80, color: '#f59e0b' },
                                        { label: 'Explorer', min: 40, max: 60, color: '#3b82f6' },
                                        { label: 'Low Intent', min: 0, max: 40, color: '#94a3b8' },
                                    ].map((band, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                            <div style={{ width: '120px', fontWeight: 700, color: band.color }}>{band.label}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{band.min} - {band.max}</span>
                                                <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', left: `${band.min}%`, width: `${band.max - band.min}%`, height: '100%', background: band.color, borderRadius: '3px' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <SectionHeader title="Special Classifications" subtitle="Labeling based on specific tags" icon="fa-user-tag" color="#10b981" />
                                <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px' }}>
                                    <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #dcfce7', background: '#f0fdf4', borderRadius: '8px' }}>
                                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.9rem' }}>Investor Detection</div>
                                        <div style={{ fontSize: '0.8rem', color: '#166534' }}>If tag "ROI" detected → Assign "Investor" classification.</div>
                                    </div>
                                    <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #eff6ff', background: '#f8fafc', borderRadius: '8px' }}>
                                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.9rem' }}>Future Buyer</div>
                                        <div style={{ fontSize: '0.8rem', color: '#1e3a8a' }}>If Timeline {'>'} 3 months → Assign "Future Buyer".</div>
                                    </div>
                                    <button className="btn-outline" style={{ width: '100%', padding: '10px' }}>Add Custom Mapping Rule</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MARGIN TAB */}
                    {activeTab === 'margin' && (
                        <div style={{ maxWidth: '600px' }}>
                            <SectionHeader title="Margin Opportunity Engine" subtitle="Identify high-negotiation deals" icon="fa-funnel-dollar" color="#10b981" />
                            <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 700, color: '#334155' }}>Enable Auto-Detection</div>
                                        <input type="checkbox" defaultChecked style={{ zoom: 1.5 }} />
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>System will mark deals with "High Margin Opportunity" badge based on rules below.</p>
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Inventory Age Threshold</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <input type="number" defaultValue={30} style={{ width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>days listed</span>
                                    </div>
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Price Gap Requirement</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <input type="number" defaultValue={12} style={{ width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>% max gap between Budget & Quote</span>
                                    </div>
                                </div>
                                <button className="btn-primary" style={{ width: '100%', padding: '12px' }}>Save Margin Engine Settings</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Keyword Rule Modal */}
            {isKeywordModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px' }}>{editingKeyword ? 'Edit Keyword Rule' : 'New Keyword Rule'}</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Keyword to detect</label>
                            <input type="text" value={keywordForm.keyword} onChange={e => setKeywordForm({ ...keywordForm, keyword: e.target.value })} placeholder="e.g. ROI" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Auto-apply Tag</label>
                            <input type="text" value={keywordForm.autoTag} onChange={e => setKeywordForm({ ...keywordForm, autoTag: e.target.value })} placeholder="e.g. Investor" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Detect Role</label>
                                <select value={keywordForm.roleType} onChange={e => setKeywordForm({ ...keywordForm, roleType: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                    {['Buyer', 'Seller', 'Investor', 'Developer', 'Direct Owner', 'Bank Auction'].map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Intent Impact (%)</label>
                                <input type="number" value={keywordForm.intentImpact} onChange={e => setKeywordForm({ ...keywordForm, intentImpact: parseInt(e.target.value) })} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                            <button className="btn-outline" onClick={() => setIsKeywordModalOpen(false)} style={{ flex: 1, padding: '12px' }}>Cancel</button>
                            <button className="btn-primary" onClick={handleSaveKeyword} style={{ flex: 1, padding: '12px' }}>Save Rule</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EnrichmentSettingsPage;
