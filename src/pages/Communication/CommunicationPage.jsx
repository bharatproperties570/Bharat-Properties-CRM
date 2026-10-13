/**
 * CommunicationPage.jsx — Enterprise Omnichannel Hub v4.0
 * 100% backend-live · No mock data · Light + Dark theme · Real message dispatch
 */
import React, { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { activitiesAPI, emailAPI, conversationAPI, api, googleSettingsAPI, BASE_BACKEND_URL, API_BASE_URL, getAuthToken, safeStorage, socialAPI } from '../../utils/api';
import whatsappService from '../../services/whatsappService';
import ComposeEmailModal from './components/ComposeEmailModal';
import ViewEmailModal from './components/ViewEmailModal';
import CommunicationFilterPanel from './components/CommunicationFilterPanel';
import { applyCommunicationFilters } from '../../utils/communicationFilterLogic';
import { toast } from 'react-hot-toast';
import { formatLeadBudget } from '../../utils/numberToWords';

const resolveMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    return url.startsWith('http') ? url : `${BASE_BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const getDocBadge = (filename = '', mime = '') => {
    const ext = (filename || '').split('.').pop().toUpperCase();
    const m = (mime || '').toLowerCase();
    if (ext === 'PDF' || m.includes('pdf')) return { label: 'PDF', bg: '#ef4444', icon: 'fa-file-pdf' };
    if (['DOC', 'DOCX'].includes(ext) || m.includes('word')) return { label: 'DOC', bg: '#2563eb', icon: 'fa-file-word' };
    if (['XLS', 'XLSX', 'CSV'].includes(ext) || m.includes('sheet') || m.includes('excel')) return { label: 'XLS', bg: '#16a34a', icon: 'fa-file-excel' };
    if (['PPT', 'PPTX'].includes(ext) || m.includes('presentation')) return { label: 'PPT', bg: '#ea580c', icon: 'fa-file-powerpoint' };
    return { label: ext && ext.length <= 4 ? ext : 'DOC', bg: '#00a884', icon: 'fa-file-alt' };
};

/* ── Theme tokens ─────────────────────────────────────────────────────────── */
const DARK = {
    bg: '#07162B', bg2: 'rgba(255,255,255,0.03)', surface: 'rgba(255,255,255,0.04)', surfaceHov: 'rgba(255,255,255,0.07)',
    border: 'rgba(201, 146, 26, 0.15)', borderStrong: 'rgba(201, 146, 26, 0.28)',
    text: '#EEE8D8', text2: '#A89E88', text3: '#6A6255',
    accent: '#C9921A', accentSoft: 'rgba(201, 146, 26, 0.1)',
    bubble_in: 'rgba(255,255,255,0.05)', bubble_out: 'linear-gradient(135deg, #C9921A, #E0A830)',
    input: 'rgba(255,255,255,0.03)', inputBorder: 'rgba(201, 146, 26, 0.28)',
    badge: 'rgba(201, 146, 26, 0.08)', badgeText: '#FAD87A',
};
const LIGHT = {
    bg: '#f0f4ff', bg2: '#e8edf8', surface: '#ffffff', surfaceHov: '#f8fafc',
    border: '#e2e8f0', borderStrong: '#cbd5e1',
    text: '#0f172a', text2: '#475569', text3: '#94a3b8',
    accent: '#4f46e5', accentSoft: 'rgba(79,70,229,0.08)',
    bubble_in: '#f1f5f9', bubble_out: 'linear-gradient(135deg,#4f46e5,#6366f1)',
    input: '#f8fafc', inputBorder: '#e2e8f0',
    badge: '#f1f5f9', badgeText: '#475569',
};

/* ── Channel config ───────────────────────────────────────────────────────── */
const CHANNELS = [
    { id: 'all',      label: 'All',       icon: '🌐', color: '#6366f1' },
    { id: 'AI',       label: 'AI Bot',    icon: '🤖', color: '#8b5cf6' },
    { id: 'SMS',      label: 'SMS',       icon: '📱', color: '#f59e0b' },
    { id: 'Email',    label: 'Email',     icon: '📧', color: '#0ea5e9' },
    { id: 'Voice',    label: 'Voice',     icon: '📞', color: '#ec4899' },
    { id: 'WhatsApp', label: 'WhatsApp',  icon: '💬', color: '#22c55e' },
    { id: 'Web Chat', label: 'Web Chat',  icon: '🌐', color: '#06b6d4' },
];
const OUTCOME_COLOR = { Read:'#059669', Sent:'#0284c7', Delivered:'#0284c7', Failed:'#ef4444', Received:'#059669' };

const PARTICIPANT_COLORS = [
    '#1fa855', '#0284c7', '#8b5cf6', '#f59e0b', '#ec4899', 
    '#10b981', '#06b6d4', '#6366f1', '#d97706', '#ef4444'
];
function getParticipantColor(name = '') {
    if (!name) return '#1fa855';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % PARTICIPANT_COLORS.length;
    return PARTICIPANT_COLORS[idx];
}

function formatMessageDate(d) {
    if (!d) return 'Today';
    const date = new Date(d);
    if (isNaN(date.getTime())) return 'Today';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function timeAgo(d) {
    if (!d) return '—';
    const ms = Date.now() - new Date(d).getTime();
    if (isNaN(ms)) return '—';
    if (ms < 60000)    return 'Just now';
    if (ms < 3600000)  return `${Math.floor(ms/60000)}m ago`;
    if (ms < 86400000) return `${Math.floor(ms/3600000)}h ago`;
    return new Date(d).toLocaleDateString('en-IN', {day:'numeric', month:'short'});
}
function initials(n='') { return n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?'; }

/* ══════════════════════════════════════════════════════════════════════════ */
export default function CommunicationPage() {
    const { isDark } = useTheme();
    const T = isDark ? DARK : LIGHT;

    const [channel,     setChannel]     = useState('all');
    const [subTab,      setSubTab]      = useState('all');   // all | matched | unmatched
    const [activities,  setActivities]  = useState([]);
    const [liveEmails,  setLiveEmails]  = useState([]);
    const [aiConvos,    setAiConvos]    = useState([]);
    const [selectedId,  setSelectedId]  = useState(null);   // Stable ID for selection
    const [selectedAIId, setSelectedAIId] = useState(null); // Stable AI Selection ID
    const [searchQ,     setSearchQ]     = useState('');
    const [filters,     setFilters]     = useState({});
    const [backendKpis, setBackendKpis] = useState({ total: 0, matched: 0, failed: 0 });
    const [isFilterOpen,setFilterOpen]  = useState(false);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [composing,   setComposing]   = useState(false);
    const [viewEmail,   setViewEmail]   = useState(false);
    const [emailTarget, setEmailTarget] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [nextPageToken, setNextPageToken] = useState(null);
    const [emailError,    setEmailError]    = useState(null); // 'oauth' | 'network' | null
    const [previewMedia,  setPreviewMedia]  = useState(null); // 🚀 Media Preview State
    const [waGroups,      setWaGroups]      = useState([]);
    const [baileysAccId,  setBaileysAccId]  = useState(null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [liveEvent,     setLiveEvent]     = useState(null); // ⚡ Real-Time SSE Hub event
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    // Sorting State
    const [sortConfig, setSortConfig] = useState({ label: 'Newest Active', by: 'date', order: -1, icon: 'fa-history' });
    const [isSortOpen, setIsSortOpen] = useState(false);

    /* ── Fetch messaging activities ─── */
    const fetchActivities = useCallback(async (silent = false) => {
        if (!silent) setLoading(true); else setRefreshing(true);
        try {
            const params = {
                page: currentPage,
                limit: recordsPerPage,
                sortBy: sortConfig.by,
                sortOrder: sortConfig.order,
                search: searchQ,
                channel: channel,
                subTab: subTab,
                ...filters
            };
            const res = await activitiesAPI.getMessagingStream(params);
            if (res?.success) {
                console.log('[CommHub] Messaging Stream:', res.data); // Debug Log
                setActivities(res.data.map(act => {
                    // 1. Participant Identity
                    let name = act.participant || act.participantName || '';
                    let phone = act.phone || act.phoneNumber || act.participantMobile || '';
                    const isGroupItem = Boolean(act.isGroup || act.groupJid || (phone && phone.includes('@g.us')) || (name && name.includes('@g.us')));

                    if (isGroupItem) {
                        const grpName = groupNameMap.get(phone) || groupNameMap.get(act.groupJid) || act.groupName || act.details?.groupName;
                        if (grpName) name = grpName;
                        else if (!name || name.includes('@g.us')) name = 'WhatsApp Group';
                    } else if (!name) {
                        if (act.participants?.length) { 
                            name = act.participants[0].name; 
                            phone = act.participants[0].mobile || phone; 
                        }
                        else if (act.details?.senderName) { name = act.details.senderName; }
                        else if (act.details?.from) { name = phone = act.details.from; }
                    }
                    
                    if (!name) {
                        const p = act.relatedTo?.find(r => ['Contact','Lead'].includes(r.model));
                        if (p) name = p.name;
                    }
                    
                    if (!name) name = phone || 'Unknown';

                    // 2. Channel Identification (Via)
                    let via = act.via || 'SMS';
                    const t  = (act.type||'').toLowerCase();
                    const pl = (act.platform||act.details?.platform||'').toLowerCase();

                    if (isGroupItem) {
                        via = 'WhatsApp';
                    } else if (!act.via) {
                        if (t==='call'||t==='calls'||t==='voice')            via = 'Voice';
                        else if (pl==='whatsapp'||t==='whatsapp')             via = 'WhatsApp';
                        else if (pl==='rcs')                                  via = 'RCS';
                        else if (t==='email' || pl==='email')                 via = 'Email';
                        else if (t==='marketing') {
                            if (act.details?.results?.some(r => r.channel === 'whatsapp') || act.details?.whatsappIntegrationId) via = 'WhatsApp';
                            else if (act.details?.results?.some(r => r.channel === 'email')) via = 'Email';
                            else if (act.details?.results?.some(r => r.channel === 'sms')) via = 'SMS';
                        }
                    }

                    // 3. Content & Metadata
                    const snip = act.snippet || act.details?.text || act.details?.message || act.description || act.subject || '';
                    const proj = act.relatedTo?.find(r=>r.model==='Project'||r.model==='Deal');
                    
                    return {
                        id: act._id, 
                        participant: name, 
                        via, 
                        type: isGroupItem ? 'Group' : (act.type || 'Messaging'),
                        subject: (proj ? `[${proj.name}] ` : '') + (snip.length > 80 ? snip.slice(0, 80) + '…' : snip),
                        snippet: snip,
                        outcome: act.outcome || act.details?.status || act.status || 'Delivered',
                        duration: act.duration || act.details?.duration || '--',
                        date: act.date || act.timestamp || act.createdAt || act.updatedAt,
                        platform: isGroupItem ? 'WhatsApp Web' : (act.platform || act.details?.platform || 'Direct'),
                        isMatched: isGroupItem ? true : (act.isMatched !== undefined ? act.isMatched : !!(act.entityId || act.relatedTo?.length)),
                        phone, 
                        entityId: act.entityId, 
                        entityType: isGroupItem ? 'WhatsAppGroup' : act.entityType,
                        thread: act.thread || act.details?.conversationThread || [],
                        phoneNumber: phone || act.phone || act.phoneNumber,
                        isGroup: isGroupItem,
                        groupJid: isGroupItem ? (act.groupJid || phone) : null,
                        groupName: isGroupItem ? name : null
                    };
                }));
                if (res.pagination) {
                    setTotalPages(res.pagination.totalPages || 1);
                    setTotalRecords(res.pagination.totalCount || 0);
                }
                if (res.kpis) {
                    setBackendKpis(res.kpis);
                }
            }
        } catch(e){ console.error(e); } finally { setLoading(false); setRefreshing(false); }
    }, [currentPage, recordsPerPage, sortConfig, searchQ, filters, channel, subTab]);

    /* ── Fetch emails ─── */
    const mapEmails = useCallback(emails => emails.map(e => ({
        id: e.id||e.uid, participant: e.fromName||e.from||'Unknown',
        via: 'Email', type: 'Email',
        subject: e.subject||'(No subject)', snippet: e.snippet||'',
        outcome: 'Received', duration: '--', date: e.date, platform: 'Gmail',
        fromEmail: e.from, fromName: e.fromName, labels: e.labels||[],
        associated: e.associated, isMatched: !!e.associated, thread: [],
    })), []);

    const fetchEmails = useCallback(async (append=false, token=null) => {
        setEmailError(null);
        try {
            const res = await emailAPI.getInbox({ pageToken: token, limit: 25 });
            if (res?.success) {
                const raw = Array.isArray(res.data) ? res.data : (res.data?.emails||[]);
                const mapped = mapEmails(raw);
                if (append) setLiveEmails(p=>[...p,...mapped]); else setLiveEmails(mapped);
                setNextPageToken(res.data?.nextPageToken||null);
            } else {
                if (res?.errorCode === 'OAUTH_EXPIRED') { setEmailError('oauth'); return; }
                const msg = (res?.message||'').toLowerCase();
                if (msg.includes('invalid_grant')||msg.includes('oauth')||msg.includes('token')||msg.includes('401')) {
                    setEmailError('oauth');
                } else {
                    setEmailError('network');
                }
            }
        } catch(e){
            console.error(e);
            const errorData = e.response?.data;
            if (errorData?.errorCode === 'OAUTH_EXPIRED') {
                setEmailError('oauth');
                return;
            }

            const msg = (e?.message||'').toLowerCase();
            const status = e.response?.status;
            if (msg.includes('invalid_grant')||msg.includes('oauth')||msg.includes('401')||msg.includes('400')||status === 401||status === 400) {
                setEmailError('oauth');
            } else {
                setEmailError('network');
            }
        }
    }, [mapEmails]);

    /* ── Fetch AI Conversations ─── */
    const fetchAIConvos = useCallback(async () => {
        try {
            const res = await conversationAPI.getActive();
            if (res?.success && res.data) {
                setAiConvos(res.data.map(conv => {
                    let name = 'Unmatched';
                    let phone = conv.phoneNumber||'';
                    let lead = null;
                    if (conv.lead) {
                        name = `${conv.lead.firstName||''} ${conv.lead.lastName||''}`.trim()||'Lead';
                        phone = conv.lead.mobile||phone;
                        lead = conv.lead;
                    } else if (conv.contact) {
                        name = `${conv.contact.firstName||''} ${conv.contact.lastName||''}`.trim()||'Contact';
                        phone = conv.contact.phones?.[0]?.number||phone;
                    }
                    return {
                        id: conv._id, name, phone,
                        channel: conv.channel==='whatsapp'?'WhatsApp':(conv.channel||'WhatsApp').toUpperCase(),
                        isMatched: !!(conv.lead||conv.contact),
                        status: conv.status,
                        isHandedOff: conv.status==='handed_off',
                        unreadCount: conv.metadata?.unreadCount || 0,
                        lead,
                        whatsappIntegrationId: conv.whatsappIntegrationId || null,
                        businessPhoneNumberId: conv.businessPhoneNumberId || null,
                        businessPhoneNumber: conv.businessPhoneNumber || null,
                        messages: (conv.messages||[]).map(m => ({
                            sender: m.role==='user'?'customer':(m.role==='assistant'?'ai':'agent'),
                            text: m.content, time: m.timestamp,
                            metadata: m.metadata
                        })),
                        updatedAt: conv.updatedAt,
                    };
                }));
            }
        } catch(e){ console.error(e); }
    }, []);

    const handleSelectAI = async (id) => {
        setSelectedAIId(id);
        const conv = aiConvos.find(c => c.id === id);
        if (conv && conv.unreadCount > 0) {
            setAiConvos(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
            try {
                await api.patch(`conversations/${id}/read`);
            } catch (err) {
                console.error("Failed to mark as read", err);
            }
        }
    };


    const fetchWAGroups = useCallback(async (isUserAction = false) => {
        setLoadingGroups(true);
        try {
            const accRes = await whatsappService.getAccounts();
            const accounts = accRes.data || [];
            const baileysAcc = accounts.find(a => a.provider === 'BAILEYS' && (a.status === 'ACTIVE' || a.onboardingStatus === 'CONNECTED'));
            if (!baileysAcc) {
                if (isUserAction) {
                    toast.error("No active WhatsApp Web connected. Please link WhatsApp Web in Profile page first.", { id: 'wa-group-err' });
                }
                setLoadingGroups(false);
                return;
            }
            const bId = baileysAcc.id || baileysAcc._id;
            setBaileysAccId(bId);
            const res = await socialAPI.getBaileysGroups(bId);
            if (res && res.success) {
                setWaGroups(res.data || []);
            } else if (isUserAction) {
                toast.error(res?.error || "Failed to load WhatsApp Groups");
            }
        } catch (err) {
            console.error("Failed to load WA groups", err);
            if (isUserAction) toast.error("Error fetching WhatsApp Groups");
        } finally {
            setLoadingGroups(false);
        }
    }, []);

    // 👥 Fast O(1) group name lookup across all tabs (All, Matched, Groups, etc.)
    const groupNameMap = useMemo(() => {
        const map = new Map();
        (waGroups || []).forEach(g => {
            if (g.id && g.subject) {
                map.set(g.id, g.subject);
                map.set(g.id.replace('@g.us', ''), g.subject);
            }
        });
        return map;
    }, [waGroups]);

    // Preload groups on mount so group names render properly in the default 'All' stream view
    useEffect(() => {
        fetchWAGroups(false);
    }, [fetchWAGroups]);

    /* ── Init & refresh ─── */
    useEffect(() => { 
        if (channel !== 'Email' && channel !== 'AI' && subTab !== 'groups') {
            fetchActivities(); 
        }
        if (channel === 'AI') fetchAIConvos();
        if (subTab === 'groups' || channel === 'WhatsApp_Web') fetchWAGroups(true);
    }, [fetchActivities, fetchAIConvos, fetchWAGroups, channel, subTab, currentPage, recordsPerPage, sortConfig]);
    useEffect(() => { if (channel==='Email' && !liveEmails.length && !emailError) fetchEmails(); }, [channel, liveEmails.length, fetchEmails, emailError]);

    // Reset subTab to 'all' if user moves away from WhatsApp_Web while in groups view
    useEffect(() => {
        if (channel !== 'WhatsApp_Web' && subTab === 'groups') {
            setSubTab('all');
            setCurrentPage(1);
        }
    }, [channel, subTab]);

    // Enterprise Silent Poll: 10s auto-refresh for incoming activities and thread updates
    useEffect(() => {
        const interval = setInterval(() => {
            if (channel === 'AI') {
                fetchAIConvos();
            } else if (subTab === 'groups') {
                // Keep WA groups fresh silently
            } else if (channel !== 'Email') {
                fetchActivities(true);
            }
        }, 20000);
        return () => clearInterval(interval);
    }, [channel, subTab, fetchActivities, fetchAIConvos]);

    // ⚡ Enterprise Server-Sent Events (SSE) Stream — Zero-Latency Real-Time Delivery
    useEffect(() => {
        const token = getAuthToken() || safeStorage.getItem('authToken') || safeStorage.getItem('token') || safeStorage.getItem('jwt');
        const sseUrl = `${API_BASE_URL}/activities/stream-live?token=${encodeURIComponent(token || '')}`;
        
        let es = null;
        try {
            es = new EventSource(sseUrl);

            es.addEventListener('CONNECTED', (e) => {
                console.log('[CommHub SSE] ⚡ Live event stream connected');
            });

            es.addEventListener('NEW_MESSAGE', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    console.log('[CommHub SSE] ⚡ Instant NEW_MESSAGE:', data);
                    setLiveEvent({ type: 'NEW_MESSAGE', data, timestamp: Date.now() });

                    // Reactive stream list update: Move/add contact to top of list instantly
                    if (data.phone) {
                        const cleanPhone = String(data.phone).replace(/\D/g, '');
                        const clean10 = cleanPhone.slice(-10);

                        const isGroupMsg = Boolean(data.streamItem?.isGroup || data.message?.metadata?.isGroup || (data.phone && String(data.phone).includes('@g.us')));

                        setActivities(prev => {
                            const existingIndex = prev.findIndex(item => {
                                if (isGroupMsg) {
                                    return item.phone === data.phone || item.id === data.phone || item.groupJid === data.phone;
                                }
                                if (!item.phone) return false;
                                const itemClean = String(item.phone).replace(/\D/g, '');
                                return itemClean === cleanPhone || (clean10 && itemClean.endsWith(clean10));
                            });

                            const nowIso = data.message?.timestamp || data.message?.time || new Date().toISOString();
                            const newSnippet = data.message?.text || data.streamItem?.snippet || '';

                            if (existingIndex !== -1) {
                                const existingItem = prev[existingIndex];
                                const updatedItem = {
                                    ...existingItem,
                                    snippet: (data.message?.fromMe ? 'You: ' : (isGroupMsg ? `${data.message?.senderName || 'Member'}: ` : 'Customer: ')) + newSnippet,
                                    date: nowIso,
                                    timestamp: nowIso,
                                    outcome: data.message?.fromMe ? 'Delivered' : 'Received'
                                };
                                return [updatedItem, ...prev.filter((_, idx) => idx !== existingIndex)];
                            } else {
                                const stream = data.streamItem || {};
                                const groupName = isGroupMsg ? (groupNameMap.get(data.phone) || stream.groupName || stream.participant || 'WhatsApp Group') : null;
                                const newItem = {
                                    id: stream._id || data.phone,
                                    participant: isGroupMsg ? groupName : (stream.participant || data.message?.senderName || data.phone),
                                    via: isGroupMsg ? 'WhatsApp' : (stream.via || data.channel || 'WhatsApp'),
                                    type: isGroupMsg ? 'Group' : (stream.type || 'WhatsApp'),
                                    subject: stream.subject || newSnippet || 'Incoming Message',
                                    snippet: (data.message?.fromMe ? 'You: ' : (isGroupMsg ? `${data.message?.senderName || 'Member'}: ` : 'Customer: ')) + newSnippet,
                                    outcome: data.message?.fromMe ? 'Delivered' : 'Received',
                                    duration: '--',
                                    date: nowIso,
                                    timestamp: nowIso,
                                    platform: isGroupMsg ? 'WhatsApp Web' : (stream.platform || data.platform || 'Direct'),
                                    isMatched: isGroupMsg ? true : false,
                                    phone: data.phone,
                                    phoneNumber: data.phone,
                                    isGroup: isGroupMsg,
                                    groupJid: isGroupMsg ? data.phone : null,
                                    groupName: isGroupMsg ? groupName : null,
                                    thread: []
                                };
                                return [newItem, ...prev];
                            }
                        });
                    }
                } catch (err) {
                    console.error('[CommHub SSE] Failed to parse NEW_MESSAGE:', err);
                }
            });

            es.addEventListener('STATUS_UPDATE', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    console.log('[CommHub SSE] ⚡ Status update:', data);
                    setLiveEvent({ type: 'STATUS_UPDATE', data, timestamp: Date.now() });

                    if (data.phone) {
                        const clean10 = String(data.phone).replace(/\D/g, '').slice(-10);
                        setActivities(prev => prev.map(item => {
                            if (clean10 && item.phone && item.phone.includes(clean10)) {
                                return { ...item, outcome: data.status === 'read' ? 'Read' : 'Delivered' };
                            }
                            return item;
                        }));
                    }
                } catch (err) {
                    console.error('[CommHub SSE] Failed to parse STATUS_UPDATE:', err);
                }
            });

            es.onerror = (err) => {
                console.warn('[CommHub SSE] Connection status change:', es?.readyState);
            };
        } catch (e) {
            console.error('[CommHub SSE] Setup error:', e);
        }

        return () => {
            if (es) {
                es.close();
                console.log('[CommHub SSE] Stream disconnected');
            }
        };
    }, []);

    const handleRefresh = () => {
        if (channel==='Email') fetchEmails();
        else if (channel==='AI') fetchAIConvos();
        else if (subTab==='groups' || channel==='WhatsApp_Web') fetchWAGroups();
        else fetchActivities(true);
    };

    /* ── Filtered list ─── */
    const displayItems = useMemo(() => {
        if (channel === 'AI') return [];
        if (subTab === 'groups' || channel === 'WAGroups') {
            return waGroups.map(g => ({
                id: g.id,
                participant: g.subject || 'WhatsApp Group',
                via: 'WhatsApp',
                type: 'Group',
                subject: `👥 ${g.participantsCount || 0} participants`,
                snippet: g.desc || `Created: ${g.creation ? new Date(g.creation * 1000).toLocaleDateString() : 'Active Group'}`,
                outcome: 'Active',
                duration: '--',
                date: g.creation ? new Date(g.creation * 1000).toISOString() : new Date().toISOString(),
                platform: 'WhatsApp Web',
                isMatched: true,
                phone: g.id,
                phoneNumber: g.id,
                isGroup: true,
                groupJid: g.id,
                whatsappIntegrationId: baileysAccId,
                participantsCount: g.participantsCount
            }));
        }
        if (channel === 'Email') {
            let base = liveEmails;
            if (subTab === 'matched') base = base.filter(i => i.isMatched);
            else if (subTab === 'unmatched') base = base.filter(i => !i.isMatched);
            return base;
        }
        let base = activities.map(item => {
            const isGroup = item.isGroup || (item.phone && item.phone.includes('@g.us')) || (item.phoneNumber && item.phoneNumber.includes('@g.us'));
            if (isGroup) {
                const groupName = groupNameMap.get(item.phone) || groupNameMap.get(item.phoneNumber) || item.groupName || (item.participant && !item.participant.includes('@g.us') ? item.participant : null) || 'WhatsApp Group';
                return {
                    ...item,
                    participant: groupName,
                    via: 'WhatsApp',
                    platform: 'WhatsApp Web',
                    isGroup: true,
                    isMatched: true
                };
            }
            return item;
        });
        if (channel === 'Voice') {
            base = base.filter(i => i.via === 'Voice' || ['Call', 'call', 'Voice', 'voice'].includes(i.type));
        } else if (channel === 'SMS') {
            base = base.filter(i => i.via === 'SMS');
        } else if (channel === 'WhatsApp_API') {
            base = base.filter(i => i.via === 'WhatsApp' && i.platform !== 'WhatsApp Web' && !i.isGroup && !(i.phone && i.phone.includes('@g.us')) && !(i.phoneNumber && i.phoneNumber.includes('@g.us')));
        } else if (channel === 'WhatsApp_Web') {
            base = base.filter(i => i.via === 'WhatsApp' && (i.platform === 'WhatsApp Web' || i.isGroup || (i.phone && i.phone.includes('@g.us')) || (i.phoneNumber && i.phoneNumber.includes('@g.us'))));
        }

        if (subTab === 'matched') base = base.filter(i => i.isMatched);
        else if (subTab === 'unmatched') base = base.filter(i => !i.isMatched);
        return base;
    }, [channel, activities, liveEmails, waGroups, groupNameMap, subTab, baileysAccId]);

    const allItems = displayItems; // For KPI counts in sub-tabs

    const selectedItem = useMemo(() => {
        if (!selectedId) return null;
        return displayItems.find(i => i.id === selectedId || i.phone === selectedId);
    }, [displayItems, selectedId]);

    const currentAI = useMemo(() => {
        if (!selectedAIId) return null;
        return aiConvos.find(c => c.id === selectedAIId);
    }, [aiConvos, selectedAIId]);

    /* ── KPIs ─── */
    const kpis = useMemo(() => {
        // AI Convos are fetched separately and not yet integrated into global backend KPIs
        return {
            total:   (backendKpis.total || 0) + aiConvos.length,
            matched: (backendKpis.matched || 0) + aiConvos.filter(c=>c.isMatched).length,
            ai:      aiConvos.length,
            failed:  (backendKpis.failed || 0),
        };
    }, [backendKpis, aiConvos]);

    /* ── Actions ─── */
    const handleSendMessage = async (incomingPayload) => {
        try {
            let payload = incomingPayload;

            const res = await activitiesAPI.sendReply(payload);
            if (res?.success) {
                return res;
            } else throw new Error(res?.error || 'Failed');
        } catch(e) { 
            const errorMsg = e.response?.data?.error || e.message || 'Send failed';
            toast.error(errorMsg); 
        }
    };

    const handleAITakeover = async (convId, currentlyHandedOff) => {
        try {
            const newStatus = currentlyHandedOff ? 'active' : 'handed_off';
            await conversationAPI.updateStatus(convId, newStatus);
            setAiConvos(p => p.map(c => c.id===convId ? {...c, isHandedOff: !currentlyHandedOff, status: newStatus} : c));
            toast.success(currentlyHandedOff ? '🤖 AI Resumed' : '👨‍💼 Human takeover active');
        } catch(e) { toast.error('Status update failed'); }
    };

    const handleConvertToLead = async (uid) => {
        setActionLoading(uid);
        try {
            const res = await emailAPI.convertToLead(uid);
            if (res?.success) { toast.success('Lead created!'); fetchEmails(); }
            else toast.error(res?.message || 'Failed');
        } catch(e) { toast.error('Error'); } finally { setActionLoading(null); }
    };

    const handleChannelChange = (newChannel) => {
        setChannel(newChannel);
        setCurrentPage(1);
        setSelectedId(null);
        setSelectedAIId(null);
        if (newChannel !== 'WhatsApp_Web' && subTab === 'groups') {
            setSubTab('all');
        }
    };

    /* ══════════════════════════ RENDER ══════════════════════════════════════ */
    

    return (
        <div style={{ background: T.bg, height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Inter', sans-serif", color: T.text, transition:'background 0.3s, color 0.3s' }}>

            {/* ── HEADER ── */}
            <div style={{ background: T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 1.5rem', flexShrink:0, boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}>

                {/* KPI Row */}
                <div style={{ display:'flex', gap:'12px', padding:'14px 0 10px', borderBottom:`1px solid ${T.border}` }}>
                    {[
                        { icon:'🌐', label:'Total Streams',  val: kpis.total,   color:'#6366f1' },
                        { icon:'🔗', label:'CRM Matched',    val: kpis.matched, color:'#22c55e' },
                        { icon:'🤖', label:'AI Threads',     val: kpis.ai,      color:'#8b5cf6' },
                        { icon:'⚠️', label:'Failed Sends',   val: kpis.failed,  color:'#ef4444' },
                    ].map(k => (
                        <div key={k.label} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 16px', borderRadius:'10px', background: T.badge, border:`1px solid ${T.border}`, flex:1 }}>
                            <span style={{ fontSize:'1.5rem' }}>{k.icon}</span>
                            <div>
                                <div style={{ fontSize:'1.4rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                                <div style={{ fontSize:'0.65rem', fontWeight:700, color: T.text2, textTransform:'uppercase', letterSpacing:'0.04em' }}>{k.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Nav row */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 0' }}>

                    {/* Brand */}
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', marginRight:'20px' }}>
                        <div style={{ width:36, height:36, borderRadius:'9px', background:'linear-gradient(135deg,#6366f1,#4f46e5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem' }}>🛰️</div>
                        <div>
                            <div style={{ fontWeight:800, fontSize:'1rem', letterSpacing:'-0.01em', color: T.text }}>Communication Hub</div>
                            <div style={{ fontSize:'0.65rem', color: T.text2, fontWeight:600 }}>Omnichannel · Real-time · AI-Powered</div>
                        </div>
                    </div>

                    {/* All */}
                    <button onClick={() => handleChannelChange('all')} style={{
                        padding:'6px 14px', borderRadius:'20px', border:'none', cursor:'pointer',
                        background: channel==='all' ? '#6366f1' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                        color: channel==='all' ? '#fff' : T.text2,
                        fontSize:'0.75rem', fontWeight:700, transition:'all 0.18s',
                        display:'flex', alignItems:'center', gap:'5px',
                        boxShadow: channel==='all' ? '0 4px 12px rgba(99,102,241,0.35)' : 'none',
                    }}>
                        <span style={{fontSize:'0.85rem'}}>🌐</span>All
                    </button>

                    {/* AI Bot */}
                    <button onClick={() => handleChannelChange('AI')} style={{
                        padding:'6px 14px', borderRadius:'20px', border:'none', cursor:'pointer',
                        background: channel==='AI' ? '#8b5cf6' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                        color: channel==='AI' ? '#fff' : T.text2,
                        fontSize:'0.75rem', fontWeight:700, transition:'all 0.18s',
                        display:'flex', alignItems:'center', gap:'5px',
                        boxShadow: channel==='AI' ? '0 4px 12px rgba(139,92,246,0.35)' : 'none',
                    }}>
                        <span style={{fontSize:'0.85rem'}}>🤖</span>AI Bot
                    </button>

                    {/* 🌟 Unified WhatsApp Compound Button (Dual Left/Right Select: API | Web) */}
                    {(() => {
                        const isWaActive = channel === 'WhatsApp_API' || channel === 'WhatsApp_Web' || channel === 'WhatsApp';
                        return (
                            <div style={{
                                display:'inline-flex',
                                alignItems:'center',
                                borderRadius:'20px',
                                background: isWaActive 
                                    ? (isDark ? 'rgba(34, 197, 94, 0.16)' : '#eafaf1') 
                                    : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                                border: isWaActive ? '1.5px solid #22c55e' : `1px solid ${T.border}`,
                                boxShadow: isWaActive ? '0 4px 14px rgba(34, 197, 94, 0.28)' : 'none',
                                padding:'2px',
                                gap:'2px',
                                transition:'all 0.2s ease',
                            }}>
                                {/* Left Segment: WhatsApp API */}
                                <button
                                    onClick={() => handleChannelChange('WhatsApp_API')}
                                    style={{
                                        padding:'5px 12px',
                                        borderRadius:'16px',
                                        border:'none',
                                        cursor:'pointer',
                                        background: channel === 'WhatsApp_API' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent',
                                        color: channel === 'WhatsApp_API' ? '#fff' : (isWaActive ? (isDark ? '#4ade80' : '#15803d') : T.text2),
                                        fontSize:'0.74rem',
                                        fontWeight: 800,
                                        display:'flex',
                                        alignItems:'center',
                                        gap:'5px',
                                        transition:'all 0.18s',
                                        boxShadow: channel === 'WhatsApp_API' ? '0 2px 8px rgba(34, 197, 94, 0.4)' : 'none',
                                    }}
                                    title="Click Left: WhatsApp Meta Cloud API"
                                >
                                    <span style={{ fontSize:'0.82rem' }}>💬</span>
                                    <span>WhatsApp API</span>
                                </button>

                                {/* Center Divider */}
                                <div style={{
                                    width:'1px',
                                    height:'14px',
                                    background: isWaActive ? 'rgba(34, 197, 94, 0.35)' : (isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1'),
                                }} />

                                {/* Right Segment: WhatsApp Web */}
                                <button
                                    onClick={() => handleChannelChange('WhatsApp_Web')}
                                    style={{
                                        padding:'5px 12px',
                                        borderRadius:'16px',
                                        border:'none',
                                        cursor:'pointer',
                                        background: channel === 'WhatsApp_Web' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                                        color: channel === 'WhatsApp_Web' ? '#fff' : (isWaActive ? (isDark ? '#34d399' : '#047857') : T.text2),
                                        fontSize:'0.74rem',
                                        fontWeight: 800,
                                        display:'flex',
                                        alignItems:'center',
                                        gap:'5px',
                                        transition:'all 0.18s',
                                        boxShadow: channel === 'WhatsApp_Web' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
                                    }}
                                    title="Click Right: WhatsApp Web"
                                >
                                    <span style={{ fontSize:'0.82rem' }}>⚡</span>
                                    <span>Web</span>
                                </button>
                            </div>
                        );
                    })()}

                    {/* Other Channels: SMS, Email, Voice */}
                    {CHANNELS.filter(c => ['SMS', 'Email', 'Voice'].includes(c.id)).map(ch => (
                        <button key={ch.id} onClick={() => handleChannelChange(ch.id)} style={{
                            padding:'6px 14px', borderRadius:'20px', border:'none', cursor:'pointer',
                            background: channel===ch.id ? ch.color : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                            color: channel===ch.id ? '#fff' : T.text2,
                            fontSize:'0.75rem', fontWeight:700, transition:'all 0.18s',
                            display:'flex', alignItems:'center', gap:'5px',
                            boxShadow: channel===ch.id ? `0 4px 12px ${ch.color}50` : 'none',
                        }}>
                            <span style={{fontSize:'0.85rem'}}>{ch.icon}</span>{ch.label}
                        </button>
                    ))}

                    {/* Spacer */}
                    <div style={{flex:1}}/>

                    {/* Search */}
                    <div style={{position:'relative'}}>
                        <input type="text" placeholder="Search…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{
                            padding:'7px 12px 7px 32px', borderRadius:'9px',
                            border:`1px solid ${T.inputBorder}`, background: T.input, color: T.text,
                            fontSize:'0.8rem', outline:'none', width:'170px',
                        }}/>
                        <span style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:T.text3,fontSize:'0.8rem'}}>🔍</span>
                    </div>

                    {/* Refresh */}
                    <button onClick={handleRefresh} style={{ padding:'7px 12px', borderRadius:'9px', border:`1px solid ${T.border}`, background: T.badge, color: T.text2, cursor:'pointer', fontSize:'0.85rem' }}>
                        {refreshing ? '⏳' : '🔄'}
                    </button>

                    {/* Filters */}
                    <button onClick={() => setFilterOpen(true)} style={{
                        padding:'7px 14px', borderRadius:'9px', cursor:'pointer', fontSize:'0.78rem', fontWeight:700,
                        background: Object.keys(filters).length ? '#6366f1' : T.badge,
                        color: Object.keys(filters).length ? '#fff' : T.text2,
                        border:`1px solid ${Object.keys(filters).length ? '#6366f1' : T.border}`,
                        display:'flex', alignItems:'center', gap:'5px',
                    }}>
                        ⚙️ Filters {Object.keys(filters).length > 0 && <span style={{background:'#fff',color:'#6366f1',borderRadius:'20px',padding:'0 5px',fontSize:'0.6rem'}}>{Object.keys(filters).length}</span>}
                    </button>


                    {/* Theme toggle */}
                    

                    {/* Compose */}
                    <button onClick={() => setComposing(true)} style={{
                        padding:'7px 18px', borderRadius:'9px', background:'linear-gradient(135deg,#6366f1,#4f46e5)',
                        color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.8rem',
                        boxShadow:'0 4px 12px rgba(99,102,241,0.35)', display:'flex', alignItems:'center', gap:'6px',
                    }}>
                        ✉️ Compose
                    </button>
                </div>
            </div>

            {/* ── BODY ── */}
            <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

                {/* ── LEFT: List Panel ── */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

                    {/* Sub-tab bar (only for non-AI tabs) */}
                    {channel !== 'AI' && (
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background: T.surface, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                            {[
                                { id:'all',       label:`All (${totalRecords})` },
                                { id:'matched',   label:`✅ Matched` },
                                { id:'unmatched', label:`⚠️ Unmatched` },
                                ...(channel === 'WhatsApp_Web' ? [{ id:'groups', label:`👥 Groups ${waGroups.length > 0 ? `(${waGroups.length})` : ''}` }] : []),
                            ].map(st => (
                                <button key={st.id} onClick={() => {
                                    setSubTab(st.id);
                                    setCurrentPage(1);
                                    if (st.id === 'groups' && waGroups.length === 0) {
                                        fetchWAGroups();
                                    }
                                }} style={{
                                    padding:'5px 13px', borderRadius:'6px', border:'none', cursor:'pointer',
                                    background: subTab===st.id ? T.accentSoft : 'transparent',
                                    color: subTab===st.id ? T.accent : T.text2,
                                    fontSize:'0.74rem', fontWeight:700, transition:'all 0.15s',
                                    borderBottom: subTab===st.id ? `2px solid ${T.accent}` : '2px solid transparent',
                                }}>{st.label}</button>
                            ))}
                            <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'15px'}}>
                                <div style={{ fontSize:'0.75rem', color: T.text3, fontWeight:700 }}>Total: <strong style={{color: T.text}}>{totalRecords}</strong> Streams</div>
                                
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.72rem", color: T.text3 }}>
                                    <span>Show:</span>
                                    <select 
                                        value={recordsPerPage} 
                                        onChange={(e) => { setRecordsPerPage(Number(e.target.value)); setCurrentPage(1); }} 
                                        style={{ padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: "6px", background: T.surface, fontSize: "0.72rem", fontWeight: 700, color: T.text, outline: "none", cursor: "pointer" }}
                                    >
                                        {[25, 50, 100, 200, 500].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                        disabled={currentPage === 1} 
                                        style={{ padding: "3px 8px", border: `1px solid ${T.border}`, borderRadius: "6px", background: currentPage === 1 ? T.bg : T.surface, color: currentPage === 1 ? T.text3 : T.text, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                                    >
                                        <i className="fas fa-chevron-left"></i>
                                    </button>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 800, color: T.text, minWidth: "50px", textAlign: "center" }}>{currentPage} / {totalPages || 1}</span>
                                    <button 
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                        disabled={currentPage >= totalPages} 
                                        style={{ padding: "3px 8px", border: `1px solid ${T.border}`, borderRadius: "6px", background: currentPage >= totalPages ? T.bg : T.surface, color: currentPage >= totalPages ? T.text3 : T.text, cursor: currentPage >= totalPages ? "not-allowed" : "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                                    >
                                        <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>

                                {/* Standardized Sort Icon (Moved here) */}
                                <div style={{ position: 'relative' }}>
                                    <button 
                                        style={{ 
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                            width: '32px', height: '32px', borderRadius: '8px',
                                            border: `1px solid ${isSortOpen ? T.accent : T.border}`,
                                            background: isSortOpen ? T.accent : T.surface,
                                            color: isSortOpen ? '#fff' : T.text2,
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                        onClick={() => setIsSortOpen(!isSortOpen)}
                                        title={`Sort: ${sortConfig.label}`}
                                    >
                                        <i className="fas fa-sort-amount-down-alt"></i>
                                    </button>
                                    {isSortOpen && (
                                        <>
                                            <div 
                                                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                                                onClick={() => setIsSortOpen(false)} 
                                            />
                                            <ul className="shadow-lg border-0" style={{ 
                                                position: 'absolute', top: '100%', right: 0, zIndex: 999,
                                                backgroundColor: T.surface, borderRadius: '12px', padding: '10px', 
                                                minWidth: '220px', marginTop: '8px', listStyle: 'none',
                                                border: `1px solid ${T.border}`,
                                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                                            }}>
                                                <li><h6 style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: T.text3, padding: '10px 15px', margin: 0 }}>Communication Sort</h6></li>
                                                {[
                                                    { label: 'Newest Active', by: 'date', order: -1, icon: 'fa-history' },
                                                    { label: 'Oldest Active', by: 'date', order: 1, icon: 'fa-calendar-alt' },
                                                    { label: 'Name (A-Z)', by: 'participant', order: 1, icon: 'fa-sort-alpha-down' },
                                                    { label: 'Channel (By Type)', by: 'via', order: 1, icon: 'fa-layer-group' },
                                                ].map((opt) => (
                                                    <li key={opt.label}>
                                                        <button 
                                                            style={{ 
                                                                width: '100%', border: 'none', textAlign: 'left',
                                                                borderRadius: '8px', 
                                                                padding: '10px 15px', 
                                                                fontSize: '0.8rem',
                                                                fontWeight: sortConfig.label === opt.label ? 700 : 500,
                                                                color: sortConfig.label === opt.label ? '#fff' : T.text,
                                                                background: sortConfig.label === opt.label ? T.accent : 'transparent',
                                                                cursor: 'pointer',
                                                                marginBottom: '2px',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onClick={() => {
                                                                setSortConfig(opt);
                                                                setIsSortOpen(false);
                                                            }}
                                                        >
                                                            <i className={`fas ${opt.icon}`} style={{ width: '18px', opacity: sortConfig.label === opt.label ? 1 : 0.6, marginRight: '8px' }}></i>
                                                            {opt.label}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── AI Bot View ── */}
                    {channel === 'AI' ? (
                        <AIBotView T={T} isDark={isDark} convos={aiConvos} selected={currentAI} onSelect={handleSelectAI} onTakeover={handleAITakeover} onRefresh={fetchAIConvos} setPreviewMedia={setPreviewMedia} />
                    ) : (
                        /* ── Inbox List ── */
                        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', background: T.bg, display:'flex', flexDirection:'column', gap:'8px' }}>

                            {/* Email OAuth error card */}
                            {channel === 'Email' && emailError && (
                                <div style={{ margin:'40px auto', maxWidth:'420px', textAlign:'center', padding:'32px', borderRadius:'16px', background: T.surface, border:`1.5px solid ${emailError==='oauth' ? '#f59e0b40' : '#ef444440'}`, boxShadow:`0 8px 24px ${emailError==='oauth'?'#f59e0b':'#ef4444'}12` }}>
                                    <div style={{ fontSize:'2.8rem', marginBottom:'14px' }}>{emailError === 'oauth' ? '🔐' : '📡'}</div>
                                    <div style={{ fontWeight:800, fontSize:'1.05rem', color: T.text, marginBottom:'8px' }}>
                                        {emailError === 'oauth' ? 'Gmail Reconnect Required' : 'Email Connection Error'}
                                    </div>
                                    <div style={{ fontSize:'0.82rem', color: T.text2, lineHeight:1.5, marginBottom:'20px' }}>
                                        {emailError === 'oauth'
                                            ? 'Your Gmail OAuth token has expired. Reconnect your account from Settings to restore email access.'
                                            : 'Unable to reach email service. Check your internet connection and try again.'}
                                    </div>
                                    <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
                                        {emailError === 'oauth' && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await googleSettingsAPI.getAuthUrl(window.location.origin);
                                                        if (res?.success && res.url) window.location.href = res.url;
                                                    } catch(e) { toast.error('Could not get OAuth URL'); }
                                                }}
                                                style={{ padding:'9px 20px', borderRadius:'9px', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', border:'none', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', boxShadow:'0 4px 12px rgba(245,158,11,0.35)' }}
                                            >
                                                🔗 Reconnect Gmail
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setEmailError(null); setLiveEmails([]); fetchEmails(); }}
                                            style={{ padding:'9px 20px', borderRadius:'9px', background: T.badge, color: T.text2, border:`1px solid ${T.border}`, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}
                                        >
                                            🔄 Try Again
                                        </button>
                                        <button
                                            onClick={() => window.open('/settings?tab=integrations','_blank')}
                                            style={{ padding:'9px 20px', borderRadius:'9px', background: T.badge, color: T.accent, border:`1px solid ${T.border}`, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}
                                        >
                                            ⚙️ Settings
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(loading || (subTab === 'groups' && loadingGroups)) ? (
                                [...Array(8)].map((_,i) => (
                                    <div key={i} style={{ height:80, borderRadius:'12px', background: T.surface, opacity:0.4+i*0.06, animation:'cpulse 1.4s ease-in-out infinite', animationDelay:`${i*0.08}s` }}/>
                                ))
                            ) : subTab === 'groups' && displayItems.length === 0 ? (
                                <div style={{ textAlign: 'center', margin: '40px auto', maxWidth: '420px', padding: '32px 24px', borderRadius: '16px', background: T.surface, border: `1px solid ${T.border}` }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👥</div>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', color: T.text, marginBottom: '6px' }}>No WhatsApp Web Groups Loaded</div>
                                    <div style={{ fontSize: '0.8rem', color: T.text2, lineHeight: 1.5, marginBottom: '18px' }}>
                                        Ensure your WhatsApp Web is linked in your Profile page to view and chat directly with all your WhatsApp Groups.
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                        <button onClick={fetchWAGroups} style={{ padding: '8px 16px', borderRadius: '8px', background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            🔄 Reload Groups
                                        </button>
                                        <button onClick={() => window.open('/profile', '_blank')} style={{ padding: '8px 16px', borderRadius: '8px', background: T.badge, color: T.accent, border: `1px solid ${T.border}`, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            🔗 Connect WhatsApp Web
                                        </button>
                                    </div>
                                </div>
                            ) : !emailError && displayItems.length === 0 ? (
                                <EmptyState T={T} channel={channel} />
                            ) : !emailError && displayItems.map(item => (
                                <InboxRow key={item.id} item={item} T={T} isDark={isDark} isSelected={selectedId===item.id || (item.phone && selectedId===item.phone)}
                                    onClick={() => {
                                        if (item.via==='Email') { setEmailTarget(item); setViewEmail(true); }
                                        else setSelectedId(item.phone || item.id);
                                    }}
                                />
                            ))}

                            {channel==='Email' && nextPageToken && !emailError && (
                                <button onClick={() => fetchEmails(true, nextPageToken)} style={{ margin:'10px auto', padding:'7px 22px', borderRadius:'20px', border:`1px solid ${T.border}`, background: T.badge, color: T.accent, fontSize:'0.78rem', fontWeight:700, cursor:'pointer' }}>
                                    Load more…
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Thread Panel ── */}
                {selectedItem && channel !== 'AI' && (
                    <ThreadPanel 
                        item={selectedItem} 
                        T={T} 
                        isDark={isDark} 
                        onClose={() => setSelectedId(null)} 
                        onSend={handleSendMessage} 
                        setPreviewMedia={setPreviewMedia} 
                        liveEvent={liveEvent}
                        onConvertToLead={async () => {
                            if (!selectedItem.phone) return;
                            setActionLoading(selectedItem.phone);
                            try {
                                const res = await activitiesAPI.convertToLead({ 
                                    phoneNumber: selectedItem.phone, 
                                    name: selectedItem.participant,
                                    source: `Direct ${selectedItem.via}`
                                });
                                if (res?.success) { 
                                    toast.success('Lead created!'); 
                                    fetchActivities(); 
                                }
                                else toast.error(res?.error || 'Failed');
                            } catch(e) { toast.error('Error creating lead'); } finally { setActionLoading(null); }
                        }}
                        isActionLoading={actionLoading === (selectedItem.phone || selectedItem.id)}
                    />
                )}
            </div>

            {/* CSS animations */}
            <style>{`@keyframes cpulse{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>

            {/* Modals */}
            <CommunicationFilterPanel isOpen={isFilterOpen} onClose={()=>setFilterOpen(false)} filters={filters} onFilterChange={(k,v)=>setFilters(p=>({...p,[k]:v}))} onReset={()=>setFilters({})} />
            <ComposeEmailModal isOpen={composing} onClose={()=>setComposing(false)} onSent={fetchEmails} />
            <ViewEmailModal isOpen={viewEmail} onClose={()=>setViewEmail(false)} email={emailTarget} onReply={e=>{setEmailTarget(e);setComposing(true);}} onConvertToLead={handleConvertToLead} isActionLoading={actionLoading} />
            
            {/* 🚀 Media Preview Modal */}
            <MediaPreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} T={T} />
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* InboxRow                                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */
function InboxRow({ item, T, isDark, isSelected, onClick }) {
    const [hov, setHov] = useState(false);
    const ch = CHANNELS.find(c => c.id === item.via) || CHANNELS[0];
    const outcomeColor = OUTCOME_COLOR[item.outcome] || T.text3;
    const outcomeIcons = { Read:'✓✓', Sent:'✓', Delivered:'✓', Failed:'✗', Received:'✓' };

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '12px',
                cursor: 'pointer',
                background: isSelected ? `${ch.color}14` : (hov ? T.surfaceHov : T.surface),
                border: `1.5px solid ${isSelected ? ch.color + '55' : T.border}`,
                transition: 'all 0.15s',
                boxShadow: isSelected ? `0 4px 16px ${ch.color}18` : (hov ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'),
                position: 'relative',
            }}
        >
            {/* Selected accent stripe */}
            {isSelected && (
                <div style={{ position:'absolute', left:0, top:'20%', bottom:'20%', width:'3px', background: ch.color, borderRadius:'0 3px 3px 0' }}/>
            )}

            {/* Avatar */}
            <div style={{
                flexShrink: 0,
                width: 46, height: 46, borderRadius: '12px',
                background: `linear-gradient(135deg, ${ch.color}30, ${ch.color}10)`,
                border: `1.5px solid ${ch.color}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', fontWeight: 800, color: ch.color,
                letterSpacing: '-0.01em',
            }}>
                {initials(item.participant)}
            </div>

            {/* Main content — takes all remaining space */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {/* Row 1: name + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'nowrap' }}>
                    <span style={{
                        fontWeight: 800, fontSize: '0.9rem', color: T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: '45%', flexShrink: 0,
                    }}>
                        {item.participant || 'Unknown'}
                    </span>

                    {/* Channel badge */}
                    <span style={{
                        flexShrink: 0,
                        fontSize: '0.58rem', padding: '2px 8px', borderRadius: '20px',
                        background: `${ch.color}18`, color: ch.color,
                        fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                        border: `1px solid ${ch.color}25`,
                        whiteSpace: 'nowrap',
                    }}>
                        {ch.icon} {item.via}
                    </span>

                    {item.isMatched && (
                        <span title="CRM Linked" style={{ flexShrink:0, fontSize:'0.62rem', color:'#22c55e', fontWeight:800, background:'#22c55e10', padding:'1px 6px', borderRadius:'20px', border:'1px solid #22c55e25' }}>✓ CRM</span>
                    )}

                    {item.phone && (
                        <span style={{ fontSize:'0.62rem', color: T.text3, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{item.phone}</span>
                    )}
                </div>

                <div style={{
                    fontSize: '0.78rem', color: T.text2, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: '5px'
                }}>
                    {item.details?.attachment && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: T.badge, color: T.accent, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {item.details.attachment.type === 'image' ? '🖼️ Photo' : 
                             item.details.attachment.type === 'document' ? '📄 Document' : 
                             item.details.attachment.type === 'location' ? '📍 Location' : 
                             item.details.attachment.type === 'contacts' ? '👤 Contact' : '📎 Media'}
                        </span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: (item.snippet || '').toLowerCase().includes('media attachment') && item.details?.attachment ? T.accent : T.text2, fontWeight: (item.snippet || '').toLowerCase().includes('media attachment') && item.details?.attachment ? 600 : 400 }}>
                        {(() => {
                            const lowSnippet = (item.snippet || item.subject || '').toLowerCase();
                            const hasMediaPlaceholder = lowSnippet.includes('media attachment') || lowSnippet.includes('[sent ') || lowSnippet.includes('[media');
                            
                            if (hasMediaPlaceholder && item.details?.attachment) {
                                return item.details.attachment.filename || `Shared ${item.details.attachment.type || 'file'}`;
                            }
                            
                            return item.subject || item.snippet || '(no message preview)';
                        })()}
                    </span>
                </div>

                {/* Row 3: platform */}
                {item.platform && item.platform !== 'Direct' && (
                    <div style={{ fontSize:'0.62rem', color: T.text3, marginTop:'3px' }}>via {item.platform}</div>
                )}
            </div>

            {/* Right meta — fixed width */}
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '74px' }}>
                <div style={{ fontSize:'0.72rem', color: T.text2, fontWeight:600, marginBottom:'5px' }}>{timeAgo(item.date)}</div>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap:'3px',
                    fontSize: '0.65rem', fontWeight: 800, color: outcomeColor,
                    background: `${outcomeColor}12`, padding:'2px 7px', borderRadius:'20px',
                }}>
                    {outcomeIcons[item.outcome] || '·'} {item.outcome}
                </div>
                {item.duration && item.duration !== '--' && item.duration !== null && (
                    <div style={{ fontSize:'0.6rem', color: T.text3, marginTop:'4px' }}>⏱ {item.duration}s</div>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* ThreadPanel — right-slide conversation view                                 */
/* ══════════════════════════════════════════════════════════════════════════ */
function ThreadPanel({ item, T, isDark, onClose, onSend, setPreviewMedia, onConvertToLead, isActionLoading, liveEvent }) {
    const chObj = CHANNELS.find(c => c.id === item.via) || { icon: '💬', label: item.via || 'Chat' };
    const [text, setText] = useState('');
    const initialCh = (item.platform === 'WhatsApp Web' || item.isGroup)
        ? 'WhatsApp_Web'
        : (item.via === 'SMS' ? 'SMS' : 'WhatsApp_API');
    const [ch, setCh] = useState(initialCh);
    const [sending, setSending] = useState(false);
    const [showAttach, setShowAttach] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const bodyRef = useRef(null);
    const messagesEndRef = useRef(null);
    const isInitialLoadRef = useRef(true);
    const isAtBottomRef = useRef(true);

    const scrollToBottom = useCallback((smooth = false) => {
        if (!bodyRef.current) return;
        const el = bodyRef.current;
        if (smooth) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

    const forceScrollToLatest = useCallback((smooth = false) => {
        if (!bodyRef.current) return;
        scrollToBottom(smooth);
        requestAnimationFrame(() => {
            scrollToBottom(smooth);
            messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
        });
        setTimeout(() => {
            scrollToBottom(smooth);
            messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
        }, 50);
        setTimeout(() => {
            scrollToBottom(smooth);
            messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
        }, 180);
    }, [scrollToBottom]);

    const handleScroll = useCallback(() => {
        if (!bodyRef.current) return;
        const el = bodyRef.current;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
        isAtBottomRef.current = nearBottom;
        setShowScrollBottom(!nearBottom);
    }, []);

    useEffect(() => {
        isInitialLoadRef.current = true;
        isAtBottomRef.current = true;
        setShowScrollBottom(false);
        setHistory([]);
        setLoadingHist(true);
        const nextCh = (item.platform === 'WhatsApp Web' || item.isGroup)
            ? 'WhatsApp_Web'
            : (item.via === 'SMS' ? 'SMS' : 'WhatsApp_API');
        setCh(nextCh);
    }, [item.phone, item.id, item.platform, item.isGroup, item.via]);

    // 🚀 Authentic WhatsApp Auto-Scroll to Latest Messages on Data Arrival
    useEffect(() => {
        if (!loadingHist && history.length > 0) {
            if (isInitialLoadRef.current || isAtBottomRef.current) {
                forceScrollToLatest(false);
                const timer = setTimeout(() => {
                    isInitialLoadRef.current = false;
                }, 300);
                return () => clearTimeout(timer);
            }
        }
    }, [history, loadingHist, forceScrollToLatest]);

    // ⚡ Real-Time Instant Push from SSE Hub (Zero-Latency Live Arrival)
    useEffect(() => {
        if (!liveEvent || !liveEvent.data) return;
        const { type, data } = liveEvent;

        const isGroupItem = Boolean(item.isGroup || (item.phone && String(item.phone).includes('@g.us')) || (item.id && String(item.id).includes('@g.us')));
        const isGroupEvent = Boolean(data.streamItem?.isGroup || data.message?.metadata?.isGroup || (data.phone && String(data.phone).includes('@g.us')));

        let isMatch = false;
        if (isGroupItem && isGroupEvent) {
            isMatch = (item.phone && (item.phone === data.phone || item.phone === data.streamItem?.groupJid)) ||
                      (item.id && (item.id === data.phone || item.id === data.streamItem?.groupJid)) ||
                      (item.groupJid && (item.groupJid === data.phone || item.groupJid === data.streamItem?.groupJid));
        } else {
            const currentPhone = String(item.phone || '').replace(/\D/g, '');
            const eventPhone = String(data.phone || '').replace(/\D/g, '');
            isMatch = (currentPhone && eventPhone && (currentPhone === eventPhone || currentPhone.slice(-10) === eventPhone.slice(-10))) || (item.id === data.phone) || (item.phone === data.phone);
        }

        if (!isMatch) return;

        if (type === 'NEW_MESSAGE' && data.message) {
            const incomingMsg = {
                id: data.message.id || `live_${Date.now()}`,
                sender: data.message.fromMe ? 'agent' : 'customer',
                text: data.message.text,
                time: data.message.timestamp || data.message.time || new Date().toISOString(),
                status: data.message.status || (data.message.fromMe ? 'delivered' : 'received'),
                senderName: data.message.senderName || (data.message.fromMe ? 'Agent' : item.participant),
                metadata: data.message.metadata || null
            };

            setHistory(prev => {
                const exists = prev.some(m => 
                    (m.id && incomingMsg.id && m.id === incomingMsg.id) ||
                    (m.text === incomingMsg.text && Math.abs(new Date(m.time).getTime() - new Date(incomingMsg.time).getTime()) < 3000)
                );
                if (exists) return prev;
                return [...prev, incomingMsg];
            });

            setTimeout(() => {
                forceScrollToLatest(true);
            }, 60);
        } else if (type === 'STATUS_UPDATE') {
            setHistory(prev => prev.map(m => {
                if (m.id === data.messageId || m.metadata?.waId === data.messageId) {
                    return { ...m, status: data.status };
                }
                return m;
            }));
        }
    }, [liveEvent, item.phone, item.id, item.participant]);

    const sanitizeMessageText = (raw) => {
        if (!raw || !raw.includes('{{')) return raw || '';
        const name = item.participant || 'Customer';
        const firstName = name.split(' ')[0] || name;
        let t = raw;
        t = t.replace(/\{\{1\}\}/g, firstName);
        t = t.replace(/\{\{first_name\}\}/gi, firstName);
        t = t.replace(/\{\{name\}\}/gi, name);
        t = t.replace(/\{\{lead_name\}\}/gi, name);
        t = t.replace(/\{\{ownername\}\}/gi, name);
        t = t.replace(/\{\{agentname\}\}/gi, 'Bharat Properties Consultant');
        t = t.replace(/\{\{agentphone\}\}/gi, '+91 94160 35570');
        t = t.replace(/\{\{agentemail\}\}/gi, 'info@bharatproperties.co');
        t = t.replace(/\{\{propertytype\}\}/gi, 'Residential Plot');
        t = t.replace(/\{\{2\}\}/g, 'Residential Plot');
        t = t.replace(/\{\{3\}\}/g, 'Sector 4, Kurukshetra');
        t = t.replace(/\{\{4\}\}/g, '250 Sq. Yd.');
        t = t.replace(/\{\{5\}\}/g, 'Attractive Price (On Request)');
        t = t.replace(/\{\{6\}\}/g, 'Bharat Properties Team');
        t = t.replace(/\{\{7\}\}/g, '+91 94160 35570');
        t = t.replace(/\{\{[^}]+\}\}/g, '-');
        return t;
    };

    // 🚀 Lazy Load Thread History (Senior Strategy: On-Demand Fetching & Background Health Sync)
    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async (silent = false) => {
            const id = item.phone || item.id;
            if (!id) return;
            if (!silent) setLoadingHist(true);
            try {
                const params = { via: item.via };
                if (item.via === 'WhatsApp' || (!item.via && item.type === 'WhatsApp')) {
                    if (item.businessPhoneNumberId) {
                        params.businessPhoneNumberId = item.businessPhoneNumberId;
                    }
                    if (item.whatsappIntegrationId) {
                        params.integrationId = item.whatsappIntegrationId;
                    }
                }
                const res = await activitiesAPI.getThreadHistory(id, params);
                if (res?.success && isMounted) {
                    setHistory(res.data || []);
                    // Proactively mark conversation as read in backend
                    api.patch(`conversations/${encodeURIComponent(id)}/read`).catch(() => {});
                }
            } catch (err) {
                if (!silent) console.error("Thread fetch error:", err);
            } finally {
                if (!silent && isMounted) setLoadingHist(false);
            }
        };
        fetchHistory(false);

        // Relaxed background sync every 25s (SSE handles instant 0ms real-time arrivals)
        const pollInterval = setInterval(() => {
            fetchHistory(true);
        }, 25000);

        return () => { 
            isMounted = false; 
            clearInterval(pollInterval);
        };
    }, [item.phone, item.id, item.via, item.businessPhoneNumberId, item.whatsappIntegrationId]);

    const handleSend = async () => {
        if ((!text.trim() && !pendingFile) || sending) return;
        setSending(true);
        try {
            const sendChannel = ch === 'WhatsApp_Web' ? 'whatsapp_web' : (ch === 'WhatsApp_API' ? 'whatsapp_api' : ch.toLowerCase());
            const sendProvider = ch === 'WhatsApp_Web' ? 'BAILEYS' : (ch === 'WhatsApp_API' ? 'META' : undefined);
            const targetIntId = ch === 'WhatsApp_Web'
                ? (item.whatsappIntegrationId || undefined)
                : (item.businessPhoneNumberId || item.whatsappIntegrationId || undefined);

            const payload = { 
                phoneNumber: item.phone, 
                message: text, 
                channel: sendChannel,
                provider: sendProvider,
                entityId: item.entityId,
                entityType: item.entityType,
                integrationId: targetIntId
            };

            if (pendingFile) {
                const formData = new FormData();
                formData.append('file', pendingFile.file);
                formData.append('entityType', 'Communication');
                formData.append('entityName', item.participant);
                const up = await api.post('/upload', formData);
                if (up.data?.success) {
                    payload.attachment = { type: pendingFile.type, url: up.data.downloadUrl || up.data.url, filename: up.data.fileName };
                }
            }

            const res = await onSend(payload);
            if (res?.success) {
                // Optimistic UI update for Enterprise Speed
                const newMsg = { sender: 'agent', text: text || `Sent ${payload.attachment?.type || 'file'}`, time: new Date().toISOString(), metadata: payload.attachment ? { attachment: payload.attachment } : null };
                setHistory(prev => [...prev, newMsg]);
                setText('');
                setPendingFile(null);
                toast.success('Message sent');
                setTimeout(() => forceScrollToLatest(true), 60);
            }
        } catch (e) { toast.error(e.message || 'Failed to send'); }
        finally { setSending(false); }
    };

    const triggerFile = (type) => {
        const input = document.getElementById('panel-file-input');
        input.accept = type === 'image' ? 'image/*' : '*/*';
        input.click();
        setShowAttach(false);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const type = file.type.startsWith('image/') ? 'image' : 'document';
            setPendingFile({ file, type, name: file.name });
            setText(`Sending ${file.name}...`);
        }
    };

    const sendSpecial = (type) => {
        setShowAttach(false);
        const sendChannel = ch === 'WhatsApp_Web' ? 'whatsapp_web' : (ch === 'WhatsApp_API' ? 'whatsapp_api' : ch.toLowerCase());
        const sendProvider = ch === 'WhatsApp_Web' ? 'BAILEYS' : (ch === 'WhatsApp_API' ? 'META' : undefined);
        const targetIntId = ch === 'WhatsApp_Web'
            ? (item.whatsappIntegrationId || undefined)
            : (item.businessPhoneNumberId || item.whatsappIntegrationId || undefined);

        if (type === 'location') {
            const loc = { latitude: 29.9695, longitude: 76.8783, name: 'Bharat Properties', address: 'Sector 4, Kurukshetra' };
            onSend({ phoneNumber: item.phone, channel: sendChannel, provider: sendProvider, message: 'Sending location...', attachment: { type: 'location', location: loc }, integrationId: targetIntId })
                .then(r => {
                    if (r?.success) {
                        setHistory(prev => [...prev, { sender: 'agent', text: 'Sent location', time: new Date().toISOString(), metadata: { attachment: { type: 'location', location: loc } } }]);
                        setTimeout(() => forceScrollToLatest(true), 60);
                    }
                });
        } else if (type === 'contact') {
            const card = [{ name: { first_name: 'Bharat', last_name: 'Properties', formatted_name: 'Bharat Properties' }, phones: [{ phone: '919999999999', type: 'WORK' }] }];
            onSend({ phoneNumber: item.phone, channel: sendChannel, provider: sendProvider, message: 'Sending contact card...', attachment: { type: 'contacts', contacts: card }, integrationId: targetIntId })
                .then(r => {
                    if (r?.success) {
                        setHistory(prev => [...prev, { sender: 'agent', text: 'Sent contact card', time: new Date().toISOString(), metadata: { attachment: { type: 'contacts', contacts: card } } }]);
                        setTimeout(() => forceScrollToLatest(true), 60);
                    }
                });
        }
    };

    return (
        <div style={{ 
            width: '460px', 
            minWidth: '420px', 
            maxWidth: '520px', 
            display: 'flex', 
            flexDirection: 'column', 
            background: isDark ? '#0b141a' : '#efeae2', 
            borderLeft: `1px solid ${T.border}`, 
            height: '100%',
            position: 'relative'
        }}>
            {/* ── WhatsApp Header Bar ── */}
            <div style={{ 
                padding: '10px 16px', 
                background: isDark ? '#202c33' : '#f0f2f5', 
                borderBottom: isDark ? '1px solid #2a3942' : '1px solid #d1d7db', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                flexShrink: 0 
            }}>
                {/* Avatar */}
                <div style={{ 
                    width: 42, 
                    height: 42, 
                    borderRadius: '50%', 
                    background: item.isGroup ? 'linear-gradient(135deg, #00a884, #059669)' : 'linear-gradient(135deg, #128c7e, #25d366)', 
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: item.isGroup ? '1.2rem' : '0.95rem', 
                    fontWeight: 800,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    flexShrink: 0
                }}>
                    {item.isGroup ? '👥' : initials(item.participant)}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                        fontWeight: 700, 
                        color: isDark ? '#e9edef' : '#111b21', 
                        fontSize: '0.95rem', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                    }}>
                        {item.participant}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {item.isGroup ? (
                            <span style={{ fontSize: '0.72rem', color: '#00a884', fontWeight: 600 }}>
                                👥 {item.participantsCount || ''} group participants
                            </span>
                        ) : (
                            <>
                                <span style={{
                                    fontSize: '0.64rem',
                                    padding: '2px 7px',
                                    borderRadius: '12px',
                                    background: (item.platform === 'WhatsApp Web' || item.isGroup)
                                        ? (isDark ? 'rgba(34,197,94,0.2)' : '#dcfce7')
                                        : item.via === 'Web Chat'
                                        ? (isDark ? 'rgba(6,182,212,0.2)' : '#e0f2fe')
                                        : (isDark ? 'rgba(59,130,246,0.2)' : '#e0f2fe'),
                                    color: (item.platform === 'WhatsApp Web' || item.isGroup)
                                        ? (isDark ? '#4ade80' : '#15803d')
                                        : item.via === 'Web Chat'
                                        ? (isDark ? '#22d3ee' : '#0e7490')
                                        : (isDark ? '#93c5fd' : '#0369a1'),
                                    fontWeight: 800
                                }}>
                                    {item.platform === 'WhatsApp Web' ? '⚡ WhatsApp Web' : (item.via === 'WhatsApp' ? '💬 WhatsApp API' : (item.via === 'Web Chat' ? '🌐 Web Chat' : `${chObj?.icon || '💬'} ${item.via || chObj?.label || 'Direct'}`))}
                                </span>
                                {item.isMatched && <span style={{ fontSize: '0.64rem', color: '#22c55e', fontWeight: 700 }}>✓ Linked</span>}
                                {item.phone && !item.isGroup && (
                                    <span style={{ fontSize: '0.64rem', color: isDark ? '#8696a0' : '#667781', fontFamily: 'monospace' }}>
                                        {item.phone}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Actions: Convert Lead */}
                {!item.isMatched && !item.isGroup && (
                    <button 
                        onClick={onConvertToLead} 
                        disabled={isActionLoading}
                        style={{
                            padding: '6px 11px', borderRadius: '8px', border: 'none', 
                            background: isDark ? 'rgba(34,197,94,0.18)' : '#dcfce7',
                            color: isDark ? '#4ade80' : '#166534', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s', flexShrink: 0
                        }}
                    >
                        {isActionLoading ? '⏳' : <><i className="fas fa-user-plus"></i> + LEAD</>}
                    </button>
                )}

                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    style={{ 
                        width: 32, height: 32, borderRadius: '50%', border: 'none', 
                        background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', 
                        color: isDark ? '#aebac1' : '#54656f', 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '0.85rem', flexShrink: 0, transition: 'all 0.15s' 
                    }}
                    onMouseOver={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
                >
                    ✕
                </button>
            </div>

            {/* ── WhatsApp Wallpaper Chat Canvas ── */}
            <div 
                ref={bodyRef} 
                onScroll={handleScroll}
                style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '16px 18px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '4px',
                    background: isDark ? '#0b141a' : '#efeae2',
                    backgroundImage: isDark
                        ? 'radial-gradient(circle at 50% 50%, rgba(32, 44, 51, 0.4) 0%, rgba(11, 20, 26, 0.95) 100%)'
                        : 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.4) 0%, rgba(239, 234, 226, 0.95) 100%)',
                }}
            >
                {loadingHist ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px 10px' }}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} style={{ 
                                height: '42px', 
                                width: i % 2 === 0 ? '70%' : '50%', 
                                alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end', 
                                borderRadius: '8px', 
                                background: isDark ? '#202c33' : '#ffffff', 
                                opacity: 0.5, 
                                animation: 'cpulse 1.5s infinite' 
                            }} />
                        ))}
                    </div>
                ) : history.length === 0 ? (
                    <div style={{ textAlign: 'center', margin: 'auto', color: isDark ? '#8696a0' : '#54656f', padding: '30px 20px', maxWidth: '300px' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: isDark ? '#202c33' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <span style={{ fontSize: '2rem' }}>💬</span>
                        </div>
                        <div style={{ fontWeight: 700, color: isDark ? '#e9edef' : '#111b21', fontSize: '0.92rem' }}>No messages yet</div>
                        <div style={{ fontSize: '0.78rem', color: isDark ? '#8696a0' : '#667781', marginTop: '6px', lineHeight: 1.4 }}>
                            {item.isGroup ? 'Send the first message to this WhatsApp group.' : 'Start chatting with this contact via WhatsApp.'}
                        </div>
                    </div>
                ) : (
                    history.map((msg, i) => {
                        const isOut = msg.sender !== 'customer';
                        const prevMsg = history[i - 1];
                        const showDatePill = !prevMsg || formatMessageDate(msg.time) !== formatMessageDate(prevMsg.time);

                        return (
                            <Fragment key={msg.id || i}>
                                {/* WhatsApp Centered Date Divider Pill */}
                                {showDatePill && (
                                    <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 6px 0' }}>
                                        <div style={{
                                            background: isDark ? '#182229' : '#ffffff',
                                            color: isDark ? '#8696a0' : '#54656f',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            padding: '4px 12px',
                                            borderRadius: '7.5px',
                                            boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em'
                                        }}>
                                            {formatMessageDate(msg.time)}
                                        </div>
                                    </div>
                                )}

                                {/* WhatsApp Message Bubble */}
                                <div style={{
                                    alignSelf: isOut ? 'flex-end' : 'flex-start',
                                    maxWidth: '82%',
                                    minWidth: '85px',
                                    margin: '2px 0',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        padding: '6px 9px 6px 10px',
                                        borderRadius: isOut ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                                        background: isOut 
                                            ? (isDark ? '#005c4b' : '#d9fdd3')
                                            : (isDark ? '#202c33' : '#ffffff'),
                                        color: isDark ? '#e9edef' : '#111b21',
                                        boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
                                        wordBreak: 'break-word',
                                        position: 'relative'
                                    }}>
                                        {/* Group Sender Name in authentic WhatsApp distinct color */}
                                        {!isOut && (item.isGroup || (msg.senderName && msg.senderName !== item.participant)) && (
                                            <div style={{
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                color: getParticipantColor(msg.senderName),
                                                marginBottom: '3px',
                                                lineHeight: 1.2
                                            }}>
                                                {msg.senderName || 'Group Member'}
                                            </div>
                                        )}

                                        {/* AI Bot Outbound Label */}
                                        {msg.sender === 'ai' && (
                                            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#38bdf8', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>🤖 AI Bot</span>
                                            </div>
                                        )}

                                        {/* Template / Rich Header */}
                                        {msg.metadata?.header && (
                                            <div style={{ marginBottom: '6px' }}>
                                                {msg.metadata.header.format === 'IMAGE' && msg.metadata.header.url ? (
                                                    <div style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', marginBottom: '6px' }} onClick={() => setPreviewMedia(resolveMediaUrl(msg.metadata.header.url))}>
                                                        <img src={resolveMediaUrl(msg.metadata.header.url)} alt="Header" style={{ maxWidth: '100%', maxHeight: '200px', width: '100%', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                                                    </div>
                                                ) : (
                                                    msg.metadata.header.text && (
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f1f5f9' : '#0f172a', letterSpacing: '-0.01em', marginBottom: '4px' }}>
                                                            {msg.metadata.header.text}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}

                                        {/* Rich Media Attachments */}
                                        {msg.metadata?.attachment && (() => {
                                            const att = msg.metadata.attachment;
                                            const mediaUrl = resolveMediaUrl(att.url);
                                            return (
                                                <div style={{ marginTop: '2px', borderRadius: '6px', overflow: 'hidden', marginBottom: msg.text ? '6px' : 0 }}>
                                                    {/* 1. Image */}
                                                    {att.type === 'image' && (
                                                        mediaUrl ? (
                                                            <div style={{ cursor: 'pointer' }} onClick={() => setPreviewMedia(mediaUrl)}>
                                                                <img 
                                                                    src={mediaUrl} 
                                                                    alt="Shared Media" 
                                                                    style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '6px', display: 'block', objectFit: 'cover', width: '100%' }} 
                                                                />
                                                                {att.caption && <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.9 }}>{att.caption}</div>}
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '8px', fontSize: '0.75rem', opacity: 0.8 }}>🖼️ Shared Image</div>
                                                        )
                                                    )}

                                                    {/* 2. Video */}
                                                    {att.type === 'video' && (
                                                        mediaUrl ? (
                                                            <div style={{ borderRadius: '6px', overflow: 'hidden' }}>
                                                                <video 
                                                                    controls 
                                                                    src={mediaUrl} 
                                                                    style={{ maxWidth: '100%', maxHeight: '240px', width: '100%', borderRadius: '6px', display: 'block', background: '#000' }} 
                                                                />
                                                                {att.caption && <div style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.9 }}>{att.caption}</div>}
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '8px', fontSize: '0.75rem', opacity: 0.8 }}>🎥 Shared Video</div>
                                                        )
                                                    )}

                                                    {/* 3. Audio / Voice Note */}
                                                    {(att.type === 'audio' || att.type === 'voice') && (
                                                        mediaUrl ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#00a884', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    <i className="fas fa-microphone" style={{ fontSize: '0.8rem' }}></i>
                                                                </div>
                                                                <audio controls src={mediaUrl} style={{ flex: 1, height: '32px', minWidth: '160px' }} />
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '8px', fontSize: '0.75rem', opacity: 0.8 }}>🎵 Audio File</div>
                                                        )
                                                    )}

                                                    {/* 4. Document */}
                                                    {att.type === 'document' && (() => {
                                                        const filename = att.filename || 'Document.pdf';
                                                        const badge = getDocBadge(filename, att.mimeType || '');
                                                        return (
                                                            <div 
                                                                onClick={() => { if (mediaUrl) window.open(mediaUrl, '_blank'); }}
                                                                style={{ 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    gap: '10px', 
                                                                    padding: '9px 12px', 
                                                                    borderRadius: '8px',
                                                                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                                                    cursor: mediaUrl ? 'pointer' : 'default' 
                                                                }}
                                                            >
                                                                <div style={{ width: 38, height: 38, borderRadius: '8px', background: badge.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                                                                    <i className={`fas ${badge.icon}`} style={{ fontSize: '0.85rem' }}></i>
                                                                    <span style={{ fontSize: '0.52rem', fontWeight: 900, marginTop: '1px' }}>{badge.label}</span>
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {filename}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.64rem', opacity: 0.7, marginTop: '2px' }}>
                                                                        {att.mimeType || 'Download Document'}
                                                                    </div>
                                                                </div>
                                                                {mediaUrl && (
                                                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
                                                                        <i className="fas fa-arrow-down"></i>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* 5. Location */}
                                                    {att.type === 'location' && (() => {
                                                        const lat = att.location?.latitude || att.location?.lat;
                                                        const lng = att.location?.longitude || att.location?.lng;
                                                        const hasCoords = !!(lat && lng);
                                                        return (
                                                            <div 
                                                                onClick={() => {
                                                                    if (hasCoords) window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                                                }}
                                                                style={{ 
                                                                    padding: '8px 10px', 
                                                                    borderRadius: '8px',
                                                                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                                                    cursor: hasCoords ? 'pointer' : 'default' 
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.9rem' }}>
                                                                        <i className="fas fa-map-marker-alt"></i>
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isDark ? '#f87171' : '#dc2626' }}>
                                                                            {att.location?.name || 'Shared Location'}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.68rem', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {att.location?.address || (hasCoords ? `${lat}, ${lng}` : 'View location')}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {hasCoords && (
                                                                    <div style={{
                                                                        marginTop: '6px',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '5px',
                                                                        background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                                                        color: isDark ? '#fca5a5' : '#b91c1c',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 700,
                                                                        textAlign: 'center',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '5px'
                                                                    }}>
                                                                        <span>📍 Open in Google Maps</span>
                                                                        <i className="fas fa-external-link-alt" style={{ fontSize: '0.6rem' }}></i>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* 6. Contacts */}
                                                    {att.type === 'contacts' && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {(att.contacts || []).map((contact, ci) => {
                                                                const cName = contact.name?.formatted_name || `${contact.name?.first_name || ''} ${contact.name?.last_name || ''}`.trim() || 'Contact';
                                                                const cPhone = contact.phones?.[0]?.phone || contact.phones?.[0]?.number || '';
                                                                return (
                                                                    <div key={ci} style={{ padding: '8px 10px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#00a884', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800 }}>
                                                                                {cName.charAt(0).toUpperCase()}
                                                                            </div>
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{cName}</div>
                                                                                {cPhone && <div style={{ fontSize: '0.66rem', opacity: 0.7, fontFamily: 'monospace' }}>{cPhone}</div>}
                                                                            </div>
                                                                        </div>
                                                                        {cPhone && (
                                                                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                                                                <button 
                                                                                    onClick={() => setText(`Hi ${cName}, `)}
                                                                                    style={{ flex: 1, padding: '4px', borderRadius: '5px', border: 'none', background: '#00a884', color: '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                                                >
                                                                                    <i className="fas fa-comment"></i> Message
                                                                                </button>
                                                                                <a 
                                                                                    href={`tel:${cPhone}`}
                                                                                    style={{ flex: 1, padding: '4px', borderRadius: '5px', border: 'none', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: isDark ? '#e9edef' : '#111b21', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', textDecoration: 'none' }}
                                                                                >
                                                                                    <i className="fas fa-phone-alt"></i> Call
                                                                                </a>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* 7. Catalogue / Product */}
                                                    {(att.type === 'catalogue' || att.type === 'product') && (() => {
                                                        const cat = att.catalogue || {};
                                                        return (
                                                            <div style={{ borderRadius: '8px', overflow: 'hidden', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc' }}>
                                                                {cat.image_url && (
                                                                    <img src={resolveMediaUrl(cat.image_url)} alt="Product" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover' }} />
                                                                )}
                                                                <div style={{ padding: '8px 10px' }}>
                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isDark ? '#e9edef' : '#111b21' }}>
                                                                        {cat.title || cat.name || 'Featured Property / Product'}
                                                                    </div>
                                                                    {cat.price && (
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                                                                            ₹ {Number(cat.price).toLocaleString('en-IN')}
                                                                        </div>
                                                                    )}
                                                                    {cat.description && (
                                                                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '3px' }}>
                                                                            {cat.description}
                                                                        </div>
                                                                    )}
                                                                    <div 
                                                                        style={{ marginTop: '6px', padding: '5px', borderRadius: '6px', background: '#00a884', color: '#fff', fontSize: '0.72rem', fontWeight: 700, textAlign: 'center', cursor: 'pointer' }}
                                                                        onClick={() => { if (cat.url) window.open(cat.url, '_blank'); }}
                                                                    >
                                                                        🛒 View Property / Product
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })()}

                                        {/* Message Text */}
                                        {msg.text && !((msg.text.toLowerCase().includes('media attachment') || msg.text.toLowerCase().startsWith('[sent ')) && msg.metadata?.attachment) && (
                                            <div style={{ 
                                                fontSize: '0.86rem', 
                                                lineHeight: '1.4', 
                                                whiteSpace: 'pre-wrap', 
                                                paddingRight: '4px' 
                                            }}>
                                                {sanitizeMessageText(msg.text)}
                                            </div>
                                        )}

                                        {/* Template / Message Footer */}
                                        {msg.metadata?.footer && (
                                            <div style={{ fontSize: '0.68rem', fontStyle: 'italic', opacity: 0.75, marginTop: '4px', marginBottom: '2px' }}>
                                                {msg.metadata.footer}
                                            </div>
                                        )}

                                        {/* WhatsApp Action / Interactive / Template Buttons */}
                                        {Array.isArray(msg.metadata?.buttons) && msg.metadata.buttons.length > 0 && (
                                            <div style={{
                                                marginTop: '6px',
                                                borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
                                                paddingTop: '4px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}>
                                                {msg.metadata.buttons.map((btn, bi) => {
                                                    const btnType = (btn.type || '').toUpperCase();
                                                    const btnText = btn.text || btn.title || btn.reply?.title || 'Action';
                                                    const isUrl = btnType === 'URL' || !!btn.url;
                                                    const isCall = btnType === 'PHONE_NUMBER' || btnType === 'CALL' || !!btn.phone_number;
                                                    const isReply = btnType === 'QUICK_REPLY' || btnType === 'REPLY';

                                                    return (
                                                        <button
                                                            key={bi}
                                                            onClick={() => {
                                                                if (isUrl && btn.url) {
                                                                    window.open(btn.url, '_blank');
                                                                } else if (isCall && btn.phone_number) {
                                                                    window.open(`tel:${btn.phone_number}`, '_self');
                                                                } else {
                                                                    setText(btnText);
                                                                }
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                padding: '6px 10px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                                color: isDark ? '#4ade80' : '#00a884',
                                                                fontSize: '0.78rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px',
                                                                transition: 'all 0.15s'
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
                                                            onMouseOut={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                                                        >
                                                            {isUrl && <i className="fas fa-external-link-alt" style={{ fontSize: '0.7rem' }}></i>}
                                                            {isCall && <i className="fas fa-phone-alt" style={{ fontSize: '0.7rem' }}></i>}
                                                            {isReply && <i className="fas fa-reply" style={{ fontSize: '0.7rem' }}></i>}
                                                            {!isUrl && !isCall && !isReply && <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>}
                                                            <span>{btnText}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Bottom-right Metadata: Time & WhatsApp Checkmarks */}
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'flex-end', 
                                            gap: '3px', 
                                            marginTop: '3px',
                                            float: 'right',
                                            marginLeft: '12px',
                                            fontSize: '0.64rem', 
                                            color: isDark ? 'rgba(233, 237, 239, 0.6)' : 'rgba(17, 27, 33, 0.6)'
                                        }}>
                                            <span>
                                                {msg.time && !isNaN(new Date(msg.time)) 
                                                    ? new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                                    : (msg.time || '')}
                                            </span>
                                            {isOut && (
                                                <span style={{ 
                                                    fontSize: '0.75rem', 
                                                    color: (msg.status === 'Read' || msg.status === 'read') ? '#53bdeb' : (isDark ? 'rgba(233, 237, 239, 0.6)' : 'rgba(17, 27, 33, 0.6)'),
                                                    fontWeight: 800,
                                                    lineHeight: 1
                                                }}>
                                                    {msg.status === 'Sent' ? '✓' : '✓✓'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Fragment>
                        );
                    })
                )}
                <div ref={messagesEndRef} style={{ height: '1px', width: '100%', flexShrink: 0 }} />
            </div>

            {/* WhatsApp Floating Scroll-to-Bottom (⬇) Pill */}
            {showScrollBottom && (
                <button
                    onClick={() => forceScrollToLatest(true)}
                    style={{
                        position: 'absolute',
                        bottom: '84px',
                        right: '18px',
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: isDark ? '#202c33' : '#ffffff',
                        color: isDark ? '#aebac1' : '#54656f',
                        border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #d1d7db',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 30,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        fontSize: '0.88rem'
                    }}
                    title="Latest messages"
                >
                    <i className="fas fa-chevron-down"></i>
                </button>
            )}

            {/* ── WhatsApp Footer Bar & Input ── */}
            <div style={{ 
                padding: '10px 14px', 
                borderTop: isDark ? '1px solid #2a3942' : '1px solid #d1d7db', 
                background: isDark ? '#202c33' : '#f0f2f5', 
                flexShrink: 0 
            }}>
                {/* Channel & Attachment Pill */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'WhatsApp_API', label: '💬 WhatsApp API', activeColor: '#0284c7' },
                            { id: 'WhatsApp_Web', label: '⚡ WhatsApp Web', activeColor: '#00a884' },
                            { id: 'SMS',          label: '📱 SMS',          activeColor: '#d97706' },
                            { id: 'RCS',          label: '📡 RCS',          activeColor: '#7c3aed' }
                        ].map(c2 => (
                            <button 
                                key={c2.id} 
                                onClick={() => setCh(c2.id)} 
                                style={{
                                    padding: '4px 10px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.67rem', fontWeight: 800, transition: 'all 0.15s',
                                    background: ch === c2.id ? c2.activeColor : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                                    color: ch === c2.id ? '#fff' : (isDark ? '#aebac1' : '#54656f'),
                                    boxShadow: ch === c2.id ? '0 2px 6px rgba(0,0,0,0.2)' : 'none'
                                }}
                            >
                                {c2.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Route Indicator Badge */}
                        <div style={{
                            fontSize: '0.63rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: ch === 'WhatsApp_Web' 
                                ? (isDark ? 'rgba(0,168,132,0.18)' : '#dcfce7')
                                : ch === 'WhatsApp_API'
                                ? (isDark ? 'rgba(2,132,199,0.18)' : '#e0f2fe')
                                : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                            color: ch === 'WhatsApp_Web'
                                ? (isDark ? '#4ade80' : '#15803d')
                                : ch === 'WhatsApp_API'
                                ? (isDark ? '#38bdf8' : '#0369a1')
                                : (isDark ? '#94a3b8' : '#475569')
                        }}>
                            {ch === 'WhatsApp_Web' && '⚡ Route: WhatsApp Web (Scanner)'}
                            {ch === 'WhatsApp_API' && '💬 Route: WhatsApp Cloud API (Meta Official)'}
                            {ch === 'SMS' && '📱 Route: SMS Gateway'}
                            {ch === 'RCS' && '📡 Route: RCS Messaging'}
                        </div>

                        {pendingFile && (
                            <div style={{ 
                                fontSize: '0.68rem', 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                background: '#dcfce7', 
                                color: '#15803d', 
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span>📎 {pendingFile.name}</span>
                                <span style={{ cursor: 'pointer', fontWeight: 900 }} onClick={() => { setPendingFile(null); setText(''); }}>✕</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input & Action Row */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Attachment Button */}
                    <div style={{ position: 'relative' }}>
                        <button 
                            onClick={() => setShowAttach(!showAttach)} 
                            style={{
                                width: 40, height: 40, borderRadius: '50%', border: 'none', 
                                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', 
                                color: isDark ? '#aebac1' : '#54656f', 
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                fontSize: '1.05rem', transition: 'all 0.15s'
                            }}
                            title="Attach Document, Photo, Contact, Location"
                        >
                            <i className={`fas ${showAttach ? 'fa-times' : 'fa-plus'}`}></i>
                        </button>
                        
                        {showAttach && (
                            <div style={{
                                position: 'absolute', bottom: '48px', left: 0, 
                                background: isDark ? '#233138' : '#ffffff', 
                                border: isDark ? '1px solid #2a3942' : '1px solid #e9edef',
                                borderRadius: '14px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', width: '140px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 100
                            }}>
                                {[
                                    { id: 'image', icon: 'fa-image', label: 'Photos & Videos', bg: '#007bfc' },
                                    { id: 'document', icon: 'fa-file-alt', label: 'Document', bg: '#7f66ff' },
                                    { id: 'contact', icon: 'fa-user', label: 'Contact', bg: '#02a698' },
                                    { id: 'location', icon: 'fa-map-marker-alt', label: 'Location', bg: '#1fa855' }
                                ].map(item => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => item.id === 'image' || item.id === 'document' ? triggerFile(item.id) : sendSpecial(item.id)} 
                                        style={{ 
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', 
                                            borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s' 
                                        }}
                                        onMouseOver={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem' }}>
                                            <i className={`fas ${item.icon}`}></i>
                                        </div>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: isDark ? '#e9edef' : '#111b21' }}>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Rounded Text Input */}
                    <input 
                        type="text" 
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder={item.isGroup ? "Message group..." : `Type a message...`} 
                        disabled={sending}
                        style={{ 
                            flex: 1, 
                            height: '42px', 
                            padding: '0 16px', 
                            borderRadius: '21px', 
                            border: 'none', 
                            background: isDark ? '#2a3942' : '#ffffff', 
                            color: isDark ? '#e9edef' : '#111b21', 
                            fontSize: '0.88rem', 
                            outline: 'none',
                            boxShadow: '0 1px 1px rgba(0,0,0,0.06)'
                        }}
                    />

                    <input type="file" id="panel-file-input" style={{ display: 'none' }} onChange={handleFileChange} />

                    {/* WhatsApp Green Circular Send Button */}
                    <button 
                        onClick={handleSend} 
                        disabled={sending || (!text.trim() && !pendingFile)} 
                        style={{
                            width: 42, 
                            height: 42, 
                            borderRadius: '50%', 
                            border: 'none', 
                            cursor: 'pointer',
                            background: '#00a884', 
                            color: '#fff',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '1rem',
                            boxShadow: '0 2px 6px rgba(0,168,132,0.4)',
                            opacity: ((!text.trim() && !pendingFile) || sending) ? 0.5 : 1, 
                            transition: 'all 0.18s',
                            flexShrink: 0
                        }}
                        title="Send Message"
                    >
                        {sending ? '⏳' : <i className="fas fa-paper-plane" style={{ fontSize: '0.95rem', marginLeft: '2px' }}></i>}
                    </button>
                </div>
                
                <div style={{ fontSize: '0.62rem', color: isDark ? '#8696a0' : '#667781', marginTop: '6px', textAlign: 'center' }}>
                    🔒 Connected via {item.platform || (item.via === 'WhatsApp' ? 'WhatsApp' : ch)} · Enterprise Encrypted
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* AIBotView — Professional AI conversation manager                           */
/* ══════════════════════════════════════════════════════════════════════════ */
function AIBotView({ T, isDark, convos, selected, onSelect, onTakeover, onRefresh, setPreviewMedia }) {
    const [replyText, setReplyText] = useState('');
    const [sendingAI, setSendingAI] = useState(false);
    const [showAttach, setShowAttach] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);
    const bodyRef = useRef(null);

    useEffect(() => { 
        if (!bodyRef.current) return; 
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        const t1 = setTimeout(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, 50);
        const t2 = setTimeout(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, 180);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [selected?.messages, selected?.id]);

    const handleAISend = async (textOverride = null, attachment = null) => {
        const msgText = textOverride || replyText;
        if ((!msgText.trim() && !attachment && !pendingFile) || sendingAI || !selected) return;
        
        setSendingAI(true);
        try {
            const phone = selected.phone;
            let payload = { 
                phoneNumber: phone, 
                message: msgText, 
                channel: 'whatsapp',
                entityId: selected.lead?._id,
                entityType: 'Lead',
                integrationId: selected.whatsappIntegrationId || selected.businessPhoneNumberId || undefined
            };

            // Handle Attachments (Upload if needed)
            if (attachment || pendingFile) {
                const attachData = attachment || pendingFile;
                if (attachData.file) {
                    const formData = new FormData();
                    formData.append('file', attachData.file);
                    formData.append('entityType', 'Communication');
                    formData.append('entityName', selected.name);
                    
                    const uploadRes = await api.post('/upload', formData, {
                        headers: { 'Content-Type': undefined }
                    });
                    
                    if (uploadRes.data?.success) {
                        payload.attachment = {
                            type: attachData.type,
                            url: uploadRes.data.downloadUrl || uploadRes.data.url,
                            filename: uploadRes.data.fileName
                        };
                    } else throw new Error('Upload failed');
                } else {
                    payload.attachment = attachData;
                }
            }

            const res = await activitiesAPI.sendReply(payload);
            if (res?.success) {
                const newMsg = { 
                    sender: 'agent', 
                    text: msgText || `Sent ${payload.attachment?.type || 'file'}`, 
                    time: new Date().toISOString(),
                    metadata: payload.attachment ? { attachment: payload.attachment } : null
                };
                onSelect(prevId => {
                    // Update the local state of selected convo
                    // Since onSelect is passed as setSelectedAIId, we need to handle this carefully
                    // However, fetchAIConvos is called below anyway
                    return prevId;
                });
                setReplyText('');
                setPendingFile(null);
                toast.success('Message sent!');
                onRefresh(); // Refresh to get the updated thread
            }
        } catch(e) { 
            toast.error(e.message || 'Send failed'); 
        } finally { 
            setSendingAI(false); 
        }
    };

    const triggerFile = (type) => {
        const input = document.getElementById('ai-file-input');
        input.accept = type === 'image' ? 'image/*' : '*/*';
        input.click();
        setShowAttach(false);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const type = file.type.startsWith('image/') ? 'image' : 'document';
            setPendingFile({ file, type, name: file.name });
            setReplyText(`Sending ${file.name}...`);
        }
    };

    const sendSpecial = (type) => {
        setShowAttach(false);
        if (type === 'location') {
            handleAISend('Sending location...', { 
                type: 'location', 
                location: { latitude: 29.9695, longitude: 76.8783, name: 'Bharat Properties', address: 'Sector 4, Kurukshetra' } 
            });
        } else if (type === 'contact') {
            handleAISend('Sending contact card...', {
                type: 'contacts',
                contacts: [{
                    name: { first_name: 'Bharat', last_name: 'Properties', formatted_name: 'Bharat Properties' },
                    phones: [{ phone: '919999999999', type: 'WORK' }]
                }]
            });
        }
    };

    return (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            {/* Conversation list */}
            <div style={{ width:'340px', minWidth:'340px', borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', background: T.surface, overflowY:'auto' }}>
                <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:800, color: T.text, fontSize:'0.9rem' }}>
                        🤖 AI Bot Threads
                        <span style={{ marginLeft:'8px', padding:'2px 8px', borderRadius:'20px', background:'#8b5cf620', color:'#8b5cf6', fontSize:'0.65rem', fontWeight:700 }}>{convos.length} active</span>
                    </div>
                    <button onClick={onRefresh} style={{ fontSize:'0.9rem', background:'none', border:'none', cursor:'pointer', color: T.text2 }}>🔄</button>
                </div>

                {convos.length === 0 ? (
                    <div style={{ padding:'40px', textAlign:'center', color: T.text2 }}>
                        <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>🤖</div>
                        <div style={{fontWeight:700}}>No active AI conversations</div>
                        <div style={{fontSize:'0.78rem',color:T.text3,marginTop:'4px'}}>Conversations appear here when leads message via WhatsApp.</div>
                    </div>
                ) : convos.map(conv => (
                    <div key={conv.id} onClick={() => onSelect(conv.id)} style={{
                        padding:'13px 14px', borderBottom:`1px solid ${T.border}`, cursor:'pointer',
                        background: selected?.id===conv.id ? '#8b5cf615' : 'transparent',
                        borderLeft: selected?.id===conv.id ? '3px solid #8b5cf6' : '3px solid transparent',
                        transition:'all 0.14s',
                    }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                            <div style={{ width:38, height:38, borderRadius:'10px', background:'#8b5cf620', border:'1.5px solid #8b5cf650', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:800, color:'#8b5cf6' }}>
                                {initials(conv.name)}
                            </div>
                            <div style={{flex:1, minWidth:0}}>
                                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                                    <span style={{fontWeight:800, fontSize:'0.85rem', color: T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'140px'}}>{conv.name}</span>
                                    {conv.isHandedOff && <span style={{fontSize:'0.6rem',padding:'1px 6px',borderRadius:'20px',background:'#f59e0b20',color:'#f59e0b',fontWeight:800}}>AGENT</span>}
                                    {!conv.isHandedOff && <span style={{fontSize:'0.6rem',padding:'1px 6px',borderRadius:'20px',background:'#22c55e15',color:'#22c55e',fontWeight:800}}>AI</span>}
                                </div>
                                <div style={{fontSize:'0.68rem',color: T.text2,fontFamily:'monospace',marginTop:'1px'}}>{conv.phone}</div>
                                {conv.messages.length > 0 && (
                                    <div style={{fontSize:'0.7rem',color:T.text3,marginTop:'3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis', display: 'flex', alignItems: 'center', gap: '4px'}}>
                                        {conv.messages[conv.messages.length-1]?.metadata?.attachment && (
                                            <span style={{color: T.accent, fontWeight: 700}}>
                                                {conv.messages[conv.messages.length-1].metadata.attachment.type === 'image' ? '🖼️ Photo' : '📎 Media'}
                                            </span>
                                        )}
                                        {conv.messages[conv.messages.length-1]?.text?.slice(0,50) || (conv.messages[conv.messages.length-1]?.metadata?.attachment ? '' : 'Conversation started')}
                                    </div>
                                )}
                            </div>
                            <div style={{textAlign:'right',flexShrink:0}}>
                                <div style={{fontSize:'0.62rem',color:T.text3}}>{timeAgo(conv.updatedAt)}</div>
                                <div style={{fontSize:'0.62rem',color:T.text2,marginTop:'2px'}}>💬 {conv.messages.length}</div>
                                {conv.unreadCount > 0 && (
                                    <div style={{fontSize:'0.65rem',color:'#fff',background:'#22c55e',padding:'2px 6px',borderRadius:'10px',marginTop:'4px',fontWeight:700,display:'inline-block'}}>
                                        {conv.unreadCount} New
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chat view */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {!selected ? (
                    <div style={{ margin:'auto', textAlign:'center', color: T.text2, padding:'40px' }}>
                        <div style={{fontSize:'3rem',marginBottom:'16px'}}>👈</div>
                        <div style={{fontWeight:700, fontSize:'1.1rem', color: T.text}}>Select a conversation</div>
                        <div style={{fontSize:'0.82rem',color:T.text2,marginTop:'6px'}}>Click on a thread from the left panel to view the full conversation and manage AI control.</div>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div style={{ padding:'14px 20px', background: T.surface, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:'14px', flexShrink:0 }}>
                            <div style={{ width:42, height:42, borderRadius:'11px', background:'#8b5cf620', border:'1.5px solid #8b5cf650', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#8b5cf6' }}>
                                {initials(selected.name)}
                            </div>
                            <div style={{flex:1}}>
                                <div style={{ fontWeight:800, color: T.text, fontSize:'0.95rem' }}>{selected.name}</div>
                                <div style={{ fontSize:'0.68rem', color: T.text2, fontFamily:'monospace' }}>{selected.phone}</div>
                            </div>

                            {/* CRM context badges */}
                            {selected.lead && (
                                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                                    {selected.lead.status && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#6366f115',color:'#818cf8'}}>Stage: {typeof selected.lead.status === 'object' ? (selected.lead.status.lookup_value || selected.lead.status.name) : selected.lead.status}</span>}
                                    {selected.lead.source && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#22c55e15',color:'#22c55e'}}>Source: {typeof selected.lead.source === 'object' ? (selected.lead.source.lookup_value || selected.lead.source.name) : selected.lead.source}</span>}
                                    {selected.lead.intent_index && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#f59e0b15',color:'#f59e0b'}}>Intent: {selected.lead.intent_index}%</span>}
                                </div>
                            )}

                            {/* Takeover button */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {!selected.isMatched && (
                                    <button 
                                        onClick={async () => {
                                            if (!selected.phone) return;
                                            toast.loading('Creating lead...', { id: 'conv-lead' });
                                            try {
                                                const res = await activitiesAPI.convertToLead({ 
                                                    phoneNumber: selected.phone, 
                                                    name: selected.name,
                                                    source: `AI WhatsApp`
                                                });
                                                if (res?.success) { 
                                                    toast.success('Lead created!', { id: 'conv-lead' }); 
                                                    onRefresh(); 
                                                }
                                                else toast.error(res?.error || 'Failed', { id: 'conv-lead' });
                                            } catch(e) { toast.error('Error creating lead', { id: 'conv-lead' }); }
                                        }}
                                        style={{
                                            padding: '7px 16px', borderRadius: '9px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', border: 'none',
                                            background: '#059669', color: '#fff',
                                            display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-user-plus"></i> CREATE LEAD
                                    </button>
                                )}
                                <button onClick={() => onTakeover(selected.id, selected.isHandedOff)} style={{
                                    padding:'7px 16px', borderRadius:'9px', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', border:'none',
                                    background: selected.isHandedOff ? '#22c55e20' : '#ef444420',
                                    color: selected.isHandedOff ? '#22c55e' : '#ef4444',
                                    display:'flex', alignItems:'center', gap:'6px',
                                }}>
                                    {selected.isHandedOff ? '🤖 Resume AI' : '👨‍💼 Take Over'}
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div ref={bodyRef} style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'10px', background: T.bg }}>
                            {selected.isHandedOff && (
                                <div style={{ textAlign:'center', margin:'8px 0' }}>
                                    <span style={{ padding:'4px 12px', borderRadius:'20px', background:'#f59e0b15', color:'#f59e0b', fontSize:'0.72rem', fontWeight:700 }}>
                                        👨‍💼 Human operator active — AI paused
                                    </span>
                                </div>
                            )}
                            {selected.messages.map((msg, i) => {
                                const isOut = msg.sender !== 'customer';
                                return (
                                    <div key={i} style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start', gap:'7px', alignItems:'flex-end' }}>
                                        {!isOut && (
                                            <div style={{ width:28, height:28, borderRadius:'50%', background:'#8b5cf620', color:'#8b5cf6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:800, flexShrink:0 }}>
                                                {initials(selected.name)}
                                            </div>
                                        )}
                                        <div style={{ maxWidth:'72%' }}>
                                            {msg.sender==='ai' && <div style={{ fontSize:'0.58rem', color:'#818cf8', fontWeight:800, marginBottom:'3px', textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'4px' }}><span style={{background:'#4f46e5',color:'#fff',padding:'1px 6px',borderRadius:'20px'}}>🤖 AI</span></div>}
                                            {msg.sender==='agent' && <div style={{ fontSize:'0.58rem', color:'#22c55e', fontWeight:800, marginBottom:'3px', textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'4px' }}><span style={{background:'#059669',color:'#fff',padding:'1px 6px',borderRadius:'20px'}}>👨‍💼 AGENT</span></div>}
                                            {msg.sender==='system' && <div style={{ fontSize:'0.58rem', color:'#94a3b8', fontWeight:800, marginBottom:'3px', textAlign:'center' }}>⚙️ SYSTEM</div>}
                                            <div style={{
                                                padding:'10px 14px', borderRadius: isOut?'14px 3px 14px 14px':'3px 14px 14px 14px',
                                                lineHeight:1.5, fontSize:'0.84rem', wordBreak:'break-word',
                                                background: isOut ? (msg.sender==='ai' ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : 'linear-gradient(135deg,#059669,#10b981)') : T.bubble_in,
                                                color: isOut ? '#fff' : T.text,
                                                border: !isOut ? `1px solid ${T.border}` : 'none',
                                                boxShadow: isOut ? '0 3px 10px rgba(0,0,0,0.15)' : 'none',
                                            }}>
                                                {/* Text Content */}
                                                {/* Text Content — Hide technical placeholders if rich media is present */}
                                                {msg.text && !((msg.text.toLowerCase().includes('media attachment') || msg.text.toLowerCase().startsWith('[sent ')) && msg.metadata?.attachment) && (
                                                    <div style={{ marginBottom: msg.metadata?.attachment ? '8px' : 0 }}>{msg.text}</div>
                                                )}
                                                
                                                {/* Header */}
                                                {msg.metadata?.header && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        {msg.metadata.header.format === 'IMAGE' && msg.metadata.header.url ? (
                                                            <div style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', marginBottom: '6px' }} onClick={() => setPreviewMedia(resolveMediaUrl(msg.metadata.header.url))}>
                                                                <img src={resolveMediaUrl(msg.metadata.header.url)} alt="Header" style={{ maxWidth: '100%', maxHeight: '180px', width: '100%', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                                                            </div>
                                                        ) : (
                                                            msg.metadata.header.text && (
                                                                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isOut ? '#fff' : T.text, marginBottom: '4px' }}>
                                                                    {msg.metadata.header.text}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                )}

                                                {/* 🚀 Advanced Rich Media Renderer */}
                                                {msg.metadata?.attachment && (
                                                    <div style={{ marginTop: '4px', borderRadius: '8px', overflow: 'hidden', background: isOut ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.03)', padding: '6px' }}>
                                                        {/* Image */}
                                                        {msg.metadata.attachment.type === 'image' && (
                                                            resolveMediaUrl(msg.metadata.attachment.url) ? (
                                                                <div style={{ cursor: 'pointer' }} onClick={() => setPreviewMedia(resolveMediaUrl(msg.metadata.attachment.url))}>
                                                                    <img src={resolveMediaUrl(msg.metadata.attachment.url)} alt="Shared" style={{ maxWidth: '100%', borderRadius: '6px', display: 'block' }} />
                                                                    {msg.metadata.attachment.caption && <div style={{ fontSize: '0.72rem', marginTop: '4px', opacity: 0.9 }}>{msg.metadata.attachment.caption}</div>}
                                                                </div>
                                                            ) : (
                                                                <div style={{ padding: '6px', fontSize: '0.75rem', opacity: 0.8 }}>🖼️ Shared Image</div>
                                                            )
                                                        )}

                                                        {/* Video */}
                                                        {msg.metadata.attachment.type === 'video' && (
                                                            resolveMediaUrl(msg.metadata.attachment.url) ? (
                                                                <div style={{ borderRadius: '6px', overflow: 'hidden' }}>
                                                                    <video controls src={resolveMediaUrl(msg.metadata.attachment.url)} style={{ maxWidth: '100%', maxHeight: '220px', width: '100%', borderRadius: '6px', display: 'block', background: '#000' }} />
                                                                    {msg.metadata.attachment.caption && <div style={{ fontSize: '0.72rem', marginTop: '4px', opacity: 0.9 }}>{msg.metadata.attachment.caption}</div>}
                                                                </div>
                                                            ) : (
                                                                <div style={{ padding: '6px', fontSize: '0.75rem', opacity: 0.8 }}>🎥 Shared Video</div>
                                                            )
                                                        )}

                                                        {/* Audio */}
                                                        {(msg.metadata.attachment.type === 'audio' || msg.metadata.attachment.type === 'voice') && (
                                                            resolveMediaUrl(msg.metadata.attachment.url) ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px' }}>
                                                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: isOut ? 'rgba(255,255,255,0.2)' : T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                        <i className="fas fa-microphone" style={{ fontSize: '0.75rem' }}></i>
                                                                    </div>
                                                                    <audio controls src={resolveMediaUrl(msg.metadata.attachment.url)} style={{ flex: 1, height: '30px', minWidth: '150px' }} />
                                                                </div>
                                                            ) : (
                                                                <div style={{ padding: '6px', fontSize: '0.75rem', opacity: 0.8 }}>🎵 Audio File</div>
                                                            )
                                                        )}
                                                        
                                                        {/* Document */}
                                                        {msg.metadata.attachment.type === 'document' && (() => {
                                                            const mediaUrl = resolveMediaUrl(msg.metadata.attachment.url);
                                                            const filename = msg.metadata.attachment.filename || 'Document.pdf';
                                                            const badge = getDocBadge(filename, msg.metadata.attachment.mimeType || '');
                                                            return (
                                                                <div 
                                                                    onClick={() => { if (mediaUrl) window.open(mediaUrl, '_blank'); }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', cursor: mediaUrl ? 'pointer' : 'default' }}
                                                                >
                                                                    <div style={{ width: 36, height: 36, borderRadius: '8px', background: badge.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                                                        <i className={`fas ${badge.icon}`} style={{ fontSize: '0.85rem' }}></i>
                                                                        <span style={{ fontSize: '0.5rem', fontWeight: 900 }}>{badge.label}</span>
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isOut ? '#fff' : T.text }}>{filename}</div>
                                                                        <div style={{ fontSize: '0.6rem', opacity: 0.7, color: isOut ? '#fff' : T.text2 }}>{msg.metadata.attachment.mimeType || 'Download'}</div>
                                                                    </div>
                                                                    {mediaUrl && <i className="fas fa-download" style={{ fontSize: '0.8rem', opacity: 0.7, color: isOut ? '#fff' : T.text }}></i>}
                                                                </div>
                                                            );
                                                        })()}
                                                        
                                                        {/* Location */}
                                                        {msg.metadata.attachment.type === 'location' && (
                                                            <div 
                                                                onClick={() => {
                                                                    const lat = msg.metadata.attachment.location?.latitude || msg.metadata.attachment.location?.lat;
                                                                    const lng = msg.metadata.attachment.location?.longitude || msg.metadata.attachment.location?.lng;
                                                                    if (lat && lng) window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                                                }}
                                                                style={{ padding: '8px', cursor: 'pointer' }}
                                                            >
                                                                <div style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '4px', color: isOut ? '#fff' : T.text }}><i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i> {msg.metadata.attachment.location?.name || 'Shared Location'}</div>
                                                                <div style={{ fontSize: '0.65rem', opacity: 0.8, marginBottom: '8px', color: isOut ? '#fff' : T.text2 }}>{msg.metadata.attachment.location?.address || 'Click to view on Google Maps'}</div>
                                                                <div style={{ background: isOut ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', height: '36px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: isOut ? '#fff' : T.accent }}>
                                                                    📍 OPEN IN GOOGLE MAPS
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {/* Contacts */}
                                                        {msg.metadata.attachment.type === 'contacts' && (
                                                            <div style={{ padding: '4px' }}>
                                                                {msg.metadata.attachment.contacts?.map((contact, ci) => (
                                                                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', background: isOut ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.02)', borderRadius: '6px', marginBottom: ci < msg.metadata.attachment.contacts.length - 1 ? '4px' : 0 }}>
                                                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                                                                            {contact.name?.first_name?.[0] || contact.name?.formatted_name?.[0] || '?'}
                                                                        </div>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isOut ? '#fff' : T.text }}>{contact.name?.formatted_name || 'Contact'}</div>
                                                                            <div style={{ fontSize: '0.65rem', opacity: 0.7, color: isOut ? '#fff' : T.text2 }}>{contact.phones?.[0]?.phone || 'No Number'}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Catalogue / Product */}
                                                        {(msg.metadata.attachment.type === 'catalogue' || msg.metadata.attachment.type === 'product') && (() => {
                                                            const cat = msg.metadata.attachment.catalogue || {};
                                                            return (
                                                                <div style={{ borderRadius: '6px', overflow: 'hidden' }}>
                                                                    {cat.image_url && <img src={resolveMediaUrl(cat.image_url)} alt="Product" style={{ width: '100%', maxHeight: '160px', objectFit: 'cover' }} />}
                                                                    <div style={{ padding: '6px' }}>
                                                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isOut ? '#fff' : T.text }}>{cat.title || cat.name || 'Featured Property'}</div>
                                                                        {cat.price && <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isOut ? '#86efac' : '#16a34a', marginTop: '2px' }}>₹ {Number(cat.price).toLocaleString('en-IN')}</div>}
                                                                        {cat.description && <div style={{ fontSize: '0.68rem', opacity: 0.8, marginTop: '2px', color: isOut ? '#fff' : T.text2 }}>{cat.description}</div>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}

                                                {/* Footer */}
                                                {msg.metadata?.footer && (
                                                    <div style={{ fontSize: '0.64rem', fontStyle: 'italic', opacity: 0.75, marginTop: '4px' }}>
                                                        {msg.metadata.footer}
                                                    </div>
                                                )}

                                                {/* Interactive Action Buttons */}
                                                {Array.isArray(msg.metadata?.buttons) && msg.metadata.buttons.length > 0 && (
                                                    <div style={{ marginTop: '6px', borderTop: isOut ? '1px solid rgba(255,255,255,0.2)' : `1px solid ${T.border}`, paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {msg.metadata.buttons.map((btn, bi) => {
                                                            const btnType = (btn.type || '').toUpperCase();
                                                            const btnText = btn.text || btn.title || btn.reply?.title || 'Action';
                                                            const isUrl = btnType === 'URL' || !!btn.url;
                                                            const isCall = btnType === 'PHONE_NUMBER' || btnType === 'CALL' || !!btn.phone_number;
                                                            return (
                                                                <button
                                                                    key={bi}
                                                                    onClick={() => {
                                                                        if (isUrl && btn.url) window.open(btn.url, '_blank');
                                                                        else if (isCall && btn.phone_number) window.open(`tel:${btn.phone_number}`, '_self');
                                                                        else setReplyText(btnText);
                                                                    }}
                                                                    style={{
                                                                        width: '100%', padding: '5px 8px', borderRadius: '5px', border: 'none',
                                                                        background: isOut ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                                                                        color: isOut ? '#fff' : T.accent, fontSize: '0.74rem', fontWeight: 700,
                                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                                                    }}
                                                                >
                                                                    {isUrl && <i className="fas fa-external-link-alt" style={{ fontSize: '0.65rem' }}></i>}
                                                                    {isCall && <i className="fas fa-phone-alt" style={{ fontSize: '0.65rem' }}></i>}
                                                                    {!isUrl && !isCall && <i className="fas fa-reply" style={{ fontSize: '0.65rem' }}></i>}
                                                                    <span>{btnText}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize:'0.58rem', color: T.text3, marginTop:'3px', textAlign:isOut?'right':'left' }}>
                                                {msg.time && !isNaN(new Date(msg.time)) ? new Date(msg.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : (msg.time||'')}
                                                {isOut && ' ✓✓'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Reply input */}
                        <div style={{ padding:'12px 16px', borderTop:`1px solid ${T.border}`, background: T.surface, flexShrink:0 }}>
                            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                                <div style={{ width:6, height:6, borderRadius:'50%', background: selected.isHandedOff ? '#f59e0b' : '#22c55e', flexShrink:0 }} title={selected.isHandedOff ? 'Agent mode' : 'AI mode'}/>
                                
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setShowAttach(!showAttach)} style={{
                                        width:38, height:38, borderRadius:'50%', border:`1px solid ${T.border}`, background: T.badge, color: T.text2, cursor:'pointer',
                                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', transition:'all 0.2s'
                                    }}>
                                        <i className={`fas ${showAttach ? 'fa-times' : 'fa-plus'}`}></i>
                                    </button>
                                    
                                    {showAttach && (
                                        <div style={{
                                            position: 'absolute', bottom: '45px', left: 0, background: T.surface, border: `1px solid ${T.border}`,
                                            borderRadius: '12px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', width: '130px',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 100
                                        }}>
                                            {[
                                                { id: 'image', icon: 'fa-image', label: 'Photo', bg: '#ec4899' },
                                                { id: 'document', icon: 'fa-file-pdf', label: 'Document', bg: '#a855f7' },
                                                { id: 'contact', icon: 'fa-user', label: 'Contact', bg: '#0ea5e9' },
                                                { id: 'location', icon: 'fa-map-marker-alt', label: 'Location', bg: '#059669' }
                                            ].map(item => (
                                                <div key={item.id} onClick={() => item.id === 'image' || item.id === 'document' ? triggerFile(item.id) : sendSpecial(item.id)} 
                                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 9px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }}
                                                    onMouseOver={e => e.currentTarget.style.background = T.badge}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem' }}>
                                                        <i className={`fas ${item.icon}`}></i>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: T.text2 }}>{item.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <input type="text" value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleAISend()}
                                    placeholder={selected.isHandedOff ? 'Type manual reply (WhatsApp)…' : 'AI is handling — type to override…'}
                                    disabled={sendingAI}
                                    style={{ flex:1, padding:'9px 13px', borderRadius:'9px', border:`1px solid ${T.inputBorder}`, background: T.input, color: T.text, fontSize:'0.83rem', outline:'none' }}
                                />

                                <input type="file" id="ai-file-input" style={{ display: 'none' }} onChange={handleFileChange} />

                                <button onClick={() => handleAISend()} disabled={sendingAI||(!replyText.trim() && !pendingFile)} style={{
                                    width:40, height:38, borderRadius:'9px', border:'none', cursor:'pointer',
                                    background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'#fff',
                                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem',
                                    opacity:((!replyText.trim() && !pendingFile)||sendingAI)?0.5:1
                                }}>{sendingAI?'⏳':'➤'}</button>
                            </div>

                            {/* CRM Context strip */}
                            {selected.lead && (
                                <div style={{ display:'flex', gap:'12px', marginTop:'10px', padding:'8px 12px', borderRadius:'8px', background: T.badge, border:`1px solid ${T.border}` }}>
                                    <div style={{flex:1}}>
                                        <div style={{fontSize:'0.58rem',color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'3px'}}>CRM Context</div>
                                        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                                            {formatLeadBudget(selected.lead) !== 'TBA' && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>💰 {formatLeadBudget(selected.lead)}</span>}
                                            {selected.lead.location && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>📍 {typeof selected.lead.location === 'object' ? (selected.lead.location.lookup_value || selected.lead.location.name) : selected.lead.location}</span>}
                                            {selected.lead.requirementType && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>🏠 {selected.lead.requirementType}</span>}
                                            {selected.lead.campaign && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>📢 {selected.lead.campaign}</span>}
                                            {!selected.lead.budget && !selected.lead.location && !selected.lead.requirementType && (
                                                <span style={{fontSize:'0.65rem',color:T.text3}}>Lead data available — open profile for more details</span>
                                            )}
                                        </div>
                                    </div>
                                    {selected.lead._id && (
                                        <button onClick={() => window.open(`/leads/${selected.lead._id}`, '_blank')} style={{
                                            padding:'4px 12px', borderRadius:'7px', border:`1px solid ${T.border}`, background:'transparent', color: T.accent, fontSize:'0.68rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap'
                                        }}>Open Profile →</button>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* EmptyState                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */
function EmptyState({ T, channel }) {
    const ch = CHANNELS.find(c=>c.id===channel)||CHANNELS[0];
    return (
        <div style={{ margin:'80px auto', textAlign:'center', color: T.text2, padding:'20px' }}>
            <div style={{fontSize:'3rem',marginBottom:'14px'}}>{ch.icon}</div>
            <div style={{fontWeight:800, fontSize:'1.1rem', color: T.text}}>No {ch.label} activity</div>
            <div style={{fontSize:'0.82rem', color: T.text2, marginTop:'6px'}}>Switch channel or clear filters to see more.</div>
        </div>
    );
}

/* 🚀 Media Preview Modal */
function MediaPreviewModal({ media, onClose, T }) {
    if (!media) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            <img src={media} alt="Preview" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
            <div style={{ marginTop: '20px', color: '#fff', fontSize: '0.9rem', fontWeight: 600, display: 'flex', gap: '20px' }}>
                <a href={media} download target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'none' }} onClick={e => e.stopPropagation()}><i className="fas fa-download"></i> Download</a>
                <span style={{ cursor: 'pointer' }} onClick={onClose}>Close</span>
            </div>
        </div>
    );
}
