import React, { useEffect, useState } from "react";
import Toast from "../../../components/Toast";
import { api } from "../../../utils/api";
import Swal from "sweetalert2";

// Define the hierarchy and lookup_type configuration
const CONFIG_SECTIONS = {
  Professional: [
    { title: "Category", lookup_type: "ProfessionalCategory" },
    { title: "Sub Category", lookup_type: "ProfessionalSubCategory" },
    { title: "Designation", lookup_type: "ProfessionalDesignation" },
  ],
  Address: [
    { title: "Country", lookup_type: "Country" },
    { title: "State", lookup_type: "State" },
    { title: "City", lookup_type: "City" },
    { title: "Location", lookup_type: "Location" },
    { title: "Tehsil", lookup_type: "Tehsil" },
    { title: "Post Office", lookup_type: "PostOffice" },
    { title: "Pincode", lookup_type: "Pincode" },
  ],
  "Document": [ // Special handling for nested Document Type
    { title: "Document Category", lookup_type: "Document-Category" },
    { title: "Document Type", lookup_type: "Document-Type", parent_type: "Document-Category" },
  ],
  Other: [
    { title: "Title", lookup_type: "Title" },
    { title: "Country Code", lookup_type: "Country-Code" },
    { title: "Source", lookup_type: "Source" },
    { title: "Team", lookup_type: "Team" },
    { title: "Visible To", lookup_type: "Visibility" },
    { title: "Education Level", lookup_type: "Education-Level" },
    { title: "Degree", lookup_type: "Degree" },
    { title: "Income Source", lookup_type: "Income-Source" },
    { title: "Loan Type", lookup_type: "Loan Type" },
    { title: "Bank", lookup_type: "Bank" },
    { title: "Social Platform", lookup_type: "Social Plateform" },
  ]
};

