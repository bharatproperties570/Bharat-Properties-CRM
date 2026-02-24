import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

import { api } from "../utils/api";


import { usePropertyConfig } from "../context/PropertyConfigContext";
import { useContactConfig } from "../context/ContactConfigContext";
import { useFieldRules } from "../context/FieldRulesContext";
import AddressDetailsForm from "./common/AddressDetailsForm";
import { PROJECTS_LIST, PROJECT_DATA, CITIES } from "../data/projectData";
import { fetchLookup } from "../utils/fetchLookup";
import { useUserContext } from '../context/UserContext';

// Simple Custom Multi-Select Component
const CustomMultiSelect = ({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option) => {
    const newValue = value.includes(option)
      ? value.filter((v) => v !== option)
      : [...value, option];
    onChange(newValue);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
          fontSize: "0.9rem",
          color: "#334155",
          outline: "none",
          transition: "border-color 0.2s",
          background: disabled ? "#f8fafc" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: "40px",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginRight: "8px",
          }}
        >
          {value.length > 0 ? (
            value.join(", ")
          ) : (
            <span style={{ color: "#94a3b8" }}>{placeholder}</span>
          )}
        </div>
        <i
          className={`fas fa-chevron-down ${isOpen ? "fa-rotate-180" : ""}`}
          style={{
            color: "#94a3b8",
            transition: "transform 0.2s",
            fontSize: "0.8rem",
          }}
        ></i>
      </div>

      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            marginTop: "4px",
            zIndex: 50,
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          }}
        >
          {options.length > 0 ? (
            options.map((opt) => (
              <div
                key={opt}
                onClick={() => toggleOption(opt)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  borderBottom: "1px solid #f1f5f9",
                  background: value.includes(opt) ? "#f8fafc" : "#fff",
                }}
                className="hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  readOnly
                  style={{ width: "14px", height: "14px", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.9rem", color: "#334155" }}>
                  {opt}
                </span>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: "12px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: "0.85rem",
              }}
            >
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const COUNTRY_CODES = [
  { name: "India", dial_code: "+91", code: "IN" },
  { name: "United States", dial_code: "+1", code: "US" },
  { name: "United Kingdom", dial_code: "+44", code: "GB" },
  { name: "Australia", dial_code: "+61", code: "AU" },
  { name: "Canada", dial_code: "+1", code: "CA" },
  { name: "United Arab Emirates", dial_code: "+971", code: "AE" },
];

const STAGES = [
  "New",
  "Contacted",
  "Interested",
  "Meeting Scheduled",
  "Negotiation",
  "Qualified",
  "Won",
  "Lost",
];
const STATUSES = ["Active", "Inactive", "Pending", "Closed"];

// Note: Original hardcoded constants REMOVED in favor of profileConfig
// INCOME_SOURCES, BANK_NAMES, DEGREE_OPTIONS now accessed dynamically
// Fallback Constants
const FALLBACK_INCOME_SOURCES = [
  "Salary",
  "Business",
  "Rental",
  "Investment",
  "Pension",
  "Other",
];
const FALLBACK_BANK_NAMES = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Punjab National Bank",
  "Axis Bank",
  "Canara Bank",
  "Bank of Baroda",
  "Union Bank of India",
  "Bank of India",
  "IndusInd Bank",
  "Kotak Mahindra Bank",
  "Yes Bank",
  "IDFC First Bank",
  "Indian Bank",
  "Central Bank of India",
].sort();

const FALLBACK_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
const FALLBACK_SOCIAL = [
  "LinkedIn",
  "Facebook",
  "Twitter",
  "Instagram",
  "Website",
];
const FALLBACK_MOBILE_TYPES = ["Personal", "Work", "Home"];
const FALLBACK_EMAIL_TYPES = ["Personal", "Work"];
const FALLBACK_RELATIONSHIPS = [
  "Father",
  "Mother",
  "Spouse",
  "Brother",
  "Sister",
  "Friend",
  "Colleague",
  "Other",
];


// Note: Sources and campaigns are now fetched from Context
const SOURCES = [];
const CAMPAIGN_OPTIONS = [];
const SUB_SOURCE_OPTIONS = [];

const companyList = [
  "Bharat Properties",
  "Tech Solutions",
  "City Hospital",
  "Creative Design",
  "Real Estate Co",
  "Alpha Corp",
  "Beta Industries",
];

// Duplicate Popup Component (Restyled for Side Panel)
const DuplicateResults = ({ contacts, onUpdate, isBlocked }) => {
  if (!contacts || contacts.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "#94a3b8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            background: "#f1f5f9",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#cbd5e1",
          }}
        >
          <i className="fas fa-search" style={{ fontSize: "1.2rem" }}></i>
        </div>
        <div>
          <h4
            style={{
              margin: "0 0 4px 0",
              fontSize: "0.95rem",
              color: "#64748b",
            }}
          >
            No Duplicates
          </h4>
          <p style={{ margin: 0, fontSize: "0.8rem" }}>
            Similar contacts will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
      }}
    >
      {isBlocked && (
        <div style={{
          padding: '12px',
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          color: '#b91c1c',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <i className="fas fa-ban" style={{ marginTop: '3px' }}></i>
          <div>
            <div>Action Blocked</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 400, marginTop: '2px' }}>
              A critical duplicate rule prevents saving this record.
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "8px 12px",
          background: isBlocked ? "#fff1f2" : "#e0f2fe",
          borderRadius: "6px",
          border: isBlocked ? "1px solid #fecaca" : "1px solid #bae6fd",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: isBlocked ? "#991b1b" : "#0369a1",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <i className={`fas ${isBlocked ? "fa-times-circle" : "fa-exclamation-circle"}`}></i>
        {contacts.length} Similar Record{contacts.length > 1 ? "s" : ""} Found
      </div>
      {contacts.map((contact, index) => (
        <div
          key={index}
          style={{
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            padding: "12px",
            transition: "transform 0.2s",
            ":hover": { transform: "translateY(-2px)" },
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '4px'
            }}
          >
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
              {contact.title?.lookup_value || contact.title} {contact.firstName || contact.name} {contact.lastName || contact.surname}
            </div>
            {contact.matchedEntityType && (
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                background: contact.matchedEntityType === 'Lead' ? '#fdf4ff' : '#eff6ff',
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
            <div
              style={{
                fontSize: "0.8rem",
                color: "#64748b",
                marginBottom: "8px",
              }}
            >
              <i className="fas fa-building" style={{ width: "16px" }}></i>{" "}
              {contact.company}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              marginBottom: "12px",
            }}
          >
            {contact.phones?.[0] && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#475569",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <i
                  className="fas fa-phone"
                  style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                ></i>
                {contact.phones[0].number}
              </div>
            )}
            {contact.emails?.[0] && (
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#475569",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <i
                  className="fas fa-envelope"
                  style={{ fontSize: "0.7rem", color: "#94a3b8" }}
                ></i>
                {contact.emails[0].address}
              </div>
            )}
          </div>
          {!isBlocked && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onUpdate(contact);
              }}
              style={{
                width: "100%",
                padding: "8px",
                background: "#eff6ff",
                border: "1px solid #3b82f6",
                color: "#2563eb",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#3b82f6";
                e.target.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#eff6ff";
                e.target.style.color = "#2563eb";
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
    <div
      style={{
        position: "relative",
        display: "flex",
        background: "#f1f5f9",
        borderRadius: "12px",
        padding: "4px",
        border: "1px solid #e2e8f0",
        height: "48px",
        isolation: "isolate",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "4px",
          bottom: "4px",
          left: `calc(${activeIndex * (100 / options.length)}% + 4px)`,
          width: `calc(${100 / options.length}% - 8px)`,
          background: "#fff",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 1,
        }}
      />

      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          onClick={() => handleSelect(option, index)}
          style={{
            flex: 1,
            position: "relative",
            zIndex: 2,
            background: "transparent",
            border: "none",
            fontSize: "0.95rem",
            fontWeight: value === option ? 600 : 500,
            color: value === option ? "#0f172a" : "#64748b",
            cursor: "pointer",
            transition: "color 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
      ? value.filter((v) => v !== option)
      : [...value, option];
    onChange(newValue);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {options.map((option) => {
        const isActive = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggleOption(option)}
            style={{
              padding: "8px 16px",
              borderRadius: "24px",
              border: isActive ? "1px solid #3b82f6" : "1px solid #e2e8f0",
              background: isActive ? "#eff6ff" : "#fff",
              color: isActive ? "#2563eb" : "#64748b",
              fontSize: "0.9rem",
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: isActive ? "scale(1.05)" : "scale(1)",
              boxShadow: isActive
                ? "0 2px 4px rgba(59, 130, 246, 0.15)"
                : "none",
              outline: "none",
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
};




const AddContactModal = ({
  isOpen,
  onClose,
  onAdd,
  onEdit,
  initialData,
  mode = "add",
  entityType = "contact",
}) => {
  const { masterFields, propertyConfig, leadMasterFields, getLookupId, getLookupValue } =
    usePropertyConfig();
  const {
    professionalConfig,
    addressConfig,
    profileConfig = {},
  } = useContactConfig();

  const { users, teams } = useUserContext();

  // --- Profile Config Helpers ---
  const getProfileDetails = (section, category) => {
    const types = profileConfig?.[section]?.subCategories?.find(
      (c) => c.name === category,
    )?.types;
    return types && types.length > 0 ? types : null;
  };

  const titleOptions =
    getProfileDetails("Personal Details", "Titles") || FALLBACK_TITLES;
  const socialPlatforms =
    getProfileDetails("Personal Details", "Social Media") || FALLBACK_SOCIAL;
  const incomeSources =
    getProfileDetails("Financial", "Income Sources") || FALLBACK_INCOME_SOURCES;
  const bankList =
    getProfileDetails("Financial", "Loans") || FALLBACK_BANK_NAMES;
  const mobileTypes =
    getProfileDetails("Contact Method", "Mobile Types") ||
    FALLBACK_MOBILE_TYPES;
  const emailTypes =
    getProfileDetails("Contact Method", "Email Types") || FALLBACK_EMAIL_TYPES;

  // Education Helper
  const educationCategories =
    profileConfig?.["Education History"]?.subCategories || [];
  const getDegrees = (levelName) => {
    const cat = educationCategories.find((c) => c.name === levelName);
    return cat?.types || [];
  };



  // Master Fields Options
  const facingOptions = masterFields?.facings || [];
  const roadWidthOptions = masterFields?.roadWidths || [];
  const unitTypeOptions = masterFields?.unitTypes || [];
  const directionOptions = masterFields?.directions || DIRECTION_OPTIONS;
  const floorLevelOptions = masterFields?.floorLevels || [];

  const [currentTab, setCurrentTab] = useState(
    entityType === "lead" ? "requirement" : "basic",
  );
  const [currentAddressType, setCurrentAddressType] = useState("permanent"); // permanent or correspondence
  const [showOnlyRequired, setShowOnlyRequired] = useState(false);

  // Company Logic
  const [allCompanies, setAllCompanies] = useState([]);
  const [companyList, setCompanyList] = useState([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companySearch, setCompanySearch] = useState("");

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await api.get('companies?limit=1000');
        if (response.data && response.data.success) {
          const companies = response.data.records || [];
          setAllCompanies(companies);
          setCompanyList(companies.map((c) => c.name));
        }
      } catch (error) {
        console.error("Error fetching companies:", error);
      }
    };
    fetchCompanies();
  }, []);



  const [currentTime, setCurrentTime] = useState(new Date());
  const [similarContacts, setSimilarContacts] = useState([]);


  // Input Style
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "0.9rem",
    outline: "none",
    color: "#1e293b",
    transition: "border-color 0.2s",
    height: "42px", // matching select
    boxSizing: "border-box",
    backgroundColor: "#fff",
  };

  const sectionCardStyle = {
    background: "#fff",
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  };

  const labelStyle = {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#334155",
    marginBottom: "12px",
    display: "block",
  };

  // Professional Dropdown Style
  const customSelectStyle = {
    width: "100%",
    padding: "10px 12px",
    paddingRight: "30px", // Space for arrow
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    fontSize: "0.9rem",
    outline: "none",
    background: "#f8fafc",
    color: "#475569",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "12px",
  };
  const customSelectStyleDisabled = {
    ...customSelectStyle,
    background: "#f1f5f9",
    cursor: "not-allowed",
    color: "#94a3b8",
    backgroundImage: "none", // No arrow for disabled
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [formData, setFormData] = useState({
    // Basic Details
    title: null,
    name: "",
    surname: "",
    fatherName: "",
    countryCode: null,
    phones: [{ number: "", type: "Personal" }],
    emails: [{ address: "", type: "Personal" }],
    tags: [],
    description: "",

    // Professional Details
    professionCategory: null,
    professionSubCategory: null,
    designation: null,
    company: "",
    workOffice: "",

    // System Details
    campaign: null,
    source: null,
    subSource: null,
    team: "",
    owner: null,
    visibleTo: "",

    // Personal Address
    personalAddress: {
      hNo: "",
      street: "",
      country: null,
      state: null,
      city: null,
      tehsil: null,
      postOffice: null,
      pinCode: "",
      location: null,
      area: "",
    },

    // Correspondence Address
    correspondenceAddress: {
      hNo: "",
      street: "",
      country: null,
      state: null,
      city: null,
      tehsil: null,
      postOffice: null,
      pinCode: "",
      location: null,
      area: "",
    },

    // Other Details
    gender: "",
    maritalStatus: "",
    birthDate: "",
    anniversaryDate: "",

    // Education - Array
    educations: [{ education: null, degree: null, school: "" }],

    // Loan - Array
    loans: [{ loanType: null, bank: null, loanAmount: "" }],

    // Social Media - Array
    socialMedia: [{ platform: null, url: "" }],

    // Income - Array
    incomes: [{ incomeType: null, amount: "" }],

    // Documents - Array
    documents: [
      {
        documentName: null,
        documentType: null,
        documentNo: "",
        projectName: "",
        block: "",
        unitNumber: "",
        documentPicture: null,
      },
    ],
  });

  const showSuggestions = React.useMemo(() => {
    if (similarContacts.length === 0) return false;
    if (mode !== "edit") return true;

    // For edit mode, only show if a field that was initially blank has been typed into
    const nameWasBlank = !initialData?.name;
    const phoneWasBlank = !initialData?.phones?.[0]?.number;
    const emailWasBlank = !initialData?.emails?.[0]?.address;

    const nameIsTyped = nameWasBlank && formData.name?.trim().length > 0;
    const phoneIsTyped = phoneWasBlank && formData.phones?.[0]?.number?.trim().length > 0;
    const emailIsTyped = emailWasBlank && formData.emails?.[0]?.address?.trim().length > 0;

    return nameIsTyped || phoneIsTyped || emailIsTyped;
  }, [similarContacts, mode, formData.name, formData.phones, formData.emails, initialData]);



  const [title, setTitle] = useState([]);
  const [countrycode, setCountrycode] = useState([]);
  // const [team, setteam] = useState([]); // Removed local state
  const [visible, setvisible] = useState([]);
  const [doc_category, setdoc_category] = useState([]);
  const [doc_type, setdoc_type] = useState([]);
  const [edu_level, setedu_level] = useState([]);
  const [degree, setdegree] = useState([]);
  const [income_source, setincome_source] = useState([]);
  const [loan_type, setloan_type] = useState([]);
  const [bank, setbank] = useState([]);
  const [social_plateform, setsocial_plateform] = useState([]);


  const [professionCategories, setProfessionCategories] = useState([]);
  const [professionSubCategories, setProfessionSubCategories] = useState([]);
  const [designation, setDesignation] = useState([]);
  const [loading, setLoading] = useState("");


  // Helper for ID extraction from populated lookup objects
  const getId = (val) => (val && typeof val === "object" ? val._id || val.id : val);

  // Populate Initial Data if provided
  useEffect(() => {
    if (initialData && isOpen) {
      setFormData((prev) => {
        // Map backend data to frontend form structure
        // Ensure nested objects are merged correctly and lookups are mapped to IDs
        const mappedData = {
          ...prev,
          ...initialData,
          title: getId(initialData.title),
          countryCode: getId(initialData.countryCode),
          campaign: getId(initialData.campaign),
          source: getId(initialData.source),
          subSource: getId(initialData.subSource),
          professionCategory: getId(initialData.professionCategory),
          professionSubCategory: getId(initialData.professionSubCategory),
          designation: getId(initialData.designation),
          visibleTo: getId(initialData.visibleTo),
          team: getId(initialData.team),
          owner: getId(initialData.owner),
          personalAddress: {
            ...prev.personalAddress,
            ...(initialData.personalAddress || {}),
            country: getId(initialData.personalAddress?.country),
            state: getId(initialData.personalAddress?.state),
            city: getId(initialData.personalAddress?.city),
            location: getId(initialData.personalAddress?.location),
            tehsil: getId(initialData.personalAddress?.tehsil),
            postOffice: getId(initialData.personalAddress?.postOffice),
          },
          correspondenceAddress: {
            ...prev.correspondenceAddress,
            ...(initialData.correspondenceAddress || {}),
            country: getId(initialData.correspondenceAddress?.country),
            state: getId(initialData.correspondenceAddress?.state),
            city: getId(initialData.correspondenceAddress?.city),
            location: getId(initialData.correspondenceAddress?.location),
            tehsil: getId(initialData.correspondenceAddress?.tehsil),
            postOffice: getId(initialData.correspondenceAddress?.postOffice),
          },
          // Ensure array fields exist
          phones: initialData.phones?.length ? initialData.phones : prev.phones,
          emails: initialData.emails?.length ? initialData.emails : prev.emails,
          educations: initialData.educations?.length ? initialData.educations.map(e => ({
            ...e,
            degree: getId(e.degree)
          })) : prev.educations,
          loans: initialData.loans?.length ? initialData.loans.map(l => ({
            ...l,
            loanType: getId(l.loanType),
            bank: getId(l.bank)
          })) : prev.loans,
          socialMedia: initialData.socialMedia?.length ? initialData.socialMedia.map(s => ({
            ...s,
            platform: getId(s.platform)
          })) : prev.socialMedia,
          incomes: initialData.incomes?.length ? initialData.incomes.map(i => ({
            ...i,
            incomeType: getId(i.incomeType)
          })) : prev.incomes,
          documents: initialData.documents?.length ? initialData.documents.map(doc => ({
            ...doc,
            documentName: getId(doc.documentName),
            documentType: getId(doc.documentType),
            unitNumber: doc.unitNumber || doc.unitNo || ""
          })) : prev.documents,
        };
        return mappedData;
      });
    }
  }, [initialData, isOpen]);

  // Fetch Default Country Code
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // --- Lookup Pre-fetching ---
  useEffect(() => {
    const fetchAllLookups = async () => {
      if (!isOpen) return;

      try {
        // Fetch all primary lookups in parallel
        const [
          titleData,
          countryCodeData,
          categoryData,
          profSubCategoryData,
          designationData
        ] = await Promise.all([
          fetchLookup("Title"),
          fetchLookup("Country-Code"),
          fetchLookup("ProfessionalCategory"),
          initialData?.professionCategory ? fetchLookup("ProfessionalSubCategory", getId(initialData.professionCategory)) : Promise.resolve([]),
          initialData?.professionSubCategory ? fetchLookup("ProfessionalDesignation", getId(initialData.professionSubCategory)) : Promise.resolve([])
        ]);

        setTitle(titleData);
        setCountrycode(countryCodeData);
        setProfessionCategories(categoryData);
        setProfessionSubCategories(profSubCategoryData);
        setDesignation(designationData);

        // Set default country code for new contacts
        if (!initialData && countryCodeData.length > 0) {
          const defaultCode = countryCodeData.find(c =>
            c.lookup_value === "India" || c.lookup_value === "+91"
          );
          if (defaultCode) {
            setFormData(prev => ({ ...prev, countryCode: defaultCode._id }));
          }
        }
      } catch (error) {
        console.error("Error pre-fetching lookups:", error);
      }
    };

    fetchAllLookups();
  }, [isOpen, initialData?._id]);

  // Reactive Fetching for Professional  // Fetch Sub-Categories when Category changes
  useEffect(() => {
    const fetchSubCats = async () => {
      // Robustly extract ID from whatever format the field is in
      const categoryId = (formData.professionCategory && typeof formData.professionCategory === 'object')
        ? formData.professionCategory._id
        : formData.professionCategory;

      if (!isOpen || !categoryId) {
        setProfessionSubCategories([]);
        return;
      }
      const data = await fetchLookup("ProfessionalSubCategory", categoryId);
      setProfessionSubCategories(data || []);
      // Reset sub-category if current one doesn't belong to new category
      if (formData.professionSubCategory) {
        setFormData(prev => ({ ...prev, professionSubCategory: "" }));
      }
    };
    fetchSubCats();
  }, [formData.professionCategory, isOpen]);

  // Fetch Designations when Sub-Category changes
  useEffect(() => {
    const fetchDesigs = async () => {
      const subCategoryId = (formData.professionSubCategory && typeof formData.professionSubCategory === 'object')
        ? formData.professionSubCategory._id
        : formData.professionSubCategory;

      if (!isOpen || !subCategoryId) {
        setDesignation([]);
        return;
      }
      const data = await fetchLookup("ProfessionalDesignation", subCategoryId);
      setDesignation(data || []);
    };
    fetchDesigs();
  }, [formData.professionSubCategory, isOpen]);

  // Derived Data for Professional Details
  const selectedCompanyData = allCompanies.find(
    (c) => c.name === formData.company,
  );
  const hasMultipleOffices = selectedCompanyData?.offices?.length > 1;
  const officeOptions =
    selectedCompanyData?.offices?.map((o) => ({
      label: o.name,
      value: o.name,
    })) || [];

  // --- Field Rules Integration ---
  const { validate, validateAsync } = useFieldRules();
  const [hiddenFields, setHiddenFields] = useState([]);
  const [readOnlyFields, setReadOnlyFields] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Passive Validation (Visibility Check)
  useEffect(() => {
    if (validate) {
      const result = validate("contact", formData, { context: "view" });
      setHiddenFields(result.hiddenFields || []);
      setReadOnlyFields(result.readonlyFields || []);
    }
  }, [formData, validate]);



  const handleSave = async () => {
    setIsSaving(true);
    const toastId = toast.loading(mode === "edit" ? "Updating contact..." : "Adding contact...");

    // Validation: Mandatory Mobile Number
    if (!formData.phones || formData.phones.length === 0 || !formData.phones[0].number) {
      toast.error("Mobile number is required", { id: toastId });
      setIsSaving(false);
      return;
    }

    // Validation: Mandatory Assignment Fields
    if (!formData.team) {
      toast.error("Team is required", { id: toastId });
      setIsSaving(false);
      return;
    }
    if (!formData.owner) {
      toast.error("Owner/Assignee is required", { id: toastId });
      setIsSaving(false);
      return;
    }
    if (!formData.visibleTo) {
      toast.error("Visibility is required", { id: toastId });
      setIsSaving(false);
      return;
    }


    try {
      // --- FIELD RULES ENGINE VALIDATION (ASYNC) ---
      if (validateAsync) {
        const validationResult = await validateAsync("contact", formData);

        if (!validationResult.isValid) {
          const errorMessages = Object.values(validationResult.errors).join(
            ", ",
          );
          toast.error(`Validation Failed: ${errorMessages}`, { id: toastId });
          setIsSaving(false);
          return;
        }
      }

      // --- GOOGLE DRIVE UPLOAD ---
      let finalFormData = { ...formData };

      // Clean up internal fields that backend Joi might reject
      const fieldsToStrip = ["_id", "id", "__v", "createdAt", "updatedAt", "fullName"];
      fieldsToStrip.forEach(field => delete finalFormData[field]);

      // Normalize references to IDs only to prevent 500/400 errors
      const normalizeRefs = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const result = Array.isArray(obj) ? [...obj] : { ...obj };

        if (Array.isArray(result)) {
          return result.map(item => (item && typeof item === 'object' && item._id) ? item._id : item);
        }

        for (const key in result) {
          if (result[key] && typeof result[key] === 'object') {
            if (result[key]._id) {
              result[key] = result[key]._id;
            } else if (Array.isArray(result[key])) {
              result[key] = result[key].map(item =>
                (item && typeof item === 'object' && item._id) ? item._id : item
              );
            }
          }
        }
        return result;
      };

      const topLevelRefs = [
        "title", "countryCode", "campaign", "source", "subSource",
        "professionCategory", "professionSubCategory", "designation",
        "team", "owner", "visibleTo"
      ];

      const lookupMapping = {
        title: 'Title',
        countryCode: 'CountryCode',
        campaign: 'Campaign',
        source: 'Source',
        subSource: 'SubSource',
        professionCategory: 'ProfessionalCategory',
        professionSubCategory: 'ProfessionalSubCategory',
        designation: 'ProfessionalDesignation'
      };


      Object.entries(lookupMapping).forEach(([field, type]) => {
        if (finalFormData[field] && typeof finalFormData[field] === 'string') {
          const id = getLookupId(type, finalFormData[field]);
          if (id) finalFormData[field] = id;
        }
      });

      topLevelRefs.forEach(ref => {
        if (finalFormData[ref] && typeof finalFormData[ref] === 'object') {
          finalFormData[ref] = finalFormData[ref]._id || finalFormData[ref].id;
        }
      });

      if (finalFormData.personalAddress) finalFormData.personalAddress = normalizeRefs(finalFormData.personalAddress);
      if (finalFormData.correspondenceAddress) finalFormData.correspondenceAddress = normalizeRefs(finalFormData.correspondenceAddress);

      if (finalFormData.documents && finalFormData.documents.length > 0) {
        finalFormData.documents = await Promise.all(finalFormData.documents.map(async (doc) => {
          if (doc.documentPicture && (doc.documentPicture instanceof File)) {
            try {
              const uploadData = new FormData();
              uploadData.append('file', doc.documentPicture);
              const res = await api.post('/upload', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              if (res.data && res.data.success) {
                return { ...doc, documentPicture: res.data.url };
              }
            } catch (err) {
              console.error("Document upload error:", err);
            }
          }
          return doc;
        }));
      }

      let response;
      if (mode === "edit" && initialData?._id) {
        response = await api.put(`contacts/${initialData._id}`, finalFormData);
      } else {
        response = await api.post("contacts", finalFormData);
      }

      if (response.data && response.data.success) {
        toast.success(mode === "edit" ? "Contact updated successfully!" : "Contact added successfully!", { id: toastId });
        if (mode === "edit") {
          if (onEdit) onEdit(response.data.data);
        } else {
          if (onAdd) onAdd(response.data.data);
        }
        window.dispatchEvent(new CustomEvent('contact-updated'));
        onClose();
      } else {
        // Handle case where success is false but no error thrown
        throw new Error(response.data?.message || "Failed to add contact");
      }
    } catch (error) {
      console.error("Error adding contact:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to add contact. Please try again.";
      toast.error(errorMessage, { id: toastId });
    }
  };

  // Navigation Logic
  const handleNext = () => {
    // Contact Flow
    if (currentTab === "basic") setCurrentTab("personal");
  };

  const handlePrev = () => {
    // Contact Flow
    if (currentTab === "personal") setCurrentTab("basic");
  };

  // Placeholder for Populate
  const handlePopulateForm = (data) => {
    console.log("Populate", data);
  };

  // Styles (Reused from backup)
  const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const modalStyle = {
    width: "90%",
    maxWidth: "1100px",
    height: "90vh",
    backgroundColor: "#fff",
    borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    display: "flex",
    overflow: "hidden",
  };

  const leftPaneStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRight: "1px solid #e2e8f0",
  };
  const rightPaneStyle = {
    width: "300px",
    backgroundColor: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  const tabStyle = (active) => ({
    padding: "8px 20px",
    borderRadius: "9999px",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    border: "none",
    outline: "none",
    backgroundColor: active ? "#fff" : "transparent",
    color: active ? "#0f172a" : "#64748b",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  const buttonStyle = {
    cancel: {
      padding: "10px 24px",
      borderRadius: "8px",
      border: "1px solid #fecaca",
      background: "#fff",
      color: "#ef4444",
      fontWeight: 600,
      cursor: "pointer",
    },
    secondary: {
      padding: "10px 24px",
      borderRadius: "8px",
      border: "1px solid #cbd5e1",
      background: "#fff",
      color: "#334155",
      fontWeight: 600,
      cursor: "pointer",
    },
    primary: {
      padding: "10px 24px",
      borderRadius: "8px",
      border: "none",
      background: "#3b82f6",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    },
    success: {
      padding: "10px 24px",
      borderRadius: "8px",
      border: "none",
      background: "#22c55e",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    },
  };

  const [isBlocked, setIsBlocked] = useState(false);

  // Duplication Check Effect
  useEffect(() => {
    const searchDuplicates = async () => {
      // Reset state if fields are empty
      if (
        !formData.name &&
        (!formData.phones || !formData.phones[0]?.number) &&
        (!formData.emails || !formData.emails[0]?.address)
      ) {
        setSimilarContacts([]);
        setIsBlocked(false);
        return;
      }

      try {
        const response = await api.post('duplication-rules/check', {
          entityType: 'Contact',
          data: formData
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
  }, [formData.name, formData.phones, formData.emails]);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Left Pane - Form Content */}
        <div style={leftPaneStyle}>
          {/* Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {mode === "edit" ? `Update Contact` : `Add Contact`}
              </h2>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "#64748b",
                  marginTop: "2px",
                  fontWeight: 500,
                }}
              >
                {currentTime.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                |{" "}
                {currentTime.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={showOnlyRequired}
                onChange={(e) => {
                  setShowOnlyRequired(e.target.checked);
                  if (e.target.checked) {
                    setCurrentTab("basic");
                  }
                }}
              />
              <label>Show required only</label>
            </div>
          </div>

          {/* Tabs */}
          {!showOnlyRequired && (
            <div style={{ padding: "16px 32px 0 32px", background: "#fff" }}>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  padding: "4px",
                  background: "#f1f5f9",
                  borderRadius: "9999px",
                  width: "fit-content",
                }}
              >
                <button
                  onClick={() => setCurrentTab("basic")}
                  style={tabStyle(currentTab === "basic")}
                >
                  <i className="fas fa-info-circle"></i> Basic Details
                </button>
                <button
                  onClick={() => setCurrentTab("personal")}
                  style={tabStyle(currentTab === "personal")}
                >
                  <i className="fas fa-user"></i> Personal
                </button>

              </div>
            </div>
          )}

          {/* Content */}
          <div
            className="no-scrollbar"
            style={{
              flex: 1,
              padding: "24px 32px 40px 32px",
              overflowY: "auto",
              background: "#f8fafc",
            }}
          >
            {currentTab === "basic" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {/* Identity Card */}
                <div
                  style={{
                    background: "#fff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <i
                      className="fas fa-user-circle"
                      style={{ color: "#3b82f6" }}
                    ></i>{" "}
                    Identity Details
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 1fr 1fr",
                      gap: "20px",
                    }}
                  >
                    {!hiddenFields.includes("title") && (
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#64748b",
                            marginBottom: "8px",
                          }}
                        >
                          Title
                        </label>
                        <select
                          value={formData.title}
                          onFocus={async () => {
                            if (title.length === 0) {
                              setLoading("title");

                              const data = await fetchLookup("Title");

                              setTitle(data);
                              setLoading("");
                            }
                          }}
                          onChange={(e) =>
                            handleInputChange("title", e.target.value)
                          }
                          style={customSelectStyle}
                        >
                          <option value="">Title</option>
                          {title.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.lookup_value}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        First Name <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          handleInputChange("name", e.target.value)
                        }
                        placeholder="Enter first name"
                        autoComplete="off"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                          outline: "none",
                          color: "#1e293b",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={formData.surname}
                        onChange={(e) =>
                          handleInputChange("surname", e.target.value)
                        }
                        placeholder="Enter last name"
                        autoComplete="off"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                          outline: "none",
                          color: "#1e293b",
                        }}
                      />
                    </div>
                    {!showOnlyRequired && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#64748b",
                            marginBottom: "8px",
                          }}
                        >
                          Father/Husband Name
                        </label>
                        <input
                          type="text"
                          value={formData.fatherName}
                          onChange={(e) =>
                            handleInputChange("fatherName", e.target.value)
                          }
                          placeholder="Enter father or husband's name"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            outline: "none",
                            color: "#1e293b",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Mobile Numbers */}
                  <div style={{ marginTop: "24px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: "#64748b",
                        marginBottom: "12px",
                      }}
                    >
                      Mobile Numbers <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    {formData.phones.map((phone, index) => (
                      <div
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(100px, 120px) 1fr minmax(100px, 120px) 40px",
                          gap: "12px",
                          marginBottom: "12px",
                        }}
                      >
                        <select
                          value={formData.countryCode}
                          onFocus={async () => {
                            if (countrycode.length === 0) {
                              setLoading("countrycode");

                              const data = await fetchLookup("Country-Code");

                              setCountrycode(data);
                              setLoading("");
                            }
                          }}
                          onChange={(e) =>
                            handleInputChange("countryCode", e.target.value)
                          }
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                            fontSize: "0.9rem",
                            color: "#475569",
                          }}
                        >
                          {countrycode.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.lookup_value}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={phone.number}
                          onChange={(e) => {
                            const newPhones = [...formData.phones];
                            // Enforce numeric only
                            const numericValue = e.target.value.replace(/\D/g, '');
                            newPhones[index].number = numericValue;
                            handleInputChange("phones", newPhones);
                          }}
                          placeholder="Enter mobile number"
                          autoComplete="off"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            outline: "none",
                            color: "#1e293b",
                          }}
                        />
                        <select
                          value={phone.type}
                          onChange={(e) => {
                            const newPhones = [...formData.phones];
                            newPhones[index].type = e.target.value;
                            handleInputChange("phones", newPhones);
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            color: "#475569",
                          }}
                        >
                          {mobileTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (index === 0)
                              handleInputChange("phones", [
                                ...formData.phones,
                                { number: "", type: "Personal" },
                              ]);
                            else {
                              const newPhones = formData.phones.filter(
                                (_, i) => i !== index,
                              );
                              handleInputChange("phones", newPhones);
                            }
                          }}
                          style={{
                            borderRadius: "6px",
                            border: "none",
                            background: index === 0 ? "#eff6ff" : "#fef2f2",
                            color: index === 0 ? "#3b82f6" : "#ef4444",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <i
                            className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                          ></i>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Emails */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: "#64748b",
                        marginBottom: "12px",
                      }}
                    >
                      Email Addresses
                    </label>
                    {formData.emails.map((email, index) => (
                      <div
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr minmax(100px, 120px) 40px",
                          gap: "12px",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          type="email"
                          value={email.address}
                          onChange={(e) => {
                            const newEmails = [...formData.emails];
                            newEmails[index].address = e.target.value;
                            handleInputChange("emails", newEmails);
                          }}
                          placeholder="Enter email address"
                          autoComplete="off"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            outline: "none",
                            color: "#1e293b",
                          }}
                        />
                        <select
                          value={email.type}
                          onChange={(e) => {
                            const newEmails = [...formData.emails];
                            newEmails[index].type = e.target.value;
                            handleInputChange("emails", newEmails);
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            color: "#475569",
                          }}
                        >
                          {emailTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (index === 0)
                              handleInputChange("emails", [
                                ...formData.emails,
                                { address: "", type: "Personal" },
                              ]);
                            else {
                              const newEmails = formData.emails.filter(
                                (_, i) => i !== index,
                              );
                              handleInputChange("emails", newEmails);
                            }
                          }}
                          style={{
                            borderRadius: "6px",
                            border: "none",
                            background: index === 0 ? "#eff6ff" : "#fef2f2",
                            color: index === 0 ? "#3b82f6" : "#ef4444",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <i
                            className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                          ></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>



                {/* Address Details Card (Unified) */}
                {!showOnlyRequired && (
                  <div
                    style={{
                      background: "#fff",
                      padding: "24px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "20px",
                        paddingBottom: "12px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "#0f172a",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <i
                          className="fas fa-map-marker-alt"
                          style={{ color: "#6366f1" }}
                        ></i>{" "}
                        Address Details
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          background: "#f1f5f9",
                          borderRadius: "6px",
                          padding: "4px",
                        }}
                      >
                        <button
                          onClick={() => setCurrentAddressType("permanent")}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "4px",
                            border: "none",
                            background:
                              currentAddressType === "permanent"
                                ? "#fff"
                                : "transparent",
                            color:
                              currentAddressType === "permanent"
                                ? "#0f172a"
                                : "#64748b",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            boxShadow:
                              currentAddressType === "permanent"
                                ? "0 1px 2px rgba(0,0,0,0.1)"
                                : "none",
                          }}
                        >
                          Permanent
                        </button>
                        <button
                          onClick={() =>
                            setCurrentAddressType("correspondence")
                          }
                          style={{
                            padding: "6px 12px",
                            borderRadius: "4px",
                            border: "none",
                            background:
                              currentAddressType === "correspondence"
                                ? "#fff"
                                : "transparent",
                            color:
                              currentAddressType === "correspondence"
                                ? "#0f172a"
                                : "#64748b",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            boxShadow:
                              currentAddressType === "correspondence"
                                ? "0 1px 2px rgba(0,0,0,0.1)"
                                : "none",
                          }}
                        >
                          Correspondence
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const addrKey =
                        currentAddressType === "permanent"
                          ? "personalAddress"
                          : "correspondenceAddress";
                      const addr = formData[addrKey];

                      // Data Resolution from Config (Deep Hierarchy: Country -> State -> City -> Location -> Tehsil -> PO)
                      // 1. Country (Roots)
                      const countries = Object.keys(addressConfig);

                      // 2. State
                      const countryNode = addressConfig[addr.country];
                      const states =
                        countryNode?.subCategories?.map((s) => s.name) || [];

                      // 3. City
                      const stateNode = countryNode?.subCategories?.find(
                        (s) => s.name === addr.state,
                      );
                      const cities =
                        stateNode?.subCategories?.map((s) => s.name) || [];

                      // 4. Location (Sector/Area)
                      const cityNode = stateNode?.subCategories?.find(
                        (s) => s.name === addr.city,
                      );
                      const locations =
                        cityNode?.subCategories?.map((s) => s.name) || [];

                      return (
                        <AddressDetailsForm
                          title={
                            addrKey === "personalAddress"
                              ? "Personal Address"
                              : "Correspondence Address"
                          }
                          address={addr}
                          onChange={(newAddr) =>
                            handleInputChange(addrKey, newAddr)
                          }
                        />
                      );
                    })()}
                  </div>
                )}

                {!showOnlyRequired && (
                  <>
                    {/* Source Details Card */}
                    <div
                      style={{
                        background: "#fff",
                        padding: "24px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <h3
                        style={{
                          margin: "0 0 20px 0",
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "#0f172a",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          paddingBottom: "12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <i
                          className="fas fa-bullhorn"
                          style={{ color: "#f59e0b" }}
                        ></i>{" "}
                        Source Details
                      </h3>

                      {/* Tags (Moved to Top) */}
                      <div style={{ marginBottom: "20px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#64748b",
                            marginBottom: "8px",
                          }}
                        >
                          Tags
                        </label>
                        <div
                          style={{
                            width: "100%",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            alignItems: "center",
                            minHeight: "42px",
                          }}
                        >
                          {formData.tags.map((tag, index) => (
                            <div
                              key={index}
                              style={{
                                background: "#eff6ff",
                                color: "#3b82f6",
                                padding: "4px 10px",
                                borderRadius: "16px",
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              {tag}
                              <span
                                onClick={() =>
                                  handleInputChange(
                                    "tags",
                                    formData.tags.filter((_, i) => i !== index),
                                  )
                                }
                                style={{
                                  cursor: "pointer",
                                  fontSize: "1rem",
                                  lineHeight: "0.8",
                                }}
                              >
                                &times;
                              </span>
                            </div>
                          ))}
                          <input
                            type="text"
                            placeholder={
                              formData.tags.length === 0
                                ? "Add tags (Press Enter)"
                                : ""
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && e.target.value.trim()) {
                                e.preventDefault();
                                if (
                                  !formData.tags.includes(e.target.value.trim())
                                ) {
                                  handleInputChange("tags", [
                                    ...formData.tags,
                                    e.target.value.trim(),
                                  ]);
                                }
                                e.target.value = "";
                              } else if (
                                e.key === "Backspace" &&
                                !e.target.value &&
                                formData.tags.length > 0
                              ) {
                                handleInputChange(
                                  "tags",
                                  formData.tags.slice(0, -1),
                                );
                              }
                            }}
                            style={{
                              border: "none",
                              outline: "none",
                              fontSize: "0.9rem",
                              color: "#1e293b",
                              flex: 1,
                              minWidth: "120px",
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: "20px",
                          marginBottom: "20px",
                        }}
                      >
                        {/* Source */}
                        {!hiddenFields.includes("source") && (
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                color: "#64748b",
                                marginBottom: "8px",
                              }}
                            >
                              Source
                            </label>
                            <select
                              value={formData.source}
                              onChange={(e) => {
                                const selectedSourceName = e.target.value;
                                handleInputChange("source", selectedSourceName);
                                handleInputChange("subSource", ""); // Reset subSource

                                // Auto-set campaign based on source
                                const allCampaigns = leadMasterFields?.campaigns || [];
                                let foundCampaign = null;
                                for (const camp of allCampaigns) {
                                  if (camp.sources?.some(s => s.name === selectedSourceName)) {
                                    foundCampaign = camp.name;
                                    break;
                                  }
                                }
                                if (foundCampaign) {
                                  handleInputChange("campaign", foundCampaign);
                                }
                              }}
                              style={customSelectStyle}
                            >
                              <option value="">Select Source</option>
                              {(() => {
                                const allCampaigns = leadMasterFields?.campaigns || [];
                                const allSources = [];
                                allCampaigns.forEach(camp => {
                                  if (camp.sources && camp.sources.length > 0) {
                                    camp.sources.forEach(src => {
                                      // Avoid duplicates if any
                                      if (!allSources.some(s => s.name === src.name)) {
                                        allSources.push(src);
                                      }
                                    });
                                  }
                                });

                                return allSources.map((s) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name}
                                  </option>
                                )
                                );
                              })()}
                            </select>
                          </div>
                        )}

                        {/* Sub-Source */}
                        {!hiddenFields.includes("subSource") && (
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                color: "#64748b",
                                marginBottom: "8px",
                              }}
                            >
                              Sub-Source
                            </label>
                            <select
                              value={formData.subSource}
                              onChange={(e) =>
                                handleInputChange("subSource", e.target.value)
                              }
                              style={
                                !formData.source
                                  ? customSelectStyleDisabled
                                  : customSelectStyle
                              }
                              disabled={!formData.source}
                            >
                              <option value="">Select Sub-Source</option>
                              {(() => {
                                // Find the source object within ALL campaigns
                                const allCampaigns = leadMasterFields?.campaigns || [];
                                let selectedSrc = null;

                                for (const camp of allCampaigns) {
                                  const src = camp.sources?.find(s => s.name === formData.source);
                                  if (src) {
                                    selectedSrc = src;
                                    break;
                                  }
                                }

                                return (selectedSrc?.mediums || []).map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ));
                              })()}
                            </select>
                          </div>
                        )}
                      </div>


                    </div>
                  </>
                )}

                {/* System Assignment Card */}
                <div
                  style={{
                    background: "#fff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <i
                      className="fas fa-sliders-h"
                      style={{ color: "#64748b" }}
                    ></i>{" "}
                    System Assignment
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "20px",
                    }}
                  >

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Team <span style={{ color: '#ef4444' }}>*</span>

                      </label>
                      <select
                        value={formData.team}
                        onChange={(e) => {
                          const newTeam = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            team: newTeam,
                            owner: "", // Reset owner when team changes
                          }));
                        }}
                        style={customSelectStyle}
                      >
                        <option value="">Select Team</option>
                        {teams.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Assign <span style={{ color: '#ef4444' }}>*</span>

                      </label>
                      <select
                        value={formData.owner}
                        onChange={(e) =>
                          handleInputChange("owner", e.target.value)
                        }
                        style={customSelectStyle}
                      >
                        <option value="">Select Owner</option>
                        {users
                          .filter(
                            (user) =>
                              !formData.team ||
                              (user.team && user.team === formData.team) ||
                              (user.team?._id === formData.team)
                          )
                          .map((user) => (
                            <option key={user._id || user.id} value={user._id || user.id}>
                              {user.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Visibility <span style={{ color: '#ef4444' }}>*</span>

                      </label>
                      <select
                        value={formData.visibleTo}
                        onChange={(e) =>
                          handleInputChange("visibleTo", e.target.value)
                        }
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

                {/* Description Card */}

              </div>
            ) : currentTab === "personal" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {/* Personal Basic Info */}
                <div
                  style={{
                    background: "#fff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <i
                      className="fas fa-user-clock"
                      style={{ color: "#ec4899" }}
                    ></i>{" "}
                    Bio Details
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "20px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Gender
                      </label>
                      <select
                        value={formData.gender}
                        onChange={(e) =>
                          handleInputChange("gender", e.target.value)
                        }
                        style={customSelectStyle}
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Marital Status
                      </label>
                      <select
                        value={formData.maritalStatus}
                        onChange={(e) =>
                          handleInputChange("maritalStatus", e.target.value)
                        }
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
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          color: "#64748b",
                          marginBottom: "8px",
                        }}
                      >
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.birthDate}
                        onChange={(e) =>
                          handleInputChange("birthDate", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                          outline: "none",
                          color: "#1e293b",
                        }}
                      />
                    </div>
                    {formData.maritalStatus === "Married" && (
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            color: "#64748b",
                            marginBottom: "8px",
                          }}
                        >
                          Anniversary Date
                        </label>
                        <input
                          type="date"
                          value={formData.anniversaryDate}
                          onChange={(e) =>
                            handleInputChange("anniversaryDate", e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.9rem",
                            outline: "none",
                            color: "#1e293b",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Social Presence (Moved from separate card) */}
                  <h3
                    style={{
                      margin: "20px 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingTop: "16px",
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    <i
                      className="fas fa-hashtag"
                      style={{ color: "#ec4899" }}
                    ></i>{" "}
                    Social Presence
                  </h3>
                  {formData.socialMedia.map((social, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(140px, 160px) 1fr 40px",
                        gap: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <select
                        value={social.platform}
                        onFocus={async () => {
                          if (social_plateform.length === 0) {
                            setLoading("social-plateform");

                            const data = await fetchLookup("Social Plateform");

                            setsocial_plateform(data);
                            setLoading("");
                          }
                        }}
                        onChange={(e) => {
                          const newSocial = [...formData.socialMedia];
                          newSocial[index].platform = e.target.value;
                          handleInputChange("socialMedia", newSocial);
                        }}
                        style={customSelectStyle}
                      >
                        <option value="">Select Platform</option>
                        {social_plateform.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.lookup_value}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Profile URL / Handle"
                        value={social.url}
                        onChange={(e) => {
                          const newSocial = [...formData.socialMedia];
                          newSocial[index].url = e.target.value;
                          handleInputChange("socialMedia", newSocial);
                        }}
                        style={{
                          padding: "10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (index === 0)
                            handleInputChange("socialMedia", [
                              ...formData.socialMedia,
                              { platform: null, url: "" },
                            ]);
                          else {
                            const newSocial = formData.socialMedia.filter(
                              (_, i) => i !== index,
                            );
                            handleInputChange("socialMedia", newSocial);
                          }
                        }}
                        style={{
                          borderRadius: "6px",
                          border: "none",
                          background: index === 0 ? "#eff6ff" : "#fef2f2",
                          color: index === 0 ? "#3b82f6" : "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <i
                          className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                        ></i>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Professional Details Card */}
                {!showOnlyRequired && (
                  <div
                    style={{
                      background: "#fff",
                      padding: "24px",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <h3
                      style={{
                        margin: "0 0 20px 0",
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        paddingBottom: "12px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <i
                        className="fas fa-briefcase"
                        style={{ color: "#0ea5e9" }}
                      ></i>{" "}
                      Professional Details
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "20px",
                      }}
                    >
                      {(() => {
                        const selectedCompanyObj = allCompanies.find(
                          (c) => c.name === formData.company,
                        );
                        const branchOffices =
                          selectedCompanyObj?.addresses?.["Branch Office"] ||
                          [];
                        const siteOffices =
                          selectedCompanyObj?.addresses?.["Site Office"] || [];
                        const hasMultipleOffices =
                          Array.isArray(branchOffices) &&
                          (branchOffices.length > 0 || siteOffices.length > 0);

                        const officeOptions = [
                          ...(Array.isArray(branchOffices)
                            ? branchOffices.map((b) => ({
                              label: b.branchName || "Branch",
                              value: b.branchName || "Branch",
                            }))
                            : []),
                          ...(Array.isArray(siteOffices)
                            ? siteOffices.map((s) => ({
                              label: s.branchName || "Site",
                              value: s.branchName || "Site",
                            }))
                            : []),
                        ];

                        return (
                          <>
                            {/* 1. Profession Category */}
                            <div>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.85rem",
                                  fontWeight: 500,
                                  color: "#64748b",
                                  marginBottom: "8px",
                                }}
                              >
                                Profession Category
                              </label>
                              <select
                                value={formData.professionCategory}
                                onFocus={async () => {
                                  if (professionCategories.length === 0) {
                                    setLoading("category");

                                    const data = await fetchLookup("ProfessionalCategory");

                                    setProfessionCategories(data);
                                    setLoading("");
                                  }
                                }}
                                onChange={(e) => {
                                  handleInputChange(
                                    "professionCategory",
                                    e.target.value,
                                  );
                                  handleInputChange(
                                    "professionSubCategory",
                                    "",
                                  ); // Reset child
                                  handleInputChange("designation", ""); // Reset child
                                }}
                                style={customSelectStyle}
                              >
                                <option value="">Select Category</option>
                                {professionCategories.map((cat) => (
                                  <option key={cat._id} value={cat._id}>
                                    {cat.lookup_value}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 2. Sub-Category */}
                            <div>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.85rem",
                                  fontWeight: 500,
                                  color: "#64748b",
                                  marginBottom: "8px",
                                }}
                              >
                                Sub-Category
                              </label>
                              <select
                                value={formData.professionSubCategory}
                                onChange={(e) => {
                                  handleInputChange(
                                    "professionSubCategory",
                                    e.target.value,
                                  );
                                  handleInputChange("designation", ""); // Reset child
                                }}
                                style={
                                  !formData.professionCategory
                                    ? customSelectStyleDisabled
                                    : customSelectStyle
                                }
                                disabled={!formData.professionCategory}
                              >
                                <option value="">Select Sub-Category</option>
                                {formData.professionCategory &&
                                  professionSubCategories.map((sc) => (
                                    <option key={sc._id} value={sc._id}>
                                      {sc.lookup_value}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            {/* 3. Designation */}
                            <div>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.85rem",
                                  fontWeight: 500,
                                  color: "#64748b",
                                  marginBottom: "8px",
                                }}
                              >
                                Designation
                              </label>
                              <select
                                value={formData.designation}
                                onChange={(e) =>
                                  handleInputChange(
                                    "designation",
                                    e.target.value,
                                  )
                                }
                                style={
                                  !formData.professionSubCategory
                                    ? customSelectStyleDisabled
                                    : customSelectStyle
                                }
                                disabled={!formData.professionSubCategory}
                              >
                                <option value="">Select Designation</option>
                                {formData.professionCategory &&
                                  designation.map((d) => (
                                    <option key={d._id} value={d._id}>
                                      {d.lookup_value}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            {/* 4. Company (Creatable Select) */}
                            <div style={{ position: "relative" }}>
                              <label
                                style={{
                                  display: "block",
                                  fontSize: "0.85rem",
                                  fontWeight: 500,
                                  color: "#64748b",
                                  marginBottom: "8px",
                                }}
                              >
                                Company
                              </label>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  value={formData.company}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleInputChange("company", val);
                                    setCompanySearch(val);
                                    setShowCompanyDropdown(true);
                                  }}
                                  onFocus={() => {
                                    setCompanySearch(formData.company);
                                    setShowCompanyDropdown(true);
                                  }}
                                  onBlur={() =>
                                    setTimeout(
                                      () => setShowCompanyDropdown(false),
                                      200,
                                    )
                                  }
                                  placeholder="Select or Type New Company"
                                  style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "0.9rem",
                                    outline: "none",
                                    color: "#1e293b",
                                  }}
                                  autoComplete="off"
                                />
                                {showCompanyDropdown && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "100%",
                                      left: 0,
                                      right: 0,
                                      background: "#fff",
                                      border: "1px solid #cbd5e1",
                                      borderRadius: "6px",
                                      marginTop: "4px",
                                      zIndex: 50,
                                      maxHeight: "200px",
                                      overflowY: "auto",
                                      boxShadow:
                                        "0 4px 6px -1px rgba(0,0,0,0.1)",
                                    }}
                                  >
                                    {(() => {
                                      const filtered = companyList.filter((c) =>
                                        c
                                          .toLowerCase()
                                          .includes(
                                            companySearch.toLowerCase(),
                                          ),
                                      );
                                      const showAddNew =
                                        companySearch &&
                                        !companyList.some(
                                          (c) =>
                                            c.toLowerCase() ===
                                            companySearch.toLowerCase(),
                                        );

                                      return (
                                        <>
                                          {filtered.map((comp) => (
                                            <div
                                              key={comp}
                                              onMouseDown={() => {
                                                handleInputChange(
                                                  "company",
                                                  comp,
                                                );
                                                handleInputChange(
                                                  "workOffice",
                                                  "",
                                                ); // Reset office on company change
                                                setShowCompanyDropdown(false);
                                              }}
                                              style={{
                                                padding: "10px 12px",
                                                cursor: "pointer",
                                                fontSize: "0.9rem",
                                                color: "#334155",
                                              }}
                                              className="hover:bg-slate-50"
                                            >
                                              {comp}
                                            </div>
                                          ))}
                                          {showAddNew && (
                                            <div
                                              onMouseDown={() => {
                                                const newCompany =
                                                  companySearch;
                                                setCompanyList((prev) => [
                                                  ...prev,
                                                  newCompany,
                                                ]);
                                                handleInputChange(
                                                  "company",
                                                  newCompany,
                                                );
                                                handleInputChange(
                                                  "workOffice",
                                                  "",
                                                );
                                                setShowCompanyDropdown(false);
                                              }}
                                              style={{
                                                padding: "10px 12px",
                                                cursor: "pointer",
                                                fontSize: "0.9rem",
                                                color: "#2563eb",
                                                borderTop: "1px dashed #e2e8f0",
                                                background: "#eff6ff",
                                              }}
                                            >
                                              + Add "{companySearch}"
                                            </div>
                                          )}
                                          {!showAddNew &&
                                            filtered.length === 0 && (
                                              <div
                                                style={{
                                                  padding: "12px",
                                                  textAlign: "center",
                                                  color: "#94a3b8",
                                                  fontSize: "0.85rem",
                                                }}
                                              >
                                                No matches
                                              </div>
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
                              <div style={{ gridColumn: "span 2" }}>
                                <label
                                  style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    color: "#10b981",
                                    marginBottom: "10px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                  }}
                                >
                                  <i className="fas fa-map-marker-alt"></i>{" "}
                                  Associated Office / Branch
                                </label>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "10px",
                                  }}
                                >
                                  {officeOptions.map((opt, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() =>
                                        handleInputChange(
                                          "workOffice",
                                          opt.value,
                                        )
                                      }
                                      style={{
                                        padding: "8px 16px",
                                        borderRadius: "20px",
                                        border: `1.5px solid ${formData.workOffice === opt.value ? "#10b981" : "#e2e8f0"}`,
                                        background:
                                          formData.workOffice === opt.value
                                            ? "#ecfdf5"
                                            : "#fff",
                                        color:
                                          formData.workOffice === opt.value
                                            ? "#047857"
                                            : "#64748b",
                                        fontSize: "0.85rem",
                                        fontWeight:
                                          formData.workOffice === opt.value
                                            ? 700
                                            : 500,
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      {formData.workOffice === opt.value && (
                                        <i className="fas fa-check-circle"></i>
                                      )}
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                <p
                                  style={{
                                    margin: "8px 0 0 0",
                                    fontSize: "0.75rem",
                                    color: "#64748b",
                                    fontStyle: "italic",
                                  }}
                                >
                                  Select the specific location where this
                                  contact is based.
                                </p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Education & Financial Details Card */}
                <div
                  style={{
                    background: "#fff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <i
                      className="fas fa-coins"
                      style={{ color: "#eab308" }}
                    ></i>{" "}
                    Education & Financial Details
                  </h3>

                  {/* Education History (Moved from separate card) */}
                  <h4
                    style={{
                      fontSize: "0.9rem",
                      color: "#475569",
                      marginBottom: "12px",
                    }}
                  >
                    Education History
                  </h4>
                  {formData.educations.map((edu, index) => {
                    const availableDegrees = getDegrees(edu.education);

                    return (
                      <div
                        key={index}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(120px, 1fr) 1fr 2fr 40px",
                          gap: "12px",
                          marginBottom: "12px",
                          alignItems: "end",
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.8rem",
                              color: "#64748b",
                              marginBottom: "4px",
                            }}
                          >
                            Level
                          </label>
                          <select
                            value={edu.education}
                            onFocus={async () => {
                              if (edu_level.length === 0) {
                                setLoading("edu_level");

                                const data = await fetchLookup("Education-Level");

                                setedu_level(data);
                                setLoading("");
                              }
                            }}
                            onChange={(e) => {
                              const newEdu = [...formData.educations];
                              newEdu[index].education = e.target.value;
                              newEdu[index].degree = ""; // Reset degree
                              handleInputChange("educations", newEdu);
                            }}
                            style={customSelectStyle}
                          >
                            <option value="">Select Level</option>
                            {edu_level.map((cat) => (
                              <option key={cat._id} value={cat._id}>
                                {cat.lookup_value}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.8rem",
                              color: "#64748b",
                              marginBottom: "4px",
                            }}
                          >
                            Degree/Course
                          </label>
                          <select
                            value={edu.degree}
                            onFocus={async () => {
                              // Always fetch if education level is selected to ensure we get children
                              if (edu.education) {
                                setLoading("degree");
                                // Fetch Degrees that are children of the selected Education Level
                                const data = await fetchLookup("Degree", edu.education);
                                setdegree(data);
                                setLoading("");
                              }
                            }}
                            onChange={(e) => {
                              const newEdu = [...formData.educations];
                              newEdu[index].degree = e.target.value;
                              handleInputChange("educations", newEdu);
                            }}
                            disabled={!edu.education}
                            style={
                              !edu.education
                                ? customSelectStyleDisabled
                                : customSelectStyle
                            }
                          >
                            <option value="">Select Degree</option>
                            {degree.map((deg) => (
                              <option key={deg._id} value={deg._id}>
                                {deg.lookup_value}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.8rem",
                              color: "#64748b",
                              marginBottom: "4px",
                            }}
                          >
                            Institute
                          </label>
                          <input
                            type="text"
                            placeholder="School/University"
                            value={edu.school}
                            onChange={(e) => {
                              const newEdu = [...formData.educations];
                              newEdu[index].school = e.target.value;
                              handleInputChange("educations", newEdu);
                            }}
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "0.9rem",
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (index === 0)
                              handleInputChange("educations", [
                                ...formData.educations,
                                { education: null, degree: null, school: "" },
                              ]);
                            else {
                              const newEdu = formData.educations.filter(
                                (_, i) => i !== index,
                              );
                              handleInputChange("educations", newEdu);
                            }
                          }}
                          style={{
                            height: "40px",
                            borderRadius: "6px",
                            border: "none",
                            background: index === 0 ? "#eff6ff" : "#fef2f2",
                            color: index === 0 ? "#3b82f6" : "#ef4444",
                            cursor: "pointer",
                          }}
                        >
                          <i
                            className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                          ></i>
                        </button>
                      </div>
                    );
                  })}

                  {/* Annual Income Source (Moved down) */}
                  <h4
                    style={{
                      fontSize: "0.9rem",
                      color: "#475569",
                      margin: "20px 0 12px 0",
                      paddingTop: "16px",
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    Annual Income Source
                  </h4>
                  {formData.incomes.map((inc, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 40px",
                        gap: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <select
                        value={inc.incomeType}
                        onFocus={async () => {
                          if (income_source.length === 0) {
                            setLoading("incomeSource");

                            const data = await fetchLookup("Income-Source");

                            setincome_source(data);
                            setLoading("");
                          }
                        }}
                        onChange={(e) => {
                          const newInc = [...formData.incomes];
                          newInc[index].incomeType = e.target.value;
                          handleInputChange("incomes", newInc);
                        }}
                        style={customSelectStyle}
                      >
                        <option value="">Select Source</option>
                        {income_source.map((source) => (
                          <option key={source._id} value={source._id}>
                            {source.lookup_value}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={inc.amount}
                        onChange={(e) => {
                          const newInc = [...formData.incomes];
                          newInc[index].amount = e.target.value;
                          handleInputChange("incomes", newInc);
                        }}
                        style={{
                          padding: "10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (index === 0)
                            handleInputChange("incomes", [
                              ...formData.incomes,
                              { incomeType: null, amount: "" },
                            ]);
                          else {
                            const newInc = formData.incomes.filter(
                              (_, i) => i !== index,
                            );
                            handleInputChange("incomes", newInc);
                          }
                        }}
                        style={{
                          borderRadius: "6px",
                          border: "none",
                          background: index === 0 ? "#eff6ff" : "#fef2f2",
                          color: index === 0 ? "#3b82f6" : "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <i
                          className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                        ></i>
                      </button>
                    </div>
                  ))}

                  {/* Loans */}
                  <h4
                    style={{
                      fontSize: "0.9rem",
                      color: "#475569",
                      margin: "20px 0 12px 0",
                      paddingTop: "16px",
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    Existing Loans
                  </h4>
                  {formData.loans.map((loan, index) => (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 40px",
                        gap: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <select
                        value={loan.loanType}
                        onFocus={async () => {
                          if (loan_type.length === 0) {
                            setLoading("loan-type");

                            const data = await fetchLookup("Loan Type");

                            setloan_type(data);
                            setLoading("");
                          }
                        }}
                        onChange={(e) => {
                          const newLoans = [...formData.loans];
                          newLoans[index].loanType = e.target.value;
                          handleInputChange("loans", newLoans);
                        }}
                        style={customSelectStyle}
                      >
                        <option value="">Type</option>
                        {loan_type.map((l) => (
                          <option key={l._id} value={l._id}>
                            {l.lookup_value}
                          </option>
                        ))}
                      </select>
                      <select
                        value={loan.bank}
                        onFocus={async () => {
                          if (bank.length === 0) {
                            setLoading("bank");

                            const data = await fetchLookup("Bank");

                            setbank(data);
                            setLoading("");
                          }
                        }}
                        onChange={(e) => {
                          const newLoans = [...formData.loans];
                          newLoans[index].bank = e.target.value;
                          handleInputChange("loans", newLoans);
                        }}
                        style={customSelectStyle}
                      >
                        <option value="">Select Bank</option>
                        {bank.map((bank) => (
                          <option key={bank._id} value={bank._id}>
                            {bank.lookup_value}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={loan.loanAmount}
                        onChange={(e) => {
                          const newLoans = [...formData.loans];
                          newLoans[index].loanAmount = e.target.value;
                          handleInputChange("loans", newLoans);
                        }}
                        style={{
                          padding: "10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.9rem",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (index === 0)
                            handleInputChange("loans", [
                              ...formData.loans,
                              { loanType: null, bank: null, loanAmount: "" },
                            ]);
                          else {
                            const newLoans = formData.loans.filter(
                              (_, i) => i !== index,
                            );
                            handleInputChange("loans", newLoans);
                          }
                        }}
                        style={{
                          borderRadius: "6px",
                          border: "none",
                          background: index === 0 ? "#eff6ff" : "#fef2f2",
                          color: index === 0 ? "#3b82f6" : "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <i
                          className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}
                        ></i>
                      </button>
                    </div>
                  ))}
                </div>


                {/* Remarks (Moved from Source Details) */}
                <div
                  style={{
                    background: "#fff",
                    padding: "24px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      paddingBottom: "12px",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <i
                      className="fas fa-sticky-note"
                      style={{ color: "#64748b" }}
                    ></i>{" "}
                    Remarks
                  </h3>
                  <div>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        handleInputChange("description", e.target.value)
                      }
                      placeholder="Enter any additional remarks about this contact..."
                      style={{
                        width: "100%",
                        minHeight: "80px",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.9rem",
                        outline: "none",
                        color: "#1e293b",
                        resize: "vertical",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button onClick={onClose} style={buttonStyle.cancel}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: "12px" }}>
              {/* Previous Button - Hide on first tab */}
              {currentTab !== "basic" && (
                <button onClick={handlePrev} style={buttonStyle.secondary}>
                  Previous
                </button>
              )}

              {/* Next/Save Button */}
              {currentTab !== "personal" && !showOnlyRequired ? (
                <button onClick={handleNext} style={buttonStyle.primary}>
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  style={isBlocked ? { ...buttonStyle.success, opacity: 0.5, cursor: 'not-allowed', background: '#94a3b8' } : buttonStyle.success}
                  disabled={isBlocked || isSaving}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Pane */}
        {
          showSuggestions && (
            <div style={rightPaneStyle}>
              <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0" }}>
                <h3>Suggestions</h3>
              </div>
              <div style={{ flex: 1, padding: "20px" }}>
                <DuplicateResults
                  contacts={similarContacts}
                  onUpdate={handlePopulateForm}
                  isBlocked={isBlocked}
                />
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
};

export default AddContactModal;
