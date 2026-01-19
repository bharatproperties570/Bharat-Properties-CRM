import React, { useState } from 'react';
import { contactData } from '../data/mockData';
import { getInitials, getSourceBadgeClass } from '../utils/helpers';
import { useContactSync } from '../hooks/useContactSync';

function ContactsView({ onEdit }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'
    const [isSyncing, setIsSyncing] = useState(false);

    // Contact Sync Hook
    const { getSyncStatus, syncMultipleContacts } = useContactSync();

    // Filtering logic
    const filteredContacts = contactData.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.mobile.includes(searchTerm) ||
        (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Selection Handling
    const toggleSelect = (mobile) => {
        setSelectedIds(prev =>
            prev.includes(mobile) ? prev.filter(id => id !== mobile) : [...prev, mobile]
        );
    };

    // Select All Handler
    const toggleSelectAll = () => {
        if (selectedIds.length === paginatedContacts.length && paginatedContacts.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedContacts.map(c => c.mobile));
        }
    };

    const isSelected = (mobile) => selectedIds.includes(mobile);
    const totalCount = contactData.length;
    const selectedCount = selectedIds.length;

    // Pagination
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const paginatedContacts = filteredContacts.slice(indexOfFirstRecord, indexOfLastRecord);
    const totalPages = Math.ceil(filteredContacts.length / recordsPerPage);

    // Regrouping paginated results
    const groups = {};
    paginatedContacts.forEach(c => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
    });

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

    // Check if all visible contacts are selected
    const isAllSelected = paginatedContacts.length > 0 && selectedIds.length === paginatedContacts.length;
    const isIndeterminate = selectedIds.length > 0 && selectedIds.length < paginatedContacts.length;

    // Handle Edit Click
    const handleEditClick = () => {
        // Find the selected contact object
        const selectedContact = contactData.find(c => c.mobile === selectedIds[0]);
        if (selectedContact && onEdit) {
            onEdit(selectedContact);
        }
    };

    return (
        <section id="contactsView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Database CRM</span>
                            <h1>Contacts Portfolio</h1>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {/* Sync Status Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                            <i className="fas fa-check-circle text-green-600 text-sm"></i>
                            <span className="text-xs font-semibold text-green-700">Synced</span>
                        </div>
                        {/* View Toggle Button */}
                        <button
                            className="btn-outline"
                            onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                            title={viewMode === 'list' ? 'Switch to Card View' : 'Switch to List View'}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className={`fas ${viewMode === 'list' ? 'fa-th-large' : 'fa-list'}`}></i>
                            {viewMode === 'list' ? 'Card' : 'List'}
                        </button>
                        <button className="btn-outline">
                            <i className="fas fa-filter"></i> Filters
                        </button>
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0, position: 'relative' }}>
                    {/* Toolbar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 101, padding: '15px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '65px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedCount > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                {/* Select All Checkbox - Always visible */}
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = isIndeterminate;
                                        }
                                    }}
                                    onChange={toggleSelectAll}
                                    style={{ cursor: 'pointer' }}
                                />
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedCount} Selected
                                </div>

                                {/* Single Selection Only */}
                                {selectedCount === 1 && (
                                    <>
                                        <button className="action-btn" title="Call Contact"><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                    </>
                                )}

                                {/* Email - Always show */}
                                <button className="action-btn" title="Email Contact"><i className="fas fa-envelope"></i> Email</button>

                                {/* Single Selection Only - Edit & Create Lead */}
                                {selectedCount === 1 && (
                                    <>
                                        <button className="action-btn" title="Edit Contact" onClick={handleEditClick}><i className="fas fa-edit"></i> Edit</button>
                                        <button className="action-btn" title="Create Lead"><i className="fas fa-user-plus"></i> Create Lead</button>
                                    </>
                                )}

                                {/* Action Buttons - Available for all selections */}
                                <button className="action-btn" title="Activities"><i className="fas fa-calendar-check"></i> Activities</button>
                                <button className="action-btn" title="Assigned"><i className="fas fa-exchange-alt"></i> Assigned</button>
                                <button className="action-btn" title="Sequence"><i className="fas fa-stream"></i> Sequence</button>
                                <button className="action-btn" title="Send Message"><i className="fas fa-paper-plane"></i> Send Message</button>
                                <button className="action-btn" title="Add Tag"><i className="fas fa-tag"></i> Tag</button>

                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    {/* Select All Checkbox - Only for Card View */}
                                    {viewMode === 'card' && (
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            ref={input => {
                                                if (input) {
                                                    input.indeterminate = isIndeterminate;
                                                }
                                            }}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    )}
                                    <div style={{ position: 'relative', width: '350px' }}>
                                        <input
                                            type="text"
                                            className="search-input-premium"
                                            placeholder="Search by name, phone or email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '100%' }}
                                        />
                                        <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Showing: <strong>{paginatedContacts.length}</strong> / <strong>{totalCount}</strong>
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

                    {/* List View */}
                    {viewMode === 'list' ? (
                        <>
                            {/* Header Strip (Pati) */}
                            <div className="list-header contact-list-grid" style={{ position: 'sticky', top: '65px', background: '#f8fafc', zIndex: 100, borderBottom: '2px solid #e2e8f0' }}>
                                <div>
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        ref={input => {
                                            if (input) {
                                                input.indeterminate = isIndeterminate;
                                            }
                                        }}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </div>
                                <div>Personal Details</div>
                                <div>Location & Address</div>
                                <div>Professional Detail</div>
                                <div>Source & Tags</div>
                                <div>CRM Linkage</div>
                                <div>Last Interaction</div>
                                <div>Assigned</div>
                            </div>

                            <div id="contactListContent">
                                {Object.keys(groups).map(groupName => (
                                    <div key={groupName} className="list-group">
                                        <div className="group-header" style={{ padding: '12px 2rem', letterSpacing: '0.5px' }}>{groupName.toUpperCase()}</div>
                                        {groups[groupName].map((item, idx) => (
                                            <div
                                                key={item.mobile}
                                                className="list-item contact-list-grid"
                                                style={{
                                                    padding: '15px 2rem',
                                                    background: isSelected(item.mobile) ? '#f0f9ff' : '#fff',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => {
                                                    if (!isSelected(item.mobile)) e.currentTarget.style.background = '#fafbfc';
                                                }}
                                                onMouseOut={(e) => {
                                                    if (!isSelected(item.mobile)) e.currentTarget.style.background = '#fff';
                                                    else e.currentTarget.style.background = '#f0f9ff';
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="item-check"
                                                    checked={isSelected(item.mobile)}
                                                    onChange={() => toggleSelect(item.mobile)}
                                                />
                                                <div className="col-identity">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                        <div className={`avatar-circle avatar-${(idx % 5) + 1}`} style={{ width: '38px', height: '38px', fontSize: '0.85rem' }}>
                                                            {getInitials(item.name)}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{item.name}</div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginTop: '3px' }}>{item.mobile}</div>
                                                            {item.email && (
                                                                <div style={{ fontSize: '0.7rem', color: '#8e44ad', fontWeight: 600, marginTop: '2px' }}>
                                                                    <i className="fas fa-envelope" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i>
                                                                    {item.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="col-address">
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}></i>
                                                        <div className="address-clamp" style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, lineHeight: 1.4 }}>{item.address || 'Address not listed'}</div>
                                                    </div>
                                                </div>

                                                <div className="col-classification">
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                        <span className="prof-badge" style={{ fontSize: '0.6rem', padding: '3px 10px', fontWeight: 800 }}>{item.professional.toUpperCase()}</span>
                                                        <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700 }}>{item.designation}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                            <i className="fas fa-building" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i>
                                                            {item.company}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Source & Tags Column */}
                                                <div className="col-source-tags">
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <span className="source-badge" style={{
                                                            fontSize: '0.65rem',
                                                            padding: '3px 8px',
                                                            fontWeight: 700,
                                                            borderRadius: '4px',
                                                            background: '#ede9fe',
                                                            color: '#6b21a8',
                                                            display: 'inline-block',
                                                            width: 'fit-content'
                                                        }}>
                                                            <i className="fas fa-tag" style={{ marginRight: '3px', fontSize: '0.6rem' }}></i>
                                                            {item.source}
                                                        </span>
                                                        {item.tags && item.tags !== '-' && (
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                                                {item.tags}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* CRM Linkage Column */}
                                                <div className="col-crm-linkage">
                                                    {item.crmLinks && Object.keys(item.crmLinks).length > 0 ? (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                            {item.crmLinks.leads && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-user-plus" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Leads ({item.crmLinks.leads})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.deals && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-handshake" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Deals ({item.crmLinks.deals})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.property && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-building" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Property ({item.crmLinks.property})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.booking && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#fce7f3', color: '#9f1239', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-calendar-check" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Booking ({item.crmLinks.booking})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.project && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-project-diagram" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Project ({item.crmLinks.project})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.activities && (
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#fed7aa', color: '#7c2d12', borderRadius: '4px', fontWeight: 700 }}>
                                                                    <i className="fas fa-tasks" style={{ marginRight: '2px', fontSize: '0.6rem' }}></i>
                                                                    Activities ({item.crmLinks.activities})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.7rem', color: '#cbd5e1', fontStyle: 'italic' }}>-</div>
                                                    )}
                                                </div>

                                                <div className="col-interaction">
                                                    <div style={{ lineHeight: '1.4' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{item.lastComm}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Active: {item.actionable}</div>
                                                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                                            <i className="fas fa-phone-alt" style={{ color: '#388E3C', fontSize: '0.75rem', transform: 'scaleX(-1) rotate(5deg)' }}></i>
                                                            <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '0.75rem' }}></i>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="col-assignment">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div className="profile-circle" style={{ width: '28px', height: '28px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b' }}>{item.ownership.charAt(0)}</div>
                                                        <div>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{item.ownership}</div>
                                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>Added {item.addOnDate}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        /* Card View - Professional Contact Cards (Compact) */
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {paginatedContacts.map((item, idx) => (
                                    <div
                                        key={item.mobile}
                                        style={{
                                            background: isSelected(item.mobile) ? '#f0f9ff' : '#fff',
                                            border: `2px solid ${isSelected(item.mobile) ? '#3b82f6' : '#e5e7eb'}`,
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            transition: 'all 0.2s',
                                            boxShadow: isSelected(item.mobile) ? '0 4px 12px rgba(59, 130, 246, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected(item.mobile)) {
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected(item.mobile)) {
                                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                            }
                                        }}
                                    >
                                        {/* Card Header with Avatar & Checkbox */}
                                        <div style={{
                                            padding: '12px',
                                            background: isSelected(item.mobile) ? '#dbeafe' : '#f9fafb',
                                            borderBottom: '1px solid #e5e7eb',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                                <div className={`avatar-circle avatar-${(idx % 5) + 1}`} style={{ width: '40px', height: '40px', fontSize: '0.9rem', flexShrink: 0 }}>
                                                    {getInitials(item.name)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 800, color: '#111827', fontSize: '0.9rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>
                                                        <i className="fas fa-phone-alt" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i>
                                                        {item.mobile}
                                                    </div>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={isSelected(item.mobile)}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelect(item.mobile);
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                                            />
                                        </div>

                                        {/* Card Body - Contact Details */}
                                        <div style={{ padding: '12px' }}>
                                            {/* Email */}
                                            {item.email && (
                                                <div style={{
                                                    marginBottom: '10px',
                                                    paddingBottom: '10px',
                                                    borderBottom: '1px solid #f3f4f6',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <i className="fas fa-envelope" style={{ color: '#8b5cf6', fontSize: '0.75rem', width: '14px', flexShrink: 0 }}></i>
                                                    <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.email}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Professional Details Section */}
                                            <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Professional
                                                </div>
                                                <span className="prof-badge" style={{ fontSize: '0.6rem', padding: '2px 6px', fontWeight: 800, marginBottom: '4px', display: 'inline-block' }}>
                                                    {item.professional.toUpperCase()}
                                                </span>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', marginBottom: '3px' }}>
                                                    {item.designation}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <i className="fas fa-building" style={{ fontSize: '0.65rem' }}></i>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.company}</span>
                                                </div>
                                            </div>

                                            {/* Address Section */}
                                            <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Address
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '2px' }}></i>
                                                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                        {item.address || 'Address not listed'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Source & Tags Section */}
                                            <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Source
                                                </div>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '3px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    background: '#ede9fe',
                                                    color: '#6b21a8'
                                                }}>
                                                    <i className="fas fa-tag" style={{ fontSize: '0.6rem' }}></i>
                                                    {item.source}
                                                </span>
                                            </div>

                                            {/* CRM Linkage Section */}
                                            {item.crmLinks && Object.keys(item.crmLinks).length > 0 && (
                                                <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                        CRM Activity
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                                        {item.crmLinks.leads && (
                                                            <span style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#dbeafe', color: '#1e40af', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fas fa-user-plus" style={{ marginRight: '2px', fontSize: '0.55rem' }}></i>
                                                                {item.crmLinks.leads}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.deals && (
                                                            <span style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#dcfce7', color: '#166534', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fas fa-handshake" style={{ marginRight: '2px', fontSize: '0.55rem' }}></i>
                                                                {item.crmLinks.deals}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.property && (
                                                            <span style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#fef3c7', color: '#92400e', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fas fa-building" style={{ marginRight: '2px', fontSize: '0.55rem' }}></i>
                                                                {item.crmLinks.property}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.booking && (
                                                            <span style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#fce7f3', color: '#9f1239', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fas fa-calendar-check" style={{ marginRight: '2px', fontSize: '0.55rem' }}></i>
                                                                {item.crmLinks.booking}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.activities && (
                                                            <span style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#fed7aa', color: '#7c2d12', borderRadius: '3px', fontWeight: 700 }}>
                                                                <i className="fas fa-tasks" style={{ marginRight: '2px', fontSize: '0.55rem' }}></i>
                                                                {item.crmLinks.activities}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Last Interaction Section */}
                                            <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Last Interaction
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', marginBottom: '3px' }}>
                                                    {item.lastComm}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
                                                    Active: {item.actionable}
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <i className="fas fa-phone-alt" style={{ color: '#16a34a', fontSize: '0.8rem' }}></i>
                                                    <i className="fab fa-whatsapp" style={{ color: '#25d366', fontSize: '0.8rem' }}></i>
                                                </div>
                                            </div>

                                            {/* Assigned To Section */}
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Assigned To
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        borderRadius: '50%',
                                                        background: '#f3f4f6',
                                                        color: '#6b7280',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        flexShrink: 0
                                                    }}>
                                                        {item.ownership.charAt(0)}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {item.ownership}
                                                        </div>
                                                        <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600 }}>
                                                            Added {item.addOnDate}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <footer className="summary-footer" style={{ height: '60px', padding: '0 2rem' }}>
                <div className="summary-label" style={{ background: '#334155', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '0.7rem' }}>SUMMARY</div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div className="stat-pill">TOTAL CONTACTS <strong>{totalCount}</strong></div>
                    <div className="stat-pill">CUSTOMERS <strong>{contactData.filter(c => c.category === 'Customer').length}</strong></div>
                    <div className="stat-pill">PROSPECTS <strong>{contactData.filter(c => c.category === 'Prospect').length}</strong></div>
                    <div className="stat-pill" style={{ color: 'var(--primary-color)' }}>REAL ESTATE AGENTS <strong>{contactData.filter(c => c.category === 'Real Estate Agent').length}</strong></div>
                </div>
            </footer>
        </section>
    );
}

export default ContactsView;
