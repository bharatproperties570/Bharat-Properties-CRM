import React, { useState, useRef, useEffect } from 'react';
import AddDealModal from '../../components/AddDealModal';

function DealsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [currentView, setCurrentView] = useState('list'); // 'list' or 'map'
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const dealsData = [
        {
            id: '2158',
            type: 'Ordinary',
            unitNo: '1',
            corner: 'Corner',
            propertyType: 'Plot(Residential)',
            size: '3 Marla (74.95 Sq Yard)',
            projectName: '',
            block: '',
            location: 'Sector 5 Kurukshetra',
            lat: 29.9457,
            lng: 76.8780,
            score: { val: 85, class: 'hot' },
            intent: 'Sell',
            matched: 3,
            owner: { name: 'RENU SHARMA', phone: '8076319951', email: 'renu.sharma@gmail.com' },
            associatedContact: { name: '', phone: '', email: '' },
            price: '1,04,93,000',
            priceWord: 'One crore four lakh ninety-three thousand Only',
            status: 'Open',
            assigned: 'Suraj',
            remarks: '',
            followUp: '',
            lastContacted: '12/15/2023 2:30 PM',
            date: '2023-11-15'
        },
        {
            id: '2368',
            type: 'Ordinary',
            unitNo: '1',
            corner: 'Three Side Open',
            propertyType: 'Plot(Residential)',
            size: '4 Marla (100.48 Sq Yard)',
            projectName: '',
            block: '',
            location: 'Sector 3 Kurukshetra',
            lat: 29.9520,
            lng: 76.8650,
            score: { val: 72, class: 'warm' },
            intent: 'Rent',
            matched: 5,
            owner: { name: 'Vikash Pehowa', phone: '7015811721', email: 'vikash.pehowa@gmail.com' },
            associatedContact: { name: 'Ram Kumar', phone: '9876543210', email: 'ram.kumar@gmail.com' },
            price: '1,12,00,000',
            priceWord: 'One crore twelve lakh Only',
            status: 'Quote',
            assigned: 'Varun Saini',
            remarks: 'Interested buyer',
            followUp: '12/20/2023',
            lastContacted: '12/14/2023 11:00 AM',
            date: '2023-11-14'
        },
        {
            id: '1439',
            type: 'Ordinary',
            unitNo: '1',
            corner: 'Ordinary',
            propertyType: 'Flat(Residential)',
            size: '4 Marla (114.82 Sq Yard)',
            projectName: '',
            block: '',
            location: 'Sector 4 Kurukshetra',
            lat: 29.9488,
            lng: 76.8715,
            score: { val: 68, class: 'warm' },
            intent: 'Sell',
            matched: 2,
            owner: { name: 'Nishant Bhardwaj', phone: '9728308282', email: 'nishant.bhardwaj@gmail.com' },
            associatedContact: { name: '', phone: '', email: '' },
            price: '1,25,00,000',
            priceWord: 'One crore twenty-five lakh Only',
            status: 'Negotiation',
            assigned: 'Varun Saini',
            remarks: '',
            followUp: '',
            lastContacted: '',
            date: '2023-11-12'
        },
        {
            id: '228',
            type: 'Ordinary',
            unitNo: '1',
            corner: 'Corner',
            propertyType: 'Plot(Residential)',
            size: '6 Marla (170.07 Sq Yard)',
            projectName: '',
            block: '',
            location: 'Sector 30 Kurukshetra',
            lat: 29.9380,
            lng: 76.8900,
            score: { val: 90, class: 'hot' },
            intent: 'Sell',
            matched: 7,
            owner: { name: 'Sumit Rathi', phone: '9999984022', email: 'sumit.rathi@gmail.com' },
            associatedContact: { name: 'Ram Chander Rathi', phone: '9876543211', email: 'ram.rathi@gmail.com' },
            price: '1,39,45,740',
            priceWord: 'One crore thirty-nine lakh forty-five thousand seven hundred and forty Only',
            status: 'Open',
            assigned: 'Suraj',
            remarks: '',
            followUp: '',
            lastContacted: '12/10/2023 3:15 PM',
            date: '2023-11-10'
        },
        {
            id: 'D 133',
            type: 'Ordinary',
            unitNo: '1',
            corner: 'Three Side Open',
            propertyType: 'Plot(Residential)',
            size: '5 Marla (138.06 Sq Yard)',
            projectName: '',
            block: '',
            location: 'Sector 29 (Green Homes) Kurukshetra',
            lat: 29.9400,
            lng: 76.8850,
            score: { val: 55, class: 'cold' },
            intent: 'Lease',
            matched: 1,
            owner: { name: 'VIKRAM KAUSHIK', phone: '9991278700', email: 'vikram.kaushik@gmail.com' },
            associatedContact: { name: '', phone: '', email: '' },
            price: '1,65,67,200',
            priceWord: 'One crore sixty-five lakh sixty-seven thousand two hundred Only',
            status: 'Open',
            assigned: 'Varun Saini',
            remarks: 'pending email follow',
            followUp: '12/25/2023',
            lastContacted: '12/08/2023 9:00 AM',
            date: '2023-11-08'
        }
    ];

    const [deals, setDeals] = useState(dealsData);

    const filteredDeals = deals.filter(deal => {
        const search = searchTerm.toLowerCase();
        return (
            (deal.id && deal.id.toLowerCase().includes(search)) ||
            (deal.owner && deal.owner.name && deal.owner.name.toLowerCase().includes(search)) ||
            (deal.location && deal.location.toLowerCase().includes(search)) ||
            (deal.propertyType && deal.propertyType.toLowerCase().includes(search)) ||
            (deal.assigned && deal.assigned.toLowerCase().includes(search))
        );
    });

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(v => v !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    return (
        <section id="dealsView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-handshake" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Sales Operations</span>
                            <h1>Deals</h1>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                        <div className="view-toggle-group">
                            <button
                                className={`view-toggle-btn ${currentView === 'list' ? 'active' : ''}`}
                                onClick={() => setCurrentView('list')}
                            >
                                <i className="fas fa-list"></i> List View
                            </button>
                            <button
                                className={`view-toggle-btn ${currentView === 'map' ? 'active' : ''}`}
                                onClick={() => setCurrentView('map')}
                            >
                                <i className="fas fa-map-marked-alt"></i> Map View
                            </button>
                        </div>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-filter"></i> Filters
                        </button>
                        <button
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563eb', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => setIsAddModalOpen(true)}
                        >
                            <i className="fas fa-plus"></i> Add Deal
                        </button>
                    </div>
                </div>

                {/* Pipeline Dashboard - Enhanced with Percentages */}
                <div className="pipeline-dashboard">
                    <PipelineItem label="OPEN" value="3" percent="45%" />
                    <PipelineItem label="QUOTE" value="1" percent="15%" />
                    <PipelineItem label="NEGOTIATION" value="1" percent="15%" />
                    <PipelineItem label="BOOKED" value="0" percent="0%" />
                    <ClosedPipelineItem />
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Toolbar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '45px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedIds.length > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedIds.length} Selected
                                </div>

                                {selectedIds.length === 1 && (
                                    <>
                                        <button className="action-btn" title="Edit Deal"><i className="fas fa-edit"></i> Edit</button>
                                        <button className="action-btn" title="Move Stage"><i className="fas fa-step-forward"></i> Move</button>
                                        <button className="action-btn" title="Call Owner"><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                        <button className="action-btn" title="View Quote"><i className="fas fa-file-invoice-dollar"></i> Quote</button>
                                    </>
                                )}

                                <button className="action-btn" title="Add Note"><i className="fas fa-sticky-note"></i> Note</button>

                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ position: 'relative', width: '380px' }}>
                                    <input
                                        type="text"
                                        className="search-input-premium"
                                        placeholder="Search deals by ID, property or owner..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                    <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                </div>
                                <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div className="pagination-nums" style={{ display: 'flex', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginRight: '10px' }}>Items: {filteredDeals.length}</span>
                                        <span className="page-num active">1</span>
                                        <span className="page-num">2</span>
                                        <span className="page-num">Next</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Header */}
                    {currentView === 'list' && (
                        <div className="list-header deals-list-grid" style={{ position: 'sticky', top: '45px', zIndex: 99, padding: '15px 1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <div><input type="checkbox" /></div>
                            <div>Score</div>
                            <div>Property Details</div>
                            <div>Location & Project</div>
                            <div>Match</div>
                            <div>Expectation</div>
                            <div>Owner_Details</div>
                            <div>Associate</div>
                            <div>Status</div>
                            <div>Interaction</div>
                            <div>Assignment</div>
                        </div>
                    )}

                    {currentView === 'list' ? (
                        <div className="list-content" style={{ background: '#fafbfc' }}>
                            <div className="list-group">
                                {filteredDeals.map((deal, index) => (<div key={deal.id} className="list-item deals-list-grid" style={{ padding: '18px 1.5rem', borderBottom: '1px solid #e2e8f0', transition: 'all 0.2s ease', background: '#fff', marginBottom: '2px' }}>
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={selectedIds.includes(deal.id)}
                                        onChange={() => toggleSelect(deal.id)}
                                    />

                                    {/* Col 1: Score */}
                                    <div className={`score-indicator ${deal.score.class}`} style={{ width: '40px', height: '40px', fontSize: '0.9rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', border: '2px solid rgba(0,0,0,0.05)' }}>
                                        {deal.score.val}
                                    </div>

                                    {/* Col 2: Property Details */}
                                    <div className="super-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div
                                                className={`project-thumbnail ${deal.status === 'Open' ? 'thumb-active' : 'thumb-inactive'}`}
                                                style={{
                                                    width: 'auto',
                                                    minWidth: '60px',
                                                    height: '28px',
                                                    borderRadius: '6px',
                                                    padding: '0 10px',
                                                    aspectRatio: 'auto'
                                                }}
                                            >
                                                {deal.unitNo}
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{deal.corner}</div>
                                        </div>
                                        <div style={{ paddingLeft: '2px' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{deal.propertyType}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{deal.size}</div>
                                        </div>
                                    </div>

                                    {/* Col 3: Location & Project */}
                                    <div className="super-cell">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem' }}></i>
                                            <span className="text-ellipsis" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{deal.location}</span>
                                        </div>
                                        {deal.projectName && (
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                                                <i className="fas fa-building" style={{ marginRight: '4px', fontSize: '0.7rem' }}></i>
                                                {deal.projectName}
                                            </div>
                                        )}
                                        {deal.block && (
                                            <span className="verified-badge" style={{ fontSize: '0.58rem', padding: '2px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 800 }}>BLOCK: {deal.block}</span>
                                        )}
                                    </div>

                                    {/* Col 4: Match */}
                                    <div style={{ lineHeight: 1.4, padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: '4px' }}>{deal.intent}</div>
                                        <div style={{ fontSize: '0.7rem' }}>
                                            <span style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)' }}>{deal.matched} Matches</span>
                                        </div>
                                    </div>

                                    {/* Col 5: Expectation */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#15803d' }}>₹{deal.price}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.2 }}>{deal.priceWord}</div>
                                    </div>

                                    {/* Col 6: Owner Details */}
                                    <div className="super-cell" style={{ background: '#fefce8', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #eab308' }}>
                                        <div className="text-ellipsis" style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem', marginBottom: '4px' }}>{deal.owner.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600, marginBottom: '2px' }}>
                                            <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>{deal.owner.phone}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{deal.owner.email}
                                        </div>
                                    </div>

                                    {/* Col 7: Associate */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        {deal.associatedContact.name ? (
                                            <>
                                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.8rem' }}>{deal.associatedContact.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: 600 }}>
                                                    <i className="fas fa-mobile-alt" style={{ marginRight: '4px' }}></i>{deal.associatedContact.phone}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    <i className="fas fa-envelope" style={{ marginRight: '4px' }}></i>{deal.associatedContact.email}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>--</div>
                                        )}
                                    </div>

                                    {/* Col 8: Status */}
                                    <div>
                                        <span className={`status-badge ${deal.status === 'Open' ? 'hot' : deal.status === 'Quote' ? 'warm' : 'cold'}`} style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '12px', fontWeight: 700 }}>
                                            {deal.status.toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Col 9: Interaction (Remarks + Follow Up) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div className="address-clamp" style={{ fontSize: '0.75rem', color: deal.remarks ? '#334155' : '#94a3b8', fontStyle: deal.remarks ? 'italic' : 'normal' }}>
                                            {deal.remarks || '--'}
                                        </div>
                                        {deal.followUp && (
                                            <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
                                                <i className="far fa-calendar-alt" style={{ marginRight: '4px' }}></i>
                                                {deal.followUp}
                                            </div>
                                        )}
                                    </div>

                                    {/* Col 10: Assignment (Assigned To + Last Contacted) */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>{deal.assigned}</div>
                                        {deal.lastContacted && (
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                <i className="far fa-clock" style={{ marginRight: '4px' }}></i>
                                                {deal.lastContacted}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="map-view-container" style={{ height: 'calc(100vh - 250px)', position: 'relative', margin: '0', display: 'flex' }}>
                            {/* Left Sidebar with Deals List */}
                            <div style={{ width: '320px', background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                                        <i className="fas fa-map-pin" style={{ color: '#ef4444', marginRight: '6px' }}></i>
                                        Deals by Location ({filteredDeals.length})
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            className="search-input-premium"
                                            placeholder="Filter deals..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px 8px 35px', fontSize: '0.8rem' }}
                                        />
                                        <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`} style={{ fontSize: '0.75rem', left: '10px' }}></i>
                                    </div>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {filteredDeals.map((deal, idx) => (
                                        <div
                                            key={deal.id}
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
                                                    background: '#ef4444',
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
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>#{deal.id}</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>
                                                {deal.location}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '4px' }}>
                                                {deal.propertyType} - {deal.size}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                                                ₹{deal.price}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Google Map with Pins */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d221096.81984827753!2d76.6395!3d30.3398!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390fb6000000001%3A0x4e8b6e8b6e8b6e8b!2sMohali%2C%20Punjab!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin"
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                ></iframe>

                                {/* Deal Pin Markers Overlay */}
                                {dealsData.map((deal, idx) => {
                                    // Convert lat/lng to approximate pixel position (simplified calculation)
                                    // Center of map: lat 29.9457, lng 76.8780
                                    const centerLat = 29.9457;
                                    const centerLng = 76.8780;
                                    const latDiff = (deal.lat - centerLat) * 5000; // Approximate pixels per degree
                                    const lngDiff = (deal.lng - centerLng) * 5000;

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
                                            title={`${deal.id} - ${deal.location}`}
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
                                                        fill="#ef4444"
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
                    )}

                    {/* Footer - Shows in both list and map view */}
                    <div className="list-footer" style={{ padding: '15px 2rem', background: '#fff', borderTop: '1px solid #eef2f5', display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Summary</div>
                        <div style={{ fontSize: '0.9rem', color: '#334155' }}>Total Deals <span style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', marginLeft: '5px' }}>66</span></div>
                    </div>
                </div>
            </div >

            <AddDealModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={(newDeal) => {
                    const formattedDeal = {
                        ...newDeal,
                        id: `D${Math.floor(Math.random() * 10000)}`,
                        score: { val: 60, class: 'warm' } // Mock initial score
                    };
                    setDeals(prev => [formattedDeal, ...prev]);
                    setIsAddModalOpen(false);
                }}
            />
        </section >
    );
}

// Helper Components for Pipeline Dashboard
function PipelineItem({ label, value, percent }) {
    return (
        <div className="pipeline-item">
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">{label}</div>
                    <div className="pipeline-value">{value}</div>
                </div>
                <div className="pipeline-percent">{percent}</div>
            </div>
        </div>
    );
}

function ClosedPipelineItem() {
    const [isOpen, setIsOpen] = useState(false);
    const itemRef = useRef(null);
    const [menuStyle, setMenuStyle] = useState({});

    const handleMouseEnter = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: `${rect.bottom}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                display: 'block',
                zIndex: 1000
            });
            setIsOpen(true);
        }
    };

    const handleMouseLeave = () => {
        setIsOpen(false);
    };

    useEffect(() => {
        const handleScroll = () => {
            if (isOpen) setIsOpen(false);
        };
        if (isOpen) {
            window.addEventListener('scroll', handleScroll, { passive: true });
        }
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isOpen]);

    return (
        <div
            className="pipeline-item"
            ref={itemRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: 'pointer' }}
        >
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">CLOSED</div>
                    <div className="pipeline-value">
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem' }}></i>
                    </div>
                </div>
                <div className="pipeline-percent">25%</div>
            </div>
            {isOpen && (
                <div className="pipeline-sub-stages show" style={menuStyle}>
                    <div className="sub-stage-item success">
                        <div className="sub-label">Won</div>
                        <div className="sub-stats">
                            <span className="sub-val">2</span>
                            <span className="sub-percent">20%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item danger">
                        <div className="sub-label">Lost</div>
                        <div className="sub-stats">
                            <span className="sub-val">0</span>
                            <span className="sub-percent">5%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const DealsPageWrapper = () => (
    <>
        <DealsPage />
    </>
);

export default DealsPage;
