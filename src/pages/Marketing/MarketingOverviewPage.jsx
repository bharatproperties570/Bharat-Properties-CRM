import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, Calendar, BarChart3, Bot, Palette, 
  Target, Megaphone, Home, Settings, Search, 
  Bell, Play, Plus, ChevronRight, Workflow, 
  Zap, ListOrdered, Activity, Sparkles, Type
} from 'lucide-react';
import './MarketingOverview.css';
import toast from 'react-hot-toast';

/* ══════════════════════════════════════════
   HELPERS & SEED DATA
══════════════════════════════════════════ */
const DB = {
  get(key, def = []) {
    try {
      const stored = localStorage.getItem('bp_' + key);
      return stored ? JSON.parse(stored) : def;
    } catch (e) {
      console.error('Error reading from DB:', e);
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('bp_' + key, JSON.stringify(val));
    } catch (e) {
      console.error('Error writing to DB:', e);
    }
  }
};

const DEFAULT_LEADS = [
  { id: 'l1', name: 'Rajesh Kumar', phone: '9812345678', interest: '3BHK Flat', budget: '₹45–55L', source: 'Instagram Reel', segment: 'hot', notes: 'Wants ready possession', added: '2026-03-26', status: 'hot' },
  { id: 'l2', name: 'Sunita Sharma', phone: '9876543210', interest: 'Plot – Sector 7', budget: '₹18–25L', source: 'WhatsApp', segment: 'hot', notes: 'Site visit pending', added: '2026-03-27', status: 'hot' },
  { id: 'l3', name: 'Amit Verma', phone: '9845678901', interest: '2BHK – Pipli', budget: '₹30–38L', source: 'Facebook', segment: 'warm', notes: 'Looking for 6 months', added: '2026-03-20', status: 'warm' },
  { id: 'l4', name: 'Priya Devi', phone: '9811223344', interest: 'Commercial Space', budget: '₹80L+', source: 'Google Ad', segment: 'investor', notes: 'ROI focused', added: '2026-03-18', status: 'warm' },
  { id: 'l5', name: 'Suresh Yadav', phone: '9867890123', interest: 'Villa – Thanesar', budget: '₹1.2Cr', source: 'Referral', segment: 'hot', notes: 'Deal closed!', added: '2026-03-15', status: 'converted' },
  { id: 'l6', name: 'Neha Goel', phone: '9834567890', interest: '2BHK Rental', budget: '₹12K/mo', source: 'Instagram Story', segment: 'tenant', notes: 'Needs near school', added: '2026-03-22', status: 'cold' },
  { id: 'l7', name: 'Pradeep Singh', phone: '9856781234', interest: 'Plot – Sector 9', budget: '₹22–30L', source: 'WhatsApp', segment: 'hot', notes: 'Call back requested', added: '2026-03-28', status: 'hot' },
  { id: 'l8', name: 'Kavita Sharma', phone: '9823456789', interest: '2BHK Flat', budget: '₹28–35L', source: 'Facebook', segment: 'warm', notes: 'First time buyer', added: '2026-03-25', status: 'warm' },
];

const DEFAULT_POSTS = [
  { id: 'p1', date: '2026-04-01', title: 'Pipli Reel', type: 'ct-project', platform: 'Instagram', time: '18:30', caption: 'Sapna ghar ab hoga sach! 🏡 Pipli Sector mein best plots. DM for price!', status: 'scheduled' },
  { id: 'p2', date: '2026-04-01', title: '3BHK Launch', type: 'ct-project', platform: 'Facebook', time: '10:00', caption: 'Exciting news! 3BHK flats now available.', status: 'scheduled' },
  { id: 'p3', date: '2026-04-02', title: 'RERA Guide', type: 'ct-edu', platform: 'Both', time: '14:00', caption: 'Understanding RERA in 2026. Important for every buyer.', status: 'scheduled' },
  { id: 'p4', date: '2026-04-03', title: 'Plot Deal – S7', type: 'ct-project', platform: 'Instagram', time: '19:00', caption: 'Exclusive offer on Sector 7 plots!', status: 'scheduled' },
  { id: 'p5', date: '2026-04-04', title: 'Client Testimonial', type: 'ct-trust', platform: 'Both', time: '11:00', caption: 'What our clients say about us.', status: 'scheduled' },
  { id: 'p6', date: '2026-04-05', title: 'Inventory Post', type: 'ct-project', platform: 'Both', time: '17:30', caption: 'Current inventory update.', status: 'scheduled' },
  { id: 'p7', date: '2026-04-06', title: 'Ram Navami', type: 'ct-festival', platform: 'Both', time: '08:00', caption: 'Happy Ram Navami to everyone! ✨', status: 'scheduled' },
  { id: 'p8', date: '2026-04-07', title: '2BHK Reel', type: 'ct-project', platform: 'Instagram', time: '19:30', caption: 'Beautiful 2BHK walkthrough.', status: 'scheduled' },
  { id: 'p9', date: '2026-04-09', title: 'Loan Tips', type: 'ct-edu', platform: 'Both', time: '15:00', caption: 'How to get home loans easily.', status: 'scheduled' },
  { id: 'p10', date: '2026-04-14', title: 'Baisakhi', type: 'ct-festival', platform: 'Both', time: '09:00', caption: 'Happy Baisakhi! 🌾', status: 'scheduled' },
  { id: 'p11', date: '2026-04-17', title: 'ROI Tips', type: 'ct-edu', platform: 'Both', time: '16:00', caption: 'Real Estate ROI in Kurukshetra.', status: 'scheduled' },
  { id: 'p12', date: '2026-04-27', title: 'Hanuman Jayanti', type: 'ct-festival', platform: 'Both', time: '08:00', caption: 'Jai Bajrang Bali! Happy Hanuman Jayanti. 🙏', status: 'scheduled' }
];

const DEFAULT_NOTIFS = [
  { id: 'n1', type: 'red', icon: '↓', title: '2 quote posts scheduled', desc: 'Replace with project content — 1.1% engagement.', page: 'calendar', ts: Date.now() - 3600000 },
  { id: 'n2', type: '', icon: '⚡', title: '3 hot leads need follow-up', desc: 'Rajesh, Sunita, Pradeep — 48h+ without contact.', page: 'leads', ts: Date.now() - 7200000 },
  { id: 'n3', type: 'green', icon: '↑', title: 'Sector 7 Reel — 847 views in 3h', desc: 'Above average. Schedule 2 more plot Reels.', page: 'analytics', ts: Date.now() - 10800000 },
];

const SEG_TEMPLATES = {
  hot: [
    { label: 'Direct Deal Push', text: 'Namaskar {name} ji!\n\nAapke budget mein perfect {interest} available hai abhi!\n\nPrice: {budget} | Direct owner | Ready to move\n\nKya aap kal site visit kar sakte hain?\n– Bharat Properties ✅' },
    { label: 'Urgency Message', text: '{name} ji — yeh property sirf 2-3 din available hai!\n\nBudget: {budget} | Location: Kurukshetra\n\nAbhi reply karein — site visit book karein.\n– Bharat Properties' },
  ],
  warm: [
    { label: 'Soft Follow-up', text: 'Namaskar {name} ji!\n\nAapne pehle {interest} ke baare mein poochha tha.\n\nHamara naya listing aaya hai — aapke budget mein bilkul fit.\n\nKya main details share karoon?\n– Bharat Properties' },
  ],
  cold: [
    { label: 'Educational Nurture', text: 'Namaskar {name} ji!\n\nKurukshetra mein property invest karne ke baare mein soch rahe hain?\n\nHamne ek helpful guide banaya hai — RERA rules, market trends sab.\n\nFree mein share karoon?\n– Bharat Properties' },
  ],
  investor: [
    { label: 'ROI Report Offer', text: '{name} ji!\n\nKurukshetra plots: rental yield 6-8% + appreciation 15-20%/year.\n\nSaari details ke saath ek free ROI report share karti hoon.\n\nInterested?\n– Bharat Properties' },
  ],
};

const PAGE_META = {
  overview: { title: 'Command Center', sub: 'Real-time AI Marketing Overview · Kurukshetra, Haryana' },
  calendar: { title: 'Content Calendar', sub: 'April 2026 · Click any cell to view/edit · Gold = today' },
  analytics: { title: 'Analytics', sub: 'Performance · 30 days · Instagram + WhatsApp + Facebook' },
  agents: { title: 'AI Agents (4)', sub: 'Metrics · Social · Designer · Scheduling · Chain orchestration' },
  campaign: { title: 'Campaign Engine', sub: 'Omnichannel · WhatsApp · SMS · Email · RCS · Segmentation' },
  leads: { title: 'CRM Leads', sub: 'All leads · Search · Filter · Add · Follow Up' },
  strategies: { title: 'Optimization', sub: '7 strategies + 3 new content angles · Performance-based' },
  designer: { title: 'Designer Studio', sub: 'DALL·E + Runway · Visual prompts with Copy buttons' },
  techstack: { title: 'Tech Stack', sub: 'Next.js · Node.js · MongoDB · Redis · BullMQ · APIs' },
};

const AGENT_RESULTS = {
  metrics: "Analysis Complete. Key findings: 1. Reels outperforming static posts by 3.2x. 2. Peak engagement window identified: 7:15 PM - 9:30 PM. 3. Sector 7 content has 14% higher save rate than generic listings. Recommendation: Focus on 15s Property Walkthrough Reels with local Kurukshetra trending audio.",
  social: "April 2026 Strategy Locked. 31 posts mapped. Distribution: 70% Real Estate project focused, 20% Educational (RERA/Registry), 10% Local Trust/Lifestyle. Next 3 posts: Monday 7pm (Sector 7 Walkthrough), Tuesday 1pm (RERA Guide), Wednesday 8pm (Client Testimonial).",
  designer: "Visual prompts generated for next 5 posts. Image Prompts for DALL·E: 'Cinematic golden hour plot view, photorealistic architecture style'. Video Prompts for Runway: 'Drone fly-through of Sector 7 Kurukshetra, slow motion, crisp 4k content'. UI overlays synced with brand Gold/Navy palette.",
  scheduler: "BullMQ queue synchronized with CRM. 6 posts ready in Redis storage. Delay triggers set per metrics manager peak time data. Next auto-publish: Today 7:30 PM. Status: All systems green."
};

const ORCH_SUMMARY = "Omnichannel Orchestration Successful. System analyzed 1,248 target leads. Segmented 156 high-priority Sector 7 prospects. Generated 3-day WhatsApp/SMS drip sequence. Content synchronized with Instagram/Facebook schedule. Dynamic price-reveal templates mapped to individual lead metadata. Ready for blast at 9:30 AM tomorrow.";

