import { useTheme } from '../../../context/ThemeContext';
import { useEffect, useRef } from 'react';
import { FormLabel, FormSelect, FormInput, ActivityCard, SectionTitle } from '../ActivityCommon';

const MeetingActivitySection = ({ 
    formData, 
    handleChange, 
    errors, 
    activityMasterFields, 
    projects = [],
    rowUnits = {},
    fetchUnits,
    updatePropertyRow,
    addPropertyRow,
    removePropertyRow,
    view = 'full' 
}) => {
    const { isDark } = useTheme();
    const isCompleted = formData.status === 'Completed';
    const meetAct = activityMasterFields?.activities?.find(a => a.name === 'Meeting');
    const purpose = meetAct?.purposes?.find(p => p.name === formData.purpose);
    const locationInputRef = useRef(null);

    useEffect(() => {
        if (formData.activityType === 'Meeting' && formData.meetingType !== 'Virtual' && window.google && locationInputRef.current && view !== 'results') {
            const autocomplete = new window.google.maps.places.Autocomplete(locationInputRef.current, {
                types: ['geocode', 'establishment'],
                componentRestrictions: { country: 'in' },
            });
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                const address = place.formatted_address || place.name;
                handleChange({ target: { name: 'meetingLocation', value: address } });
            });
        }
    }, [formData.activityType, formData.meetingType, handleChange, view]);

    if (view === 'results' && !isCompleted) return null;

    // --- RESULTS VIEW (Right Side) ---
    if (view === 'results') {
        return (
            <ActivityCard background="#fdf4ff" borderColor="#f5d0fe" style={{ marginBottom: '16px' }}>
                <SectionTitle icon="fas fa-check-circle" color="#a21caf">Meeting Outcome</SectionTitle>
                
                <div style={{ marginBottom: '16px' }}>
                    <FormLabel required>Meeting Status</FormLabel>
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
                        <option value="No Show">No Show</option>
                    </FormSelect>
                </div>

                {formData.meetingOutcomeStatus === 'Conducted' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {(!formData.visitedProperties || formData.visitedProperties.length === 0) ? (
                            <>
                                <FormLabel required>Outcome / Result</FormLabel>
                                <FormSelect
                                    name="completionResult"
                                    value={formData.completionResult}
                                    onChange={handleChange}
                                    hasError={errors.completionResult}
                                >
                                    <option value="">Select Outcome</option>
                                    {(purpose?.outcomes || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                                </FormSelect>
                            </>
                        ) : (
                            <div style={{ marginTop: '20px', borderTop: '1px solid #f5d0fe', paddingTop: '16px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#a21caf', marginBottom: '12px', textTransform: 'uppercase' }}>
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
                                        border: '1px solid rgba(162, 28, 175, 0.3)',
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
                    </div>
                )}
            </ActivityCard>
        );
    }

    // --- SELECTION VIEW (Left Side) ---
    return (
        <ActivityCard background="#fdf4ff" borderColor="#f5d0fe" style={{ marginBottom: '16px' }}>
            <SectionTitle icon="fas fa-users" color="#a21caf">Meeting Details</SectionTitle>
            
            <div style={{ marginBottom: '16px' }}>
                <FormLabel>Meeting Location</FormLabel>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {['Office', 'On-Site', 'Virtual', 'Developer Office'].map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: isDark ? 'var(--text-main)' : '#334155' }}>
                            <input
                                type="radio"
                                name="meetingType"
                                value={type}
                                checked={formData.meetingType === type}
                                onChange={(e) => {
                                    handleChange(e);
                                    if (e.target.value === 'Virtual') {
                                        handleChange({ target: { name: 'meetingLocation', value: '' } });
                                    }
                                }}
                                style={{ accentColor: '#a21caf' }}
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <FormLabel required>{formData.meetingType === 'Virtual' ? 'Meeting Link' : 'Location Address'}</FormLabel>
                <FormInput
                    key={formData.meetingType}
                    ref={formData.meetingType !== 'Virtual' ? locationInputRef : null}
                    name="meetingLocation"
                    value={formData.meetingLocation}
                    onChange={handleChange}
                    hasError={errors.meetingLocation}
                    placeholder={formData.meetingType === 'Virtual' ? "Paste Zoom/Meet Link here" : "Search or enter address..."}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', marginBottom: '16px' }}>
                <SectionTitle icon="fas fa-building" color="#a21caf">Target Properties (Optional)</SectionTitle>
                <button
                    onClick={(e) => { e.preventDefault(); addPropertyRow(); }}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#a21caf',
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

            {formData.visitedProperties && formData.visitedProperties.map((row, index) => {
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
                        border: '1px solid rgba(162, 28, 175, 0.2)',
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
                                    if (projName && fetchUnits) fetchUnits(index, projName, '');
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
                                    if (selectedProject && fetchUnits) fetchUnits(index, selectedProject.name, blockName);
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
                        <button
                            onClick={(e) => { e.preventDefault(); removePropertyRow(index); }}
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
                    </div>
                );
            })}
        </ActivityCard>
    );
};

export default MeetingActivitySection;
