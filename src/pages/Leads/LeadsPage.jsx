import React, { useEffect, useState } from 'react';
import PipelineDashboard from '../../components/PipelineDashboard';
import Swal from 'sweetalert2';
import { api, enrichmentAPI } from '../../utils/api';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import AssignContactModal from '../../components/AssignContactModal';
// CallModal removed - using global context
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import AddLeadModal from '../../components/AddLeadModal';
import LeadConversionService from '../../services/LeadConversionService';
import { calculateLeadScore } from '../../utils/leadScoring';
import AIExpertService from '../../services/AIExpertService';
import { STAGE_PIPELINE } from '../../utils/stageEngine';

import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { useDistribution } from '../../context/DistributionContext';
import EnrollSequenceModal from '../../components/EnrollSequenceModal';
import DocumentUploadModal from '../../components/DocumentUploadModal';
import ActivityOutcomeModal from '../../components/ActivityOutcomeModal';
import useDebounce from '../../hooks/useDebounce';

import LeadFilterPanel from './components/LeadFilterPanel';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { parseBudget, parseSizeSqYard } from '../../utils/matchingLogic';
import { useUserContext } from '../../context/UserContext';
import { renderValue } from '../../utils/renderUtils';
import { useCallback } from 'react';

function LeadsPage({ onAddActivity, onEdit, onNavigate }) {
    const {
        scoringAttributes,
        activityMasterFields,
        sourceQualityScores,
        inventoryFitScores,
        decayRules,
        stageMultipliers,
        getLookupValue
    } = usePropertyConfig();

    // ── STAGE ENGINE SYNC ──────────────────────────────────────────
    useEffect(() => {
        const handleActivitySync = (e) => {
            console.log('[LeadsPage] Activity sync event received:', e?.detail);
            setRefreshTrigger(prev => prev + 1);
        };

        const handleLeadUpdate = () => {
            console.log('[LeadsPage] Lead update event received');
            setRefreshTrigger(prev => prev + 1);
        };

        window.addEventListener('activity-completed', handleActivitySync);
        window.addEventListener('lead-updated', handleLeadUpdate);

        return () => {
            window.removeEventListener('activity-completed', handleActivitySync);
            window.removeEventListener('lead-updated', handleLeadUpdate);
        };
    }, []);
    // ────────────────────────────────────────────────────────────────
    const { fireEvent } = useTriggers();
    const { startCall } = useCall();
    const { executeDistribution } = useDistribution();
    const { teams, users } = useUserContext();

    // Bundle config for scoring engine
    const scoringConfig = {
        scoringAttributes,
        activityMasterFields,
        sourceQualityScores,
        inventoryFitScores,
        decayRules,
        stageMultipliers
    };

    const [leads, setLeads] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(10);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [liveScores, setLiveScores] = useState({}); // { leadId: { score, color, label } } from stage engine

    // --- OPTIMIZATION: Debounced Search Term ---
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    // Filter State
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

    const getTeamName = useCallback((teamValue) => {
        if (!teamValue) return "-";

        // Handle array of team names (as stored in assignment.team)
        if (Array.isArray(teamValue)) {
            return teamValue.length > 0 ? teamValue.join(', ') : "-";
        }

        if (typeof teamValue === 'object') {
            return teamValue.name || teamValue.lookup_value || "-";
        }
        // Check if teams is an array (it might be {success: true, data: []})
        const teamArray = Array.isArray(teams) ? teams : (teams?.data || []);
        const found = teamArray.find(t => (t._id === teamValue) || (t.id === teamValue));
        return found ? (found.name || found.lookup_value) : teamValue;
    }, [teams]);


    const getUserName = useCallback((userValue) => {
        if (!userValue) return "Unassigned";
        if (typeof userValue === 'object') {
            return userValue.fullName || userValue.name || userValue.lookup_value || userValue.username || "Unassigned";
        }
        // Check if users is an array
        const userArray = Array.isArray(users) ? users : (users?.data || []);
        const found = userArray.find(u => (u._id === userValue) || (u.id === userValue));
        return found ? (found.fullName || (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username))) : "Unassigned";
    }, [users]);


    // Modals State
    const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
    const [selectedLeadsForMessage, setSelectedLeadsForMessage] = useState([]);
    const [showDormant, setShowDormant] = useState(false);

    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [selectedLeadsForTags, setSelectedLeadsForTags] = useState([]);

    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [previewMatches, setPreviewMatches] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [selectedLeadsForAssign, setSelectedLeadsForAssign] = useState([]);



    // Call Modal State Removed - using Global CallContext

    const [isSendMailOpen, setIsSendMailOpen] = useState(false);
    const [selectedLeadsForMail, setSelectedLeadsForMail] = useState([]);

    // Edit/Add Lead Modal State
    const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState(null);

    // Popover States
    const [activeScorePopover, setActiveScorePopover] = useState(null); // {leadName, x, y}
    const [activeMatchPopover, setActiveMatchPopover] = useState(null); // {leadName, x, y}
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [selectedLeadForSequence, setSelectedLeadForSequence] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);

    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [documentModalData, setDocumentModalData] = useState(null);
    const [initialTab, setInitialTab] = useState(null);

    const [isOutcomeModalOpen, setIsOutcomeModalOpen] = useState(false);
    const [selectedActivityForOutcome, setSelectedActivityForOutcome] = useState(null);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // --- Professional Match Fetching ---
    useEffect(() => {
        if (!activeMatchPopover) {
            setPreviewMatches([]);
            return;
        }

        const fetchMatches = async () => {
            setLoadingMatches(true);
            try {
                const lead = leads.find(l => l.name === activeMatchPopover.name);
                if (!lead) return;
                const res = await api.get('deals/match', { params: { leadId: lead._id } });
                if (res.data && res.data.success) {
                    setPreviewMatches((res.data.data || []).slice(0, 5).map(m => ({
                        ...m,
                        matchPercentage: m.score,
                        thumbnail: m.inventoryId?.images?.[0] || `https://picsum.photos/seed/${m._id}/200/150`
                    })));
                }
            } catch (err) {
                console.error("Match fetch error:", err);
            } finally {
                setLoadingMatches(false);
            }
        };

        fetchMatches();
    }, [activeMatchPopover, leads]);

    // Server-side Pagination & Search
    useEffect(() => {
        const fetchLeads = async () => {
            setLoading(true);
            try {
                console.log("[Leads Audit] Attempting API call to /api/leads with params:", { page: currentPage, search: debouncedSearchTerm, ...filters });
                const response = await api.get(`leads`, {
                    params: {
                        page: currentPage,
                        limit: recordsPerPage,
                        search: debouncedSearchTerm,
                        showDormant,
                        ...filters
                    }
                });
                console.log("[Leads Audit] API Response Success:", response.data?.success, "Records:", response.data?.records?.length);

                if (!response.data || !response.data.success) {
                    throw new Error("Failed to fetch leads");
                }

                // Backend returns 'records' not 'docs', and 'totalCount' not 'totalDocs'
                const sourceData = response.data.records || [];
                const totalDocs = response.data.totalCount || 0;
                const pages = response.data.totalPages || 0;

                const mappedLeads = sourceData.map((lead, index) => {
                    // Handle both API shape and Fallback
                    const contact = lead.contactDetails || {};
                    const firstName = contact.name || lead.firstName || "";
                    const lastName = contact.surname || lead.lastName || "";
                    const rawSalutation = contact.title?.lookup_value || contact.title || lead.salutation || "";
                    const salutation = (typeof rawSalutation === 'string' && rawSalutation.match(/^[0-9a-fA-F]{24}$/)) 
                        ? (getLookupValue('Title', rawSalutation) || "") 
                        : (rawSalutation || "").trim();
                    const name = firstName ? `${salutation} ${firstName} ${lastName}`.trim() : (lead.name || "Unknown");

                    // EXPIRY LOGIC
                    let expiryBadge = null;
                    if (lead.isTemporary && lead.expiryDate) {
                        const daysLeft = Math.ceil((new Date(lead.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                        expiryBadge = {
                            daysLeft,
                            label: daysLeft > 0 ? `Expires in ${daysLeft} days` : 'EXPIRED',
                            class: daysLeft < 3 ? 'badge-danger' : 'badge-warning'
                        };
                    }

                    const ownerNameDisplay = lead.assignment?.assignedTo?.fullName
                        || lead.assignment?.assignedTo?.name
                        || lead.owner?.fullName
                        || lead.owner?.name
                        || lead.owner?.email
                        || (typeof lead.owner === 'string' && !/^[0-9a-fA-F]{24}$/.test(lead.owner) ? lead.owner : null)
                        || (typeof contact.owner === 'string' && !/^[0-9a-fA-F]{24}$/.test(contact.owner) ? contact.owner : null)
                        || "Unassigned";

                    return {
                        _id: lead._id?.toString() || lead._id || `lead-${index}`,
                        name: name,
                        mobile: contact.phones?.[0]?.number || lead.mobile || "",
                        email: contact.emails?.[0]?.address || lead.email || "",

                        // ===== SCORE DATA & CONTEXT (CRITICAL FOR LIST VIEW) =====
                        detailedReq: lead.detailedReq,
                        budgetMatch: lead.budgetMatch,
                        locationPref: lead.locationPref,
                        timeline: lead.timeline,
                        payment: lead.payment,
                        matched: lead.matched || 0,
                        lastActivityDate: lead.lastActivityAt || lead.updatedAt,
                        activities: lead.activities || [],
                        stage: lead.stage || "New",
                        status: lead.status,
                        statusFallback: (typeof lead.status === 'object' && lead.status) ? lead.status : { label: "New", class: "new" },

                        // ===== REQUIREMENT =====
                        reqDisplay: {
                            intent: lead.requirement,
                            category: lead.propertyType,
                            subCategory: lead.subRequirement || lead.subType,
                            size: `${lead.areaMin || ""}${lead.areaMin && lead.areaMax ? "-" : ""}${lead.areaMax || ""} ${lead.areaMetric || ""}`.trim(),
                        },

                        budget: lead.budget,
                        budgetDisplay: lead.budgetMin || lead.budgetMax
                            ? `₹${Number(lead.budgetMin || 0).toLocaleString()} - ₹${Number(lead.budgetMax || 0).toLocaleString()}`
                            : "—",

                        location: lead.location,
                        locationLines: {
                            project: (() => {
                                const p = lead.project?.name || lead.projectName;
                                if (Array.isArray(p)) return p.map(i => typeof i === 'object' ? (i.name || i.lookup_value) : i).join(", ");
                                return typeof p === 'object' ? (p.name || p.lookup_value) : p;
                            })(),
                            block: (() => {
                                const b = lead.locBlock;
                                if (Array.isArray(b)) return b.map(i => typeof i === 'object' ? (i.name || i.lookup_value) : i).join(", ");
                                return typeof b === 'object' ? (b.name || b.lookup_value) : b;
                            })(),
                            area: [lead.locArea, lead.locCity].filter(Boolean).join(", ")
                        },
                        locationDisplay: [
                            lead.projectName,
                            lead.locBlock,
                            lead.locArea,
                            lead.locCity
                        ].filter(Boolean).map(s => String(s)).join(", "),

                        source: lead.source,
                        sourceFallback: contact.source || "Direct",
                        owner: getUserName(lead.assignment?.assignedTo || lead.owner),
                        rawOwner: lead.assignment?.assignedTo || lead.owner || null,
                        team: getTeamName(lead.assignment?.team?.[0] || lead.owner?.team),
                        updatedAt: lead.updatedAt || lead.createdAt || null,
                        lastAct: lead.lastAct || "Today",
                        activity: lead.activity || "None",
                        remarks: lead.notes || lead.remarks || "",
                        addOn: lead.addOn || `Added ${new Date(lead.createdAt || Date.now()).toLocaleDateString()}`,

                        isTemporary: lead.isTemporary || false,
                        expiryBadge,

                        intentIndex: lead.intent_index || 0,
                        classification: lead.lead_classification || '',
                        roleType: lead.role_type || '',
                        intentTags: lead.intent_tags || [],
                        aiIntentSummary: lead.ai_intent_summary || '',
                        aiClosingProbability: lead.ai_closing_probability || 0,
                        contactDetails: lead.contactDetails // Added to track existing contact and prevent duplicates on edit
                    };
                });

                setLeads(mappedLeads);
                setTotalCount(totalDocs);
                setTotalPages(pages);

                // ── Stage Engine: fetch live scores for this page's leads ──
                api.get('stage-engine/leads/scores')
                    .then(r => { if (r.data?.success) setLiveScores(r.data.scores); })
                    .catch(() => { }); // non-blocking — silent fallback to client-side score

            } catch (error) {
                console.error("Error fetching leads:", error);
                toast.error("Error loading leads");
            } finally {
                setLoading(false);
            }
        };

        fetchLeads();
    }, [currentPage, recordsPerPage, debouncedSearchTerm, filters, refreshTrigger, getLookupValue]);


    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    }

    const getSelectedLeads = () => {
        // Use leads state instead of leadData
        return leads.filter(l => selectedIds.includes(l._id));
    };

    const isSelected = (id) => selectedIds.includes(id);
    const selectedCount = selectedIds.length;
    // const totalCount = leadData.length; // Removed, using state

    // Removed client-side filtering and pagination usage
    // const filteredLeads ...
    // const indexOfLastRecord ...

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

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;

        const result = await Swal.fire({
            title: 'Delete Confirmation',
            text: selectedIds.length === 1
                ? "Do you want to delete this lead? Choosing 'Lead & Contact' will also delete the associated contact."
                : `Do you want to delete ${selectedIds.length} selected leads? Choosing 'Leads & Contacts' will also delete their associated contacts.`,
            icon: 'warning',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: selectedIds.length === 1 ? 'Delete Lead & Contact' : 'Delete Leads & Contacts',
            denyButtonText: selectedIds.length === 1 ? 'Delete only Lead' : 'Delete only Leads',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#ef4444',
            denyButtonColor: '#f97316',
            cancelButtonColor: '#64748b',
        });

        if (result.isDismissed) return;

        const deleteContact = result.isConfirmed;

        setLoading(true);
        try {
            if (selectedIds.length === 1) {
                await api.delete(`leads/${selectedIds[0]}?deleteContact=${deleteContact}`);
            } else {
                await api.post(`leads/bulk-delete`, {
                    ids: selectedIds,
                    deleteContacts: deleteContact
                });
            }

            toast.success(`${selectedIds.length} lead(s) deleted successfully`);
            setSelectedIds([]);
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Error deleting leads:", error);
            toast.error("Failed to delete leads");
        } finally {
            setLoading(false);
        }
    };

    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

    return (
        <section id="leadsView" className="view-section active">
            <div className="view-scroll-wrapper">
                {/* Header */}
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-filter" style={{ color: 'var(--primary-color)' }}></i>
                        <div>
                            <span className="working-list-label">Sales Pipeline</span>
                            <h1>Leads</h1>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {/* Dormant Toggle Button */}
                        <button
                            className={`btn-outline ${showDormant ? 'active-dormant' : ''}`}
                            onClick={() => {
                                setShowDormant(!showDormant);
                                setCurrentPage(1); // Reset to first page when toggling
                            }}
                            title={showDormant ? "Hide Dormant Leads" : "Show Dormant Leads"}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                width: '38px',
                                height: '38px',
                                padding: 0,
                                backgroundColor: showDormant ? '#1e293b' : 'transparent',
                                color: showDormant ? '#fff' : 'inherit',
                                borderColor: showDormant ? '#1e293b' : '#cbd5e1',
                                borderRadius: '10px'
                            }}
                        >
                            <i className={`fas ${showDormant ? 'fa-sun' : 'fa-moon'}`}></i>
                        </button>

                        {/* View Toggle Button */}
                        <button
                            className="btn-outline"
                            onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                            title={viewMode === 'list' ? "Switch to Card View" : "Switch to List View"}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className={`fas ${viewMode === 'list' ? 'fa-th-large' : 'fa-list'}`}></i>
                            {viewMode === 'list' ? 'Card' : 'List'}
                        </button>

                        {/* Filter Button with Active State Indicator */}
                        <button
                            className="btn-outline"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}
                            onClick={() => setIsFilterPanelOpen(true)}
                        >
                            <i className="fas fa-filter"></i>
                            Filters
                            {Object.keys(filters).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '-5px', right: '-5px',
                                    width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                                }}></span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Pipeline Dashboard - Dynamic Data */}
                <PipelineDashboard entityType="lead" refreshTrigger={refreshTrigger} />

                {/* Content Body */}
                <div className="content-body" style={{ display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'visible', paddingTop: 0, position: 'relative' }}>
                    {/* Toolbar - Sticky 45px */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', minHeight: '45px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #eef2f5', background: '#fff' }}>
                        {selectedCount > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedCount} Selected
                                </div>

                                {/* Single Selection Only */}
                                {selectedCount === 1 && (
                                    <>
                                        <button
                                            className="action-btn"
                                            title="Edit Lead"
                                            onClick={() => {
                                                console.log('Edit Button Clicked - selectedIds:', selectedIds);
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                console.log('Found Lead:', selectedLead);
                                                if (selectedLead) {
                                                    setEditingLead(selectedLead);
                                                    setIsAddLeadModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-edit"></i> Edit
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Call Lead"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead) {
                                                    startCall({
                                                        name: selectedLead.name,
                                                        mobile: selectedLead.mobile
                                                    }, {
                                                        purpose: 'Follow-up',
                                                        entityId: selectedLead._id,
                                                        entityType: 'lead'
                                                    });
                                                }
                                            }}
                                        >
                                            <i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call
                                        </button>

                                        <button
                                            className="action-btn"
                                            title="Email Lead"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead) {
                                                    setSelectedLeadsForMail([{
                                                        id: selectedLead.mobile,
                                                        name: selectedLead.name,
                                                        email: selectedLead.email
                                                    }]);
                                                    setIsSendMailOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-envelope"></i> Email
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Send Message"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead) {
                                                    setSelectedLeadsForMessage([{
                                                        id: selectedLead.mobile,
                                                        name: selectedLead.name,
                                                        mobile: selectedLead.mobile
                                                    }]);
                                                    setIsSendMessageOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-comment-dots"></i> Message
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Add Activity"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead && onAddActivity) {
                                                    const relatedAccount = [{
                                                        id: selectedLead._id, // Fixed: Pass ObjectId instead of mobile number
                                                        name: selectedLead.name,
                                                        mobile: selectedLead.mobile,
                                                        model: 'Lead' // Explicitly set to Lead so backend links it to EnterprisePipeline
                                                    }];
                                                    onAddActivity(relatedAccount);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-calendar-check"></i> Activities
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Documents"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead) {
                                                    setDocumentModalData({
                                                        ownerId: selectedLead._id,
                                                        ownerType: 'Lead',
                                                        ownerName: selectedLead.name
                                                    });
                                                    setIsDocumentModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-file-alt"></i> Documents
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Start Sequence"
                                            onClick={() => {
                                                const selectedLead = leads.find(l => l._id === selectedIds[0]);
                                                if (selectedLead) {
                                                    setSelectedLeadForSequence({ ...selectedLead, id: selectedLead.mobile });
                                                    setIsEnrollModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-paper-plane"></i> Sequence
                                        </button>
                                    </>
                                )}

                                {/* Multi Selection Actions */}
                                {selectedCount > 0 && (
                                    <>
                                        {selectedCount === 1 && <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>}
                                        <button
                                            className="action-btn"
                                            title="Add Tag"
                                            onClick={() => {
                                                const selected = getSelectedLeads();
                                                if (selected.length > 0) {
                                                    setSelectedLeadsForTags(selected);
                                                    setIsTagsModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-tag"></i> Tag
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Reassign"
                                            onClick={() => {
                                                const selected = getSelectedLeads();
                                                if (selected.length > 0) {
                                                    setSelectedLeadsForAssign(selected);
                                                    setIsAssignModalOpen(true);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-user-friends"></i> Assign
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Match Properties"
                                            onClick={() => {
                                                const selected = getSelectedLeads();
                                                if (selected.length > 0) {
                                                    onNavigate('lead-matching', selected[0]._id);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-sync-alt"></i> Match
                                        </button>
                                        <button
                                            className="action-btn"
                                            title="Mark Dormant"
                                            onClick={async () => {
                                                if (window.confirm(`Mark ${selectedIds.length} leads as dormant?`)) {
                                                    try {
                                                        const dormantLookup = masterFields.statuses?.find(s => s.lookup_value?.toLowerCase() === 'dormant') || 
                                                                            masterFields.stages?.find(s => s.lookup_value?.toLowerCase() === 'dormant');
                                                        
                                                        if (!dormantLookup) {
                                                            alert("Dormant lookup not found in configuration.");
                                                            return;
                                                        }

                                                        await Promise.all(selectedIds.map(id => api.put(`leads/${id}`, { status: dormantLookup._id || dormantLookup })));
                                                        showToast(`Marked ${selectedIds.length} leads as dormant.`);
                                                        setSelectedIds([]);
                                                        // Refresh leads
                                                        setCurrentPage(1);
                                                    } catch (error) {
                                                        console.error("Failed to mark leads as dormant:", error);
                                                        showToast("Failed to update leads.");
                                                    }
                                                }
                                            }}
                                        >
                                            <i className="fas fa-moon"></i> Dormant
                                        </button>
                                        <button
                                            className="action-btn"
                                            style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}
                                            title="Convert to Contact"
                                            onClick={async () => {
                                                const selectedLeads = getSelectedLeads();
                                                for (const lead of selectedLeads) {
                                                    const res = LeadConversionService.convertLead(lead, 'Manual - Bulk Action', scoringConfig);
                                                    if (res.success) {
                                                        showToast(res.message);
                                                        // Fire Global Trigger
                                                        await fireEvent('lead_converted', res.contact, { entityType: 'leads' });
                                                    } else {
                                                        showToast(res.message);
                                                    }
                                                }
                                                setSelectedIds([]);
                                            }}
                                        >
                                            <i className="fas fa-user-check"></i> Convert
                                        </button>
                                        <button
                                            className="action-btn"
                                            style={{ background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }}
                                            title="Auto Distribute"
                                            onClick={() => {
                                                const selectedLeads = getSelectedLeads();
                                                let count = 0;
                                                selectedLeads.forEach(lead => {
                                                    const res = executeDistribution('leads', lead, { users: [], teams: [] });
                                                    if (res.success) count++;
                                                });
                                                showToast(`Distributed ${count} leads using active rules.`);
                                                setSelectedIds([]);
                                            }}
                                        >
                                            <i className="fas fa-random"></i> Distribute
                                        </button>
                                    </>
                                )}

                                {/* Special Case: Merge */}
                                {selectedCount === 2 && (
                                    <button className="action-btn" title="Merge Leads"><i className="fas fa-code-branch"></i> Merge</button>
                                )}

                                <div style={{ marginLeft: 'auto' }}>
                                    <button
                                        className="action-btn danger"
                                        title="Delete"
                                        onClick={handleDelete}
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ position: 'relative', width: '350px' }}>
                                        <input
                                            type="text"
                                            className="search-input-premium"
                                            placeholder="Search name, mobile, email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '100%' }}
                                        />
                                        <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Showing: <strong>{leads.length}</strong> / <strong>{totalCount}</strong>
                                    </div>

                                    {/* Records Per Page */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                        <span>Show:</span>
                                        <select
                                            value={recordsPerPage}
                                            onChange={handleRecordsPerPageChange}
                                            style={{
                                                padding: '4px 8px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                color: '#0f172a',
                                                outline: 'none',
                                                cursor: 'pointer'
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={goToPreviousPage}
                                            disabled={currentPage === 1}
                                            style={{
                                                padding: '6px 12px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: currentPage === 1 ? '#f8fafc' : '#fff',
                                                color: currentPage === 1 ? '#cbd5e1' : '#0f172a',
                                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}
                                        >
                                            <i className="fas fa-chevron-left"></i> Prev
                                        </button>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', minWidth: '80px', textAlign: 'center' }}>
                                            {currentPage} / {totalPages || 1}
                                        </span>
                                        <button
                                            onClick={goToNextPage}
                                            disabled={currentPage >= totalPages}
                                            style={{
                                                padding: '6px 12px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: currentPage >= totalPages ? '#f8fafc' : '#fff',
                                                color: currentPage >= totalPages ? '#cbd5e1' : '#0f172a',
                                                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
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

                    {/* Header Strip (Only for List View) */}
                    {viewMode === 'list' && (
                        <div className="list-header lead-list-grid" style={{ position: 'sticky', top: '45px', background: '#f8fafc', zIndex: 99, borderBottom: '2px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <div><input type="checkbox" onChange={() => {
                                if (selectedCount === leads.length) setSelectedIds([]);
                                else setSelectedIds(leads.map(l => l._id));
                            }} checked={selectedCount === leads.length && leads.length > 0} /></div>
                            <div>Lead Profile</div>
                            <div>Match</div>
                            <div>Requirement & Budget</div>
                            <div>Location</div>
                            <div>Status & Source</div>
                            <div>Interaction</div>
                            <div style={{ textAlign: 'right', paddingRight: '20px' }}>Assignment</div>
                        </div>
                    )}

                    {/* Content Area */}
                    <div id="leadListContent" style={{ display: viewMode === 'grid' || viewMode === 'card' ? 'block' : 'grid' }}>
                        {viewMode === 'card' ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', padding: '20px' }}>
                                {loading ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : leads.map((lead, idx) => (
                                    <LeadCard
                                        key={lead._id || idx}
                                        lead={lead}
                                        isSelected={isSelected(lead._id)}
                                        toggleSelect={toggleSelect}
                                        getLookupValue={getLookupValue}
                                        liveBackendScore={liveScores[lead._id]}
                                        scoringConfig={scoringConfig}
                                        calculateLeadScore={calculateLeadScore}
                                        renderValue={renderValue}
                                        onNavigate={onNavigate}
                                        startCall={startCall}
                                        onEdit={onEdit}
                                        setActiveScorePopover={setActiveScorePopover}
                                        enrichmentAPI={enrichmentAPI}
                                        setRefreshTrigger={setRefreshTrigger}
                                        getUserName={getUserName}
                                        getTeamName={getTeamName}
                                        getInitials={getInitials}
                                        STAGE_PIPELINE={STAGE_PIPELINE}
                                        setSelectedActivityForOutcome={setSelectedActivityForOutcome}
                                        setIsOutcomeModalOpen={setIsOutcomeModalOpen}
                                        AIExpertService={AIExpertService}
                                        showToast={showToast}
                                    />
                                ))}
                            </div>
                        ) : (
                            /* List View Rendering */
                            loading ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : leads.map((c, idx) => (
                                <LeadItem
                                    key={c._id || idx}
                                    lead={c}
                                    isSelected={isSelected(c._id)}
                                    toggleSelect={toggleSelect}
                                    getLookupValue={getLookupValue}
                                    liveBackendScore={liveScores[c._id]}
                                    scoringConfig={scoringConfig}
                                    calculateLeadScore={calculateLeadScore}
                                    renderValue={renderValue}
                                    onNavigate={onNavigate}
                                    startCall={startCall}
                                    onEdit={onEdit}
                                    setActiveScorePopover={setActiveScorePopover}
                                    setActiveMatchPopover={setActiveMatchPopover}
                                    getUserName={getUserName}
                                    getTeamName={getTeamName}
                                    getInitials={getInitials}
                                    AIExpertService={AIExpertService}
                                    LeadConversionService={LeadConversionService}
                                    enrichmentAPI={enrichmentAPI}
                                    setRefreshTrigger={setRefreshTrigger}
                                    showToast={showToast}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Stats */}
            <footer className="footer-stats-bar" style={{ height: '60px', justifyContent: 'space-between', padding: '0 2rem' }}>
                <div style={{ display: 'flex', gap: '2.5rem' }}>
                    <div className="stat-group">Summary <span>Total Lead</span> <span className="stat-val-bold" style={{ color: '#2ecc71' }}>{totalCount}</span></div>
                    <div className="stat-group">UNASSIGNED <span className="stat-val-bold" style={{ color: '#2ecc71' }}>2</span></div>
                    <div className="stat-group">UNTOUCHED <span className="stat-val-bold" style={{ color: '#f59e0b' }}>4</span></div>
                    <div className="stat-group">NO FOLLOWUP <span className="stat-val-bold" style={{ color: '#ef4444' }}>12</span></div>
                    <div className="stat-group">DORMANT <span className="stat-val-bold" style={{ color: '#94a3b8' }}>15</span></div>
                    <div className="stat-group">RETURNING <span className="stat-val-bold" style={{ color: '#3b82f6' }}>9</span></div>
                </div>
            </footer>

            {/* Send Message Modal */}
            <SendMessageModal
                isOpen={isSendMessageOpen}
                onClose={() => setIsSendMessageOpen(false)}
                initialRecipients={selectedLeadsForMessage}
                onSend={(data, res) => {
                    console.log('Message Data Outbound:', data);
                    toast.success(res?.message || 'Message Sent Successfully!');
                    setIsSendMessageOpen(false);
                    // trigger refresh if needed
                }}
            />

            {/* Manage Tags Modal */}
            <ManageTagsModal
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                selectedContacts={selectedLeadsForTags}
                onUpdateTags={(payload) => {
                    console.log('Tags Updated:', payload);
                    setIsTagsModalOpen(false);
                    setSelectedIds([]);
                }}
            />

            {/* Assign Contact Modal */}
            <AssignContactModal
                isOpen={isAssignModalOpen}
                onClose={() => setIsAssignModalOpen(false)}
                selectedContacts={selectedLeadsForAssign}
                entityName="Lead"
                onAssign={async (assignmentDetails) => {
                    if (!selectedLeadsForAssign.length) return;
                    try {
                        toast.loading(`Assigning ${selectedLeadsForAssign.length} lead(s)...`);
                        const promises = selectedLeadsForAssign.map(lead =>
                            api.put(`leads/${lead._id}`, {
                                owner: assignmentDetails.assignedTo,
                                assignment: {
                                    assignedTo: assignmentDetails.assignedTo,
                                    team: assignmentDetails.team,
                                    method: 'Manual'
                                }
                            })
                        );
                        await Promise.all(promises);
                        toast.success(`${selectedLeadsForAssign.length} lead(s) assigned successfully`);
                        setRefreshTrigger(prev => prev + 1);
                        setIsAssignModalOpen(false);
                        setSelectedIds([]);
                    } catch (error) {
                        console.error("Error assigning leads:", error);
                        toast.error("Failed to assign leads");
                    }
                }}
            />



            {/* Send Mail Modal */}
            <ComposeEmailModal
                isOpen={isSendMailOpen}
                onClose={() => setIsSendMailOpen(false)}
                recipients={selectedLeadsForMail}
                onSend={(data) => {
                    console.log('Sending Mail:', data);
                    setIsSendMailOpen(false);
                }}
            />

            {/* Update Lead Modal */}
            <AddLeadModal
                isOpen={isAddLeadModalOpen}
                onClose={() => {
                    setIsAddLeadModalOpen(false);
                    setEditingLead(null);
                    setInitialTab(null);
                }}
                initialData={editingLead} // Correctly pass as initialData for Edit mode
                title={editingLead ? "Update Lead" : "Add New Lead"}
                saveLabel={editingLead ? "Update" : "Save"}
                mode={editingLead ? "edit" : "add"}
                initialTab={initialTab}
                onAdd={(updatedData) => {
                    console.log('Lead Updated:', updatedData);
                    setIsAddLeadModalOpen(false);
                    setEditingLead(null);
                    setInitialTab(null);
                    setSelectedIds([]);
                    // Trigger refresh by incrementing refreshTrigger
                    setRefreshTrigger(prev => prev + 1);
                }}
            />
            {/* Score Breakdown Popover for Lead Scoring Engine */}
            {activeScorePopover && (
                <div
                    style={{ position: 'fixed', top: activeScorePopover.y, left: activeScorePopover.x, zIndex: 2000, background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(12px)', color: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', minWidth: '240px' }}
                    onMouseLeave={() => setActiveScorePopover(null)}
                >
                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>Lead Scoring Hub</div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>TOTAL SCORE</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#3b82f6' }}>{activeScorePopover.scoring.total}<span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>/100</span></div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>INTENT</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>{activeScorePopover.scoring.temperature.label}</div>
                        </div>
                    </div>

                    {[
                        { label: 'Attribute Score', val: activeScorePopover.scoring.breakdown.attribute, max: 77 },
                        { label: 'Activity Score', val: activeScorePopover.scoring.breakdown.activity, max: 50 },
                        { label: 'Source Quality', val: activeScorePopover.scoring.breakdown.source, max: 20 },
                        { label: 'Inventory Fit', val: activeScorePopover.scoring.breakdown.fit, max: 25 },
                        { label: 'Time Decay', val: activeScorePopover.scoring.breakdown.decay, max: -30 },
                    ].map((item, i) => (
                        <div key={i} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '3px' }}>
                                <span style={{ opacity: 0.8 }}>{item.label}</span>
                                <span style={{ color: item.val < 0 ? '#ef4444' : '#fff', fontWeight: 800 }}>{item.val}</span>
                            </div>
                            <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(Math.abs(item.val / (item.max || 1)) * 100, 100)}%`, height: '100%', background: item.val < 0 ? '#ef4444' : '#3b82f6' }}></div>
                            </div>
                        </div>
                    ))}

                    {activeScorePopover.ai && (
                        <div style={{ marginTop: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', marginBottom: '5px' }}>AI Insight</div>
                            <p style={{ fontSize: '0.7rem', color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>{activeScorePopover.ai.summary || activeScorePopover.ai.intentSummary || activeScorePopover.leadData?.aiIntentSummary}</p>
                            {activeScorePopover.leadData?.aiClosingProbability > 0 && (
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${activeScorePopover.leadData.aiClosingProbability}%`, height: '100%', background: '#10b981' }}></div>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#10b981' }}>{activeScorePopover.leadData.aiClosingProbability}% Prob</span>
                                </div>
                            )}
                            <div style={{ marginTop: '8px' }}>
                                {activeScorePopover.ai.fullExplanation.map((exp, idx) => (
                                    <div key={idx} style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'flex', gap: '5px', marginBottom: '3px' }}>
                                        <i className="fas fa-check" style={{ color: '#10b981', marginTop: '2px' }}></i>
                                        <span>{exp}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Top Matches Popover (Professional Engine) */}
            {
                activeMatchPopover && (() => {
                    const currentLead = leads.find(l => l.name === activeMatchPopover.name);
                    if (!currentLead) return null;

                    return (
                        <div
                            style={{ position: 'fixed', top: activeMatchPopover.y, left: activeMatchPopover.x, zIndex: 2000, background: '#fff', color: '#0f172a', padding: '16px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', minWidth: '320px' }}
                            onMouseLeave={() => setActiveMatchPopover(null)}
                        >
                            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Top 5 Matches (AI Engine)</span>
                                {loadingMatches ? <span className="loading-dots">Updating</span> : <span style={{ color: 'var(--primary-color)' }}>{previewMatches.length} Found</span>}
                            </div>

                            {loadingMatches ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                                    <div className="loading-spinner" style={{ margin: '0 auto 10px' }}></div>
                                    Syncing with engine...
                                </div>
                            ) : (
                                <>
                                    {previewMatches.map((item, i) => (
                                        <div
                                            key={i}
                                            className="match-item-hover"
                                            onClick={() => onNavigate('lead-matching', currentLead._id)}
                                            style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
                                        >
                                            <div style={{ width: '50px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                                                <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.propertyType || item.type} at {item.location}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>₹{renderValue(item.price)} • {renderValue(item.size)}</div>
                                            </div>
                                            <div style={{ background: item.matchPercentage > 80 ? '#dcfce7' : '#fef3c7', color: item.matchPercentage > 80 ? '#166534' : '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0 }}>
                                                {item.matchPercentage}%
                                            </div>
                                        </div>
                                    ))}

                                    {previewMatches.length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                                            No direct matches found. Try adjusting lead criteria.
                                        </div>
                                    )}
                                </>
                            )}

                            <button
                                onClick={() => onNavigate('lead-matching', currentLead._id)}
                                style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}
                            >
                                Open Professional Matching Center
                            </button>
                            <style>{`.match-item-hover:hover { background: #f8fafc; transform: translateX(4px); }`}</style>
                        </div>
                    );
                })()
            }

            {/* Enroll Sequence Modal */}
            <EnrollSequenceModal
                isOpen={isEnrollModalOpen}
                onClose={() => setIsEnrollModalOpen(false)}
                entityId={selectedLeadForSequence?.id}
                entityName={selectedLeadForSequence?.name}
            />

            {isDocumentModalOpen && (
                <DocumentUploadModal
                    isOpen={isDocumentModalOpen}
                    onClose={() => setIsDocumentModalOpen(false)}
                    ownerId={documentModalData?.ownerId}
                    ownerType={documentModalData?.ownerType}
                    ownerName={documentModalData?.ownerName}
                    onUpdate={() => setRefreshTrigger(prev => prev + 1)}
                />
            )}

            {/* Toast Notification */}
            {
                toastMessage && (
                    <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '10px 24px', borderRadius: '12px', zIndex: 3000, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                        {toastMessage}
                    </div>
                )
            }
            {/* Lead Filter Panel */}
            <LeadFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={(newFilters) => {
                    setFilters(newFilters);
                    setCurrentPage(1); // Reset to first page on filter change
                }}
            />
            {/* Activity Outcome Modal */}
            <ActivityOutcomeModal
                isOpen={isOutcomeModalOpen}
                onClose={() => setIsOutcomeModalOpen(false)}
                activity={selectedActivityForOutcome}
            />
        </section >
    );
}

export default LeadsPage;

// --- MEMOIZED COMPONENTS FOR PERFORMANCE ---

const LeadItem = React.memo(function LeadItem({
    lead,
    isSelected,
    toggleSelect,
    getLookupValue,
    liveBackendScore,
    scoringConfig,
    calculateLeadScore,
    renderValue,
    onNavigate,
    startCall,
    onEdit,
    setActiveScorePopover,
    setActiveMatchPopover,
    getUserName,
    getTeamName,
    getInitials,
    AIExpertService,
    LeadConversionService,
    enrichmentAPI,
    setRefreshTrigger,
    showToast
}) {
    if (!lead) return null;

    // Logic to split Intent (Buy/Rent) from Property Type (Residential Plot etc)
    const intent = renderValue(getLookupValue('Requirement', lead.reqDisplay?.intent), null) || 'Any';
    const category = Array.isArray(lead.reqDisplay?.category)
        ? lead.reqDisplay.category.map(s => typeof s === 'object' ? (s.name || s.lookup_value) : (getLookupValue('Category', s) || s)).filter(Boolean).join(', ')
        : (typeof lead.reqDisplay?.category === 'object' ? (lead.reqDisplay.category.name || lead.reqDisplay.category.lookup_value) : (renderValue(getLookupValue('Category', lead.reqDisplay?.category), null) || lead.reqDisplay?.category || ''));
    
    const subCategory = Array.isArray(lead.reqDisplay?.subCategory)
        ? lead.reqDisplay.subCategory.map(s => typeof s === 'object' ? (s.name || s.lookup_value) : (getLookupValue('SubCategory', s) || s)).filter(Boolean).join(', ')
        : (typeof lead.reqDisplay?.subCategory === 'object' ? (lead.reqDisplay.subCategory.name || lead.reqDisplay.subCategory.lookup_value) : (renderValue(getLookupValue('SubCategory', lead.reqDisplay?.subCategory), null) || lead.reqDisplay?.subCategory || ''));

    const fullPropertyType = [category, subCategory].filter(Boolean).join(" - ");

    // Unified Scoring Logic for List View
    const normalizedLead = {
        ...lead,
        source: getLookupValue('Source', lead.source) || lead.source,
        stage: getLookupValue('Stage', lead.stage) || lead.stage
    };
    const scoring = calculateLeadScore(normalizedLead, lead.activities || [], scoringConfig);
    const calculatedScore = Math.max(scoring?.total || 0, lead.intentIndex || 0);
    const displayScore = Math.max(liveBackendScore?.score || 0, calculatedScore);
    const displayColor = (liveBackendScore && liveBackendScore.score >= displayScore) ? liveBackendScore.color : (scoring?.temperature?.color || '#94a3b8');
    const tempClass = (liveBackendScore && liveBackendScore.score >= displayScore) ? String(liveBackendScore.tempClass) : String(scoring?.temperature?.class || 'cold');

    return (
        <div className="list-item lead-list-grid">
            <div>
                <input
                    type="checkbox"
                    className="item-check"
                    checked={isSelected}
                    onChange={() => toggleSelect(lead._id)}
                />
            </div>
            <div className="col-profile">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ position: 'relative' }}>
                        <div
                            className={`score-indicator ${tempClass}`}
                            style={{
                                width: '42px',
                                height: '42px',
                                fontSize: '0.95rem',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '900',
                                border: '2px solid rgba(255,255,255,0.2)',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                background: displayColor,
                                color: '#fff'
                            }}
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const aiExplanation = AIExpertService.explainLeadScore(lead, scoringConfig);
                                setActiveScorePopover({
                                    name: lead.name,
                                    x: rect.left,
                                    y: rect.bottom + 10,
                                    scoring: { ...scoring, total: displayScore },
                                    ai: aiExplanation,
                                    leadData: lead
                                });
                            }}
                        >
                            {displayScore}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div>
                            <a
                                href="#"
                                className="primary-text text-ellipsis"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (onNavigate) onNavigate('contact-detail', lead._id);
                                }}
                                style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', display: 'block' }}
                            >
                                {lead.name}
                            </a>
                            {lead.aiClosingProbability > 75 && (
                                <span style={{ marginLeft: '8px', background: '#dcfce7', color: '#166534', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, border: '1px solid #bbf7d0' }}>
                                    ✨ HIGH INTENT
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                            {lead.isTemporary && lead.expiryBadge ? (
                                <span
                                    style={{
                                        background: lead.expiryBadge.class === 'badge-danger' ? '#fee2e2' : '#fef3c7',
                                        color: lead.expiryBadge.class === 'badge-danger' ? '#991b1b' : '#92400e',
                                        fontSize: '0.65rem',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        border: lead.expiryBadge.class === 'badge-danger' ? '1px solid #fca5a5' : '1px solid #fcd34d'
                                    }}
                                    title="Broker leads auto-expire in 15 days"
                                >
                                    <i className="fas fa-clock"></i> {lead.expiryBadge.label.toUpperCase()}
                                </span>
                            ) : (
                                LeadConversionService.isConverted(lead.mobile) || lead.isConverted ? (
                                    <span
                                        onClick={() => onNavigate('contact-detail', lead._id)}
                                        style={{ background: '#dcfce7', color: '#166534', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                        <i className="fas fa-check-circle"></i> CONVERTED
                                    </span>
                                ) : (
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}><i className="fas fa-mobile-alt" style={{ marginRight: '6px', width: '12px' }}></i>{lead.mobile}</div>
                                )
                            )}
                            {(() => {
                                const liveIntent = (liveBackendScore && liveBackendScore.score >= 80) ? 'Closing Soon' :
                                    (displayScore >= 80) ? 'Closing Soon' :
                                        (displayScore >= 60) ? 'High Intent' :
                                            (displayScore >= 30) ? 'Nurture' : 'Low Intent';

                                const isHigh = displayScore >= 60;
                                return (
                                    <span style={{
                                        background: isHigh ? `${displayColor}22` : '#fef3c7',
                                        color: isHigh ? displayColor : '#92400e',
                                        fontSize: '0.6rem',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 800,
                                        border: `1px solid ${isHigh ? displayColor + '44' : '#fcd34d'}`
                                    }}>
                                        {liveIntent.toUpperCase()}
                                    </span>
                                );
                            })()}
                            {lead.roleType && (
                                <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, border: '1px solid #e5e7eb' }}>
                                    {lead.roleType.toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="col-intent">
                <div style={{ lineHeight: 1.4 }}>
                    <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={() => showToast(`Requirement updated for ${lead.name}`)}
                        style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize', outline: 'none', padding: '2px 0' }}
                    >{intent}</div>
                    <div style={{ marginTop: '4px', fontSize: '0.7rem' }}>
                        <span
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMatchPopover({ name: lead.name, x: rect.left, y: rect.bottom + 10 });
                            }}
                            style={{ background: '#e0f2fe', color: '#0284c7', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(2, 132, 199, 0.1)' }}
                        >
                            {lead.matched} Matches
                        </span>
                    </div>
                </div>
            </div>

            <div className="col-budget">
                <div style={{ lineHeight: 1.4 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', marginBottom: '2px', textTransform: 'uppercase' }}>
                        {fullPropertyType || "Any Property"}
                    </div>
                    <div style={{ fontWeight: 900, color: '#059669', fontSize: '0.9rem' }}>
                        {renderValue(getLookupValue('Budget', lead.budget), null) || lead.budgetDisplay}
                    </div>
                    {lead.reqDisplay?.size && (
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>
                            <i className="fas fa-ruler-combined" style={{ marginRight: '4px', fontSize: '0.6rem' }}></i>
                            {lead.reqDisplay.size}
                        </div>
                    )}
                </div>
            </div>

            <div className="col-location">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', fontWeight: 600, color: '#1e293b' }}>
                    {lead.locationLines?.project && (
                        <div style={{ color: '#0f172a', fontWeight: 800 }}>
                           <i className="fas fa-building" style={{ marginRight: '6px', color: '#64748b', fontSize: '0.65rem' }}></i>
                           {lead.locationLines.project}
                        </div>
                    )}
                    {lead.locationLines?.block && (
                        <div style={{ color: '#475569' }}>
                           <i className="fas fa-th-large" style={{ marginRight: '6px', color: '#94a3b8', fontSize: '0.65rem' }}></i>
                           {lead.locationLines.block}
                        </div>
                    )}
                    {(lead.locationLines?.area || lead.searchLocation) && (
                        <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                           <i className="fas fa-map-marker-alt" style={{ marginRight: '6px', color: '#ef4444', fontSize: '0.65rem' }}></i>
                           {lead.locationLines.area || lead.searchLocation}
                        </div>
                    )}
                </div>
            </div>

            <div className="col-status">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'start' }}>
                    <span
                        className={`status-badge ${(String(renderValue(getLookupValue('Status', lead.status), null) || (typeof lead.statusFallback === 'object' ? lead.statusFallback.class : 'new') || 'new')).toLowerCase()}`}
                    >
                        {renderValue(getLookupValue('Status', lead.status), null) || (typeof lead.statusFallback === 'object' ? lead.statusFallback.label : lead.statusFallback)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {(() => {
                            const stageName = String(liveBackendScore?.stage || renderValue(getLookupValue('Stage', lead.stage), null) || 'New');
                            const stageInfo = STAGE_PIPELINE.find(s => s.label.toLowerCase() === stageName.toLowerCase()) || { color: '#94a3b8', icon: 'fa-circle', label: stageName };
                            return (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    background: stageInfo.color + '18',
                                    color: stageInfo.color,
                                    border: `1px solid ${stageInfo.color}40`,
                                    borderRadius: '5px',
                                    padding: '1px 6px',
                                    fontSize: '0.55rem',
                                    fontWeight: 800,
                                }}>
                                    <i className={`fas ${stageInfo.icon}`} style={{ fontSize: '0.5rem' }}></i>
                                    {stageInfo.label.toUpperCase()}
                                </span>
                            );
                        })()}
                        {lead.source && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0',
                                borderRadius: '5px',
                                padding: '1px 6px',
                                fontSize: '0.55rem',
                                fontWeight: 800,
                            }}>
                                <i className="fas fa-sign-in-alt" style={{ fontSize: '0.5rem' }}></i>
                                {(renderValue(getLookupValue('Source', lead.source), null) || lead.source).toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="col-interaction">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(() => {
                        // Find latest activity regardless of status
                        const sortedActs = [...(lead.activities || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
                        const activity = sortedActs[0];
                        
                        if (activity) {
                            return (
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.7rem',
                                    color: '#475569',
                                    fontWeight: 700
                                }}>
                                    LAST: {activity.type.toUpperCase()}
                                </div>
                            );
                        }
                        return <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No activities</span>;
                    })()}
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { icon: 'fa-phone-alt', type: 'Call', color: '#10b981' },
                            { icon: 'fa-sms', type: 'SMS', color: '#3b82f6' },
                            { icon: 'fa-whatsapp', type: 'WhatsApp', color: '#25d366' },
                            { icon: 'fa-envelope', type: 'Email', color: '#ef4444' }
                        ].map(act => {
                            const count = (lead.activities || []).filter(a => a.type === act.type).length;
                            if (count === 0) return null;
                            return (
                                <div key={act.type} style={{ display: 'flex', alignItems: 'center', gap: '3px', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.05))' }}>
                                    <div style={{ 
                                        width: '18px', 
                                        height: '18px', 
                                        borderRadius: '50%', 
                                        background: act.color + '15', 
                                        color: act.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.6rem'
                                    }}>
                                        <i className={`fas ${act.icon}`}></i>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="col-assignment" style={{ textAlign: 'right', paddingRight: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                    <div className="avatar-circle" style={{ 
                        width: '28px', 
                        height: '28px', 
                        fontSize: '0.7rem', 
                        background: '#f1f5f9', 
                        color: '#64748b', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 700,
                        border: '1px solid #e2e8f0'
                    }}>
                        {getInitials(lead.owner || 'U')}
                    </div>
                    <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#0f172a' }}>{lead.owner}</div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>{lead.team}</div>
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                            {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + new Date(lead.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
});
LeadItem.displayName = 'LeadItem';


const LeadCard = React.memo(function LeadCard({
    lead,
    isSelected,
    toggleSelect,
    getLookupValue,
    liveBackendScore,
    scoringConfig,
    calculateLeadScore,
    renderValue,
    startCall,
    onEdit,
    setActiveScorePopover,
    enrichmentAPI,
    setRefreshTrigger,
    getUserName,
    getTeamName,
    getInitials,
    STAGE_PIPELINE,
    setSelectedActivityForOutcome,
    setIsOutcomeModalOpen,
    AIExpertService,
    showToast
}) {
    if (!lead) return null;

    const normalizedLead = {
        ...lead,
        source: getLookupValue('Source', lead.source) || lead.source,
        stage: getLookupValue('Stage', lead.stage) || lead.stage
    };
    const scoring = calculateLeadScore(normalizedLead, lead.activities || [], scoringConfig);
    const calculatedScore = Math.max(scoring?.total || 0, lead.intentIndex || 0);
    const displayScore = Math.max(liveBackendScore?.score || 0, calculatedScore);
    const displayColor = (liveBackendScore && liveBackendScore.score >= displayScore) ? liveBackendScore.color : (scoring?.temperature?.color || '#94a3b8');
    const tempClass = (liveBackendScore && liveBackendScore.score >= displayScore) ? String(liveBackendScore.tempClass) : String(scoring?.temperature?.class || 'cold');

    return (
        <div
            style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                border: isSelected ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                padding: '16px',
                position: 'relative',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                cursor: 'pointer'
            }}
            onClick={(e) => {
                if (!e.target.closest('button') && !e.target.closest('input')) {
                    toggleSelect(lead._id);
                }
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <div
                            className={`score-indicator ${tempClass}`}
                            style={{
                                width: '32px',
                                height: '32px',
                                fontSize: '0.8rem',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '900',
                                border: '2px solid rgba(255,255,255,0.2)',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                background: displayColor,
                                color: '#fff',
                                cursor: 'help'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const aiExplanation = AIExpertService.explainLeadScore(lead, scoringConfig);
                                setActiveScorePopover({
                                    name: lead.name,
                                    x: rect.left,
                                    y: rect.bottom + 10,
                                    scoring: { ...scoring, total: displayScore },
                                    ai: aiExplanation
                                });
                            }}
                        >
                            {displayScore}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{lead.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{lead.mobile}</div>
                    </div>
                </div>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(lead._id)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            </div>

            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                {(() => {
                    const siteVisit = (lead.activities || []).find(a =>
                        (a.type === 'Site Visit' || a.subject?.toLowerCase().includes('site visit')) &&
                        a.status !== 'Completed'
                    );

                    if (siteVisit) {
                        const dateStr = siteVisit.dueDate ? new Date(siteVisit.dueDate).toLocaleDateString() : 'TBD';
                        return (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedActivityForOutcome(siteVisit);
                                    setIsOutcomeModalOpen(true);
                                }}
                                style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div>
                                    <div style={{ color: '#166534', fontSize: '0.7rem', fontWeight: 800 }}>
                                        <i className="fas fa-map-marked-alt"></i> SITE VISIT
                                    </div>
                                    <div style={{ color: '#15803d', fontSize: '0.65rem', fontWeight: 600 }}>
                                        {dateStr} {siteVisit.dueTime ? `@ ${siteVisit.dueTime}` : ''}
                                    </div>
                                </div>
                                <div style={{ color: '#166534', fontSize: '0.6rem', fontWeight: 800, textDecoration: 'underline' }}>
                                    Log Outcome
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    {(() => {
                        const cat = Array.isArray(lead.reqDisplay?.category)
                            ? lead.reqDisplay.category.map(s => getLookupValue('Category', s)).filter(Boolean).join(', ')
                            : renderValue(getLookupValue('Category', lead.reqDisplay?.category), null);
                        const sub = Array.isArray(lead.reqDisplay?.subCategory)
                            ? lead.reqDisplay.subCategory.map(s => getLookupValue('SubCategory', s)).filter(Boolean).join(', ')
                            : renderValue(getLookupValue('SubCategory', lead.reqDisplay?.subCategory), null);
                        return [cat, sub].filter(Boolean).join(" - ") || "Any Property";
                    })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px', color: '#64748b' }}>
                    <span>{renderValue(lead.reqDisplay?.size, 'Std. Size')}</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>
                        {renderValue(getLookupValue('Budget', lead.budget), null) || lead.budgetDisplay}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div className="flex items-center gap-2">
                    <span className={`status-badge ${(String(renderValue(getLookupValue('Status', lead.status), null) || (typeof lead.statusFallback === 'object' ? lead.statusFallback.class : 'new') || 'new')).toLowerCase()}`}>
                        {renderValue(getLookupValue('Status', lead.status), null) || (typeof lead.statusFallback === 'object' ? lead.statusFallback.label : lead.statusFallback)}
                    </span>
                    {(() => {
                        const stageName = String(liveBackendScore?.stage || renderValue(getLookupValue('Stage', lead.stage), null) || 'New');
                        const stageInfo = STAGE_PIPELINE.find(s => s.label.toLowerCase() === stageName.toLowerCase()) || { color: '#94a3b8', icon: 'fa-circle', label: stageName };
                        return (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: stageInfo.color + '18',
                                color: stageInfo.color,
                                border: `1px solid ${stageInfo.color}40`,
                                borderRadius: '5px',
                                padding: '2px 7px',
                                fontSize: '0.6rem',
                                fontWeight: 800,
                            }}>
                                <i className={`fas ${stageInfo.icon}`} style={{ fontSize: '0.5rem' }}></i>
                                {stageInfo.label.toUpperCase()}
                            </span>
                        );
                    })()}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {renderValue(getLookupValue('Source', lead.source), null) || renderValue(lead.sourceFallback, "Direct")}
                </span>
            </div>

            <div style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9', marginBottom: '12px' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>Assigned To</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="avatar-circle" style={{ width: '28px', height: '28px', fontSize: '0.7rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        {getInitials(getUserName(lead.rawOwner || lead.owner))}
                    </div>
                    <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{getUserName(lead.rawOwner || lead.owner)}</div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{getTeamName(lead.team)}</div>
                    </div>
                </div>
            </div>

        </div>
    );
});
LeadCard.displayName = 'LeadCard';

