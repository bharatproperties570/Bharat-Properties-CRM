import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { useProject, useUpdateProjectMutation } from '../../utils/crmHooks';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { fixDriveUrl, getYoutubeId, getReadableLocation } from '../../utils/helpers';
import ProjectWebsiteModal from './components/ProjectWebsiteModal';
import ProjectBroadcastModal from './components/ProjectBroadcastModal';
import LiveBroadcastBoard from '../../components/Marketing/LiveBroadcastBoard';
import SocialPostModal from '../../components/SocialPostModal';
import BulkInventoryModal from '../../components/inventory/BulkInventoryModal';
import AddInventoryModal from '../../components/AddInventoryModal';
import AddProjectPriceModal from '../../components/AddProjectPriceModal';

// Enterprise Modular Components
import ProjectKPIStrip from './components/ProjectKPIStrip';
import ProjectPricingSection from './components/ProjectPricingSection';
import ProjectDocumentsSection from './components/ProjectDocumentsSection';
import ProjectLeadsTab from './components/ProjectLeadsTab';
import ProjectActivityTab from './components/ProjectActivityTab';
import ProjectAnalyticsTab from './components/ProjectAnalyticsTab';
import ProjectInventoryTab from './components/ProjectInventoryTab';
import ProjectDealsTab from './components/ProjectDealsTab';

