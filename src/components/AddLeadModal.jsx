import React, { useState, useEffect, useRef } from 'react';

import { INDIAN_LOCATION_HIERARCHY } from '../data/detailedLocationData';
import { PROJECT_DATA, CITIES } from '../data/projectData';
import { LOCATION_DATA, INDIAN_ADDRESS_DATA } from '../data/locationData';
import { PROPERTY_CATEGORIES, DIRECTION_OPTIONS, FACING_OPTIONS, ROAD_WIDTH_OPTIONS, PROPERTY_UNIT_TYPE_OPTIONS } from '../data/propertyData';

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
        const safeValue = Array.isArray(value) ? value : [];
        const newValue = safeValue.includes(option)
            ? safeValue.filter(v => v !== option)
            : [...safeValue, option];
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
const SUB_CATEGORIES = ['Real Estate', 'IT & Software', 'Banking & Finance', 'Manufacturing', 'Retail', 'Healthcare', 'Education', 'Legal', 'Construction', 'Government', 'Other'];
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

const AddLeadModal = ({ isOpen, onClose, onAdd, initialData, mode = 'add', entityType = 'lead', contactData, title = "Add New Lead", saveLabel = "Save" }) => {
    const [currentTab, setCurrentTab] = useState('requirement'); // default to requirement for lead
    const [currentAddressType, setCurrentAddressType] = useState('permanent'); // permanent or correspondence
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);

    // Company Logic
    const [companyList, setCompanyList] = useState(['Company A', 'Company B', 'Bharat Properties']);
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [companySearch, setCompanySearch] = useState('');

    // Document Name Logic
    const [documentNameList, setDocumentNameList] = useState(['ID Proof', 'Address Proof', 'Other']);
    const [activeDocumentSearchIndex, setActiveDocumentSearchIndex] = useState(null);
    const [documentSearchTerm, setDocumentSearchTerm] = useState('');

    const [locationTab, setLocationTab] = useState('select'); // 'select' or 'search'
    const [showSpecificUnit, setShowSpecificUnit] = useState(false);
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

        // System Details
        source: '',
        subSource: '', // Added for Leads
        campaign: '', // Added for Leads
        team: '',
        owner: '',
        visibleTo: '',

        // Requirement Details (Lead Specific)
        requirement: 'Buy',
        propertyType: ['Residential'],
        purpose: 'End use',
        nri: false,
        subType: [],
        unitType: [],
        budgetMin: '',
        budgetMax: '',
        areaMin: '',
        areaMax: '',
        areaMetric: 'Sq Yard',
        searchLocation: '',
        areaSearch: '', // New Field
        streetAddress: '',
        range: 'Within 3 km',
        locCity: '', locArea: '', locBlock: [], locPinCode: '',
        locCountry: '', locState: '', locLat: '', locLng: '',
        facing: [],
        roadWidth: [],
        direction: [],
        funding: '',
        timeline: '',
        furnishing: '',
        propertyUnitType: [],
        transactionType: '',
        transactionFlexiblePercent: 50,
        sendMatchedDeal: [],

        // Select Location Fields
        projectName: [],
        projectCity: '', // New Field
        projectTowers: [], // New Field
        specificUnitType: 'single', // 'single' or 'row'
        propertyNo: '',
        propertyNoEnd: '',

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

    // Auto-fill from contactData
    useEffect(() => {
        if (contactData) {
            // Parse Name
            const nameParts = contactData.name ? contactData.name.split(' ') : [];
            let title = '';
            let firstName = '';
            let lastName = '';

            if (nameParts.length > 0 && ['Mr.', 'Mrs.', 'Dr.', 'Ms.', 'Prof.'].includes(nameParts[0])) {
                title = nameParts[0];
                nameParts.shift();
            }
            firstName = nameParts.join(' '); // Use remaining as name
            // If we want to split first and last strictly, we can, but preserving as 'name' is often safer if single field used
            // But formData has name and surname. Let's try to split last word as surname if > 1 word
            if (nameParts.length > 1) {
                lastName = nameParts.pop();
                firstName = nameParts.join(' ');
            } else {
                firstName = nameParts.join(' ');
            }


            setFormData(prev => ({
                ...prev,
                title: title,
                name: firstName,
                surname: lastName,
                // Phones
                phones: contactData.mobile ? [{ number: contactData.mobile, type: 'Personal' }] : prev.phones,
                // Emails
                emails: contactData.email ? [{ address: contactData.email, type: 'Personal' }] : prev.emails,
                // Professional (if available in contactData)
                designation: contactData.designation || prev.designation,
                company: contactData.company || prev.company,
                // System
                source: contactData.source || prev.source,
                description: contactData.remarks || prev.description,
                // Requirement stuff (Basic mapping for mock data)
                requirement: contactData.req?.type?.toLowerCase()?.includes('rent') ? 'Rent' : 'Buy',
                propertyType: contactData.req?.type?.toLowerCase()?.includes('residential') ? ['Residential'] :
                    contactData.req?.type?.toLowerCase()?.includes('commercial') ? ['Commercial'] :
                        contactData.req?.type?.toLowerCase()?.includes('industrial') ? ['Industrial'] :
                            contactData.req?.type?.toLowerCase()?.includes('agriculture') ? ['Agriculture'] :
                                contactData.req?.type?.toLowerCase()?.includes('institutional') ? ['Institutional'] : prev.propertyType,
            }));

            // Optional: Parse Budget and Location if they are strings from leadData
            if (contactData.budget) {
                const parts = contactData.budget?.replace(/₹/g, '')?.replace(/,/g, '')?.split(' - ') || [];
                if (parts.length === 2) {
                    setFormData(prev => ({
                        ...prev,
                        budgetMin: parts[0],
                        budgetMax: parts[1]
                    }));
                }
            }
            if (contactData.location) {
                setFormData(prev => ({
                    ...prev,
                    areaSearch: contactData.location,
                    searchLocation: contactData.location
                }));
            }
        }
    }, [contactData]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleProjectCityChange = (city) => {
        setFormData(prev => ({
            ...prev,
            projectCity: city,
            projectName: [], // Reset projects
            projectTowers: [] // Reset towers
        }));
    };

    const handleProjectSelectionChange = (projects) => {
        // projects is an array of selected project Names
        // If a project is deselected, we should potentialy filter out towers?
        // For now, let's just update the projects. User can manually adjust towers if needed,
        // or we can implement strict filtering.
        setFormData(prev => ({
            ...prev,
            projectName: projects
        }));
    };

    // Derived Data for Dropdowns
    const availableProjects = formData.projectCity && PROJECT_DATA[formData.projectCity]
        ? PROJECT_DATA[formData.projectCity].map(p => p.name)
        : [];

    const availableTowers = formData.projectName.length > 0 && formData.projectCity
        ? PROJECT_DATA[formData.projectCity]
            .filter(p => formData.projectName.includes(p.name))
            .flatMap(p => p.towers)
        : [];

    const handleSave = () => {
        onAdd(formData);
        onClose();
    };

    // Navigation Logic
    const handleNext = () => {
        if (entityType === 'lead') {
            if (currentTab === 'requirement') setCurrentTab('location');
            else if (currentTab === 'location') setCurrentTab('basic');
        } else {
            // Contact Flow
            if (currentTab === 'basic') setCurrentTab('personal');
            else if (currentTab === 'personal') setCurrentTab('other');
        }
    };

    const handlePrev = () => {
        if (entityType === 'lead') {
            if (currentTab === 'location') setCurrentTab('requirement');
            else if (currentTab === 'basic') setCurrentTab('location');
        } else {
            // Contact Flow
            if (currentTab === 'personal') setCurrentTab('basic');
            else if (currentTab === 'other') setCurrentTab('personal');
        }
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

    const searchInputRef = useRef(null);
    const areaInputRef = useRef(null); // New Ref for Area Search

    useEffect(() => {
        // Location Search Autocomplete
        if ((locationTab === 'search' || currentTab === 'requirement') && searchInputRef.current && window.google) {
            const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
                types: ['geocode'],
                fields: ['address_components', 'geometry', 'formatted_address']
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (!place.geometry) {
                    console.log("Returned place contains no geometry");
                    return;
                }

                const addressComponents = place.address_components;
                let city = '', state = '', country = '', zipcode = '', area = '';
                // Simple extraction
                addressComponents.forEach(component => {
                    const types = component.types;
                    if (types.includes('locality')) city = component.long_name;
                    if (types.includes('sublocality_level_1')) area = component.long_name;
                    if (types.includes('administrative_area_level_1')) state = component.long_name;
                    if (types.includes('country')) country = component.long_name;
                    if (types.includes('postal_code')) zipcode = component.long_name;
                });

                setFormData(prev => ({
                    ...prev,
                    searchLocation: place.formatted_address,
                    locCity: city,
                    locArea: area || city, // Fallback
                    locState: state,
                    locCountry: country,
                    locPinCode: zipcode,
                    locLat: place.geometry.location.lat(),
                    locLng: place.geometry.location.lng()
                }));
            });
        }

        // Area Search Autocomplete
        if ((locationTab === 'search' || currentTab === 'requirement') && areaInputRef.current && window.google) {
            const areaAutocomplete = new window.google.maps.places.Autocomplete(areaInputRef.current, {
                types: ['geocode'],
                fields: ['address_components', 'geometry', 'formatted_address']
            });

            areaAutocomplete.addListener('place_changed', () => {
                const place = areaAutocomplete.getPlace();
                if (!place.geometry) return;

                // We just update the areaSearch field with the formatted address
                setFormData(prev => ({
                    ...prev,
                    areaSearch: place.formatted_address
                }));
            });
        }
    }, [currentTab, locationTab]);

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
                                {contactData
                                    ? `Add ${contactData.name} to Lead`
                                    : (mode === 'edit' ? 'Update Lead' : 'Add Lead')}
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
                                        setCurrentTab(entityType === 'lead' ? 'requirement' : 'basic');
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
                                {entityType === 'lead' && <button onClick={() => setCurrentTab('requirement')} style={tabStyle(currentTab === 'requirement')}>Requirement</button>}
                                {entityType === 'lead' && <button onClick={() => setCurrentTab('location')} style={tabStyle(currentTab === 'location')}>Location</button>}
                                <button onClick={() => setCurrentTab('basic')} style={tabStyle(currentTab === 'basic')}>{entityType === 'lead' ? 'Contact Details' : 'Basic Details'}</button>
                                {entityType !== 'lead' && <button onClick={() => setCurrentTab('personal')} style={tabStyle(currentTab === 'personal')}>Personal</button>}
                                {entityType !== 'lead' && <button onClick={() => setCurrentTab('other')} style={tabStyle(currentTab === 'other')}>Other</button>}
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
                                        {(!showOnlyRequired && entityType !== 'lead') && (
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

                                {entityType === 'lead' && (
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i> Campaign Details
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Campaign Name</label>
                                                <select
                                                    value={formData.campaign}
                                                    onChange={(e) => handleInputChange('campaign', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Campaign</option>
                                                    {CAMPAIGN_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
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
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Sub Source</label>
                                                <select
                                                    value={formData.subSource}
                                                    onChange={(e) => handleInputChange('subSource', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Sub Source</option>
                                                    {SUB_SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(!showOnlyRequired && entityType !== 'lead') && (
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
                                {(!showOnlyRequired && entityType !== 'lead') && (
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <i className="fas fa-briefcase" style={{ color: '#0ea5e9' }}></i> Professional Details
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                        ) : currentTab === 'requirement' ? (
                            <div className="no-scrollbar" style={{ padding: '4px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                    {/* Requirement Type */}
                                    <div style={sectionCardStyle}>
                                        <h4 style={labelStyle}>Requirement Type</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                            {[
                                                { label: 'Buy', icon: 'fa-shopping-cart' },
                                                { label: 'Rent', icon: 'fa-key' },
                                                { label: 'Lease', icon: 'fa-file-contract' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.label}
                                                    type="button"
                                                    onClick={() => handleInputChange('requirement', opt.label)}
                                                    style={{
                                                        padding: '6px', // Further reduced padding
                                                        borderRadius: '8px',
                                                        border: formData.requirement === opt.label ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                                        background: formData.requirement === opt.label ? '#eff6ff' : '#fff',
                                                        color: formData.requirement === opt.label ? '#2563eb' : '#64748b',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <i className={`fas ${opt.icon}`} style={{ fontSize: '0.9rem' }}></i> {/* Further reduced icon size */}
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{opt.label}</span> {/* Reduced font size */}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Property Category */}
                                    <div style={sectionCardStyle}>
                                        <h4 style={labelStyle}>Property Category</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}> {/* Reduced grid gap and min-width */}
                                            {[
                                                { label: 'Residential', icon: 'fa-home' },
                                                { label: 'Commercial', icon: 'fa-building' },
                                                { label: 'Industrial', icon: 'fa-industry' },
                                                { label: 'Agricultural', icon: 'fa-seedling' },
                                                { label: 'Institutional', icon: 'fa-university' }
                                            ].map(cat => (
                                                <button
                                                    key={cat.label}
                                                    type="button"
                                                    onClick={() => {
                                                        const newCats = formData.propertyType.includes(cat.label)
                                                            ? formData.propertyType.filter(c => c !== cat.label)
                                                            : [...formData.propertyType, cat.label];
                                                        handleInputChange('propertyType', newCats);
                                                    }}
                                                    style={{
                                                        padding: '6px', // Further reduced padding
                                                        borderRadius: '8px',
                                                        border: formData.propertyType.includes(cat.label) ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                                        background: formData.propertyType.includes(cat.label) ? '#eff6ff' : '#fff',
                                                        color: formData.propertyType.includes(cat.label) ? '#2563eb' : '#64748b',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        height: '100%'
                                                    }}
                                                >
                                                    <i className={`fas ${cat.icon}`} style={{ fontSize: '0.9rem' }}></i> {/* Further reduced icon size */}
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'center' }}>{cat.label}</span> {/* Reduced font size */}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sub Categories */}
                                    {formData.propertyType.length > 0 && (
                                        <div style={sectionCardStyle}>
                                            <h4 style={labelStyle}>Property Sub-Category</h4>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {Array.from(new Set(formData.propertyType.flatMap(cat => PROPERTY_CATEGORIES[cat]?.subCategories || []))).map(sub => (
                                                    <button
                                                        key={sub}
                                                        type="button"
                                                        onClick={() => {
                                                            const newSubs = formData.subType.includes(sub)
                                                                ? formData.subType.filter(s => s !== sub)
                                                                : [...formData.subType, sub];
                                                            handleInputChange('subType', newSubs);
                                                        }}
                                                        style={{
                                                            padding: '6px 14px',
                                                            borderRadius: '20px',
                                                            border: formData.subType.includes(sub) ? '1px solid #6366f1' : '1px solid #e2e8f0',
                                                            background: formData.subType.includes(sub) ? '#eef2ff' : '#fff',
                                                            color: formData.subType.includes(sub) ? '#4f46e5' : '#64748b',
                                                            fontSize: '0.85rem',
                                                            cursor: 'pointer',
                                                            fontWeight: formData.subType.includes(sub) ? 500 : 400,
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {sub}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Area Range and Size Type */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={sectionCardStyle}>
                                            <h4 style={labelStyle}>Area Range</h4>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={formData.areaMin}
                                                    onChange={(e) => handleInputChange('areaMin', e.target.value)}
                                                    placeholder="Min"
                                                    style={{ ...inputStyle, minWidth: '0', flex: 1 }} // Allow shrink
                                                />
                                                <span style={{ color: '#94a3b8' }}>-</span>
                                                <input
                                                    type="text"
                                                    value={formData.areaMax}
                                                    onChange={(e) => handleInputChange('areaMax', e.target.value)}
                                                    placeholder="Max"
                                                    style={{ ...inputStyle, minWidth: '0', flex: 1 }} // Allow shrink
                                                />
                                                <div style={{ width: '130px', flexShrink: 0 }}> {/* Adjusted width */}
                                                    <select
                                                        value={formData.areaMetric}
                                                        onChange={(e) => handleInputChange('areaMetric', e.target.value)}
                                                        style={{ ...inputStyle, paddingRight: '4px' }}
                                                    >
                                                        <option value="Sq Yard">Sq Yard</option>
                                                        <option value="Sq Feet">Sq Feet</option>
                                                        <option value="Sq Meter">Sq Meter</option>
                                                        <option value="Acre">Acre</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={sectionCardStyle}>
                                            <h4 style={labelStyle}>Size Type</h4>
                                            <CustomMultiSelect
                                                options={['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', 'Duplex', 'Penthouse', 'Villa']}
                                                value={formData.unitType}
                                                onChange={(val) => handleInputChange('unitType', val)}
                                                placeholder="Select Size Types"
                                            />
                                        </div>
                                    </div>

                                    {/* Transaction Details */}
                                    <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                        <h4 style={{ ...labelStyle, color: '#0369a1', marginBottom: '16px' }}>Transaction Preferences</h4>

                                        {/* Row 1: Budget Range (Moved to Top) */}
                                        <div style={{ marginBottom: '20px' }}>


                                            <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                                                Budget Range <span style={{ color: '#ef4444' }}>*</span>
                                            </label>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                {/* Min Budget */}
                                                <select
                                                    value={formData.budgetMin}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        handleInputChange('budgetMin', newVal);
                                                        // Reset Max if it becomes invalid (less than or equal to new Min)
                                                        if (formData.budgetMax && Number(formData.budgetMax) <= Number(newVal)) {
                                                            handleInputChange('budgetMax', '');
                                                        }
                                                    }}
                                                    style={{ ...customSelectStyle, flex: 1 }}
                                                >
                                                    <option value="">Min</option>
                                                    {BUDGET_VALUES.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>

                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>

                                                {/* Max Budget */}
                                                <select
                                                    value={formData.budgetMax}
                                                    onChange={(e) => handleInputChange('budgetMax', e.target.value)}
                                                    style={{ ...customSelectStyle, flex: 1 }}
                                                    disabled={!formData.budgetMin} // Disable if Min not selected
                                                >
                                                    <option value="">Max</option>
                                                    {BUDGET_VALUES
                                                        .filter(opt => !formData.budgetMin || opt.value > Number(formData.budgetMin))
                                                        .map((opt) => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))
                                                    }
                                                </select>
                                            </div>
                                        </div>

                                        {/* Row 2: Transaction Type & Funding */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                                            <div>
                                                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>Transaction Type</label>
                                                <select
                                                    value={formData.transactionType}
                                                    onChange={(e) => handleInputChange('transactionType', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Type</option>
                                                    <option value="Collector Rate">Collector Rate</option>
                                                    <option value="Full White">Full White</option>
                                                    <option value="Flexible">Flexible</option>
                                                </select>

                                                {/* Percentage Input for Flexible */}
                                                {formData.transactionType === 'Flexible' && (
                                                    <div style={{ marginTop: '12px' }}>
                                                        <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', display: 'block' }}>White Portion (%)</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="100"
                                                                step="5"
                                                                value={formData.whitePortion || 50}
                                                                onChange={(e) => handleInputChange('whitePortion', e.target.value)}
                                                                style={{ flex: 1, accentColor: '#3b82f6' }}
                                                            />
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6', width: '40px', textAlign: 'right' }}>
                                                                {formData.whitePortion || 50}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Funding - Standalone Dropdown */}
                                            <div>
                                                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>Funding</label>
                                                <select
                                                    value={formData.funding}
                                                    onChange={(e) => handleInputChange('funding', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Funding</option>
                                                    <option value="Home Loan">Home Loan</option>
                                                    <option value="Self Funding">Self Funding</option>
                                                    <option value="Loan Against Property">Loan Against Property</option>
                                                    <option value="Personal Loan">Personal Loan</option>
                                                    <option value="Business Loan">Business Loan</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Other Specifics Grid - Moved Below Transaction */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                                        <div>
                                            <h4 style={labelStyle}>Furnishing</h4>
                                            <select
                                                value={formData.furnishing}
                                                onChange={(e) => handleInputChange('furnishing', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Any</option>
                                                <option value="Unfurnished">Unfurnished</option>
                                                <option value="Semi-Furnished">Semi-Furnished</option>
                                                <option value="Fully-Furnished">Fully-Furnished</option>
                                            </select>
                                        </div>
                                        <div>
                                            <h4 style={labelStyle}>Timeline</h4>
                                            <select
                                                value={formData.timeline}
                                                onChange={(e) => handleInputChange('timeline', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Any</option>
                                                <option value="Immediate">Immediate</option>
                                                <option value="Within 3 Months">Within 3 Months</option>
                                                <option value="Within 6 Months">Within 6 Months</option>
                                                <option value="More than 6 Months">More than 6 Months</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '16px' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>Send Matched Deals via</label>
                                        <CustomMultiSelect
                                            options={['WhatsApp', 'Message', 'RCS Message', 'Mail']}
                                            value={formData.sendMatchedDeal}
                                            onChange={(val) => handleInputChange('sendMatchedDeal', val)}
                                            placeholder="Select Channels"
                                        />
                                    </div>
                                </div>

                            </div>

                        ) : currentTab === 'location' ? (

                            <div className="no-scrollbar">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                    {/* Toggle Mode */}
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <div style={{ background: '#f8fafc', padding: '4px', borderRadius: '12px', display: 'flex', gap: '8px', border: '1px solid #e2e8f0' }}>
                                            <button
                                                type="button"
                                                onClick={() => setLocationTab('search')}
                                                style={{
                                                    padding: '10px 24px',
                                                    borderRadius: '8px',
                                                    border: locationTab === 'search' ? '1px solid #3b82f6' : '1px solid transparent',
                                                    background: locationTab === 'search' ? '#eff6ff' : 'transparent',
                                                    color: locationTab === 'search' ? '#2563eb' : '#64748b',
                                                    fontWeight: 600,
                                                    boxShadow: locationTab === 'search' ? '0 1px 2px rgba(59, 130, 246, 0.1)' : 'none',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '0.9rem'
                                                }}
                                            >
                                                <i className="fas fa-map-marker-alt"></i>
                                                Search Location
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocationTab('select')}
                                                style={{
                                                    padding: '10px 24px',
                                                    borderRadius: '8px',
                                                    border: locationTab === 'select' ? '1px solid #3b82f6' : '1px solid transparent',
                                                    background: locationTab === 'select' ? '#eff6ff' : 'transparent',
                                                    color: locationTab === 'select' ? '#2563eb' : '#64748b',
                                                    fontWeight: 600,
                                                    boxShadow: locationTab === 'select' ? '0 1px 2px rgba(59, 130, 246, 0.1)' : 'none',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '0.9rem'
                                                }}
                                            >
                                                <i className="fas fa-building"></i>
                                                Select Project
                                            </button>
                                        </div>
                                    </div>

                                    {locationTab === 'search' ? (
                                        <div style={sectionCardStyle}>
                                            <h4 style={labelStyle}>Search Location</h4>

                                            {/* Row 1: Search Location (Flex Grow) + Range (Fixed) */}
                                            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Search Location</label>
                                                    <input
                                                        ref={searchInputRef}
                                                        type="text"
                                                        value={formData.searchLocation}
                                                        onChange={(e) => handleInputChange('searchLocation', e.target.value)}
                                                        placeholder="Search area, city or landmark..."
                                                        style={{ ...inputStyle, paddingLeft: '32px', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\' /%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: '10px center', backgroundSize: '16px' }}
                                                    />
                                                </div>
                                                <div style={{ width: '140px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Range</label>
                                                    <select
                                                        value={formData.range}
                                                        onChange={(e) => handleInputChange('range', e.target.value)}
                                                        style={customSelectStyle}
                                                    >
                                                        <option value="0 km">Exact</option>
                                                        <option value="Within 1 km">0-1 km</option>
                                                        <option value="Within 2 km">0-2 km</option>
                                                        <option value="Within 5 km">0-5 km</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Row 2: Street/Road/Landmark Address (New Field) */}
                                            <div style={{ marginBottom: '20px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Street/Road/Landmark Address</label>
                                                <input
                                                    type="text"
                                                    value={formData.streetAddress}
                                                    onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                                                    placeholder="Enter street name, road no, or landmark"
                                                    style={inputStyle}
                                                />
                                            </div>

                                            {/* Row 3: Location/Sector & Area (Equal Size) */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px', marginBottom: '20px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Location/Sector</label>
                                                    <input type="text" value={formData.locArea} onChange={(e) => handleInputChange('locArea', e.target.value)} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Area</label>
                                                    <input
                                                        ref={areaInputRef}
                                                        type="text"
                                                        value={formData.areaSearch}
                                                        onChange={(e) => handleInputChange('areaSearch', e.target.value)}
                                                        placeholder="Search area..."
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 4: City, State, Pin Code (Equal Size) */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>City</label>
                                                    <input type="text" value={formData.locCity} onChange={(e) => handleInputChange('locCity', e.target.value)} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>State</label>
                                                    <input type="text" value={formData.locState} onChange={(e) => handleInputChange('locState', e.target.value)} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Pin Code</label>
                                                    <input type="text" value={formData.locPinCode} onChange={(e) => handleInputChange('locPinCode', e.target.value)} style={inputStyle} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={sectionCardStyle}>
                                            <h4 style={labelStyle}>Select Project</h4>

                                            {/* City Selection (Single) */}
                                            <div style={{ marginBottom: '20px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>City</label>
                                                <select
                                                    value={formData.projectCity}
                                                    onChange={(e) => handleProjectCityChange(e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select City</option>
                                                    {CITIES.map(city => (
                                                        <option key={city} value={city}>{city}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Project Selection (Multi, Dependent on City) */}
                                            <div style={{ marginBottom: '20px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Project Name</label>
                                                <CustomMultiSelect
                                                    options={availableProjects}
                                                    value={formData.projectName}
                                                    onChange={handleProjectSelectionChange}
                                                    placeholder={formData.projectCity ? "Select Projects" : "Select City First"}
                                                    disabled={!formData.projectCity}
                                                />
                                            </div>

                                            {/* Block/Tower Selection (Multi, Dependent on Project) */}
                                            <div style={{ marginBottom: '20px' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Block/Tower</label>
                                                <CustomMultiSelect
                                                    options={availableTowers}
                                                    value={formData.projectTowers}
                                                    onChange={(val) => handleInputChange('projectTowers', val)} // Simple update
                                                    placeholder={formData.projectName.length > 0 ? "Select Towers" : "Select Project First"}
                                                    disabled={formData.projectName.length === 0}
                                                />
                                            </div>

                                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'spaceBetween', alignItems: 'center', marginBottom: '16px' }}>
                                                    <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>Specific Units</h5>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={showSpecificUnit}
                                                            onChange={(e) => setShowSpecificUnit(e.target.checked)}
                                                        />
                                                        I have specific unit numbers
                                                    </label>
                                                </div>

                                                {showSpecificUnit && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Unit Type</label>
                                                            <select
                                                                value={formData.specificUnitType}
                                                                onChange={(e) => handleInputChange('specificUnitType', e.target.value)}
                                                                style={customSelectStyle}
                                                            >
                                                                <option value="single">Single Unit</option>
                                                                <option value="row">Row/Multiple</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Unit No. (Start)</label>
                                                            <input
                                                                type="text"
                                                                value={formData.propertyNo}
                                                                onChange={(e) => handleInputChange('propertyNo', e.target.value)}
                                                                placeholder="e.g. 101"
                                                                style={inputStyle}
                                                            />
                                                        </div>
                                                        {formData.specificUnitType === 'row' && (
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Unit No. (End)</label>
                                                                <input
                                                                    type="text"
                                                                    value={formData.propertyNoEnd}
                                                                    onChange={(e) => handleInputChange('propertyNoEnd', e.target.value)}
                                                                    placeholder="e.g. 110"
                                                                    style={inputStyle}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Orientation Section (Common) */}
                                    <div style={sectionCardStyle}>
                                        <h4 style={labelStyle}>Orientation & Placement</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                                            {/* direction */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Direction</label>
                                                <CustomMultiSelect
                                                    options={DIRECTION_OPTIONS}
                                                    value={formData.direction || []}
                                                    onChange={(val) => handleInputChange('direction', val)}
                                                    placeholder="Select Direction"
                                                />
                                            </div>

                                            {/* facing */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Facing</label>
                                                <CustomMultiSelect
                                                    options={FACING_OPTIONS}
                                                    value={formData.facing}
                                                    onChange={(val) => handleInputChange('facing', val)}
                                                    placeholder="Select Facing Attributes"
                                                />
                                            </div>

                                            {/* roadWidth */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Road Width</label>
                                                <CustomMultiSelect
                                                    options={ROAD_WIDTH_OPTIONS}
                                                    value={formData.roadWidth || []}
                                                    onChange={(val) => handleInputChange('roadWidth', val)}
                                                    placeholder="Select Road Widths"
                                                />
                                            </div>

                                            {/* propertyUnitType */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Property Unit Type</label>
                                                <CustomMultiSelect
                                                    options={PROPERTY_UNIT_TYPE_OPTIONS}
                                                    value={formData.propertyUnitType || []}
                                                    onChange={(val) => handleInputChange('propertyUnitType', val)}
                                                    placeholder="Select Unit Type"
                                                />
                                            </div>
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
                                {(!showOnlyRequired && entityType !== 'lead') && (
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
                            {((entityType === 'lead' && currentTab !== 'requirement') || (entityType !== 'lead' && currentTab !== 'basic')) && (
                                <button onClick={handlePrev} style={buttonStyle.secondary}>Previous</button>
                            )}

                            {/* Next/Save Button */}
                            {((entityType === 'lead' && currentTab !== 'basic') || (entityType !== 'lead' && currentTab !== 'other')) && !showOnlyRequired ? (
                                <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                            ) : (
                                <button onClick={handleSave} style={buttonStyle.success}>{saveLabel}</button>
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

export default AddLeadModal;
