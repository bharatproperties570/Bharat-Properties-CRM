/**
 * CommunicationPage.jsx — Enterprise Omnichannel Hub v4.0
 * 100% backend-live · No mock data · Light + Dark theme · Real message dispatch
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { activitiesAPI, emailAPI, conversationAPI } from '../../utils/api';
import ComposeEmailModal from './components/ComposeEmailModal';
import ViewEmailModal from './components/ViewEmailModal';
import CommunicationFilterPanel from './components/CommunicationFilterPanel';
import { applyCommunicationFilters } from '../../utils/communicationFilterLogic';
import { toast } from 'react-hot-toast';

/* ── Theme tokens ─────────────────────────────────────────────────────────── */
const DARK = {
    bg: '#0c0e1a', bg2: '#10131f', surface: '#151829', surfaceHov: '#1c2038',
    border: 'rgba(255,255,255,0.07)', borderStrong: 'rgba(255,255,255,0.12)',
    text: '#e2e8f0', text2: '#94a3b8', text3: '#475569',
    accent: '#6366f1', accentSoft: 'rgba(99,102,241,0.15)',
    bubble_in: 'rgba(255,255,255,0.07)', bubble_out: 'linear-gradient(135deg,#4f46e5,#6366f1)',
    input: 'rgba(255,255,255,0.05)', inputBorder: 'rgba(255,255,255,0.1)',
    badge: 'rgba(255,255,255,0.06)', badgeText: '#94a3b8',
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
    { id: 'WhatsApp', label: 'WhatsApp',  icon: '💬', color: '#22c55e' },
    { id: 'SMS',      label: 'SMS',       icon: '📱', color: '#f59e0b' },
    { id: 'Email',    label: 'Email',     icon: '📧', color: '#0ea5e9' },
    { id: 'Calls',    label: 'Voice',     icon: '📞', color: '#ec4899' },
];
const OUTCOME_COLOR = { Read:'#059669', Sent:'#0284c7', Delivered:'#0284c7', Failed:'#ef4444', Received:'#059669' };

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
    const [theme,       setTheme]       = useState('light'); // 'light' | 'dark'
    const T = theme === 'dark' ? DARK : LIGHT;

    const [channel,     setChannel]     = useState('all');
    const [subTab,      setSubTab]      = useState('all');   // all | matched | unmatched
    const [activities,  setActivities]  = useState([]);
    const [liveEmails,  setLiveEmails]  = useState([]);
    const [aiConvos,    setAiConvos]    = useState([]);
    const [selected,    setSelected]    = useState(null);   // thread/email item
    const [selectedAI,  setSelectedAI]  = useState(null);   // AI conv
    const [searchQ,     setSearchQ]     = useState('');
    const [filters,     setFilters]     = useState({});
    const [isFilterOpen,setFilterOpen]  = useState(false);
    const [loading,     setLoading]     = useState(true);
    const [refreshing,  setRefreshing]  = useState(false);
    const [composing,   setComposing]   = useState(false);
    const [viewEmail,   setViewEmail]   = useState(false);
    const [emailTarget, setEmailTarget] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [nextPageToken, setNextPageToken] = useState(null);
    const [emailError,    setEmailError]    = useState(null); // 'oauth' | 'network' | null

    /* ── Fetch messaging activities ─── */
    const fetchActivities = useCallback(async (silent = false) => {
        if (!silent) setLoading(true); else setRefreshing(true);
        try {
            const res = await activitiesAPI.getMessagingStream();
            if (res?.success) {
                console.log('[CommHub] Messaging Stream:', res.data); // Debug Log
                setActivities(res.data.map(act => {
                    // 1. Participant Identity
                    let name = act.participant || act.participantName || '';
                    let phone = act.phone || act.phoneNumber || act.participantMobile || '';

                    if (!name) {
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
                    // If backend sends 'via', we trust it. Otherwise fallback to type logic.
                    let via = act.via || 'SMS';
                    const t  = (act.type||'').toLowerCase();
                    const pl = (act.platform||act.details?.platform||'').toLowerCase();

                    if (!act.via) {
                        if (t==='call'||t==='calls')                          via = 'Calls';
                        else if (pl==='whatsapp'||t==='whatsapp')             via = 'WhatsApp';
                        else if (pl==='rcs')                                  via = 'RCS';
                        else if (t==='email' || pl==='email')                 via = 'Email';
                    }

                    // 3. Content & Metadata
                    const snip = act.snippet || act.details?.text || act.details?.message || act.description || act.subject || '';
                    const proj = act.relatedTo?.find(r=>r.model==='Project'||r.model==='Deal');
                    
                    return {
                        id: act._id, 
                        participant: name, 
                        via, 
                        type: act.type || 'Messaging',
                        subject: (proj ? `[${proj.name}] ` : '') + (snip.length > 80 ? snip.slice(0, 80) + '…' : snip),
                        snippet: snip,
                        outcome: act.outcome || act.details?.status || act.status || 'Delivered',
                        duration: act.duration || act.details?.duration || '--',
                        date: act.date || act.timestamp || act.createdAt || act.updatedAt,
                        platform: act.platform || act.details?.platform || 'Direct',
                        isMatched: act.isMatched !== undefined ? act.isMatched : !!(act.entityId || act.relatedTo?.length),
                        phone, 
                        entityId: act.entityId, 
                        entityType: act.entityType,
                        thread: act.thread || act.details?.conversationThread || [],
                        phoneNumber: phone || act.phone || act.phoneNumber,
                    };
                }));
            }
        } catch(e){ console.error(e); } finally { setLoading(false); setRefreshing(false); }
    }, []);

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
                // Structured error code from backend takes priority
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
            // If we have a structured response in the error (from axios)
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
                        lead,
                        messages: (conv.messages||[]).map(m => ({
                            sender: m.role==='user'?'customer':(m.role==='assistant'?'ai':'system'),
                            text: m.content, time: m.timestamp,
                        })),
                        updatedAt: conv.updatedAt,
                    };
                }));
            }
        } catch(e){ console.error(e); }
    }, []);

    /* ── Init & refresh ─── */
    useEffect(() => { fetchActivities(); fetchAIConvos(); }, [fetchActivities, fetchAIConvos]);
    useEffect(() => { if (channel==='Email' && !liveEmails.length && !emailError) fetchEmails(); }, [channel, liveEmails.length, fetchEmails, emailError]);

    // Auto-refresh AI convos every 15s
    useEffect(() => {
        if (channel !== 'AI') return;
        const t = setInterval(fetchAIConvos, 15000);
        return () => clearInterval(t);
    }, [channel, fetchAIConvos]);

    const handleRefresh = () => {
        if (channel==='Email') fetchEmails();
        else if (channel==='AI') fetchAIConvos();
        else fetchActivities(true);
    };

    /* ── Filtered list ─── */
    const allItems = useMemo(() => {
        if (channel==='AI')    return [];
        if (channel==='Email') return liveEmails;
        const base = channel==='all' ? activities : activities.filter(a=>a.via===channel);
        return applyCommunicationFilters(base, filters, searchQ);
    }, [channel, activities, liveEmails, filters, searchQ]);

    const displayItems = useMemo(() => {
        if (subTab==='matched')   return allItems.filter(i=>i.isMatched);
        if (subTab==='unmatched') return allItems.filter(i=>!i.isMatched);
        return allItems;
    }, [allItems, subTab]);

    /* ── KPIs ─── */
    const kpis = useMemo(() => {
        const all = [...activities, ...liveEmails];
        return {
            total:   all.length + aiConvos.length,
            matched: all.filter(i=>i.isMatched).length + aiConvos.filter(c=>c.isMatched).length,
            ai:      aiConvos.length,
            failed:  activities.filter(a=>a.outcome==='Failed').length,
        };
    }, [activities, liveEmails, aiConvos]);

    /* ── Actions ─── */
    const handleSendMessage = async (text, ch) => {
        if (!selected?.phoneNumber && !selected?.phone) return toast.error('No phone number for this thread');
        const phone = selected.phoneNumber || selected.phone;
        try {
            const res = await activitiesAPI.sendReply({
                phoneNumber: phone, message: text, channel: ch.toLowerCase(),
                entityId: selected.entityId, entityType: selected.entityType,
            });
            if (res?.success) {
                setSelected(p => ({ ...p, thread: [...(p.thread||[]), { sender:'agent', text, time: new Date().toISOString() }] }));
                toast.success('Message sent!');
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

    /* ══════════════════════════ RENDER ══════════════════════════════════════ */
    const isDark = theme === 'dark';

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

                    {/* Channel pills */}
                    {CHANNELS.map(ch => (
                        <button key={ch.id} onClick={() => { setChannel(ch.id); setSelected(null); setSelectedAI(null); }} style={{
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
                    <button onClick={() => setTheme(t => t==='dark'?'light':'dark')} title="Toggle theme" style={{
                        padding:'7px 12px', borderRadius:'9px', border:`1px solid ${T.border}`,
                        background: T.badge, color: T.text2, cursor:'pointer', fontSize:'1rem',
                    }}>
                        {isDark ? '☀️' : '🌙'}
                    </button>

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
                                { id:'all',       label:`All (${allItems.length})` },
                                { id:'matched',   label:`✅ Matched (${allItems.filter(i=>i.isMatched).length})` },
                                { id:'unmatched', label:`⚠️ Unmatched (${allItems.filter(i=>!i.isMatched).length})` },
                            ].map(st => (
                                <button key={st.id} onClick={() => setSubTab(st.id)} style={{
                                    padding:'5px 13px', borderRadius:'6px', border:'none', cursor:'pointer',
                                    background: subTab===st.id ? T.accentSoft : 'transparent',
                                    color: subTab===st.id ? T.accent : T.text2,
                                    fontSize:'0.74rem', fontWeight:700, transition:'all 0.15s',
                                    borderBottom: subTab===st.id ? `2px solid ${T.accent}` : '2px solid transparent',
                                }}>{st.label}</button>
                            ))}
                            <div style={{marginLeft:'auto', fontSize:'0.68rem', color: T.text3, fontWeight:600}}>
                                {displayItems.length} record{displayItems.length!==1?'s':''}
                            </div>
                        </div>
                    )}

                    {/* ── AI Bot View ── */}
                    {channel === 'AI' ? (
                        <AIBotView T={T} isDark={isDark} convos={aiConvos} selected={selectedAI} onSelect={setSelectedAI} onTakeover={handleAITakeover} onRefresh={fetchAIConvos} />
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
                                                        const res = await emailAPI.getOAuthUrl();
                                                        if (res?.success && res.data) window.open(res.data, '_blank');
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

                            {loading ? (
                                [...Array(8)].map((_,i) => (
                                    <div key={i} style={{ height:80, borderRadius:'12px', background: T.surface, opacity:0.4+i*0.06, animation:'cpulse 1.4s ease-in-out infinite', animationDelay:`${i*0.08}s` }}/>
                                ))
                            ) : !emailError && displayItems.length === 0 ? (
                                <EmptyState T={T} channel={channel} />
                            ) : !emailError && displayItems.map(item => (
                                <InboxRow key={item.id} item={item} T={T} isDark={isDark} isSelected={selected?.id===item.id}
                                    onClick={() => {
                                        if (item.via==='Email') { setEmailTarget(item); setViewEmail(true); }
                                        else setSelected(item);
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
                {selected && channel !== 'AI' && (
                    <ThreadPanel item={selected} T={T} isDark={isDark} onClose={() => setSelected(null)} onSend={handleSendMessage} />
                )}
            </div>

            {/* CSS animations */}
            <style>{`@keyframes cpulse{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>

            {/* Modals */}
            <CommunicationFilterPanel isOpen={isFilterOpen} onClose={()=>setFilterOpen(false)} filters={filters} onFilterChange={(k,v)=>setFilters(p=>({...p,[k]:v}))} onReset={()=>setFilters({})} />
            <ComposeEmailModal isOpen={composing} onClose={()=>setComposing(false)} onSent={fetchEmails} />
            <ViewEmailModal isOpen={viewEmail} onClose={()=>setViewEmail(false)} email={emailTarget} onReply={e=>{setEmailTarget(e);setComposing(true);}} onConvertToLead={handleConvertToLead} isActionLoading={actionLoading} />
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

                {/* Row 2: subject/snippet */}
                <div style={{
                    fontSize: '0.78rem', color: T.text2, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {item.subject || item.snippet || '(no message preview)'}
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
function ThreadPanel({ item, T, isDark, onClose, onSend }) {
    const [text, setText] = useState('');
    const [ch, setCh]     = useState(item.via==='WhatsApp'?'WhatsApp':(item.via==='SMS'?'SMS':'WhatsApp'));
    const [sending, setSending] = useState(false);
    const bodyRef = useRef(null);
    const chObj = CHANNELS.find(c=>c.id===item.via)||CHANNELS[0];

    useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [item.thread]);

    const handleSend = async () => {
        if (!text.trim()||sending) return;
        setSending(true);
        try { await onSend(text, ch); setText(''); } finally { setSending(false); }
    };

    return (
        <div style={{ width:'400px', minWidth:'400px', display:'flex', flexDirection:'column', background: T.surface, borderLeft:`1px solid ${T.border}`, height:'100%' }}>
            {/* Header */}
            <div style={{ padding:'14px 18px', background: `${chObj.color}12`, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:'11px', flexShrink:0 }}>
                <div style={{ width:40, height:40, borderRadius:'10px', background:`${chObj.color}25`, border:`1.5px solid ${chObj.color}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.85rem', fontWeight:800, color:chObj.color }}>
                    {initials(item.participant)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800, color: T.text, fontSize:'0.9rem'}}>{item.participant}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'2px'}}>
                        <span style={{fontSize:'0.62rem',padding:'2px 7px',borderRadius:'20px',background:`${chObj.color}18`,color:chObj.color,fontWeight:800,textTransform:'uppercase'}}>{chObj.icon} {item.via}</span>
                        {item.isMatched && <span style={{fontSize:'0.62rem',color:'#22c55e',fontWeight:700}}>✓ CRM Linked</span>}
                        {item.phone && <span style={{fontSize:'0.62rem',color:T.text3,fontFamily:'monospace'}}>{item.phone}</span>}
                    </div>
                </div>
                <button onClick={onClose} style={{ width:28, height:28, borderRadius:'7px', border:`1px solid ${T.border}`, background: T.badge, color: T.text2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem' }}>✕</button>
            </div>

            {/* Body */}
            <div ref={bodyRef} style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:'9px' }}>
                {(!item.thread||item.thread.length===0) ? (
                    <div style={{textAlign:'center',margin:'auto',color:T.text2,padding:'30px'}}>
                        <div style={{fontSize:'2.2rem',marginBottom:'10px'}}>💬</div>
                        <div style={{fontWeight:700, color: T.text2}}>No messages yet</div>
                        <div style={{fontSize:'0.78rem',color:T.text3,marginTop:'4px'}}>Use the input below to start the conversation.</div>
                    </div>
                ) : item.thread.map((msg, i) => {
                    const isOut = msg.sender !== 'customer';
                    return (
                        <div key={i} style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start', alignItems:'flex-end', gap:'7px' }}>
                            {!isOut && (
                                <div style={{width:26,height:26,borderRadius:'50%',background:`${chObj.color}25`,color:chObj.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:800,flexShrink:0}}>
                                    {initials(item.participant)}
                                </div>
                            )}
                            <div style={{maxWidth:'76%'}}>
                                {msg.sender==='ai' && <div style={{fontSize:'0.58rem',color:'#818cf8',fontWeight:800,marginBottom:'2px',textAlign:'right'}}>🤖 AI BOT</div>}
                                {msg.sender==='agent' && <div style={{fontSize:'0.58rem',color:'#22c55e',fontWeight:800,marginBottom:'2px',textAlign:'right'}}>👨‍💼 AGENT</div>}
                                <div style={{
                                    padding:'9px 13px', lineHeight:1.5, fontSize:'0.84rem', wordBreak:'break-word',
                                    borderRadius: isOut ? '14px 3px 14px 14px' : '3px 14px 14px 14px',
                                    background: isOut ? (msg.sender==='ai' ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : (msg.sender==='agent' ? 'linear-gradient(135deg,#059669,#10b981)' : `linear-gradient(135deg,${chObj.color},${chObj.color}cc)`)) : T.bubble_in,
                                    color: isOut ? '#fff' : T.text,
                                    border: !isOut ? `1px solid ${T.border}` : 'none',
                                    boxShadow: isOut ? '0 3px 10px rgba(0,0,0,0.15)' : 'none',
                                }}>
                                    {msg.text}
                                </div>
                                <div style={{fontSize:'0.58rem',color:T.text3,marginTop:'3px',textAlign:isOut?'right':'left'}}>
                                    {msg.time && !isNaN(new Date(msg.time)) ? new Date(msg.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : (msg.time||'')}
                                    {isOut && ' ✓✓'}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 14px', borderTop:`1px solid ${T.border}`, background: T.surface, flexShrink:0 }}>
                {/* Channel switcher */}
                <div style={{display:'flex',gap:'5px',marginBottom:'9px'}}>
                    {['WhatsApp','SMS','RCS'].map(c2=>(
                        <button key={c2} onClick={()=>setCh(c2)} style={{
                            padding:'4px 11px', borderRadius:'20px', border:'none', cursor:'pointer', fontSize:'0.68rem', fontWeight:700, transition:'all 0.14s',
                            background: ch===c2 ? T.accentSoft : T.badge,
                            color: ch===c2 ? T.accent : T.text2,
                        }}>{c2}</button>
                    ))}
                </div>

                <div style={{display:'flex',gap:'7px'}}>
                    <input type="text" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()}
                        placeholder={`Reply via ${ch}…`} disabled={sending}
                        style={{ flex:1, padding:'9px 13px', borderRadius:'9px', border:`1px solid ${T.inputBorder}`, background: T.input, color: T.text, fontSize:'0.83rem', outline:'none' }}
                    />
                    <button onClick={handleSend} disabled={sending||!text.trim()} style={{
                        width:40, height:38, borderRadius:'9px', border:'none', cursor:'pointer',
                        background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color:'#fff',
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem',
                        boxShadow:'0 3px 10px rgba(99,102,241,0.35)',
                        opacity: (!text.trim()||sending)?0.5:1, transition:'all 0.18s',
                    }}>{sending ? '⏳' : '➤'}</button>
                </div>
                <div style={{fontSize:'0.6rem',color:T.text3,marginTop:'7px',textAlign:'center'}}>🤖 AI pauses 15 min after manual reply</div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* AIBotView — Professional AI conversation manager                           */
/* ══════════════════════════════════════════════════════════════════════════ */
function AIBotView({ T, isDark, convos, selected, onSelect, onTakeover, onRefresh }) {
    const [replyText, setReplyText] = useState('');
    const [sendingAI, setSendingAI] = useState(false);
    const bodyRef = useRef(null);

    useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [selected?.messages]);

    const handleAISend = async () => {
        if (!replyText.trim()||sendingAI||!selected) return;
        setSendingAI(true);
        try {
            const phone = selected.phone;
            const res = await activitiesAPI.sendReply({ phoneNumber: phone, message: replyText, channel: 'whatsapp' });
            if (res?.success) {
                onSelect(p => ({ ...p, messages: [...(p.messages||[]), { sender:'agent', text:replyText, time: new Date().toISOString() }] }));
                setReplyText('');
                toast.success('Message sent!');
            }
        } catch(e) { toast.error('Send failed'); } finally { setSendingAI(false); }
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
                    <div key={conv.id} onClick={() => onSelect(conv)} style={{
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
                                    <div style={{fontSize:'0.7rem',color:T.text3,marginTop:'3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                        {conv.messages[conv.messages.length-1]?.text?.slice(0,50)||''}
                                    </div>
                                )}
                            </div>
                            <div style={{textAlign:'right',flexShrink:0}}>
                                <div style={{fontSize:'0.62rem',color:T.text3}}>{timeAgo(conv.updatedAt)}</div>
                                <div style={{fontSize:'0.62rem',color:T.text2,marginTop:'2px'}}>💬 {conv.messages.length}</div>
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
                                    {selected.lead.status && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#6366f115',color:'#818cf8'}}>Stage: {selected.lead.status}</span>}
                                    {selected.lead.source && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#22c55e15',color:'#22c55e'}}>Source: {selected.lead.source}</span>}
                                    {selected.lead.intent_index && <span style={{padding:'3px 9px',borderRadius:'20px',fontSize:'0.63rem',fontWeight:800,background:'#f59e0b15',color:'#f59e0b'}}>Intent: {selected.lead.intent_index}%</span>}
                                </div>
                            )}

                            {/* Takeover button */}
                            <button onClick={() => onTakeover(selected.id, selected.isHandedOff)} style={{
                                padding:'7px 16px', borderRadius:'9px', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', border:'none',
                                background: selected.isHandedOff ? '#22c55e20' : '#ef444420',
                                color: selected.isHandedOff ? '#22c55e' : '#ef4444',
                                display:'flex', alignItems:'center', gap:'6px',
                            }}>
                                {selected.isHandedOff ? '🤖 Resume AI' : '👨‍💼 Take Over'}
                            </button>
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
                                                {msg.text}
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
                                <input type="text" value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleAISend()}
                                    placeholder={selected.isHandedOff ? 'Type manual reply (WhatsApp)…' : 'AI is handling — type to override…'}
                                    disabled={sendingAI}
                                    style={{ flex:1, padding:'9px 13px', borderRadius:'9px', border:`1px solid ${T.inputBorder}`, background: T.input, color: T.text, fontSize:'0.83rem', outline:'none' }}
                                />
                                <button onClick={handleAISend} disabled={sendingAI||!replyText.trim()} style={{
                                    width:40, height:38, borderRadius:'9px', border:'none', cursor:'pointer',
                                    background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'#fff',
                                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem',
                                    opacity:(!replyText.trim()||sendingAI)?0.5:1
                                }}>{sendingAI?'⏳':'➤'}</button>
                            </div>

                            {/* CRM Context strip */}
                            {selected.lead && (
                                <div style={{ display:'flex', gap:'12px', marginTop:'10px', padding:'8px 12px', borderRadius:'8px', background: T.badge, border:`1px solid ${T.border}` }}>
                                    <div style={{flex:1}}>
                                        <div style={{fontSize:'0.58rem',color:T.text3,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'3px'}}>CRM Context</div>
                                        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                                            {selected.lead.budget && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>💰 {selected.lead.budget}</span>}
                                            {selected.lead.location && <span style={{fontSize:'0.65rem',color:T.text2,fontWeight:600}}>📍 {selected.lead.location}</span>}
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
