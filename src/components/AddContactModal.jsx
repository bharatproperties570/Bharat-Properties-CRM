import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

import { INDIAN_ADDRESS_DATA } from '../data/locationData';
import { companyData } from '../data/companyData';
import api from "../../api";

// Simple Custom Multi-Select Component
const CustomMultiSelect = ({ options, value, onChange, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (option) => {
        const newValue = value.includes(option)
            ? value.filter(v => v !== option)
            : [...value, option];
        onChange(newValue);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.9rem',
                    color: '#334155',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    background: disabled ? '#f8fafc' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '40px'
                }}
            >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                    {value.length > 0 ? value.join(', ') : <span style={{ color: '#94a3b8' }}>{placeholder}</span>}
                </div>
                <i className={`fas fa-chevron-down ${isOpen ? 'fa-rotate-180' : ''}`} style={{ color: '#94a3b8', transition: 'transform 0.2s', fontSize: '0.8rem' }}></i>
            </div>

            {isOpen && !disabled && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '4px', zIndex: 50, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    {options.length > 0 ? options.map(opt => (
                        <div
                            key={opt}
                            onClick={() => toggleOption(opt)}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderBottom: '1px solid #f1f5f9',
                                background: value.includes(opt) ? '#f8fafc' : '#fff'
                            }}
                            className="hover:bg-slate-50"
                        >
                            <input
                                type="checkbox"
                                checked={value.includes(opt)}
                                readOnly
                                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', color: '#334155' }}>{opt}</span>
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No options available</div>
                    )}
                </div>
            )}
        </div>
    );
};

const COUNTRY_CODES = [
    { name: 'India', dial_code: '+91', code: 'IN' },
    { name: 'United States', dial_code: '+1', code: 'US' },
    { name: 'United Kingdom', dial_code: '+44', code: 'GB' },
    { name: 'Australia', dial_code: '+61', code: 'AU' },
    { name: 'Canada', dial_code: '+1', code: 'CA' },
    { name: 'United Arab Emirates', dial_code: '+971', code: 'AE' },
];

const STAGES = ['New', 'Contacted', 'Interested', 'Meeting Scheduled', 'Negotiation', 'Qualified', 'Won', 'Lost'];
const STATUSES = ['Active', 'Inactive', 'Pending', 'Closed'];

// Financial Constants
const INCOME_SOURCES = ['Salary', 'Business', 'Rental', 'Investment', 'Pension', 'Other'];
const BANK_NAMES = [
    "State Bank of India", "HDFC Bank", "ICICI Bank", "Punjab National Bank", "Axis Bank",
    "Canara Bank", "Bank of Baroda", "Union Bank of India", "Bank of India", "IndusInd Bank",
    "Kotak Mahindra Bank", "Yes Bank", "IDFC First Bank", "Indian Bank", "Central Bank of India",
    "Federal Bank", "Bank of Maharashtra", "UCO Bank", "Indian Overseas Bank", "Punjab & Sind Bank"
].sort();

// Education Constants
const DEGREE_OPTIONS = {
    "High School": ["10th Standard", "12th Standard (Science)", "12th Standard (Commerce)", "12th Standard (Arts)", "Diploma"],
    "Undergraduate": ["B.Tech", "B.E.", "B.Sc", "B.Com", "B.A.", "BBA", "BCA", "MBBS", "BDS", "B.Pharma", "LLB", "B.Arch", "B.Des"],
    "Postgraduate": ["M.Tech", "M.Sc", "M.Com", "M.A.", "MBA", "MCA", "MD", "MS", "M.Pharma", "LLM", "M.Arch"],
    "Doctorate": ["Ph.D", "M.Phil", "Pharm.D"]
};
const SUB_CATEGORIES = ['Sales Person', 'Real Estate Agent', 'Real Estate', 'IT & Software', 'Banking & Finance', 'Manufacturing', 'Retail', 'Healthcare', 'Education', 'Legal', 'Construction', 'Government', 'Other'];
const DESIGNATIONS = ['Owner', 'CEO / Founder', 'Director', 'Manager', 'Team Lead', 'Senior Executive', 'Associate', 'Developer', 'Consultant', 'HR', 'Accountant', 'Other'];

// Sources for Dropdown
const SOURCES = ['Instagram', 'Facebook', 'LinkedIn', 'Google Ads', 'Referral', 'Website', 'Walk-in', 'Cold Call', 'Other'];
const CAMPAIGN_OPTIONS = ['Organic Campaign', 'Online Campaign', 'Offline Campaign'];
const SUB_SOURCE_OPTIONS = ['Call', 'SMS', 'WhatsApp', 'RCS Message'];

// Mock Contacts for Duplicate Check
const MOCK_CONTACTS = [
    {
        title: 'Mr.', name: 'Amit Kumar', surname: 'Sharma',
        company: 'Bharat Properties',
        phones: [{ phoneCode: '+91', phoneNumber: '9876543210' }],
        emails: ['amit.k@example.com'],
        personalAddress: { city: 'New Delhi', state: 'Delhi' }
    }
];

const companyList = [
    'Bharat Properties',
    'Tech Solutions',
    'City Hospital',
    'Creative Design',
    'Real Estate Co',
    'Alpha Corp',
    'Beta Industries'
];

