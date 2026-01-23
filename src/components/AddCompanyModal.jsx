import React, { useState, useEffect, useRef } from 'react';
import { INDIAN_ADDRESS_DATA } from '../data/locationData';
import { contactData } from '../data/mockData';

const COUNTRY_CODES = [
    { name: 'India', dial_code: '+91', code: 'IN' },
    { name: 'United States', dial_code: '+1', code: 'US' },
    { name: 'United Kingdom', dial_code: '+44', code: 'GB' },
    { name: 'Australia', dial_code: '+61', code: 'AU' },
];

const COMPANY_TYPES = ['Private Limited', 'Public Limited', 'Partnership', 'Proprietorship', 'LLP', 'NGO', 'Other'];
const INDUSTRIES = ['Real Estate', 'Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Other'];
const SOURCES = ['Instagram', 'Facebook', 'LinkedIn', 'Google Ads', 'Referral', 'Website', 'Walk-in', 'Cold Call', 'Other'];
const TEAMS = ['Sales', 'Marketing', 'Operations', 'Finance', 'Support'];
const OWNER_EMPLOYEES = ['Suresh Kumar', 'Ramesh Sharma', 'Anjali Gupta', 'Vikram Singh'];

const SUB_CATEGORIES = ['Sales Person', 'Real Estate Agent', 'Real Estate', 'IT & Software', 'Banking & Finance', 'Manufacturing', 'Retail', 'Healthcare', 'Education', 'Legal', 'Construction', 'Government', 'Other'];
const DESIGNATIONS = ['Owner', 'CEO / Founder', 'Director', 'Manager', 'Team Lead', 'Senior Executive', 'Associate', 'Developer', 'Consultant', 'HR', 'Accountant', 'Other'];

const AnimatedSegmentControl = ({ options, value, onChange }) => {
    const [activeIndex, setActiveIndex] = useState(options.indexOf(value));

    useEffect(() => {
        setActiveIndex(options.indexOf(value));
    }, [value, options]);

    const handleSelect = (option, index) => {
        setActiveIndex(index);
        onChange(option);
    };

    return (
        <div style={{
            position: 'relative',
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: '12px',
            padding: '4px',
            border: '1px solid #e2e8f0',
            height: '48px',
            isolation: 'isolate'
        }}>
            <div style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: `calc(${activeIndex * (100 / options.length)}% + 4px)`,
                width: `calc(${100 / options.length}% - 8px)`,
                background: '#fff',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 1
            }} />

            {options.map((option, index) => (
                <button
                    key={option}
                    type="button"
                    onClick={() => handleSelect(option, index)}
                    style={{
                        flex: 1,
                        position: 'relative',
                        zIndex: 2,
                        background: 'transparent',
                        border: 'none',
                        fontSize: '0.85rem',
                        fontWeight: value === option ? 700 : 500,
                        color: value === option ? '#10b981' : '#64748b',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {option}
                </button>
            ))}
        </div>
    );
};

const ADDRESS_TYPES = ['Registered Office', 'Branch Office', 'Corporate Office', 'Head Office', 'Site Office'];

