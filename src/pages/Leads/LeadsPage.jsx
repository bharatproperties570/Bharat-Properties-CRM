import React, { useEffect, useState } from 'react';
import PipelineDashboard from '../../components/PipelineDashboard';
import { leadData } from '../../data/mockData';
import api from '../../../api';
import { getInitials } from '../../utils/helpers';
import SendMessageModal from '../../components/SendMessageModal';
import ManageTagsModal from '../../components/ManageTagsModal';
import AssignContactModal from '../../components/AssignContactModal';
// CallModal removed - using global context
import SendMailModal from '../Contacts/components/SendMailModal';
import AddLeadModal from '../../components/AddLeadModal';
import LeadConversionService from '../../services/LeadConversionService';
import { calculateLeadScore } from '../../utils/leadScoring';
import AIExpertService from '../../services/AIExpertService';

import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useSequences } from '../../context/SequenceContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { useDistribution } from '../../context/DistributionContext';
import EnrollSequenceModal from '../../components/EnrollSequenceModal';

import LeadFilterPanel from './components/LeadFilterPanel';
import { applyLeadFilters } from '../../utils/leadFilterLogic';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { parseBudget, parseSizeSqYard, calculateMatch } from '../../utils/matchingLogic';

function LeadsPage({ onAddActivity, onEdit, onNavigate }) {
    const {
        scoringAttributes,
        activityMasterFields,
        updateActivityMasterFields,
        sourceQualityScores,
        inventoryFitScores,
        decayRules,
        stageMultipliers
    } = usePropertyConfig();

    const { fireEvent } = useTriggers();
    const { startCall } = useCall();
    const { executeDistribution } = useDistribution();

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
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Add refresh trigger

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

    // Modals State
    const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
    const [selectedLeadsForMessage, setSelectedLeadsForMessage] = useState([]);

    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [selectedLeadsForTags, setSelectedLeadsForTags] = useState([]);

    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
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
    const [toast, setToast] = useState(null);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Server-side Pagination & Search
    useEffect(() => {
        const fetchLeads = async () => {
            setLoading(true);
            try {
                const response = await api.get(`leads`, {
                    params: {
                        page: currentPage,
                        limit: recordsPerPage,
                        search: searchTerm
                    }
                });

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
                    const name = lead.firstName ? `${lead.salutation || ""} ${lead.firstName} ${lead.lastName || ""}`.trim() : (lead.name || "Unknown");

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

                    return {
                        _id: lead._id || `lead-${index}`,

                        // Pass raw data for accurate filtering
                        req: lead.req || { type: lead.requirement, size: `${lead.areaMin || ""}-${lead.areaMax || ""} ${lead.areaMetric || ""}`.trim() },
                        budgetMin: lead.budgetMin,
                        budgetMax: lead.budgetMax,
                        propertyType: lead.propertyType,
                        stage: lead.stage || "New",

                        // ===== BASIC INFO =====
                        name: name,
                        mobile: lead.mobile || contact.phones?.[0]?.number || "",
                        email: lead.email || contact.emails?.[0]?.address || "",

                        // ===== REQUIREMENT =====
                        reqDisplay: lead.req || {
                            type: `${lead.requirement || ""} ${Array.isArray(lead.subType) ? lead.subType[0] : (lead.subType || "")}`.trim(),
                            size: `${lead.areaMin || ""}-${lead.areaMax || ""} ${lead.areaMetric || ""}`.trim(),
                        },

                        // ===== BUDGET =====
                        budget: lead.budget || (lead.budgetMin || lead.budgetMax
                            ? `₹${Number(lead.budgetMin || 0).toLocaleString()} - ₹${Number(lead.budgetMax || 0).toLocaleString()}`
                            : "—"),

                        // ===== LOCATION =====
                        location: lead.location || [
                            Array.isArray(lead.projectName) ? lead.projectName.join(", ") : lead.projectName,
                            Array.isArray(lead.locBlock) ? lead.locBlock.join(", ") : lead.locBlock,
                            lead.locArea,
                            lead.locCity
                        ].filter(Boolean).map(s => s.trim()).filter(s => s.length > 0).join(", "),

                        // ===== SOURCE & ASSIGNMENT =====
                        source: lead.source || contact.source || "Direct",
                        owner: lead.owner || contact.owner || (lead.assignment?.assignedTo) || "Unassigned",
                        team: contact.team || lead.assignment?.team || "",

                        // ===== STATUS =====
                        status: lead.status || { label: "New", class: "new" },

                        // ===== META =====
                        lastAct: lead.lastAct || "Today",
                        activity: lead.activity || "None",
                        remarks: lead.notes || lead.remarks || "",
                        matched: 0, // Simplified for now
                        addOn: lead.addOn || `Added ${new Date(lead.createdAt || Date.now()).toLocaleDateString()}`,

                        // ===== TEMPORARY LEAD META =====
                        isTemporary: lead.isTemporary || false,
                        expiryBadge
                    };
                });

                setLeads(mappedLeads);
                setTotalCount(totalDocs);
                setTotalPages(pages);

            } catch (error) {
                console.error("Error fetching leads:", error);
                toast.error("Error loading leads");
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(fetchLeads, 500);
        return () => clearTimeout(timer);
    }, [currentPage, recordsPerPage, searchTerm, filters, refreshTrigger]);


    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    }

    const getSelectedLeads = () => {
        // Use leads state instead of leadData
        return leads.filter(l => selectedIds.includes(l._id)).map(l => ({
            ...l,
            id: l.mobile // Ensure ID exists for shared components
        }));
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

                {/* Pipeline Dashboard - Scrolls Away */}
                <PipelineDashboard />

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
                                                        id: selectedLead.mobile, // Using mobile as ID for now since leadData doesn't have ID
                                                        name: selectedLead.name,
                                                        mobile: selectedLead.mobile
                                                    }];
                                                    onAddActivity(relatedAccount);
                                                }
                                            }}
                                        >
                                            <i className="fas fa-calendar-check"></i> Activities
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
                                            onClick={() => {
                                                if (window.confirm(`Mark ${selectedCount} leads as dormant?`)) {
                                                    showToast(`Marked ${selectedCount} leads as dormant.`);
                                                    setSelectedIds([]);
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
                                        onClick={() => {
                                            if (window.confirm(`Permanently delete ${selectedCount} leads?`)) {
                                                showToast(`Deleted ${selectedCount} leads.`);
                                                setSelectedIds([]);
                                            }
                                        }}
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
                            <div>Interaction (Remarks)</div>
                            <div>Assignment</div>
                        </div>
                    )}

                    {/* Content Area */}
                    <div id="leadListContent" style={{ display: viewMode === 'grid' || viewMode === 'card' ? 'block' : 'grid' }}>
                        {viewMode === 'card' ? (
                            /* Card View Grid */
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', padding: '20px' }}>
                                {leads.map((lead, idx) => (
                                    <div
                                        key={lead._id || lead.name || idx}
                                        style={{
                                            backgroundColor: '#fff',
                                            borderRadius: '12px',
                                            border: isSelected(lead._id) ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
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
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <div className="avatar-circle" style={{ width: '40px', height: '40px', fontSize: '1rem', background: '#eff6ff', color: 'var(--primary-color)' }}>{getInitials(lead.name)}</div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{lead.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{lead.mobile}</div>
                                                </div>
                                            </div>
                                            <input type="checkbox" checked={isSelected(lead._id)} onChange={() => toggleSelect(lead._id)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                        </div>
                                        {/* Simplified Card Content for brevity in fix */}
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>{lead.reqDisplay?.type || "Any Property"}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px', color: '#64748b' }}><span>{lead.reqDisplay?.size}</span><span style={{ fontWeight: 700, color: '#059669' }}>{lead.budget}</span></div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <span className={`status-badge ${lead.status?.class || 'new'}`} style={{ fontSize: '0.75rem' }}>{lead.status?.label || lead.status}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{lead.source}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                            <button className="btn-icon" style={{ flex: 1, padding: '6px', fontSize: '0.9rem', color: '#3b82f6', background: '#eff6ff', borderRadius: '6px', border: 'none', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); startCall({ name: lead.name, mobile: lead.mobile }, { purpose: 'Lead Follow-up', entityId: lead._id, entityType: 'lead' }); }}><i className="fas fa-phone-alt"></i></button>
                                            <button className="btn-icon" style={{ flex: 1, padding: '6px', fontSize: '0.9rem', color: '#64748b', background: '#f1f5f9', borderRadius: '6px', border: 'none', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onEdit(lead); }}><i className="fas fa-edit"></i></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* List View Render (Falling through to existing map below) */
                            null
                        )}


                        {/* List View Rendering */}
                        {viewMode === 'list' && (
                            loading ? <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div> : leads.map((c, idx) => {
                                if (!c) return null;
                                // Logic to split Intent (Buy/Rent) from Property Type (Residential Plot etc)
                                const typeStr = c.req?.type || 'Requirement Missing';
                                const intent = typeStr.split(/[\s,]+/)[0];
                                const propertyType = typeStr.replace(intent, '').replace(/^[\s,]+/, '');

                                return (
                                    <div
                                        key={c.name}
                                        className="list-item lead-list-grid"
                                        style={{
                                            padding: "15px 2rem",
                                            background: isSelected(c.name) ? '#f0f9ff' : '#fff',
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isSelected(c._id)) e.currentTarget.style.background = '#fafbfc';
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isSelected(c._id)) e.currentTarget.style.background = '#fff';
                                            else e.currentTarget.style.background = '#f0f9ff';
                                        }}
                                    >
                                        <div>
                                            <input
                                                type="checkbox"
                                                className="item-check"
                                                checked={isSelected(c._id)}
                                                onChange={() => toggleSelect(c._id)}
                                            />
                                        </div>
                                        <div className="col-profile">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                {/* Dynamic Lead Scoring Engine Badge */}
                                                {(() => {
                                                    const scoring = calculateLeadScore(c, c.activities || [], scoringConfig);
                                                    const temp = scoring.temperature;
                                                    return (
                                                        <div
                                                            className={`score-indicator ${temp.class}`}
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
                                                                cursor: 'pointer',
                                                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                                background: temp.color,
                                                                color: '#fff'
                                                            }}
                                                            onClick={(e) => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const aiExplanation = AIExpertService.explainLeadScore(c, scoringConfig);
                                                                setActiveScorePopover({
                                                                    name: c.name,
                                                                    x: rect.left,
                                                                    y: rect.bottom + 10,
                                                                    scoring,
                                                                    ai: aiExplanation
                                                                });
                                                            }}
                                                        >
                                                            {scoring.total}
                                                        </div>
                                                    );
                                                })()}
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    <div>
                                                        <a
                                                            href="#"
                                                            className="primary-text text-ellipsis"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                if (onNavigate) onNavigate('contact-detail', c._id);
                                                            }}
                                                            style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', display: 'block' }}
                                                        >
                                                            {c.name}
                                                        </a>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                                        {c.isTemporary && c.expiryBadge ? (
                                                            <span
                                                                style={{
                                                                    background: c.expiryBadge.class === 'badge-danger' ? '#fee2e2' : '#fef3c7',
                                                                    color: c.expiryBadge.class === 'badge-danger' ? '#991b1b' : '#92400e',
                                                                    fontSize: '0.65rem',
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 800,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px',
                                                                    border: c.expiryBadge.class === 'badge-danger' ? '1px solid #fca5a5' : '1px solid #fcd34d'
                                                                }}
                                                                title="Broker leads auto-expire in 15 days"
                                                            >
                                                                <i className="fas fa-clock"></i> {c.expiryBadge.label.toUpperCase()}
                                                            </span>
                                                        ) : (
                                                            LeadConversionService.isConverted(c.mobile) || c.isConverted ? (
                                                                <span
                                                                    onClick={() => onNavigate('contact-detail', c._id)}
                                                                    style={{ background: '#dcfce7', color: '#166534', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                >
                                                                    <i className="fas fa-check-circle"></i> CONVERTED
                                                                </span>
                                                            ) : (
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}><i className="fas fa-mobile-alt" style={{ marginRight: '6px', width: '12px' }}></i>{c.mobile}</div>
                                                            )
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
                                                    onBlur={() => showToast(`Requirement updated for ${c.name}`)}
                                                    style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize', outline: 'none', padding: '2px 0' }}
                                                >{intent}</div>
                                                <div style={{ marginTop: '4px', fontSize: '0.7rem' }}>
                                                    <span
                                                        onClick={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setActiveMatchPopover({ name: c.name, x: rect.left, y: rect.bottom + 10 });
                                                        }}
                                                        style={{ background: '#e0f2fe', color: '#0284c7', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(2, 132, 199, 0.1)' }}
                                                    >
                                                        {c.matched} Matches
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-budget">
                                            <div style={{ lineHeight: 1.4 }}>
                                                <div style={{ color: '#0f172a', fontSize: '0.75rem', fontWeight: 700, marginBottom: '2px' }}>{propertyType || 'Residential Plot'}</div>
                                                <div
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={() => showToast(`Budget updated for ${c.name}. Recalculating matches...`)}
                                                    style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.85rem', outline: 'none' }}
                                                >{(c.budget || '').replace('<br/>', ' ')}</div>
                                                <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{c?.req?.size || 'Std. Size'}</div>
                                            </div>
                                        </div>

                                        <div className="col-location">
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '3px' }}></i>
                                                <div
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={() => showToast(`Location preference updated for ${c.name}`)}
                                                    style={{ fontWeight: 600, color: '#334155', fontSize: '0.8rem', lineHeight: 1.3, outline: 'none' }}
                                                >{c.location}</div>
                                            </div>
                                        </div>

                                        <div className="col-status">
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.7rem', color: '#1a1f23', textTransform: 'uppercase' }}>{c.status?.label || 'NEW'}</div>
                                                <span className={`status-badge ${c.status?.class || 'new'}`} style={{ height: '20px', fontSize: '0.65rem', padding: '0 8px', borderRadius: '4px' }}>{(c.status?.class || 'new').toUpperCase()}</span>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {c.source}
                                                    <i className="fas fa-info-circle" title="AI Insight: Facebook leads convert better when called within 30 mins" style={{ fontSize: '0.6rem', color: '#cbd5e1' }}></i>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-interaction">
                                            <div style={{ lineHeight: 1.4, maxWidth: '240px' }}>
                                                <div className="address-clamp" style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500, fontStyle: 'italic', marginBottom: '4px' }}>"{c.remarks}"</div>
                                                <div style={{ color: '#27ae60', fontSize: '0.7rem', fontWeight: 700 }}>
                                                    <i className="fas fa-phone-alt" style={{ marginRight: '4px', transform: 'scaleX(-1) rotate(5deg)' }}></i>{c.activity} • <span style={{ color: '#64748b' }}>{c.lastAct}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-assignment">
                                            <div style={{ lineHeight: 1.4 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{c.owner}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.65rem', color: '#94a3b8' }}>
                                                    <i className="far fa-clock"></i>
                                                    <span dangerouslySetInnerHTML={{ __html: c.addOn }}></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                );
                            }))}
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
                onSend={(data) => {
                    console.log('Sending Message to Leads:', data);
                    // In real app, integrate with message service
                    // alert('Message Sent Successfully!');
                    setIsSendMessageOpen(false);
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
                onAssign={(assignmentDetails) => {
                    console.log('Assignment Details:', assignmentDetails);
                    setIsAssignModalOpen(false);
                    setSelectedIds([]);
                }}
            />



            {/* Send Mail Modal */}
            <SendMailModal
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
                onClose={() => setIsAddLeadModalOpen(false)}
                contactData={editingLead} // Pass selected lead data
                title={editingLead ? "Update Lead" : "Add New Lead"}
                saveLabel={editingLead ? "Update" : "Save"}
                mode="edit"
                onAdd={(updatedData) => {
                    console.log('Lead Updated:', updatedData);
                    setIsAddLeadModalOpen(false);
                    setEditingLead(null);
                    setSelectedIds([]);
                    // Trigger refresh by incrementing refreshTrigger
                    setRefreshTrigger(prev => prev + 1);
                }}
            />
            {/* Score Breakdown Popover for Lead Scoring Engine */}
            {
                activeScorePopover && (
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
                            { label: 'Attribute Score', val: activeScorePopover.scoring.breakdown.attribute, max: 77 }, // Using breakdown from new engine
                            { label: 'Activity Score', val: activeScorePopover.scoring.breakdown.activity, max: 50 },
                            { label: 'Source Quality', val: activeScorePopover.scoring.breakdown.source, max: 20 },
                            { label: 'Inventory Fit', val: activeScorePopover.scoring.breakdown.fit, max: 25 },
                            { label: 'Time Decay', val: activeScorePopover.scoring.breakdown.decay, max: -30 }, // Display negative
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
                                <p style={{ fontSize: '0.7rem', color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>{activeScorePopover.ai.summary}</p>
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

                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                            AI Intent: <span style={{ color: '#10b981', fontWeight: 900 }}>{activeScorePopover.scoring.intent.toUpperCase()}</span>
                        </div>
                    </div>
                )
            }

            {/* Top Matches Popover */}
            {
                activeMatchPopover && (() => {
                    const currentLead = leads.find(l => l.name === activeMatchPopover.name);
                    if (!currentLead) return null;

                    const baseBudget = parseBudget(currentLead.budget);
                    const leadContext = {
                        baseBudget,
                        leadSize: currentLead.req?.size ? parseSizeSqYard(currentLead.req.size) : 0,
                        leadType: currentLead.req?.type ? currentLead.req.type.toLowerCase() : '',
                        leadLocation: currentLead.location ? currentLead.location.toLowerCase() : '',
                        leadLocationSectors: (currentLead.location ? currentLead.location.toLowerCase() : '').split(',').map(s => s.trim()).filter(Boolean)
                    };

                    const topMatches = calculateMatch(currentLead, leadContext, {
                        location: 30, type: 20, budget: 25, size: 25
                    }, { includeNearby: true, minMatchScore: 10 }).slice(0, 5);

                    return (
                        <div
                            style={{ position: 'fixed', top: activeMatchPopover.y, left: activeMatchPopover.x, zIndex: 2000, background: '#fff', color: '#0f172a', padding: '16px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', minWidth: '320px' }}
                            onMouseLeave={() => setActiveMatchPopover(null)}
                        >
                            <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Top 5 Property Matches</span>
                                <span style={{ color: 'var(--primary-color)' }}>{topMatches.length} Found</span>
                            </div>

                            {topMatches.map((item, i) => (
                                <div
                                    key={i}
                                    className="match-item-hover"
                                    onClick={() => onNavigate('lead-matching', currentLead.mobile)}
                                    style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
                                >
                                    <div style={{ width: '50px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                                        <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.propertyType} at {item.location}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>₹{item.price} • {item.size}</div>
                                    </div>
                                    <div style={{ background: item.matchPercentage > 80 ? '#dcfce7' : '#fef3c7', color: item.matchPercentage > 80 ? '#166534' : '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0 }}>
                                        {item.matchPercentage}%
                                    </div>
                                </div>
                            ))}

                            {topMatches.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                                    No direct matches found. Try adjusting criteria.
                                </div>
                            )}

                            <button
                                onClick={() => onNavigate('lead-matching', currentLead.mobile)}
                                style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}
                            >
                                View All Matches Center
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

            {/* Toast Notification */}
            {
                toast && (
                    <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '10px 24px', borderRadius: '12px', zIndex: 3000, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                        {toast}
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
        </section >
    );
}

export default LeadsPage;
