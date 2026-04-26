import { useState, useEffect, useCallback, useMemo, memo } from "react";
import toast from "react-hot-toast";
import Swal from 'sweetalert2';

import { api, contactsAPI } from "../../utils/api";
import { getInitials } from "../../utils/helpers";
import { useContactSync } from "../../hooks/useContactSync";
import ComposeEmailModal from "../Communication/components/ComposeEmailModal";
import AddLeadModal from "../../components/AddLeadModal";
import SendMessageModal from "../../components/SendMessageModal";
import AssignContactModal from "../../components/AssignContactModal";
import ManageTagsModal from "../../components/ManageTagsModal";
import { useCall } from "../../context/CallContext";
import { useDistribution } from "../../context/DistributionContext";
import EnrollSequenceModal from "../../components/EnrollSequenceModal";
import ContactFilterPanel from "./components/ContactFilterPanel";
import { applyContactFilters } from "../../utils/contactFilterLogic";
import ActiveFiltersChips from "../../components/ActiveFiltersChips";
import { useUserContext } from "../../context/UserContext";
import DocumentUploadModal from "../../components/DocumentUploadModal";
import { usePropertyConfig } from "../../context/PropertyConfigContext";
import { renderValue } from "../../utils/renderUtils";
import usePermissions, { PermissionGate } from '../../hooks/usePermissions';

// ─── DEBOUNCE UTILITY ──────────────────────────────────────────────────────────
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

// ─── MEMOIZED SUB-COMPONENTS ──────────────────────────────────────────────────

