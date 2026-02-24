import React, { useState, useMemo, useEffect } from 'react';
import CommunicationFilterPanel from './components/CommunicationFilterPanel';
import { applyCommunicationFilters } from '../../utils/communicationFilterLogic';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { activitiesAPI, emailAPI } from '../../utils/api';
import ComposeEmailModal from './components/ComposeEmailModal';
import ViewEmailModal from './components/ViewEmailModal';

function CommunicationPage() {
    const [activeTab, setActiveTab] = useState('Calls');
    const [activeSubTab, setActiveSubTab] = useState('Matched');
    const [selectedIds, setSelectedIds] = useState([]);

    // Filter State
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState({});
    const [liveEmails, setLiveEmails] = useState([]);
    const [isInboxLoading, setIsInboxLoading] = useState(false);
    const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    // Filter Handlers
    const handleRemoveFilter = (key) => {
        const newFilters = { ...filters };
        delete newFilters[key];
        setFilters(newFilters);
    };

    const handleClearAll = () => {
        setFilters({});
    };

    const [searchQuery, setSearchQuery] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);

    const [activities, setActivities] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch activities from backend
    useEffect(() => {
        const fetchActivities = async () => {
            setIsLoading(true);
            try {
                const response = await activitiesAPI.getAll();
                if (response && response.success) {
                    // Map backend Activity to UI format
                    const mappedData = response.data.map(act => ({
                        id: act._id,
                        participant: act.participants && act.participants.length > 0 ? act.participants[0].name : 'Unknown',
                        via: act.type === 'Messaging' ? 'MESSAGE' : act.type.toUpperCase(),
                        type: `${act.details?.direction || 'Outgoing'} ${act.type}`,
                        outcome: act.details?.outcome || '',
                        duration: act.details?.duration || '',
                        associatedDeals: act.relatedTo && act.relatedTo.length > 0 ? act.relatedTo[0].name : '--',
                        date: new Date(act.dueDate).toLocaleDateString(),
                        platform: act.details?.platform || 'Direct'
                    }));
                    setActivities(mappedData);
                }
            } catch (error) {
                console.error('Error fetching activities:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchActivities();
    }, []);

    // Fetch live emails when Email tab is active
    useEffect(() => {
        if (activeTab === 'Email') {
            const fetchInbox = async () => {
                setIsInboxLoading(true);
                try {
                    const response = await emailAPI.getInbox();
                    if (response && response.success) {
                        const mappedEmails = response.data.map(email => ({
                            id: email.id || email.uid,
                            participant: email.fromName || email.from,
                            via: 'EMAIL',
                            type: 'Incoming Email',
                            outcome: 'Received',
                            duration: '--',
                            associatedDeals: '--',
                            date: new Date(email.date).toLocaleString(),
                            platform: 'Gmail',
                            subject: email.subject,
                            isLive: true
                        }));
                        setLiveEmails(mappedEmails);
                    }
                } catch (error) {
                    console.error('Error fetching inbox:', error);
                } finally {
                    setIsInboxLoading(false);
                }
            };
            fetchInbox();
        }
    }, [activeTab]);

    // Filter Logic
    const communicationData = useMemo(() => {
        if (activeTab === 'Email') {
            const data = [...liveEmails];
            return applyCommunicationFilters(data, filters, searchQuery);
        }

        const data = activities.filter(item => {
            if (activeTab === 'Calls') return item.via === 'CALL';
            if (activeTab === 'Messaging') return item.via === 'MESSAGE';
            return true;
        });

        return applyCommunicationFilters(data, filters, searchQuery);
    }, [activeTab, activities, filters, searchQuery]);

    // Pagination Helpers
    const totalRecords = communicationData.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const paginatedData = communicationData.slice(
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
                    {activeTab === 'Email' && (
                        <button
                            className="btn-primary"
                            onClick={() => setIsComposeModalOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                borderRadius: '10px',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                background: '#0891b2',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                        >
                            <i className="fas fa-plus"></i> Compose Email
                        </button>
                    )}
                    <div className="header-actions">
                        <button
                            className={`btn-filter ${isFilterOpen ? 'active' : ''}`}
                            onClick={() => setIsFilterOpen(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                background: Object.keys(filters).length > 0 ? '#eff6ff' : '#fff',
                                color: Object.keys(filters).length > 0 ? '#2563eb' : '#475569',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                        >
                            <i className="fas fa-filter"></i>
                            <span>Filter</span>
                            {Object.keys(filters).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '-5px', right: '-5px',
                                    width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                                }}></span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0 }}>
                    {/* Main Tabs: Email, Calls, Text Messages */}
                    <div style={{ padding: '15px 2rem', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '30px', borderBottom: '2px solid #e2e8f0' }}>
                            {['Email', 'Calls', 'Messaging'].map(tab => (
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
                    {/* Sub Tabs: Matched, Unmatched & Search */}
                    <div style={{ padding: '0 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '40px' }}>
                        {/* Search Input */}
                        <div style={{ position: 'relative', width: '300px' }}>
                            <input
                                type="text"
                                className="search-input-premium"
                                placeholder="Search by name, platform or deal..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: '100%' }}
                            />
                            <i className={`fas fa-search search-icon-premium ${searchQuery ? 'active' : ''}`}></i>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0' }}>
                            {['Matched', 'Unmatched'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveSubTab(tab)}
                                    style={{
                                        padding: '11px 0',
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

                        <div style={{ flex: 1 }}></div>

                        {/* Pagination Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>
                                Total: <strong>{totalRecords}</strong>
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

                    {/* Active Filters Chips */}
                    <div style={{ padding: '0 2rem', background: '#f8fafc' }}>
                        <ActiveFiltersChips
                            filters={filters}
                            onRemoveFilter={handleRemoveFilter}
                            onClearAll={handleClearAll}
                        />
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
                                {paginatedData.map((comm) => (
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
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {comm.isLive && comm.subject ? (
                                                        <span style={{ color: '#0369a1' }}>[{comm.subject}] </span>
                                                    ) : null}
                                                    {comm.participant}
                                                </div>
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
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0891b2' }}>
                                            {comm.associatedDeals}
                                            {comm.isLive && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedEmail(comm);
                                                        setIsViewModalOpen(true);
                                                    }}
                                                    style={{
                                                        marginLeft: '12px',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #0891b2',
                                                        background: '#fff',
                                                        color: '#0891b2',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    View
                                                </button>
                                            )}
                                        </div>

                                        {/* Date */}
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{comm.date}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Filters Panel removed, using Component */}
                    </div>
                </div>
                <CommunicationFilterPanel
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    filters={filters}
                    onFilterChange={(key, value) => {
                        // Support single key update or bulk object update
                        if (typeof key === 'object') {
                            setFilters(prev => ({ ...prev, ...key }));
                        } else {
                            if (value === null) {
                                const newFilters = { ...filters };
                                delete newFilters[key];
                                setFilters(newFilters);
                            } else {
                                setFilters(prev => ({ ...prev, [key]: value }));
                            }
                        }
                    }}
                    onReset={() => setFilters({})}
                />
                <ComposeEmailModal
                    isOpen={isComposeModalOpen}
                    onClose={() => setIsComposeModalOpen(false)}
                    onSent={() => {
                        // Refresh inbox if on Email tab
                        if (activeTab === 'Email') {
                            emailAPI.getInbox().then(response => {
                                if (response && response.success) {
                                    const mappedEmails = response.data.map(email => ({
                                        id: email.id || email.uid,
                                        participant: email.fromName || email.from,
                                        via: 'EMAIL',
                                        type: 'Incoming Email',
                                        outcome: 'Received',
                                        duration: '--',
                                        associatedDeals: '--',
                                        date: new Date(email.date).toLocaleString(),
                                        platform: 'Gmail',
                                        subject: email.subject,
                                        isLive: true
                                    }));
                                    setLiveEmails(mappedEmails);
                                }
                            });
                        }
                    }}
                />
                <ViewEmailModal
                    isOpen={isViewModalOpen}
                    onClose={() => setIsViewModalOpen(false)}
                    email={selectedEmail}
                />
            </div>
        </section>
    );
}

export default CommunicationPage;