function AddCompanyModal({ isOpen, onClose, onAdd, initialData }) {
    const isEdit = !!initialData;
    const [currentTab, setCurrentTab] = useState('basic');
    const [currentAddressType, setCurrentAddressType] = useState('Registered Office');
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Employee Search States
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [selectedContactToLink, setSelectedContactToLink] = useState(null);
    const [linkData, setLinkData] = useState({ designation: '', subCategory: '' });

    const initialAddress = {
        hNo: '', street: '', city: '', state: '', tehsil: '', postOffice: '', pinCode: '', country: 'India'
    };

    const [formData, setFormData] = useState({
        name: '',
        phones: [{ phoneCode: '+91', phoneNumber: '', type: 'Work' }],
        emails: [{ address: '', type: 'Work' }],
        companyType: '',
        industry: '',
        description: '',
        gstNumber: '',
        source: 'Instagram',
        team: 'Sales',
        owner: 'Suresh Kumar',
        visibleTo: 'My Team',
        addresses: {
            'Registered Office': { ...initialAddress },
            'Branch Office': { ...initialAddress },
            'Corporate Office': { ...initialAddress },
            'Head Office': { ...initialAddress },
            'Site Office': { ...initialAddress }
        },
        employees: []
    });

    // Initialize form with initialData if editing
    useEffect(() => {
        if (isEdit && isOpen) {
            setFormData({
                name: initialData.name || '',
                phones: initialData.phone ? [{ phoneCode: '+91', phoneNumber: initialData.phone, type: 'Work' }] : [{ phoneCode: '+91', phoneNumber: '', type: 'Work' }],
                emails: initialData.email ? [{ address: initialData.email, type: 'Work' }] : [{ address: '', type: 'Work' }],
                companyType: initialData.type || '',
                industry: initialData.category || '', // Mapping industry
                description: initialData.description || '',
                gstNumber: initialData.gstNumber || '',
                source: initialData.source || 'Instagram',
                team: initialData.team || 'Sales',
                owner: initialData.ownership || 'Suresh Kumar',
                visibleTo: initialData.visibleTo || 'Everyone',
                addresses: initialData.addresses || {
                    'Registered Office': { ...initialAddress },
                    'Branch Office': { ...initialAddress },
                    'Corporate Office': { ...initialAddress },
                    'Head Office': { ...initialAddress },
                    'Site Office': { ...initialAddress }
                },
                employees: initialData.employeesData || []
            });
        } else if (!isEdit && isOpen) {
            // Reset to default for new company
            setFormData({
                name: '',
                phones: [{ phoneCode: '+91', phoneNumber: '', type: 'Work' }],
                emails: [{ address: '', type: 'Work' }],
                companyType: '',
                industry: '',
                description: '',
                gstNumber: '',
                source: 'Instagram',
                team: 'Sales',
                owner: 'Suresh Kumar',
                visibleTo: 'Everyone',
                addresses: {
                    'Registered Office': { ...initialAddress },
                    'Branch Office': { ...initialAddress },
                    'Corporate Office': { ...initialAddress },
                    'Head Office': { ...initialAddress },
                    'Site Office': { ...initialAddress }
                },
                employees: []
            });
        }
    }, [isOpen, initialData, isEdit]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!isOpen) return null;

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handlePhoneChange = (index, field, value) => {
        const newPhones = [...formData.phones];
        newPhones[index][field] = value;
        setFormData({ ...formData, phones: newPhones });
    };

    const addPhone = () => {
        setFormData({
            ...formData,
            phones: [...formData.phones, { phoneCode: '+91', phoneNumber: '', type: 'Work' }]
        });
    };

    const removePhone = (index) => {
        const newPhones = formData.phones.filter((_, i) => i !== index);
        setFormData({ ...formData, phones: newPhones });
    };

    const handleEmailChange = (index, field, value) => {
        const newEmails = [...formData.emails];
        newEmails[index][field] = value;
        setFormData({ ...formData, emails: newEmails });
    };

    const addEmail = () => {
        setFormData({
            ...formData,
            emails: [...formData.emails, { address: '', type: 'Work' }]
        });
    };

    const removeEmail = (index) => {
        const newEmails = formData.emails.filter((_, i) => i !== index);
        setFormData({ ...formData, emails: newEmails });
    };

    const handleLinkEmployee = () => {
        if (!selectedContactToLink || !linkData.designation || !linkData.subCategory) return;

        const newEmployee = {
            ...selectedContactToLink,
            designation: linkData.designation,
            professionSubCategory: linkData.subCategory,
            isNew: true
        };

        setFormData(prev => ({
            ...prev,
            employees: [newEmployee, ...prev.employees]
        }));

        // Reset
        setSelectedContactToLink(null);
        setLinkData({ designation: '', subCategory: '' });
        setEmployeeSearch('');
    };

    const removeEmployee = (contactId) => {
        setFormData(prev => ({
            ...prev,
            employees: prev.employees.filter(emp => emp.mobile !== contactId)
        }));
    };

    const handleAddressChange = (type, field, value) => {
        setFormData(prev => ({
            ...prev,
            addresses: {
                ...prev.addresses,
                [type]: {
                    ...prev.addresses[type],
                    [field]: value,
                    // Clear downstream fields if upstream changes
                    ...(field === 'state' ? { city: '', tehsil: '', postOffice: '', pinCode: '' } : {}),
                    ...(field === 'city' ? { tehsil: '', postOffice: '', pinCode: '' } : {})
                }
            }
        }));
    };

    const handleNext = () => {
        if (currentTab === 'basic') setCurrentTab('address');
        else if (currentTab === 'address') setCurrentTab('employee');
    };

    const handlePrev = () => {
        if (currentTab === 'employee') setCurrentTab('address');
        else if (currentTab === 'address') setCurrentTab('basic');
    };

    const handleSave = () => {
        onAdd(formData);
        onClose();
    };

    // Style Constants
    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        outline: 'none',
        color: '#1e293b',
        transition: 'all 0.2s',
        height: '42px',
        boxSizing: 'border-box',
        backgroundColor: '#fff'
    };

    const labelStyle = {
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#475569',
        marginBottom: '6px',
        display: 'block'
    };

    const customSelectStyle = {
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px'
    };

    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
        secondary: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
        primary: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' }
    };

    const addButtonStyle = {
        width: '42px', height: '42px', borderRadius: '8px', border: '1.5px solid #e2e8f0',
        background: '#fff', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0
    };

    const renderBasicDetails = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        style={{ ...inputStyle, border: '1.5px solid #e2e8f0' }}
                        placeholder="Enter company name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                    />
                </div>

                {!showOnlyRequired && (
                    <>
                        {formData.phones.map((phone, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr 1fr 42px', gap: '12px', marginBottom: '16px', alignItems: 'end' }}>
                                <div>
                                    {idx === 0 && <label style={labelStyle}>Country</label>}
                                    <select style={customSelectStyle} value={phone.phoneCode} onChange={(e) => handlePhoneChange(idx, 'phoneCode', e.target.value)}>
                                        {COUNTRY_CODES.map(c => <option key={c.code} value={c.dial_code}>{c.name} ({c.dial_code})</option>)}
                                    </select>
                                </div>
                                <div>
                                    {idx === 0 && <label style={labelStyle}>Mobile Number</label>}
                                    <input style={inputStyle} placeholder="Enter phone number" value={phone.phoneNumber} onChange={(e) => handlePhoneChange(idx, 'phoneNumber', e.target.value)} />
                                </div>
                                <div>
                                    {idx === 0 && <label style={labelStyle}>Type</label>}
                                    <select style={customSelectStyle} value={phone.type} onChange={(e) => handlePhoneChange(idx, 'type', e.target.value)}>
                                        <option value="Work">Work</option>
                                        <option value="Personal">Personal</option>
                                        <option value="Fax">Fax</option>
                                    </select>
                                </div>
                                <button
                                    style={{
                                        ...addButtonStyle,
                                        background: idx === 0 ? '#fff' : '#fef2f2',
                                        color: idx === 0 ? '#64748b' : '#ef4444',
                                        borderColor: idx === 0 ? '#e2e8f0' : '#fecaca'
                                    }}
                                    onClick={idx === 0 ? addPhone : () => removePhone(idx)}
                                    title={idx === 0 ? 'Add more' : 'Remove'}
                                >
                                    <i className={idx === 0 ? "fas fa-plus" : "fas fa-trash-alt"} style={{ fontSize: '0.8rem' }}></i>
                                </button>
                            </div>
                        ))}

                        {formData.emails.map((email, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 42px', gap: '12px', marginBottom: '16px', alignItems: 'end' }}>
                                <div>
                                    {idx === 0 && <label style={labelStyle}>Email Address</label>}
                                    <input style={inputStyle} placeholder="Enter email address" value={email.address} onChange={(e) => handleEmailChange(idx, 'address', e.target.value)} />
                                </div>
                                <div>
                                    {idx === 0 && <label style={labelStyle}>Type</label>}
                                    <select style={customSelectStyle} value={email.type} onChange={(e) => handleEmailChange(idx, 'type', e.target.value)}>
                                        <option value="Work">Work</option>
                                        <option value="Personal">Personal</option>
                                    </select>
                                </div>
                                <button
                                    style={{
                                        ...addButtonStyle,
                                        background: idx === 0 ? '#fff' : '#fef2f2',
                                        color: idx === 0 ? '#64748b' : '#ef4444',
                                        borderColor: idx === 0 ? '#e2e8f0' : '#fecaca'
                                    }}
                                    onClick={idx === 0 ? addEmail : () => removeEmail(idx)}
                                    title={idx === 0 ? 'Add more' : 'Remove'}
                                >
                                    <i className={idx === 0 ? "fas fa-plus" : "fas fa-trash-alt"} style={{ fontSize: '0.8rem' }}></i>
                                </button>
                            </div>
                        ))}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '8px' }}>
                            <div>
                                <label style={labelStyle}>Company Type</label>
                                <select style={customSelectStyle} value={formData.companyType} onChange={(e) => handleInputChange('companyType', e.target.value)}>
                                    <option value="">---Select Type---</option>
                                    {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Industry</label>
                                <select style={customSelectStyle} value={formData.industry} onChange={(e) => handleInputChange('industry', e.target.value)}>
                                    <option value="">---Choose Industry---</option>
                                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <label style={labelStyle}>Description</label>
                            <textarea
                                style={{ ...inputStyle, height: '100px', resize: 'vertical', paddingTop: '10px' }}
                                placeholder="Enter company profile or notes..."
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                            />
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <label style={labelStyle}>GST Number</label>
                            <input style={inputStyle} placeholder="Enter GSTIN Number" value={formData.gstNumber} onChange={(e) => handleInputChange('gstNumber', e.target.value)} />
                        </div>
                    </>
                )}
            </div>

            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ ...labelStyle, fontSize: '1rem', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-cogs" style={{ color: '#10b981' }}></i> System Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                        <label style={labelStyle}>Source</label>
                        <select style={customSelectStyle} value={formData.source} onChange={(e) => handleInputChange('source', e.target.value)}>
                            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Team</label>
                        <select style={customSelectStyle} value={formData.team} onChange={(e) => handleInputChange('team', e.target.value)}>
                            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Owner</label>
                        <select style={customSelectStyle} value={formData.owner} onChange={(e) => handleInputChange('owner', e.target.value)}>
                            {OWNER_EMPLOYEES.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Visible to</label>
                        <select style={customSelectStyle} value={formData.visibleTo} onChange={(e) => handleInputChange('visibleTo', e.target.value)}>
                            <option value="My Team">My Team</option>
                            <option value="Everyone">Everyone</option>
                            <option value="Private">Private</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );

    const addr = formData.addresses[currentAddressType];
    const states = Object.keys(INDIAN_ADDRESS_DATA.India).sort();
    const cities = addr.state ? Object.keys(INDIAN_ADDRESS_DATA.India[addr.state] || {}).sort() : [];
    const tehsils = (addr.state && addr.city) ? (INDIAN_ADDRESS_DATA.India[addr.state][addr.city]?.tehsils || []) : [];
    const postOffices = (addr.state && addr.city) ? (INDIAN_ADDRESS_DATA.India[addr.state][addr.city]?.postOffices || []) : [];

    const renderAddress = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ marginBottom: '10px' }}>
                <AnimatedSegmentControl
                    options={ADDRESS_TYPES}
                    value={currentAddressType}
                    onChange={setCurrentAddressType}
                />
            </div>

            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ ...labelStyle, fontSize: '1.1rem', color: '#10b981', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-map-marked-alt"></i> {currentAddressType} Details
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div style={{ gridColumn: 'span 1' }}>
                        <label style={labelStyle}>House / Building No.</label>
                        <input style={inputStyle} placeholder="e.g. 102, Landmark" value={addr.hNo} onChange={(e) => handleAddressChange(currentAddressType, 'hNo', e.target.value)} />
                    </div>
                    <div style={{ gridColumn: 'span 1' }}>
                        <label style={labelStyle}>Street / Road / Sector</label>
                        <input style={inputStyle} placeholder="e.g. MG Road, Sector 14" value={addr.street} onChange={(e) => handleAddressChange(currentAddressType, 'street', e.target.value)} />
                    </div>

                    <div>
                        <label style={labelStyle}>Country</label>
                        <input style={{ ...inputStyle, background: '#f8fafc', fontWeight: 600 }} value="India" readOnly />
                    </div>
                    <div>
                        <label style={labelStyle}>State</label>
                        <select style={customSelectStyle} value={addr.state} onChange={(e) => handleAddressChange(currentAddressType, 'state', e.target.value)}>
                            <option value="">Select State</option>
                            {states.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle}>City</label>
                        <select style={customSelectStyle} value={addr.city} onChange={(e) => handleAddressChange(currentAddressType, 'city', e.target.value)} disabled={!addr.state}>
                            <option value="">Select City</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Tehsil</label>
                        <select style={customSelectStyle} value={addr.tehsil} onChange={(e) => handleAddressChange(currentAddressType, 'tehsil', e.target.value)} disabled={!addr.city}>
                            <option value="">Select Tehsil</option>
                            {tehsils.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle}>Post Office</label>
                        <select
                            style={customSelectStyle}
                            value={addr.postOffice}
                            onChange={(e) => {
                                const po = postOffices.find(po => po.name === e.target.value);
                                handleAddressChange(currentAddressType, 'postOffice', e.target.value);
                                if (po) handleAddressChange(currentAddressType, 'pinCode', po.pinCode);
                            }}
                            disabled={!addr.city}
                        >
                            <option value="">Select Post Office</option>
                            {postOffices.map(po => <option key={po.name} value={po.name}>{po.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Pin Code</label>
                        <input style={inputStyle} placeholder="Enter 6 digit PIN" value={addr.pinCode} onChange={(e) => handleAddressChange(currentAddressType, 'pinCode', e.target.value)} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', padding: '12px', background: '#ecfdf5', borderRadius: '12px', border: '1px solid #d1fae5' }}>
                <i className="fas fa-info-circle" style={{ color: '#059669', marginTop: '3px' }}></i>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#065f46', lineHeight: 1.5 }}>
                    You can switch between different office types above. Each address is saved independently for this company.
                </p>
            </div>
        </div>
    );

    const filteredContacts = employeeSearch.length > 1
        ? contactData.filter(c =>
            c.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
            c.mobile.includes(employeeSearch)
        ).filter(c => !formData.employees.some(emp => emp.mobile === c.mobile))
        : [];

    const renderEmployees = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Search & Add Section */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ width: '40px', height: '40px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-search-plus" style={{ color: '#10b981' }}></i>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Add Authorized Employees</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Search existing contacts to link them as company signatories</p>
                    </div>
                </div>

                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                            <input
                                style={{ ...inputStyle, paddingLeft: '40px', background: '#f8fafc' }}
                                placeholder="Search by name or mobile number..."
                                value={employeeSearch}
                                onChange={(e) => {
                                    setEmployeeSearch(e.target.value);
                                    setShowSearchResults(true);
                                }}
                                onFocus={() => setShowSearchResults(true)}
                            />
                        </div>
                    </div>

                    {showSearchResults && filteredContacts.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '8px', zIndex: 100, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' }}>
                            {filteredContacts.map(contact => (
                                <div
                                    key={contact.mobile}
                                    onClick={() => {
                                        setSelectedContactToLink(contact);
                                        setShowSearchResults(false);
                                        setLinkData({ designation: contact.designation || '', subCategory: contact.professionSubCategory || '' });
                                    }}
                                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}
                                    className="hover-bg-f8fafc"
                                >
                                    <div style={{ width: '36px', height: '36px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                                        {contact.name.charAt(4)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{contact.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{contact.mobile} • {contact.professional || 'Prospect'}</div>
                                    </div>
                                    <i className="fas fa-plus-circle" style={{ color: '#10b981' }}></i>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Contact Pre-add Form */}
                {selectedContactToLink && (
                    <div style={{ marginTop: '24px', padding: '20px', background: '#f0fdf4', borderRadius: '16px', border: '1.5px dashed #10b981' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '48px', height: '48px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    <i className="fas fa-user-check" style={{ fontSize: '1.2rem', color: '#10b981' }}></i>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Link Contact</span>
                                    <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{selectedContactToLink.name}</h5>
                                </div>
                            </div>
                            <button onClick={() => setSelectedContactToLink(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ ...labelStyle, color: '#065f46' }}>Professional Sub Category <span style={{ color: '#ef4444' }}>*</span></label>
                                <select
                                    style={{ ...customSelectStyle, background: '#fff' }}
                                    value={linkData.subCategory}
                                    onChange={(e) => setLinkData(prev => ({ ...prev, subCategory: e.target.value }))}
                                >
                                    <option value="">Select Category</option>
                                    {SUB_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ ...labelStyle, color: '#065f46' }}>Designation <span style={{ color: '#ef4444' }}>*</span></label>
                                <select
                                    style={{ ...customSelectStyle, background: '#fff' }}
                                    value={linkData.designation}
                                    onChange={(e) => setLinkData(prev => ({ ...prev, designation: e.target.value }))}
                                >
                                    <option value="">Select Designation</option>
                                    {DESIGNATIONS.map(des => <option key={des} value={des}>{des}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleLinkEmployee}
                                disabled={!linkData.designation || !linkData.subCategory}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '10px',
                                    background: (linkData.designation && linkData.subCategory) ? '#10b981' : '#cbd5e1',
                                    color: '#fff',
                                    border: 'none',
                                    fontWeight: 700,
                                    cursor: (linkData.designation && linkData.subCategory) ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <i className="fas fa-link"></i> Link as Employee
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Added Employees List */}
            <div style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Authorized Signatories ({formData.employees.length})</h4>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Real-time synchronization active</span>
                </div>

                {formData.employees.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' }}>
                        <div style={{ width: '80px', height: '80px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                            <i className="fas fa-users-cog" style={{ fontSize: '2.5rem', color: '#cbd5e1' }}></i>
                        </div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>No Signatories Added</h4>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', maxWidth: '350px' }}>
                            Use the search bar above to find and link contacts as primary or secondary authorized signatories.
                        </p>
                    </div>
                ) : (
                    <div style={{ padding: '12px' }}>
                        {formData.employees.map(emp => (
                            <div key={emp.mobile} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '14px', border: '1px solid #f1f5f9', marginBottom: '12px', transition: 'all 0.2s' }} className="hover-shadow-sm">
                                <div style={{ width: '44px', height: '44px', background: '#ecfdf5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#059669' }}>
                                    {emp.name.charAt(4)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{emp.name}</div>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                            <i className="fas fa-briefcase" style={{ marginRight: '4px', fontSize: '0.7rem' }}></i> {emp.designation}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                            <i className="fas fa-id-badge" style={{ marginRight: '4px', fontSize: '0.7rem' }}></i> {emp.professionSubCategory}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', paddingRight: '12px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>{emp.mobile}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Linked Contact</div>
                                </div>
                                <button
                                    onClick={() => removeEmployee(emp.mobile)}
                                    style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fff', border: '1.5px solid #fecaca', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '16px', border: '1px solid #dbeafe', display: 'flex', gap: '12px' }}>
                <i className="fas fa-sync-alt" style={{ color: '#3b82f6', marginTop: '3px' }}></i>
                <div>
                    <h6 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#1e40af' }}>Professional Synchronization</h6>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.4 }}>
                        Updating the designation or sub-category here will automatically reflect in the individual's contact profile for better consistency across the CRM.
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, animation: 'fadeIn 0.2s ease-out' }} onClick={onClose}>
            <div style={{ background: '#fff', width: '950px', maxWidth: '95vw', maxHeight: '92vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                            {isEdit ? 'Update Company' : 'Create New Company'}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <input
                                type="checkbox"
                                checked={showOnlyRequired}
                                onChange={e => {
                                    setShowOnlyRequired(e.target.checked);
                                    if (e.target.checked) setCurrentTab('basic');
                                }}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Show Required Only</span>
                        </div>
                    </div>
                </div>

                {!showOnlyRequired && (
                    <div style={{ padding: '0 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '32px', background: '#fff' }}>
                        {[
                            { id: 'basic', label: 'Basic Details', icon: 'fa-info-circle' },
                            { id: 'address', label: 'Office Locations', icon: 'fa-map-marker-alt' },
                            { id: 'employee', label: 'Employees', icon: 'fa-users' }
                        ].map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    padding: '16px 4px',
                                    fontSize: '0.95rem',
                                    fontWeight: currentTab === tab.id ? 700 : 500,
                                    color: currentTab === tab.id ? '#10b981' : '#64748b',
                                    borderBottom: `3px solid ${currentTab === tab.id ? '#10b981' : 'transparent'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <i className={`fas ${tab.icon}`} style={{ fontSize: '0.9rem' }}></i>
                                {tab.label}
                            </div>
                        ))}
                        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', fontStyle: 'italic' }}>
                            <i className="far fa-clock"></i> {currentTime.toLocaleDateString()} {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, padding: '32px', overflowY: 'auto', background: '#f8fafc' }}>
                    {currentTab === 'basic' && renderBasicDetails()}
                    {currentTab === 'address' && renderAddress()}
                    {currentTab === 'employee' && renderEmployees()}
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 32px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <button style={buttonStyle.cancel} onClick={onClose}>Cancel</button>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        {currentTab !== 'basic' && (
                            <button style={buttonStyle.secondary} onClick={handlePrev}>Previous</button>
                        )}

                        {currentTab !== 'employee' ? (
                            <button style={buttonStyle.primary} onClick={handleNext}>Next</button>
                        ) : (
                            <button style={buttonStyle.success} onClick={handleSave}>{isEdit ? 'Update Company' : 'Save Company'}</button>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #f8fafc; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; borderRadius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
}

export default AddCompanyModal;
