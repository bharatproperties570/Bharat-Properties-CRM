import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { formatIndianCurrency } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';
import Chart from 'react-apexcharts';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { fixDriveUrl, getYoutubeId } from '../../utils/helpers';
import PublishModal from '../../components/Marketing/PublishModal';
import SocialPostModal from '../../components/SocialPostModal';
import BulkInventoryModal from '../../components/inventory/BulkInventoryModal';
import AddInventoryModal from '../../components/AddInventoryModal';

const ProjectDetailPage = ({ projectId, onBack, onNavigate, onEditProject }) => {
    const { isDark } = useTheme();
    const { getLookupValue } = usePropertyConfig();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activity');
    const [inventoryData, setInventoryData] = useState([]);
    const [dealsData, setDealsData] = useState([]);
    const [blocksData, setBlocksData] = useState([]);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isEditUnitModalOpen, setIsEditUnitModalOpen] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [mediaViewer, setMediaViewer] = useState({ isOpen: false, data: null });
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const fetchProjectDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`projects/${projectId}`);
            if (response.data && response.data.success) {
                const data = response.data.data;
                setProject(data);
                setBlocksData(data.blocks || []);

                // Fetch associated data
                fetchInventory(projectId);
                fetchDeals(projectId);
            } else {
                toast.error("Failed to load project details");
            }
        } catch (error) {
            console.error("Error fetching project:", error);
            toast.error("Error loading project");
        } finally {
            setLoading(false);
        }
    }, [projectId]);


    const fetchInventory = async (pid) => {
        try {
            // Fetch up to 1000 units to ensure all project inventory is loaded, sorted by unit number
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
            const response = await api.get(`deals?projectId=${pid}`);
            if (response.data && response.data.success) {
                setDealsData(response.data.records || []);
            }
        } catch (err) {
            console.error("Error fetching project deals:", err);
        }
    };

    const handleDeleteUnit = async (unitId) => {
        if (!window.confirm("Are you sure you want to delete this unit?")) return;
        try {
            const res = await api.delete(`inventory/${unitId}`);
            if (res.data?.success) {
                toast.success("Unit deleted successfully");
                fetchInventory(projectId);
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
        fetchProjectDetails();
        
        // Listen for global project updates to refresh data
        const handleProjectUpdate = () => {
            fetchProjectDetails();
        };
        window.addEventListener('project-updated', handleProjectUpdate);
        return () => window.removeEventListener('project-updated', handleProjectUpdate);
    }, [fetchProjectDetails]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-gray)' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Initializing Project Command Center...</span>
        </div>
    );
    if (!project) return <div className="error-state">Project not found</div>;

    const totalDealValue = dealsData.reduce((acc, deal) => acc + (deal.price || 0), 0);
    const activeDealsCount = dealsData.filter(d => d.stage !== 'Closed' && d.stage !== 'Cancelled').length;
    const closedDealsCount = dealsData.filter(d => d.stage === 'Closed').length;

    const totalInventoryCount = inventoryData.length;
    const soldInventory = inventoryData.filter(i => i.status === 'Sold Out').length;
    const availableInventory = inventoryData.filter(i => i.status === 'Available').length;

    // Advanced Metrics
    const avgPricePerUnit = totalInventoryCount > 0 ? (dealsData.reduce((acc, d) => acc + (d.price || 0), 0) / (dealsData.length || 1)) : 0;
    const absorptionRate = totalInventoryCount > 0 ? Math.round((soldInventory / totalInventoryCount) * 100) : 0;
    const revenuePotential = availableInventory * (avgPricePerUnit || 4500000);

    const cardStyle = {
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)'
    };

    const sectionTitleStyle = {
        fontSize: '0.9rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    };

    return (
        <div className="project-detail-page" style={{ background: 'var(--bg-gray)', minHeight: '100vh', paddingBottom: '60px' }}>
            {/* 3️⃣ STICKY PROJECT SUMMARY HEADER */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 1000,
                background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
                padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', backdropFilter: 'blur(8px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: '1px solid var(--border-color)',
                        borderRadius: '10px', width: '40px', height: '40px',
                        cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.2s'
                    }} className="hover:bg-slate-50">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.03em' }}>
                                {project.name}
                            </h1>
                            <span style={{
                                backgroundColor: 'var(--bg-gray)', color: 'var(--text-muted)',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid var(--border-color)'
                            }}>
                                PRJ-{project?._id ? project._id.substring(Math.max(0, project._id.length - 6)).toUpperCase() : 'NEW'}
                            </span>

                            <span style={{
                                backgroundColor: '#ecfdf5', color: '#065f46',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', border: '1px solid #10b98133'
                            }}>
                                {getLookupValue('ProjectStatus', project.status) || 'Active'}
                            </span>

                            {/* Website Publication Toggle */}
                            <button
                                onClick={() => setIsPublishModalOpen(true)}
                                style={{
                                    backgroundColor: project.isPublished ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff') : 'var(--bg-gray)',
                                    color: project.isPublished ? '#2563eb' : 'var(--text-muted)',
                                    padding: '4px 12px', borderRadius: '20px',
                                    fontSize: '0.7rem', fontWeight: 800,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                    border: `1px solid ${project.isPublished ? '#3b82f644' : 'var(--border-color)'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                className="hover:shadow-sm"
                            >
                                <i className={`fas fa-paper-plane ${project.isPublished ? 'text-blue-500' : 'text-slate-400'}`}></i>
                                {project.isPublished ? 'Published' : 'Publish to Hub'}
                            </button>


                            {project.reraNumber && (
                                <span style={{
                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', color: isDark ? '#60a5fa' : '#1e40af',
                                    padding: '4px 12px', borderRadius: '20px',
                                    fontSize: '0.7rem', fontWeight: 800,
                                    textTransform: 'uppercase', border: '1px solid #3b82f633'
                                }}>
                                    RERA: {project.reraNumber}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            <i className="fas fa-map-marker-alt text-red-500"></i>
                            {project.address?.location || project.locationSearch || 'No location set'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '32px', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '0 40px' }}>
                    <HeaderMetric label="Blocks" value={project.totalBlocks || blocksData.length} />
                    <HeaderMetric label="Total Units" value={project.totalUnits || totalInventoryCount} />
                    <HeaderMetric label="Inventory Active" value={availableInventory} color="#10b981" />
                    <HeaderMetric label="Deals Running" value={activeDealsCount} color="#6366f1" />
                </div>

                 <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* Three Dot Menu */}
                    <div style={{ position: 'relative' }}>
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        >
                            <i className="fas fa-ellipsis-v"></i>
                        </button>
                        
                        {isMenuOpen && (
                            <>
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setIsMenuOpen(false)}></div>
                                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '220px', background: isDark ? 'rgba(7, 22, 43, 0.98)' : '#ffffff', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', zIndex: 1000, overflow: 'hidden', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                                    <div onClick={() => { setIsMenuOpen(false); onEditProject && onEditProject(project); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-edit text-blue-500" style={{ width: '16px' }}></i> Edit Project
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setIsSocialModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-share-alt text-green-500" style={{ width: '16px' }}></i> Share Project
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); setActiveTab('inventory'); setIsBulkModalOpen(true); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-layer-group text-purple-500" style={{ width: '16px' }}></i> Add Bulk Inventory
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); onNavigate('project-master-plan', project._id); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                                        <i className="fas fa-map text-orange-500" style={{ width: '16px' }}></i> Master Plan Workspace
                                    </div>
                                    <div onClick={() => { setIsMenuOpen(false); toast('Add Block feature coming soon!', { icon: 'ℹ️' }); }} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <i className="fas fa-plus-square text-indigo-500" style={{ width: '16px' }}></i> Add Block
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Full Assignment Data Plate */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '4px 12px 4px 6px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }} className="hover:shadow-sm">
                        <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--primary)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}>
                            <i className="fas fa-users" style={{ color: '#ffffff' }}></i>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                {project.team?.name || (Array.isArray(project.team) && project.team[0]?.name) || (typeof project.team === 'string' ? project.team : 'Standard Team')}
                            </span>
                            { project.updatedAt && (
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {new Date(project.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })} {new Date(project.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                            )}
                        </div>

                        <div style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 4px' }}></div>

                        <div title={`Visibility: ${project.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                            {(() => {
                                const v = (project.visibleTo || 'Everyone').toLowerCase();
                                if (v === 'private') return <i className="fas fa-lock" style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}></i>;
                                if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                                return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                            })()}
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT SPLIT */}
            <div style={{ maxWidth: '100%', margin: '12px auto', padding: '0 24px', display: 'flex', gap: '16px', height: 'calc(100vh - 160px)', overflow: 'hidden' }}>

                {/* COLUMN 1: LEFT - PROJECT SPECS & AMENITIES */}
                <div className="no-scrollbar" style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <i className="fas fa-city" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Project Specifications</span>
                    </div>

                    {/* Project Overview */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-info-circle text-blue-500"></i> Overview</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailItem label="Category" value={project.category} lookupType="Category" />
                                <DetailItem label="Sub Category" value={project.subCategory} lookupType="SubCategory" />
                            </div>
                            <DetailItem
                                label="Developer"
                                value={project.developerName}
                                boldValue
                                onClick={project.developerId ? () => onNavigate('company-detail', project.developerId) : undefined}
                            />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailItem label="Joint Venture" value={project.isJointVenture ? 'YES' : 'NO'} />
                                <DetailItem label="Land Area" value={`${project.landArea || '--'} ${project.landAreaUnit || ''}`} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailItem label="Total Blocks" value={project.totalBlocks} />
                                <DetailItem label="Parking" value={project.parkingType || 'Covered'} />
                            </div>
                        </div>
                    </div>

                    {/* Location Info */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={{ height: '180px', background: 'var(--bg-gray)' }}>
                            <iframe
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBd2gdMJVt5C_tgYqWoRbBiatzmevYdB9U&q=${encodeURIComponent(getLookupValue('Location', project.address?.location) || project.address?.location || project.name)}`}
                                allowFullScreen
                            ></iframe>
                        </div>
                        <div style={{ padding: '16px', background: 'var(--bg-gray)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <DetailItem label="City" value={project.address?.city} lookupType="City" />
                            <DetailItem label="State" value={project.address?.state} lookupType="State" />
                            <div style={{ gridColumn: 'span 2' }}>
                                <DetailItem label="Address" value={project.address?.street || project.address?.location} lookupType={!project.address?.street ? "Location" : undefined} />
                            </div>
                        </div>
                    </div>

                    {/* Amenities */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-swimming-pool text-cyan-500"></i> Amenities</h3>
                        </div>
                        <div style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {project.amenities && Object.keys(project.amenities).length > 0 ? Object.entries(project.amenities).map(([key, val], idx) => val && (
                                    <span key={idx} style={{ padding: '6px 10px', background: 'var(--bg-gray)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-check-circle text-emerald-500" style={{ fontSize: '0.6rem' }}></i> {key}
                                    </span>
                                )) : (
                                    <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>No amenities listed.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMN 2: CENTER - DATA & OPERATIONS */}
                <div className="no-scrollbar" style={{ flex: '1', display: 'flex', flexDirection: 'column', background: 'var(--bg-gray)', overflowY: 'auto', minWidth: '0', position: 'relative', paddingBottom: '20px' }}>
                    <div className="glass-card" style={{ 
                        background: 'var(--bg-card)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '100%'
                    }}>
                        {/* Tabs Bar */}
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', padding: '0 16px' }}>
                            <TabItem id="activity" label="Activity" active={activeTab === 'activity'} onClick={setActiveTab} />
                            <TabItem id="inventory" label="Inventory" active={activeTab === 'inventory'} onClick={setActiveTab} />
                            <TabItem id="deals" label="Deals" active={activeTab === 'deals'} onClick={setActiveTab} />
                            <TabItem id="financials" label="Analytics" active={activeTab === 'financials'} onClick={setActiveTab} />
                            <div style={{ flex: 1 }}></div>
                        </div>

                        <div style={{ padding: '20px', flex: 1 }}>
                            {activeTab === 'activity' && (
                                <div style={{ height: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                        <i className="fas fa-bolt" style={{ color: '#4f46e5' }}></i>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interaction Intelligence</span>
                                    </div>
                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '40px', fontSize: '0.85rem' }}>Project audit logs and communication history...</p>
                                </div>
                            )}

                            {activeTab === 'inventory' && (
                                <div className="inventory-tab">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Project Units ({inventoryData.length})</h4>
                                            <button onClick={() => setIsBulkModalOpen(true)} style={{ padding: '4px 10px', background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', color: '#3b82f6', border: '1px solid #3b82f644', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                <i className="fas fa-layer-group" style={{ marginRight: '4px' }}></i> Bulk Add
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>{availableInventory} Available</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }}></div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>{soldInventory} Sold</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-gray)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                                        <th style={{ padding: '12px 16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Block / Unit</th>
                                                        <th style={{ padding: '12px 16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit Type</th>
                                                        <th style={{ padding: '12px 16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Attributes</th>
                                                        <th style={{ padding: '12px 16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                                                        <th style={{ padding: '12px 16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {inventoryData.map((unit, idx) => (
                                                        <tr key={unit._id || unit.id || idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="hover-row">
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <div 
                                                                    onClick={(e) => { e.stopPropagation(); onNavigate('inventory-detail', unit._id || unit.id); }}
                                                                    style={{ fontWeight: 800, color: 'var(--primary, #3b82f6)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                                                                    title="View Unit Details"
                                                                    className="hover-text-primary"
                                                                >
                                                                    {unit.unitNo || unit.unitNumber}
                                                                </div>
                                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{renderValue(unit.block) || 'Default Block'}</div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{renderValue(unit.unitType) || renderValue(unit.category) || 'N/A'}</div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                    {unit.facing && <span style={{ padding: '2px 6px', background: 'var(--bg-gray)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{renderValue(unit.facing)} Facing</span>}
                                                                    {unit.direction && <span style={{ padding: '2px 6px', background: 'var(--bg-gray)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{renderValue(unit.direction)}</span>}
                                                                    {!unit.facing && !unit.direction && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <span style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', background: unit.status === 'Available' ? '#dcfce7' : (unit.status === 'Sold Out' ? '#fee2e2' : '#fef3c7'), color: unit.status === 'Available' ? '#166534' : (unit.status === 'Sold Out' ? '#991b1b' : '#92400e'), fontWeight: 800 }}>
                                                                    {renderValue(unit.status)}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleEditUnit(unit); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', transition: 'color 0.2s' }} title="Edit Unit" className="hover-text-blue">
                                                                        <i className="fas fa-edit"></i>
                                                                    </button>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteUnit(unit._id || unit.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', transition: 'color 0.2s' }} title="Delete Unit" className="hover-text-red">
                                                                        <i className="fas fa-trash"></i>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {inventoryData.length === 0 && (
                                                        <tr>
                                                            <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                <i className="fas fa-box-open" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.5, display: 'block' }}></i>
                                                                No units added to this project yet. Use "Bulk Add" to create inventory.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'deals' && (
                                <div className="deals-tab">
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '20px', color: 'var(--text-main)' }}>Project Pipeline ({dealsData.length})</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {dealsData.length > 0 ? dealsData.map((deal, idx) => (
                                            <div key={idx} style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <div style={{ width: '32px', height: '32px', background: 'var(--bg-gray)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <i className="fas fa-handshake" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}></i>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.85rem' }}>Deal #{deal.dealId || deal._id.substring(deal._id.length - 6).toUpperCase()}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Unit: {deal.unitNo} • {deal.intent}</div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 900, color: '#10b981', fontSize: '0.9rem' }}>{formatIndianCurrency(deal.price)}</div>
                                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-gray)', fontWeight: 800, color: 'var(--text-muted)' }}>{deal.stage}</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active deals.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'financials' && (
                                <div className="financials-tab">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                        <div style={{ ...cardStyle, marginBottom: 0 }}>
                                            <div style={sectionHeaderStyle}>
                                                <h4 style={{ ...sectionTitleStyle, fontSize: '0.8rem' }}>CASH FLOW PROJECTION</h4>
                                            </div>
                                            <div style={{ height: '220px', padding: '12px' }}>
                                                <Chart
                                                    options={{
                                                        chart: { toolbar: { show: false } },
                                                        stroke: { curve: 'smooth', width: 3 },
                                                        colors: ['#10b981'],
                                                        xaxis: { categories: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], labels: { style: { fontSize: '10px' } } },
                                                        yaxis: { labels: { style: { fontSize: '10px' } } }
                                                    }}
                                                    series={[{ name: 'Inflow (₹ Cr)', data: [1.2, 2.5, 3.8, 1.9, 4.2, 3.5] }]}
                                                    type="line"
                                                    height="100%"
                                                />
                                            </div>
                                        </div>
                                        <div style={{ ...cardStyle, marginBottom: 0 }}>
                                            <div style={sectionHeaderStyle}>
                                                <h4 style={{ ...sectionTitleStyle, fontSize: '0.8rem' }}>PORTFOLIO MIX</h4>
                                            </div>
                                            <div style={{ height: '220px', padding: '12px' }}>
                                                <Chart
                                                    options={{
                                                        labels: ['Sold', 'Booked', 'Available'],
                                                        colors: ['#10b981', '#f59e0b', '#3b82f6'],
                                                        legend: { position: 'right', fontSize: '10px' },
                                                        plotOptions: { pie: { donut: { size: '70%' } } }
                                                    }}
                                                    series={[soldInventory, dealsData.filter(d => d.stage === 'Booked').length, availableInventory]}
                                                    type="donut"
                                                    height="100%"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMN 3: RIGHT - STRATEGY & PERFORMANCE */}
                <div className="no-scrollbar" style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <i className="fas fa-chart-pie" style={{ color: '#4f46e5' }}></i>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategic intelligence</span>
                    </div>

                    {/* Sales Insights */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-atom text-purple-500"></i> Market Insights</h3>
                        </div>
                        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <InsightMetric label="Avg Price / Unit" value={formatIndianCurrency(avgPricePerUnit || 4500000)} />
                            <InsightMetric label="Absorption" value={`${absorptionRate}%`} color="#3b82f6" />
                            <InsightMetric label="Closed Deals" value={closedDealsCount} />
                            <InsightMetric label="Rev. Potential" value={formatIndianCurrency(revenuePotential)} color="#10b981" />
                        </div>
                    </div>

                    {/* Timeline */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>Project Timeline</h3>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <TimelinePoint label="Launched" date={project.launchDate} active />
                                <TimelinePoint label="Expected Completion" date={project.expectedCompletionDate} />
                                <TimelinePoint label="Possession Starts" date={project.possessionDate} />
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}>Operations</h3>
                        </div>
                        <div style={{ padding: '16px', display: 'grid', gap: '10px' }}>
                            <ActionButton icon="edit" label="Edit Info" full onClick={() => onEditProject && onEditProject(project)} />
                            <ActionButton icon="plus" label="Add Inventory" full />
                            <ActionButton icon="handshake" label="Create Deal" full />
                            <ActionButton icon="cloud-upload-alt" label="Documents" full />
                        </div>
                    </div>

                    {/* Media Gallery (Compact) */}
                    <div style={{ ...cardStyle, marginBottom: 0 }}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-images text-blue-500"></i> Media Gallery</h3>
                        </div>
                        <div style={{ padding: '16px' }}>
                            {project.projectImages && project.projectImages.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {project.projectImages.slice(0, 6).map((img, idx) => (
                                        <div 
                                            key={idx} 
                                            style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', cursor: 'pointer', height: '60px' }}
                                            onClick={() => setMediaViewer({ isOpen: true, data: { ...img, type: 'image' } })}
                                        >
                                            <img 
                                                src={fixDriveUrl(img.url || img.path) || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'} 
                                                alt="project" 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'; }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', margin: 0 }}>No media available.</p>
                            )}
                        </div>
                    </div>

                    {/* System Info */}
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(241, 245, 249, 0.5)', borderRadius: '16px' }}>
                        <HealthRow label="Team" value={project.team?.map(t => t.name || t.lookup_value || (typeof t === 'string' ? t : 'Unknown')).join(', ') || 'Sales'} />
                        <HealthRow label="Visibility" value={project.visibleTo || 'Public'} />
                        <HealthRow label="Modified" value={new Date(project.updatedAt).toLocaleDateString()} />
                    </div>
                </div>
            </div>
            {mediaViewer.isOpen && (
                <MediaViewerModal 
                    data={mediaViewer.data}
                    onClose={() => setMediaViewer({ isOpen: false, data: null })}
                />
            )}
            <PublishModal 
                isOpen={isPublishModalOpen}
                onClose={() => setIsPublishModalOpen(false)}
                project={{...project, deals: dealsData}}
                onPublishSuccess={fetchProjectDetails}
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
                    name: project.name,
                    title: project.name,
                    location: project.address?.location || project.locationSearch,
                    price: project.priceRange || "Contact for Price",
                    description: project.description || "Excited to share this new project!",
                    imageUrl: project.primaryImage || project.media?.[0]?.url
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
        </div>
    );
};

// --- SUB COMPONENTS ---

const HeaderMetric = ({ label, value, color }) => (
    <div style={{ textAlign: 'center', minWidth: '100px' }}>
        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>{label}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 900, color: color || 'var(--text-main)', margin: 0 }}>{value}</p>
    </div>
);

const ActionButton = ({ icon, label, primary, full, onClick }) => (
    <button 
        onClick={onClick}
        style={{
        background: primary ? '#10b981' : 'var(--bg-card)',
        color: primary ? 'var(--bg-card)' : 'var(--text-muted)',
        border: primary ? 'none' : '1px solid var(--border-color)',
        padding: '10px 18px',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        cursor: 'pointer',
        boxShadow: primary ? '0 4px 10px rgba(16, 185, 129, 0.2)' : 'none',
        width: full ? '100%' : 'auto'
    }} className="hover:opacity-90 transition-all">
        <i className={`fas fa-${icon}`}></i> {label}
    </button>
);

const DetailItem = ({ label, value, boldValue, color, onClick, lookupType }) => {
    const { getLookupValue } = usePropertyConfig();

    const displayValue = React.useMemo(() => {
        if (!value) return '--';
        if (Array.isArray(value)) {
            if (lookupType) {
                return value.map(v => getLookupValue(lookupType, v)).filter(Boolean).join(', ') || '--';
            }
            return value.join(', ');
        }
        if (lookupType) {
            return getLookupValue(lookupType, value) || renderValue(value) || '--';
        }
        return (renderValue(value) || '--');
    }, [value, lookupType, getLookupValue]);

    return (
        <div
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 4px 0' }}>{label}</p>
            <p style={{
                fontSize: '0.85rem', fontWeight: boldValue ? 800 : 700,
                color: color || (onClick ? '#2563eb' : 'var(--text-main)'), margin: 0,
                textDecoration: onClick ? 'underline' : 'none',
                textDecorationColor: '#2563eb33'
            }}>{displayValue}</p>
        </div>
    );
};

const BlockMiniCard = ({ block }) => (
    <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{block.name}</span>
            <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 800 }}>
                {block.status || 'Active'}
            </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
                <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, margin: 0 }}>Floors</p>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: 0 }}>{block.floors || '--'}</p>
            </div>
            <div>
                <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, margin: 0 }}>Units</p>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: 0 }}>{block.units || '--'}</p>
            </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button style={{ flex: 1, padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#2563eb' }}>View Units</button>
            <button style={{ flex: 1, padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>Edit</button>
        </div>
    </div>
);

const StatBox = ({ label, value, color }) => (
    <div style={{ padding: '12px', background: 'var(--bg-gray)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
    </div>
);

const InsightMetric = ({ label, value, color }) => (
    <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</p>
        <p style={{ fontSize: '1rem', fontWeight: 900, color: color || 'var(--text-main)', margin: 0 }}>{value}</p>
    </div>
);

const TabItem = ({ id, label, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '12px 20px', background: 'transparent', border: 'none',
            borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
            color: active ? '#2563eb' : 'var(--text-muted)', fontSize: '0.85rem',
            fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all 0.2s'
        }}
    >
        {label}
    </button>
);

const TimelinePoint = ({ label, date, active }) => (
    <div style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{
            position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px',
            borderRadius: '50%', background: active ? '#3b82f6' : 'var(--bg-card)',
            border: active ? '3px solid #dbeafe' : '2px solid var(--border-color)'
        }}></div>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: active ? 'var(--text-main)' : 'var(--text-muted)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>{date ? new Date(date).toLocaleDateString() : 'TBD'}</p>
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
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--bg-card)', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', zIndex: 10001 }}>
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
                
                <div style={{ marginTop: '24px', textAlign: 'center', color: 'var(--bg-card)' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                        {data.title || (data.type === 'video' ? 'Project Video' : 'Project Image')}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0.8 }}>
                        <i className={`fas fa-${data.type === 'video' ? 'video' : 'camera'}`} style={{ fontSize: '0.7rem' }}></i>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {data.category || 'Project Media'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetailPage;
