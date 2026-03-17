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
    const [isActionLoading, setIsActionLoading] = useState(null); // UID of being processed email

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
                    const mappedData = response.data.map(act => {
                        // Better participant resolution
                        let participantName = 'Unknown';
                        if (act.participants && act.participants.length > 0) {
                            participantName = act.participants[0].name;
                        } else if (act.relatedTo && act.relatedTo.length > 0) {
                            // Fallback to related entity if it's likely the person
                            const potentialPerson = act.relatedTo.find(r => r.model === 'Contact' || r.model === 'Lead');
                            if (potentialPerson) {
                                participantName = potentialPerson.name;
                            } else {
                                participantName = act.relatedTo[0].name;
                            }
                        }

                        // Better deals resolution
                        const deal = act.relatedTo && act.relatedTo.find(r => r.model === 'Deal');
                        const associatedDeals = deal ? deal.name : '--';

                        return {
                            id: act._id,
                            participant: participantName,
                            via: act.type === 'Messaging' ? 'MESSAGE' : (act.type || 'CALL').toUpperCase(),
                            type: `${act.details?.direction || 'Outgoing'} ${act.type || 'Activity'}`,
                            outcome: act.details?.outcome || act.status || '',
                            duration: act.details?.duration || '',
                            associatedDeals: associatedDeals,
                            date: new Date(act.dueDate || act.createdAt).toLocaleDateString(),
                            platform: act.details?.platform || 'Direct',
                            isMatched: act.entityId ? true : (act.details?.isMatched ?? false)
                        };
                    });
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

    // Help to map emails consistency
    const mapEmails = (emails) => {
        return emails.map(email => ({
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
            snippet: email.snippet,
            fromEmail: email.from,
            fromName: email.fromName,
            labels: email.labels || [],
            associated: email.associated,
            isLive: true,
            isMatched: !!email.associated
        }));
    };

    // Fetch live emails when Email tab is active
    useEffect(() => {
        if (activeTab === 'Email') {
            const fetchInbox = async () => {
                setIsInboxLoading(true);
                try {
                    const response = await emailAPI.getInbox();
                    if (response && response.success) {
                        setLiveEmails(mapEmails(response.data));
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
        let data = [];
        if (activeTab === 'Email') {
            data = [...liveEmails];
        } else {
            data = activities.filter(item => {
                if (activeTab === 'Calls') return item.via === 'CALL';
                if (activeTab === 'Messaging') return item.via === 'MESSAGE';
                return true;
            });
        }

        // Sub-tab Filtering: Matched vs Unmatched
        data = data.filter(item => {
            if (activeSubTab === 'Matched') return item.isMatched === true;
            if (activeSubTab === 'Unmatched') return item.isMatched === false;
            return true;
        });

        return applyCommunicationFilters(data, filters, searchQuery);
    }, [activeTab, activeSubTab, activities, liveEmails, filters, searchQuery]);

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

    const isAllSelected = communicationData.length > 0 && selectedIds.length === communicationData.length;
    const isIndeterminate = selectedIds.length > 0 && selectedIds.length < communicationData.length;

    const handleDeleteClick = async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} items? This action cannot be undone.`)) return;
        
        setIsActionLoading(true);
        try {
            // Bulk delete logic - assuming activitiesAPI.delete exists or we loop
            let successCount = 0;
            for (const id of selectedIds) {
                const response = await (activeTab === 'Email' ? emailAPI.deleteEmail(id) : activitiesAPI.delete(id));
                if (response && response.success) successCount++;
            }
            alert(`Deleted ${successCount} items.`);
            // Refresh data
            window.location.reload(); 
        } catch (error) {
            console.error('Error deleting items:', error);
            alert('Failed to delete some items.');
        } finally {
            setIsActionLoading(false);
            setSelectedIds([]);
        }
    };

    const handleBulkConvertToLead = async () => {
        if (selectedIds.length === 0) return;
        setIsActionLoading(true);
        try {
            let successCount = 0;
            for (const uid of selectedIds) {
                const response = await emailAPI.convertToLead(uid);
                if (response && response.success) successCount++;
            }
            if (successCount > 0) {
                alert(`Successfully processed ${successCount} leads.`);
                // Refresh inbox
                const refreshRes = await emailAPI.getInbox();
                if (refreshRes && refreshRes.success) {
                    setLiveEmails(mapEmails(refreshRes.data));
                }
                setSelectedIds([]);
            }
        } catch (error) {
            console.error('Error during bulk lead conversion:', error);
            alert(error.message || 'An error occurred during lead conversion.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleConvertToLead = async (uid) => {
        setIsActionLoading(uid);
        try {
            const response = await emailAPI.convertToLead(uid);
            if (response && response.success) {
                alert('Lead created successfully!');
                // Refresh inbox to update "Associated" status
                const inboxResponse = await emailAPI.getInbox();
                if (inboxResponse && inboxResponse.success) {
                    setLiveEmails(mapEmails(inboxResponse.data));
                }
            } else {
                alert(response.message || 'Failed to create lead.');
            }
        } catch (error) {
            console.error('Error converting to lead:', error);
            alert(error.message || 'An error occurred while creating the lead.');
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleViewProfile = (associated) => {
        if (!associated) return;
        const type = associated.type?.toLowerCase() === 'lead' ? 'leads' : 'contacts';
        window.open(`/${type}/${associated.id}`, '_blank');
    };

    const handleAddActivity = (associated) => {
        if (!associated) return;
        // Logic to open activity modal for this lead/contact
        // Since we don't have a direct "OpenActivityModal" here, 
        // we might redirect or use a shared state if available.
        // For now, let's redirect to lead detail where activities can be added.
        const type = associated.type?.toLowerCase() === 'lead' ? 'leads' : 'contacts';
        window.location.href = `/${type}/${associated.id}?action=addActivity`;
    };

    const handleReply = (email) => {
        setSelectedEmail(email);
        setIsComposeModalOpen(true);
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
                    <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {activeTab === 'Email' && (
                            <button
                                className="btn-primary"
                                onClick={() => setIsComposeModalOpen(true)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    background: '#0891b2',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <i className="fas fa-plus"></i>
                                <span>Compose Email</span>
                            </button>
                        )}
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
                                    onClick={() => { setActiveTab(tab); setSelectedIds([]); }}
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

                    {/* Sub Tabs / Action Panel */}
                    <div style={{ padding: '0 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '30px', minHeight: '65px' }}>
                        {selectedIds.length > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={(input) => { if (input) input.indeterminate = isIndeterminate; }}
                                    onChange={toggleSelectAll}
                                    style={{ cursor: "pointer", marginRight: '10px' }}
                                />
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0891b2', marginRight: '15px', whiteSpace: 'nowrap' }}>
                                    {selectedIds.length} Selected
                                </div>

                                {activeTab === 'Email' && (
                                    <button
                                        className="action-btn"
                                        onClick={handleBulkConvertToLead}
                                        disabled={isActionLoading}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '6px', color: '#0891b2', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                    >
                                        {isActionLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-plus"></i>}
                                        Create Lead
                                    </button>
                                )}

                                {selectedIds.length === 1 && (
                                    <>
                                        <button
                                            className="action-btn"
                                            onClick={() => {
                                                const item = (activeTab === 'Email' ? liveEmails : activities).find(a => a.id === selectedIds[0]);
                                                if (item?.associated) handleViewProfile(item.associated);
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                        >
                                            <i className="fas fa-external-link-alt"></i> View Profile
                                        </button>
                                        {activeTab === 'Email' && (
                                            <button
                                                className="action-btn"
                                                onClick={() => {
                                                    const item = liveEmails.find(e => e.id === selectedIds[0]);
                                                    if (item) handleReply(item);
                                                }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                            >
                                                <i className="fas fa-reply"></i> Reply
                                            </button>
                                        )}
                                    </>
                                )}

                                <button
                                    className="action-btn"
                                    onClick={() => {
                                        const selected = (activeTab === 'Email' ? liveEmails : activities).filter(a => selectedIds.includes(a.id));
                                        const entities = selected.map(s => s.associated).filter(Boolean);
                                        if (entities.length > 0) handleAddActivity(entities[0]);
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                    <i className="fas fa-calendar-plus"></i> Add Activity
                                </button>

                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setSelectedIds([])}
                                        style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteClick}
                                        style={{ padding: '6px 10px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', cursor: 'pointer' }}
                                        title="Delete Permanently"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ position: 'relative', width: '300px' }}>
                                    <input
                                        type="text"
                                        className="search-input-premium"
                                        placeholder="Search..."
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

                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#68737d', fontWeight: 500 }}>
                                        Total: <strong>{totalRecords}</strong>
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Show:</span>
                                        <select
                                            value={recordsPerPage}
                                            onChange={handleRecordsPerPageChange}
                                            style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem" }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>

                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <button onClick={goToPreviousPage} disabled={currentPage === 1} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: "pointer" }}>
                                            <i className="fas fa-chevron-left"></i>
                                        </button>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, alignSelf: 'center' }}>{currentPage} / {totalPages || 1}</span>
                                        <button onClick={goToNextPage} disabled={currentPage >= totalPages} style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: "pointer" }}>
                                            <i className="fas fa-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Active Filters */}
                    <div style={{ padding: '0 2rem', background: '#f8fafc' }}>
                        <ActiveFiltersChips
                            filters={filters}
                            onRemoveFilter={handleRemoveFilter}
                            onClearAll={handleClearAll}
                        />
                    </div>

                    {/* List Content */}
                    <div style={{ padding: '1rem 2rem' }}>
                        <div className="list-header" style={{
                            padding: '15px 20px',
                            background: '#f8fafc',
                            borderBottom: '2px solid #e2e8f0',
                            display: 'grid',
                            gridTemplateColumns: activeTab === 'Email' ? '40px 220px 1fr 140px 200px 120px' : '40px 200px 150px 120px 150px 120px 150px',
                            gap: '15px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color: '#475569',
                            textTransform: 'uppercase'
                        }}>
                            <div><input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} /></div>
                            {activeTab === 'Email' ? (
                                <>
                                    <div>Participants</div>
                                    <div>Email Details</div>
                                    <div>Type</div>
                                    <div>Associated</div>
                                    <div style={{ textAlign: 'right' }}>Date</div>
                                </>
                            ) : (
                                <>
                                    <div>Participants</div>
                                    <div>Type</div>
                                    <div>Platform</div>
                                    <div>Outcome</div>
                                    <div>Duration</div>
                                    <div>Associated Deal</div>
                                    <div>Date</div>
                                </>
                            )}
                        </div>

                        <div className="list-content">
                            {paginatedData.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        padding: '10px 20px',
                                        background: '#fff',
                                        borderBottom: '1px solid #f1f5f9',
                                        display: 'grid',
                                        gridTemplateColumns: activeTab === 'Email' ? '40px 220px 1fr 140px 200px 120px' : '40px 200px 150px 120px 150px 120px 150px',
                                        gap: '15px',
                                        alignItems: 'center'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                    />
                                    
                                    {activeTab === 'Email' ? (
                                        <>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{item.participant}</div>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div 
                                                    onClick={() => { setSelectedEmail(item); setIsViewModalOpen(true); }}
                                                    style={{ 
                                                        fontSize: '0.85rem', 
                                                        fontWeight: 700, 
                                                        color: '#0ea5e9', 
                                                        cursor: 'pointer',
                                                        textDecoration: 'none'
                                                    }}
                                                    onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                                                    onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                                                >
                                                    {item.subject}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{item.snippet}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <i className={item.type?.includes('Outgoing') ? 'fas fa-paper-plane' : 'fas fa-envelope-open'} style={{ color: '#0ea5e9' }}></i>
                                                {(item.labels || []).slice(0, 1).map(l => <span key={l} style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px' }}>{l}</span>)}
                                            </div>
                                            <div style={{ fontSize: '0.8rem' }}>
                                                {item.associated ? (
                                                    <div onClick={() => handleViewProfile(item.associated)} style={{ cursor: 'pointer' }}>
                                                        <div style={{ fontWeight: 700, color: '#0369a1' }}>{item.associated.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.associated.project}</div>
                                                    </div>
                                                ) : <span style={{ color: '#94a3b8' }}>Unmatched</span>}
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>{item.date}</div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{item.participant}</div>
                                            <div style={{ fontSize: '0.75rem' }}>{item.type}</div>
                                            <div>
                                                 <span style={{ fontSize: '0.7rem', background: '#e0f2fe', padding: '2px 8px', borderRadius: '10px' }}>{item.platform}</span>
                                            </div>
                                            <div>{item.outcome}</div>
                                            <div>{item.duration}</div>
                                            <div>{item.associatedDeals}</div>
                                            <div style={{ fontSize: '0.75rem' }}>{item.date}</div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <CommunicationFilterPanel
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    filters={filters}
                    onFilterChange={(key, value) => {
                        if (typeof key === 'object') setFilters(prev => ({ ...prev, ...key }));
                        else setFilters(prev => ({ ...prev, [key]: value }));
                    }}
                    onReset={() => setFilters({})}
                />

                <ComposeEmailModal
                    isOpen={isComposeModalOpen}
                    onClose={() => setIsComposeModalOpen(false)}
                    onSent={() => {
                        if (activeTab === 'Email') {
                            emailAPI.getInbox().then(res => {
                                if (res?.success) {
                                    const mappedEmails = res.data.map(email => ({
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
                    onReply={handleReply}
                    onConvertToLead={handleConvertToLead}
                    onAddActivity={handleAddActivity}
                    isActionLoading={isActionLoading}
                />
            </div>
        </section>
    );
}

export default CommunicationPage;