// Duplicate Popup Component (Restyled for Side Panel)
const DuplicateResults = ({ contacts, onUpdate }) => {
    if (!contacts || contacts.length === 0) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#94a3b8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    background: '#f1f5f9',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#cbd5e1'
                }}>
                    <i className="fas fa-search" style={{ fontSize: '1.2rem' }}></i>
                </div>
                <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: '#64748b' }}>No Duplicates</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem' }}>Similar contacts will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
            <div style={{
                padding: '8px 12px',
                background: '#e0f2fe',
                borderRadius: '6px',
                border: '1px solid #bae6fd',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0369a1',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <i className="fas fa-exclamation-circle"></i>
                {contacts.length} Similar Contact{contacts.length > 1 ? 's' : ''} Found
            </div>
            {contacts.map((contact, index) => (
                <div key={index} style={{
                    background: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    padding: '12px',
                    transition: 'transform 0.2s',
                    ':hover': { transform: 'translateY(-2px)' }
                }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem', marginBottom: '4px' }}>
                        {contact.title} {contact.name} {contact.surname}
                    </div>
                    {contact.company && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px' }}>
                            <i className="fas fa-building" style={{ width: '16px' }}></i> {contact.company}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                        {contact.phones?.[0] && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-phone" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                {contact.phones[0].phoneNumber}
                            </div>
                        )}
                        {contact.emails?.[0] && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-envelope" style={{ fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                {contact.emails[0]}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); onUpdate(contact); }}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: '#eff6ff',
                            border: '1px solid #3b82f6',
                            color: '#2563eb',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.background = '#3b82f6';
                            e.target.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = '#eff6ff';
                            e.target.style.color = '#2563eb';
                        }}
                    >
                        <i className="fas fa-sync-alt"></i> Update Form with this
                    </button>
                </div>
            ))}
        </div>
    );
};

// --- Animated UI Components ---

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
                        fontSize: '0.95rem',
                        fontWeight: value === option ? 600 : 500,
                        color: value === option ? '#0f172a' : '#64748b',
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

