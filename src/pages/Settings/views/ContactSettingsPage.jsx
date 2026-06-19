import { useEffect, useState, useCallback } from "react";
import Toast from "../../../components/Toast";
import { api } from "../../../utils/api";
import Swal from "sweetalert2";
import { generateCSV, downloadFile } from "../../../utils/dataManagementUtils";

// ---------------- CONFIGURATION ----------------
const TABS = [
  { id: "Professional", label: "Professional", type: "hierarchy" },
  { id: "Document", label: "Document", type: "hierarchy" },
  { id: "Education", label: "Education", type: "hierarchy" }, // NEW: Education Hierarchy
  { id: "Other", label: "Other", type: "flat" },
];

const HIERARCHY_CONFIG = {
  Professional: [
    { title: "Category", lookup_type: "ProfessionalCategory" },
    { title: "Sub Category", lookup_type: "ProfessionalSubCategory" },
    { title: "Designation", lookup_type: "ProfessionalDesignation" },
  ],
  Document: [ // Document Category -> Document Type
    { title: "Document Category", lookup_type: "Document-Category" },
    { title: "Document Type", lookup_type: "Document-Type" },
  ],
  Education: [ // Education Level -> Degree
    { title: "Education Level", lookup_type: "Education-Level" },
    { title: "Degree", lookup_type: "Degree" },
  ],
};

const FLAT_CONFIG = {
  Other: [ // Grouping all other tabs here as requested or implied by "Other"
    { title: "Title", lookup_type: "Title" },
    { title: "Country Code", lookup_type: "Country-Code" },
    // { title: "Source", lookup_type: "Source" }, // REMOVED: Now part of Campaign Hierarchy
    // Education Level & Degree moved to Hierarchy
    { title: "Income Source", lookup_type: "Income-Source" },
    { title: "Loan Type", lookup_type: "Loan Type" },
    { title: "Bank", lookup_type: "Bank" },
    { title: "Social Platform", lookup_type: "Social Plateform" },
  ]
};

// ---------------- SUB-COMPONENTS ----------------

