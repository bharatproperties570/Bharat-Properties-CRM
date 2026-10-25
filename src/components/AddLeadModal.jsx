import React, { useState, useEffect, useRef } from 'react';
import { useTeams, useActiveUsers, useAddLeadMutation, useUpdateLeadMutation, normalizeRefs } from '../utils/crmHooks';
import { api } from '../utils/api';
import whatsappService from '../services/whatsappService';
import { STAGE_PIPELINE } from '../utils/stageEngine';

import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { useTriggers } from '../context/TriggersContext';
import { useUserContext } from '../context/UserContext';
import { renderValue } from '../utils/renderUtils';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

// 3.4 MB Unused data removed for performance
// DIRECTION_OPTIONS import removed if unused

// Simple Custom Multi-Select Component
const CustomMultiSelect = ({ options, value, onChange, placeholder, disabled, allowSelectAll = false }) => {
    const { isDark } = useTheme();
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
                    borderRadius: '10px',
                    border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    color: isDark ? '#e2e8f0' : '#334155',
                    outline: 'none',
                    transition: 'all 0.15s ease',
                    background: disabled ? (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.05)' : '#fff'),
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '40px',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                    {Array.isArray(value) && value.length > 0 ? value.map(v => renderValue(v)).filter(Boolean).join(', ') : <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>{placeholder}</span>}
                </div>
                <i className={`fas fa-chevron-down ${isOpen ? 'fa-rotate-180' : ''}`} style={{ color: isDark ? '#64748b' : '#94a3b8', transition: 'transform 0.2s', fontSize: '0.75rem' }}></i>
            </div>

            {isOpen && !disabled && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: isDark ? '#1e293b' : '#fff',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #e2e8f0',
                    borderRadius: '10px', marginTop: '4px', zIndex: 999,
                    maxHeight: '220px', overflowY: 'auto',
                    boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.5)' : '0 10px 25px rgba(0,0,0,0.1)'
                }}>
                    {allowSelectAll && options.length > 0 && (
                        <div
                            onClick={() => {
                                const safeValue = Array.isArray(value) ? value : [];
                                if (safeValue.length === options.length) {
                                    onChange([]);
                                } else {
                                    onChange(options.map(o => renderValue(o)).filter(Boolean));
                                }
                            }}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                                fontWeight: 700
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={Array.isArray(value) && value.length === options.length && options.length > 0}
                                readOnly
                                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#6366f1' }}
                            />
                            <span style={{ fontSize: '0.82rem', color: isDark ? '#f8fafc' : '#0f172a' }}>Select All</span>
                        </div>
                    )}
                    {options.length > 0 ? options.map((opt, idx) => {
                        const optStr = renderValue(opt);
                        const isChecked = Array.isArray(value) && value.map(v => renderValue(v)).includes(optStr);
                        return (
                            <div
                                key={optStr || idx}
                                onClick={() => toggleOption(optStr)}
                                style={{
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid #f1f5f9',
                                    background: isChecked ? (isDark ? 'rgba(99,102,241,0.15)' : '#eff6ff') : 'transparent',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    readOnly
                                    style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                <span style={{ fontSize: '0.82rem', color: isChecked ? '#6366f1' : (isDark ? '#e2e8f0' : '#334155'), fontWeight: isChecked ? 600 : 400 }}>{optStr}</span>
                            </div>
                        );
                    }) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: isDark ? '#64748b' : '#94a3b8', fontSize: '0.82rem' }}>No options available</div>
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



// Financial Constants


// Education Constants


// Sources for Dropdown
// Sources and Campaigns are now fetched from Context


// Duplicate check now uses the real API instead of local mock arrays


// Duplicate Popup Component (Restyled for Side Panel)
const DuplicateResults = ({ contacts, onUpdate, isBlocked }) => {
    const { isDark } = useTheme();

    if (!contacts || contacts.length === 0) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: isDark ? '#64748b' : '#94a3b8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isDark ? '#64748b' : '#cbd5e1'
                }}>
                    <i className="fas fa-search" style={{ fontSize: '1.2rem' }}></i>
                </div>
                <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 700 }}>No Duplicates Found</h4>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: isDark ? '#64748b' : '#94a3b8' }}>Similar contacts will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '14px' }}>
            {isBlocked && (
                <div style={{
                    padding: '12px',
                    background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                    borderRadius: '10px',
                    border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
                    color: '#ef4444',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                }}>
                    <i className="fas fa-ban" style={{ marginTop: '3px' }}></i>
                    <div>
                        <div style={{ fontWeight: 800 }}>Action Blocked</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 400, marginTop: '2px', opacity: 0.9 }}>
                            A critical duplicate rule prevents saving this record.
                        </div>
                    </div>
                </div>
            )}

            <div style={{
                padding: '8px 12px',
                background: isBlocked ? (isDark ? 'rgba(239, 68, 68, 0.1)' : '#fff1f2') : (isDark ? 'rgba(14, 165, 233, 0.1)' : '#e0f2fe'),
                borderRadius: '8px',
                border: isBlocked ? '1px solid #fecaca' : (isDark ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid #bae6fd'),
                fontSize: '0.78rem',
                fontWeight: 700,
                color: isBlocked ? '#ef4444' : (isDark ? '#38bdf8' : '#0369a1'),
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <i className={`fas ${isBlocked ? 'fa-times-circle' : 'fa-exclamation-circle'}`}></i>
                {contacts.length} Similar Record{contacts.length > 1 ? 's' : ''} Found
            </div>

            {contacts.map((contact, index) => (
                <div key={index} style={{
                    background: isDark ? '#1e293b' : '#fff',
                    borderRadius: '12px',
                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                    boxShadow: isDark ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
                    padding: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', fontSize: '0.9rem' }}>
                            {contact ? `${renderValue(contact.title, "")} ${contact.firstName || contact.name || ""} ${contact.lastName || contact.surname || ""}`.trim() : "Lead Details"}
                        </div>
                        {contact.matchedEntityType && (
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                background: contact.matchedEntityType === 'Lead' ? (isDark ? 'rgba(217, 70, 239, 0.15)' : '#fdf4ff') : (isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff'),
                                color: contact.matchedEntityType === 'Lead' ? '#d946ef' : '#3b82f6',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: `1px solid ${contact.matchedEntityType === 'Lead' ? '#f0abfc' : '#bfdbfe'}`
                            }}>
                                {contact.matchedEntityType}
                            </span>
                        )}
                    </div>

                    {contact.company && (
                        <div style={{ fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '8px' }}>
                            <i className="fas fa-building" style={{ width: '16px' }}></i> {renderValue(contact.company)}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                        {(contact.phones?.[0] || contact.mobile) && (
                            <div style={{ fontSize: '0.78rem', color: isDark ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-phone" style={{ fontSize: '0.68rem', color: '#94a3b8' }}></i>
                                {contact.mobile || contact.phones?.[0]?.phoneNumber || contact.phones?.[0]?.number}
                            </div>
                        )}
                        {(contact.emails?.[0] || contact.email) && (
                            <div style={{ fontSize: '0.78rem', color: isDark ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-envelope" style={{ fontSize: '0.68rem', color: '#94a3b8' }}></i>
                                {contact.email || (typeof contact.emails?.[0] === 'string' ? contact.emails[0] : contact.emails?.[0]?.address)}
                            </div>
                        )}
                    </div>

                    {!isBlocked && (
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); onUpdate(contact); }}
                            style={{
                                width: '100%',
                                padding: '7px 10px',
                                background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                                border: '1px solid #3b82f6',
                                color: '#3b82f6',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#3b82f6';
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff';
                                e.currentTarget.style.color = '#3b82f6';
                            }}
                        >
                            <i className="fas fa-sync-alt"></i> Update Form with this
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

// ... (Rest of the file) ...


// --- Animated UI Components ---

const AnimatedSegmentControl = ({ options, value, onChange }) => {
    const { isDark } = useTheme();
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
            background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
            borderRadius: '12px',
            padding: '4px',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
            height: '46px',
            isolation: 'isolate'
        }}>
            <div style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: `calc(${activeIndex * (100 / options.length)}% + 4px)`,
                width: `calc(${100 / options.length}% - 8px)`,
                background: isDark ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : '#fff',
                borderRadius: '8px',
                boxShadow: isDark ? '0 2px 8px rgba(79, 70, 229, 0.4)' : '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
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
                        fontSize: '0.88rem',
                        fontWeight: value === option ? 800 : 600,
                        color: value === option ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}
                >
                    {option === 'Buy' && <i className="fas fa-shopping-cart" style={{ fontSize: '11px', opacity: value === option ? 1 : 0.6 }}></i>}
                    {option === 'Rent' && <i className="fas fa-key" style={{ fontSize: '11px', opacity: value === option ? 1 : 0.6 }}></i>}
                    {option === 'Lease' && <i className="fas fa-file-contract" style={{ fontSize: '11px', opacity: value === option ? 1 : 0.6 }}></i>}
                    {option}
                </button>
            ))}
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

const AddLeadModal = ({ isOpen, onClose, onAdd, initialData, mode = 'add', entityType = 'lead', contactData, saveLabel = "Save", initialTab = null }) => {
    const { propertyConfig, lookups, masterFields, leadMasterFields, getLookupId, getLookupValue, projects: allProjects } = usePropertyConfig() || {};
    const { validate = () => ({ isValid: true, errors: {} }), validateAsync = async () => ({ isValid: true, errors: {} }) } = useFieldRules() || {}; // Get Validator Engine
    const { executeDistribution = async () => null } = useDistribution() || {}; // Get Distribution Engine
    const { evaluateAndEnroll = () => {} } = useSequences() || {};
    const { fireEvent = () => {} } = useTriggers() || {};
    const { data: users = [] } = useActiveUsers() || {};
    const { isDark } = useTheme() || {};
    
    const { data: teams = [] } = useTeams();
    const addLeadMutation = useAddLeadMutation();
    const updateLeadMutation = useUpdateLeadMutation({ isPartial: false });
    const [currentTab, setCurrentTab] = useState(initialTab || (entityType === 'lead' ? 'requirement' : 'basic'));
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);

    // UI Enforcement State
    const [hiddenFields, setHiddenFields] = useState([]);
    const [, setReadOnlyFields] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({}); // Fix #5: inline per-field error state



    // Master Fields Options
    const countryCodeOptions = masterFields?.countryCodes || [];
    const titleOptions = masterFields?.titles || [];

    const [locationTab, setLocationTab] = useState('select'); // 'select' or 'search'
    const [showSpecificUnit, setShowSpecificUnit] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [similarContacts, setSimilarContacts] = useState([]);
    const [isBlocked, setIsBlocked] = useState(false);

    // Contact Search State
    const [contactSearchQuery, setContactSearchQuery] = useState('');
    const [selectedContact, setSelectedContact] = useState(null);

    // Omnichannel Auto-Dispatch states
    const [blastChannels, setBlastChannels] = useState({
        whatsapp: false,
        email: false,
        sms: false,
        rcs: false,
        whatsapp_app: false
    });
    const [hidePrice, setHidePrice] = useState(false);
    const [hideUnit, setHideUnit] = useState(false);
    const [hideLocation, setHideLocation] = useState(false);
    const [marketingTemplates, setMarketingTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [channelSchedules, setChannelSchedules] = useState({
        whatsapp: '',
        email: '',
        sms: '',
        rcs: ''
    });
    const [isBlasting, setIsBlasting] = useState(false);
    const channelAvailability = { whatsapp: true, email: true, sms: true, rcs: true, whatsapp_app: true };
    // Enterprise Broadcast Design Styles — theme-aware
    const inputStyle = {
        width: '100%',
        padding: '9px 12px',
        borderRadius: '10px',
        border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
        fontSize: '0.82rem',
        fontWeight: 500,
        outline: 'none',
        color: isDark ? '#e2e8f0' : '#1e293b',
        transition: 'all 0.15s ease',
        height: '40px',
        boxSizing: 'border-box',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff'
    };

    const sectionCardStyle = {
        background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
        padding: '16px',
        borderRadius: '14px',
        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'
    };

    const labelStyle = {
        fontSize: '0.7rem',
        fontWeight: 900,
        color: isDark ? '#94a3b8' : '#64748b',
        marginBottom: '8px',
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    };

    // Professional Dropdown Style — theme-aware
    const customSelectStyle = {
        width: '100%',
        padding: '9px 12px',
        paddingRight: '32px',
        borderRadius: '10px',
        border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
        fontSize: '0.82rem',
        fontWeight: 500,
        outline: 'none',
        background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
        color: isDark ? '#e2e8f0' : '#1e293b',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '10px',
        height: '40px',
        boxSizing: 'border-box',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
    };
    const customSelectStyleDisabled = {
        ...customSelectStyle,
        background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
        cursor: 'not-allowed',
        color: isDark ? '#475569' : '#94a3b8',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
        backgroundImage: 'none'
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (isOpen) {
            whatsappService.getTemplates().then(res => {
                const tmpls = Array.isArray(res) ? res : (res && Array.isArray(res.templates) ? res.templates : []);
                
                // 🛡️ Enterprise Logic: Only show templates explicitly aligned with this modal
                const filteredTmpls = tmpls.filter(t => t.systemContext?.includes('add_lead_modal'));
                setMarketingTemplates(filteredTmpls);
                
                // Auto-select template if aligned in settings
                if (!selectedTemplateId && filteredTmpls.length > 0) {
                    setSelectedTemplateId(filteredTmpls[0].id || filteredTmpls[0]._id || filteredTmpls[0].name);
                }
            }).catch(console.error);
        }
    }, [isOpen, selectedTemplateId]);

    const [projectData, setProjectData] = useState({});
    const [cities, setCities] = useState([]);

    useEffect(() => {
        if (allProjects && allProjects.length > 0) {
            // Group by city matching the address.city field
            const grouped = allProjects.reduce((acc, project) => {
                let cityName = 'Other';

                // Address.city could be a string name or a lookup ID
                const rawCity = project.address?.city;
                if (rawCity) {
                    cityName = getLookupValue('City', rawCity) || rawCity;
                }

                if (!acc[cityName]) acc[cityName] = [];

                // Fix for crash: Ensure towers are strings
                const safeBlocks = (project.blocks || []).map(b =>
                    typeof b === 'object' ? (b.name || '') : b
                ).filter(Boolean);

                acc[cityName].push({
                    ...project,
                    towers: safeBlocks // Backend uses 'blocks', UI uses 'towers'
                });
                return acc;
            }, {});

            setProjectData(grouped);
            setCities(Object.keys(grouped).sort());
        }
    }, [allProjects, getLookupValue]);

    const [formData, setFormData] = useState({
        // Basic Details
        title: '',
        name: '',
        surname: '',
        countryCode: '+91',
        phones: [{ number: '', type: 'Personal' }],
        emails: [{ address: '', type: 'Personal' }],
        contactDetails: null,
        description: '',

        // System Details
        // source: '',
        campaign: '',
        tags: [],
        team: '',
        owner: '',
        visibleTo: '',

        // Requirement Details (Lead Specific)
        requirement: 'Buy',
        propertyType: ['Residential'],
        purpose: 'End Use',
        nri: false,
        subType: [],
        sizeType: [],
        unitType: [],
        budgetMin: '',
        budgetMax: '',
        areaMin: '',
        areaMax: '',
        areaMetric: 'Sq Yard',
        searchLocation: '',
        areaSearch: '',
        locStreet: '',
        locHNo: '', // Added House Number
        range: 'Within 3 km',
        locCity: '', locArea: '', locBlock: [], locPinCode: '',
        locCountry: '', locState: '', locLat: '', locLng: '',
        facing: [],
        roadWidth: [],
        direction: [],
        funding: '',
        timeline: '',
        furnishing: '',
        transactionType: '',
        transactionFlexiblePercent: 50,
        sendMatchedDeal: [],
        campaignName: "",
        source: "",
        subSource: "",


        // Select Location Fields
        projectName: [],
        projectCity: '',
        projectTowers: [],
        specificUnitType: 'single',
        propertyNo: '',
        propertyNoEnd: '',
    });

    // Passive Validation (Visibility Check)
    useEffect(() => {
        if (isOpen && initialTab) {
            setCurrentTab(initialTab);
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        // Run sync validation actively to determine UI state
        // We pass 'view' context to distinguish from 'save' validation implies
        const result = validate('lead', formData, { context: 'view', stage: formData.stage || 'New' });
        setHiddenFields(result.hiddenFields || []);
        setReadOnlyFields(result.readonlyFields || []);
    }, [formData, validate]);


    // Auto-fill from contactData
    useEffect(() => {
        if (contactData) {
            const nameParts = contactData.name ? contactData.name.split(' ') : [];
            let title = '';
            let firstName = '';
            let lastName = '';

            if (nameParts.length > 0 && ['Mr.', 'Mrs.', 'Dr.', 'Ms.', 'Prof.'].includes(nameParts[0])) {
                title = nameParts[0];
                nameParts.shift();
            }
            firstName = nameParts.join(' ');
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
                phones: contactData.mobile ? [{ number: contactData.mobile, type: 'Personal' }] : prev.phones,
                emails: contactData.email ? [{ address: contactData.email, type: 'Personal' }] : prev.emails,
                source: contactData.source || prev.source,
                campaign: contactData.campaign || prev.campaign,
                team: contactData.team || prev.team,
                owner: (contactData.owner?._id || contactData.owner) || prev.owner,
                visibleTo: contactData.visibleTo || prev.visibleTo,
            }));
        }
    }, [contactData]);

    // Auto-fill or Reset Form
    // 🚀 ENTERPRISE FIX: Use a ref guard to prevent the 'add' mode from resetting
    // the form multiple times when dependency references (like getLookupValue) change.
    // Without this, selecting subType/sizeType triggers re-render → getLookupValue ref
    // could change → useEffect re-fires → form resets → selected values vanish.
    const formInitializedRef = React.useRef(false);
    const prevModeRef = React.useRef(mode);
    const prevIsOpenRef = React.useRef(isOpen);

    useEffect(() => {
        // Reset the guard when modal closes or mode changes
        if (!isOpen || mode !== prevModeRef.current || (!prevIsOpenRef.current && isOpen)) {
            formInitializedRef.current = false;
        }
        prevModeRef.current = mode;
        prevIsOpenRef.current = isOpen;

        if (!isOpen) return;

        if (mode === 'edit' && initialData) {
            const normalizeId = (val) => (val && typeof val === 'object') ? (val._id || val.id) : val;
            
            // PRIORITY LOGIC: Use contactDetails if available for live updates
            const cd = (initialData.contactDetails && typeof initialData.contactDetails === 'object') ? initialData.contactDetails : null;
            
            setFormData(prev => ({
                ...prev,
                ...initialData,
                _id: initialData._id,
                title: (cd?.title?.lookup_value || cd?.title) || (initialData.title?.lookup_value || initialData.title) || prev.title,
                name: cd?.name || initialData.firstName || initialData.name || '',
                surname: cd?.surname || initialData.lastName || initialData.surname || '',
                phones: cd?.mobile ? [{ number: cd.mobile, type: 'Personal' }] : (initialData.phones && initialData.phones.length > 0 ? initialData.phones : (initialData.mobile ? [{ number: initialData.mobile, type: 'Personal' }] : prev.phones)),
                emails: cd?.email ? [{ address: cd.email, type: 'Personal' }] : (initialData.emails && initialData.emails.length > 0 ? initialData.emails : (initialData.email ? [{ address: initialData.email, type: 'Personal' }] : prev.emails)),
                team: normalizeId(initialData.team) || prev.team,
                owner: normalizeId(initialData.owner) || prev.owner,
                visibleTo: initialData.visibleTo || prev.visibleTo,
                requirement: getLookupValue('Requirement', initialData.requirement) || prev.requirement,
                subRequirement: getLookupValue('SubRequirement', initialData.subRequirement) || prev.subRequirement,
                location: normalizeId(initialData.location) || prev.location,
                source: getLookupValue('Source', initialData.source) || prev.source,
                status: getLookupValue('Status', initialData.status) || prev.status,
                budget: getLookupValue('Budget', initialData.budget) || prev.budget,
                propertyType: Array.isArray(initialData.propertyType) ? initialData.propertyType.map(v => getLookupValue('Category', v)).filter(Boolean) : (initialData.propertyType ? [getLookupValue('Category', initialData.propertyType)].filter(Boolean) : []),
                subType: Array.isArray(initialData.subType) ? initialData.subType.map(v => getLookupValue('SubCategory', v)).filter(Boolean) : [],
                sizeType: Array.isArray(initialData.sizeType) ? initialData.sizeType.map(v => getLookupValue('PropertyType', v)).filter(Boolean) : [],
                unitType: Array.isArray(initialData.unitType) ? initialData.unitType.map(v => getLookupValue('UnitType', v)).filter(Boolean) : [],
                facing: Array.isArray(initialData.facing) ? initialData.facing.map(v => getLookupValue('Facing', v)).filter(Boolean) : [],
                roadWidth: Array.isArray(initialData.roadWidth) ? initialData.roadWidth.map(v => getLookupValue('RoadWidth', v)).filter(Boolean) : [],
                direction: Array.isArray(initialData.direction) ? initialData.direction.map(v => getLookupValue('Direction', v)).filter(Boolean) : [],
                budgetMin: initialData.budgetMin || '',
                budgetMax: initialData.budgetMax || '',
                areaMin: initialData.areaMin || '',
                areaMax: initialData.areaMax || '',
                locCity: initialData.locCity || '',
                locArea: initialData.locArea || '',
                locState: initialData.locState || '',
                locPinCode: initialData.locPinCode || '',
                searchLocation: initialData.searchLocation || '',
                streetAddress: initialData.streetAddress || '',
                description: initialData.description || initialData.remarks || '',
                campaign: normalizeId(initialData.campaign) || prev.campaign,
                subSource: normalizeId(initialData.subSource) || prev.subSource,
                contactDetails: normalizeId(initialData.contactDetails) || prev.contactDetails
            }));

            if (cd) {
                setSelectedContact(cd);
            }
            formInitializedRef.current = true;
        } else if (mode === 'add' && !formInitializedRef.current) {
            // Reset form for New Lead — ONLY ONCE when modal first opens
            setFormData({
                title: '',
                name: '',
                surname: '',
                countryCode: '+91',
                phones: [{ number: '', type: 'Personal' }],
                emails: [{ address: '', type: 'Personal' }],
                contactDetails: null,
                description: '',
                campaign: '',
                tags: [],
                team: '',
                owner: '',
                visibleTo: 'Everyone',
                requirement: 'Buy',
                propertyType: ['Residential'],
                purpose: 'End Use',
                nri: false,
                subType: [],
                sizeType: [],
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
                transactionType: '',
                transactionFlexiblePercent: 50,
                sendMatchedDeal: [],
                campaignName: "",
                source: "",
                subSource: "",
                projectName: [],
                projectCity: '',
                projectTowers: [],
                specificUnitType: 'single',
                propertyNo: '',
                propertyNoEnd: '',
            });
            setSelectedContact(null);
            setSimilarContacts([]);
            setIsBlocked(false);
            setFieldErrors({});
            formInitializedRef.current = true;
        }
    }, [isOpen, initialData, mode, getLookupValue]);

    const handleInputChange = React.useCallback((field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    }, []);

    const handleProjectCityChange = (city) => {
        setFormData(prev => ({
            ...prev,
            projectCity: city,
            projectName: [],
            projectTowers: []
        }));
    };

    const handleProjectSelectionChange = (projects) => {
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
                // setContactSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [contactSearchQuery]);

    const handleContactSearch = async (query) => {
        // setIsContactSearchLoading(true);
        try {
            await api.get(`contacts?search=${query}`);
        } catch (error) {
            console.error("Error searching contacts:", error);
            // setContactSearchResults([]);
        } finally {
            // setIsContactSearchLoading(false);
        }
    };

    const handleSelectContact = (contact) => {
        setContactSearchQuery('');
        // setContactSearchResults([]);
        setSelectedContact(contact);

        setFormData(prev => ({
            ...prev,
            title: contact?.title ?? prev.title,
            name: contact?.name ?? prev.name,
            surname: contact?.surname ?? prev.surname,
            countryCode: contact?.countryCode ?? prev.countryCode,

            phones:
                contact?.mobile
                    ? [{ number: contact.mobile, type: 'Personal' }]
                    : contact?.phones?.length
                        ? contact.phones
                        : prev.phones,

            emails:
                contact?.email
                    ? [{ address: contact.email, type: 'Personal' }]
                    : contact?.emails?.length
                        ? contact.emails
                        : prev.emails,

            source: contact?.source ?? prev.source,
            team: contact?.team ?? prev.team,
            owner: contact?.owner ?? prev.owner,
            visibleTo: contact?.visibleTo ?? prev.visibleTo,

            contactDetails: contact?._id
        }));
    };

    // Derived Data for Dropdowns
    const availableProjects = formData.projectCity && projectData[formData.projectCity]
        ? projectData[formData.projectCity].map(p => p.name)
        : [];

    const availableTowers = formData.projectName.length > 0 && formData.projectCity
        ? projectData[formData.projectCity]
            ?.filter(p => formData.projectName.includes(p.name))
            .flatMap(p => p.towers || [])
        : [];

    const handleSave = async () => {
        setIsSaving(true);
        let response;

        try {
            // --- FIELD RULES ENGINE VALIDATION (ASYNC) ---
            const validationResult = await validateAsync('lead', formData, { stage: formData.stage || 'New' });

            if (!validationResult.isValid) {
                setFieldErrors(validationResult.errors || {});
                // Scroll to first error field
                const firstErrorField = Object.keys(validationResult.errors)[0];
                if (firstErrorField) {
                    const el = document.getElementById(`field-${firstErrorField}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setIsSaving(false);
                return;
            }
            // Clear errors if validation passed
            setFieldErrors({});

            // Basic sanity check (Hardcoded backup)
            if (!formData.name && !formData.phones?.[0]?.number) {
                toast.error("Name or Phone is required");
                setIsSaving(false);
                return;
            }

            // Validation: Mandatory Assignment Fields
            if (!formData.team) {
                toast.error("Assigned Team is required");
                setIsSaving(false);
                return;
            }
            if (!formData.owner) {
                toast.error("Assigned Owner is required");
                setIsSaving(false);
                return;
            }
            if (!formData.visibleTo) {
                toast.error("Visibility is required");
                setIsSaving(false);
                return;
            }

            let finalContactId = selectedContact?._id || formData.contactDetails || null;

            // If no existing contact selected, create new one first
            if (!finalContactId) {
                // Prepare contact payload
                // Filter out empty phones/emails and trim data
                const contactPayload = {
                    title: getLookupId('Title', formData.title) || "",
                    name: (formData.name || "").trim(),
                    surname: (formData.surname || "").trim(),
                    phones: (formData.phones || []).filter(p => p.number && p.number.trim()),
                    emails: (formData.emails || []).filter(e => e.address && e.address.trim()),
                    source: getLookupId('Source', formData.source) || "",
                    countryCode: getLookupId('CountryCode', formData.countryCode) || "",
                    campaign: getLookupId('Campaign', formData.campaign) || "",
                    subSource: getLookupId('SubSource', formData.subSource) || "",
                    team: formData.team || "",
                    owner: formData.owner || "",
                    visibleTo: formData.visibleTo === "Public" ? "Everyone" : (formData.visibleTo || "Everyone"),
                };

                // Basic validation before sending to API
                if (!contactPayload.name) {
                    toast.error("First Name is required for contact creation.");
                    setIsSaving(false);
                    return;
                }
                if (contactPayload.phones.length === 0) {
                    toast.error("At least one mobile number is required.");
                    setIsSaving(false);
                    return;
                }

                const cleanContactPayload = normalizeRefs(contactPayload);

                // Call Add Contact API
                try {
                    response = await api.post("contacts", cleanContactPayload);
                    if (response.data && response.data.success) {
                        finalContactId = response.data.data._id;
                        window.dispatchEvent(new CustomEvent('contact-updated'));
                    } else {
                        throw new Error(response.data?.message || "Failed to create contact");
                    }
                } catch (contactError) {
                    // Enterprise handling: if contact already exists with this phone number (409 Conflict), link to existing
                    if (contactError.response?.status === 409 && contactError.response?.data?.data?._id) {
                        finalContactId = contactError.response.data.data._id;
                        console.log("[AddLeadModal] Linked to existing contact with matching phone:", finalContactId);
                    } else {
                        console.error("Error creating contact:", contactError);
                        toast.error("Failed to save contact details: " + (contactError.response?.data?.message || contactError.message));
                        setIsSaving(false);
                        return;
                    }
                }
            }

            // Now call onAdd with the lead data including the contactDetails (ID)
            const leadPayload = {
                ...formData,
                contactDetails: finalContactId
            };

            // Ensure lead always has required identity fields for the Lead model
            leadPayload.firstName = formData.name || "";
            leadPayload.lastName = formData.surname || "";
            leadPayload.salutation = formData.title || "Mr.";
            leadPayload.mobile = formData.phones?.[0]?.number || "";
            leadPayload.email = formData.emails?.[0]?.address || "";

            // 🧊 [ENTERPRISE] Specific Unit Mapping
            if (formData.specificUnitType === 'row' && formData.propertyNo && formData.propertyNoEnd) {
                leadPayload.locHNo = `RANGE:${formData.propertyNo}-${formData.propertyNoEnd}`;
            } else if (formData.propertyNo) {
                leadPayload.locHNo = formData.propertyNo;
            }

            // Optimization: If linking to an existing contact, we don't need to save redundant contact details on the lead itself
            if (finalContactId) {
                leadPayload.contactDetails = finalContactId;
            }

            // ─── DISTRIBUTION ENGINE ───
            if (!formData.owner) {
                try {
                    const distributionResult = executeDistribution('leads', {
                        ...formData,
                        id: `temp_${Date.now()}`,
                        budget: formData.budgetMax || formData.budgetMin,
                        location: formData.locArea || formData.searchLocation,
                        propertyType: formData.propertyType[0],
                        leadScore: formData.leadScore || 0
                    }, { users, teams, leads: [], activities: [] });

                    if (distributionResult.success) {
                        leadPayload.owner = distributionResult.assignedTo;
                    }
                } catch (distError) {
                    console.error('Distribution engine error:', distError);
                }
            }

            // Call Add/Update Lead API
            try {
                // Transform names to IDs for Lookup fields
                const transformedData = {
                    ...leadPayload,
                    requirement: getLookupId('Requirement', leadPayload.requirement) || leadPayload.requirement,
                    subRequirement: getLookupId('SubRequirement', leadPayload.subRequirement) || leadPayload.subRequirement,
                    budget: getLookupId('Budget', leadPayload.budget) || leadPayload.budget,
                    source: getLookupId('Source', leadPayload.source) || leadPayload.source,
                    status: getLookupId('Status', leadPayload.status) || leadPayload.status,
                    propertyType: (leadPayload.propertyType || []).map(v => getLookupId('Category', v) || v).filter(Boolean),
                    subType: (leadPayload.subType || []).map(v => getLookupId('SubCategory', v) || v).filter(Boolean),
                    sizeType: (leadPayload.sizeType || []).map(v => getLookupId('PropertyType', v) || v).filter(Boolean),
                    unitType: (leadPayload.unitType || []).map(v => getLookupId('UnitType', v) || v).filter(Boolean),
                    facing: (leadPayload.facing || []).map(v => getLookupId('Facing', v) || v).filter(Boolean),
                    roadWidth: (leadPayload.roadWidth || []).map(v => getLookupId('RoadWidth', v) || v).filter(Boolean),
                    direction: (leadPayload.direction || []).map(v => getLookupId('Direction', v) || v).filter(Boolean),
                    location: getLookupId('Location', leadPayload.location) || leadPayload.location,
                    campaign: getLookupId('Campaign', leadPayload.campaign) || leadPayload.campaign,
                    subSource: getLookupId('SubSource', leadPayload.subSource) || leadPayload.subSource
                };

                const topLevelRefs = [
                    "requirement", "subRequirement", "budget", "source", "status",
                    "campaign", "subSource", "team", "owner", "visibleTo"
                ];

                topLevelRefs.forEach(ref => {
                    if (transformedData[ref] && typeof transformedData[ref] === 'object') {
                        transformedData[ref] = transformedData[ref]._id || transformedData[ref].id;
                    }
                });

                const finalLeadPayload = normalizeRefs(transformedData);
                if (mode === 'edit' && initialData?._id) {
                    response = await updateLeadMutation.mutateAsync({ id: initialData._id, payload: finalLeadPayload, isPartial: false });
                } else {
                    response = await addLeadMutation.mutateAsync(finalLeadPayload);
                }
            } catch (leadError) {
                console.error("Error creating/updating lead:", leadError);
                toast.error("Failed to save lead: " + (leadError.response?.data?.message || leadError.response?.data?.error || leadError.message || "Unknown error"));
                setIsSaving(false);
                return;
            }

            const savedLead = response?.data?.data || response?.data || leadPayload;

            // --- POST-SAVE SIDE EFFECTS (Non-Blocking) ---
            try {
                if (typeof evaluateAndEnroll === 'function') evaluateAndEnroll(savedLead, 'leads');

                if (mode === 'add') {
                    fireEvent('lead_created', savedLead, { entityType: 'leads' });
                } else {
                    const previousEntity = initialData || {};
                    fireEvent('lead_updated', savedLead, {
                        entityType: 'leads',
                        previousEntity
                    });

                    if (savedLead.stage !== previousEntity.stage) {
                        fireEvent('lead_stage_changed', savedLead, {
                            entityType: 'leads',
                            previousValue: previousEntity.stage,
                            currentValue: savedLead.stage,
                            previousEntity,
                            triggeredBy: 'manual_edit'
                        });
                    }
                    if (savedLead.status !== previousEntity.status) {
                        fireEvent('lead_status_changed', savedLead, {
                            entityType: 'leads',
                            previousValue: previousEntity.status,
                            currentValue: savedLead.status,
                            previousEntity
                        });
                    }
                }
            } catch (sideEffectError) {
                console.error("[POST-SAVE ERROR] Side effects failed but lead was saved:", sideEffectError);
            }

            // --- FINAL UI UPDATE ---
            if (typeof onAdd === 'function') onAdd(savedLead);
            window.dispatchEvent(new CustomEvent('lead-updated'));
            window.dispatchEvent(new CustomEvent('contact-updated'));

            // Show auto-assignment toast
            if (response?.data?.assignedAgent?.userId) {
                const agentUser = users?.find(u => u._id === response.data.assignedAgent.userId);
                const agentName = agentUser?.fullName || agentUser?.name || 'an agent';
                toast.success(`Auto-assigned to ${agentName} via ${response.data.assignedAgent.ruleName || 'distribution'}`);
            } else {
                toast.success(mode === 'edit' ? 'Lead updated successfully' : 'Lead added successfully');
            }

            setIsSaving(false);
            if (typeof onClose === 'function') {
                onClose();
            }

        } catch (error) {
            console.error("General error in handleSave:", error);
            const errMsg = error.response?.data?.message || error.response?.data?.error || error.message || "An error occurred while saving. Please try again.";
            toast.error(errMsg);
            setIsSaving(false);
        }
    };


    // Navigation Logic
    const handleNext = () => {
        if (currentTab === 'requirement') setCurrentTab('location');
        else if (currentTab === 'location') setCurrentTab('basic');
        else if (currentTab === 'basic') setCurrentTab('system');
    };

    const handlePrev = () => {
        if (currentTab === 'location') setCurrentTab('requirement');
        else if (currentTab === 'basic') setCurrentTab('location');
        else if (currentTab === 'system') setCurrentTab('basic');
    };

    // Placeholder for Populate
    const handlePopulateForm = (data) => {
        if (!data) return;
        handleSelectContact(data);
        setSimilarContacts([]); // Clear suggestions after selection
        alert(`Linked to existing contact: ${data.name}`);
    };


    // Styles — enterprise theme-aware
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
    };

    const modalStyle = {
        width: '94%', maxWidth: '1150px', height: 'min(90vh, 880px)', minHeight: '520px',
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderRadius: '20px', boxShadow: isDark ? '0 25px 60px -12px rgba(0,0,0,0.7)' : '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        display: 'flex', overflow: 'hidden',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0'
    };

    const leftPaneStyle = {
        flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
        borderRight: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
        minWidth: 0
    };
    const rightPaneStyle = {
        width: '320px',
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
        display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0
    };

    const tabStyle = (active) => ({
        padding: '7px 18px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: active ? 700 : 600,
        cursor: 'pointer', transition: 'all 0.15s ease', border: 'none', outline: 'none',
        backgroundColor: active ? (isDark ? 'rgba(99,102,241,0.15)' : '#fff') : 'transparent',
        color: active ? '#6366f1' : (isDark ? '#94a3b8' : '#64748b'),
        boxShadow: active ? (isDark ? 'inset 0 0 0 1px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
        display: 'flex', alignItems: 'center', gap: '8px'
    });

    const buttonStyle = {
        cancel: { padding: '9px 20px', borderRadius: '10px', border: '1.5px solid #fecaca', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', transition: 'all 0.15s' },
        secondary: { padding: '9px 20px', borderRadius: '10px', border: isDark ? '1.5px solid rgba(255,255,255,0.15)' : '1.5px solid #e2e8f0', background: 'transparent', color: isDark ? '#94a3b8' : '#475569', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', transition: 'all 0.15s' },
        primary: { padding: '9px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', color: '#fff', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)', transition: 'all 0.15s' },
        success: { padding: '9px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#fff', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)', transition: 'all 0.15s' }
    };

    // Duplication Check Effect
    useEffect(() => {
        const searchDuplicates = async () => {
            if (!formData.name && formData.phones[0].number === '' && formData.emails[0].address === '') {
                setSimilarContacts([]);
                return;
            }

            try {
                if (!formData.name && !formData.phones[0].number && !formData.emails[0].address) {
                    setSimilarContacts([]);
                    return;
                }

                const response = await api.post('duplication-rules/check', {
                    entityType: 'Lead',
                    data: {
                        ...formData,
                        firstName: formData.name,
                        mobile: formData.phones[0]?.number || '',
                        email: formData.emails[0]?.address || ''
                    }
                });

                if (response.data && response.data.success) {
                    setSimilarContacts(response.data.data);
                    setIsBlocked(response.data.blockAction === true);
                }
            } catch (error) {
                console.error("Error searching duplicates:", error);
            }
        };

        const timer = setTimeout(() => {
            searchDuplicates();
        }, 500);

        return () => clearTimeout(timer);
    }, [formData, formData.name, formData.phones, formData.emails]);

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
    }, [currentTab, locationTab, setFormData]);

    if (!isOpen) return null;

    return (
        <div style={overlayStyle}>
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                .alm-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important; }
            `}</style>
            <div style={modalStyle}>
                {/* Left Pane - Form Content */}
                <div style={leftPaneStyle}>
                    {/* Enterprise Header */}
                    <div style={{
                        padding: '16px 24px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: isDark
                            ? 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, transparent 100%)'
                            : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                        flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                                width: '42px', height: '42px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)', color: '#fff',
                                flexShrink: 0
                            }}>
                                <i className="fas fa-user-plus" style={{ fontSize: '17px' }}></i>
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                        {mode === 'edit' ? 'Update Requirement' : (contactData ? `Add Lead for ${contactData.fullName || contactData.name || contactData.mobile || 'Contact'}` : 'Add New Lead')}
                                    </h3>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                        background: mode === 'edit' ? '#fef3c7' : '#e0e7ff',
                                        color: mode === 'edit' ? '#92400e' : '#3730a3',
                                        border: mode === 'edit' ? '1px solid #fde68a' : '1px solid #c7d2fe'
                                    }}>
                                        {mode === 'edit' ? 'EDIT MODE' : 'NEW RECORD'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '0.72rem', color: isDark ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                                    <i className="far fa-clock" style={{ color: '#818cf8', fontSize: '11px' }}></i>
                                    <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                    <span style={{ opacity: 0.4 }}>•</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 12px', borderRadius: '8px',
                                background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                color: isDark ? '#94a3b8' : '#475569'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={showOnlyRequired}
                                    onChange={(e) => {
                                        setShowOnlyRequired(e.target.checked);
                                        if (e.target.checked) {
                                            setCurrentTab(entityType === 'lead' ? 'requirement' : 'basic');
                                        }
                                    }}
                                    style={{ accentColor: '#6366f1' }}
                                />
                                Show Required Only
                            </label>

                            {onClose && (
                                <button
                                    onClick={onClose}
                                    style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                                        background: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                                        color: isDark ? '#64748b' : '#64748b', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '15px', transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    {!showOnlyRequired && (
                        <div style={{ padding: '12px 24px 0 24px', background: isDark ? 'transparent' : '#fff', flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: '6px', padding: '4px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', borderRadius: '9999px', width: 'fit-content' }}>
                                {entityType === 'lead' && (
                                    <button onClick={() => setCurrentTab('requirement')} style={tabStyle(currentTab === 'requirement')}>
                                        <i className="fas fa-clipboard-list"></i> Requirement
                                    </button>
                                )}
                                {entityType === 'lead' && (
                                    <button onClick={() => setCurrentTab('location')} style={tabStyle(currentTab === 'location')}>
                                        <i className="fas fa-map-marker-alt"></i> Location
                                    </button>
                                )}
                                <button onClick={() => setCurrentTab('basic')} style={tabStyle(currentTab === 'basic')}>
                                    {entityType === 'lead' ? (
                                        <><i className="fas fa-address-book"></i> Contact Details</>
                                    ) : (
                                        <><i className="fas fa-info-circle"></i> Basic Details</>
                                    )}
                                </button>
                                {entityType === 'lead' && (
                                    <button onClick={() => setCurrentTab('system')} style={tabStyle(currentTab === 'system')}>
                                        <i className="fas fa-cog"></i> System
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, padding: '20px 28px 40px 28px', overflowY: 'auto', background: isDark ? '#0d1117' : '#f8fafc', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

                        {showOnlyRequired && entityType === 'lead' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Requirement Type */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px',
                                    padding: '18px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', flexShrink: 0 }}>
                                            <i className="fas fa-clipboard-list" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Requirement Type</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(99,102,241,0.15)' : '#e0e7ff', color: '#6366f1' }}>INTENT</span>
                                    </div>
                                    <AnimatedSegmentControl
                                        options={['Buy', 'Rent', 'Lease']}
                                        value={formData.requirement}
                                        onChange={(val) => handleInputChange('requirement', val)}
                                    />
                                </div>

                                {/* Property Category */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px',
                                    padding: '18px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(2,132,199,0.25)' : 'rgba(2,132,199,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
                                            <i className="fas fa-layer-group" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Property Category</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(2,132,199,0.15)' : '#e0f2fe', color: '#0284c7' }}>ASSET CLASS</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px' }}>
                                        {[
                                            { label: 'Residential', icon: 'fa-home' },
                                            { label: 'Commercial', icon: 'fa-building' },
                                            { label: 'Industrial', icon: 'fa-industry' },
                                            { label: 'Agricultural', icon: 'fa-seedling' },
                                            { label: 'Institutional', icon: 'fa-university' }
                                        ].map(cat => {
                                            const isSelected = formData.propertyType.includes(cat.label);
                                            return (
                                                <button
                                                    key={cat.label}
                                                    type="button"
                                                    onClick={() => {
                                                        const newCats = isSelected
                                                            ? formData.propertyType.filter(c => c !== cat.label)
                                                            : [...formData.propertyType, cat.label];
                                                        handleInputChange('propertyType', newCats);
                                                    }}
                                                    style={{
                                                        padding: '10px 8px',
                                                        borderRadius: '10px',
                                                        border: isSelected ? '1.5px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                                        background: isSelected ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#eef2ff') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                                                        color: isSelected ? '#6366f1' : (isDark ? '#94a3b8' : '#64748b'),
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: isSelected ? '0 2px 8px rgba(99,102,241,0.15)' : 'none'
                                                    }}
                                                >
                                                    <i className={`fas ${cat.icon}`} style={{ fontSize: '1.05rem', color: isSelected ? '#6366f1' : (isDark ? '#64748b' : '#94a3b8') }}></i>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: isSelected ? 800 : 600, textAlign: 'center' }}>{cat.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Property Sub-Category */}
                                {formData.propertyType.length > 0 && (
                                    <div style={{
                                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                        borderRadius: '14px',
                                        padding: '18px',
                                        boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6', flexShrink: 0 }}>
                                                <i className="fas fa-tags" style={{ fontSize: '12px' }}></i>
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Property Sub-Category</h4>
                                            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(139,92,246,0.15)' : '#f3e8ff', color: '#8b5cf6' }}>SUB-TYPES</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {Array.from(new Set(formData.propertyType.flatMap(cat => (propertyConfig[cat]?.subCategories || [])))).map(sub => {
                                                const subName = typeof sub === 'string' ? sub : sub.name;
                                                const isActive = formData.subType.includes(subName);
                                                return (
                                                    <button
                                                        key={subName}
                                                        type="button"
                                                        onClick={() => {
                                                            const newSubs = isActive
                                                                ? formData.subType.filter(s => s !== subName)
                                                                : [...formData.subType, subName];
                                                            handleInputChange('subType', newSubs);
                                                        }}
                                                        style={{
                                                            padding: '6px 14px',
                                                            borderRadius: '20px',
                                                            border: isActive ? '1.5px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                                            background: isActive ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#eef2ff') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                                                            color: isActive ? '#6366f1' : (isDark ? '#94a3b8' : '#64748b'),
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            fontWeight: isActive ? 700 : 500,
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {isActive && <i className="fas fa-check" style={{ fontSize: '10px', marginRight: '5px' }}></i>}
                                                        {subName}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Identity & Contact Consolidation */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px',
                                    padding: '18px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', flexShrink: 0 }}>
                                            <i className="fas fa-user-circle" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Identity & Contact Details</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe', color: '#2563eb' }}>REQUIRED</span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
                                            <select
                                                value={formData.title}
                                                onChange={(e) => handleInputChange('title', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select</option>
                                                {titleOptions.map(opt => (
                                                    <option key={typeof opt === 'object' ? (opt._id || opt.id) : opt} value={typeof opt === 'object' ? (opt._id || opt.id) : opt}>
                                                        {renderValue(opt)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => handleInputChange('name', e.target.value)}
                                                placeholder="Enter first name"
                                                autoComplete="off"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Name</label>
                                            <input
                                                type="text"
                                                value={formData.surname}
                                                onChange={(e) => handleInputChange('surname', e.target.value)}
                                                placeholder="Enter last name"
                                                autoComplete="off"
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>

                                    {/* Phones */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mobile Numbers <span style={{ color: '#ef4444' }}>*</span></label>
                                        {formData.phones.map((phone, index) => (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 38px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={formData.countryCode}
                                                    onChange={(e) => handleInputChange('countryCode', e.target.value)}
                                                    style={customSelectStyle}
                                                >
                                                    {countryCodeOptions?.length > 0
                                                        ? countryCodeOptions.map(c => <option key={c._id} value={renderValue(c)}>{renderValue(c)}</option>)
                                                        : COUNTRY_CODES.map(c => <option key={c.code} value={c.dial_code}>{c.dial_code} ({c.code})</option>)
                                                    }
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
                                                    autoComplete="off"
                                                    style={inputStyle}
                                                />
                                                <select
                                                    value={phone.type}
                                                    onChange={(e) => {
                                                        const newPhones = [...formData.phones];
                                                        newPhones[index].type = e.target.value;
                                                        handleInputChange('phones', newPhones);
                                                    }}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                    <option value="Home">Home</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (index === 0) handleInputChange('phones', [...formData.phones, { number: '', type: 'Personal' }]);
                                                        else {
                                                            const newPhones = formData.phones.filter((_, i) => i !== index);
                                                            handleInputChange('phones', newPhones);
                                                        }
                                                    }}
                                                    style={{
                                                        height: '40px',
                                                        borderRadius: '10px',
                                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                                        background: index === 0 ? (isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff') : (isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2'),
                                                        color: index === 0 ? '#6366f1' : '#ef4444',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Emails */}
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Addresses</label>
                                        {formData.emails.map((email, index) => (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(100px, 120px) 38px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="email"
                                                    value={email.address}
                                                    onChange={(e) => {
                                                        const newEmails = [...formData.emails];
                                                        newEmails[index].address = e.target.value;
                                                        handleInputChange('emails', newEmails);
                                                    }}
                                                    placeholder="Enter email address"
                                                    autoComplete="off"
                                                    style={inputStyle}
                                                />
                                                <select
                                                    value={email.type}
                                                    onChange={(e) => {
                                                        const newEmails = [...formData.emails];
                                                        newEmails[index].type = e.target.value;
                                                        handleInputChange('emails', newEmails);
                                                    }}
                                                    style={customSelectStyle}
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (index === 0) handleInputChange('emails', [...formData.emails, { address: '', type: 'Personal' }]);
                                                        else {
                                                            const newEmails = formData.emails.filter((_, i) => i !== index);
                                                            handleInputChange('emails', newEmails);
                                                        }
                                                    }}
                                                    style={{
                                                        height: '40px',
                                                        borderRadius: '10px',
                                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                                        background: index === 0 ? (isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff') : (isDark ? 'rgba(239,68,68,0.2)' : '#fee2e2'),
                                                        color: index === 0 ? '#6366f1' : '#ef4444',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Campaign Details (Dynamic Hierarchy) */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px',
                                    padding: '18px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                                            <i className="fas fa-bullhorn" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Campaign & Attribution</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7', color: '#d97706' }}>SOURCE</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                        {/* Campaign - Level 1 */}
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Campaign Name</label>
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
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</label>
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
                                    </div>
                                </div>

                                {/* System Assignment */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px',
                                    padding: '18px',
                                    boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                                            <i className="fas fa-sliders-h" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>System Assignment</h4>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5', color: '#059669' }}>ROUTING</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Team</label>
                                            <select
                                                value={formData.team}
                                                onChange={(e) => {
                                                    const newTeam = e.target.value;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        team: newTeam,
                                                        owner: '' // Reset owner when team changes
                                                    }));
                                                }}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Team</option>
                                                {teams?.map(team => (
                                                    <option key={team._id} value={team._id}>{team.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assign Owner</label>
                                            <select
                                                value={formData.owner}
                                                onChange={(e) => handleInputChange('owner', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Owner</option>
                                                {users
                                                    .filter(user => !formData.team || (user.team && user.team === formData.team) || (user.team?._id === formData.team))
                                                    .map(user => (
                                                        <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visibility</label>
                                            <select
                                                value={formData.visibleTo}
                                                onChange={(e) => handleInputChange('visibleTo', e.target.value)}
                                                style={customSelectStyle}
                                            >
                                                <option value="">Select Visibility</option>
                                                <option value="Private">Private</option>
                                                <option value="Team">Team</option>
                                                <option value="Everyone">Everyone</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : currentTab === 'basic' ? (
                            <BasicDetailsSection
                                formData={formData}
                                handleInputChange={handleInputChange}
                                titleOptions={titleOptions}
                                countryCodeOptions={countryCodeOptions}
                                COUNTRY_CODES={COUNTRY_CODES}
                                leadMasterFields={leadMasterFields}
                                entityType={entityType}
                                showOnlyRequired={showOnlyRequired}
                                customSelectStyle={customSelectStyle}
                                customSelectStyleDisabled={customSelectStyleDisabled}
                                renderValue={renderValue}
                            />
                        ) : currentTab === 'system' ? (
                            <SystemSection
                                formData={formData}
                                handleInputChange={handleInputChange}
                                users={users}
                                teams={teams}
                                customSelectStyle={customSelectStyle}
                                blastChannels={blastChannels}
                                setBlastChannels={setBlastChannels}
                                channelAvailability={channelAvailability}
                                hidePrice={hidePrice}
                                setHidePrice={setHidePrice}
                                hideUnit={hideUnit}
                                setHideUnit={setHideUnit}
                                hideLocation={hideLocation}
                                setHideLocation={setHideLocation}
                                marketingTemplates={marketingTemplates}
                                selectedTemplateId={selectedTemplateId}
                                setSelectedTemplateId={setSelectedTemplateId}
                                channelSchedules={channelSchedules}
                                setChannelSchedules={setChannelSchedules}
                            />
                        ) : currentTab === 'requirement' ? (
                            <RequirementSection
                                formData={formData}
                                handleInputChange={handleInputChange}
                                sectionCardStyle={sectionCardStyle}
                                labelStyle={labelStyle}
                                propertyConfig={propertyConfig}
                                lookups={lookups}
                                inputStyle={inputStyle}
                                BUDGET_VALUES={BUDGET_VALUES}
                                leadMasterFields={leadMasterFields}
                                customSelectStyle={customSelectStyle}
                                CustomMultiSelect={CustomMultiSelect}
                                AnimatedSegmentControl={AnimatedSegmentControl}
                                blastChannels={blastChannels}
                                setBlastChannels={setBlastChannels}
                                channelAvailability={channelAvailability}
                                hidePrice={hidePrice}
                                setHidePrice={setHidePrice}
                                hideUnit={hideUnit}
                                setHideUnit={setHideUnit}
                                hideLocation={hideLocation}
                                setHideLocation={setHideLocation}
                                marketingTemplates={marketingTemplates}
                                selectedTemplateId={selectedTemplateId}
                                setSelectedTemplateId={setSelectedTemplateId}
                                channelSchedules={channelSchedules}
                                setChannelSchedules={setChannelSchedules}
                            />
                        ) : currentTab === 'location' ? (
                            <LocationSection
                                formData={formData}
                                handleInputChange={handleInputChange}
                                sectionCardStyle={sectionCardStyle}
                                labelStyle={labelStyle}
                                inputStyle={inputStyle}
                                customSelectStyle={customSelectStyle}
                                customSelectStyleDisabled={customSelectStyleDisabled}
                                locationTab={locationTab}
                                setLocationTab={setLocationTab}
                                searchInputRef={searchInputRef}
                                areaInputRef={areaInputRef}
                                handleProjectCityChange={handleProjectCityChange}
                                cities={cities}
                                masterFields={masterFields}
                                leadMasterFields={leadMasterFields}
                                CustomMultiSelect={CustomMultiSelect}
                                availableProjects={availableProjects}
                                handleProjectSelectionChange={handleProjectSelectionChange}
                                availableTowers={availableTowers}
                                showSpecificUnit={showSpecificUnit}
                                setShowSpecificUnit={setShowSpecificUnit}
                                hiddenFields={hiddenFields}
                            />
                        ) : null}

                    </div >

                    {/* Footer */}
                    <div style={{ padding: '14px 24px', borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9', background: isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>

                        {/* Stage Engine – Read-Only Badge (edit mode only) */}
                        {mode === 'edit' && initialData?.stage && (() => {
                            let stageNameStr = 'New';
                            if (typeof initialData.stage === 'string') {
                                stageNameStr = initialData.stage;
                            } else if (initialData.stage && typeof initialData.stage === 'object') {
                                stageNameStr = initialData.stage.lookup_value || initialData.stage.label || initialData.stage.name || String(initialData.stage);
                            }

                            const stageInfo = STAGE_PIPELINE.find(s => s.label?.toLowerCase() === stageNameStr?.toLowerCase()) || { color: '#94a3b8', icon: 'fa-circle', label: stageNameStr };

                            // fallback formatting if it still isn't a string to drop errors
                            const displayLabel = typeof stageInfo.label === 'string' ? stageInfo.label : 'New';

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '6px 14px' }}>
                                    <i className="fas fa-lock" style={{ fontSize: '0.7rem', color: '#64748b' }}></i>
                                    <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>Stage:</span>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        background: stageInfo.color + '20', color: stageInfo.color,
                                        border: `1px solid ${stageInfo.color}50`, borderRadius: '5px',
                                        padding: '2px 10px', fontSize: '0.7rem', fontWeight: 800
                                    }}>
                                        <i className={`fas ${stageInfo.icon}`} style={{ fontSize: '0.6rem' }}></i>
                                        {displayLabel}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>Auto-computed</span>
                                </div>
                            );
                        })()}

                        {/* Fix #5 — FieldRule Inline Validation Errors Banner */}
                        {Object.keys(fieldErrors).length > 0 && (
                            <div style={{
                                background: '#fef2f2',
                                border: '1px solid #fca5a5',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <i className="fas fa-exclamation-triangle" style={{ color: '#dc2626', fontSize: '0.85rem' }}></i>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#991b1b' }}>
                                        Please fix these errors before saving:
                                    </span>
                                </div>
                                {Object.entries(fieldErrors).map(([field, msg]) => (
                                    <div key={field} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem', color: '#7f1d1d' }}>
                                        <span style={{ color: '#dc2626', fontWeight: 700, minWidth: '12px' }}>•</span>
                                        <span>
                                            <strong style={{ textTransform: 'capitalize' }}>{field.replace(/([A-Z])/g, ' $1').trim()}</strong>: {msg}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            {/* Previous Button - Hide on first tab */}
                            {((entityType === 'lead' && currentTab !== 'requirement') || (entityType !== 'lead' && currentTab !== 'basic')) && (
                                <button onClick={handlePrev} style={buttonStyle.secondary}>Previous</button>
                            )}

                            {/* Next/Save Button */}
                            {((entityType === 'lead' && currentTab !== 'system') || (entityType !== 'lead' && currentTab !== 'basic')) && !showOnlyRequired ? (
                                <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                            ) : (
                                <button
                                    onClick={handleSave}
                                    style={(isBlocked && entityType !== 'lead') ? { ...buttonStyle.success, opacity: 0.5, cursor: 'not-allowed', background: '#94a3b8' } : buttonStyle.success}
                                    disabled={(isBlocked && entityType !== 'lead') || isSaving}
                                >
                                    {saveLabel}
                                </button>
                            )}
                        </div>
                    </div >
                </div >

                {/* Right Pane */}
                {
                    (formData.name || formData.phones[0].number || formData.emails[0].address) && (
                        <div style={rightPaneStyle}>
                            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
                                <h3>Suggestions</h3>
                            </div>
                            <div style={{ flex: 1, padding: '20px' }}>
                                <DuplicateResults contacts={similarContacts} onUpdate={handlePopulateForm} isBlocked={isBlocked} />
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    );
};

export default AddLeadModal;

// --- Sub Components for Performance ---

const BasicDetailsSection = React.memo(function BasicDetailsSection({
    formData,
    handleInputChange,
    titleOptions,
    countryCodeOptions,
    COUNTRY_CODES,
    leadMasterFields,
    entityType,
    showOnlyRequired,
    customSelectStyle,
    customSelectStyleDisabled,
    renderValue
}) {
    const { isDark } = useTheme();

    const ent = {
        card: {
            background: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
            padding: '18px',
            borderRadius: '14px',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
            boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
            marginBottom: '0'
        },
        sectionHeader: (color) => ({
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: '16px', paddingBottom: '12px',
            borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
        }),
        iconBadge: (color) => ({
            width: '28px', height: '28px', borderRadius: '8px',
            background: color + (isDark ? '25' : '18'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: color, flexShrink: 0
        }),
        sectionTitle: {
            margin: 0, fontSize: '0.82rem', fontWeight: 700,
            color: isDark ? '#e2e8f0' : '#0f172a'
        },
        label: {
            fontSize: '0.7rem', fontWeight: 900,
            color: isDark ? '#64748b' : '#64748b',
            marginBottom: '6px', display: 'block',
            textTransform: 'uppercase', letterSpacing: '0.5px'
        },
        input: {
            width: '100%', padding: '9px 12px', borderRadius: '10px',
            border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
            fontSize: '0.82rem', fontWeight: 500, outline: 'none',
            color: isDark ? '#e2e8f0' : '#1e293b',
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
            height: '40px', boxSizing: 'border-box', transition: 'all 0.15s'
        },
        select: {
            ...customSelectStyle,
            background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
            color: isDark ? '#e2e8f0' : '#1e293b',
            border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
        },
        addBtn: (type) => ({
            borderRadius: '8px', border: 'none',
            background: type === 'add' ? (isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff') : (isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2'),
            color: type === 'add' ? '#3b82f6' : '#ef4444',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '40px', height: '40px', flexShrink: 0
        })
    };

    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Identity Card */}
        <div style={ent.card}>
            <div style={ent.sectionHeader('#3b82f6')}>
                <div style={ent.iconBadge('#3b82f6')}>
                    <i className="fas fa-user" style={{ fontSize: '12px' }}></i>
                </div>
                <h3 style={ent.sectionTitle}>Identity Details</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                    <label style={ent.label}>Title</label>
                    <select
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        style={ent.select}
                    >
                        <option value="">Select</option>
                        {titleOptions.map(opt => (
                            <option key={typeof opt === 'object' ? (opt._id || opt.id) : opt} value={typeof opt === 'object' ? (opt._id || opt.id) : opt}>
                                {renderValue(opt)}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{ position: 'relative' }}>
                    <label style={ent.label}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter first name"
                        autoComplete="off"
                        style={ent.input}
                    />
                </div>
                <div>
                    <label style={ent.label}>Last Name</label>
                    <input
                        type="text"
                        value={formData.surname}
                        onChange={(e) => handleInputChange('surname', e.target.value)}
                        placeholder="Enter last name"
                        autoComplete="off"
                        style={ent.input}
                    />
                </div>
                {(!showOnlyRequired && entityType !== 'lead') && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={ent.label}>Father/Husband Name</label>
                        <input
                            type="text"
                            value={formData.fatherName}
                            onChange={(e) => handleInputChange('fatherName', e.target.value)}
                            placeholder="Enter father or husband's name"
                            style={ent.input}
                        />
                    </div>
                )}
            </div>

            {/* Phones */}
            <div style={{ marginBottom: '16px' }}>
                <label style={ent.label}>Mobile Numbers <span style={{ color: '#ef4444' }}>*</span></label>
                {formData.phones.map((phone, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 40px', gap: '8px', marginBottom: '8px' }}>
                        <select
                            value={formData.countryCode}
                            onChange={(e) => handleInputChange('countryCode', e.target.value)}
                            style={{ ...ent.select, paddingRight: '8px' }}
                        >
                            {countryCodeOptions?.length > 0
                                ? countryCodeOptions.map(c => <option key={c._id} value={renderValue(c)}>{renderValue(c)}</option>)
                                : COUNTRY_CODES.map(c => <option key={c.code} value={c.dial_code}>{c.dial_code} ({c.code})</option>)
                            }
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
                            autoComplete="off"
                            style={ent.input}
                        />
                        <select
                            value={phone.type}
                            onChange={(e) => {
                                const newPhones = [...formData.phones];
                                newPhones[index].type = e.target.value;
                                handleInputChange('phones', newPhones);
                            }}
                            style={{ ...ent.select, paddingRight: '8px' }}
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
                        }} style={ent.addBtn(index === 0 ? 'add' : 'remove')}>
                            <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`} style={{ fontSize: '12px' }}></i>
                        </button>
                    </div>
                ))}
            </div>

            {/* Emails */}
            <div>
                <label style={ent.label}>Email Addresses</label>
                {formData.emails.map((email, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(100px, 110px) 40px', gap: '8px', marginBottom: '8px' }}>
                        <input
                            type="email"
                            value={email.address}
                            onChange={(e) => {
                                const newEmails = [...formData.emails];
                                newEmails[index].address = e.target.value;
                                handleInputChange('emails', newEmails);
                            }}
                            placeholder="Enter email address"
                            autoComplete="off"
                            style={ent.input}
                        />
                        <select
                            value={email.type}
                            onChange={(e) => {
                                const newEmails = [...formData.emails];
                                newEmails[index].type = e.target.value;
                                handleInputChange('emails', newEmails);
                            }}
                            style={{ ...ent.select, paddingRight: '8px' }}
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
                        }} style={ent.addBtn(index === 0 ? 'add' : 'remove')}>
                            <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`} style={{ fontSize: '12px' }}></i>
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {!showOnlyRequired && (
            <>
                {/* Campaign & Source Card */}
                <div style={ent.card}>
                    <div style={ent.sectionHeader('#f59e0b')}>
                        <div style={ent.iconBadge('#f59e0b')}>
                            <i className="fas fa-bullhorn" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h3 style={ent.sectionTitle}>Campaign & Source</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                        {/* Campaign */}
                        <div>
                            <label style={ent.label}>Campaign Name</label>
                            <select
                                value={formData.campaign}
                                onChange={(e) => {
                                    handleInputChange('campaign', e.target.value);
                                    handleInputChange('source', '');
                                    handleInputChange('subSource', '');
                                }}
                                style={ent.select}
                            >
                                <option value="">Select Campaign</option>
                                {(leadMasterFields?.campaigns || []).map((c, idx) => {
                                    const cName = renderValue(c?.name ?? c);
                                    return <option key={cName || idx} value={cName}>{cName}</option>;
                                })}
                            </select>
                        </div>

                        {/* Source */}
                        <div>
                            <label style={ent.label}>Source</label>
                            <select
                                value={formData.source}
                                onChange={(e) => {
                                    handleInputChange('source', e.target.value);
                                    handleInputChange('subSource', '');
                                }}
                                disabled={!formData.campaign}
                                style={!formData.campaign ? customSelectStyleDisabled : ent.select}
                            >
                                <option value="">Select Source</option>
                                {(() => {
                                    const selectedCamp = (leadMasterFields?.campaigns || []).find(c => renderValue(c?.name ?? c) === formData.campaign);
                                    return (selectedCamp?.sources || []).map((s, idx) => {
                                        const sName = renderValue(s?.name ?? s);
                                        return <option key={sName || idx} value={sName}>{sName}</option>;
                                    });
                                })()}
                            </select>
                        </div>

                        {/* Medium */}
                        <div>
                            <label style={ent.label}>Medium</label>
                            <select
                                value={formData.subSource}
                                onChange={(e) => handleInputChange('subSource', e.target.value)}
                                disabled={!formData.source}
                                style={!formData.source ? customSelectStyleDisabled : ent.select}
                            >
                                <option value="">Select Medium</option>
                                {(() => {
                                    const selectedCamp = (leadMasterFields?.campaigns || []).find(c => renderValue(c?.name ?? c) === formData.campaign);
                                    const selectedSrc = (selectedCamp?.sources || []).find(s => renderValue(s?.name ?? s) === formData.source);
                                    return (selectedSrc?.mediums || []).map((m, idx) => {
                                        const mName = renderValue(m);
                                        return <option key={mName || idx} value={mName}>{mName}</option>;
                                    });
                                })()}
                            </select>
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label style={ent.label}>Tags</label>
                        <div style={{
                            width: '100%', padding: '6px 10px', borderRadius: '10px',
                            border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
                            background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                            display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minHeight: '42px'
                        }}>
                            {formData.tags.map((tag, index) => (
                                <div key={index} style={{
                                    background: isDark ? 'rgba(99,102,241,0.2)' : '#eef2ff',
                                    color: '#6366f1', padding: '3px 10px', borderRadius: '16px',
                                    fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px',
                                    border: isDark ? '1px solid rgba(99,102,241,0.3)' : '1px solid #c7d2fe'
                                }}>
                                    {renderValue(tag)}
                                    <span onClick={() => handleInputChange('tags', formData.tags.filter((_, i) => i !== index))}
                                        style={{ cursor: 'pointer', fontSize: '1rem', lineHeight: '0.8', opacity: 0.7 }}>&times;</span>
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
                                    border: 'none', outline: 'none', fontSize: '0.82rem',
                                    color: isDark ? '#e2e8f0' : '#1e293b',
                                    background: 'transparent', flex: 1, minWidth: '120px'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </>
        )}
    </div>
    );
});

const SystemSection = React.memo(function SystemSection({
    formData,
    handleInputChange,
    users,
    teams,
    customSelectStyle,
    blastChannels,
    setBlastChannels,
    channelAvailability,
    hidePrice,
    setHidePrice,
    hideUnit,
    setHideUnit,
    hideLocation,
    setHideLocation,
    marketingTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    channelSchedules,
    setChannelSchedules
}) {
    const { isDark } = useTheme();

    const card = {
        background: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
        padding: '18px',
        borderRadius: '14px',
        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
        boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.05)'
    };
    const sectionHdr = {
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '16px', paddingBottom: '12px',
        borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
    };
    const iconBadge = (color) => ({
        width: '28px', height: '28px', borderRadius: '8px',
        background: color + (isDark ? '25' : '18'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0
    });
    const sectionTitle = { margin: 0, fontSize: '0.82rem', fontWeight: 700, color: isDark ? '#e2e8f0' : '#0f172a' };
    const lbl = {
        fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#64748b' : '#64748b',
        marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px'
    };
    const sel = {
        ...customSelectStyle,
        background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
        color: isDark ? '#e2e8f0' : '#1e293b',
        border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
    };

    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Assignment & Visibility Card */}
        <div style={card}>
            <div style={sectionHdr}>
                <div style={iconBadge('#6366f1')}>
                    <i className="fas fa-users-cog" style={{ fontSize: '11px' }}></i>
                </div>
                <h3 style={sectionTitle}>Assignment & Visibility</h3>
                <span style={{
                    marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    borderRadius: '10px', background: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
                    color: '#ef4444', border: isDark ? '1px solid rgba(239,68,68,0.25)' : '1px solid #fca5a5'
                }}>REQUIRED</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <div>
                    <label style={lbl}>Assigned Team</label>
                    <select
                        value={formData.team}
                        onChange={(e) => {
                            handleInputChange('team', e.target.value);
                            handleInputChange('owner', '');
                        }}
                        style={sel}
                    >
                        <option value="">Select Team</option>
                        {teams.map(team => (
                            <option key={team._id || team.id} value={team._id || team.id}>{team.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={lbl}>Assigned Owner <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                        value={formData.owner}
                        onChange={(e) => handleInputChange('owner', e.target.value)}
                        style={sel}
                    >
                        <option value="">Select Owner</option>
                        {users
                            .filter(user => !formData.team || (user.team && user.team === formData.team) || (user.team?._id === formData.team))
                            .map(user => (
                                <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
                            ))
                        }
                    </select>
                </div>
                <div>
                    <label style={lbl}>Visibility <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                        value={formData.visibleTo}
                        onChange={(e) => handleInputChange('visibleTo', e.target.value)}
                        style={sel}
                    >
                        <option value="">Select Visibility</option>
                        <option value="Private">🔒 Private</option>
                        <option value="Team">👥 Team</option>
                        <option value="Everyone">🌐 Everyone</option>
                    </select>
                </div>
            </div>
        </div>

        {/* Notes & Description Card */}
        <div style={card}>
            <div style={sectionHdr}>
                <div style={iconBadge('#8b5cf6')}>
                    <i className="fas fa-sticky-note" style={{ fontSize: '11px' }}></i>
                </div>
                <h3 style={sectionTitle}>Notes & Description</h3>
            </div>
            <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter any additional notes or comments..."
                style={{
                    width: '100%', minHeight: '110px', padding: '10px 12px',
                    borderRadius: '10px',
                    border: isDark ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid #e2e8f0',
                    fontSize: '0.82rem', outline: 'none',
                    color: isDark ? '#e2e8f0' : '#1e293b',
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box'
                }}
            />
        </div>
        
    </div>
    );
});

const RequirementSection = React.memo(function RequirementSection({
    formData,
    handleInputChange,
    sectionCardStyle,
    labelStyle,
    propertyConfig,
    lookups,
    inputStyle,
    BUDGET_VALUES,
    leadMasterFields,
    customSelectStyle,
    CustomMultiSelect,
    AnimatedSegmentControl,
    blastChannels,
    setBlastChannels,
    channelAvailability,
    hidePrice,
    setHidePrice,
    hideUnit,
    setHideUnit,
    hideLocation,
    setHideLocation,
    marketingTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    channelSchedules,
    setChannelSchedules
}) {
    const { isDark } = useTheme();
    const entCard = {
        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '18px',
        boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
    };

    const entHdr = {
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '14px', paddingBottom: '10px',
        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9'
    };

    const entIcon = (color) => ({
        width: '28px', height: '28px', borderRadius: '8px',
        background: color + (isDark ? '25' : '15'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0
    });

    const entTitle = {
        margin: 0, fontSize: '0.82rem', fontWeight: 800,
        color: isDark ? '#f8fafc' : '#0f172a'
    };

    const entLabel = {
        fontSize: '0.7rem', fontWeight: 900,
        color: isDark ? '#64748b' : '#64748b',
        marginBottom: '6px', display: 'block',
        textTransform: 'uppercase', letterSpacing: '0.5px'
    };

    return (
        <div className="no-scrollbar" style={{ padding: '2px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* 1. Requirement Type */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#6366f1')}>
                            <i className="fas fa-clipboard-list" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Requirement Type</h4>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                            borderRadius: '10px', background: isDark ? 'rgba(99,102,241,0.15)' : '#e0e7ff',
                            color: '#6366f1'
                        }}>Intent</span>
                    </div>
                    <AnimatedSegmentControl
                        options={['Buy', 'Rent', 'Lease']}
                        value={formData.requirement}
                        onChange={(val) => handleInputChange('requirement', val)}
                    />
                </div>

                {/* 2. Property Category & Sub-Category */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#3b82f6')}>
                            <i className="fas fa-layer-group" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Property Category & Hierarchy</h4>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                            borderRadius: '10px', background: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe',
                            color: '#3b82f6'
                        }}>
                            {formData.propertyType.length} Selected
                        </span>
                    </div>

                    <label style={entLabel}>Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: '8px', marginBottom: formData.propertyType.length > 0 ? '16px' : '0' }}>
                        {(propertyConfig && Object.keys(propertyConfig).length > 0 ? Object.keys(propertyConfig) : ['Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional']).map(catLabel => {
                            const iconMap = {
                                'Residential': 'fa-home',
                                'Commercial': 'fa-building',
                                'Industrial': 'fa-industry',
                                'Agricultural': 'fa-seedling',
                                'Institutional': 'fa-university'
                            };
                            const isSelected = formData.propertyType.includes(catLabel);
                            return (
                                <button
                                    key={catLabel}
                                    type="button"
                                    onClick={() => {
                                        const newCats = isSelected
                                            ? formData.propertyType.filter(c => c !== catLabel)
                                            : [...formData.propertyType, catLabel];
                                        handleInputChange('propertyType', newCats);
                                    }}
                                    style={{
                                        padding: '8px 6px',
                                        borderRadius: '10px',
                                        border: isSelected ? '1.5px solid #3b82f6' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                        background: isSelected ? (isDark ? 'rgba(59, 130, 246, 0.18)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                                        color: isSelected ? '#3b82f6' : (isDark ? '#94a3b8' : '#64748b'),
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '5px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <i className={`fas ${iconMap[catLabel] || 'fa-tag'}`} style={{ fontSize: '1rem', color: isSelected ? '#3b82f6' : (isDark ? '#64748b' : '#94a3b8') }}></i>
                                    <span style={{ fontSize: '0.74rem', fontWeight: isSelected ? 800 : 600, textAlign: 'center' }}>{catLabel}</span>
                                </button>
                            );
                        })}
                    </div>

                    {formData.propertyType.length > 0 && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                            <label style={entLabel}>Sub-Categories</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {Array.from(new Set(formData.propertyType.flatMap(cat => (propertyConfig[cat]?.subCategories || []).map(sub => sub.name)))).map(sub => {
                                    const isSubActive = formData.subType.includes(sub);
                                    return (
                                        <button
                                            key={sub}
                                            type="button"
                                            onClick={() => {
                                                const newSubs = isSubActive
                                                    ? formData.subType.filter(s => s !== sub)
                                                    : [...formData.subType, sub];
                                                handleInputChange('subType', newSubs);
                                            }}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '20px',
                                                border: isSubActive ? '1.5px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                                background: isSubActive ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#eef2ff') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                                                color: isSubActive ? '#6366f1' : (isDark ? '#94a3b8' : '#64748b'),
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                fontWeight: isSubActive ? 700 : 500,
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {isSubActive && <i className="fas fa-check" style={{ fontSize: '10px', marginRight: '5px' }}></i>}
                                            {sub}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Area Range & Size Specifications */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#8b5cf6')}>
                            <i className="fas fa-ruler-combined" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Area & Size Specifications</h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={entLabel}>Area Range</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={formData.areaMin}
                                    onChange={(e) => handleInputChange('areaMin', e.target.value)}
                                    placeholder="Min"
                                    style={{ ...inputStyle, minWidth: '0', flex: 1 }}
                                />
                                <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 700 }}>-</span>
                                <input
                                    type="text"
                                    value={formData.areaMax}
                                    onChange={(e) => handleInputChange('areaMax', e.target.value)}
                                    placeholder="Max"
                                    style={{ ...inputStyle, minWidth: '0', flex: 1 }}
                                />
                                <div style={{ width: '125px', flexShrink: 0 }}>
                                    <select
                                        value={formData.areaMetric}
                                        onChange={(e) => handleInputChange('areaMetric', e.target.value)}
                                        style={{ ...customSelectStyle, paddingRight: '28px' }}
                                    >
                                        <option value="Sq Yard">Sq Yard</option>
                                        <option value="Sq Feet">Sq Feet</option>
                                        <option value="Sq Meter">Sq Meter</option>
                                        <option value="Marla">Marla</option>
                                        <option value="Kanal">Kanal</option>
                                        <option value="Acre">Acre</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label style={entLabel}>Size Type / Configuration</label>
                            <CustomMultiSelect
                                options={(() => {
                                    if (formData.subType.length === 0) return [];
                                    const allRawTypes = formData.subType.flatMap(subName => {
                                        for (const cat of Object.values(propertyConfig)) {
                                            const foundSub = cat.subCategories.find(s => s.name === subName);
                                            if (foundSub) return foundSub.types.map(t => typeof t === 'string' ? t : t.name) || [];
                                        }
                                        return [];
                                    });
                                    return Array.from(new Set(allRawTypes)).sort();
                                })()}
                                value={formData.sizeType || []}
                                onChange={(val) => handleInputChange('sizeType', val)}
                                placeholder={formData.subType.length > 0 ? "Select Size Types" : "Select Sub-Category First"}
                                disabled={formData.subType.length === 0}
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Budget & Financial Preferences */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#10b981')}>
                            <i className="fas fa-rupee-sign" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Budget & Financial Preferences</h4>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                            borderRadius: '10px', background: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
                            color: '#ef4444', border: isDark ? '1px solid rgba(239,68,68,0.25)' : '1px solid #fca5a5'
                        }}>REQUIRED</span>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                        <label style={entLabel}>Budget Range <span style={{ color: '#ef4444' }}>*</span></label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                                value={formData.budgetMin}
                                onChange={(e) => {
                                    const newVal = e.target.value;
                                    handleInputChange('budgetMin', newVal);
                                    if (formData.budgetMax && Number(formData.budgetMax) <= Number(newVal)) handleInputChange('budgetMax', '');
                                }}
                                style={{ ...customSelectStyle, flex: 1 }}
                            >
                                <option value="">Min Budget</option>
                                {BUDGET_VALUES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                            <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 800 }}>to</span>
                            <select
                                value={formData.budgetMax}
                                onChange={(e) => handleInputChange('budgetMax', e.target.value)}
                                style={{ ...customSelectStyle, flex: 1 }}
                                disabled={!formData.budgetMin}
                            >
                                <option value="">Max Budget</option>
                                {BUDGET_VALUES.filter(opt => !formData.budgetMin || opt.value > Number(formData.budgetMin)).map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={entLabel}>Transaction Type</label>
                            <select
                                value={formData.transactionType}
                                onChange={(e) => handleInputChange('transactionType', e.target.value)}
                                style={customSelectStyle}
                            >
                                <option value="">Select Type</option>
                                {(leadMasterFields?.transactionTypes || []).map((type, idx) => {
                                    const tVal = renderValue(type);
                                    return <option key={tVal || idx} value={tVal}>{tVal}</option>;
                                })}
                            </select>
                            {formData.transactionType === 'Flexible' && (
                                <div style={{ marginTop: '10px', padding: '10px 12px', background: isDark ? 'rgba(59,130,246,0.1)' : '#f0f9ff', borderRadius: '10px', border: isDark ? '1px solid rgba(59,130,246,0.2)' : '1px solid #bae6fd' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>White Portion</span>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3b82f6' }}>{formData.whitePortion || 50}%</span>
                                    </div>
                                    <input type="range" min="0" max="100" step="5" value={formData.whitePortion || 50} onChange={(e) => handleInputChange('whitePortion', e.target.value)} style={{ width: '100%', accentColor: '#3b82f6' }} />
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={entLabel}>Funding Source</label>
                            <select value={formData.funding} onChange={(e) => handleInputChange('funding', e.target.value)} style={customSelectStyle}>
                                <option value="">Select Funding</option>
                                {(leadMasterFields?.fundingTypes || []).map((fund, idx) => {
                                    const fVal = renderValue(fund);
                                    return <option key={fVal || idx} value={fVal}>{fVal}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 5. Furnishing, Timeline & Purpose */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#f59e0b')}>
                            <i className="fas fa-calendar-alt" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Furnishing, Timeline & Purpose</h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                        <div>
                            <label style={entLabel}>Furnishing Status</label>
                            <select value={formData.furnishing} onChange={(e) => handleInputChange('furnishing', e.target.value)} style={customSelectStyle}>
                                <option value="">Any Status</option>
                                {(leadMasterFields?.furnishingStatuses || []).map((status, idx) => {
                                    const sVal = renderValue(status);
                                    return <option key={sVal || idx} value={sVal}>{sVal}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label style={entLabel}>Timeline</label>
                            <select value={formData.timeline} onChange={(e) => handleInputChange('timeline', e.target.value)} style={customSelectStyle}>
                                <option value="">Any Timeline</option>
                                {(leadMasterFields?.timelines || []).map((time, idx) => {
                                    const tmVal = renderValue(time);
                                    return <option key={tmVal || idx} value={tmVal}>{tmVal}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label style={entLabel}>Purpose</label>
                            <select
                                value={formData.purpose || 'End Use'}
                                onChange={(e) => handleInputChange('purpose', e.target.value)}
                                style={customSelectStyle}
                            >
                                <option value="">Select Purpose</option>
                                {((leadMasterFields?.purposes && leadMasterFields.purposes.length > 0)
                                    ? leadMasterFields.purposes
                                    : ['End Use', 'Investment']
                                ).map((purp, idx) => {
                                    const pVal = renderValue(purp);
                                    return <option key={pVal || idx} value={pVal}>{pVal}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
});

const LocationSection = React.memo(function LocationSection({
    formData,
    handleInputChange,
    sectionCardStyle,
    labelStyle,
    inputStyle,
    customSelectStyle,
    customSelectStyleDisabled,
    locationTab,
    setLocationTab,
    searchInputRef,
    areaInputRef,
    handleProjectCityChange,
    cities,
    masterFields,
    leadMasterFields,
    CustomMultiSelect,
    availableProjects,
    handleProjectSelectionChange,
    availableTowers,
    showSpecificUnit,
    setShowSpecificUnit,
    hiddenFields
}) {
    const { isDark } = useTheme();

    const entCard = {
        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '18px',
        boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'
    };

    const entHdr = {
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '14px', paddingBottom: '10px',
        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9'
    };

    const entIcon = (color) => ({
        width: '28px', height: '28px', borderRadius: '8px',
        background: color + (isDark ? '25' : '15'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0
    });

    const entTitle = {
        margin: 0, fontSize: '0.82rem', fontWeight: 800,
        color: isDark ? '#f8fafc' : '#0f172a'
    };

    const entLabel = {
        fontSize: '0.7rem', fontWeight: 900,
        color: isDark ? '#64748b' : '#64748b',
        marginBottom: '6px', display: 'block',
        textTransform: 'uppercase', letterSpacing: '0.5px'
    };

    return (
        <div className="no-scrollbar" style={{ padding: '2px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Location Mode Selector Pill Bar */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                        background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                        padding: '4px',
                        borderRadius: '12px',
                        display: 'inline-flex',
                        gap: '6px',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
                    }}>
                        <button
                            type="button"
                            onClick={() => setLocationTab('search')}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '9px',
                                border: locationTab === 'search'
                                    ? (isDark ? '1px solid rgba(99,102,241,0.5)' : '1px solid #cbd5e1')
                                    : '1px solid transparent',
                                background: locationTab === 'search'
                                    ? (isDark ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : '#fff')
                                    : 'transparent',
                                color: locationTab === 'search'
                                    ? '#fff'
                                    : (isDark ? '#94a3b8' : '#64748b'),
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: locationTab === 'search' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <i className="fas fa-map-marker-alt"></i> Search Location
                        </button>
                        <button
                            type="button"
                            onClick={() => setLocationTab('select')}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '9px',
                                border: locationTab === 'select'
                                    ? (isDark ? '1px solid rgba(99,102,241,0.5)' : '1px solid #cbd5e1')
                                    : '1px solid transparent',
                                background: locationTab === 'select'
                                    ? (isDark ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : '#fff')
                                    : 'transparent',
                                color: locationTab === 'select'
                                    ? '#fff'
                                    : (isDark ? '#94a3b8' : '#64748b'),
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: locationTab === 'select' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            <i className="fas fa-building"></i> Select Project
                        </button>
                    </div>
                </div>

                {locationTab === 'search' ? (
                    <div style={entCard}>
                        <div style={entHdr}>
                            <div style={entIcon('#f43f5e')}>
                                <i className="fas fa-map-marked-alt" style={{ fontSize: '12px' }}></i>
                            </div>
                            <h4 style={entTitle}>Location Search & Landmark</h4>
                            <span style={{
                                marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                                borderRadius: '10px', background: isDark ? 'rgba(244,63,94,0.15)' : '#ffe4e6',
                                color: '#f43f5e'
                            }}>GEO-SEARCH</span>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <label style={entLabel}>Search Location / Landmark</label>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={formData.searchLocation}
                                    onChange={(e) => handleInputChange('searchLocation', e.target.value)}
                                    placeholder="Search area, city or landmark..."
                                    style={{
                                        ...inputStyle,
                                        paddingLeft: '34px',
                                        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\' /%3E%3C/svg%3E")',
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: '10px center',
                                        backgroundSize: '15px'
                                    }}
                                />
                            </div>
                            <div style={{ width: '150px' }}>
                                <label style={entLabel}>Proximity Range</label>
                                <select value={formData.range} onChange={(e) => handleInputChange('range', e.target.value)} style={customSelectStyle}>
                                    <option value="0 km">Exact Match</option>
                                    <option value="Within 1 km">0 - 1 km</option>
                                    <option value="Within 2 km">0 - 2 km</option>
                                    <option value="Within 5 km">0 - 5 km</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '14px', marginBottom: '14px' }}>
                            <div>
                                <label style={entLabel}>House / Flat No.</label>
                                <input type="text" value={formData.locHNo} onChange={(e) => handleInputChange('locHNo', e.target.value)} placeholder="e.g. Flat 302, B-4" style={inputStyle} />
                            </div>
                            <div>
                                <label style={entLabel}>Street / Road</label>
                                <input type="text" value={formData.locStreet} onChange={(e) => handleInputChange('locStreet', e.target.value)} placeholder="Street / Road Name" style={inputStyle} />
                            </div>
                            <div>
                                <label style={entLabel}>Area / Sector</label>
                                <input type="text" value={formData.locArea} onChange={(e) => handleInputChange('locArea', e.target.value)} placeholder="Area or Sector" style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '14px' }}>
                            <div>
                                <label style={entLabel}>City</label>
                                <input type="text" value={formData.locCity} onChange={(e) => handleInputChange('locCity', e.target.value)} placeholder="City" style={inputStyle} />
                            </div>
                            <div>
                                <label style={entLabel}>State</label>
                                <input type="text" value={formData.locState} onChange={(e) => handleInputChange('locState', e.target.value)} placeholder="State" style={inputStyle} />
                            </div>
                            <div>
                                <label style={entLabel}>Pin Code</label>
                                <input type="text" value={formData.locPinCode} onChange={(e) => handleInputChange('locPinCode', e.target.value)} placeholder="Postal Code" style={inputStyle} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={entCard}>
                        <div style={entHdr}>
                            <div style={entIcon('#0284c7')}>
                                <i className="fas fa-city" style={{ fontSize: '12px' }}></i>
                            </div>
                            <h4 style={entTitle}>Project & Unit Selection</h4>
                            <span style={{
                                marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                                borderRadius: '10px', background: isDark ? 'rgba(2,132,199,0.15)' : '#e0f2fe',
                                color: '#0284c7'
                            }}>DEVELOPMENT</span>
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={entLabel}>Project City</label>
                            <select value={formData.projectCity} onChange={(e) => handleProjectCityChange(e.target.value)} style={customSelectStyle}>
                                <option value="">Select City First</option>
                                {cities.map((city, idx) => {
                                    const cVal = renderValue(city);
                                    return <option key={cVal || idx} value={cVal}>{cVal}</option>;
                                })}
                            </select>
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={entLabel}>Project Name</label>
                            <CustomMultiSelect
                                options={availableProjects}
                                value={formData.projectName}
                                onChange={handleProjectSelectionChange}
                                placeholder={formData.projectCity ? "Select Projects" : "Select City First"}
                                disabled={!formData.projectCity}
                            />
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={entLabel}>Block / Tower</label>
                            <CustomMultiSelect
                                options={availableTowers}
                                value={formData.projectTowers}
                                onChange={(val) => handleInputChange('projectTowers', val)}
                                placeholder={formData.projectName.length > 0 ? "Select Towers" : "Select Project First"}
                                disabled={formData.projectName.length === 0}
                            />
                        </div>

                        {/* Specific Units subcard */}
                        <div style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                            padding: '14px',
                            borderRadius: '10px',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSpecificUnit ? '12px' : 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-door-open" style={{ color: '#0284c7', fontSize: '12px' }}></i>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>Specific Units</span>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                                    <input
                                        type="checkbox"
                                        checked={showSpecificUnit}
                                        onChange={(e) => setShowSpecificUnit(e.target.checked)}
                                        style={{ accentColor: '#0284c7' }}
                                    />
                                    I have specific unit numbers
                                </label>
                            </div>
                            {showSpecificUnit && (
                                <div style={{ display: 'grid', gridTemplateColumns: formData.specificUnitType === 'row' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                                    <div>
                                        <label style={entLabel}>Unit Selection Mode</label>
                                        <select value={formData.specificUnitType} onChange={(e) => handleInputChange('specificUnitType', e.target.value)} style={customSelectStyle}>
                                            <option value="single">Single Unit</option>
                                            <option value="row">Row / Range</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={entLabel}>Unit No. (Start)</label>
                                        <input type="text" value={formData.propertyNo} onChange={(e) => handleInputChange('propertyNo', e.target.value)} placeholder="e.g. 101" style={inputStyle} />
                                    </div>
                                    {formData.specificUnitType === 'row' && (
                                        <div>
                                            <label style={entLabel}>Unit No. (End)</label>
                                            <input type="text" value={formData.propertyNoEnd} onChange={(e) => handleInputChange('propertyNoEnd', e.target.value)} placeholder="e.g. 110" style={inputStyle} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Orientation & Placement Card */}
                <div style={entCard}>
                    <div style={entHdr}>
                        <div style={entIcon('#14b8a6')}>
                            <i className="fas fa-compass" style={{ fontSize: '12px' }}></i>
                        </div>
                        <h4 style={entTitle}>Orientation & Specifications</h4>
                        <span style={{
                            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                            borderRadius: '10px', background: isDark ? 'rgba(20,184,166,0.15)' : '#ccfbf1',
                            color: '#14b8a6'
                        }}>PLACEMENT</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                        <div>
                            <label style={entLabel}>Facing</label>
                            <CustomMultiSelect options={masterFields.facings || []} value={formData.facing || []} onChange={(val) => handleInputChange('facing', val)} placeholder="Select Facing" allowSelectAll={true} />
                        </div>
                        <div>
                            <label style={entLabel}>Road Width</label>
                            <CustomMultiSelect options={masterFields.roadWidths || []} value={formData.roadWidth || []} onChange={(val) => handleInputChange('roadWidth', val)} placeholder="Select Width" allowSelectAll={true} />
                        </div>
                        <div>
                            <label style={entLabel}>Direction</label>
                            <CustomMultiSelect options={masterFields.directions || []} value={formData.direction || []} onChange={(val) => handleInputChange('direction', val)} placeholder="Select Direction" allowSelectAll={true} />
                        </div>
                        <div>
                            <label style={entLabel}>Unit Type</label>
                            <CustomMultiSelect options={masterFields.unitTypes || []} value={formData.unitType || []} onChange={(val) => handleInputChange('unitType', val)} placeholder="Select Unit Type" allowSelectAll={true} />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
});
