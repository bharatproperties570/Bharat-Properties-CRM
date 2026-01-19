import React, { useState, useEffect } from 'react';

const COUNTRY_CODES = [
    { name: 'India', dial_code: '+91', code: 'IN' },
    { name: 'United States', dial_code: '+1', code: 'US' },
    { name: 'United Kingdom', dial_code: '+44', code: 'GB' },
    { name: 'Afghanistan', dial_code: '+93', code: 'AF' },
    { name: 'Albania', dial_code: '+355', code: 'AL' },
    { name: 'Algeria', dial_code: '+213', code: 'DZ' },
    { name: 'Andorra', dial_code: '+376', code: 'AD' },
    { name: 'Angola', dial_code: '+244', code: 'AO' },
    { name: 'Argentina', dial_code: '+54', code: 'AR' },
    { name: 'Armenia', dial_code: '+374', code: 'AM' },
    { name: 'Australia', dial_code: '+61', code: 'AU' },
    { name: 'Austria', dial_code: '+43', code: 'AT' },
    { name: 'Azerbaijan', dial_code: '+994', code: 'AZ' },
    { name: 'Bahrain', dial_code: '+973', code: 'BH' },
    { name: 'Bangladesh', dial_code: '+880', code: 'BD' },
    { name: 'Belarus', dial_code: '+375', code: 'BY' },
    { name: 'Belgium', dial_code: '+32', code: 'BE' },
    { name: 'Bhutan', dial_code: '+975', code: 'BT' },
    { name: 'Bolivia', dial_code: '+591', code: 'BO' },
    { name: 'Bosnia and Herzegovina', dial_code: '+387', code: 'BA' },
    { name: 'Brazil', dial_code: '+55', code: 'BR' },
    { name: 'Bulgaria', dial_code: '+359', code: 'BG' },
    { name: 'Cambodia', dial_code: '+855', code: 'KH' },
    { name: 'Canada', dial_code: '+1', code: 'CA' },
    { name: 'Chile', dial_code: '+56', code: 'CL' },
    { name: 'China', dial_code: '+86', code: 'CN' },
    { name: 'Colombia', dial_code: '+57', code: 'CO' },
    { name: 'Costa Rica', dial_code: '+506', code: 'CR' },
    { name: 'Croatia', dial_code: '+385', code: 'HR' },
    { name: 'Cuba', dial_code: '+53', code: 'CU' },
    { name: 'Cyprus', dial_code: '+357', code: 'CY' },
    { name: 'Czech Republic', dial_code: '+420', code: 'CZ' },
    { name: 'Denmark', dial_code: '+45', code: 'DK' },
    { name: 'Egypt', dial_code: '+20', code: 'EG' },
    { name: 'Estonia', dial_code: '+372', code: 'EE' },
    { name: 'Ethiopia', dial_code: '+251', code: 'ET' },
    { name: 'Finland', dial_code: '+358', code: 'FI' },
    { name: 'France', dial_code: '+33', code: 'FR' },
    { name: 'Georgia', dial_code: '+995', code: 'GE' },
    { name: 'Germany', dial_code: '+49', code: 'DE' },
    { name: 'Greece', dial_code: '+30', code: 'GR' },
    { name: 'Hong Kong', dial_code: '+852', code: 'HK' },
    { name: 'Hungary', dial_code: '+36', code: 'HU' },
    { name: 'Iceland', dial_code: '+354', code: 'IS' },
    { name: 'Indonesia', dial_code: '+62', code: 'ID' },
    { name: 'Iran', dial_code: '+98', code: 'IR' },
    { name: 'Iraq', dial_code: '+964', code: 'IQ' },
    { name: 'Ireland', dial_code: '+353', code: 'IE' },
    { name: 'Israel', dial_code: '+972', code: 'IL' },
    { name: 'Italy', dial_code: '+39', code: 'IT' },
    { name: 'Japan', dial_code: '+81', code: 'JP' },
    { name: 'Jordan', dial_code: '+962', code: 'JO' },
    { name: 'Kazakhstan', dial_code: '+7', code: 'KZ' },
    { name: 'Kenya', dial_code: '+254', code: 'KE' },
    { name: 'Kuwait', dial_code: '+965', code: 'KW' },
    { name: 'Kyrgyzstan', dial_code: '+996', code: 'KG' },
    { name: 'Latvia', dial_code: '+371', code: 'LV' },
    { name: 'Lebanon', dial_code: '+961', code: 'LB' },
    { name: 'Libya', dial_code: '+218', code: 'LY' },
    { name: 'Liechtenstein', dial_code: '+423', code: 'LI' },
    { name: 'Lithuania', dial_code: '+370', code: 'LT' },
    { name: 'Luxembourg', dial_code: '+352', code: 'LU' },
    { name: 'Malaysia', dial_code: '+60', code: 'MY' },
    { name: 'Maldives', dial_code: '+960', code: 'MV' },
    { name: 'Mexico', dial_code: '+52', code: 'MX' },
    { name: 'Monaco', dial_code: '+377', code: 'MC' },
    { name: 'Mongolia', dial_code: '+976', code: 'MN' },
    { name: 'Montenegro', dial_code: '+382', code: 'ME' },
    { name: 'Morocco', dial_code: '+212', code: 'MA' },
    { name: 'Myanmar', dial_code: '+95', code: 'MM' },
    { name: 'Nepal', dial_code: '+977', code: 'NP' },
    { name: 'Netherlands', dial_code: '+31', code: 'NL' },
    { name: 'New Zealand', dial_code: '+64', code: 'NZ' },
    { name: 'North Korea', dial_code: '+850', code: 'KP' },
    { name: 'Norway', dial_code: '+47', code: 'NO' },
    { name: 'Oman', dial_code: '+968', code: 'OM' },
    { name: 'Pakistan', dial_code: '+92', code: 'PK' },
    { name: 'Peru', dial_code: '+51', code: 'PE' },
    { name: 'Philippines', dial_code: '+63', code: 'PH' },
    { name: 'Poland', dial_code: '+48', code: 'PL' },
    { name: 'Portugal', dial_code: '+351', code: 'PT' },
    { name: 'Qatar', dial_code: '+974', code: 'QA' },
    { name: 'Romania', dial_code: '+40', code: 'RO' },
    { name: 'Russia', dial_code: '+7', code: 'RU' },
    { name: 'Saudi Arabia', dial_code: '+966', code: 'SA' },
    { name: 'Serbia', dial_code: '+381', code: 'RS' },
    { name: 'Singapore', dial_code: '+65', code: 'SG' },
    { name: 'Slovakia', dial_code: '+421', code: 'SK' },
    { name: 'Slovenia', dial_code: '+386', code: 'SI' },
    { name: 'South Africa', dial_code: '+27', code: 'ZA' },
    { name: 'South Korea', dial_code: '+82', code: 'KR' },
    { name: 'Spain', dial_code: '+34', code: 'ES' },
    { name: 'Sri Lanka', dial_code: '+94', code: 'LK' },
    { name: 'Sweden', dial_code: '+46', code: 'SE' },
    { name: 'Switzerland', dial_code: '+41', code: 'CH' },
    { name: 'Taiwan', dial_code: '+886', code: 'TW' },
    { name: 'Tajikistan', dial_code: '+992', code: 'TJ' },
    { name: 'Thailand', dial_code: '+66', code: 'TH' },
    { name: 'Turkey', dial_code: '+90', code: 'TR' },
    { name: 'Ukraine', dial_code: '+380', code: 'UA' },
    { name: 'United Arab Emirates', dial_code: '+971', code: 'AE' },
    { name: 'Uzbekistan', dial_code: '+998', code: 'UZ' },
    { name: 'Venezuela', dial_code: '+58', code: 'VE' },
    { name: 'Vietnam', dial_code: '+84', code: 'VN' },
    { name: 'Yemen', dial_code: '+967', code: 'YE' },
    { name: 'Zambia', dial_code: '+260', code: 'ZM' },
    { name: 'Zimbabwe', dial_code: '+263', code: 'ZW' },
];

