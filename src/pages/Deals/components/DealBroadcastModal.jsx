import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { api, socialAPI, systemSettingsAPI } from '../../../utils/api';
import {
    whatsappTemplates as defaultWhatsappTemplates,
    smsTemplates as defaultSmsTemplates,
    rcsTemplates as defaultRcsTemplates,
    emailTemplates as defaultEmailTemplates
} from '../../../constants/templates';
import whatsappService from '../../../services/whatsappService';
import smsService from '../../../services/smsService';
import { renderValue } from '../../../utils/renderUtils';
import toast from 'react-hot-toast';
import { useUserContext } from '../../../context/UserContext';
import { useUsers } from '../../../utils/crmHooks';
import { renderWhatsAppFormattedText, composeFullWebTemplateText } from '../../../utils/whatsappFormatter';
import { resolveAllTemplateVariables, buildUniversalVariableContext, cleanProjectName, cleanSubCategory } from '../../../utils/universalVariableEngine';

export { cleanProjectName, cleanSubCategory };

const getSafeString = (val, defaultVal = '') => {
    if (val === null || val === undefined || val === '') return defaultVal;
    if (Array.isArray(val)) {
        return val.map(item => getSafeString(item, '')).filter(Boolean).join(' | ') || defaultVal;
    }
    if (typeof val === 'object') {
        return String(val.lookup_value || val.name || val.title || val.fullName || val.label || val.value || defaultVal);
    }
    return String(val);
};

const isMarketingBroadcastContext = (tpl) => {
    if (!tpl) return false;
    const ctx = tpl.systemContext || tpl.context || tpl.ctx;
    if (Array.isArray(ctx)) return ctx.includes('marketing_broadcast');
    if (typeof ctx === 'string') return ctx === 'marketing_broadcast';
    return false;
};

/**
 * Enterprise Omnichannel Template Variable Interpolator
 * Replaces lead/deal/portfolio placeholders into template text or HTML across WhatsApp, SMS, RCS, and Email
 * Powered by Universal Variable Engine with 100% dictionary coverage.
 */
function interpolateTemplateString(rawText, { isMultiDeal, singleMeta, singleDeal, selectedDeals, isHtml = false, recipient = null, currentUser = null, users = [] }) {
    if (!rawText || typeof rawText !== 'string') return '';
    return resolveAllTemplateVariables(rawText, {
        deal: singleDeal,
        singleDeal,
        singleMeta,
        selectedDeals,
        isMultiDeal,
        isHtml,
        recipient,
        currentUser,
        users
    });
}


function interpolateWebTemplateText(template, ctx) {
    if (!template) return '';
    const text = composeFullWebTemplateText(template);
    if (!text) return '';
    return interpolateTemplateString(text, ctx);
}


