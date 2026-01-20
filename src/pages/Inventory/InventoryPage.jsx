import React, { useState } from 'react';

function InventoryPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'

    const inventoryData = [
        {
            id: 1,
            unitNo: '1',
            corner: 'Corner',
            type: 'Plot(Residential)',
            size: '4 Marla (100.00 Sq Yard)',
            location: 'A Block',
            area: 'Sector 66 Beta (IT City) Mohali',
            direction: 'South East',
            facing: 'Dividing Road',
            road: '100 Ft. Road',
            status: 'Active',
            ownerName: 'Mr. Vijay Kumar',
            ownerPhone: '9878299954',
            ownerAddress: 'Vpo Lahra Gagga Samana, Patiala Punjab 147101, Near Main Chowk, Opposite Royal Garden, Block C, Street 12',
            associatedContact: 'Amit Sharma',
            associatedPhone: '9876543210',
            remarks: 'Interested For Sale',
            followUp: '-',
            lastContactDate: '12/6/2025',
            lastContactTime: '2:43 PM',
            lastContactUser: 'Admin',
            lat: 30.6695,
            lng: 76.7112
        },
        {
            id: 2,
            unitNo: '1',
            corner: 'Three Side Open',
            type: 'School(Institutional)',
            size: '18814.76 Sq Yard',
            location: 'Third Block',
            area: 'Sector 4 Kurukshetra',
            direction: 'South',
            facing: 'Mandir',
            road: '24 Mtr Wide',
            status: 'Active',
            ownerName: 'Mr. VINOD RAWAL',
            ownerPhone: '9812501234',
            ownerAddress: '457 Urban Estate Sector 13, Kurukshetra Haryana 136118, Behind Government College, Flat No 22, Sector 13 Extension',
            associatedContact: 'Deepak Gupta',
            associatedPhone: '9416012345',
            remarks: 'No -But wants to buy another property',
            followUp: '-',
            lastContactDate: '12/22/2025',
            lastContactTime: '10:27 AM',
            lastContactUser: 'Admin',
            lat: 29.9691,
            lng: 76.8406
        },
        {
            id: 3,
            unitNo: '1',
            corner: 'Ordinary',
            type: 'Shop(Residential)',
            size: '-',
            location: 'First Block',
            area: 'Sector 8 Kurukshetra',
            direction: '-',
            facing: '-',
            road: '-',
            status: 'Active',
            ownerName: 'Mr. Satish Sharma',
            ownerPhone: '9812234567',
            ownerAddress: 'Shop No 12, Main Market, Sector 8 Kurukshetra, Haryana, Near Railway Station Road',
            associatedContact: 'Rahul Vats',
            associatedPhone: '9896054321',
            remarks: 'Call Not Picked',
            followUp: '-',
            lastContactDate: '11/29/2025',
            lastContactTime: '9:32 PM',
            lastContactUser: 'Varun Saini',
            lat: 29.9642,
            lng: 76.8258
        },
        {
            id: 4,
            unitNo: '1 SP',
            corner: 'Corner',
            type: 'Plot(Residential)',
            size: '1 Kanal (623.59 Sq Yard)',
            location: 'First Block',
            area: 'Sector 3 Kurukshetra',
            direction: 'North',
            facing: 'Green Belt',
            road: '9 Mtr Wide',
            status: 'Active',
            ownerName: 'Mr. SATWANTI',
            ownerPhone: '941212937',
            ownerAddress: '49 Urban Estate Sector 14, Rohtak Haryana 124001, Near Civil Hospital, House No 45A, Park View Apartment',
            associatedContact: 'Vikram Singh',
            associatedPhone: '9991122334',
            remarks: 'Not Interested',
            followUp: '-',
            lastContactDate: '01/05/2026',
            lastContactTime: '11:15 AM',
            lastContactUser: 'Admin',
            lat: 29.9754,
            lng: 76.8123
        },
        {
            id: 5,
            unitNo: '1 P',
            corner: 'Ordinary',
            type: 'Showroom(Commercial)',
            size: 'DSS (94.56 Sq Yard)',
            location: 'Huda Market',
            area: 'Sector 4 Kurukshetra',
            direction: 'East',
            facing: 'Parking',
            road: '9 Mtr Wide',
            status: 'Active',
            ownerName: 'Mr. Akshay Kumar',
            ownerPhone: '7015484257',
            ownerAddress: 'Ekta Vihar, Kurukshetra Haryana 136118, Near Park Main Gate, Lane 3, House 102',
            associatedContact: 'Sanjay Dutt',
            associatedPhone: '8816077889',
            remarks: '',
            followUp: '-',
            lastContactDate: '01/12/2026',
            lastContactTime: '4:20 PM',
            lastContactUser: 'Varun Saini',
            lat: 29.9700,
            lng: 76.8200
        },
        {
            id: 6,
            unitNo: '1 SP',
            corner: 'Corner',
            type: 'House(Residential)',
            size: '10 Marla (233.12 Sq Yard)',
            location: 'Fourth Block',
            area: 'Sector 4 Kurukshetra',
            direction: 'South',
            facing: 'Green Belt',
            road: '9 Mtr Wide',
            status: 'Inactive',
            ownerName: 'Smt. Kamlesh Devi',
            ownerPhone: '981224230',
            ownerAddress: 'Teh Thanesar Vpo Mathana, Kurukshetra Haryana 136131, Ward 15, Street 2',
            associatedContact: 'Monu Kumar',
            associatedPhone: '9034567890',
            remarks: '',
            followUp: '-',
            lastContactDate: '01/08/2026',
            lastContactTime: '9:45 AM',
            lastContactUser: 'Admin',
            lat: 29.9650,
            lng: 76.8300
        },
        {
            id: 7,
            unitNo: '13',
            corner: 'Ordinary',
            type: 'Residential Plot',
            size: 'Sector 13 Kurukshetra',
            location: 'Sector 13',
            area: 'Kurukshetra, Haryana',
            direction: '-',
            facing: '-',
            road: '-',
            status: 'Active',
            ownerName: 'Admin Post',
            ownerPhone: '9000000000',
            ownerAddress: 'VPO Mathana, Kurukshetra, Haryana 136131, Block A, Plot 50',
            associatedContact: 'Bharat Properties',
            associatedPhone: '9988776655',
            remarks: 'Verified Listing',
            followUp: '-',
            lastContactDate: '1/10/2026',
            lastContactTime: '11:00 AM',
            lastContactUser: 'Admin',
            lat: 29.9720,
            lng: 76.8450
        }
    ];

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(v => v !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    return (
        <section id="inventoryView" className="view-section active">
            {viewMode === 'list' ? (
                <div className="view-scroll-wrapper">
                    <div className="page-header">
                        <div className="page-title-group">
                            <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                            <div>
                                <span className="working-list-label">Global Inventory</span>
                                <h1>Properties Dashboard</h1>
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
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-filter"></i> Filters
                            </button>
                            <i className="fas fa-sliders-h header-icon"></i>
                        </div>
                    </div>

                    <div className="inventory-stats-row" style={{ padding: '12px 25px' }}>
                        <div className="status-card" style={{ padding: '8px 15px', maxWidth: '180px' }}>
                            <div className="stat-icon-dot dot-active"></div>
                            <div className="stat-card-info">
                                <h3 style={{ fontSize: '0.7rem' }}>Active</h3>
                                <div className="stat-count" style={{ fontSize: '1.2rem', color: '#388E3C' }}>1,441</div>
                            </div>
                        </div>
                        <div className="status-card" style={{ padding: '8px 15px', maxWidth: '180px' }}>
                            <div className="stat-icon-dot dot-inactive"></div>
                            <div className="stat-card-info">
                                <h3 style={{ fontSize: '0.7rem' }}>Inactive</h3>
                                <div className="stat-count" style={{ fontSize: '1.2rem', color: '#D32F2F' }}>29,218</div>
                            </div>
                        </div>
                    </div>

                    <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                        <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                            {selectedIds.length > 0 ? (
                                <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                    <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                        {selectedIds.length} Selected
                                    </div>

                                    {/* Single Selection Only Actions */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <button className="action-btn" title="Edit Property"><i className="fas fa-edit"></i> Edit</button>
                                            <button className="action-btn" title="Create Deal"><i className="fas fa-plus-circle"></i> Deal</button>
                                            <button className="action-btn" title="Add Owner"><i className="fas fa-user-plus"></i> Owner</button>
                                            <button className="action-btn" title="Matched Lead"><i className="fas fa-handshake"></i> Match</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                            <button className="action-btn" title="Call Owner"><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
                                            <button className="action-btn" title="Message Owner"><i className="fas fa-comment-alt"></i> Msg</button>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                        </>
                                    )}

                                    {/* Available for Both Single and Multi */}
                                    <button className="action-btn" title="Add Remarks"><i className="fas fa-sticky-note"></i> Note</button>
                                    <button className="action-btn" title="Add Tag"><i className="fas fa-tag"></i> Tag</button>

                                    {/* Single Selection Only Actions (Files/Feedback) */}
                                    {selectedIds.length === 1 && (
                                        <>
                                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                            <button className="action-btn" title="Preview"><i className="fas fa-eye"></i> View</button>
                                            <button className="action-btn" title="Upload Image"><i className="fas fa-image"></i> Img</button>
                                            <button className="action-btn" title="Upload Document"><i className="fas fa-file-alt"></i> Doc</button>
                                            <button className="action-btn" title="Feedback"><i className="fas fa-comment-dots"></i> Feed</button>
                                        </>
                                    )}

                                    <div style={{ marginLeft: 'auto' }}>
                                        <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div style={{ position: 'relative' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                        <input
                                            type="text"
                                            placeholder="Search by ID, Project or Owner..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '400px', padding: '8px 15px 8px 45px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>
                                            Total: <strong>1,441</strong> Properties
                                        </div>
                                        <div className="pagination-nums" style={{ display: 'flex', gap: '4px' }}>
                                            <span className="page-num active">1</span>
                                            <span className="page-num">2</span>
                                            <span className="page-num"><i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }}></i></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="list-header inventory-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '12px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <div><input type="checkbox" /></div>
                            <div>Property Details</div>
                            <div>Project & Location</div>
                            <div>Orientation</div>
                            <div>Owner Profile</div>
                            <div>Associate Contact</div>
                            <div>Status</div>
                            <div>Last History</div>
                        </div>

                        <div className="list-content">
                            {inventoryData.map((item) => (
                                <div key={item.id} className="list-item inventory-list-grid" style={{ padding: '10px 1.5rem', alignItems: 'flex-start' }}>
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                        style={{ marginTop: '8px' }}
                                    />

                                    <div className="super-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div className={`project-thumbnail ${item.status === 'Active' ? 'thumb-active' : 'thumb-inactive'}`}>
                                                {item.unitNo}
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.corner}</div>
                                        </div>
                                        <div style={{ paddingLeft: '2px' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{item.type}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{item.size}</div>
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        <div className="cell-value-main text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, color: '#0f172a' }}>{item.area}</div>
                                        <div className="cell-value-sub text-ellipsis" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{item.location}</div>
                                        <div style={{ marginTop: '6px' }}>
                                            <span className="verified-badge text-ellipsis" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800, display: 'inline-block', maxWidth: '100%' }}>BLOCK: {item.location.split(' ')[0]}</span>
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        <div className="cell-label" style={{ marginTop: 0, color: '#94a3b8' }}>Facing & Directions</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {item.direction !== '-' && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-compass" style={{ color: '#3b82f6', width: '14px' }}></i> {item.direction}</div>}
                                            {item.facing !== '-' && <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 500 }}><i className="fas fa-map-signs" style={{ color: '#f59e0b', width: '14px' }}></i> {item.facing}</div>}
                                            {item.road !== '-' && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}><i className="fas fa-road" style={{ width: '14px' }}></i> {item.road}</div>}
                                        </div>
                                    </div>

                                    <div className="super-cell">
                                        {item.ownerName ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                    <div className="text-ellipsis" style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.85rem' }}>{item.ownerName}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{item.ownerPhone}</div>
                                                <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2' }} title={item.ownerAddress}>
                                                    {item.ownerAddress}
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No owner data</div>}
                                    </div>

                                    <div className="super-cell">
                                        {item.associatedContact ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                    <div style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.85rem' }}>{item.associatedContact}</div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>{item.associatedPhone}</div>
                                                <div className="address-clamp" style={{ fontSize: '0.68rem', lineHeight: '1.2', color: '#94a3b8' }}>
                                                    Verified Associate Representative for Project {item.area}
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No associate</div>}
                                    </div>

                                    <div className="super-cell">
                                        <div style={{ marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.65rem', background: item.status === 'Active' ? 'rgba(56, 142, 60, 0.1)' : 'rgba(211, 47, 47, 0.1)', color: item.status === 'Active' ? '#388E3C' : '#D32F2F', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>{item.status.toUpperCase()}</span>
                                        </div>
                                        {item.remarks && (
                                            <div style={{ background: '#fffbeb', padding: '4px 8px', borderRadius: '6px', border: '1px solid #fde68a', maxWidth: '100px' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#92400e', lineHeight: '1.2' }}>{item.remarks}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="super-cell">
                                        {item.lastContactDate !== '-' ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                    <div className="avatar-circle" style={{ width: '24px', height: '24px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b' }}>
                                                        {item.lastContactUser.charAt(0)}
                                                    </div>
                                                    <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#334155' }}>{item.lastContactUser}</div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800 }}>
                                                        <i className="fas fa-calendar-alt" style={{ marginRight: '6px' }}></i>
                                                        {item.lastContactDate}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, marginLeft: '2px' }}>
                                                        <i className="fas fa-clock" style={{ marginRight: '6px', fontSize: '0.6rem' }}></i>
                                                        {item.lastContactTime}
                                                    </div>
                                                </div>
                                            </>
                                        ) : <div style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No record</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="page-header">
                        <div className="page-title-group">
                            <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                            <div>
                                <span className="working-list-label">Global Inventory</span>
                                <h1>Properties Dashboard</h1>
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
                            <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-filter"></i> Filters
                            </button>
                            <i className="fas fa-sliders-h header-icon"></i>
                        </div>
                    </div>
                    <div className="content-body" style={{ paddingTop: 0 }}>
                        <div style={{ height: 'calc(100vh - 250px)', position: 'relative', margin: '0', display: 'flex' }}>
                            {/* Left Sidebar with Properties List */}
                            <div style={{ width: '320px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                                        <i className="fas fa-map-pin" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                        Properties by Location ({inventoryData.length})
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search properties by ID, area or owner..."
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {inventoryData.map((item, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                padding: '12px 15px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                background: '#fff'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    background: item.status === 'Active' ? '#10b981' : '#ef4444',
                                                    borderRadius: '50%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#fff',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700
                                                }}>
                                                    {idx + 1}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>Unit #{item.unitNo}</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>
                                                {item.area}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                {item.type} - {item.size}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                <i className="fas fa-user" style={{ marginRight: '4px' }}></i>
                                                {item.ownerName}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Google Map with Pins */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <iframe
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    loading="lazy"
                                    allowFullScreen
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d109782.91037748405!2d76.69036504285265!3d30.698544258807534!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fed0be66c4021%3A0xa59fbc01d248358!2sMohali%2C%20Punjab!5e0!3m2!1sen!2sin!4v1705330000000!5m2!1sen!2sin"
                                ></iframe>

                                {/* Property Pin Markers Overlay */}
                                {inventoryData.map((item, idx) => {
                                    // Convert lat/lng to approximate pixel position
                                    const centerLat = 30.6985;
                                    const centerLng = 76.7112;
                                    const latDiff = (item.lat - centerLat) * 5000;
                                    const lngDiff = (item.lng - centerLng) * 5000;

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                position: 'absolute',
                                                left: `calc(50% + ${lngDiff}px)`,
                                                top: `calc(50% - ${latDiff}px)`,
                                                transform: 'translate(-50%, -100%)',
                                                cursor: 'pointer',
                                                zIndex: 10,
                                                transition: 'all 0.2s'
                                            }}
                                            title={`Unit ${item.unitNo} - ${item.area}`}
                                        >
                                            {/* Pin Marker */}
                                            <div style={{
                                                width: '32px',
                                                height: '40px',
                                                position: 'relative',
                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                                            }}>
                                                {/* Pin Shape */}
                                                <svg width="32" height="40" viewBox="0 0 32 40" style={{ position: 'absolute', top: 0, left: 0 }}>
                                                    <path
                                                        d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z"
                                                        fill={item.status === 'Active' ? '#10b981' : '#ef4444'}
                                                        stroke="#fff"
                                                        strokeWidth="2"
                                                    />
                                                </svg>
                                                {/* Pin Number */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '6px',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    color: '#fff',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    textAlign: 'center',
                                                    width: '100%'
                                                }}>
                                                    {idx + 1}
                                                </div>
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
                            </div>
                        </div>
                    </div>
                </>
            )}

            <footer className="summary-footer" style={{ height: '55px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div className="summary-label" style={{ background: '#334155', color: '#fff', borderRadius: '8px', fontSize: '0.65rem', padding: '4px 12px', fontWeight: 800 }}>PROPERTY SYNC</div>
                    <div className="stat-pill"><span style={{ color: '#6366f1' }}>RES:</span> <span className="stat-val-bold">29,588</span></div>
                    <div className="stat-pill"><span style={{ color: 'var(--primary-color)' }}>COMM:</span> <span className="stat-val-bold">962</span></div>
                    <div className="stat-pill"><span style={{ color: '#f59e0b' }}>AGRI:</span> <span className="stat-val-bold">02</span></div>
                </div>
            </footer>
        </section>
    );
}

export default InventoryPage;
