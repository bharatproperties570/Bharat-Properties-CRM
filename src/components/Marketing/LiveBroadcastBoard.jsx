import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { 
    Play, Pause, XCircle, RotateCcw, Clock, ShieldAlert, 
    CheckCircle2, Send, Eye, AlertTriangle, Users, 
    RefreshCw, Sparkles, ChevronDown, ChevronUp, History
} from 'lucide-react';

const STATUS_CONFIG = {
    ACTIVE: { label: 'Broadcasting In Flight', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
    COOLDOWN: { label: 'Anti-Ban Cooldown Active', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
    INITIALIZING: { label: 'Initializing Dispatch', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)' },
    PAUSED: { label: 'Campaign Paused by Operator', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.3)' },
    COMPLETED: { label: 'Broadcast Completed', color: '#059669', bg: 'rgba(5, 150, 105, 0.12)', border: 'rgba(5, 150, 105, 0.3)' },
    CANCELLED: { label: 'Broadcast Cancelled', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' },
    FAILED: { label: 'Broadcast Halted', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)', border: 'rgba(220, 38, 38, 0.3)' }
};

export default function LiveBroadcastBoard({ dealId, campaignId: propCampaignId, onCampaignChange }) {
    const { isDark } = useTheme();
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState(propCampaignId || '');
    const [liveState, setLiveState] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [showAuditLog, setShowAuditLog] = useState(false);
    const [countdownSeconds, setCountdownSeconds] = useState(0);

    const pollingRef = useRef(null);
    const timerRef = useRef(null);

    // 1. Fetch campaigns matching dealId (or recent)
    const fetchCampaigns = useCallback(async () => {
        try {
            const url = dealId ? `/marketing/broadcast/live?dealId=${dealId}&limit=5` : `/marketing/broadcast/live?limit=8`;
            const res = await api.get(url);
            if (res.data?.success) {
                const list = res.data.data || [];
                setCampaigns(list);
                if (!selectedCampaignId && list.length > 0) {
                    setSelectedCampaignId(list[0].campaignId);
                    setLiveState(list[0]);
                }
            }
        } catch (err) {
            console.error('[LiveBroadcastBoard] Failed to fetch campaign list:', err);
        }
    }, [dealId, selectedCampaignId]);

    // 2. Fetch specific live campaign state
    const fetchLiveState = useCallback(async (id) => {
        if (!id) return;
        try {
            const res = await api.get(`/marketing/broadcast/live/${id}`);
            if (res.data?.success) {
                const data = res.data.data;
                setLiveState(data);
                if (data.isCooldown && data.remainingCooldownSeconds > 0) {
                    setCountdownSeconds(data.remainingCooldownSeconds);
                } else if (data.delayMs > 0 && ['ACTIVE', 'COOLDOWN'].includes(data.status)) {
                    setCountdownSeconds(Math.max(1, Math.round(data.delayMs / 1000)));
                } else {
                    setCountdownSeconds(0);
                }
            }
        } catch (err) {
            console.error('[LiveBroadcastBoard] Failed to fetch live state:', err);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // When propCampaignId changes
    useEffect(() => {
        if (propCampaignId && propCampaignId !== selectedCampaignId) {
            setSelectedCampaignId(propCampaignId);
            fetchLiveState(propCampaignId);
        }
    }, [propCampaignId, selectedCampaignId, fetchLiveState]);

    // Polling effect
    useEffect(() => {
        if (!selectedCampaignId) return;

        fetchLiveState(selectedCampaignId);

        const pollInterval = (liveState?.status === 'COMPLETED' || liveState?.status === 'CANCELLED') ? 10000 : 3000;
        pollingRef.current = setInterval(() => {
            fetchLiveState(selectedCampaignId);
        }, pollInterval);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [selectedCampaignId, liveState?.status, fetchLiveState]);

    // Countdown second ticker
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (countdownSeconds > 0) {
            timerRef.current = setInterval(() => {
                setCountdownSeconds(prev => (prev > 1 ? prev - 1 : 0));
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [countdownSeconds]);

    // Operator Controls: Pause
    const handlePause = async () => {
        if (!selectedCampaignId) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/marketing/broadcast/${selectedCampaignId}/pause`, {
                reason: 'Operator requested pause via Live Board'
            });
            if (res.data?.success) {
                toast.success('⏸️ Broadcast campaign paused. Halting chained dispatch.');
                await fetchLiveState(selectedCampaignId);
            } else {
                toast.error(res.data?.error || 'Failed to pause campaign');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to pause campaign');
        } finally {
            setActionLoading(false);
        }
    };

    // Operator Controls: Resume
    const handleResume = async () => {
        if (!selectedCampaignId) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/marketing/broadcast/${selectedCampaignId}/resume`, {
                reason: 'Operator resumed campaign via Live Board'
            });
            if (res.data?.success) {
                toast.success('▶️ Broadcast campaign resumed! Chained micro-job dispatched.');
                await fetchLiveState(selectedCampaignId);
            } else {
                toast.error(res.data?.error || 'Failed to resume campaign');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to resume campaign');
        } finally {
            setActionLoading(false);
        }
    };

    // Operator Controls: Cancel
    const handleCancel = async () => {
        if (!selectedCampaignId) return;
        if (!window.confirm('Are you sure you want to cancel this in-flight broadcast? No further messages will be sent.')) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/marketing/broadcast/${selectedCampaignId}/cancel`, {
                reason: 'Operator cancelled campaign via Live Board'
            });
            if (res.data?.success) {
                toast.success('🛑 Broadcast campaign cancelled.');
                await fetchLiveState(selectedCampaignId);
            } else {
                toast.error(res.data?.error || 'Failed to cancel campaign');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to cancel campaign');
        } finally {
            setActionLoading(false);
        }
    };

    // Operator Controls: Retry Failed Only
    const handleRetryFailed = async () => {
        if (!selectedCampaignId) return;
        const failedCount = (liveState?.stats?.failed || 0) + (liveState?.stats?.unknown || 0);
        if (failedCount === 0) {
            toast.info('No failed or timed-out recipients to retry.');
            return;
        }

        if (!window.confirm(`Initiate safe retry for ${failedCount} failed/timed-out recipients? Already confirmed recipients will NOT receive duplicate messages.`)) return;

        setActionLoading(true);
        try {
            const res = await api.post(`/marketing/broadcast/${selectedCampaignId}/retry-failed`);
            if (res.data?.success) {
                toast.success(`🎉 Spawned retry broadcast for ${res.data.retryRecipientCount} recipients!`);
                const newCampaignId = res.data.retryCampaignId;
                setSelectedCampaignId(newCampaignId);
                await fetchCampaigns();
                await fetchLiveState(newCampaignId);
            } else {
                toast.error(res.data?.error || 'Retry could not be initiated');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Retry could not be initiated');
        } finally {
            setActionLoading(false);
        }
    };

    if (!liveState && campaigns.length === 0) {
        return null; // No broadcasts running yet
    }

    const currentStatus = liveState?.status || 'ACTIVE';
    const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.ACTIVE;
    const progress = liveState?.progressPercent || 0;
    const total = liveState?.totalRecipients || 0;
    const processed = liveState?.processedRecipients || 0;
    const stats = liveState?.stats || {};
    const retryableCount = (stats.failed || 0) + (stats.unknown || 0);

    const formatMinsSecs = (totalSecs) => {
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    return (
        <div style={{
            background: isDark ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.85))' : '#ffffff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '22px',
            boxShadow: isDark ? '0 10px 30px rgba(0, 0, 0, 0.4)' : '0 10px 25px rgba(99, 102, 241, 0.06)',
            marginBottom: '20px',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Top Accent Strip */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: currentStatus === 'COOLDOWN' 
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' 
                    : (currentStatus === 'PAUSED' ? '#eab308' : (currentStatus === 'COMPLETED' ? '#10b981' : 'linear-gradient(90deg, #6366f1, #10b981)'))
            }} />

            {/* Header: Title + Campaign Selector + Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6366f1'
                    }}>
                        <RefreshCw size={18} className={currentStatus === 'ACTIVE' ? 'animate-spin' : ''} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                Live Broadcast Board (Phase 4)
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                color: statusCfg.color,
                                background: statusCfg.bg,
                                border: `1px solid ${statusCfg.border}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: statusCfg.color
                                }} />
                                {statusCfg.label}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            {liveState?.name || 'Omnichannel WhatsApp Broadcast'} · Provider: {liveState?.isBaileys ? 'WhatsApp Web (Baileys)' : 'Official Meta Cloud API'}
                        </div>
                    </div>
                </div>

                {/* Campaign Switcher Dropdown (if multiple exist) */}
                {campaigns.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>Campaign:</span>
                        <select
                            value={selectedCampaignId}
                            onChange={(e) => {
                                setSelectedCampaignId(e.target.value);
                                if (onCampaignChange) onCampaignChange(e.target.value);
                            }}
                            style={{
                                background: isDark ? '#1e293b' : '#f8fafc',
                                color: isDark ? '#f8fafc' : '#0f172a',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {campaigns.map((c) => (
                                <option key={c.campaignId} value={c.campaignId}>
                                    {c.name.slice(0, 32)} ({c.status})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ── Progress Bar & Timer Strip ─────────────────────────────────── */}
            <div style={{
                background: isDark ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '18px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                            Dispatch Progress: {processed} of {total} Recipients
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#6366f1' }}>
                            ({progress}%)
                        </span>
                    </div>

                    {/* Live Timing / Cooldown Display */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                        {currentStatus === 'COOLDOWN' ? (
                            <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <ShieldAlert size={15} />
                                Anti-Ban Cooldown: Resuming in {formatMinsSecs(countdownSeconds)}
                            </span>
                        ) : currentStatus === 'ACTIVE' && countdownSeconds > 0 ? (
                            <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <Clock size={15} />
                                Next dispatch in {countdownSeconds}s (Jitter Pacing)
                            </span>
                        ) : currentStatus === 'PAUSED' ? (
                            <span style={{ color: '#eab308' }}>
                                ⏸️ Paused at Recipient {processed}/{total}
                            </span>
                        ) : currentStatus === 'COMPLETED' ? (
                            <span style={{ color: '#10b981' }}>
                                ✅ All Recipients Processed
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* Animated Visual Progress Bar */}
                <div style={{
                    height: '10px',
                    background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: currentStatus === 'COOLDOWN'
                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                            : (currentStatus === 'PAUSED' ? '#eab308' : (currentStatus === 'COMPLETED' ? '#10b981' : 'linear-gradient(90deg, #6366f1, #10b981)')),
                        borderRadius: '5px',
                        transition: 'width 0.4s ease-in-out'
                    }} />
                </div>
            </div>

            {/* ── 8 Monotonic Delivery Breakdown Counters ────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                gap: '8px',
                marginBottom: '18px'
            }}>
                {[
                    { label: 'TOTAL', val: total, color: isDark ? '#f8fafc' : '#0f172a', bg: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc' },
                    { label: 'SENT', val: stats.sent || 0, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)' },
                    { label: 'DELIVERED', val: stats.delivered || 0, color: '#059669', bg: 'rgba(5, 150, 105, 0.08)' },
                    { label: 'READ', val: stats.read || 0, color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)' },
                    { label: 'ACCEPTED', val: stats.accepted || 0, color: '#0284c7', bg: 'rgba(2, 132, 199, 0.08)' },
                    { label: 'FAILED', val: stats.failed || 0, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.08)' },
                    { label: 'UNKNOWN', val: stats.unknown || 0, color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)' },
                    { label: 'OPTOUT', val: stats.suppressed || 0, color: '#9333ea', bg: 'rgba(147, 51, 234, 0.08)' }
                ].map((item, idx) => (
                    <div key={idx} style={{
                        background: item.bg,
                        padding: '10px 8px',
                        borderRadius: '10px',
                        textAlign: 'center',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: item.color }}>{item.val}</div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: item.color, opacity: 0.8, marginTop: '2px', letterSpacing: '0.5px' }}>
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Operator Action Buttons Strip ─────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                paddingTop: '12px',
                borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Pause Button */}
                    {(currentStatus === 'ACTIVE' || currentStatus === 'COOLDOWN' || currentStatus === 'INITIALIZING') && (
                        <button
                            onClick={handlePause}
                            disabled={actionLoading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 14px',
                                borderRadius: '8px',
                                background: '#eab308',
                                color: '#000000',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                opacity: actionLoading ? 0.6 : 1
                            }}
                        >
                            <Pause size={14} /> Pause Campaign
                        </button>
                    )}

                    {/* Resume Button */}
                    {currentStatus === 'PAUSED' && (
                        <button
                            onClick={handleResume}
                            disabled={actionLoading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 14px',
                                borderRadius: '8px',
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                opacity: actionLoading ? 0.6 : 1
                            }}
                        >
                            <Play size={14} /> Resume Campaign
                        </button>
                    )}

                    {/* Cancel Button */}
                    {['ACTIVE', 'COOLDOWN', 'PAUSED', 'INITIALIZING'].includes(currentStatus) && (
                        <button
                            onClick={handleCancel}
                            disabled={actionLoading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 14px',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                opacity: actionLoading ? 0.6 : 1
                            }}
                        >
                            <XCircle size={14} /> Cancel Campaign
                        </button>
                    )}

                    {/* Retry Failed Only Button */}
                    {retryableCount > 0 && (
                        <button
                            onClick={handleRetryFailed}
                            disabled={actionLoading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 14px',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                                opacity: actionLoading ? 0.6 : 1
                            }}
                        >
                            <RotateCcw size={14} /> Retry Failed Only ({retryableCount})
                        </button>
                    )}
                </div>

                {/* Audit Log Toggle */}
                {liveState?.auditLog && liveState.auditLog.length > 0 && (
                    <button
                        onClick={() => setShowAuditLog(!showAuditLog)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: isDark ? '#94a3b8' : '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        <History size={13} /> {showAuditLog ? 'Hide Audit Log' : 'View Operator Audit Trail'} {showAuditLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                )}
            </div>

            {/* ── Collapsible Audit Trail ───────────────────────────────────── */}
            {showAuditLog && liveState?.auditLog && liveState.auditLog.length > 0 && (
                <div style={{
                    marginTop: '14px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: isDark ? 'rgba(0,0,0,0.25)' : '#f1f5f9',
                    fontSize: '0.75rem'
                }}>
                    <div style={{ fontWeight: 800, color: isDark ? '#e2e8f0' : '#1e293b', marginBottom: '8px' }}>
                        Operator Audit History:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {liveState.auditLog.map((log, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: isDark ? '#cbd5e1' : '#475569' }}>
                                <div>
                                    <strong style={{ color: '#6366f1' }}>{log.action}</strong> by {log.performedBy}
                                    {log.reason ? ` — "${log.reason}"` : ''}
                                </div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
