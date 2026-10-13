import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTeams , useActiveUsers } from '../utils/crmHooks';
import toast from "react-hot-toast";
import { useTheme } from "../context/ThemeContext";

import { api } from "../utils/api";


import { usePropertyConfig } from "../context/PropertyConfigContext";
import { useContactConfig } from "../context/ContactConfigContext";
import { useFieldRules } from "../context/FieldRulesContext";
import AddressDetailsForm from "./common/AddressDetailsForm";
import { fetchLookup } from "../utils/fetchLookup";
import { useUserContext } from '../context/UserContext';
import { renderValue } from "../utils/renderUtils";
import ContactBasicSection from "./ContactBasicSection";
import ContactPersonalSection from "./ContactPersonalSection";

// Simple Custom Multi-Select Component
// CustomMultiSelect removed

// DIRECTION_OPTIONS removed

const FALLBACK_MOBILE_TYPES = ["Personal", "Work", "Home"];
const FALLBACK_EMAIL_TYPES = ["Personal", "Work"];

// Duplicate Popup Component (Restyled for Side Panel)
const DuplicateResults = ({ contacts, onUpdate, isBlocked, getLookupValue, isDark }) => {
  if (!contacts || contacts.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px",
      }}
    >
      {isBlocked && (
        <div style={{
          padding: '10px 12px',
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          color: '#b91c1c',
          fontSize: '0.78rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <i className="fas fa-ban" style={{ marginTop: '2px', fontSize: '13px' }}></i>
          <div>
            <div style={{ fontWeight: 800 }}>Action Blocked</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, marginTop: '2px' }}>
              Duplicate rule prevents creating duplicate contact.
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "6px 10px",
          background: isBlocked ? "#fee2e2" : (isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7"),
          borderRadius: "8px",
          border: isBlocked ? "1px solid #fca5a5" : (isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fde68a"),
          fontSize: "0.72rem",
          fontWeight: 700,
          color: isBlocked ? "#b91c1c" : (isDark ? "#fbbf24" : "#92400e"),
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <i className={`fas ${isBlocked ? "fa-times-circle" : "fa-exclamation-triangle"}`}></i>
        {contacts.length} Similar Record{contacts.length > 1 ? "s" : ""} Found
      </div>
      {contacts.map((contact, index) => (
        <div
          key={index}
          style={{
            background: isDark ? "rgba(255, 255, 255, 0.04)" : "#fff",
            borderRadius: "10px",
            border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            transition: "all 0.2s",
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '6px'
            }}
          >
            <div style={{ fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a', fontSize: '0.85rem' }}>
              {renderValue(contact.title, "")} {contact.firstName || contact.name} {contact.lastName || contact.surname}
            </div>
            {contact.matchedEntityType && (
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                background: contact.matchedEntityType === 'Lead' ? '#fdf4ff' : '#eff6ff',
                color: contact.matchedEntityType === 'Lead' ? '#d946ef' : '#3b82f6',
                padding: '1px 6px',
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
                fontSize: "0.75rem",
                color: isDark ? "var(--text-muted)" : "#64748b",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              <i className="fas fa-building" style={{ fontSize: "11px", color: "#94a3b8" }}></i>
              <span>{renderValue(contact.company)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              margin: "2px 0 6px 0",
            }}
          >
            {contact.phones?.[0] && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: isDark ? "#cbd5e1" : "#475569",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <i
                  className="fas fa-phone"
                  style={{ fontSize: "10px", color: "#94a3b8" }}
                ></i>
                {contact.phones[0].number}
              </div>
            )}
            {contact.emails?.[0] && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: isDark ? "#cbd5e1" : "#475569",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <i
                  className="fas fa-envelope"
                  style={{ fontSize: "10px", color: "#94a3b8" }}
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
                padding: "6px",
                background: isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff",
                border: "1px solid #3b82f6",
                color: isDark ? "#93c5fd" : "#2563eb",
                borderRadius: "6px",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                transition: "all 0.2s",
              }}
            >
              <i className="fas fa-sync-alt" style={{ fontSize: "11px" }}></i> Update Form with this
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

// --- Animated UI Components ---

// Unused Animated UI Components removed




const AddContactModal = ({
  isOpen,
  onClose,
  onAdd,
  onEdit,
  initialData,
  mode = "add",
  entityType = "contact",
}) => {
  const { isDark } = useTheme();
  const { leadMasterFields, getLookupId, getLookupValue } =
    usePropertyConfig();
  const {
    profileConfig = {},
  } = useContactConfig();

  const { data: users = [] } = useActiveUsers();
    
    const { data: teams = [] } = useTeams();

  const prevCategoryRef = useRef(null);
  const prevSubCategoryRef = useRef(null);

  // --- Profile Config Helpers ---
  const getProfileDetails = (section, category) => {
    const types = profileConfig?.[section]?.subCategories?.find(
      (c) => c.name === category,
    )?.types;
    return types && types.length > 0 ? types : null;
  };

  const mobileTypes =
    getProfileDetails("Contact Method", "Mobile Types") ||
    FALLBACK_MOBILE_TYPES;
  const emailTypes =
    getProfileDetails("Contact Method", "Email Types") || FALLBACK_EMAIL_TYPES;

  // Master Fields Options
  // facingOptions, roadWidthOptions, unitTypeOptions, floorLevelOptions moved to specific sections if used

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
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [similarContacts, setSimilarContacts] = useState([]);


  // Style constants moved or removed

  // Professional Dropdown Style
  const customSelectStyle = {
    width: "100%",
    padding: "7px 11px",
    paddingRight: "28px", // Space for arrow
    borderRadius: "8px",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1",
    fontSize: "0.82rem",
    fontWeight: 600,
    outline: "none",
    background: isDark ? "rgba(255, 255, 255, 0.04)" : "#fff",
    color: isDark ? "var(--text-main)" : "#1e293b",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    backgroundSize: "10px",
  };
  const customSelectStyleDisabled = {
    ...customSelectStyle,
    background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f1f5f9",
    cursor: "not-allowed",
    color: isDark ? "rgba(255,255,255,0.3)" : "#94a3b8",
    backgroundImage: "none",
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
    campaign: "",
    source: "",
    subSource: "",
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
  const [edu_level, setedu_level] = useState([]);
  const [degree, setdegree] = useState([]);
  const [income_source, setincome_source] = useState([]);
  const [loan_type, setloan_type] = useState([]);
  const [bank, setbank] = useState([]);
  const [social_plateform, setsocial_plateform] = useState([]);


  const [professionCategories, setProfessionCategories] = useState([]);
  const [professionSubCategories, setProfessionSubCategories] = useState([]);
  const [designation, setDesignation] = useState([]);
  const [, setLoading] = useState("");


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
          campaign: getLookupValue('Campaign', initialData.campaign) || "",
          source: getLookupValue('Source', initialData.source) || "",
          subSource: getLookupValue('SubSource', initialData.subSource) || "",
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
            pincode: getId(initialData.personalAddress?.pincode),
            pinCode: getId(initialData.personalAddress?.pinCode || initialData.personalAddress?.pincode),
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
            pincode: getId(initialData.correspondenceAddress?.pincode),
            pinCode: getId(initialData.correspondenceAddress?.pinCode || initialData.correspondenceAddress?.pincode),
          },
          // Ensure array fields exist
          phones: initialData.phones?.length ? initialData.phones : prev.phones,
          emails: initialData.emails?.length ? initialData.emails : prev.emails,
          educations: initialData.educations?.length ? initialData.educations.map(e => ({
            ...e,
            education: getId(e.education),
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
  }, [isOpen, initialData?._id]);

  // Fetch Default Country Code
  const handleInputChange = useCallback((field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: typeof value === 'function' ? value(prev[field]) : value,
    }));
  }, []);

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
    if (!isOpen) {
      prevCategoryRef.current = null;
      return;
    }

    const categoryId = (formData.professionCategory && typeof formData.professionCategory === 'object')
      ? formData.professionCategory._id
      : formData.professionCategory;

    // Only fetch and reset if the category actually changed from previous value
    if (categoryId !== prevCategoryRef.current) {
      const isInitialLoad = prevCategoryRef.current === null;
      const fetchSubCats = async () => {
        if (!categoryId) {
          setProfessionSubCategories([]);
          setFormData(prev => ({ ...prev, professionSubCategory: "", designation: "" }));
          return;
        }
        const data = await fetchLookup("ProfessionalSubCategory", categoryId);
        setProfessionSubCategories(data || []);
        
        // Reset sub-category and designation ONLY if it's a real user action (not initial load)
        if (!isInitialLoad) {
          setFormData(prev => ({ ...prev, professionSubCategory: "", designation: "" }));
        }
      };
      fetchSubCats();
      prevCategoryRef.current = categoryId;
    }
  }, [formData.professionCategory, isOpen]);

  // Fetch Designations when Sub-Category changes
  useEffect(() => {
    if (!isOpen) {
      prevSubCategoryRef.current = null;
      return;
    }

    const subCategoryId = (formData.professionSubCategory && typeof formData.professionSubCategory === 'object')
      ? formData.professionSubCategory._id
      : formData.professionSubCategory;

    // Only fetch and reset if the subcategory actually changed from previous value
    if (subCategoryId !== prevSubCategoryRef.current) {
      const isInitialLoad = prevSubCategoryRef.current === null;
      const fetchDesigs = async () => {
        if (!subCategoryId) {
          setDesignation([]);
          setFormData(prev => ({ ...prev, designation: "" }));
          return;
        }
        const data = await fetchLookup("ProfessionalDesignation", subCategoryId);
        setDesignation(data || []);

        // Reset designation ONLY if it's a real user action (not initial load)
        if (!isInitialLoad) {
          setFormData(prev => ({ ...prev, designation: "" }));
        }
      };
      fetchDesigs();
      prevSubCategoryRef.current = subCategoryId;
    }
  }, [formData.professionSubCategory, isOpen]);


  // --- Field Rules Integration ---
  const { validate, validateAsync } = useFieldRules();
  const [hiddenFields, setHiddenFields] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Passive Validation (Visibility Check)
  useEffect(() => {
    if (validate) {
      const result = validate("contact", formData, { context: "view" });
      setHiddenFields(result.hiddenFields || []);
    }
  }, [formData, validate]);



  const handleSave = async () => {
    setIsSaving(true);
    const toastId = toast.loading(mode === "edit" ? "Updating contact..." : "Adding contact...");

    // Validation: Mandatory Fields
    if (!formData.name || !formData.name.trim()) {
      toast.error("First name is required", { id: toastId });
      setIsSaving(false);
      return;
    }

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

      // --- DATA NORMALIZATION FOR BACKEND ---
      let finalFormData = { ...formData };

      // Resolve String Names to Lookup IDs for Campaign/Source/Sub-Source
      if (finalFormData.source) {
        finalFormData.source = getLookupId('Source', finalFormData.source) || finalFormData.source;
      }
      if (finalFormData.subSource) {
        finalFormData.subSource = getLookupId('SubSource', finalFormData.subSource) || finalFormData.subSource;
      }
      if (finalFormData.campaign) {
        finalFormData.campaign = getLookupId('Campaign', finalFormData.campaign) || finalFormData.campaign;
      }

      // 🛡️ Senior Implementation: Recursive Reference Normalizer & Cleaner
      const deepNormalize = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return obj
            .map(item => deepNormalize(item))
            .filter(item => {
              if (!item) return false;
              if (typeof item === 'object') {
                // Filter out empty items in arrays (e.g., phones with no number)
                const values = Object.values(item).filter(v => v !== null && v !== "" && v !== undefined && (Array.isArray(v) ? v.length > 0 : true));
                return values.length > 0;
              }
              return true;
            });
        }

        const schemaContainers = [
          "phones", "emails", "personalAddress", "correspondenceAddress",
          "educations", "loans", "socialMedia", "incomes", "documents", "assignment"
        ];
        const referenceArrays = ["team", "teams", "tags", "groups", "addOn"];

        const normalized = { ...obj };

        for (const key in normalized) {
          const value = normalized[key];
          if (value === null || value === undefined) continue;

          if (Array.isArray(value)) {
            if (referenceArrays.includes(key)) {
              normalized[key] = value
                .map(i => (i && typeof i === 'object' && (i._id || i.id)) ? (i._id || i.id) : i)
                .filter(Boolean);
            } else {
              normalized[key] = deepNormalize(value);
            }
            continue;
          }

          if (schemaContainers.includes(key)) {
            normalized[key] = deepNormalize(value);
            continue;
          }

          if (typeof value === 'object' && (value._id || value.id)) {
            normalized[key] = value._id || value.id;
          }
          else if (typeof value === 'object') {
            normalized[key] = deepNormalize(value);
          }
        }
        return normalized;
      };

      // Strip system fields that backend Joi might reject
      const fieldsToStrip = ["_id", "id", "__v", "createdAt", "updatedAt", "fullName", "matchedEntityType"];
      fieldsToStrip.forEach(field => delete finalFormData[field]);

      // Apply deep normalization to flatten lookup objects into IDs and clean empty data
      finalFormData = deepNormalize(finalFormData);

      // 🚀 Sync Top-level Assignment to Nested Object for Joi compatibility
      if (finalFormData.team && (!finalFormData.assignment || !finalFormData.assignment.team || finalFormData.assignment.team.length === 0)) {
        if (!finalFormData.assignment) finalFormData.assignment = {};
        finalFormData.assignment.team = Array.isArray(finalFormData.team) ? finalFormData.team : [finalFormData.team];
      }
      if (finalFormData.owner && (!finalFormData.assignment || !finalFormData.assignment.assignedTo)) {
        if (!finalFormData.assignment) finalFormData.assignment = {};
        finalFormData.assignment.assignedTo = finalFormData.owner;
      }

      // Final cleanup for documents (ensure unitNumber mapping is consistent)
      if (finalFormData.documents && finalFormData.documents.length > 0) {
        finalFormData.documents = await Promise.all(finalFormData.documents.map(async (doc) => {
          // Flatten doc refs manually if needed (as extra safety)
          if (doc.documentName && typeof doc.documentName === 'object') doc.documentName = doc.documentName._id || doc.documentName.id;
          if (doc.documentType && typeof doc.documentType === 'object') doc.documentType = doc.documentType._id || doc.documentType.id;
          
          if (doc.documentPicture && (doc.documentPicture instanceof File)) {
            try {
              const uploadData = new FormData();
              uploadData.append('file', doc.documentPicture);
              const res = await api.post('/upload', uploadData, {
                headers: { 'Content-Type': undefined }
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
        throw new Error(response.data?.message || "Failed to save contact");
      }
    } catch (error) {
      console.error("Error saving contact:", error);
      // 🛡️ Senior Implementation: Extract specific Joi validation errors if available
      const backendMessage = error.response?.data?.message;
      const details = error.response?.data?.details;
      
      let errorMessage = backendMessage || error.message || "An unexpected error occurred";
      
      // If Joi validation failed, the details might contain the specific field
      if (details && Array.isArray(details) && details.length > 0) {
        errorMessage = `Validation Error: ${details[0].message}`;
      } else if (backendMessage && backendMessage.includes('validation')) {
        errorMessage = `Schema Error: ${backendMessage}`;
      }
      toast.error(errorMessage, { id: toastId, duration: 5000 });
      setIsSaving(false);
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
    if (!data) return;

    setFormData(prev => ({
      ...prev,
      title: typeof data.title === 'object' ? data.title?._id : data.title,
      name: data.firstName || data.name || prev.name,
      surname: data.lastName || data.surname || prev.surname,
      company: data.company || prev.company,
      phones: data.phones && data.phones.length > 0 ? data.phones : prev.phones,
      emails: data.emails && data.emails.length > 0 ? data.emails : prev.emails,
    }));

    toast.success("Form updated with suggested contact details");
  };

  // Styles (Enterprise Compact & Themed)
  const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(6px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  };

  const modalStyle = {
    width: "95%",
    maxWidth: showSuggestions ? "1040px" : "800px",
    height: "min(88vh, 850px)",
    minHeight: "480px",
    backgroundColor: isDark ? "#0f172a" : "#fff",
    borderRadius: "16px",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
    boxShadow: isDark
      ? "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.08)"
      : "0 25px 50px -12px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(0,0,0,0.05)",
    display: "flex",
    overflow: "hidden",
    position: "relative",
    transition: "max-width 0.25s ease",
  };

  const leftPaneStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    borderRight: showSuggestions
      ? (isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0")
      : "none",
  };

  const rightPaneStyle = {
    width: "280px",
    backgroundColor: isDark ? "rgba(15, 23, 42, 0.6)" : "#f8fafc",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  };

  const tabStyle = (active) => ({
    padding: "6px 16px",
    borderRadius: "8px",
    fontSize: "0.78rem",
    fontWeight: active ? 800 : 600,
    cursor: "pointer",
    transition: "all 0.2s",
    border: "none",
    outline: "none",
    background: active ? (isDark ? "rgba(255, 255, 255, 0.12)" : "#fff") : "transparent",
    color: active ? (isDark ? "#fff" : "#0f172a") : (isDark ? "var(--text-muted)" : "#64748b"),
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
    display: "flex",
    alignItems: "center",
  });

  const buttonStyle = {
    cancel: {
      padding: "8px 18px",
      borderRadius: "8px",
      border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #e2e8f0",
      background: isDark ? "transparent" : "#fff",
      color: isDark ? "var(--text-muted)" : "#64748b",
      fontWeight: 700,
      fontSize: "0.8rem",
      cursor: "pointer",
      transition: "all 0.2s",
    },
    secondary: {
      padding: "8px 18px",
      borderRadius: "8px",
      border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1",
      background: isDark ? "rgba(255, 255, 255, 0.04)" : "#fff",
      color: isDark ? "var(--text-main)" : "#334155",
      fontWeight: 700,
      fontSize: "0.8rem",
      cursor: "pointer",
      transition: "all 0.2s",
    },
    primary: {
      padding: "8px 20px",
      borderRadius: "8px",
      border: "none",
      background: "linear-gradient(135deg, #3b82f6, #4f46e5)",
      color: "#fff",
      fontWeight: 700,
      fontSize: "0.8rem",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
      display: "flex",
      alignItems: "center",
      transition: "all 0.2s",
    },
    success: {
      padding: "8px 22px",
      borderRadius: "8px",
      border: "none",
      background: "linear-gradient(135deg, #10b981, #059669)",
      color: "#fff",
      fontWeight: 800,
      fontSize: "0.82rem",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
      display: "flex",
      alignItems: "center",
      transition: "all 0.2s",
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
  }, [formData.name, formData.phones, formData.emails, formData]);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      {/* Invisible Scrollbar Rule */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
          width: 0px !important;
          height: 0px !important;
        }
        .no-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
      `}</style>

      <div style={modalStyle}>
        {/* Left Pane - Form Content */}
        <div style={leftPaneStyle}>
          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
              background: isDark ? "rgba(15, 23, 42, 0.8)" : "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                }}
              >
                <i className={`fas ${mode === "edit" ? "fa-user-pen" : "fa-user-plus"}`} style={{ fontSize: "15px" }}></i>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: isDark ? "var(--text-main)" : "#0f172a",
                      letterSpacing: "0.2px",
                    }}
                  >
                    {mode === "edit" ? "Update Contact" : "Add New Contact"}
                  </h2>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "6px",
                      background: mode === "edit" ? "#e0e7ff" : "#ecfdf5",
                      color: mode === "edit" ? "#4338ca" : "#065f46",
                    }}
                  >
                    {mode === "edit" ? "EDIT MODE" : "NEW RECORD"}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginTop: '3px' }}>
                  <i className="far fa-clock" style={{ color: '#3b82f6', fontSize: '11px' }}></i>
                  <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span style={{ opacity: 0.4 }}>•</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Required Only Switch */}
              <button
                type="button"
                onClick={() => {
                  setShowOnlyRequired((prev) => !prev);
                  if (!showOnlyRequired) setCurrentTab("basic");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "20px",
                  border: showOnlyRequired
                    ? "1px solid #3b82f6"
                    : (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1"),
                  background: showOnlyRequired ? "rgba(59, 130, 246, 0.12)" : "transparent",
                  color: showOnlyRequired ? "#3b82f6" : (isDark ? "var(--text-muted)" : "#64748b"),
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <i className={`fas ${showOnlyRequired ? "fa-check-circle" : "fa-circle"}`} style={{ fontSize: "10px" }}></i>
                <span>Required Only</span>
              </button>

              {/* Duplicate Badge */}
              {similarContacts.length > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    background: isBlocked ? "#fee2e2" : "#fef3c7",
                    color: isBlocked ? "#b91c1c" : "#92400e",
                    border: isBlocked ? "1px solid #fca5a5" : "1px solid #fde68a",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                  }}
                >
                  <i className={`fas ${isBlocked ? "fa-ban" : "fa-exclamation-triangle"}`}></i>
                  {similarContacts.length} Duplicate{similarContacts.length > 1 ? "s" : ""}
                </span>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "none",
                  background: isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9",
                  color: isDark ? "var(--text-muted)" : "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                title="Close Modal"
              >
                <i className="fas fa-times" style={{ fontSize: "14px" }}></i>
              </button>
            </div>
          </div>

          {/* Tabs */}
          {!showOnlyRequired && (
            <div
              style={{
                padding: "10px 20px 0 20px",
                background: isDark ? "rgba(15, 23, 42, 0.4)" : "#fff",
                borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #f1f5f9",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  gap: "4px",
                  padding: "3px",
                  background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9",
                  borderRadius: "10px",
                  border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCurrentTab("basic")}
                  style={tabStyle(currentTab === "basic")}
                >
                  <i className="fas fa-id-card" style={{ marginRight: "6px" }}></i> Basic & Contact Info
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab("personal")}
                  style={tabStyle(currentTab === "personal")}
                >
                  <i className="fas fa-user-gear" style={{ marginRight: "6px" }}></i> Personal & Bio Info
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div
            className="no-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              padding: "16px 20px 24px 20px",
              overflowY: "auto",
              background: isDark ? "rgba(15, 23, 42, 0.3)" : "#f8fafc",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {currentTab === "basic" ? (
              <ContactBasicSection
                formData={formData}
                handleInputChange={handleInputChange}
                title={title}
                setTitle={setTitle}
                setLoading={setLoading}
                countrycode={countrycode}
                setCountrycode={setCountrycode}
                mobileTypes={mobileTypes}
                emailTypes={emailTypes}
                showOnlyRequired={showOnlyRequired}
                hiddenFields={hiddenFields}
                currentAddressType={currentAddressType}
                setCurrentAddressType={setCurrentAddressType}
                leadMasterFields={leadMasterFields}
                customSelectStyle={customSelectStyle}
                customSelectStyleDisabled={customSelectStyleDisabled}
                renderValue={renderValue}
                AddressDetailsForm={AddressDetailsForm}
                fetchLookup={fetchLookup}
                teams={teams}
                users={users}
              />
            ) : currentTab === "personal" ? (
              <ContactPersonalSection
                formData={formData}
                handleInputChange={handleInputChange}
                social_plateform={social_plateform}
                setsocial_plateform={setsocial_plateform}
                fetchLookup={fetchLookup}
                setLoading={setLoading}
                allCompanies={allCompanies}
                companyList={companyList}
                setCompanyList={setCompanyList}
                showCompanyDropdown={showCompanyDropdown}
                setShowCompanyDropdown={setShowCompanyDropdown}
                companySearch={companySearch}
                setCompanySearch={setCompanySearch}
                renderValue={renderValue}
                edu_level={edu_level}
                setedu_level={setedu_level}
                degree={degree}
                setdegree={setdegree}
                income_source={income_source}
                setincome_source={setincome_source}
                loan_type={loan_type}
                setloan_type={setloan_type}
                bank={bank}
                setbank={setbank}
                customSelectStyle={customSelectStyle}
                customSelectStyleDisabled={customSelectStyleDisabled}
                showOnlyRequired={showOnlyRequired}
                professionCategories={professionCategories}
                setProfessionCategories={setProfessionCategories}
                professionSubCategories={professionSubCategories}
                designation={designation}
              />
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
              background: isDark ? "rgba(15, 23, 42, 0.8)" : "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <button onClick={onClose} style={buttonStyle.cancel}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: "10px" }}>
              {/* Previous Button - Hide on first tab */}
              {currentTab !== "basic" && (
                <button onClick={handlePrev} style={buttonStyle.secondary}>
                  <i className="fas fa-arrow-left" style={{ marginRight: "6px" }}></i> Previous
                </button>
              )}

              {/* Next/Save Button */}
              {currentTab !== "personal" && !showOnlyRequired ? (
                <button onClick={handleNext} style={buttonStyle.primary}>
                  Next <i className="fas fa-arrow-right" style={{ marginLeft: "6px" }}></i>
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  style={isBlocked || isSaving ? { ...buttonStyle.success, opacity: 0.6, cursor: "not-allowed" } : buttonStyle.success}
                  disabled={isBlocked || isSaving}
                >
                  {isSaving ? (
                    <>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: "6px" }}></i> Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check" style={{ marginRight: "6px" }}></i> {mode === "edit" ? "Update Contact" : "Save Contact"}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Pane */}
        {
          showSuggestions && (
            <div style={rightPaneStyle}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="fas fa-clone" style={{ color: isBlocked ? "#ef4444" : "#f59e0b", fontSize: "14px" }}></i>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, color: isDark ? "var(--text-main)" : "#0f172a" }}>
                    Duplicate Matches
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "10px",
                    background: isBlocked ? "#fee2e2" : "#fef3c7",
                    color: isBlocked ? "#b91c1c" : "#92400e",
                  }}
                >
                  {similarContacts.length} Found
                </span>
              </div>
              <div
                className="no-scrollbar"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                <DuplicateResults
                  contacts={similarContacts}
                  onUpdate={handlePopulateForm}
                  isBlocked={isBlocked}
                  getLookupValue={getLookupValue}
                  isDark={isDark}
                />
              </div>
            </div>
          )
        }
      </div>
    </div >
  );
};


export default AddContactModal;
