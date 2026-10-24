import { useTheme } from '../../../context/ThemeContext';
import { FormLabel, FormSelect, ActivityCard, SectionTitle } from '../ActivityCommon';
import toast from 'react-hot-toast';

const JourneyProgressTracker = ({ formData, isDark }) => {
    const journeyUrl = formData.details?.journeyUrl || (formData.details?.journeyToken ? `${window.location.origin}/journey/${formData.details.journeyToken}` : null);
    const visited = Array.isArray(formData.visitedProperties) ? formData.visitedProperties : [];

    const handleCopy = () => {
        if (!journeyUrl) return;
        navigator.clipboard.writeText(journeyUrl);
        toast.success('Client Journey link copied to clipboard!');
    };

    const handleWhatsApp = () => {
        if (!journeyUrl) return;
        const msg = encodeURIComponent(`Hello! Here is your personalized Site Visit Itinerary & Navigation link: ${journeyUrl}`);
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    };

    if (!journeyUrl && visited.length === 0) return null;

    return (
        <div style={{
            marginTop: '16px',
            marginBottom: '16px',
            padding: '16px',
            background: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
            borderRadius: '12px'
        }}>
            {/* Header & Link Share Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-route" style={{ color: '#0284c7', fontSize: '1rem' }}></i>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
                        Client Mobile Journey Tracker
                    </span>
                </div>

                {journeyUrl && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCopy}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(2, 132, 199, 0.3)',
                                background: 'rgba(2, 132, 199, 0.1)',
                                color: '#0284c7',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <i className="far fa-copy"></i> Copy Link
                        </button>
                        <button
                            type="button"
                            onClick={handleWhatsApp}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(37, 211, 102, 0.4)',
                                background: 'rgba(37, 211, 102, 0.12)',
                                color: '#16a34a',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <i className="fab fa-whatsapp"></i> WhatsApp
                        </button>
                    </div>
                )}
            </div>

            {/* Property Status Stepper */}
            {visited.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {visited.map((prop, idx) => {
                        const status = prop.status || 'READY';
                        const isSubmitted = status === 'FEEDBACK_SUBMITTED' || Boolean(prop.clientRating);
                        const isNavigated = status === 'NAVIGATED';
                        const isLocked = status === 'LOCKED';

                        return (
                            <div key={idx} style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: isDark ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #edf2f7',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px'
                            }}>
                                <div style={{ flex: 1.5 }}>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                        STOP {idx + 1}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? '#f8fafc' : '#1e293b' }}>
                                        {prop.project || 'Project'} {prop.property ? `- ${prop.property}` : ''}
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    {isSubmitted && (
                                        <div>
                                            <span style={{
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                color: '#10b981',
                                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                                borderRadius: '6px',
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                fontWeight: 700
                                            }}>
                                                ⭐ {prop.clientRating || 5}/5 Received
                                            </span>
                                            {prop.clientInterest && (
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                    {prop.clientInterest}
                                                </div>
                                            )}
                                            {prop.revisitRequested && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    color: '#f59e0b',
                                                    fontWeight: 600,
                                                    marginLeft: '4px'
                                                }}>
                                                    • Revisit Requested
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {isNavigated && !isSubmitted && (
                                        <span style={{
                                            background: 'rgba(2, 132, 199, 0.1)',
                                            color: '#0284c7',
                                            border: '1px solid rgba(2, 132, 199, 0.3)',
                                            borderRadius: '6px',
                                            padding: '2px 8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>
                                            🧭 Navigating
                                        </span>
                                    )}

                                    {!isSubmitted && !isNavigated && !isLocked && (
                                        <span style={{
                                            background: 'rgba(217, 119, 6, 0.1)',
                                            color: '#d97706',
                                            border: '1px solid rgba(217, 119, 6, 0.3)',
                                            borderRadius: '6px',
                                            padding: '2px 8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>
                                            🟢 Ready to Visit
                                        </span>
                                    )}

                                    {isLocked && (
                                        <span style={{
                                            background: 'rgba(100, 116, 139, 0.1)',
                                            color: '#64748b',
                                            border: '1px solid rgba(100, 116, 139, 0.2)',
                                            borderRadius: '6px',
                                            padding: '2px 8px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>
                                            🔒 Locked
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const SiteVisitActivitySection = ({ 
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
            <>
                <JourneyProgressTracker formData={formData} isDark={isDark} />
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
            </>
        );
    }

    // --- SELECTION VIEW RENDERING (Left Side) ---
    return (
        <>
            <JourneyProgressTracker formData={formData} isDark={isDark} />
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
                const selectedProject = (projects || []).find(p => p.name === row.project || p._id === row.project);
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
            
            {(() => {
                if (!formData.visitedProperties) return null;
                const unitsWithProp = formData.visitedProperties.filter(r => r.property);
                if (unitsWithProp.length === 0) return null;

                if (unitsWithProp.length > 1) {
                    return (
                        <div style={{
                            marginTop: '16px', padding: '12px 16px', background: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.1)',
                            borderRadius: '12px', display: 'flex', alignItems: 'center', border: '1px solid rgba(59, 130, 246, 0.2)'
                        }}>
                            <i className="fas fa-info-circle" style={{ color: '#3b82f6', marginRight: '12px', fontSize: '1.2rem' }}></i>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                                    Multiple Properties Selected
                                </div>
                                <div style={{ fontSize: '0.7rem', color: isDark ? '#bfdbfe' : '#2563eb', marginTop: '4px' }}>
                                    Message will automatically include your Default Office Address.
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#a7f3d0' : '#047857' }}>
                                Send Unit Location in WhatsApp?
                            </div>
                            <div style={{ fontSize: '0.7rem', color: isDark ? '#6ee7b7' : '#059669', marginTop: '4px' }}>
                                {formData.sendUnitLocation !== false 
                                    ? "Message will include the exact Unit address." 
                                    : "Message will include your Default Office Address."}
                            </div>
                        </div>
                        <div
                            onClick={() => handleChange({ target: { name: 'sendUnitLocation', value: formData.sendUnitLocation === false ? true : false } })}
                            style={{
                                width: '40px', height: '22px', 
                                background: formData.sendUnitLocation !== false ? '#10b981' : '#cbd5e1', 
                                borderRadius: '11px', padding: '2px', 
                                cursor: 'pointer', position: 'relative',
                                transition: 'background 0.3s'
                            }}
                        >
                            <div style={{ 
                                width: '18px', height: '18px', 
                                background: '#fff', borderRadius: '50%', 
                                position: 'absolute', 
                                right: formData.sendUnitLocation !== false ? '2px' : 'auto', 
                                left: formData.sendUnitLocation !== false ? 'auto' : '2px', 
                                transition: 'all 0.3s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                            }}></div>
                        </div>
                    </div>
                );
            })()}
        </ActivityCard>
        </>
    );
};

export default SiteVisitActivitySection;
