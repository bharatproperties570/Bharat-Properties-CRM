import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useActivityForm } from '../hooks/useActivityForm';

// Common UI
import { ModalOverlay, FormLabel } from './Activities/ActivityCommon';

// Modular Sections
import ActivityTypeTabs from './Activities/ActivityTypeTabs';
import ActivityRelatedTo from './Activities/ActivityRelatedTo';
import ActivityBasicFields from './Activities/ActivityBasicFields';
import ActivityStatusToggle from './Activities/ActivityStatusToggle';
import RequiredFormsStep from './Activities/RequiredFormsStep';

// Activity Type Specific Sections
import CallActivitySection from './Activities/sections/CallActivitySection';
import MeetingActivitySection from './Activities/sections/MeetingActivitySection';
import SiteVisitActivitySection from './Activities/sections/SiteVisitActivitySection';
import EmailActivitySection from './Activities/sections/EmailActivitySection';
import TaskActivitySection from './Activities/sections/TaskActivitySection';

const CreateActivityModal = ({ isOpen, onClose, onSave, initialData }) => {
    const { activityMasterFields } = usePropertyConfig();
    const {
        formData,
        setFormData,
        errors,
        projects,
        rowUnits,
        stageToast,
        handleChange,
        fetchUnits,
        updatePropertyRow,
        addPropertyRow,
        removePropertyRow,
        handleSubmit,
        // Multi-step forms flow
        step,
        pendingForms,
        formsData,
        setFormsData,
        handleFormsComplete,
        handleBackToActivity,
    } = useActivityForm(isOpen, onClose, onSave, initialData);

    if (!isOpen) return null;

    const onAddRelation = (item) => {
        setFormData(prev => {
            if (prev.relatedTo.some(r => r.id === item.id)) return prev;
            return { ...prev, relatedTo: [...prev.relatedTo, item] };
        });
    };

    const onRemoveRelation = (id) => {
        setFormData(prev => ({
            ...prev,
            relatedTo: prev.relatedTo.filter(r => r.id !== id)
        }));
    };

    const isCompleted = formData.status === 'Completed';
    const isFormsStep = step === 'forms';

    const modalStyle = {
        backgroundColor: '#fff',
        borderRadius: '20px',
        width: isFormsStep ? '780px' : (isCompleted ? '1100px' : '700px'),
        maxWidth: '95vw',
        maxHeight: '90vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 1001
    };

    const renderActivitySection = (view = 'full') => {
        const props = { formData, handleChange, errors, activityMasterFields, view };
        switch (formData.activityType) {
            case 'Call': return <CallActivitySection {...props} />;
            case 'Meeting': return (
                <MeetingActivitySection 
                    {...props} 
                    projects={projects}
                    rowUnits={rowUnits}
                    fetchUnits={fetchUnits}
                    updatePropertyRow={updatePropertyRow}
                    addPropertyRow={addPropertyRow}
                    removePropertyRow={removePropertyRow}
                />
            );
            case 'Site Visit': return (
                <SiteVisitActivitySection
                    {...props}
                    projects={projects}
                    rowUnits={rowUnits}
                    fetchUnits={fetchUnits}
                    updatePropertyRow={updatePropertyRow}
                    addPropertyRow={addPropertyRow}
                    removePropertyRow={removePropertyRow}
                />
            );
            case 'Email': return <EmailActivitySection {...props} />;
            case 'Task': return <TaskActivitySection {...props} />;
            default: return null;
        }
    };

    const activitySummary = `${formData.activityType}${formData.purpose ? ' — ' + formData.purpose : ''}`;

    return (
        <ModalOverlay isOpen={isOpen}>
            <div style={modalStyle}>

                {/* ── Header ── */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(to right, #ffffff, #f8fafc)', position: 'relative'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        {isFormsStep && (
                            <button onClick={handleBackToActivity} style={{
                                background: '#f1f5f9', border: 'none', borderRadius: '8px',
                                padding: '7px 11px', cursor: 'pointer', color: '#64748b', flexShrink: 0
                            }}>
                                <i className="fas fa-arrow-left" />
                            </button>
                        )}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                                    {isFormsStep ? 'Required Forms' : (initialData?.id ? 'Edit Activity' : 'Create New Activity')}
                                </h2>
                                {/* Step Indicators */}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[{ label: '1 Activity', active: !isFormsStep }, { label: '2 Required Forms', active: isFormsStep }].map(s => (
                                        <span key={s.label} style={{
                                            fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                                            background: s.active ? '#6366f1' : '#e5e7eb',
                                            color: s.active ? '#fff' : '#94a3b8',
                                            transition: 'all 0.2s'
                                        }}>{s.label}</span>
                                    ))}
                                </div>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, margin: '4px 0 0 0' }}>
                                {isFormsStep
                                    ? `Fill required forms for: ${activitySummary}`
                                    : 'Log engagements and schedule follow-ups'
                                }
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>
                        <i className="fas fa-times"></i>
                    </button>

                    {stageToast && (
                        <div style={{
                            position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
                            backgroundColor: '#10b981', color: '#fff', padding: '10px 20px', borderRadius: '30px',
                            fontSize: '0.85rem', fontWeight: 700, boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)',
                            zIndex: 10, animation: 'slideDown 0.3s ease-out'
                        }}>
                            {stageToast}
                        </div>
                    )}
                </div>

                {/* ── Body ── */}
                <div style={{
                    padding: '24px', overflowY: 'auto', flex: 1,
                    display: 'flex',
                    flexDirection: isCompleted && !isFormsStep ? 'row' : 'column',
                    gap: '24px'
                }}>
                    {isFormsStep ? (
                        <RequiredFormsStep
                            pendingForms={pendingForms}
                            formsData={formsData}
                            onFormsChange={setFormsData}
                            activitySummary={activitySummary}
                        />
                    ) : (
                        <>
                            <div style={{ flex: 1.2 }}>
                                <ActivityTypeTabs
                                    activeType={formData.activityType}
                                    onTypeChange={(type) => handleChange({ target: { name: 'activityType', value: type } })}
                                />
                                <ActivityRelatedTo
                                    relatedTo={formData.relatedTo}
                                    participants={formData.participants}
                                    onAddRelation={onAddRelation}
                                    onRemoveRelation={onRemoveRelation}
                                />
                                <ActivityBasicFields
                                    formData={formData}
                                    handleChange={handleChange}
                                    errors={errors}
                                    activityMasterFields={activityMasterFields}
                                />
                                {(['Site Visit', 'Meeting'].includes(formData.activityType)) ? renderActivitySection('selection') : (!isCompleted && renderActivitySection())}
                                <div style={{ marginTop: '20px' }}>
                                    <FormLabel>Description / Notes</FormLabel>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        rows="3"
                                        placeholder="Enter details..."
                                        style={{
                                            width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                            fontSize: '0.9rem', backgroundColor: '#f8fafc', resize: 'vertical', outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {isCompleted && (
                                <div style={{ flex: 1, borderLeft: '1px solid #f1f5f9', paddingLeft: '24px' }}>
                                    <ActivityStatusToggle status={formData.status} onStatusChange={(status) => handleChange({ target: { name: 'status', value: status } })} />
                                    {(['Site Visit', 'Meeting'].includes(formData.activityType)) ? renderActivitySection('results') : renderActivitySection()}
                                    <div style={{ marginTop: '20px' }}>
                                        <FormLabel>Completion Feedback</FormLabel>
                                        <textarea
                                            name="clientFeedback"
                                            value={formData.clientFeedback}
                                            onChange={handleChange}
                                            rows="4"
                                            placeholder="Summarize the client reaction and next steps..."
                                            style={{
                                                width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                                fontSize: '0.9rem', backgroundColor: '#f8fafc', resize: 'vertical', outline: 'none', minHeight: '120px'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!isCompleted && !isFormsStep && (
                    <div style={{ padding: '0 24px 20px 24px' }}>
                        <ActivityStatusToggle status={formData.status} onStatusChange={(status) => handleChange({ target: { name: 'status', value: status } })} />
                    </div>
                )}

                {/* ── Footer ── */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#f8fafc'
                }}>
                    <div>
                        {isFormsStep && (
                            <button
                                onClick={() => handleFormsComplete(formsData, true)}
                                style={{
                                    padding: '9px 18px', borderRadius: '10px',
                                    border: '1px solid #fcd34d', background: '#fffbeb',
                                    color: '#92400e', fontWeight: 700, cursor: 'pointer',
                                    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <i className="fas fa-forward" /> Save Without Forms
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={onClose}
                            style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        {isFormsStep ? (
                            <button
                                onClick={() => handleFormsComplete(formsData, false)}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(to right, #10b981, #059669)',
                                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <i className="fas fa-check-circle" /> Complete & Save
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(to right, #3b82f6, #2563eb)',
                                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)'
                                }}
                            >
                                Save Activity
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </ModalOverlay>
    );
};

export default CreateActivityModal;
