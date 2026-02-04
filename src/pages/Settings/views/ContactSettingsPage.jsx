import React, { useEffect, useState } from "react";
import Toast from "../../../components/Toast";
import api from "../../../../api";

// Define the hierarchy and lookup_type per level
const HIERARCHY_LEVELS = {
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
  Profile: [
    { title: "Section", lookup_type: "Section" },
    { title: "Item", lookup_type: "Item" },
  ],
};

// Column component
const ConfigColumn = ({ title, items, selectedItem, onSelect, onAdd, onEdit, onDelete }) => (
  <div
    style={{
      minWidth: "250px",
      width: "33%",
      borderRight: "1px solid #e2e8f0",
      display: "flex",
      flexDirection: "column",
      background: "#f8fafc",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        padding: "12px 16px",
        fontWeight: 600,
        color: "#475569",
        fontSize: "0.85rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {title}
      <button
        onClick={onAdd}
        style={{
          border: "none",
          background: "#e2e8f0",
          color: "#475569",
          borderRadius: "4px",
          width: "20px",
          height: "20px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        +
      </button>
    </div>

    <div style={{ overflowY: "auto", flex: 1 }}>
      {items.length > 0 ? (
        items.map((item) => {
          const isSelected = selectedItem === item._id;
          return (
            <div
              key={item._id}
              onClick={() => onSelect(item)}
              style={{
                padding: "16px",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? "#2563eb" : "#334155",
                background: isSelected ? "#fff" : "transparent",
                borderLeft: isSelected
                  ? "4px solid #2563eb"
                  : "4px solid transparent",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {item.lookup_value}

              <div style={{ display: "flex", gap: "8px" }}>
                <i
                  className="fas fa-edit"
                  style={{ cursor: "pointer", color: "#64748b" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                ></i>
                <i
                  className="fas fa-trash"
                  style={{ cursor: "pointer", color: "#ef4444" }}
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
        <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>
          No items added
        </div>
      )}
    </div>
  </div>
);

const ContactSettingsPage = () => {
  const [activeTab, setActiveTab] = useState("Professional");
  const [lookups, setLookups] = useState({});
  const [selectedPath, setSelectedPath] = useState([]);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setNotification({ show: true, message, type });
  };

  // ---------------- FETCH DATA PER LEVEL ----------------
  const fetchLookups = async (levelIndex) => {
    const level = HIERARCHY_LEVELS[activeTab][levelIndex];
    const parentId = levelIndex === 0 ? null : selectedPath[levelIndex - 1];

    try {
      const res = await api.get("api/LookupList", {
        params: {
          lookup_type: level.lookup_type,
          parent_lookup_id: parentId,
          page: 1,
          limit: 1000,
        },
      });

      if (res.data.status === "success") {
        setLookups((prev) => ({
          ...prev,
          [levelIndex]: res.data.data,
        }));
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    }
  };

  useEffect(() => {
    // fetch first level
    fetchLookups(0);
    setSelectedPath([]);
    setLookups({});
  }, [activeTab]);

  // ---------------- ADD ----------------
  const handleAdd = async (levelIndex) => {
    const level = HIERARCHY_LEVELS[activeTab][levelIndex];
    const parentId = levelIndex === 0 ? null : selectedPath[levelIndex - 1];
    const name = prompt(`Enter ${level.title}`);
    if (!name) return;

    try {
      const res = await api.post("api/SaveLookup", {
        lookup_type: level.lookup_type,
        lookup_value: name,
        parent_lookup_id: parentId,
      });

      if (res.data.data) {
        showToast("Added Successfully");
        fetchLookups(levelIndex);

        // auto select newly added
        const newPath = [...selectedPath.slice(0, levelIndex), res.data.data._id];
        setSelectedPath(newPath);

        // fetch next level empty
        fetchLookups(levelIndex + 1);
      } else {
        showToast(res.data.message || "Failed to add", "error");
      }
    } catch (error) {
      console.error("Add Error:", error);
      showToast("Something went wrong", "error");
    }
  };

  // ---------------- EDIT ----------------
  const handleEdit = async (item, levelIndex) => {
    const newName = prompt("Rename to:", item.lookup_value);
    if (!newName) return;

    try {
      const res = await api.post("api/SaveLookup", {
        lookup_id: item._id,
        lookup_type: item.lookup_type,
        lookup_value: newName,
        parent_lookup_id: item.parent_lookup_id || null,
      });

      if (res.data.data) {
        showToast("Updated Successfully");
        fetchLookups(levelIndex);
      } else {
        showToast(res.data.message || "Update failed", "error");
      }
    } catch (error) {
      console.error("Edit Error:", error);
      showToast("Something went wrong", "error");
    }
  };

  // ---------------- DELETE ----------------
  const handleDelete = async (item, levelIndex) => {
    if (!window.confirm("Delete this item?")) return;

    try {
      const res = await api.delete("api/RemoveLookup", { data: { id: item._id } });

      if (res.data.status === "success") {
        showToast("Deleted Successfully");

        // Remove deleted item from selected path if selected
        const newPath = selectedPath.slice(0, levelIndex);
        setSelectedPath(newPath);

        // Refresh this and next level
        fetchLookups(levelIndex);
        fetchLookups(levelIndex + 1);
      } else {
        showToast("Delete failed", "error");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      showToast("Something went wrong", "error");
    }
  };

  // ---------------- BUILD COLUMNS ----------------
  const columns = [];
  const levels = HIERARCHY_LEVELS[activeTab];
  for (let i = 0; i < levels.length; i++) {
    // Only render if first level or parent selected
    if (i === 0 || selectedPath[i - 1]) {
      columns.push({
        index: i,
        title: levels[i].title,
        lookup_type: levels[i].lookup_type,
        items: lookups[i] || [],
      });
    }
  }

  return (
    <div style={{ flex: 1, background: "#f8fafc", padding: "24px" }}>
      {notification.show && (
        <Toast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, show: false })}
        />
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "32px", marginBottom: "20px" }}>
        {Object.keys(HIERARCHY_LEVELS).map((tab) => (
          <div
            key={tab}
            onClick={() => {
              setActiveTab(tab);
            }}
            style={{
              cursor: "pointer",
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? "#3b82f6" : "#64748b",
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Columns */}
      <div style={{ display: "flex", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
        {columns.map((col) => (
          <ConfigColumn
            key={col.index}
            title={col.title}
            items={col.items}
            selectedItem={selectedPath[col.index]}
            onSelect={(item) => {
              const newPath = [...selectedPath.slice(0, col.index), item._id];
              setSelectedPath(newPath);

              // fetch next level data
              fetchLookups(col.index + 1);
            }}
            onAdd={() => handleAdd(col.index)}
            onEdit={(item) => handleEdit(item, col.index)}
            onDelete={(item) => handleDelete(item, col.index)}
          />
        ))}
      </div>
    </div>
  );
};

export default ContactSettingsPage;
