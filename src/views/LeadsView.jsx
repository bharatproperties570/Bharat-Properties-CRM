import React, { useState } from 'react';
import PipelineDashboard from '../components/PipelineDashboard';
import { leadData } from '../data/mockData';

function LeadsView() {
    const [selectedIds, setSelectedIds] = useState([]);

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

    return (
        <section id="leadsView" className="view-section active">
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
                    <button className="btn-primary">Add Lead</button>
                </div>
            </div>

            {/* Pipeline Dashboard */}
            <PipelineDashboard />

            {/* Content Body */}
            <div className="content-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                {/* Toolbar */}
                <div className="toolbar-container" style={{ padding: '10px 2rem', minHeight: '60px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #eef2f5' }}>
                    {selectedCount > 0 ? (
                        // Leads Action Panel
                        <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                            <div className="selection-count" style={{ marginRight: '15px', fontWeight: 600, color: 'var(--primary-color)' }}>
                                <span >{selectedCount} Selected</span>
                            </div>
                            <button className="action-btn"><i className="fas fa-phone-alt"></i></button>
                            <button className="action-btn"><i className="fas fa-envelope"></i></button>
                            <button className="action-btn primary"><i className="fas fa-paper-plane"></i> Start sequence</button>
                            <button className="action-btn btn-create-task"><i className="fas fa-tasks"></i> Create Task</button>
                            <button className="action-btn"><i className="fas fa-tag"></i></button>
                            <button className="action-btn">Reassign Owner</button>
                            <button className="action-btn" style={{ color: '#8e44ad', borderColor: '#8e44ad' }}><i className="fas fa-magic"></i> Enrich</button>
                            {selectedCount === 2 && <button className="action-btn btn-merge">Merge</button>}
                            <button className="action-btn danger">Delete</button>
                        </div>
                    ) : (
                        // Leads Search Panel
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <input type="text" placeholder="Search for lead via name, mobile no and email" style={{ width: '300px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }} />
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                Items: <strong>100</strong> <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
                                <span style={{ background: '#e3f2fd', color: '#1976d2', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>1</span>
                                2 3 Next
                            </div>
                        </div>
                    )}
                </div>

                {/* Data Table */}
                <div className="data-table-container">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th width="40"><input type="checkbox" /></th>
                                <th>Score</th>
                                <th>Name</th>
                                <th>Requirement</th>
                                <th>Budget</th>
                                <th>Location</th>
                                <th>Matched Deal</th>
                                <th>Status</th>
                                <th>Source</th>
                                <th>Ownership</th>
                                <th>Activity</th>
                                <th>Last Activity</th>
                                <th>Remarks</th>
                                <th>Add On</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leadData.map(c => (
                                <tr key={c.name}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            className="item-check"
                                            checked={isSelected(c.name)}
                                            onChange={() => toggleSelect(c.name)}
                                        />
                                    </td>
                                    <td>
                                        <div className="score-cell">
                                            <div className={`score-indicator ${c.score.class}`}>{c.score.val}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <a href="#" className="primary-text" style={{ color: '#475569' }}>{c.name}</a>
                                        <div className="sub-text"><i className="fas fa-mobile-alt"></i> {c.mobile}</div>
                                        <div className="sub-text"><i className="fas fa-envelope"></i> {c.name.split(' ')[0].toLowerCase()}@gmail.com</div>
                                    </td>
                                    <td>
                                        <div className="req-cell">
                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1a1f23' }}>{c.req.type}</span>
                                            <span className="sub-text">{c.req.size}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="budget-val">{c.budget.split('-')[0]}<br />{c.budget.split('-')[1] || ''}</div>
                                    </td>
                                    <td>
                                        <div style={{ lineHeight: 1.3, fontWeight: 500 }}>{c.location}</div>
                                    </td>
                                    <td style={{ textAlign: 'center', color: '#2980b9', fontWeight: 700, fontSize: '1.1rem' }}>
                                        {c.matched}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>{c.status.label}</div>
                                        <span className={`status-badge ${c.status.class}`} style={{ marginTop: '2px' }}>{c.status.class.toUpperCase()}</span>
                                    </td>
                                    <td>{c.source}</td>
                                    <td>
                                        <div style={{ fontSize: '0.75rem' }}>{c.owner}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: '#27ae60' }}><i className="fas fa-phone-alt"></i> {c.activity}</div>
                                    </td>
                                    <td style={{ fontSize: '0.75rem' }}>{c.lastAct}</td>
                                    <td style={{ fontSize: '0.75rem' }}>{c.remarks}</td>
                                    <td style={{ fontSize: '0.7rem' }} dangerouslySetInnerHTML={{ __html: c.addOn }}></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer Stats */}
            <footer className="footer-stats-bar" style={{ justifyContent: 'space-between', overflowX: 'auto' }}>
                <div style={{ display: 'flex', gap: '3rem' }}>
                    <div className="stat-group">Summary <span>Total Lead</span> <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#2ecc71' }}>5</span></div>
                    <div className="stat-group">UNASSIGNED <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#2ecc71' }}>2</span></div>
                    <div className="stat-group">UNTOUCHED <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#2ecc71' }}>4</span></div>
                    <div className="stat-group">NO FOLLOWUP <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#f39c12' }}>12</span></div>
                    <div className="stat-group">RETURNING <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#e74c3c' }}>9</span></div>
                    <div className="stat-group">OVERDUE TASK <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#9b59b6' }}>5</span></div>
                    <div className="stat-group">RETURNING NO FOLLOWUP <span style={{ fontSize: '1.4rem', marginLeft: '5px', color: '#e74c3c' }}>11</span></div>
                </div>
            </footer>
        </section>
    );
}

export default LeadsView;
