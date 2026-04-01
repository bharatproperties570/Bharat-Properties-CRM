import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

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
const DuplicateResults = ({ contacts, onUpdate, isBlocked, getLookupValue }) => {
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
              {getLookupValue(null, contact.title) || contact.title?.lookup_value || contact.title} {contact.firstName || contact.name} {contact.lastName || contact.surname}
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
  const { leadMasterFields, getLookupId, getLookupValue } =
    usePropertyConfig();
  const {
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
  const [similarContacts, setSimilarContacts] = useState([]);


  // Style constants moved or removed

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
  const handleInputChange = useCallback((field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
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
  }, [isOpen, initialData?._id, initialData?.professionCategory, initialData?.professionSubCategory, initialData]);

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
  }, [formData.professionCategory, isOpen, formData.professionSubCategory]);

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
      const normalizeRefs = (obj, parentKey = null) => {
        if (!obj || typeof obj !== 'object') return obj;
        const result = Array.isArray(obj) ? [...obj] : { ...obj };

        // Fields that should REMAIN as objects (not converted to IDs)
        const embeddedFields = ["phones", "emails", "personalAddress", "correspondenceAddress", "educations", "loans", "socialMedia", "incomes", "documents"];

        if (Array.isArray(result)) {
          // If we are INSIDE an embedded field (like phones array), don't normalize the items to IDs
          if (embeddedFields.includes(parentKey)) {
            return result.map(item => normalizeRefs(item));
          }
          return result.map(item => (item && typeof item === 'object' && item._id) ? item._id : item);
        }

        for (const key in result) {
          if (result[key] && typeof result[key] === 'object') {
            if (embeddedFields.includes(key)) {
              // Recurse into embedded fields without converting to ID
              result[key] = normalizeRefs(result[key], key);
            } else if (result[key]._id) {
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
        countryCode: 'Country-Code',
        campaign: 'Campaign',
        source: 'Source',
        subSource: 'SubSource',
        professionCategory: 'ProfessionalCategory',
        professionSubCategory: 'ProfessionalSubCategory',
        designation: 'ProfessionalDesignation'
      };


      Object.entries(lookupMapping).forEach(([field, type]) => {
        if (finalFormData[field]) {
          if (typeof finalFormData[field] === 'string') {
            const id = getLookupId(type, finalFormData[field]);
            if (id) finalFormData[field] = id;
          } else if (typeof finalFormData[field] === 'object') {
            finalFormData[field] = finalFormData[field]._id || finalFormData[field].id || null;
          }
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
  }, [formData.name, formData.phones, formData.emails, formData]);

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
                  getLookupValue={getLookupValue}
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