// 1. Config Column (for Hierarchy View)
const ConfigColumn = ({ title, items, selectedItem, onSelect, onAdd, onEdit, onDelete, onDownload, isLoading }) => (
  <div
    style={{
      minWidth: "280px",
      // width: "33%", // REMOVED fixed width
      borderRight: "1px solid var(--border-color)",
      display: "flex",
      flexDirection: "column",
      background: 'var(--bg-light)',
      flexShrink: 0,
    }}
  >
    <div
      style={{
        padding: "16px",
        fontWeight: 600,
        color: 'var(--text-muted)',
        fontSize: "0.85rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: 'var(--bg-light)'
      }}
    >
      {title}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {items && items.length > 0 && (
          <button
            onClick={onDownload}
            disabled={isLoading}
            style={{
              border: "none",
              background: "transparent",
              color: "#10b981",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.9rem"
            }}
            title="Download this list"
          >
            <i className="fas fa-download"></i>
          </button>
        )}
        <button
          onClick={onAdd}
          disabled={isLoading}
          style={{
            border: "none",
            background: 'var(--border-color)',
            color: 'var(--text-muted)',
            borderRadius: "4px",
            width: "24px",
            height: "24px",
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i className="fas fa-plus" style={{ fontSize: "0.7rem" }}></i>
        </button>
      </div>
    </div>

    <div style={{ overflowY: "auto", flex: 1 }}>
      {isLoading ? (
        <div style={{ padding: "20px", textAlign: "center", color: 'var(--text-muted)' }}>Loading...</div>
      ) : items.length > 0 ? (
        items.map((item) => {
          const isSelected = selectedItem === item._id;
          return (
            <div
              key={item._id}
              onClick={() => onSelect(item)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? "#2563eb" : 'var(--text-main)',
                background: isSelected ? "#eff6ff" : "transparent",
                borderLeft: isSelected
                  ? "4px solid #2563eb"
                  : "4px solid transparent",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "all 0.2s"
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', maxWidth: "200px" }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.lookup_value}</span>
                {/* Show Type if mixed column (e.g. Location vs Tehsil) */}
                {["Location", "Tehsil"].includes(item.lookup_type) && (
                  <span style={{ fontSize: "0.75rem", color: 'var(--text-muted)', marginTop: "2px" }}>
                    {item.lookup_type}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", opacity: isSelected ? 1 : 0.4 }}>
                <i
                  className="fas fa-edit"
                  style={{ cursor: "pointer", color: 'var(--text-muted)', fontSize: "0.8rem" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                ></i>
                <i
                  className="fas fa-trash"
                  style={{ cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item);
                  }}
                ></i>
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ padding: "40px 20px", textAlign: "center", color: 'var(--border-color)', fontStyle: "italic" }}>
          No items
        </div>
      )}
    </div>
  </div>
);

const ContactSettingsPage = () => {
  const [activeTab, setActiveTab] = useState("Professional");
  const [notification, setNotification] = useState({ show: false, message: "", type: "success" });

  // HIERARCHY ID STATE
  const [hierarchyData, setHierarchyData] = useState({}); // { 0: [], 1: [] }
  const [selectedPath, setSelectedPath] = useState([]); // [itemLvl0, itemLvl1]

  // FLAT ID STATE
  const [flatActiveSection, setFlatActiveSection] = useState(null);
  const [flatItems, setFlatItems] = useState([]);

  // Address Workspace States
  const [countries, setCountries] = useState([]);
  const [addressStatesList, setAddressStatesList] = useState([]);
  const [addressCitiesList, setAddressCitiesList] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [selectedStateId, setSelectedStateId] = useState("");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedPostOfficeId, setSelectedPostOfficeId] = useState("unassigned");
  const [activeChildTab, setActiveChildTab] = useState("Location");

  const [locationsList, setLocationsList] = useState([]);
  const [tehsilsList, setTehsilsList] = useState([]);
  const [postOfficesList, setPostOfficesList] = useState([]);
  const [pincodesList, setPincodesList] = useState([]);

  const [childLoading, setChildLoading] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  const showToast = (message, type = "success") => {
    setNotification({ show: true, message, type });
  };

  // Workspace API Fetch Functions
  const fetchCountries = async () => {
    try {
      const res = await api.get("/lookups?lookup_type=Country");
      if (res.data.status === "success") {
        let list = res.data.data;
        if (list.length === 0) {
          const seedRes = await api.post("/lookups", { lookup_type: "Country", lookup_value: "India" });
          if (seedRes.data.status === "success") {
            list = [seedRes.data.data];
          }
        }
        setCountries(list);
        if (list.length > 0 && !selectedCountryId) {
          setSelectedCountryId(list[0]._id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStatesList = async () => {
    try {
      const res = await api.get("/lookups?lookup_type=State");
      if (res.data.status === "success") {
        setAddressStatesList(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCitiesList = async (stateId) => {
    try {
      const res = await api.get(`/lookups?lookup_type=City&parent_lookup_id=${stateId}`);
      if (res.data.status === "success") {
        setAddressCitiesList(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCityChildrenList = async (cityId) => {
    try {
      setChildLoading(true);
      const res = await api.get(`/lookups?parent_lookup_id=${cityId}`);
      if (res.data.status === "success") {
        const fetched = res.data.data;
        setLocationsList(fetched.filter(item => item.lookup_type === "Location"));
        setTehsilsList(fetched.filter(item => item.lookup_type === "Tehsil"));
        setPostOfficesList(fetched.filter(item => item.lookup_type === "PostOffice"));
        
        if (selectedPostOfficeId === "unassigned") {
          setPincodesList(fetched.filter(item => item.lookup_type === "Pincode"));
        } else {
          fetchPincodesForPO(selectedPostOfficeId);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChildLoading(false);
    }
  };

  const fetchPincodesForPO = async (poId) => {
    if (poId === "unassigned") {
      if (selectedCityId) {
        const res = await api.get(`/lookups?parent_lookup_id=${selectedCityId}`);
        if (res.data.status === "success") {
          setPincodesList(res.data.data.filter(item => item.lookup_type === "Pincode"));
        }
      }
      return;
    }
    try {
      setChildLoading(true);
      const res = await api.get(`/lookups?parent_lookup_id=${poId}`);
      if (res.data.status === "success") {
        setPincodesList(res.data.data.filter(item => item.lookup_type === "Pincode"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChildLoading(false);
    }
  };

  const refreshAddressWorkspace = () => {
    fetchCountries();
    fetchStatesList();
    if (selectedStateId) fetchCitiesList(selectedStateId);
    if (selectedCityId) fetchCityChildrenList(selectedCityId);
  };

  // Drag & Drop confirmation dialogues
  const confirmMove = async (source, target) => {
    const result = await Swal.fire({
      title: 'Confirm Hierarchy Adjustment',
      text: `Move "${source.lookup_value}" (${source.lookup_type}) under parent "${target.lookup_value}" (${target.lookup_type})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Move',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const res = await api.post('/lookups/merge-or-move', {
        action: 'move',
        sourceId: source._id,
        targetId: target._id
      });
      if (res.data.status === 'success') {
        showToast(`Successfully moved "${source.lookup_value}" under "${target.lookup_value}"`);
        refreshAddressWorkspace();
      } else {
        showToast(res.data.message || 'Move operation failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error occurred during move', 'error');
    }
  };

  const confirmMerge = async (source, target) => {
    const result = await Swal.fire({
      title: 'Confirm Duplicate Merge',
      html: `
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; color: #b45309; font-size: 0.85rem; text-align: left; margin-bottom: 15px;">
          <strong>⚠️ WARNING:</strong> Merging is permanent! This will merge <strong>"${source.lookup_value}"</strong> into <strong>"${target.lookup_value}"</strong>. All contacts, leads, properties, and child lookups will be re-linked before deletion.
        </div>
        <p>Merge duplicate lookup <strong>"${source.lookup_value}"</strong> into <strong>"${target.lookup_value}"</strong>?</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Yes, Merge'
    });

    if (!result.isConfirmed) return;

    try {
      const res = await api.post('/lookups/merge-or-move', {
        action: 'merge',
        sourceId: source._id,
        targetId: target._id
      });
      if (res.data.status === 'success') {
        showToast(res.data.message || 'Merged successfully');
        refreshAddressWorkspace();
      } else {
        showToast(res.data.message || 'Merge operation failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error occurred during merge', 'error');
    }
  };

  // Drag & Drop HTML5 handlers
  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item._id);
  };

  const handleDragOver = (e, targetItem, targetType) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (targetItem._id !== draggedItem._id) {
      setDragOverItemId(targetItem._id);
    }
  };

  const handleDragLeave = () => {
    setDragOverItemId(null);
  };

  const handleDrop = async (e, targetItem, targetType) => {
    e.preventDefault();
    setDragOverItemId(null);
    if (!draggedItem) return;

    const sourceId = draggedItem._id;
    const sourceType = draggedItem.lookup_type;
    const targetId = targetItem._id;

    if (sourceType === targetType) {
      if (sourceId === targetId) return;
      confirmMerge(draggedItem, targetItem);
      return;
    }

    if (sourceType === 'Location' && targetType === 'Tehsil') {
      confirmMerge(draggedItem, targetItem);
      return;
    }

    let isValidMove = false;
    if (sourceType === 'State' && targetType === 'Country') isValidMove = true;
    else if (sourceType === 'City' && targetType === 'State') isValidMove = true;
    else if (['Location', 'Tehsil', 'PostOffice'].includes(sourceType) && targetType === 'City') isValidMove = true;
    else if (sourceType === 'Pincode' && targetType === 'PostOffice') isValidMove = true;

    if (isValidMove) {
      confirmMove(draggedItem, targetItem);
    } else {
      showToast(`Invalid move: Cannot drop ${sourceType} onto ${targetType}`, 'error');
    }
  };

  // State workspace navigation handlers
  const handleStateWorkspaceClick = (stateId) => {
    setSelectedStateId(stateId);
    setSelectedCityId("");
    setAddressCitiesList([]);
    setLocationsList([]);
    setTehsilsList([]);
    setPostOfficesList([]);
    setPincodesList([]);
    if (stateId) {
      fetchCitiesList(stateId);
    }
  };

  const handleCityWorkspaceClick = (cityId) => {
    setSelectedCityId(cityId);
    setSelectedPostOfficeId("unassigned");
    setLocationsList([]);
    setTehsilsList([]);
    setPostOfficesList([]);
    setPincodesList([]);
    if (cityId) {
      fetchCityChildrenList(cityId);
    }
  };

  // Watchers to trigger load
  useEffect(() => {
    if (activeTab === "Address") {
      fetchCountries();
      fetchStatesList();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "Address" && selectedCityId && activeChildTab === "Pincode") {
      fetchPincodesForPO(selectedPostOfficeId);
    }
  }, [selectedPostOfficeId, activeChildTab]);

  // ---------------- EXPORT HANDLERS ----------------
  const handleExportHierarchy = (items, title) => {
    if (!items || items.length === 0) {
      showToast("No items to export", "warning");
      return;
    }

    const dataToExport = items.map(item => ({
      ID: item._id || 'N/A',
      Name: item.lookup_value || 'N/A',
      Code: item.code || ''
    }));

    const csvContent = generateCSV(dataToExport);
    const fileName = `contact_${activeTab.toLowerCase()}_${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(csvContent, fileName);
    showToast("Export successful!");
  };

  const handleExportFlat = () => {
    if (!flatItems || flatItems.length === 0) {
      showToast("No items to export", "warning");
      return;
    }

    const dataToExport = flatItems.map(item => ({
      ID: item._id || 'N/A',
      Name: item.lookup_value || 'N/A',
      Code: item.code || ''
    }));

    const csvContent = generateCSV(dataToExport);
    const fileName = `contact_${activeTab.toLowerCase()}_${flatActiveSection.title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(csvContent, fileName);
    showToast("Export successful!");
  };

  // ---------------- API CALLS ----------------
  const fetchHierarchyLevel = async (tabId, levelIndex, parentId = null) => {
    const levels = HIERARCHY_CONFIG[tabId];
    if (!levels[levelIndex]) return;

    try {
      const params = {
        parent_lookup_id: parentId,
        page: 1, limit: 1000
      };

      // Support for mixed_types by sending comma-separated values
      if (levels[levelIndex].mixed_types) {
        params.lookup_type = levels[levelIndex].mixed_types.join(',');
      } else {
        params.lookup_type = levels[levelIndex].lookup_type;
      }

      const res = await api.get("/lookups", { params });
      if (res.data.status === "success") {
        setHierarchyData(prev => ({
          ...prev,
          [levelIndex]: res.data.data
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFlatItems = useCallback(async () => {
    if (!flatActiveSection) return;
    try {
      const res = await api.get("/lookups", {
        params: {
          lookup_type: flatActiveSection.lookup_type,
          page: 1, limit: 1000
        }
      });
      if (res.data.status === "success") {
        setFlatItems(res.data.data);
      }
    } catch (err) { console.error(err); }
  }, [flatActiveSection]);

  // ---------------- EFFECTS ----------------
  useEffect(() => {
    const tabConfig = TABS.find(t => t.id === activeTab);
    if (tabConfig.type === "hierarchy") {
      setHierarchyData({});
      setSelectedPath([]);
      fetchHierarchyLevel(activeTab, 0); // Fetch root level
    } else {
      const sections = FLAT_CONFIG[activeTab];
      if (sections && sections.length > 0) {
        setFlatActiveSection(sections[0]);
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (flatActiveSection) {
      fetchFlatItems();
    }
  }, [flatActiveSection, fetchFlatItems]);

  // ---------------- CUSTOM ADD/EDIT HANDLERS ----------------

  // Generic Add Handling
  const handleAdd = async (section, parentId = null, refreshCallback) => {
    console.log("Adding to section:", section);

    let inputValue = null;
    let inputCode = null;

    if (section.lookup_type === "Country-Code") {
      // Special Modal for Country Code
      const { value: formValues } = await Swal.fire({
        title: 'Add Country Code',
        html:
          '<input id="swal-input1" class="swal2-input" placeholder="Country Name + Emoji (e.g 🇮🇳 India)">' +
          '<input id="swal-input2" class="swal2-input" placeholder="Numeric Code (e.g 91)">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Add",
        preConfirm: () => {
          const name = document.getElementById('swal-input1').value;
          const code = document.getElementById('swal-input2').value;
          if (!name || !code) return Swal.showValidationMessage('Both Name and Code are required');
          return { name, code };
        }
      });
      if (formValues) {
        inputValue = formValues.name;
        inputCode = formValues.code;
      }
    } else if (section.mixed_types) {
      // Mixed Types Modal (Radio Selection)
      const { value: formValues } = await Swal.fire({
        title: `Add ${section.title}`,
        html: `
          <input id="swal-input1" class="swal2-input" placeholder="Enter Name">
          <div style="margin-top: 15px; text-align: left; display: flex; justify-content: center; gap: 20px;">
            ${section.mixed_types.map(type => `
              <label style="cursor: pointer;">
                <input type="radio" name="swal-radio" value="${type}" ${type === section.lookup_type ? 'checked' : ''}>
                ${type}
              </label>
            `).join('')}
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Add",
        preConfirm: () => {
          const name = document.getElementById('swal-input1').value;
          const type = document.querySelector('input[name="swal-radio"]:checked')?.value;
          if (!name) return Swal.showValidationMessage('Name is required');
          if (!type) return Swal.showValidationMessage('Please select a type');
          return { name, type };
        }
      });

      if (formValues) {
        inputValue = formValues.name;
        // Override the section.lookup_type with the selected type for this item
        section = { ...section, lookup_type: formValues.type };
      }

    } else {
      // Standard Modal
      const { value: name } = await Swal.fire({
        title: `Add ${section.title}`,
        input: "text",
        inputPlaceholder: `Enter ${section.title} Name`,
        showCancelButton: true,
        confirmButtonText: "Add",
        inputValidator: (value) => { if (!value) return "Name is required!"; }
      });
      inputValue = name;
    }

    if (!inputValue) return;

    try {
      const payload = {
        lookup_type: section.lookup_type,
        lookup_value: inputValue,
        code: inputCode, // will be null for others
        parent_lookup_id: parentId
      };
      const res = await api.post("/lookups", payload);
      if (res.data.status === "success") {
        showToast("Added Successfully");
        refreshCallback(res.data.data);
      } else {
        showToast(res.data.message || "Failed", "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Error adding item", "error");
    }
  };

  const handleEdit = async (item, section, refreshCallback) => {
    let inputValue = null;
    let inputCode = null;

    if (section.lookup_type === "Country-Code") {
      const { value: formValues } = await Swal.fire({
        title: 'Edit Country Code',
        html:
          `<input id="swal-input1" class="swal2-input" placeholder="Country Name" value="${item.lookup_value || ''}">` +
          `<input id="swal-input2" class="swal2-input" placeholder="Numeric Code" value="${item.code || ''}">`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Update",
        preConfirm: () => {
          const name = document.getElementById('swal-input1').value;
          const code = document.getElementById('swal-input2').value;
          if (!name || !code) return Swal.showValidationMessage('Both Name and Code are required');
          return { name, code };
        }
      });
      if (formValues) {
        inputValue = formValues.name;
        inputCode = formValues.code;
      }
    } else {
      const { value: name } = await Swal.fire({
        title: "Rename Item",
        input: "text",
        inputValue: item.lookup_value,
        showCancelButton: true,
        confirmButtonText: "Update",
        inputValidator: (value) => { if (!value) return "Name is required!"; }
      });
      inputValue = name;
    }

    if (!inputValue) return;

    try {
      const res = await api.put(`/lookups/${item._id}`, {
        lookup_type: item.lookup_type,
        lookup_value: inputValue,
        code: inputCode,
        parent_lookup_id: item.parent_lookup_id
      });
      if (res.data.status === "success") {
        showToast("Updated Successfully");
        refreshCallback();
      }
    } catch (error) {
      console.error(error);
      showToast("Error updating item", "error");
    }
  };

  const handleDelete = async (item, refreshCallback) => {
    const result = await Swal.fire({
      title: "Delete this item?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, Delete"
    });

    if (!result.isConfirmed) return;

    try {
      await api.delete(`/lookups/${item._id}`);
      showToast("Deleted Successfully");
      refreshCallback();
    } catch (error) {
      console.error(error);
      showToast("Error deleting item", "error");
    }
  };


  // ---------------- RENDERERS ----------------

  const renderAddressWorkspace = () => {
    const filteredStates = selectedCountryId 
        ? addressStatesList.filter(s => String(s.parent_lookup_id) === String(selectedCountryId) || !s.parent_lookup_id)
        : addressStatesList;

    return (
      <div className="workspace-columns" style={{ height: "calc(100vh - 250px)", minHeight: "550px" }}>
        {/* 1. Countries */}
        <div className="workspace-column">
          <div className="column-header">
            <h3>1. Countries</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => handleExportHierarchy(countries, "Country")}
                style={{ border: "none", background: "transparent", color: "#10b981", cursor: "pointer" }}
                title="Download list"
              >
                <i className="fas fa-download"></i>
              </button>
              <button
                onClick={() => handleAdd({ title: "Country", lookup_type: "Country" }, null, () => fetchCountries())}
                style={{ border: "none", background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: "4px", width: "24px", height: "24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <i className="fas fa-plus" style={{ fontSize: "0.7rem" }}></i>
              </button>
            </div>
          </div>
          <div className="column-body">
            {countries.map(c => (
              <div 
                key={c._id}
                className={`workspace-card country-card ${selectedCountryId === c._id ? 'selected' : ''} ${dragOverItemId === c._id ? 'drop-target-hover' : ''}`}
                onClick={() => setSelectedCountryId(c._id)}
                onDragOver={(e) => handleDragOver(e, c, 'Country')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, c, 'Country')}
              >
                <span className="card-value">{c.lookup_value}</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(c, { title: "Country", lookup_type: "Country" }, () => fetchCountries()); }}></i>
                  <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(c, () => fetchCountries()); }}></i>
                  <span className="card-hint">Drop States</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. States */}
        <div className="workspace-column">
          <div className="column-header">
            <h3>2. States</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => handleExportHierarchy(filteredStates, "State")}
                style={{ border: "none", background: "transparent", color: "#10b981", cursor: "pointer" }}
                title="Download list"
              >
                <i className="fas fa-download"></i>
              </button>
              <button
                onClick={() => handleAdd({ title: "State", lookup_type: "State" }, selectedCountryId, () => fetchStatesList())}
                disabled={!selectedCountryId}
                style={{ border: "none", background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: "4px", width: "24px", height: "24px", cursor: selectedCountryId ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: selectedCountryId ? 1 : 0.5 }}
              >
                <i className="fas fa-plus" style={{ fontSize: "0.7rem" }}></i>
              </button>
            </div>
          </div>
          <div className="column-body">
            {filteredStates.length === 0 ? (
              <div className="column-empty">No states found</div>
            ) : (
              filteredStates.map(s => (
                <div 
                  key={s._id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, s)}
                  onDragOver={(e) => handleDragOver(e, s, 'State')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, s, 'State')}
                  className={`workspace-card state-card ${selectedStateId === s._id ? 'selected' : ''} ${dragOverItemId === s._id ? (draggedItem?.lookup_type === 'State' ? 'merge-target-hover' : 'drop-target-hover') : ''}`}
                  onClick={() => handleStateWorkspaceClick(s._id)}
                >
                  <div className="card-drag-handle">⋮⋮</div>
                  <div className="card-content">
                    <span className="card-value">{s.lookup_value}</span>
                    <span className="card-hint-sub">Parent: {s.parent_lookup_value || 'None'}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(s, { title: "State", lookup_type: "State" }, () => fetchStatesList()); }}></i>
                    <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(s, () => { fetchStatesList(); if (selectedStateId === s._id) setSelectedStateId(''); }); }}></i>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Cities */}
        <div className="workspace-column">
          <div className="column-header">
            <h3>3. Cities</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => handleExportHierarchy(addressCitiesList, "City")}
                style={{ border: "none", background: "transparent", color: "#10b981", cursor: "pointer" }}
                title="Download list"
              >
                <i className="fas fa-download"></i>
              </button>
              <button
                onClick={() => handleAdd({ title: "City", lookup_type: "City" }, selectedStateId, () => fetchCitiesList(selectedStateId))}
                disabled={!selectedStateId}
                style={{ border: "none", background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: "4px", width: "24px", height: "24px", cursor: selectedStateId ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: selectedStateId ? 1 : 0.5 }}
              >
                <i className="fas fa-plus" style={{ fontSize: "0.7rem" }}></i>
              </button>
            </div>
          </div>
          <div className="column-body">
            {!selectedStateId ? (
              <div className="column-empty">Select a state to view cities</div>
            ) : addressCitiesList.length === 0 ? (
              <div className="column-empty">No cities found</div>
            ) : (
              addressCitiesList.map(c => (
                <div 
                  key={c._id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, c)}
                  onDragOver={(e) => handleDragOver(e, c, 'City')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, c, 'City')}
                  className={`workspace-card city-card ${selectedCityId === c._id ? 'selected' : ''} ${dragOverItemId === c._id ? (draggedItem?.lookup_type === 'City' ? 'merge-target-hover' : 'drop-target-hover') : ''}`}
                  onClick={() => handleCityWorkspaceClick(c._id)}
                >
                  <div className="card-drag-handle">⋮⋮</div>
                  <div className="card-content">
                    <span className="card-value">{c.lookup_value}</span>
                    <span className="card-hint-sub">Parent: {c.parent_lookup_value || 'None'}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(c, { title: "City", lookup_type: "City" }, () => fetchCitiesList(selectedStateId)); }}></i>
                    <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(c, () => { fetchCitiesList(selectedStateId); if (selectedCityId === c._id) setSelectedCityId(''); }); }}></i>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 4. Children */}
        <div className="workspace-column children-column">
          <div className="column-header-tabs" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "4px", flex: 1 }}>
              {['Location', 'Tehsil', 'PostOffice', 'Pincode'].map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn-mini ${activeChildTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveChildTab(tab)}
                  disabled={!selectedCityId}
                  style={{ padding: "6px" }}
                >
                  {tab === 'PostOffice' ? 'P.O.' : tab + 's'}
                </button>
              ))}
            </div>
            {selectedCityId && (
              <div style={{ display: "flex", gap: "6px", marginLeft: "6px" }}>
                <button
                  onClick={() => {
                    const getList = () => {
                      if (activeChildTab === "Location") return locationsList;
                      if (activeChildTab === "Tehsil") return tehsilsList;
                      if (activeChildTab === "PostOffice") return postOfficesList;
                      return pincodesList;
                    };
                    handleExportHierarchy(getList(), activeChildTab);
                  }}
                  style={{ border: "none", background: "transparent", color: "#10b981", cursor: "pointer" }}
                  title="Download list"
                >
                  <i className="fas fa-download"></i>
                </button>
                <button
                  onClick={() => {
                    const lookupType = activeChildTab === "PostOffice" ? "PostOffice" : activeChildTab === "Pincode" ? "Pincode" : activeChildTab;
                    const parentId = (activeChildTab === "Pincode" && selectedPostOfficeId !== "unassigned") ? selectedPostOfficeId : selectedCityId;
                    handleAdd({ title: activeChildTab, lookup_type: lookupType }, parentId, () => fetchCityChildrenList(selectedCityId));
                  }}
                  style={{ border: "none", background: 'var(--border-color)', color: 'var(--text-muted)', borderRadius: "4px", width: "24px", height: "24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <i className="fas fa-plus" style={{ fontSize: "0.7rem" }}></i>
                </button>
              </div>
            )}
          </div>
          
          <div className="column-body">
            {childLoading ? (
              <div className="column-loader">Loading lookups...</div>
            ) : !selectedCityId ? (
              <div className="column-empty">Select a city to view lookups</div>
            ) : (
              <>
                {activeChildTab === 'Location' && (
                  locationsList.length === 0 ? <div className="column-empty">No locations found</div> :
                  locationsList.map(item => (
                    <div 
                      key={item._id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragOver={(e) => handleDragOver(e, item, 'Location')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, item, 'Location')}
                      className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                    >
                      <div className="card-drag-handle">⋮⋮</div>
                      <span className="card-value" style={{ flex: 1 }}>{item.lookup_value}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(item, { title: "Location", lookup_type: "Location" }, () => fetchCityChildrenList(selectedCityId)); }}></i>
                        <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => fetchCityChildrenList(selectedCityId)); }}></i>
                      </div>
                    </div>
                  ))
                )}

                {activeChildTab === 'Tehsil' && (
                  tehsilsList.length === 0 ? <div className="column-empty">No tehsils found</div> :
                  tehsilsList.map(item => (
                    <div 
                      key={item._id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragOver={(e) => handleDragOver(e, item, 'Tehsil')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, item, 'Tehsil')}
                      className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                    >
                      <div className="card-drag-handle">⋮⋮</div>
                      <span className="card-value" style={{ flex: 1 }}>{item.lookup_value}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(item, { title: "Tehsil", lookup_type: "Tehsil" }, () => fetchCityChildrenList(selectedCityId)); }}></i>
                        <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => fetchCityChildrenList(selectedCityId)); }}></i>
                      </div>
                    </div>
                  ))
                )}

                {activeChildTab === 'PostOffice' && (
                  postOfficesList.length === 0 ? <div className="column-empty">No post offices found</div> :
                  postOfficesList.map(item => (
                    <div 
                      key={item._id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragOver={(e) => handleDragOver(e, item, 'PostOffice')}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, item, 'PostOffice')}
                      className={`workspace-card child-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                    >
                      <div className="card-drag-handle">⋮⋮</div>
                      <span className="card-value" style={{ flex: 1 }}>{item.lookup_value}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(item, { title: "Post Office", lookup_type: "PostOffice" }, () => fetchCityChildrenList(selectedCityId)); }}></i>
                        <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => fetchCityChildrenList(selectedCityId)); }}></i>
                      </div>
                    </div>
                  ))
                )}

                {activeChildTab === 'Pincode' && (
                  <div className="pincode-split-layout">
                    <div className="po-selector-sublist">
                      <label>Select Post Office Target</label>
                      <div 
                        className={`po-sub-card ${selectedPostOfficeId === 'unassigned' ? 'selected' : ''}`}
                        onClick={() => setSelectedPostOfficeId('unassigned')}
                      >
                        Direct City Pincodes
                      </div>
                      {postOfficesList.map(po => (
                        <div 
                          key={po._id}
                          onClick={() => setSelectedPostOfficeId(po._id)}
                          onDragOver={(e) => handleDragOver(e, po, 'PostOffice')}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, po, 'PostOffice')}
                          className={`po-sub-card ${selectedPostOfficeId === po._id ? 'selected' : ''} ${dragOverItemId === po._id ? 'drop-target-hover' : ''}`}
                        >
                          📬 {po.lookup_value}
                        </div>
                      ))}
                    </div>
                    <div className="pincode-sublist">
                      {pincodesList.length === 0 ? (
                        <div className="column-empty">No pincodes. Drag pincodes onto a post office.</div>
                      ) : (
                        pincodesList.map(item => (
                          <div 
                            key={item._id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragOver={(e) => handleDragOver(e, item, 'Pincode')}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, item, 'Pincode')}
                            className={`workspace-card pincode-card ${dragOverItemId === item._id ? 'merge-target-hover' : ''}`}
                          >
                            <div className="card-drag-handle">⋮⋮</div>
                            <span className="card-value" style={{ flex: 1 }}>{item.lookup_value}</span>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <i className="fas fa-edit" style={{ cursor: "pointer", fontSize: "0.8rem", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleEdit(item, { title: "Pin Code", lookup_type: "Pincode" }, () => fetchPincodesForPO(selectedPostOfficeId)); }}></i>
                              <i className="fas fa-trash" style={{ cursor: "pointer", fontSize: "0.8rem", color: "#ef4444", opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDelete(item, () => fetchPincodesForPO(selectedPostOfficeId)); }}></i>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------------- RENDERERS ----------------
  const renderHierarchyView = () => {
    const levels = HIERARCHY_CONFIG[activeTab];
    if (!levels) return null;

    return (
      <div style={{ display: "flex", background: 'var(--bg-card)', borderRadius: "12px", border: "1px solid var(--border-color)", overflowX: "auto", height: "calc(100vh - 200px)", minHeight: "500px" }}>
        {levels.map((level, index) => {
          // Show column if index is 0 OR parent is selected
          const parentItem = index > 0 ? selectedPath[index - 1] : null;

          // HIERARCHY RULE:
          // If Level 3 is "Tehsil", hide ALL subsequent columns (Post Office, Pin Code)
          const level3Item = selectedPath[3];
          if (level3Item && level3Item.lookup_type === "Tehsil" && index > 3) {
            return null;
          }

          const shouldShow = index === 0 || parentItem;
          // Use minWidth instead of width% to allow scrolling
          const colStyle = { minWidth: "280px", flexShrink: 0, borderRight: "1px solid var(--border-color)" };

          if (!shouldShow) return <div key={index} style={{ ...colStyle, background: 'var(--bg-light)', borderRight: "1px dashed var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center", color: 'var(--border-color)' }}>Pending Selection</div>;

          // Parent ID for Adding New Items
          const parentId = index === 0 ? null : selectedPath[index - 1]._id;

          return (
            <ConfigColumn
              key={level.lookup_type}
              title={level.title}
              items={hierarchyData[index] || []}
              selectedItem={selectedPath[index] ? selectedPath[index]._id : null}
              isLoading={false}
              onSelect={(item) => {
                const newPath = [...selectedPath];
                newPath[index] = item;
                // Clear subsequent levels
                for (let i = index + 1; i < levels.length; i++) {
                  newPath[i] = null;
                }
                setSelectedPath(newPath);

                // Fetch next level if exists
                if (levels[index + 1]) {
                  fetchHierarchyLevel(activeTab, index + 1, item._id);
                }
              }}
              onAdd={() => handleAdd(level, parentId, () => {
                fetchHierarchyLevel(activeTab, index, parentId);
              })}
              onDownload={() => handleExportHierarchy(hierarchyData[index] || [], level.title)}
              onEdit={(item) => handleEdit(item, level, () => fetchHierarchyLevel(activeTab, index, parentId))}
              onDelete={(item) => handleDelete(item, () => {
                fetchHierarchyLevel(activeTab, index, parentId);
                // If deleted item was selected, clear path
                if (selectedPath[index] && selectedPath[index]._id === item._id) {
                  const newPath = [...selectedPath];
                  newPath[index] = null;
                  setSelectedPath(newPath);
                }
              })}
            />
          );
        })}
      </div>
    );
  };

  const renderFlatView = () => {


    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", height: "calc(100vh - 200px)", minHeight: "500px", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: "240px", borderRight: "1px solid var(--border-color)", padding: "16px", background: 'var(--bg-light)', overflowY: "auto" }}>
          {FLAT_CONFIG[activeTab].map(section => (
            <div
              key={section.lookup_type}
              onClick={() => setFlatActiveSection(section)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                marginBottom: "4px",
                borderRadius: "6px",
                fontSize: "0.9rem",
                fontWeight: flatActiveSection === section ? 600 : 500,
                color: flatActiveSection === section ? "#2563eb" : 'var(--text-muted)',
                background: flatActiveSection === section ? "#eff6ff" : "transparent",
                transition: "all 0.2s"
              }}
            >
              {section.title}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
          {flatActiveSection && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: 'var(--text-main)' }}>{flatActiveSection.title}</h3>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <button
                    className="btn-outline"
                    onClick={handleExportFlat}
                    style={{ padding: "8px 12px", fontSize: "0.9rem", fontWeight: 600, border: "1px solid #10b981", borderRadius: "6px", background: 'var(--bg-card)', cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", color: "#10b981" }}
                    title="Download as Excel/CSV"
                  >
                    <i className="fas fa-download"></i> Download
                  </button>
                  <button
                    className="btn-outline"
                    onClick={() => handleAdd(flatActiveSection, null, fetchFlatItems)}
                    style={{ padding: "8px 16px", fontSize: "0.9rem", fontWeight: 600, border: "1px solid var(--border-color)", borderRadius: "6px", background: 'var(--bg-card)', cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <i className="fas fa-plus"></i> Add Item
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                {flatItems.map((item) => (
                  <div
                    key={item._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px",
                      background: 'var(--bg-card)',
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.95rem",
                      color: 'var(--text-main)',
                      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.lookup_value}</span>
                      {item.code && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Code: <span style={{ fontFamily: 'monospace', background: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px' }}>{item.code}</span></span>}
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                        onClick={() => handleEdit(item, flatActiveSection, fetchFlatItems)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: 'var(--text-muted)' }}
                        title="Edit"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(item, fetchFlatItems)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "#ef4444" }}
                        title="Delete"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
                {flatItems.length === 0 && (
                  <div style={{ gridColumn: "1/-1", padding: "48px", textAlign: "center", color: 'var(--text-muted)', border: "2px dashed #e2e8f0", borderRadius: "12px" }}>
                    <i className="fas fa-inbox" style={{ fontSize: "2rem", marginBottom: "16px", display: "block", color: 'var(--border-color)' }}></i>
                    No items found. Add one to get started.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, background: 'var(--bg-light)', padding: "24px", overflowY: "auto", display: 'flex', flexDirection: 'column' }}>
      {notification.show && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, show: false })}
        />
      )}

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>Contact Configuration</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Manage contact fields, hierarchies, and lookups.</p>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: "32px", borderBottom: "1px solid var(--border-color)", marginBottom: "24px" }}>
        {TABS.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "12px 4px",
              fontSize: "0.95rem",
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "#3b82f6" : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {TABS.find(t => t.id === activeTab).type === "hierarchy" ? renderHierarchyView() : renderFlatView()}
      </div>

    </div>
  );
};

export default ContactSettingsPage;