const ProjectDetailPage = ({ projectId: propProjectId, onBack: propOnBack, onNavigate, onEditProject }) => {
    const { id: routeProjectId } = useParams();
    const navigate = useNavigate();
    const projectId = propProjectId || routeProjectId;
    const onBack = propOnBack || (() => {
        if (onNavigate) {
            onNavigate('projects');
        } else {
            navigate('/projects');
        }
    });

    const { isDark } = useTheme();
    const { getLookupValue } = usePropertyConfig();
    const { data: projectQuery, isFetching: loading, refetch: fetchProjectDetails } = useProject(projectId);
    const project = projectQuery?.data || null;
    
    // Enterprise Tab Navigation & Workspace Display Mode
    const [activeTab, setActiveTab] = useState('activity');
    const [workspaceMode, setWorkspaceMode] = useState('tab'); // 'tab' | 'stacked'
    const [inventoryData, setInventoryData] = useState([]);
    const [dealsData, setDealsData] = useState([]);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [blocksData, setBlocksData] = useState([]);
    const [leadsCount, setLeadsCount] = useState(0);

    useEffect(() => {
        if (project) {
            setBlocksData(project.blocks || []);
        }
    }, [project]);

    const [isWebsiteModalOpen, setIsWebsiteModalOpen] = useState(false);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [activeCampaignId, setActiveCampaignId] = useState('');
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isEditUnitModalOpen, setIsEditUnitModalOpen] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [mediaViewer, setMediaViewer] = useState({ isOpen: false, data: null });
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const updateMutation = useUpdateProjectMutation();

    const handleSavePrice = async (updatedProjectData) => {
        try {
            const response = await updateMutation.mutateAsync({
                id: updatedProjectData._id || project._id,
                data: { pricing: updatedProjectData.pricing }
            });

            if (response && response.success) {
                toast.success("Project pricing saved successfully");
                fetchProjectDetails();
                if (projectId) {
                    fetchAnalytics(projectId);
                }
            } else {
                toast.error("Failed to save project pricing");
            }
        } catch (error) {
            console.error("Error saving pricing:", error);
            toast.error("Error saving project pricing");
        } finally {
            setIsPriceModalOpen(false);
        }
    };

    const fetchInventory = async (pid) => {
        try {
            const response = await api.get(`inventory?projectId=${pid}&limit=1000&sortBy=unitNo&sortOrder=1`);
            if (response.data && response.data.success) {
                setInventoryData(response.data.records || response.data.data || []);
            }
        } catch (err) {
            console.error("Error fetching project inventory:", err);
        }
    };

    const fetchDeals = async (pid) => {
        try {
            const response = await api.get(`deals?projectId=${pid}&stage=all&limit=1000`);
            if (response.data && response.data.success) {
                setDealsData(response.data.records || []);
            }
        } catch (err) {
            console.error("Error fetching project deals:", err);
        }
    };

    const fetchAnalytics = async (pid) => {
        try {
            const response = await api.get(`projects/${pid}/analytics`);
            if (response.data && response.data.success) {
                setAnalyticsData(response.data.data);
            }
        } catch (err) {
            console.error("Error fetching project analytics:", err);
        }
    };

    const fetchLeadsMeta = async (pid) => {
        try {
            const response = await api.get(`projects/${pid}/leads?limit=1`);
            if (response.data && response.data.success) {
                setLeadsCount(response.data.totalCount || 0);
            }
        } catch (err) {
            console.error("Error fetching leads meta:", err);
        }
    };

    const handleDeleteUnit = async (unitId) => {
        if (!window.confirm("Are you sure you want to delete this unit?")) return;
        try {
            const res = await api.delete(`inventory/${unitId}`);
            if (res.data?.success) {
                toast.success("Unit deleted successfully");
                fetchInventory(projectId);
                fetchAnalytics(projectId);
            }
        } catch (err) {
            console.error("Failed to delete unit:", err);
            toast.error("Failed to delete unit");
        }
    };

    const handleEditUnit = (unit) => {
        setSelectedUnit(unit);
        setIsEditUnitModalOpen(true);
    };

    useEffect(() => {
        if (projectId) {
            fetchInventory(projectId);
            fetchDeals(projectId);
            fetchAnalytics(projectId);
            fetchLeadsMeta(projectId);
        }
        
        const handleProjectUpdate = () => {
            fetchProjectDetails();
            if (projectId) {
                fetchInventory(projectId);
                fetchDeals(projectId);
                fetchAnalytics(projectId);
                fetchLeadsMeta(projectId);
            }
        };
        window.addEventListener('project-updated', handleProjectUpdate);
        return () => window.removeEventListener('project-updated', handleProjectUpdate);
    }, [projectId, fetchProjectDetails]);

    // Handle tab selection with smooth anchor scroll when in stacked mode
    const handleTabSelect = (tabId) => {
        setActiveTab(tabId);
        if (workspaceMode === 'stacked') {
            const el = document.getElementById(`module-${tabId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-gray)' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Initializing Project Command Center...</span>
        </div>
    );
    if (!project) return (
        <div className="error-state" style={{ padding: '60px', textAlign: 'center' }}>
            <span>Project not found</span> or access restricted.
        </div>
    );

    const totalInventoryCount = analyticsData?.inventory?.total ?? (inventoryData.length || Number(project.totalUnits) || 0);
    const soldInventory = analyticsData?.inventory?.sold ?? inventoryData.filter(i => {
        const s = (i.status?.lookup_value || i.status || '').toLowerCase();
        return s.includes('sold');
    }).length;
    const availableInventory = analyticsData?.inventory?.available ?? inventoryData.filter(i => {
        const s = (i.status?.lookup_value || i.status || '').toLowerCase();
        return !s.includes('sold') && !s.includes('hold') && !s.includes('book');
    }).length;

    const activeDealsCount = analyticsData?.deals?.active ?? dealsData.filter(d => !['Closed', 'Cancelled', 'Closed Won', 'Closed Lost'].includes(d.stage)).length;
    const closedDealsCount = analyticsData?.deals?.closed ?? dealsData.filter(d => ['Closed', 'Closed Won', 'Closed (Won)'].includes(d.stage) || (d.stage === 'Closed' && d.status === 'Won')).length;

    const dealsWithPrice = dealsData.filter(d => (d.price || 0) > 0);
    const avgPricePerUnit = analyticsData?.deals?.avgDealValue ?? (
        dealsWithPrice.length > 0
            ? Math.round(dealsWithPrice.reduce((acc, d) => acc + d.price, 0) / dealsWithPrice.length)
            : (project.pricing?.basePrice?.amount ? Number(project.pricing.basePrice.amount) * 1000 : 0)
    );

    const absorptionRate = analyticsData?.inventory?.absorptionRate ?? (
        totalInventoryCount > 0 ? Math.round((soldInventory / totalInventoryCount) * 100) : 0
    );
    const revenuePotential = analyticsData?.deals?.stockPotential ?? (
        availableInventory * avgPricePerUnit
    );

    const modulesList = [
        { id: 'inventory', shortLabel: 'Units', title: `Units & Inventory Register (${inventoryData.length})`, icon: 'fas fa-boxes-stacked', color: '#3b82f6', count: inventoryData.length },
        { id: 'deals', shortLabel: 'Deals', title: `Sales Pipeline & Deals (${dealsData.length})`, icon: 'fas fa-handshake', color: '#10b981', count: dealsData.length },
        { id: 'leads', shortLabel: 'Prospects', title: `Interested Prospects & Buyer Pool (${leadsCount})`, icon: 'fas fa-users-line', color: '#f59e0b', count: leadsCount },
        { id: 'pricing', shortLabel: 'Pricing', title: 'Pricing Hub & Payment Schedules', icon: 'fas fa-tags', color: '#6366f1' },
        { id: 'documents', shortLabel: 'Documents', title: `Regulatory Approvals & Documents (${project.projectDocuments?.length || 0})`, icon: 'fas fa-file-shield', color: '#06b6d4', count: project.projectDocuments?.length || 0 },
        { id: 'analytics', shortLabel: 'Analytics', title: 'Visual Intelligence & Real Analytics', icon: 'fas fa-chart-line', color: '#8b5cf6' },
        { id: 'activity', shortLabel: 'Audit', title: 'Operational Audit Trail & Interaction History', icon: 'fas fa-clock-rotate-left', color: '#f43f5e' },
    ];
    const activeTabInfo = modulesList.find(m => m.id === activeTab) || modulesList[0];

    const cardStyle = {
        background: 'var(--bg-card)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)'
    };

    const sectionTitleStyle = {
        fontSize: '0.78rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    return (
        <div className="project-detail-page" style={{ background: 'var(--bg-gray)', minHeight: '100vh', paddingBottom: '32px' }}>
            <style>{`
                @media (max-width: 1240px) {
                    .enterprise-3col-container {
                        flex-direction: column !important;
                    }
                    .enterprise-left-col, .enterprise-right-col {
                        width: 100% !important;
                        flex: 1 1 100% !important;
                        max-width: 100% !important;
                    }
                }
            `}</style>

            {/* 1️⃣ STICKY MASTER TOP HEADER */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 1000,
                background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderBottom: '1px solid var(--border-color)',
                padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)', backdropFilter: 'blur(12px)', flexWrap: 'wrap', gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: '1px solid var(--border-color)',
                        borderRadius: '10px', width: '38px', height: '38px',
                        cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                                {project.name}
                            </h1>
                            <span style={{
                                backgroundColor: 'var(--bg-gray)', color: 'var(--text-muted)',
                                padding: '3px 10px', borderRadius: '16px',
                                fontSize: '0.68rem', fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.04em', border: '1px solid var(--border-color)'
                            }}>
                                PRJ-{project?._id ? project._id.substring(Math.max(0, project._id.length - 6)).toUpperCase() : 'NEW'}
                            </span>

                            <span style={{
                                backgroundColor: '#ecfdf5', color: '#065f46',
                                padding: '3px 10px', borderRadius: '16px',
                                fontSize: '0.68rem', fontWeight: 800,
                                textTransform: 'uppercase', border: '1px solid #10b98133'
                            }}>
                                {getLookupValue('ProjectStatus', project.status) || 'Active'}
                            </span>

                            {/* Enterprise Website Publication Status Toggle */}
                            <button
                                onClick={() => setIsWebsiteModalOpen(true)}
                                style={{
                                    backgroundColor: project.isPublished 
                                        ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') 
                                        : (isDark ? 'rgba(59, 130, 246, 0.12)' : '#eff6ff'),
                                    color: project.isPublished ? '#10b981' : '#2563eb',
                                    padding: '3px 12px', borderRadius: '16px',
                                    fontSize: '0.68rem', fontWeight: 800,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                    border: `1px solid ${project.isPublished ? '#10b98144' : '#3b82f644'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: project.isPublished ? '0 0 10px rgba(16, 185, 129, 0.15)' : 'none'
                                }}
                                title={project.isPublished ? "Live on Bharat Properties website catalog - Click to manage" : "Draft - Click to publish to website"}
                            >
                                <i className={`fas ${project.isPublished ? 'fa-globe text-emerald-500' : 'fa-globe text-blue-500'}`}></i>
                                {project.isPublished ? 'Live on Website' : 'Publish to Website'}
                            </button>

                            {/* Direct External Link to www.bharatproperties.co when Published */}
                            {project.isPublished && (
                                <a
                                    href={`https://www.bharatproperties.co/project/${project.websiteMetadata?.slug || project._id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#dcfce7',
                                        color: '#15803d',
                                        padding: '3px 10px',
                                        borderRadius: '16px',
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        textDecoration: 'none',
                                        border: '1px solid #10b98144',
                                        transition: 'all 0.2s ease'
                                    }}
                                    title="Open live project on www.bharatproperties.co"
                                >
                                    <span>View on Website</span>
                                    <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>
                                </a>
                            )}

                            {project.reraNumber && (
                                <span style={{
                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', color: isDark ? '#60a5fa' : '#1e40af',
                                    padding: '3px 10px', borderRadius: '16px',
                                    fontSize: '0.68rem', fontWeight: 800,
                                    textTransform: 'uppercase', border: '1px solid #3b82f633'
                                }}>
                                    RERA: {project.reraNumber}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            <i className="fas fa-map-marker-alt text-red-500"></i>
                            {project.address?.location || project.locationSearch || 'No location set'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Omnichannel Direct Broadcast Button (WhatsApp, SMS, RCS, Email) */}
                    <button 
                        onClick={() => setIsBroadcastModalOpen(true)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                        title="Broadcast project to Matched Prospects, BNA Broker circles & WhatsApp Groups via WhatsApp, SMS, RCS, Email"
                    >
                        <i className="fas fa-bullhorn" style={{ fontSize: '0.8rem' }}></i>
                        <span>Broadcast Project</span>
                    </button>

                    {/* Promote Studio Button (Social Media + 99acres/Magicbricks/Housing/BNA) */}
                    <button 
                        onClick={() => setIsSocialModalOpen(true)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            background: isDark ? 'rgba(15, 23, 42, 0.8)' : '#f8fafc',
                            color: isDark ? '#f1f5f9' : '#0f172a',
                            border: '1px solid var(--border-color)',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
                            transition: 'all 0.15s ease'
                        }}
                        title="Promote on Social Media & Real Estate Portals (99acres, Magicbricks, Housing.com, etc.)"
                    >
                        <i className="fas fa-bullseye text-cyan-500" style={{ fontSize: '0.8rem' }}></i>
                        <span>Promote</span>
                    </button>

                    {/* Operations Three-Dot Menu */}
                    <div style={{ position: 'relative' }}>
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Quick Actions Menu"
                        >
                            <i className="fas fa-ellipsis-v"></i>
                        </button>
                        
                        {isMenuOpen && (
                            <>
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setIsMenuOpen(false)}></div>
                                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '220px', background: isDark ? 'rgba(7, 22, 43, 0.98)' : '#ffffff', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', zIndex: 1000, overflow: 'hidden', backdropFilter: 'blur(16px)' }}>
                                    <div onClick={() => { setIsMenuOpen(false); onEditProject && onEditProject(project); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-edit text-blue-500" style={{ width: '16px' }}></i> Edit Project
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setIsPriceModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-rupee-sign text-emerald-500" style={{ width: '16px' }}></i> Configure Pricing
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setIsBroadcastModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-bullhorn text-indigo-500" style={{ width: '16px' }}></i> Omnichannel Broadcast
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setIsSocialModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-bullseye text-cyan-500" style={{ width: '16px' }}></i> Promote
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setActiveTab('inventory'); setIsBulkModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-layer-group text-purple-500" style={{ width: '16px' }}></i> Add Bulk Inventory
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); onNavigate?.('project-master-plan', project._id); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-map text-orange-500" style={{ width: '16px' }}></i> Master Plan Workspace
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); handleTabSelect('documents'); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <i className="fas fa-file-shield text-cyan-500" style={{ width: '16px' }}></i> Regulatory Documents
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Team & Visibility Tag */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '4px 10px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px'
                    }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: 'var(--primary, #3b82f6)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                            <i className="fas fa-building"></i>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {project.team?.name || (Array.isArray(project.team) && project.team[0]?.name) || 'All Teams'}
                            </span>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                {project.visibleTo || 'Public Scope'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* 2️⃣ TOP 8-METRIC KPI DASHBOARD STRIP */}
            <ProjectKPIStrip 
                inventoryData={inventoryData} 
                dealsData={dealsData} 
                leadsCount={leadsCount} 
                project={project} 
                analyticsData={analyticsData}
            />

            {/* 3️⃣ 3-COLUMN MASTER WORKSPACE: LEFT (SPECS) | CENTRE (LIVE ACTIVITIES) | RIGHT (INSIGHTS & OPERATIONS) */}
            <div className="enterprise-3col-container" style={{ 
                maxWidth: '100%', 
                margin: '8px auto', 
                padding: '0 12px', 
                display: 'flex', 
                gap: '10px', 
                alignItems: 'flex-start'
            }}>

                {/* ══════════════════════════════════════════════════════════════════
                    COLUMN 1: LEFT - PROJECT ACTUAL DETAILS (290px width)
                    Contains: Master Overview, Blocks, Location & Map, Amenities
                   ══════════════════════════════════════════════════════════════════ */}
                <aside className="enterprise-left-col" style={{ 
                    flex: '0 0 290px', 
                    width: '290px',
                    minWidth: '290px',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 2px' }}>
                        <i className="fas fa-file-invoice text-blue-500" style={{ fontSize: '0.8rem' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Project Details
                        </span>
                    </div>

                    {/* 1. Master Overview Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-info-circle text-blue-500"></i> Master Overview</h3>
                        </div>
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <DetailItem label="Category" value={project.category} lookupType="Category" />
                                <DetailItem label="Sub Category" value={project.subCategory} lookupType="SubCategory" />
                            </div>

                            <DetailItem
                                label="Primary Developer"
                                value={project.developerName}
                                boldValue
                                onClick={project.developerId ? () => onNavigate?.('company-detail', project.developerId) : undefined}
                            />

                            {project.secondaryDeveloper && (
                                <DetailItem label="Joint Venture Partner" value={project.secondaryDeveloper} />
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <DetailItem label="Joint Venture" value={project.isJointVenture ? 'YES' : 'NO'} />
                                <DetailItem 
                                    label="Land Area" 
                                    value={
                                        typeof project.landArea === 'object' && project.landArea !== null
                                            ? `${project.landArea.value || ''} ${project.landArea.unit || project.landAreaUnit || ''}`.trim() || '--'
                                            : (project.landArea ? `${project.landArea} ${project.landAreaUnit || ''}`.trim() : '--')
                                    } 
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <DetailItem label="Total Blocks" value={project.totalBlocks || blocksData.length} />
                                <DetailItem label="Total Floors" value={project.totalFloors || '--'} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <DetailItem label="Unit Type" value={project.unitType} lookupType="UnitType" />
                                <DetailItem label="Approved Bank" value={project.approvedBank || '--'} />
                            </div>

                            {project.description && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                    <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 2px 0' }}>Project Description</p>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.4 }}>
                                        {project.description}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Project Blocks Card */}
                    {blocksData.length > 0 && (
                        <div style={cardStyle}>
                            <div style={sectionHeaderStyle}>
                                <h3 style={sectionTitleStyle}><i className="fas fa-cubes text-indigo-500"></i> Project Blocks ({blocksData.length})</h3>
                            </div>
                            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {blocksData.map((b, idx) => (
                                    <BlockMiniCard key={idx} block={b} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. Location Info & Interactive Map Card */}
                    <div style={cardStyle}>
                        <div style={{ height: '130px', background: 'var(--bg-gray)' }}>
                            <iframe
                                title="Project Location Map"
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBd2gdMJVt5C_tgYqWoRbBiatzmevYdB9U&q=${encodeURIComponent(getLookupValue('Location', project.address?.location) || project.address?.location || project.name)}`}
                                allowFullScreen
                            ></iframe>
                        </div>
                        <div style={{ padding: '8px 10px', background: 'var(--bg-card)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', borderTop: '1px solid var(--border-color)' }}>
                            <DetailItem label="City" value={project.address?.city} lookupType="City" />
                            <DetailItem label="State" value={project.address?.state} lookupType="State" />
                            <div style={{ gridColumn: 'span 2' }}>
                                <DetailItem label="Address" value={project.address?.street || project.address?.location} lookupType={!project.address?.street ? "Location" : undefined} />
                            </div>
                        </div>
                    </div>

                    {/* 4. Amenities Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-swimming-pool text-cyan-500"></i> Amenities</h3>
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {project.amenities && Object.keys(project.amenities).length > 0 ? Object.entries(project.amenities).map(([key, val], idx) => val && (
                                    <span key={idx} style={{ padding: '3px 6px', background: 'var(--bg-gray)', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className="fas fa-check-circle text-emerald-500" style={{ fontSize: '0.52rem' }}></i> {key}
                                    </span>
                                )) : (
                                    <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>No amenities listed.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ══════════════════════════════════════════════════════════════════
                    COLUMN 2: CENTRE - LIVE ACTIVITIES & OPERATIONAL WORKSPACE (Flex 1)
                    Contains: All 7 interactive modules (Units, Deals, Prospects, 
                    Pricing, Documents, Visual Analytics, Audit Trail)
                    Features: Sticky Navigation Bar + Visible Headings Guarantee
                   ══════════════════════════════════════════════════════════════════ */}
                <main className="enterprise-center-col" style={{ 
                    flex: '1 1 0', 
                    minWidth: '0', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px' 
                }}>

                    {/* Live Broadcast Telemetry & Operator Recovery Board (Phase 4) */}
                    {project?._id && (
                        <LiveBroadcastBoard 
                            projectId={project._id} 
                            campaignId={activeCampaignId} 
                            onCampaignChange={setActiveCampaignId} 
                        />
                    )}

                    {/* 📌 PERMANENT STICKY MODULE NAVIGATION BAR */}
                    <div style={{ 
                        position: 'sticky', 
                        top: '52px', 
                        zIndex: 900,
                        background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)', 
                        backdropFilter: 'blur(12px)',
                        borderRadius: '10px', 
                        border: '1px solid var(--border-color)', 
                        padding: '4px 8px',
                        boxShadow: '0 3px 12px -2px rgba(0,0,0,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        {/* Module Buttons - Always Visible */}
                        <div className="no-scrollbar" style={{ display: 'flex', gap: '4px', overflowX: 'auto', flex: 1, padding: '2px 0' }}>
                            <TabItem id="inventory" label="Inventory" icon="fas fa-boxes-stacked" active={activeTab === 'inventory'} onClick={handleTabSelect} isDark={isDark} count={inventoryData.length} />
                            <TabItem id="deals" label="Deals" icon="fas fa-handshake" active={activeTab === 'deals'} onClick={handleTabSelect} isDark={isDark} count={dealsData.length} />
                            <TabItem id="leads" label="Prospects" icon="fas fa-users-line" active={activeTab === 'leads'} onClick={handleTabSelect} isDark={isDark} count={leadsCount} />
                            <TabItem id="pricing" label="Pricing Hub" icon="fas fa-tags" active={activeTab === 'pricing'} onClick={handleTabSelect} isDark={isDark} />
                            <TabItem id="documents" label="Documents" icon="fas fa-file-shield" active={activeTab === 'documents'} onClick={handleTabSelect} isDark={isDark} count={project.projectDocuments?.length || 0} />
                            <TabItem id="analytics" label="Visual Analytics" icon="fas fa-chart-line" active={activeTab === 'analytics'} onClick={handleTabSelect} isDark={isDark} />
                            <TabItem id="activity" label="Audit Trail" icon="fas fa-clock-rotate-left" active={activeTab === 'activity'} onClick={handleTabSelect} isDark={isDark} />
                        </div>

                        {/* View Mode Toggle: Tab Focus vs All Modules Stacked */}
                        <div style={{
                            display: 'flex',
                            background: 'var(--bg-gray)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            padding: '2px',
                            flexShrink: 0
                        }}>
                            <button
                                onClick={() => setWorkspaceMode('tab')}
                                style={{
                                    padding: '4px 8px',
                                    border: 'none',
                                    borderRadius: '5px',
                                    background: workspaceMode === 'tab' ? 'var(--bg-card)' : 'transparent',
                                    color: workspaceMode === 'tab' ? '#2563eb' : 'var(--text-muted)',
                                    fontWeight: 800,
                                    fontSize: '0.68rem',
                                    cursor: 'pointer',
                                    boxShadow: workspaceMode === 'tab' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                                title="Show single focused module tab"
                            >
                                <i className="fas fa-layer-group" style={{ marginRight: '4px' }}></i> Tab Mode
                            </button>
                            <button
                                onClick={() => setWorkspaceMode('stacked')}
                                style={{
                                    padding: '4px 8px',
                                    border: 'none',
                                    borderRadius: '5px',
                                    background: workspaceMode === 'stacked' ? 'var(--bg-card)' : 'transparent',
                                    color: workspaceMode === 'stacked' ? '#2563eb' : 'var(--text-muted)',
                                    fontWeight: 800,
                                    fontSize: '0.68rem',
                                    cursor: 'pointer',
                                    boxShadow: workspaceMode === 'stacked' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                                title="Show all modules stacked continuously"
                            >
                                <i className="fas fa-stream" style={{ marginRight: '4px' }}></i> All Modules
                            </button>
                        </div>
                    </div>

                    {/* ── WORKSPACE CONTENT ── */}
                    {workspaceMode === 'tab' ? (
                        /* FOCUSED TAB VIEW */
                        <div style={{ width: '100%' }}>
                            {activeTab === 'inventory' && (
                                <ProjectInventoryTab 
                                    inventoryData={inventoryData}
                                    blocksData={blocksData}
                                    onNavigate={onNavigate}
                                    onEditUnit={handleEditUnit}
                                    onDeleteUnit={handleDeleteUnit}
                                    onOpenBulkModal={() => setIsBulkModalOpen(true)}
                                    isDark={isDark}
                                    projectName={project.name}
                                />
                            )}

                            {activeTab === 'deals' && (
                                <ProjectDealsTab 
                                    dealsData={dealsData}
                                    onNavigate={onNavigate}
                                    isDark={isDark}
                                />
                            )}

                            {activeTab === 'leads' && (
                                <ProjectLeadsTab 
                                    projectId={projectId} 
                                    projectName={project.name}
                                    onNavigate={onNavigate} 
                                />
                            )}

                            {activeTab === 'pricing' && (
                                <ProjectPricingSection 
                                    project={project} 
                                    onEditPricing={() => setIsPriceModalOpen(true)}
                                />
                            )}

                            {activeTab === 'documents' && (
                                <ProjectDocumentsSection 
                                    project={project}
                                    onOpenMedia={(data) => setMediaViewer({ isOpen: true, data })}
                                />
                            )}

                            {activeTab === 'analytics' && (
                                <ProjectAnalyticsTab 
                                    projectId={projectId}
                                    inventoryData={inventoryData}
                                    dealsData={dealsData}
                                />
                            )}

                            {activeTab === 'activity' && (
                                <ProjectActivityTab 
                                    projectId={projectId}
                                    projectName={project.name}
                                />
                            )}
                        </div>
                    ) : (
                        /* ALL MODULES STACKED VIEW (Every single heading permanently rendered) */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Module 1: Inventory */}
                            <section id="module-inventory" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-boxes-stacked text-blue-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        1. Units & Inventory Register ({inventoryData.length})
                                    </h3>
                                </div>
                                <ProjectInventoryTab 
                                    inventoryData={inventoryData}
                                    blocksData={blocksData}
                                    onNavigate={onNavigate}
                                    onEditUnit={handleEditUnit}
                                    onDeleteUnit={handleDeleteUnit}
                                    onOpenBulkModal={() => setIsBulkModalOpen(true)}
                                    isDark={isDark}
                                    projectName={project.name}
                                />
                            </section>

                            {/* Module 2: Deals */}
                            <section id="module-deals" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-handshake text-emerald-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        2. Sales Pipeline & Deals ({dealsData.length})
                                    </h3>
                                </div>
                                <ProjectDealsTab 
                                    dealsData={dealsData}
                                    onNavigate={onNavigate}
                                    isDark={isDark}
                                />
                            </section>

                            {/* Module 3: Leads */}
                            <section id="module-leads" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-users-line text-amber-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        3. Interested Prospects & Buyer Pool ({leadsCount})
                                    </h3>
                                </div>
                                <ProjectLeadsTab 
                                    projectId={projectId} 
                                    projectName={project.name}
                                    onNavigate={onNavigate} 
                                />
                            </section>

                            {/* Module 4: Pricing */}
                            <section id="module-pricing" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-tags text-indigo-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        4. Pricing Hub & Payment Schedules
                                    </h3>
                                </div>
                                <ProjectPricingSection 
                                    project={project} 
                                    onEditPricing={() => setIsPriceModalOpen(true)}
                                />
                            </section>

                            {/* Module 5: Documents */}
                            <section id="module-documents" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-file-shield text-cyan-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        5. Regulatory Approvals & Documents
                                    </h3>
                                </div>
                                <ProjectDocumentsSection 
                                    project={project}
                                    onOpenMedia={(data) => setMediaViewer({ isOpen: true, data })}
                                />
                            </section>

                            {/* Module 6: Analytics */}
                            <section id="module-analytics" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-chart-line text-purple-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        6. Visual Intelligence & Real Analytics
                                    </h3>
                                </div>
                                <ProjectAnalyticsTab 
                                    projectId={projectId}
                                    inventoryData={inventoryData}
                                    dealsData={dealsData}
                                />
                            </section>

                            {/* Module 7: Activity */}
                            <section id="module-activity" style={{ scrollMarginTop: '110px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <i className="fas fa-clock-rotate-left text-rose-500" style={{ fontSize: '0.9rem' }}></i>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                                        7. Operational Audit Trail & Interaction History
                                    </h3>
                                </div>
                                <ProjectActivityTab 
                                    projectId={projectId}
                                    projectName={project.name}
                                />
                            </section>
                        </div>
                    )}
                </main>

                {/* ══════════════════════════════════════════════════════════════════
                    COLUMN 3: RIGHT - DATA TO RELATE & STRATEGY (290px width)
                    Contains: Operations, Market Insights, Milestones, Media, System Meta
                   ══════════════════════════════════════════════════════════════════ */}
                <aside className="enterprise-right-col" style={{ 
                    flex: '0 0 290px', 
                    width: '290px',
                    minWidth: '290px',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 2px' }}>
                        <i className="fas fa-chart-pie text-purple-500" style={{ fontSize: '0.8rem' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Data to Relate & Insights
                        </span>
                    </div>

                    {/* 1. Market Insights Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-atom text-purple-500"></i> Market Insights</h3>
                        </div>
                        <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <InsightMetric label="Avg Ticket Size" value={avgPricePerUnit > 0 ? formatIndianCurrency(avgPricePerUnit) : 'Rate On Request'} />
                            <InsightMetric label="Absorption" value={`${absorptionRate}%`} color="#3b82f6" />
                            <InsightMetric label="Closed Deals" value={closedDealsCount} />
                            <InsightMetric 
                                label="Stock Potential" 
                                value={revenuePotential > 0 ? formatIndianCurrency(revenuePotential) : 'Enquiry Based'} 
                                color="#10b981" 
                            />
                        </div>
                    </div>

                    {/* 2. Enterprise Functional Milestone Timeline Card */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-timeline text-blue-500"></i> Milestone Timeline</h3>
                            <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #3b82f633',
                                textTransform: 'uppercase'
                            }}>
                                {getLookupValue('ProjectStatus', project.status) || project.status || 'Active'}
                            </span>
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                            {/* Dynamic Timeline Progression Engine */}
                            {(() => {
                                const now = new Date();
                                const launch = project.launchDate ? new Date(project.launchDate) : null;
                                const completion = project.expectedCompletionDate ? new Date(project.expectedCompletionDate) : null;
                                const possession = project.possessionDate ? new Date(project.possessionDate) : null;

                                const statusStr = String(getLookupValue('ProjectStatus', project.status) || project.status || '').toLowerCase();
                                const isReadyOrDelivered = statusStr.includes('ready') || statusStr.includes('delivered') || statusStr.includes('completed');

                                let progressPercent = 0;
                                if (isReadyOrDelivered) {
                                    progressPercent = 100;
                                } else if (launch && completion && completion.getTime() > launch.getTime()) {
                                    const total = completion.getTime() - launch.getTime();
                                    const current = now.getTime() - launch.getTime();
                                    progressPercent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
                                } else if (launch && now >= launch) {
                                    progressPercent = 40;
                                }

                                const isLaunchDone = Boolean(launch && now >= launch) || isReadyOrDelivered;
                                const isCompletionDone = Boolean(completion && now >= completion) || isReadyOrDelivered;
                                const isPossessionDone = Boolean(possession && now >= possession) || statusStr.includes('delivered');

                                const formatDateStr = (d) => {
                                    if (!d || isNaN(d.getTime())) return 'Date Not Set';
                                    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                };

                                const getDiffLabel = (targetDate, isPast) => {
                                    if (!targetDate || isNaN(targetDate.getTime())) return '';
                                    const diffDays = Math.round(Math.abs(targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                    if (diffDays === 0) return 'Today';
                                    if (diffDays < 30) return `${diffDays} days ${isPast ? 'ago' : 'left'}`;
                                    const diffMonths = Math.round(diffDays / 30);
                                    return `${diffMonths} mo ${isPast ? 'ago' : 'remaining'}`;
                                };

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {/* Progress Bar & Stage Indicator */}
                                        <div style={{
                                            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0'}`
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                                                    SCHEDULE COMPLETION
                                                </span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: progressPercent === 100 ? '#10b981' : '#2563eb' }}>
                                                    {progressPercent}%
                                                </span>
                                            </div>
                                            <div style={{
                                                width: '100%',
                                                height: '6px',
                                                borderRadius: '3px',
                                                background: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    width: `${progressPercent}%`,
                                                    height: '100%',
                                                    borderRadius: '3px',
                                                    background: progressPercent === 100
                                                        ? 'linear-gradient(90deg, #10b981, #059669)'
                                                        : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </div>

                                        {/* Timeline Points */}
                                        <div style={{
                                            position: 'relative',
                                            paddingLeft: '20px',
                                            borderLeft: `2px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px'
                                        }}>
                                            {/* 1. Launch Date */}
                                            <div style={{ position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '-26px',
                                                    top: '2px',
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '50%',
                                                    background: isLaunchDone ? '#10b981' : (isDark ? '#1e293b' : '#ffffff'),
                                                    border: `2px solid ${isLaunchDone ? '#10b981' : '#94a3b8'}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: isLaunchDone ? '0 0 6px rgba(16, 185, 129, 0.4)' : 'none'
                                                }}>
                                                    {isLaunchDone && <i className="fas fa-check" style={{ fontSize: '0.45rem', color: '#ffffff' }}></i>}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                        Project Launch
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        color: isLaunchDone ? '#10b981' : 'var(--text-muted)'
                                                    }}>
                                                        {isLaunchDone ? (launch && now >= launch ? getDiffLabel(launch, true) : 'Active') : 'Upcoming'}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block' }}>
                                                    {formatDateStr(launch)}
                                                </span>
                                            </div>

                                            {/* 2. Expected Completion */}
                                            <div style={{ position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '-26px',
                                                    top: '2px',
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '50%',
                                                    background: isCompletionDone ? '#10b981' : (isLaunchDone ? '#3b82f6' : (isDark ? '#1e293b' : '#ffffff')),
                                                    border: `2px solid ${isCompletionDone ? '#10b981' : (isLaunchDone ? '#3b82f6' : '#94a3b8')}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: !isCompletionDone && isLaunchDone ? '0 0 6px rgba(59, 130, 246, 0.5)' : 'none'
                                                }}>
                                                    {isCompletionDone && <i className="fas fa-check" style={{ fontSize: '0.45rem', color: '#ffffff' }}></i>}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                        Expected Completion
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        color: isCompletionDone ? '#10b981' : '#3b82f6'
                                                    }}>
                                                        {isCompletionDone ? 'Completed' : (completion ? getDiffLabel(completion, false) : 'In Progress')}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block' }}>
                                                    {formatDateStr(completion)}
                                                </span>
                                            </div>

                                            {/* 3. Possession Handover */}
                                            <div style={{ position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    left: '-26px',
                                                    top: '2px',
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '50%',
                                                    background: isPossessionDone ? '#10b981' : (isDark ? '#1e293b' : '#ffffff'),
                                                    border: `2px solid ${isPossessionDone ? '#10b981' : '#94a3b8'}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {isPossessionDone && <i className="fas fa-check" style={{ fontSize: '0.45rem', color: '#ffffff' }}></i>}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                        Possession Handover
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.62rem',
                                                        fontWeight: 700,
                                                        color: isPossessionDone ? '#10b981' : '#8b5cf6'
                                                    }}>
                                                        {isPossessionDone ? 'Handed Over' : (possession ? getDiffLabel(possession, false) : 'Target')}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'block' }}>
                                                    {formatDateStr(possession)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* 3. Media Gallery Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-images text-blue-500"></i> Media Gallery ({project.projectImages?.length || 0})</h3>
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                            {project.projectImages && project.projectImages.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                                    {project.projectImages.slice(0, 6).map((img, idx) => (
                                        <div 
                                            key={idx} 
                                            style={{ borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border-color)', cursor: 'pointer', height: '48px' }}
                                            onClick={() => setMediaViewer({ isOpen: true, data: { ...img, type: 'image' } })}
                                        >
                                            <img 
                                                src={fixDriveUrl(img.url || img.path) || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'} 
                                                alt="project asset" 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'; }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', margin: 0 }}>No media images uploaded.</p>
                            )}
                        </div>
                    </div>

                    {/* 4. System Meta Info Card */}
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                        <HealthRow label="Assigned Team" value={project.team?.map(t => t.name || t.lookup_value || (typeof t === 'string' ? t : 'Default')).join(', ') || 'Direct Sales'} />
                        <HealthRow label="Access Scope" value={project.visibleTo || 'Public'} />
                        <HealthRow label="Last Modified" value={project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('en-IN') : '--'} />
                    </div>
                </aside>
            </div>

            {/* MODALS */}
            {mediaViewer.isOpen && (
                <MediaViewerModal 
                    data={mediaViewer.data}
                    onClose={() => setMediaViewer({ isOpen: false, data: null })}
                />
            )}
            <ProjectWebsiteModal 
                isOpen={isWebsiteModalOpen}
                onClose={() => setIsWebsiteModalOpen(false)}
                project={project}
                onUpdateSuccess={async (updateData) => {
                    await updateMutation.mutateAsync({
                        id: project._id,
                        data: updateData
                    });
                    fetchProjectDetails();
                }}
            />

            <ProjectBroadcastModal
                isOpen={isBroadcastModalOpen}
                onClose={() => setIsBroadcastModalOpen(false)}
                project={project}
                deals={dealsData}
                onSuccess={(campaignId) => {
                    toast.success('Broadcast campaign launched successfully! 🚀');
                    if (campaignId) {
                        setActiveCampaignId(campaignId);
                    }
                }}
            />

            <BulkInventoryModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                defaultProjectName={project?.name}
                defaultProjectId={project?._id}
                onAddSuccess={() => fetchInventory(projectId)}
            />

            <SocialPostModal
                isOpen={isSocialModalOpen}
                onClose={() => setIsSocialModalOpen(false)}
                initialData={project ? {
                    id: project._id,
                    entityType: 'Project',
                    name: project.name,
                    title: project.name,
                    location: getReadableLocation(project),
                    locationSearch: project.locationSearch,
                    price: project.priceRange || (project.pricing?.minPrice ? `₹${project.pricing.minPrice} - ₹${project.pricing.maxPrice}` : "Price on Request"),
                    description: project.description || "Explore this prime real estate opportunity!",
                    imageUrl: project.primaryImage || project.media?.[0]?.url,
                    reraNumber: project.reraNumber || project.reraRegistrationNumber,
                    projectType: project.projectType || project.type || 'Residential Project',
                    unitNo: project.unitNo || '',
                    type: 'project'
                } : null}
            />
            
            {isEditUnitModalOpen && (
                <AddInventoryModal
                    isOpen={isEditUnitModalOpen}
                    onClose={() => setIsEditUnitModalOpen(false)}
                    property={selectedUnit}
                    onSave={() => {
                        setIsEditUnitModalOpen(false);
                        fetchInventory(projectId);
                    }}
                />
            )}

            <AddProjectPriceModal
                isOpen={isPriceModalOpen}
                onClose={() => setIsPriceModalOpen(false)}
                onSave={handleSavePrice}
                project={project}
            />
        </div>
    );
};

// --- SUB COMPONENTS ---

const ActionButton = ({ icon, label, primary, full, onClick }) => (
    <button 
        onClick={onClick}
        style={{
            background: primary ? '#10b981' : 'var(--bg-card)',
            color: primary ? '#ffffff' : 'var(--text-main)',
            border: '1px solid var(--border-color)',
            padding: '9px 14px',
            borderRadius: '10px',
            fontSize: '0.78rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: primary ? '0 4px 10px rgba(16, 185, 129, 0.2)' : 'none',
            width: full ? '100%' : 'auto',
            transition: 'all 0.15s ease'
        }} 
        className="hover:opacity-90"
    >
        <i className={`fas fa-${icon}`} style={{ color: primary ? '#ffffff' : 'var(--primary, #3b82f6)' }}></i> {label}
    </button>
);

const DetailItem = ({ label, value, boldValue, color, onClick, lookupType }) => {
    const { getLookupValue } = usePropertyConfig();

    const displayValue = React.useMemo(() => {
        if (value === null || value === undefined || value === '') return '--';
        if (Array.isArray(value)) {
            if (lookupType) {
                return value.map(v => renderValue(getLookupValue(lookupType, v) || v)).filter(Boolean).join(', ') || '--';
            }
            return value.map(v => renderValue(v)).filter(Boolean).join(', ') || '--';
        }
        let resolved = value;
        if (lookupType) {
            resolved = getLookupValue(lookupType, value) || value;
        }
        return renderValue(resolved, '--');
    }, [value, lookupType, getLookupValue]);

    return (
        <div
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 3px 0' }}>{label}</p>
            <p style={{
                fontSize: '0.82rem', fontWeight: boldValue ? 800 : 700,
                color: color || (onClick ? '#2563eb' : 'var(--text-main)'), margin: 0,
                textDecoration: onClick ? 'underline' : 'none',
                textDecorationColor: '#2563eb33'
            }}>{displayValue}</p>
        </div>
    );
};

const BlockMiniCard = ({ block }) => (
    <div style={{ padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.78rem' }}>{renderValue(block.name, 'Block')}</span>
            <span style={{ fontSize: '0.62rem', padding: '2px 5px', borderRadius: '4px', background: '#ecfdf5', color: '#065f46', fontWeight: 800 }}>
                {renderValue(block.status, 'Active')}
            </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            <div>
                <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 700, margin: 0 }}>Floors</p>
                <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{renderValue(block.floors, '--')}</p>
            </div>
            <div>
                <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 700, margin: 0 }}>Units Mapped</p>
                <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{renderValue(block.units, '--')}</p>
            </div>
        </div>
    </div>
);

const InsightMetric = ({ label, value, color }) => (
    <div style={{ padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
        <p style={{ fontSize: '0.85rem', fontWeight: 900, color: color || 'var(--text-main)', margin: 0 }}>{value}</p>
    </div>
);

const TabItem = ({ id, label, icon, active, onClick, isDark, count }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '5px 10px', 
            background: active ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff') : 'transparent',
            border: active ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
            borderRadius: '6px',
            color: active ? '#2563eb' : 'var(--text-muted)', 
            fontSize: '0.74rem',
            fontWeight: active ? 800 : 600, 
            cursor: 'pointer', 
            transition: 'all 0.15s ease',
            display: 'flex', 
            alignItems: 'center', 
            gap: '5px', 
            whiteSpace: 'nowrap'
        }}
    >
        {icon && <i className={icon} style={{ fontSize: '0.7rem', color: active ? '#2563eb' : 'inherit', opacity: active ? 1 : 0.7 }}></i>}
        <span>{label}</span>
        {count !== undefined && count > 0 ? (
            <span style={{ 
                fontSize: '0.62rem', 
                background: active ? 'rgba(37, 99, 235, 0.15)' : 'rgba(0,0,0,0.06)', 
                color: active ? '#2563eb' : 'var(--text-muted)', 
                padding: '1px 6px', 
                borderRadius: '10px',
                fontWeight: 700
            }}>
                {count}
            </span>
        ) : null}
    </button>
);

const TimelinePoint = ({ label, date, active }) => (
    <div style={{ position: 'relative', marginBottom: '10px' }}>
        <div style={{
            position: 'absolute', left: '-25px', top: '3px', width: '10px', height: '10px',
            borderRadius: '50%', background: active ? '#3b82f6' : 'var(--bg-card)',
            border: active ? '2px solid #dbeafe' : '2px solid var(--border-color)'
        }}></div>
        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: active ? 'var(--text-main)' : 'var(--text-muted)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: 0 }}>{date ? new Date(date).toLocaleDateString('en-IN') : 'TBD'}</p>
    </div>
);

const HealthRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 900 }}>{value}</span>
    </div>
);

const MediaViewerModal = ({ data, onClose }) => {
    const embedUrl = useMemo(() => {
        if (!data || !data.url) return null;
        const ytId = data.ytId || getYoutubeId(data.url);
        if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1`;
        if (data.url.includes('drive.google.com')) {
            return data.url.replace('/view', '/preview').replace('/edit', '/preview');
        }
        return fixDriveUrl(data.url);
    }, [data]);

    if (!data) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', zIndex: 10001 }}>
                <i className="fas fa-times"></i>
            </button>
            <div style={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {data.type === 'image' ? (
                        <img 
                            src={fixDriveUrl(data.url || data.path)} 
                            alt="media" 
                            style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} 
                        />
                    ) : (
                        <div style={{ width: 'min(90vw, 1000px)', aspectRatio: '16/9' }}>
                            <iframe 
                                title="Project Media View"
                                width="100%" 
                                height="100%" 
                                src={embedUrl} 
                                frameBorder="0" 
                                allowFullScreen 
                                allow="autoplay; encrypted-media"
                                style={{ border: 'none' }}
                            ></iframe>
                        </div>
                    )}
                </div>
                
                <div style={{ marginTop: '20px', textAlign: 'center', color: '#ffffff' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 900 }}>
                        {data.title || (data.type === 'video' ? 'Project Video' : 'Project Asset')}
                    </h3>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
                        {data.category || 'Project Media'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetailPage;
