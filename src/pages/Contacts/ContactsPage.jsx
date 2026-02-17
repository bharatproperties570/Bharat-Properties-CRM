import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import axios from 'axios';

import { api } from "../../utils/api";
import { getInitials, getSourceBadgeClass } from "../../utils/helpers";
import { useContactSync } from "../../hooks/useContactSync";
import SendMailModal from "./components/SendMailModal";
import AddLeadModal from "../../components/AddLeadModal";
import SendMessageModal from "../../components/SendMessageModal";
import AssignContactModal from "../../components/AssignContactModal";
import ManageTagsModal from "../../components/ManageTagsModal";
import { useTriggers } from "../../context/TriggersContext";
import { useCall } from "../../context/CallContext";
import { useDistribution } from "../../context/DistributionContext";
import EnrollSequenceModal from "../../components/EnrollSequenceModal";
import ContactFilterPanel from "./components/ContactFilterPanel";
import { applyContactFilters } from "../../utils/contactFilterLogic";
import ActiveFiltersChips from "../../components/ActiveFiltersChips";
import { useUserContext } from "../../context/UserContext";
import DocumentUploadModal from "../../components/DocumentUploadModal";

// Debounce Utility
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

function ContactsPage({ onEdit, onAddActivity, onNavigate }) {
  const { fireEvent } = useTriggers();
  const { startCall } = useCall();
  const { executeDistribution } = useDistribution();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filters, setFilters] = useState({});

  // Filter Handlers
  const handleRemoveFilter = (key) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    setFilters(newFilters);
  };

  const handleClearAll = () => {
    setFilters({});
  };

  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(25);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Add refresh trigger
  const [viewMode, setViewMode] = useState("list"); // 'list' or 'card'
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendMailOpen, setIsSendMailOpen] = useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [contactForLead, setContactForLead] = useState(null);
  const { teams } = useUserContext();

  // Debounce search term
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Fetch Contacts from API
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: recordsPerPage,
        search: debouncedSearchTerm,
      });

      const response = await api.get(
        `contacts?${queryParams.toString()}`,
      );

      if (response.data && response.data.success) {
        // API returns 'records' not 'docs', and 'totalCount' not 'totalDocs'
        setContacts(response.data.records || []);
        setTotalRecords(response.data.totalCount || 0);
      } else {
        toast.error("Failed to fetch contacts");
        setContacts([]);
        setTotalRecords(0);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Error loading contacts");
      setContacts([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, recordsPerPage, debouncedSearchTerm, refreshTrigger]);

  // Refresh Listener
  useEffect(() => {
    const handleRefresh = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('contact-updated', handleRefresh);
    return () => window.removeEventListener('contact-updated', handleRefresh);
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const getTeamName = useCallback((teamValue) => {
    if (!teamValue) return "General Team";
    if (typeof teamValue === 'object') {
      return teamValue.name || teamValue.lookup_value || "General Team";
    }
    // If it's a string, try to find it in lookup/teams
    const found = teams.find(t => (t._id === teamValue) || (t.id === teamValue));
    return found ? (found.name || found.lookup_value) : teamValue;
  }, [teams]);
  console.log(contacts);

  // ==============delete contact======================

  const delete_contact = async () => {
    if (!selectedIds?.length) return;

    const confirmed = window.confirm(`Delete ${selectedIds.length} contact(s)? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      toast.loading("Deleting selected contacts...");

      for (const id of selectedIds) {
        await api.delete(`contacts/${id}`);
      }

      toast.dismiss();
      toast.success("Contacts deleted successfully");

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to delete contacts");
      console.error("Delete error:", error);
    }
  };

  const handleSingleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this contact?")) return;

    try {
      await api.delete(`contacts/${id}`);
      toast.success("Contact deleted successfully");
      fetchContacts(); // Refresh list instead of full reload
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete contact");
    }
  };

  // ==============delete contact======================

  // Send Message Modal State
  const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
  const [selectedContactsForMessage, setSelectedContactsForMessage] = useState(
    [],
  );

  // Assign Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedContactsForAssign, setSelectedContactsForAssign] = useState(
    [],
  );

  // Manage Tags Modal State
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [selectedContactsForTags, setSelectedContactsForTags] = useState([]);



  // Call Modal State Removed - Using Global CallContext

  // Sequence Enrollment State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedContactForSequence, setSelectedContactForSequence] = useState(null);

  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentModalData, setDocumentModalData] = useState(null);

  const handleAssignClick = () => {
    const selected = getSelectedContacts();
    if (selected.length === 0) return;
    setSelectedContactsForAssign(selected);
    setIsAssignModalOpen(true);
  };

  const handleTagClick = () => {
    const selected = getSelectedContacts();
    if (selected.length === 0) return;
    setSelectedContactsForTags(selected);
    setIsTagsModalOpen(true);
  };

  // Contact Sync Hook
  const { getSyncStatus, syncMultipleContacts } = useContactSync();

  // Selection Handling
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  };

  // Select All Handler
  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length && contacts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c._id));
    }
  };

  const isSelected = (_id) => selectedIds.includes(_id);
  console.log(selectedIds);

  const totalCount = totalRecords;
  const selectedCount = selectedIds.length;

  // Filter Logic Implementation
  const filteredContacts = React.useMemo(() => {
    return applyContactFilters(contacts, filters);
  }, [contacts, filters]);

  // Server-side pagination means 'contacts' is ALREADY the current page data
  // But we apply client-side filtering on top of the fetched page for visual refinement
  const paginatedContacts = filteredContacts;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);

  // Regrouping paginated results
  const groups = {};
  if (Array.isArray(paginatedContacts)) {
    paginatedContacts.forEach((c) => {
      const group = c?.group || "Others"; // Fallback if group is missing
      if (!groups[group]) groups[group] = [];
      groups[group].push(c);
    });
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleRecordsPerPageChange = (e) => {
    setRecordsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  // Check if all visible contacts are selected
  const isAllSelected =
    paginatedContacts.length > 0 &&
    selectedIds.length === paginatedContacts.length;
  const isIndeterminate =
    selectedIds.length > 0 && selectedIds.length < paginatedContacts.length;

  // Handle Edit Click
  const handleEditClick = () => {
    // Find the selected contact object
    const selectedContact = contacts.find((c) => (c._id) === selectedIds[0]);
    if (selectedContact && onEdit) {
      onEdit(selectedContact);
    }
  };

  const getSelectedContacts = () => {
    return contacts.filter((c) => selectedIds.includes(c._id));
  };

  const handleSendMail = () => {
    setIsSendMailOpen(true);
  };

  const handleSendMessage = () => {
    const selected = getSelectedContacts().map((c) => ({
      name: c.name,
      phone: c.mobile,
    }));
    setSelectedContactsForMessage(selected);
    setIsSendMessageOpen(true);
  };

  return (
    <section id="contactsView" className="view-section active">
      <div className="view-scroll-wrapper">
        <div className="page-header">
          <div className="page-title-group">
            <i className="fas fa-bars" style={{ color: "#68737d" }}></i>
            <div>
              <span className="working-list-label">Database CRM</span>
              <h1>Contacts Portfolio</h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {/* Sync Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <i className="fas fa-check-circle text-green-600 text-sm"></i>
              <span className="text-xs font-semibold text-green-700">
                Synced
              </span>
            </div>
            {/* View Toggle Button */}
            <button
              className="btn-outline"
              onClick={() => setViewMode(viewMode === "list" ? "card" : "list")}
              title={
                viewMode === "list"
                  ? "Switch to Card View"
                  : "Switch to List View"
              }
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <i
                className={`fas ${viewMode === "list" ? "fa-th-large" : "fa-list"}`}
              ></i>
              {viewMode === "list" ? "Card" : "List"}
            </button>
            <button
              className="btn-outline"
              onClick={() => setIsFilterPanelOpen(true)}
              style={{ position: 'relative' }}
            >
              <i className="fas fa-filter"></i> Filters
              {Object.keys(filters).length > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                }}></span>
              )}
            </button>
          </div>
        </div>

        <div
          className="content-body"
          style={{ overflowY: "visible", paddingTop: 0, position: "relative" }}
        >
          {/* Toolbar */}
          <div
            className="toolbar-container"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 101,
              padding: "15px var(--row-padding)",
              borderBottom: "1px solid #eef2f5",
              minHeight: "65px",
              display: "flex",
              alignItems: "center",
              background: "#fff",
            }}
          >
            {selectedCount > 0 ? (
              <div
                className="action-panel"
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  width: "100%",
                  overflowX: "auto",
                  paddingTop: "4px",
                  paddingBottom: "2px",
                }}
              >
                {/* Select All Checkbox - Always visible */}
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = isIndeterminate;
                    }
                  }}
                  onChange={toggleSelectAll}
                  style={{ cursor: "pointer" }}
                />
                <div
                  className="selection-count"
                  style={{
                    marginRight: "10px",
                    fontWeight: 600,
                    color: "var(--primary-color)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedCount} Selected
                </div>

                {/* Single Selection Only */}
                {selectedCount === 1 && (
                  <>
                    <button
                      className="action-btn"
                      title="Call Contact"
                      onClick={() => {
                        const selected = getSelectedContacts()[0];
                        if (selected) {
                          const mobile = selected.mobile || selected.phones?.[0]?.number;
                          if (!mobile) {
                            toast.error('Invalid contact number');
                            return;
                          }
                          startCall({
                            name: selected.name,
                            mobile: mobile
                          }, {
                            purpose: 'Contact Update',
                            entityId: selected._id,
                            entityType: 'contact'
                          });
                        }
                      }}
                    >
                      <i
                        className="fas fa-phone-alt"
                        style={{ transform: "scaleX(-1) rotate(5deg)" }}
                      ></i>{" "}
                      Call
                    </button>
                    <div
                      style={{
                        width: "1px",
                        height: "24px",
                        background: "#e2e8f0",
                        margin: "0 4px",
                      }}
                    ></div>
                  </>
                )}

                {/* Email - Always show */}
                <button
                  className="action-btn"
                  title="Email Contact"
                  onClick={handleSendMail}
                >
                  <i className="fas fa-envelope"></i> Email
                </button>

                {/* Single Selection Only - Edit & Create Lead */}
                {selectedCount === 1 && (
                  <>
                    <button
                      className="action-btn"
                      title="Edit Contact"
                      onClick={handleEditClick}
                    >
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button
                      className="action-btn"
                      title="Create Lead"
                      onClick={() => {
                        const selectedContact = contacts.find(
                          (c) => (c._id) === selectedIds[0],
                        );
                        if (selectedContact) {
                          setContactForLead(selectedContact);
                          setIsAddLeadModalOpen(true);
                        }
                      }}
                    >
                      <i className="fas fa-user-plus"></i> Create Lead
                    </button>
                  </>
                )}

                {/* Action Buttons - Available for all selections */}
                <button
                  className="action-btn"
                  title="Activities"
                  onClick={() => {
                    const selectedContacts = contacts.filter((c) =>
                      selectedIds.includes(c._id),
                    );
                    const relatedTo = selectedContacts.map((c) => ({
                      id: c._id,
                      name: c.name,
                      mobile: c.mobile,
                    }));
                    onAddActivity(relatedTo);
                  }}
                >
                  <i className="fas fa-calendar-check"></i> Activities
                </button>
                <button
                  className="action-btn"
                  title="Documents"
                  onClick={() => {
                    const selected = getSelectedContacts();
                    if (selected.length === 1) {
                      setDocumentModalData({
                        ownerId: selected[0]._id,
                        ownerType: 'Contact',
                        ownerName: selected[0].name
                      });
                      setIsDocumentModalOpen(true);
                    }
                  }}
                >
                  <i className="fas fa-file-alt"></i> Documents
                </button>
                <button
                  className="action-btn"
                  title="Assign"
                  onClick={handleAssignClick}
                >
                  <i className="fas fa-exchange-alt"></i> Assign
                </button>
                <button
                  className="action-btn"
                  title="Tag"
                  onClick={handleTagClick}
                >
                  <i className="fas fa-tag"></i> Tag
                </button>
                <button
                  className="action-btn"
                  title="Sequence"
                  onClick={() => {
                    const selected = getSelectedContacts();
                    if (selected.length === 1) {
                      setSelectedContactForSequence({
                        id: selected[0]._id || selected[0].mobile,
                        name: selected[0].name
                      });
                      setIsEnrollModalOpen(true);
                    } else {
                      toast.error("Please select a single contact to enroll in sequence");
                    }
                  }}
                >
                  <i className="fas fa-stream"></i> Sequence
                </button>
                <button
                  className="action-btn"
                  style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }}
                  onClick={() => {
                    const selected = getSelectedContacts();
                    let count = 0;
                    selected.forEach(contact => {
                      const res = executeDistribution('contacts', contact, { users: [], teams: [] });
                      if (res.success) count++;
                    });
                    toast.success(`Distributed ${count} contacts using active rules.`);
                    setSelectedIds([]);
                  }}
                >
                  <i className="fas fa-random"></i> Distribute
                </button>
                <button
                  className="action-btn"
                  onClick={handleSendMessage}
                  title="Send Message"
                >
                  <i className="fas fa-paper-plane"></i> Send Message
                </button>

                <div style={{ marginLeft: "auto" }}>
                  <button
                    className="action-btn danger"
                    onClick={delete_contact}
                    title="Delete"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "15px" }}
                >
                  {/* Select All Checkbox - Only for Card View */}
                  {viewMode === "card" && (
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = isIndeterminate;
                        }
                      }}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  )}
                  <div style={{ position: "relative", width: "350px" }}>
                    <input
                      type="text"
                      className="search-input-premium"
                      placeholder="Search by name, phone or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ width: "100%" }}
                    />
                    <i
                      className={`fas fa-search search-icon-premium ${searchTerm ? "active" : ""}`}
                    ></i>
                  </div>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "15px" }}
                >
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Showing: <strong>{paginatedContacts.length}</strong> /{" "}
                    <strong>{totalCount}</strong>
                  </div>

                  {/* Records Per Page */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "0.8rem",
                      color: "#64748b",
                    }}
                  >
                    <span>Show:</span>
                    <select
                      value={recordsPerPage}
                      onChange={handleRecordsPerPageChange}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#0f172a",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={300}>300</option>
                      <option value={500}>500</option>
                      <option value={700}>700</option>
                      <option value={1000}>1000</option>
                    </select>
                  </div>

                  {/* Pagination Controls */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1 || loading}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        background: currentPage === 1 ? "#f8fafc" : "#fff",
                        color: currentPage === 1 ? "#cbd5e1" : "#0f172a",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      <i className="fas fa-chevron-left"></i> Prev
                    </button>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#0f172a",
                        minWidth: "80px",
                        textAlign: "center",
                      }}
                    >
                      {currentPage} / {totalPages || 1}
                    </span>
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage >= totalPages || loading}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        background:
                          currentPage >= totalPages ? "#f8fafc" : "#fff",
                        color:
                          currentPage >= totalPages ? "#cbd5e1" : "#0f172a",
                        cursor:
                          currentPage >= totalPages ? "not-allowed" : "pointer",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      Next <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Filters Chips */}
          <ActiveFiltersChips
            filters={filters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAll}
          />

          {/* Loading State */}
          {loading && (
            <div
              style={{
                position: "absolute",
                top: "65px",
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(255,255,255,0.7)",
                zIndex: 200,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                className="spinner"
                style={{
                  width: "30px",
                  height: "30px",
                  border: "3px solid #f3f3f3",
                  borderTop: "3px solid #3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
              <span style={{ color: "#64748b", fontWeight: 600 }}>
                Loading contacts...
              </span>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* List View */}
          {viewMode === "list" ? (
            <>
              {/* Header Strip (Pati) */}
              <div
                className="list-header contact-list-grid"
                style={{ position: "sticky", top: "65px", zIndex: 100 }}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = isIndeterminate;
                    }
                  }}
                  onChange={toggleSelectAll}
                  style={{ cursor: "pointer" }}
                />
                <div>Personal Details</div>
                <div>Location & Address</div>
                <div>Professional Detail</div>
                <div>Source & Tags</div>
                <div>CRM Linkage</div>
                <div>Last Interaction</div>
                <div style={{ paddingLeft: "10px" }}>Assignment</div>
              </div>

              <div id="contactListContent">
                {Object.keys(groups).map((groupName) => (
                  <div key={groupName} className="list-group">
                    <div
                      className="group-header"
                      style={{
                        padding: "12px var(--row-padding)",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {groupName.toUpperCase()}
                    </div>
                    {groups[groupName].map((item, idx) => (
                      <div
                        key={item._id || idx}
                        className="list-item contact-list-grid"
                        style={{
                          padding: "15px 2rem",
                          background: isSelected(item?._id)
                            ? "#f0f9ff"
                            : "#fff",
                          transition: "all 0.2s",
                        }}
                        onMouseOver={(e) => {
                          if (!isSelected(item?._id))
                            e.currentTarget.style.background = "#fafbfc";
                        }}
                        onMouseOut={(e) => {
                          if (!isSelected(item?._id))
                            e.currentTarget.style.background = "#fff";
                          else e.currentTarget.style.background = "#f0f9ff";
                        }}
                      >
                        <input
                          type="checkbox"
                          className="item-check"
                          checked={isSelected(item?._id)}
                          onChange={() => toggleSelect(item?._id)}
                        />
                        <div className="col-identity">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "15px",
                            }}
                          >
                            <div
                              className={`avatar-circle avatar-${(idx % 5) + 1}`}
                              style={{
                                width: "38px",
                                height: "38px",
                                fontSize: "0.85rem",
                              }}
                            >
                              {getInitials(
                                (item.firstName && item.surname) ? `${item.firstName} ${item.surname}` :
                                  (item.name && item.surname) ? `${item.name} ${item.surname}` :
                                    (item.name || item.firstName || "Unknown")
                              )}
                            </div>
                            <div>
                              <div
                                style={{
                                  fontWeight: 800,
                                  color: "var(--primary-color)",
                                  fontSize: "0.95rem",
                                  cursor: "pointer",
                                }}
                                onClick={() =>
                                  onNavigate("contact-detail", item._id)
                                }
                              >
                                {item.title?.lookup_value || item.title || ""} {
                                  // Priority 1: firstName + surname
                                  (item.firstName && item.surname) ? `${item.firstName} ${item.surname}` :
                                    // Priority 2: name + surname (when firstName is null but surname exists)
                                    (item.name && item.surname) ? `${item.name} ${item.surname}` :
                                      // Priority 3: just name or firstName
                                      (item.name || item.firstName || "Unknown Name")
                                }
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  color: "#475569",
                                  marginTop: "3px",
                                }}
                              >
                                {item?.phones?.[0]?.number ||
                                  item?.mobile ||
                                  "No Mobile"}
                              </div>
                              {item?.emails?.[0]?.address && (
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#8e44ad",
                                    fontWeight: 600,
                                    marginTop: "2px",
                                  }}
                                >
                                  <i
                                    className="fas fa-envelope"
                                    style={{
                                      marginRight: "4px",
                                      fontSize: "0.65rem",
                                    }}
                                  ></i>
                                  {item.emails[0].address}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="col-address">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                            }}
                          >
                            <i
                              className="fas fa-map-marker-alt"
                              style={{
                                color: "#ef4444",
                                fontSize: "0.75rem",
                                marginTop: "4px",
                              }}
                            ></i>
                            <div
                              className="address-clamp"
                              style={{
                                fontSize: "0.8rem",
                                color: "#475569",
                                fontWeight: 500,
                                lineHeight: 1.4,
                              }}
                            >
                              {item?.personalAddress ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <div>{`${item.personalAddress?.hNo || ""}, ${item.personalAddress?.street || ""}, ${item.personalAddress?.location?.lookup_value || item.personalAddress?.location || ""}`.replace(/^, |, $/g, "").replace(/, , /g, ", ")}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {`${item.personalAddress?.area || ""}, ${item.personalAddress?.city?.lookup_value || item.personalAddress?.city || ""}, ${item.personalAddress?.state?.lookup_value || item.personalAddress?.state || ""} ${item.personalAddress?.pinCode || ""}`.replace(/^, |, $/g, "").replace(/, , /g, ", ")}
                                  </div>
                                </div>
                              ) : (typeof item?.address === 'string' ? item.address : "Address not listed")}
                            </div>
                          </div>
                        </div>

                        <div className="col-classification">
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "5px",
                            }}
                          >
                            <span
                              className="prof-badge"
                              style={{
                                fontSize: "0.6rem",
                                padding: "3px 10px",
                                fontWeight: 800,
                              }}
                            >
                              {(
                                item?.professionCategory?.lookup_value ||
                                item?.professionCategory ||
                                item?.professional?.lookup_value ||
                                item?.professional ||
                                "N/A"
                              ).toUpperCase()}
                            </span>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "#0f172a",
                                fontWeight: 700,
                              }}
                            >
                              {item?.designation?.lookup_value || item?.designation || "-"}
                            </div>
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "#64748b",
                                fontWeight: 600,
                              }}
                            >
                              <i
                                className="fas fa-building"
                                style={{
                                  marginRight: "4px",
                                  fontSize: "0.65rem",
                                }}
                              ></i>
                              {item?.company || "-"}
                            </div>
                          </div>
                        </div>

                        {/* Source & Tags Column */}
                        <div className="col-source-tags">
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            <span
                              className="source-badge"
                              style={{
                                fontSize: "0.65rem",
                                padding: "3px 8px",
                                fontWeight: 700,
                                borderRadius: "4px",
                                background: "#ede9fe",
                                color: "#6b21a8",
                                display: "inline-block",
                                width: "fit-content",
                              }}
                            >
                              <i
                                className="fas fa-tag"
                                style={{
                                  marginRight: "3px",
                                  fontSize: "0.6rem",
                                }}
                              ></i>
                              {item?.campaign?.lookup_value || item?.campaign ? `${item.campaign?.lookup_value || item.campaign} • ` : ""}{item?.source?.lookup_value || item?.source || "N/A"}
                            </span>
                            {item?.tags && item?.tags?.length > 0 && (
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "#64748b",
                                  fontWeight: 600,
                                }}
                              >
                                {Array.isArray(item.tags)
                                  ? item.tags.join(", ")
                                  : item.tags}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* CRM Linkage Column */}
                        <div className="col-crm-linkage">
                          {item?.crmLinks &&
                            Object.keys(item.crmLinks).length > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px",
                              }}
                            >
                              {item?.crmLinks?.leads && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "2px 6px",
                                    background: "#dbeafe",
                                    color: "#1e40af",
                                    borderRadius: "4px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-user-plus"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.6rem",
                                    }}
                                  ></i>
                                  Leads ({item.crmLinks.leads})
                                </span>
                              )}
                              {item?.crmLinks?.deals && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "2px 6px",
                                    background: "#dcfce7",
                                    color: "#166534",
                                    borderRadius: "4px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-handshake"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.6rem",
                                    }}
                                  ></i>
                                  Deals ({item.crmLinks.deals})
                                </span>
                              )}
                              {/* ... Add other checks similarly if needed, or rely on Object.keys check above */}
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "#cbd5e1",
                                fontStyle: "italic",
                              }}
                            >
                              -
                            </div>
                          )}
                        </div>
                        <div className="col-interaction">
                          <div style={{ lineHeight: "1.4" }}>
                            <div
                              style={{
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: "#1e293b",
                              }}
                            >
                              {item?.lastComm || "Never"}
                            </div>
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "#94a3b8",
                                fontWeight: 600,
                              }}
                            >
                              Active: {item?.actionable || "No"}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                marginTop: "6px",
                              }}
                            >
                              <i
                                className="fas fa-phone-alt"
                                style={{
                                  color: "#388E3C",
                                  fontSize: "0.75rem",
                                  transform: "scaleX(-1) rotate(5deg)",
                                }}
                              ></i>
                            </div>
                          </div>
                        </div>

                        <div className="col-assignment">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <div
                              className="profile-circle"
                              style={{
                                width: "28px",
                                height: "28px",
                                fontSize: "0.65rem",
                                background: "#f1f5f9",
                                color: "#64748b",
                              }}
                            >
                              {getInitials(
                                typeof (item?.owner || item?.ownership) === 'object'
                                  ? (item?.owner?.name || item?.ownership?.lookup_value || "Admin")
                                  : (item?.owner || item?.ownership || "Admin")
                              )}
                            </div>
                            <div style={{ lineHeight: 1.2 }}>
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  fontWeight: 800,
                                  color: "#0f172a",
                                }}
                              >
                                {typeof (item?.owner || item?.ownership) === 'object'
                                  ? (item?.owner?.name || item?.ownership?.lookup_value || "Admin")
                                  : (item?.owner || item?.ownership || "Admin")}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                {getTeamName(item?.team || item?.assignment?.team)}
                              </div>
                              <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '2px' }}>
                                <i className="far fa-clock" style={{ marginRight: '4px' }}></i>
                                {item.createdAt ? new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Card View - Professional Contact Cards (Compact) */
            <div style={{ padding: "1.5rem" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "16px",
                }}
              >
                {paginatedContacts.map((item, idx) => (
                  <div
                    key={item._id || idx}
                    style={{
                      background: isSelected(item?._id)
                        ? "#f0f9ff"
                        : "#fff",
                      border: `2px solid ${isSelected(item?._id) ? "#3b82f6" : "#e5e7eb"}`,
                      borderRadius: "10px",
                      overflow: "hidden",
                      transition: "all 0.2s",
                      boxShadow: isSelected(item?._id)
                        ? "0 4px 12px rgba(59, 130, 246, 0.15)"
                        : "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected(item?._id)) {
                        e.currentTarget.style.boxShadow =
                          "0 4px 12px rgba(0,0,0,0.15)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected(item?._id)) {
                        e.currentTarget.style.boxShadow =
                          "0 1px 3px rgba(0,0,0,0.1)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }
                    }}
                  >
                    {/* Card Header with Avatar & Checkbox */}
                    <div
                      style={{
                        padding: "12px",
                        background: isSelected(item?._id)
                          ? "#dbeafe"
                          : "#f9fafb",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          className={`avatar-circle avatar-${(idx % 5) + 1}`}
                          style={{
                            width: "40px",
                            height: "40px",
                            fontSize: "0.9rem",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(item?.name || "Unknown")}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: "var(--primary-color)",
                              fontSize: "0.9rem",
                              marginBottom: "2px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              onNavigate("contact-detail", item._id)
                            }
                          >
                            {item?.name || "Unknown Name"}
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "#6b7280",
                              fontWeight: 600,
                            }}
                          >
                            <i
                              className="fas fa-phone-alt"
                              style={{
                                marginRight: "4px",
                                fontSize: "0.65rem",
                              }}
                            ></i>
                            {item?.phones?.[0]?.number ||
                              item?.mobile ||
                              "No Mobile"}
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected(item?._id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(item?._id);
                        }}
                        style={{
                          width: "16px",
                          height: "16px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      />
                    </div>

                    {/* Card Body - Contact Details */}
                    <div style={{ padding: "12px" }}>
                      {/* Email */}
                      {item?.emails?.[0]?.address && (
                        <div
                          style={{
                            marginBottom: "10px",
                            paddingBottom: "10px",
                            borderBottom: "1px solid #f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <i
                            className="fas fa-envelope"
                            style={{
                              color: "#8b5cf6",
                              fontSize: "0.75rem",
                              width: "14px",
                              flexShrink: 0,
                            }}
                          ></i>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#6b7280",
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.emails[0].address}
                          </span>
                        </div>
                      )}

                      {/* Professional Details Section */}
                      <div
                        style={{
                          marginBottom: "10px",
                          paddingBottom: "10px",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#9ca3af",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Professional
                        </div>
                        <span
                          className="prof-badge"
                          style={{
                            fontSize: "0.6rem",
                            padding: "2px 6px",
                            fontWeight: 800,
                            marginBottom: "4px",
                            display: "inline-block",
                          }}
                        >
                          {(
                            item?.professionCategory?.lookup_value ||
                            item?.professional?.lookup_value ||
                            "N/A"
                          ).toUpperCase()}
                        </span>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#111827",
                            marginBottom: "3px",
                          }}
                        >
                          {item?.designation?.lookup_value || item?.designation || "-"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "#6b7280",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <i
                            className="fas fa-building"
                            style={{ fontSize: "0.65rem" }}
                          ></i>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item?.company || "-"}
                          </span>
                        </div>
                      </div>

                      {/* Address Section */}
                      <div
                        style={{
                          marginBottom: "10px",
                          paddingBottom: "10px",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#9ca3af",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Address
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "start",
                            gap: "6px",
                          }}
                        >
                          <i
                            className="fas fa-map-marker-alt"
                            style={{
                              color: "#ef4444",
                              fontSize: "0.75rem",
                              marginTop: "2px",
                            }}
                          ></i>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "#6b7280",
                              fontWeight: 600,
                              lineHeight: 1.3,
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {item?.personalAddress?.city
                              ? `${item.personalAddress?.city?.lookup_value || item.personalAddress?.city || ''}, ${item.personalAddress?.state?.lookup_value || item.personalAddress?.state || ''}`
                              : item?.address || "Address not listed"}
                          </div>
                        </div>
                      </div>

                      {/* Source & Tags Section */}
                      <div
                        style={{
                          marginBottom: "10px",
                          paddingBottom: "10px",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#9ca3af",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Source
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            background: "#ede9fe",
                            color: "#6b21a8",
                          }}
                        >
                          <i
                            className="fas fa-tag"
                            style={{ fontSize: "0.6rem" }}
                          ></i>
                          {item?.source?.lookup_value || item?.source || "N/A"}
                        </span>
                      </div>

                      {/* CRM Linkage Section */}
                      {item?.crmLinks &&
                        Object.keys(item.crmLinks).length > 0 && (
                          <div
                            style={{
                              marginBottom: "10px",
                              paddingBottom: "10px",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 800,
                                color: "#9ca3af",
                                marginBottom: "4px",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              CRM Activity
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "3px",
                              }}
                            >
                              {item?.crmLinks?.leads && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    padding: "2px 5px",
                                    background: "#dbeafe",
                                    color: "#1e40af",
                                    borderRadius: "3px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-user-plus"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.55rem",
                                    }}
                                  ></i>
                                  {item.crmLinks.leads}
                                </span>
                              )}
                              {item?.crmLinks?.deals && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    padding: "2px 5px",
                                    background: "#dcfce7",
                                    color: "#166534",
                                    borderRadius: "3px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-handshake"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.55rem",
                                    }}
                                  ></i>
                                  {item.crmLinks.deals}
                                </span>
                              )}
                              {item?.crmLinks?.property && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    padding: "2px 5px",
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    borderRadius: "3px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-building"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.55rem",
                                    }}
                                  ></i>
                                  {item.crmLinks.property}
                                </span>
                              )}
                              {item?.crmLinks?.booking && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    padding: "2px 5px",
                                    background: "#fce7f3",
                                    color: "#9f1239",
                                    borderRadius: "3px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-calendar-check"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.55rem",
                                    }}
                                  ></i>
                                  {item.crmLinks.booking}
                                </span>
                              )}
                              {item?.crmLinks?.activities && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    padding: "2px 5px",
                                    background: "#fed7aa",
                                    color: "#7c2d12",
                                    borderRadius: "3px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <i
                                    className="fas fa-tasks"
                                    style={{
                                      marginRight: "2px",
                                      fontSize: "0.55rem",
                                    }}
                                  ></i>
                                  {item.crmLinks.activities}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Last Interaction Section */}
                      <div
                        style={{
                          marginBottom: "10px",
                          paddingBottom: "10px",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#9ca3af",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Last Interaction
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#111827",
                            marginBottom: "3px",
                          }}
                        >
                          {item?.lastComm || "Never"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "#6b7280",
                            fontWeight: 600,
                            marginBottom: "4px",
                          }}
                        >
                          Active: {item?.actionable || "No"}
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <i
                            className="fas fa-phone-alt"
                            style={{ color: "#16a34a", fontSize: "0.8rem" }}
                          ></i>
                          <i
                            className="fab fa-whatsapp"
                            style={{ color: "#25d366", fontSize: "0.8rem" }}
                          ></i>
                        </div>
                      </div>

                      {/* Assigned To Section */}
                      <div>
                        <div
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#9ca3af",
                            marginBottom: "4px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Assigned To
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: "#f3f4f6",
                              color: "#6b7280",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {(item?.ownership || "Admin").charAt(0)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 800,
                                color: "#111827",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item?.ownership || "Admin"}
                            </div>
                            <div
                              style={{
                                fontSize: "0.6rem",
                                color: "#9ca3af",
                                fontWeight: 600,
                              }}
                            >
                              Added{" "}
                              {item?.addOnDate
                                ? new Date(item.addOnDate).toLocaleDateString()
                                : "-"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
          }
        </div >
      </div >
      <footer
        className="summary-footer"
        style={{ height: "60px", padding: "0 var(--row-padding)" }}
      >
        <div
          className="summary-label"
          style={{
            background: "#334155",
            color: "#fff",
            padding: "4px 12px",
            borderRadius: "6px",
            fontSize: "0.7rem",
          }}
        >
          SUMMARY
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <div className="stat-pill">
            TOTAL CONTACTS <strong>{totalCount}</strong>
          </div>
          <div className="stat-pill">
            CUSTOMERS{" "}
            <strong>
              {contacts.filter((c) => c.category === "Customer").length}
            </strong>
          </div>
          <div className="stat-pill">
            PROSPECTS{" "}
            <strong>
              {contacts.filter((c) => c.category === "Prospect").length}
            </strong>
          </div>
          <div className="stat-pill" style={{ color: "var(--primary-color)" }}>
            REAL ESTATE AGENTS{" "}
            <strong>
              {
                contacts.filter((c) => c.category === "Real Estate Agent")
                  .length
              }
            </strong>
          </div>
        </div>
      </footer>



      <SendMailModal
        isOpen={isSendMailOpen}
        onClose={() => setIsSendMailOpen(false)}
        onSend={() => {
          alert("Email sent successfully!");
          setIsSendMailOpen(false);
        }}
      />

      {/* Add Lead Modal */}
      <AddLeadModal
        isOpen={isAddLeadModalOpen}
        onClose={() => {
          setIsAddLeadModalOpen(false);
          setContactForLead(null);
        }}
        contactData={contactForLead}
        onAdd={(leadData) => {
          console.log("Lead Added:", leadData);

          // Update the leads count for the contact in local state
          if (contactForLead) {
            setContacts((prevContacts) =>
              prevContacts.map((c) => {
                if (c.mobile === contactForLead.mobile) {
                  const currentLeads = c.crmLinks?.leads || 0;
                  return {
                    ...c,
                    crmLinks: { ...c.crmLinks, leads: currentLeads + 1 },
                  };
                }
                return c;
              }),
            );
          }

          toast.success("Lead Created Successfully!");
          setIsAddLeadModalOpen(false);
          setContactForLead(null);
          // Trigger refresh to show updated lead count
          setRefreshTrigger(prev => prev + 1);
        }}
      />

      {/* Send Message Modal */}
      <SendMessageModal
        isOpen={isSendMessageOpen}
        onClose={() => setIsSendMessageOpen(false)}
        initialRecipients={selectedContactsForMessage}
        onSend={(data) => {
          console.log("Sending Message:", data);
          alert("Message Sent Successfully!");
          setIsSendMessageOpen(false);
        }}
      />

      {/* Assign Contact Modal */}
      <AssignContactModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        selectedContacts={selectedContactsForAssign}
        onAssign={(assignmentDetails) => {
          console.log("Assignment Details:", assignmentDetails);
          // Update local state to reflect assignment
          setContacts((prev) =>
            prev.map((c) => {
              const contactId = c.id || c.mobile;
              if (assignmentDetails.contacts.includes(contactId)) {
                return { ...c, ownership: "Assigned User" };
              }
              return c;
            }),
          );
          setIsAssignModalOpen(false);
          setSelectedIds([]); // Clear selection after assignment
        }}
      />

      {/* Manage Tags Modal */}
      <ManageTagsModal
        isOpen={isTagsModalOpen}
        onClose={() => setIsTagsModalOpen(false)}
        selectedContacts={selectedContactsForTags}
        onUpdateTags={(payload) => {
          console.log("Tags Updated:", payload);
          // Update local state
          setContacts((prev) =>
            prev.map((c) => {
              const contactId = c.id || c.mobile;
              if (payload.contactIds.includes(contactId)) {
                let newTags =
                  c.tags && c.tags !== "-"
                    ? c.tags.split(",").map((t) => t.trim())
                    : [];

                if (payload.mode === "overwrite") {
                  newTags = payload.tags;
                } else if (payload.mode === "add") {
                  newTags = [...new Set([...newTags, ...payload.tags])];
                } else if (payload.mode === "remove") {
                  newTags = newTags.filter((t) => !payload.tags.includes(t));
                }

                return {
                  ...c,
                  tags: newTags.length > 0 ? newTags.join(", ") : "-",
                };
              }
              return c;
            }),
          );
          setIsTagsModalOpen(false);
          // Don't clear selection for bulk tag actions usually, as user might want to do more?
          // But prompt implies flow is done. Let's clear to be consistent.
          setSelectedIds([]);
        }}
      />

      {/* Enroll Sequence Modal */}
      <EnrollSequenceModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        entityId={selectedContactForSequence?.id}
        entityName={selectedContactForSequence?.name}
      />
      {/* Filter Panel */}
      <ContactFilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        filters={filters}
        onFilterChange={(newFilters) => {
          setFilters(newFilters);
          // Optimally we would reset page to 1 and refetch with filters here if API supported it
        }}
      />

      {isDocumentModalOpen && (
        <DocumentUploadModal
          isOpen={isDocumentModalOpen}
          onClose={() => setIsDocumentModalOpen(false)}
          ownerId={documentModalData?.ownerId}
          ownerType={documentModalData?.ownerType}
          ownerName={documentModalData?.ownerName}
        />
      )}
    </section >
  );
}

export default ContactsPage;
