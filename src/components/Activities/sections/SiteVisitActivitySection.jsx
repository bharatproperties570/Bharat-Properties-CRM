import { useTheme } from '../../../context/ThemeContext';
import { FormLabel, FormSelect, ActivityCard, SectionTitle } from '../ActivityCommon';

const SiteVisitActivitySection = ({ 
    formData, 
    handleChange, 
    errors, 
    activityMasterFields,
    projects,
    rowUnits,
    fetchUnits,
    updatePropertyRow,
    addPropertyRow,
    removePropertyRow,
    view = 'full' // 'selection', 'results', or 'full'
}) => {
    const { isDark } = useTheme();
    const isCompleted = formData.status === 'Completed';
    const visitAct = activityMasterFields?.activities?.find(a => a.name === 'Site Visit');
    const purpose = visitAct?.purposes?.find(p => p.name === formData.purpose);

    if (view === 'results' && !isCompleted) return null;

    // --- RESULTS VIEW RENDERING (Right Side) ---
    if (view === 'results') {
        return (
            <ActivityCard background="#f0fdf4" borderColor="#bcf0da" style={{ marginBottom: '16px' }}>
                <SectionTitle icon="fas fa-check-circle" color="#047857">Completion Details</SectionTitle>
                
                {/* 1. Overall Status first */}
                <div style={{ marginBottom: '16px' }}>
                    <FormLabel required>General Status</FormLabel>
                    <FormSelect 
                        name="meetingOutcomeStatus" 
                        value={formData.meetingOutcomeStatus} 
                        onChange={handleChange} 
                        hasError={errors.meetingOutcomeStatus}
                    >
                        <option value="">Select Status</option>
                        <option value="Conducted">Conducted</option>
                        <option value="Rescheduled">Rescheduled</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Did Not Visit">Did Not Visit</option>
                    </FormSelect>
                </div>

                {/* 2. Cancellation Reason if needed */}
                {(formData.meetingOutcomeStatus === 'Cancelled' || formData.meetingOutcomeStatus === 'Did Not Visit') && (
                    <div style={{ marginBottom: '16px' }}>
                        <FormLabel required>Reason</FormLabel>
                        <textarea
                            name="cancellationReason"
                            value={formData.cancellationReason}
                            onChange={handleChange}
                            placeholder="Why was this visit cancelled?"
                            style={{
                                width: '100%', padding: '10px', borderRadius: '10px', border: `1px solid ${errors.cancellationReason ? '#ef4444' : '#e2e8f0'}`,
                                fontSize: '0.9rem', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', minHeight: '80px', outline: 'none'
                            }}
                        />
                    </div>
                )}

                {/* 3. Per-Property Results - ONLY if Conducted */}
                {formData.meetingOutcomeStatus === 'Conducted' && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid #bcf0da', paddingTop: '16px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#047857', marginBottom: '12px', textTransform: 'uppercase' }}>
                            Property Outcomes
                        </div>
                        {formData.visitedProperties.map((row, index) => (
                            <div key={index} style={{
                                display: 'flex',
                                gap: '12px',
                                marginBottom: '12px',
                                padding: '12px',
                                background: 'rgba(255, 255, 255, 0.8)',
                                borderRadius: '10px',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                alignItems: 'center'
                            }}>
                                <div style={{ flex: 1.5 }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>PROPERTY</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                                        {row.project || 'No Project'} - {row.property || 'No Unit'}
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormLabel style={{ fontSize: '0.7rem' }} required>Result</FormLabel>
                                    <FormSelect
                                        value={row.result}
                                        hasError={errors[`prop_${index}_result`]}
                                        onChange={(e) => updatePropertyRow(index, { result: e.target.value })}
                                    >
                                        <option value="">Select Result</option>
                                        {(purpose?.outcomes || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                                    </FormSelect>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ActivityCard>
        );
    }

    // --- SELECTION VIEW RENDERING (Left Side) ---
    return (
        <ActivityCard background="#ecfdf5" borderColor="#a7f3d0" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <SectionTitle icon="fas fa-map-marked-alt" color="#047857">Site Visit Properties</SectionTitle>
                <button
                    onClick={addPropertyRow}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <i className="fas fa-plus"></i> Add Property
                </button>
            </div>

            {formData.visitedProperties.map((row, index) => {
                const selectedProject = projects.find(p => p.name === row.project || p._id === row.project);
                const blocks = selectedProject?.blocks || [];
                const units = rowUnits[index] || [];

                return (
                    <div key={index} style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: '12px',
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.6)',
                        borderRadius: '10px',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        alignItems: 'flex-end'
                    }}>
                        <div style={{ flex: 1.5 }}>
                            <FormLabel style={{ fontSize: '0.7rem' }} required={index === 0}>Project</FormLabel>
                            <FormSelect
                                value={row.project}
                                hasError={errors[`prop_${index}_project`]}
                                onChange={(e) => {
                                    const projName = e.target.value;
                                    updatePropertyRow(index, { project: projName, block: '', property: '' });
                                    if (projName) fetchUnits(index, projName, '');
                                }}
                            >
                                <option value="">Select Project</option>
                                {projects.map(p => <option key={p._id} value={p.name}>{p.name}</option>)}
                            </FormSelect>
                        </div>
                        <div style={{ flex: 1 }}>
                            <FormLabel style={{ fontSize: '0.7rem' }}>Block</FormLabel>
                            <FormSelect
                                value={row.block}
                                disabled={!row.project}
                                onChange={(e) => {
                                    const blockName = e.target.value;
                                    updatePropertyRow(index, { block: blockName, property: '' });
                                    if (selectedProject) fetchUnits(index, selectedProject.name, blockName);
                                }}
                            >
                                <option value="">Block</option>
                                {blocks.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                            </FormSelect>
                        </div>
                        <div style={{ flex: 1 }}>
                            <FormLabel style={{ fontSize: '0.7rem' }}>Unit</FormLabel>
                            <FormSelect
                                value={row.property}
                                disabled={!row.project}
                                onChange={(e) => updatePropertyRow(index, { property: e.target.value })}
                            >
                                <option value="">Unit</option>
                                {units.map(u => (
                                    <option key={u._id} value={u.unitNo || u.unitNumber}>
                                        {u.unitNo || u.unitNumber}
                                    </option>
                                ))}
                            </FormSelect>
                        </div>
                        {formData.visitedProperties.length > 1 && (
                            <button
                                onClick={() => removePropertyRow(index)}
                                style={{
                                    padding: '10px',
                                    color: '#ef4444',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        )}
                    </div>
                );
            })}

            <div style={{ marginTop: '16px' }}>
                <FormLabel>Confirmation</FormLabel>
                <FormSelect name="visitConfirmation" value={formData.visitConfirmation} onChange={handleChange}>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Tentative">Tentative</option>
                </FormSelect>
            </div>
        </ActivityCard>
    );
};

export default SiteVisitActivitySection;
