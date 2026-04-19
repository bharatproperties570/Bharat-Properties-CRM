import { useState, useMemo, useEffect, useCallback } from 'react';
import CommunicationFilterPanel from './components/CommunicationFilterPanel';
import { applyCommunicationFilters } from '../../utils/communicationFilterLogic';
import ActiveFiltersChips from '../../components/ActiveFiltersChips';
import { activitiesAPI, emailAPI } from '../../utils/api';
import ComposeEmailModal from './components/ComposeEmailModal';
import ViewEmailModal from './components/ViewEmailModal';
import AIStatusPanel from './components/AIStatusPanel';
import AIConversationsTab from './components/AIConversationsTab';
import AICallPanel from './components/AICallPanel';
import ConversationThread from './components/ConversationThread';
import './components/ConversationThread.css';

function CommunicationPage() {
    const [activeTab, setActiveTab] = useState('AI Conversations');
    const [activeSubTab, setActiveSubTab] = useState('Matched');
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);

    // Filter State
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState({});
    const [liveEmails, setLiveEmails] = useState([]);
    const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(null); // UID of being processed email
    const [nextPageToken, setNextPageToken] = useState(null);
    const [isMoreLoading, setIsMoreLoading] = useState(false);

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

    // Fetch activities from backend
    useEffect(() => {
        const fetchActivities = async () => {
            try {
                const response = await activitiesAPI.getMessagingStream();
                if (response && response.success) {
                    // Map backend Activity to UI format
                    const mappedData = response.data.map(act => {
                        let participantName = 'Unknown Consumer';
                        let phone = '';
                        let snippet = act.details?.text || act.details?.message || act.subject || '';

                        // 🔍 SMART IDENTITY RESOLUTION
                        if (act.participants && act.participants.length > 0) {
                            participantName = act.participants[0].name;
                            phone = act.participants[0].mobile;
                        } else if (act.details?.senderName) {
                            participantName = act.details.senderName;
                        } else if (act.details?.from) {
                            participantName = act.details.from;
                            phone = act.details.from;
                        } else if (act.relatedTo && act.relatedTo.length > 0) {
                            const person = act.relatedTo.find(r => ['Contact', 'Lead'].includes(r.model));
                            if (person) participantName = person.name;
                        }

                        // 🏷️ CONTEXTUAL SUBJECT (Like Email)
                        const project = act.relatedTo?.find(r => r.model === 'Project' || r.model === 'Deal');
                        const contextLabel = project ? `[${project.name}] ` : '';

                        return {
                            id: act._id,
                            participant: participantName,
                            via: act.type === 'Messaging' ? (act.platform === 'WhatsApp' ? 'WhatsApp' : (act.platform === 'RCS' ? 'RCS' : 'SMS')) : (act.type || 'CALL').toUpperCase(),
                            type: `${act.details?.direction || 'Inbound'} ${act.type || 'Message'}`,
                            subject: contextLabel + (snippet.length > 50 ? snippet.substring(0, 50) + '...' : snippet),
                            snippet: snippet,
                            outcome: act.details?.status || act.status || 'Delivered',
                            duration: act.details?.duration || '--',
                            date: new Date(act.createdAt).toLocaleString(),
                            platform: act.details?.platform || (act.type === 'Messaging' && act.platform !== 'WhatsApp' ? 'SMS Hub' : 'WhatsApp Cloud'),
                            isMatched: !!(act.entityId || (act.relatedTo && act.relatedTo.length > 0)),
                            phone: phone,
                            thread: act.thread || act.details?.conversationThread || []
                        };
                    });
                    setActivities(mappedData);
                }
            } catch (error) {
                console.error('[EnterpriseHub] ❌ STREAM SYNC FAILURE:', error);
            }
        };
        fetchActivities();
    }, []);

    // Help to map emails consistency
    const mapEmails = useCallback((emails) => {
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
    }, []);

    // Fetch live emails
    const fetchInbox = useCallback(async (shouldAppend = false, token = null) => {
        if (shouldAppend) setIsMoreLoading(true);

        try {
            console.log(`[EnterpriseEmail] 📬 FETCHING INBOX — Token: ${token || 'INITIAL'} | Append: ${shouldAppend}`);
            const response = await emailAPI.getInbox({ pageToken: token, limit: 25 });
            
            if (response && response.success) {
                // Enterprise Reliability: Handle both { emails: [] } and direct [] structures
                const rawData = response.data;
                const emailList = Array.isArray(rawData) ? rawData : (rawData?.emails || []);
                
                const newEmails = mapEmails(emailList);
                console.log(`[EnterpriseEmail] ✅ FETCH SUCCESS — Count: ${newEmails.length}`);

                if (shouldAppend) {
                    setLiveEmails(prev => [...prev, ...newEmails]);
                } else {
                    setLiveEmails(newEmails);
                }
                setNextPageToken(rawData?.nextPageToken || null);
            }
        } catch (error) {
            console.error('[EnterpriseEmail] ❌ INBOX FETCH FAILURE:', error);
        } finally {
            setIsMoreLoading(false);
        }
    }, [mapEmails]);

    // Fetch live emails when Email tab is active
    useEffect(() => {
        if (activeTab === 'Email' && liveEmails.length === 0) {
            fetchInbox();
        }
    }, [activeTab, liveEmails.length, fetchInbox]);

    const handleLoadMore = () => {
        if (nextPageToken) {
            fetchInbox(true, nextPageToken);
        }
    };

    // Filter Logic
    const communicationData = useMemo(() => {
        let data = [];
        if (activeTab === 'Email') {
            data = [...liveEmails];
        } else {
            data = activities.filter(item => {
                if (activeTab === 'Calls') return item.via === 'CALL';
                if (activeTab === 'WhatsApp') return item.via === 'WhatsApp' || item.via === 'WHATSAPP';
                if (activeTab === 'SMS') return item.via === 'SMS';
                if (activeTab === 'RCS') return item.via === 'RCS';
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

    const handleSendMessage = async (text, channel) => {
        if (!selectedConversation || !text) return;
        
        const phone = selectedConversation.phoneNumber || selectedConversation.phone;
        if (!phone) {
            alert('Cannot send message: No phone number associated with this thread.');
            return;
        }

        try {
            const response = await activitiesAPI.sendReply({
                phoneNumber: phone,
                message: text,
                channel: channel.toLowerCase(),
                entityId: selectedConversation.entityId,
                entityType: selectedConversation.entityType
            });

            if (response && response.success) {
                // Optimistically update the thread UI
                const newMessage = { sender: 'agent', text, time: new Date().toISOString() };
                setSelectedConversation(prev => ({
                    ...prev,
                    thread: [...(prev.thread || []), newMessage]
                }));
            } else {
                alert(response.error || 'Failed to send message.');
            }
        } catch (error) {
            console.error('[EnterpriseHub] ❌ SEND FAILURE:', error);
            alert('Interruption in secure message tunnel. Please retry.');
        }
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev =>
            prev.length === communicationData.length ? [] : communicationData.map(c => c.id)
        );
    };

    return (
        <section className="main-content" style={{ background: '#f8fafc' }}>
            <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                
                {/* 🚀 Enterprise Header: The Neural Pulse */}
                <div style={{ 
                    padding: '1.25rem 2rem', 
                    background: 'rgba(255, 255, 255, 0.8)', 
                    backdropFilter: 'blur(10px)', 
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100
                }}>
                    <div className="page-title-group">
                        <div style={{ 
                            width: '48px', 
                            height: '48px', 
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)', 
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(14, 165, 233, 0.25)',
                            marginRight: '16px'
                        }}>
                            <i className="fas fa-satellite-dish" style={{ color: '#fff', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Communication Hub</h1>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0' }}>Manage omni-channel interactions and AI automation</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            padding: '4px 16px', 
                            background: '#fff', 
                            border: '1px solid #e2e8f0', 
                            borderRadius: '100px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#059669' }}>
                                <span style={{ width: '8px', height: '8px', background: '#059669', borderRadius: '50%', display: 'inline-block' }}></span>
                                3 Bots Active
                            </span>
                            <div style={{ width: '1px', height: '16px', background: '#e2e8f0' }}></div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>1.2k processed total</span>
                        </div>
                        
                        <button 
                            className="btn-primary" 
                            onClick={() => setIsComposeModalOpen(true)}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '8px 20px', 
                                borderRadius: '10px',
                                background: '#0f172a',
                                color: '#fff',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'transform 0.2s'
                            }}
                        >
                            <i className="fas fa-paper-plane"></i>
                            New Message
                        </button>
                    </div>
                </div>

                <div className="content-body" style={{ 
                    display: 'flex', 
                    flexDirection: 'row', // Force horizontal
                    flex: 1, 
                    overflow: 'hidden',
                    width: '100%',
                    position: 'relative'
                }}>
                    
                    {/* 🔧 Sidebar: Advanced Filters & Channel Selection */}
                    <div style={{ 
                        width: '280px', 
                        minWidth: '280px', // Prevent shrinking
                        background: '#fff', 
                        borderRight: '1px solid #e2e8f0', 
                        display: 'flex', 
                        flexDirection: 'column',
                        padding: '1.5rem',
                        height: '100%'
                    }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'block' }}>Communication Channels</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {[
                                    { id: 'AI Conversations', icon: 'fas fa-robot', color: '#8b5cf6', label: 'AI Agents' },
                                    { id: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#22c55e', label: 'WhatsApp' },
                                    { id: 'SMS', icon: 'fas fa-comment-alt', color: '#f59e0b', label: 'SMS Hub' },
                                    { id: 'RCS', icon: 'fas fa-comment-dots', color: '#ec4899', label: 'RCS / Rich SMS' },
                                    { id: 'Email', icon: 'fas fa-envelope', color: '#0ea5e9', label: 'Enterprise Email' },
                                    { id: 'Calls', icon: 'fas fa-phone-volume', color: '#6366f1', label: 'Voice Activity' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { setActiveTab(tab.id); setSelectedIds([]); }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: activeTab === tab.id ? `${tab.color}10` : 'transparent',
                                            color: activeTab === tab.id ? tab.color : '#64748b',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            textAlign: 'left'
                                        }}
                                    >
                                        <i className={tab.icon} style={{ width: '20px', fontSize: '1.1rem', marginRight: '12px' }}></i>
                                        <span style={{ fontSize: '0.9rem', fontWeight: activeTab === tab.id ? 700 : 500 }}>{tab.label}</span>
                                        {activeTab === tab.id && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: tab.color }}></div>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'block' }}>Filters</label>
                            <div style={{ position: 'relative', marginBottom: '12px' }}>
                                <input 
                                    type="text" 
                                    placeholder="Search threads..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px 12px 10px 36px', 
                                        borderRadius: '8px', 
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem'
                                    }}
                                />
                                <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }}></i>
                            </div>
                            
                            <button 
                                onClick={() => setIsFilterOpen(true)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    color: '#475569',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <i className="fas fa-sliders-h"></i>
                                Advanced Filters
                            </button>
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                             <div style={{ padding: '16px', background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', borderRadius: '12px', color: '#fff' }}>
                                <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, opacity: 0.7, margin: '0 0 8px 0' }}>AI Efficiency</p>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>84%</div>
                                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', margin: '8px 0' }}>
                                    <div style={{ width: '84%', height: '100%', background: '#0ea5e9', borderRadius: '2px' }}></div>
                                </div>
                                <p style={{ fontSize: '0.65rem', margin: 0, opacity: 0.8 }}>Automated interactions today.</p>
                             </div>
                        </div>
                    </div>

                    {/* 📊 Main Listing Area */}
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        background: '#fff', 
                        overflow: 'hidden',
                        minWidth: 0 // CRITICAL: Allows flex child to shrink properly
                    }}>
                        
                        {/* Sub-Header / Selection Status */}
                        <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                            <div style={{ display: 'flex', background: '#fff', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                {['Matched', 'Unmatched'].map(sTab => (
                                    <button
                                        key={sTab}
                                        onClick={() => setActiveSubTab(sTab)}
                                        style={{
                                            padding: '6px 16px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: activeSubTab === sTab ? '#fff' : 'transparent',
                                            color: activeSubTab === sTab ? '#0f172a' : '#64748b',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            boxShadow: activeSubTab === sTab ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                        }}
                                    >
                                        {sTab}
                                    </button>
                                ))}
                            </div>
                            
                            <div style={{ marginLeft: '16px', display: 'flex', gap: '8px' }}>
                                <button 
                                    onClick={() => window.location.reload()} 
                                    style={{ 
                                        padding: '6px 12px', 
                                        borderRadius: '8px', 
                                        border: '1px solid #e2e8f0', 
                                        background: '#fff', 
                                        fontSize: '0.8rem', 
                                        fontWeight: 600, 
                                        color: '#475569',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <i className="fas fa-sync-alt"></i>
                                    Sync Stream
                                </button>
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#68737d', fontWeight: 600 }}>
                                    Channel Load: <strong style={{ color: '#0f172a' }}>{totalRecords}</strong>
                                </span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={goToPreviousPage} disabled={currentPage === 1} style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}><i className="fas fa-chevron-left"></i></button>
                                    <button onClick={goToNextPage} disabled={currentPage >= totalPages} style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}><i className="fas fa-chevron-right"></i></button>
                                </div>
                            </div>
                        </div>

                        {/* The Professional List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', background: '#f8fafc' }}>
                            {activeTab === 'AI Conversations' ? (
                                <AIConversationsTab />
                            ) : activeTab === 'Live AI Calling' ? (
                                <AICallPanel />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {paginatedData.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedConversation(item)}
                                            style={{
                                                background: selectedConversation?.id === item.id ? '#fff' : '#fff',
                                                border: selectedConversation?.id === item.id ? '2px solid #0ea5e9' : '1px solid #eef2f6',
                                                borderRadius: '12px',
                                                padding: '16px 20px',
                                                display: 'grid',
                                                gridTemplateColumns: '40px 1fr 140px 140px 100px',
                                                alignItems: 'center',
                                                gap: '15px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                boxShadow: selectedConversation?.id === item.id ? '0 10px 15px -3px rgba(14, 165, 233, 0.1)' : '0 1px 2px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            <div onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
                                                <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => {}} style={{ cursor: 'pointer' }} />
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                                                <div style={{ 
                                                    width: '44px', 
                                                    height: '44px', 
                                                    borderRadius: '12px', 
                                                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center',
                                                    fontSize: '1rem',
                                                    color: '#0f172a',
                                                    fontWeight: 800,
                                                    border: '1px solid #e2e8f0'
                                                }}>
                                                    {item.participant?.charAt(0) || '?'}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.participant}</span>
                                                        {item.isMatched && <i className="fas fa-check-circle" style={{ color: '#0ea5e9', fontSize: '0.8rem' }}></i>}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.type === 'Incoming Email' ? item.subject : (item.subject || item.snippet || 'Interactive Session')}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <i className={
                                                        item.via === 'WhatsApp' || item.via === 'WHATSAPP' ? 'fab fa-whatsapp' : 
                                                        item.via === 'EMAIL' || item.via === 'Email' ? 'fas fa-envelope' : 
                                                        item.via === 'SMS' ? 'fas fa-comment-alt' : 
                                                        item.via === 'RCS' ? 'fas fa-comment-dots' : 'fas fa-phone'
                                                    } style={{ 
                                                        fontSize: '0.8rem', 
                                                        color: (item.via === 'WhatsApp' || item.via === 'WHATSAPP') ? '#22c55e' : (item.via === 'SMS' || item.via === 'RCS') ? '#f59e0b' : '#0ea5e9' 
                                                    }}></i>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#475569' }}>{item.via}</span>
                                                </div>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.platform}</span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    color: (item.outcome === 'Sent' || item.outcome === 'Read') ? '#059669' : item.outcome === 'Failed' ? '#dc2626' : '#0284c7'
                                                }}>
                                                    <i className={
                                                        item.outcome === 'Read' ? 'fas fa-check-double' : 
                                                        item.outcome === 'Sent' ? 'fas fa-check' : 
                                                        item.outcome === 'Failed' ? 'fas fa-warning' : 'fas fa-clock'
                                                    } style={{ fontSize: '0.65rem' }}></i>
                                                    {item.outcome || 'Active'}
                                                </div>
                                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.duration || 'Session'}</span>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{item.date.split(',')[0]}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.date.split(',')[1] || 'Today'}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {paginatedData.length === 0 && (
                                        <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '20px', margin: '20px' }}>
                                            <i className="fas fa-search" style={{ fontSize: '3rem', marginBottom: '20px', opacity: 0.1 }}></i>
                                            <h3>No Activity Mapped</h3>
                                            <p>Select another channel or adjust filters.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 💬 Live Thread Sidebar (PINS TO RIGHT) */}
                    {selectedConversation && (
                        <div style={{ 
                            width: '420px', 
                            minWidth: '420px',
                            background: '#fff', 
                            borderLeft: '1px solid #e2e8f0', 
                            display: 'flex', 
                            flexDirection: 'column',
                            boxShadow: '-10px 0 30px rgba(0,0,0,0.03)',
                            zIndex: 10,
                            height: '100%'
                        }}>
                             <ConversationThread 
                                messages={selectedConversation.thread || []} 
                                participantName={selectedConversation.participant}
                                onClose={() => setSelectedConversation(null)}
                                onSendMessage={handleSendMessage}
                             />
                        </div>
                    )}
                </div>

                {/* Modals & Overlays */}
                <CommunicationFilterPanel isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} filters={filters} onFilterChange={(k, v) => setFilters(prev => ({...prev, [k]: v}))} onReset={() => setFilters({})} />
                <ComposeEmailModal isOpen={isComposeModalOpen} onClose={() => setIsComposeModalOpen(false)} onSent={() => fetchInbox()} />
                <ViewEmailModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} email={selectedEmail} onReply={handleReply} onConvertToLead={handleConvertToLead} onAddActivity={handleAddActivity} isActionLoading={isActionLoading} />
            </div>
        </section>
    );

}

export default CommunicationPage;