const AddContactModal = ({ isOpen, onClose, onAdd }) => {
    const [currentTab, setCurrentTab] = useState('basic');
    const [currentAddressType, setCurrentAddressType] = useState('permanent'); // permanent or correspondence
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);
    const [tagInput, setTagInput] = useState('');

    const [formData, setFormData] = useState({
        // Basic Details
        title: '',
        name: '',
        surname: '',
        fatherHusbandName: '', // Moved from Address Details
        countryCode: '+91',
        phones: [{ number: '', type: 'Personal' }],
        emails: [{ address: '', type: 'Personal' }],
        tags: [],
        description: '',

        // Professional Details
        professionCategory: '',
        professionSubCategory: '',
        designation: '',
        company: '',

        // System Details
        source: '',
        team: '',
        owner: '',
        visibleTo: '',

        // Personal Address
        personalAddress: {
            hNo: '',
            country: '',
            state: '',
            city: '',
            tehsil: '',
            postOffice: '',
            pinCode: '',
            location: '',
            area: ''
        },

        // Correspondence Address
        correspondenceAddress: {
            hNo: '',
            country: '',
            state: '',
            city: '',
            tehsil: '',
            postOffice: '',
            pinCode: '',
            location: '',
            area: ''
        },

        // Other Details
        gender: '',
        maritalStatus: '',
        birthDate: '',
        anniversaryDate: '',

        // Education - Array
        educations: [{ education: '', degree: '', school: '' }],

        // Loan - Array
        loans: [{ loanType: '', bank: '', loanAmount: '' }],

        // Social Media - Array
        socialMedia: [{ platform: '', url: '' }],

        // Income - Array  
        incomes: [{ incomeType: '', amount: '' }],

        // Document
        documentNo: '',
        documentName: '',
        documentPicture: null
    });

    const getCurrentTimestamp = () => {
        const now = new Date();
        return now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handlePhoneChange = (index, field, value) => {
        const newPhones = [...formData.phones];
        newPhones[index][field] = value;
        setFormData(prev => ({ ...prev, phones: newPhones }));
    };

    const addPhone = () => {
        setFormData(prev => ({
            ...prev,
            phones: [...prev.phones, { number: '', type: 'Personal' }]
        }));
    };

    const handleEmailChange = (index, field, value) => {
        const newEmails = [...formData.emails];
        newEmails[index][field] = value;
        setFormData(prev => ({ ...prev, emails: newEmails }));
    };

    const addEmail = () => {
        setFormData(prev => ({
            ...prev,
            emails: [...prev.emails, { address: '', type: 'Personal' }]
        }));
    };

    const removePhone = (index) => {
        if (formData.phones.length > 1) {
            setFormData(prev => ({
                ...prev,
                phones: prev.phones.filter((_, i) => i !== index)
            }));
        }
    };

    const removeEmail = (index) => {
        if (formData.emails.length > 1) {
            setFormData(prev => ({
                ...prev,
                emails: prev.emails.filter((_, i) => i !== index)
            }));
        }
    };

    // Loan handlers
    const handleLoanChange = (index, field, value) => {
        const newLoans = [...formData.loans];
        newLoans[index][field] = value;
        setFormData(prev => ({ ...prev, loans: newLoans }));
    };

    const addLoan = () => {
        setFormData(prev => ({
            ...prev,
            loans: [...prev.loans, { loanType: '', bank: '', loanAmount: '' }]
        }));
    };

    const removeLoan = (index) => {
        if (formData.loans.length > 1) {
            setFormData(prev => ({
                ...prev,
                loans: prev.loans.filter((_, i) => i !== index)
            }));
        }
    };

    // Social Media handlers
    const handleSocialChange = (index, field, value) => {
        const newSocial = [...formData.socialMedia];
        newSocial[index][field] = value;
        setFormData(prev => ({ ...prev, socialMedia: newSocial }));
    };

    const addSocial = () => {
        setFormData(prev => ({
            ...prev,
            socialMedia: [...prev.socialMedia, { platform: '', url: '' }]
        }));
    };

    const removeSocial = (index) => {
        if (formData.socialMedia.length > 1) {
            setFormData(prev => ({
                ...prev,
                socialMedia: prev.socialMedia.filter((_, i) => i !== index)
            }));
        }
    };

    // Income handlers
    const handleIncomeChange = (index, field, value) => {
        const newIncomes = [...formData.incomes];
        newIncomes[index][field] = value;
        setFormData(prev => ({ ...prev, incomes: newIncomes }));
    };

    const addIncome = () => {
        setFormData(prev => ({
            ...prev,
            incomes: [...prev.incomes, { range: '', amount: '' }]
        }));
    };

    const removeIncome = (index) => {
        if (formData.incomes.length > 1) {
            setFormData(prev => ({
                ...prev,
                incomes: prev.incomes.filter((_, i) => i !== index)
            }));
        }
    };

    // Education handlers
    const handleEducationChange = (index, field, value) => {
        const newEducations = [...formData.educations];
        newEducations[index][field] = value;
        setFormData(prev => ({ ...prev, educations: newEducations }));
    };

    const addEducation = () => {
        setFormData(prev => ({
            ...prev,
            educations: [...prev.educations, { education: '', degree: '', school: '' }]
        }));
    };

    const removeEducation = (index) => {
        if (formData.educations.length > 1) {
            setFormData(prev => ({
                ...prev,
                educations: prev.educations.filter((_, i) => i !== index)
            }));
        }
    };

    // Address handlers
    const handlePersonalAddressChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            personalAddress: { ...prev.personalAddress, [field]: value }
        }));
    };

    const handleCorrespondenceAddressChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            correspondenceAddress: { ...prev.correspondenceAddress, [field]: value }
        }));
    };


    // Tag handlers
    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim()) {
                if (!formData.tags.includes(tagInput.trim())) {
                    setFormData(prev => ({
                        ...prev,
                        tags: [...prev.tags, tagInput.trim()]
                    }));
                }
                setTagInput('');
            }
        }
    };

    const removeTag = (index) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter((_, i) => i !== index)
        }));
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({ ...prev, documentPicture: file }));
        }
    };

    const handleSubmit = () => {
        // Validation
        if (!formData.name) {
            alert('Please enter Name');
            return;
        }
        if (!formData.phones[0].number) {
            alert('Please enter Mobile Number');
            return;
        }
        if (!formData.emails[0].address) {
            alert('Please enter Email Address');
            return;
        }

        onAdd(formData);

        // Reset form
        setFormData({
            title: '', name: '', surname: '', fatherHusbandName: '', countryCode: '+91',
            phones: [{ number: '', type: 'Personal' }],
            emails: [{ address: '', type: 'Personal' }],
            title: '', name: '', surname: '', fatherHusbandName: '', countryCode: '+91',
            phones: [{ number: '', type: 'Personal' }],
            emails: [{ address: '', type: 'Personal' }],
            tags: [], description: '',
            professionCategory: '', professionSubCategory: '',
            designation: '', company: '',
            source: '', team: '', owner: '', visibleTo: '',
            personalAddress: { hNo: '', country: '', state: '', city: '', tehsil: '', postOffice: '', pinCode: '', location: '', area: '' },
            correspondenceAddress: { hNo: '', country: '', state: '', city: '', tehsil: '', postOffice: '', pinCode: '', location: '', area: '' },
            gender: '', maritalStatus: '', birthDate: '', anniversaryDate: '',
            educations: [{ education: '', degree: '', school: '' }],
            loans: [{ loanType: '', bank: '', loanAmount: '' }],
            socialMedia: [{ platform: '', url: '' }],
            incomes: [{ incomeType: '', amount: '' }],
            documentNo: '', documentName: '', documentPicture: null
        });
        setCurrentTab('basic');
    };

    if (!isOpen) return null;

    const inputStyle = {
        width: '100%',
        padding: '0 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '4px',
        fontSize: '0.85rem',
        height: '40px',
        boxSizing: 'border-box',
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center'
    };

    const labelStyle = {
        fontSize: '0.8rem',
        fontWeight: 600,
        color: '#1e293b',
        marginBottom: '4px',
        display: 'block'
    };

    const sectionTitleStyle = {
        fontSize: '0.9rem',
        fontWeight: 700,
        color: '#0f172a',
        marginBottom: '12px',
        marginTop: '20px'
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                background: '#fff',
                width: '700px',
                maxHeight: '90vh',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Add Contact</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                id="showRequired"
                                checked={showOnlyRequired}
                                onChange={(e) => setShowOnlyRequired(e.target.checked)}
                                style={{ width: '14px', height: '14px' }}
                            />
                            <label htmlFor="showRequired" style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                                only show required field
                            </label>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex' }}>
                        <button
                            onClick={() => setCurrentTab('basic')}
                            style={{
                                padding: '10px 16px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: currentTab === 'basic' ? '#0f172a' : '#94a3b8',
                                borderBottom: currentTab === 'basic' ? '2px solid #0f172a' : '2px solid transparent',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                marginBottom: '-1px'
                            }}
                        >
                            Basic Details
                        </button>
                        <button
                            onClick={() => setCurrentTab('personal')}
                            style={{
                                padding: '10px 16px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: currentTab === 'personal' ? '#22c55e' : '#94a3b8',
                                borderBottom: currentTab === 'personal' ? '2px solid #22c55e' : '2px solid transparent',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                marginBottom: '-1px'
                            }}
                        >
                            Personal Details
                        </button>
                        <button
                            onClick={() => setCurrentTab('other')}
                            style={{
                                padding: '10px 16px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: currentTab === 'other' ? '#f59e0b' : '#94a3b8',
                                borderBottom: currentTab === 'other' ? '2px solid #f59e0b' : '2px solid transparent',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                marginBottom: '-1px'
                            }}
                        >
                            Other Details
                        </button>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '10px 0' }}>
                        {getCurrentTimestamp()}
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {currentTab === 'basic' ? (
                        <div>
                            {/* Basic Details Section */}
                            <div style={sectionTitleStyle}>Basic Details</div>

                            {/* Title, Name, Surname */}
                            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Title</label>
                                    <select
                                        style={inputStyle}
                                        value={formData.title}
                                        onChange={(e) => handleInputChange('title', e.target.value)}
                                    >
                                        <option value="">--Select Title--</option>
                                        <option value="Mr.">Mr.</option>
                                        <option value="Ms.">Ms.</option>
                                        <option value="Mrs.">Mrs.</option>
                                        <option value="Dr.">Dr.</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        placeholder="First name"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Surname</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        placeholder="surname"
                                        value={formData.surname}
                                        onChange={(e) => handleInputChange('surname', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Father/Husband Name */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Father/Husband Name</label>
                                <input
                                    type="text"
                                    style={inputStyle}
                                    placeholder="Enter father or husband name"
                                    value={formData.fatherHusbandName}
                                    onChange={(e) => handleInputChange('fatherHusbandName', e.target.value)}
                                />
                            </div>

                            {/* Country & Mobile Number */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Mobile Number <span style={{ color: '#ef4444' }}>*</span></label>
                                {formData.phones.map((phone, index) => (
                                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 80px', gap: '8px', marginBottom: '8px' }}>
                                        <select
                                            style={inputStyle}
                                            value={formData.countryCode}
                                            onChange={(e) => handleInputChange('countryCode', e.target.value)}
                                        >
                                            {COUNTRY_CODES.map((country) => (
                                                <option key={country.code} value={country.dial_code}>
                                                    {country.dial_code} ({country.name})
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="tel"
                                            style={inputStyle}
                                            placeholder="enter phone number"
                                            value={phone.number}
                                            onChange={(e) => handlePhoneChange(index, 'number', e.target.value)}
                                        />
                                        <select
                                            style={inputStyle}
                                            value={phone.type}
                                            onChange={(e) => handlePhoneChange(index, 'type', e.target.value)}
                                        >
                                            <option value="Personal">Personal</option>
                                            <option value="Work">Work</option>
                                            <option value="Home">Home</option>
                                        </select>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {index === formData.phones.length - 1 && (
                                                <button
                                                    type="button"
                                                    onClick={addPhone}
                                                    title="Add Phone"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    <i className="fas fa-plus"></i>
                                                </button>
                                            )}
                                            {formData.phones.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removePhone(index)}
                                                    title="Delete Phone"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        background: '#ef4444',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Email Address */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Email-Address <span style={{ color: '#ef4444' }}>*</span></label>
                                {formData.emails.map((email, index) => (
                                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="email"
                                            style={inputStyle}
                                            placeholder="enter email id"
                                            value={email.address}
                                            onChange={(e) => handleEmailChange(index, 'address', e.target.value)}
                                        />
                                        <select
                                            style={inputStyle}
                                            value={email.type}
                                            onChange={(e) => handleEmailChange(index, 'type', e.target.value)}
                                        >
                                            <option value="Personal">Personal</option>
                                            <option value="Work">Work</option>
                                        </select>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {index === formData.emails.length - 1 && (
                                                <button
                                                    type="button"
                                                    onClick={addEmail}
                                                    title="Add Email"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    <i className="fas fa-plus"></i>
                                                </button>
                                            )}
                                            {formData.emails.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeEmail(index)}
                                                    title="Delete Email"
                                                    style={{
                                                        flex: 1,
                                                        padding: '8px',
                                                        background: '#ef4444',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>



                            {/* Professional Details */}
                            {!showOnlyRequired && (
                                <>
                                    <div style={sectionTitleStyle}>Professional Details</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Profession Category</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.professionCategory}
                                                onChange={(e) => handleInputChange('professionCategory', e.target.value)}
                                            >
                                                <option value="">--Select profession category--</option>
                                                <option value="Buyer">Buyer</option>
                                                <option value="Seller">Seller</option>
                                                <option value="Investor">Investor</option>
                                                <option value="Channel Partner">Channel Partner</option>
                                                <option value="Broker">Broker</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Profession Sub-Category</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.professionSubCategory}
                                                onChange={(e) => handleInputChange('professionSubCategory', e.target.value)}
                                            >
                                                <option value="">--select sub-category--</option>
                                                <option value="Residential">Residential</option>
                                                <option value="Commercial">Commercial</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Designation</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.designation}
                                                onChange={(e) => handleInputChange('designation', e.target.value)}
                                            >
                                                <option value="">--select designation--</option>
                                                <option value="Manager">Manager</option>
                                                <option value="Executive">Executive</option>
                                                <option value="Director">Director</option>
                                                <option value="Owner">Owner</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Company/Organization/Department Name</label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <select style={{ ...inputStyle, flex: 1 }} value={formData.company} onChange={(e) => handleInputChange('company', e.target.value)}>
                                                    <option value="">--Select company--</option>
                                                    <option value="Company A">Company A</option>
                                                    <option value="Company B">Company B</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    style={{
                                                        padding: '8px 12px',
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* System Details */}
                            {!showOnlyRequired && (
                                <>
                                    <div style={sectionTitleStyle}>System Details</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Sources</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.source}
                                                onChange={(e) => handleInputChange('source', e.target.value)}
                                            >
                                                <option value="">--select source--</option>
                                                <option value="Website">Website</option>
                                                <option value="Referral">Referral</option>
                                                <option value="Cold Call">Cold Call</option>
                                                <option value="Social Media">Social Media</option>
                                                <option value="Walk-in">Walk-in</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Team</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.team}
                                                onChange={(e) => handleInputChange('team', e.target.value)}
                                            >
                                                <option value="">--Select team--</option>
                                                <option value="Sales">Sales</option>
                                                <option value="Marketing">Marketing</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Owner</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.owner}
                                                onChange={(e) => handleInputChange('owner', e.target.value)}
                                            >
                                                <option value="">--select owner--</option>
                                                <option value="Suraj (Sales)">Suraj (Sales)</option>
                                                <option value="Ramesh (Sales)">Ramesh (Sales)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Visible to</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.visibleTo}
                                                onChange={(e) => handleInputChange('visibleTo', e.target.value)}
                                            >
                                                <option value="">--select--</option>
                                                <option value="Everyone">Everyone</option>
                                                <option value="Team Only">Team Only</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : currentTab === 'personal' ? (
                        <div>
                            {/* Personal Details Tab */}
                            <div style={sectionTitleStyle}>Address Details</div>

                            {/* Address Type Selector */}
                            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={() => setCurrentAddressType('permanent')}
                                    style={{
                                        flex: 1,
                                        padding: '10px 16px',
                                        background: currentAddressType === 'permanent' ? '#3b82f6' : '#f1f5f9',
                                        color: currentAddressType === 'permanent' ? '#fff' : '#64748b',
                                        border: currentAddressType === 'permanent' ? '2px solid #2563eb' : '2px solid #e2e8f0',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <i className="fas fa-home" style={{ marginRight: '6px' }}></i>
                                    Permanent Address
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentAddressType('correspondence')}
                                    style={{
                                        flex: 1,
                                        padding: '10px 16px',
                                        background: currentAddressType === 'correspondence' ? '#10b981' : '#f1f5f9',
                                        color: currentAddressType === 'correspondence' ? '#fff' : '#64748b',
                                        border: currentAddressType === 'correspondence' ? '2px solid #059669' : '2px solid #e2e8f0',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <i className="fas fa-envelope" style={{ marginRight: '6px' }}></i>
                                    Correspondence Address
                                </button>
                            </div>

                            {/* Line 1: House Number */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>House Number / Building Name</label>
                                <input
                                    type="text"
                                    style={inputStyle}
                                    value={currentAddressType === 'permanent' ? formData.personalAddress.hNo : formData.correspondenceAddress.hNo}
                                    onChange={(e) => currentAddressType === 'permanent'
                                        ? handlePersonalAddressChange('hNo', e.target.value)
                                        : handleCorrespondenceAddressChange('hNo', e.target.value)
                                    }
                                    placeholder="Enter house number or building name"
                                />
                            </div>

                            {/* Line 2: Country, State, City */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Country</label>
                                    <select
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.country : formData.correspondenceAddress.country}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('country', e.target.value)
                                            : handleCorrespondenceAddressChange('country', e.target.value)
                                        }
                                    >
                                        <option value="">---Select country---</option>
                                        <option value="India">India</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>State</label>
                                    <select
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.state : formData.correspondenceAddress.state}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('state', e.target.value)
                                            : handleCorrespondenceAddressChange('state', e.target.value)
                                        }
                                    >
                                        <option value="">---Select state---</option>
                                        <option value="Punjab">Punjab</option>
                                        <option value="Haryana">Haryana</option>
                                        <option value="Chandigarh">Chandigarh</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>City</label>
                                    <select
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.city : formData.correspondenceAddress.city}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('city', e.target.value)
                                            : handleCorrespondenceAddressChange('city', e.target.value)
                                        }
                                    >
                                        <option value="">---Select city---</option>
                                        <option value="Chandigarh">Chandigarh</option>
                                        <option value="Mohali">Mohali</option>
                                        <option value="Panchkula">Panchkula</option>
                                    </select>
                                </div>
                            </div>

                            {/* Line 3: Tehsil, Post Office, Pincode */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Tehsil</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.tehsil : formData.correspondenceAddress.tehsil}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('tehsil', e.target.value)
                                            : handleCorrespondenceAddressChange('tehsil', e.target.value)
                                        }
                                        placeholder="Enter tehsil"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Post Office</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.postOffice : formData.correspondenceAddress.postOffice}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('postOffice', e.target.value)
                                            : handleCorrespondenceAddressChange('postOffice', e.target.value)
                                        }
                                        placeholder="Enter post office"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Pin Code</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.pinCode : formData.correspondenceAddress.pinCode}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('pinCode', e.target.value)
                                            : handleCorrespondenceAddressChange('pinCode', e.target.value)
                                        }
                                        placeholder="Enter pin code"
                                        maxLength="6"
                                    />
                                </div>
                            </div>

                            {/* Line 4: Location, Area */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Location / Landmark</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.location : formData.correspondenceAddress.location}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('location', e.target.value)
                                            : handleCorrespondenceAddressChange('location', e.target.value)
                                        }
                                        placeholder="Enter location or landmark"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Area / Locality</label>
                                    <input
                                        type="text"
                                        style={inputStyle}
                                        value={currentAddressType === 'permanent' ? formData.personalAddress.area : formData.correspondenceAddress.area}
                                        onChange={(e) => currentAddressType === 'permanent'
                                            ? handlePersonalAddressChange('area', e.target.value)
                                            : handleCorrespondenceAddressChange('area', e.target.value)
                                        }
                                        placeholder="Enter area or locality"
                                    />
                                </div>
                            </div>

                            <div style={sectionTitleStyle}>Other Details</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Gender</label>
                                    <select
                                        style={inputStyle}
                                        value={formData.gender}
                                        onChange={(e) => handleInputChange('gender', e.target.value)}
                                    >
                                        <option value="">---Select gender---</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Marital Status</label>
                                    <select
                                        style={inputStyle}
                                        value={formData.maritalStatus}
                                        onChange={(e) => handleInputChange('maritalStatus', e.target.value)}
                                    >
                                        <option value="">---Select your status---</option>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Birth Date</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={formData.birthDate}
                                        onChange={(e) => handleInputChange('birthDate', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Anniversary Date</label>
                                    <input
                                        type="date"
                                        style={inputStyle}
                                        value={formData.anniversaryDate}
                                        onChange={(e) => handleInputChange('anniversaryDate', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Document */}
                            <div style={sectionTitleStyle}>Document</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Document No</label>
                                    <select
                                        style={inputStyle}
                                        value={formData.documentNo}
                                        onChange={(e) => handleInputChange('documentNo', e.target.value)}
                                    >
                                        <option value="">---select document---</option>
                                        <option value="Aadhar">Aadhar</option>
                                        <option value="PAN">PAN</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Document Name</label>
                                    <select
                                        style={inputStyle}
                                        value={formData.documentName}
                                        onChange={(e) => handleInputChange('documentName', e.target.value)}
                                    >
                                        <option value="">---select document---</option>
                                        <option value="ID Proof">ID Proof</option>
                                        <option value="Address Proof">Address Proof</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Document Picture</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            style={{ display: 'none' }}
                                            id="documentUpload"
                                        />
                                        <label
                                            htmlFor="documentUpload"
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                textAlign: 'center',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <i className="fas fa-upload"></i>
                                            Upload Image
                                        </label>
                                        <button
                                            type="button"
                                            style={{
                                                padding: '8px 12px',
                                                background: '#3b82f6',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}
                                        >
                                            add
                                        </button>
                                    </div>
                                    {formData.documentPicture && (
                                        <div style={{ fontSize: '0.7rem', color: '#22c55e', marginTop: '4px' }}>
                                            ✓ {formData.documentPicture.name}
                                        </div>
                                    )}
                                </div>
                            </div>


                        </div>
                    ) : (
                        <div>
                            {/* Other Details Tab */}
                            <div style={sectionTitleStyle}>Other Details</div>

                            {/* Tags - Top Priority */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Tags</label>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    padding: '8px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    minHeight: '42px',
                                    alignItems: 'center'
                                }}>
                                    {formData.tags.map((tag, index) => (
                                        <div key={index} style={{
                                            background: '#eff6ff',
                                            color: '#2563eb',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            {tag}
                                            <i
                                                className="fas fa-times"
                                                style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                                                onClick={() => removeTag(index)}
                                            ></i>
                                        </div>
                                    ))}
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={handleTagKeyDown}
                                        placeholder="Type and press Enter to add tags..."
                                        style={{
                                            border: 'none',
                                            outline: 'none',
                                            fontSize: '0.85rem',
                                            flex: 1,
                                            minWidth: '120px',
                                            background: 'transparent'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Description - Large Box */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={labelStyle}>Description</label>
                                <textarea
                                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Enter detailed description..."
                                />
                            </div>

                            {/* Education Section - 3rd Position */}
                            <div style={sectionTitleStyle}>Education</div>
                            {formData.educations.map((edu, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(100px, 1fr) 2fr 40px', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Education</label>}
                                        <select
                                            style={inputStyle}
                                            value={edu.education}
                                            onChange={(e) => handleEducationChange(index, 'education', e.target.value)}
                                        >
                                            <option value="">---select---</option>
                                            <option value="Graduate">Graduate</option>
                                            <option value="Post Graduate">Post Graduate</option>
                                            <option value="Diploma">Diploma</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Degree</label>}
                                        <select
                                            style={inputStyle}
                                            value={edu.degree}
                                            onChange={(e) => handleEducationChange(index, 'degree', e.target.value)}
                                        >
                                            <option value="">---select---</option>
                                            <option value="BA">BA</option>
                                            <option value="BSc">BSc</option>
                                            <option value="BCom">BCom</option>
                                            <option value="BTech">BTech</option>
                                            <option value="MBA">MBA</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>School/College</label>}
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            value={edu.school}
                                            onChange={(e) => handleEducationChange(index, 'school', e.target.value)}
                                            placeholder="Enter school/college"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: index === 0 ? 'flex-end' : 'center' }}>
                                        {index === formData.educations.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={addEducation}
                                                style={{ padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        )}
                                        {formData.educations.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeEducation(index)}
                                                style={{ padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Income Section - 4th Position */}
                            <div style={sectionTitleStyle}>Income Details</div>
                            {formData.incomes.map((inc, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Income Type</label>}
                                        <select
                                            style={inputStyle}
                                            value={inc.incomeType}
                                            onChange={(e) => handleIncomeChange(index, 'incomeType', e.target.value)}
                                        >
                                            <option value="">---Select Type---</option>
                                            <option value="Salary">Salary</option>
                                            <option value="Business">Business</option>
                                            <option value="Rental">Rental</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Amount</label>}
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            value={inc.amount}
                                            onChange={(e) => handleIncomeChange(index, 'amount', e.target.value)}
                                            placeholder="Enter amount"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: index === 0 ? 'flex-end' : 'center' }}>
                                        {index === formData.incomes.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={addIncome}
                                                style={{ padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        )}
                                        {formData.incomes.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeIncome(index)}
                                                style={{ padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Loan Section - 5th Position */}
                            <div style={sectionTitleStyle}>Loan</div>
                            {formData.loans.map((loan, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Loan Type</label>}
                                        <select
                                            style={inputStyle}
                                            value={loan.loanType}
                                            onChange={(e) => handleLoanChange(index, 'loanType', e.target.value)}
                                        >
                                            <option value="">---select---</option>
                                            <option value="Home Loan">Home Loan</option>
                                            <option value="Personal Loan">Personal Loan</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Bank</label>}
                                        <select
                                            style={inputStyle}
                                            value={loan.bank}
                                            onChange={(e) => handleLoanChange(index, 'bank', e.target.value)}
                                        >
                                            <option value="">---select---</option>
                                            <option value="HDFC">HDFC</option>
                                            <option value="ICICI">ICICI</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Amount</label>}
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            value={loan.loanAmount}
                                            onChange={(e) => handleLoanChange(index, 'loanAmount', e.target.value)}
                                            placeholder="Amount"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: index === 0 ? 'flex-end' : 'center' }}>
                                        {index === formData.loans.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={addLoan}
                                                style={{ padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        )}
                                        {formData.loans.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeLoan(index)}
                                                style={{ padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Social Media - 6th Position */}
                            <div style={sectionTitleStyle}>Social Media</div>
                            {formData.socialMedia.map((social, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 40px', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>Platform</label>}
                                        <select
                                            style={inputStyle}
                                            value={social.platform}
                                            onChange={(e) => handleSocialChange(index, 'platform', e.target.value)}
                                        >
                                            <option value="">---select---</option>
                                            <option value="Facebook">Facebook</option>
                                            <option value="LinkedIn">LinkedIn</option>
                                            <option value="Instagram">Instagram</option>
                                            <option value="Twitter">Twitter</option>
                                        </select>
                                    </div>
                                    <div>
                                        {index === 0 && <label style={labelStyle}>URL</label>}
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            value={social.url}
                                            onChange={(e) => handleSocialChange(index, 'url', e.target.value)}
                                            placeholder="Enter profile URL"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: index === 0 ? 'flex-end' : 'center' }}>
                                        {index === formData.socialMedia.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={addSocial}
                                                style={{ padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-plus"></i>
                                            </button>
                                        )}
                                        {formData.socialMedia.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeSocial(index)}
                                                style={{ padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1 }}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                        </div>

                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: (currentTab === 'personal' || currentTab === 'other') ? 'space-between' : 'flex-end',
                    gap: '12px'
                }}>
                    {(currentTab === 'personal' || currentTab === 'other') && (
                        <button
                            onClick={() => setCurrentTab(currentTab === 'personal' ? 'basic' : 'personal')}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '6px',
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Prev
                        </button>
                    )}

                    {currentTab === 'basic' && (
                        <button
                            onClick={() => setCurrentTab('personal')}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '6px',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Next
                        </button>
                    )}

                    {currentTab === 'personal' && (
                        <button
                            onClick={() => setCurrentTab('other')}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '6px',
                                background: '#22c55e',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Next
                        </button>
                    )}

                    {currentTab === 'other' && (
                        <button
                            onClick={handleSubmit}
                            style={{
                                padding: '8px 24px',
                                borderRadius: '6px',
                                background: '#f59e0b',
                                color: '#fff',
                                border: 'none',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            Save
                        </button>
                    )}
                </div>
            </div >
        </div >
    );
};

export default AddContactModal;
