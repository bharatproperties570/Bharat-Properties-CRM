import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useActivityForm } from '../hooks/useActivityForm';

// Common UI
import { ModalOverlay, FormLabel } from './Activities/ActivityCommon';

// Modular Sections
import ActivityTypeTabs from './Activities/ActivityTypeTabs';
import ActivityRelatedTo from './Activities/ActivityRelatedTo';
import ActivityBasicFields from './Activities/ActivityBasicFields';
import ActivityStatusToggle from './Activities/ActivityStatusToggle';

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
        handleSubmit
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

    const modalStyle = {
        backgroundColor: '#fff',
        borderRadius: '20px',
        width: isCompleted ? '1100px' : '700px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 1001
    };

    const headerStyle = {
        padding: '24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #ffffff, #f8fafc)'
    };

    const bodyStyle = {
        padding: '24px',
        overflowY: 'auto',
        flex: 1,
        display: 'flex',
        flexDirection: isCompleted ? 'row' : 'column',
        gap: '24px'
    };

    const footerStyle = {
        padding: '20px 24px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        background: '#f8fafc'
    };

    const renderActivitySection = () => {
        const props = { formData, handleChange, errors, activityMasterFields };
        switch (formData.activityType) {
            case 'Call': return <CallActivitySection {...props} />;
            case 'Meeting': return <MeetingActivitySection {...props} />;
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

    return (
        <ModalOverlay isOpen={isOpen}>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                            {initialData?.id ? 'Edit Activity' : 'Create New Activity'}
                        </h2>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, margin: '4px 0 0 0' }}>
                            Log engagements and schedule follow-ups
                        </p>
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

                <div style={bodyStyle}>
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
                        />

                        {!isCompleted && renderActivitySection()}

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
                             {renderActivitySection()}
                             
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
                </div>

                {!isCompleted && (
                    <div style={{ padding: '0 24px 20px 24px' }}>
                        <ActivityStatusToggle status={formData.status} onStatusChange={(status) => handleChange({ target: { name: 'status', value: status } })} />
                    </div>
                )}

                <div style={footerStyle}>
                    <button 
                        onClick={onClose} 
                        style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(to right, #3b82f6, #2563eb)', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)' }}
                    >
                        Save Activity
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export default CreateActivityModal;
