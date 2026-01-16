import React, { useState } from 'react';

function CommunicationView() {
    const [activeTab, setActiveTab] = useState('Calls');
    const [activeSubTab, setActiveSubTab] = useState('Matched');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Sample communication data - Calls
    const callsData = [
        {
            id: 1,
            participant: 'JASWINDER SINGH',
            via: 'PHONE',
            type: 'Outgoing Call',
            outcome: '',
            duration: '',
            associatedDeals: '115',
            date: '4 days ago',
            platform: 'GSM Call'
        },
        {
            id: 2,
            participant: 'Subhash Chander',
            via: 'PHONE',
            type: 'Outgoing Call',
            outcome: 'Not Interested',
            duration: '00:00:03',
            associatedDeals: '1110',
            date: '4 days ago',
            platform: 'WhatsApp Call'
        },
        {
            id: 3,
            participant: 'Rajesh Kumar',
            via: 'PHONE',
            type: 'Incoming Call',
            outcome: 'Interested',
            duration: '00:05:23',
            associatedDeals: '220',
            date: '3 days ago',
            platform: 'GSM Call'
        },
        {
            id: 4,
            participant: 'Priya Sharma',
            via: 'PHONE',
            type: 'Outgoing Call',
            outcome: 'Call Back Later',
            duration: '00:02:15',
            associatedDeals: '330',
            date: '2 days ago',
            platform: 'Telegram Call'
        }
    ];

    // Sample communication data - Messages
    const messagesData = [
        {
            id: 5,
            participant: 'Amit Verma',
            via: 'MESSAGE',
            type: 'Outgoing Message',
            outcome: 'Delivered',
            duration: '',
            associatedDeals: '440',
            date: '1 day ago',
            platform: 'WhatsApp'
        },
        {
            id: 6,
            participant: 'Neha Gupta',
            via: 'MESSAGE',
            type: 'Incoming Message',
            outcome: 'Read',
            duration: '',
            associatedDeals: '550',
            date: '12 hours ago',
            platform: 'SMS'
        },
        {
            id: 7,
            participant: 'Vikram Singh',
            via: 'MESSAGE',
            type: 'Outgoing Message',
            outcome: 'Sent',
            duration: '',
            associatedDeals: '660',
            date: '6 hours ago',
            platform: 'Telegram'
        },
        {
            id: 8,
            participant: 'Kavita Reddy',
            via: 'MESSAGE',
            type: 'Incoming Message',
            outcome: 'Read',
            duration: '',
            associatedDeals: '770',
            date: '2 hours ago',
            platform: 'FB Messenger'
        },
        {
            id: 9,
            participant: 'Rahul Jain',
            via: 'MESSAGE',
            type: 'Outgoing Message',
            outcome: 'Delivered',
            duration: '',
            associatedDeals: '880',
            date: '1 hour ago',
            platform: 'RCS'
        }
    ];

    // Sample communication data - Email
    const emailData = [
        {
            id: 10,
            participant: 'Sunita Verma',
            via: 'EMAIL',
            type: 'Outgoing Email',
            outcome: 'Sent',
            duration: '',
            associatedDeals: '990',
            date: '3 days ago',
            platform: 'Gmail'
        },
        {
            id: 11,
            participant: 'Deepak Sharma',
            via: 'EMAIL',
            type: 'Incoming Email',
            outcome: 'Read',
            duration: '',
            associatedDeals: '1100',
            date: '2 days ago',
            platform: 'Outlook'
        },
        {
            id: 12,
            participant: 'Anita Patel',
            via: 'EMAIL',
            type: 'Outgoing Email',
            outcome: 'Delivered',
            duration: '',
            associatedDeals: '1210',
            date: '1 day ago',
            platform: 'Yahoo Mail'
        },
        {
            id: 13,
            participant: 'Manoj Kumar',
            via: 'EMAIL',
            type: 'Incoming Email',
            outcome: 'Unread',
            duration: '',
            associatedDeals: '1320',
            date: '5 hours ago',
            platform: 'Gmail'
        }
    ];

    // Get data based on active tab
    const getCommunicationData = () => {
        switch (activeTab) {
            case 'Calls':
                return callsData;
            case 'Messages':
                return messagesData;
            case 'Email':
                return emailData;
            default:
                return callsData;
        }
    };

    const communicationData = getCommunicationData();

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.length === communicationData.length ? [] : communicationData.map(c => c.id)
        );
    };

    return (
        <section className="main-content">
            <div className="page-container">
                {/* Page Header */}
                <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #eef2f5', padding: '1rem 1.5rem' }}>
                    <div className="page-title-group">
                        <i className="fas fa-comments" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Communication</span>
                            <h1>Communication Center</h1>
                        </div>
                    </div>
                    <div className="header-actions">
                        <button
                            className={`btn-filter ${isFilterOpen ? 'active' : ''}`}
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: isFilterOpen ? '#f1f5f9' : '#fff',
                                color: '#475569',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <i className="fas fa-filter"></i>
                            <span>Filter</span>
                        </button>
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Main Tabs: Email, Calls, Text Messages */}
                    <div style={{ padding: '15px 2rem', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '30px', borderBottom: '2px solid #e2e8f0' }}>
                            {['Email', 'Calls', 'Messages'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: '10px 0',
                                        border: 'none',
                                        background: 'none',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        color: activeTab === tab ? '#0891b2' : '#64748b',
                                        borderBottom: activeTab === tab ? '3px solid #0891b2' : '3px solid transparent',
                                        cursor: 'pointer',
                                        marginBottom: '-2px'
                                    }}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sub Tabs: Matched, Unmatched */}
                    <div style={{ padding: '11px 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                            {['Matched', 'Unmatched'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveSubTab(tab)}
                                    style={{
                                        padding: '7.5px 0',
                                        border: 'none',
                                        background: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: activeSubTab === tab ? '#10b981' : '#64748b',
                                        borderBottom: activeSubTab === tab ? '2px solid #10b981' : '2px solid transparent',
                                        cursor: 'pointer',
                                        marginBottom: '-2px'
                                    }}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Communication List with Filters */}
                    <div style={{ display: 'flex', background: '#fafbfc' }}>
                        {/* Main List Area */}
                        <div style={{ flex: 1, padding: '1rem 2rem' }}>
                            {/* List Header */}
                            <div className="list-header" style={{
                                position: 'sticky',
                                top: '45px',
                                zIndex: 99,
                                padding: '15px 20px',
                                background: '#f8fafc',
                                borderBottom: '2px solid #e2e8f0',
                                color: '#475569',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                display: 'grid',
                                gridTemplateColumns: '40px 200px 150px 120px 150px 120px 150px 120px',
                                gap: '20px',
                                alignItems: 'center'
                            }}>
                                <div><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === communicationData.length} /></div>
                                <div>Participants</div>
                                <div>Type</div>
                                <div>Platform</div>
                                <div>Outcome</div>
                                <div>Duration (hh:mm:ss)</div>
                                <div>Associated Deals</div>
                                <div>Date</div>
                            </div>

                            {/* Communication List Items */}
                            <div className="list-content">
                                {communicationData.map((comm) => (
                                    <div
                                        key={comm.id}
                                        className="list-item"
                                        style={{
                                            padding: '15px 20px',
                                            marginBottom: '10px',
                                            borderRadius: '10px',
                                            border: '1px solid #e2e8f0',
                                            background: '#fff',
                                            display: 'grid',
                                            gridTemplateColumns: '40px 200px 150px 120px 150px 120px 150px 120px',
                                            gap: '20px',
                                            alignItems: 'center',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.borderColor = '#cbd5e1';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(comm.id)}
                                            onChange={() => toggleSelect(comm.id)}
                                        />

                                        {/* Participants */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-user" style={{ color: '#64748b', fontSize: '0.8rem' }}></i>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{comm.participant}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Via {comm.via}</div>
                                            </div>
                                        </div>

                                        {/* Type */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className={comm.type.includes('Outgoing') ? (comm.via === 'PHONE' ? 'fas fa-phone-alt' : 'fas fa-paper-plane') : comm.type.includes('Incoming') ? (comm.via === 'PHONE' ? 'fas fa-phone' : 'fas fa-envelope') : 'fas fa-phone-slash'}
                                                style={{ color: comm.type.includes('Outgoing') ? '#0891b2' : comm.type.includes('Incoming') ? '#10b981' : '#dc2626', fontSize: '0.75rem' }}></i>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>{comm.type}</div>
                                        </div>

                                        {/* Platform */}
                                        <div>
                                            {comm.platform && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontWeight: 700,
                                                    background: comm.platform === 'WhatsApp' ? '#d1fae5' :
                                                        comm.platform === 'SMS' ? '#dbeafe' :
                                                            comm.platform === 'Telegram' ? '#e0e7ff' :
                                                                comm.platform === 'FB Messenger' ? '#fce7f3' :
                                                                    comm.platform === 'RCS' ? '#fef3c7' : '#f3f4f6',
                                                    color: comm.platform === 'WhatsApp' ? '#065f46' :
                                                        comm.platform === 'SMS' ? '#1e40af' :
                                                            comm.platform === 'Telegram' ? '#4338ca' :
                                                                comm.platform === 'FB Messenger' ? '#be123c' :
                                                                    comm.platform === 'RCS' ? '#92400e' : '#374151'
                                                }}>
                                                    {comm.platform}
                                                </span>
                                            )}
                                        </div>

                                        {/* Outcome */}
                                        <div>
                                            {comm.outcome && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontWeight: 700,
                                                    background: comm.outcome === 'Not Interested' ? '#fee2e2' :
                                                        comm.outcome === 'Interested' ? '#d1fae5' :
                                                            comm.outcome === 'Delivered' ? '#dbeafe' :
                                                                comm.outcome === 'Read' ? '#d1fae5' :
                                                                    comm.outcome === 'Sent' ? '#e0e7ff' :
                                                                        comm.outcome === 'Call Back Later' ? '#fef3c7' : '#e0e7ff',
                                                    color: comm.outcome === 'Not Interested' ? '#991b1b' :
                                                        comm.outcome === 'Interested' ? '#065f46' :
                                                            comm.outcome === 'Delivered' ? '#1e40af' :
                                                                comm.outcome === 'Read' ? '#065f46' :
                                                                    comm.outcome === 'Sent' ? '#4338ca' :
                                                                        comm.outcome === 'Call Back Later' ? '#92400e' : '#4338ca'
                                                }}>
                                                    {comm.outcome}
                                                </span>
                                            )}
                                        </div>

                                        {/* Duration */}
                                        <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>{comm.duration || '--'}</div>

                                        {/* Associated Deals */}
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0891b2' }}>{comm.associatedDeals}</div>

                                        {/* Date */}
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{comm.date}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Filters Panel */}
                        {isFilterOpen && (
                            <div style={{
                                width: '250px',
                                background: '#fff',
                                borderLeft: '1px solid #e2e8f0',
                                padding: '1rem',
                                height: 'calc(100vh - 120px)',
                                position: 'sticky',
                                top: '45px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                    <i className="fas fa-filter" style={{ color: '#64748b', fontSize: '0.85rem' }}></i>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Filters</div>
                                </div>

                                {/* Filter Options */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {/* Show only missed calls */}
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '5px' }}>Show only missed calls</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No</div>
                                        <i className="fas fa-filter" style={{ color: '#64748b', fontSize: '0.75rem', float: 'right', marginTop: '-18px' }}></i>
                                    </div>

                                    {/* Hot */}
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '5px' }}>Hot</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No</div>
                                        <i className="fas fa-filter" style={{ color: '#64748b', fontSize: '0.75rem', float: 'right', marginTop: '-18px' }}></i>
                                    </div>

                                    {/* Associated to deal */}
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '5px' }}>Associated to deal</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No</div>
                                        <i className="fas fa-filter" style={{ color: '#64748b', fontSize: '0.75rem', float: 'right', marginTop: '-18px' }}></i>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CommunicationView;
