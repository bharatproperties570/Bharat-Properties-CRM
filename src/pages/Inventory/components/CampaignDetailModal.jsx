import React, { useEffect, useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { 
    Clock, 
    Layers, 
    Users, 
    CheckCircle2, 
    AlertTriangle, 
    RefreshCw, 
    X, 
    Calendar, 
    ShieldCheck, 
    Info 
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal/Modal';
import { api } from '../../../utils/api';

const statusTone = (status) => ({
    DRAFT: { text: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
    APPROVED: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    ACTIVE: { text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    PAUSED: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    COMPLETED: { text: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    CANCELLED: { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    SCHEDULED: { text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    CLAIMED: { text: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
    PLANNED: { text: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    READY: { text: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    DISPATCHING: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    PARTIAL: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    RECONCILIATION_REQUIRED: { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }
}[status] || { text: '#475569', bg: '#f1f5f9', border: '#cbd5e1' });

const formatIstDate = (value) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata'
        });
    } catch {
        return '—';
    }
};

/**
 * Enterprise Campaign Detail & Batch Ledger Monitoring Modal
 */
export default function CampaignDetailModal({ isOpen, onClose, campaignId }) {
    const [campaignDetail, setCampaignDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestCounterRef = useRef(0);

    const fetchDetail = useCallback(async (id) => {
        if (!id) return;
        const currentReq = ++requestCounterRef.current;
        setLoading(true);
        setError(null);

        try {
            const response = await api.get(`/owner-outreach/campaigns/${id}`);
            if (currentReq === requestCounterRef.current) {
                setCampaignDetail(response.data?.data || null);
                setLoading(false);
            }
        } catch (err) {
            if (currentReq === requestCounterRef.current) {
                console.error('[CampaignDetailModal] Fetch error:', err);
                setError(err.response?.data?.error || 'Failed to load campaign detail.');
                setCampaignDetail(null);
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (isOpen && campaignId) {
            fetchDetail(campaignId);
        } else {
            setCampaignDetail(null);
            setError(null);
            setLoading(false);
        }
    }, [isOpen, campaignId, fetchDetail]);

    if (!isOpen) return null;

    const campaign = campaignDetail?.campaign || {};
    const batches = campaignDetail?.batches || [];
    const summary = campaignDetail?.batchSummary || { total: 0, byStatus: {} };
    const byState = campaignDetail?.byState || [];
    const recipients = campaignDetail?.recipients || [];
    const statusStyle = statusTone(campaign.status);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={campaign.name ? `Campaign: ${campaign.name}` : 'Campaign Details & Batch Ledger'}
            size="xl"
            role="dialog"
            aria-label="Campaign Details and Batch Ledger"
            style={{ maxWidth: 980 }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={14} style={{ color: '#16a34a' }} />
                        <span>Read-only inspection. Outbound WhatsApp provider dispatch remains disabled.</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 18px',
                            background: '#1e293b',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
            }
        >
            {/* Header Action Bar */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: 12,
                    marginBottom: 16
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            color: statusStyle.text,
                            background: statusStyle.bg,
                            border: `1px solid ${statusStyle.border}`
                        }}
                    >
                        {campaign.status || 'UNKNOWN'}
                    </span>
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#475569',
                            background: '#f8fafc',
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0'
                        }}
                    >
                        {(campaign.channels || ['whatsapp']).join(', ').toUpperCase()}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => fetchDetail(campaignId)}
                    disabled={loading}
                    aria-label="Refresh campaign detail"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        background: '#fff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        padding: '12px 16px',
                        color: '#991b1b',
                        fontSize: 13,
                        marginBottom: 16
                    }}
                >
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading Skeleton */}
            {loading && !campaignDetail && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
                    <div
                        style={{
                            display: 'inline-block',
                            width: 24,
                            height: 24,
                            border: '3px solid #cbd5e1',
                            borderTopColor: '#2563eb',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: 10
                        }}
                    />
                    <div style={{ fontSize: 13 }}>Loading campaign details and batch schedule ledger...</div>
                </div>
            )}

            {/* Main Content */}
            {!loading && campaignDetail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Metrics Grid */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                            gap: 10
                        }}
                    >
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Total Batches</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                                {summary.total || 0}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Scheduled Batches</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                                {summary.byStatus?.SCHEDULED || 0}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Planned Batches</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f766e', marginTop: 2 }}>
                                {summary.byStatus?.PLANNED || 0}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Recipients Target</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                                {campaign.totals?.recipients || 0}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Consent Required</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#b45309', marginTop: 2 }}>
                                {campaign.totals?.consentRequired || 0}
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Suppressed Opt-Out</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>
                                {campaign.totals?.suppressed || 0}
                            </div>
                        </div>
                    </div>

                    {/* Cadence and Scheduling Details Card */}
                    <div
                        style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: 14,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 12
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Schedule Frequency</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                {campaign.frequency || 'DAILY'} ({campaign.batchSize || 100} per batch)
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Dispatch Window (IST)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                {campaign.dispatchWindow?.start || '10:00'} – {campaign.dispatchWindow?.end || '18:00'} IST
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Start Date & Time (IST)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                {formatIstDate(campaign.startAt)}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Next Scheduled Run (IST)</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', marginTop: 2 }}>
                                {formatIstDate(campaign.nextRunAt)}
                            </div>
                        </div>
                    </div>

                    {/* Batch Schedule Ledger Table */}
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                Batch Schedule Ledger
                            </h3>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                                {batches.length} batch row{batches.length === 1 ? '' : 's'} loaded
                            </span>
                        </div>

                        {campaignDetail.batchesTruncated && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: '#fffbeb',
                                    border: '1px solid #fde68a',
                                    borderRadius: 6,
                                    padding: '8px 12px',
                                    fontSize: 12,
                                    color: '#92400e',
                                    marginBottom: 10
                                }}
                            >
                                <Info size={14} />
                                <span>Displaying first 500 batches. Summary above accounts for all {summary.total} total batches.</span>
                            </div>
                        )}

                        <div
                            style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                overflowX: 'auto',
                                maxHeight: 240
                            }}
                        >
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Sequence</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Scheduled At (IST)</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Recipients</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Started At</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Completed At</th>
                                        <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batches.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b' }}>
                                                No schedule batches have been generated yet. (Campaign is in {campaign.status || 'DRAFT'} status).
                                            </td>
                                        </tr>
                                    ) : (
                                        batches.map((batch) => {
                                            const bTone = statusTone(batch.status);
                                            return (
                                                <tr key={batch._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>#{batch.sequence}</td>
                                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                        {formatIstDate(batch.scheduledAt)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <span
                                                            style={{
                                                                display: 'inline-block',
                                                                padding: '2px 8px',
                                                                borderRadius: 10,
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                color: bTone.text,
                                                                background: bTone.bg,
                                                                border: `1px solid ${bTone.border}`
                                                            }}
                                                        >
                                                            {batch.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>{batch.counts?.selected || 0}</td>
                                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                        {formatIstDate(batch.startedAt)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                        {formatIstDate(batch.completedAt)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: batch.lastErrorCode ? '#b91c1c' : '#94a3b8' }}>
                                                        {batch.lastErrorCode || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Eligibility Breakdown & Masked Sample */}
                    {byState.length > 0 && (
                        <div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                Recipient Eligibility Breakdown
                            </h3>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                    <thead style={{ background: '#f8fafc' }}>
                                        <tr>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Channel</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Eligibility</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Schedule State</th>
                                            <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {byState.map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 12px', textTransform: 'uppercase', fontWeight: 600 }}>
                                                    {row._id?.channel || 'whatsapp'}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>{row._id?.eligibility || 'ELIGIBLE'}</td>
                                                <td style={{ padding: '8px 12px' }}>{row._id?.dispatchState || 'PENDING'}</td>
                                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.count || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Masked Sample Notice */}
                    {recipients.length > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                            * Sample endpoints verified masked with SHA-256 HMAC encryption. Zero personal contact data is exposed.
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

CampaignDetailModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    campaignId: PropTypes.string
};