const AnimatedChipGroup = ({ options, value, onChange }) => {
    const toggleOption = (option) => {
        const newValue = value.includes(option)
            ? value.filter(v => v !== option)
            : [...value, option];
        onChange(newValue);
    };

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {options.map(option => {
                const isActive = value.includes(option);
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => toggleOption(option)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '24px',
                            border: isActive ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                            background: isActive ? '#eff6ff' : '#fff',
                            color: isActive ? '#2563eb' : '#64748b',
                            fontSize: '0.9rem',
                            fontWeight: isActive ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isActive ? 'scale(1.05)' : 'scale(1)',
                            boxShadow: isActive ? '0 2px 4px rgba(59, 130, 246, 0.15)' : 'none',
                            outline: 'none'
                        }}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
};

const BUDGET_VALUES = [
    { value: 500000, label: "5 Lakh" },
    { value: 2500000, label: "25 Lakh" },
    { value: 5000000, label: "50 Lakh" },
    { value: 7500000, label: "75 Lakh" },
    { value: 10000000, label: "1 Crore" },
    { value: 15000000, label: "1.5 Crore" },
    { value: 20000000, label: "2 Crore" },
    { value: 25000000, label: "2.5 Crore" },
    { value: 30000000, label: "3 Crore" },
    { value: 35000000, label: "3.5 Crore" },
    { value: 40000000, label: "4 Crore" },
    { value: 45000000, label: "4.5 Crore" },
    { value: 50000000, label: "5 Crore" },
    { value: 55000000, label: "5.5 Crore" },
    { value: 60000000, label: "6 Crore" },
    { value: 70000000, label: "7 Crore" },
    { value: 80000000, label: "8 Crore" },
    { value: 90000000, label: "9 Crore" },
    { value: 100000000, label: "10 Crore" },
    { value: 200000000, label: "20 Crore" },
    { value: 300000000, label: "30 Crore" },
    { value: 500000000, label: "50 Crore" },
    { value: 750000000, label: "75 Crore" },
    { value: 1000000000, label: "100 Crore" }
];

const AddContactModal = ({ isOpen, onClose, onAdd, initialData, mode = 'add' }) => {
    const [currentTab, setCurrentTab] = useState('basic');
    const [currentAddressType, setCurrentAddressType] = useState('permanent'); // permanent or correspondence
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);

    // Company Logic
    const [companyList, setCompanyList] = useState(companyData.map(c => c.name));
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [companySearch, setCompanySearch] = useState('');

    // Document Name Logic
    const [documentNameList, setDocumentNameList] = useState(['ID Proof', 'Address Proof', 'Other']);
    const [activeDocumentSearchIndex, setActiveDocumentSearchIndex] = useState(null);
    const [documentSearchTerm, setDocumentSearchTerm] = useState('');


    const [currentTime, setCurrentTime] = useState(new Date());
    const [similarContacts, setSimilarContacts] = useState([]);

    // Input Style
    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.9rem',
        outline: 'none',
        color: '#1e293b',
        transition: 'border-color 0.2s',
        height: '42px', // matching select
        boxSizing: 'border-box',
        backgroundColor: '#fff'
    };

    const sectionCardStyle = {
        background: '#fff',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    };

    const labelStyle = {
        fontSize: '0.9rem',
        fontWeight: 600,
        color: '#334155',
        marginBottom: '12px',
        display: 'block'
    };

    // Professional Dropdown Style
    const customSelectStyle = {
        width: '100%',
        padding: '10px 12px',
        paddingRight: '30px', // Space for arrow
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        outline: 'none',
        background: '#f8fafc',
        color: '#475569',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px'
    };
    const customSelectStyleDisabled = {
        ...customSelectStyle,
        background: '#f1f5f9',
        cursor: 'not-allowed',
        color: '#94a3b8',
        backgroundImage: 'none' // No arrow for disabled
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const [formData, setFormData] = useState({
        // Basic Details
        title: '',
        name: '',
        surname: '',
        fatherName: '',
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
        workOffice: '',

        // System Details
        source: '',
        team: '',
        owner: '',
        visibleTo: '',

        // Personal Address
        personalAddress: {
            hNo: '',
            street: '',
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
            street: '',
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

        // Documents - Array
        documents: [{ documentName: '', documentNo: '', documentPicture: null }]
    });

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };



    // Derived Data for Professional Details
    const selectedCompanyData = companyData.find(c => c.name === formData.company);
    const hasMultipleOffices = selectedCompanyData?.offices?.length > 1;
    const officeOptions = selectedCompanyData?.offices?.map(o => ({ label: o.name, value: o.name })) || [];

    const handleSave = async () => {
        const toastId = toast.loading('Adding contact...');
        try {
             console.log("API BASE URL:", api.defaults.baseURL);
            const response = await api.post("add-contact", formData);
           


            if (response.data && response.data.success) {
                toast.success('Contact added successfully!', { id: toastId });
                if (onAdd) onAdd(response.data.data); // Pass the created contact back
                onClose();
            } else {
                // Handle case where success is false but no error thrown
                throw new Error(response.data?.message || 'Failed to add contact');
            }
        } catch (error) {
            console.error('Error adding contact:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to add contact. Please try again.';
            toast.error(errorMessage, { id: toastId });
        }
    };

    // Navigation Logic
    const handleNext = () => {
        // Contact Flow
        if (currentTab === 'basic') setCurrentTab('personal');
        else if (currentTab === 'personal') setCurrentTab('other');
    };

    const handlePrev = () => {
        // Contact Flow
        if (currentTab === 'personal') setCurrentTab('basic');
        else if (currentTab === 'other') setCurrentTab('personal');
    };

    // Placeholder for Populate
    const handlePopulateForm = (data) => { console.log('Populate', data); };

    // Styles (Reused from backup)
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };

    const modalStyle = {
        width: '90%', maxWidth: '1100px', height: '90vh', backgroundColor: '#fff',
        borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex', overflow: 'hidden'
    };

    const leftPaneStyle = { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #e2e8f0' };
    const rightPaneStyle = { width: '300px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', height: '100%' };

    const tabStyle = (active) => ({
        padding: '8px 20px', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s', border: 'none', outline: 'none',
        backgroundColor: active ? '#fff' : 'transparent', color: active ? '#0f172a' : '#64748b',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
    });

    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        secondary: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' },
        primary: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };

    // Duplication Check Effect
    useEffect(() => {
        if (!formData.name && formData.phones[0].number === '' && formData.emails[0].address === '') {
            setSimilarContacts([]);
            return;
        }

        const matches = MOCK_CONTACTS.filter(contact => {
            const nameMatch = formData.name && contact.name.toLowerCase().includes(formData.name.toLowerCase());

            // Mobile Match (Check if any entered phone matches any existing phone)
            const phoneMatch = formData.phones.some(p =>
                p.number && contact.phones.some(cp => cp.phoneNumber.includes(p.number))
            );

            // Email Match
            const emailMatch = formData.emails.some(e =>
                e.address && contact.emails.some(ce => ce.includes(e.address))
            );

            return nameMatch || phoneMatch || emailMatch;
        });
        setSimilarContacts(matches);
    }, [formData.name, formData.phones, formData.emails]);

    if (!isOpen) return null;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                {/* Left Pane - Form Content */}
                <div style={leftPaneStyle}>
                    {/* Header */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                                {mode === 'edit'
                                    ? `Update Contact`
                                    : `Add Contact`}
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
                                {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                checked={showOnlyRequired}
                                onChange={(e) => {
                                    setShowOnlyRequired(e.target.checked);
                                    if (e.target.checked) {
                                        setCurrentTab('basic');
                                    }
                                }}
                            />
                            <label>Show required only</label>
                        </div>
                    </div>

                    {/* Tabs */}
                    {!showOnlyRequired && (
                        <div style={{ padding: '16px 32px 0 32px', background: '#fff' }}>
                            <div style={{ display: 'flex', gap: '8px', padding: '4px', background: '#f1f5f9', borderRadius: '9999px', width: 'fit-content' }}>
                                <button onClick={() => setCurrentTab('basic')} style={tabStyle(currentTab === 'basic')}>Basic Details</button>
                                <button onClick={() => setCurrentTab('personal')} style={tabStyle(currentTab === 'personal')}>Personal</button>
                                <button onClick={() => setCurrentTab('other')} style={tabStyle(currentTab === 'other')}>Other</button>
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="no-scrollbar" style={{ flex: 1, padding: '24px 32px 40px 32px', overflowY: 'auto', background: '#f8fafc' }}>

                        {currentTab === 'basic' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Identity Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-user-circle" style={{ color: '#3b82f6' }}></i> Identity Details
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Title</label>
                                            <select
                                                value={formData.title}
                                                onChange={(e) => handleInputChange('title', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select</option>
                                                <option value="Mr.">Mr.</option>
                                                <option value="Ms.">Ms.</option>
                                                <option value="Mrs.">Mrs.</option>
                                                <option value="Dr.">Dr.</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => handleInputChange('name', e.target.value)}
                                                placeholder="Enter first name"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Last Name</label>
                                            <input
                                                type="text"
                                                value={formData.surname}
                                                onChange={(e) => handleInputChange('surname', e.target.value)}
                                                placeholder="Enter last name"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                            />
                                        </div>
                                        {(!showOnlyRequired) && (
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Father/Husband Name</label>
                                                <input
                                                    type="text"
                                                    value={formData.fatherName}
                                                    onChange={(e) => handleInputChange('fatherName', e.target.value)}
                                                    placeholder="Enter father or husband's name"
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Contact Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-address-book" style={{ color: '#10b981' }}></i> Contact Methods
                                    </h3>

                                    {/* Phones */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '12px' }}>Mobile Numbers <span style={{ color: '#ef4444' }}>*</span></label>
                                        {formData.phones.map((phone, index) => (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 120px) 1fr minmax(100px, 120px) 40px', gap: '12px', marginBottom: '12px' }}>
                                                <select
                                                    value={formData.countryCode}
                                                    onChange={(e) => handleInputChange('countryCode', e.target.value)}
                                                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.9rem', color: '#475569' }}
                                                >
                                                    {COUNTRY_CODES.map(c => <option key={c.code} value={c.dial_code}>{c.dial_code} ({c.code})</option>)}
                                                </select>
                                                <input
                                                    type="tel"
                                                    value={phone.number}
                                                    onChange={(e) => {
                                                        const newPhones = [...formData.phones];
                                                        newPhones[index].number = e.target.value;
                                                        handleInputChange('phones', newPhones);
                                                    }}
                                                    placeholder="Enter mobile number"
                                                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                                />
                                                <select
                                                    value={phone.type}
                                                    onChange={(e) => {
                                                        const newPhones = [...formData.phones];
                                                        newPhones[index].type = e.target.value;
                                                        handleInputChange('phones', newPhones);
                                                    }}
                                                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#475569' }}
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                    <option value="Home">Home</option>
                                                </select>
                                                <button type="button" onClick={() => {
                                                    if (index === 0) handleInputChange('phones', [...formData.phones, { number: '', type: 'Personal' }]);
                                                    else {
                                                        const newPhones = formData.phones.filter((_, i) => i !== index);
                                                        handleInputChange('phones', newPhones);
                                                    }
                                                }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Emails */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '12px' }}>Email Addresses</label>
                                        {formData.emails.map((email, index) => (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(100px, 120px) 40px', gap: '12px', marginBottom: '12px' }}>
                                                <input
                                                    type="email"
                                                    value={email.address}
                                                    onChange={(e) => {
                                                        const newEmails = [...formData.emails];
                                                        newEmails[index].address = e.target.value;
                                                        handleInputChange('emails', newEmails);
                                                    }}
                                                    placeholder="Enter email address"
                                                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                                />
                                                <select
                                                    value={email.type}
                                                    onChange={(e) => {
                                                        const newEmails = [...formData.emails];
                                                        newEmails[index].type = e.target.value;
                                                        handleInputChange('emails', newEmails);
                                                    }}
                                                    style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#475569' }}
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                </select>
                                                <button type="button" onClick={() => {
                                                    if (index === 0) handleInputChange('emails', [...formData.emails, { address: '', type: 'Personal' }]);
                                                    else {
                                                        const newEmails = formData.emails.filter((_, i) => i !== index);
                                                        handleInputChange('emails', newEmails);
                                                    }
                                                }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {(!showOnlyRequired) && (
                                    <>
                                        {/* Tags & Source Card */}
                                        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                            <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                                <i className="fas fa-tags" style={{ color: '#8b5cf6' }}></i> Segmentation
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Source</label>
                                                    <select
                                                        value={formData.source}
                                                        onChange={(e) => handleInputChange('source', e.target.value)}
                                                        style={customSelectStyle}
                                                    >
                                                        <option value="">Select Source</option>
                                                        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Tags</label>
                                                <div style={{
                                                    width: '100%',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    background: '#fff',
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '6px',
                                                    alignItems: 'center',
                                                    minHeight: '42px'
                                                }}>
                                                    {formData.tags.map((tag, index) => (
                                                        <div key={index} style={{
                                                            background: '#eff6ff',
                                                            color: '#3b82f6',
                                                            padding: '4px 10px',
                                                            borderRadius: '16px',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 500,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}>
                                                            {tag}
                                                            <span
                                                                onClick={() => handleInputChange('tags', formData.tags.filter((_, i) => i !== index))}
                                                                style={{ cursor: 'pointer', fontSize: '1rem', lineHeight: '0.8' }}
                                                            >&times;</span>
                                                        </div>
                                                    ))}
                                                    <input
                                                        type="text"
                                                        placeholder={formData.tags.length === 0 ? "Add tags (Press Enter)" : ""}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                                e.preventDefault();
                                                                if (!formData.tags.includes(e.target.value.trim())) {
                                                                    handleInputChange('tags', [...formData.tags, e.target.value.trim()]);
                                                                }
                                                                e.target.value = '';
                                                            } else if (e.key === 'Backspace' && !e.target.value && formData.tags.length > 0) {
                                                                handleInputChange('tags', formData.tags.slice(0, -1));
                                                            }
                                                        }}
                                                        style={{
                                                            border: 'none',
                                                            outline: 'none',
                                                            fontSize: '0.9rem',
                                                            color: '#1e293b',
                                                            flex: 1,
                                                            minWidth: '120px'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Professional Details Card */}
                                {(!showOnlyRequired) && (
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <i className="fas fa-briefcase" style={{ color: '#0ea5e9' }}></i> Professional Details
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                            {(() => {
                                                const selectedCompanyObj = companyData.find(c => c.name === formData.company);
                                                const branchOffices = selectedCompanyObj?.addresses?.['Branch Office'] || [];
                                                const siteOffices = selectedCompanyObj?.addresses?.['Site Office'] || [];
                                                const hasMultipleOffices = Array.isArray(branchOffices) && (branchOffices.length > 0 || siteOffices.length > 0);

                                                const officeOptions = [
                                                    ...(Array.isArray(branchOffices) ? branchOffices.map(b => ({ label: b.branchName || 'Branch', value: b.branchName || 'Branch' })) : []),
                                                    ...(Array.isArray(siteOffices) ? siteOffices.map(s => ({ label: s.branchName || 'Site', value: s.branchName || 'Site' })) : [])
                                                ];

                                                return (
                                                    <>
                                                        {/* 1. Profession Category */}
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Profession Category</label>
                                                            <select
                                                                value={formData.professionCategory}
                                                                onChange={(e) => handleInputChange('professionCategory', e.target.value)}
                                                                style={customSelectStyle}
                                                            >
                                                                <option value="">Select Category</option>
                                                                <option value="Salaried">Salaried</option>
                                                                <option value="Self-Employed">Self-Employed</option>
                                                                <option value="Business">Business</option>
                                                            </select>
                                                        </div>

                                                        {/* 2. Sub-Category */}
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Sub-Category</label>
                                                            <select
                                                                value={formData.professionSubCategory}
                                                                onChange={(e) => handleInputChange('professionSubCategory', e.target.value)}
                                                                style={customSelectStyle}
                                                            >
                                                                <option value="">Select Sub-Category</option>
                                                                {SUB_CATEGORIES.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                                                            </select>
                                                        </div>

                                                        {/* 3. Designation */}
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Designation</label>
                                                            <select
                                                                value={formData.designation}
                                                                onChange={(e) => handleInputChange('designation', e.target.value)}
                                                                style={customSelectStyle}
                                                            >
                                                                <option value="">Select Designation</option>
                                                                {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                                            </select>
                                                        </div>

                                                        {/* 4. Company (Creatable Select) */}
                                                        <div style={{ position: 'relative' }}>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Company</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <input
                                                                    type="text"
                                                                    value={formData.company}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        handleInputChange('company', val);
                                                                        setCompanySearch(val);
                                                                        setShowCompanyDropdown(true);
                                                                    }}
                                                                    onFocus={() => {
                                                                        setCompanySearch(formData.company);
                                                                        setShowCompanyDropdown(true);
                                                                    }}
                                                                    onBlur={() => setTimeout(() => setShowCompanyDropdown(false), 200)}
                                                                    placeholder="Select or Type New Company"
                                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                                                    autoComplete="off"
                                                                />
                                                                {showCompanyDropdown && (
                                                                    <div style={{
                                                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                                                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px',
                                                                        marginTop: '4px', zIndex: 50, maxHeight: '200px', overflowY: 'auto',
                                                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                                                    }}>
                                                                        {(() => {
                                                                            const filtered = companyList.filter(c => c.toLowerCase().includes(companySearch.toLowerCase()));
                                                                            const showAddNew = companySearch && !companyList.some(c => c.toLowerCase() === companySearch.toLowerCase());

                                                                            return (
                                                                                <>
                                                                                    {filtered.map(comp => (
                                                                                        <div
                                                                                            key={comp}
                                                                                            onMouseDown={() => {
                                                                                                handleInputChange('company', comp);
                                                                                                handleInputChange('workOffice', ''); // Reset office on company change
                                                                                                setShowCompanyDropdown(false);
                                                                                            }}
                                                                                            style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}
                                                                                            className="hover:bg-slate-50"
                                                                                        >
                                                                                            {comp}
                                                                                        </div>
                                                                                    ))}
                                                                                    {showAddNew && (
                                                                                        <div
                                                                                            onMouseDown={() => {
                                                                                                const newCompany = companySearch;
                                                                                                setCompanyList(prev => [...prev, newCompany]);
                                                                                                handleInputChange('company', newCompany);
                                                                                                handleInputChange('workOffice', '');
                                                                                                setShowCompanyDropdown(false);
                                                                                            }}
                                                                                            style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.9rem', color: '#2563eb', borderTop: '1px dashed #e2e8f0', background: '#eff6ff' }}
                                                                                        >
                                                                                            + Add "{companySearch}"
                                                                                        </div>
                                                                                    )}
                                                                                    {!showAddNew && filtered.length === 0 && (
                                                                                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No matches</div>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 5. Branch/Site Selection (Conditional) */}
                                                        {hasMultipleOffices && (
                                                            <div style={{ gridColumn: 'span 2' }}>
                                                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <i className="fas fa-map-marker-alt"></i> Associated Office / Branch
                                                                </label>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                                    {officeOptions.map((opt, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => handleInputChange('workOffice', opt.value)}
                                                                            style={{
                                                                                padding: '8px 16px',
                                                                                borderRadius: '20px',
                                                                                border: `1.5px solid ${formData.workOffice === opt.value ? '#10b981' : '#e2e8f0'}`,
                                                                                background: formData.workOffice === opt.value ? '#ecfdf5' : '#fff',
                                                                                color: formData.workOffice === opt.value ? '#047857' : '#64748b',
                                                                                fontSize: '0.85rem',
                                                                                fontWeight: formData.workOffice === opt.value ? 700 : 500,
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.2s',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '6px'
                                                                            }}
                                                                        >
                                                                            {formData.workOffice === opt.value && <i className="fas fa-check-circle"></i>}
                                                                            {opt.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                                                                    Select the specific location where this contact is based.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* System Assignment Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-sliders-h" style={{ color: '#64748b' }}></i> System Assignment
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Assign Team</label>
                                            <select
                                                value={formData.team}
                                                onChange={(e) => handleInputChange('team', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Team</option>
                                                <option value="Sales">Sales</option>
                                                <option value="Marketing">Marketing</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Assign Owner</label>
                                            <select
                                                value={formData.owner}
                                                onChange={(e) => handleInputChange('owner', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Owner</option>
                                                <option value="Self">Self</option>
                                                {/* Add more owners here or map from props */}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Visibility</label>
                                            <select
                                                value={formData.visibleTo}
                                                onChange={(e) => handleInputChange('visibleTo', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Visibility</option>
                                                <option value="Public">Public</option>
                                                <option value="Private">Private</option>
                                                <option value="Team">Team Only</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : currentTab === 'personal' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Personal Basic Info */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-user-clock" style={{ color: '#ec4899' }}></i> Bio Details
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Gender</label>
                                            <select
                                                value={formData.gender}
                                                onChange={(e) => handleInputChange('gender', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Marital Status</label>
                                            <select
                                                value={formData.maritalStatus}
                                                onChange={(e) => handleInputChange('maritalStatus', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Status</option>
                                                <option value="Single">Single</option>
                                                <option value="Married">Married</option>
                                                <option value="Divorced">Divorced</option>
                                                <option value="Widowed">Widowed</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Date of Birth</label>
                                            <input
                                                type="date"
                                                value={formData.birthDate}
                                                onChange={(e) => handleInputChange('birthDate', e.target.value)}
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                            />
                                        </div>
                                        {formData.maritalStatus === 'Married' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Anniversary Date</label>
                                                <input
                                                    type="date"
                                                    value={formData.anniversaryDate}
                                                    onChange={(e) => handleInputChange('anniversaryDate', e.target.value)}
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', color: '#1e293b' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Address Details Card (Unified) */}
                                {(!showOnlyRequired) && (
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-map-marker-alt" style={{ color: '#6366f1' }}></i> Address Details
                                            </h3>
                                            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '6px', padding: '4px' }}>
                                                <button
                                                    onClick={() => setCurrentAddressType('permanent')}
                                                    style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: currentAddressType === 'permanent' ? '#fff' : 'transparent', color: currentAddressType === 'permanent' ? '#0f172a' : '#64748b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', boxShadow: currentAddressType === 'permanent' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                                                >Permanent</button>
                                                <button
                                                    onClick={() => setCurrentAddressType('correspondence')}
                                                    style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: currentAddressType === 'correspondence' ? '#fff' : 'transparent', color: currentAddressType === 'correspondence' ? '#0f172a' : '#64748b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', boxShadow: currentAddressType === 'correspondence' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
                                                >Correspondence</button>
                                            </div>
                                        </div>

                                        {(() => {
                                            const addrKey = currentAddressType === 'permanent' ? 'personalAddress' : 'correspondenceAddress';
                                            const addr = formData[addrKey];

                                            // Data Resolution
                                            const countryData = INDIAN_ADDRESS_DATA['India'];
                                            const states = addr.country === 'India' && countryData ? Object.keys(countryData) : [];
                                            const cityData = addr.state && countryData && countryData[addr.state] ? countryData[addr.state] : null;
                                            const cities = cityData ? Object.keys(cityData) : [];
                                            const selectedCityObj = cityData && addr.city ? cityData[addr.city] : null;
                                            const tehsils = selectedCityObj ? selectedCityObj.tehsils : [];
                                            const postOffices = selectedCityObj ? selectedCityObj.postOffices.filter(po => !addr.tehsil || po.tehsil === addr.tehsil) : [];

                                            const dropdownStyle = customSelectStyle;
                                            const disabledStyle = customSelectStyleDisabled;

                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                    {/* Row 1: Country, State, City */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Country</label>
                                                            <select
                                                                value={addr.country}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, country: e.target.value, state: '', city: '', tehsil: '', postOffice: '', pincode: '' })}
                                                                style={dropdownStyle}
                                                            >
                                                                <option value="India">India</option>
                                                                {/* Add other countries if needed */}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>State</label>
                                                            <select
                                                                value={addr.state}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, state: e.target.value, city: '', tehsil: '', postOffice: '', pincode: '' })}
                                                                disabled={!addr.country}
                                                                style={!addr.country ? disabledStyle : dropdownStyle}
                                                            >
                                                                <option value="">Select State</option>
                                                                {states.map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>City / District</label>
                                                            <select
                                                                value={addr.city}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, city: e.target.value, tehsil: '', postOffice: '', pincode: '' })}
                                                                disabled={!addr.state}
                                                                style={!addr.state ? disabledStyle : dropdownStyle}
                                                            >
                                                                <option value="">Select City</option>
                                                                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Tehsil, PO, Pin */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Tehsil</label>
                                                            <select
                                                                value={addr.tehsil}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, tehsil: e.target.value })}
                                                                disabled={!addr.city}
                                                                style={!addr.city ? disabledStyle : dropdownStyle}
                                                            >
                                                                <option value="">Select Tehsil</option>
                                                                {tehsils.map(t => <option key={t} value={t}>{t}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Post Office</label>
                                                            <select
                                                                value={addr.postOffice}
                                                                onChange={(e) => {
                                                                    const selectedPO = postOffices.find(po => po.name === e.target.value);
                                                                    handleInputChange(addrKey, { ...addr, postOffice: e.target.value, pincode: selectedPO ? selectedPO.pincode : addr.pincode });
                                                                }}
                                                                disabled={!addr.city}
                                                                style={!addr.city ? disabledStyle : dropdownStyle}
                                                            >
                                                                <option value="">Select PO</option>
                                                                {postOffices.map(po => <option key={po.name} value={po.name}>{po.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Pincode</label>
                                                            <input
                                                                type="text"
                                                                value={addr.pincode}
                                                                readOnly
                                                                placeholder="Pincode"
                                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#f1f5f9', color: '#64748b' }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Row 3: House No & Street (New Placement) */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 120px) 1fr', gap: '20px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>House Number</label>
                                                            <input
                                                                type="text"
                                                                placeholder="House No"
                                                                value={addr.hNo}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, hNo: e.target.value })}
                                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Street / Road / Landmark</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Enter Street, Road or Landmark"
                                                                value={addr.street}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, street: e.target.value })}
                                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Area, Location */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Area</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Enter Area"
                                                                value={addr.area}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, area: e.target.value })}
                                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Sector</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Enter Sector"
                                                                value={addr.location}
                                                                onChange={(e) => handleInputChange(addrKey, { ...addr, location: e.target.value })}
                                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* Documents Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-file-alt" style={{ color: '#64748b' }}></i> Documents
                                    </h3>
                                    {formData.documents.map((doc, index) => (
                                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                            <select value={doc.documentName} onChange={(e) => {
                                                const newDocs = [...formData.documents];
                                                newDocs[index].documentName = e.target.value;
                                                handleInputChange('documents', newDocs);
                                            }} style={customSelectStyle}>
                                                <option value="">Select Doc</option>
                                                {['ID Proof', 'Address Proof', 'Other'].map(d => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                            <input type="text" placeholder="Document No" value={doc.documentNo} onChange={(e) => {
                                                const newDocs = [...formData.documents];
                                                newDocs[index].documentNo = e.target.value;
                                                handleInputChange('documents', newDocs);
                                            }} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                            <label style={{
                                                padding: '10px',
                                                background: '#f8fafc',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                color: '#64748b',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                display: 'block',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {doc.documentPicture ? (doc.documentPicture.name || 'File Selected') : 'Upload'}
                                                <input
                                                    type="file"
                                                    accept="image/*,application/pdf"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        const file = e.target.files[0];
                                                        if (file) {
                                                            const newDocs = [...formData.documents];
                                                            newDocs[index].documentPicture = file;
                                                            handleInputChange('documents', newDocs);
                                                        }
                                                    }}
                                                />
                                            </label>
                                            <button type="button" onClick={() => {
                                                if (index === 0) handleInputChange('documents', [...formData.documents, { documentName: '', documentNo: '', documentPicture: null }]);
                                                else {
                                                    const newDocs = formData.documents.filter((_, i) => i !== index);
                                                    handleInputChange('documents', newDocs);
                                                }
                                            }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer' }}>
                                                <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : currentTab === 'other' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Education Card (Moved from Personal) */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-graduation-cap" style={{ color: '#f59e0b' }}></i> Education History
                                    </h3>
                                    {formData.educations.map((edu, index) => {
                                        const availableDegrees = edu.education && DEGREE_OPTIONS[edu.education] ? DEGREE_OPTIONS[edu.education] : [];

                                        return (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 1fr 2fr 40px', gap: '12px', marginBottom: '12px', alignItems: 'end' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Level</label>
                                                    <select
                                                        value={edu.education}
                                                        onChange={(e) => {
                                                            const newEdu = [...formData.educations];
                                                            newEdu[index].education = e.target.value;
                                                            newEdu[index].degree = ''; // Reset degree on level change
                                                            handleInputChange('educations', newEdu);
                                                        }}
                                                        style={customSelectStyle}
                                                    >
                                                        <option value="">Select Level</option>
                                                        {Object.keys(DEGREE_OPTIONS).map(level => (
                                                            <option key={level} value={level}>{level}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Degree/Course</label>
                                                    <select
                                                        value={edu.degree}
                                                        onChange={(e) => {
                                                            const newEdu = [...formData.educations];
                                                            newEdu[index].degree = e.target.value;
                                                            handleInputChange('educations', newEdu);
                                                        }}
                                                        disabled={!edu.education}
                                                        style={!edu.education ? customSelectStyleDisabled : customSelectStyle}
                                                    >
                                                        <option value="">Select Degree</option>
                                                        {availableDegrees.map(deg => (
                                                            <option key={deg} value={deg}>{deg}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Institute</label>
                                                    <input
                                                        type="text"
                                                        placeholder="School/University"
                                                        value={edu.school}
                                                        onChange={(e) => {
                                                            const newEdu = [...formData.educations];
                                                            newEdu[index].school = e.target.value;
                                                            handleInputChange('educations', newEdu);
                                                        }}
                                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                    />
                                                </div>
                                                <button type="button" onClick={() => {
                                                    if (index === 0) handleInputChange('educations', [...formData.educations, { education: '', degree: '', school: '' }]);
                                                    else {
                                                        const newEdu = formData.educations.filter((_, i) => i !== index);
                                                        handleInputChange('educations', newEdu);
                                                    }
                                                }} style={{ height: '40px', borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer' }}>
                                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Financials Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-coins" style={{ color: '#eab308' }}></i> Financial Details
                                    </h3>

                                    {/* Income */}
                                    <h4 style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '12px' }}>Annual Income Source</h4>
                                    {formData.incomes.map((inc, index) => (
                                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                            <select
                                                value={inc.incomeType}
                                                onChange={(e) => {
                                                    const newInc = [...formData.incomes];
                                                    newInc[index].incomeType = e.target.value;
                                                    handleInputChange('incomes', newInc);
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Source</option>
                                                {INCOME_SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
                                            </select>
                                            <input
                                                type="number"
                                                placeholder="Amount"
                                                value={inc.amount}
                                                onChange={(e) => {
                                                    const newInc = [...formData.incomes];
                                                    newInc[index].amount = e.target.value;
                                                    handleInputChange('incomes', newInc);
                                                }}
                                                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                            />
                                            <button type="button" onClick={() => {
                                                if (index === 0) handleInputChange('incomes', [...formData.incomes, { incomeType: '', amount: '' }]);
                                                else {
                                                    const newInc = formData.incomes.filter((_, i) => i !== index);
                                                    handleInputChange('incomes', newInc);
                                                }
                                            }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer' }}>
                                                <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                            </button>
                                        </div>
                                    ))}

                                    {/* Loans */}
                                    <h4 style={{ fontSize: '0.9rem', color: '#475569', margin: '20px 0 12px 0', paddingTop: '16px', borderTop: '1px dashed #e2e8f0' }}>Existing Loans</h4>
                                    {formData.loans.map((loan, index) => (
                                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                            <select
                                                value={loan.loanType}
                                                onChange={(e) => {
                                                    const newLoans = [...formData.loans];
                                                    newLoans[index].loanType = e.target.value;
                                                    handleInputChange('loans', newLoans);
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Type</option>
                                                <option value="Home">Home Loan</option>
                                                <option value="Car">Car Loan</option>
                                                <option value="Personal">Personal Loan</option>
                                            </select>
                                            <select
                                                value={loan.bank}
                                                onChange={(e) => {
                                                    const newLoans = [...formData.loans];
                                                    newLoans[index].bank = e.target.value;
                                                    handleInputChange('loans', newLoans);
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Bank</option>
                                                {BANK_NAMES.map(bank => <option key={bank} value={bank}>{bank}</option>)}
                                            </select>
                                            <input
                                                type="number"
                                                placeholder="Amount"
                                                value={loan.loanAmount}
                                                onChange={(e) => {
                                                    const newLoans = [...formData.loans];
                                                    newLoans[index].loanAmount = e.target.value;
                                                    handleInputChange('loans', newLoans);
                                                }}
                                                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                            />
                                            <button type="button" onClick={() => {
                                                if (index === 0) handleInputChange('loans', [...formData.loans, { loanType: '', bank: '', loanAmount: '' }]);
                                                else {
                                                    const newLoans = formData.loans.filter((_, i) => i !== index);
                                                    handleInputChange('loans', newLoans);
                                                }
                                            }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer' }}>
                                                <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Social Media Card */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-hashtag" style={{ color: '#ec4899' }}></i> Social Presence
                                    </h3>
                                    {formData.socialMedia.map((social, index) => (
                                        <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 160px) 1fr 40px', gap: '12px', marginBottom: '12px' }}>
                                            <select
                                                value={social.platform}
                                                onChange={(e) => {
                                                    const newSocial = [...formData.socialMedia];
                                                    newSocial[index].platform = e.target.value;
                                                    handleInputChange('socialMedia', newSocial);
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Platform</option>
                                                <option value="LinkedIn">LinkedIn</option>
                                                <option value="Facebook">Facebook</option>
                                                <option value="Instagram">Instagram</option>
                                                <option value="Twitter">Twitter/X</option>
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="Profile URL / Handle"
                                                value={social.url}
                                                onChange={(e) => {
                                                    const newSocial = [...formData.socialMedia];
                                                    newSocial[index].url = e.target.value;
                                                    handleInputChange('socialMedia', newSocial);
                                                }}
                                                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                            />
                                            <button type="button" onClick={() => {
                                                if (index === 0) handleInputChange('socialMedia', [...formData.socialMedia, { platform: '', url: '' }]);
                                                else {
                                                    const newSocial = formData.socialMedia.filter((_, i) => i !== index);
                                                    handleInputChange('socialMedia', newSocial);
                                                }
                                            }} style={{ borderRadius: '6px', border: 'none', background: index === 0 ? '#eff6ff' : '#fef2f2', color: index === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer' }}>
                                                <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null
                        }

                    </div >

                    {/* Footer */}
                    < div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {/* Previous Button - Hide on first tab */}
                            {(currentTab !== 'basic') && (
                                <button onClick={handlePrev} style={buttonStyle.secondary}>Previous</button>
                            )}

                            {/* Next/Save Button */}
                            {(currentTab !== 'other' && !showOnlyRequired) ? (
                                <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                            ) : (
                                <button onClick={handleSave} style={buttonStyle.success}>Save</button>
                            )}
                        </div>
                    </div >
                </div >

                {/* Right Pane */}
                {
                    similarContacts.length > 0 && (
                        <div style={rightPaneStyle}>
                            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
                                <h3>Suggestions</h3>
                            </div>
                            <div style={{ flex: 1, padding: '20px' }}>
                                <DuplicateResults contacts={similarContacts} onUpdate={handlePopulateForm} />
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    );
};

export default AddContactModal;
