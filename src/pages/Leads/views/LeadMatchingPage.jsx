import { useTheme } from '../../../context/ThemeContext';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { whatsappTemplates } from '../../../constants/templates';
import ComposeEmailModal from '../../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../../components/SendMessageModal';
import CreateActivityModal from '../../../components/CreateActivityModal';
import AlgorithmSettingsModal from '../components/AlgorithmSettingsModal';
import toast from 'react-hot-toast';
import { api } from '../../../utils/api';
import { parseBudget, parseSizeSqYard } from '../../../utils/matchingLogic'; // Keeping for parsing utilities
import { useActivities } from '../../../context/ActivityContext';
import { renderValue } from '../../../utils/renderUtils';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import QuickFillModal from '../components/QuickFillModal';
import whatsappService from '../../../services/whatsappService';
import smsService from '../../../services/smsService';
import { systemSettingsAPI } from '../../../utils/api';
import { useUserContext } from '../../../context/UserContext';
import { generateDealsPDF } from '../../../utils/pdfUtils';

const LeadMatchingPage = ({ onNavigate, leadId }) => {
    const { isDark } = useTheme();
    const { addActivity } = useActivities();
    const { getLookupValue, lookups, projects, sizes, propertyConfig, leadMasterFields, getLookupId } = usePropertyConfig();
    const [lead, setLead] = useState(null);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Selection State
    const [selectedItems, setSelectedItems] = useState([]);
    
    // Omnichannel Blast State
    const [portfolioDetailLevel, setPortfolioDetailLevel] = useState('full_details');
    const [blastChannels, setBlastChannels] = useState({ whatsapp: false, whatsapp_app: false, email: false, sms: false, rcs: false });
    const [channelSchedules, setChannelSchedules] = useState({
        whatsapp: '',
        email: '',
        sms: '',
        rcs: ''
    });
    const [channelAvailability, setChannelAvailability] = useState({
        whatsapp: false, email: false, sms: false, rcs: false, whatsapp_app: true // App relies on user device
    });
    const [isBlasting, setIsBlasting] = useState(false);

    // Check Integrations on mount
    useEffect(() => {
        const checkIntegrations = async () => {
            const avail = { whatsapp: false, email: false, sms: false, rcs: false, whatsapp_app: true };
            try {
                const [waRes, emailRes, googleRes, smsRes] = await Promise.allSettled([
                    systemSettingsAPI.getByKey('meta_wa_config'),
                    systemSettingsAPI.getByKey('email_config'),
                    systemSettingsAPI.getByKey('google_integration'),
                    smsService.getStatus().catch(() => null) // Fallback if endpoint fails
                ]);

                if (waRes.status === 'fulfilled') {
                    const waData = waRes.value?.data?.value;
                    if (waData && (waData.token || waData.apiKey || waData.phoneId || waData.active)) {
                        avail.whatsapp = true;
                    }
                }
                
                if (emailRes.status === 'fulfilled') {
                    const emData = emailRes.value?.data?.value;
                    if (emData && (emData.provider || emData.host || emData.user)) {
                        avail.email = true;
                    }
                }
                if (googleRes.status === 'fulfilled' && googleRes.value?.data?.value?.isConnected) {
                    avail.email = true;
                }

                if (smsRes.status === 'fulfilled' && smsRes.value?.success) {
                    // SMS service returns { success: true, data: [...] } where data is the list of providers
                    const providers = smsRes.value?.data;
                    if (Array.isArray(providers) && providers.some(p => p.isActive || p.status === 'connected' || p.active)) {
                        avail.sms = true;
                    } else if (smsRes.value.data && !Array.isArray(smsRes.value.data)) {
                        avail.sms = true; // Fallback if data is a direct object
                    }
                }

                // RCS is mocked as inactive for now unless explicitly found
                const rcsRes = await systemSettingsAPI.getByKey('rcs_config').catch(() => null);
                if (rcsRes?.data?.value && (rcsRes.data.value.active || rcsRes.data.value.token)) avail.rcs = true;

                setChannelAvailability(avail);
                
                // Pre-select WA if available, else try others
                setBlastChannels(prev => ({
                    ...prev,
                    whatsapp: avail.whatsapp,
                    email: avail.whatsapp ? false : avail.email,
                    sms: avail.whatsapp ? false : avail.sms
                }));

            } catch (err) {
                console.warn('Failed to verify omnichannel integrations:', err);
            }
        };
        checkIntegrations();
    }, []);

    // Phase 3 Intelligence State
    const [suggestions, setSuggestions] = useState([]);
    const [excludedDeals, setExcludedDeals] = useState([]);
    const [excludedCount, setExcludedCount] = useState(0);
    const [showExcluded, setShowExcluded] = useState(false);
    const [showQuickFill, setShowQuickFill] = useState(false);
    const [expandedBreakdown, setExpandedBreakdown] = useState(null); // deal _id

    // Refinement State
    const [budgetFlexibility, setBudgetFlexibility] = useState(10);
    const [sizeFlexibility, setSizeFlexibility] = useState(10);
    const [includeNearby, setIncludeNearby] = useState(true);
    const [isTypeFlexible] = useState(false);
    const [isSizeFlexible] = useState(false);
    const [minMatchScore, setMinMatchScore] = useState(20);
    const [isWeightsOpen, setIsWeightsOpen] = useState(false);
    const [weights, setWeights] = useState({
        location: 30,
        type: 20,
        budget: 25,
        size: 25
    });
    const [showOtherCities, setShowOtherCities] = useState(false);
    const [refreshCount, setRefreshCount] = useState(0);

    useEffect(() => {
        const savedWeights = localStorage.getItem(`match_weights_${leadId}`);
        const savedFlex = localStorage.getItem(`match_flex_${leadId}`);
        if (savedWeights) {
            try { setWeights(JSON.parse(savedWeights)); } catch(e) {}
        }
        if (savedFlex) {
            try { 
                const { budget, size } = JSON.parse(savedFlex);
                setBudgetFlexibility(budget);
                setSizeFlexibility(size);
            } catch(e) {}
        }
    }, [leadId]);

    useEffect(() => {
        localStorage.setItem(`match_weights_${leadId}`, JSON.stringify(weights));
    }, [weights, leadId]);

    useEffect(() => {
        localStorage.setItem(`match_flex_${leadId}`, JSON.stringify({ budget: budgetFlexibility, size: sizeFlexibility }));
    }, [budgetFlexibility, sizeFlexibility, leadId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const fetchData = async () => {
                setLoading(true);
                try {
                    // 1. Fetch specific lead
                    const leadRes = await api.get(`leads/${leadId}`);
                    if (leadRes.data && leadRes.data.success) {
                        setLead(leadRes.data.data);
                    }

                    const matchRes = await api.get('deals/match', { 
                        params: { 
                            leadId, 
                            budgetFlexibility, 
                            sizeFlexibility, 
                            weights: JSON.stringify(weights),
                            showOtherCities
                        } 
                    });
                    
                    if (matchRes.data && matchRes.data.success) {
                        const mappedMatches = (matchRes.data.data || []).map(item => ({
                            ...item,
                            matchPercentage: item.score || 0,
                            gaps: item.matchDetails || [],
                            thumbnail: item.inventoryId?.propertyImages?.[0] || item.inventoryId?.images?.[0] || `https://picsum.photos/seed/${item._id}/400/300`,
                            // Phase 2 decay fields
                            rawScore: item.rawScore || item.score || 0,
                            sharedStatus: item.sharedStatus || null,
                            daysSinceShared: item.daysSinceShared || null,
                            lastDispatch: item.lastDispatch || null,
                            // Phase 3A: score breakdown
                            scoreBreakdown: item.scoreBreakdown || null,
                        }));
                        setInventoryItems(mappedMatches);
                        // Phase 3B + 3C
                        setSuggestions(matchRes.data.suggestions || []);
                        setExcludedDeals(matchRes.data.excluded || []);
                        setExcludedCount(matchRes.data.excludedCount || 0);
                    }
                } catch (error) {
                    console.error("Error fetching match data:", error);
                    toast.error("Failed to load match data");
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }, 600); // 600ms debounce for sliders

        return () => clearTimeout(timer);
    }, [leadId, budgetFlexibility, sizeFlexibility, weights, showOtherCities, refreshCount]);

    // Profile Completeness State (Phase 1)
    const [isQuickFillOpen, setIsQuickFillOpen] = useState(false);
    const [quickFields, setQuickFields] = useState({});
    const [savingProfile, setSavingProfile] = useState(false);

    // Communication Modals State
    const [isMailOpen, setIsMailOpen] = useState(false);
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [, setSelectedItemsForAction] = useState([]);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [mailSubject, setMailSubject] = useState('');
    const [mailBody, setMailBody] = useState('');
    const [mailAttachments, setMailAttachments] = useState([]);
    const [mailTemplateId, setMailTemplateId] = useState('');
    const [recipients, setRecipients] = useState([]);
    const [initialTemplateId, setInitialTemplateId] = useState('');
    const [initialChannel, setInitialChannel] = useState('SMS');
    const [selectedProperties, setSelectedProperties] = useState([]);
    
    const [hidePrice, setHidePrice] = useState(false);
    const { currentUser } = useUserContext();

    // 2. Pre-parse Lead Context (Simplified for display only)
    const leadContext = useMemo(() => {
        if (!lead) return null;

        if (!lead.name) {
            lead.name = lead.contactDetails?.name || (lead.firstName ? `${lead.salutation || ""} ${lead.firstName} ${lead.lastName || ""}`.trim() : (lead.name || "Unknown"));
        }
        lead.mobile = lead.contactDetails?.mobile || lead.mobile;

        return {
            leadType: (lead.requirement?.lookup_value || "").toLowerCase(),
            leadLocation: (lead.location?.lookup_value || "").toLowerCase(),
        };
    }, [lead]);


    // 🧠 SENIOR PROFESSIONAL: Robust Lookup Resolver for Matching
    const resolveLookup = useCallback((val, type) => {
        if (!val) return null;
        
        let idVal = val;
        // Case 1: val is an object (could be populated)
        if (typeof val === 'object') {
            const label = val.lookup_value || val.name || val.label || val.fullName;
            if (label && typeof label !== 'object' && !/^[0-9a-fA-F]{24}$/.test(String(label))) return String(label);
            
            // If label is missing or an ID, try to get the ID from the object
            idVal = val._id || val.id || val;
        }

        const idStr = String(idVal).trim();
        
        // Case 2: If it's already a resolved string (not a 24-character ObjectID)
        if (!/^[0-9a-fA-F]{24}$/.test(idStr)) {
            return idStr;
        }
        
        // Case 3: Try resolving using getLookupValue
        const resolved = getLookupValue(type, idStr);
        if (resolved && typeof resolved !== 'object' && !/^[0-9a-fA-F]{24}$/.test(String(resolved))) {
            return String(resolved);
        }

        // Case 4: Bulletproof Direct State Fallback Scanner
        if (lookups) {
            // A. Search specific type (case-insensitive, normalized)
            const normType = String(type || '').toLowerCase().replace(/\s+/g, '');
            const typeKey = Object.keys(lookups).find(k => k.toLowerCase().replace(/\s+/g, '') === normType);
            const lookupList = typeKey ? lookups[typeKey] : null;
            if (Array.isArray(lookupList)) {
                const found = lookupList.find(l => String(l._id || l.id) === idStr);
                if (found) {
                    const foundVal = found.lookup_value || found.name || found.label;
                    if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
                }
            }

            // B. Scan all lookups in all categories for this ID
            for (const cat in lookups) {
                if (Array.isArray(lookups[cat])) {
                    const found = lookups[cat].find(l => String(l._id || l.id) === idStr);
                    if (found) {
                        const foundVal = found.lookup_value || found.name || found.label;
                        if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
                    }
                }
            }
        }

        // C. Scan sizes state
        if (sizes && Array.isArray(sizes)) {
            const foundSize = sizes.find(s => String(s._id || s.id) === idStr);
            if (foundSize) {
                const foundVal = foundSize.name || foundSize.lookup_value;
                if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
            }
        }

        // D. Scan projects state
        if (projects && Array.isArray(projects)) {
            const foundProj = projects.find(p => String(p._id || p.id) === idStr);
            if (foundProj) {
                const foundVal = foundProj.name || foundProj.projectName || foundProj.title;
                if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
            }
        }
        
        return null;
    }, [getLookupValue, lookups, projects, sizes]);

    // 3. Centralized Logic moved to Server-Side
    const matchedItems = useMemo(() => {
        // Sort: Pinned items first, then by score
        return [...inventoryItems].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.score || 0) - (a.score || 0);
        });
    }, [inventoryItems]);

    // Progressive Rendering
    const [visibleCount, setVisibleCount] = useState(15);
    const [showOnlyPerfectMatch, setShowOnlyPerfectMatch] = useState(false);
    
    const displayedItems = useMemo(() => {
        const filtered = showOnlyPerfectMatch ? matchedItems.filter(i => i.isPreferredMatch) : matchedItems;
        return filtered.slice(0, visibleCount);
    }, [matchedItems, visibleCount, showOnlyPerfectMatch]);

    const handleSelectAll = (e) => {
        const itemsToSelect = showOnlyPerfectMatch ? matchedItems.filter(i => i.isPreferredMatch) : matchedItems;
        if (e.target.checked) {
            setSelectedItems(itemsToSelect.map(item => item.id || item.unitNo));
        } else {
            setSelectedItems([]);
        }
    };

    const handleSelectItem = (id) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const logActivity = (action, item) => {
        toast.success(`Logged: ${action} for ${item.itemType} (Ref: ${item.id || item.unitNo})`);
    };

    const handleWhatsApp = (item) => {
        setRecipients([{
            ...lead,
            name: lead.name || 'Lead',
            phone: lead.mobile || lead.phone
        }]);
        setSelectedProperties([item]);
        setInitialTemplateId('property_match_alert');
        setInitialChannel('WHATSAPP');
        setIsMessageOpen(true);
        logActivity('WhatsApp Prepared', item);
    };

    // Profile Completeness Calculator
    const profileCompleteness = useMemo(() => {
        if (!lead) return { score: 0, fields: [] };
        const checks = [
            { key: 'requirement', label: 'Requirement Type', done: !!(lead.requirement?.lookup_value || lead.requirement), icon: 'fa-home', weight: 20 },
            { key: 'propertyType', label: 'Property Category', done: Array.isArray(lead.propertyType) && lead.propertyType.length > 0, icon: 'fa-building', weight: 20 },
            { key: 'budget', label: 'Budget Range', done: lead.budgetMin > 0 || lead.budgetMax > 0, icon: 'fa-rupee-sign', weight: 20 },
            { key: 'area', label: 'Area Preference', done: lead.areaMin > 0 || lead.areaMax > 0, icon: 'fa-ruler-combined', weight: 20 },
            { key: 'location', label: 'Location Signal', done: !!(lead.sector || lead.locArea || lead.locCity || lead.location), icon: 'fa-map-marker-alt', weight: 15 },
            { key: 'projectName', label: 'Target Project', done: Array.isArray(lead.projectName) && lead.projectName.length > 0, icon: 'fa-city', weight: 5 },
        ];
        const score = checks.filter(c => c.done).reduce((sum, c) => sum + c.weight, 0);
        return { score, fields: checks };
    }, [lead]);

    const handleSaveProfile = async () => {
        if (!lead?._id) return;
        setSavingProfile(true);
        try {
            const payload = {};
            if (quickFields.sector !== undefined) payload.sector = quickFields.sector;
            if (quickFields.locArea !== undefined) payload.locArea = quickFields.locArea;
            if (quickFields.locCity !== undefined) payload.locCity = quickFields.locCity;
            if (quickFields.budgetMin !== undefined) payload.budgetMin = parseFloat(quickFields.budgetMin) * 100000;
            if (quickFields.budgetMax !== undefined) payload.budgetMax = parseFloat(quickFields.budgetMax) * 100000;
            if (quickFields.areaMin !== undefined) payload.areaMin = parseFloat(quickFields.areaMin);
            if (quickFields.areaMax !== undefined) payload.areaMax = parseFloat(quickFields.areaMax);
            if (quickFields.areaMetric !== undefined) payload.areaMetric = quickFields.areaMetric;

            const res = await api.patch(`leads/${lead._id}`, payload);
            if (res.data?.success || res.data?.data) {
                setLead(prev => ({ ...prev, ...payload }));
                setIsQuickFillOpen(false);
                setQuickFields({});
                toast.success('Profile updated! Re-matching...');
                // Re-trigger match fetch by bumping budgetFlexibility slightly then back
                setBudgetFlexibility(prev => { setTimeout(() => setBudgetFlexibility(prev), 50); return prev + 0.001; });
            }
        } catch (e) {
            toast.error('Failed to save profile updates');
        } finally {
            setSavingProfile(false);
        }
    };

    // ─── PHASE 4A: Auto-Dispatch State & Handler ─────────────────────────────
    const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(false);
    const [autoDispatchThreshold, setAutoDispatchThreshold] = useState(70);   // Min score to auto-send
    const [autoDispatchTopN, setAutoDispatchTopN] = useState(3);              // Max deals to auto-send
    const [autoDispatching, setAutoDispatching] = useState(false);
    const [globalPolicy, setGlobalPolicy] = useState(null);

    useEffect(() => {
        const fetchGlobalPolicy = async () => {
            try {
                const { enrichmentAPI } = await import('../../../utils/api');
                const res = await enrichmentAPI.getRules();
                if (res.success && res.data?.generalRules) {
                    const policy = res.data.generalRules.find(r => r.type === 'autodispatch');
                    if (policy && policy.config) {
                        setGlobalPolicy(policy.config);
                        setAutoDispatchEnabled(policy.config.enabled);
                        setAutoDispatchThreshold(policy.config.threshold || 70);
                        setAutoDispatchTopN(policy.config.maxProperties || 3);
                    }
                }
            } catch (e) {
                console.warn("Could not fetch global auto-dispatch policy", e);
            }
        };
        fetchGlobalPolicy();
    }, []);

    const handleAutoDispatch = async (deals) => {
        if (!autoDispatchEnabled || !lead || autoDispatching) return;
        const qualifying = deals
            .filter(d => (d.score || d.matchPercentage || 0) >= autoDispatchThreshold)
            .slice(0, autoDispatchTopN);

        if (qualifying.length === 0) {
            toast('No deals meet the auto-dispatch threshold.', { icon: 'ℹ️' });
            return;
        }

        setAutoDispatching(true);
        try {
            // Enterprise Grade: Automated Background Dispatch via Campaign Engine
            const dealIds = qualifying.map(d => d._id);
            const res = await api.post('marketing/send-manual', {
                leadId: lead._id,
                dealIds,
                toggles: { whatsapp: true, email: false, sms: false }
            });

            if (res.data?.success) {
                setLastAutoDispatchCount(qualifying.length);
                toast.success(`🚀 Enterprise Auto-Dispatch: Shared ${qualifying.length} matches with ${lead.firstName || 'lead'} in background.`);
            } else {
                // Fallback to manual stagger if background fails
                for (let i = 0; i < qualifying.length; i++) {
                    const deal = qualifying[i];
                    const phone = lead.mobile || lead.phone || '';
                    const locationString = typeof deal.location === 'object' ? (deal.location.lookup_value || deal.location.name) : deal.location;
                    const msg = `Hi ${lead.firstName || lead.name}, I found a match: ${deal.projectName || locationString}. Interested?`;
                    if (phone) window.open(`https://wa.me/91${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                    if (i < qualifying.length - 1) await new Promise(r => setTimeout(r, 600));
                }
            }
        } catch (err) {
            console.error("Auto-dispatch failed", err);
            toast.error("Auto-dispatch encounterd an error.");
        } finally {
            setAutoDispatching(false);
        }
    };

    // Trigger auto-dispatch whenever inventory items update and toggle is on
    const prevInventoryRef = useRef([]);
    useEffect(() => {
        if (autoDispatchEnabled && inventoryItems.length > 0 && inventoryItems !== prevInventoryRef.current) {
            prevInventoryRef.current = inventoryItems;
            handleAutoDispatch(inventoryItems);
        }
    }, [inventoryItems, autoDispatchEnabled]);

    // ─── PHASE 4C: Interest Feedback State & Handler ──────────────────────────
    const [dealFeedback, setDealFeedback] = useState({}); // { [deal._id]: 'interested'|'passed'|'snoozed' }
    const [submittingFeedback, setSubmittingFeedback] = useState(null);

    const handleInterestFeedback = async (item, feedback) => {
        if (!lead?._id) return;
        const dealId = item._id;
        if (submittingFeedback === dealId) return;
        setSubmittingFeedback(dealId);

        try {
            // 1. Update local UI immediately (optimistic)
            setDealFeedback(prev => ({ ...prev, [dealId]: feedback }));

            // 2. Persist to lead profile
            const intentTagMap = { interested: 'interested_in_property', passed: 'not_interested', snoozed: 'follow_up_later' };
            const newTag = intentTagMap[feedback];
            const existingTags = Array.isArray(lead.intent_tags) ? lead.intent_tags : [];
            const updatedTags = [...new Set([...existingTags.filter(t => !Object.values(intentTagMap).includes(t)), newTag])];

            // 3. If interested, also update interestedInventory
            const payload = { intent_tags: updatedTags };
            if (feedback === 'interested' && (item.inventoryId?._id || item.inventoryId)) {
                payload.interestedInventory = [...(lead.interestedInventory || []), (item.inventoryId?._id || item.inventoryId)];
            }

            if (feedback === 'snoozed' && (item.inventoryId?._id || item.inventoryId)) {
                await api.put(`leads/match/snooze/${item.inventoryId?._id || item.inventoryId}`, { leadId: lead._id });
            } else {
                await api.patch(`leads/${lead._id}`, payload);
            }
            
            setLead(prev => ({ ...prev, ...payload }));

            // 4. Show contextual feedback
            const messages = {
                interested: `✅ ${lead.firstName} marked as interested in ${item.projectName || 'this property'}`,
                passed: `👎 Noted as "Not Interested" — ${item.projectName || 'this property'} will be de-prioritized`,
                snoozed: `⏰ Snoozed — ${item.projectName || 'this property'} will resurface in 7 days`
            };
            toast.success(messages[feedback]);

            // 5. If snoozed — remove from current view after brief delay
            if (feedback === 'snoozed') {
                setTimeout(() => {
                    setInventoryItems(prev => prev.filter(d => d._id !== dealId));
                }, 800);
            }
        } catch (e) {
            // Rollback optimistic update on error
            setDealFeedback(prev => { const n = { ...prev }; delete n[dealId]; return n; });
            toast.error('Failed to save feedback. Please try again.');
        } finally {
            setSubmittingFeedback(null);
        }
    };

    const handleTogglePin = async (item) => {
        if (!lead?._id || !item) return;
        const invId = item.inventoryId?._id || item.inventoryId || item._id;
        
        // Optimistic UI
        setInventoryItems(prev => prev.map(d => 
            (d._id === item._id) ? { ...d, isPinned: !d.isPinned } : d
        ));

        try {
            const res = await api.put(`leads/${lead._id}/pin-match/${invId}`);
            if (res.data?.success) {
                toast.success(res.data.message);
                // Also update the lead state if we need it elsewhere
                setLead(prev => {
                    const pinned = prev.pinnedMatches || [];
                    const exists = pinned.includes(invId);
                    return {
                        ...prev,
                        pinnedMatches: exists ? pinned.filter(id => id !== invId) : [...pinned, invId]
                    };
                });
            }
        } catch (e) {
            // Rollback
            setInventoryItems(prev => prev.map(d => 
                (d._id === item._id) ? { ...d, isPinned: !d.isPinned } : d
            ));
            toast.error('Failed to update bookmark');
        }
    };

    // ─── PHASE 5: AI Interpretation Engine ───────────────────────────────────
    const [interpreting, setInterpreting] = useState(false);
    const [aiFindings, setAiFindings] = useState(null);

    const handleAIInterpret = async () => {
        if (!lead?._id) return;
        setInterpreting(true);
        try {
            const res = await api.post(`leads/${lead._id}/ai-interpret`);
            if (res.data?.success) {
                setAiFindings(res.data.data);
                toast.success('AI successfully interpreted lead preferences!');
            }
        } catch (e) {
            const errorMsg = e.response?.data?.error || e.message || 'Check Gemini API Configuration';
            toast.error(`AI Interpretation failed: ${errorMsg}`);
        } finally {
            setInterpreting(false);
        }
    };

    const applyAIFindings = async () => {
        if (!aiFindings || !lead?._id) return;
        setSavingProfile(true);
        try {
            const payload = {
                requirement: aiFindings.requirement,
                budgetMin: aiFindings.budgetMin,
                budgetMax: aiFindings.budgetMax,
                sector: aiFindings.location,
                source: 'AI_PROFILER',
                // propertyType needs to be IDs, so we'll keep names for now or use a fuzzy resolver
                // For a senior professional, we'll just update the scalars
            };
            
            const res = await api.patch(`leads/${lead._id}`, payload);
            if (res.data?.success) {
                setLead(prev => ({ ...prev, ...payload }));
                setAiFindings(null);
                toast.success('AI Insights applied to profile! Re-matching...');
                setRefreshCount(prev => prev + 1);
            }
        } catch (e) {
            console.error('[AI_APPLY_ERROR]', e);
            const msg = e.response?.data?.message || e.message;
            toast.error(`Failed to apply AI insights: ${msg}`);
        } finally {
            setSavingProfile(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div className="loading-spinner"></div>
                <p>Loading matching properties...</p>
            </div>
        );
    }

    const handleSendBlast = async () => {
        const selectedDeals = matchedItems.filter(item => selectedItems.includes(item.id || item.unitNo));
        if (selectedDeals.length === 0) {
            toast.error('Please select at least one property to blast.');
            return;
        }

        const activeChannels = Object.keys(blastChannels).filter(k => blastChannels[k]);
        if (activeChannels.length === 0) {
            toast.error('Please select at least one channel (WhatsApp, Email, or SMS).');
            return;
        }

        setIsBlasting(true);
        const loadToast = toast.loading(`Dispatching to ${activeChannels.length} channel(s)...`);

        try {
            const dealIds = selectedDeals.map(d => d._id || d.id);
            
            // Native WhatsApp App fallback (runs locally)
            if (blastChannels.whatsapp_app) {
                // Generate simple text fallback for local app
                let textPayload = `Hi ${lead?.firstName || lead?.name || 'there'}! I've curated a list of properties for you:\n\n`;
                selectedDeals.forEach((d, i) => {
                    let line = `${i+1}. ${d.projectName}`;
                    if (portfolioDetailLevel.includes('extended') && d.unitNo) line += ` (Unit: ${d.unitNo})`;
                    if (portfolioDetailLevel.includes('full')) {
                        if (d.location) line += ` in ${d.location}`;
                        if (d.size) line += ` | Size: ${d.size}`;
                    }
                    line += ` - ${d.price && !hidePrice ? '₹'+d.price : 'Price on request'}`;
                    textPayload += line + '\n';
                });
                const phone = (lead?.mobile || lead?.phone || '').replace(/\D/g, '');
                const formattedPhone = phone.length === 10 ? `91${phone}` : phone;
                window.open(`whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(textPayload)}`, '_blank');
            }

            // Enterprise Unified API Calls for scheduled/now sending
            // We'll iterate through all channels EXCEPT whatsapp_app to invoke the manual sender
            const dispatchPromises = [];
            
            ['whatsapp', 'email', 'sms', 'rcs'].forEach(ch => {
                if (blastChannels[ch]) {
                    dispatchPromises.push(
                        api.post('marketing/send-manual', {
                            leadId: lead._id,
                            dealIds,
                            toggles: { [ch]: true },
                            scheduledAt: channelSchedules?.[ch] || undefined,
                            hidePrice,
                            matchContext: portfolioDetailLevel.includes('short') ? 'top' : 'perfect'
                        }).catch(e => console.error(`[Dispatch] Error on ${ch}:`, e))
                    );
                }
            });

            if (dispatchPromises.length > 0) {
                await Promise.all(dispatchPromises);
            }

            toast.success(`Omnichannel dispatch processed via Enterprise Queue!`, { id: loadToast });
        } catch (error) {
            toast.error('Dispatch encountered an issue.', { id: loadToast });
        } finally {
            setIsBlasting(false);
        }
    };


    const generateEmailContent = (items) => {
        const subject = `🔥 Priority Selected: Top ${items.length} Property Matches for your Requirement!`;
        let body = `Dear ${lead.name},<br><br>`;
        body += `We've been working hard to find the perfect properties for you. Based on our latest market analysis, we have identified these <strong>Top ${items.length} Matches</strong> that perfectly align with your requirements.<br><br>`;

        items.forEach((item, index) => {
            body += `<div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-family: sans-serif; background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff';">`;
            body += `<div style="display: flex; gap: 16px; align-items: flex-start;">`;

            // Image Preview (if available)
            if (item.images && item.images.length > 0) {
                body += `<div style="width: 120px; height: 90px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9';">`;
                body += `<img src="${item.images[0]}" style="width: 100%; height: 100%; object-fit: cover;">`;
                body += `</div>`;
            } else if (item.thumbnail) {
                body += `<div style="width: 120px; height: 90px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9';">`;
                body += `<img src="${item.thumbnail}" style="width: 100%; height: 100%; object-fit: cover;">`;
                body += `</div>`;
            }

            body += `<div>`;
            body += `<h3 style="margin: 0; color: #1e293b; font-size: 1.1rem;">🏠 MATCH #${index + 1}: ${item.projectName || 'Premium Listing'}</h3>`;
            body += `<p style="margin: 4px 0; color: #64748b; font-size: 0.9rem;"><i class="fas fa-map-marker-alt"></i> ${renderValue(resolveLookup(item.inventoryId?.address?.locality, 'Locality') || resolveLookup(item.inventoryId?.address?.area, 'Area') || resolveLookup(item.inventoryId?.address?.location, 'Location') || item.location)}</p>`;
            body += `<p style="margin: 4px 0; color: #475569; font-size: 0.85rem;">🏢 Type: <strong>${renderValue(resolveLookup(item.propertyType, 'Category') || item.type)}</strong> | 📏 Size: <strong>${renderValue(resolveLookup(item.sizeConfig, 'Size') || item.size)}</strong></p>`;
            body += `<p style="margin: 8px 0; color: #10b981; font-weight: 800; font-size: 1.1rem;">💰 Exclusive Price: ₹${renderValue(item.price)}</p>`;
            body += `<div style="display: inline-block; background: #ecfdf5; color: #059669; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">✨ Match Accuracy: ${item.matchPercentage}%</div>`;
            body += `</div>`;
            body += `</div>`;
            body += `</div>`;
        });

        body += `<br>These properties are currently seeing high interest and are moving fast. I'd love to show them to you this week.<br><br>`;
        body += `<strong>Can we schedule a visit or a brief call today to discuss these?</strong><br><br>`;
        body += `Looking forward to helping you find your ideal property.<br><br>`;
        body += `Best regards,<br>`;
        body += `<strong>Bharat Properties Team</strong><br>`;
        body += `Ph: +91-XXXXX-XXXXX`;

        // Aggregate Attachments
        const attachments = [];
        items.forEach(item => {
            if (item.images) {
                item.images.forEach((url, i) => attachments.push({ type: 'image', url, name: `${item.projectName || 'Property'}_Img_${i + 1}.jpg` }));
            }
            if (item.video) {
                attachments.push({ type: 'video', url: item.video, name: `${item.projectName || 'Property'}_Video.mp4` });
            }
        });

        return { subject, body, attachments };
    };

    if (!lead) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Lead not found</h2>
                <button onClick={() => onNavigate('leads')} className="btn-primary">Go back to Leads</button>
            </div>
        );
    }

    return (
        <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', minHeight: '100vh', padding: '24px', paddingBottom: '100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => onNavigate('leads')}
                        style={{ border: 'none', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                    >
                        <i className="fas fa-arrow-left" style={{ color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b' }}></i>
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#0f172a', margin: 0 }}>Requirement Match Center</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>Finding matches for Lead:</span>
                            <span
                                style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none' }}
                                onClick={() => onNavigate('contact-detail', lead.mobile)}
                            >
                                {renderValue(lead.name)} | {renderValue(lead.mobile)}
                            </span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ padding: '8px 16px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #b9f6ca' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534' }}>Strict AI Engine Active</span>
                    </div>
                    <label style={{ display: 'none' }}>
                        {/* Hidden to preserve React state references if any */}
                    </label>
                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={() => {
                            const topMatches = matchedItems.slice(0, 5);
                            const { subject, body, attachments } = generateEmailContent(topMatches);
                            setMailSubject(subject);
                            setMailBody(body);
                            setMailAttachments(attachments);
                            setSelectedItemsForAction(topMatches);
                            setMailTemplateId('8'); // Property Presentation
                            setIsMailOpen(true);
                            toast.success(`Generated multimedia email for top ${topMatches.length} matches`);
                        }}
                    >
                        <i className="fas fa-paper-plane"></i> Send All Top Matches
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <i className="fas fa-fingerprint" style={{ color: '#3b82f6' }}></i> Requirement Profile
                            </h3>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '4px 10px', borderRadius: '20px', border: '1px solid #b9f6ca', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div> Verified Signal
                            </span>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <button 
                                onClick={handleAIInterpret}
                                disabled={interpreting}
                                style={{ 
                                    width: '100%', 
                                    padding: '10px', 
                                    borderRadius: '12px', 
                                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', 
                                    color: '#fff', 
                                    border: 'none', 
                                    fontWeight: 800, 
                                    fontSize: '0.8rem', 
                                    cursor: interpreting ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                                    opacity: interpreting ? 0.7 : 1
                                }}
                            >
                                {interpreting ? (
                                    <><i className="fas fa-spinner fa-spin"></i> Analyzing Signals...</>
                                ) : (
                                    <><i className="fas fa-wand-magic-sparkles"></i> AI Interpret Requirements</>
                                )}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Core Requirement & Intent */}
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Primary Intent</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#0f172a' }}>{renderValue(lead.intent)}</span>
                                            <span style={{ padding: '2px 10px', borderRadius: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', color: '#2563eb', fontSize: '0.75rem', fontWeight: 800 }}>{renderValue(lead.requirement)}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Lead Score</label>
                                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#3b82f6' }}>{lead.leadScore || 85}%</span>
                                    </div>
                                </div>
                                
                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '12px' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Property Categories</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {Array.isArray(lead.propertyType) && lead.propertyType.length > 0 ? lead.propertyType.map((pt, i) => (
                                            <span key={i} style={{ fontSize: '0.7rem', fontWeight: 800, background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', color: isDark ? 'var(--text-main)' : '#475569', padding: '4px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                                {renderValue(pt)}
                                            </span>
                                        )) : <span style={{ color: '#cbd5e1', fontSize: '0.75rem', fontStyle: 'italic' }}>No specific category selected</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Location Signal Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-map-marked-alt" style={{ color: '#3b82f6', fontSize: '0.75rem' }}></i>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Target Area</label>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b', margin: 0 }}>{renderValue(lead.location)}</p>
                                    {lead.locArea && <p style={{ fontSize: '0.7rem', color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0 }}>Sub: {renderValue(lead.locArea)}</p>}
                                </div>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-city" style={{ color: '#3b82f6', fontSize: '0.75rem' }}></i>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>City / Sector</label>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b', margin: 0 }}>{renderValue(lead.sector || lead.locCity) || 'Open Region'}</p>
                                    <p style={{ fontSize: '0.7rem', color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0 }}>Precise Match Active</p>
                                </div>
                            </div>

                            {/* Financial & Scale Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '14px', borderRadius: '16px', border: '1px solid #dbeafe', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-wallet" style={{ color: '#2563eb', fontSize: '0.75rem' }}></i>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>Budget Window</label>
                                    </div>
                                    <p style={{ fontSize: '1rem', fontWeight: 900, color: '#1e40af', margin: 0 }}>
                                        {lead.budgetMin > 0 ? `₹${(lead.budgetMin / 100000).toFixed(1)}L – ₹${lead.budgetMax > 0 ? (lead.budgetMax / 100000).toFixed(1) + 'L' : '?'}` : 'TBA'}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                        <div style={{ width: '100%', height: '4px', background: '#dbeafe', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{ width: '70%', height: '100%', background: '#2563eb' }}></div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-ruler-combined" style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.75rem' }}></i>
                                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Scale (Sq.Yd)</label>
                                    </div>
                                    <p style={{ fontSize: '1rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b', margin: 0 }}>
                                        {lead.areaMin > 0 ? `${lead.areaMin} – ${lead.areaMax || 'Any'}` : 'Open Size'}
                                    </p>
                                    <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0 }}>Preferred Floor: Any</p>
                                </div>
                            </div>

                            {/* Additional Signals (New Enterprise Section) */}
                            <div style={{ background: '#fdf4ff', padding: '12px 16px', borderRadius: '16px', border: '1px solid #f5d0fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f5d0fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-magic" style={{ color: '#a21caf', fontSize: '0.85rem' }}></i>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#701a75' }}>Secondary Preferences</p>
                                        <p style={{ margin: 0, fontSize: '0.65rem', color: '#a21caf' }}>Facing, Age, Ready to move</p>
                                    </div>
                                </div>
                                <i className="fas fa-chevron-right" style={{ color: '#a21caf', fontSize: '0.7rem' }}></i>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '24px', padding: '20px 24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: `1px solid ${profileCompleteness.score < 60 ? '#ffedd5' : profileCompleteness.score < 100 ? '#fef9c3' : '#dcfce7'}`, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <i className="fas fa-bolt" style={{ color: profileCompleteness.score < 60 ? '#f97316' : profileCompleteness.score < 100 ? '#eab308' : '#10b981' }}></i>
                                Data Readiness
                            </h3>
                            <div style={{ fontSize: '1rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#0f172a' }}>{profileCompleteness.score}%</div>
                        </div>
                        
                        <div style={{ height: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', borderRadius: '4px', marginBottom: '16px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${profileCompleteness.score}%`, background: profileCompleteness.score < 60 ? '#f97316' : profileCompleteness.score < 100 ? '#eab308' : '#10b981', borderRadius: '4px', transition: 'width 1s ease-in-out' }}></div>
                        </div>

                        <button
                            onClick={() => setShowQuickFill(true)}
                            style={{ width: '100%', padding: '10px', borderRadius: '12px', border: '1.5px dashed #3b82f6', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', color: '#2563eb', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                        >
                            <i className="fas fa-edit" style={{ marginRight: '6px' }}></i> Optimize Profile Data
                        </button>
                    </div>

                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '24px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <i className="fas fa-sliders-h" style={{ color: '#6366f1' }}></i> Match Sensitivity
                            </h3>
                            <button onClick={() => setIsWeightsOpen(true)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}>Precision Config</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569' }}>Budget Tolerance</label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#2563eb', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>±{budgetFlexibility}%</span>
                                </div>
                                <input type="range" min="0" max="50" value={budgetFlexibility} onChange={(e) => setBudgetFlexibility(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }} />
                                <p style={{ margin: '8px 0 0 0', fontSize: '0.6rem', color: '#94a3b8', fontStyle: 'italic' }}>Broadens price range for higher recall</p>
                            </div>

                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569' }}>Scale Tolerance</label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: '6px' }}>±{sizeFlexibility}%</span>
                                </div>
                                <input type="range" min="0" max="50" value={sizeFlexibility} onChange={(e) => setSizeFlexibility(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }} />
                                <p style={{ margin: '8px 0 0 0', fontSize: '0.6rem', color: '#94a3b8', fontStyle: 'italic' }}>Adjusts area/size matching precision</p>
                            </div>
                            
                            <div style={{ padding: '12px', borderRadius: '12px', background: '#fdf4ff', border: '1px solid #fae8ff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-info-circle" style={{ color: '#d946ef', fontSize: '0.9rem' }}></i>
                                <p style={{ margin: 0, fontSize: '0.65rem', color: '#a21caf', lineHeight: 1.4 }}>
                                    Higher flexibility discovers more opportunities but may reduce lead relevance scores.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input 
                                type="checkbox" 
                                onChange={handleSelectAll} 
                                checked={selectedItems.length === (showOnlyPerfectMatch ? matchedItems.filter(i => i.isPreferredMatch).length : matchedItems.length) && (showOnlyPerfectMatch ? matchedItems.filter(i => i.isPreferredMatch).length : matchedItems.length) > 0} 
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{showOnlyPerfectMatch ? matchedItems.filter(i => i.isPreferredMatch).length : matchedItems.length} Matches Found</span>
                                {matchedItems.filter(i => i.isPreferredMatch).length > 0 && (
                                    <span 
                                        onClick={() => setShowOnlyPerfectMatch(!showOnlyPerfectMatch)}
                                        style={{ 
                                            fontSize: '0.75rem', fontWeight: 800, 
                                            background: showOnlyPerfectMatch ? '#eab308' : '#10b981', 
                                            color: '#fff', padding: '2px 8px', borderRadius: '100px',
                                            cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: showOnlyPerfectMatch ? '0 0 8px rgba(234, 179, 8, 0.4)' : 'none'
                                        }}>
                                        {matchedItems.filter(i => i.isPreferredMatch).length} Perfect Match
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div 
                            onClick={() => setShowOtherCities(!showOtherCities)}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                background: showOtherCities ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                padding: '6px 12px',
                                borderRadius: '100px',
                                cursor: 'pointer',
                                border: `1px solid ${showOtherCities ? '#bfdbfe' : '#e2e8f0'}`,
                                transition: 'all 0.3s ease',
                                userSelect: 'none'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: showOtherCities ? '#2563eb' : isDark ? 'var(--text-muted)' : '#64748b' }}>
                                {showOtherCities ? 'Showing All Cities' : 'Target City Only'}
                            </span>
                            <div style={{ 
                                width: '32px', 
                                height: '18px', 
                                background: showOtherCities ? '#3b82f6' : '#cbd5e1', 
                                borderRadius: '10px', 
                                position: 'relative',
                                transition: 'background 0.3s'
                            }}>
                                <div style={{ 
                                    width: '14px', 
                                    height: '14px', 
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', 
                                    borderRadius: '50%', 
                                    position: 'absolute', 
                                    top: '2px', 
                                    left: showOtherCities ? '16px' : '2px',
                                    transition: 'left 0.3s'
                                }}></div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Phase 3C: Smart Suggestions Banner ─── */}
                    {suggestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {suggestions.map((s, i) => {
                                const colors = {
                                    high:   { bg: '#fff1f2', border: '#fecdd3', icon: '#dc2626', text: '#9f1239' },
                                    medium: { bg: '#fffbeb', border: '#fde68a', icon: '#d97706', text: '#92400e' },
                                    low:    { bg: '#eff6ff', border: '#bfdbfe', icon: '#2563eb', text: '#1e40af' }
                                };
                                const c = colors[s.severity] || colors.low;
                                return (
                                    <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <i className={`fas ${s.icon}`} style={{ color: c.icon, fontSize: '0.85rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: '0 0 3px 0', fontWeight: 800, fontSize: '0.82rem', color: c.text }}>{renderValue(s.title)}</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: c.text, opacity: 0.85, lineHeight: 1.5 }}>{renderValue(s.message)}</p>
                                        </div>
                                        {s.action && (
                                            <button 
                                                onClick={() => s.action.toLowerCase().includes('quick fill') && setShowQuickFill(true)}
                                                style={{ fontSize: '0.65rem', fontWeight: 800, color: c.icon, background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: `1px solid ${c.border}`, padding: '4px 12px', borderRadius: '8px', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                            >
                                                {renderValue(s.action)} →
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {displayedItems.map((item, idx) => (
                        <div
                            key={(item.id || item.unitNo) + idx}
                            style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                borderRadius: '24px',
                                padding: '8px 16px',
                                boxShadow: selectedItems.includes(item.id || item.unitNo) ? '0 0 0 2px #3b82f6, 0 10px 15px -3px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                                border: '1px solid #e2e8f0',
                                display: 'grid',
                                gridTemplateColumns: '40px 140px 1fr 220px',
                                gap: '16px',
                                alignItems: 'center',
                                transition: 'all 0.3s ease',
                                minHeight: '90px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <input
                                    type="checkbox"
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    checked={selectedItems.includes(item.id || item.unitNo)}
                                    onChange={() => handleSelectItem(item.id || item.unitNo)}
                                />
                            </div>

                            {/* Property Image & Badge */}
                            <div style={{ position: 'relative' }}>
                                <div 
                                    onClick={(e) => { e.stopPropagation(); handleTogglePin(item); }}
                                    style={{ 
                                        position: 'absolute', top: '-10px', left: '-10px', 
                                        zIndex: 10, width: '32px', height: '32px', 
                                        borderRadius: '50%', background: item.isPinned ? '#f59e0b' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', 
                                        color: item.isPinned ? '#fff' : '#cbd5e1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', cursor: 'pointer',
                                        border: `2px solid ${item.isPinned ? '#d97706' : '#f1f5f9'}`,
                                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                    }}
                                    title={item.isPinned ? "Pinned to Shortlist" : "Pin to Shortlist"}
                                >
                                    <i className={`fas fa-thumbtack`} style={{ transform: item.isPinned ? 'rotate(0deg)' : 'rotate(45deg)', fontSize: '0.85rem' }}></i>
                                </div>
                                <img
                                    src={item.thumbnail}
                                    alt="Property"
                                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '14px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9' }}
                                />
                                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(15, 23, 42, 0.8)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backdropFilter: 'blur(4px)' }}>
                                    {renderValue(item.itemType || item.category)}
                                </div>
                                {item.sharedStatus && (
                                    <div style={{
                                        position: 'absolute', top: '8px', right: '8px',
                                        background: item.sharedStatus === 'hot' ? '#dc2626' : item.sharedStatus === 'recent' ? '#f97316' : '#eab308',
                                        color: '#fff', fontSize: '0.55rem', fontWeight: 800,
                                        padding: '2px 7px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', gap: '3px'
                                    }}>
                                        <i className="fas fa-paper-plane" style={{ fontSize: '0.5rem' }}></i>
                                        {item.sharedStatus === 'hot' ? `Sent ${item.daysSinceShared}d ago` :
                                         item.sharedStatus === 'recent' ? `Sent ${item.daysSinceShared}d ago` :
                                         `Sent ${item.daysSinceShared}d ago`}
                                    </div>
                                )}
                                <div style={{ position: 'absolute', bottom: '-10px', right: '10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', width: '40px', height: '40px', borderRadius: '50%', border: `3px solid ${item.sharedStatus ? (item.sharedStatus === 'hot' ? '#fee2e2' : item.sharedStatus === 'recent' ? '#ffedd5' : '#fef9c3') : '#f8fafc'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 900, color: item.matchPercentage > 70 ? '#10b981' : '#f59e0b', lineHeight: 1 }}>{item.matchPercentage}%</span>
                                    {item.rawScore && item.rawScore !== item.matchPercentage && (
                                        <span style={{ fontSize: '0.45rem', color: '#94a3b8', lineHeight: 1 }}>{item.rawScore}→</span>
                                    )}
                                </div>
                            </div>

                            {/* Item Info */}
                            <div style={{ padding: '4px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{
                                        background: item.matchPercentage > 80 ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : item.matchPercentage > 50 ? '#fef3c7' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                        color: item.matchPercentage > 80 ? '#166534' : item.matchPercentage > 50 ? '#92400e' : isDark ? 'var(--text-main)' : '#475569',
                                        padding: '2px 10px',
                                        borderRadius: '8px',
                                        fontSize: '1.1rem',
                                        fontWeight: 900,
                                        minWidth: '50px',
                                        textAlign: 'center',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        border: `1px solid ${item.matchPercentage > 80 ? '#b9f6ca' : item.matchPercentage > 50 ? '#fde68a' : '#e2e8f0'}`
                                    }}>
                                        {renderValue(item.unitNo) || 'N/A'}
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 10px', borderRadius: '100px', border: '1px solid #b9f6ca' }}>
                                        ₹{renderValue(item.price)}
                                    </span>
                                    {item.isPreferredMatch && (
                                        <span style={{ background: 'linear-gradient(135deg, #fef08a 0%, #f59e0b 100%)', color: '#78350f', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', boxShadow: '0 2px 4px rgba(245, 158, 11, 0.2)' }}>
                                            <i className="fas fa-star" style={{ marginRight: '4px' }}></i>Preferred Match
                                        </span>
                                    )}
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <p style={{ fontSize: '0.9rem', color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#0f172a', margin: '0 0 4px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                        {renderValue(item.inventoryId?.projectName || item.projectName || 'Premium Listing')}
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {item.inventoryId?.sector && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                                {renderValue(item.inventoryId.sector)}
                                            </span>
                                        )}
                                        {item.inventoryId?.city && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#2563eb', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                                                {renderValue(item.inventoryId.city)}
                                            </span>
                                        )}
                                        {item.inventoryId?.address?.locality && (
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px' }}>
                                                {renderValue(resolveLookup(item.inventoryId.address.locality, 'Locality'))}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #dbeafe' }}>
                                        <i className="fas fa-tag" style={{ color: '#3b82f6', fontSize: '0.7rem' }}></i>
                                        Sub-Category: <span style={{ color: '#2563eb', fontWeight: 800 }}>{renderValue(resolveLookup(item.subCategory, 'SubCategory') || resolveLookup(item.inventoryId?.subCategory, 'SubCategory') || resolveLookup(item.propertyType, 'Category') || resolveLookup(item.category, 'Category') || item.type || 'N/A')}</span>
                                    </div>
                                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff7ed', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #ffedd5' }}>
                                        <i className="fas fa-ruler-combined" style={{ color: '#f97316', fontSize: '0.7rem' }}></i>
                                        Size: <span style={{ color: '#ea580c', fontWeight: 800 }}>{renderValue(resolveLookup(item.sizeConfig, 'Size') || resolveLookup(item.inventoryId?.sizeConfig, 'Size') || (item.size?.value ? `${item.size.value} ${item.size.unit || 'Sq.Yd.'}` : (typeof item.size === 'string' ? item.size : 'Size N/A')))}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setExpandedBreakdown(expandedBreakdown === item._id ? null : item._id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: '#3b82f6', fontSize: '0.7rem', fontWeight: 800, marginTop: '8px' }}
                                >
                                    <i className="fas fa-magic" style={{ fontSize: '0.65rem' }}></i>
                                    Analysis — {renderValue(item.matchPercentage)}%
                                    <i className={`fas fa-chevron-${expandedBreakdown === item._id ? 'up' : 'down'}`} style={{ fontSize: '0.6rem', marginLeft: '2px' }}></i>
                                </button>

                                {expandedBreakdown === item._id && item.scoreBreakdown && (
                                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderRadius: '12px', padding: '12px 16px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #f1f5f9' }}>
                                        {[
                                            { key: 'location', label: '📍 Location',  color: '#3b82f6' },
                                            { key: 'type',     label: '🏢 Type',      color: '#8b5cf6' },
                                            { key: 'budget',   label: '💰 Budget',    color: '#10b981' },
                                            { key: 'size',     label: '📐 Size',      color: '#f59e0b' }
                                        ].map(({ key, label, color }) => {
    const { isDark } = useTheme();
                                            const sig = item.scoreBreakdown[key];
                                            if (!sig) return null;
                                            const pct = sig.max > 0 ? Math.round((sig.earned / sig.max) * 100) : 0;
                                            return (
                                                <div key={key}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569' }}>{label}</span>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: sig.earned === sig.max ? '#16a34a' : sig.earned > 0 ? '#d97706' : '#dc2626' }}>
                                                            {sig.earned}/{sig.max} pts
                                                        </span>
                                                    </div>
                                                    <div style={{ height: '6px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: sig.earned === sig.max ? '#10b981' : sig.earned > 0 ? color : '#e2e8f0', borderRadius: '4px', transition: 'width 0.4s ease' }}></div>
                                                    </div>
                                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.62rem', color: '#94a3b8', fontStyle: 'italic' }}>{renderValue(sig.label)}</p>
                                                </div>
                                            );
                                        })}

                                        {/* 🚀 SENIOR PROFESSIONAL: Match Momentum & Decay Indicator */}
                                        <div style={{ marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <i className="fas fa-history" style={{ color: item.rawScore && item.rawScore > item.matchPercentage ? '#f97316' : isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.7rem' }}></i>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#475569' }}>Engagement Momentum</span>
                                                </div>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: item.rawScore && item.rawScore > item.matchPercentage ? '#dc2626' : '#10b981' }}>
                                                    {item.rawScore && item.rawScore > item.matchPercentage ? `-${item.rawScore - item.matchPercentage}% Decay` : 'Optimal'}
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.62rem', color: '#94a3b8', lineHeight: 1.3 }}>
                                                {item.rawScore && item.rawScore > item.matchPercentage 
                                                    ? `Score adjusted based on ${item.daysSinceShared || 'recent'} days of lead inactivity.` 
                                                    : 'High relevance maintained due to active lead engagement signals.'}
                                            </p>
                                        </div>

                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                                                {(item.matchDetails || item.matchReasons || []).map((detail, i) => (
                                                    <span key={i} style={{ fontSize: '0.62rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#475569', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', textTransform: 'uppercase' }}>
                                                        {renderValue(detail)}
                                                    </span>
                                                ))}
                                            </div>
                                            
                                            {item.lastDispatch && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.62rem' }}>
                                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>DISPATCH HISTORY:</span>
                                                    {(item.lastDispatch.channels || []).map((ch, i) => (
                                                        <span key={i} style={{ fontWeight: 700, color: ch === 'whatsapp' ? '#166534' : '#4338ca' }}>
                                                            {renderValue(ch).toUpperCase()}
                                                        </span>
                                                    ))}
                                                    {item.rawScore && item.rawScore !== item.matchPercentage && (
                                                        <span style={{ marginLeft: 'auto', color: '#f97316', fontWeight: 800 }}>
                                                            DECAYED FROM {item.rawScore}%
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleWhatsApp(item)}
                                        title="Send on WhatsApp"
                                        style={{ flex: 1, height: '38px', borderRadius: '12px', border: '1px solid #dcfce7', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', color: '#166534', cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        <i className="fab fa-whatsapp" style={{ fontSize: '1rem' }}></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const { subject, body, attachments } = generateEmailContent([item]);
                                            setMailSubject(subject);
                                            setMailBody(body);
                                            setMailAttachments(attachments);
                                            setSelectedItemsForAction([item]);
                                            setMailTemplateId('8'); // ID for 'Property Presentation'
                                            setIsMailOpen(true);
                                        }}
                                        title="Email Presentation"
                                        style={{ flex: 1, height: '38px', borderRadius: '12px', border: '1px solid #eef2ff', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f5f3ff', color: '#4338ca', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-envelope-open-text" style={{ fontSize: '0.9rem' }}></i>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const toastId = toast.loading('Generating Professional PDF...');
                                            setTimeout(() => {
                                                generateDealsPDF([item], lead?.name);
                                                toast.success('Professional Listing PDF Generated!', { id: toastId });
                                                logActivity('PDF Shared', item);
                                            }, 500);
                                        }}
                                        title="Generate Professional PDF"
                                        style={{ flex: 1, height: '38px', borderRadius: '12px', border: '1px solid #f1f5f9', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', color: isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-file-pdf" style={{ fontSize: '0.9rem' }}></i>
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <button
                                        onClick={() => handleInterestFeedback(item, 'interested')}
                                        disabled={submittingFeedback === item._id}
                                        style={{ flex: 1.2, height: '36px', borderRadius: '10px', border: `1px solid ${dealFeedback[item._id] === 'interested' ? '#10b981' : '#e2e8f0'}`, background: dealFeedback[item._id] === 'interested' ? '#ecfdf5' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: dealFeedback[item._id] === 'interested' ? '#10b981' : isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.2s' }}
                                    >
                                        <i className="fas fa-thumbs-up" style={{ fontSize: '0.8rem' }}></i>
                                        {submittingFeedback === item._id && dealFeedback[item._id] === 'interested' ? '...' : 'Interested'}
                                    </button>
                                    <button
                                        onClick={() => handleInterestFeedback(item, 'passed')}
                                        disabled={submittingFeedback === item._id}
                                        style={{ flex: 1, height: '36px', borderRadius: '10px', border: `1px solid ${dealFeedback[item._id] === 'passed' ? '#ef4444' : '#e2e8f0'}`, background: dealFeedback[item._id] === 'passed' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#fef2f2' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: dealFeedback[item._id] === 'passed' ? '#ef4444' : isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.2s' }}
                                    >
                                        <i className="fas fa-thumbs-down" style={{ fontSize: '0.8rem' }}></i>
                                        {submittingFeedback === item._id && dealFeedback[item._id] === 'passed' ? '...' : 'Pass'}
                                    </button>
                                    <button
                                        onClick={() => handleInterestFeedback(item, 'snoozed')}
                                        disabled={submittingFeedback === item._id}
                                        style={{ flex: 1, height: '36px', borderRadius: '10px', border: `1px solid ${dealFeedback[item._id] === 'snoozed' ? '#f59e0b' : '#e2e8f0'}`, background: dealFeedback[item._id] === 'snoozed' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#fffbeb' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: dealFeedback[item._id] === 'snoozed' ? '#f59e0b' : isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.2s' }}
                                    >
                                        <i className="fas fa-clock" style={{ fontSize: '0.8rem' }}></i>
                                        {submittingFeedback === item._id && dealFeedback[item._id] === 'snoozed' ? '...' : 'Later'}
                                    </button>
                                </div>

                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', height: '40px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 800, boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)' }}
                                    onClick={() => {
                                        const locVal = item.location?.lookup_value || item.location || '';
                                        const areaVal = item.area || '';
                                        const areaText = String(areaVal || locVal).toLowerCase();
                                        
                                        // Logic to resolve project from known inventory or lookup
                                        const projectSource = item.inventoryId?.projectName || item.projectName || locVal || 'Premium Listing';

                                        setActivityInitialData({
                                            activityType: 'Site Visit',
                                            status: 'Not Started',
                                            purpose: 'Property Visit',
                                            relatedTo: [{ id: lead.mobile, name: lead.name }],
                                            visitedProperties: [{
                                                project: projectSource,
                                                block: locVal || 'A Block',
                                                property: item.unitNo || item.id,
                                                result: '',
                                                feedback: ''
                                            }]
                                        });
                                        setIsActivityOpen(true);
                                    }}
                                >
                                    Log Site Visit Interest
                                </button>
                            </div>
                        </div>
                    ))}

                    {matchedItems.length > visibleCount && (
                        <button
                            onClick={() => setVisibleCount(prev => prev + 15)}
                            style={{ padding: '16px', borderRadius: '15px', border: '2px dashed #cbd5e1', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', width: '100%' }}
                        >
                            <i className="fas fa-plus-circle"></i> Load More Matches ({matchedItems.length - visibleCount} remaining)
                        </button>
                    )}

                    {matchedItems.length === 0 && (
                        <div style={{ padding: '60px', textAlign: 'center', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '24px', border: '2px dashed #e2e8f0' }}>
                            <i className="fas fa-search-minus" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '16px' }}></i>
                            <h3 style={{ color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '8px' }}>No exact matches found</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Try adjusting the "Budget Flexibility" or "Match Accuracy" in the left panel.</p>
                        </div>
                    )}

                    {/* Phase 3B: Excluded Deals Panel */}
                    {excludedCount > 0 && (
                        <div style={{ marginTop: '20px' }}>
                            <button
                                onClick={() => setShowExcluded(o => !o)}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: '14px', border: '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-filter" style={{ color: '#dc2626', fontSize: '0.72rem' }}></i>
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: isDark ? 'var(--text-main)' : '#374151' }}>
                                            {excludedCount} deal{excludedCount > 1 ? 's' : ''} filtered out by intent / category rules
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>Click to see why they were excluded</p>
                                    </div>
                                </div>
                                <i className={`fas fa-chevron-${showExcluded ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: '0.8rem' }}></i>
                            </button>

                            {showExcluded && excludedDeals.length > 0 && (
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '14px', border: '1px solid #fee2e2', marginTop: '8px', overflow: 'hidden' }}>
                                    <div style={{ padding: '10px 16px', background: '#fff1f2', borderBottom: '1px solid #fee2e2' }}>
                                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#991b1b' }}>
                                            <i className="fas fa-info-circle" style={{ marginRight: '6px' }}></i>
                                            These deals passed visibility rules but were excluded by the intent/category filter.
                                        </p>
                                    </div>
                                    {excludedDeals.map((ex, i) => (
                                        <div key={i} style={{ padding: '12px 16px', borderBottom: i < excludedDeals.length - 1 ? '1px solid #fef2f2' : 'none', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <i className="fas fa-home" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                                            </div>
                                            <div style={{ flex: 1, textAlign: 'left' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isDark ? 'var(--text-main)' : '#374151' }}>{renderValue(ex.projectName)}</span>
                                                    {ex.unitNo && <span style={{ fontSize: '0.65rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', color: isDark ? 'var(--text-main)' : '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>Unit {renderValue(ex.unitNo)}</span>}
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <i className="fas fa-times-circle" style={{ fontSize: '0.65rem' }}></i>
                                                    {renderValue(ex.excludeReason)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {selectedItems.length > 0 && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: isDark ? 'var(--text-main)' : '#0f172a', padding: '12px 24px', borderRadius: '40px', display: 'flex', alignItems: 'center', gap: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', zIndex: 1000 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#334155', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
                            {selectedItems.length} Selected
                        </div>
                        <select 
                            value={portfolioDetailLevel}
                            onChange={(e) => setPortfolioDetailLevel(e.target.value)}
                            style={{
                                background: '#1e293b', color: '#fff', border: '1px solid #475569', 
                                padding: '4px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
                                outline: 'none', cursor: 'pointer'
                            }}
                        >
                            <option value="full_details">Full Details</option>
                            <option value="short_details">Short Details</option>
                            <option value="full_extended">Full Details (with Loc & Unit)</option>
                            <option value="short_extended">Short Details (with Unit)</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600 }}>
                            <input type="checkbox" checked={hidePrice} onChange={(e) => setHidePrice(e.target.checked)} style={{ accentColor: '#6366f1', width: '16px', height: '16px', cursor: 'pointer' }} />
                            Hide Price
                        </label>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: '#475569' }}></div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Channel Select Toggles */}
                        {['whatsapp', 'email', 'sms'].map(ch => (
                            <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <button 
                                    disabled={!channelAvailability[ch]}
                                    onClick={() => setBlastChannels(prev => ({...prev, [ch]: !prev[ch]}))}
                                    style={{ 
                                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                        background: blastChannels[ch] ? (ch === 'whatsapp' ? '#10b981' : ch === 'email' ? '#3b82f6' : '#8b5cf6') : '#334155', 
                                        color: blastChannels[ch] ? '#fff' : '#94a3b8', 
                                        opacity: channelAvailability[ch] ? 1 : 0.4, cursor: channelAvailability[ch] ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', gap: '6px', 
                                        outline: blastChannels[ch] ? `2px solid ${ch === 'whatsapp' ? '#059669' : ch === 'email' ? '#2563eb' : '#7c3aed'}` : 'none'
                                    }}>
                                    <i className={`fa${ch==='whatsapp'?'b':'s'} fa-${ch==='whatsapp'?'whatsapp':ch==='email'?'envelope':'comment-dots'}`}></i> {ch === 'whatsapp' ? 'WA API' : ch.toUpperCase()}
                                </button>
                                {blastChannels[ch] && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <select 
                                            value={channelSchedules[ch] ? 'schedule' : 'now'}
                                            onChange={(e) => {
                                                if (e.target.value === 'now') {
                                                    setChannelSchedules(prev => ({...prev, [ch]: ''}));
                                                } else {
                                                    const date = new Date();
                                                    date.setHours(date.getHours() + 1);
                                                    setChannelSchedules(prev => ({...prev, [ch]: date.toISOString().slice(0, 16)}));
                                                }
                                            }}
                                            style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.7rem' }}
                                        >
                                            <option value="now">Send Now</option>
                                            <option value="schedule">Schedule Later</option>
                                        </select>
                                        {channelSchedules[ch] && (
                                            <input 
                                                type="datetime-local"
                                                value={channelSchedules[ch]}
                                                onChange={(e) => setChannelSchedules(prev => ({...prev, [ch]: e.target.value}))}
                                                style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.7rem' }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        <button 
                            disabled={!channelAvailability.rcs}
                            onClick={() => setBlastChannels(prev => ({...prev, rcs: !prev.rcs}))}
                            style={{ 
                                padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.rcs ? '#0ea5e9' : '#334155', color: blastChannels.rcs ? '#fff' : '#94a3b8', 
                                opacity: channelAvailability.rcs ? (blastChannels.rcs ? 1 : 0.6) : 0.4, cursor: channelAvailability.rcs ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '6px', outline: blastChannels.rcs ? '2px solid #0284c7' : 'none'
                            }}>
                            <i className="fas fa-mobile-alt"></i> RCS
                        </button>
                        
                        <button 
                            disabled={!channelAvailability.whatsapp_app}
                            onClick={() => setBlastChannels(prev => ({...prev, whatsapp_app: !prev.whatsapp_app}))}
                            style={{ 
                                padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.whatsapp_app ? '#059669' : '#334155', color: blastChannels.whatsapp_app ? '#fff' : '#94a3b8', 
                                opacity: channelAvailability.whatsapp_app ? (blastChannels.whatsapp_app ? 1 : 0.6) : 0.4, cursor: channelAvailability.whatsapp_app ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '6px', outline: blastChannels.whatsapp_app ? '2px solid #047857' : 'none'
                            }}>
                            <i className="fas fa-comment"></i> WA App
                        </button>

                        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 8px' }}></div>

                        <button 
                            className="btn-primary"
                            onClick={handleSendBlast}
                            disabled={isBlasting || (!blastChannels.whatsapp && !blastChannels.email && !blastChannels.sms && !blastChannels.whatsapp_app)}
                            style={{ 
                                padding: '8px 24px', borderRadius: '20px', background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)', 
                                color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: (isBlasting) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(236, 72, 153, 0.4)'
                            }}
                            onMouseOver={(e) => { if(!isBlasting) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {isBlasting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            SEND
                        </button>
                    </div>
                </div>
            )}

            <ComposeEmailModal isOpen={isMailOpen} onClose={() => setIsMailOpen(false)} recipients={[lead]} initialSubject={mailSubject} initialBody={mailBody} autoAttachments={mailAttachments} />
            <SendMessageModal isOpen={isMessageOpen} onClose={() => setIsMessageOpen(false)} initialRecipients={recipients} initialTemplateId={initialTemplateId} initialChannel={initialChannel} initialProperties={selectedProperties} onSend={() => setIsMessageOpen(false)} />
            <CreateActivityModal isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} initialData={activityInitialData} onSave={() => setIsActivityOpen(false)} />
            {showQuickFill && (
                <QuickFillModal 
                    isOpen={showQuickFill} 
                    onClose={() => setShowQuickFill(false)} 
                    lead={lead} 
                    onUpdate={(u) => { setLead(u); setRefreshCount(prev => prev + 1); }} 
                    getLookupValue={getLookupValue} 
                    getLookupId={getLookupId}
                    propertyConfig={propertyConfig}
                    leadMasterFields={leadMasterFields}
                    lookups={lookups}
                />
            )}
            <AlgorithmSettingsModal isOpen={isWeightsOpen} onClose={() => setIsWeightsOpen(false)} weights={weights} onSave={(newWeights) => { setWeights(newWeights); setIsWeightsOpen(false); }} />
             {/* AI Findings Modal */}
            {aiFindings && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', width: '100%', maxWidth: '500px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', animation: 'modalSlideIn 0.3s ease-out' }}>
                        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', padding: '24px', color: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fas fa-brain" style={{ fontSize: '1.2rem' }}></i>
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>AI Requirement Insight</h2>
                                        <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9 }}>Extracted from notes & activities</p>
                                    </div>
                                </div>
                                <button onClick={() => setAiFindings(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '24px' }}>
                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-muted)' : isDark ? 'var(--text-main)' : '#334155', fontWeight: 600, fontStyle: 'italic', lineHeight: 1.5 }}>
                                    "{renderValue(aiFindings.summary)}"
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: '1px solid #f1f5f9', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Budget Suggestion</label>
                                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b' }}>
                                        ₹{(aiFindings.budgetMin / 100000).toFixed(1)}L - {(aiFindings.budgetMax / 100000).toFixed(1)}L
                                    </p>
                                </div>
                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: '1px solid #f1f5f9', padding: '12px', borderRadius: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Location Vector</label>
                                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : isDark ? 'var(--text-main)' : '#1e293b' }}>{renderValue(aiFindings.location)}</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Property Signals</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {aiFindings.propertyType?.map((t, i) => (
                                        <span key={i} style={{ padding: '4px 10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', color: '#16a34a', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #dcfce7' }}>{renderValue(t)}</span>
                                    ))}
                                </div>
                            </div>

                            {aiFindings.softSignals?.length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Soft Preferences (Nuance)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {aiFindings.softSignals.map((s, i) => (
                                            <span key={i} style={{ padding: '4px 10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff7ed', color: '#ea580c', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #ffedd5' }}>
                                                <i className="fas fa-sparkles" style={{ marginRight: '4px' }}></i> {renderValue(s)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => setAiFindings(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', color: isDark ? 'var(--text-muted)' : '#64748b', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Discard</button>
                                <button 
                                    onClick={applyAIFindings}
                                    style={{ flex: 2, padding: '14px', borderRadius: '12px', background: '#6366f1', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}
                                >
                                    Apply AI Insights
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadMatchingPage;
