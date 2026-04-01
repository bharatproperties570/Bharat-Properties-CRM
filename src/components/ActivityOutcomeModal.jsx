import { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useActivities } from '../context/ActivityContext';
import StageTransitionModal from './StageTransitionModal';
import { activitiesAPI } from '../utils/api';

/**
 * ActivityOutcomeModal — v2
 *
 * Refactored to use the unified backend scoring + stage pipeline:
 *   POST /api/activities/:id/complete → triggers StageTransitionEngine + LeadScoringService
 *
 * Two-phase flow:
 *   Phase 1: User selects outcome + any feedback → POST /complete
 *            If { requiresForm: true } → show StageTransitionModal with missing fields
 *   Phase 2: StageTransitionModal submits → POST /complete-with-form → stage changes + score computed
 *
 * Old frontend-only stage logic (useStageEngine, triggerRequiredForm) removed.
 */
const ActivityOutcomeModal = ({ isOpen, onClose, activity }) => {
    const { activityMasterFields } = usePropertyConfig();
    const { updateActivity } = useActivities();

    const [formData, setFormData] = useState({
        outcomeStatus: '',
        completionResult: '',
        clientFeedback: '',
        completionDate: new Date().toISOString().split('T')[0],
        completionTime: new Date().toTimeString().slice(0, 5),
    });

    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    // Stage transition modal state
    const [stageModal, setStageModal] = useState({
        isOpen: false,
        newStage: '',
        requiredFields: [],
        missingFields: []
    });

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        if (isOpen && activity) {
            let defaultStatus = '';
            if (activity.type === 'Call')                              defaultStatus = 'Answered / Connected';
            else if (['Meeting', 'Site Visit'].includes(activity.type)) defaultStatus = 'Conducted';

            setFormData({
                outcomeStatus: defaultStatus,
                completionResult: '',
                clientFeedback: '',
                completionDate: new Date().toISOString().split('T')[0],
                completionTime: new Date().toTimeString().slice(0, 5),
            });
        }
    }, [isOpen, activity]);

    if (!isOpen || !activity) return null;

    const getStatusOptions = () => {
        if (activity.type === 'Call')       return ['Answered / Connected', 'No Answer', 'Busy', 'Wrong Number', 'Left Voicemail'];
        if (activity.type === 'Meeting')    return ['Conducted', 'Rescheduled', 'Cancelled', 'No Show'];
        if (activity.type === 'Site Visit') return ['Conducted', 'Rescheduled', 'Cancelled', 'Did Not Visit'];
        return ['Completed', 'Cancelled'];
    };

    const getDynamicResults = () => {
        if (!activityMasterFields?.activities) return [];
        const actType = (activity.type || '').toLowerCase();
        const typeSettings = activityMasterFields.activities.find(a => (a.name || '').toLowerCase() === actType);
        if (!typeSettings) return [];
        const purposeSearch = (activity.details?.purpose || activity.subject || '').toLowerCase();
        const purposeObj = typeSettings.purposes?.find(p => {
            const pName = (p.name || '').toLowerCase();
            return pName && (purposeSearch.includes(pName) || pName.includes(purposeSearch));
        });
        return purposeObj?.outcomes || [];
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        if (!formData.outcomeStatus) return alert('Please select an outcome status');

        setSaving(true);
        try {
            const outcome = formData.completionResult || formData.outcomeStatus;

            // ── Unified Backend Pipeline: POST /api/activities/:id/complete ──────────
            // This single endpoint:
            //   1. Marks activity as Completed
            //   2. Runs StageTransitionEngine → evaluates stage change rule
            //   3. If required fields missing → returns { requiresForm: true, missingFields }
            //   4. If all clear → executes stage change + runs LeadScoringService
            const data = await activitiesAPI.complete(activity._id, {
                outcome,
                outcomeReason: formData.clientFeedback || '',
                stageFormData: {},
                completionNotes: formData.clientFeedback
            });

            // If backend needs required fields → open StageTransitionModal
            if (data.requiresForm) {
                setSaving(false);
                setStageModal({
                    isOpen: true,
                    newStage: data.newStage,
                    requiredFields: data.requiredFields,
                    missingFields: data.missingFields,
                    outcome,
                    outcomeReason: formData.clientFeedback || ''
                });
                return; // Don't close yet — wait for Phase 2
            }

            // Stage changed (or no change needed) — show result
            if (data.stageChanged) {
                showToast(`✅ Stage → ${data.newStage} | Score: ${data.score ?? '—'}`);
            } else if (data.skippedStage) {
                showToast(`ℹ️ Activity completed. No stage change needed.`);
            }

            // Dispatch global event for list refresh
            window.dispatchEvent(new CustomEvent('activity-completed', {
                detail: {
                    activityType: activity.type,
                    entityId: activity.entityId,
                    stageChanged: data.stageChanged,
                    newStage: data.newStage,
                    score: data.score
                }
            }));

            if (onClose) onClose();
        } catch (error) {
            console.error('[ActivityOutcomeModal] Complete failed:', error);
            // Fallback: update activity via old method if new API unavailable
            try {
                await updateActivity(activity._id, {
                    status: 'Completed',
                    completedAt: new Date(`${formData.completionDate}T${formData.completionTime}`),
                    completionResult: formData.completionResult || formData.outcomeStatus,
                    details: {
                        ...activity.details,
                        meetingOutcomeStatus: formData.outcomeStatus,
                        completionResult: formData.completionResult,
                        clientFeedback: formData.clientFeedback
                    }
                });
                window.dispatchEvent(new CustomEvent('activity-completed', { detail: { activityType: activity.type } }));
                if (onClose) onClose();
            } catch (fallbackErr) {
                alert('Failed to save outcome. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleStageTransitionSuccess = (result) => {
        if (result.stageChanged) {
            showToast(`✅ Stage → ${result.newStage} | Score: ${result.score ?? '—'}`);
        }
        window.dispatchEvent(new CustomEvent('activity-completed', {
            detail: { activityType: activity.type, entityId: activity.entityId, stageChanged: result.stageChanged, newStage: result.newStage }
        }));
        if (onClose) onClose();
    };

    const results = getDynamicResults();
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' };
    const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' };

    return (
        <>
            {/* Toast notification */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
                    background: '#0f172a', color: '#fff', padding: '12px 20px',
                    borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <i className='fas fa-robot' style={{ color: '#10b981' }}></i>
                    {toast.msg}
                </div>
            )}

            {/* Activity Outcome Form Modal */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }} onClick={onClose}>
                <div style={{
                    backgroundColor: '#fff', borderRadius: '16px', width: '500px', maxWidth: '95vw',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                }} onClick={e => e.stopPropagation()}>

                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Log Activity Outcome</h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <i className='fas fa-times'></i>
                        </button>
                    </div>

                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>
                                {activity.type}: {activity.subject}
                            </p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#15803d' }}>
                                Related: {activity.relatedTo?.[0]?.name || 'General'}
                            </p>
                        </div>

                        <div>
                            <label style={labelStyle}>Outcome Status</label>
                            <select name='outcomeStatus' value={formData.outcomeStatus} onChange={handleChange} style={inputStyle}>
                                <option value=''>Select Status</option>
                                {getStatusOptions().map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {results.length > 0 && (
                            <div>
                                <label style={labelStyle}>Result / Detail</label>
                                <select name='completionResult' value={formData.completionResult} onChange={handleChange} style={inputStyle}>
                                    <option value=''>Select Result</option>
                                    {results.map(r => <option key={r.label} value={r.label}>{r.label}{r.score ? ` (+${r.score} pts)` : ''}</option>)}
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Completion Date</label>
                                <input type='date' name='completionDate' value={formData.completionDate} onChange={handleChange} style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Completion Time</label>
                                <input type='time' name='completionTime' value={formData.completionTime} onChange={handleChange} style={inputStyle} />
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>Feedback / Notes</label>
                            <textarea
                                name='clientFeedback'
                                value={formData.clientFeedback}
                                onChange={handleChange}
                                style={{ ...inputStyle, height: '80px', resize: 'none' }}
                                placeholder='Add any internal remarks or client feedback...'
                            />
                        </div>

                        <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '10px 14px', border: '1px solid #bae6fd', fontSize: '0.8rem', color: '#0369a1' }}>
                            <i className='fas fa-magic' style={{ marginRight: 6 }}></i>
                            <strong>Auto-Stage Engine Active:</strong> Based on outcome, the lead stage may update automatically. Required fields will be requested if needed.
                        </div>
                    </div>

                    <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                        <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                        >
                            {saving ? 'Processing...' : 'Complete Activity'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Phase 2: Stage Transition Modal (shows when required fields are missing) */}
            <StageTransitionModal
                isOpen={stageModal.isOpen}
                onClose={() => setStageModal(s => ({ ...s, isOpen: false }))}
                activityId={activity._id}
                outcome={stageModal.outcome}
                outcomeReason={stageModal.outcomeReason}
                newStage={stageModal.newStage}
                requiredFields={stageModal.requiredFields}
                missingFields={stageModal.missingFields}
                onSuccess={handleStageTransitionSuccess}
            />
        </>
    );
};

export default ActivityOutcomeModal;