const ContactSettingsPage = () => {
  const [activeTab, setActiveTab] = useState("Professional");
  const [activeSection, setActiveSection] = useState(null);
  const [items, setItems] = useState([]);

  // For nested navigation (Document Category -> Document Type)
  const [parentItem, setParentItem] = useState(null);

  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setNotification({ show: true, message, type });
  };

  // Set default active section when tab changes
  useEffect(() => {
    const sections = CONFIG_SECTIONS[activeTab];
    if (sections && sections.length > 0) {
      setActiveSection(sections[0]);
      setParentItem(null); // Reset parent on tab change
    }
  }, [activeTab]);

  // Fetch items when section or parentItem changes
  useEffect(() => {
    if (activeSection) {
      fetchLookups();
    }
  }, [activeSection, parentItem]);

  const fetchLookups = async () => {
    if (!activeSection) return;

    try {
      const params = {
        lookup_type: activeSection.lookup_type,
        page: 1,
        limit: 1000,
      };

      // If this section depends on a parent (e.g., Document Type), filter by parent
      if (activeSection.parent_type && parentItem) {
        params.parent_lookup_id = parentItem._id;
      }
      // If it requires a parent but none is selected, don't fetch anything (or fetch empty)
      else if (activeSection.parent_type && !parentItem) {
        setItems([]);
        return;
      }

      const res = await api.get("/lookups", { params });
      if (res.data.status === "success") {
        setItems(res.data.data);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      showToast("Failed to fetch items", "error");
    }
  };

  const handleAdd = async () => {
    const { value: name } = await Swal.fire({
      title: `Add ${activeSection.title}`,
      input: "text",
      inputPlaceholder: `Enter ${activeSection.title} name`,
      showCancelButton: true,
      confirmButtonText: "Add",
      inputValidator: (value) => {
        if (!value) return "Name is required!";
      },
    });

    if (!name) return;

    try {
      const payload = {
        lookup_type: activeSection.lookup_type,
        lookup_value: name,
      };

      if (activeSection.parent_type && parentItem) {
        payload.parent_lookup_id = parentItem._id;
      }

      const res = await api.post("/lookups", payload);

      if (res.data.data) {
        showToast("Added Successfully");
        fetchLookups();
      } else {
        showToast(res.data.message || "Failed to add", "error");
      }
    } catch (error) {
      console.error("Add Error:", error);
      showToast(error.response?.data?.message || "Something went wrong", "error");
    }
  };

  const handleEdit = async (item) => {
    const { value: newName } = await Swal.fire({
      title: "Rename Item",
      input: "text",
      inputValue: item.lookup_value,
      showCancelButton: true,
      confirmButtonText: "Update",
      inputValidator: (value) => {
        if (!value) return "Name is required!";
      },
    });

    if (!newName) return;

    try {
      const res = await api.put(`/lookups/${item._id}`, {
        lookup_type: item.lookup_type,
        lookup_value: newName,
        parent_lookup_id: item.parent_lookup_id || null,
      });

      if (res.data.status === "success" || res.data.data) {
        showToast("Updated Successfully");
        fetchLookups();
      } else {
        showToast(res.data.message || "Update failed", "error");
      }
    } catch (error) {
      console.error("Edit Error:", error);
      showToast(error.response?.data?.message || "Something went wrong", "error");
    }
  };

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await api.delete(`/lookups/${item._id}`);
      if (res.data.status === "success") {
        showToast("Deleted Successfully");
        fetchLookups();
      } else {
        showToast(res.data.message || "Delete failed", "error");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      showToast(error.response?.data?.message || "Something went wrong", "error");
    }
  };

  // Special handler for drilling down into Document Category -> Document Type
  const handleItemClick = (item) => {
    // If we are in "Document Category", clicking an item should switch to "Document Type" for that item
    if (activeSection.lookup_type === "Document-Category") {
      setParentItem(item);
      // Find the child section (Document Type)
      const childSection = CONFIG_SECTIONS["Document"].find(s => s.lookup_type === "Document-Type");
      setActiveSection(childSection);
    }
  };

  const handleBackToParent = () => {
    setParentItem(null);
    const parentSection = CONFIG_SECTIONS["Document"].find(s => s.lookup_type === "Document-Category");
    setActiveSection(parentSection);
  };

  return (
    <div style={{ flex: 1, background: "#f8fafc", padding: "24px", overflowY: "auto" }}>
      {notification.show && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, show: false })}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>Contact Configuration</h1>
          <p style={{ margin: 0, color: '#64748b' }}>Manage contact fields, categories, and documents.</p>
        </div>
      </div>

      {/* Top Tabs */}
      <div style={{ display: "flex", gap: "32px", borderBottom: "1px solid #e2e8f0", marginBottom: "32px", overflowX: "auto" }}>
        {Object.keys(CONFIG_SECTIONS).map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "12px 4px",
              fontSize: "0.95rem",
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? "#3b82f6" : "#64748b",
              borderBottom: activeTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "32px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)", minHeight: "500px" }}>
        {activeSection && (
          <div style={{ display: "flex", gap: "32px", height: "100%" }}>

            {/* Left Panel: Sections List (Sidebar) */}
            {/* Don't show sidebar for Document tab if deep linked, or maybe show simplified */}
            <div style={{ width: "240px", borderRight: "1px solid #e2e8f0", paddingRight: "16px" }}>
              {CONFIG_SECTIONS[activeTab].map((section) => (
                <div
                  key={section.lookup_type}
                  onClick={() => {
                    // Prevent clicking child sections directly if they require a parent context
                    if (section.parent_type && !parentItem) return;

                    setActiveSection(section);
                    if (!section.parent_type) setParentItem(null); // Reset parent if switching to root section
                  }}
                  style={{
                    padding: "12px 16px",
                    cursor: section.parent_type && !parentItem ? "not-allowed" : "pointer",
                    borderRadius: "6px",
                    fontSize: "0.9rem",
                    fontWeight: activeSection === section ? 600 : 500,
                    color: activeSection === section ? "#2563eb" : (section.parent_type && !parentItem ? "#cbd5e1" : "#475569"),
                    background: activeSection === section ? "#eff6ff" : "transparent",
                    marginBottom: "8px",
                  }}
                >
                  {section.title}
                </div>
              ))}
            </div>

            {/* Right Panel: Value List */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {parentItem && (
                    <button onClick={handleBackToParent} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748b" }}>
                      <i className="fas fa-arrow-left"></i>
                    </button>
                  )}
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                    {activeSection.title} List {parentItem ? `for "${parentItem.lookup_value}"` : ""}
                  </h3>
                </div>

                <button
                  className="btn-outline"
                  onClick={handleAdd}
                  style={{ padding: "6px 16px", fontSize: "0.85rem", fontWeight: 600, border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: "pointer" }}
                >
                  + Add Item
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                {items.map((item) => (
                  <div
                    key={item._id}
                    onClick={() => handleItemClick(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: parentItem && parentItem._id === item._id ? "#eff6ff" : "#f8fafc",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      fontSize: "0.9rem",
                      color: "#334155",
                      cursor: activeSection.lookup_type === "Document-Category" ? "pointer" : "default"
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{item.lookup_value}</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <i
                        className="fas fa-edit"
                        style={{ cursor: "pointer", color: "#64748b", fontSize: "0.8rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(item);
                        }}
                      ></i>
                      <i
                        className="fas fa-trash"
                        style={{ cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                      ></i>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ gridColumn: "1/-1", padding: "32px", textAlign: "center", color: "#94a3b8", border: "2px dashed #e2e8f0", borderRadius: "8px" }}>
                    No items found. Add one to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactSettingsPage;
