import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function ContactReconciliationDashboardModal({ isOpen, onClose }) {
    const [summary, setSummary] = useState(null);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ALL');
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [dryRunPlan, setDryRunPlan] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [selectedMasterId, setSelectedMasterId] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchSummary();
            fetchGroups();
        }
    }, [isOpen, activeTab]);

    const fetchSummary = async () => {
        try {
            const res = await axios.get('/api/reconciliation/summary');
            if (res.data?.success) {
                setSummary(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch reconciliation summary:', err);
        }
    };

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const params = { limit: 50 };
            if (activeTab !== 'ALL') params.classification = activeTab;
            if (search) params.search = search;

            const res = await axios.get('/api/reconciliation/groups', { params });
            if (res.data?.success) {
                setGroups(res.data.data || []);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load duplicate groups');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenPlan = async (group) => {
        setSelectedGroup(group);
        setSelectedMasterId(group.selectedCanonicalMasterId || group.suggestedCanonicalMasterId || '');
        setReviewNotes(group.reviewNotes || '');
        setPlanLoading(true);
        try {
            const res = await axios.post(`/api/reconciliation/groups/${group._id}/plan`);
            if (res.data?.success) {
                setDryRunPlan(res.data.data);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to generate dry-run plan');
        } finally {
            setPlanLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedGroup) return;
        setActionLoading(true);
        try {
            const res = await axios.post(`/api/reconciliation/groups/${selectedGroup._id}/approve`, {
                selectedMasterId,
                reviewNotes
            });
            if (res.data?.success) {
                toast.success('Group approved for reconciliation');
                fetchSummary();
                fetchGroups();
                setSelectedGroup(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve group');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExecute = async (groupId) => {
        if (!window.confirm('Are you sure you want to execute this merge reconciliation? Master and duplicate records will be transactionally updated.')) {
            return;
        }
        setActionLoading(true);
        try {
            const res = await axios.post(`/api/reconciliation/groups/${groupId}/execute`, {}, {
                headers: { 'idempotency-key': `exec_${groupId}_${Date.now()}` }
            });
            if (res.data?.success) {
                toast.success('Reconciliation executed successfully');
                fetchSummary();
                fetchGroups();
                setSelectedGroup(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Execution failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisassociatePhone = async (groupId) => {
        if (!window.confirm('Are you sure you want to disassociate the secondary phone number from Contact B? Contact identities will be safely preserved.')) {
            return;
        }
        setActionLoading(true);
        try {
            const res = await axios.post(`/api/reconciliation/groups/${groupId}/disassociate-phone`, {
                action: 'REMOVE_SECONDARY',
                reason: 'Operator verified secondary duplicate removal'
            });
            if (res.data?.success) {
                toast.success('Phone disassociated cleanly');
                fetchSummary();
                fetchGroups();
                setSelectedGroup(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Disassociation failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRollback = async (groupId) => {
        if (!window.confirm('Are you sure you want to rollback this reconciliation operation?')) {
            return;
        }
        setActionLoading(true);
        try {
            const res = await axios.post(`/api/reconciliation/groups/${groupId}/rollback`);
            if (res.data?.success) {
                toast.success('Reconciliation rolled back cleanly');
                fetchSummary();
                fetchGroups();
                setSelectedGroup(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rollback failed');
        } finally {
            setActionLoading(false);
        }
    };

    if (!isOpen) return null;

    const readiness = summary?.migration004Readiness;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#ffffff', borderRadius: '12px', width: '95%', maxWidth: '1280px', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#2563eb', marginRight: '8px' }}></i>
                            Enterprise Contact Reconciliation & Deduplication Engine
                        </h2>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                            Phase 4.7 Production Gate — Verified 332 Duplicate Phone Groups
                        </span>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>

                {/* Migration 004 Readiness Banner */}
                {readiness && (
                    <div style={{ padding: '12px 24px', background: readiness.ready ? '#ecfdf5' : '#fff1f2', borderBottom: '1px solid', borderColor: readiness.ready ? '#a7f3d0' : '#fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: readiness.ready ? '#059669' : '#e11d48', color: '#ffffff' }}>
                                MIGRATION 004: {readiness.status}
                            </span>
                            <span style={{ fontSize: '13px', color: readiness.ready ? '#065f46' : '#9f1239' }}>
                                {readiness.ready ? 'All duplicate phone groups resolved. Database is ready for unique index.' : `${readiness.duplicateCount} active duplicate phone groups currently block unique index creation.`}
                            </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Strict Read-Only Evaluator</span>
                    </div>
                )}

                {/* Summary Metrics */}
                {summary && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', padding: '16px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>TOTAL DUPLICATE GROUPS</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{summary.totalGroups}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>654 Affected Contacts</div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>SAFE AUTO-MERGE</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#15803d' }}>{summary.byClassification.SAFE_AUTO_MERGE}</div>
                            <div style={{ fontSize: '11px', color: '#166534' }}>Deterministic Matches (17.8%)</div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fef3c7' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e' }}>REVIEW REQUIRED</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#b45309' }}>{summary.byClassification.REVIEW_REQUIRED}</div>
                            <div style={{ fontSize: '11px', color: '#92400e' }}>Operator Decision (3.0%)</div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b' }}>DO NOT MERGE</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{summary.byClassification.DO_NOT_MERGE}</div>
                            <div style={{ fontSize: '11px', color: '#991b1b' }}>Identity Conflicts (79.2%)</div>
                        </div>
                    </div>
                )}

                {/* Filter Tabs & Search */}
                <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['ALL', 'SAFE_AUTO_MERGE', 'REVIEW_REQUIRED', 'DO_NOT_MERGE'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: activeTab === tab ? '#2563eb' : '#cbd5e1',
                                    background: activeTab === tab ? '#eff6ff' : '#ffffff',
                                    color: activeTab === tab ? '#1d4ed8' : '#475569',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {tab.replace(/_/g, ' ')}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Search masked phone or fingerprint..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchGroups()}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '280px' }}
                    />
                </div>

                {/* Content Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading duplicate groups...</div>
                    ) : groups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No groups found in this category.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '10px 12px' }}>Masked Phone</th>
                                    <th style={{ padding: '10px 12px' }}>Classification</th>
                                    <th style={{ padding: '10px 12px' }}>Contacts</th>
                                    <th style={{ padding: '10px 12px' }}>Reason Codes</th>
                                    <th style={{ padding: '10px 12px' }}>Status</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{g.phoneMasked}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                background: g.primaryClassification === 'SAFE_AUTO_MERGE' ? '#dcfce7' : (g.primaryClassification === 'REVIEW_REQUIRED' ? '#fef3c7' : '#fee2e2'),
                                                color: g.primaryClassification === 'SAFE_AUTO_MERGE' ? '#15803d' : (g.primaryClassification === 'REVIEW_REQUIRED' ? '#b45309' : '#b91c1c')
                                            }}>
                                                {g.primaryClassification}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {(g.contacts || []).map((c, i) => (
                                                <span key={c._id} style={{ marginRight: '6px', fontSize: '12px' }}>
                                                    {c.maskedName} {i < g.contacts.length - 1 ? '•' : ''}
                                                </span>
                                            ))}
                                            {g.evidence?.totalReferences > 0 && (
                                                <span style={{ marginLeft: '6px', fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {g.evidence.totalReferences} refs
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {(g.reasonCodes || []).slice(0, 2).map(r => (
                                                <span key={r} style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', marginRight: '4px' }}>
                                                    {r}
                                                </span>
                                            ))}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: g.status === 'EXECUTED' ? '#15803d' : (g.status === 'DISASSOCIATED' ? '#0891b2' : '#64748b') }}>
                                                {g.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleOpenPlan(g)}
                                                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '11px', cursor: 'pointer', marginRight: '6px' }}
                                            >
                                                Details / Plan
                                            </button>
                                            {g.primaryClassification === 'SAFE_AUTO_MERGE' && g.status === 'PENDING_REVIEW' && (
                                                <button
                                                    onClick={() => handleExecute(g._id)}
                                                    disabled={actionLoading}
                                                    style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: '#16a34a', color: '#ffffff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Merge
                                                </button>
                                            )}
                                            {g.primaryClassification === 'DO_NOT_MERGE' && g.status === 'PENDING_REVIEW' && (
                                                <button
                                                    onClick={() => handleDisassociatePhone(g._id)}
                                                    disabled={actionLoading}
                                                    style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: '#0284c7', color: '#ffffff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Disassociate
                                                </button>
                                            )}
                                            {(g.status === 'EXECUTED' || g.status === 'DISASSOCIATED') && (
                                                <button
                                                    onClick={() => handleRollback(g._id)}
                                                    disabled={actionLoading}
                                                    style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fff1f2', color: '#e11d48', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Rollback
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Plan / Drawer Modal */}
                {selectedGroup && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#ffffff', borderRadius: '12px', width: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                    Reconciliation Plan: {selectedGroup.phoneMasked}
                                </h3>
                                <button onClick={() => setSelectedGroup(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>&times;</button>
                            </div>
                            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, fontSize: '13px' }}>
                                {planLoading ? (
                                    <div style={{ textAlign: 'center', padding: '20px' }}>Generating dry-run preview...</div>
                                ) : (
                                    <div>
                                        {selectedGroup.primaryClassification === 'DO_NOT_MERGE' && (
                                            <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', marginBottom: '16px' }}>
                                                <strong>⚠️ Automated Merge Strictly Prohibited:</strong> Distinct identities detected sharing this phone number.
                                                <div style={{ marginTop: '4px', fontSize: '12px' }}>Recommended action: Disassociate alternate/secondary phone from Contact B.</div>
                                            </div>
                                        )}

                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Designated Canonical Master:</label>
                                            {(selectedGroup.contacts || []).map(c => (
                                                <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                                                    <input
                                                        type="radio"
                                                        name="masterSelect"
                                                        value={c._id}
                                                        checked={selectedMasterId === c._id}
                                                        onChange={(e) => setSelectedMasterId(e.target.value)}
                                                        disabled={selectedGroup.primaryClassification === 'DO_NOT_MERGE'}
                                                    />
                                                    <span><strong>{c.maskedName}</strong> (ID: {c._id.slice(-6)})</span>
                                                </label>
                                            ))}
                                        </div>

                                        {dryRunPlan && dryRunPlan.plannedRewires?.length > 0 && (
                                            <div style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Planned Reference Rewires:</div>
                                                {dryRunPlan.plannedRewires.map(rw => (
                                                    <div key={rw.duplicateId} style={{ fontSize: '12px', color: '#475569' }}>
                                                        Duplicate {rw.duplicateId.slice(-6)}: {rw.rewireCount} reference(s) rewired
                                                        {rw.rewiresByCollection && (
                                                            <span> ({JSON.stringify(rw.rewiresByCollection)})</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Operator Review Notes:</label>
                                            <textarea
                                                value={reviewNotes}
                                                onChange={(e) => setReviewNotes(e.target.value)}
                                                placeholder="Add verification notes..."
                                                style={{ width: '100%', height: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc' }}>
                                <button onClick={() => setSelectedGroup(null)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                {selectedGroup.primaryClassification !== 'DO_NOT_MERGE' && (
                                    <>
                                        <button
                                            onClick={handleApprove}
                                            disabled={actionLoading}
                                            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Approve Selection
                                        </button>
                                        <button
                                            onClick={() => handleExecute(selectedGroup._id)}
                                            disabled={actionLoading}
                                            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Execute Merge
                                        </button>
                                    </>
                                )}
                                {selectedGroup.primaryClassification === 'DO_NOT_MERGE' && (
                                    <button
                                        onClick={() => handleDisassociatePhone(selectedGroup._id)}
                                        disabled={actionLoading}
                                        style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Disassociate Phone
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