const ContactRow = memo(function ContactRow({
  item,
  isSelected,
  toggleSelect,
  onNavigate,
  getLookupValue,
  getUserName,
  getTeamName,
  renderValue,
  getInitials
}) {
  return (
    <div
      className="list-item contact-list-grid"
      style={{
        padding: "15px 2rem",
        background: isSelected ? "#f0f9ff" : "#fff",
        transition: "all 0.2s",
      }}
      onMouseOver={(e) => {
        if (!isSelected) e.currentTarget.style.background = "#fafbfc";
      }}
      onMouseOut={(e) => {
        if (!isSelected) e.currentTarget.style.background = "#fff";
        else e.currentTarget.style.background = "#f0f9ff";
      }}
    >
      <input
        type="checkbox"
        className="item-check"
        checked={isSelected}
        onChange={() => toggleSelect(item?._id)}
      />
      <div className="col-identity">
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div
            className={`avatar-circle avatar-${(item._id.charCodeAt(0) % 5) + 1}`}
            style={{ width: "38px", height: "38px", fontSize: "0.85rem" }}
          >
            {getInitials(
              (item.firstName && item.surname) ? `${item.firstName} ${item.surname}` :
                (item.name && item.surname) ? `${item.name} ${item.surname}` :
                  (item.name || item.firstName || "Unknown")
            )}
          </div>
          <div>
            <div
              style={{ fontWeight: 800, color: "var(--primary-color)", fontSize: "0.95rem", cursor: "pointer" }}
              onClick={() => onNavigate("contact-detail", item._id)}
            >
              {renderValue(getLookupValue("Title", item.title), null) || ""} {
                (item.firstName && item.surname) ? `${item.firstName} ${item.surname}` :
                  (item.name && item.surname) ? `${item.name} ${item.surname}` :
                    (item.name || item.firstName || "Unknown Name")
              }
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginTop: "3px" }}>
              {item?.phones?.[0]?.number || item?.mobile || "No Mobile"}
            </div>
            {item?.emails?.[0]?.address && (
              <div style={{ fontSize: "0.7rem", color: "#8e44ad", fontWeight: 600, marginTop: "2px" }}>
                <i className="fas fa-envelope" style={{ marginRight: "4px", fontSize: "0.65rem" }}></i>
                {item.emails[0].address}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-address">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <i className="fas fa-map-marker-alt" style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "4px" }}></i>
          <div className="address-clamp" style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 500, lineHeight: 1.4 }}>
            {item?.personalAddress ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div>{`${item.personalAddress?.hNo || ""}, ${item.personalAddress?.street || ""}, ${renderValue(getLookupValue("Location", item.personalAddress?.location), item.personalAddress?.location?.lookup_value || (typeof item.personalAddress?.location === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.personalAddress.location) ? item.personalAddress.location : ""))}`.replace(/^, |, $/g, "").replace(/, , /g, ", ")}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  {`${item.personalAddress?.area || ""}, ${renderValue(getLookupValue("City", item.personalAddress?.city), item.personalAddress?.city?.lookup_value || (typeof item.personalAddress?.city === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.personalAddress.city) ? item.personalAddress.city : ""))}, ${renderValue(getLookupValue("State", item.personalAddress?.state), item.personalAddress?.state?.lookup_value || (typeof item.personalAddress?.state === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.personalAddress.state) ? item.personalAddress.state : ""))}${item.personalAddress?.pinCode ? " " + item.personalAddress.pinCode : ""}`.replace(/^, |, $/g, "").replace(/, , /g, ", ")}
                </div>
              </div>
            ) : (typeof item?.address === 'string' ? item.address : "Address not listed")}
          </div>
        </div>
      </div>

      <div className="col-classification">
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span className="prof-badge" style={{ fontSize: "0.6rem", padding: "3px 10px", fontWeight: 800 }}>
            {(
              renderValue(getLookupValue("ProfessionalCategory", item.professionCategory), item.professionCategory?.lookup_value || (typeof item.professionCategory === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.professionCategory) ? item.professionCategory : "")) ||
              renderValue(getLookupValue("ProfessionalCategory", item.professional), item.professional?.lookup_value || (typeof item.professional === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.professional) ? item.professional : "")) ||
              "N/A"
            ).toUpperCase()}
          </span>
          <div style={{ fontSize: "0.8rem", color: "#0f172a", fontWeight: 700 }}>
            {renderValue(getLookupValue("ProfessionalDesignation", item.designation), item.designation?.lookup_value || (typeof item.designation === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.designation) ? item.designation : "-"))}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>
            <i className="fas fa-building" style={{ marginRight: "4px", fontSize: "0.65rem" }}></i>
            {item?.company || "-"}
          </div>
        </div>
      </div>

      <div className="col-source-tags">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span className="source-badge" style={{ fontSize: "0.65rem", padding: "3px 8px", fontWeight: 700, borderRadius: "4px", background: "#ede9fe", color: "#6b21a8", display: "inline-block", width: "fit-content" }}>
            <i className="fas fa-tag" style={{ marginRight: "3px", fontSize: "0.6rem" }}></i>
            {renderValue(getLookupValue("Campaign", item.campaign), null) || (typeof item?.campaign === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.campaign) ? item.campaign : "") ? `${renderValue(getLookupValue("Campaign", item.campaign), null) || (typeof item?.campaign === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.campaign) ? item.campaign : "")} • ` : ""}{renderValue(getLookupValue("Source", item.source), null) || (typeof item?.source === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.source) ? item.source : "N/A")}
          </span>
          {item?.tags && item?.tags?.length > 0 && (
            <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>
              {Array.isArray(item.tags)
                ? item.tags.map(t => renderValue(getLookupValue("Tag", t), (typeof t === 'string' && !/^[0-9a-fA-F]{24}$/.test(t) ? t : ""))).filter(v => v).join(", ")
                : renderValue(getLookupValue("Tag", item.tags), (typeof item.tags === 'string' && !/^[0-9a-fA-F]{24}$/.test(item.tags) ? item.tags : ""))}
            </div>
          )}
        </div>
      </div>

      <div className="col-crm-linkage">
        {item?.crmLinks && Object.keys(item.crmLinks).length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {item?.crmLinks?.leads && (
              <span style={{ fontSize: "0.65rem", padding: "2px 6px", background: "#dbeafe", color: "#1e40af", borderRadius: "4px", fontWeight: 700 }}>
                <i className="fas fa-user-plus" style={{ marginRight: "2px", fontSize: "0.6rem" }}></i>
                Leads ({item.crmLinks.leads})
              </span>
            )}
            {item?.crmLinks?.deals && (
              <span style={{ fontSize: "0.65rem", padding: "2px 6px", background: "#dcfce7", color: "#166534", borderRadius: "4px", fontWeight: 700 }}>
                <i className="fas fa-handshake" style={{ marginRight: "2px", fontSize: "0.6rem" }}></i>
                Deals ({item.crmLinks.deals})
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: "0.7rem", color: "#cbd5e1", fontStyle: "italic" }}>-</div>
        )}
      </div>

      <div className="col-interaction">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {(() => {
            const counts = item.interactionCounts || { call: 0, siteVisit: 0, meeting: 0, email: 0, sms: 0, whatsapp: 0 };
            const items = [
              { key: 'call', icon: 'fa-phone-alt', color: '#3b82f6', label: 'Call' },
              { key: 'whatsapp', icon: 'fa-whatsapp', color: '#25d366', label: 'WhatsApp', brand: true },
              { key: 'meeting', icon: 'fa-users', color: '#8b5cf6', label: 'Meeting' },
              { key: 'siteVisit', icon: 'fa-map-marked-alt', color: '#f59e0b', label: 'Site Visit' },
              { key: 'email', icon: 'fa-envelope', color: '#ef4444', label: 'Email' },
              { key: 'sms', icon: 'fa-sms', color: '#64748b', label: 'SMS' }
            ];
            const activeItems = items.filter(i => (counts[i.key] || 0) > 0);
            if (activeItems.length === 0) return <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>No interactions</span>;
            return activeItems.map(i => (
              <div key={i.key} title={`${counts[i.key]} ${i.label}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: `${i.color}10`, border: `1px solid ${i.color}30`, padding: '2px 6px', borderRadius: '4px', color: i.color, fontSize: '0.7rem', fontWeight: 700 }}>
                <i className={`${i.brand ? 'fab' : 'fas'} ${i.icon}`} style={{ fontSize: '0.65rem' }}></i>
                <span>{counts[i.key]}</span>
              </div>
            ));
          })()}
        </div>
      </div>
      <div className="col-assignment" style={{ textAlign: "right", paddingRight: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
          <div className="avatar-circle" style={{ width: "26px", height: "26px", fontSize: "0.65rem", background: "#f1f5f9", color: "#64748b", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, border: "1px solid #e2e8f0" }}>
            {getInitials(getUserName(item?.assignment?.assignedTo || item?.owner || item?.ownership))}
          </div>
          <div style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#0f172a" }}>
              {getUserName(item?.assignment?.assignedTo || item?.owner || item?.ownership)}
            </div>
            <div style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 700 }}>
              {getTeamName(item?.assignment?.team || item?.team)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const ContactCard = memo(function ContactCard({
  item,
  isSelected,
  toggleSelect,
  onNavigate,
  getLookupValue,
  getUserName,
  getTeamName,
  renderValue,
  getInitials
}) {
  return (
    <div
      style={{
        background: isSelected ? "#f0f9ff" : "#fff",
        border: `2px solid ${isSelected ? "#3b82f6" : "#e5e7eb"}`,
        borderRadius: "10px",
        overflow: "hidden",
        transition: "all 0.2s",
        boxShadow: isSelected ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "0 1px 3px rgba(0,0,0,0.1)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      <div style={{ padding: "12px", background: isSelected ? "#dbeafe" : "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          <div className={`avatar-circle avatar-${(item._id.charCodeAt(0) % 5) + 1}`} style={{ width: "40px", height: "40px", fontSize: "0.9rem", flexShrink: 0 }}>
            {getInitials(item?.name || "Unknown")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: "var(--primary-color)", fontSize: "0.9rem", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
              onClick={() => onNavigate("contact-detail", item._id)}>
              {item?.name || "Unknown Name"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600 }}>
              <i className="fas fa-phone-alt" style={{ marginRight: "4px", fontSize: "0.65rem" }}></i>
              {item?.phones?.[0]?.number || item?.mobile || "No Mobile"}
            </div>
          </div>
        </div>
        <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSelect(item?._id); }} style={{ width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }} />
      </div>

      <div style={{ padding: "12px" }}>
        {item?.emails?.[0]?.address && (
          <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "6px" }}>
            <i className="fas fa-envelope" style={{ color: "#8b5cf6", fontSize: "0.75rem", width: "14px", flexShrink: 0 }}></i>
            <span style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.emails[0].address}</span>
          </div>
        )}

        <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Professional</div>
          <span className="prof-badge" style={{ fontSize: "0.6rem", padding: "2px 6px", fontWeight: 800, marginBottom: "4px", display: "inline-block" }}>
            {(
              renderValue(getLookupValue("ProfessionalCategory", item.professionCategory), item.professionCategory?.lookup_value || (typeof item.professionCategory === 'string' ? item.professionCategory : "")) ||
              renderValue(getLookupValue("ProfessionalCategory", item.professional), item.professional?.lookup_value || (typeof item.professional === 'string' ? item.professional : "")) ||
              "N/A"
            ).toUpperCase()}
          </span>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#111827", marginBottom: "3px" }}>
            {renderValue(getLookupValue("ProfessionalDesignation", item.designation), item.designation?.lookup_value || (typeof item.designation === 'string' ? item.designation : "-"))}
          </div>
          <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            <i className="fas fa-building" style={{ fontSize: "0.65rem" }}></i>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item?.company || "-"}</span>
          </div>
        </div>

        <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Address</div>
          <div style={{ display: "flex", alignItems: "start", gap: "6px" }}>
            <i className="fas fa-map-marker-alt" style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "2px" }}></i>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {item?.personalAddress?.city
                ? `${renderValue(getLookupValue("City", item.personalAddress?.city), item.personalAddress?.city?.lookup_value || (typeof item.personalAddress?.city === 'string' ? item.personalAddress.city : ''))}, ${renderValue(getLookupValue("State", item.personalAddress?.state), item.personalAddress?.state?.lookup_value || (typeof item.personalAddress?.state === 'string' ? item.personalAddress.state : ''))}`
                : item?.address || "Address not listed"}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Assigned To & Actions</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#f3f4f6", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 }}>
                {getInitials(getUserName(item?.assignment?.assignedTo || item?.owner || item?.ownership))}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getUserName(item?.assignment?.assignedTo || item?.owner || item?.ownership)}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600 }}>
                  {getTeamName(item?.assignment?.team || item?.team)}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
});

// ─── MAIN CONTACTS PAGE ───────────────────────────────────────────────────────

function ContactsPage({ onEdit, onAddActivity, onNavigate }) {
  const { startCall } = useCall();
  const { executeDistribution } = useDistribution();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filters, setFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(25);
  const [viewMode, setViewMode] = useState("list");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendMailOpen, setIsSendMailOpen] = useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [contactForLead, setContactForLead] = useState(null);
  
  const { teams, users } = useUserContext();
  const { getLookupValue } = usePropertyConfig();

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: recordsPerPage,
        search: debouncedSearchTerm,
      });
      console.log("[Contacts Audit] Fetching contacts with params:", queryParams.toString());
      const response = await api.get(`contacts?${queryParams.toString()}`);
      console.log("[Contacts Audit] Response received Success:", response.data?.success, "Count:", response.data?.records?.length);
      
      if (response.data && response.data.success) {
        setContacts(response.data.records || []);
        setTotalRecords(response.data.totalCount || 0);
      } else {
        toast.error("Failed to fetch contacts: Invalid API response");
        setContacts([]);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error(error.message || "Error loading contacts");
    } finally {
      setLoading(false);
    }
  }, [currentPage, recordsPerPage, debouncedSearchTerm]);

  useEffect(() => {
    const handleRefresh = () => fetchContacts();
    window.addEventListener('contact-updated', handleRefresh);
    return () => window.removeEventListener('contact-updated', handleRefresh);
  }, [fetchContacts]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const getTeamName = useCallback((teamValue) => {
    if (!teamValue) return "-";
    if (Array.isArray(teamValue)) {
      if (teamValue.length === 0) return "-";
      return teamValue.map(t => {
        if (typeof t === 'object') return t.name || t.lookup_value || "-";
        const teamArray = Array.isArray(teams) ? teams : (teams?.data || []);
        const found = teamArray.find(team => (team._id === t) || (team.id === t));
        return found ? (found.name || found.lookup_value) : t;
      }).join(', ');
    }
    if (typeof teamValue === 'object') return teamValue.name || teamValue.lookup_value || "-";
    const teamArray = Array.isArray(teams) ? teams : (teams?.data || []);
    const found = teamArray.find(t => (t._id === teamValue) || (t.id === teamValue));
    if (found) return (found.name || found.lookup_value);
    if (typeof teamValue === 'string' && /^[0-9a-fA-F]{24}$/.test(teamValue)) return "Not Assigned";
    return teamValue;
  }, [teams]);

  const getUserName = useCallback((userValue) => {
    if (!userValue) return "-";
    if (typeof userValue === 'object') return userValue.fullName || userValue.name || userValue.lookup_value || userValue.username || "-";
    const userArray = Array.isArray(users) ? users : (users?.data || []);
    const found = userArray.find(u => (u._id === userValue) || (u.id === userValue));
    if (found) return (found.fullName || (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username)));
    if (typeof userValue === 'string' && /^[0-9a-fA-F]{24}$/.test(userValue)) return "Unassigned";
    return userValue;
  }, [users]);

  // Bulk Actions
  const delete_contact = async () => {
    if (!selectedIds?.length) return;
    const result = await Swal.fire({
      title: 'Bulk Delete Confirmation',
      text: `Are you sure you want to delete ${selectedIds.length} contact(s)?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: `Yes, delete ${selectedIds.length} contacts`
    });
    if (!result.isConfirmed) return;
    try {
      setLoading(true);
      await api.delete('contacts/bulk', { data: { ids: selectedIds } });
      toast.success("Contacts deleted successfully");
      setSelectedIds([]);
      fetchContacts();
    } catch (error) {
      toast.error("Failed to delete contacts");
    } finally {
      setLoading(false);
    }
  };

  const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
  const [selectedContactsForMessage, setSelectedContactsForMessage] = useState([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedContactsForAssign, setSelectedContactsForAssign] = useState([]);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [selectedContactsForTags, setSelectedContactsForTags] = useState([]);
  const [selectedContactsForMail, setSelectedContactsForMail] = useState([]);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedContactForSequence, setSelectedContactForSequence] = useState(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentModalData, setDocumentModalData] = useState(null);

  useContactSync();

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.length === contacts.length && contacts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c._id));
    }
  }, [contacts, selectedIds]);

  const getSelectedContacts = useCallback(() => contacts.filter((c) => selectedIds.includes(c._id)), [contacts, selectedIds]);

  const filteredContacts = useMemo(() => applyContactFilters(contacts, filters), [contacts, filters]);
  const totalPages = Math.ceil(totalRecords / recordsPerPage);

  const groups = useMemo(() => {
    const g = {};
    filteredContacts.forEach((c) => {
      const group = c?.group || "Others";
      if (!g[group]) g[group] = [];
      g[group].push(c);
    });
    return g;
  }, [filteredContacts]);

  const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };
  const handleRecordsPerPageChange = (e) => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); };

  const isAllSelected = contacts.length > 0 && selectedIds.length === contacts.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < contacts.length;

  const handleEditClick = () => {
    const selectedContact = contacts.find((c) => (c._id) === selectedIds[0]);
    if (selectedContact && onEdit) onEdit(selectedContact);
  };

  const handleSendMail = () => {
    const selected = getSelectedContacts().map((c) => ({ name: c.name, email: c.email }));
    setSelectedContactsForMail(selected);
    setIsSendMailOpen(true);
  };

  const handleSendMessage = () => {
    const selected = getSelectedContacts().map((c) => ({ name: c.name, phone: c.mobile }));
    setSelectedContactsForMessage(selected);
    setIsSendMessageOpen(true);
  };

  const handleSyncAll = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const response = await contactsAPI.syncAll();
      if (response.success) {
        toast.success(response.message || "Sync started in the background");
        setTimeout(() => setIsSyncing(false), 8000);
      } else {
        toast.error("Failed to start sync");
        setIsSyncing(false);
      }
    } catch (error) {
      toast.error("Synchronization failed to start");
      setIsSyncing(false);
    }
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
            <div className={`sync-status-badge ${isSyncing ? 'syncing' : ''}`} onClick={handleSyncAll} title="Sync all contacts to Google">
              <div className="sync-orbit-container">
                <div className="sync-orbit-ring"></div>
                {isSyncing ? <div className="sync-orbit-dot"></div> : <i className="fas fa-check-circle sync-icon-static"></i>}
              </div>
              <span className="sync-text">{isSyncing ? 'Syncing...' : 'Google Sync'}</span>
            </div>
            <button className="btn-outline" onClick={() => setViewMode(viewMode === "list" ? "card" : "list")}>
              <i className={`fas ${viewMode === "list" ? "fa-th-large" : "fa-list"}`}></i>
              {viewMode === "list" ? "Card" : "List"}
            </button>
            <button className="btn-outline" onClick={() => setIsFilterPanelOpen(true)} style={{ position: 'relative' }}>
              <i className="fas fa-filter"></i> Filters
              {Object.keys(filters).length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', background: 'red', borderRadius: '50%' }}></span>}
            </button>
          </div>
        </div>

        <div className="content-body" style={{ overflowY: "visible", paddingTop: 0, position: "relative" }}>
          {/* Toolbar */}
          <div className="toolbar-container" style={{ position: "sticky", top: 0, zIndex: 101, padding: "15px var(--row-padding)", borderBottom: "1px solid #eef2f5", minHeight: "65px", display: "flex", alignItems: "center", background: "#fff" }}>
            {selectedIds.length > 0 ? (
              <div className="action-panel" style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%", overflowX: "auto" }}>
                <input type="checkbox" checked={isAllSelected} ref={(input) => { if (input) input.indeterminate = isIndeterminate; }} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                <div className="selection-count" style={{ marginRight: "10px", fontWeight: 600, color: "var(--primary-color)", whiteSpace: "nowrap" }}>{selectedIds.length} Selected</div>
                {selectedIds.length === 1 && (
                  <button className="action-btn" onClick={() => {
                    const selected = getSelectedContacts()[0];
                    if (selected) {
                      const mobile = selected.mobile || selected.phones?.[0]?.number;
                      if (!mobile) return toast.error('Invalid contact number');
                      startCall({ name: selected.name, mobile: mobile }, { purpose: 'Contact Update', entityId: selected._id, entityType: 'contact' });
                    }
                  }}>
                    <i className="fas fa-phone-alt" style={{ transform: "scaleX(-1) rotate(5deg)" }}></i> Call
                  </button>
                )}
                <button className="action-btn" onClick={handleSendMail}><i className="fas fa-envelope"></i> Email</button>
                {selectedIds.length === 1 && (
                  <>
                    <PermissionGate module="contacts" action="edit">
                      <button className="action-btn" onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
                    </PermissionGate>
                    <button className="action-btn" onClick={() => {
                      const selectedContact = contacts.find((c) => (c._id) === selectedIds[0]);
                      if (selectedContact) { setContactForLead(selectedContact); setIsAddLeadModalOpen(true); }
                    }}><i className="fas fa-user-plus"></i> Create Lead</button>
                  </>
                )}
                <button className="action-btn" onClick={() => onAddActivity(getSelectedContacts().map(c => ({ id: c._id, name: c.name, mobile: c.mobile })))}><i className="fas fa-calendar-check"></i> Activities</button>
                {selectedIds.length === 1 && (
                   <button className="action-btn" onClick={() => {
                    const selected = getSelectedContacts()[0];
                    setDocumentModalData({ ownerId: selected._id, ownerType: 'Contact', ownerName: selected.name });
                    setIsDocumentModalOpen(true);
                  }}><i className="fas fa-file-alt"></i> Documents</button>
                )}
                <button className="action-btn" onClick={() => { setSelectedContactsForAssign(getSelectedContacts()); setIsAssignModalOpen(true); }}><i className="fas fa-exchange-alt"></i> Assign</button>
                <button className="action-btn" onClick={() => { setSelectedContactsForTags(getSelectedContacts()); setIsTagsModalOpen(true); }}><i className="fas fa-tag"></i> Tag</button>
                {selectedIds.length === 1 && (
                  <button className="action-btn" onClick={() => {
                    const selected = getSelectedContacts()[0];
                    setSelectedContactForSequence({ id: selected._id || selected.mobile, name: selected.name });
                    setIsEnrollModalOpen(true);
                  }}><i className="fas fa-stream"></i> Sequence</button>
                )}
                <button className="action-btn" style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }} onClick={() => {
                  let count = 0;
                  getSelectedContacts().forEach(contact => { if (executeDistribution('contacts', contact, { users: [], teams: [] }).success) count++; });
                  toast.success(`Distributed ${count} contacts.`);
                  setSelectedIds([]);
                }}><i className="fas fa-random"></i> Distribute</button>
                <button className="action-btn" onClick={handleSendMessage}><i className="fas fa-paper-plane"></i> Send Message</button>
                <div style={{ marginLeft: "auto" }}>
                  <PermissionGate module="contacts" action="delete">
                    <button className="action-btn danger" onClick={delete_contact}><i className="fas fa-trash-alt"></i></button>
                  </PermissionGate>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  {viewMode === "card" && <input type="checkbox" checked={isAllSelected} ref={(input) => { if (input) input.indeterminate = isIndeterminate; }} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />}
                  <div style={{ position: "relative", width: "350px" }}>
                    <input type="text" className="search-input-premium" placeholder="Search by name, phone or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: "100%" }} />
                    <i className={`fas fa-search search-icon-premium ${searchTerm ? "active" : ""}`}></i>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Showing: <strong>{filteredContacts.length}</strong> / <strong>{totalRecords}</strong></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#64748b" }}>
                    <span>Show:</span>
                    <select value={recordsPerPage} onChange={handleRecordsPerPageChange} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", outline: "none", cursor: "pointer" }}>
                      {[10, 25, 50, 100, 300, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  {/* Pagination Controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button onClick={goToPreviousPage} disabled={currentPage === 1 || loading} className="btn-pagination"><i className="fas fa-chevron-left"></i> Prev</button>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", minWidth: "80px", textAlign: "center" }}>{currentPage} / {totalPages || 1}</span>
                    <button onClick={goToNextPage} disabled={currentPage >= totalPages || loading} className="btn-pagination">Next <i className="fas fa-chevron-right"></i></button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <ActiveFiltersChips filters={filters} onRemoveFilter={(k) => { const n = { ...filters }; delete n[k]; setFilters(n); }} onClearAll={() => setFilters({})} />

          {loading && (
            <div style={{ position: "absolute", top: "65px", left: 0, right: 0, bottom: 0, background: "rgba(255,255,255,0.7)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column", gap: "10px" }}>
              <div className="spinner" style={{ width: "30px", height: "30px", border: "3px solid #f3f3f3", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
              <span style={{ color: "#64748b", fontWeight: 600 }}>Loading contacts...</span>
            </div>
          )}

          {viewMode === "list" ? (
            <>
              <div className="list-header contact-list-grid" style={{ position: "sticky", top: "65px", zIndex: 100 }}>
                <input type="checkbox" checked={isAllSelected} ref={(input) => { if (input) input.indeterminate = isIndeterminate; }} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                <div>ID & IDENTITY</div>
                <div>LOCATION</div>
                <div>PROFESSIONAL</div>
                <div>SOURCE & TAGS</div>
                <div>CRM LINKS</div>
                <div>INTERACTION</div>
                <div style={{ paddingLeft: "10px" }}>ASSIGNMENT</div>
              </div>

              <div id="contactListContent">
                {Object.keys(groups).map((groupName) => (
                  <div key={groupName} className="list-group">
                    <div className="group-header" style={{ padding: "12px var(--row-padding)", letterSpacing: "0.5px" }}>{groupName.toUpperCase()}</div>
                    {groups[groupName].map((item, idx) => (
                      <ContactRow
                        key={item._id || idx}
                        item={item}
                        idx={idx}
                        isSelected={selectedIds.includes(item?._id)}
                        toggleSelect={toggleSelect}
                        onNavigate={onNavigate}
                        getLookupValue={getLookupValue}
                        getUserName={getUserName}
                        getTeamName={getTeamName}
                        renderValue={renderValue}
                        getInitials={getInitials}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: "1.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                {filteredContacts.map((item, idx) => (
                  <ContactCard
                    key={item._id || idx}
                    item={item}
                    idx={idx}
                    isSelected={selectedIds.includes(item?._id)}
                    toggleSelect={toggleSelect}
                    onNavigate={onNavigate}
                    getLookupValue={getLookupValue}
                    getUserName={getUserName}
                    getTeamName={getTeamName}
                    renderValue={renderValue}
                    getInitials={getInitials}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="summary-footer" style={{ height: "60px", padding: "0 var(--row-padding)" }}>
        <div className="summary-label" style={{ background: "#334155", color: "#fff", padding: "4px 12px", borderRadius: "6px", fontSize: "0.7rem" }}>SUMMARY</div>
        <div style={{ display: "flex", gap: "20px" }}>
          <div className="stat-pill">TOTAL CONTACTS <strong>{totalRecords}</strong></div>
          <div className="stat-pill">PROSPECTS <strong>{contacts.filter(c => c.category === "Prospect").length}</strong></div>
          <div className="stat-pill">CUSTOMERS <strong>{contacts.filter(c => c.category === "Customer").length}</strong></div>
        </div>
      </footer>

      <ComposeEmailModal isOpen={isSendMailOpen} onClose={() => setIsSendMailOpen(false)} recipients={selectedContactsForMail} onSent={() => { setIsSendMailOpen(false); fetchContacts(); }} />
      <AddLeadModal isOpen={isAddLeadModalOpen} onClose={() => { setIsAddLeadModalOpen(false); setContactForLead(null); }} contactData={contactForLead} onAdd={() => { toast.success("Lead Created!"); setIsAddLeadModalOpen(false); fetchContacts(); }} />
      <SendMessageModal isOpen={isSendMessageOpen} onClose={() => setIsSendMessageOpen(false)} initialRecipients={selectedContactsForMessage} onSend={(d, res) => { toast.success(res?.message || "Sent!"); setIsSendMessageOpen(false); fetchContacts(); }} />
      <AssignContactModal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} selectedContacts={selectedContactsForAssign} onAssign={async (a) => {
        try {
          toast.loading("Assigning...");
          await Promise.all(selectedContactsForAssign.map(c => api.put(`contacts/${c._id}`, { owner: a.assignedTo })));
          toast.dismiss(); toast.success("Assigned!"); fetchContacts();
        } catch (e) { toast.dismiss(); toast.error("Failed"); }
        setIsAssignModalOpen(false); setSelectedIds([]);
      }} />
      <ManageTagsModal isOpen={isTagsModalOpen} onClose={() => setIsTagsModalOpen(false)} selectedContacts={selectedContactsForTags} onUpdateTags={() => { setIsTagsModalOpen(false); setSelectedIds([]); fetchContacts(); }} />
      <EnrollSequenceModal isOpen={isEnrollModalOpen} onClose={() => setIsEnrollModalOpen(false)} entityId={selectedContactForSequence?.id} entityName={selectedContactForSequence?.name} />
      <ContactFilterPanel isOpen={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} filters={filters} onFilterChange={setFilters} />
      {isDocumentModalOpen && <DocumentUploadModal isOpen={isDocumentModalOpen} onClose={() => setIsDocumentModalOpen(false)} ownerId={documentModalData?.ownerId} ownerType='Contact' ownerName={documentModalData?.ownerName} onUpdate={() => fetchContacts()} />}
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .btn-pagination { padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.75rem; font-weight: 600; } .btn-pagination:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }`}</style>
    </section>
  );
}

export default ContactsPage;
