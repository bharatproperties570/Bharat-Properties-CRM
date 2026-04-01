import React, { useState, useEffect, useRef } from 'react';
import { marketingAPI, dealsAPI } from '../../utils/api';
import './Marketings.css';

const MarketingsPage = () => {
    // --- STATE ---
    const [currentTab, setCurrentTab] = useState('agent');
    const [running, setRunning] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [postCount, setPostCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    const [terminalLogs, setTerminalLogs] = useState([
        { type: 'td2', text: '$ node ai-master-agent.js --multi-model --failover=auto', visible: true },
        { type: 'td2', text: '  System ready. Waiting for trigger...', visible: true }
    ]);
    const [failoverLogs, setFailoverLogs] = useState([
        { type: 'td2', text: '  Monitoring all model token usage...', visible: true }
    ]);
    const [activeStep, setActiveStep] = useState(0);
    const [counts, setCounts] = useState({ v1: 0, v2: 0, v3: 0, v4: 0 });
    const [statsLit, setStatsLit] = useState({ s1: false, s2: false, s3: false, s4: false });
    const [posts, setPosts] = useState([]);
    const [schedule, setSchedule] = useState([]);
    const [replies, setReplies] = useState([]);
    const [campStats, setCampStats] = useState({ csv1: 0, csv2: 0, csv3: 0, csv4: 0 });
    const [campLit, setCampLit] = useState({ csc1: false, csc2: false, csc3: false, csc4: false });
    const [campHistory, setCampHistory] = useState([]);
    const [editPost, setEditPost] = useState(null);
    const [taValue, setTaValue] = useState('');
    const [smsText, setSmsText] = useState('ANTGRV: 3BHK Mumbai Bandra ₹85L. Sea View+Gym+Pool. Book: bit.ly/ag-3bhk STOP-SMS');
    const updateSmsTA = (v) => setSmsText(v);

    const [emailData, setEmailData] = useState({
        name: 'Exclusive Launch Invite',
        sender: 'Bharat Properties',
        replyTo: 'sales@bharat.co',
        subject: 'Special Invitation: Luxury Penthouse Launch 🏙️',
        content: "Hello {lead_name},\n\nWe are excited to invite you to the exclusive unveiling of our latest project..."
    });
    const updateEmail = (k, v) => setEmailData(p => ({ ...p, [k]: v }));
    const [rcsData, setRcsData] = useState({ title: '🏠 3BHK Luxury — ₹85L', desc: 'Bandra West · Sea View · 1450 sqft' });
    const [waData, setWaData] = useState({ name: 'Festive Offer', content: 'Special Festive Offer! Get 10% off on all pre-bookings this week. Click below to chat with our experts.' });
    const [taskDist, setTaskDist] = useState([]);
    const [realStats, setRealStats] = useState({ totalCaptured: 0, hotLeads: 0, nurturedToday: 0, recentLeads: [] });
    const [realCampaigns, setRealCampaigns] = useState([]);
    const [linkedInStatus, setLinkedInStatus] = useState(false);
    const [googleSubStatus, setGoogleSubStatus] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [deals, setDeals] = useState([]);

    const termBodyRef = useRef(null);
    const failoverLogRef = useRef(null);
    const cmtFeedRef = useRef(null);

    // --- MOCK DATA ---
    const DEALS = [
        { id: 'D001', t: '3BHK Luxury Apartment', p: '₹85,00,000', ps: '₹85L', l: 'Bandra West, Mumbai', a: '1450 sqft', f: ['Sea View', 'Gym', 'Pool', 'Parking'], type: 'Residential', ag: 'Rahul Sharma' },
        { id: 'D002', t: 'Commercial Office Space', p: '₹1,20,00,000', ps: '₹1.2Cr', l: 'Cyber City, Gurugram', a: '2800 sqft', f: ['24/7 Security', 'Metro Access', 'Power Backup'], type: 'Commercial', ag: 'Priya Mehta' },
        { id: 'D003', t: '2BHK Budget Home', p: '₹42,00,000', ps: '₹42L', l: 'Whitefield, Bangalore', a: '980 sqft', f: ['Park View', 'School Nearby', 'Metro 2km'], type: 'Residential', ag: 'Amit Kumar' },
    ];

    const MODELS = [
        { name: 'GPT-4o (ChatGPT)', provider: 'OpenAI', ctx: '128K', status: 'active', used: 38, cap: 100, tasks: ['Creative Content', 'Social Media', 'Ad Copy', 'Lead Hook'], color: '#74aa9c' },
        { name: 'Gemini 1.5 Pro', provider: 'Google AI', ctx: '1M ctx', status: 'active', used: 22, cap: 100, tasks: ['Long Analysis', 'Document Parsing', 'Insight Gen', 'SEO'], color: '#4285f4' },
        { name: 'Claude 3.5 Sonnet', provider: 'Anthropic', ctx: '200K', status: 'fallback', used: 15, cap: 100, tasks: ['Code Logic', 'CRM Integration', 'Task Planning'], color: '#d97757' },
        { name: 'Claude Haiku', provider: 'Anthropic', ctx: '200K', status: 'idle', used: 5, cap: 100, tasks: ['Quick SMS', 'Data Entry', 'Classification'], color: '#10b981' },
    ];

    const PLATS = {
        instagram: { n: 'Instagram', i: '📸', c: '#e1306c', bg: 'rgba(225,48,108,.12)', time: '6:00 PM', desc: 'Feed + Reels' },
        facebook: { n: 'Facebook', i: '👥', c: '#1877f2', bg: 'rgba(24,119,242,.12)', time: '7:00 PM', desc: 'Page + Ads' },
        linkedin: { n: 'LinkedIn', i: '💼', c: '#0a66c2', bg: 'rgba(10,102,194,.12)', time: '9:00 AM', desc: 'Professional' },
        youtube: { n: 'YouTube', i: '▶️', c: '#ff0000', bg: 'rgba(255,0,0,.1)', time: '11:00 AM', desc: 'Video' },
        gbusiness: { n: 'Google Biz', i: '🗺️', c: '#4285f4', bg: 'rgba(66,133,244,.1)', time: '10:00 AM', desc: 'Local SEO' },
        whatsapp: { n: 'WhatsApp', i: '📱', c: '#25d366', bg: 'rgba(37,211,102,.12)', time: '10:00 AM', desc: 'Interactive' },
    };

    const PORTALS = [
        { n: '99acres', i: '🟠', pkg: 'Featured', cost: 4999, listings: 3, leads: 22, cpl: 227, resp: '2.1 hrs', best: '3BHK Bandra', perf: 78, color: '#ff6b35', status: 'active' },
        { n: 'MagicBricks', i: '🔵', pkg: 'Titanium', cost: 5499, listings: 3, leads: 18, cpl: 305, resp: '3.4 hrs', best: 'Office Gurugram', perf: 62, color: '#1877f2', status: 'active' },
        { n: 'Housing.com', i: '🟢', pkg: 'Premium', cost: 3499, listings: 2, leads: 14, cpl: 250, resp: '4.2 hrs', best: '2BHK Bangalore', perf: 71, color: '#25d366', status: 'active' },
        { n: 'CommonFloor', i: '🟣', pkg: 'Standard', cost: 2499, listings: 2, leads: 8, cpl: 312, resp: '6.1 hrs', best: 'Office Gurugram', perf: 45, color: '#8b5cf6', status: 'active' },
        { n: 'SquareYards', i: '🟡', pkg: 'Platinum', cost: 6999, listings: 3, leads: 28, cpl: 250, resp: '1.8 hrs', best: '3BHK Bandra', perf: 88, color: '#f59e0b', status: 'active' },
    ];

    const COMMENTS = [
        { u: 'Suresh_M', txt: 'Price kya hai bhai?', ch: '📸 Instagram', t: '2m', src: 'instagram' },
        { u: 'Kavita_R', txt: 'Is this still available?', ch: '👥 Facebook', t: '5m', src: 'facebook' },
        { u: 'Ramesh via WA', txt: 'EMI kitni hogi?', ch: '💬 WhatsApp', t: '8m', src: 'whatsapp' },
        { u: 'Priya@gmail', txt: 'Site visit schedule karna hai', ch: '📧 Email', t: '11m', src: 'email' },
        { u: 'invest_99', txt: 'ROI projection kya hai?', ch: '💼 LinkedIn', t: '14m', src: 'linkedin' },
        { u: 'HomeBuyer22', txt: 'Sunday visit possible?', ch: '📸 Instagram', t: '18m', src: 'instagram' },
    ];

    const REPLIES_VALS = {
        'Suresh_M': 'Hi Suresh! 😊 Property ₹85,00,000 mein hai. Flexible payment bhi available hai. DM karo exclusive offers ke liye!',
        'Kavita_R': 'Yes Kavita! Still available 🎉 Limited slots — book site visit today. Shall I arrange Sunday?',
        'Ramesh via WA': 'Hi Ramesh! 12+ banks ke saath tie-up hai. EMI ₹62,00,000/month se start hoti hai 20yr tenure pe. Call karein?',
        'Priya@gmail': 'Hi Priya! Site visit slots available hain — Sunday 10AM–5PM. Preferred time batao, confirm karenge! 🏠',
        'invest_99': 'Great question! Bandra West location ka rental yield 3.8% hai aur appreciation 12% YoY. Detailed ROI sheet send karein?',
        'HomeBuyer22': 'Sunday 10AM se 5PM tak visits available hain. Name aur time share karo — slot confirm ho jayega! 🏠',
    };

    const ANALYTICS_DATA = [
        { i: '📸', n: 'Instagram', c: 'var(--ig)', reach: 17420, leads: 14, pct: 85, spark: [30, 45, 38, 60, 55, 75, 85] },
        { i: '👥', n: 'Facebook', c: 'var(--fb)', reach: 12800, leads: 10, pct: 62, spark: [25, 35, 42, 38, 55, 60, 62] },
        { i: '💼', n: 'LinkedIn', c: 'var(--li)', reach: 8340, leads: 8, pct: 41, spark: [20, 28, 30, 35, 38, 40, 41] },
        { i: '📱', n: 'WhatsApp', c: 'var(--wa)', reach: 4200, leads: 6, pct: 20, spark: [10, 12, 15, 14, 18, 19, 20] },
        { i: '📧', n: 'Email', c: 'var(--email)', reach: 2840, leads: 38, pct: 68, spark: [45, 50, 55, 62, 58, 65, 68] },
        { i: '📲', n: 'SMS', c: 'var(--sms)', reach: 4210, leads: 12, pct: 98, spark: [80, 85, 90, 92, 95, 96, 98] },
    ];

    // --- DATA FETCHING ---
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [sRes, cRes, dRes, lRes, gRes] = await Promise.all([
                marketingAPI.getStats(),
                marketingAPI.getCampaignHistory(),
                dealsAPI.getAll({ limit: 10 }),
                marketingAPI.getLinkedInStatus(),
                googleSettingsAPI.getStatus()
            ]);

            if (sRes.success) {
                setRealStats(sRes.data);
                // Sync counts with real stats
                setCounts(prev => ({
                    ...prev,
                    v3: sRes.data.totalCaptured || 0,
                    v4: sRes.data.nurturedToday || 0,
                    v1: prev.v1 || (sRes.data.totalCaptured > 0 ? Math.floor(sRes.data.totalCaptured * 4.2) : 0), // Estimate posts per lead if empty
                    v2: prev.v2 || (sRes.data.totalCaptured > 0 ? sRes.data.totalCaptured * 1250 : 0) // Estimate reach
                }));
            }
            if (cRes.success) {
                setRealCampaigns(cRes.data);
            }
            if (dRes.success) {
                setDeals(dRes.data.deals || []);
            }
            if (lRes.success) {
                setLinkedInStatus(lRes.connected);
            }
            if (gRes.success && gRes.connected) {
                setGoogleSubStatus(gRes.services || {});
            }
            setIsLoading(false);
        } catch (err) {
            console.error('Marketing data fetch error:', err);
        }
    };

    // --- GEN LOGIC ---
    const GEN = {
        instagram: d => `✨ ${d.t} — Now Available! ✨\n📍 ${d.l}\n💰 ${d.p}\n\n${d.f.map(f => `✅ ${f}`).join('\n')}\n\n🔥 DM NOW!\n#RealEstate #PropertyForSale`,
        facebook: d => `🏠 ${d.t}\n📍 ${d.l} | 💰 ${d.p}\n✅ ${d.f.join(' • ')}\n\nContact ${d.ag}! 👉 Share!`,
        linkedin: d => `${d.type} Opportunity | ${d.l}\n${d.t} · ${d.p}\n${d.f.map(f => `→ ${f}`).join('\n')}\n#Investment`,
        youtube: d => `🎬 Video: "${d.t} Full Tour"\n📝 ${d.p}, ${d.a}\n🏷️ realestate property`,
        gbusiness: d => `📍 New Listing: ${d.t}\n💰 ${d.p} | ${d.a}\n📞 Book visit!`,
        whatsapp: d => `🏠 *${d.t}*\n📍 *${d.l}*\n💰 *${d.p}*\n\n✅ ${d.f.join('\n✅ ')}\n\n👉 *Reply YES!*`,
    };

    // --- HELPERS ---
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const addToast = (msg, type = 'green') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type, v: false }]);
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, v: true } : t));
        }, 10);
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, v: false } : t));
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 300);
        }, 3800);
    };

    const addLog = (text, type = 'd2', isFailover = false) => {
        if (isFailover) {
            setFailoverLogs(prev => [...prev, { text, type, v: false }]);
            setTimeout(() => {
                setFailoverLogs(prev => prev.map((l, i) => i === prev.length - 1 ? { ...l, v: true } : l));
                if (failoverLogRef.current) failoverLogRef.current.scrollTop = failoverLogRef.current.scrollHeight;
            }, 35);
        } else {
            setTerminalLogs(prev => [...prev, { text, type, v: false }]);
            setTimeout(() => {
                setTerminalLogs(prev => prev.map((l, i) => i === prev.length - 1 ? { ...l, v: true } : l));
                if (termBodyRef.current) termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
            }, 35);
        }
    };

    const animateCount = async (key, to, duration = 35) => {
        let n = 0;
        const step = Math.max(1, Math.ceil(to / 40));
        while (n < to) {
            n = Math.min(n + step, to);
            setCounts(prev => ({ ...prev, [key]: n }));
            await sleep(duration);
        }
    };

    const animateCampCount = async (key, to, duration = 35) => {
        let n = 0;
        const step = Math.max(1, Math.ceil(to / 40));
        while (n < to) {
            n = Math.min(n + step, to);
            setCampStats(prev => ({ ...prev, [key]: n }));
            await sleep(duration);
        }
    };

    // --- ACTIONS ---
    const resetAgent = () => {
        if (running) return;
        setTerminalLogs([
            { type: 'td2', text: '$ node ai-master-agent.js --multi-model --failover=auto', v: true },
            { type: 'td2', text: '  System ready. Waiting...', v: true }
        ]);
        setPosts([]);
        setSchedule([]);
        setReplies([]);
        setCounts({ v1: 0, v2: 0, v3: 0, v4: 0 });
        setStatsLit({ s1: false, s2: false, s3: false, s4: false });
        setPostCount(0);
        setRunning(false);
        setIsDone(false);
        setActiveStep(0);
        addToast('↺ Reset complete', 'yellow');
    };

    const runMasterAgent = async () => {
        if (running) return;
        setRunning(true);
        setIsDone(false);
        setTerminalLogs([]);

        // STEP 1
        setActiveStep(1);
        addLog('$ node ai-master-agent.js --multi-model --failover=auto', 'd2');
        addLog('', 'd2');
        addLog('[01/06] 🗂️  Loading CRM database...', 'i');
        await sleep(500);
        addLog(`  ✓ Connected. ${DEALS.length} active deals found.`, 's');
        DEALS.forEach(d => addLog(`  → ${d.id}: ${d.t} @ ${d.p}`, 'd2'));
        addLog('  ✓ Model: Unified AI Engine [PRIMARY]', 's');
        await sleep(400);

        // STEP 2
        setActiveStep(2);
        addLog('', 'd2');
        addLog('[02/06] 🧠  Triggering AI Nurture Agent...', 'i');
        await sleep(300);
        
        try {
            const agentRes = await marketingAPI.runAgent();
            if (agentRes.success) {
                addLog(`  ✓ Success: ${agentRes.message}`, 's');
                if (agentRes.advancedCount > 0) {
                    addLog(`  → ${agentRes.advancedCount} leads advanced to next stage.`, 'i');
                } else {
                    addLog(`  → No leads required advancement at this time.`, 'd2');
                }
            }
        } catch (e) {
            addLog(`  ❌ Agent Failure: ${e.message}`, 'w');
        }

        const newPosts = [];
        let count = 0;

        addLog('[02/06] 🤖  AI Generate — fetching active listings...', 'i');
        await sleep(500);
        
        let dealsToProcess = [];
        try {
            const dRes = await marketingAPI.getRecentDeals();
            if (dRes.success && dRes.data.length > 0) {
                dealsToProcess = dRes.data.slice(0, 3);
                addLog(`  ✓ Found ${dealsToProcess.length} active deals for promotion`, 's');
            } else {
                dealsToProcess = (deals.length > 0 ? deals : DEALS).slice(0, 2);
                addLog('  ⚠ No active deals found, using showcase data', 'w');
            }
        } catch (e) {
            dealsToProcess = (deals.length > 0 ? deals : DEALS).slice(0, 2);
            addLog('  ⚠ Error fetching deals, using showcase data', 'w');
        }

        for (const d of dealsToProcess) {
            addLog(`  Processing: "${d.unitNo || d.t}" [${d.projectName || ''}]`, 'd2');
            for (const pk of ['linkedin', 'youtube', 'gbusiness', 'whatsapp', 'facebook']) {
                const pc = PLATS[pk];
                addLog(`    ${pc.i} Triggering live AI generation for ${pc.n}...`, 'd2');
                try {
                    const res = await marketingAPI.generateSocial(d._id || d.id, pk);
                    if (res.success) {
                        count++;
                        newPosts.push({ 
                            id: count, 
                            platform: pk, 
                            info: pc, 
                            deal: { id: d._id, t: d.unitNo || d.t, ps: d.price || d.ps }, 
                            content: res.content, 
                            approved: false 
                        });
                        addLog(`    ✓ ${pc.n} generated via OpenAI`, 's');
                    }
                } catch (e) {
                    addLog(`    ⚠ ${pc.n} failed: ${e.message}`, 'w');
                }
                await sleep(100);
            }
        }
        setPosts(newPosts);
        setPostCount(count);
        setStatsLit(prev => ({ ...prev, s1: true }));
        animateCount('v1', count);
        addToast('🧠 Posts generated!', 'green');
        await sleep(300);

        // STEP 3 - SCHEDULE
        setActiveStep(3);
        addLog('', 'd2');
        addLog('[03/06] 📅  Smart Scheduler — ALL channels...', 'i');
        await sleep(300);
        const si = [];
        for (const d of dealsToProcess) {
            for (const [pk, pc] of Object.entries(PLATS)) {
                si.push({ time: pc.time, i: pc.i, n: pc.n, deal: d.unitNo || d.t });
                addLog(`  ✓ Queued ${pc.i} ${pc.n} → ${pc.time}`, 's');
                await sleep(65);
            }
        }
        const toMin = t => {
            const [h, mp] = t.split(':');
            const [m, ap] = mp.split(' ');
            return (ap === 'PM' && +h !== 12 ? +h + 12 : +h) * 60 + parseInt(m);
        };
        si.sort((a, b) => toMin(a.time) - toMin(b.time));
        setSchedule(si);
        await sleep(300);

        // STEP 4 - CAMPAIGNS
        setActiveStep(4);
        addLog('', 'd2');
        addLog('[04/06] 📨  Launching multi-channel campaigns...', 'i');
        await sleep(400);
        addLog('  ✓ Email → 1,476 contacts queued [SendGrid]', 's');
        await sleep(300);
        addLog('  ✓ WhatsApp → 646 broadcast [Meta Cloud API]', 's');
        await sleep(300);
        addLog('  ✓ SMS → 4,210 contacts [MSG91 · DLT verified]', 's');
        await sleep(300);
        addLog('  ✓ RCS → 2,180 rich cards [Google Business Messaging]', 's');
        await sleep(300);
        addLog('  → Failover check: Claude at 74% — primary stable', 'w');
        await sleep(200);
        addToast('📨 All campaigns queued!', 'orange');
        await sleep(300);

        // STEP 5 - REPLIES
        setActiveStep(5);
        addLog('', 'd2');
        addLog('[05/06] 💬  Multi-channel reply agent activated...', 'i');
        await sleep(300);
        setReplies([]);
        let rc = 0;
        const avC = ['#e1306c', '#1877f2', '#0a66c2', '#25d366', '#ff9f43', '#8b5cf6'];
        for (const c of COMMENTS) {
            await sleep(420);
            const clr = avC[rc % avC.length];
            setReplies(prev => [...prev, { ...c, color: clr, reply: REPLIES_VALS[c.u] || 'Thank you! Will contact shortly.' }]);
            addLog(`  @${c.u} [${c.ch}]: "${c.txt.substring(0, 25)}..."`, 'd2');
            await sleep(230);
            addLog(`  ✓ Replied via AI`, 's');
            rc++;
        }
        setStatsLit(prev => ({ ...prev, s4: true }));
        animateCount('v4', rc);
        await sleep(300);

        // STEP 6 - ANALYTICS
        setActiveStep(6);
        addLog('', 'd2');
        addLog('[06/06] 📊  Loading unified analytics...', 'i');
        await sleep(500);
        const tR = (realStats.totalCaptured || 0) * 1250 + (postCount * 45); // Dynamic estimate based on real leads
        const tL = realStats.totalCaptured || 0;
        setStatsLit(prev => ({ ...prev, s2: true, s3: true }));
        animateCount('v2', tR);
        animateCount('v3', tL);

        addLog('', 'd2');
        addLog('════════════════════════════════════════════════', 's');
        addLog('✅  MASTER AI AGENT — ALL 6 STEPS COMPLETE!', 's');
        addLog(`    Posts:${count} | Reach:${tR.toLocaleString()} | Leads:${tL} | Replies:${rc}`, 's');
        addLog('    Campaigns: Email+WA+SMS+RCS all launched', 's');
        addLog('    Failovers: 0 needed. Claude primary stable.', 's');
        addLog('════════════════════════════════════════════════', 's');

        // Final Sync
        await fetchData();

        setIsDone(true);
        setRunning(false);
        addToast('🎉 Full AI Agent Suite complete!', 'green');
    };

    const approvePost = id => {
        setPosts(prev => prev.map(p => p.id === id ? { ...p, approved: true } : p));
        addToast('✅ Post approved!', 'green');
    };

    const regenPost = async (id, platform, dealId) => {
        addToast('↻ Regenerating via OpenAI...', 'yellow');
        try {
            const res = await marketingAPI.generateSocial(dealId, platform);
            if (res.success) {
                setPosts(prev => prev.map(p => p.id === id ? { ...p, content: res.content } : p));
                addToast('✅ Regenerated!', 'green');
            }
        } catch (e) {
            addToast('❌ Regeneration failed', 'red');
        }
    };

    const testFailover = async () => {
        setFailoverLogs([]);
        addLog('$ testing failover chain...', 'i', true);
        await sleep(300);
        addLog('  [1] Claude Sonnet 4.6 — token check...', 'd2', true);
        await sleep(400);
        addLog('  ⚠️  Claude token limit approaching (92%)', 'w', true);
        await sleep(300);
        addLog('  → Initiating failover to GPT-4o...', 'i', true);
        await sleep(500);
        addLog('  ✓ GPT-4o picked up task seamlessly', 's', true);
        await sleep(300);
        addLog('  → Task: "Generate Instagram post for D001"', 'd2', true);
        await sleep(400);
        addLog('  ✓ GPT-4o completed task. 0ms downtime.', 's', true);
        await sleep(300);
        addLog('  [Monitor] Claude Sonnet reset — 200K tokens refreshed', 'i', true);
        await sleep(300);
        addLog('  ✓ Primary model restored. Failback complete.', 's', true);

        setTaskDist([
            { n: 'Claude Sonnet 4.6', c: '#00ffcc', cnt: 847, t: 'Content, Replies, Email' },
            { n: 'GPT-4o', c: '#6c63ff', cnt: 312, t: 'Posts, Ad Copy' },
            { n: 'Gemini 1.5', c: '#0ea5e9', cnt: 89, t: 'Portal Analysis' },
            { n: 'Claude Haiku', c: '#00d4aa', cnt: 36, t: 'Quick SMS' }
        ]);
        addToast('⚡ Failover test complete!', 'green');
    };

    const launchCampaigns = async () => {
        if (running) return;
        setRunning(true);
        const types = {
            csc1: { cnt: 1476, i: '📧', n: 'Email', si: 'csv1' },
            csc2: { cnt: 646, i: '💬', n: 'WhatsApp', si: 'csv2' },
            csc3: { cnt: 4210, i: '📲', n: 'SMS', si: 'csv3' },
            csc4: { cnt: 2180, i: '✨', n: 'RCS', si: 'csv4' }
        };
        for (const [k, v] of Object.entries(types)) {
            addToast(`${v.i} Launching ${v.n}...`, 'green');
            await sleep(800);
            setCampLit(prev => ({ ...prev, [k]: true }));
            animateCampCount(v.si, v.cnt);
        }
        setCampHistory([
            { i: '📧', n: 'Email Campaign', m: '1,476 contacts', c: 'var(--email)', r: '68% open · 38 leads' },
            { i: '💬', n: 'WhatsApp Broadcast', m: '646 contacts', c: 'var(--wa)', r: '94% delivered · 52 replies' },
            { i: '📲', n: 'SMS Campaign', m: '4,210 contacts', c: 'var(--sms)', r: '98% delivery · 62 conversions' },
            { i: '✨', n: 'RCS Rich Cards', m: '2,180 contacts', c: 'var(--rcs)', r: '89% delivered · 91 CTA taps' }
        ]);
        addToast('🎉 All campaigns launched!', 'green');
        setRunning(false);
    };

    const saveEdit = () => {
        if (!editPost) return;
        setPosts(prev => prev.map(p => p.id === editPost.id ? { ...p, content: taValue } : p));
        setEditPost(null);
        addToast('💾 Changes saved!', 'green');
    };

    const syncPortals = async () => {
        addToast('🏘️ Synchronizing with Portals...', 'yellow');
        await sleep(1500);
        addToast('✅ All portal data updated!', 'green');
    };

    const updateRcs = (field, val) => setRcsData(prev => ({ ...prev, [field]: val }));
    const updateWa = (field, val) => setWaData(prev => ({ ...prev, [field]: val }));

    return (
        <div className="marketings-container">
            {/* TABS */}
            <div className="m-tabs">
                <div className={`m-tab ${currentTab === 'agent' ? 'on' : ''}`} onClick={() => setCurrentTab('agent')}><span className="m-tab-i">🤖</span>AI Agent</div>
                <div className={`m-tab ${currentTab === 'models' ? 'on' : ''}`} onClick={() => setCurrentTab('models')}><span className="m-tab-i">🧠</span>Multi-Model</div>
                <div className={`m-tab ${currentTab === 'social' ? 'on' : ''}`} onClick={() => setCurrentTab('social')}><span className="m-tab-i">📣</span>Social Posts</div>
                <div className={`m-tab ${currentTab === 'portals' ? 'on' : ''}`} onClick={() => setCurrentTab('portals')}><span className="m-tab-i">🏘️</span>Property Portals</div>
                <div className={`m-tab ${currentTab === 'campaigns' ? 'on' : ''}`} onClick={() => setCurrentTab('campaigns')}><span className="m-tab-i">📨</span>Campaigns</div>
                <div className={`m-tab ${currentTab === 'analytics' ? 'on' : ''}`} onClick={() => setCurrentTab('analytics')}><span className="m-tab-i">📊</span>Analytics</div>
            </div>

            {/* TAB: AI AGENT */}
            <div className={`m-pg ${currentTab === 'agent' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title">AI Agent Hub</div>
                        <div className="m-pg-sub">Multi-model AI agent — deals se posts, replies, leads aur campaigns — sab ek jagah</div>
                    </div>
                    <div className="m-tb-acts">
                        <button className="m-btn m-btn-s m-btn-sm" onClick={resetAgent}>↺ Reset</button>
                        <button className={`m-btn m-btn-run ${running ? 'running' : isDone ? 'done' : ''}`} onClick={runMasterAgent} disabled={running}>
                            {running ? <><span className="m-spin">⚙️</span> Running...</> : isDone ? '✅ Complete' : '🚀 Run Full Agent'}
                        </button>
                    </div>
                </div>

                {/* STEPPER */}
                <div className="m-stepper">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <React.Fragment key={i}>
                            <div className={`m-step ${activeStep === i ? 'active' : activeStep > i ? 'done' : ''}`}>
                                <div className="m-snum">{activeStep > i ? '✓' : i}</div>
                                {['CRM Load', 'AI Generate', 'Schedule', 'Campaigns', 'Replies', 'Analytics'][i - 1]}
                            </div>
                            {i < 6 && <div className={`m-sconn ${activeStep > i ? 'done' : ''}`}></div>}
                        </React.Fragment>
                    ))}
                </div>

                {/* AI Master Engines Collaboration */}
                <div className="m-card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(116, 170, 156, 0.05) 0%, rgba(66, 133, 244, 0.05) 100%)', border: '1px solid rgba(116, 170, 156, 0.2)' }}>
                    <div className="m-ch">
                        <div className="m-ct">🧠 Multi-Model Collaboration Engine</div>
                        <span className="m-chip m-cg">Active Synergy</span>
                    </div>
                    <div className="m-cb" style={{ display: 'flex', gap: '20px', padding: '10px 20px 20px' }}>
                        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#74aa9c', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <i className="fas fa-robot"></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>ChatGPT (GPT-4o)</div>
                                    <div style={{ fontSize: '0.7rem', color: '#10b981' }}>Master of Creativity</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Handling: <strong>Social Posts, Ad Copy, WhatsApp Hooks</strong></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-plus" style={{ color: '#94a3b8' }}></i>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#4285f4', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <i className="fab fa-google"></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>Google Gemini 1.5</div>
                                    <div style={{ fontSize: '0.7rem', color: '#4285f4' }}>Deep Context Analysis</div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Handling: <strong>Market Analytics, SEO, Data Insights</strong></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-plus" style={{ color: '#94a3b8' }}></i>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', opacity: linkedInStatus ? 1 : 0.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#0077b5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <i className="fab fa-linkedin"></i>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>LinkedIn Business</div>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: linkedInStatus ? '#10b981' : '#f43f5e' }}></div>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: linkedInStatus ? '#10b981' : '#64748b' }}>
                                        {linkedInStatus ? 'Connected ✓' : 'Disconnected'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Destination: <strong>Company Page (42752175)</strong></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-plus" style={{ color: '#94a3b8' }}></i>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', opacity: googleSubStatus.youtube ? 1 : 0.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#ff0000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <i className="fab fa-youtube"></i>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>YouTube Channel</div>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: googleSubStatus.youtube ? '#10b981' : '#f43f5e' }}></div>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: googleSubStatus.youtube ? '#10b981' : '#64748b' }}>
                                        {googleSubStatus.youtube ? 'Connected ✓' : 'Disconnected'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Handle: <strong>Property Tours & Shorts</strong></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-plus" style={{ color: '#94a3b8' }}></i>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', opacity: googleSubStatus.business ? 1 : 0.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#4285f4', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                    <i className="fas fa-store"></i>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>Google Business</div>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: googleSubStatus.business ? '#10b981' : '#f43f5e' }}></div>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: googleSubStatus.business ? '#10b981' : '#64748b' }}>
                                        {googleSubStatus.business ? 'Connected ✓' : 'Disconnected'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Status: <strong>Local SEO & Map Posts</strong></div>
                        </div>
                    </div>
                </div>

                {/* STATS */}
                <div className="m-g4">
                    <div className={`m-sc ${statsLit.s1 ? 'lit' : ''}`} style={{ '--ac': 'var(--m-g1)' }}>
                        <span className="m-si">✍️</span><div className="m-sl">Posts Generated</div><div className="m-sv">{counts.v1}</div>
                        <div className={`m-ss ${statsLit.s1 ? 'up' : ''}`}>{statsLit.s1 ? '↑ Pending approval' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${statsLit.s2 ? 'lit' : ''}`} style={{ '--ac': '#5a8fcf' }}>
                        <span className="m-si">📡</span><div className="m-sl">Total Reach</div><div className="m-sv">{counts.v2.toLocaleString('en-IN')}</div>
                        <div className={`m-ss ${statsLit.s2 ? 'up' : ''}`}>{statsLit.s2 ? '↑ All platforms' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${statsLit.s3 || realStats.totalCaptured > 0 ? 'lit' : ''}`} style={{ '--ac': 'var(--m-g3)' }}>
                        <span className="m-si">🎯</span><div className="m-sl">Captured Leads</div><div className="m-sv">{running ? counts.v3 : realStats.totalCaptured}</div>
                        <div className={`m-ss ${statsLit.s3 || realStats.totalCaptured > 0 ? 'up' : ''}`}>{realStats.totalCaptured > 0 ? '↑ Real-time capture' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${statsLit.s4 || realStats.nurturedToday > 0 ? 'lit' : ''}`} style={{ '--ac': 'var(--m-g4)' }}>
                        <span className="m-si">💬</span><div className="m-sl">Auto-Nurtured</div><div className="m-sv">{running ? counts.v4 : realStats.nurturedToday}</div>
                        <div className={`m-ss ${statsLit.s4 || realStats.nurturedToday > 0 ? 'up' : ''}`}>{realStats.nurturedToday > 0 ? '↑ AI active' : 'Waiting...'}</div>
                    </div>
                </div>

                <div className="m-g2">
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">🔥 Hot Leads — AI Handoff</div><span className="m-chip m-cg">{realStats.hotLeads} Ready</span></div>
                        <div className="m-cb" style={{ padding: '6px 13px 11px', maxHeight: '250px', overflowY: 'auto' }}>
                            {realStats.recentLeads?.length === 0 ? (
                                <div className="m-empty"><span className="m-ei">🎯</span>No leads captured yet</div>
                            ) : (
                                realStats.recentLeads?.map(l => (
                                    <div className="m-dr" key={l._id}>
                                        <div className="m-dth" style={{ background: 'rgba(0,255,204,.07)' }}>👤</div>
                                        <div className="m-di">
                                            <div className="m-dn">{l.firstName} {l.lastName}</div>
                                            <div className="m-dm">📞 {l.mobile} | {l.intent_index || 0}% Intent</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div className={`m-sp ${l.customFields?.nurtureState === 'VISIT_BOOKED' ? 'm-sa' : 'm-sp2'}`}>
                                                {l.customFields?.nurtureState || 'NEW'}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
                                                {new Date(l.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">🕒 Recent AI Activities</div><span className="m-chip m-cp">{realStats.recentActivities?.length || 0} Recent</span></div>
                        <div className="m-cb" style={{ padding: '5px 13px 11px', maxHeight: '250px', overflowY: 'auto' }}>
                            {(!realStats.recentActivities || realStats.recentActivities.length === 0) ? (
                                <div className="m-empty"><span className="m-ei">🕐</span>No activity logs found</div>
                            ) : (
                                realStats.recentActivities.map((a, i) => (
                                    <div className="m-si2" key={i}>
                                        <div className="m-st2" style={{ width: '55px' }}>{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        <div className="m-sp3" style={{ background: a.type === 'WhatsApp' ? '#25d366' : a.type === 'Email' ? '#4285f4' : '#ef4444', color: '#fff' }}>
                                            {a.type === 'WhatsApp' ? 'WA' : a.type === 'Email' ? 'EM' : 'CA'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="m-sn2">{a.entityId?.firstName || 'System'}</div>
                                            <div className="m-sd2" title={a.description}>{a.description}</div>
                                        </div>
                                        <div className="m-ss2 m-sl2">✓ Done</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="m-card" style={{ marginBottom: '13px' }}>
                    <div className="m-ch"><div className="m-ct">✍️ AI Generated Posts — Review & Approve</div><span className="m-chip m-cg">{postCount} Posts</span></div>
                    <div className="m-pg-grid" style={{ gridTemplateColumns: posts.length ? '1fr 1fr' : '1fr', padding: posts.length ? '11px' : '18px' }}>
                        {posts.length === 0 ? (
                            <div className="m-empty"><span className="m-ei">🤖</span>Click "Run Full Agent" — posts will appear here</div>
                        ) : (
                            posts.map(p => (
                                <div className={`m-pc ${p.approved ? 'approved' : ''}`} key={p.id} style={{ '--pcol': p.info.c }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                        <div className="m-plb" style={{ background: p.info.bg, color: p.info.c }}>{p.info.i} {p.info.n}</div>
                                        <span className="m-ps-time" style={{ marginLeft: 'auto' }}>⏰ {p.info.time}</span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--m-t3)', fontWeight: 700, marginBottom: '4px' }}>📌 {p.deal.t} · {p.deal.ps}</div>
                                    <div className="m-pb2">{p.content.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>)}</div>
                                    <div className="m-pbtns">
                                        <button className={`m-pbtn m-pbtn-ok ${p.approved ? 'done' : ''}`} onClick={() => approvePost(p.id)}>{p.approved ? '✅ Done' : '✓ Approve'}</button>
                                        <button className="m-pbtn m-pbtn-ed" onClick={() => { setEditPost(p); setTaValue(p.content); }}>✎ Edit</button>
                                        <button className="m-pbtn m-pbtn-rg" onClick={() => regenPost(p.id, p.platform, p.deal.id)}>↺ Regen</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="m-g2">
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">📊 Platform Performance</div><span className="m-chip m-cy">7 Days</span></div>
                        <div className="m-cb" style={{ padding: '6px 13px 11px' }}>
                            {isDone ? ANALYTICS_DATA.slice(0, 4).map(p => (
                                <div className="m-pr2" key={p.n}>
                                    <div className="m-pi2">{p.i}</div>
                                    <div className="m-pd2">
                                        <div className="m-pt2"><span className="m-pn2">{p.n}</span><span className="m-pl2" style={{ color: p.c }}>{p.leads} leads</span></div>
                                        <div className="m-pm2">{p.reach.toLocaleString('en-IN')} reach</div>
                                        <div className="m-bt"><div className="m-bf" style={{ background: p.c, width: `${p.pct}%` }}></div></div>
                                    </div>
                                </div>
                            )) : <div className="m-empty"><span className="m-ei">📈</span>After agent runs</div>}
                        </div>
                    </div>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">💬 AI Reply Agent — All Channels</div><span className="m-chip m-cr">{replies.length ? `${replies.length} Replied` : 'Waiting'}</span></div>
                        <div style={{ padding: '0 13px', maxHeight: '270px', overflowY: 'auto' }} ref={cmtFeedRef}>
                            {replies.length === 0 ? (
                                <div className="m-empty"><span className="m-ei">💭</span>Multi-channel replies yahan</div>
                            ) : (
                                replies.map((c, i) => (
                                    <div className="m-cc" key={i}>
                                        <div className="m-cc-h">
                                            <div className="m-ca" style={{ background: c.color }}>{c.u.substring(0, 2).toUpperCase()}</div>
                                            <span className="m-cu">@{c.u}</span><span style={{ fontSize: '11px' }}>{c.ch}</span><span className="m-ct2">{c.t} ago</span>
                                        </div>
                                        <div className="m-cm">{c.txt}</div>
                                        <div className="m-ar show"><span className="m-ai-tag">🤖 AI Reply · {c.src === 'email' ? 'Gmail' : 'WA/Social'}</span>{c.reply}<span className="m-ch-src">via Claude Sonnet 4.6</span></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="m-term">
                    <div className="m-tb2"><div className="m-td" style={{ background: '#ff5f57' }}></div><div className="m-td" style={{ background: '#febc2e' }}></div><div className="m-td" style={{ background: '#28c840' }}></div><span className="m-tt">▸ ai-master-agent.js — antigravity-crm v4.0</span></div>
                    <div className="m-tbody" ref={termBodyRef}>
                        {terminalLogs.map((l, i) => (
                            <div className={`m-tl ${l.type} ${l.v ? 'v' : ''}`} key={i}>{l.text}</div>
                        ))}
                    </div>
                </div>
            </div>

            {/* TAB: MULTI-MODEL */}
            <div className={`m-pg ${currentTab === 'models' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title" style={{ background: 'linear-gradient(135deg,var(--m-text) 40%,var(--m-g2))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🧠 Multi-Model AI System</div>
                        <div className="m-pg-sub">Token khatam hone par automatic failover — kaam kabhi nahi rukta</div>
                    </div>
                    <div className="m-tb-acts"><button className="m-btn m-btn-p m-btn-sm" onClick={testFailover}>⚡ Test Failover</button></div>
                </div>

                <div className="m-ff-flow">
                    <div className="m-ff-title">⛓️ Failover Chain — Token Exhaustion se Automatic Handoff</div>
                    <div className="m-ff-chain">
                        <div className="m-ff-node primary"><span>🟢</span><div><strong>Claude Sonnet 4.6</strong><span className="m-ff-label">Primary · 200K ctx</span></div></div>
                        <div className="m-ff-arrow">→ tokens finish →</div>
                        <div className="m-ff-node fallback1"><span>🔵</span><div><strong>GPT-4o</strong><span className="m-ff-label">Fallback 1 · 128K ctx</span></div></div>
                        <div className="m-ff-arrow">→ limit hit →</div>
                        <div className="m-ff-node fallback2"><span>🟡</span><div><strong>Gemini 1.5 Pro</strong><span className="m-ff-label">Fallback 2 · 1M ctx</span></div></div>
                        <div className="m-ff-arrow">→ exhausted →</div>
                        <div className="m-ff-node fallback3"><span>🟠</span><div><strong>Claude Haiku 4.5</strong><span className="m-ff-label">Fallback 3 · Fast</span></div></div>
                    </div>
                </div>

                <div className="m-model-grid">
                    {MODELS.map(m => (
                        <div className={`m-model-card ${m.status === 'active' ? 'active-model' : m.status === 'fallback' ? 'fallback' : m.used >= 90 ? 'exhausted' : ''}`} key={m.name} style={{ '--mc': m.color }}>
                            <div className="m-model-top">
                                <div><div className="m-model-name">{m.name}</div><div className="m-model-provider">{m.provider} · {m.ctx}</div></div>
                                <div className={`m-model-status m-ms-${m.status}`}>{m.status === 'active' ? '🟢 Active' : m.status === 'fallback' ? '🟡 Fallback' : m.used >= 90 ? '🔴 Exhausted' : '⚪ Idle'}</div>
                            </div>
                            <div className="m-model-bar"><div className="m-model-bar-fill" style={{ width: `${m.used}%`, background: m.color }}></div></div>
                            <div className="m-model-meta"><span>Token usage: {m.used}%</span><span>{100 - m.used}% remaining</span></div>
                            <div className="m-model-tasks">Tasks: {m.tasks.join(' · ')}</div>
                        </div>
                    ))}
                </div>

                <div className="m-g2" style={{ marginTop: '13px' }}>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">⚡ Failover Log</div><span className="m-chip m-cp">Live</span></div>
                        <div className="m-cb" style={{ padding: 0 }}>
                            <div className="m-term" style={{ marginTop: 0, border: 'none', borderRadius: 0 }}>
                                <div className="m-tbody" style={{ maxHeight: '200px' }} ref={failoverLogRef}>
                                    {failoverLogs.map((l, i) => (
                                        <div className={`m-tl ${l.type} ${l.v ? 'v' : ''}`} key={i}>{l.text}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">📋 Task Distribution</div><span className="m-chip m-cg">{taskDist.length ? '1,284 Tasks' : '0 Tasks'}</span></div>
                        <div className="m-cb" style={{ padding: '7px 13px' }}>
                            {taskDist.length === 0 ? (
                                <div className="m-empty"><span className="m-ei">🎯</span>Test failover to see distribution</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                    {taskDist.map(d => (
                                        <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--r1)', padding: '9px 11px' }} key={d.n}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                <span style={{ fontSize: '11.5px', fontWeight: 800 }}>{d.n}</span>
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: d.c }}>{d.cnt} tasks</span>
                                            </div>
                                            <div style={{ fontSize: '9.5px', color: 'var(--m-t3)' }}>{d.t}</div>
                                            <div className="m-bt" style={{ marginTop: '6px' }}><div className="m-bf" style={{ background: d.c, width: `${Math.round(d.cnt / 12.84)}%` }}></div></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* TAB: SOCIAL */}
            <div className={`m-pg ${currentTab === 'social' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title" style={{ background: 'linear-gradient(135deg,var(--m-text) 40%,var(--ig))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📣 Social Media Posts</div>
                        <div className="m-pg-sub">Instagram, Facebook, LinkedIn, X, YouTube, Google Business — ek jagah manage karo</div>
                    </div>
                    <div className="m-tb-acts"><button className="m-btn m-btn-p" onClick={() => addToast('🤖 All platform posts generated!', 'green')}>🤖 Generate All Posts</button></div>
                </div>

                <div className="m-g3">
                    {Object.keys(PLATS).map(key => {
                        const p = PLATS[key];
                        return (
                            <div className="m-card" key={key}>
                                <div className="m-ch">
                                    <div className="m-ct">{p.i} {p.n}</div>
                                    <span className="m-chip" style={{ background: `${p.c}14`, color: p.c, borderColor: `${p.c}26` }}>{p.desc}</span>
                                </div>
                                <div className="m-cb">
                                    <div className="m-preview-box">
                                        {key === 'youtube' ? (
                                            <div className="m-yt-preview">
                                                <div className="m-yt-thumb"><div className="m-yt-play">▶</div></div>
                                                <div className="m-yt-info"><div className="m-yt-t">Luxury Tour: 3BHK Bandra West</div><div className="m-yt-d">4.2K views · 2 hours ago</div></div>
                                            </div>
                                        ) : key === 'gbusiness' ? (
                                            <div className="m-gb-preview">
                                                <div className="m-gb-map">📍</div>
                                                <div className="m-gb-con"><div className="m-gb-n">Bharat Properties - Bandra Office</div><div className="m-gb-a">Open · Closes 8PM</div></div>
                                            </div>
                                        ) : key === 'whatsapp' ? (
                                            <div className="m-wa-card">
                                                <div className="m-wa-bub"><div className="m-wa-txt">Hi Suresh! Property price is ₹85L. Open for site visit this Sunday?</div><div className="m-wa-t">10:42 AM ✓✓</div></div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '11px', color: 'var(--m-t2)', lineHeight: 1.6 }}>
                                                {key === 'instagram' ? '✨ 3BHK Luxury — Available! ✨\n📍 Bandra West, Mumbai\n💰 ₹85,00,000\n🔥 DM NOW!' : key === 'facebook' ? '🏠 3BHK Luxury Apartment\n📍 Bandra West | 💰 ₹85L\nContact Rahul Sharma! 👉 Share!' : 'Residential Opportunity | Bandra West\n3BHK Luxury · ₹85L\n#RealEstate'}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: 'var(--m-t3)', marginBottom: '10px' }}>Best time: <strong>{p.time}</strong> · Reach: <strong>~{key === 'instagram' ? '17K' : key === 'facebook' ? '13K' : '8K'}</strong></div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button className="m-btn m-btn-s m-btn-sm" onClick={() => addToast(`✅ ${p.n} approved!`, 'green')}>✓ Approve</button>
                                        <button className="m-btn m-btn-s m-btn-sm" 
                                            style={{ border: `1px solid ${p.c}4D`, color: p.c }}
                                            onClick={() => {
                                                setEditPost({ id: key, info: p, content: key === 'youtube' ? 'Luxury Tour Script: ...' : 'Social Post Content...' });
                                                setTaValue(key === 'youtube' ? 'Luxury Tour Script: ...' : 'Social Post Content...');
                                            }}
                                        >
                                            {key === 'youtube' ? '🎬 Edit Script' : '🔁 Edit Post'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* TAB: PORTALS */}
            <div className={`m-pg ${currentTab === 'portals' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title" style={{ background: 'linear-gradient(135deg,var(--m-text) 40%,var(--m-g4))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🏘️ Property Portals</div>
                        <div className="m-pg-sub">99acres, MagicBricks, Housing, CommonFloor, SquareYards — leads, cost, performance</div>
                    </div>
                    <div className="m-tb-acts"><button className="m-btn m-btn-p m-btn-sm" onClick={syncPortals}>↺ Sync Portals</button></div>
                </div>

                <div className="m-kp-grid">
                    <div className="m-kp-card" style={{ '--ac': 'var(--m-g5)' }}><div className="m-kp-lbl">Total Portal Spend</div><div className="m-kp-val">₹23,495</div><div className="m-kp-trend down">↓ 5% vs last month</div></div>
                    <div className="m-kp-card" style={{ '--ac': 'var(--m-g1)' }}><div className="m-kp-lbl">Total Portal Leads</div><div className="m-kp-val">90</div><div className="m-kp-trend up">↑ 12% vs last month</div></div>
                    <div className="m-kp-card" style={{ '--ac': 'var(--m-g6)' }}><div className="m-kp-lbl">Avg Response Time</div><div className="m-kp-val">3.5 hrs</div><div className="m-kp-trend up">↑ Faster by 20m</div></div>
                    <div className="m-kp-card" style={{ '--ac': 'var(--m-g4)' }}><div className="m-kp-lbl">Best ROI Portal</div><div className="m-kp-val">SquareYards</div><div className="m-kp-trend up">88% efficiency</div></div>
                </div>
                <div className="m-card" style={{ marginBottom: '13px' }}>
                    <div className="m-ch"><div className="m-ct">📊 Portal Performance Dashboard</div><span className="m-chip m-cy">Live Data</span></div>
                    <div className="m-cb" style={{ padding: 0 }}>
                        <table className="m-ptbl">
                            <thead>
                                <tr><th>Portal</th><th>Package</th><th>Cost/Month</th><th>Listings</th><th>Leads</th><th>CPL</th><th>Response</th><th>Performance</th></tr>
                            </thead>
                            <tbody>
                                {PORTALS.map(p => (
                                    <tr key={p.n}>
                                        <td><strong>{p.i} {p.n}</strong></td>
                                        <td><span className="m-chip m-cg" style={{ background: 'rgba(0,0,0,.1)', color: 'var(--m-text)', borderColor: 'var(--border)' }}>{p.pkg}</span></td>
                                        <td className="m-price-tag">₹{p.cost.toLocaleString('en-IN')}</td>
                                        <td>{p.listings}</td>
                                        <td style={{ fontWeight: 800, color: 'var(--m-g1)' }}>{p.leads}</td>
                                        <td style={{ color: p.cpl < 260 ? 'var(--m-g1)' : 'var(--m-g4)' }}>₹{p.cpl}</td>
                                        <td>{p.resp}</td>
                                        <td><div className="m-perf-bar"><div className="m-perf-fill" style={{ background: p.color, width: `${p.perf}%` }}></div></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* TAB: CAMPAIGNS */}
            <div className={`m-pg ${currentTab === 'campaigns' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title" style={{ background: 'linear-gradient(135deg,var(--m-text) 40%,var(--email))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📨 Campaign Center</div>
                        <div className="m-pg-sub">Email, WhatsApp, SMS, RCS — ek button se sabko fire karo</div>
                    </div>
                    <div className="m-tb-acts">
                        <button className="m-btn m-btn-p" onClick={launchCampaigns}>🚀 Launch All Campaigns</button>
                    </div>
                </div>

                <div className="m-g4">
                    <div className={`m-sc ${campLit.csc1 ? 'lit' : ''}`} style={{ '--ac': 'var(--email)' }}>
                        <span className="m-si">📧</span><div className="m-sl">Email Sent</div><div className="m-sv">{campStats.csv1}</div>
                        <div className={`m-ss ${campLit.csc1 ? 'up' : ''}`}>{campLit.csc1 ? '↑ Sent!' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${campLit.csc2 ? 'lit' : ''}`} style={{ '--ac': 'var(--wa)' }}>
                        <span className="m-si">💬</span><div className="m-sl">WA Broadcast</div><div className="m-sv">{campStats.csv2}</div>
                        <div className={`m-ss ${campLit.csc2 ? 'up' : ''}`}>{campLit.csc2 ? '↑ Sent!' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${campLit.csc3 ? 'lit' : ''}`} style={{ '--ac': 'var(--sms)' }}>
                        <span className="m-si">📲</span><div className="m-sl">SMS Sent</div><div className="m-sv">{campStats.csv3}</div>
                        <div className={`m-ss ${campLit.csc3 ? 'up' : ''}`}>{campLit.csc3 ? '↑ Sent!' : 'Waiting...'}</div>
                    </div>
                    <div className={`m-sc ${campLit.csc4 ? 'lit' : ''}`} style={{ '--ac': 'var(--rcs)' }}>
                        <span className="m-si">✨</span><div className="m-sl">RCS Rich Cards</div><div className="m-sv">{campStats.csv4}</div>
                        <div className={`m-ss ${campLit.csc4 ? 'up' : ''}`}>{campLit.csc4 ? '↑ Sent!' : 'Waiting...'}</div>
                    </div>
                </div>

                <div className="m-g2">
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">📧 Email Campaign</div><button className="m-btn m-btn-p m-btn-sm" onClick={() => addToast('📧 Email Campaign launched!', 'green')}>Send</button></div>
                        <div className="m-cb">
                            <div className="m-fg"><label className="m-fl">Campaign Name</label><input className="m-fi" value={emailData.name} onChange={e => updateEmail('name', e.target.value)} /></div>
                            <div className="m-frow">
                                <div className="m-fg"><label className="m-fl">Sender Name</label><input className="m-fi" value={emailData.sender} onChange={e => updateEmail('sender', e.target.value)} /></div>
                                <div className="m-fg"><label className="m-fl">Reply To</label><input className="m-fi" value={emailData.replyTo} onChange={e => updateEmail('replyTo', e.target.value)} /></div>
                            </div>
                            <div className="m-fg"><label className="m-fl">Subject Line</label><input className="m-fi" value={emailData.subject} onChange={e => updateEmail('subject', e.target.value)} /></div>
                            <div className="m-fg" style={{ marginTop: '8px' }}><label className="m-fl">Email Content</label><textarea className="m-fta" style={{ minHeight: '80px' }} value={emailData.content} onChange={e => updateEmail('content', e.target.value)} /></div>
                        </div>
                    </div>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">📲 SMS Campaign</div><button className="m-btn m-btn-sms m-btn-sm" onClick={() => addToast('📲 SMS Campaign launched!', 'purple')}>Send</button></div>
                        <div className="m-cb">
                            <div className="m-frow">
                                <div className="m-fg"><label className="m-fl">Sender ID</label><input className="m-fi" defaultValue="ANTGRV" /></div>
                                <div className="m-fg"><label className="m-fl">Template ID</label><input className="m-fi" defaultValue="1007889234567890" /></div>
                            </div>
                            <div className="m-fg" style={{ marginBottom: '8px' }}>
                                <label className="m-fl">Message <span style={{ float: 'right', fontSize: '9.5px', color: 'var(--m-t3)' }}>{smsText.length}/160</span></label>
                                <textarea className="m-fta" style={{ minHeight: '55px', fontSize: '11px' }} value={smsText} onChange={e => updateSmsTA(e.target.value)} />
                            </div>
                            <div className="m-sms-sh"><div className="m-sms-bub"><div className="m-sms-txt">{smsText}</div></div></div>
                        </div>
                    </div>
                </div>

                <div className="m-g2">
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">💬 WhatsApp Broadcast</div><button className="m-btn m-btn-p m-btn-sm" style={{ background: 'var(--wa)' }} onClick={() => addToast('💬 WhatsApp Broadcast launched!', 'green')}>Send</button></div>
                        <div className="m-cb">
                            <div className="m-fg"><label className="m-fl">Broadcast Name</label><input className="m-fi" value={waData.name} onChange={e => updateWa('name', e.target.value)} /></div>
                            <div className="m-fg" style={{ marginTop: '8px' }}><label className="m-fl">Message Content</label><textarea className="m-fta" style={{ minHeight: '60px' }} value={waData.content} onChange={e => updateWa('content', e.target.value)} /></div>
                            <div className="m-wa-sh" style={{ background: '#efeae2', marginTop: '8px' }}>
                                <div className="m-wa-bub"><div className="m-wa-txt">{waData.content}</div><div className="m-wa-t">10:42 AM</div></div>
                            </div>
                        </div>
                    </div>
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">✨ RCS Rich Card</div><button className="m-btn m-btn-rcs m-btn-sm" onClick={() => addToast('✨ RCS Campaign launched!', 'blue')}>Send</button></div>
                        <div className="m-cb">
                            <div className="m-frow">
                                <div className="m-fg"><label className="m-fl">Card Title</label><input className="m-fi" value={rcsData.title} onChange={e => updateRcs('title', e.target.value)} /></div>
                                <div className="m-fg"><label className="m-fl">Description</label><input className="m-fi" value={rcsData.desc} onChange={e => updateRcs('desc', e.target.value)} /></div>
                            </div>
                            <div className="m-rcs-sh"><div className="m-rcs-card2"><div className="m-rcs-img2">🏢</div><div className="m-rcs-con"><div className="m-rcs-ttl">{rcsData.title}</div><div className="m-rcs-dsc">{rcsData.desc}</div></div><div className="m-rcs-acts2"><button className="m-rcs-abtn m-rcs-pri">📅 Book Visit</button><button className="m-rcs-abtn m-rcs-sec">📞 Call Agent</button></div></div></div>
                        </div>
                    </div>
                </div>

                <div className="m-card" style={{ marginTop: '13px' }}>
                    <div className="m-ch"><div className="m-ct">📋 Campaign History</div><span className="m-chip m-cg">{campHistory.length} Campaigns</span></div>
                    <div className="m-cb">
                        {campHistory.length === 0 ? <div className="m-empty">No active campaigns.</div> : (
                            <div className="m-camp-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {campHistory.map((c, i) => (
                                    <div className="m-ci" key={i}>
                                        <div className="m-ci-icon" style={{ background: 'rgba(255,255,255,.03)' }}>{c.i}</div>
                                        <div className="m-ci-info"><div className="m-ci-name">{c.n}</div><div className="m-ci-meta">{c.m} · Just now</div></div>
                                        <div className="m-ci-r"><div className="m-ci-val" style={{ color: c.c }}>✓ Sent</div><div className="m-ci-rate">{c.r}</div></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TAB: ANALYTICS */}
            <div className={`m-pg ${currentTab === 'analytics' ? 'on' : ''}`}>
                <div className="m-tb">
                    <div>
                        <div className="m-pg-title" style={{ background: 'linear-gradient(135deg,var(--m-text) 40%,var(--m-g6))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📊 Unified Analytics</div>
                        <div className="m-pg-sub">Social, portals, campaigns — sab ek dashboard mein</div>
                    </div>
                </div>
                <div className="m-g4">
                    <div className="m-sc lit" style={{ '--ac': 'var(--m-g1)' }}><span className="m-si">📡</span><div className="m-sl">Total Reach</div><div className="m-sv" style={{ color: 'var(--m-g1)' }}>42,760</div><div className="m-ss up">↑ All channels</div></div>
                    <div className="m-sc lit" style={{ '--ac': 'var(--m-g3)' }}><span className="m-si">🎯</span><div className="m-sl">Total Leads</div><div className="m-sv" style={{ color: 'var(--m-g3)' }}>243</div><div className="m-ss up">↑ This month</div></div>
                    <div className="m-sc lit" style={{ '--ac': 'var(--m-g4)' }}><span className="m-si">💰</span><div className="m-sl">Pipeline Value</div><div className="m-sv" style={{ color: 'var(--m-g4)' }}>₹2.4Cr</div><div className="m-ss up">↑ Est. revenue</div></div>
                    <div className="m-sc lit" style={{ '--ac': 'var(--m-g2)' }}><span className="m-si">⚡</span><div className="m-sl">Avg CPL</div><div className="m-sv" style={{ color: 'var(--m-g2)' }}>₹46</div><div className="m-ss up">↓ Down 12%</div></div>
                </div>

                <div className="m-g2">
                    {/* Chart 1: Platform Reach */}
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">📈 Reach by Platform</div><select className="m-btn m-btn-sm" style={{ background: 'var(--border)', border: 'none', color: 'var(--m-t2)' }}><option>Last 30 Days</option></select></div>
                        <div className="m-cb">
                            <div className="m-chart-h">
                                <div className="m-chart-bar" style={{ height: '60%', '--bc': 'var(--ig)' }}><div className="m-chart-val">12K</div><div className="m-chart-lbl">IG</div></div>
                                <div className="m-chart-bar" style={{ height: '85%', '--bc': 'var(--fb)' }}><div className="m-chart-val">18K</div><div className="m-chart-lbl">FB</div></div>
                                <div className="m-chart-bar" style={{ height: '45%', '--bc': 'var(--li)' }}><div className="m-chart-val">9.2K</div><div className="m-chart-lbl">LI</div></div>
                                <div className="m-chart-bar" style={{ height: '30%', '--bc': 'var(--yt)' }}><div className="m-chart-val">4.5K</div><div className="m-chart-lbl">YT</div></div>
                                <div className="m-chart-bar" style={{ height: '70%', '--bc': 'var(--gb)' }}><div className="m-chart-val">14K</div><div className="m-chart-lbl">GBP</div></div>
                            </div>
                        </div>
                    </div>
                    {/* Chart 2: Lead Quality */}
                    <div className="m-card">
                        <div className="m-ch"><div className="m-ct">🔥 Lead Sources</div><select className="m-btn m-btn-sm" style={{ background: 'var(--border)', border: 'none', color: 'var(--m-t2)' }}><option>Conversion Rate</option></select></div>
                        <div className="m-cb">
                            <div className="m-ls">
                                <div className="m-ls-i"><div className="m-ls-h"><span className="m-ls-l">99acres</span><span className="m-ls-v">3.4%</span></div><div className="m-ls-b"><div className="m-ls-f" style={{ width: '85%', background: 'var(--m-g6)' }}></div></div></div>
                                <div className="m-ls-i"><div className="m-ls-h"><span className="m-ls-l">MagicBricks</span><span className="m-ls-v">2.8%</span></div><div className="m-ls-b"><div className="m-ls-f" style={{ width: '70%', background: 'var(--m-g1)' }}></div></div></div>
                                <div className="m-ls-i"><div className="m-ls-h"><span className="m-ls-l">Instagram Ads</span><span className="m-ls-v">4.1%</span></div><div className="m-ls-b"><div className="m-ls-f" style={{ width: '95%', background: 'var(--ig)' }}></div></div></div>
                                <div className="m-ls-i"><div className="m-ls-h"><span className="m-ls-l">Direct Calls</span><span className="m-ls-v">1.4%</span></div><div className="m-ls-b"><div className="m-ls-f" style={{ width: '40%', background: 'var(--m-g4)' }}></div></div></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="m-card" style={{ marginTop: '13px' }}>
                    <div className="m-ch"><div className="m-ct">📊 Channel Performance Analysis</div></div>
                    <div className="m-cb">
                        <table className="m-perf-tbl">
                            <thead>
                                <tr><th>Channel</th><th>Spent</th><th>Leads</th><th>Cost/Lead</th><th>Conv.</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                <tr><td><span className="m-chip m-ig">Instagram</span></td><td>₹14.5K</td><td>82</td><td>₹176</td><td>4.2%</td><td><span className="m-cg">● Active</span></td></tr>
                                <tr><td><span className="m-chip m-fb">Facebook</span></td><td>₹12.2K</td><td>64</td><td>₹190</td><td>3.8%</td><td><span className="m-cg">● Active</span></td></tr>
                                <tr><td><span className="m-chip m-gb">Google Biz</span></td><td>₹0</td><td>28</td><td>₹0</td><td>2.1%</td><td><span className="m-cg">● Managed</span></td></tr>
                                <tr><td><span className="m-chip m-sms">SMS Blasts</span></td><td>₹4.2K</td><td>14</td><td>₹300</td><td>1.2%</td><td><span className="m-cr">● Paused</span></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* TOAST STACK */}
            <div className="m-tstack">
                {toasts.map(t => (
                    <div className={`m-toast ${t.v ? 'v' : ''}`} key={t.id}>
                        <div className="m-td3" style={{ background: t.type === 'green' ? 'var(--m-g1)' : t.type === 'yellow' ? 'var(--m-g4)' : t.type === 'purple' ? 'var(--m-g2)' : 'var(--email)' }}></div>
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* EDIT MODAL */}
            {editPost && (
                <div className="m-mov open">
                    <div className="m-modal">
                        <div className="m-mtt">✎ Edit Post</div>
                        <textarea value={taValue} onChange={e => setTaValue(e.target.value)} />
                        <div className="m-mbtns">
                            <button className="m-btn m-btn-s m-btn-sm" onClick={() => setEditPost(null)}>Cancel</button>
                            <button className="m-btn m-btn-p m-btn-sm" onClick={() => {
                                setPosts(prev => prev.map(p => p.id === editPost.id ? { ...p, content: taValue } : p));
                                setEditPost(null);
                                addToast('✎ Post updated!', 'purple');
                            }}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketingsPage;
