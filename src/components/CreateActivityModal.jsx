import React, { useState, useEffect, useRef } from 'react';
import { contactData } from '../data/mockData';
import { PROJECT_DATA } from '../data/projectData';

const CreateActivityModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState({
        activityType: 'Call',
        subject: '',
        relatedTo: [], // Array of selected items {id, name}
        participants: [], // Array of selected participants {name, mobile}
        dueDate: '',
        dueTime: '',
        priority: 'Normal',
        status: 'Not Started', // Not Started, In Progress, Completed, Deferred
        description: '',
        work: '',

        // Dynamic Fields
        callPurpose: 'Prospecting',
        emailPurpose: 'Follow-up', // New field for Email
        duration: '', // in minutes
        callOutcome: '',

        meetingType: 'Office', // Office, On-Site, Virtual, Developer Office
        meetingLocation: '', // Link or Address
        agenda: '',
        clientFeedback: '',

        visitType: 'Site Visit',
        visitConfirmation: 'Tentative',

        reminder: false,
        reminderTime: '',

        // Completion Fields
        direction: 'Outgoing Call',
        completionResult: '',
        completionDate: '',
        completionTime: '',
        completionDuration: '',
        meetingOutcomeStatus: '',

        // Site Visit Specifics
        visitedProperties: [{ project: '', block: '', property: '', result: '', feedback: '' }], // Multi-property support
        selectedPropertyNo: '',
        cancellationReason: ''
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isOpen) {
            // Reset form on open
            setFormData({
                activityType: 'Call',
                subject: '',
                relatedTo: initialData?.relatedTo || [],
                participants: [],
                dueDate: new Date().toISOString().slice(0, 16),
                dueTime: '10:00',
                priority: 'Normal',
                description: '', // Remark
                work: '',
                status: 'Not Started',

                callPurpose: 'Prospecting',
                emailPurpose: 'Follow-up',
                duration: '15',
                callOutcome: '',

                meetingType: 'Office',
                meetingLocation: '',
                agenda: '',
                clientFeedback: '',

                visitType: 'Site Visit',
                visitConfirmation: 'Tentative',

                reminder: false,
                reminderTime: '',

                direction: 'Outgoing Call',
                completionResult: '',
                completionDate: new Date().toISOString().split('T')[0],
                completionTime: new Date().toTimeString().slice(0, 5),
                completionDuration: '',
                meetingOutcomeStatus: '',
                visitedProperties: [{ project: '', block: '', property: '', result: '', feedback: '' }],
                selectedPropertyNo: '',
                cancellationReason: ''
            });
            setErrors({});
        }
    }, [isOpen, initialData]);

    // Auto-generate Subject
    useEffect(() => {
        if (!isOpen) return;

        let newSubject = '';
        const related = formData.relatedTo.length > 0
            ? formData.relatedTo.map(r => r.name).join(', ')
            : 'Client';

        let dateStr = '';
        if (formData.dueDate) {
            const [year, month, day] = formData.dueDate.split('-');
            dateStr = `${day}/${month}/${year}`;
        }
        const timeStr = formData.dueTime ? ` at ${formData.dueTime}` : '';

        if (formData.activityType === 'Call') {
            const purpose = formData.callPurpose || 'Call';
            // Format: [Purpose] with [Related] on [DD/MM/YYYY] at [Time]
            newSubject = `${purpose} with ${related} on ${dateStr}${timeStr}`;
        } else if (formData.activityType === 'Site Visit') {
            const props = formData.visitedProperties.map(p => p.project || 'Property').join(', ');
            const vType = formData.visitType || 'Visit';
            newSubject = `${vType} at ${props} with ${related} on ${dateStr}${timeStr}`;
        }

        if (newSubject) {
            setFormData(prev => ({ ...prev, subject: newSubject }));
        }
    }, [
        isOpen,
        formData.activityType,
        formData.callPurpose,
        formData.agenda,
        formData.meetingLocation,
        formData.meetingType,
        formData.relatedTo,
        formData.dueDate,
        formData.visitedProperties
    ]);

    const locationInputRef = useRef(null);
    const autocompleteRef = useRef(null);

    // Initialize Google Places Autocomplete
    useEffect(() => {
        if (isOpen && formData.activityType === 'Meeting' && formData.meetingType !== 'Virtual' && window.google && window.google.maps) {
            // Wait for ref to be available
            if (locationInputRef.current) {
                autocompleteRef.current = new window.google.maps.places.Autocomplete(locationInputRef.current, {
                    types: ['geocode', 'establishment'],
                    componentRestrictions: { country: 'in' }, // Restricted to India as per context (Bharat Properties)
                });

                autocompleteRef.current.addListener('place_changed', () => {
                    const place = autocompleteRef.current.getPlace();
                    if (place.formatted_address) {
                        setFormData(prev => ({ ...prev, meetingLocation: place.formatted_address }));
                    } else if (place.name) {
                        setFormData(prev => ({ ...prev, meetingLocation: place.name }));
                    }
                });
            }
        }
    }, [isOpen, formData.activityType, formData.meetingType]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.subject) newErrors.subject = 'Subject is required';
        if (!formData.dueDate) newErrors.dueDate = 'Date is required';

        // Dynamic Validation
        if (formData.activityType === 'Meeting' && !formData.meetingLocation) {
            newErrors.meetingLocation = formData.meetingType === 'Virtual' ? 'Meeting Link is required' : 'Location is required';
        }
        if (formData.status === 'Completed' && formData.activityType === 'Call') {
            if (!formData.callOutcome) newErrors.callOutcome = 'Outcome is required';
            if (formData.callOutcome === 'Connected' && !formData.completionResult) {
                newErrors.completionResult = 'Result is required';
            }
        }
        if (formData.status === 'Completed' && formData.activityType === 'Meeting') {
            if (!formData.meetingOutcomeStatus) newErrors.meetingOutcomeStatus = 'Status is required';
            if (!formData.completionResult) newErrors.completionResult = 'Result is required';
        }

        if (formData.activityType === 'Site Visit') {
            if (!formData.visitType) newErrors.visitType = 'Visit Type is required';
            if (!formData.visitConfirmation) newErrors.visitConfirmation = 'Confirmation is required';

            if (formData.status === 'Completed') {
                if (!formData.meetingOutcomeStatus) {
                    newErrors.meetingOutcomeStatus = 'Status is required';
                } else if (formData.meetingOutcomeStatus === 'Conducted') {
                    if (!formData.selectedPropertyNo) newErrors.selectedPropertyNo = 'Property Number is required';
                    // Per-property validation
                    formData.visitedProperties.forEach((item, index) => {
                        if (!item.result) newErrors[`prop_${index}_result`] = 'Result is required';
                    });
                } else if (formData.meetingOutcomeStatus === 'Rescheduled' || formData.meetingOutcomeStatus === 'Postponed') {
                    if (!formData.completionDate) newErrors.completionDate = 'Date is required';
                    if (!formData.completionTime) newErrors.completionTime = 'Time is required';
                } else if (formData.meetingOutcomeStatus === 'Cancelled' || formData.meetingOutcomeStatus === 'Did Not Visit') {
                    if (!formData.cancellationReason) newErrors.cancellationReason = 'Reason is required';
                }
            }

            formData.visitedProperties.forEach((item, index) => {
                if (!item.project) newErrors[`prop_${index}_project`] = 'Project is required';
            });
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            if (onSave) onSave(formData);
            onClose();
        }
    };

    if (!isOpen) return null;

    // Styles (Consistent with AddContactModal)
    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out'
    };

    const modalStyle = {
        backgroundColor: '#fff',
        borderRadius: '16px',
        width: formData.status === 'Completed' ? '1200px' : '750px', // Increased width for better space
        maxWidth: '95vw',
        maxHeight: '90vh',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    };

    const headerStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #ffffff, #f8fafc)',
        position: 'relative'
    };

    const bodyStyle = {
        padding: '24px',
        overflowY: 'auto',
        maxHeight: 'calc(90vh - 140px)'
    };

    const footerStyle = {
        padding: '16px 24px',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        background: '#f8fafc'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#475569',
        marginBottom: '6px'
    };

    const inputStyle = (hasError) => ({
        width: '100%',
        padding: '10px',
        borderRadius: '8px',
        border: `1px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
        fontSize: '0.9rem',
        color: '#1e293b',
        outline: 'none',
        transition: 'all 0.2s',
        backgroundColor: '#f8fafc'
    });

    const customSelectStyle = (hasError) => ({
        ...inputStyle(hasError),
        paddingRight: '30px', // Space for arrow
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px'
    });

    const rowStyle = {
        display: 'flex',
        gap: '16px',
        marginBottom: formData.status === 'Completed' ? '12px' : '16px'
    };

    const colStyle = {
        flex: 1
    };

    // Dynamic Field Renderers
    const renderCallFields = () => (
        <div style={{ backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '8px', marginBottom: formData.status === 'Completed' ? '12px' : '16px', border: '1px solid #bae6fd' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#0369a1', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-phone-alt" style={{ marginRight: '8px' }}></i> Call Details
            </h4>
            <div style={rowStyle}>
                <div style={colStyle}>
                    <label style={labelStyle}>Call Purpose</label>
                    <select name="callPurpose" value={formData.callPurpose} onChange={handleChange} style={customSelectStyle(false)}>
                        <option value="Prospecting">Prospecting</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Support">Support</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div style={colStyle}>
                    <label style={labelStyle}>Priority</label>
                    <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        style={customSelectStyle(false)}
                    >
                        <option value="High">High</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>
            {/* Removed Duration and Outcome from here as requested */}
        </div>
    );

    const renderMeetingFields = () => (
        <div style={{ backgroundColor: '#fdf4ff', padding: '12px', borderRadius: '8px', marginBottom: formData.status === 'Completed' ? '12px' : '16px', border: '1px solid #f5d0fe' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#a21caf', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-users" style={{ marginRight: '8px' }}></i> Meeting Details
            </h4>
            <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Meeting Type</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Office', 'On-Site', 'Virtual', 'Developer Office'].map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                            <input
                                type="radio"
                                name="meetingType"
                                value={type}
                                checked={formData.meetingType === type}
                                onChange={handleChange}
                                style={{ marginRight: '8px', accentColor: 'var(--primary-color)' }}
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </div>

            {/* Conditional Input based on Meeting Type */}
            {formData.meetingType === 'Virtual' ? (
                <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Zoom Meeting Link</label>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-video" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input
                            type="text"
                            name="meetingLocation"
                            value={formData.meetingLocation}
                            onChange={handleChange}
                            style={{ ...inputStyle(errors.meetingLocation), paddingLeft: '32px' }}
                            placeholder="Paste Zoom or Google Meet link here"
                        />
                    </div>
                    {errors.meetingLocation && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.meetingLocation}</span>}
                </div>
            ) : (
                <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Google Location</label>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-map-marker-alt" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#ef4444' }}></i>
                        <input
                            ref={locationInputRef} // Attach ref for Google Places
                            type="text"
                            name="meetingLocation"
                            value={formData.meetingLocation}
                            onChange={handleChange}
                            style={{ ...inputStyle(errors.meetingLocation), paddingLeft: '32px' }}
                            placeholder="Search for a location on Google Maps..."
                        />
                    </div>
                    {errors.meetingLocation && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.meetingLocation}</span>}
                </div>
            )}

            <div>
                <label style={labelStyle}>Agenda</label>
                <select name="agenda" value={formData.agenda} onChange={handleChange} style={customSelectStyle(false)}>
                    <option value="">Select Agenda</option>
                    <option value="First Meeting / Introduction">First Meeting / Introduction</option>
                    <option value="Project Presentation">Project Presentation</option>
                    <option value="Site Visit / Property Tour">Site Visit / Property Tour</option>
                    <option value="Price Negotiation">Price Negotiation</option>
                    <option value="Document Signing / Collection">Document Signing / Collection</option>
                    <option value="Payment Collection / Follow-up">Payment Collection / Follow-up</option>
                    <option value="Handover / Possession">Handover / Possession</option>
                    <option value="Legal / Loan Consultation">Legal / Loan Consultation</option>
                    <option value="Complaint Resolution">Complaint Resolution</option>
                    <option value="Other">Other</option>
                </select>
            </div>
        </div>
    );

    const renderSiteVisitFields = () => {
        const addPropertyRow = () => {
            setFormData(prev => ({
                ...prev,
                visitedProperties: [...prev.visitedProperties, { project: '', block: '', property: '', result: '', feedback: '' }]
            }));
        };

        const removePropertyRow = (index) => {
            if (formData.visitedProperties.length <= 1) return;
            setFormData(prev => ({
                ...prev,
                visitedProperties: prev.visitedProperties.filter((_, i) => i !== index)
            }));
        };

        const updatePropertyRow = (index, field, value) => {
            const newProps = [...formData.visitedProperties];
            newProps[index] = { ...newProps[index], [field]: value };
            // Reset block if project changes
            if (field === 'project') newProps[index].block = '';
            setFormData(prev => ({ ...prev, visitedProperties: newProps }));
        };

        // Flatten projects for the dropdown
        const allProjects = [];
        Object.keys(PROJECT_DATA).forEach(city => {
            PROJECT_DATA[city].forEach(proj => {
                allProjects.push({ ...proj, city });
            });
        });

        return (
            <div style={{ backgroundColor: '#ecfdf5', padding: '16px', borderRadius: '12px', marginBottom: formData.status === 'Completed' ? '12px' : '16px', border: '1px solid #a7f3d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#047857', display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                        <i className="fas fa-map-marked-alt" style={{ marginRight: '8px' }}></i> Site Visit Properties
                    </h4>
                    <button
                        onClick={addPropertyRow}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
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
                    const selectedProject = allProjects.find(p => p.name === row.project);
                    const towers = selectedProject ? selectedProject.towers : [];

                    return (
                        <div key={index} style={{
                            display: 'flex',
                            gap: '10px',
                            marginBottom: '12px',
                            alignItems: 'flex-start',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.5)',
                            borderRadius: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                            <div style={{ flex: 1.5 }}>
                                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Project/Location</label>
                                <select
                                    value={row.project}
                                    onChange={(e) => updatePropertyRow(index, 'project', e.target.value)}
                                    style={customSelectStyle(errors[`prop_${index}_project`])}
                                >
                                    <option value="">Select Project</option>
                                    {allProjects.map(p => (
                                        <option key={p.id} value={p.name}>{p.name} ({p.city})</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Block</label>
                                <select
                                    value={row.block}
                                    onChange={(e) => updatePropertyRow(index, 'block', e.target.value)}
                                    style={customSelectStyle(false)}
                                    disabled={!row.project}
                                >
                                    <option value="">Select Block</option>
                                    {towers.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Property</label>
                                <input
                                    type="text"
                                    placeholder="Unit No."
                                    value={row.property}
                                    onChange={(e) => updatePropertyRow(index, 'property', e.target.value)}
                                    style={inputStyle(false)}
                                />
                            </div>
                            {formData.visitedProperties.length > 1 && (
                                <button
                                    onClick={() => removePropertyRow(index)}
                                    style={{
                                        marginTop: '24px',
                                        padding: '10px',
                                        color: '#ef4444',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1rem'
                                    }}
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            )}
                        </div>
                    );
                })}

                <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Visit Type <span style={{ color: '#ef4444' }}>*</span></label>
                        <select
                            name="visitType"
                            value={formData.visitType}
                            onChange={handleChange}
                            style={customSelectStyle(errors.visitType)}
                        >
                            <option value="Site Visit">Site Visit</option>
                            <option value="Re Visit">Re Visit</option>
                            <option value="Sample Visit">Sample Visit</option>
                            <option value="Virtual Tour">Virtual Tour</option>
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Confirmation <span style={{ color: '#ef4444' }}>*</span></label>
                        <select
                            name="visitConfirmation"
                            value={formData.visitConfirmation}
                            onChange={handleChange}
                            style={customSelectStyle(errors.visitConfirmation)}
                        >
                            <option value="Confirmed">Confirmed</option>
                            <option value="Tentative">Tentative</option>
                        </select>
                    </div>
                </div>
            </div>
        );
    };

    const renderTaskFields = () => (
        <div style={{ backgroundColor: '#f5f3ff', padding: '12px', borderRadius: '8px', marginBottom: formData.status === 'Completed' ? '12px' : '16px', border: '1px solid #ddd6fe' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#6d28d9', display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                <i className="fas fa-tasks" style={{ marginRight: '8px' }}></i> Task Details & Reminders
            </h4>

            <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Specific Work / Task Item</label>
                <input
                    type="text"
                    name="work"
                    value={formData.work}
                    onChange={handleChange}
                    placeholder="Describe the specific work to be done..."
                    style={inputStyle(false)}
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderTop: '1px dashed #ddd6fe', paddingTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#4c1d95' }}>
                    <input type="checkbox" name="reminder" checked={formData.reminder} onChange={handleChange} style={{ accentColor: '#7c3aed' }} />
                    Enable Reminder
                </label>
                {formData.reminder && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s ease-out' }}>
                        <span style={{ fontSize: '0.85rem', color: '#6d28d9', fontWeight: 500 }}>at</span>
                        <input
                            type="time"
                            name="reminderTime"
                            value={formData.reminderTime}
                            onChange={handleChange}
                            style={{ ...inputStyle(false), padding: '6px 12px', width: 'auto' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );

    const renderEmailFields = () => (
        <div style={{ backgroundColor: '#fff7ed', padding: '12px', borderRadius: '8px', marginBottom: formData.status === 'Completed' ? '12px' : '16px', border: '1px solid #fed7aa' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#c2410c', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-envelope" style={{ marginRight: '8px' }}></i> Email Details
            </h4>
            <div style={rowStyle}>
                <div style={colStyle}>
                    <label style={labelStyle}>Email Purpose</label>
                    <select name="emailPurpose" value={formData.emailPurpose} onChange={handleChange} style={customSelectStyle(false)}>
                        <option value="Prospecting">Prospecting</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Support">Support</option>
                        <option value="Updates">Project Updates</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div style={colStyle}>
                    <label style={labelStyle}>Priority</label>
                    <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        style={customSelectStyle(false)}
                    >
                        <option value="High">High</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>
        </div>
    );

    const renderCompletionForm = () => {
        if (formData.activityType === 'Call') {
            return (
                <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-clipboard-check"></i> Completion Details
                    </h3>

                    {/* Direction Toggle - Reverted to Buttons */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Direction</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, direction: 'Incoming Call' }))}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${formData.direction === 'Incoming Call' ? 'var(--primary-color)' : '#e2e8f0'}`,
                                    background: formData.direction === 'Incoming Call' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                                    color: formData.direction === 'Incoming Call' ? 'var(--primary-color)' : '#64748b',
                                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <i className="fas fa-arrow-down"></i> Incoming
                            </button>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, direction: 'Outgoing Call' }))}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${formData.direction === 'Outgoing Call' ? 'var(--primary-color)' : '#e2e8f0'}`,
                                    background: formData.direction === 'Outgoing Call' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                                    color: formData.direction === 'Outgoing Call' ? 'var(--primary-color)' : '#64748b',
                                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <i className="fas fa-arrow-up"></i> Outgoing
                            </button>
                        </div>
                    </div>

                    {/* Call Outcome - Stacked */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Call Outcome <span style={{ color: '#ef4444' }}>*</span></label>
                        <select name="callOutcome" value={formData.callOutcome} onChange={handleChange} style={customSelectStyle(errors.callOutcome)}>
                            <option value="">Select Outcome</option>
                            <option value="Connected">Answered / Connected</option>
                            <option value="No Answer">No Answer</option>
                            <option value="Busy">Busy</option>
                            <option value="Wrong Number">Wrong Number</option>
                            <option value="Left Voicemail">Left Voicemail</option>
                        </select>
                        {errors.callOutcome && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.callOutcome}</span>}
                    </div>

                    {/* Result - Stacked (Conditional) */}
                    {formData.callOutcome === 'Connected' && (
                        <div className="animate-fade-in" style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Result <span style={{ color: '#ef4444' }}>*</span></label>
                            <select name="completionResult" value={formData.completionResult} onChange={handleChange} style={customSelectStyle(errors.completionResult)}>
                                <option value="">Select Result</option>
                                <option value="Interested">Interested</option>
                                <option value="Not Interested">Not Interested</option>
                                <option value="Follow Up Required">Follow Up Required</option>
                                <option value="Meeting Scheduled">Meeting Scheduled</option>
                                <option value="Sale Closed">Sale Closed</option>
                            </select>
                            {errors.completionResult && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.completionResult}</span>}
                        </div>
                    )}

                    {/* Feedback */}
                    <div>
                        <label style={labelStyle}>Feedback / Notes</label>
                        <textarea
                            name="clientFeedback"
                            value={formData.clientFeedback}
                            onChange={handleChange}
                            rows="4"
                            placeholder="Additional notes..."
                            style={{ ...inputStyle(false), resize: 'vertical' }}
                        />
                    </div>
                </div>
            );
        }

        if (formData.activityType === 'Meeting') {
            return (
                <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        borderTop: '2px solid #e2e8f0',
                        margin: '20px 0',
                        padding: '24px',
                        backgroundColor: '#f0fdf4', // Subtle green for completion
                        borderRadius: '12px',
                        border: '1px solid #dcfce7'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: '#22c55e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '0.8rem'
                            }}>
                                <i className="fas fa-check" style={{ margin: '0 auto' }}></i>
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#166534', margin: 0, letterSpacing: '-0.3px' }}>
                                Complete Meeting
                            </h3>
                        </div>

                        <div style={rowStyle}>
                            <div style={colStyle}>
                                <label style={labelStyle}>Status <span style={{ color: '#ef4444' }}>*</span></label>
                                <select name="meetingOutcomeStatus" value={formData.meetingOutcomeStatus} onChange={handleChange} style={customSelectStyle(errors.meetingOutcomeStatus)}>
                                    <option value="">Select Status</option>
                                    <option value="Conducted">Conducted</option>
                                    <option value="Rescheduled">Rescheduled</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="No Show">No Show</option>
                                </select>
                                {errors.meetingOutcomeStatus && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.meetingOutcomeStatus}</span>}
                            </div>
                            <div style={colStyle}>
                                <label style={labelStyle}>Result <span style={{ color: '#ef4444' }}>*</span></label>
                                <select name="completionResult" value={formData.completionResult} onChange={handleChange} style={customSelectStyle(errors.completionResult)}>
                                    <option value="">Select Result</option>
                                    <option value="Interested">Interested</option>
                                    <option value="Not Interested">Not Interested</option>
                                    <option value="Token Received">Token Received</option>
                                    <option value="Follow-up Required">Follow-up Required</option>
                                    <option value="Negotiation in Progress">Negotiation in Progress</option>
                                    <option value="Dropped">Dropped</option>
                                </select>
                                {errors.completionResult && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.completionResult}</span>}
                            </div>
                        </div>

                        <div style={rowStyle}>
                            <div style={colStyle}>
                                <label style={labelStyle}>Conducted Date</label>
                                <input
                                    type="date"
                                    name="completionDate"
                                    value={formData.completionDate}
                                    onChange={handleChange}
                                    style={inputStyle(false)}
                                />
                            </div>
                            <div style={colStyle}>
                                <label style={labelStyle}>Conducted Time</label>
                                <input
                                    type="time"
                                    name="completionTime"
                                    value={formData.completionTime}
                                    onChange={handleChange}
                                    style={inputStyle(false)}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <label style={labelStyle}>Feedback</label>
                            <textarea
                                name="clientFeedback"
                                value={formData.clientFeedback}
                                onChange={handleChange}
                                rows="4"
                                placeholder="Write a summary of the meeting and client response..."
                                style={{ ...inputStyle(false), height: '100px', resize: 'vertical', backgroundColor: '#fff' }}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        if (formData.activityType === 'Site Visit') {
            return (
                <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        borderTop: '2px solid #e2e8f0',
                        margin: '20px 0',
                        padding: '24px',
                        backgroundColor: '#f0fdf4', // Subtle green for completion
                        borderRadius: '12px',
                        border: '1px solid #dcfce7'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: '#22c55e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '0.8rem'
                            }}>
                                <i className="fas fa-clipboard-check" style={{ margin: '0 auto' }}></i>
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#166534', margin: 0, letterSpacing: '-0.3px' }}>
                                Complete Site Visit
                            </h3>
                        </div>

                        <div style={rowStyle}>
                            <div style={colStyle}>
                                <label style={labelStyle}>Status <span style={{ color: '#ef4444' }}>*</span></label>
                                <select name="meetingOutcomeStatus" value={formData.meetingOutcomeStatus} onChange={handleChange} style={customSelectStyle(errors.meetingOutcomeStatus)}>
                                    <option value="">Select Status</option>
                                    <option value="Conducted">Conducted</option>
                                    <option value="Rescheduled">Rescheduled</option>
                                    <option value="Postponed">Postponed</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="Did Not Visit">Did Not Visit</option>
                                </select>
                                {errors.meetingOutcomeStatus && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.meetingOutcomeStatus}</span>}
                            </div>
                        </div>

                        {/* Status: Conducted - Per-Property Results */}
                        {formData.meetingOutcomeStatus === 'Conducted' && (
                            <div className="animate-fade-in">
                                <div style={rowStyle}>
                                    <div style={colStyle}>
                                        <label style={labelStyle}>Conducted Date</label>
                                        <input type="date" name="completionDate" value={formData.completionDate} onChange={handleChange} style={inputStyle(false)} />
                                    </div>
                                    <div style={colStyle}>
                                        <label style={labelStyle}>Conducted Time</label>
                                        <input type="time" name="completionTime" value={formData.completionTime} onChange={handleChange} style={inputStyle(false)} />
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px' }}>
                                    <label style={{ ...labelStyle, fontSize: '0.9rem', color: '#166534', borderBottom: '1px solid #dcfce7', paddingBottom: '8px', marginBottom: '16px' }}>
                                        Per-Property Feedback
                                    </label>
                                    {formData.visitedProperties.map((prop, idx) => (
                                        <div key={idx} style={{
                                            background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-building" style={{ color: '#22c55e' }}></i>
                                                {prop.project || 'Unspecified Project'} {prop.property ? ` - ${prop.property}` : ''}
                                            </div>
                                            <div style={{ marginBottom: '12px' }}>
                                                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Result <span style={{ color: '#ef4444' }}>*</span></label>
                                                <select
                                                    value={prop.result}
                                                    style={customSelectStyle(errors[`prop_${idx}_result`])}
                                                    onChange={(e) => {
                                                        const newProps = [...formData.visitedProperties];
                                                        newProps[idx].result = e.target.value;
                                                        setFormData(prev => ({ ...prev, visitedProperties: newProps }));
                                                    }}
                                                >
                                                    <option value="">Select Result</option>
                                                    <option value="Interested in Project">Interested in Project</option>
                                                    <option value="Interested in Specific Unit">Interested in Specific Unit</option>
                                                    <option value="Visited Sample Flat">Visited Sample Flat</option>
                                                    <option value="Token / Advance Received">Token / Advance Received</option>
                                                    <option value="Negotiation in Progress">Negotiation in Progress</option>
                                                    <option value="Comparison Mode">Comparison Mode</option>
                                                    <option value="Not Interested / Budget Issue">Not Interested / Budget Issue</option>
                                                    <option value="Not Interested / Location Issue">Not Interested / Location Issue</option>
                                                    <option value="Follow-up Required">Follow-up Required</option>
                                                </select>
                                                {errors[`prop_${idx}_result`] && <span style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors[`prop_${idx}_result`]}</span>}
                                            </div>
                                            <div>
                                                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Feedback</label>
                                                <textarea
                                                    value={prop.feedback}
                                                    placeholder="Client's specific reaction to this property..."
                                                    style={{ ...inputStyle(false), height: '60px', resize: 'vertical', fontSize: '0.8rem' }}
                                                    onChange={(e) => {
                                                        const newProps = [...formData.visitedProperties];
                                                        newProps[idx].feedback = e.target.value;
                                                        setFormData(prev => ({ ...prev, visitedProperties: newProps }));
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Status: Rescheduled or Postponed */}
                        {(formData.meetingOutcomeStatus === 'Rescheduled' || formData.meetingOutcomeStatus === 'Postponed') && (
                            <div className="animate-fade-in">
                                <div style={rowStyle}>
                                    <div style={colStyle}>
                                        <label style={labelStyle}>Proposed Date <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="date" name="completionDate" value={formData.completionDate} onChange={handleChange} style={inputStyle(errors.completionDate)} />
                                    </div>
                                    <div style={colStyle}>
                                        <label style={labelStyle}>Proposed Time <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="time" name="completionTime" value={formData.completionTime} onChange={handleChange} style={inputStyle(errors.completionTime)} />
                                    </div>
                                </div>
                                <div style={{ marginTop: '16px' }}>
                                    <label style={labelStyle}>Reason / Remarks</label>
                                    <textarea
                                        name="clientFeedback"
                                        value={formData.clientFeedback}
                                        onChange={handleChange}
                                        rows="3"
                                        placeholder="Reason for rescheduling..."
                                        style={{ ...inputStyle(false), height: '80px', resize: 'vertical' }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Status: Cancelled or Did Not Visit */}
                        {(formData.meetingOutcomeStatus === 'Cancelled' || formData.meetingOutcomeStatus === 'Did Not Visit') && (
                            <div className="animate-fade-in">
                                <label style={labelStyle}>{formData.meetingOutcomeStatus === 'Cancelled' ? 'Cancellation Reason' : 'Reason for Not Visiting'} <span style={{ color: '#ef4444' }}>*</span></label>
                                <textarea
                                    name="cancellationReason"
                                    value={formData.cancellationReason}
                                    onChange={handleChange}
                                    rows="4"
                                    placeholder={formData.meetingOutcomeStatus === 'Cancelled' ? "Why was this visit cancelled?" : "Reason for not visiting the property..."}
                                    style={{ ...inputStyle(errors.cancellationReason), height: '120px', resize: 'vertical' }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                Specific completion fields for {formData.activityType} usually go here.
            </div>
        );
    };

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <style>
                {`
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .no-scrollbar {
                        -ms-overflow-style: none;  /* IE and Edge */
                        scrollbar-width: none;  /* Firefox */
                    }
                    .animate-fade-in {
                        animation: fadeIn 0.3s ease-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(5px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--primary-color)',
                            fontSize: '1.2rem',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)'
                        }}>
                            <i className="fas fa-calendar-plus"></i>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>Create Activity</h2>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>Schedule a task, meeting, or call professionally</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '8px',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fecaca'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >
                        <i className="fas fa-times" style={{ fontSize: '0.9rem' }}></i>
                    </button>
                </div>

                {/* Activity Type Selection - MOVED OUTSIDE SPLIT VIEW */}
                <div style={{ padding: '24px 24px 0 24px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ ...labelStyle, marginBottom: 0, marginRight: '12px' }}>Type:</label>
                        {['Call', 'Meeting', 'Task', 'Email', 'Site Visit'].map(type => (
                            <button
                                key={type}
                                onClick={() => setFormData(prev => ({ ...prev, activityType: type }))}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    border: `1px solid ${formData.activityType === type ? 'var(--primary-color)' : '#e2e8f0'}`,
                                    background: formData.activityType === type ? 'rgba(59, 130, 246, 0.1)' : '#fff',
                                    color: formData.activityType === type ? 'var(--primary-color)' : '#64748b',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: formData.activityType === type ? '0 2px 4px rgba(59, 130, 246, 0.1)' : 'none'
                                }}
                            >
                                {type === 'Call' && <i className="fas fa-phone-alt" style={{ marginRight: '6px' }}></i>}
                                {type === 'Meeting' && <i className="fas fa-users" style={{ marginRight: '6px' }}></i>}
                                {type === 'Task' && <i className="fas fa-check-square" style={{ marginRight: '6px' }}></i>}
                                {type === 'Email' && <i className="fas fa-envelope" style={{ marginRight: '6px' }}></i>}
                                {type === 'Site Visit' && <i className="fas fa-map-marked-alt" style={{ marginRight: '6px' }}></i>}
                                {type}
                            </button>
                        ))}

                    </div>
                </div>

                {/* Body - Flex Container for Split View */}
                <div style={{ ...bodyStyle, paddingTop: '0', display: 'flex', gap: '24px' }} className="no-scrollbar">

                    {/* LEFT SIDE: Planning / Details */}
                    <div style={{ flex: 1, minWidth: 0, paddingRight: formData.status === 'Completed' ? '24px' : '0', borderRight: formData.status === 'Completed' ? '1px solid #e2e8f0' : 'none' }}>

                        {/* Completed Switch - Moved Here */}
                        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
                                <span style={{ color: formData.status === 'Completed' ? '#10b981' : '#64748b' }}>
                                    {formData.status === 'Completed' ? 'Completed' : 'Mark as Completed'}
                                </span>
                                <div style={{ position: 'relative', width: '44px', height: '24px' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.status === 'Completed'}
                                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.checked ? 'Completed' : 'Not Started' }))}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: formData.status === 'Completed' ? '#10b981' : '#cbd5e1',
                                        transition: '.3s', borderRadius: '34px'
                                    }}></span>
                                    <span style={{
                                        position: 'absolute', content: '""', height: '18px', width: '18px', left: '3px', bottom: '3px',
                                        backgroundColor: 'white', transition: '.3s', borderRadius: '50%',
                                        transform: formData.status === 'Completed' ? 'translateX(20px)' : 'translateX(0)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }}></span>
                                </div>
                            </label>
                        </div>




                        {/* Dynamic Fields Section */}
                        {formData.activityType === 'Call' && renderCallFields()}
                        {formData.activityType === 'Meeting' && renderMeetingFields()}
                        {formData.activityType === 'Site Visit' && renderSiteVisitFields()}
                        {formData.activityType === 'Email' && renderEmailFields()}
                        {formData.activityType === 'Task' && renderTaskFields()}

                        {/* Subject */}
                        <div style={{ marginBottom: formData.status === 'Completed' ? '12px' : '16px' }}>
                            <label style={labelStyle}>Subject <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                name="subject"
                                value={formData.subject}
                                onChange={handleChange}
                                placeholder="e.g. Follow up with client regarding property visit"
                                style={inputStyle(errors.subject)}
                            />
                            {errors.subject && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.subject}</span>}
                        </div>

                        {/* Date & Time */}
                        <div style={rowStyle}>
                            <div style={colStyle}>
                                <label style={labelStyle}>{formData.activityType === 'Meeting' ? 'Select Due Date' : 'Due Date'}</label>
                                <input
                                    type="date"
                                    name="dueDate"
                                    value={formData.dueDate}
                                    onChange={handleChange}
                                    style={inputStyle(errors.dueDate)}
                                />
                                {errors.dueDate && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.dueDate}</span>}
                            </div>
                            <div style={colStyle}>
                                <label style={labelStyle}>Select Time</label>
                                <input
                                    type="time"
                                    name="dueTime"
                                    value={formData.dueTime}
                                    onChange={handleChange}
                                    style={inputStyle(false)}
                                />
                            </div>
                        </div>


                        {/* Related To (Searchable Multi-Select) */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Related To</label>

                            {/* Selected Pills */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                {formData.relatedTo.map((item, index) => (
                                    <div key={index} style={{
                                        background: '#e0f2fe', borderRadius: '16px', padding: '4px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #bae6fd', color: '#0369a1'
                                    }}>
                                        <span>{item.name}</span>
                                        <i
                                            className="fas fa-times"
                                            style={{ cursor: 'pointer', opacity: 0.7 }}
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    relatedTo: prev.relatedTo.filter((_, i) => i !== index)
                                                }));
                                            }}
                                        ></i>
                                    </div>
                                ))}
                            </div>

                            {/* Search Input */}
                            <div style={{ position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                <input
                                    type="text"
                                    placeholder="Search Leads/Contacts..."
                                    style={{ ...inputStyle(false), paddingLeft: '32px' }}
                                />
                                <SearchDropdown
                                    contacts={contactData}
                                    onSelect={(contact) => {
                                        if (!formData.relatedTo.some(c => c.mobile === contact.mobile)) {
                                            setFormData(prev => ({
                                                ...prev,
                                                relatedTo: [...prev.relatedTo, { name: contact.name, mobile: contact.mobile }]
                                            }));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Participants (Filtered Searchable Multi-Select) */}
                        {(formData.activityType === 'Meeting' || formData.activityType === 'Site Visit') && (
                            <div style={{ marginBottom: formData.status === 'Completed' ? '12px' : '16px' }}>
                                <label style={labelStyle}>Participants</label>

                                {/* Selected Pills */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                    {formData.participants.map((item, index) => (
                                        <div key={index} style={{
                                            background: '#f0fdf4', borderRadius: '16px', padding: '4px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #dcfce7', color: '#166534'
                                        }}>
                                            <span>{item.name}</span>
                                            <i
                                                className="fas fa-times"
                                                style={{ cursor: 'pointer', opacity: 0.7 }}
                                                onClick={() => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        participants: prev.participants.filter((_, i) => i !== index)
                                                    }));
                                                }}
                                            ></i>
                                        </div>
                                    ))}
                                </div>

                                {/* Search Input */}
                                <div style={{ position: 'relative' }}>
                                    <i className="fas fa-user-plus" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                    <input
                                        type="text"
                                        placeholder="Search Sales/Agents..."
                                        style={{ ...inputStyle(false), paddingLeft: '32px' }}
                                    />
                                    <SearchDropdown
                                        contacts={contactData.filter(c =>
                                            c.professionSubCategory === 'Sales Person' ||
                                            c.professionSubCategory === 'Real Estate Agent' ||
                                            c.category === 'Real Estate Agent'
                                        )}
                                        onSelect={(contact) => {
                                            if (!formData.participants.some(c => c.mobile === contact.mobile)) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    participants: [...prev.participants, { name: contact.name, mobile: contact.mobile }]
                                                }));
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Remark / Description - Always at bottom now */}
                        <div>
                            <label style={labelStyle}>{formData.activityType === 'Meeting' ? 'Remark' : 'Description'}</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows="3"
                                placeholder={formData.activityType === 'Meeting' ? "Enter meeting remarks..." : "Add any additional details here..."}
                                style={{ ...inputStyle(false), resize: 'vertical', minHeight: '80px' }}
                            />
                        </div>
                    </div>

                    {/* RIGHT SIDE: Completion Form (Only when Status is Completed) */}
                    {formData.status === 'Completed' && (
                        <div style={{ flex: 1, minWidth: 0, animation: 'fadeIn 0.3s ease-out' }}>
                            {renderCompletionForm()}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div style={footerStyle}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#64748b',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'var(--primary-color)',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <i className="fas fa-check"></i> Save Activity
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper Component for Search Results
const SearchDropdown = ({ contacts, onSelect }) => {
    const [term, setTerm] = useState('');
    const [show, setShow] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShow(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(term.toLowerCase()) ||
        c.mobile.includes(term)
    );

    return (
        <div ref={wrapperRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
            <input
                type="text"
                placeholder="Search Contact to add..."
                value={term}
                onChange={(e) => { setTerm(e.target.value); setShow(true); }}
                onFocus={() => setShow(true)}
                style={{
                    width: '100%', padding: '10px 10px 10px 32px', borderRadius: '8px',
                    border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none',
                    backgroundColor: '#f8fafc', pointerEvents: 'auto'
                }}
            />
            {show && term && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                    maxHeight: '200px', overflowY: 'auto', zIndex: 50,
                    marginTop: '4px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    pointerEvents: 'auto'
                }}>
                    {filtered.map((contact, i) => (
                        <div
                            key={i}
                            onClick={() => { onSelect(contact); setTerm(''); setShow(false); }}
                            style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.target.style.background = '#fff'}
                        >
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', pointerEvents: 'none' }}>{contact.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', pointerEvents: 'none' }}>{contact.mobile}</div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center' }}>No results found</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CreateActivityModal;