function DealBroadcastModal({ isOpen, onClose, selectedDeals = [], dealIds = [], onSuccess }) {
    const { isDark } = useTheme();
    const { currentUser } = useUserContext();
    const { data: users = [] } = useUsers();
    const [loading, setLoading] = useState(true);
    const [sanitizing, setSanitizing] = useState(false);
    const [activeTab, setActiveTab] = useState('matched_leads'); // 'matched_leads' | 'broker' | 'contact' | 'wa_group'
    const [groups, setGroups] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [selectedContactGroups, setSelectedContactGroups] = useState([]);

    // Matched Leads State (Enterprise Deal-to-Lead Matching Engine)
    const [matchedLeads, setMatchedLeads] = useState([]);
    const [loadingMatchedLeads, setLoadingMatchedLeads] = useState(false);
    const [selectedMatchedLeads, setSelectedMatchedLeads] = useState([]);
    const [matchedLeadFilter, setMatchedLeadFilter] = useState('all'); // 'all' | 'preferred'
    const [matchedLeadSearch, setMatchedLeadSearch] = useState('');

    const [channels, setChannels] = useState({ whatsapp: true, sms: false, rcs: false, email: false });
    const [previewChannel, setPreviewChannel] = useState('whatsapp'); // 'whatsapp' | 'sms' | 'rcs' | 'email'
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const [sending, setSending] = useState(false);

    // 1. WhatsApp Templates State
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [allWhatsAppTemplates, setAllWhatsAppTemplates] = useState([]);
    const [selectedWebTemplateId, setSelectedWebTemplateId] = useState('');
    const [registry, setRegistry] = useState({});

    // 2. SMS Templates State
    const [allSmsTemplates, setAllSmsTemplates] = useState([]);
    const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState('');

    // 3. RCS Templates State
    const [allRcsTemplates, setAllRcsTemplates] = useState([]);
    const [selectedRcsTemplateId, setSelectedRcsTemplateId] = useState('');

    // 4. Email Templates State
    const [allEmailTemplates, setAllEmailTemplates] = useState([]);
    const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState('');

    // Multi-WhatsApp & Group Broadcast State
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [waGroups, setWaGroups] = useState([]);
    const [selectedWaGroups, setSelectedWaGroups] = useState([]);
    const [loadingWaGroups, setLoadingWaGroups] = useState(false);
    const [waGroupSearch, setWaGroupSearch] = useState('');

    // Local state for deal details & sanitization metadata
    const [dealsMeta, setDealsMeta] = useState({});

    const isMultiDeal = selectedDeals.length > 1;

    const selectedAccount = useMemo(() => {
        return accounts.find(a => (a.id || a._id) === selectedAccountId) || accounts[0] || null;
    }, [accounts, selectedAccountId]);

    const isBaileys = selectedAccount?.provider === 'BAILEYS';

    // Smart Channel Toggle Handler: syncs previewChannel with selected omnichannel
    const handleToggleChannel = (channelKey, isChecked) => {
        const updated = { ...channels, [channelKey]: isChecked };
        setChannels(updated);
        if (isChecked) {
            setPreviewChannel(channelKey);
        } else if (previewChannel === channelKey) {
            const firstActive = ['whatsapp', 'sms', 'rcs', 'email'].find(k => updated[k]);
            if (firstActive) setPreviewChannel(firstActive);
        }
    };

    const loadBaileysGroups = useCallback(async (accId) => {
        if (!accId) return;
        setLoadingWaGroups(true);
        try {
            const res = await socialAPI.getBaileysGroups(accId);
            if (res && res.success) {
                setWaGroups(res.data || []);
            }
        } catch (e) {
            console.warn('[DealBroadcastModal] Failed to load WhatsApp groups:', e.message);
        } finally {
            setLoadingWaGroups(false);
        }
    }, []);

    // Fetch Matched Leads across all selected deals (Deduplicated & Scored)
    const loadMatchedLeadsForDeals = useCallback(async (targetIds) => {
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            setMatchedLeads([]);
            return;
        }
        setLoadingMatchedLeads(true);
        try {
            const results = await Promise.all(
                targetIds.slice(0, 10).map(id =>
                    api.get('/leads/match', {
                        params: { dealId: id, budgetFlexibility: 20, sizeFlexibility: 20, showOtherCities: false }
                    }).catch(() => ({ data: { matchingLeads: [] } }))
                )
            );

            const consolidatedMap = new Map();
            results.forEach((res, idx) => {
                const dealObj = selectedDeals[idx] || {};
                const dealCode = getSafeString(dealObj.dealCode || dealObj.title || dealObj.projectName, `Deal #${idx + 1}`);
                const list = res.data?.matchingLeads || [];
                list.forEach(lead => {
                    const lid = String(lead._id);
                    if (!consolidatedMap.has(lid)) {
                        consolidatedMap.set(lid, {
                            ...lead,
                            matchedDealsCount: 1,
                            matchedDealCodes: [dealCode]
                        });
                    } else {
                        const existing = consolidatedMap.get(lid);
                        existing.matchedDealsCount += 1;
                        if (!existing.matchedDealCodes.includes(dealCode)) {
                            existing.matchedDealCodes.push(dealCode);
                        }
                        if ((lead.score || 0) > (existing.score || 0)) {
                            existing.score = lead.score;
                            existing.matchDetails = lead.matchDetails;
                        }
                        if (lead.isPreferredMatch) {
                            existing.isPreferredMatch = true;
                        }
                    }
                });
            });

            const sortedLeads = Array.from(consolidatedMap.values()).sort((a, b) => {
                if (Boolean(b.isPreferredMatch) !== Boolean(a.isPreferredMatch)) {
                    return b.isPreferredMatch ? 1 : -1;
                }
                return (b.score || 0) - (a.score || 0);
            });

            setMatchedLeads(sortedLeads);
        } catch (err) {
            console.warn('[DealBroadcastModal] Failed to load matched leads:', err.message);
        } finally {
            setLoadingMatchedLeads(false);
        }
    }, [selectedDeals]);

    // Load initial data whenever modal opens
    useEffect(() => {
        if (!isOpen) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const [
                    groupsRes,
                    contactGroupsRes,
                    templatesRes,
                    registryRes,
                    accountsRes,
                    localWaTemplatesRes,
                    smsGatewayTemplatesRes,
                    localSmsTemplatesRes,
                    localRcsTemplatesRes,
                    localEmailTemplatesRes
                ] = await Promise.all([
                    api.get('/company-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    api.get('/contact-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    api.get('/marketing/whatsapp/templates', { _silentError: true }).catch(() => ({ data: { templates: [] } })),
                    api.get('/marketing/whatsapp/variable-registry', { _silentError: true }).catch(() => ({ data: { success: true, data: { "1": "customer_name", "2": "property_list_default" } } })),
                    whatsappService.getAccounts().catch(() => ({ data: [] })),
                    systemSettingsAPI.getByKey('crm_whatsapp_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    smsService.getTemplates().catch(() => ({ data: [] })),
                    systemSettingsAPI.getByKey('crm_sms_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    systemSettingsAPI.getByKey('crm_rcs_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    systemSettingsAPI.getByKey('crm_email_templates', { _silentError: true }).catch(() => ({ data: { value: [] } }))
                ]);

                setGroups(groupsRes.data?.data || []);
                setContactGroups(contactGroupsRes.data?.data || []);
                loadMatchedLeadsForDeals(dealIds);

                const approved = (templatesRes.data?.templates || []).filter(t => t.status === 'APPROVED');
                setTemplates(approved);
                if (approved.length > 0 && !selectedTemplate) {
                    setSelectedTemplate(approved[0]);
                }

                // 1. Merge WhatsApp Web / Local templates
                const dbWaList = localWaTemplatesRes.data?.value || [];
                const mergedWa = [...defaultWhatsappTemplates];
                if (Array.isArray(dbWaList)) {
                    dbWaList.forEach(dbTpl => {
                        const idx = mergedWa.findIndex(t => (dbTpl.id && String(t.id) === String(dbTpl.id)) || (dbTpl.name && t.name === dbTpl.name));
                        if (idx >= 0) mergedWa[idx] = { ...mergedWa[idx], ...dbTpl };
                        else mergedWa.push(dbTpl);
                    });
                }
                setAllWhatsAppTemplates(mergedWa);

                // 2. Merge SMS Templates (Gateway DB + System Settings + Defaults)
                const mergedSms = [...defaultSmsTemplates];
                const gatewaySmsList = Array.isArray(smsGatewayTemplatesRes?.data) ? smsGatewayTemplatesRes.data : [];
                const settingsSmsList = Array.isArray(localSmsTemplatesRes.data?.value) ? localSmsTemplatesRes.data.value : [];
                [...gatewaySmsList, ...settingsSmsList].forEach(dbTpl => {
                    const tplId = dbTpl._id || dbTpl.id;
                    const normalized = { ...dbTpl, id: tplId || dbTpl.name, body: dbTpl.body || dbTpl.content || '' };
                    const idx = mergedSms.findIndex(t => (tplId && String(t.id) === String(tplId)) || (dbTpl.name && t.name === dbTpl.name));
                    if (idx >= 0) mergedSms[idx] = { ...mergedSms[idx], ...normalized };
                    else mergedSms.push(normalized);
                });
                setAllSmsTemplates(mergedSms);

                // 3. Merge RCS Templates (System Settings + Defaults)
                const mergedRcs = [...defaultRcsTemplates];
                const dbRcsList = Array.isArray(localRcsTemplatesRes.data?.value) ? localRcsTemplatesRes.data.value : [];
                dbRcsList.forEach(dbTpl => {
                    const tplId = dbTpl._id || dbTpl.id;
                    const normalized = { ...dbTpl, id: tplId || dbTpl.name, body: dbTpl.body || dbTpl.content || '' };
                    const idx = mergedRcs.findIndex(t => (tplId && String(t.id) === String(tplId)) || (dbTpl.name && t.name === dbTpl.name));
                    if (idx >= 0) mergedRcs[idx] = { ...mergedRcs[idx], ...normalized };
                    else mergedRcs.push(normalized);
                });
                setAllRcsTemplates(mergedRcs);

                // 4. Merge Email Templates (System Settings + Defaults)
                const mergedEmail = [...defaultEmailTemplates];
                const dbEmailList = Array.isArray(localEmailTemplatesRes.data?.value) ? localEmailTemplatesRes.data.value : [];
                dbEmailList.forEach(dbTpl => {
                    const tplId = dbTpl._id || dbTpl.id;
                    const normalized = { ...dbTpl, id: tplId || dbTpl.name, content: dbTpl.content || dbTpl.body || '' };
                    const idx = mergedEmail.findIndex(t => (tplId && String(t.id) === String(tplId)) || (dbTpl.name && t.name === dbTpl.name));
                    if (idx >= 0) mergedEmail[idx] = { ...mergedEmail[idx], ...normalized };
                    else mergedEmail.push(normalized);
                });
                setAllEmailTemplates(mergedEmail);

                setRegistry(registryRes.data?.data || {});

                const rawAccounts = accountsRes.data || [];
                setAccounts(rawAccounts);
                const defaultOrFirst = rawAccounts.find(a => a.isDefault && a.status === 'ACTIVE') || rawAccounts.find(a => a.status === 'ACTIVE') || rawAccounts[0];
                if (defaultOrFirst) {
                    const accId = defaultOrFirst.id || defaultOrFirst._id;
                    setSelectedAccountId(accId);
                    if (defaultOrFirst.provider === 'BAILEYS') {
                        loadBaileysGroups(accId);
                    }
                }

                // Initialize deals metadata from selectedDeals
                const metaMap = {};
                selectedDeals.forEach(d => {
                    if (d.broadcastMetadata) {
                        metaMap[d._id] = d.broadcastMetadata;
                    }
                });
                setDealsMeta(metaMap);

            } catch (err) {
                console.error("[DealBroadcastModal] Error fetching broadcast resources:", err);
                toast.error("Could not load broadcast resources");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, loadBaileysGroups]);

    // Handle single or bulk sanitization
    const handleSanitize = async (specificDealId = null) => {
        setSanitizing(true);
        const targetIds = specificDealId ? [specificDealId] : dealIds;
        try {
            const results = await Promise.all(
                targetIds.map(id => api.post(`/deals/${id}/sanitize`))
            );

            const updated = { ...dealsMeta };
            results.forEach((res, index) => {
                const id = targetIds[index];
                if (res.data?.success && res.data?.data) {
                    updated[id] = res.data.data;
                }
            });
            setDealsMeta(updated);
            toast.success(targetIds.length > 1 ? `Prepared ${targetIds.length} deals for broadcast!` : "Deal metadata prepared!");
        } catch (error) {
            console.error("[DealBroadcastModal] Sanitization error:", error);
            toast.error(error.response?.data?.error || "Failed to prepare deal metadata");
        } finally {
            setSanitizing(false);
        }
    };

    // Auto-hydrate single deal from server to ensure 100% database specifications fidelity
    const [hydratedSingleDeal, setHydratedSingleDeal] = useState(null);

    useEffect(() => {
        if (!isOpen || !selectedDeals || selectedDeals.length === 0) {
            setHydratedSingleDeal(null);
            return;
        }
        const initial = selectedDeals[0];
        setHydratedSingleDeal(initial);

        if (selectedDeals.length === 1 && initial?._id) {
            api.get(`/deals/${initial._id}`).then(res => {
                const full = res.data?.data || res.data?.deal || res.data;
                if (full && full._id) {
                    setHydratedSingleDeal(full);
                }
            }).catch(err => {
                console.warn('[DealBroadcastModal] Could not hydrate deal details:', err);
            });
        }
    }, [isOpen, selectedDeals?.[0]?._id]);

    // Primary deal metadata for single-deal mode (using live hydrated deal when available)
    const singleDeal = hydratedSingleDeal || selectedDeals[0] || null;
    const singleMeta = singleDeal ? (dealsMeta[singleDeal._id] || singleDeal.broadcastMetadata) : null;
    const isSingleReady = Boolean(singleMeta?.isReady);

    // Multi-deal metadata consolidation
    const allDealsReady = useMemo(() => {
        if (!isMultiDeal) return isSingleReady;
        return selectedDeals.every(d => Boolean(dealsMeta[d._id]?.isReady || d.broadcastMetadata?.isReady));
    }, [isMultiDeal, isSingleReady, selectedDeals, dealsMeta]);

    // Live preview for WhatsApp Web direct text
    const richPreviewText = useMemo(() => {
        if (!isMultiDeal) {
            const meta = singleMeta;
            if (!meta) {
                const price = singleDeal?.price ? `₹ ${Number(singleDeal.price).toLocaleString('en-IN')}` : 'Price on Request';
                const pTitle = getSafeString(singleDeal?.title || singleDeal?.projectName, 'Exclusive Deal');
                const pLoc = getSafeString(singleDeal?.location, 'Kurukshetra');
                const pSpecs = getSafeString(singleDeal?.unitType, 'Prime Unit');
                const pRemarks = getSafeString(singleDeal?.remarks, 'Direct verified property listing');
                const pRef = getSafeString(singleDeal?.dealCode, singleDeal?._id?.substring(0, 8).toUpperCase() || 'DEAL-REF');
                return `🏢 *BNA ALERT: ${pTitle}*\n\n` +
                    `Hi [Recipient / Group],\n\n` +
                    `💰 *Price:* ${price}\n` +
                    `📍 *Location:* ${pLoc}\n` +
                    `📐 *Specs:* ${pSpecs}\n\n` +
                    `📝 *Details:* ${pRemarks}\n\n` +
                    `🔗 Ref: ${pRef}\n` +
                    `Contact us for commission split and site visits.`;
            }

            let preview = `🏢 *BNA ALERT: ${getSafeString(meta.title, 'Featured Deal')}*\n\n` +
                `Hi [Recipient / Group],\n\n` +
                `💰 *Price:* ${getSafeString(meta.price, 'Price on Request')}\n` +
                `📍 *Location:* ${getSafeString(meta.location, 'Kurukshetra')}\n` +
                `📐 *Specs:* ${getSafeString(meta.features, 'N/A')}\n\n`;

            if (meta.detailedSections && Array.isArray(meta.detailedSections)) {
                meta.detailedSections.forEach(sec => {
                    preview += `*${getSafeString(sec.title, 'DETAILS').toUpperCase()}*\n`;
                    (sec.lines || []).forEach(l => { preview += `• ${getSafeString(l)}\n`; });
                    preview += `\n`;
                });
            }

            const pRef = getSafeString(singleDeal?.dealCode, singleDeal?._id?.substring(0, 8).toUpperCase() || 'DEAL-REF');
            preview += `📝 *Details:* ${getSafeString(meta.description || singleDeal?.remarks, 'Verified property listing')}\n\n` +
                `🔗 Ref: ${pRef}\n` +
                `Contact us for commission split and site visits.`;
            return preview;
        }

        // Multi-Deal Portfolio Preview
        let preview = `🏢 *PORTFOLIO BNA ALERT: ${selectedDeals.length} Exclusive Listings*\n\n` +
            `Hi [Recipient / Group],\n\n` +
            `Here is our exclusive curated portfolio of *${selectedDeals.length} prime verified investment deals*:\n\n`;

        selectedDeals.forEach((deal, idx) => {
            const m = dealsMeta[deal._id] || deal.broadcastMetadata;
            const title = getSafeString(m?.title || deal.title || deal.projectName, `Deal #${idx + 1}`);
            const price = getSafeString(m?.price, deal.price ? `₹ ${Number(deal.price).toLocaleString('en-IN')}` : 'Price on Request');
            const location = getSafeString(m?.location || deal.location, 'Kurukshetra');
            const rawSpecs = getSafeString(deal.unitType, deal.size ? `${getSafeString(deal.size)} ${getSafeString(deal.sizeUnit, 'Sq.Ft')}` : '');
            const specs = getSafeString(m?.features, rawSpecs);

            preview += `${idx + 1}️⃣ *${title}*\n` +
                `💰 Price: ${price} | 📍 ${location}${specs ? ` | 📐 ${specs}` : ''}\n\n`;
        });

        const refs = selectedDeals.map(d => getSafeString(d.shareableId || d.dealCode, d._id?.slice(-4).toUpperCase())).join(', ');
        preview += `🔗 *Deal References:* ${refs}\n` +
            `Contact us for full dossiers, commission splits, and site visit arrangements.`;

        return preview;
    }, [isMultiDeal, singleMeta, singleDeal, selectedDeals, dealsMeta]);

    // Live preview for Meta template
    const templatePreviewText = useMemo(() => {
        if (!selectedTemplate) return null;
        const body = selectedTemplate.components?.find(c => c.type === 'BODY');
        if (!body) return null;

        const targetLead = matchedLeads.find(l => selectedMatchedLeads.includes(l._id || l.id)) || matchedLeads[0];
        const recipientName = targetLead?.name || targetLead?.fullName || '[Broker / Contact Name]';
        const recipientFirstName = targetLead?.firstName || (recipientName !== '[Broker / Contact Name]' ? recipientName.split(' ')[0] : recipientName);

        const meta = singleMeta || {
            title: getSafeString(singleDeal?.title || singleDeal?.projectName, 'Project'),
            location: getSafeString(singleDeal?.location, 'Kurukshetra'),
            price: singleDeal?.price ? `₹ ${Number(singleDeal.price).toLocaleString('en-IN')}` : 'Price on Request',
            features: [getSafeString(singleDeal?.unitType, 'Prime Unit')],
            description: getSafeString(singleDeal?.remarks, 'Verified property listing')
        };

        // Resolve assigned employee / user
        let assignedUser = null;
        if (singleDeal?.assignedTo && typeof singleDeal.assignedTo === 'object') {
            assignedUser = singleDeal.assignedTo;
        } else if (singleDeal?.assignedTo && Array.isArray(users) && users.length > 0) {
            assignedUser = users.find(u => String(u._id || u.id) === String(singleDeal.assignedTo));
        }
        if (!assignedUser) {
            assignedUser = currentUser;
        }

        const employeeName = getSafeString(
            assignedUser?.name ||
            (assignedUser?.firstName ? `${assignedUser.firstName} ${assignedUser.lastName || ''}`.trim() : '') ||
            currentUser?.name ||
            (currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim() : ''),
            'Bharat Properties'
        );

        const employeeMobile = getSafeString(
            assignedUser?.mobile ||
            assignedUser?.phone ||
            assignedUser?.phoneNumber ||
            currentUser?.mobile ||
            currentUser?.phone ||
            currentUser?.phoneNumber,
            '+91 9991333570'
        );

        const employeeEmail = getSafeString(
            assignedUser?.email ||
            currentUser?.email,
            'deals@bharatproperties.co'
        );

        const assignedTeam = getSafeString(
            singleDeal?.team ||
            assignedUser?.team ||
            currentUser?.team,
            'Sales Team'
        );

        const assignedVisibility = getSafeString(
            singleDeal?.visibleTo ||
            singleDeal?.visibility ||
            'Everyone',
            'Everyone'
        );

        const spec = (singleDeal?.unitSpecification && typeof singleDeal.unitSpecification === 'object') ? singleDeal.unitSpecification : {};
        const inv = (singleDeal?.inventoryId && typeof singleDeal.inventoryId === 'object') ? singleDeal.inventoryId : {};
        const invSpec = (inv?.unitSpecification && typeof inv.unitSpecification === 'object') ? inv.unitSpecification : {};

        const dealDirection = getSafeString(singleDeal?.direction || spec.direction || inv.direction || invSpec.direction || inv.orientation || spec.orientation, '');
        const dealRoadWidth = getSafeString(singleDeal?.roadWidth || spec.roadWidth || inv.roadWidth || invSpec.roadWidth, '');
        const dealFacing = getSafeString(singleDeal?.facing || spec.facing || inv.facing || invSpec.facing, '');
        const dealBuiltupType = getSafeString(singleDeal?.builtupType || spec.builtupType || inv.builtupType || invSpec.builtupType, '');
        const rawSubCategory = getSafeString(singleDeal?.subCategory || spec.subCategory || inv.subCategory || invSpec.subCategory || singleDeal?.propertyType, '');
        const dealSubCategory = cleanSubCategory(rawSubCategory) || '';
        const dealCategory = getSafeString(singleDeal?.category || spec.category || inv.category || invSpec.category || singleDeal?.propertyType, '');
        const dealUnitNo = getSafeString(singleDeal?.unitNo || singleDeal?.unitNumber || inv.unitNumber || inv.unitNo, '');
        const dealBlock = getSafeString(singleDeal?.block || inv.block, '');
        const dealIntent = getSafeString(singleDeal?.intent || singleDeal?.primaryDealIntent || inv?.intent || spec?.intent || targetLead?.intent, 'Sell');
        const dealTransactionType = getSafeString(singleDeal?.transactionType || singleDeal?.transaction_type || singleDeal?.dealType || inv?.transactionType || spec?.transactionType, 'Full White');

        const metaVarLookup = {
            employeename: employeeName,
            employeemobile: employeeMobile,
            employeeemail: employeeEmail,
            agentname: employeeName,
            agentmobile: employeeMobile,
            agentphone: employeeMobile,
            agentemail: employeeEmail,
            team: assignedTeam,
            teamname: assignedTeam,
            assignedto: employeeName,
            assigneduser: employeeName,
            visibleto: assignedVisibility,
            visibility: assignedVisibility,
            customername: recipientName,
            firstname: recipientFirstName,
            fullname: recipientName,
            name: recipientName,
            projectName: getSafeString(meta.title, ''),
            projectname: getSafeString(meta.title, ''),
            title: getSafeString(meta.title, ''),
            location: getSafeString(meta.location, ''),
            price: getSafeString(meta.price, ''),
            description: getSafeString(meta.description, ''),
            companyname: 'Bharat Properties',
            direction: dealDirection,
            propertydirection: dealDirection,
            property_direction: dealDirection,
            roadwidth: dealRoadWidth,
            roadWidth: dealRoadWidth,
            road_width: dealRoadWidth,
            road: dealRoadWidth,
            facing: dealFacing,
            propertyfacing: dealFacing,
            property_facing: dealFacing,
            builtuptype: dealBuiltupType,
            builtupType: dealBuiltupType,
            builtup_type: dealBuiltupType,
            subcategory: dealSubCategory,
            subCategory: dealSubCategory,
            category: dealCategory,
            property_category: dealCategory,
            unitno: dealUnitNo,
            unitnumber: dealUnitNo,
            unit_no: dealUnitNo,
            block: dealBlock,
            intent: dealIntent,
            deal_intent: dealIntent,
            primaryDealIntent: dealIntent,
            dealIntent: dealIntent,
            transactiontype: dealTransactionType,
            transaction_type: dealTransactionType,
            transactionType: dealTransactionType,
            dealtype: dealTransactionType,
            deal_type: dealTransactionType
        };

        const resolveSource = (source, idx) => {
            switch (source) {
                case 'intent':
                case 'deal_intent':
                case 'dealIntent':
                case 'primaryDealIntent':
                    return dealIntent;
                case 'transactionType':
                case 'transaction_type':
                case 'transactiontype':
                case 'dealType':
                case 'deal_type':
                    return dealTransactionType;
                case 'customer_name': return recipientName;
                case 'first_name': return recipientFirstName;
                case 'property_list_default':
                case 'matchListDefault':
                    if (isMultiDeal) {
                        return selectedDeals.slice(0, 3).map((d, i) => `${i + 1}️⃣ 🏢 ${getSafeString(d.projectName || d.title, 'Deal')} | 💰 ₹${d.price ? Number(d.price).toLocaleString('en-IN') : 'P.O.R'}`).join('  |  ');
                    }
                    return `1️⃣ 🏢 ${getSafeString(meta.title, 'Project')} | 📐 ${getSafeString(meta.features?.[0], 'Size')} | 💰 ${getSafeString(meta.price, 'Price')}`;
                case 'property_list_dtl':
                case 'matchListDetailed':
                    return `1️⃣ 🏢 ${getSafeString(meta.title, 'Project')}\n📍 ${getSafeString(meta.location, 'Kurukshetra')}\n💰 ${getSafeString(meta.price, 'Price')}\n📐 ${getSafeString(meta.features?.[0], 'Size')}\n📝 ${getSafeString(meta.description, '')}`;
                case 'projectName': return getSafeString(meta.title, '');
                case 'location': return getSafeString(meta.location, '');
                case 'price': return getSafeString(meta.price, '');
                case 'description': return getSafeString(meta.description, '');
                case 'direction':
                case 'property_direction':
                case 'propertyDirection':
                    return dealDirection;
                case 'roadWidth':
                case 'roadwidth':
                case 'road_width':
                case 'road':
                    return dealRoadWidth;
                case 'facing':
                case 'property_facing':
                case 'propertyFacing':
                    return dealFacing;
                case 'builtupType':
                case 'builtuptype':
                case 'builtup_type':
                    return dealBuiltupType;
                case 'subCategory':
                case 'subcategory':
                case 'sub_category':
                    return dealSubCategory;
                case 'category':
                case 'property_category':
                    return dealCategory;
                case 'agentMobile':
                case 'agent_mobile':
                case 'EmployeeMobile':
                case 'employeemobile':
                case 'employee_mobile':
                case 'employeeMobile':
                    return employeeMobile;
                case 'agent_name':
                case 'agentName':
                case 'agentname':
                case 'EmployeeName':
                case 'employeename':
                case 'employee_name':
                case 'employeeName':
                    return employeeName;
                case 'agent_email':
                case 'agentEmail':
                case 'EmployeeEmail':
                case 'employeemail':
                case 'employee_email':
                case 'employeeEmail':
                    return employeeEmail;
                case 'team':
                case 'team_name':
                case 'teamName':
                    return assignedTeam;
                case 'assignedTo':
                case 'assignedto':
                case 'assigned_to':
                    return employeeName;
                case 'visibleTo':
                case 'visibleto':
                case 'visible_to':
                    return assignedVisibility;
                default:
                    if (idx === '1') return recipientFirstName || recipientName;
                    if (idx === '2') return resolveSource('property_list_default', idx);
                    if (idx === '3') return getSafeString(meta.price, 'Price on Request');
                    if (idx === '4') return getSafeString(meta.location, 'Kurukshetra');
                    if (idx === '5') return getSafeString(meta.features?.[0], dealFullSpecs || '');
                    if (idx === '6') return employeeName || 'Bharat Properties';
                    if (idx === '7') return employeeMobile || '+91 9991333570';
                    const cleanKey = String(source || idx).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (metaVarLookup[cleanKey] !== undefined) {
                        return getSafeString(metaVarLookup[cleanKey], '');
                    }
                    return source ? `[${getSafeString(source)}]` : '-';
            }
        };

        let preview = body.text || '';
        preview = preview.replace(/{{([^}]+)}}/g, (match, rawKey) => {
            const clean = rawKey.trim();
            if (/^\d+$/.test(clean)) {
                const config = registry[clean];
                const source = typeof config === 'object' ? config.source : config;
                return resolveSource(source, clean);
            }
            const res = resolveSource(clean, clean);
            if (res && res !== `[${clean}]` && res !== '-') return res;
            const lookupClean = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (metaVarLookup[lookupClean] !== undefined) {
                return getSafeString(metaVarLookup[lookupClean], '');
            }
            return res || match;
        });

        return preview;
    }, [selectedTemplate, singleMeta, singleDeal, isMultiDeal, selectedDeals, registry, matchedLeads, selectedMatchedLeads, currentUser, users]);

    // ── Channel Template Groupings (Broadcast Tagged vs Other) ──────────────
    const webBroadcastTemplates = useMemo(() => allWhatsAppTemplates.filter(isMarketingBroadcastContext), [allWhatsAppTemplates]);
    const otherWebTemplates = useMemo(() => allWhatsAppTemplates.filter(t => !isMarketingBroadcastContext(t)), [allWhatsAppTemplates]);

    const smsBroadcastTemplates = useMemo(() => allSmsTemplates.filter(isMarketingBroadcastContext), [allSmsTemplates]);
    const otherSmsTemplates = useMemo(() => allSmsTemplates.filter(t => !isMarketingBroadcastContext(t)), [allSmsTemplates]);

    const rcsBroadcastTemplates = useMemo(() => allRcsTemplates.filter(isMarketingBroadcastContext), [allRcsTemplates]);
    const otherRcsTemplates = useMemo(() => allRcsTemplates.filter(t => !isMarketingBroadcastContext(t)), [allRcsTemplates]);

    const emailBroadcastTemplates = useMemo(() => allEmailTemplates.filter(isMarketingBroadcastContext), [allEmailTemplates]);
    const otherEmailTemplates = useMemo(() => allEmailTemplates.filter(t => !isMarketingBroadcastContext(t)), [allEmailTemplates]);

    // ── Selected Templates per Channel ──────────────────────────────────────
    const selectedWebTemplate = useMemo(() => {
        if (!selectedWebTemplateId) return null;
        return allWhatsAppTemplates.find(t => String(t.id) === String(selectedWebTemplateId) || t.name === selectedWebTemplateId) || null;
    }, [allWhatsAppTemplates, selectedWebTemplateId]);

    const selectedSmsTemplate = useMemo(() => {
        if (!selectedSmsTemplateId) return null;
        return allSmsTemplates.find(t => String(t.id) === String(selectedSmsTemplateId) || t.name === selectedSmsTemplateId) || null;
    }, [allSmsTemplates, selectedSmsTemplateId]);

    const selectedRcsTemplate = useMemo(() => {
        if (!selectedRcsTemplateId) return null;
        return allRcsTemplates.find(t => String(t.id) === String(selectedRcsTemplateId) || t.name === selectedRcsTemplateId) || null;
    }, [allRcsTemplates, selectedRcsTemplateId]);

    const selectedEmailTemplate = useMemo(() => {
        if (!selectedEmailTemplateId) return null;
        return allEmailTemplates.find(t => String(t.id) === String(selectedEmailTemplateId) || t.name === selectedEmailTemplateId) || null;
    }, [allEmailTemplates, selectedEmailTemplateId]);

    // ── Live Previews per Channel ───────────────────────────────────────────
    const webTemplatePreviewText = useMemo(() => {
        if (!selectedWebTemplate) return null;
        const targetLead = matchedLeads.find(l => selectedMatchedLeads.includes(l._id || l.id)) || matchedLeads[0];
        return interpolateWebTemplateText(selectedWebTemplate, {
            isMultiDeal,
            singleMeta,
            singleDeal,
            selectedDeals,
            recipient: targetLead,
            currentUser,
            users
        });
    }, [selectedWebTemplate, isMultiDeal, singleMeta, singleDeal, selectedDeals, matchedLeads, selectedMatchedLeads, currentUser, users]);

    const activeWhatsAppPreview = useMemo(() => {
        if (isBaileys) {
            return selectedWebTemplate ? (webTemplatePreviewText || richPreviewText) : richPreviewText;
        }
        return templatePreviewText || richPreviewText;
    }, [isBaileys, selectedWebTemplate, webTemplatePreviewText, richPreviewText, templatePreviewText]);

    const defaultSmsPreviewText = useMemo(() => {
        if (isMultiDeal) {
            return `[BHARAT PROPERTIES] Curated Portfolio: ${selectedDeals.length} Verified Deals in Kurukshetra. Starting at ₹${selectedDeals[0]?.price ? Number(selectedDeals[0].price).toLocaleString('en-IN') : 'P.O.R'}. Ref: ${selectedDeals.map(d => getSafeString(d.dealCode, d._id?.slice(-4).toUpperCase())).join(', ')}. Call 8700000000 to lock.`;
        }
        const meta = singleMeta;
        const title = getSafeString(meta?.title || singleDeal?.title || singleDeal?.projectName, 'Prime Deal');
        const loc = getSafeString(meta?.location || singleDeal?.location, 'Kurukshetra');
        const price = getSafeString(meta?.price, singleDeal?.price ? `₹ ${Number(singleDeal.price).toLocaleString('en-IN')}` : 'P.O.R');
        const ref = getSafeString(singleDeal?.dealCode, singleDeal?._id?.slice(-6).toUpperCase() || 'DEAL-REF');
        return `[BHARAT PROPERTIES] Verified Deal: ${title} at ${loc}. Price: ${price}. Ref: ${ref}. Inspection ready. Call 8700000000 for brochure & booking.`;
    }, [isMultiDeal, selectedDeals, singleMeta, singleDeal]);

    const smsPreviewText = useMemo(() => {
        if (selectedSmsTemplate) {
            return interpolateWebTemplateText(selectedSmsTemplate, {
                isMultiDeal,
                singleMeta,
                singleDeal,
                selectedDeals,
                currentUser,
                users
            }) || defaultSmsPreviewText;
        }
        return defaultSmsPreviewText;
    }, [selectedSmsTemplate, isMultiDeal, singleMeta, singleDeal, selectedDeals, defaultSmsPreviewText, currentUser, users]);

    const rcsPreviewData = useMemo(() => {
        const title = isMultiDeal ? `${selectedDeals.length} Curated Investment Deals Portfolio` : getSafeString(singleMeta?.title || singleDeal?.title || singleDeal?.projectName, 'Featured Property Deal');
        const loc = isMultiDeal ? [...new Set(selectedDeals.map(d => getSafeString(d.location, 'Kurukshetra')))].join(', ') : getSafeString(singleMeta?.location || singleDeal?.location, 'Kurukshetra');
        const price = isMultiDeal ? `${selectedDeals.length} Properties Portfolio` : getSafeString(singleMeta?.price, singleDeal?.price ? `₹ ${Number(singleDeal.price).toLocaleString('en-IN')}` : 'Price on Request');
        const specs = isMultiDeal ? `${selectedDeals.length} Verified Deals • Commercial & Residential` : getSafeString(singleMeta?.features || singleDeal?.unitType, 'Prime Specification');
        const defaultDesc = isMultiDeal
            ? `Exclusive vetted portfolio featuring ${selectedDeals.length} high-ROI listings. Direct brokerage split and instant dossier access.`
            : getSafeString(singleMeta?.description || singleDeal?.remarks, 'Prime location property with high capital appreciation potential and clear title.');
        const desc = selectedRcsTemplate
            ? interpolateWebTemplateText(selectedRcsTemplate, { isMultiDeal, singleMeta, singleDeal, selectedDeals, currentUser, users })
            : defaultDesc;
        const ref = isMultiDeal ? selectedDeals.map(d => getSafeString(d.dealCode, d._id?.slice(-4).toUpperCase())).join(', ') : getSafeString(singleDeal?.dealCode, singleDeal?._id?.substring(0, 8).toUpperCase() || 'DEAL-REF');
        const buttons = Array.isArray(selectedRcsTemplate?.buttons) && selectedRcsTemplate.buttons.length > 0
            ? selectedRcsTemplate.buttons.map(btn => ({
                ...btn,
                text: interpolateTemplateString(getSafeString(btn.text, 'Action'), { isMultiDeal, singleMeta, singleDeal, selectedDeals, currentUser, users })
            }))
            : null;
        return { title, loc, price, specs, desc, ref, buttons, templateName: getSafeString(selectedRcsTemplate?.name, '') || null };
    }, [isMultiDeal, selectedDeals, singleMeta, singleDeal, selectedRcsTemplate, currentUser, users]);

    const emailPreviewData = useMemo(() => {
        const title = isMultiDeal ? `Exclusive Portfolio: ${selectedDeals.length} Curated Investment Opportunities` : getSafeString(singleMeta?.title || singleDeal?.title || singleDeal?.projectName, 'Exclusive Verified Deal');
        const loc = isMultiDeal ? 'Multiple Premium Sectors, Kurukshetra' : getSafeString(singleMeta?.location || singleDeal?.location, 'Kurukshetra');
        const price = isMultiDeal ? `Curated Portfolio (${selectedDeals.length} Deals)` : getSafeString(singleMeta?.price, singleDeal?.price ? `₹ ${Number(singleDeal.price).toLocaleString('en-IN')}` : 'Price on Request');
        const specs = isMultiDeal ? `${selectedDeals.length} Verified Properties` : getSafeString(singleMeta?.features || singleDeal?.unitType, 'Prime Spec');
        const ref = isMultiDeal ? selectedDeals.map(d => getSafeString(d.dealCode, d._id?.slice(-4).toUpperCase())).join(', ') : getSafeString(singleDeal?.dealCode, singleDeal?._id?.substring(0, 8).toUpperCase() || 'DEAL-REF');
        const items = isMultiDeal ? selectedDeals : (singleDeal ? [singleDeal] : []);
        const subject = selectedEmailTemplate?.subject
            ? interpolateTemplateString(getSafeString(selectedEmailTemplate.subject), { isMultiDeal, singleMeta, singleDeal, selectedDeals, currentUser, users })
            : `[Exclusive Deal Alert] ${title}`;
        const customHtml = selectedEmailTemplate
            ? interpolateTemplateString(getSafeString(selectedEmailTemplate.content || selectedEmailTemplate.body, ''), { isMultiDeal, singleMeta, singleDeal, selectedDeals, isHtml: true, currentUser, users })
            : null;
        return { title, loc, price, specs, ref, items, subject, customHtml, templateName: getSafeString(selectedEmailTemplate?.name, '') || null };
    }, [isMultiDeal, selectedDeals, singleMeta, singleDeal, selectedEmailTemplate, currentUser, users]);

    // ── Enterprise Audience Reach & Per-Segment Count Calculator ────────────
    const audienceStats = useMemo(() => {
        // 1. Unique Brokers across selected Broker Groups
        const brokerIdSet = new Set();
        let fallbackBrokerSum = 0;
        selectedGroups.forEach(gid => {
            const grp = groups.find(g => String(g._id) === String(gid));
            if (grp) {
                if (Array.isArray(grp.memberIds) && grp.memberIds.length > 0) {
                    grp.memberIds.forEach(mid => brokerIdSet.add(String(mid)));
                } else {
                    fallbackBrokerSum += (Number(grp.memberCount) || 0);
                }
            }
        });
        const brokerCount = brokerIdSet.size > 0 ? brokerIdSet.size : fallbackBrokerSum;

        // 2. Unique Contacts across selected Contact Groups
        const contactIdSet = new Set();
        let fallbackContactSum = 0;
        selectedContactGroups.forEach(gid => {
            const grp = contactGroups.find(g => String(g._id) === String(gid));
            if (grp) {
                if (Array.isArray(grp.memberIds) && grp.memberIds.length > 0) {
                    grp.memberIds.forEach(mid => contactIdSet.add(String(mid)));
                } else {
                    fallbackContactSum += (Number(grp.memberCount) || 0);
                }
            }
        });
        const contactCount = contactIdSet.size > 0 ? contactIdSet.size : fallbackContactSum;

        // 3. Selected Matched Leads (Direct 1-to-1 Recipients)
        const matchedLeadsCount = selectedMatchedLeads.length;

        // 4. Selected WhatsApp Groups & Group Participants Reach
        const waGroupsCount = selectedWaGroups.length;
        let waParticipantsCount = 0;
        selectedWaGroups.forEach(jid => {
            const wg = waGroups.find(g => String(g.id) === String(jid));
            waParticipantsCount += (Number(wg?.participantsCount) || 1);
        });

        // Total Direct Dispatches (exact API messages queued)
        const totalDirectRecipients = brokerCount + contactCount + matchedLeadsCount + waGroupsCount;
        // Total Audience Reach (total people reached including WA group participants)
        const totalAudienceReach = brokerCount + contactCount + matchedLeadsCount + waParticipantsCount;

        return {
            brokerCount,
            contactCount,
            matchedLeadsCount,
            waGroupsCount,
            waParticipantsCount,
            totalDirectRecipients,
            totalAudienceReach
        };
    }, [selectedGroups, groups, selectedContactGroups, contactGroups, selectedMatchedLeads, selectedWaGroups, waGroups]);

    const totalSelectedTargets = selectedGroups.length + selectedContactGroups.length + selectedMatchedLeads.length + selectedWaGroups.length;
    const activeChannelCount = Object.values(channels).filter(Boolean).length;
    const isLaunchDisabled = sending || totalSelectedTargets === 0 || activeChannelCount === 0 || (channels.whatsapp && !isBaileys && !selectedTemplate);

    const handleBroadcastSubmit = async () => {
        const hasCompany = selectedGroups.length > 0;
        const hasContact = selectedContactGroups.length > 0;
        const hasMatchedLead = selectedMatchedLeads.length > 0;
        const hasWaGroup = selectedWaGroups.length > 0;

        if (!hasCompany && !hasContact && !hasMatchedLead && !hasWaGroup) {
            toast.error("Please select at least one Target Audience (Matched Lead, Broker Group, Contact Group, or WhatsApp Group)");
            return;
        }

        const selectedChannels = Object.entries(channels).filter(([_, v]) => v).map(([k]) => k);
        if (selectedChannels.length === 0) {
            toast.error("Please select at least one omnichannel delivery channel");
            return;
        }

        if (channels.whatsapp && !isBaileys && !selectedTemplate) {
            toast.error("Please select an approved WhatsApp template for Meta Cloud API or switch to WhatsApp Web");
            return;
        }

        setSending(true);
        try {
            const payload = {
                dealId: dealIds[0],
                dealIds: dealIds,
                groupIds: selectedGroups,
                contactGroupIds: selectedContactGroups,
                leadIds: selectedMatchedLeads,
                whatsappGroupJids: selectedWaGroups,
                integrationId: selectedAccountId || undefined,
                channels: selectedChannels,
                templateId: channels.whatsapp
                    ? (isBaileys
                        ? (selectedWebTemplate?.name || selectedWebTemplate?.id || undefined)
                        : selectedTemplate?.name)
                    : undefined,
                templateText: channels.whatsapp && isBaileys && selectedWebTemplate 
                    ? (composeFullWebTemplateText(selectedWebTemplate) || webTemplatePreviewText) 
                    : undefined,
                isBaileys: Boolean(isBaileys),
                language: isBaileys ? undefined : (selectedTemplate?.language || 'en'),
                // Omnichannel Template Payloads for SMS, RCS, and Email
                smsTemplate: channels.sms ? {
                    templateId: selectedSmsTemplate?.id || 'default_sms_bna',
                    name: selectedSmsTemplate?.name || 'Default DLT Deal Alert',
                    dltHeaderId: selectedSmsTemplate?.dltHeaderId || 'BHRPRP',
                    dltTemplateId: selectedSmsTemplate?.dltTemplateId || '170716890000101',
                    text: smsPreviewText
                } : undefined,
                rcsTemplate: channels.rcs ? {
                    templateId: selectedRcsTemplate?.id || 'default_rcs_bna',
                    name: selectedRcsTemplate?.name || 'Default Verified RCS Rich Card',
                    text: rcsPreviewData.desc,
                    buttons: rcsPreviewData.buttons || []
                } : undefined,
                emailTemplate: channels.email ? {
                    templateId: selectedEmailTemplate?.id || 'default_email_bna',
                    name: selectedEmailTemplate?.name || 'Default Corporate Deal Bulletin HTML',
                    subject: emailPreviewData.subject,
                    html: emailPreviewData.customHtml || undefined
                } : undefined
            };

            const res = await api.post('/marketing/broadcast/bna', payload);

            if (res.data?.success) {
                toast.success(`🎉 Broadcast successfully dispatched to ${res.data.dispatchCount || audienceStats.totalDirectRecipients || totalSelectedTargets} recipients!`);
                if (onSuccess) onSuccess();
                onClose();
            } else {
                toast.error(res.data?.error || "Broadcast could not be dispatched");
            }
        } catch (error) {
            console.error("[DealBroadcastModal] Broadcast dispatch failed:", error);
            const errMsg = error.response?.data?.error || error.response?.data?.message || "Failed to dispatch broadcast";
            toast.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    const filteredWaGroups = waGroups.filter(g => {
        if (!waGroupSearch) return true;
        const q = waGroupSearch.toLowerCase();
        return (g.subject || g.name || '').toLowerCase().includes(q);
    }).sort((a, b) => {
        const aCan = a.canSend !== false;
        const bCan = b.canSend !== false;
        if (aCan !== bCan) return aCan ? -1 : 1;
        return (b.participantsCount || 0) - (a.participantsCount || 0);
    });

    const preferredMatchedLeadsCount = matchedLeads.filter(l => l.isPreferredMatch || (l.score || 0) >= 75).length;

    const filteredMatchedLeads = matchedLeads.filter(l => {
        if (matchedLeadFilter === 'preferred' && !(l.isPreferredMatch || (l.score || 0) >= 75)) {
            return false;
        }
        if (!matchedLeadSearch) return true;
        const q = matchedLeadSearch.toLowerCase();
        const fullName = `${l.salutation || ''} ${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
        const loc = getSafeString(l.location, l.locArea || l.locCity || '').toLowerCase();
        const req = getSafeString(l.requirement, '').toLowerCase();
        const mob = String(l.mobile || '').toLowerCase();
        return fullName.includes(q) || loc.includes(q) || req.includes(q) || mob.includes(q);
    });

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '16px', overflowY: 'auto'
        }}>
            <div style={{
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                borderRadius: '20px',
                width: '100%', maxWidth: '1080px', maxHeight: '92vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden'
            }}>
                {/* ── Modal Header ────────────────────────────────────────── */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)', color: '#fff'
                        }}>
                            <i className="fas fa-bullhorn" style={{ fontSize: '18px' }}></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                    Marketing & BNA Broadcast Hub
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px',
                                    background: isMultiDeal ? '#fef3c7' : '#e0e7ff',
                                    color: isMultiDeal ? '#92400e' : '#3730a3',
                                    border: isMultiDeal ? '1px solid #fde68a' : '1px solid #c7d2fe'
                                }}>
                                    <i className={`fas ${isMultiDeal ? 'fa-layer-group' : 'fa-tag'}`} style={{ marginRight: '5px' }}></i>
                                    {isMultiDeal ? `${selectedDeals.length} Deals Selected (Portfolio Mode)` : '1 Deal Selected'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                    <i className="far fa-clock" style={{ color: '#818cf8', fontSize: '11px' }}></i>
                                    <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                    <span style={{ opacity: 0.4 }}>•</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
                                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                    </span>
                                </div>
                                <span style={{ opacity: 0.3 }}>•</span>
                                <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                    Omnichannel Broadcast Engine
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                            color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b'}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* ── Modal Body (Scrollable) ──────────────────────────────── */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '40px 0', alignItems: 'center' }}>
                            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '32px', color: '#6366f1' }}></i>
                            <span style={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>Loading broadcast resources and channels...</span>
                        </div>
                    ) : (
                        <>
                            {/* ── Section 1: Selected Deals & Sanitization Banner ──── */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '16px', padding: '18px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '8px',
                                            background: allDealsReady ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7') : (isDark ? 'rgba(59, 130, 246, 0.15)' : '#dbeafe'),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <i className={`fas ${allDealsReady ? 'fa-check-circle' : 'fa-shield-alt'}`} style={{ color: allDealsReady ? '#10b981' : '#3b82f6', fontSize: '15px' }}></i>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                {allDealsReady ? 'Deal Data Broadcast Ready' : 'Step 1 — Prepare Deal Data for Broadcast'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                {isMultiDeal
                                                    ? `${selectedDeals.length} properties selected. Verify sanitized details before mass delivery.`
                                                    : 'Sanitize deal specifications and pricing to protect client confidentiality.'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleSanitize()}
                                        disabled={sanitizing}
                                        style={{
                                            padding: '8px 16px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '10px',
                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                            background: allDealsReady ? (isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff') : '#4f46e5',
                                            color: allDealsReady ? (isDark ? '#f8fafc' : '#334155') : '#ffffff',
                                            cursor: sanitizing ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            boxShadow: allDealsReady ? 'none' : '0 2px 8px rgba(79, 70, 229, 0.3)'
                                        }}
                                    >
                                        {sanitizing ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${allDealsReady ? 'fa-sync-alt' : 'fa-bolt'}`}></i>}
                                        {sanitizing ? 'Preparing Data...' : (allDealsReady ? 'Re-Sanitize' : 'Prepare Now')}
                                    </button>
                                </div>

                                {/* Preview of Selected Deals */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMultiDeal ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr',
                                    gap: '12px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px'
                                }}>
                                    {selectedDeals.map((deal, idx) => {
                                        const m = dealsMeta[deal._id] || deal.broadcastMetadata;
                                        const isReady = Boolean(m?.isReady);
                                        return (
                                            <div key={deal._id} style={{
                                                background: isDark ? '#1e293b' : '#ffffff',
                                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                                borderRadius: '12px', padding: '12px 14px',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: '#e0e7ff', color: '#4338ca' }}>
                                                            {deal.dealCode || `DEAL #${idx + 1}`}
                                                        </span>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {renderValue(deal.title || deal.projectName, 'Exclusive Property')}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                        <span style={{ fontWeight: 700, color: '#10b981' }}>
                                                            {renderValue(m?.price || (deal.price ? `₹ ${deal.price.toLocaleString('en-IN')}` : 'P.O.R'))}
                                                        </span>
                                                        <span>•</span>
                                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {renderValue(m?.location || deal.location, 'Kurukshetra')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                        background: isReady ? '#dcfce7' : '#fef3c7',
                                                        color: isReady ? '#166534' : '#92400e'
                                                    }}>
                                                        <i className={`fas ${isReady ? 'fa-check' : 'fa-clock'}`} style={{ marginRight: '4px' }}></i>
                                                        {isReady ? 'Ready' : 'Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Section 2: Broadcast Configuration & Targets ───── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px' }}>

                                {/* LEFT COLUMN: Omnichannel Delivery Channels + Dynamic Per-Channel Template Selection */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                    {/* Step 1: Omnichannel Delivery Channels */}
                                    <div style={{
                                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                        borderRadius: '14px', padding: '16px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', margin: 0, display: 'block' }}>
                                                    OMNICHANNEL DELIVERY CHANNELS <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <span style={{ fontSize: '0.66rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                                                    Select channels to unlock their dedicated template &amp; gateway settings below
                                                </span>
                                            </div>
                                            <span style={{
                                                fontSize: '0.68rem', color: '#4f46e5', fontWeight: 800,
                                                background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                                padding: '3px 10px', borderRadius: '12px'
                                            }}>
                                                {activeChannelCount} Active
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            {/* 1. WhatsApp */}
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                border: `1.5px solid ${channels.whatsapp ? '#10b981' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                borderRadius: '10px', background: channels.whatsapp ? (isDark ? 'rgba(16, 185, 129, 0.1)' : '#f0fdf4') : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.whatsapp}
                                                    onChange={e => handleToggleChannel('whatsapp', e.target.checked)}
                                                    style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                                />
                                                <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '18px' }}></i>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>WhatsApp</div>
                                                    <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {isBaileys
                                                            ? (selectedWebTemplate ? `📢 ${selectedWebTemplate.name}` : 'Direct Rich Card')
                                                            : (selectedTemplate ? `🔵 ${selectedTemplate.name}` : 'Meta Cloud API')}
                                                    </div>
                                                </div>
                                            </label>

                                            {/* 2. SMS (DLT Gateway) */}
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                border: `1.5px solid ${channels.sms ? '#3b82f6' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                borderRadius: '10px', background: channels.sms ? (isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff') : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.sms}
                                                    onChange={e => handleToggleChannel('sms', e.target.checked)}
                                                    style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }}
                                                />
                                                <i className="fas fa-comment-dots" style={{ color: '#3b82f6', fontSize: '18px' }}></i>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>SMS</div>
                                                    <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {selectedSmsTemplate ? `📢 ${selectedSmsTemplate.name}` : 'DLT High-Priority'}
                                                    </div>
                                                </div>
                                            </label>

                                            {/* 3. RCS (Google RCS Business) */}
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                border: `1.5px solid ${channels.rcs ? '#06b6d4' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                borderRadius: '10px', background: channels.rcs ? (isDark ? 'rgba(6, 182, 212, 0.1)' : '#ecfeff') : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.rcs}
                                                    onChange={e => handleToggleChannel('rcs', e.target.checked)}
                                                    style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                                                />
                                                <i className="fas fa-mobile-alt" style={{ color: '#06b6d4', fontSize: '18px' }}></i>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>RCS</div>
                                                    <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {selectedRcsTemplate ? `📢 ${selectedRcsTemplate.name}` : 'Verified Rich Card'}
                                                    </div>
                                                </div>
                                            </label>

                                            {/* 4. Email */}
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                border: `1.5px solid ${channels.email ? '#ef4444' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                borderRadius: '10px', background: channels.email ? (isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2') : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.email}
                                                    onChange={e => handleToggleChannel('email', e.target.checked)}
                                                    style={{ accentColor: '#ef4444', width: '16px', height: '16px' }}
                                                />
                                                <i className="fas fa-envelope" style={{ color: '#ef4444', fontSize: '17px' }}></i>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Email</div>
                                                    <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {selectedEmailTemplate ? `📢 ${selectedEmailTemplate.name}` : 'HTML Deal Newsletter'}
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Empty state if no channel is selected */}
                                    {activeChannelCount === 0 && (
                                        <div style={{
                                            padding: '18px', borderRadius: '14px',
                                            background: isDark ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2',
                                            border: '1px dashed #ef4444', textAlign: 'center',
                                            fontSize: '0.78rem', color: isDark ? '#fca5a5' : '#b91c1c', fontWeight: 700
                                        }}>
                                            <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                                            Select at least one Omnichannel above (WhatsApp, SMS, RCS, or Email) to configure its broadcast template.
                                        </div>
                                    )}

                                    {/* ── DYNAMIC CHANNEL CARD 1: WHATSAPP (Only shown when channels.whatsapp is selected) ── */}
                                    {channels.whatsapp && (
                                        <div style={{
                                            background: isDark ? 'rgba(16, 185, 129, 0.04)' : '#f0fdf4',
                                            border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #bbf7d0',
                                            borderRadius: '14px', padding: '16px',
                                            display: 'flex', flexDirection: 'column', gap: '14px'
                                        }}>
                                            {/* WhatsApp Sender Account Picker */}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#34d399' : '#065f46', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                                        <i className="fab fa-whatsapp" style={{ fontSize: '14px', color: '#10b981' }}></i>
                                                        WHATSAPP SENDER ACCOUNT <span style={{ color: '#ef4444' }}>*</span>
                                                    </label>
                                                    <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', background: isBaileys ? '#dcfce7' : '#dbeafe', color: isBaileys ? '#166534' : '#1e40af' }}>
                                                        {isBaileys ? 'WhatsApp Web Bridge' : 'Meta Cloud API'}
                                                    </span>
                                                </div>
                                                {accounts.length === 0 ? (
                                                    <div style={{ padding: '10px 12px', background: isDark ? '#1e293b' : '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.78rem', color: '#64748b' }}>
                                                        No connected WhatsApp accounts found.
                                                    </div>
                                                ) : (
                                                    <select
                                                        value={selectedAccountId}
                                                        onChange={(e) => {
                                                            const newId = e.target.value;
                                                            setSelectedAccountId(newId);
                                                            const acc = accounts.find(a => (a.id || a._id) === newId);
                                                            if (acc?.provider === 'BAILEYS') {
                                                                loadBaileysGroups(newId);
                                                            }
                                                        }}
                                                        style={{
                                                            width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                            border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #86efac',
                                                            fontSize: '0.82rem', fontWeight: 700,
                                                            background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                            outline: 'none', cursor: 'pointer'
                                                        }}
                                                    >
                                                        {accounts.map(acc => {
                                                            const accId = acc.id || acc._id;
                                                            const isWAWeb = acc.provider === 'BAILEYS';
                                                            return (
                                                                <option key={accId} value={accId}>
                                                                    {isWAWeb ? '🟢 [WhatsApp Web] ' : '🔵 [Meta Cloud API] '}
                                                                    {acc.name || acc.phoneNumber || 'WhatsApp Line'}
                                                                    {acc.phoneNumber ? ` (+${acc.phoneNumber.replace(/^\+/, '')})` : ''}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                )}
                                            </div>

                                            {/* WhatsApp Template Selector (Baileys Web vs Meta Cloud API) */}
                                            <div style={{ borderTop: isDark ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid #bbf7d0', paddingTop: '12px' }}>
                                                {isBaileys ? (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#065f46', letterSpacing: '0.5px', margin: 0 }}>
                                                                WHATSAPP TEMPLATE SELECTION
                                                            </label>
                                                            <span style={{
                                                                fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                                                background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7',
                                                                color: '#10b981', border: '1px solid #a7f3d0'
                                                            }}>
                                                                ✓ {allWhatsAppTemplates.length} Templates Available
                                                            </span>
                                                        </div>

                                                        <select
                                                            value={selectedWebTemplateId}
                                                            onChange={(e) => {
                                                                setSelectedWebTemplateId(e.target.value);
                                                                setPreviewChannel('whatsapp');
                                                            }}
                                                            style={{
                                                                width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                                border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #86efac',
                                                                fontSize: '0.82rem', fontWeight: 700,
                                                                background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                                outline: 'none', cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value="">⭐ Default Rich BNA Deal Card (Recommended)</option>
                                                            {webBroadcastTemplates.length > 0 && (
                                                                <optgroup label="📢 Marketing Broadcast WhatsApp Templates">
                                                                    {webBroadcastTemplates.map(t => (
                                                                        <option key={t.id || t.name} value={t.id || t.name}>
                                                                            📢 {t.name}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                            {otherWebTemplates.length > 0 && (
                                                                <optgroup label="📋 All WhatsApp Templates">
                                                                    {otherWebTemplates.map(t => (
                                                                        <option key={t.id || t.name} value={t.id || t.name}>
                                                                            💬 {t.name}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                        </select>

                                                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#047857' }}>
                                                            <span>
                                                                <i className="fas fa-check-circle" style={{ marginRight: '4px', color: '#10b981' }}></i>
                                                                {selectedWebTemplate
                                                                    ? `Using "${selectedWebTemplate.name}" with live deal variable interpolation.`
                                                                    : 'Broadcasting using high-converting default multi-section BNA Card.'}
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#065f46', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                                                            META APPROVED WHATSAPP TEMPLATE <span style={{ color: '#ef4444' }}>*</span>
                                                        </label>
                                                        {templates.length === 0 ? (
                                                            <div style={{ padding: '10px 12px', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: '10px', fontSize: '0.75rem', color: '#854d0e' }}>
                                                                No approved Meta templates found. Switch to WhatsApp Web for direct template-free broadcasting.
                                                            </div>
                                                        ) : (
                                                            <select
                                                                value={selectedTemplate?.name || ''}
                                                                onChange={(e) => {
                                                                    setSelectedTemplate(templates.find(t => t.name === e.target.value) || null);
                                                                    setPreviewChannel('whatsapp');
                                                                }}
                                                                style={{
                                                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                                                    fontSize: '0.82rem', fontWeight: 700,
                                                                    background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                                    outline: 'none', cursor: 'pointer'
                                                                }}
                                                            >
                                                                <option value="">— Select Meta Approved Template —</option>
                                                                {templates.map(t => (
                                                                    <option key={t.name} value={t.name}>
                                                                        {t.name.replace(/_/g, ' ').toUpperCase()} ({t.language})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── DYNAMIC CHANNEL CARD 2: SMS (Only shown when channels.sms is selected) ── */}
                                    {channels.sms && (
                                        <div style={{
                                            background: isDark ? 'rgba(59, 130, 246, 0.04)' : '#eff6ff',
                                            border: isDark ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid #bfdbfe',
                                            borderRadius: '14px', padding: '16px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#60a5fa' : '#1e40af', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                                    <i className="fas fa-comment-dots" style={{ fontSize: '13px', color: '#3b82f6' }}></i>
                                                    SMS DLT TEMPLATE SELECTION
                                                </label>
                                                <span style={{
                                                    fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                                    background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#dbeafe',
                                                    color: '#2563eb', border: '1px solid #93c5fd'
                                                }}>
                                                    ✓ {allSmsTemplates.length} DLT Templates
                                                </span>
                                            </div>

                                            <select
                                                value={selectedSmsTemplateId}
                                                onChange={(e) => {
                                                    setSelectedSmsTemplateId(e.target.value);
                                                    setPreviewChannel('sms');
                                                }}
                                                style={{
                                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #93c5fd',
                                                    fontSize: '0.82rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                    outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value="">⭐ Default DLT Deal Alert (Recommended)</option>
                                                {smsBroadcastTemplates.length > 0 && (
                                                    <optgroup label="📢 Marketing Broadcast SMS Templates">
                                                        {smsBroadcastTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                📢 {t.name} {t.dltHeaderId ? `[${t.dltHeaderId}]` : ''}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {otherSmsTemplates.length > 0 && (
                                                    <optgroup label="📋 All SMS Templates">
                                                        {otherSmsTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                💬 {t.name} {t.dltHeaderId ? `[${t.dltHeaderId}]` : ''}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>

                                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#1e40af' }}>
                                                <span>
                                                    <i className="fas fa-shield-alt" style={{ marginRight: '4px', color: '#3b82f6' }}></i>
                                                    Header: <strong>{selectedSmsTemplate?.dltHeaderId || 'BHRPRP'}</strong> • DLT ID: <strong>{selectedSmsTemplate?.dltTemplateId || '170716890000101'}</strong>
                                                </span>
                                                <span style={{ fontWeight: 700 }}>
                                                    {smsPreviewText.length} chars ({Math.ceil(smsPreviewText.length / 160)} Credit{Math.ceil(smsPreviewText.length / 160) > 1 ? 's' : ''})
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── DYNAMIC CHANNEL CARD 3: RCS (Only shown when channels.rcs is selected) ── */}
                                    {channels.rcs && (
                                        <div style={{
                                            background: isDark ? 'rgba(6, 182, 212, 0.04)' : '#ecfeff',
                                            border: isDark ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid #a5f3fc',
                                            borderRadius: '14px', padding: '16px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#22d3ee' : '#0e7490', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                                    <i className="fas fa-mobile-alt" style={{ fontSize: '13px', color: '#06b6d4' }}></i>
                                                    RCS RICH CARD TEMPLATE SELECTION
                                                </label>
                                                <span style={{
                                                    fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                                    background: isDark ? 'rgba(6, 182, 212, 0.15)' : '#cffafe',
                                                    color: '#0891b2', border: '1px solid #67e8f9'
                                                }}>
                                                    ✓ {allRcsTemplates.length} Rich Templates
                                                </span>
                                            </div>

                                            <select
                                                value={selectedRcsTemplateId}
                                                onChange={(e) => {
                                                    setSelectedRcsTemplateId(e.target.value);
                                                    setPreviewChannel('rcs');
                                                }}
                                                style={{
                                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid #67e8f9',
                                                    fontSize: '0.82rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                    outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value="">⭐ Default Verified RCS Rich Card (Recommended)</option>
                                                {rcsBroadcastTemplates.length > 0 && (
                                                    <optgroup label="📢 Marketing Broadcast RCS Templates">
                                                        {rcsBroadcastTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                📢 {t.name} ({t.buttons?.length || 3} Interactive Buttons)
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {otherRcsTemplates.length > 0 && (
                                                    <optgroup label="📋 All RCS Rich Templates">
                                                        {otherRcsTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                📱 {t.name} ({t.buttons?.length || 3} Interactive Buttons)
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>

                                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#0e7490' }}>
                                                <span>
                                                    <i className="fas fa-check-circle" style={{ marginRight: '4px', color: '#06b6d4' }}></i>
                                                    {selectedRcsTemplate
                                                        ? `Rich Card "${selectedRcsTemplate.name}" • ${selectedRcsTemplate.buttons?.length || 3} CTA Buttons`
                                                        : 'Google Jibe Verified Rich Card with Hero Banner & 3 CTA Chips'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── DYNAMIC CHANNEL CARD 4: EMAIL (Only shown when channels.email is selected) ── */}
                                    {channels.email && (
                                        <div style={{
                                            background: isDark ? 'rgba(239, 68, 68, 0.04)' : '#fef2f2',
                                            border: isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid #fecaca',
                                            borderRadius: '14px', padding: '16px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#f87171' : '#991b1b', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                                    <i className="fas fa-envelope" style={{ fontSize: '13px', color: '#ef4444' }}></i>
                                                    EMAIL HTML TEMPLATE SELECTION
                                                </label>
                                                <span style={{
                                                    fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px',
                                                    background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                                                    color: '#dc2626', border: '1px solid #fca5a5'
                                                }}>
                                                    ✓ {allEmailTemplates.length} HTML Templates
                                                </span>
                                            </div>

                                            <select
                                                value={selectedEmailTemplateId}
                                                onChange={(e) => {
                                                    setSelectedEmailTemplateId(e.target.value);
                                                    setPreviewChannel('email');
                                                }}
                                                style={{
                                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5',
                                                    fontSize: '0.82rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a',
                                                    outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value="">⭐ Default Corporate Deal Bulletin HTML (Recommended)</option>
                                                {emailBroadcastTemplates.length > 0 && (
                                                    <optgroup label="📢 Marketing Broadcast Email Templates">
                                                        {emailBroadcastTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                📢 {t.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {otherEmailTemplates.length > 0 && (
                                                    <optgroup label="📋 All Email Templates">
                                                        {otherEmailTemplates.map(t => (
                                                            <option key={t.id || t.name} value={t.id || t.name}>
                                                                ✉️ {t.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>

                                            <div style={{ marginTop: '8px', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#991b1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <i className="fas fa-heading" style={{ marginRight: '5px', color: '#ef4444' }}></i>
                                                Subject: <strong>{emailPreviewData.subject}</strong>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RIGHT COLUMN: Target Audience (Tabs: Matched Leads | Broker Groups | Contact Groups | WA Groups) */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '16px', padding: '18px',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                                }}>
                                    <div>
                                        {/* Header with Live Total Audience Reach Pill */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', margin: 0 }}>
                                                    TARGET AUDIENCE
                                                </label>
                                                <span style={{
                                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: '12px',
                                                    background: audienceStats.totalAudienceReach > 0
                                                        ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#dcfce7')
                                                        : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0'),
                                                    color: audienceStats.totalAudienceReach > 0 ? '#10b981' : (isDark ? '#94a3b8' : '#64748b'),
                                                    border: audienceStats.totalAudienceReach > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : 'none'
                                                }}>
                                                    <i className="fas fa-bullseye" style={{ marginRight: '5px' }}></i>
                                                    {audienceStats.totalAudienceReach} Audience Reach
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {activeTab === 'matched_leads' && preferredMatchedLeadsCount > 0 && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const prefIds = matchedLeads
                                                                    .filter(l => l.isPreferredMatch || (l.score || 0) >= 75)
                                                                    .map(l => String(l._id));
                                                                setSelectedMatchedLeads(prefIds);
                                                            }}
                                                            style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                        >
                                                            ⭐ Select Preferred ({preferredMatchedLeadsCount})
                                                        </button>
                                                        <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>|</span>
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (activeTab === 'matched_leads') setSelectedMatchedLeads(filteredMatchedLeads.map(l => String(l._id)));
                                                        if (activeTab === 'broker') setSelectedGroups(groups.map(g => g._id));
                                                        if (activeTab === 'contact') setSelectedContactGroups(contactGroups.map(g => g._id));
                                                        if (activeTab === 'wa_group') setSelectedWaGroups(waGroups.map(g => g.id));
                                                    }}
                                                    style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                >
                                                    Select All
                                                </button>
                                                <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>|</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (activeTab === 'matched_leads') setSelectedMatchedLeads([]);
                                                        if (activeTab === 'broker') setSelectedGroups([]);
                                                        if (activeTab === 'contact') setSelectedContactGroups([]);
                                                        if (activeTab === 'wa_group') setSelectedWaGroups([]);
                                                    }}
                                                    style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>

                                        {/* 4 Audience Segment Tabs */}
                                        <div style={{
                                            display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px',
                                            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                            paddingBottom: '8px'
                                        }}>
                                            {/* Tab 1: Matched Leads */}
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('matched_leads')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 800,
                                                    background: activeTab === 'matched_leads' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                                                    color: activeTab === 'matched_leads' ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                }}
                                            >
                                                <i className="fas fa-Crosshairs fa-bullseye"></i>
                                                <span>Matched Leads</span>
                                                <span style={{
                                                    fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                                    background: activeTab === 'matched_leads' ? 'rgba(255,255,255,0.22)' : (selectedMatchedLeads.length > 0 ? '#fef3c7' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')),
                                                    color: activeTab === 'matched_leads' ? '#fff' : (selectedMatchedLeads.length > 0 ? '#92400e' : (isDark ? '#cbd5e1' : '#475569'))
                                                }}>
                                                    {selectedMatchedLeads.length > 0 ? `${selectedMatchedLeads.length}/${matchedLeads.length}` : matchedLeads.length}
                                                </span>
                                            </button>

                                            {/* Tab 2: Broker Groups */}
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('broker')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 800,
                                                    background: activeTab === 'broker' ? '#4f46e5' : 'transparent',
                                                    color: activeTab === 'broker' ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                }}
                                            >
                                                <i className="fas fa-handshake"></i>
                                                <span>Brokers</span>
                                                <span style={{
                                                    fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                                    background: activeTab === 'broker' ? 'rgba(255,255,255,0.22)' : (selectedGroups.length > 0 ? '#e0e7ff' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')),
                                                    color: activeTab === 'broker' ? '#fff' : (selectedGroups.length > 0 ? '#3730a3' : (isDark ? '#cbd5e1' : '#475569'))
                                                }}>
                                                    {selectedGroups.length > 0 ? `${audienceStats.brokerCount} (${selectedGroups.length}G)` : groups.length}
                                                </span>
                                            </button>

                                            {/* Tab 3: Contact Groups */}
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('contact')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 800,
                                                    background: activeTab === 'contact' ? '#4f46e5' : 'transparent',
                                                    color: activeTab === 'contact' ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                }}
                                            >
                                                <i className="fas fa-users"></i>
                                                <span>Contacts</span>
                                                <span style={{
                                                    fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                                    background: activeTab === 'contact' ? 'rgba(255,255,255,0.22)' : (selectedContactGroups.length > 0 ? '#dcfce7' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')),
                                                    color: activeTab === 'contact' ? '#fff' : (selectedContactGroups.length > 0 ? '#166534' : (isDark ? '#cbd5e1' : '#475569'))
                                                }}>
                                                    {selectedContactGroups.length > 0 ? `${audienceStats.contactCount} (${selectedContactGroups.length}G)` : contactGroups.length}
                                                </span>
                                            </button>

                                            {/* Tab 4: WA Groups */}
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('wa_group')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 800,
                                                    background: activeTab === 'wa_group' ? '#10b981' : 'transparent',
                                                    color: activeTab === 'wa_group' ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                }}
                                            >
                                                <i className="fab fa-whatsapp"></i>
                                                <span>WA Groups</span>
                                                <span style={{
                                                    fontSize: '0.64rem', padding: '1px 6px', borderRadius: '10px',
                                                    background: activeTab === 'wa_group' ? 'rgba(255,255,255,0.22)' : (selectedWaGroups.length > 0 ? '#dcfce7' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')),
                                                    color: activeTab === 'wa_group' ? '#fff' : (selectedWaGroups.length > 0 ? '#166534' : (isDark ? '#cbd5e1' : '#475569'))
                                                }}>
                                                    {selectedWaGroups.length > 0 ? `${selectedWaGroups.length} (${audienceStats.waParticipantsCount})` : waGroups.length}
                                                </span>
                                            </button>
                                        </div>

                                        {/* ── Tab Content 0: Matched Leads (AI Deal-to-Lead Matching Engine) ── */}
                                        {activeTab === 'matched_leads' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {/* Sub-bar: Filter Pills + Search */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMatchedLeadFilter('all')}
                                                        style={{
                                                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 800,
                                                            border: matchedLeadFilter === 'all' ? '1px solid #4f46e5' : (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1'),
                                                            background: matchedLeadFilter === 'all' ? '#e0e7ff' : 'transparent',
                                                            color: matchedLeadFilter === 'all' ? '#3730a3' : (isDark ? '#94a3b8' : '#64748b'),
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        All Matches ({matchedLeads.length})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMatchedLeadFilter('preferred')}
                                                        style={{
                                                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 800,
                                                            border: matchedLeadFilter === 'preferred' ? '1px solid #f59e0b' : (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1'),
                                                            background: matchedLeadFilter === 'preferred' ? '#fef3c7' : 'transparent',
                                                            color: matchedLeadFilter === 'preferred' ? '#92400e' : (isDark ? '#94a3b8' : '#64748b'),
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ⭐ High / Preferred ≥75% ({preferredMatchedLeadsCount})
                                                    </button>
                                                    <input
                                                        type="text"
                                                        placeholder="Search lead name, mobile, location..."
                                                        value={matchedLeadSearch}
                                                        onChange={e => setMatchedLeadSearch(e.target.value)}
                                                        style={{
                                                            flex: 1, minWidth: '140px', padding: '5px 10px', borderRadius: '8px', fontSize: '0.72rem',
                                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                                            background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f8fafc' : '#0f172a',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>

                                                {/* Matched Leads List */}
                                                <div style={{ maxHeight: '210px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
                                                    {loadingMatchedLeads ? (
                                                        <div style={{ textAlign: 'center', padding: '24px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px', color: '#f59e0b' }}></i>
                                                            Running Deal-to-Lead Matching Engine...
                                                        </div>
                                                    ) : filteredMatchedLeads.length === 0 ? (
                                                        <div style={{ textAlign: 'center', padding: '20px 14px', fontSize: '0.75rem', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
                                                            <i className="fas fa-user-check" style={{ fontSize: '18px', marginBottom: '6px', display: 'block', opacity: 0.5 }}></i>
                                                            {matchedLeads.length === 0
                                                                ? 'No matched leads found for this deal criteria yet.'
                                                                : 'No matched leads match your current filter.'}
                                                        </div>
                                                    ) : (
                                                        filteredMatchedLeads.map(lead => {
                                                            const lid = String(lead._id);
                                                            const isSelected = selectedMatchedLeads.includes(lid);
                                                            const fullName = `${lead.salutation || ''} ${lead.firstName || ''} ${lead.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Prospective Buyer';
                                                            const score = Number(lead.score) || 0;
                                                            const isPref = Boolean(lead.isPreferredMatch);
                                                            const reqLabel = getSafeString(lead.requirement, 'Buy');
                                                            const locLabel = getSafeString(lead.location, lead.locArea || lead.locCity || 'Kurukshetra');
                                                            const propTypes = getSafeString(lead.propertyType, '');
                                                            const budgetStr = lead.budgetMax
                                                                ? `₹${(Number(lead.budgetMin || 0) / 100000).toFixed(0)}L–${(Number(lead.budgetMax) / 100000).toFixed(0)}L`
                                                                : '';

                                                            return (
                                                                <div
                                                                    key={lid}
                                                                    onClick={() => {
                                                                        if (isSelected) setSelectedMatchedLeads(selectedMatchedLeads.filter(id => id !== lid));
                                                                        else setSelectedMatchedLeads([...selectedMatchedLeads, lid]);
                                                                    }}
                                                                    style={{
                                                                        padding: '8px 11px', borderRadius: '10px', cursor: 'pointer',
                                                                        border: `1.5px solid ${isSelected ? '#f59e0b' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                                        background: isSelected
                                                                            ? (isDark ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb')
                                                                            : (isDark ? '#1e293b' : '#ffffff'),
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={() => {}}
                                                                            style={{ accentColor: '#f59e0b', width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                                                                        />
                                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {fullName}
                                                                                </span>
                                                                                {isPref && (
                                                                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                                                                                        ⭐ Preferred
                                                                                    </span>
                                                                                )}
                                                                                {isMultiDeal && lead.matchedDealsCount > 1 && (
                                                                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '6px', background: '#e0e7ff', color: '#3730a3' }}>
                                                                                        Matches {lead.matchedDealsCount} Deals
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.67rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                <span>{ reqLabel }{ propTypes ? ` • ${propTypes}` : '' }</span>
                                                                                {budgetStr && <><span>•</span><span style={{ color: '#10b981', fontWeight: 700 }}>{budgetStr}</span></>}
                                                                                <span>•</span>
                                                                                <span>📍 {locLabel}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                                        <div style={{ display: 'flex', gap: '4px', fontSize: '0.65rem' }}>
                                                                            {lead.mobile && <i className="fab fa-whatsapp" title={`Mobile: ${lead.mobile}`} style={{ color: '#10b981' }}></i>}
                                                                            {lead.email && <i className="fas fa-envelope" title={`Email: ${lead.email}`} style={{ color: '#ef4444' }}></i>}
                                                                        </div>
                                                                        <span style={{
                                                                            fontSize: '0.66rem', fontWeight: 800, padding: '2px 7px', borderRadius: '8px',
                                                                            background: score >= 80 ? '#dcfce7' : score >= 60 ? '#fef3c7' : '#e0e7ff',
                                                                            color: score >= 80 ? '#166534' : score >= 60 ? '#92400e' : '#3730a3'
                                                                        }}>
                                                                            {score}% Match
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Tab Content 1: Broker Groups (With Per-Group Member Counts) ── */}
                                        {activeTab === 'broker' && (
                                            <div style={{ flex: 1, maxHeight: '220px', overflowY: 'auto' }}>
                                                {groups.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '24px', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                        No broker groups found.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {groups.map(g => {
                                                            const isSelected = selectedGroups.includes(g._id);
                                                            const mCount = Number(g.memberCount) || 0;
                                                            return (
                                                                <button
                                                                    key={g._id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (isSelected) setSelectedGroups(selectedGroups.filter(id => id !== g._id));
                                                                        else setSelectedGroups([...selectedGroups, g._id]);
                                                                    }}
                                                                    style={{
                                                                        padding: '6px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700,
                                                                        border: `1.5px solid ${isSelected ? (g.color || '#4f46e5') : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1')}`,
                                                                        background: isSelected ? (g.color || '#4f46e5') : (isDark ? '#1e293b' : '#fff'),
                                                                        color: isSelected ? '#fff' : (isDark ? '#f8fafc' : '#334155'),
                                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                >
                                                                    {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                                    <span>{g.name}</span>
                                                                    <span style={{
                                                                        fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px',
                                                                        background: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'),
                                                                        color: isSelected ? '#fff' : (isDark ? '#94a3b8' : '#64748b')
                                                                    }}>
                                                                        {mCount} {mCount === 1 ? 'Broker' : 'Brokers'}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* ── Tab Content 2: Contact Groups (With Per-Group Member Counts) ── */}
                                        {activeTab === 'contact' && (
                                            <div style={{ flex: 1, maxHeight: '220px', overflowY: 'auto' }}>
                                                {contactGroups.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '24px', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                        No contact groups found.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {contactGroups.map(g => {
                                                            const isSelected = selectedContactGroups.includes(g._id);
                                                            const mCount = Number(g.memberCount) || 0;
                                                            return (
                                                                <button
                                                                    key={g._id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (isSelected) setSelectedContactGroups(selectedContactGroups.filter(id => id !== g._id));
                                                                        else setSelectedContactGroups([...selectedContactGroups, g._id]);
                                                                    }}
                                                                    style={{
                                                                        padding: '6px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700,
                                                                        border: `1.5px solid ${isSelected ? (g.color || '#10b981') : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1')}`,
                                                                        background: isSelected ? (g.color || '#10b981') : (isDark ? '#1e293b' : '#fff'),
                                                                        color: isSelected ? '#fff' : (isDark ? '#f8fafc' : '#334155'),
                                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                >
                                                                    {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                                    <span>{g.name}</span>
                                                                    <span style={{
                                                                        fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px',
                                                                        background: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'),
                                                                        color: isSelected ? '#fff' : (isDark ? '#94a3b8' : '#64748b')
                                                                    }}>
                                                                        {mCount} {mCount === 1 ? 'Contact' : 'Contacts'}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* ── Tab Content 3: WhatsApp Groups (With Participant Counts) ── */}
                                        {activeTab === 'wa_group' && (
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Filter WhatsApp groups..."
                                                    value={waGroupSearch}
                                                    onChange={e => setWaGroupSearch(e.target.value)}
                                                    style={{
                                                        padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem',
                                                        border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                                        background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f8fafc' : '#0f172a',
                                                        outline: 'none', marginBottom: '6px'
                                                    }}
                                                />
                                                <div style={{ flex: 1, maxHeight: '180px', overflowY: 'auto' }}>
                                                    {loadingWaGroups ? (
                                                        <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                            <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading WhatsApp groups...
                                                        </div>
                                                    ) : filteredWaGroups.length === 0 ? (
                                                        <div style={{ textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
                                                            {isBaileys ? 'No WhatsApp groups found on this account' : 'Switch sender account to WhatsApp Web to load groups'}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                            {filteredWaGroups.map(g => {
                                                                const isSelected = selectedWaGroups.includes(g.id);
                                                                return (
                                                                    <button
                                                                        key={g.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (g.canSend === false) {
                                                                                toast.warning(`"${g.subject}" is an Admin-only Announcement channel. Only community admins can post here.`);
                                                                            }
                                                                            if (isSelected) setSelectedWaGroups(selectedWaGroups.filter(id => id !== g.id));
                                                                            else setSelectedWaGroups([...selectedWaGroups, g.id]);
                                                                        }}
                                                                        style={{
                                                                            padding: '5px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 700,
                                                                            border: `1.5px solid ${isSelected ? '#10b981' : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1')}`,
                                                                            background: isSelected ? '#10b981' : (isDark ? '#1e293b' : '#fff'),
                                                                            color: isSelected ? '#fff' : (isDark ? '#f8fafc' : '#334155'),
                                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                                                            maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                                            opacity: g.canSend === false ? 0.75 : 1
                                                                        }}
                                                                        title={g.canSend === false ? `${g.subject} (Admin-only Channel)` : g.subject}
                                                                    >
                                                                        <i className="fab fa-whatsapp" style={{ fontSize: '11px', color: isSelected ? '#fff' : '#10b981' }}></i>
                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.subject || g.name || 'Group'}</span>
                                                                        {g.canSend === false && (
                                                                            <span style={{ fontSize: '10px' }} title="Admin-only channel">🔒</span>
                                                                        )}
                                                                        <span style={{
                                                                            fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '8px',
                                                                            background: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'),
                                                                            color: isSelected ? '#fff' : (isDark ? '#94a3b8' : '#64748b')
                                                                        }}>
                                                                            {g.participantsCount || 1}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Enterprise Live Audience Reach Breakdown Banner ── */}
                                    <div style={{
                                        marginTop: '14px', paddingTop: '12px',
                                        borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0'
                                    }}>
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{
                                                padding: '6px 8px', borderRadius: '8px',
                                                background: selectedMatchedLeads.length > 0 ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                                                border: `1px solid ${selectedMatchedLeads.length > 0 ? '#fde68a' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0')}`,
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8' }}>MATCHED LEADS</div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: selectedMatchedLeads.length > 0 ? '#d97706' : (isDark ? '#64748b' : '#94a3b8') }}>
                                                    {audienceStats.matchedLeadsCount}
                                                </div>
                                            </div>

                                            <div style={{
                                                padding: '6px 8px', borderRadius: '8px',
                                                background: selectedGroups.length > 0 ? (isDark ? 'rgba(79, 70, 229, 0.12)' : '#eef2ff') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                                                border: `1px solid ${selectedGroups.length > 0 ? '#c7d2fe' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0')}`,
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8' }}>BROKERS ({selectedGroups.length}G)</div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: selectedGroups.length > 0 ? '#4f46e5' : (isDark ? '#64748b' : '#94a3b8') }}>
                                                    {audienceStats.brokerCount}
                                                </div>
                                            </div>

                                            <div style={{
                                                padding: '6px 8px', borderRadius: '8px',
                                                background: selectedContactGroups.length > 0 ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#f0fdf4') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                                                border: `1px solid ${selectedContactGroups.length > 0 ? '#bbf7d0' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0')}`,
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8' }}>CONTACTS ({selectedContactGroups.length}G)</div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: selectedContactGroups.length > 0 ? '#10b981' : (isDark ? '#64748b' : '#94a3b8') }}>
                                                    {audienceStats.contactCount}
                                                </div>
                                            </div>

                                            <div style={{
                                                padding: '6px 8px', borderRadius: '8px',
                                                background: selectedWaGroups.length > 0 ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#f0fdf4') : (isDark ? 'rgba(255,255,255,0.02)' : '#ffffff'),
                                                border: `1px solid ${selectedWaGroups.length > 0 ? '#bbf7d0' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0')}`,
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8' }}>WA GRPS ({selectedWaGroups.length})</div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: selectedWaGroups.length > 0 ? '#059669' : (isDark ? '#64748b' : '#94a3b8') }}>
                                                    {audienceStats.waParticipantsCount}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '8px 12px', borderRadius: '10px',
                                            background: audienceStats.totalAudienceReach > 0
                                                ? (isDark ? 'linear-gradient(90deg, rgba(79,70,229,0.2) 0%, rgba(16,185,129,0.2) 100%)' : 'linear-gradient(90deg, #eef2ff 0%, #ecfdf5 100%)')
                                                : (isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9'),
                                            border: audienceStats.totalAudienceReach > 0
                                                ? (isDark ? '1px solid rgba(99,102,241,0.35)' : '1px solid #c7d2fe')
                                                : 'none'
                                        }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                                <i className="fas fa-users" style={{ marginRight: '6px', color: '#4f46e5' }}></i>
                                                Total Broadcast Audience Reach:
                                            </span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 900, color: audienceStats.totalAudienceReach > 0 ? '#10b981' : '#94a3b8' }}>
                                                {audienceStats.totalAudienceReach} Audience ({audienceStats.totalDirectRecipients} Dispatches)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Section 3: Omnichannel Live Message Preview ───── */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '16px', padding: '18px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '8px',
                                            background: previewChannel === 'whatsapp' ? '#dcfce7' : previewChannel === 'sms' ? '#dbeafe' : previewChannel === 'rcs' ? '#cffafe' : '#fee2e2',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <i className={
                                                previewChannel === 'whatsapp' ? 'fab fa-whatsapp' :
                                                previewChannel === 'sms' ? 'fas fa-comment-dots' :
                                                previewChannel === 'rcs' ? 'fas fa-mobile-alt' : 'fas fa-envelope'
                                            } style={{
                                                color: previewChannel === 'whatsapp' ? '#16a34a' : previewChannel === 'sms' ? '#2563eb' : previewChannel === 'rcs' ? '#0891b2' : '#dc2626',
                                                fontSize: '14px'
                                            }}></i>
                                        </div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '0.5px' }}>
                                            LIVE OMNICHANNEL PREVIEW — {previewChannel.toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Channel Preview Switcher Tabs */}
                                    <div style={{
                                        display: 'flex', gap: '4px',
                                        background: isDark ? '#1e293b' : '#e2e8f0',
                                        padding: '3px', borderRadius: '10px'
                                    }}>
                                        {[
                                            { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', activeColor: '#10b981', enabled: channels.whatsapp },
                                            { id: 'sms', label: 'SMS', icon: 'fas fa-comment-dots', activeColor: '#3b82f6', enabled: channels.sms },
                                            { id: 'rcs', label: 'RCS', icon: 'fas fa-mobile-alt', activeColor: '#06b6d4', enabled: channels.rcs },
                                            { id: 'email', label: 'Email', icon: 'fas fa-envelope', activeColor: '#ef4444', enabled: channels.email },
                                        ].map(tab => {
                                            const isActive = previewChannel === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => setPreviewChannel(tab.id)}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: '8px', border: 'none',
                                                        background: isActive ? (isDark ? '#0f172a' : '#ffffff') : 'transparent',
                                                        color: isActive ? tab.activeColor : (isDark ? '#94a3b8' : '#64748b'),
                                                        fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <i className={tab.icon} style={{ fontSize: '11px', color: isActive ? tab.activeColor : 'inherit' }}></i>
                                                    <span>{tab.label}</span>
                                                    {tab.enabled && (
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tab.activeColor }}></span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 1. WhatsApp Preview */}
                                {previewChannel === 'whatsapp' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{
                                            background: isDark ? '#064e3b' : '#dcf8c6',
                                            border: isDark ? '1px solid #047857' : '1px solid #bbf7d0',
                                            padding: '16px 18px', borderRadius: '14px 14px 14px 0',
                                            fontSize: '0.8rem', lineHeight: '1.65',
                                            color: isDark ? '#ecfdf5' : '#14532d',
                                            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                                            maxHeight: '230px', overflowY: 'auto',
                                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)'
                                        }}>
                                            {renderWhatsAppFormattedText(activeWhatsAppPreview)}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', padding: '0 4px' }}>
                                            <span>
                                                <i className="fas fa-info-circle" style={{ marginRight: '4px', color: '#10b981' }}></i>
                                                {isBaileys
                                                    ? (selectedWebTemplate ? `Using Web Template "${selectedWebTemplate.name}" with auto deal interpolation.` : 'Direct Rich BNA Card delivered without template review.')
                                                    : `Meta Cloud API Template "${selectedTemplate?.name || 'Default'}"`}
                                            </span>
                                            <span style={{ color: '#10b981', fontWeight: 700 }}>
                                                <i className="fas fa-check-double" style={{ marginRight: '4px' }}></i> Read Receipt Enabled
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* 2. SMS Preview */}
                                {previewChannel === 'sms' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #bfdbfe',
                                            borderRadius: '14px', padding: '16px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af' }}>
                                                        {selectedSmsTemplate?.dltHeaderId || 'BHRPRP'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#334155' }}>
                                                        {selectedSmsTemplate ? `Template: ${selectedSmsTemplate.name}` : 'Default DLT Deal Alert'}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>
                                                    <i className="fas fa-shield-alt" style={{ marginRight: '4px' }}></i> DLT ID: {selectedSmsTemplate?.dltTemplateId || '170716890000101'}
                                                </span>
                                            </div>
                                            <div style={{
                                                fontSize: '0.82rem', lineHeight: '1.55',
                                                color: isDark ? '#f8fafc' : '#1e293b',
                                                background: isDark ? 'rgba(59, 130, 246, 0.08)' : '#f0f9ff',
                                                padding: '12px 14px', borderRadius: '10px',
                                                fontFamily: 'monospace', whiteSpace: 'pre-wrap'
                                            }}>
                                                {smsPreviewText}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', padding: '0 4px' }}>
                                            <span>
                                                <i className="fas fa-font" style={{ marginRight: '4px', color: '#3b82f6' }}></i>
                                                Length: <strong>{smsPreviewText.length}</strong> chars ({Math.ceil(smsPreviewText.length / 160)} SMS Credit{Math.ceil(smsPreviewText.length / 160) > 1 ? 's' : ''})
                                            </span>
                                            <span style={{ color: '#3b82f6', fontWeight: 700 }}>
                                                SMSGatewayHub / Twilio Gateway Active
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* 3. RCS Preview (Google Messages Rich Card) */}
                                {previewChannel === 'rcs' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: isDark ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid #a5f3fc',
                                            borderRadius: '16px', overflow: 'hidden',
                                            maxWidth: '520px', margin: '0 auto', width: '100%',
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
                                        }}>
                                            {/* RCS Verified Business Header */}
                                            <div style={{
                                                background: isDark ? '#0f172a' : '#f0fdf4',
                                                padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #bbf7d0'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800 }}>
                                                        BP
                                                    </div>
                                                    <span style={{ fontSize: '0.76rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                        Bharat Properties
                                                    </span>
                                                    <i className="fas fa-check-circle" style={{ color: '#0284c7', fontSize: '12px' }}></i>
                                                </div>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#cffafe', color: '#0e7490' }}>
                                                    {rcsPreviewData.templateName ? `Template: ${rcsPreviewData.templateName}` : 'RCS Verified'}
                                                </span>
                                            </div>

                                            {/* Card Hero Banner */}
                                            <div style={{
                                                height: '110px',
                                                background: 'linear-gradient(135deg, #0e7490 0%, #1e293b 100%)',
                                                padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                                                color: '#fff', position: 'relative'
                                            }}>
                                                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.65rem', fontWeight: 800, background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '6px', backdropFilter: 'blur(4px)' }}>
                                                    EXCLUSIVE DEAL
                                                </span>
                                                <div style={{ fontSize: '0.92rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                                                    {rcsPreviewData.title}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                                                    📍 {rcsPreviewData.loc}
                                                </div>
                                            </div>

                                            {/* Card Content */}
                                            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>
                                                        {rcsPreviewData.price}
                                                    </span>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: isDark ? '#94a3b8' : '#475569' }}>
                                                        {rcsPreviewData.specs}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.74rem', color: isDark ? '#cbd5e1' : '#475569', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                    {rcsPreviewData.desc}
                                                </p>
                                            </div>

                                            {/* Interactive RCS Action Chips */}
                                            <div style={{ padding: '8px 14px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                                                {rcsPreviewData.buttons ? (
                                                    rcsPreviewData.buttons.map((btn, idx) => (
                                                        <span key={idx} style={{ padding: '5px 10px', borderRadius: '14px', background: isDark ? '#0f172a' : '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <i className={`fas ${btn.type === 'PHONE' ? 'fa-phone-alt' : btn.type === 'URL' ? 'fa-external-link-alt' : 'fa-reply'}`} style={{ fontSize: '10px' }}></i>
                                                            {btn.text}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <>
                                                        <span style={{ padding: '5px 10px', borderRadius: '14px', background: isDark ? '#0f172a' : '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <i className="fas fa-phone-alt" style={{ fontSize: '10px' }}></i> Call Advisor
                                                        </span>
                                                        <span style={{ padding: '5px 10px', borderRadius: '14px', background: isDark ? '#0f172a' : '#ecfeff', border: '1px solid #a5f3fc', color: '#0e7490', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <i className="fas fa-map-marker-alt" style={{ fontSize: '10px' }}></i> View Location
                                                        </span>
                                                        <span style={{ padding: '5px 10px', borderRadius: '14px', background: isDark ? '#0f172a' : '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <i className="fas fa-file-pdf" style={{ fontSize: '10px' }}></i> Brochure
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            <i className="fas fa-info-circle" style={{ marginRight: '4px', color: '#06b6d4' }}></i>
                                            {rcsPreviewData.templateName
                                                ? `Using RCS Rich Template "${rcsPreviewData.templateName}" with Google Jibe verification`
                                                : 'Delivered as verified Google RCS Business Messaging card on Android & iOS with instant SMS fallback'}
                                        </div>
                                    </div>
                                )}

                                {/* 4. Email Preview (HTML Newsletter) */}
                                {previewChannel === 'email' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
                                            borderRadius: '16px', overflow: 'hidden',
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                                            maxHeight: '280px', overflowY: 'auto'
                                        }}>
                                            {/* Email Top Header */}
                                            <div style={{
                                                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                                                padding: '14px 20px', color: '#ffffff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900, fontSize: '13px' }}>
                                                        BP
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.5px' }}>BHARAT PROPERTIES</div>
                                                        <div style={{ fontSize: '0.62rem', opacity: 0.8 }}>
                                                            {emailPreviewData.templateName ? `Template: ${emailPreviewData.templateName}` : 'Exclusive Investor Alert Bulletin'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: '4px' }}>
                                                    CONFIDENTIAL
                                                </span>
                                            </div>

                                            {/* Email Body */}
                                            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6366f1' }}>
                                                        Subject: {emailPreviewData.subject}
                                                    </div>
                                                    {!emailPreviewData.customHtml && (
                                                        <h4 style={{ margin: '4px 0 0', fontSize: '1rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                            {emailPreviewData.title}
                                                        </h4>
                                                    )}
                                                </div>

                                                {emailPreviewData.customHtml ? (
                                                    <div
                                                        style={{
                                                            fontSize: '0.8rem', lineHeight: '1.6',
                                                            color: isDark ? '#e2e8f0' : '#1e293b',
                                                            background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                                                            padding: '14px', borderRadius: '10px',
                                                            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0'
                                                        }}
                                                        dangerouslySetInnerHTML={{ __html: emailPreviewData.customHtml }}
                                                    />
                                                ) : (
                                                    <>
                                                        <div style={{
                                                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
                                                            background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                                                            padding: '10px 12px', borderRadius: '10px',
                                                            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 800 }}>PRICE</div>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981' }}>{emailPreviewData.price}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 800 }}>LOCATION</div>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{emailPreviewData.loc}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 800 }}>SPECIFICATIONS</div>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{emailPreviewData.specs}</div>
                                                            </div>
                                                        </div>

                                                        <div style={{ textAlign: 'center', marginTop: '6px' }}>
                                                            <span style={{
                                                                display: 'inline-block', padding: '8px 20px', borderRadius: '8px',
                                                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                                                color: '#ffffff', fontSize: '0.78rem', fontWeight: 800
                                                            }}>
                                                                View Full Dossier &amp; Book Site Visit
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            <i className="fas fa-info-circle" style={{ marginRight: '4px', color: '#ef4444' }}></i>
                                            {emailPreviewData.templateName
                                                ? `Using Email HTML Template "${emailPreviewData.templateName}" via Corporate SMTP Engine`
                                                : 'Automated responsive HTML email dispatch via NodeMailer with corporate branding'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Modal Footer ────────────────────────────────────────── */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                    background: isDark ? '#0f172a' : '#ffffff'
                }}>
                    <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>
                            Selected: <strong style={{ color: '#4f46e5' }}>{selectedDeals.length} Deal{selectedDeals.length > 1 ? 's' : ''}</strong>
                        </span>
                        <span>•</span>
                        <span>
                            Segments: <strong style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>{totalSelectedTargets} Selected</strong>
                        </span>
                        <span>•</span>
                        <span style={{
                            padding: '3px 10px', borderRadius: '8px',
                            background: audienceStats.totalAudienceReach > 0 ? (isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7') : 'transparent',
                            color: audienceStats.totalAudienceReach > 0 ? '#10b981' : '#94a3b8',
                            fontWeight: 800
                        }}>
                            <i className="fas fa-users" style={{ marginRight: '5px' }}></i>
                            Broadcast Audience: {audienceStats.totalAudienceReach} People ({audienceStats.totalDirectRecipients} Dispatches)
                        </span>
                        {channels.whatsapp && (
                            <span style={{
                                padding: '3px 10px', borderRadius: '8px',
                                background: isDark ? 'rgba(5, 150, 105, 0.15)' : '#ecfdf5',
                                color: isDark ? '#34d399' : '#059669',
                                border: isDark ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid #a7f3d0',
                                fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px'
                            }}>
                                <i className="fas fa-shield-alt"></i>
                                <span>5 Chats / Batch (3-10m Cooldown • Contacts & Groups Anti-Ban)</span>
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '10px 18px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                background: 'transparent',
                                color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={handleBroadcastSubmit}
                            disabled={isLaunchDisabled}
                            style={{
                                padding: '10px 24px', borderRadius: '10px', border: 'none',
                                background: isLaunchDisabled
                                    ? (isDark ? '#334155' : '#e2e8f0')
                                    : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                color: isLaunchDisabled ? '#94a3b8' : '#ffffff',
                                fontSize: '0.85rem', fontWeight: 800,
                                cursor: isLaunchDisabled ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: isLaunchDisabled ? 'none' : '0 4px 14px rgba(79, 70, 229, 0.4)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {sending ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    <span>Dispatching Broadcast...</span>
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-paper-plane"></i>
                                    <span>Launch Broadcast ({audienceStats.totalAudienceReach} Audience)</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DealBroadcastModal;
