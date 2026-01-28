import React, { useState, useEffect, useRef } from 'react';
import api from '../../api'; // Import API for contact search
import { usePropertyConfig } from '../context/PropertyConfigContext';

import { INDIAN_LOCATION_HIERARCHY } from '../data/detailedLocationData';
import { PROJECT_DATA, CITIES } from '../data/projectData';
import { LOCATION_DATA } from '../data/locationData';
import { PROPERTY_CATEGORIES, DIRECTION_OPTIONS } from '../data/propertyData';

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


// Education Constants


// Sources for Dropdown
// Sources and Campaigns are now fetched from Context


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
                                {typeof contact.emails[0] === 'string' ? contact.emails[0] : contact.emails[0]?.address}
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
    const { propertyConfig, masterFields, leadMasterFields } = usePropertyConfig(); // Updated context
    const [currentTab, setCurrentTab] = useState('requirement'); // default to requirement for lead

    const [showOnlyRequired, setShowOnlyRequired] = useState(false);

    // Master Fields Options
    const facingOptions = masterFields?.facings || [];
    const roadWidthOptions = masterFields?.roadWidths || [];
    const unitTypeOptions = masterFields?.unitTypes || [];
    const directionOptions = masterFields?.directions || DIRECTION_OPTIONS;
    const floorLevelOptions = masterFields?.floorLevels || [];


    // Document Name Logic


    const [locationTab, setLocationTab] = useState('select'); // 'select' or 'search'
    const [showSpecificUnit, setShowSpecificUnit] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [similarContacts, setSimilarContacts] = useState([]);

    // Contact Search State
    const [contactSearchQuery, setContactSearchQuery] = useState('');
    const [contactSearchResults, setContactSearchResults] = useState([]);
    const [isContactSearchLoading, setIsContactSearchLoading] = useState(false);
    const [selectedContact, setSelectedContact] = useState(null);

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
        countryCode: '+91',
        phones: [{ number: '', type: 'Personal' }],
        emails: [{ address: '', type: 'Personal' }],
        contactDetails: '', // Link to Contact ID

        // System Details
        source: '',
        campaign: '',
        tags: [],
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
        areaSearch: '',
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
        projectCity: '',
        projectTowers: [],
        specificUnitType: 'single',
        propertyNo: '',
        propertyNoEnd: '',
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
                // System
                source: contactData.source || prev.source,
                campaign: contactData.campaign || prev.campaign,
                team: contactData.team || prev.team,
                owner: contactData.owner || prev.owner,
                visibleTo: contactData.visibleTo || prev.visibleTo,
            }));



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
        setFormData(prev => ({
            ...prev,
            projectName: projects
        }));
    };

    // --- Contact Search Logic ---
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (contactSearchQuery.length >= 2) {
                handleContactSearch(contactSearchQuery);
            } else {
                setContactSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [contactSearchQuery]);

    const handleContactSearch = async (query) => {
        setIsContactSearchLoading(true);
        try {
            // Using the endpoint confirmed in ContactsPage.jsx
            const response = await api.get(`get-all-contact?search=${query}`);
            console.log(response);

            if (response.data && response.data.success) {
                setContactSearchResults(response.data.data);
            } else {
                setContactSearchResults([]);
            }
        } catch (error) {
            console.error("Error searching contacts:", error);
            setContactSearchResults([]);
        } finally {
            setIsContactSearchLoading(false);
        }
    };

    const handleSelectContact = (contact) => {
        setContactSearchQuery(''); // Clear query or keep name? Resetting clears dropdown
        setContactSearchResults([]);
        setSelectedContact(contact);

        // Populate form data
        setFormData(prev => ({
            ...prev,
            title: contact.title || prev.title,
            name: contact.name || prev.name,
            surname: contact.surname || prev.surname,
            countryCode: contact.countryCode || prev.countryCode,
            phones: contact.mobile ? [{ number: contact.mobile, type: 'Personal' }] : (contact.phones && contact.phones.length > 0 ? contact.phones : prev.phones),
            emails: contact.email ? [{ address: contact.email, type: 'Personal' }] : (contact.emails && contact.emails.length > 0 ? contact.emails : prev.emails),

            // Map other fields if available in contact
            source: contact.source || prev.source,
            // campaign: contact.campaign || prev.campaign,
            team: contactData.team || prev.team,
            owner: contactData.owner || prev.owner,
            visibleTo: contactData.visibleTo || prev.visibleTo,

            contactDetails: contact._id // Store ID for linking (Was contactId)
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

    const handleSave = async () => {
        // Validation check (e.g., name and phone)
        if (!formData.name && !formData.phones[0].number) {
            // Add toast here if needed
            alert("Name or Phone is required");
            return;
        }

        try {
            // Check for ID in selectedContact (object) OR formData.contactDetails (ref from selection)
            let finalContactId = selectedContact?._id || formData.contactDetails;

            // If no existing contact selected, create new one first
            if (!finalContactId) {
                // Prepare contact payload
                // Minimal payload based on formData
                const contactPayload = {
                    title: formData.title,
                    name: formData.name,
                    surname: formData.surname,
                    phones: formData.phones,
                    emails: formData.emails,
                    source: formData.source,
                    // campaign: formData.campaign || prev.campaign,
                    team: formData.team || prev.team,
                    owner: formData.owner || prev.owner,
                    visibleTo: formData.visibleTo || prev.visibleTo,
                };
                console.log(contactPayload);

                // Call Add Contact API
                try {
                    const response = await api.post("add-contact", contactPayload);
                    if (response.data && response.data.success) {
                        finalContactId = response.data.data._id; // Assuming response.data.data is the created object
                        // console.log("Created new contact:", finalContactId);
                    } else {
                        throw new Error("Failed to create new contact: " + (response.data?.message || "Unknown error"));
                    }
                } catch (contactError) {
                    console.error("Error creating contact:", contactError);
                    alert("Failed to save contact details. Please try again.");
                    return;
                }
            }

            // Now call onAdd with the lead data including the contactDetails (ID)
            const leadPayload = {
                ...formData,
                contactDetails: finalContactId // Changed from contactId to contactDetails
            };

            // Optimization: If linking to an existing contact, we don't need to save redundant contact details (phones/emails) on the lead itself,
            // as they are fetched via populate. We keep 'name' for the Lead Title/Display purposes.
            if (finalContactId) {
                delete leadPayload.phones;
                delete leadPayload.emails;
                delete leadPayload.title;
                delete leadPayload.name;
                delete leadPayload.surname;
                delete leadPayload.source;
                delete leadPayload.campaign;
                delete leadPayload.team;
                delete leadPayload.owner;
                delete leadPayload.visibleTo;

            }
            console.log(leadPayload);
            onAdd(leadPayload);
            onClose();

        } catch (error) {
            console.error("Error saving lead:", error);
            alert("An error occurred while saving. Please try again.");
        }
    };


    // Navigation Logic
    const handleNext = () => {
        if (currentTab === 'requirement') setCurrentTab('location');
        else if (currentTab === 'location') setCurrentTab('basic');
    };

    const handlePrev = () => {
        if (currentTab === 'location') setCurrentTab('requirement');
        else if (currentTab === 'basic') setCurrentTab('location');
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

                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="no-scrollbar" style={{ flex: 1, padding: '24px 32px 40px 32px', overflowY: 'auto', background: '#f8fafc' }}>

                        {showOnlyRequired && entityType === 'lead' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Requirement Type */}
                                <div style={sectionCardStyle}>
                                    <h4 style={labelStyle}>Requirement Type</h4>
                                    <AnimatedSegmentControl
                                        options={['Buy', 'Rent', 'Lease']}
                                        value={formData.requirement}
                                        onChange={(val) => handleInputChange('requirement', val)}
                                    />
                                </div>

                                {/* Property Category */}
                                <div style={sectionCardStyle}>
                                    <h4 style={labelStyle}>Property Category</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}>
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
                                                    padding: '6px',
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
                                                <i className={`fas ${cat.icon}`} style={{ fontSize: '0.9rem' }}></i>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'center' }}>{cat.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Property Sub-Category */}
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

                                {/* Campaign Details (Dynamic Hierarchy) */}
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                        <i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i> Campaign Details
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                        {/* Campaign - Level 1 */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Campaign Name</label>
                                            <select
                                                value={formData.campaign}
                                                onChange={(e) => {
                                                    handleInputChange('campaign', e.target.value);
                                                    handleInputChange('source', ''); // Reset Child
                                                    handleInputChange('subSource', ''); // Reset Grandchild
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Campaign</option>
                                                {(leadMasterFields?.campaigns || []).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </div>

                                        {/* Source - Level 2 */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Source</label>
                                            <select
                                                value={formData.source}
                                                onChange={(e) => {
                                                    handleInputChange('source', e.target.value);
                                                    handleInputChange('subSource', ''); // Reset Child
                                                }}
                                                disabled={!formData.campaign}
                                                style={!formData.campaign ? customSelectStyleDisabled : customSelectStyle}
                                            >
                                                <option value="">Select Source</option>
                                                {(() => {
                                                    const selectedCamp = (leadMasterFields?.campaigns || []).find(c => c.name === formData.campaign);
                                                    return (selectedCamp?.sources || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>);
                                                })()}
                                            </select>
                                        </div>

                                        {/* Medium - Level 3 */}
                                        {/* <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Medium</label>
                                            <select
                                                value={formData.subSource}
                                                onChange={(e) => handleInputChange('subSource', e.target.value)}
                                                disabled={!formData.source}
                                                style={!formData.source ? customSelectStyleDisabled : customSelectStyle}
                                            >
                                                <option value="">Select Medium</option>
                                                {(() => {
                                                    const selectedCamp = (leadMasterFields?.campaigns || []).find(c => c.name === formData.campaign);
                                                    const selectedSrc = (selectedCamp?.sources || []).find(s => s.name === formData.source);
                                                    return (selectedSrc?.mediums || []).map(m => <option key={m} value={m}>{m}</option>);
                                                })()}
                                            </select>
                                        </div> */}
                                    </div>
                                </div>

                                {/* System Assignment (Added for completeness) */}
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
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Assign</label>
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
                        ) : currentTab === 'basic' ? (<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* NEW: Search Existing Contact */}
                            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <i className="fas fa-search" style={{ color: '#64748b' }}></i> Search Existing Contact
                                </h3>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'relative' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                                        <input
                                            type="text"
                                            value={contactSearchQuery}
                                            onChange={(e) => setContactSearchQuery(e.target.value)}
                                            placeholder="Search by name to auto-fill details..."
                                            style={{
                                                width: '100%',
                                                padding: '12px 12px 12px 36px',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '0.95rem',
                                                outline: 'none',
                                                transition: 'all 0.2s',
                                                background: '#f8fafc'
                                            }}
                                            onFocus={(e) => e.target.style.background = '#fff'}
                                            onBlur={(e) => e.target.style.background = '#f8fafc'}
                                        />
                                        {isContactSearchLoading && (
                                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                                                <i className="fas fa-circle-notch fa-spin" style={{ color: '#3b82f6' }}></i>
                                            </div>
                                        )}
                                    </div>

                                    {/* Search Results Dropdown */}
                                    {contactSearchResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            background: '#fff',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                            marginTop: '8px',
                                            zIndex: 50,
                                            maxHeight: '300px',
                                            overflowY: 'auto'
                                        }}>
                                            {contactSearchResults.map(contact => (
                                                <div
                                                    key={contact._id}
                                                    onClick={() => handleSelectContact(contact)}
                                                    style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid #f1f5f9',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                                                            {contact.title} {contact.name} {contact.surname}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                            {contact.mobile || contact.phones?.[0]?.number || contact.phones?.[0]?.phoneNumber} • {contact.email || contact.emails?.[0]?.address || (typeof contact.emails?.[0] === 'string' ? contact.emails[0] : '')}
                                                        </div>
                                                        {contact.company && (
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                                                <i className="fas fa-building"></i> {contact.company}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

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



                            {!showOnlyRequired && (
                                <>
                                    {/* Campaign & Source (Inserted/Modified) */}
                                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i> Campaign & Source
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                                            {/* Source */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Source</label>
                                                <select
                                                    value={formData.source}
                                                    onChange={(e) => handleInputChange('source', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Source</option>
                                                    {(() => {
                                                        const allSources = [];
                                                        (leadMasterFields?.campaigns || []).forEach(c => {
                                                            (c.sources || []).forEach(s => {
                                                                if (!allSources.includes(s.name)) {
                                                                    allSources.push(s.name);
                                                                }
                                                            });
                                                        });
                                                        return allSources.map(s => <option key={s} value={s}>{s}</option>);
                                                    })()}
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
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Assign</label>
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

                                    <div style={sectionCardStyle}>
                                        <h4 style={labelStyle}>Requirement Type</h4>
                                        <AnimatedSegmentControl
                                            options={['Buy', 'Rent', 'Lease']}
                                            value={formData.requirement}
                                            onChange={(val) => handleInputChange('requirement', val)}
                                        />
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
                                                {Array.from(new Set(formData.propertyType.flatMap(cat => propertyConfig[cat]?.subCategories.map(sub => sub.name) || []))).map(sub => (
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
                                                options={(() => {
                                                    // Dynamic Size Types based on selected Sub-Categories
                                                    if (formData.subType.length === 0) return [];

                                                    const allRawTypes = formData.subType.flatMap(subName => {
                                                        // Find the subcategory object across all categories
                                                        for (const cat of Object.values(propertyConfig)) {
                                                            const foundSub = cat.subCategories.find(s => s.name === subName);
                                                            if (foundSub) {
                                                                // Extract names from object-based types
                                                                return foundSub.types.map(t => typeof t === 'string' ? t : t.name) || [];
                                                            }
                                                        }
                                                        return [];
                                                    });

                                                    return Array.from(new Set(allRawTypes)).sort();
                                                })()}
                                                value={formData.unitType}
                                                onChange={(val) => handleInputChange('unitType', val)}
                                                placeholder={formData.subType.length > 0 ? "Select Size Types" : "Select Sub-Category First"}
                                                disabled={formData.subType.length === 0}
                                            />
                                        </div>
                                    </div>

                                    {/* Transaction Details */}
                                    <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                        <h4 style={{ ...labelStyle, color: '#0369a1', marginBottom: '16px' }}>Transaction Preferences</h4>

                                        {/* Row 1: Budget Range */}
                                        <div style={{ marginBottom: '20px' }}>
                                            <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                                                Budget Range <span style={{ color: '#ef4444' }}>*</span>
                                            </label>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <select
                                                    value={formData.budgetMin}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        handleInputChange('budgetMin', newVal);
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

                                                <select
                                                    value={formData.budgetMax}
                                                    onChange={(e) => handleInputChange('budgetMax', e.target.value)}
                                                    style={{ ...customSelectStyle, flex: 1 }}
                                                    disabled={!formData.budgetMin}
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
                                                    {(leadMasterFields?.transactionTypes || []).map(type => (
                                                        <option key={type} value={type}>{type}</option>
                                                    ))}
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

                                            {/* Funding */}
                                            <div>
                                                <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>Funding</label>
                                                <select
                                                    value={formData.funding}
                                                    onChange={(e) => handleInputChange('funding', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Funding</option>
                                                    {(leadMasterFields?.fundingTypes || []).map(fund => (
                                                        <option key={fund} value={fund}>{fund}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Other Specifics Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                                        <div>
                                            <h4 style={labelStyle}>Furnishing</h4>
                                            <select
                                                value={formData.furnishing}
                                                onChange={(e) => handleInputChange('furnishing', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Any</option>
                                                {(leadMasterFields?.furnishingStatuses || []).map(status => (
                                                    <option key={status} value={status}>{status}</option>
                                                ))}
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
                                                {(leadMasterFields?.timelines || []).map(time => (
                                                    <option key={time} value={time}>{time}</option>
                                                ))}
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
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Facing</label>
                                                <CustomMultiSelect
                                                    options={masterFields.facings || []} // Use from Context
                                                    value={formData.facing}
                                                    onChange={(val) => handleInputChange('facing', val)}
                                                    placeholder="Select Facing"
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Road Width</label>
                                                <CustomMultiSelect
                                                    options={masterFields.roadWidths || []} // Use from Context
                                                    value={formData.roadWidth}
                                                    onChange={(val) => handleInputChange('roadWidth', val)}
                                                    placeholder="Select Width"
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Direction</label>
                                                <CustomMultiSelect
                                                    options={masterFields.directions || []} // Use from Context
                                                    value={formData.direction || []}
                                                    onChange={(val) => handleInputChange('direction', val)}
                                                    placeholder="Select Direction"
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>Unit Type</label>
                                                <CustomMultiSelect
                                                    options={masterFields.unitTypes || []} // Use from Context
                                                    value={formData.propertyUnitType || []}
                                                    onChange={(val) => handleInputChange('propertyUnitType', val)}
                                                    placeholder="Select Unit Type"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Campaign Details (Moved from Basic Info) */}
                                    <div style={sectionCardStyle}>
                                        <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                            <i className="fas fa-bullhorn" style={{ color: '#f59e0b' }}></i> Campaign Details
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                                            {/* Campaign - Level 1 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Campaign Name</label>
                                                <select
                                                    value={formData.campaign}
                                                    onChange={(e) => {
                                                        handleInputChange('campaign', e.target.value);
                                                        handleInputChange('source', '');
                                                        handleInputChange('subSource', '');
                                                    }}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="">Select Campaign</option>
                                                    {(leadMasterFields?.campaigns || []).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                </select>
                                            </div>

                                            {/* Source - Level 2 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Source</label>
                                                <select
                                                    value={formData.source}
                                                    onChange={(e) => {
                                                        handleInputChange('source', e.target.value);
                                                        handleInputChange('subSource', '');
                                                    }}
                                                    disabled={!formData.campaign}
                                                    style={!formData.campaign ? customSelectStyleDisabled : customSelectStyle}
                                                >
                                                    <option value="">Select Source</option>
                                                    {(() => {
                                                        const selectedCamp = (leadMasterFields?.campaigns || []).find(c => c.name === formData.campaign);
                                                        return (selectedCamp?.sources || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>);
                                                    })()}
                                                </select>
                                            </div>

                                            {/* Medium - Level 3 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#64748b', marginBottom: '8px' }}>Medium</label>
                                                <select
                                                    value={formData.subSource}
                                                    onChange={(e) => handleInputChange('subSource', e.target.value)}
                                                    disabled={!formData.source}
                                                    style={!formData.source ? customSelectStyleDisabled : customSelectStyle}
                                                >
                                                    <option value="">Select Medium</option>
                                                    {(() => {
                                                        const selectedCamp = (leadMasterFields?.campaigns || []).find(c => c.name === formData.campaign);
                                                        const selectedSrc = (selectedCamp?.sources || []).find(s => s.name === formData.source);
                                                        return (selectedSrc?.mediums || []).map(m => <option key={m} value={m}>{m}</option>);
                                                    })()}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
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
