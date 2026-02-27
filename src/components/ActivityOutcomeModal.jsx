import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useActivities } from '../context/ActivityContext';
import { useStageEngine } from '../hooks/useStageEngine';

const ActivityOutcomeModal = ({ isOpen, onClose, activity }) => {
    const { activityMasterFields } = usePropertyConfig();
    const { updateActivity } = useActivities();
    const { triggerStageUpdate, syncDealStage } = useStageEngine();
    const [stageToast, setStageToast] = useState(null);

    const showStageToast = (msg) => {
        setStageToast(msg);
        setTimeout(() => setStageToast(null), 4000);
    };

    const [formData, setFormData] = useState({
        outcomeStatus: '',
        completionResult: '',
        clientFeedback: '',
        completionDate: new Date().toISOString().split('T')[0],
        completionTime: new Date().toTimeString().slice(0, 5),
    });

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen && activity) {
            // Default statuses
            let defaultStatus = '';
            if (activity.type === 'Call') defaultStatus = 'Answered / Connected';
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
        if (activity.type === "Call")
            return ["Answered / Connected", "No Answer", "Busy", "Wrong Number", "Left Voicemail"];
        if (activity.type === "Meeting")
            return ["Conducted", "Rescheduled", "Cancelled", "No Show"];
        if (activity.type === "Site Visit")
            return ["Conducted", "Rescheduled", "Cancelled", "Did Not Visit"];
        return ["Completed", "Cancelled"];
    };

    const getDynamicResults = () => {
        const typeSettings = activityMasterFields?.activities?.find(a => a.name === activity.type);
        const purposeName = activity.details?.purpose || activity.subject;
        const purposeObj = typeSettings?.purposes?.find(p => p.name === purposeName);

        if (purposeObj?.outcomes) return purposeObj.outcomes;
        return [];
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        if (!formData.outcomeStatus) return alert('Please select an outcome status');

        setSaving(true);
        try {
            const payload = {
                status: 'Completed',
                completedAt: new Date(`${formData.completionDate}T${formData.completionTime}`),
                details: {
                    ...activity.details,
                    meetingOutcomeStatus: formData.outcomeStatus,
                    completionResult: formData.completionResult,
                    clientFeedback: formData.clientFeedback,
                    completionDate: formData.completionDate,
                    completionTime: formData.completionTime
                }
            };
            await updateActivity(activity._id, payload);

            // ── STAGE ENGINE INTEGRATION ──────────────────────────────────────
            const relations = activity.relatedTo || [];
            const leadRelation = relations.find(r => (r.model || r.type || '').toLowerCase() === 'lead');
            const dealRelation = relations.find(r => (r.model || r.type || '').toLowerCase() === 'deal');

            if (leadRelation?.id) {
                // Activity on a Lead → recompute lead stage
                const purpose = activity.details?.purpose || '';
                const outcome = formData.outcomeStatus || formData.completionResult || '';
                const result = await triggerStageUpdate(leadRelation.id, activity.type, purpose, outcome);
                if (result.stage) showStageToast(`✅ Lead stage → ${result.stage}`);

                // Cascade: if this lead belongs to a deal, sync deal stage too
                if (dealRelation?.id) {
                    syncDealStage(
                        dealRelation.id,
                        [result.stage].filter(Boolean)
                    ).then(r => {
                        if (r.changed) showStageToast(`🔄 Deal stage → ${r.stage}`);
                    }).catch(err => console.warn('[StageEngine] deal cascade from modal:', err));
                }
            } else if (dealRelation?.id && !leadRelation) {
                // Activity directly on a Deal (no lead involved) → sync deal stage
                // We don't have lead stages here, so fetch them from the deal response if available
                const entityId = activity.entityId || dealRelation.id;
                // Sync deal using single outcome signal (null lead stages means syncEngine handles conflict resolution)
                syncDealStage(entityId, []).then(r => {
                    if (r.changed) showStageToast(`🔄 Deal stage → ${r.stage}`);
                }).catch(err => console.warn('[StageEngine] direct deal sync from modal:', err));
            }
            // ───────────────────────────────────────────────────────────────────────────
            
            // Dispatch global event for list views to refresh
            window.dispatchEvent(new CustomEvent('activity-completed', { 
                detail: { 
                    activityType: activity.type, 
                    entityId: activity.entityId || leadRelation?.id || dealRelation?.id,
                    entityType: leadRelation ? 'lead' : (dealRelation ? 'deal' : 'general')
                } 
            }));

            if (onClose) onClose();
        } catch (error) {
            console.error('Failed to update activity outcome:', error);
            alert('Failed to save outcome');
        } finally {
            setSaving(false);
        }
    };

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };

    const modalStyle = {
        backgroundColor: '#fff', borderRadius: '16px', width: '500px', maxWidth: '95vw',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
    };

    const headerStyle = {
        padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
    };

    const bodyStyle = { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' };

    const footerStyle = {
        padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex',
        justifyContent: 'flex-end', gap: '12px', background: '#f8fafc'
    };

    const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' };
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' };

    const results = getDynamicResults();

    return (
        <>
            {stageToast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
                    background: '#0f172a', color: '#fff', padding: '12px 20px',
                    borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex',
                    alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s ease'
                }}>
                    <i className="fas fa-robot" style={{ color: '#10b981' }}></i>
                    {stageToast}
                </div>
            )}
            <div style={overlayStyle} onClick={onClose}>
                <div style={modalStyle} onClick={e => e.stopPropagation()}>
                    <div style={headerStyle}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Log Activity Outcome</h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div style={bodyStyle}>
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
                            <select name="outcomeStatus" value={formData.outcomeStatus} onChange={handleChange} style={inputStyle}>
                                <option value="">Select Status</option>
                                {getStatusOptions().map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {results.length > 0 && (
                            <div>
                                <label style={labelStyle}>Result / Detail</label>
                                <select name="completionResult" value={formData.completionResult} onChange={handleChange} style={inputStyle}>
                                    <option value="">Select Result</option>
                                    {results.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Completion Date</label>
                                <input type="date" name="completionDate" value={formData.completionDate} onChange={handleChange} style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Completion Time</label>
                                <input type="time" name="completionTime" value={formData.completionTime} onChange={handleChange} style={inputStyle} />
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>Feedback / Notes</label>
                            <textarea
                                name="clientFeedback"
                                value={formData.clientFeedback}
                                onChange={handleChange}
                                style={{ ...inputStyle, height: '80px', resize: 'none' }}
                                placeholder="Add any internal remarks or client feedback..."
                            />
                        </div>
                    </div>

                    <div style={footerStyle}>
                        <button className="btn-outline" onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px' }}>Cancel</button>
                        <button className="btn-primary" onClick={handleSubmit} disabled={saving} style={{ padding: '8px 24px', borderRadius: '8px' }}>
                            {saving ? 'Saving...' : 'Complete Activity'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ActivityOutcomeModal;
