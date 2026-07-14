import { useState } from 'react';

// ─── Form field configs per form type ──────────────────────────────────────
const FORM_CONFIGS = {
    'Requirement Form': {
        icon: 'fa-clipboard-list',
        color: '#6366f1',
        description: 'Capture buyer requirement details before proceeding',
        fields: [
            { name: 'propertyType', label: 'Property Type', type: 'select', options: ['Apartment', 'Villa', 'Plot', 'Commercial', 'Studio', 'Penthouse'], required: true },
            { name: 'bhkConfig', label: 'BHK Configuration', type: 'select', options: ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK', 'Studio'], required: true },
            { name: 'budgetMin', label: 'Budget Min (₹)', type: 'number', placeholder: 'e.g. 5000000', required: true },
            { name: 'budgetMax', label: 'Budget Max (₹)', type: 'number', placeholder: 'e.g. 8000000', required: true },
            { name: 'preferredLocation', label: 'Preferred Location', type: 'text', placeholder: 'e.g. Sector 70, Mohali', required: true },
            { name: 'timeline', label: 'Purchase Timeline', type: 'select', options: ['Immediate (0-1 month)', '1-3 months', '3-6 months', '6-12 months', 'More than 1 year'], required: true },
            { name: 'purpose', label: 'Purpose of Purchase', type: 'select', options: ['Self Use', 'Investment', 'Rental Income', 'Gift', 'Not Decided'], required: true },
            { name: 'loanRequired', label: 'Loan Required?', type: 'select', options: ['Yes - Pre-approved', 'Yes - Applied', 'Yes - Not yet applied', 'No - Self Funded', 'Not decided'], required: true },
            { name: 'otherRequirements', label: 'Other Requirements / Notes', type: 'textarea', placeholder: 'Floor preference, vastu, parking, etc.' },
        ]
    },
    'Site Visit Form': {
        icon: 'fa-map-marker-alt',
        color: '#10b981',
        description: 'Document site visit outcomes and client feedback',
        fields: [
            { name: 'visitDate', label: 'Visit Date', type: 'date', required: true },
            { name: 'visitType', label: 'Visit Type', type: 'select', options: ['First Visit (Solo)', 'Re-Visit (With Family)', 'Virtual Tour', 'Construction Site', 'Showroom Visit', 'Possession Visit'], required: true },
            { name: 'propertiesShown', label: 'Properties Shown', type: 'text', placeholder: 'Unit nos / blocks shown', required: true },
            { name: 'clientReaction', label: 'Client Overall Reaction', type: 'select', options: ['Very Positive', 'Positive', 'Neutral', 'Negative', 'Mixed'], required: true },
            { name: 'priceReaction', label: 'Price Reaction', type: 'select', options: ['Fully Acceptable', 'Negotiable', 'Too High', 'Need to Discuss'], required: true },
            { name: 'shortlistedUnit', label: 'Shortlisted Unit / Plot', type: 'text', placeholder: 'Unit no or block' },
            { name: 'familyPresent', label: 'Family / Decision Maker Present?', type: 'select', options: ['Yes - Fully involved', 'Yes - Partially', 'No', 'Coming on next visit'] },
            { name: 'nextStep', label: 'Next Agreed Step', type: 'select', options: ['Revisit scheduled', 'Price negotiation', 'Agreement discussion', 'Final decision', 'No follow-up'], required: true },
            { name: 'visitRemarks', label: 'Visit Remarks', type: 'textarea', placeholder: 'Key observations, objections raised, what impressed them...' },
        ]
    },
    'Offer Form': {
        icon: 'fa-handshake',
        color: '#f59e0b',
        description: 'Record offer terms discussed with the client',
        fields: [
            { name: 'offerDate', label: 'Offer Date', type: 'date', required: true },
            { name: 'offeredPrice', label: 'Offered Price (₹)', type: 'number', placeholder: 'Amount client offered / we offered', required: true },
            { name: 'listedPrice', label: 'Listed / Asking Price (₹)', type: 'number', placeholder: 'Original price', required: true },
            { name: 'discountPercent', label: 'Discount % Offered', type: 'number', placeholder: 'e.g. 5' },
            { name: 'offerType', label: 'Offer Type', type: 'select', options: ['Client Counter-Offer', 'Our Offer to Client', 'Revised Offer', 'Final Offer', 'Best & Final'], required: true },
            { name: 'includedTerms', label: 'Terms Included', type: 'textarea', placeholder: 'Parking, registry, maintenance, possession date, modular kitchen...' },
            { name: 'offerValidity', label: 'Offer Valid Till', type: 'date' },
            { name: 'offerStatus', label: 'Offer Status', type: 'select', options: ['Accepted', 'Rejected', 'Counter-offered', 'Under Consideration', 'Verbally Accepted'], required: true },
            { name: 'offerRemarks', label: 'Remarks / Notes', type: 'textarea', placeholder: 'Any conditions or verbal commitments made...' },
        ]
    },
    'Quotation Form': {
        icon: 'fa-file-invoice-dollar',
        color: '#8b5cf6',
        description: 'Document price quotation shared with client',
        fields: [
            { name: 'quotationDate', label: 'Quotation Date', type: 'date', required: true },
            { name: 'unitDetails', label: 'Unit / Property Details', type: 'text', placeholder: 'Unit no, block, area (sq ft)', required: true },
            { name: 'basePrice', label: 'Base Price (₹)', type: 'number', required: true },
            { name: 'floorRise', label: 'Floor Rise Charges (₹)', type: 'number', placeholder: '0 if ground floor' },
            { name: 'parkingCharges', label: 'Parking Charges (₹)', type: 'number' },
            { name: 'plcCharges', label: 'PLC / View Charges (₹)', type: 'number' },
            { name: 'registrationCharges', label: 'Est. Registration & Stamp Duty (₹)', type: 'number' },
            { name: 'totalCost', label: 'Total All-In Cost (₹)', type: 'number', required: true },
            { name: 'paymentPlan', label: 'Payment Plan Offered', type: 'select', options: ['Down Payment (90-10)', 'Construction Linked', 'Flexi Plan', 'Subvention Scheme', 'Own Payment Plan'], required: true },
            { name: 'quotationRemarks', label: 'Remarks', type: 'textarea', placeholder: 'Any special offers, limited time pricing...' },
        ]
    },
    'Booking Form': {
        icon: 'fa-file-contract',
        color: '#ef4444',
        description: 'Capture booking details and token payment information',
        fields: [
            { name: 'bookingDate', label: 'Booking Date', type: 'date', required: true },
            { name: 'bookedUnit', label: 'Booked Unit / Property', type: 'text', placeholder: 'Unit no, block, tower', required: true },
            { name: 'bookingAmount', label: 'Token / Booking Amount (₹)', type: 'number', required: true },
            { name: 'paymentMode', label: 'Payment Mode', type: 'select', options: ['Cheque', 'NEFT/RTGS', 'Cash', 'UPI / Online', 'Demand Draft'], required: true },
            { name: 'chequeNo', label: 'Cheque / Reference No.', type: 'text', placeholder: 'Cheque no. or transaction ID' },
            { name: 'agreedTotalPrice', label: 'Agreed Total Price (₹)', type: 'number', required: true },
            { name: 'possessionDate', label: 'Expected Possession Date', type: 'date' },
            { name: 'paymentSchedule', label: 'Payment Schedule / Plan', type: 'select', options: ['Construction Linked Plan', 'Down Payment Plan', 'Flexi Pay', 'Subvention Scheme', 'Custom'], required: true },
            { name: 'specialTerms', label: 'Special Terms / Verbal Commitments', type: 'textarea', placeholder: 'Any extra promises made to client (car park, modular kitchen, etc.)' },
            { name: 'witnessName', label: 'Witness / Channel Partner Name', type: 'text' },
        ]
    },
    'KYC Form': {
        icon: 'fa-id-card',
        color: '#64748b',
        description: 'Collect buyer KYC documents for compliance',
        fields: [
            { name: 'buyerFullName', label: 'Buyer Full Name (as per ID)', type: 'text', required: true },
            { name: 'fatherHusbandName', label: "Father's / Husband's Name", type: 'text', required: true },
            { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
            { name: 'nationality', label: 'Nationality', type: 'select', options: ['Indian', 'NRI - USA', 'NRI - UK', 'NRI - UAE', 'NRI - Canada', 'NRI - Australia', 'Other'], required: true },
            { name: 'panNumber', label: 'PAN Number', type: 'text', placeholder: 'ABCDE1234F', required: true },
            { name: 'aadhaarNumber', label: 'Aadhaar Number', type: 'text', placeholder: 'XXXX XXXX XXXX' },
            { name: 'permanentAddress', label: 'Permanent Address', type: 'textarea', required: true },
            { name: 'correspondenceAddress', label: 'Correspondence Address (if different)', type: 'textarea' },
            { name: 'mobileNo', label: 'Mobile Number', type: 'text', required: true },
            { name: 'emailId', label: 'Email ID', type: 'email', required: true },
            { name: 'occupation', label: 'Occupation', type: 'select', options: ['Salaried', 'Self-Employed Business', 'Professional (CA/Doctor/Lawyer)', 'Retired', 'NRI', 'Investor', 'Other'] },
            { name: 'annualIncome', label: 'Annual Income Range', type: 'select', options: ['Below ₹5L', '₹5L–₹10L', '₹10L–₹25L', '₹25L–₹50L', '₹50L–₹1Cr', 'Above ₹1Cr'] },
            { name: 'coApplicantName', label: 'Co-Applicant Name (if any)', type: 'text' },
            { name: 'documentsSubmitted', label: 'Documents Submitted', type: 'textarea', placeholder: 'PAN card, Aadhaar, Photo, Address proof...' },
        ]
    },
    'Meetings Form': {
        icon: 'fa-users',
        color: '#0ea5e9',
        description: 'Minutes of meeting with client',
        fields: [
            { name: 'meetingDate', label: 'Meeting Date', type: 'date', required: true },
            { name: 'meetingType', label: 'Meeting Type', type: 'select', options: ['In-Office', 'Client Premises', 'Virtual / Video Call', 'Site Meeting', 'Restaurant / Informal'], required: true },
            { name: 'attendees', label: 'Attendees (from our side)', type: 'text', placeholder: 'Names of team members present', required: true },
            { name: 'clientAttendees', label: 'Client Attendees', type: 'text', placeholder: 'Client names present', required: true },
            { name: 'agendaDiscussed', label: 'Agenda Discussed', type: 'textarea', required: true, placeholder: 'Key points discussed in the meeting...' },
            { name: 'clientConcerns', label: 'Client Concerns / Objections', type: 'textarea', placeholder: 'What issues or questions did the client raise?' },
            { name: 'resolutionOffered', label: 'Resolution / Response Offered', type: 'textarea', placeholder: 'How did we address their concerns?' },
            { name: 'meetingOutcome', label: 'Meeting Outcome', type: 'select', options: ['Very Positive', 'Positive', 'Neutral', 'Inconclusive', 'Negative'], required: true },
            { name: 'nextAction', label: 'Next Action Agreed', type: 'text', placeholder: 'e.g. Site visit on 15th, send revised quotation', required: true },
            { name: 'nextActionDate', label: 'Next Action Date', type: 'date' },
        ]
    },
};

// ─── Single Form Section ────────────────────────────────────────────────────
const FormSection = ({ formName, formData, onChange, expanded, onToggle }) => {
    const config = FORM_CONFIGS[formName];
    if (!config) return null;

    const handleField = (fieldName, value) => {
        onChange(formName, { ...formData, [fieldName]: value });
    };

    const filledCount = config.fields.filter(f => formData?.[f.name]).length;
    const requiredCount = config.fields.filter(f => f.required).length;
    const isComplete = config.fields.filter(f => f.required).every(f => formData?.[f.name]);

    return (
        <div style={{
            borderRadius: '12px',
            border: `1.5px solid ${expanded ? config.color + '40' : '#e5e7eb'}`,
            overflow: 'hidden',
            marginBottom: '12px',
            transition: 'border-color 0.2s',
            boxShadow: expanded ? `0 4px 20px ${config.color}15` : 'none'
        }}>
            {/* Accordion Header */}
            <div
                onClick={onToggle}
                style={{
                    padding: '14px 20px',
                    background: expanded ? config.color + '08' : '#fafafa',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    cursor: 'pointer', transition: 'background 0.2s'
                }}
            >
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: config.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                    <i className={`fas ${config.icon}`} style={{ color: config.color, fontSize: '15px' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#111827' }}>{formName}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{config.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 10px',
                        borderRadius: '20px',
                        background: isComplete ? '#d1fae5' : filledCount > 0 ? '#fef3c7' : '#f1f5f9',
                        color: isComplete ? '#065f46' : filledCount > 0 ? '#92400e' : '#64748b'
                    }}>
                        {isComplete ? '✓ Complete' : `${filledCount}/${requiredCount} required`}
                    </span>
                    <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: '12px' }} />
                </div>
            </div>

            {/* Accordion Body */}
            {expanded && (
                <div style={{ padding: '20px', background: '#fff' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '16px'
                    }}>
                        {config.fields.map(field => (
                            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{
                                    fontSize: '12px', fontWeight: 700, color: '#374151',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                    {field.label}
                                    {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                </label>
                                {field.type === 'select' ? (
                                    <select
                                        value={formData?.[field.name] || ''}
                                        onChange={e => handleField(field.name, e.target.value)}
                                        style={{
                                            padding: '9px 12px', borderRadius: '8px', fontSize: '13px',
                                            border: `1px solid ${formData?.[field.name] ? '#d1fae5' : '#e5e7eb'}`,
                                            background: '#fff', color: '#111827', outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        {field.options.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : field.type === 'textarea' ? (
                                    <textarea
                                        value={formData?.[field.name] || ''}
                                        onChange={e => handleField(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        rows={3}
                                        style={{
                                            padding: '9px 12px', borderRadius: '8px', fontSize: '13px',
                                            border: `1px solid ${formData?.[field.name] ? '#d1fae5' : '#e5e7eb'}`,
                                            background: '#fff', color: '#111827', outline: 'none',
                                            resize: 'vertical', fontFamily: 'inherit'
                                        }}
                                    />
                                ) : (
                                    <input
                                        type={field.type}
                                        value={formData?.[field.name] || ''}
                                        onChange={e => handleField(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        style={{
                                            padding: '9px 12px', borderRadius: '8px', fontSize: '13px',
                                            border: `1px solid ${formData?.[field.name] ? '#d1fae5' : '#e5e7eb'}`,
                                            background: '#fff', color: '#111827', outline: 'none'
                                        }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Main RequiredFormsStep Component ──────────────────────────────────────
const RequiredFormsStep = ({ pendingForms, formsData, onFormsChange, activitySummary }) => {
    const [expandedForm, setExpandedForm] = useState(pendingForms[0] || null);

    const handleFormChange = (formName, data) => {
        onFormsChange({ ...formsData, [formName]: data });
    };

    const totalRequired = pendingForms.reduce((acc, formName) => {
        const config = FORM_CONFIGS[formName];
        if (!config) return acc;
        return acc + config.fields.filter(f => f.required).length;
    }, 0);

    const totalFilled = pendingForms.reduce((acc, formName) => {
        const config = FORM_CONFIGS[formName];
        const data = formsData[formName] || {};
        if (!config) return acc;
        return acc + config.fields.filter(f => f.required && data[f.name]).length;
    }, 0);

    const progress = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Context Banner */}
            <div style={{
                padding: '14px 20px', background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                border: '1px solid #bfdbfe', borderRadius: '12px', marginBottom: '20px',
                display: 'flex', alignItems: 'center', gap: '14px'
            }}>
                <i className="fas fa-info-circle" style={{ color: '#3b82f6', fontSize: '18px', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af' }}>
                        Required Forms — {activitySummary}
                    </div>
                    <div style={{ fontSize: '12px', color: '#1e40af', opacity: 0.8, marginTop: '2px' }}>
                        The selected outcome requires the following forms to be filled before saving. This ensures proper compliance and documentation trail.
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>
                        Form Completion
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: progress === 100 ? '#10b981' : '#6366f1' }}>
                        {progress}%
                    </span>
                </div>
                <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: '99px',
                        width: `${progress}%`,
                        background: progress === 100
                            ? 'linear-gradient(to right, #10b981, #059669)'
                            : 'linear-gradient(to right, #6366f1, #8b5cf6)',
                        transition: 'width 0.4s ease'
                    }} />
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                    {totalFilled} of {totalRequired} required fields filled across {pendingForms.length} form{pendingForms.length > 1 ? 's' : ''}
                </div>
            </div>

            {/* Form Sections */}
            <div>
                {pendingForms.map(formName => (
                    <FormSection
                        key={formName}
                        formName={formName}
                        formData={formsData[formName] || {}}
                        onChange={handleFormChange}
                        expanded={expandedForm === formName}
                        onToggle={() => setExpandedForm(prev => prev === formName ? null : formName)}
                    />
                ))}
            </div>

            {/* Skip Warning */}
            <div style={{
                marginTop: '8px', padding: '10px 16px',
                background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px',
                fontSize: '12px', color: '#92400e', display: 'flex', gap: '8px', alignItems: 'flex-start'
            }}>
                <i className="fas fa-exclamation-triangle" style={{ marginTop: '1px', flexShrink: 0 }} />
                <span>
                    Skipping forms will save the activity without documentation. This is logged and may affect compliance reporting.
                    Use "Save Without Forms" only in exceptional cases.
                </span>
            </div>
        </div>
    );
};

export default RequiredFormsStep;
