import React, { useState } from 'react';
import { contactData } from '../data/mockData';
import { getInitials, getSourceBadgeClass } from '../utils/helpers';

function ContactsView() {
    const [selectedIds, setSelectedIds] = useState([]);

    // Grouping Logic
    const groups = {};
    contactData.forEach(c => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
    });

    // Selection Handling (Mock unique ID using mobile for now)
    const toggleSelect = (mobile) => {
        if (selectedIds.includes(mobile)) {
            setSelectedIds(selectedIds.filter(id => id !== mobile));
        } else {
            setSelectedIds([...selectedIds, mobile]);
        }
    }

    const isSelected = (mobile) => selectedIds.includes(mobile);
    const totalCount = contactData.length;
    const selectedCount = selectedIds.length;

    return (
        <section id="contactsView" className="view-section active">
            <div className="page-header">
                <div className="page-title-group">
                    <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                    <div>
                        <span className="working-list-label">Working List</span>
                        <h1>Contacts</h1>
                    </div>
                    <button className="btn-outline">Save as Smart List</button>
                    <i className="fas fa-ellipsis-v" style={{ color: '#68737d', fontSize: '0.9rem' }}></i>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                        <button style={{ padding: '6px 10px', border: 'none', background: '#e3e6e8', color: 'var(--text-main)' }}><i className="fas fa-th-large"></i></button>
                        <button style={{ padding: '6px 10px', border: 'none', background: 'white', color: 'var(--text-muted)' }}><i className="fas fa-list"></i></button>
                    </div>
                    <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#68737d', color: '#2f3941' }}>
                        <i className="fas fa-filter"></i> Filters
                    </button>
                </div>
            </div>

            <div className="content-body" style={{ paddingTop: 0 }}>
                {/* Toolbar */}
                <div className="toolbar-container" style={{ padding: '15px 20px', borderBottom: '1px solid #eef2f5', minHeight: '70px', display: 'flex', alignItems: 'center' }}>
                    {selectedCount > 0 ? (
                        // Action Panel
                        <div className="action-panel" style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                            <div className="selection-count" style={{ marginRight: '15px', fontWeight: 600, color: 'var(--primary-color)' }}>
                                {selectedCount} Selected
                            </div>
                            <button className="action-btn"><i className="fas fa-phone-alt"></i></button>
                            <button className="action-btn"><i className="fas fa-envelope"></i></button>
                            <button className="action-btn primary"><i className="fas fa-paper-plane"></i> Start sequence</button>
                            <button className="action-btn btn-create-task"><i className="fas fa-tasks"></i> Create Task</button>
                            {selectedCount === 2 && <button className="action-btn btn-merge">Merge</button>}
                            <button className="action-btn danger">Delete</button>
                        </div>
                    ) : (
                        // Search Panel
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <input type="text" placeholder="Search contacts..." style={{ width: '300px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }} />
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                Items: <strong>{totalCount}</strong>
                            </div>
                        </div>
                    )}
                </div>

                {/* Header */}
                <div className="list-header">
                    <div><input type="checkbox" /></div>
                    <div>Personal Details</div>
                    <div>Address</div>
                    <div>Professional</div>
                    <div>Tags</div>
                    <div>Source</div>
                    <div>Last Communication</div>
                    <div>Actionable</div>
                    <div>Ownership</div>
                    <div>Add_On</div>
                </div>

                <div id="contactListContent">
                    {Object.keys(groups).map(groupName => (
                        <div key={groupName} className="list-group">
                            <div className="group-header">{groupName}</div>
                            {groups[groupName].map((item, idx) => (
                                <div key={item.mobile} className="list-item">
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={isSelected(item.mobile)}
                                        onChange={() => toggleSelect(item.mobile)}
                                    />
                                    <div className="col-personal">
                                        <div className="contact-main">
                                            <div className={`avatar-circle avatar-${(idx % 5) + 1}`}>
                                                {item.icon === 'fa-user' ? getInitials(item.name) : <i className={`fas ${item.icon}`}></i>}
                                            </div>
                                            <div className="contact-details">
                                                <div className="item-name">{item.name}</div>
                                                <div className="item-sub-group">
                                                    <span className="item-sub"><i className="fas fa-phone-alt"></i> {item.mobile}</span>
                                                    {item.email && <span className="item-sub"><i className="fas fa-envelope"></i> {item.email.split('@')[0]}...</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-address">
                                        <div className="location-group">
                                            <i className="fas fa-map-marker-alt location-icon"></i>
                                            <div className="item-sub">{item.address || 'Not specified'}</div>
                                        </div>
                                    </div>

                                    <div className="col-professional">
                                        <div className="prof-group">
                                            <div><span className="prof-badge">{item.professional}</span></div>
                                            <div className="item-sub" style={{ fontSize: '0.7rem', marginTop: '2px' }}>Verified Member</div>
                                        </div>
                                    </div>

                                    <div className="col-tags item-sub">{item.tags}</div>
                                    <div className="col-source">
                                        <span className={`source-badge ${getSourceBadgeClass(item.source)}`}>
                                            {item.source === 'Whatsapp' && <i className="fab fa-whatsapp"></i>} {item.source}
                                        </span>
                                    </div>

                                    <div className="col-comm">
                                        <div className="comm-group">
                                            <i className="fas fa-history" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}></i>
                                            <span className="item-sub">{item.lastComm}</span>
                                        </div>
                                    </div>

                                    <div className="col-actionable item-sub">{item.actionable}</div>
                                    <div className="col-owner item-sub">{item.ownership}</div>
                                    <div className="col-addon item-sub">
                                        {item.addOnDate}<br />{item.addOnTime}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <footer className="summary-footer">
                <div className="summary-label">Summary</div>
                <div className="summary-stats">TOTAL CONTACTS <span className="stat-val">{totalCount}</span></div>
                <div className="summary-stats">CUSTOMERS <span className="stat-val">2</span></div>
                <div className="summary-stats">PROSPECTS <span className="stat-val">2</span></div>
            </footer>
        </section>
    );
}

export default ContactsView;
