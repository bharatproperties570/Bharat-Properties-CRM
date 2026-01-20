import React, { useState } from 'react';
import PipelineDashboard from '../../components/PipelineDashboard';
import { leadData } from '../../data/mockData';
import { getInitials } from '../../utils/helpers';

function LeadsPage() {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    const toggleSelect = (name) => {
        if (selectedIds.includes(name)) {
            setSelectedIds(selectedIds.filter(id => id !== name));
        } else {
            setSelectedIds([...selectedIds, name]);
        }
    }

    const isSelected = (name) => selectedIds.includes(name);
    const selectedCount = selectedIds.length;
    const totalCount = leadData.length;

    const filteredLeads = leadData.filter(lead =>
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.mobile.includes(searchTerm) ||
        (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Pagination
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentRecords = filteredLeads.slice(indexOfFirstRecord, indexOfLastRecord);
    const totalPages = Math.ceil(filteredLeads.length / recordsPerPage);

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
                        <button className="btn-outline"><i className="fas fa-filter"></i> Filters</button>
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
                                        <button className="action-btn" title="Call Lead"><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
                                        <button className="action-btn" title="Email Lead"><i className="fas fa-envelope"></i> Email</button>
                                        <button className="action-btn" title="Start Sequence"><i className="fas fa-paper-plane"></i> Sequence</button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                        <button className="action-btn" title="Enrich Data" style={{ color: '#8e44ad', borderColor: '#8e44ad' }}><i className="fas fa-magic"></i> Enrich</button>
                                    </>
                                )}

                                {/* Multi Selection Actions */}
                                {selectedCount > 0 && (
                                    <>
                                        {selectedCount === 1 && <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>}
                                        <button className="action-btn" title="Create Task"><i className="fas fa-tasks"></i> Task</button>
                                        <button className="action-btn" title="Add Tag"><i className="fas fa-tag"></i> Tag</button>
                                        <button className="action-btn" title="Reassign"><i className="fas fa-user-friends"></i> Assign</button>
                                    </>
                                )}

                                {/* Special Case: Merge */}
                                {selectedCount === 2 && (
                                    <button className="action-btn" title="Merge Leads"><i className="fas fa-code-branch"></i> Merge</button>
                                )}

                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '15px' }}>
                                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
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

                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Items: <strong>{filteredLeads.length}</strong> / <strong>{totalCount}</strong>
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
                        )}
                    </div>

                    {/* Header Strip (Pati) - Sticky 45px */}
                    <div className="list-header lead-list-grid" style={{ position: 'sticky', top: '45px', background: '#f8fafc', zIndex: 99, borderBottom: '2px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <div><input type="checkbox" /></div>
                        <div>Lead Profile</div>
                        <div>Match</div>
                        <div>Requirement & Budget</div>
                        <div>Location</div>
                        <div>Status & Source</div>
                        <div>Interaction (Remarks)</div>
                        <div>Assignment</div>
                    </div>

                    {/* Data List (Div Grid) */}
                    <div id="leadListContent">
                        {currentRecords.map((c, idx) => {
                            // Logic to split Intent (Buy/Rent) from Property Type (Residential Plot etc)
                            const intent = c.req.type.split(/[\s,]+/)[0];
                            const propertyType = c.req.type.replace(intent, '').replace(/^[\s,]+/, '');

                            return (
                                <div key={c.name} className="lead-list-grid" style={{ transition: 'all 0.2s ease' }}>
                                    <div>
                                        <input
                                            type="checkbox"
                                            className="item-check"
                                            checked={isSelected(c.name)}
                                            onChange={() => toggleSelect(c.name)}
                                        />
                                    </div>
                                    <div className="col-profile">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            {/* Original Score Indicator Reverted */}
                                            <div className={`score-indicator ${c.score.class}`} style={{ width: '40px', height: '40px', fontSize: '0.9rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', border: '2px solid rgba(0,0,0,0.05)' }}>
                                                {c.score.val}
                                            </div>
                                            <div>
                                                <a href="#" className="primary-text text-ellipsis" style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', display: 'block' }}>{c.name}</a>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}><i className="fas fa-mobile-alt" style={{ marginRight: '6px', width: '12px' }}></i>{c.mobile}</div>
                                                    <div className="text-ellipsis" style={{ fontSize: '0.7rem', color: '#64748b' }}><i className="fas fa-envelope" style={{ marginRight: '6px', width: '12px' }}></i>{c.name.split(' ')[0].toLowerCase()}@gmail.com</div>
                                                    <div className="text-ellipsis" style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>Software Engineer</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-intent">
                                        <div style={{ lineHeight: 1.4 }}>
                                            {/* Only Intent (Buy/Rent) */}
                                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize' }}>{intent}</div>
                                            <div style={{ marginTop: '4px', fontSize: '0.7rem' }}>
                                                <span style={{ background: '#e0f2fe', color: '#0284c7', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{c.matched} Matches</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-budget">
                                        <div style={{ lineHeight: 1.4 }}>
                                            {/* Property Type Moved Here */}
                                            <div style={{ color: '#0f172a', fontSize: '0.75rem', fontWeight: 700, marginBottom: '2px' }}>{propertyType}</div>
                                            <div style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.85rem' }}>{c.budget.replace('<br/>', ' ')}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{c.req.size || 'Std. Size'}</div>
                                        </div>
                                    </div>

                                    <div className="col-location">
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '3px' }}></i>
                                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.8rem', lineHeight: 1.3 }}>{c.location}</div>
                                        </div>
                                    </div>

                                    <div className="col-status">
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.7rem', color: '#1a1f23', textTransform: 'uppercase' }}>{c.status.label}</div>
                                            <span className={`status-badge ${c.status.class}`} style={{ height: '20px', fontSize: '0.65rem', padding: '0 8px', borderRadius: '4px' }}>{c.status.class.toUpperCase()}</span>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{c.source}</div>
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
                        })}
                    </div>
                </div>
            </div>

            {/* Footer Stats */}
            <footer className="footer-stats-bar" style={{ height: '60px', justifyContent: 'space-between', padding: '0 2rem' }}>
                <div style={{ display: 'flex', gap: '2.5rem' }}>
                    <div className="stat-group">Summary <span>Total Lead</span> <span className="stat-val-bold" style={{ color: '#2ecc71' }}>{totalCount}</span></div>
                    <div className="stat-group">UNASSIGNED <span className="stat-val-bold" style={{ color: '#2ecc71' }}>2</span></div>
                    <div className="stat-group">UNTOUCHED <span className="stat-val-bold" style={{ color: '#2ecc71' }}>4</span></div>
                    <div className="stat-group">NO FOLLOWUP <span className="stat-val-bold" style={{ color: '#f39c12' }}>12</span></div>
                    <div className="stat-group">RETURNING <span className="stat-val-bold" style={{ color: '#e74c3c' }}>9</span></div>
                </div>
            </footer>
        </section>
    );
}

export default LeadsPage;
