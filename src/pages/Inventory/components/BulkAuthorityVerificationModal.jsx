import React, { useState, useEffect, useRef } from 'react';
import { authorityAPI } from '../../../utils/api';
import toast from 'react-hot-toast';

export const BulkAuthorityVerificationModal = ({
    isOpen,
    onClose,
    selectedIds = [],
    onComplete
}) => {
    const [authorityCode, setAuthorityCode] = useState('HSVP');
    const [activeRun, setActiveRun] = useState(null);
    const [progress, setProgress] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const pollIntervalRef = useRef(null);

    // Clean up polling interval on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const startPolling = (runId) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await authorityAPI.getRunProgress(runId);
                if (res?.success && res.data) {
                    setProgress(res.data);
                    if (res.data.isCompleted) {
                        clearInterval(pollIntervalRef.current);
                        setIsExecuting(false);
                        if (res.data.status === 'COMPLETED') {
                            toast.success(`Verification completed! ${res.data.succeededItems} succeeded.`);
                        } else {
                            toast(`Verification finished with status: ${res.data.status}`);
                        }
                        if (onComplete) onComplete();
                    }
                }
            } catch (err) {
                console.error('[BulkAuthorityModal] Progress poll error:', err);
            }
        }, 1500);
    };

    const handleStartVerification = async () => {
        if (!selectedIds.length) {
            toast.error('Please select at least one property to verify.');
            return;
        }

        setIsExecuting(true);
        try {
            // 1. Create bulk run
            const createRes = await authorityAPI.createRun({
                authorityCode,
                runMode: 'BULK_MANUAL',
                inventoryIds: selectedIds,
                isFixtureMode: true
            });

            if (!createRes?.success || !createRes?.data) {
                throw new Error(createRes?.message || 'Failed to create bulk verification run');
            }

            const run = createRes.data;
            setActiveRun(run);
            setProgress({
                totalItems: run.totalItems || selectedIds.length,
                processedItems: 0,
                succeededItems: 0,
                failedItems: 0,
                status: 'PROCESSING'
            });

            // 2. Start polling
            startPolling(run._id);

            // 3. Trigger processing in background
            authorityAPI.processRun(run._id, {
                batchSize: 50,
                isFixtureMode: true
            }).catch(err => {
                console.error('[BulkAuthorityModal] Background process error:', err);
            });

            toast(`Started verification run for ${selectedIds.length} properties.`);
        } catch (err) {
            console.error('[BulkAuthorityModal] Start error:', err);
            toast.error(err.response?.data?.message || err.message || 'Verification initiation failed');
            setIsExecuting(false);
        }
    };

    const handlePause = async () => {
        if (!activeRun?._id) return;
        try {
            const res = await authorityAPI.pauseRun(activeRun._id);
            if (res?.success) {
                toast('Verification run paused at batch boundary');
                setProgress(prev => prev ? { ...prev, status: 'PAUSED' } : null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to pause verification run');
        }
    };

    const handleResume = async () => {
        if (!activeRun?._id) return;
        try {
            setIsExecuting(true);
            const res = await authorityAPI.resumeRun(activeRun._id, { isFixtureMode: true });
            if (res?.success) {
                toast('Resuming verification run');
                startPolling(activeRun._id);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to resume verification run');
        }
    };

    const handleCancel = async () => {
        if (!activeRun?._id) return;
        try {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            const res = await authorityAPI.cancelRun(activeRun._id);
            if (res?.success) {
                toast('Verification run cancelled');
                setIsExecuting(false);
                setProgress(prev => prev ? { ...prev, status: 'CANCELLED', isCompleted: true } : null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel verification run');
        }
    };

    if (!isOpen) return null;

    const total = progress?.totalItems || selectedIds.length || 0;
    const processed = progress?.processedItems || 0;
    const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const status = progress?.status || (activeRun ? 'CREATED' : 'IDLE');

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                background: 'var(--bg-card, #ffffff)',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '580px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: '#e0e7ff',
                            color: '#4f46e5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800
                        }}>
                            <i className="fas fa-shield-alt"></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                Bulk Authority Verification
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Controlled batch verification across selected inventory
                            </span>
                        </div>
                    </div>
                    {!isExecuting && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>

                {/* Demonstration Notice */}
                <div style={{
                    background: 'rgba(234, 88, 12, 0.08)',
                    border: '1px solid rgba(234, 88, 12, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '0.75rem',
                    color: '#c2410c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <i className="fas fa-flask"></i>
                    <span>
                        <strong>Demonstration Mode (Synthetic Fixtures):</strong> Sources remain offline until formal government agreements are established. Zero external portal network calls.
                    </span>
                </div>

                {/* Authority Selector (Disabled while running) */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                        TARGET AUTHORITY
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['HSVP', 'GMADA', 'CHD'].map(code => (
                            <button
                                key={code}
                                type="button"
                                disabled={isExecuting || Boolean(activeRun)}
                                onClick={() => setAuthorityCode(code)}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: authorityCode === code ? '2px solid #4f46e5' : '1px solid var(--border-color)',
                                    background: authorityCode === code ? '#eef2ff' : 'transparent',
                                    color: authorityCode === code ? '#4f46e5' : 'var(--text-main)',
                                    fontWeight: authorityCode === code ? 800 : 600,
                                    fontSize: '0.8rem',
                                    cursor: isExecuting ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {code === 'HSVP' ? 'HSVP (Haryana)' : (code === 'GMADA' ? 'GMADA (Mohali)' : 'CHD Estate Office')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Selection Count Summary */}
                <div style={{
                    padding: '10px 14px',
                    background: 'var(--bg-main, #f8fafc)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span>Selected Properties for Verification:</span>
                    <strong style={{ fontSize: '0.9rem', color: '#4f46e5' }}>{selectedIds.length} properties</strong>
                </div>

                {/* Progress Card (When Run is Active or Completed) */}
                {activeRun && (
                    <div style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Run Progress: {status}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#4f46e5' }}>
                                {processed} / {total} ({percent}%)
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: '#e2e8f0',
                            borderRadius: '4px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${percent}%`,
                                height: '100%',
                                background: status === 'FAILED' ? '#ef4444' : '#4f46e5',
                                transition: 'width 0.3s ease'
                            }}></div>
                        </div>

                        {/* Counts Metrics */}
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                            <span style={{ color: '#16a34a' }}>
                                <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i>
                                Succeeded: {progress?.succeededItems || 0}
                            </span>
                            <span style={{ color: '#dc2626' }}>
                                <i className="fas fa-times-circle" style={{ marginRight: '4px' }}></i>
                                Failed: {progress?.failedItems || 0}
                            </span>
                            <span style={{ color: '#d97706' }}>
                                <i className="fas fa-hourglass-half" style={{ marginRight: '4px' }}></i>
                                Remaining: {Math.max(0, total - processed)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    {!activeRun ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-main)',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleStartVerification}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#4f46e5',
                                    color: '#ffffff',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-play" style={{ marginRight: '6px' }}></i>
                                Start Batch Verification
                            </button>
                        </>
                    ) : (
                        <>
                            {status === 'PROCESSING' && (
                                <button
                                    type="button"
                                    onClick={handlePause}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        border: '1px solid #d97706',
                                        background: '#fef3c7',
                                        color: '#b45309',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <i className="fas fa-pause" style={{ marginRight: '6px' }}></i>
                                    Pause Run
                                </button>
                            )}

                            {status === 'PAUSED' && (
                                <button
                                    type="button"
                                    onClick={handleResume}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#16a34a',
                                        color: '#ffffff',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <i className="fas fa-play" style={{ marginRight: '6px' }}></i>
                                    Resume Run
                                </button>
                            )}

                            {!progress?.isCompleted && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        border: '1px solid #ef4444',
                                        background: '#fee2e2',
                                        color: '#b91c1c',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <i className="fas fa-stop" style={{ marginRight: '6px' }}></i>
                                    Cancel Run
                                </button>
                            )}

                            {progress?.isCompleted && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        padding: '8px 18px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#4f46e5',
                                        color: '#ffffff',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Close
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkAuthorityVerificationModal;