const STRAT_PROMPTS = {
  reel_hooks: "✦ Hook 1: 'Sector 7 mein plot? Pehle yeh registry ki sachai jaan lo!'\n✦ Hook 2: 'Property invest karne se pehle 3 cheezein check karein.'\n✦ Hook 3: 'Kurukshetra ka sabse hot location—price reveal inside!'",
  schedule_plan: "AI analysis complete. Output generated based on Bharat Properties data for Kurukshetra market. All recommendations follow the 70% rule and 80-10-7-3 content distribution strategy.",
  story_ctas: "1. Poll: 'Invest or Rent?'\n2. Slider: 'How much do you like the view?'\n3. DM Trigger: 'Type PLOTS for Price List'.",
  seventy_rule: "Prioritizing Deal #HP-102 and #HP-115. Auto-suppressing 3 educational posts to ensure listing visibility during peak intent week.",
  carousel_script: "Slide 1: Why Sector 7 is the best for 2026.\nSlide 2: ROI Growth: 12% to 18% in 18 months.\nSlide 3: Infrastructure Update: New 60ft roads.\nSlide 4: Connectivity: 5 mins from Highway.\nSlide 10: Visit Bharat Properties for exclusive deals.",
  collab_dm: "1. @KurukshetraVlogs - Review offer sent.\n2. @LifestyleWithKUK - Property tour scheduled.\n3. @KarnalPropertyHub - Collab post queued.",
  hashtags: "Set 1: #KurukshetraRealEstate #Sector7Plots #Investment\nSet 2: #HaryanaProperty #PlotForSale #DreamHome\nSet 3: #BharatProperties #RealEstateIndia #PropertyWealth"
};

const KPI_CARDS = [
  { label: 'BIGGEST LEVER', val: '+5 Reels/wk', sub: '9.2/10 impact', type: 'green' },
  { label: 'QUICK WIN', val: '7-9 PM Lock', sub: '+30% reach instantly', type: 'green' },
  { label: 'STOP DOING', val: 'Quote Posts', sub: '1.1% – replacing now', type: 'red' },
  { label: 'NEW ANGLES', val: '3', sub: 'Untried, high potential', type: 'green' }
];

const STRATEGIES_DATA = [
  { id: 'schedule_plan', i: '1', n: 'Double Reels frequency — 5 per week minimum', im: 'imp-high', it: 'High Impact', d: 'Project Reels at 8.4% — 3x better than quote posts. Push to 5+/week. Each Reel: different angle (aerial, interior, neighbourhood, price reveal, before/after). Never same shot twice.', tags: ['5x/week', 'Different angles', '15-30 sec'] },
  { id: '7_9_lock', i: '2', n: 'Lock every post to 7–9 PM — no exceptions', im: 'imp-high', it: 'High Impact', d: 'Historical data shows peak engagement for Project Reels on Tue/Thu at 7:15 PM.', tags: ['Timing', 'Peak Hour'] },
  { id: 'story_funnel', i: '3', n: 'Story → DM funnel after every Reel', im: 'imp-high', it: 'High Impact', d: 'Replace "DM for info" with "Tap for Price List" to increase link-clicks by 24%.', tags: ['Conversion', 'Automation'] },
  { id: 'seventy_rule', i: '4', n: 'Enforce 70% rule — data drives next month', im: 'imp-high', it: 'High Impact', d: 'System will auto-prioritize CRM listings over quote/educational posts this week.', tags: ['Priority', 'Inventory'] },
  { id: 'carousel_script', i: '5', n: 'Before/after and price journey carousels', im: 'imp-med', it: 'Medium Impact', d: '10-slide educational carousel explaining 2-year plot appreciation in Sector 7.', tags: ['Educational', 'Trust'] },
  { id: 'collab_dm', i: '6', n: 'Colab with 3 local Kurukshetra pages', im: 'imp-med', it: 'Medium Impact', d: 'List of top 5 Kurukshetra lifestyle influencers for automated outreach.', tags: ['Growth', 'Local'] },
  { id: 'hashtags', i: '7', n: '3 rotating hashtag sets — never repeat', im: 'imp-low', it: 'Baseline fix', d: 'Reduce shadow-ban risk by cycling through 3 curated tag groups.', tags: ['SEO', 'Algorithm'] }
];

const NEW_ANGLES_DATA = [
  { id: 'a', n: 'Agent on the Ground POV', icon: '🤖', d: 'You walking a plot on camera, talking directly to viewer. Raw, first-person. 3-5x more trust than polished visuals.', q: '"Main yahaan Sector 7 mein khada hoon — aaj evening tak available hai.."', color: 'var(--green)' },
  { id: 'b', n: 'Neighbourhood ROI Data', icon: '📊', d: 'Hyper-local price appreciation data. Investors share obsessively. Positions BP as market authority.', q: '"Pipli: 2019 ₹8L/marla → 2024 ₹19L/marla. 137% growth.."', color: 'var(--blue)' },
  { id: 'c', n: 'Ghar ki Kahani Series', icon: '💬', d: 'Real buyer stories. Mirrors emotional journey. Extremely shareable — sounds like a friend\'s advice.', q: 'Series: 1 story/week. First-time buyer, investor, NRI family.', color: 'var(--red)' }
];

const CAMP_KPIS = [
  { label: 'ACTIVE CAMPAIGNS', val: '7', sub: 'All segments live', type: 'blue' },
  { label: 'MESSAGES SENT', val: '284', sub: 'This week', type: 'blue' },
  { label: 'REPLY RATE', val: '34%', sub: 'WhatsApp best', type: 'green' },
  { label: 'CONVERSIONS', val: '12', sub: 'This month', type: 'blue' }
];

const CAMP_SEGMENTS = [
  { id: 'hot', n: 'Hot Buyer', c: '4', i: '🔥' },
  { id: 'warm', n: 'Warm Buyer', c: '2', i: '⚡' },
  { id: 'cold', n: 'Cold Lead', c: '0', i: '❄️' },
  { id: 'investor', n: 'Investor', c: '1', i: '📈' },
  { id: 'seller', n: 'Seller', c: '0', i: '🏠' },
  { id: 'tenant', n: 'Tenant', c: '1', i: '🔑' }
];

const SEND_TIMES = [
  { time: '9–11 AM', ch: 'Email', color: 'var(--blue)' },
  { time: '12–2 PM', ch: 'SMS', color: 'var(--blue)' },
  { time: '6–9 PM', ch: 'WhatsApp', color: 'var(--green)' },
  { time: '8 PM', ch: 'RCS', color: 'var(--purple)' }
];

const DRIP_STEPS = [
  { day: 'Day 0 — Instant', title: 'Welcome WhatsApp', desc: 'New lead → Segment assigned → Welcome WhatsApp with relevant property', dotColor: 'var(--gold)' },
  { day: 'Day 1 — 7 PM', title: 'Deal Push', desc: 'Property matched to budget + CTA to visit', dotColor: 'var(--gold)' },
  { day: 'Day 3 — 10 AM', title: 'Email Follow-up', desc: 'Market insight + trust content + soft CTA', dotColor: 'var(--gold)' },
  { day: 'Day 7 — 6 PM', title: 'New Offer', desc: 'Different property angle / price drop alert', dotColor: 'var(--gold)' },
  { day: 'Day 14+', title: 'RCS Re-engagement', desc: 'Rich card with "View Details" + "Call Now"', dotColor: 'var(--gold)' }
];

const COMPLIANCE_CHECKS = [
  { n: 'WhatsApp → Meta Business API only', d: 'No bulk unofficial tools — account ban risk', status: 'pass' },
  { n: 'SMS → DLT approved templates (Airtel / Jio)', d: 'TRAI compliance mandatory', status: 'pass' },
  { n: 'Email → Opt-in only', d: 'Unsubscribe link required in every email', status: 'pass' },
  { n: 'RCS → Verified sender via Google RBM', d: 'Brand verification required', status: 'pass' },
  { n: 'No bulk spam', d: 'Low trust + account ban risk across all platforms', status: 'fail' }
];

const COMMAND_KPIS = [
  { label: 'TOTAL LEADS', val: '8', sub: '↑ 3 hot leads need attention', type: 'green' },
  { label: 'POSTS SCHEDULED', val: '31', sub: 'Full April planned', type: 'blue' },
  { label: 'AVG ENGAGEMENT', val: '6.4%', sub: '↑ 1.2% vs last month', type: 'green' },
  { label: 'PIPELINE VALUE', val: '₹4.2Cr', sub: 'Active deals', type: 'blue' }
];

const FLOW_STEPS = [
  { id: 1, n: 'CRM Data' },
  { id: 2, n: 'Metrics Mgr' },
  { id: 3, n: 'Social Media Mgr' },
  { id: 4, n: 'Designer' },
  { id: 5, n: 'Scheduling Mgr' },
  { id: 6, n: 'Publish' },
  { id: 7, n: 'Metrics Update' }
];

const CONTENT_DISTRIBUTION = [
  { l: 'Projects', p: 80, c: 'var(--navy-mid)' },
  { l: 'Educational', p: 10, c: 'var(--green)' },
  { l: 'Trust', p: 7, c: 'var(--gold)' },
  { l: 'Festivals', p: 3, c: 'var(--red)' }
];

const TOP_PERFORMING = [
  { n: 'Project Reels', p: 8.4, c: 'var(--blue)' },
  { n: 'CRM Posts', p: 7.6, c: 'var(--green)' },
  { n: 'Carousels', p: 6.2, c: 'var(--gold)' },
  { n: 'Quote Posts', p: 1.1, c: 'var(--red)' }
];

const AGENT_LIST = [
  { n: 'Metrics Manager', m: 'Gemini', t: 'Last run: 2h ago', s: 'active', i: '📊' },
  { n: 'Social Media Mgr', m: 'GPT-4', t: 'Planning week 2', s: 'active', i: '📅' },
  { n: 'Designer', m: 'DALL-E + Runway', t: 'Waiting for prompt', s: 'standby', i: '🎨' },
  { n: 'Scheduling Mgr', m: 'Claude', t: 'Queue: 6 posts', s: 'active', i: '🕓' }
];

const LIVE_ALERTS = [
  { id: 1, t: 'Agents updated', d: 'All 4 agents ran. Visit AI Agents page for full output.', i: '🤖', type: 'blue' },
  { id: 2, t: '2 quote posts scheduled', d: 'Replace with project content — 11% engagement.', i: '⬇', type: 'red' },
  { id: 3, t: '3 hot leads need follow-up', d: 'Rajesh, Sunita, Pradeep — 48h+ without contact.', i: '⚠', type: 'gold' }
];

const OMNI_CHANNELS = [
  { n: 'WhatsApp', sub: 'Meta Business API', i: '💬', p: 85, c: 'var(--green)' },
  { n: 'SMS (DLT)', sub: 'Airtel - TRAI approved', i: '📱', p: 70, c: 'var(--blue)' },
  { n: 'Email', sub: 'SendGrid - Opt-in only', i: '✉️', p: 45, c: 'var(--gold)' },
  { n: 'RCS', sub: 'Google RBM - Setup', i: '📡', p: 20, c: 'var(--purple)' }
];

