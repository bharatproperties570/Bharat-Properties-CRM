import { useEffect, useState, useMemo } from "react";
import Toast from "../../../components/Toast";
import Swal from "sweetalert2";
import { generateCSV, downloadFile } from "../../../utils/dataManagementUtils";
import { useLookups, useLookupMutations } from "../../../utils/crmHooks";

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
                background: isSelected ? 'rgba(59, 130, 246, 0.1)' : "transparent",
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
  const [selectedPath, setSelectedPath] = useState([]); // [itemLvl0, itemLvl1]

  // FLAT ID STATE
  const [flatActiveSection, setFlatActiveSection] = useState(null);

  // CANONICAL HOOKS
  const CONTACT_LOOKUP_TYPES = useMemo(() => [
    "ProfessionalCategory", "ProfessionalSubCategory", "ProfessionalDesignation",
    "Document-Category", "Document-Type",
    "Education-Level", "Degree",
    "Title", "Country-Code", "Income-Source", "Loan Type", "Bank", "Social Plateform"
  ], []);

  const { data: allLookups = [], isLoading: isLookupsLoading } = useLookups(CONTACT_LOOKUP_TYPES);
  const { createLookup, updateLookup, deleteLookup } = useLookupMutations();

  // ---------------- DERIVED STATE ----------------
  const derivedHierarchyData = useMemo(() => {
    const data = {};
    const levels = HIERARCHY_CONFIG[activeTab];
    if (TABS.find(t => t.id === activeTab)?.type !== 'hierarchy' || !levels) return data;

    // Root level (index 0)
    let types0 = levels[0].mixed_types || [levels[0].lookup_type];
    data[0] = allLookups.filter(item => types0.includes(item.lookup_type));

    // Child levels
    for (let i = 1; i < levels.length; i++) {
        const parent = selectedPath[i - 1];
        if (parent) {
            let typesI = levels[i].mixed_types || [levels[i].lookup_type];
            data[i] = allLookups.filter(item => 
                typesI.includes(item.lookup_type) && 
                (item.parent_lookup_id === parent._id || item.parent_lookup_id?._id === parent._id)
            );
        } else {
            data[i] = [];
        }
    }
    return data;
  }, [activeTab, selectedPath, allLookups]);

  const derivedFlatItems = useMemo(() => {
    if (TABS.find(t => t.id === activeTab)?.type !== 'flat' || !flatActiveSection) return [];
    
    // Some sections might have mixed_types?
    let types = flatActiveSection.mixed_types || [flatActiveSection.lookup_type];
    return allLookups.filter(item => types.includes(item.lookup_type));
  }, [activeTab, flatActiveSection, allLookups]);

  const showToast = (message, type = "success") => {
    setNotification({ show: true, message, type });
  };

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
    if (!derivedFlatItems || derivedFlatItems.length === 0) {
      showToast("No items to export", "warning");
      return;
    }

    const dataToExport = derivedFlatItems.map(item => ({
      ID: item._id || 'N/A',
      Name: item.lookup_value || 'N/A',
      Code: item.code || ''
    }));

    const csvContent = generateCSV(dataToExport);
    const fileName = `contact_${activeTab.toLowerCase()}_${flatActiveSection.title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(csvContent, fileName);
    showToast("Export successful!");
  };

  // ---------------- EFFECTS ----------------
  useEffect(() => {
    const tabConfig = TABS.find(t => t.id === activeTab);
    if (tabConfig.type === "hierarchy") {
      setSelectedPath([]);
    } else {
      const sections = FLAT_CONFIG[activeTab];
      if (sections && sections.length > 0) {
        setFlatActiveSection(sections[0]);
      }
    }
  }, [activeTab]);

  // ---------------- CUSTOM ADD/EDIT HANDLERS ----------------

  // Generic Add Handling
  const handleAdd = async (section, parentId = null) => {
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
      
      await createLookup.mutateAsync(payload);
      showToast("Added Successfully");
    } catch (error) {
      console.error(error);
      showToast("Error adding item", "error");
    }
  };

  const handleEdit = async (item, section) => {
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
      await updateLookup.mutateAsync({
        id: item._id,
        data: {
          lookup_type: item.lookup_type,
          lookup_value: inputValue,
          code: inputCode,
          parent_lookup_id: item.parent_lookup_id
        }
      });
      showToast("Updated Successfully");
    } catch (error) {
      console.error(error);
      showToast("Error updating item", "error");
    }
  };

  const handleDelete = async (item) => {
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
      await deleteLookup.mutateAsync(item._id);
      showToast("Deleted Successfully");
    } catch (error) {
      console.error(error);
      showToast("Error deleting item", "error");
    }
  };


  // ---------------- RENDERERS ----------------

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
              items={derivedHierarchyData[index] || []}
              selectedItem={selectedPath[index] ? selectedPath[index]._id : null}
              isLoading={isLookupsLoading}
              onSelect={(item) => {
                const newPath = [...selectedPath];
                newPath[index] = item;
                // Clear subsequent levels
                for (let i = index + 1; i < levels.length; i++) {
                  newPath[i] = null;
                }
                setSelectedPath(newPath);
                // Derived state automatically handles next level
              }}
              onAdd={() => handleAdd(level, parentId)}
              onDownload={() => handleExportHierarchy(derivedHierarchyData[index] || [], level.title)}
              onEdit={(item) => handleEdit(item, level)}
              onDelete={(item) => {
                handleDelete(item);
                // If deleted item was selected, clear path
                if (selectedPath[index] && selectedPath[index]._id === item._id) {
                  const newPath = [...selectedPath];
                  newPath[index] = null;
                  setSelectedPath(newPath);
                }
              }}
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
                background: flatActiveSection === section ? 'rgba(59, 130, 246, 0.1)' : "transparent",
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
                    onClick={() => handleAdd(flatActiveSection, null)}
                    style={{ padding: "8px 16px", fontSize: "0.9rem", fontWeight: 600, border: "1px solid var(--border-color)", borderRadius: "6px", background: 'var(--bg-card)', cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <i className="fas fa-plus"></i> Add Item
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                {derivedFlatItems.map((item) => (
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
                        onClick={() => handleEdit(item, flatActiveSection)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: 'var(--text-muted)' }}
                        title="Edit"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "#ef4444" }}
                        title="Delete"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
                {derivedFlatItems.length === 0 && (
                  <div style={{ gridColumn: "1/-1", padding: "48px", textAlign: "center", color: 'var(--text-muted)', border: "2px dashed rgba(148, 163, 184, 0.15)", borderRadius: "12px" }}>
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
