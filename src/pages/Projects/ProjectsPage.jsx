import React, { useState, useEffect, useCallback } from 'react';
import { useUserContext } from '../../context/UserContext';
import { PROJECTS_LIST } from '../../data/projectData';
import AddProjectModal from '../../components/AddProjectModal';
import AddProjectPriceModal from '../../components/AddProjectPriceModal';
import { api } from '../../utils/api';
import { getInitials } from '../../utils/helpers';

import UploadModal from '../../components/UploadModal';
import AddDocumentModal from '../../components/AddDocumentModal';
import ProjectFilterPanel from './components/ProjectFilterPanel';
import { applyProjectFilters } from '../../utils/projectFilterLogic';
import { getCoordinates, getPinPosition } from '../../utils/mapUtils';

function ProjectsPage({ onNavigate, onAddProject }) {
    const { teams, users } = useUserContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});

    const [projectsData, setProjectsData] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

    const [editProjectData, setEditProjectData] = useState(null);
    const [initialModalTab, setInitialModalTab] = useState('Basic');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    const getTeamName = useCallback((teamValue) => {
        const value = Array.isArray(teamValue) ? teamValue[0] : teamValue;
        if (!value) return "General Team";
        if (typeof value === 'object') {
            return value.name || value.lookup_value || "General Team";
        }
        const found = teams.find(t => (t._id === value) || (t.id === value));
        return found ? (found.name || found.lookup_value) : value;
    }, [teams]);

    const getUserName = useCallback((ownerValue) => {
        const value = Array.isArray(ownerValue) ? ownerValue[0] : ownerValue;
        if (!value) return "Admin";
        if (typeof value === 'object') {
            return value.fullName || value.name || value.lookup_value || "Admin";
        }
        const found = users.find(u => (u._id === value) || (u.id === value));
        return found ? (found.fullName || (found.firstName ? `${found.firstName} ${found.lastName}` : (found.name || found.username))) : value;
    }, [users]);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const response = await api.get('projects');
            if (response.data.success) {
                setProjectsData(response.data.data);
            }
        } catch (error) {
            console.error("Error fetching projects:", error);
        } finally {
            setLoading(false);
        }
    };

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

    const handleOpenAddModal = () => {
        setEditProjectData(null);
        setInitialModalTab('Basic');
        setIsAddModalOpen(true);
    };

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

    const handleSaveProject = async (projectData) => {
        setLoading(true);
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
        } catch (error) {
            console.error("Error saving project:", error);
            alert("Failed to save project. Please check backend.");
        } finally {
            setLoading(true);
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
            }
        } catch (error) {
            console.error("Error deleting project:", error);
        }
    };

    // Filter Logic
    const filteredProjects = React.useMemo(() => {
        // 1. Apply Panel Filters
        const baseFiltered = applyProjectFilters(projectsData, filters);

        // 2. Apply Search
        if (!searchTerm) return baseFiltered;
        const lowerTerm = searchTerm.toLowerCase();
        return baseFiltered.filter(p =>
            p.name.toLowerCase().includes(lowerTerm) ||
            (p.locationSearch && p.locationSearch.toLowerCase().includes(lowerTerm)) ||
            (p.address?.location && p.address.location.toLowerCase().includes(lowerTerm)) ||
            (p.units && p.units.some(u => u.toLowerCase().includes(lowerTerm)))
        );
    }, [projectsData, filters, searchTerm]);

    // Pagination Logic
    const totalRecords = filteredProjects.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const paginatedProjects = filteredProjects.slice(
        (currentPage - 1) * recordsPerPage,
        currentPage * recordsPerPage
    );

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
                            width: '10px', height: '10px', background: 'red', borderRadius: '50%'
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
                                Projects by Location ({filteredProjects.length})
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredProjects.map(project => (
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

                    {/* Google Map Placeholder */}
                    <div style={{ flex: 1, background: '#e2e8f0', position: 'relative' }}>
                        <iframe
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            style={{ border: 0 }}
                            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d109782.91037748405!2d76.69036504285265!3d30.698544258807534!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fed0be66c4021%3A0xa59fbc01d248358!2sMohali%2C%20Punjab!5e0!3m2!1sen!2sin!4v1705330000000!5m2!1sen!2sin"
                            allowFullScreen
                        ></iframe>

                        {/* Project Pin Markers Overlay */}
                        {filteredProjects.map((project, idx) => {
                            const coords = getCoordinates(project);
                            if (!coords) return null;

                            const position = getPinPosition(coords.lat, coords.lng);

                            return (
                                <div
                                    key={project._id}
                                    style={{
                                        position: 'absolute',
                                        left: position.left,
                                        top: position.top,
                                        transform: 'translate(-50%, -100%)',
                                        transition: 'all 0.2s'
                                    }}
                                    title={project.name}
                                    onClick={() => onNavigate('project-detail', project._id)}
                                >
                                    {/* Pin Marker */}
                                    <div style={{
                                        width: 'auto',
                                        height: 'auto',
                                        position: 'relative',
                                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center'
                                    }}>
                                        {/* Pin Shape */}
                                        <div style={{
                                            background: '#fff',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontWeight: 700,
                                            fontSize: '0.75rem',
                                            color: '#1e293b',
                                            marginBottom: '4px',
                                            whiteSpace: 'nowrap',
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            {project.name}
                                        </div>
                                        <svg width="32" height="40" viewBox="0 0 32 40">
                                            <path
                                                d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z"
                                                fill="var(--primary-color)"
                                                stroke="#fff"
                                                strokeWidth="2"
                                            />
                                            <text x="50%" y="45%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{idx + 1}</text>
                                        </svg>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Map Controls Overlay */}
                        <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button style={{
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <i className="fas fa-expand-arrows-alt" style={{ marginRight: '6px' }}></i>
                                Fullscreen
                            </button>
                            <button style={{
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <i className="fas fa-layer-group" style={{ marginRight: '6px' }}></i>
                                Layers
                            </button>
                        </div>
                        <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.9)', padding: '10px 15px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}><i className="fas fa-info-circle" style={{ color: '#3b82f6', marginRight: '8px' }}></i> Map View Active</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Displaying {filteredProjects.length} projects</div>
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
                        {/* Toolbar */}
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
                                            <button className="action-btn" title="Edit Project" onClick={handleEditProject}><i className="fas fa-edit"></i> Edit</button>
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
                                        <button className="action-btn danger" title="Delete" onClick={() => handleDeleteProject(selectedIds[0])}><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div className="search-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                            <input
                                                type="text"
                                                placeholder="Search project name, block or unit..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                style={{ width: '450px', padding: '10px 12px 10px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: '15px' }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                                                Showing: <strong>{paginatedProjects.length}</strong> /{" "}
                                                <strong>{totalRecords}</strong>
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
                                                    disabled={currentPage === 1}
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
                                                    disabled={currentPage >= totalPages}
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
                            <div>Assignment</div>
                        </div>

                        <div className="list-content">
                            {Object.entries(
                                paginatedProjects.reduce((acc, project) => {
                                    // Simple city extraction or default to 'Other'
                                    const locString = (project.locationSearch || project.address?.location || project.address?.city || '').toLowerCase();
                                    const city = locString.includes('mohali') ? 'Mohali' :
                                        locString.includes('chandigarh') ? 'Chandigarh' :
                                            locString.includes('kurukshetra') ? 'Kurukshetra' : 'Other Locations';
                                    if (!acc[city]) acc[city] = [];
                                    acc[city].push(project);
                                    return acc;
                                }, {})
                            ).map(([city, projects]) => (
                                <div key={city} className="list-group">
                                    <div className="group-header" style={{ padding: '10px 2rem', background: '#f1f5f9', letterSpacing: '1px', fontWeight: 700, fontSize: '0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                        {city.toUpperCase()} PROJECTS <span style={{ marginLeft: '8px', background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>{projects.length}</span>
                                    </div>
                                    {projects.map((project, index) => (
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
                                                    <span key={i} className="tag-outline-orange" style={{ fontSize: '0.65rem' }}>{cat}</span>
                                                ))}
                                                {project.category.length > 2 && <span className="tag-muted" style={{ fontSize: '0.65rem' }}>+{project.category.length - 2}</span>}
                                            </div>

                                            {/* Col 6: Status */}
                                            <div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>UNDER CONSTRUCTION</div>
                                                    <div className="progress-bar-bg" style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }}>
                                                        <div style={{ width: '65%', height: '100%', background: '#f59e0b', borderRadius: '2px' }}></div>
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>65% Complete</div>
                                                </div>
                                            </div>

                                            {/* Col 7: Assignment */}
                                            <div className="col-assignment">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div className="avatar-circle" style={{ width: '32px', height: '32px', fontSize: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', flexShrink: 0 }}>
                                                        {getInitials(getUserName(project.owner))}
                                                    </div>
                                                    <div style={{ lineHeight: 1.2 }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{getUserName(project.owner)}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{getTeamName(project.team || project.assignment?.team)}</div>
                                                        <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px' }}>
                                                            <i className="far fa-clock" style={{ fontSize: '0.6rem', marginRight: '4px' }}></i>
                                                            {project.createdAt ? new Date(project.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (project.date || 'N/A')}
                                                        </div>
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
                        <span className="stat-val-bold">40</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--success-color)' }}><i className="fas fa-house-user"></i> READY</span>
                        <span className="stat-val-bold">12</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--danger-color)' }}><i className="fas fa-tools"></i> BUILDING</span>
                        <span className="stat-val-bold">8</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: 'var(--primary-color)' }}><i className="fas fa-rocket"></i> PRE-LAUNCH</span>
                        <span className="stat-val-bold">4</span>
                    </div>
                    <div className="stat-pill">
                        <span style={{ color: '#f59e0b' }}><i className="fas fa-hourglass-start"></i> UPCOMING</span>
                        <span className="stat-val-bold">3</span>
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
                onSave={(data) => console.log("Saved Uploads:", data)}
                project={editProjectData}
                type="project"
            />

            <AddDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={(data) => console.log("Saved Documents:", data)}
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
