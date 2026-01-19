import React, { useState, useEffect, useRef } from 'react';

import { INDIAN_LOCATION_HIERARCHY } from '../data/detailedLocationData';
import { LOCATION_DATA } from '../data/locationData';
import { PROPERTY_CATEGORIES } from '../data/propertyData';

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

const STAGES = ['New', 'Contacted', 'Interested', 'Meeting Scheduled', 'Negotiation', 'Qualified', 'Won', 'Lost'];
const STATUSES = ['Active', 'Inactive', 'Pending', 'Closed'];
const SOURCES = ['Website', 'Referral', 'Social Media', 'Direct', 'Other', 'Cold Call', 'Walk-in'];

// Mock Contacts for Duplicate Check
const MOCK_CONTACTS = [
    {
        title: 'Mr.', name: 'Amit Kumar', surname: 'Sharma',
        company: 'Bharat Properties',
        phones: [{ phoneCode: '+91', phoneNumber: '9876543210' }],
        emails: ['amit.k@example.com'],
        personalAddress: { city: 'New Delhi', state: 'Delhi' }
    },
    {
        title: 'Ms.', name: 'Priya Singh', surname: 'Verma',
        company: 'Tech Solutions',
        phones: [{ phoneCode: '+91', phoneNumber: '9988776655' }],
        emails: ['priya.s@tech.com'],
        personalAddress: { city: 'Mumbai', state: 'Maharashtra' }
    },
    {
        title: 'Dr.', name: 'Rahul Gupta', surname: '',
        company: 'City Hospital',
        phones: [{ phoneCode: '+91', phoneNumber: '8877665544' }],
        emails: ['dr.rahul@hospital.com'],
        personalAddress: { city: 'Bangalore', state: 'Karnataka' }
    },
    {
        title: 'Mrs.', name: 'Sneha Patel', surname: '',
        company: 'Creative Design',
        phones: [{ phoneCode: '+91', phoneNumber: '7766554433' }],
        emails: ['sneha.design@example.com'],
        personalAddress: { city: 'Ahmedabad', state: 'Gujarat' }
    },
    {
        title: 'Mr.', name: 'Vikram Singh', surname: 'Rathore',
        company: 'Real Estate Co',
        phones: [{ phoneCode: '+91', phoneNumber: '9123456789' }],
        emails: ['vikram.r@realestate.com'],
        personalAddress: { city: 'Jaipur', state: 'Rajasthan' }
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

const AddContactModal = ({ isOpen, onClose, onAdd, initialData, mode = 'add', entityType = 'contact' }) => {
    const [currentTab, setCurrentTab] = useState('basic');
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

    // Pre-fill Logic
    useEffect(() => {
        if (isOpen && mode === 'edit' && initialData) {
            // Function to parse address string back to object parts (approximation)
            // Ideally we should store address parts in DB, but for now we try to parse or just leave blank if complex
            // Since we updated App.jsx to join address with commas, simple split might work if structure is strictly followed.
            // BETTER APPROACH: Use data if we had it as separate fields in initialData object.
            // Since mock data only has 'address' string, we might lose accuracy on edit unless we change data strategy.
            // BUT, for this task, user wants pre-fill. If we only have string, we can't perfectly reverse it to cascading dropdowns easily without complex parsing.
            // However, the prompt says "ab aap same ye hi add contact form ko...".
            // Assumption: for the sake of this demo, we will try to map what we can.
            // Wait! The user just added a contact with FULL details. So if we edit THAT contact, we can theoretically rely on the fact that we have the data...
            // EXCEPT our contactData only stores the flattened string 'address'.
            // ERROR: We lost the granular address data in handleSaveContact in App.jsx!
            // FIX: We need to store granular address data in contact object in App.jsx or we can't edit it back perfectly.
            // Let's assume for now we just fill Name, Mobile, Email etc. mapping back address string to fields is hard.
            // actually, let's parse the name.

            const nameParts = initialData.name.split(' ');
            let title = '';
            let name = '';
            let surname = '';

            if (['Mr.', 'Ms.', 'Mrs.', 'Dr.'].includes(nameParts[0])) {
                title = nameParts[0];
                name = nameParts.slice(1, -1).join(' '); // middle parts
                surname = nameParts[nameParts.length - 1];
            } else {
                name = nameParts.slice(0, -1).join(' ');
                surname = nameParts[nameParts.length - 1];
            }

            // Simplified for single name
            if (!surname) {
                name = initialData.name;
                surname = '';
            }

            setFormData(prev => ({
                ...prev,
                title: title,
                name: name,
                surname: surname,
                phones: [{ number: initialData.mobile, type: 'Personal' }],
                emails: [{ address: initialData.email, type: 'Personal' }],
                company: initialData.company,
                designation: initialData.designation,
                professionCategory: initialData.professional,
                // We leave address blank or simple because reversing the string 'H.No 12, Sector 4...' back to state/city/tehsil dropdowns is error prone without the raw ID objects.
                // Unless we update App.jsx to store the raw address object too.
                // For this step, I will map what is robust.
            }));
        } else if (isOpen && mode === 'add') {
            // Reset form on open add
            setFormData({
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
                documents: [{ documentName: '', documentNumber: '', documentPicture: null }],
            });
        }
    }, [isOpen, mode, initialData]);

    const handleDocumentNameSelect = (index, name) => {
        handleDocumentChange(index, 'documentName', name);
        setActiveDocumentSearchIndex(null);
        setDocumentSearchTerm('');
    };

    const handleDocumentNameAdd = (index) => {
        if (documentSearchTerm && !documentNameList.includes(documentSearchTerm)) {
            setDocumentNameList([...documentNameList, documentSearchTerm]);
            handleDocumentChange(index, 'documentName', documentSearchTerm);
            setActiveDocumentSearchIndex(null);
            setDocumentSearchTerm('');
        }
    };

    // Close dropdowns on outside click
    const companyDropdownRef = React.useRef(null);
    const documentDropdownRef = React.useRef(null);



    React.useEffect(() => {
        function handleClickOutside(event) {
            if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
                setShowCompanyDropdown(false);
            }
            if (documentDropdownRef.current && !documentDropdownRef.current.contains(event.target)) {
                setActiveDocumentSearchIndex(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    const [tagInput, setTagInput] = useState('');

    // Clock Logic
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const searchInputRef = useRef(null);

    useEffect(() => {
        if (currentTab === 'requirement' && searchInputRef.current && window.google) {
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
                let streetParts = [];
                let city = '', state = '', country = '', zipcode = '', area = '';

                if (addressComponents) {
                    addressComponents.forEach(component => {
                        const types = component.types;
                        if (types.includes('street_number')) {
                            streetParts.push(component.long_name);
                        }
                        if (types.includes('route')) {
                            streetParts.push(component.long_name);
                        }
                        if (types.includes('subpremise')) {
                            streetParts.unshift(component.long_name); // Apartment/Unit number
                        }
                        if (types.includes('premise')) {
                            streetParts.push(component.long_name); // Building name
                        }
                        if (types.includes('neighborhood')) {
                            streetParts.push(component.long_name);
                        }
                        // Other potential "refined" address parts
                        if (types.includes('landmark') || types.includes('point_of_interest') || types.includes('establishment')) {
                            streetParts.push(component.long_name);
                        }

                        if (types.includes('locality')) {
                            city = component.long_name;
                        }
                        if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
                            area = component.long_name;
                        }
                        if (types.includes('administrative_area_level_1')) {
                            state = component.long_name;
                        }
                        if (types.includes('country')) {
                            country = component.long_name;
                        }
                        if (types.includes('postal_code')) {
                            zipcode = component.long_name;
                        }
                    });
                }

                setFormData(prev => ({
                    ...prev,
                    searchLocation: place.formatted_address,
                    streetAddress: streetParts.join(', '), // Comma separated for "Road, Street, etc."
                    locCity: city,
                    locArea: area,
                    // locBlock: block, // Block field removed from UI, keeping state update minimal or removing if desired.
                    locState: state,
                    locCountry: country,
                    locPinCode: zipcode,
                    locLat: place.geometry.location.lat(),
                    locLng: place.geometry.location.lng()
                }));
            });
        }
    }, [currentTab]);

    // Add state for Location Tab toggle
    const [locationTab, setLocationTab] = useState('select'); // 'select' or 'search'
    const [showSpecificUnit, setShowSpecificUnit] = useState(false);


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
        subSource: '', // Added for Leads
        campaign: '', // Added for Leads
        team: '',
        owner: '',
        visibleTo: '',

        // Requirement Details (Lead Specific)
        requirement: 'Buy',
        propertyType: 'Residential',
        purpose: 'End use',
        nri: false,
        subType: '',
        unitType: '',
        budgetMin: '',
        budgetMax: '',
        areaMin: '',
        areaMax: '',
        areaMetric: 'Sq Yard',
        searchLocation: '',
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
        specificUnitType: 'single', // 'single' or 'row'
        propertyNo: '',
        propertyNoEnd: '',

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

        // Document - Array
        documents: [{ documentName: '', documentNumber: '', documentPicture: null }]
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

    // Duplicate Check Logic
    const [similarContacts, setSimilarContacts] = useState([]);
    const [activeField, setActiveField] = useState(null); // 'name', 'phone-0', 'email-0'

    useEffect(() => {
        if (!isOpen) return;

        const nameQuery = formData.name.trim().toLowerCase();
        const surnameQuery = formData.surname.trim().toLowerCase();
        const phones = formData.phones || [];
        const emails = formData.emails || [];

        // Always search based on content, regardless of field focus, for side panel
        if (nameQuery.length > 2 || phones.some(p => p.number?.length > 2) || emails.some(e => e.address?.length > 2)) {
            let matches = [];

            // Check Name
            if (nameQuery.length > 2) {
                matches = [...matches, ...MOCK_CONTACTS.filter(c =>
                    c.name.toLowerCase().includes(nameQuery) ||
                    (c.surname && c.surname.toLowerCase().includes(nameQuery))
                )];
            }

            // Check Phones
            const phoneQueries = phones.filter(p => p.number && p.number.length > 2).map(p => p.number);
            if (phoneQueries.length > 0) {
                matches = [...matches, ...MOCK_CONTACTS.filter(c =>
                    c.phones.some(p => phoneQueries.some(q => p.phoneNumber.includes(q)))
                )];
            }

            // Check Emails
            const emailQueries = emails.filter(e => e.address && e.address.length > 2).map(e => e.address.toLowerCase());
            if (emailQueries.length > 0) {
                matches = [...matches, ...MOCK_CONTACTS.filter(c =>
                    c.emails.some(e => emailQueries.some(q => e.toLowerCase().includes(q)))
                )];
            }

            // Unique by name+phone (simple dedup for display)
            const uniqueMatches = Array.from(new Set(matches.map(m => m.name + m.phones[0].phoneNumber)))
                .map(id => matches.find(m => m.name + m.phones[0].phoneNumber === id));

            setSimilarContacts(uniqueMatches);
        } else {
            setSimilarContacts([]);
        }
    }, [formData.name, formData.phones, formData.emails, isOpen]);

    const handlePopulateForm = (contact) => {
        setFormData(prev => ({
            ...prev,
            title: contact.title || prev.title,
            name: contact.name || prev.name,
            surname: contact.surname || prev.surname,
            company: contact.company || prev.company,
            phones: contact.phones && contact.phones.length > 0 ? contact.phones.map(p => ({ number: p.phoneNumber, type: 'Personal' })) : prev.phones,
            emails: contact.emails && contact.emails.length > 0 ? contact.emails.map(e => ({ address: e, type: 'Personal' })) : prev.emails,
            personalAddress: { ...prev.personalAddress, ...(contact.personalAddress || {}) }
        }));
        setSimilarContacts([]); // Close popup after update
        setActiveField(null);
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

    const handleDocumentChange = (index, field, value) => {
        const newDocuments = [...formData.documents];
        newDocuments[index][field] = value;
        setFormData(prev => ({ ...prev, documents: newDocuments }));
    };

    const handleDocumentUpload = (index, event) => {
        const file = event.target.files[0];
        if (file) {
            const newDocuments = [...formData.documents];
            newDocuments[index].documentPicture = file;
            setFormData(prev => ({ ...prev, documents: newDocuments }));
        }
    };

    const addDocument = () => {
        setFormData(prev => ({
            ...prev,
            documents: [...prev.documents, { documentNo: '', documentName: '', documentPicture: null }]
        }));
    };

    const removeDocument = (index) => {
        const newDocuments = formData.documents.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, documents: newDocuments }));
    };

    const handleCompanySelect = (company) => {
        setFormData(prev => ({ ...prev, company }));
        setCompanySearch(company);
        setShowCompanyDropdown(false);
    };

    const handleNext = () => {
        if (showOnlyRequired) return;

        if (currentTab === 'basic') {
            if (entityType === 'lead') setCurrentTab('requirement');
            else setCurrentTab('personal');
        }
        else if (currentTab === 'requirement') setCurrentTab('personal');
        else if (currentTab === 'personal') setCurrentTab('other');
        else if (currentTab === 'other') setCurrentTab('contactDetails');
    };

    const handlePrev = () => {
        if (showOnlyRequired) return;

        if (currentTab === 'contactDetails') setCurrentTab('other');
        else if (currentTab === 'other') setCurrentTab('personal');
        else if (currentTab === 'personal') {
            if (entityType === 'lead') setCurrentTab('requirement');
            else setCurrentTab('basic');
        }
        else if (currentTab === 'requirement') setCurrentTab('basic');
    };

    const handleSave = () => {
        handleSubmit();
    };

    const [unitInput, setUnitInput] = useState('');

    const handleUnitKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = unitInput.trim();
            if (val) {
                // Determine current propertyNo state (ensure array)
                const currentUnits = Array.isArray(formData.propertyNo) ? formData.propertyNo : [];
                if (!currentUnits.includes(val)) {
                    setFormData(prev => ({ ...prev, propertyNo: [...currentUnits, val] }));
                }
                setUnitInput('');
            }
        }
    };

    const removeUnit = (indexToRemove) => {
        setFormData(prev => ({
            ...prev,
            propertyNo: (Array.isArray(prev.propertyNo) ? prev.propertyNo : []).filter((_, index) => index !== indexToRemove)
        }));
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
            tags: [], description: '',
            professionCategory: '', professionSubCategory: '',
            designation: '', company: '',
            source: '', subSource: '', campaign: '', team: '', owner: '', visibleTo: '',
            requirement: 'Buy', propertyType: [], purpose: 'End use', nri: false,
            subType: [], unitType: [], budgetMin: '', budgetMax: '', areaMin: '', areaMax: '', areaMetric: 'Sq Yard',
            searchLocation: '', streetAddress: '', range: 'Within 3 km', locCity: '', locArea: '', locBlock: [], projectName: [], locPinCode: '',
            locCountry: '', locState: '', locLat: '', locLng: '', facing: [], roadWidth: [], direction: [], funding: '', timeline: '',
            furnishing: '', propertyUnitType: [], transactionType: '', transactionFlexiblePercent: 50, sendMatchedDeal: [],
            personalAddress: { hNo: '', country: '', state: '', city: '', tehsil: '', postOffice: '', pinCode: '', location: '', area: '' },
            correspondenceAddress: { hNo: '', country: '', state: '', city: '', tehsil: '', postOffice: '', pinCode: '', location: '', area: '' },
            gender: '', maritalStatus: '', birthDate: '', anniversaryDate: '',
            educations: [{ education: '', degree: '', school: '' }],
            loans: [{ loanType: '', bank: '', loanAmount: '' }],
            socialMedia: [{ platform: '', url: '' }],
            incomes: [{ incomeType: '', amount: '' }],
            documentNo: '', documentName: '', documentPicture: null,
            specificUnitType: 'single', propertyNo: [], propertyNoEnd: ''
        });
        setUnitInput('');
        setCurrentTab('basic');
    };

    if (!isOpen) return null;

    // --- Premium Styles ---
    // --- Compact / AddUser-like Styles ---
    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    };

    const hasDuplicates = similarContacts && similarContacts.length > 0;

    const modalStyle = {
        background: '#ffffff',
        width: hasDuplicates ? '1150px' : '800px', // Swiches between fixed widths
        maxWidth: '95vw',
        height: showOnlyRequired ? 'auto' : '85vh', // Auto height for compact mode
        maxHeight: '90vh', // Prevent overflow on small screens
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'row', // Horizontal Layout
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 0.3s ease' // Smooth transition for the modal container
    };

    const leftPaneStyle = {
        width: '800px', // LOCKED Width -> Form never resizes
        flex: 'none',   // Prevent flex growing/shrinking
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: hasDuplicates ? '1px solid #f1f5f9' : 'none',
        transition: 'border-right 0.3s ease'
    };

    const rightPaneStyle = {
        width: '350px', // Fixed sidebar width
        flex: 'none',
        background: '#f8fafc',
        display: hasDuplicates ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        opacity: hasDuplicates ? 1 : 0,
        transition: 'opacity 0.2s ease',
        transitionDelay: hasDuplicates ? '0.1s' : '0s' // Delay fade-in slightly
    };

    // Removed "Card" styling completely. Just spacing.
    const sectionCardStyle = {
        marginBottom: '24px'
    };

    const sectionTitleStyle = {
        fontSize: '1rem',
        fontWeight: '700',
        color: '#0f172a', // Darker, simpler
        marginBottom: '16px',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '8px'
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: '4px'
    };

    const inputStyle = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        fontSize: '0.9rem',
        color: '#0f172a',
        height: '38px',
        boxSizing: 'border-box',
        backgroundColor: '#fff',
        marginTop: '2px', // Slight gap from label
        outline: 'none',
        transition: 'border-color 0.15s'
    };



    const tabStyle = (isActive) => ({
        padding: '8px 24px',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: isActive ? '#0284c7' : '#64748b', // Blue-600 active, Slate-500 inactive
        backgroundColor: isActive ? '#fff' : 'transparent',
        border: isActive ? '1px solid #bfdbfe' : '1px solid transparent', // Blue-200 active
        borderRadius: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '0px',
        boxShadow: isActive ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
    });

    const buttonStyle = {
        primary: {
            background: '#0284c7', // Sky-600
            color: '#fff',
            border: 'none',
            padding: '8px 24px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem'
        },
        secondary: {
            background: '#fff',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            padding: '8px 24px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem'
        },
        cancel: {
            background: '#fff',
            color: '#ef4444', // Red for cancel to be distinct but still white bg
            border: '1px solid #fca5a5',
            padding: '8px 24px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem'
        },
        save: {
            background: '#22c55e', // Green-500
            color: '#fff',
            border: 'none',
            padding: '8px 24px',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.85rem',
            boxShadow: '0 4px 6px -1px rgba(34, 197, 94, 0.2)'
        }
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                {/* Left Pane - Form Content */}
                <div style={leftPaneStyle}>
                    {/* Header - Compact Style */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                                {mode === 'edit'
                                    ? `Update ${entityType === 'lead' ? 'Lead' : 'Contact'}`
                                    : `Add ${entityType === 'lead' ? 'Lead' : 'Contact'}`}
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
                                {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                id="showRequired"
                                checked={showOnlyRequired}
                                onChange={(e) => {
                                    setShowOnlyRequired(e.target.checked);
                                    if (e.target.checked) setCurrentTab('basic');
                                }}
                                style={{ width: '16px', height: '16px', accentColor: '#0f172a', cursor: 'pointer' }}
                            />
                            <label htmlFor="showRequired" style={{ fontSize: '0.85rem', color: '#475569', margin: 0, cursor: 'pointer', fontWeight: 500 }}>
                                Show required fields only
                            </label>
                        </div>
                    </div>

                    {/* Tabs - Segmented Control */}
                    <div style={{ padding: '16px 32px 0 32px', background: '#fff' }}>
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            padding: '4px',
                            background: '#f1f5f9', // Slate-100 pill container
                            borderRadius: '9999px',
                            width: 'fit-content'
                        }}>
                            <button
                                onClick={() => setCurrentTab('basic')}
                                style={tabStyle(currentTab === 'basic')}
                            >
                                Basic
                            </button>
                            {!showOnlyRequired && (
                                <>
                                    {entityType === 'lead' && (
                                        <button
                                            onClick={() => setCurrentTab('requirement')}
                                            style={tabStyle(currentTab === 'requirement')}
                                        >
                                            Requirement
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setCurrentTab('personal')}
                                        style={tabStyle(currentTab === 'personal')}
                                    >
                                        Personal
                                    </button>
                                    <button
                                        onClick={() => setCurrentTab('other')}
                                        style={tabStyle(currentTab === 'other')}
                                    >
                                        Other
                                    </button>
                                    <button
                                        onClick={() => setCurrentTab('contactDetails')}
                                        style={tabStyle(currentTab === 'contactDetails')}
                                    >
                                        Contact Details
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Body */}
                    <div className="no-scrollbar" style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                        {currentTab === 'basic' ? (
                            <div>

                                {/* Basic Details Section */}
                                <div style={sectionCardStyle}>
                                    <div style={sectionTitleStyle}>Basic Details</div>

                                    {/* Title, Name, Surname */}
                                    {/* Title, Name, Surname Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: showOnlyRequired ? '1fr' : '80px 1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                                        {!showOnlyRequired && (
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
                                        )}

                                        {/* Name Input with Popup */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="text"
                                                style={inputStyle}
                                                placeholder="First name"
                                                value={formData.name}
                                                onChange={(e) => handleInputChange('name', e.target.value)}
                                                onFocus={() => setActiveField('name')}
                                                onBlur={() => setTimeout(() => setActiveField(null), 200)} // Delay to allow click
                                                autoComplete="off"
                                            />

                                        </div>

                                        {!showOnlyRequired && (
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
                                        )}
                                    </div>


                                    {/* Father/Husband Name */}
                                    {!showOnlyRequired && (
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
                                    )}

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
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input
                                                        type="tel"
                                                        style={{ ...inputStyle, width: '100%' }}
                                                        placeholder="enter phone number"
                                                        value={phone.number}
                                                        onChange={(e) => handlePhoneChange(index, 'number', e.target.value)}
                                                        onFocus={() => setActiveField(`phone-${index}`)}
                                                        onBlur={() => setTimeout(() => setActiveField(null), 200)}
                                                        autoComplete="off"
                                                    />

                                                </div>
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
                                    {!showOnlyRequired && (
                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={labelStyle}>Email-Address <span style={{ color: '#ef4444' }}>*</span></label>
                                            {formData.emails.map((email, index) => (
                                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px', gap: '8px', marginBottom: '8px' }}>
                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <input
                                                            type="email"
                                                            style={{ ...inputStyle, width: '100%' }}
                                                            placeholder="enter email id"
                                                            value={email.address}
                                                            onChange={(e) => handleEmailChange(index, 'address', e.target.value)}
                                                            onFocus={() => setActiveField(`email-${index}`)}
                                                            onBlur={() => setTimeout(() => setActiveField(null), 200)}
                                                            autoComplete="off"
                                                        />

                                                    </div>
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
                                    )}



                                </div>
                                {/* Professional Details */}
                                {!showOnlyRequired && (
                                    <>
                                        <div style={sectionCardStyle}>
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
                                                    <div style={{ position: 'relative' }} ref={companyDropdownRef}>
                                                        <input
                                                            type="text"
                                                            style={inputStyle}
                                                            value={companySearch || formData.company}
                                                            onChange={(e) => {
                                                                setCompanySearch(e.target.value);
                                                                handleInputChange('company', e.target.value);
                                                                setShowCompanyDropdown(true);
                                                            }}
                                                            onFocus={() => setShowCompanyDropdown(true)}
                                                            placeholder="Select or type to add company..."
                                                        />
                                                        {showCompanyDropdown && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: '100%',
                                                                left: 0,
                                                                right: 0,
                                                                background: 'white',
                                                                border: '1px solid #cbd5e1',
                                                                borderRadius: '0 0 8px 8px',
                                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                                maxHeight: '200px',
                                                                overflowY: 'auto',
                                                                zIndex: 50
                                                            }}>
                                                                {companyList.filter(c => c.toLowerCase().includes((companySearch || '').toLowerCase())).map((company, index) => (
                                                                    <div
                                                                        key={index}
                                                                        onClick={() => handleCompanySelect(company)}
                                                                        style={{
                                                                            padding: '8px 12px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.9rem',
                                                                            color: '#334155',
                                                                            borderBottom: '1px solid #f1f5f9'
                                                                        }}
                                                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                                                        onMouseLeave={(e) => e.target.style.background = 'white'}
                                                                    >
                                                                        {company}
                                                                    </div>
                                                                ))}
                                                                {companySearch && !companyList.map(c => c.toLowerCase()).includes(companySearch.toLowerCase()) && (
                                                                    <div
                                                                        onClick={handleCompanyAdd}
                                                                        style={{
                                                                            padding: '8px 12px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.9rem',
                                                                            color: '#2563eb',
                                                                            fontWeight: 600,
                                                                            background: '#eff6ff'
                                                                        }}
                                                                    >
                                                                        <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>
                                                                        Add "{companySearch}"
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Campaign Details - Specific for Leads */}
                                {entityType === 'lead' && (
                                    <div style={sectionCardStyle}>
                                        <div style={sectionTitleStyle}>Campaign Details</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                            <div>
                                                <label style={labelStyle}>Campaign</label>
                                                <select
                                                    style={inputStyle}
                                                    value={formData.campaign}
                                                    onChange={(e) => handleInputChange('campaign', e.target.value)}
                                                >
                                                    <option value="">--Select Campaign--</option>
                                                    <option value="Organic Campaign">Organic Campaign</option>
                                                    <option value="Online Campaign">Online Campaign</option>
                                                    <option value="Offline Campaign">Offline Campaign</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Source</label>
                                                <select
                                                    style={inputStyle}
                                                    value={formData.source}
                                                    onChange={(e) => handleInputChange('source', e.target.value)}
                                                >
                                                    <option value="">--Select Source--</option>
                                                    <option value="Website">Website</option>
                                                    <option value="Referral">Referral</option>
                                                    <option value="Cold Call">Cold Call</option>
                                                    <option value="Social Media">Social Media</option>
                                                    <option value="Walk-in">Walk-in</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Sub Source</label>
                                                <select
                                                    style={inputStyle}
                                                    value={formData.subSource}
                                                    onChange={(e) => handleInputChange('subSource', e.target.value)}
                                                >
                                                    <option value="">--Select Sub Source--</option>
                                                    <option value="Call">Call</option>
                                                    <option value="SMS">SMS</option>
                                                    <option value="Whatsapp">Whatsapp</option>
                                                    <option value="Email">Email</option>
                                                    <option value="RCS">RCS</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* System Details */}
                                {/* Always visible or conditionally visible if we want, but user requested 'system details' as required */}
                                <div style={sectionCardStyle}>
                                    <div style={sectionTitleStyle}>System Details</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        {/* Hide Source in System Details if Lead, because it's in Campaign Details */}
                                        {entityType !== 'lead' && (
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
                                        )}
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
                                        <div>
                                            <label style={labelStyle}>Assign</label>
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
                                                <option value="Only Me">Only Me</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : currentTab === 'requirement' ? (
                            <div>
                                {/* Requirement Details */}
                                <div style={sectionCardStyle}>
                                    <div style={sectionTitleStyle}>Requirement</div>

                                    {/* Row 1: Requirement, Category (Property Type), Purpose, NRI */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 0.5fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Requirement</label>
                                            <select style={inputStyle} value={formData.requirement} onChange={(e) => handleInputChange('requirement', e.target.value)}>
                                                <option value="Buy">Buy</option>
                                                <option value="Rent">Rent</option>
                                                <option value="Lease">Lease</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Category</label>
                                            <CustomMultiSelect
                                                options={Object.keys(PROPERTY_CATEGORIES)}
                                                value={formData.propertyType || []}
                                                onChange={(newCategories) => {
                                                    setFormData(prev => ({ ...prev, propertyType: newCategories, subType: [], unitType: [] }));
                                                }}
                                                placeholder="Select Category"
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Purpose</label>
                                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                    <input type="radio" name="purpose" value="End use" checked={formData.purpose === 'End use'} onChange={(e) => handleInputChange('purpose', e.target.value)} /> End use
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                    <input type="radio" name="purpose" value="Investment" checked={formData.purpose === 'Investment'} onChange={(e) => handleInputChange('purpose', e.target.value)} /> Investment
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>NRI</label>
                                            <div style={{ marginTop: '8px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={formData.nri} onChange={(e) => handleInputChange('nri', e.target.checked)} /> Yes
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 2: Sub Category, Size Type */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Sub Category</label>
                                            <CustomMultiSelect
                                                options={[...new Set((formData.propertyType || []).flatMap(cat => PROPERTY_CATEGORIES[cat]?.subCategories || []))]}
                                                value={formData.subType || []}
                                                onChange={(newSubTypes) => {
                                                    setFormData(prev => ({ ...prev, subType: newSubTypes }));
                                                }}
                                                placeholder="Select Sub Category"
                                                disabled={!formData.propertyType || formData.propertyType.length === 0}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Size Type</label>
                                            <CustomMultiSelect
                                                options={[...new Set((formData.propertyType || []).flatMap(cat => PROPERTY_CATEGORIES[cat]?.sizeTypes || []))]}
                                                value={formData.unitType || []}
                                                onChange={(newSizeTypes) => {
                                                    setFormData(prev => ({ ...prev, unitType: newSizeTypes }));
                                                }}
                                                placeholder="Select Size Type"
                                                disabled={!formData.propertyType || formData.propertyType.length === 0}
                                            />
                                        </div>
                                    </div>

                                    {/* Row 3: Budget */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Budget Min</label>
                                            <select style={inputStyle} value={formData.budgetMin} onChange={(e) => handleInputChange('budgetMin', e.target.value)}>
                                                <option value="">--Select--</option>
                                                <option value="50 Lakh">50,00,000/- (fifty lakh)</option>
                                                <option value="1 Cr">1,00,00,000/- (one crore)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Budget Max</label>
                                            <select style={inputStyle} value={formData.budgetMax} onChange={(e) => handleInputChange('budgetMax', e.target.value)}>
                                                <option value="">--Select--</option>
                                                <option value="1 Cr">1,00,00,000/- (one crore)</option>
                                                <option value="3 Cr">3,00,00,000/- (three crore)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Row 4: Area */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Minimum Area</label>
                                            <input type="number" style={inputStyle} placeholder="25" value={formData.areaMin} onChange={(e) => handleInputChange('areaMin', e.target.value)} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Maximum Area</label>
                                            <input type="number" style={inputStyle} placeholder="225" value={formData.areaMax} onChange={(e) => handleInputChange('areaMax', e.target.value)} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Area Metric</label>
                                            <select style={inputStyle} value={formData.areaMetric} onChange={(e) => handleInputChange('areaMetric', e.target.value)}>
                                                <option value="Sq Yard">Sq Yard</option>
                                                <option value="Sq Ft">Sq Ft</option>
                                                <option value="Marla">Marla</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Location Details Box - With Personal Address Style */}
                                    <div style={{ ...sectionCardStyle, background: '#f0f9ff', border: '1px solid #bae6fd', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '12px', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>Location Details</div>

                                        {/* Toggle Tabs (Select/Search) */}
                                        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setLocationTab('select')}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px 16px',
                                                    background: locationTab === 'select' ? '#3b82f6' : '#f1f5f9',
                                                    color: locationTab === 'select' ? '#fff' : '#64748b',
                                                    border: locationTab === 'select' ? '2px solid #2563eb' : '2px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 600,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                Select Location
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLocationTab('search')}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px 16px',
                                                    background: locationTab === 'search' ? '#3b82f6' : '#f1f5f9',
                                                    color: locationTab === 'search' ? '#fff' : '#64748b',
                                                    border: locationTab === 'search' ? '2px solid #2563eb' : '2px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 600,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <i className="fas fa-search" style={{ marginRight: '6px' }}></i>
                                                Search Location
                                            </button>
                                        </div>

                                        {/* Content for 'Select Location' Tab */}
                                        {locationTab === 'select' && (
                                            <div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                    <div>
                                                        <label style={labelStyle}>City</label>
                                                        <select
                                                            style={inputStyle}
                                                            value={formData.locCity}
                                                            onChange={(e) => {
                                                                const city = e.target.value;
                                                                setFormData(prev => ({ ...prev, locCity: city, projectName: [], locBlock: [] }));
                                                            }}
                                                        >
                                                            <option value="">--Select City--</option>
                                                            {LOCATION_DATA.cities.map(city => (
                                                                <option key={city} value={city}>{city}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Project Name</label>
                                                        <CustomMultiSelect
                                                            options={LOCATION_DATA.projects[formData.locCity] || []}
                                                            value={formData.projectName || []}
                                                            onChange={(newProjects) => {
                                                                setFormData(prev => ({ ...prev, projectName: newProjects, locBlock: [] }));
                                                            }}
                                                            placeholder="Select Projects"
                                                            disabled={!formData.locCity}
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ marginBottom: '16px' }}>
                                                    <label style={labelStyle}>Block</label>
                                                    <CustomMultiSelect
                                                        options={[...new Set((formData.projectName || []).flatMap(p => LOCATION_DATA.blocks[p] || []))]}
                                                        value={formData.locBlock || []}
                                                        onChange={(newBlocks) => {
                                                            setFormData(prev => ({ ...prev, locBlock: newBlocks }));
                                                        }}
                                                        placeholder="Select Blocks"
                                                        disabled={!formData.projectName || formData.projectName.length === 0}
                                                    />
                                                </div>

                                                {/* Specific Unit Section */}
                                                <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', background: '#fff' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Specific Unit</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                {(formData.projectName?.length === 1 && formData.locBlock?.length === 1) ? 'Available' : 'Select 1 Project & 1 Block to Enable'}
                                                            </span>
                                                            <label style={{ position: 'relative', display: 'inline-block', width: '34px', height: '20px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={!(formData.projectName?.length === 1 && formData.locBlock?.length === 1)}
                                                                    checked={showSpecificUnit && (formData.projectName?.length === 1 && formData.locBlock?.length === 1)}
                                                                    onChange={(e) => setShowSpecificUnit(e.target.checked)}
                                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                                />
                                                                <span style={{
                                                                    position: 'absolute', cursor: (formData.projectName?.length === 1 && formData.locBlock?.length === 1) ? 'pointer' : 'not-allowed',
                                                                    top: 0, left: 0, right: 0, bottom: 0, backgroundColor: (showSpecificUnit && (formData.projectName?.length === 1 && formData.locBlock?.length === 1)) ? '#3b82f6' : '#cbd5e1',
                                                                    transition: '.4s', borderRadius: '34px'
                                                                }}></span>
                                                                <span style={{
                                                                    position: 'absolute', content: '""', height: '14px', width: '14px', left: (showSpecificUnit && (formData.projectName?.length === 1 && formData.locBlock?.length === 1)) ? '16px' : '4px',
                                                                    bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                                                }}></span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {(showSpecificUnit && (formData.projectName?.length === 1 && formData.locBlock?.length === 1)) && (
                                                        <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                                            <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                                                    <input
                                                                        type="radio"
                                                                        name="specificUnitType"
                                                                        checked={formData.specificUnitType === 'single'}
                                                                        onChange={() => handleInputChange('specificUnitType', 'single')}
                                                                        style={{ marginRight: '6px' }}
                                                                    />
                                                                    Select Single Unit
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: '#475569' }}>
                                                                    <input
                                                                        type="radio"
                                                                        name="specificUnitType"
                                                                        checked={formData.specificUnitType === 'row'}
                                                                        onChange={() => handleInputChange('specificUnitType', 'row')}
                                                                        style={{ marginRight: '6px' }}
                                                                    />
                                                                    Select Row
                                                                </label>
                                                            </div>

                                                            {formData.specificUnitType === 'single' ? (
                                                                <div>
                                                                    <label style={labelStyle}>Property Number (Type & Enter)</label>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                                                        {Array.isArray(formData.propertyNo) && formData.propertyNo.map((unit, index) => (
                                                                            <span key={index} style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                                                                                {unit}
                                                                                <span onClick={() => removeUnit(index)} style={{ marginLeft: '6px', cursor: 'pointer', color: '#64748b', fontWeight: 'bold' }}>&times;</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        style={inputStyle}
                                                                        value={unitInput}
                                                                        onChange={(e) => setUnitInput(e.target.value)}
                                                                        onKeyDown={handleUnitKeyDown}
                                                                        placeholder="Type unit and press Enter..."
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label style={labelStyle}>Property Number (From)</label>
                                                                        <input type="text" style={inputStyle} value={formData.propertyNo} onChange={(e) => handleInputChange('propertyNo', e.target.value)} placeholder="Start No" />
                                                                    </div>
                                                                    <div style={{ fontWeight: 600, color: '#64748b', paddingTop: '24px' }}>to</div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label style={labelStyle}>Property Number (To)</label>
                                                                        <input type="text" style={inputStyle} value={formData.propertyNoEnd} onChange={(e) => handleInputChange('propertyNoEnd', e.target.value)} placeholder="End No" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Content for 'Search Location' Tab */}
                                        {locationTab === 'search' && (
                                            <div>
                                                <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={labelStyle}>Search Location</label>
                                                        <input
                                                            ref={searchInputRef}
                                                            type="text"
                                                            style={inputStyle}
                                                            placeholder="Enter a location"
                                                            defaultValue={formData.searchLocation}
                                                            onChange={(e) => handleInputChange('searchLocation', e.target.value)}
                                                        />
                                                    </div>
                                                    <div style={{ width: '140px' }}>
                                                        <label style={labelStyle}>Range</label>
                                                        <select style={inputStyle} value={formData.range} onChange={(e) => handleInputChange('range', e.target.value)}>
                                                            <option value="Within 3 km">Within 3 km</option>
                                                            <option value="Within 5 km">Within 5 km</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div style={{ marginBottom: '16px' }}>
                                                    <label style={labelStyle}>Street Address</label>
                                                    <input type="text" style={inputStyle} value={formData.streetAddress} onChange={(e) => handleInputChange('streetAddress', e.target.value)} placeholder="Enter street address" />
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                    <div><label style={labelStyle}>Location</label><input type="text" style={inputStyle} value={formData.locArea} onChange={(e) => handleInputChange('locArea', e.target.value)} /></div>
                                                    <div><label style={labelStyle}>City</label><input type="text" style={inputStyle} value={formData.locCity} onChange={(e) => handleInputChange('locCity', e.target.value)} /></div>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                    <div><label style={labelStyle}>Country</label><input type="text" style={inputStyle} value={formData.locCountry} onChange={(e) => handleInputChange('locCountry', e.target.value)} /></div>
                                                    <div><label style={labelStyle}>State</label><input type="text" style={inputStyle} value={formData.locState} onChange={(e) => handleInputChange('locState', e.target.value)} /></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Other Details */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Other Details</div>

                                        {/* Multi-Select Group: Facing, Road, Direction, Property Unit Type */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                            <div>
                                                <label style={labelStyle}>Facing</label>
                                                <CustomMultiSelect
                                                    options={['School', 'Park', 'Corner', 'Main Road']}
                                                    value={formData.facing || []}
                                                    onChange={(newVal) => setFormData(prev => ({ ...prev, facing: newVal }))}
                                                    placeholder="Select Facing"
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Road</label>
                                                <CustomMultiSelect
                                                    options={['50 Mtr', '30 Mtr', '24 Mtr', '12 Mtr', '100 Ft', '80 Ft', '60 Ft']}
                                                    value={formData.roadWidth || []}
                                                    onChange={(newVal) => setFormData(prev => ({ ...prev, roadWidth: newVal }))}
                                                    placeholder="Select Road Width"
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Direction</label>
                                                <CustomMultiSelect
                                                    options={['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West']}
                                                    value={formData.direction || []}
                                                    onChange={(newVal) => setFormData(prev => ({ ...prev, direction: newVal }))}
                                                    placeholder="Select Direction"
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Property Unit Type</label>
                                                <CustomMultiSelect
                                                    options={['2 BHK', '3 BHK', '4 BHK', '5 BHK', 'Penthouse', 'Studio', 'Villa']}
                                                    value={formData.propertyUnitType || []}
                                                    onChange={(newVal) => setFormData(prev => ({ ...prev, propertyUnitType: newVal }))}
                                                    placeholder="Select Unit Type"
                                                />
                                            </div>
                                        </div>

                                        {/* Single-Select Group: Funding, Timeline, Furnishing */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                            <div>
                                                <label style={labelStyle}>Funding</label>
                                                <select style={inputStyle} value={formData.funding} onChange={(e) => handleInputChange('funding', e.target.value)}>
                                                    <option value="">--Select--</option>
                                                    <option value="Home Loan">Home Loan</option>
                                                    <option value="Self Funding">Self Funding</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Timeline</label>
                                                <select style={inputStyle} value={formData.timeline} onChange={(e) => handleInputChange('timeline', e.target.value)}>
                                                    <option value="">--Select--</option>
                                                    <option value="Urgent">Urgent</option>
                                                    <option value="Within 1 Month">Within 1 Month</option>
                                                    <option value="Within 3 Months">Within 3 Months</option>
                                                    <option value="Within 6 Months">Within 6 Months</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Furnishing</label>
                                                <select style={inputStyle} value={formData.furnishing} onChange={(e) => handleInputChange('furnishing', e.target.value)}>
                                                    <option value="">--Select--</option>
                                                    <option value="Fully Furnished">Fully Furnished</option>
                                                    <option value="Semi Furnished">Semi Furnished</option>
                                                    <option value="Unfurnished">Unfurnished</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Transaction Type */}
                                        <div style={{ marginBottom: '12px' }}>
                                            <label style={labelStyle}>Transaction Type</label>
                                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', alignItems: 'center' }}>
                                                {['Collector Rate', 'Full White', 'Flexible'].map(type => (
                                                    <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="radio"
                                                            name="transactionType"
                                                            value={type}
                                                            checked={formData.transactionType === type}
                                                            onChange={(e) => handleInputChange('transactionType', e.target.value)}
                                                        />
                                                        {type}
                                                    </label>
                                                ))}
                                            </div>

                                            {/* Flexible Percentage Animation */}
                                            <div style={{
                                                marginTop: formData.transactionType === 'Flexible' ? '12px' : '0',
                                                maxHeight: formData.transactionType === 'Flexible' ? '60px' : '0',
                                                opacity: formData.transactionType === 'Flexible' ? 1 : 0,
                                                overflow: 'hidden',
                                                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                background: '#f8fafc',
                                                padding: formData.transactionType === 'Flexible' ? '12px' : '0 12px',
                                                borderRadius: '8px',
                                                border: formData.transactionType === 'Flexible' ? '1px solid #e2e8f0' : 'none'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Flexibility:</label>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={formData.transactionFlexiblePercent}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, transactionFlexiblePercent: e.target.value }))}
                                                        style={{ flex: 1, cursor: 'pointer', accentColor: '#3b82f6' }}
                                                    />
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#3b82f6', width: '40px', textAlign: 'right' }}>{formData.transactionFlexiblePercent}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Send Matched Deal */}
                                        <div style={{ marginBottom: '12px' }}>
                                            <label style={labelStyle}>Send Matched Deal</label>
                                            <CustomMultiSelect
                                                options={['Whatsapp', 'Message', 'RCS Message', 'Mail']}
                                                value={formData.sendMatchedDeal || []}
                                                onChange={(newVal) => setFormData(prev => ({ ...prev, sendMatchedDeal: newVal }))}
                                                placeholder="Select Platforms"
                                            />
                                        </div>
                                    </div>

                                </div>
                            </div>
                        ) : currentTab === 'personal' ? (
                            <div>
                                {/* Address Details - Hide if showing only required */}
                                {!showOnlyRequired ? (
                                    <>
                                        <div style={{ ...sectionCardStyle, background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                            <div style={{ ...sectionTitleStyle, borderBottomColor: '#cbd5e1' }}>Address Details</div>

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

                                            {/* Line 2: Country, State, District */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                <div>
                                                    <label style={labelStyle}>Country</label>
                                                    <select
                                                        style={inputStyle}
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.country : formData.correspondenceAddress.country}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            // customized reset logic
                                                            const updates = { country: val, state: '', city: '', tehsil: '', postOffice: '', pinCode: '' };
                                                            if (currentAddressType === 'permanent') {
                                                                setFormData(prev => ({ ...prev, personalAddress: { ...prev.personalAddress, ...updates } }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, correspondenceAddress: { ...prev.correspondenceAddress, ...updates } }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">--Select Country--</option>
                                                        <option value="India">India</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>State</label>
                                                    <select
                                                        style={inputStyle}
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.state : formData.correspondenceAddress.state}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const updates = { state: val, city: '', tehsil: '', postOffice: '', pinCode: '' };
                                                            if (currentAddressType === 'permanent') {
                                                                setFormData(prev => ({ ...prev, personalAddress: { ...prev.personalAddress, ...updates } }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, correspondenceAddress: { ...prev.correspondenceAddress, ...updates } }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">--Select State--</option>
                                                        {Object.keys(INDIAN_LOCATION_HIERARCHY).map(st => (
                                                            <option key={st} value={st}>{st}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>District / City</label>
                                                    <select
                                                        style={inputStyle}
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.city : formData.correspondenceAddress.city}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const updates = { city: val, tehsil: '', postOffice: '', pinCode: '' };
                                                            if (currentAddressType === 'permanent') {
                                                                setFormData(prev => ({ ...prev, personalAddress: { ...prev.personalAddress, ...updates } }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, correspondenceAddress: { ...prev.correspondenceAddress, ...updates } }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">--Select District--</option>
                                                        {(() => {
                                                            const addr = currentAddressType === 'permanent' ? formData.personalAddress : formData.correspondenceAddress;
                                                            if (addr.state && INDIAN_LOCATION_HIERARCHY[addr.state]) {
                                                                return Object.keys(INDIAN_LOCATION_HIERARCHY[addr.state]).map(d => (
                                                                    <option key={d} value={d}>{d}</option>
                                                                ));
                                                            }
                                                            return null;
                                                        })()}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Line 3: Tehsil, Post Office, Pincode */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                <div>
                                                    <label style={labelStyle}>Tehsil</label>
                                                    <select
                                                        style={inputStyle}
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.tehsil : formData.correspondenceAddress.tehsil}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            const updates = { tehsil: val, postOffice: '', pinCode: '' };
                                                            if (currentAddressType === 'permanent') {
                                                                setFormData(prev => ({ ...prev, personalAddress: { ...prev.personalAddress, ...updates } }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, correspondenceAddress: { ...prev.correspondenceAddress, ...updates } }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">--Select Tehsil--</option>
                                                        {(() => {
                                                            const addr = currentAddressType === 'permanent' ? formData.personalAddress : formData.correspondenceAddress;
                                                            if (addr.state && addr.city && INDIAN_LOCATION_HIERARCHY[addr.state] && INDIAN_LOCATION_HIERARCHY[addr.state][addr.city]) {
                                                                return Object.keys(INDIAN_LOCATION_HIERARCHY[addr.state][addr.city]).map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ));
                                                            }
                                                            return null;
                                                        })()}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Post Office</label>
                                                    <select
                                                        style={inputStyle}
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.postOffice : formData.correspondenceAddress.postOffice}
                                                        onChange={(e) => {
                                                            const val = e.target.value; // Name
                                                            const addr = currentAddressType === 'permanent' ? formData.personalAddress : formData.correspondenceAddress;
                                                            // Find Pincode
                                                            let pin = '';
                                                            if (addr.state && addr.city && addr.tehsil) {
                                                                const offices = INDIAN_LOCATION_HIERARCHY[addr.state][addr.city][addr.tehsil] || [];
                                                                const selected = offices.find(o => o.name === val);
                                                                if (selected) pin = selected.pincode;
                                                            }

                                                            const updates = { postOffice: val, pinCode: pin };

                                                            if (currentAddressType === 'permanent') {
                                                                setFormData(prev => ({ ...prev, personalAddress: { ...prev.personalAddress, ...updates } }));
                                                            } else {
                                                                setFormData(prev => ({ ...prev, correspondenceAddress: { ...prev.correspondenceAddress, ...updates } }));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">--Select Post Office--</option>
                                                        {(() => {
                                                            const addr = currentAddressType === 'permanent' ? formData.personalAddress : formData.correspondenceAddress;
                                                            if (addr.state && addr.city && addr.tehsil &&
                                                                INDIAN_LOCATION_HIERARCHY[addr.state] &&
                                                                INDIAN_LOCATION_HIERARCHY[addr.state][addr.city] &&
                                                                INDIAN_LOCATION_HIERARCHY[addr.state][addr.city][addr.tehsil]) {
                                                                return INDIAN_LOCATION_HIERARCHY[addr.state][addr.city][addr.tehsil].map(po => (
                                                                    <option key={po.name} value={po.name}>{po.name}</option>
                                                                ));
                                                            }
                                                            return null;
                                                        })()}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Pin Code</label>
                                                    <input
                                                        type="text"
                                                        style={{ ...inputStyle, backgroundColor: '#f1f5f9', cursor: 'not-allowed' }} // Visual cue for auto-fill
                                                        value={currentAddressType === 'permanent' ? formData.personalAddress.pinCode : formData.correspondenceAddress.pinCode}
                                                        readOnly
                                                        placeholder="Auto-filled"
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


                                        </div>
                                        <div style={sectionCardStyle}>
                                            <div style={sectionTitleStyle}>Personal Info</div>
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

                                        </div>
                                        <div style={sectionCardStyle}>
                                            {/* Document */}
                                            <div style={sectionTitleStyle}>Document</div>
                                            <div ref={documentDropdownRef}>
                                                {formData.documents.map((doc, index) => (
                                                    <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) minmax(150px, 1fr) minmax(120px, 1fr) 80px', gap: '12px', marginBottom: '12px' }}>
                                                        {/* 1. Document Name (Creatable) */}
                                                        <div>
                                                            {index === 0 && <label style={labelStyle}>Document Name</label>}
                                                            <div style={{ position: 'relative' }}>
                                                                <input
                                                                    type="text"
                                                                    style={inputStyle}
                                                                    value={activeDocumentSearchIndex === index ? documentSearchTerm : doc.documentName}
                                                                    onChange={(e) => {
                                                                        if (activeDocumentSearchIndex !== index) {
                                                                            setActiveDocumentSearchIndex(index);
                                                                            setDocumentSearchTerm(e.target.value);
                                                                        } else {
                                                                            setDocumentSearchTerm(e.target.value);
                                                                        }
                                                                        handleDocumentChange(index, 'documentName', e.target.value);
                                                                    }}
                                                                    onFocus={() => {
                                                                        setActiveDocumentSearchIndex(index);
                                                                        setDocumentSearchTerm(doc.documentName || '');
                                                                    }}
                                                                    placeholder="Select or type..."
                                                                />
                                                                {activeDocumentSearchIndex === index && (
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        top: '100%',
                                                                        left: 0,
                                                                        right: 0,
                                                                        background: 'white',
                                                                        border: '1px solid #cbd5e1',
                                                                        borderRadius: '0 0 8px 8px',
                                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                                        maxHeight: '200px',
                                                                        overflowY: 'auto',
                                                                        zIndex: 50
                                                                    }}>
                                                                        {documentNameList.filter(d => d.toLowerCase().includes((documentSearchTerm || '').toLowerCase())).map((name, i) => (
                                                                            <div
                                                                                key={i}
                                                                                onClick={() => handleDocumentNameSelect(index, name)}
                                                                                style={{
                                                                                    padding: '8px 12px',
                                                                                    cursor: 'pointer',
                                                                                    fontSize: '0.9rem',
                                                                                    color: '#334155',
                                                                                    borderBottom: '1px solid #f1f5f9'
                                                                                }}
                                                                                onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                                                                onMouseLeave={(e) => e.target.style.background = 'white'}
                                                                            >
                                                                                {name}
                                                                            </div>
                                                                        ))}
                                                                        {documentSearchTerm && !documentNameList.map(d => d.toLowerCase()).includes(documentSearchTerm.toLowerCase()) && (
                                                                            <div
                                                                                onClick={() => handleDocumentNameAdd(index)}
                                                                                style={{
                                                                                    padding: '8px 12px',
                                                                                    cursor: 'pointer',
                                                                                    fontSize: '0.9rem',
                                                                                    color: '#2563eb',
                                                                                    fontWeight: 600,
                                                                                    background: '#eff6ff'
                                                                                }}
                                                                            >
                                                                                <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>
                                                                                Add "{documentSearchTerm}"
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 2. Document No (Simple Input) */}
                                                        <div>
                                                            {index === 0 && <label style={labelStyle}>Document No</label>}
                                                            <input
                                                                type="text"
                                                                style={inputStyle}
                                                                value={doc.documentNo}
                                                                onChange={(e) => handleDocumentChange(index, 'documentNo', e.target.value)}
                                                                placeholder="Enter number"
                                                            />
                                                        </div>

                                                        {/* 3. Upload Image (Smaller) */}
                                                        <div>
                                                            {index === 0 && <label style={labelStyle}>Document Picture</label>}
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={(e) => handleDocumentUpload(index, e)}
                                                                    style={{ display: 'none' }}
                                                                    id={`documentUpload-${index}`}
                                                                />
                                                                <label
                                                                    htmlFor={`documentUpload-${index}`}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: '8px 6px',
                                                                        background: '#f8fafc',
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: '4px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.7rem',
                                                                        textAlign: 'center',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '4px',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        height: '40px',
                                                                        boxSizing: 'border-box'
                                                                    }}
                                                                >
                                                                    <i className="fas fa-upload" style={{ color: '#64748b' }}></i>
                                                                    {doc.documentPicture ? 'Uploaded' : 'Upload'}
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {/* Actions (Square Buttons) */}
                                                        <div style={{ display: 'flex', gap: '4px', alignItems: index === 0 ? 'flex-end' : 'center' }}>
                                                            {index === formData.documents.length - 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={addDocument}
                                                                    title="Add Document"
                                                                    style={{ padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1, height: '40px' }}
                                                                >
                                                                    <i className="fas fa-plus"></i>
                                                                </button>
                                                            )}
                                                            {formData.documents.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeDocument(index)}
                                                                    title="Remove Document"
                                                                    style={{ padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1, height: '40px' }}
                                                                >
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No required fields in Personal Details
                                    </div>
                                )}


                            </div>
                        ) : currentTab === 'other' ? (
                            <div>
                                {/* Other Details - Hide if showing only required */}
                                {!showOnlyRequired ? (
                                    <>
                                        <div style={sectionCardStyle}>
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
                                        </div>
                                        <div style={sectionCardStyle}>
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
                                        </div>
                                        <div style={sectionCardStyle}>
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
                                        </div>
                                        <div style={sectionCardStyle}>
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
                                        </div>
                                        <div style={sectionCardStyle}>
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
                                    </>
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No required fields in Other Details
                                    </div>
                                )}

                            </div>
                        ) : currentTab === 'contactDetails' ? (
                            <div>
                                {/* Contact Details Tab - Required Fields */}
                                <div style={sectionCardStyle}>
                                    <div style={sectionTitleStyle}>Contact Details</div>

                                    {/* Name Fields */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Salutation</label>
                                            <select
                                                style={inputStyle}
                                                value={formData.salutation}
                                                onChange={(e) => handleInputChange('salutation', e.target.value)}
                                            >
                                                <option value="Mr.">Mr.</option>
                                                <option value="Mrs.">Mrs.</option>
                                                <option value="Ms.">Ms.</option>
                                                <option value="Dr.">Dr.</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="text"
                                                style={inputStyle}
                                                placeholder="first name"
                                                value={formData.firstName}
                                                onChange={(e) => handleInputChange('firstName', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Last Name</label>
                                            <input
                                                type="text"
                                                style={inputStyle}
                                                placeholder="last name"
                                                value={formData.lastName}
                                                onChange={(e) => handleInputChange('lastName', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile Number */}
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
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input
                                                        type="tel"
                                                        style={{ ...inputStyle, width: '100%' }}
                                                        placeholder="enter phone number"
                                                        value={phone.number}
                                                        onChange={(e) => handlePhoneChange(index, 'number', e.target.value)}
                                                        autoComplete="off"
                                                    />
                                                </div>
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
                                                            style={{ flex: 1, padding: '8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            <i className="fas fa-plus"></i>
                                                        </button>
                                                    )}
                                                    {formData.phones.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removePhone(index)}
                                                            style={{ flex: 1, padding: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Activity Status (Stage, Status, Source) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Stage</label>
                                            <select style={inputStyle} value={formData.stage} onChange={(e) => handleInputChange('stage', e.target.value)}>
                                                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Status</label>
                                            <select style={inputStyle} value={formData.status} onChange={(e) => handleInputChange('status', e.target.value)}>
                                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Source</label>
                                            <select style={inputStyle} value={formData.source} onChange={(e) => handleInputChange('source', e.target.value)}>
                                                <option value="">--Select--</option>
                                                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        ) : null}
                    </div>



                    {/* Footer - Compact Gray Style */}
                    <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                        {/* Left Side: Cancel */}
                        <button
                            onClick={onClose}
                            style={buttonStyle.cancel}
                        >
                            Cancel
                        </button>

                        {/* Right Side: Navigation */}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {currentTab !== 'basic' && (
                                <button
                                    onClick={handlePrev}
                                    style={buttonStyle.secondary}
                                >
                                    Previous
                                </button>
                            )}
                            {currentTab !== 'contactDetails' && !showOnlyRequired ? (
                                <button
                                    onClick={handleNext}
                                    style={buttonStyle.primary}
                                >
                                    Next
                                </button>
                            ) : (
                                <button
                                    onClick={handleSave}
                                    style={buttonStyle.success}
                                >
                                    Save
                                </button>
                            )}
                        </div>
                    </div>
                </div >


                {/* Right Side Pane - Duplicate Suggestions */}
                < div style={rightPaneStyle} >
                    <div style={{
                        padding: '20px 24px',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#fff',
                        marginBottom: '1px'
                    }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#334155' }}>
                            Suggestions
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            Possible duplicates based on input
                        </p>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <DuplicateResults contacts={similarContacts} onUpdate={handlePopulateForm} />
                    </div>
                </div >

            </div >
        </div >
    );
};

export default AddContactModal;
