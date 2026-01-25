import React, { useState } from 'react';
import { PROJECTS_LIST } from '../../data/projectData';

function ProjectsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    const projectsData = PROJECTS_LIST;

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(v => v !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    return (
        <section id="projectsView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Luxury Portfolio</span>
                            <h1>Real Estate Projects</h1>
                        </div>
                        <div className="verified-badge" style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800, marginLeft: '10px' }}>
                            <i className="fas fa-check-circle"></i> VERIFIED LIST
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-file-export"></i> Export Report
                        </button>
                        <i className="fas fa-sliders-h header-icon"></i>
                    </div>
                </div>

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
                                        <button className="action-btn" title="Edit Project"><i className="fas fa-edit"></i> Edit</button>
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
                                        <button className="action-btn" title="Upload Image"><i className="fas fa-image"></i> Img</button>
                                        <button className="action-btn" title="Upload Document"><i className="fas fa-file-alt"></i> Doc</button>
                                    </>
                                )}

                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
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
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                                        Displaying <strong>{projectsData.length}</strong> of <strong>{projectsData.length * 5}</strong> Projects
                                    </div>
                                    <div className="pagination-nums" style={{ display: 'flex', gap: '8px' }}>
                                        <span className="page-num active">1</span>
                                        <span className="page-num">2</span>
                                        <span className="page-num">Next <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }}></i></span>
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
                        <div>Management</div>
                    </div>

                    <div className="list-content">
                        {Object.entries(
                            projectsData.reduce((acc, project) => {
                                // Simple city extraction or default to 'Other'
                                const city = project.location.includes('Mohali') ? 'Mohali' :
                                    project.location.includes('Chandigarh') ? 'Chandigarh' :
                                        project.location.includes('Kurukshetra') ? 'Kurukshetra' : 'Other Locations';
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
                                    <div key={project.id} className="list-item project-list-grid" style={{ padding: '15px 1.5rem', borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s ease' }}>
                                        <input
                                            type="checkbox"
                                            className="item-check"
                                            checked={selectedIds.includes(project.id)}
                                            onChange={() => toggleSelect(project.id)}
                                        />

                                        {/* Col 2: Project Identity */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div className={`project-thumbnail ${project.thumb}`} style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                <i className="fas fa-building"></i>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.95rem', cursor: 'pointer', lineHeight: 1.2 }}>{project.name}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>ID: PRJ-{project.id}</span>
                                                    <i className="fas fa-check-circle" style={{ color: 'var(--primary-color)', fontSize: '0.7rem' }} title="Verified Project"></i>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Col 3: Location */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '3px' }}></i>
                                            <div className="address-clamp" style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.4', fontWeight: 500 }}>
                                                {project.location}
                                            </div>
                                        </div>

                                        {/* Col 4: Blocks (Separated) */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {project.blocks.length > 0 ? project.blocks.map(block => (
                                                <span key={block} className="tag-blue" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>{block}</span>
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

                                        {/* Col 7: Management */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div className="profile-circle" style={{ width: '28px', height: '28px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b' }}>AD</div>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Admin</div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Updated {project.date}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

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
        </section>
    );
}

export default ProjectsPage;
