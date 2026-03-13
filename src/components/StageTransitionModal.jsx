import React, { useState } from 'react';

/**
 * StageTransitionModal
 *
 * Shown when the backend responds with { requiresForm: true, missingFields: [...] }
 * after a POST /api/activities/:id/complete.
 *
 * User fills only the missing required fields, then we POST to
 * /api/activities/:id/complete-with-form with the merged stageFormData.
 *
 * Props:
 *   isOpen          {boolean}
 *   onClose         {() => void}
 *   activityId      {string}
 *   outcome         {string}
 *   outcomeReason   {string}
 *   newStage        {string}   - The target stage name (for display)
 *   requiredFields  {string[]} - All required fields for the rule
 *   missingFields   {string[]} - Fields that are actually missing
 *   onSuccess       {(result) => void} - Called on successful stage transition
 */
const StageTransitionModal = ({
    isOpen,
    onClose,
    activityId,
    outcome,
    outcomeReason,
    newStage,
    requiredFields = [],
    missingFields = [],
    onSuccess
}) => {
    const [formData, setFormData] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const FIELD_LABELS = {
        budget:       'Budget',
        budgetMin:    'Min Budget (₹)',
        budgetMax:    'Max Budget (₹)',
        location:     'Location',
        locCity:      'City',
        locArea:      'Area / Sector',
        timeline:     'Timeline',
        propertyType: 'Property Type',
        requirement:  'Requirement / BHK',
        subRequirement: 'Sub-Requirement',
        notes:        'Remarks / Notes',
        description:  'Description'
    };

    const FIELD_TYPES = {
        budgetMin: 'number', budgetMax: 'number',
        timeline: 'select', propertyType: 'text'
    };

    const TIMELINE_OPTIONS = [
        'Immediate', 'Within 1 Month', '1-3 Months', '3-6 Months', '6-12 Months', '12+ Months'
    ];

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleSubmit = async () => {
        // Validate all missing fields are now filled
        const stillMissing = missingFields.filter(f => !formData[f] || formData[f] === '');
        if (stillMissing.length > 0) {
            setError(`Please fill: ${stillMissing.map(f => FIELD_LABELS[f] || f).join(', ')}`);
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const response = await fetch(`/api/activities/${activityId}/complete-with-form`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    outcome,
                    outcomeReason,
                    stageFormData: formData
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.requiresForm && data.missingFields?.length > 0) {
                    setError(`Still missing: ${data.missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}`);
                    return;
                }
                throw new Error(data.message || 'Failed to complete activity');
            }

            if (onSuccess) onSuccess(data);
            if (onClose) onClose();

            // Dispatch global refresh event
            window.dispatchEvent(new CustomEvent('activity-completed', {
                detail: { stageChanged: data.stageChanged, newStage: data.newStage, score: data.score }
            }));
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const renderField = (field) => {
        const label = FIELD_LABELS[field] || field;
        const type = FIELD_TYPES[field] || 'text';
        const isMissing = missingFields.includes(field);
        const borderColor = isMissing ? '#ef4444' : '#e2e8f0';

        const inputStyle = {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${borderColor}`,
            fontSize: '0.9rem',
            backgroundColor: isMissing ? '#fff5f5' : '#f8fafc',
            outline: 'none',
            boxSizing: 'border-box'
        };

        if (field === 'timeline') {
            return (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: isMissing ? '#ef4444' : '#475569' }}>
                        {label} {isMissing && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>
                    <select value={formData[field] || ''} onChange={e => handleChange(field, e.target.value)} style={inputStyle}>
                        <option value=''>Select Timeline...</option>
                        {TIMELINE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            );
        }

        if (field === 'notes' || field === 'description') {
            return (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>{label}</label>
                    <textarea
                        value={formData[field] || ''}
                        onChange={e => handleChange(field, e.target.value)}
                        style={{ ...inputStyle, height: '72px', resize: 'none' }}
                        placeholder={`Enter ${label.toLowerCase()}...`}
                    />
                </div>
            );
        }

        return (
            <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: isMissing ? '#ef4444' : '#475569' }}>
                    {label} {isMissing && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <input
                    type={type}
                    value={formData[field] || ''}
                    onChange={e => handleChange(field, e.target.value)}
                    placeholder={`Enter ${label.toLowerCase()}...`}
                    style={inputStyle}
                />
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: '#fff', borderRadius: '16px', width: '520px', maxWidth: '95vw',
                boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                            Stage Transition Required
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#bfdbfe' }}>
                            Fill required details to move lead to <strong>{newStage}</strong>
                        </p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', color: '#fff', borderRadius: '8px', padding: '6px 10px' }}>
                        <i className='fas fa-times'></i>
                    </button>
                </div>

                {/* Stage badge */}
                <div style={{ padding: '16px 24px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#3b82f6', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className='fas fa-arrow-right' style={{ color: '#fff', fontSize: '0.85rem' }}></i>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
                            Activity: <span style={{ color: '#dc2626' }}>{outcome}</span>
                            {outcomeReason && <> &nbsp;·&nbsp; {outcomeReason}</>}
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#475569' }}>
                            The following fields are required before this stage can change.
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {requiredFields.map(field => renderField(field))}
                </div>

                {/* Error */}
                {error && (
                    <div style={{ margin: '0 24px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>
                        <i className='fas fa-exclamation-circle' style={{ marginRight: 8 }}></i>{error}
                    </div>
                )}

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                    >
                        Skip Stage Change
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            padding: '9px 24px', borderRadius: '8px', border: 'none',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                            opacity: submitting ? 0.7 : 1
                        }}
                    >
                        {submitting ? 'Saving...' : `Move to ${newStage} →`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StageTransitionModal;
