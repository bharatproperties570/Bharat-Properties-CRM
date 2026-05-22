import React, { useState, useEffect, useCallback } from 'react';
import { useUserContext } from '../../context/UserContext';
import { api } from '../../utils/api';
// import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import AddProjectModal from '../../components/AddProjectModal';
import AddProjectPriceModal from '../../components/AddProjectPriceModal';
// Mock data removed

import UploadModal from '../../components/UploadModal';
import AddDocumentModal from '../../components/AddDocumentModal';
import ProjectFilterPanel from './components/ProjectFilterPanel';
import { applyProjectFilters } from '../../utils/projectFilterLogic';
// import { getCoordinates, getPinPosition } from '../../utils/mapUtils';
import ProfessionalMap from '../../components/ProfessionalMap';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { renderValue } from '../../utils/renderUtils';
import usePermissions, { PermissionGate } from '../../hooks/usePermissions';
import PremiumSearchBar from '../../components/PremiumSearchBar';
import { useProjectList } from '../../hooks/useProjectList';

function ProjectsPage({ onNavigate }) {
    const { teams } = useUserContext();
    const { getLookupValue } = usePropertyConfig();
    const [selectedIds, setSelectedIds] = useState([]);
    const [isSortOpen, setIsSortOpen] = useState(false);

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

    const {
        projects: projectsData,
        loading,
        totalRecords,
        totalPages,
        currentPage,
        setCurrentPage,
        recordsPerPage,
        setRecordsPerPage,
        searchTerm,
        setSearchTerm,
        filters,
        setFilters,
        sortConfig,
        setSortConfig,
        setProjects: setProjectsData,
        refresh: fetchProjects
    } = useProjectList();
    
    const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
    const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

    const [editProjectData, setEditProjectData] = useState(null);
    const [initialModalTab, setInitialModalTab] = useState('Basic');
    const [activeRowMenu, setActiveRowMenu] = useState(null);

    const getTeamName = useCallback((teamValue) => {
        if (!teamValue) return "-";
        const teamArray = Array.isArray(teams) ? teams : (teams?.data || []);
        const resolve = (val) => {
            if (!val) return null;
            if (typeof val === 'object') {
                return val.name || val.lookup_value || (val.id || val._id ? `Team ${val.id || val._id}` : null);
            }
            const found = teamArray.find(t => t._id === val || t.id === val);
            return found ? (found.name || found.lookup_value) : val;
        };
        if (Array.isArray(teamValue)) {
            if (teamValue.length === 0) return "-";
            return teamValue.map(resolve).filter(Boolean).join(', ') || "-";
        }
        return resolve(teamValue) || "-";
    }, [teams]);

    /*
    const getUserName = useCallback((ownerValue) => {
        const value = Array.isArray(ownerValue) ? ownerValue[0] : ownerValue;
        if (!value) return "-";
        if (typeof value === 'object') {
            return value.fullName || value.name || value.lookup_value || "-";
        }
        const found = users.find(u => (u._id === value) || (u.id === value));
        return found ? (found.fullName || (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username))) : "-";
    }, [users]);
    */

    const [viewMode, setViewMode] = useState('list');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

    const handleUploadClick = () => {
        const project = projectsData.find(p => p._id === selectedIds[0]);
        if (project) {
            setEditProjectData(project);
            setIsUploadModalOpen(true);
        }
    };

    const handleDocumentClick = () => {
        const project = projectsData.find(p => p._id === selectedIds[0]);
        if (project) {
            setEditProjectData(project);
            setIsDocumentModalOpen(true);
        }
    };

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(itemId => itemId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    /*
    const handleOpenAddModal = () => {
        setEditProjectData(null);
        setInitialModalTab('Basic');
        setIsAddModalOpen(true);
    };
    */

    const handlePriceClick = () => {
        const project = projectsData.find(p => p._id === selectedIds[0]);
        if (project) {
            setEditProjectData(project);
            setIsPriceModalOpen(true);
        }
    };

    const handleEditProject = () => {
        const project = projectsData.find(p => p._id === selectedIds[0]);
        if (project) {
            setEditProjectData(project);
            setInitialModalTab('Basic');
            setIsAddModalOpen(true);
        }
    };

    const handleSavePrice = (updatedProjectData) => {
        console.log("Saving Price Data:", updatedProjectData);
        setProjectsData(prev => prev.map(p => p._id === updatedProjectData._id ? updatedProjectData : p));
        setIsPriceModalOpen(false);
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSaveProject = async (projectData) => {
        setIsSaving(true);
        try {
            if (projectData._id) {
                const response = await api.put(`projects/${projectData._id}`, projectData);
                if (response.data.success) {
                    setProjectsData(prev => prev.map(p => p._id === projectData._id ? response.data.data : p));
                }
            } else {
                const response = await api.post('projects', projectData);
                if (response.data.success) {
                    setProjectsData(prev => [response.data.data, ...prev]);
                }
            }
            setIsAddModalOpen(false);
            setEditProjectData(null);
            toast.success(projectData._id ? "Project updated successfully" : "Project created successfully");
        } catch (error) {
            console.error("Error saving project:", error);
            toast.error("Failed to save project. Please check backend.");
        } finally {
            setIsSaving(false);
            // Re-fetch to be safe and update counts
            fetchProjects();
        }
    };

    const handleDeleteProject = async (id) => {
        if (!window.confirm("Are you sure you want to delete this project?")) return;
        try {
            const response = await api.delete(`projects/${id}`);
                if (response.data.success) {
                    setProjectsData(prev => prev.filter(p => p._id !== id));
                    setSelectedIds([]);
                    toast.success("Project deleted successfully");
                }
            } catch (error) {
                console.error("Error deleting project:", error);
                toast.error("Failed to delete project");
            }
        };

        const handleSaveUploads = async (mediaData) => {
            try {
                const projectId = selectedIds[0];
                const response = await api.put(`projects/${projectId}`, {
                    projectImages: mediaData.images,
                    projectVideos: mediaData.videos
                });

                if (response.data.success) {
                    toast.success("Files uploaded and saved successfully");
                    fetchProjects();
                } else {
                    toast.error("Failed to save file links to project");
                }
            } catch (error) {
                console.error("Error saving uploads:", error);
                toast.error("Error saving uploaded files");
            } finally {
                setIsUploadModalOpen(false);
                setSelectedIds([]);
            }
        };

        const handleSaveDocuments = async (documents) => {
            try {
                const projectId = selectedIds[0];
                const response = await api.put(`projects/${projectId}`, {
                    projectDocuments: documents.map(doc => ({
                        documentName: doc.documentName,
                        approvalAuthority: doc.approvalAuthority,
                        registrationNo: doc.registrationNo,
                        date: doc.date,
                        url: doc.url
                    }))
                });

                if (response.data.success) {
                    toast.success("Documents saved successfully");
                    fetchProjects();
                } else {
                    toast.error("Failed to save documents to project");
                }
            } catch (error) {
                console.error("Error saving documents:", error);
                toast.error("Error saving documents");
            } finally {
                setIsDocumentModalOpen(false);
                setSelectedIds([]);
            }
        };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    const renderHeader = () => (
        <div className="page-header">
            <div className="page-title-group">
                <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                <div>
                    <span className="working-list-label">Luxury Portfolio</span>
                    <h1>Real Estate Projects</h1>
                </div>
            </div>
            <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                <div className="view-toggle-group">
                    <button
                        className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                        onClick={() => setViewMode('list')}
                    >
                        <i className="fas fa-list"></i> List View
                    </button>
                    <button
                        className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                        onClick={() => setViewMode('map')}
                    >
                        <i className="fas fa-map-marked-alt"></i> Map View
                    </button>
                </div>
                <button
                    className="btn-outline"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}
                    onClick={() => setIsFilterPanelOpen(true)}
                >
                    <i className="fas fa-filter"></i> Filters
                    {Object.keys(filters).length > 0 && (
                        <span style={{
                            position: 'absolute', top: '-5px', right: '-5px',
                            width: '10px', height: '10px', background: 'red', borderRadius: '50%',
                            border: '2px solid #fff', boxShadow: '0 0 5px rgba(255,0,0,0.3)'
                        }}></span>
                    )}
                </button>
            </div>
        </div>
    );

    const renderMapView = () => (
        <>
            {renderHeader()}
            <div className="content-body" style={{ paddingTop: 0 }}>
                <div style={{ height: 'calc(100vh - 160px)', position: 'relative', margin: '0', display: 'flex' }}>
                    {/* Sidebar List */}
                    <div style={{ width: '350px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                                <i className="fas fa-map-pin" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                Projects by Location ({projectsData.length})
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {projectsData.map(project => (
                                <div
                                    key={project._id}
                                    style={{ padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                    onClick={() => onNavigate('project-detail', project._id)}
                                >
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ width: '50px', height: '50px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-building" style={{ color: '#cbd5e1' }}></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{project.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{project.locationSearch || project.address?.location || 'No Location'}</div>
                                            <span style={{ fontSize: '0.65rem', background: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginTop: '4px', display: 'inline-block' }}>Active</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Professional Interactive Map */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        <ProfessionalMap
                            items={projectsData}
                            onMarkerClick={(project) => onNavigate('project-detail', project._id)}
                        />

                        {/* Map Controls Overlay (Optional extras if needed, but ProfessionalMap handles zoom/controls) */}
                        <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.9)', padding: '10px 15px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', zIndex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}><i className="fas fa-info-circle" style={{ color: '#3b82f6', marginRight: '8px' }}></i> Map View Active</div>
                             <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Displaying {projectsData.length} projects</div>
                        </div>
                    </div>
                </div>
            </div >
        </>
    );

    return (
        <section id="projectsView" className="view-section active">
            {viewMode === 'list' ? (
                <div className="view-scroll-wrapper">
                    {renderHeader()}

                    <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                        {/* Toolbar - Sticky 45px */}
                        <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                            {selectedIds.length > 0 ? (
                                <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                    <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                        {selectedIds.length} Selected
                                    </div>

                                    {/* Single Selection Only Actions */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <button className="action-btn" title="Add Price" onClick={handlePriceClick}><i className="fas fa-rupee-sign"></i> Price</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                            <PermissionGate module="projects" action="edit">
                                                <button className="action-btn" title="Edit Project" onClick={handleEditProject}><i className="fas fa-edit"></i> Edit</button>
                                            </PermissionGate>
                                            <button className="action-btn" title="Share Project"><i className="fas fa-share-alt"></i> Share</button>
                                            <button className="action-btn" title="Preview"><i className="fas fa-eye"></i> Preview</button>
                                            <button className="action-btn" title="Matched Leads"><i className="fas fa-handshake"></i> Matches</button>

                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>

                                            <button className="action-btn" title="Publish on Website"><i className="fas fa-globe"></i> Publish</button>
                                        </>
                                    )}

                                    {/* Available for Both Single and Multi */}
                                    <button className="action-btn" title="Add Tag"><i className="fas fa-tag"></i> Tag</button>

                                    {/* Single Selection Only (Uploads) */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                            <button className="action-btn" title="Upload Files" onClick={handleUploadClick}><i className="fas fa-cloud-upload-alt"></i> Upload</button>
                                            <button className="action-btn" title="Manage Documents" onClick={handleDocumentClick}><i className="fas fa-file-alt"></i> Document</button>
                                        </>
                                    )}

                                    <div style={{ marginLeft: 'auto' }}>
                                        <PermissionGate module="projects" action="delete">
                                            <button className="action-btn danger" title="Delete" onClick={() => handleDeleteProject(selectedIds[0])}><i className="fas fa-trash-alt"></i></button>
                                        </PermissionGate>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        {/* Premium Search Input */}
                                        <div style={{ position: 'relative', width: '350px' }}>
                                            <PremiumSearchBar
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    placeholder="Search name, rera, locality..."
    loading={loading}
    className=""
/>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                            Showing: <strong>{projectsData.length}</strong> / <strong>{totalRecords}</strong>
                                        </div>

                                        {/* Records Per Page */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                            <span>Show:</span>
                                            <select
                                                value={recordsPerPage}
                                                onChange={handleRecordsPerPageChange}
                                                style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", outline: "none", cursor: "pointer", background: '#f8fafc' }}
                                            >
                                                {[10, 25, 50, 100, 300, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        </div>

                                        {/* Pagination Controls */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={goToPreviousPage}
                                                disabled={currentPage === 1}
                                                style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage === 1 ? "#f8fafc" : "#fff", color: currentPage === 1 ? "#cbd5e1" : "#0f172a", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                                            >
                                                <i className="fas fa-chevron-left"></i> Prev
                                            </button>
                                            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f172a", minWidth: "80px", textAlign: "center" }}>
                                                {currentPage} / {totalPages || 1}
                                            </span>
                                            <button
                                                onClick={goToNextPage}
                                                disabled={currentPage >= totalPages}
                                                style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: currentPage >= totalPages ? "#f8fafc" : "#fff", color: currentPage >= totalPages ? "#cbd5e1" : "#0f172a", cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                                            >
                                                Next <i className="fas fa-chevron-right"></i>
                                            </button>

                                            {/* Professional Sort Icon */}
                                            <div style={{ position: 'relative' }}>
                                                <button 
                                                    className="btn-pagination-icon" 
                                                    style={{ 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                        width: '32px', height: '32px', borderRadius: '8px',
                                                        border: '1px solid #e2e8f0',
                                                        background: isSortOpen ? 'var(--primary-color)' : '#fff',
                                                        color: isSortOpen ? '#fff' : '#64748b',
                                                        cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                    onClick={() => setIsSortOpen(!isSortOpen)}
                                                    title={`Sort: ${sortConfig.label}`}
                                                >
                                                    <i className="fas fa-sort-amount-down-alt"></i>
                                                </button>
                                                {isSortOpen && (
                                                    <React.Fragment>
                                                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setIsSortOpen(false)} />
                                                        <ul className="shadow-lg border-0" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 999, backgroundColor: '#fff', borderRadius: '16px', padding: '10px', minWidth: '220px', marginTop: '8px', listStyle: 'none', border: '1px solid #eef2f5' }}>
                                                            <li><h6 style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '10px 15px', margin: 0 }}>Advanced Sort</h6></li>
                                                            {[
                                                                { label: 'A-Z Name', by: 'name', order: 1, icon: 'fa-sort-alpha-down' },
                                                                { label: 'Newest Created', by: 'createdAt', order: -1, icon: 'fa-calendar-plus' },
                                                                { label: 'Oldest Created', by: 'createdAt', order: 1, icon: 'fa-history' },
                                                                { label: 'Recently Updated', by: 'updatedAt', order: -1, icon: 'fa-bolt' },
                                                                { label: 'Total Units', by: 'totalUnits', order: -1, icon: 'fa-building' },
                                                                { label: 'Launch Status', by: 'status', order: 1, icon: 'fa-rocket' },
                                                            ].map((opt) => (
                                                                <li key={opt.label}>
                                                                    <button 
                                                                        className={`d-flex align-items-center gap-3`} 
                                                                        style={{ width: '100%', border: 'none', textAlign: 'left', borderRadius: '10px', padding: '10px 15px', fontSize: '0.85rem', fontWeight: sortConfig.label === opt.label ? 700 : 500, color: sortConfig.label === opt.label ? '#fff' : '#1e293b', background: sortConfig.label === opt.label ? 'var(--primary-color)' : 'transparent', cursor: 'pointer', marginBottom: '2px', transition: 'all 0.2s' }}
                                                                        onClick={() => {
                                                                            console.log(`[ProjectSort] Changing sort to: ${opt.label} (${opt.by})`);
                                                                            setSortConfig(opt);
                                                                            setIsSortOpen(false);
                                                                            setCurrentPage(1);
                                                                        }}
                                                                    >
                                                                        <i className={`fas ${opt.icon}`} style={{ width: '18px', opacity: sortConfig.label === opt.label ? 1 : 0.6 }}></i>
                                                                        {opt.label}
                                                                        {sortConfig.label === opt.label && <i className="fas fa-check ms-auto" style={{ fontSize: '0.7rem' }}></i>}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </React.Fragment>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Header */}
                        <div className="list-header project-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '15px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <div><input type="checkbox" /></div>
                            <div>Project Identity</div>
                            <div>Location & Area</div>
                            <div>Blocks & Phases</div>
                            <div>Property Type</div>
                            <div>Launch Status</div>
                            <div style={{ textAlign: 'center' }}>Assignment</div>
                        </div>

                        <div className="list-content">
                            {Object.entries(
                                projectsData.reduce((acc, project) => {
                                    // Professional Team Grouping
                                    const teamId = (project.team && project.team.length > 0) ? 
                                        (typeof project.team[0] === 'object' ? project.team[0]._id : project.team[0]) : 
                                        'Unassigned';
                                    
                                    const teamLabel = teamId === 'Unassigned' ? 'Unassigned Projects' : getTeamName(teamId);
                                    
                                    if (!acc[teamLabel]) acc[teamLabel] = [];
                                    acc[teamLabel].push(project);
                                    return acc;
                                }, {})
                            ).map(([teamGroup, projects]) => (
                                <div key={teamGroup} className="list-group">
                                    <div className="group-header" style={{ padding: '12px 2rem', background: '#f8fafc', letterSpacing: '0.05em', fontWeight: 800, fontSize: '0.7rem', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <i className="fas fa-users" style={{ color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                        {teamGroup.toUpperCase()} <span style={{ marginLeft: '4px', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700 }}>{projects.length} UNITS</span>
                                    </div>
                                    {projects.map((project) => (
                                        <div key={project._id} className="list-item project-list-grid" style={{ padding: '15px 1.5rem', borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s ease' }}>
                                            <input
                                                type="checkbox"
                                                className="item-check"
                                                checked={selectedIds.includes(project._id)}
                                                onChange={() => toggleSelect(project._id)}
                                            />

                                            {/* Col 2: Project Identity */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <div className={`project-thumbnail ${project.thumb}`} style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                    <i className="fas fa-building"></i>
                                                </div>
                                                <div>
                                                    <div
                                                        style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.95rem', cursor: 'pointer', lineHeight: 1.2 }}
                                                        onClick={() => onNavigate('project-detail', project._id)}
                                                    >
                                                        {project.name}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>ID: PRJ-{project._id}</span>
                                                        <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)', fontSize: '0.7rem' }} title="Verified Project"></i>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Col 3: Location */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '3px' }}></i>
                                                <div className="address-clamp" style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.4', fontWeight: 500 }}>
                                                    {project.locationSearch || project.address?.location || 'No Location Details'}
                                                </div>
                                            </div>

                                            {/* Col 4: Blocks (Separated) */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {project.blocks.length > 0 ? project.blocks.map((block, i) => (
                                                    <span key={i} className="tag-blue" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                                                        {typeof block === 'object' ? block.name : block}
                                                    </span>
                                                )) : <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>Open Campus</span>}
                                            </div>

                                            {/* Col 5: Category (Separated) */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {project.category.slice(0, 2).map((cat, i) => (
                                                    <span key={i} className="tag-outline-orange" style={{ fontSize: '0.65rem' }}>{renderValue(cat)}</span>
                                                ))}
                                                {project.category.length > 2 && <span className="tag-muted" style={{ fontSize: '0.65rem' }}>+{project.category.length - 2}</span>}
                                            </div>

                                            {/* Col 6: Status */}
                                            <div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                                                        {getLookupValue('ProjectStatus', project.status) || 'N/A'}
                                                    </div>
                                                    <div className="progress-bar-bg" style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }}>
                                                        <div style={{
                                                            width: getLookupValue('ProjectStatus', project.status) === 'Ready to Move' ? '100%' :
                                                                getLookupValue('ProjectStatus', project.status) === 'Under Construction' ? '65%' : '20%',
                                                            height: '100%',
                                                            background: getLookupValue('ProjectStatus', project.status) === 'Ready to Move' ? '#10b981' : '#f59e0b',
                                                            borderRadius: '2px'
                                                        }}></div>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                                        {getLookupValue('ProjectStatus', project.status) === 'Ready to Move' ? '100% Complete' :
                                                            getLookupValue('ProjectStatus', project.status) === 'Under Construction' ? '65% Complete' : 'Planned'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Col 7: Assignment */}
                                            <div className="col-assignment">
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="fas fa-users" style={{ fontSize: '0.75rem', color: '#64748b' }}></i>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{getTeamName(project.team || project.assignment?.team)}</div>
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                                                        <i className="far fa-clock" style={{ fontSize: '0.6rem', marginRight: '4px' }}></i>
                                                        {project.createdAt ? new Date(project.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (project.date || 'N/A')}
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            ) : (
                renderMapView()
            )}

            <footer className="summary-footer" style={{ height: '60px', padding: '0 2rem' }}>
                <div className="summary-label" style={{ background: '#334155', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '0.7rem' }}>LIVE SUMMARY</div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div className="stat-pill">
                        <span style={{ color: '#6366f1' }}><i className="fas fa-th-list"></i> TOTAL</span>
                        <span className="stat-val-bold">{projectsData.length}</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--success-color)' }}><i className="fas fa-house-user"></i> READY</span>
                        <span className="stat-val-bold">{projectsData.filter(p => getLookupValue('ProjectStatus', p.status) === 'Ready to Move').length}</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--danger-color)' }}><i className="fas fa-tools"></i> BUILDING</span>
                        <span className="stat-val-bold">{projectsData.filter(p => getLookupValue('ProjectStatus', p.status) === 'Under Construction').length}</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--primary-color)' }}><i className="fas fa-rocket"></i> PRE-LAUNCH</span>
                        <span className="stat-val-bold">{projectsData.filter(p => getLookupValue('ProjectStatus', p.status) === 'Pre-Launch').length}</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: '#f59e0b' }}><i className="fas fa-hourglass-start"></i> UPCOMING</span>
                        <span className="stat-val-bold">{projectsData.filter(p => getLookupValue('ProjectStatus', p.status) === 'Upcoming').length}</span>
                    </div>
                </div>
            </footer>

            <AddProjectModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleSaveProject}
                projectToEdit={editProjectData}
                initialTab={initialModalTab}
            />

            <AddProjectPriceModal
                isOpen={isPriceModalOpen}
                onClose={() => setIsPriceModalOpen(false)}
                onSave={handleSavePrice}
                project={editProjectData}
            />

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onSave={handleSaveUploads}
                project={editProjectData}
                type="project"
            />

            <AddDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={handleSaveDocuments}
                project={editProjectData}
            />

            <ProjectFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={setFilters}
            />
        </section >
    );
}

export default ProjectsPage;