export default function MarketingOverviewPage() {
  // ── CORE STATE ──
  const [activePage, setActivePage] = useState('overview');
  const [leads, setLeads] = useState(() => DB.get('leads', DEFAULT_LEADS));
  // Force reset posts if they were old (less than 10 posts)
  const [posts, setPosts] = useState(() => {
    const stored = DB.get('posts', DEFAULT_POSTS);
    if (stored.length < 10) return DEFAULT_POSTS;
    return stored;
  });
  const [notifs, setNotifs] = useState(() => DB.get('notifs', DEFAULT_NOTIFS));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  
  // ══ v2.5 UPGRADE STATES ══
  const [agentOutputs, setAgentOutputs] = useState({ metrics: '', social: '', designer: '', scheduler: '' });
  const [agentLoading, setAgentLoading] = useState({ metrics: false, social: false, designer: false, scheduler: false });
  const [orchStep, setOrchStep] = useState(0); // 0-4
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [orchSummary, setOrchSummary] = useState('');
  const [designerHistory, setDesignerHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('bp_designer_history_v2');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [captionOutput, setCaptionOutput] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [designLoading, setDesignLoading] = useState(false);

  // ── FILTER & MODAL STATE ──
  const [leadFilter, setLeadFilter] = useState('all');
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [activeCalDate, setActiveCalDate] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  // ══ v2.5 UPGRADE FUNCTIONS ══
  const simulateStreaming = (text, setter, onDone) => {
    let current = '';
    const words = text.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i < words.length) {
        current += (i === 0 ? '' : ' ') + words[i];
        setter(current);
        i++;
      } else {
        clearInterval(interval);
        if (onDone) onDone();
      }
    }, 40);
  };

  const saveToHistory = (text) => {
    setDesignerHistory(prev => {
      const newHist = [{ id: Date.now(), text, date: new Date().toLocaleTimeString() }, ...prev].slice(0, 10);
      localStorage.setItem('designer_history', JSON.stringify(newHist));
      return newHist;
    });
    toast.success('Prompt saved');
  };

  const runAgentTask = (id) => {
    setAgentLoading(prev => ({ ...prev, [id]: true }));
    setAgentOutputs(prev => ({ ...prev, [id]: '' }));
    setTimeout(() => {
      setAgentLoading(prev => ({ ...prev, [id]: false }));
      simulateStreaming(AGENT_RESULTS[id], (val) => setAgentOutputs(prev => ({ ...prev, [id]: val })));
    }, 1500);
  };

  const runFullOrchestration = () => {
    if (isOrchestrating) return;
    setIsOrchestrating(true);
    setOrchStep(1);
    setOrchSummary('');
    const steps = [{ s: 1, d: 2000 }, { s: 2, d: 2500 }, { s: 3, d: 2500 }, { s: 4, d: 2000 }];
    let cur = 0;
    steps.forEach((s) => {
      cur += s.d;
      setTimeout(() => {
        setOrchStep(s.s);
        if (s.s === 4) {
          setTimeout(() => {
            setOrchStep(5);
            setIsOrchestrating(false);
            simulateStreaming(ORCH_SUMMARY, setOrchSummary);
            toast.success('System Synchronized');
          }, 1500);
        }
      }, cur);
    });
  };

  const genStrategyContent = (id) => {
    setStratOutputs(prev => ({ ...prev, [id]: '✦ Planning...' }));
    setTimeout(() => {
      simulateStreaming(STRAT_PROMPTS[id], (val) => setStratOutputs(prev => ({ ...prev, [id]: val })));
    }, 1200);
  };

  const genCaption = (e) => {
    e.preventDefault();
    setIsGeneratingCaption(true);
    setCaptionOutput('');
    setTimeout(() => {
      setIsGeneratingCaption(false);
      simulateStreaming(SAMPLE_CAPTION, setCaptionOutput);
    }, 1500);
  };

  const handleDesignerGen = (type) => {
    setDesignLoading(true);
    setTimeout(() => {
      setDesignLoading(false);
      if (type === 'prompt') {
        toast.success('Visual Prompts Generated');
      } else {
        simulateStreaming(SAMPLE_CAPTION, setCaptionOutput);
        toast.success('Caption Generated');
      }
    }, 2000);
  };

  const toggleStrategy = (id) => {
    setOpenStrategies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── CALENDAR STATE ──
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(3); // April

  // ── DESIGNER STATE ──
  const [designPrompt, setDesignPrompt] = useState(null);

  // ── OPTIMIZATION (STRATEGIES) STATE ──
  const [openStrategies, setOpenStrategies] = useState(new Set(['reel_hooks']));
  const [stratOutputs, setStratOutputs] = useState({});

  // ── CAMPAIGN STATE ──
  const [selectedSeg, setSelectedSeg] = useState('hot');

  // ── PERSISTENCE ──
  useEffect(() => DB.set('leads', leads), [leads]);
  useEffect(() => DB.set('posts', posts), [posts]);
  useEffect(() => DB.set('notifs', notifs), [notifs]);

  // ── DERIVED DATA ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchFilter = leadFilter === 'all' || l.status === leadFilter;
      const matchSearch = !searchQuery || 
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (l.phone || '').includes(searchQuery) || 
        (l.interest || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [leads, leadFilter, searchQuery]);

  const stats = useMemo(() => {
    const hot = leads.filter(l => l.status === 'hot').length;
    const warm = leads.filter(l => l.status === 'warm').length;
    const conv = leads.filter(l => l.status === 'converted').length;
    return { hot, warm, conv, total: leads.length };
  }, [leads]);

  // ── HANDLERS ──
  const addNotif = (title, desc, type = '', icon = '👤', page = 'overview') => {
    const newNotif = { id: 'n' + Date.now(), title, desc, type, icon, page, ts: Date.now() };
    setNotifs(prev => [newNotif, ...prev.slice(0, 9)]);
  };

  const deleteLead = (id) => {
    if (window.confirm('Delete this lead?')) {
      setLeads(prev => prev.filter(l => l.id !== id));
      toast.success('Lead deleted');
    }
  };

  const handleSaveLead = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newLead = {
      id: 'l' + Date.now(),
      name: formData.get('name'),
      phone: formData.get('phone'),
      interest: formData.get('interest'),
      budget: formData.get('budget'),
      source: formData.get('source'),
      segment: formData.get('segment'),
      notes: formData.get('notes'),
      added: new Date().toISOString().split('T')[0],
      status: formData.get('segment'),
    };
    if (!newLead.name || !newLead.phone) {
      toast.error('Name and Phone are required');
      return;
    }
    setLeads(prev => [newLead, ...prev]);
    setShowAddLeadModal(false);
    toast.success('Lead Added: ' + newLead.name);
    addNotif('New lead: ' + newLead.name, newLead.interest || 'New inquiry', 'green', '👤', 'leads');
  };

  const handleSavePost = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const status = e.target.querySelector('.pstatus-btn.active')?.dataset.status || 'scheduled';
    const postData = {
      title: formData.get('title'),
      platform: formData.get('platform'),
      type: formData.get('type'),
      time: formData.get('time'),
      caption: formData.get('caption'),
      status,
      date: activeCalDate,
    };
    if (editingPost) {
      setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...postData, id: p.id } : p));
      toast.success('Post Updated');
    } else {
      setPosts(prev => [...prev, { ...postData, id: 'p' + Date.now() }]);
      toast.success('Post Added to Calendar');
    }
    setShowPostModal(false);
  };

  const deletePost = () => {
    if (editingPost && window.confirm('Delete this post?')) {
      setPosts(prev => prev.filter(p => p.id !== editingPost.id));
      setShowPostModal(false);
      toast.success('Post deleted');
    }
  };


  // ── CALENDAR RENDER HELPERS ──
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const currentMonthPosts = useMemo(() => {
    return posts.filter(p => {
      const d = new Date(p.date);
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    });
  }, [posts, calYear, calMonth]);

  // ── UI COMPONENTS ──
  const SidebarItem = ({ id, label, icon: Icon, badge, isLive }) => (
    <div 
      className={`nav-item ${activePage === id ? 'active' : ''}`} 
      onClick={() => { setActivePage(id); setSidebarOpen(false); }}
    >
      <span className="nav-icon"><Icon size={18} /></span>
      {label}
      {badge && <span className={`nav-badge ${isLive ? 'live' : ''}`}>{badge}</span>}
    </div>
  );

  return (
    <div className="marketing-os-container">
      {/* ══ SIDEBAR ══ */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">B</div>
          <div className="logo-name">Bharat Properties</div>
          <div className="logo-sub">AI Marketing OS v2.1</div>
        </div>
        
        <div className="sidebar-section">
          <div className="sidebar-section-label">Core</div>
          <SidebarItem id="overview" label="Command Center" icon={LayoutDashboard} badge="Live" isLive />
          <SidebarItem id="calendar" label="Content Calendar" icon={Calendar} badge={posts.length} />
          <SidebarItem id="analytics" label="Analytics" icon={BarChart3} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">AI System</div>
          <SidebarItem id="agents" label="AI Agents (4)" icon={Bot} />
          <SidebarItem id="designer" label="Designer Studio" icon={Palette} />
          <SidebarItem id="strategies" label="Optimization" icon={Target} badge="7+3" />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Campaigns</div>
          <SidebarItem id="campaign" label="Campaign Engine" icon={Megaphone} />
          <SidebarItem id="leads" label="CRM Leads" icon={Home} badge={stats.hot > 0 ? `${stats.hot}🔥` : '🏠'} />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">System</div>
          <SidebarItem id="techstack" label="Tech Stack" icon={Settings} />
        </div>

        <div className="sidebar-footer">
          <div className="agent-status-row">
            <div className="status-dot on"></div>
            <div className="status-name">Metrics Manager</div>
            <div className="status-ai">Gemini</div>
          </div>
          <div className="agent-status-row">
            <div className="status-dot on"></div>
            <div className="status-name">Social Media Mgr</div>
            <div className="status-ai">GPT-5</div>
          </div>
          <div className="agent-status-row">
            <div className="status-dot on"></div>
            <div className="status-name">Scheduling Mgr</div>
            <div className="status-ai">Claude</div>
          </div>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
          
          <div className="topbar-left">
            <div className="page-title">{PAGE_META[activePage].title}</div>
            <div className="page-sub">{PAGE_META[activePage].sub}</div>
          </div>

          <div className="search-wrap-outer">
            <div className="search-wrap">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search leads, posts, assets..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <div className="search-results-fid">
                {/* Search results logic */}
              </div>
            )}
          </div>

          <div className="topbar-right">
            <div className="topbar-stats">
              <span className="tpill" style={{ background: 'rgba(53,185,122,.1)', color: 'var(--green)' }}>● 3 Active Agents</span>
              <span className="tpill" style={{ background: 'rgba(201,146,26,.08)', color: 'var(--gold-l)' }}>April 2026</span>
            </div>

            <button className="notif-btn-fid" onClick={() => setShowNotifPanel(!showNotifPanel)}>
              <Bell size={20} />
              {notifs.length > 0 && <div className="notif-dot-fid" />}
            </button>
            <button className={`tact-btn-fid ${isOrchestrating ? 'active' : ''}`} onClick={runFullOrchestration}>
              {isOrchestrating ? <><span className="spinner-sm"></span></> : <Play size={14} fill="currentColor" />}
              <span>{isOrchestrating ? 'Orchestrating...' : 'Run Engine'}</span>
            </button>
            <button className="tact-btn-fid primary" onClick={() => setShowAddLeadModal(true)}>
              <Plus size={16} />
              <span>Add Lead</span>
            </button>
          </div>
        </header>

        {/* NOTIFICATION PANEL */}
        {showNotifPanel && (
          <div id="notif-panel" style={{ display: 'block', position: 'fixed', top: '60px', right: '1rem', width: '320px', background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: '14px', zIndex: 300, overflow: 'hidden' }}>
            <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--white)' }}>Notifications</span>
              <button onClick={() => setNotifs([])} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '10px', cursor: 'pointer' }}>Clear all</button>
            </div>
            <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '.5rem' }}>
              {notifs.map(n => (
                <div key={n.id} className={`alert-row ${n.type}`} style={{ background: 'var(--surface)', padding: '10px', borderRadius: '10px', marginBottom: '5px', position: 'relative' }}>
                  <div className="alert-icon">{n.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="alert-title">{n.title}</div>
                    <div className="alert-desc">{n.desc}</div>
                  </div>
                  <button className="alert-dismiss" onClick={() => setNotifs(prev => prev.filter(x => x.id !== n.id))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="page-content">
          {/* ════ OVERVIEW (COMMAND CENTER) ════ */}


          {/* ════ ANALYTICS ════ */}
          {activePage === 'overview' && (
            <>
              {/* Header Metrics */}
              <div className="perf-kpi-grid">
                {COMMAND_KPIS.map((k, idx) => (
                  <div key={idx} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-val">{k.val}</div>
                    <div className={`kpi-sub ${k.type}`}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                  <div className="card-title">
                    <img src="https://api.iconify.design/lucide:zap.svg?color=%23C9921A" alt="zap" className="card-title-icon-img" />
                    Full System Flow
                  </div>
                </div>
                <div className="card-body" style={{ padding: '1.5rem' }}>
                  <div className="flow-timeline-v2">
                    {FLOW_STEPS.map((s, idx) => (
                      <React.Fragment key={s.id}>
                        <div className="flow-node-v2 active">
                          <div className="flow-node-v2-num">{s.id}</div>
                          <div className="flow-node-v2-name">{s.n}</div>
                        </div>
                        {idx < FLOW_STEPS.length - 1 && <div className="flow-connector-v2">→</div>}
                        {idx === FLOW_STEPS.length - 1 && <div className="flow-connector-v2 loop">↺</div>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              <div className="command-grid-v2">
                {/* Left Column */}
                <div className="command-col-left">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:bar-chart-3.svg?color=%23C9921A" alt="chart" className="card-title-icon-img" />
                        Content Distribution
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="stacked-bar-v2">
                        {CONTENT_DISTRIBUTION.map((seg, idx) => (
                          <div key={idx} className="stacked-seg-v2" style={{ width: `${seg.p}%`, background: seg.c }}>
                            {seg.p}%
                          </div>
                        ))}
                      </div>
                      <div className="mix-legend-v2">
                        {CONTENT_DISTRIBUTION.map((seg, idx) => (
                          <div key={idx} className="mix-leg-item-v2">
                            <div className="mix-dot-v2" style={{ background: seg.c }}></div>
                            {seg.l} {seg.p}%
                          </div>
                        ))}
                      </div>

                      <div className="top-perf-sec">
                        <div className="sec-label">TOP PERFORMING THIS MONTH</div>
                        <div className="perf-list-v2">
                          {TOP_PERFORMING.map((p, idx) => (
                            <div key={idx} className="perf-list-row">
                              <div className="perf-name-v2">{p.n}</div>
                              <div className="perf-bar-v2">
                                <div className="perf-bar-fill-v2" style={{ width: `${p.p * 10}%`, background: p.c }}></div>
                              </div>
                              <div className="perf-val-v2" style={p.n === 'Quote Posts' ? { color: 'var(--red)' } : {}}>{p.p}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ marginTop: '1.25rem' }}>
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:megaphone.svg?color=%23C9921A" alt="campaign" className="card-title-icon-img" />
                        Campaign Status
                      </div>
                      <button className="tact-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setActivePage('campaign')}>Manage</button>
                    </div>
                    <div className="card-body" style={{ padding: '1.25rem' }}>
                      <div className="camp-stat-row-v2">
                        <div className="cs-item-v2">
                          <div className="cs-val-v2">7</div>
                          <div className="cs-label-v2">Active</div>
                        </div>
                        <div className="cs-item-v2">
                          <div className="cs-val-v2">284</div>
                          <div className="cs-label-v2">Sent</div>
                        </div>
                        <div className="cs-item-v2">
                          <div className="cs-val-v2">34%</div>
                          <div className="cs-label-v2">Reply rate</div>
                        </div>
                        <div className="cs-item-v2">
                          <div className="cs-val-v2">12</div>
                          <div className="cs-label-v2">Converted</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="command-col-right">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:users.svg?color=%23C9921A" alt="agents" className="card-title-icon-img" />
                        Agent Status
                      </div>
                      <button className="tact-btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setActivePage('agents')}>All Agents</button>
                    </div>
                    <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                      <div className="agent-status-list-v2">
                        {AGENT_LIST.map((a, idx) => (
                          <div key={idx} className="agent-status-item">
                            <div className="asi-icon-wrap">{a.i}</div>
                            <div className="asi-info">
                              <div className="asi-name">{a.n}</div>
                              <div className="asi-meta">{a.m} · {a.t}</div>
                            </div>
                            <div className={`asi-status-badge ${a.s}`}>● {a.s.charAt(0).toUpperCase() + a.s.slice(1)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ marginTop: '1.25rem' }}>
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:bell.svg?color=%23C9921A" alt="alerts" className="card-title-icon-img" />
                        Live Alerts
                      </div>
                    </div>
                    <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                      <div className="live-alerts-list-v2">
                        {LIVE_ALERTS.map(alert => (
                          <div key={alert.id} className={`live-alert-card-v2 ${alert.type}`}>
                            <div className="lac-icon-v2">{alert.i}</div>
                            <div className="lac-info-v2">
                              <div className="lac-title-v2">{alert.t}</div>
                              <div className="lac-desc-v2">{alert.d}</div>
                            </div>
                            <button className="lac-dismiss-v2">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Omnichannel Status Section */}
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <div className="card-title">
                    <img src="https://api.iconify.design/lucide:zap.svg?color=%23C9921A" alt="omni" className="card-title-icon-img" />
                    Omnichannel Status
                  </div>
                </div>
                <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                  <div className="omni-grid-v2">
                    {OMNI_CHANNELS.map((ch, idx) => (
                      <div key={idx} className="omni-card-v2">
                        <div className="oc-icon-v2">{ch.i}</div>
                        <div className="oc-info-v2">
                          <div className="oc-name-v2">{ch.n}</div>
                          <div className="oc-sub-v2">{ch.sub}</div>
                        </div>
                        <div className="oc-bar-v2">
                          <div className="oc-bar-fill-v2" style={{ width: `${ch.p}%`, background: ch.c }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Queue Manager & Activity Log Row */}
              <div className="command-grid-v2" style={{ marginTop: '1.5rem' }}>
                <div className="command-col-left">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:list-ordered.svg?color=%23C9921A" alt="queue" className="card-title-icon-img" />
                        Post Queue (BullMQ)
                      </div>
                      <div className="ach-badge" style={{ background: 'rgba(53,185,122,0.1)', color: 'var(--green)' }}>Redis Connected</div>
                    </div>
                    <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                      <div className="queue-list-fid">
                        {[
                          { t: 'Sector 7 Price Reveal Reel', p: 'Instagram', s: '7:30 PM', d: '2h 15m', tag: 'High priority' },
                          { t: 'Pipli Investment Guide', p: 'Facebook', s: 'Tomorrow 9:00 AM', d: '12h 45m', tag: 'Scheduled' },
                          { t: 'Client Testimonial: Ashok Ji', p: 'Google BP', s: 'April 4, 3:00 PM', d: '2 days', tag: 'Draft' }
                        ].map((q, idx) => (
                          <div key={idx} className="queue-item-v2">
                            <div className="q-left">
                              <div className="q-title">{q.t}</div>
                              <div className="q-meta">{q.p} • {q.tag}</div>
                            </div>
                            <div className="q-right">
                              <div className="q-time">{q.s}</div>
                              <div className="q-countdown">In {q.d}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="command-col-right">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <img src="https://api.iconify.design/lucide:activity.svg?color=%23C9921A" alt="activity" className="card-title-icon-img" />
                        Real-time Marketing Activity
                      </div>
                    </div>
                    <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                      <div className="activity-feed-v2">
                        {[
                          { t: 'Reel Posted', p: 'Sector 7 Walking Tour', m: 'Instagram', s: 'Success', ts: '10m ago', c: 'var(--green)' },
                          { t: 'New Lead', p: 'Rajesh Kumar', m: 'WhatsApp', s: 'Hot', ts: '22m ago', c: 'var(--gold)' },
                          { t: 'Drip Started', p: 'Investor Sequence', m: 'Omnichannel', s: 'Active', ts: '1h ago', c: 'var(--blue)' },
                          { t: 'Strategy Opt', p: 'Reel Freq increased', m: 'AI Agent', s: 'Applied', ts: '3h ago', c: 'var(--purple)' }
                        ].map((act, idx) => (
                          <div key={idx} className="activity-item-v2">
                            <div className="act-dot-v2" style={{ background: act.c }}></div>
                            <div className="act-info-v2">
                              <div className="act-top">
                                <span className="act-type">{act.t}</span>
                                <span className="act-ts">{act.ts}</span>
                              </div>
                              <div className="act-desc">{act.p} • {act.m}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activePage === 'calendar' && (
            <div className="calendar-v2-container">
              <div className="calendar-toolbar-v2">
                <div className="cal-month-nav-v2">
                  <button className="cal-nav-btn-v2" onClick={() => setCalMonth(m => m === 0 ? 11 : m - 1)}>‹</button>
                  <div className="cal-month-name-v2">{monthNames[calMonth]} {calYear}</div>
                  <button className="cal-nav-btn-v2" onClick={() => setCalMonth(m => m === 11 ? 0 : m + 1)}>›</button>
                </div>
                <div className="cal-actions-v2">
                  <button className="tact-btn gold-ghost sm" onClick={() => toast('Syncing with CRM...')}>Import CRM</button>
                  <button className="tact-btn primary sm" onClick={() => { setActiveCalDate(new Date().toISOString().split('T')[0]); setEditingPost(null); setShowPostModal(true); }}>+ Add Post</button>
                </div>
              </div>

              <div className="card calendar-card-v2">
                <div className="card-body" style={{ padding: '0' }}>
                  <div className="cal-grid-v2">
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <div key={d} className="cal-day-head-v2">{d}</div>)}
                    
                    {[...Array(startOffset)].map((_, i) => <div key={`empty-${i}`} className="cal-cell-v2 empty" />)}
                    
                    {[...Array(daysInMonth)].map((_, i) => {
                      const d = i + 1;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const dayPosts = posts.filter(p => p.date === dateStr);
                      // Image shows April 1st as "Today" (gold border)
                      const isToday = d === 1 && calMonth === 3; 

                      return (
                        <div key={d} className={`cal-day-v2 ${isToday ? 'today' : ''}`} onClick={() => { setActiveCalDate(dateStr); setEditingPost(null); setShowPostModal(true); }}>
                          <div className="cal-date-label">{d}</div>
                          <div className="cal-posts-list">
                            {dayPosts.map(p => (
                              <div key={p.id} className={`cal-post-item ${p.type}`} onClick={(e) => { e.stopPropagation(); setEditingPost(p); setActiveCalDate(p.date); setShowPostModal(true); }}>
                                {p.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cal-footer-v2">
                    <div className="cal-legend-v2">
                      <div className="cl-item-v2"><div className="cl-dot-v2 cp-blue"></div>Project/Deal</div>
                      <div className="cl-item-v2"><div className="cl-dot-v2 cp-green"></div>Educational</div>
                      <div className="cl-item-v2"><div className="cl-dot-v2 cp-gold"></div>Trust</div>
                      <div className="cl-item-v2"><div className="cl-dot-v2 cp-red"></div>Festival</div>
                    </div>
                    <div className="cal-hint-v2">Gold border = Today · Click any cell</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePage === 'leads' && (
            <div className="card">
               <div className="card-header">
                 <div className="card-title">Real-Time CRM Pipeline</div>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    <select className="tact-btn" value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} style={{ background: 'var(--navy2)', color: 'var(--gold-l)' }}>
                      <option value="all">All Segments</option>
                      <option value="hot">🔥 High Intent</option>
                      <option value="warm">⚡ Warming Up</option>
                      <option value="converted">✅ Closed Deals</option>
                    </select>
                    <button className="tact-btn primary" onClick={() => setShowAddLeadModal(true)}>+ New Inquiry</button>
                 </div>
               </div>
               <div className="card-body" style={{ padding: 0 }}>
                 <table className="bp-table">
                   <thead>
                     <tr>
                       <th>Inquiry Identity</th>
                       <th>Property Interest</th>
                       <th>Budget Goal</th>
                       <th>Status</th>
                       <th style={{ textAlign: 'right' }}>Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredLeads.map(l => (
                       <tr key={l.id}>
                         <td><div style={{ fontWeight: 600, color: 'var(--white)' }}>{l.name}</div><div style={{ fontSize: '11px', color: 'var(--text2)' }}>{l.phone}</div></td>
                         <td>{l.interest}</td>
                         <td>{l.budget}</td>
                         <td><span className={`pill pill-${l.status}`}>{l.status.toUpperCase()}</span></td>
                         <td style={{ textAlign: 'right' }}>
                           <button className="tact-btn" style={{ padding: '6px 12px' }} onClick={() => { setFollowUpLead(l); setShowFollowUpModal(true); }}>Engage</button>
                           <button className="tact-btn" style={{ padding: '6px 10px', marginLeft: '8px', borderColor: 'rgba(224,82,82,0.3)', color: 'var(--red)' }} onClick={() => { if(confirm('Delete lead?')) deleteLead(l.id); }}>✕</button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activePage === 'analytics' && (
            <div className="analytics-dashboard">
              {/* Stat Cards Row */}
              <div className="analytics-stat-row">
                <div className="analytics-card">
                  <div className="ac-label">Avg Engagement</div>
                  <div className="ac-value">8.4%</div>
                  <div className="ac-delta up">▲ 1.2% this week</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-label">Total Reach</div>
                  <div className="ac-value">12.4K</div>
                  <div className="ac-delta up">▲ 8% from March</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-label">Lead Conv.</div>
                  <div className="ac-value">4.2%</div>
                  <div className="ac-delta down">▼ 0.5% (Quotes)</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-label">Peak Time</div>
                  <div className="ac-value">7:45 PM</div>
                  <div className="ac-delta up">Active Now</div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="analytics-grid">
                {/* Engagement Bar Chart */}
                <div className="chart-container">
                  <div className="chart-header">
                    <div className="chart-title">📈 Interaction Velocity</div>
                    <div className="chart-legend">
                      <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--gold)' }}></span> Impressions</div>
                    </div>
                  </div>
                  <div className="visual-bar-chart">
                    {[35, 45, 30, 65, 85, 95, 75, 40, 25, 45, 60, 50].map((v, i) => (
                      <div key={i} className="v-bar-group">
                        <div className="v-bar" style={{ height: `${v}%`, opacity: v > 80 ? 1 : 0.6 }}>
                          <div className="v-bar-tooltip">{v}K interactions</div>
                        </div>
                        <div className="v-bar-label">{['8a','10a','12p','2p','4p','6p','8p','10p','12a','2a','4a','6a'][i]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead Source Distribution */}
                <div className="chart-container">
                  <div className="chart-header">
                    <div className="chart-title">🔀 Lead Source Mix</div>
                  </div>
                  <div className="dist-list">
                    {[
                      { name: 'Instagram Reels', val: '62%', color: '#E1306C' },
                      { name: 'WhatsApp Business', val: '18%', color: '#25D366' },
                      { name: 'Facebook Ads', val: '12%', color: '#1877F2' },
                      { name: 'Google Search', val: '8%', color: 'var(--gold)' }
                    ].map(d => (
                      <div key={d.name} className="dist-row">
                        <div className="dist-info">
                          <span className="dist-name">{d.name}</span>
                          <span className="dist-val">{d.val}</span>
                        </div>
                        <div className="dist-track">
                          <div className="dist-fill" style={{ width: d.val, background: d.color }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Engagement Analysis */}
                <div className="chart-container">
                  <div className="chart-header">
                    <div className="chart-title">📈 Engagement by type</div>
                  </div>
                  <div className="dist-list">
                    {[
                      { name: 'Project Reels', val: '8.4%', color: 'var(--gold)' },
                      { name: 'CRM Posts', val: '7.6%', color: 'var(--blue)' },
                      { name: 'Carousels', val: '6.2%', color: 'var(--purple)' },
                      { name: 'Educational', val: '4.8%', color: 'var(--green)' },
                      { name: 'Testimonials', val: '4.2%', color: 'var(--gold-l)' },
                      { name: 'Quote Posts', val: '1.1%', color: 'var(--red)' }
                    ].map(d => (
                      <div key={d.name} className="dist-row">
                        <div className="dist-info">
                          <span className="dist-name">{d.name}</span>
                          <span className="dist-val">{d.val}</span>
                        </div>
                        <div className="dist-track">
                          <div className="dist-fill" style={{ width: d.val, background: d.color }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Performance Insights Table */}
              <div className="analytics-card" style={{ padding: 0 }}>
                <div className="chart-header" style={{ padding: '1.25rem 1.5rem', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
                  <div className="chart-title">🏆 Top Performing Assets</div>
                </div>
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Content Piece</th>
                      <th>Status</th>
                      <th>Reach</th>
                      <th>Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { rank: 1, name: 'Sector 7 Walking Tour', type: 'Reel', status: 'Viral', reach: '4.2K', saves: 245, icon: '🏠' },
                      { rank: 2, name: 'Registry Rules 2026', type: 'Edu', status: 'High Save', reach: '2.8K', saves: 184, icon: '📄' },
                      { rank: 3, name: 'Pipli Price Reveal', type: 'Reel', status: 'Active', reach: '2.1K', saves: 96, icon: '💰' },
                      { rank: 4, name: 'Client Meet: Suresh Ji', type: 'Trust', status: 'Warm', reach: '1.5K', saves: 42, icon: '🤝' }
                    ].map(p => (
                      <tr key={p.rank}>
                        <td><div className="post-rank">{p.rank}</div></td>
                        <td>
                          <div className="post-info-cell">
                            <div className="post-thumb">{p.icon}</div>
                            <div>
                              <div className="post-name-text">{p.name}</div>
                              <div className="post-meta-text">{p.type} • April 2026</div>
                            </div>
                          </div>
                        </td>
                        <td><span className={`status-badge ${p.status.toLowerCase().replace(' ', '-')}`} style={{ 
                          fontSize: '10px', 
                          padding: '2px 8px', 
                          borderRadius: '12px', 
                          background: p.status === 'Viral' ? 'rgba(53,185,122,0.15)' : 'rgba(201,146,26,0.15)',
                          color: p.status === 'Viral' ? 'var(--green)' : 'var(--gold-l)'
                        }}>{p.status}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.reach}</td>
                        <td style={{ color: 'var(--gold-l)', fontWeight: 600 }}>{p.saves}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ AI AGENTS ════ */}
          {activePage === 'agents' && (
            <div>
              <div className="card orchestration-card high-fid">
                <div className="card-header">
                  <div className="card-title">
                    <img src="https://api.iconify.design/lucide:workflow.svg?color=%23C9921A" alt="workflow" className="card-title-icon-img" />
                    Agent Orchestration — Run Full Chain
                  </div>
                  <button className="tact-btn primary" style={{ marginLeft: 'auto' }} onClick={runFullOrchestration}>
                    {isOrchestrating ? <span className="spinner-sm"></span> : '▶ Run All 4 Agents'}
                  </button>
                </div>
                <div className="card-body">
                  <div className="orch-stepper fidel">
                    {[
                      { id: 1, n: 'Metrics Manager' },
                      { id: 2, n: 'Social Media Mgr' },
                      { id: 3, n: 'Designer' },
                      { id: 4, n: 'Scheduling Mgr' }
                    ].map(s => (
                      <div key={s.id} className={`orch-node-fid ${orchStep >= s.id ? (orchStep > s.id ? 'done' : 'active') : ''}`}>
                        <div className="on-fid-left">
                          <div className="on-fid-num">{orchStep > s.id ? '✓' : s.id}</div>
                        </div>
                        <div className="on-fid-right">
                          <div className="on-fid-name">{s.n}</div>
                          <div className="on-fid-status">{orchStep > s.id ? 'done' : (orchStep === s.id ? 'running...' : 'waiting')}</div>
                        </div>
                        {s.id < 4 && <div className="on-fid-line"></div>}
                      </div>
                    ))}
                  </div>

                  {orchStep >= 5 && (
                    <div className="chain-output-box">
                      <div className="cob-label">CHAIN OUTPUT</div>
                      <div className="cob-title">✅ FULL AGENT CHAIN — COMPLETE</div>
                      <div className="cob-list">
                        <div className="cob-item"><span>✓</span> <b>METRICS MANAGER:</b> Top content = Project Reels (8.4%). 70% rule activated. Quote posts flagged for removal.</div>
                        <div className="cob-item"><span>✓</span> <b>SOCIAL MEDIA MANAGER:</b> 7-day plan generated. 5 project posts, 1 educational, 1 festival. All captions in Hinglish with strong hooks.</div>
                        <div className="cob-item"><span>✓</span> <b>DESIGNER:</b> Visual instructions ready for all 7 posts. DALL·E + Runway prompts generated. Brand guidelines applied.</div>
                        <div className="cob-item"><span>✓</span> <b>SCHEDULING MANAGER:</b> All 7 posts queued in Redis. Optimal windows assigned. Next publish: Today 7:30 PM.</div>
                      </div>
                      <div className="cob-footer-status">SYSTEM STATUS: Ready to publish. All agents synchronized. Loop will restart after metrics update post-publication.</div>
                      <div className="cob-actions">
                        <button className="tact-btn" onClick={() => toast.success('Output Copied')}>Copy Output</button>
                        <button className="tact-btn" onClick={() => setOrchStep(0)}>Dismiss</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="agents-grid-2col">
                {[
                  { 
                    id: 'metrics', n: 'Metrics Manager', m: 'Claude AI · Analytics', s: 'Active', ic: '📊', c: 'ac-blue', 
                    t: 'Analyzing 30-day post performance. Top 5 content types identified. CRM posts leading at 8.2% avg. Next: Double project Reels, drop quote posts.',
                    r: 'Analyze 7-30 day social data. Enforce 70% rule. Track: likes, saves, shares, comments, leads, CTR.',
                    tags: ['Engagement data', 'CTR / leads', 'Conversion rates', 'Best timing'],
                    btn: 'Run Analysis', color: '#4A9FD4'
                  },
                  { 
                    id: 'social', n: 'Social Media Manager', m: 'Claude AI · Strategy', s: 'Active', ic: '📅', c: 'ac-green',
                    t: 'Building April 2026 calendar. 31 posts planned. Hindi + Hinglish captions queued. Festivals: Ram Navami (6), Baisakhi (14), Hanuman Jayanti (27).',
                    r: '80% project posts from CRM. No repeated angles. SEO captions with strong hook + CTA.',
                    tags: ['Platform data', 'CRM projects', 'Festival calendar', 'Caption archives'],
                    btn: 'Plan This Week', color: '#35B97A'
                  },
                  { 
                    id: 'designer', n: 'Designer', m: 'Claude AI · Visuals', s: 'Active', ic: '🎨', c: 'ac-gold', 
                    t: 'AWAITING INPUT: Ready to generate visual instructions. Brand: Navy + Gold, Kurukshetra context, no text in AI images, cinematic lighting.',
                    r: 'DALL·E image prompt + Runway video prompt + layout instructions per post type.',
                    tags: ['Brand colors', 'Visual style', 'Top creatives', 'Guidelines'],
                    btn: 'Generate Visuals', color: '#C9921A'
                  },
                  { 
                    id: 'scheduler', n: 'Scheduling Manager', m: 'Claude AI · Timing', s: 'Active', ic: '⏱', c: 'ac-red',
                    t: 'CURRENT TASK: 6 posts in Redis queue. Next publish: Today 7:30 PM (Sector 7 Reel). Rule: All Instagram posts locked to 7:00—8:30 PM.',
                    r: 'BullMQ delay-based queue. Posts added -> timer fires at optimal time -> publish -> metrics updated.',
                    tags: ['Redis BullMQ', 'Platform timing', 'Queue status', 'API keys'],
                    btn: 'Build Schedule', color: '#E05252'
                  }
                ].map(a => (
                  <div key={a.id} className="agent-card-high">
                    <div className="ach-header">
                       <div className="ach-icon-wrap" style={{ background: `rgba(${a.c === 'ac-blue' ? '74,159,212' : a.c === 'ac-green' ? '53,185,122' : a.c === 'ac-gold' ? '201,146,26' : '224,82,82'}, 0.1)` }}>{a.ic}</div>
                       <div className="ach-title-wrap">
                          <div className="ach-name">{a.n}</div>
                          <div className="ach-model">{a.m}</div>
                       </div>
                       <div className="ach-badge">Active</div>
                    </div>
                    <div className="ach-body">
                       <div className="ach-section">
                          <div className="ach-label">{a.id === 'designer' ? 'AWAITING INPUT' : (a.id === 'scheduler' ? 'CURRENT TASK' : 'CURRENT TASK')}</div>
                          <div className="ach-text">{a.t}</div>
                          <div className="ach-tags">
                             {a.tags.map(t => <span key={t} className="ach-tag">{t}</span>)}
                          </div>
                       </div>
                       <div className="ach-section">
                          <div className="ach-label">{a.id === 'metrics' ? 'RESPONSIBILITIES' : a.id === 'social' ? 'CONTENT RULES ENFORCED' : a.id === 'designer' ? 'OUTPUT CAPABILITIES' : 'QUEUE SYSTEM'}</div>
                          <div className="ach-text" style={{ fontSize: '11px', lineHeight: '1.4' }}>{a.r}</div>
                       </div>
                       <div className="ach-actions">
                          <button className="tact-btn primary-gold" onClick={() => runAgentTask(a.id)}>
                            {agentLoading[a.id] ? <span className="spinner-sm"></span> : `▶ ${a.btn}`}
                          </button>
                          <button className="tact-btn gold-ghost">{a.id === 'metrics' ? 'View Reports' : a.id === 'social' ? 'View Calendar' : a.id === 'designer' ? 'Open Studio' : 'View Queue'}</button>
                       </div>
                    </div>
                    {agentOutputs[a.id] && (
                       <div className="ach-output-integrated">
                          <div className="ach-oi-head">
                             <div className="ach-oi-title">{a.id === 'designer' ? 'VISUAL PROMPTS OUTPUT' : (a.id === 'scheduler' ? 'SCHEDULING PLAN OUTPUT' : a.id.toUpperCase() + ' ANALYSIS OUTPUT')}</div>
                             <button className="aop-copy" onClick={() => toast.success('Copied')}>Copy</button>
                          </div>
                          <div className="ach-oi-content">{agentOutputs[a.id]}</div>
                       </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="card agent-chain-code-card">
                <div className="card-header"><div className="card-title">Agent Chain Code — How They Communicate</div></div>
                <div className="card-body">
                  <div className="code-block-fid">
                    <div className="code-line"><span className="ck-keyword">async function</span> <span className="ck-function">runSystem</span>() {'{'} <span className="ck-comment">// Step 1: Metrics fetches & analyzes performance</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">const</span> <span className="ck-var">metrics</span> = <span className="ck-keyword">await</span> <span className="ck-function">metricsManager</span>(<span className="ck-var">crmData</span>); <span className="ck-comment">// {'->'} {'{'} topContent[], weakContent[], bestTime, 70rule {'}'}</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-comment">// Step 2: Social builds plan from metrics output</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">const</span> <span className="ck-var">plan</span> = <span className="ck-keyword">await</span> <span className="ck-function">socialMediaManager</span>(<span className="ck-var">metrics</span>); <span className="ck-comment">// {'->'} {'{'} posts[], captions[], platforms[], dates[] {'}'}</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-comment">// Step 3: Designer creates visuals per post</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">const</span> <span className="ck-var">designs</span> = <span className="ck-keyword">await</span> <span className="ck-function">designer</span>(<span className="ck-var">plan</span>); <span className="ck-comment">// {'->'} {'{'} imagePrompt, videoPrompt, layout {'}'}[]</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-comment">// Step 4: Scheduler queues at optimal times</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">const</span> <span className="ck-var">schedule</span> = <span className="ck-keyword">await</span> <span className="ck-function">schedulingManager</span>(<span className="ck-var">designs</span>); <span className="ck-comment">// {'->'} BullMQ queue entries with delay timers</span></div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">await</span> <span className="ck-function">publishToAPIs</span>(<span className="ck-var">schedule</span>);</div>
                    <div className="code-line" style={{ paddingLeft: '20px' }}><span className="ck-keyword">await</span> <span className="ck-function">metricsManager</span>.<span className="ck-function">update</span>(); <span className="ck-comment">// loop</span></div>
                    <div className="code-line">{'}'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════ CAMPAIGN ENGINE ════ */}
          {activePage === 'campaign' && (
            <>
              {/* Header Metrics */}
              <div className="perf-kpi-grid">
                {CAMP_KPIS.map((k, idx) => (
                  <div key={idx} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-val">{k.val}</div>
                    <div className={`kpi-sub ${k.type}`}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card-header" style={{ padding: '1.25rem 0 .75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title">
                  <span style={{ marginRight: '8px' }}>👥</span> Lead Segmentation Engine
                </div>
                <button className="tact-btn primary sm" onClick={() => setShowAddLeadModal(true)} style={{ padding: '4px 10px', fontSize: '11px' }}>+ Add Lead</button>
              </div>
              
              <div className="camp-seg-grid">
                {CAMP_SEGMENTS.map(s => (
                  <div key={s.id} className={`camp-seg-card ${selectedSeg === s.id ? 'selected' : ''}`} onClick={() => setSelectedSeg(s.id)}>
                    <div className="camp-seg-icon">{s.i}</div>
                    <div className="camp-seg-info">
                      <div className="camp-seg-name">{s.n}</div>
                      <div className="camp-seg-count">{s.c} leads</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="routing-timing-row">
                <div className="card" style={{ flex: 1.5 }}>
                  <div className="card-header">
                    <div className="card-title"><span style={{ marginRight: '8px' }}>🔀</span> Channel Routing Logic</div>
                  </div>
                  <div className="card-body">
                    <div className="routing-code-block">
                      <div className="code-line"><span className="ck-keyword">if</span> (segment === <span className="ck-str">'hot'</span>) {'{'} send <span className="ck-ch wa">WhatsApp</span> + <span className="ck-ch call">Call</span>; {'}'}</div>
                      <div className="code-line"><span className="ck-keyword">else if</span> (segment === <span className="ck-str">'warm'</span>) {'{'} send <span className="ck-ch wa">WhatsApp</span> + <span className="ck-ch email">Email</span>; {'}'}</div>
                      <div className="code-line"><span className="ck-keyword">else if</span> (segment === <span className="ck-str">'cold'</span>) {'{'} send <span className="ck-ch email">Email</span> + <span className="ck-ch sms">SMS</span>; {'}'}</div>
                      <div className="code-line"><span className="ck-keyword">else if</span> (segment === <span className="ck-str">'investor'</span>) {'{'} send <span className="ck-ch email">Email</span>(ROI) + <span className="ck-ch wa">WA</span>; {'}'}</div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ flex: 1 }}>
                  <div className="card-header">
                    <div className="card-title"><span style={{ marginRight: '8px' }}>🕒</span> Optimal Send Times</div>
                  </div>
                  <div className="card-body">
                    <div className="send-time-grid">
                      {SEND_TIMES.map((t, idx) => (
                        <div key={idx} className="time-card-v2" style={{ borderBottom: `2px solid ${t.color}` }}>
                          <div className="time-val">{t.time}</div>
                          <div className="time-ch">{t.ch}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <div className="card-title"><span style={{ marginRight: '8px' }}>⏳</span> Drip Campaign Flow</div>
                </div>
                <div className="card-body">
                  <div className="drip-v2-timeline">
                    {DRIP_STEPS.map((s, idx) => (
                      <div key={idx} className="drip-v2-item">
                        <div className="drip-v2-dot" style={{ background: s.dotColor }}></div>
                        <div className="drip-v2-content">
                          <div className="drip-v2-day">{s.day}</div>
                          <div className="drip-v2-text">
                            <span className="drip-v2-title">{s.title}</span> — {s.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                  <div className="card-title"><span style={{ marginRight: '8px' }}>✅</span> India Compliance</div>
                </div>
                <div className="card-body" style={{ padding: '0 1.25rem 1.25rem' }}>
                  <div className="compliance-list">
                    {COMPLIANCE_CHECKS.map((c, idx) => (
                      <div key={idx} className="compliance-item">
                        <div className={`comp-status-icon ${c.status}`}>{c.status === 'pass' ? '✓' : '✕'}</div>
                        <div className="comp-info">
                          <div className="comp-name">{c.n}</div>
                          <div className="comp-detail">{c.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════ OPTIMIZATION (STRATEGIES) ════ */}
          {activePage === 'strategies' && (
            <>
              {/* Header Metrics */}
              <div className="perf-kpi-grid">
                {KPI_CARDS.map((k, idx) => (
                  <div key={idx} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-val">{k.val}</div>
                    <div className={`kpi-sub ${k.type}`}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card-header" style={{ padding: '1.25rem 0 .75rem 0' }}><div className="card-title">Top 7 Optimization Strategies</div></div>
              
              <div className="strategies-list">
                {STRATEGIES_DATA.map(s => (
                  <div key={s.id} className={`strategy-card ${openStrategies.has(s.id) ? 'open' : ''}`}>
                    <div className="sc-head" onClick={() => toggleStrategy(s.id)}>
                      <div className="sc-num">{s.i}</div>
                      <div className="sc-title">{s.n}</div>
                      <div className={`sc-impact ${s.im}`}>{s.it}</div>
                      <div className="sc-chev">›</div>
                    </div>
                    <div className="sc-body">
                      <div className="sc-body-inner">
                        <div className="sc-desc">{s.d}</div>
                        {s.tags && (
                          <div className="sc-tags">
                            {s.tags.map(t => <span key={t} className="sc-tag">{t}</span>)}
                          </div>
                        )}
                        
                        <div className="strat-generate-area">
                          <button className="strat-gen-btn" onClick={(e) => { e.stopPropagation(); genStrategyContent(s.id); }}>
                            ✨ Regenerate
                          </button>
                          {stratOutputs[s.id] && (
                            <div className="strat-ai-out">
                              <div className="strat-ai-out-info">
                                AI analysis complete. Output generated based on Bharat Properties data for Kurukshetra market. 
                                All recommendations follow the 70% rule and 80-10-7-3 content distribution strategy.
                              </div>
                              <div className="strat-ai-out-text">{stratOutputs[s.id]}</div>
                              <div className="strat-ai-out-actions">
                                <button className="aop-copy" onClick={() => toast.success('Copied to clipboard')}>Copy</button>
                                <button className="aop-copy" onClick={() => toast.success('Saved to Calendar')}>Save to Calendar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card-header" style={{ padding: '2rem 0 .75rem 0' }}><div className="card-title">3 New Untried Content Angles</div></div>
              <div className="angle-card-grid">
                {NEW_ANGLES_DATA.map(a => (
                  <div key={a.id} className="angle-card" style={{ borderLeft: `3px solid ${a.color}` }}>
                    <div className="angle-head">
                      <span className="angle-icon">{a.icon}</span>
                      <span className="angle-name">{a.n}</span>
                      <span className="angle-badge">New</span>
                    </div>
                    <div className="angle-desc">{a.d}</div>
                    <div className="angle-quote" style={{ color: a.color }}>{a.q}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ════ DESIGNER STUDIO ════ */}
          {activePage === 'designer' && (
            <div className="designer-grid-2col">
              {/* Left Column: Visual Prompt Generator */}
              <div className="card ds-main-card">
                <div className="card-header">
                  <div className="card-title">
                    <img src="https://api.iconify.design/lucide:sparkles.svg?color=%23C9921A" alt="sparkles" className="card-title-icon-img" />
                    Visual Prompt Generator
                  </div>
                  <div className="ach-badge" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', color: 'var(--text2)' }}>DALL·E + Runway</div>
                </div>
                <div className="card-body">
                  <div className="ds-input-grid">
                    <div className="ds-input-group">
                      <label>PROPERTY TYPE</label>
                      <input type="text" placeholder="e.g. 2BHK Apartment" defaultValue="2BHK Apartment" />
                    </div>
                    <div className="ds-input-group">
                      <label>POST FORMAT</label>
                      <select defaultValue="Instagram Reel">
                        <option>Instagram Reel</option>
                        <option>Facebook Post</option>
                        <option>YouTube Short</option>
                      </select>
                    </div>
                    <div className="ds-input-group">
                      <label>VISUAL MOOD</label>
                      <input type="text" placeholder="e.g. Aspirational & Warm" defaultValue="Aspirational & Warm" />
                    </div>
                    <div className="ds-input-group">
                      <label>CAMERA ANGLE</label>
                      <input type="text" placeholder="e.g. Aerial Drone" defaultValue="Aerial Drone" />
                    </div>
                  </div>
                  
                  <button className="tact-btn primary-gold w-full mt-4" style={{ width: '100%' }} onClick={() => handleDesignerGen('prompt')}>
                    {designLoading ? <span className="spinner-sm"></span> : '✦ Generate Visual Prompt'}
                  </button>

                  {/* Integrated Output Panel */}
                  <div className="ds-output-panel-high">
                    <div className="ds-op-section">
                      <div className="ds-op-header">
                        <div className="ds-op-title">🎨 IMAGE PROMPT (DALL·E)</div>
                        <button className="aop-copy" onClick={() => toast.success('Copied')}>Copy</button>
                      </div>
                      <div className="ds-op-content">
                        A stunning aerial drone shot of a 2bhk apartment in Kurukshetra, Haryana. Aspirational & Warm atmosphere. Architectural photography. Brand colors: deep navy (#0B1F3A) and gold (#C9921A) accents visible in architectural details. Indian residential context — lush greenery, wide roads. Ultra-sharp, 4K quality. No text overlays. Cinematic lighting. Photorealistic.
                      </div>
                    </div>

                    <div className="ds-op-section">
                      <div className="ds-op-header">
                        <div className="ds-op-title">🎬 VIDEO PROMPT (RUNWAY)</div>
                        <button className="aop-copy" onClick={() => toast.success('Copied')}>Copy</button>
                      </div>
                      <div className="ds-op-content">
                        5-second smooth cinematic pan of 2bhk apartment for instagram reel. Open: aerial drone establishing shot → slow push into entrance. Aspirational & Warm color grade. Warm golden tones. Background: peaceful Kurukshetra neighbourhood. End frame: brand gold fade. No voiceover. Ambient Indian morning sounds.
                      </div>
                    </div>

                    <div className="ds-op-section">
                      <div className="ds-op-header">
                        <div className="ds-op-title">📐 LAYOUT INSTRUCTIONS</div>
                        <button className="aop-copy" onClick={() => toast.success('Copied')}>Copy</button>
                      </div>
                      <div className="ds-op-content">
                        Top: Bharat Properties logo (white, top-left). Center: property hero visual (80% frame). Bottom strip (navy background): Price in gold text + Location + CTA button. Font: DM Serif Display for price, DM Sans for details. No text overlaid on main property image.
                      </div>
                    </div>

                    <div className="ds-op-footer">
                      <button className="tact-btn gold-ghost sm" style={{ fontSize: '10px', padding: '4px 10px' }} onClick={() => {
                        const newEntry = { id: Date.now(), text: "Visual Prompt: 2BHK Apartment - " + new Date().toLocaleDateString(), date: new Date().toLocaleTimeString() };
                        const newHistory = [newEntry, ...designerHistory].slice(0, 10);
                        setDesignerHistory(newHistory);
                        localStorage.setItem('bp_designer_history_v2', JSON.stringify(newHistory));
                        toast.success('Saved to History');
                      }}>↓ Save to History</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Brand & Captions */}
              <div className="ds-side-column">
                <div className="card ds-brand-card">
                  <div className="card-header">
                    <div className="card-title">
                      <img src="https://api.iconify.design/lucide:palette.svg?color=%23C9921A" alt="palette" className="card-title-icon-img" />
                      Brand Guidelines
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="color-swatch-grid">
                      <div className="swatch-item">
                        <div className="swatch-box" style={{ background: '#0B1F3A' }}></div>
                        <div className="swatch-info"><div className="swatch-name">Primary Navy</div><div className="swatch-hex">#0B1F3A</div></div>
                      </div>
                      <div className="swatch-item">
                        <div className="swatch-box" style={{ background: '#C9921A' }}></div>
                        <div className="swatch-info"><div className="swatch-name">Gold Accent</div><div className="swatch-hex">#C9921A</div></div>
                      </div>
                      <div className="swatch-item">
                        <div className="swatch-box" style={{ background: '#FAD87A' }}></div>
                        <div className="swatch-info"><div className="swatch-name">Gold Light</div><div className="swatch-hex">#FAD87A</div></div>
                      </div>
                      <div className="swatch-item">
                        <div className="swatch-box" style={{ background: '#FFFFFF' }}></div>
                        <div className="swatch-info"><div className="swatch-name">White</div><div className="swatch-hex">#FFFFFF</div></div>
                      </div>
                    </div>
                    <div className="ds-rules-box">
                      <div className="ach-label">DESIGN RULES</div>
                      <div className="ds-rules-text">No text inside AI images · Indian homes only (Kurukshetra) · Clean + premium aesthetic · Cinematic lighting preferred · Aerial + eye-level camera mix</div>
                    </div>
                  </div>
                </div>

                <div className="card ds-caption-card">
                  <div className="card-header">
                    <div className="card-title">
                      <img src="https://api.iconify.design/lucide:type.svg?color=%23C9921A" alt="type" className="card-title-icon-img" />
                      AI Caption Generator
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="ds-input-group">
                      <label>PROPERTY & DETAILS</label>
                      <input type="text" placeholder="e.g. 2BHK Pipli..." defaultValue="2BHK Pipli ₹35L ready possession.." />
                    </div>
                    <div className="ds-input-group mt-3">
                      <label>CAPTION STYLE</label>
                      <select defaultValue="Urgent Deal — Hinglish">
                        <option>Urgent Deal — Hinglish</option>
                        <option>Premium Lifestyle — English</option>
                        <option>Investor Focus — Professional</option>
                      </select>
                    </div>
                    <button className="tact-btn primary-gold w-full mt-4" style={{ width: '100%' }} onClick={() => handleDesignerGen('caption')}>
                      ✦ Generate Caption + Hashtags
                    </button>

                    <div className="ds-output-panel-high mt-4">
                      <div className="ds-op-header">
                        <div className="ds-op-title">CAPTION OUTPUT</div>
                        <button className="aop-copy" onClick={() => toast.success('Copied')}>Copy</button>
                      </div>
                      <div className="ds-op-content" style={{ fontSize: '11px', color: 'var(--text2)' }}>
                        AI analysis complete. Output generated based on Bharat Properties data for Kurukshetra market. All recommendations follow the 70% rule and 80-10-7-3 content distribution strategy.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════ TECH STACK ════ */}
          {activePage === 'techstack' && (
            <>
              <div className="tech-grid">
                <div className="tech-card">
                  <div className="tech-card-head"><div className="tech-icon">🌐</div>Frontend Infrastructure</div>
                  <div className="tech-row"><div className="tech-bullet">⚡</div><div><div className="tech-name">React + Vite</div><div className="tech-desc">Client-side rendering with hot reloading.</div></div></div>
                  <div className="tech-row"><div className="tech-bullet">🎨</div><div><div className="tech-name">Vanilla CSS Architecture</div><div className="tech-desc">Custom design system with design tokens.</div></div></div>
                </div>
                <div className="tech-card">
                  <div className="tech-card-head"><div className="tech-icon">⚙</div>Backend & Automation</div>
                  <div className="tech-row"><div className="tech-bullet">📦</div><div><div className="tech-name">Node.js + Express</div><div className="tech-desc">REST API architecture for lead management.</div></div></div>
                  <div className="tech-row"><div className="tech-bullet">⏱</div><div><div className="tech-name">BullMQ + Redis</div><div className="tech-desc">Task queuing for scheduled campaigns.</div></div></div>
                </div>
                <div className="tech-card">
                  <div className="tech-card-head"><div className="tech-icon">🗄</div>Database & Storage</div>
                  <div className="tech-row"><div className="tech-bullet">🍃</div><div><div className="tech-name">MongoDB</div><div className="tech-desc">Document storage for leads and content.</div></div></div>
                  <div className="tech-row"><div className="tech-bullet">☁</div><div><div className="tech-name">Cloudinary</div><div className="tech-desc">CDN for marketing assets and AI media.</div></div></div>
                </div>
                <div className="tech-card">
                  <div className="tech-card-head"><div className="tech-icon">🤖</div>AI Model Integration</div>
                  <div className="tech-row"><div className="tech-bullet">🧠</div><div><div className="tech-name">GPT-5 / Gemini / Claude</div><div className="tech-desc">Connected via OpenAI/Google Cloud APIs.</div></div></div>
                  <div className="tech-row"><div className="tech-bullet">🖼</div><div><div className="tech-name">DALL·E 3 + Runway</div><div className="tech-desc">Visual content generation APIs.</div></div></div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Live API Endpoint Map</div></div>
                <div className="card-body">
                  <div className="api-endpoint-grid">
                    <div className="api-block">
                      <div className="api-block-label">MARKETING AI</div>
                      <div className="api-line"><span className="api-get">GET</span> /api/v1/marketing/stats</div>
                      <div className="api-line"><span className="api-post">POST</span> /api/v1/marketing/run-agent</div>
                      <div className="api-line"><span className="api-post">POST</span> /api/v1/marketing/generate-social</div>
                    </div>
                    <div className="api-block">
                      <div className="api-block-label">AI AGENTS</div>
                      <div className="api-line"><span className="api-get">GET</span> /api/v1/ai-agents</div>
                      <div className="api-line"><span className="api-post">POST</span> /api/v1/ai-agents</div>
                      <div className="api-line"><span className="api-get">GET</span> /api/v1/ai-agents/:id</div>
                    </div>
                    <div className="api-block">
                      <div className="api-block-label">ACTIVITIES</div>
                      <div className="api-line"><span className="api-get">GET</span> /api/v1/activity</div>
                      <div className="api-line"><span className="api-post">POST</span> /api/v1/activity</div>
                      <div className="api-line"><span className="api-get">GET</span> /api/v1/activity/unified/:type/:id</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}


        </div>
      </div>

      {/* ══ MODALS ══ */}
      {showAddLeadModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Add New CRM Lead</div>
              <button className="btn" style={{ border: 'none' }} onClick={() => setShowAddLeadModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveLead}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <input name="name" placeholder="Full Name" className="fi" style={{ background: 'var(--navy)', border: '1px solid var(--border)', width: '100%', padding: '10px', borderRadius: '8px', color: 'white' }} required />
                  <input name="phone" placeholder="Phone Number" className="fi" style={{ background: 'var(--navy)', border: '1px solid var(--border)', width: '100%', padding: '10px', borderRadius: '8px', color: 'white' }} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <input name="interest" placeholder="Interest (e.g. 2BHK)" className="fi" style={{ background: 'var(--navy)', border: '1px solid var(--border)', width: '100%', padding: '10px', borderRadius: '8px', color: 'white' }} />
                  <select name="segment" className="fi" style={{ background: 'var(--navy)', border: '1px solid var(--border)', width: '100%', padding: '10px', borderRadius: '8px', color: 'white' }}>
                    <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '15px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowAddLeadModal(false)}>Cancel</button>
                <button type="submit" className="btn primary">Save Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPostModal && (
        <div className="modal-backdrop-v2">
          <div className="modal-v2 post-modal-v2">
            <div className="modal-header-v2">
              <div className="modal-title-v2">
                {activeCalDate ? `${new Date(activeCalDate).getDate()} ${monthNames[new Date(activeCalDate).getMonth()]} — ${editingPost?.title || 'New Post'}` : 'New Post'}
              </div>
              <button className="modal-close-v2" onClick={() => setShowPostModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSavePost}>
              <div className="modal-body-v2">
                <div className="status-tab-group-v2">
                  {['draft', 'scheduled', 'published'].map(s => (
                    <button 
                      key={s} 
                      type="button" 
                      className={`status-tab-v2 ${editingPost?.status === s || (!editingPost && s === 'scheduled') ? 'active' : ''}`}
                      onClick={() => setEditingPost(prev => ({ ...prev, status: s }))}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="modal-form-grid-v2">
                  <div className="form-group-v2">
                    <label>POST TITLE</label>
                    <input name="title" defaultValue={editingPost?.title} placeholder="Hanuman Jayanti" className="fi-v2" required />
                  </div>
                  <div className="form-group-v2">
                    <label>PLATFORM</label>
                    <select name="platform" defaultValue={editingPost?.platform || 'Both'} className="fi-v2">
                      <option>Instagram</option><option>Facebook</option><option>Both</option>
                    </select>
                  </div>
                  <div className="form-group-v2">
                    <label>CONTENT TYPE</label>
                    <select name="type" defaultValue={editingPost?.type || 'ct-project'} className="fi-v2">
                      <option value="ct-project">Project/Deal</option>
                      <option value="ct-edu">Educational</option>
                      <option value="ct-trust">Trust Building</option>
                      <option value="ct-festival">Festival</option>
                    </select>
                  </div>
                  <div className="form-group-v2">
                    <label>SCHEDULED TIME</label>
                    <input name="time" defaultValue={editingPost?.time || '08:00'} type="time" className="fi-v2" />
                  </div>
                </div>

                <div className="form-group-v2 full-width">
                  <label>CAPTION / NOTES</label>
                  <textarea name="caption" defaultValue={editingPost?.caption} placeholder="Caption text, hooks, CTAs..." className="fi-v2-area" />
                </div>
              </div>

              <div className="modal-footer-v2">
                {editingPost && (
                  <button type="button" className="tact-btn red-ghost sm" onClick={deletePost}>Delete Post</button>
                )}
                <div style={{ flex: 1 }}></div>
                <button type="button" className="tact-btn sm" onClick={() => setShowPostModal(false)}>Cancel</button>
                <button type="submit" className="tact-btn primary-gold sm">Save Post</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFollowUpModal && followUpLead && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Follow Up — {followUpLead.name}</div>
              <button className="btn" style={{ border: 'none' }} onClick={() => setShowFollowUpModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '10px' }}>Select WhatsApp Template</div>
              {(SEG_TEMPLATES[followUpLead.segment] || SEG_TEMPLATES.warm).map((t, i) => {
                const msg = t.text.replace(/{name}/g, followUpLead.name.split(' ')[0]).replace(/{interest}/g, followUpLead.interest || 'property').replace(/{budget}/g, followUpLead.budget || 'your budget');
                return (
                  <div key={i} style={{ padding: '12px', background: 'rgba(0,0,0,.2)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer' }} onClick={() => { setSelectedTemplate(i); navigator.clipboard.writeText(msg); toast.success('Template Prepared & Copied'); }}>
                    <div style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 'bold' }}>{t.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'pre-line' }}>{msg}</div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer" style={{ padding: '15px' }}>
              <button className="btn primary" style={{ width: '100%' }} onClick={() => setShowFollowUpModal(false)}>Confirm & Close</button>
            </div>
          </div>
        </div>
      )}

      {/* STYLES FOR MOBILE / HAMBURGER */}
      <style>{`
        @media(max-width: 1024px) {
          .sidebar { position: fixed; transform: translateX(-100%); transition: transform .3s; }
          .sidebar.open { transform: translateX(0); }
          .main { margin-left: 0; }
        }
        .fi:focus { border-color: var(--gold) !important; outline: none; }
        .nav-item { user-select: none; }
      `}</style>
    </div>
  );
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
