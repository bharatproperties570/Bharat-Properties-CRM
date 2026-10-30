import { useTheme } from '../../../context/ThemeContext';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const isMarketingBroadcastContext = (tpl) => {
    if (!tpl) return false;
    const ctx = tpl.systemContext || tpl.context || tpl.ctx;
    if (Array.isArray(ctx)) return ctx.includes('marketing_broadcast');
    if (typeof ctx === 'string') return ctx === 'marketing_broadcast';
    return false;
};

function interpolateTemplateString(rawText, { meta, deal, isHtml = false, recipient = null, currentUser = null, users = [] }) {
    if (!rawText || typeof rawText !== 'string') return '';
    return resolveAllTemplateVariables(rawText, {
        deal,
        singleDeal: deal,
        meta,
        singleMeta: meta,
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

function MarketingTab({ dealId, deal, onRefresh }) {
    const { isDark } = useTheme();
    const { currentUser } = useUserContext();
    const { data: users = [] } = useUsers();
    const [loading, setLoading] = useState(true);
    const [sanitizing, setSanitizing] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [groups, setGroups] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);
    const [selectedContactGroups, setSelectedContactGroups] = useState([]);
    const [channels, setChannels] = useState({ whatsapp: true, sms: false, rcs: false, email: false });
    const [previewChannel, setPreviewChannel] = useState('whatsapp'); // 'whatsapp' | 'sms' | 'rcs' | 'email'
    const [sending, setSending] = useState(false);

    // 🎯 Matched Leads Target Audience State
    const [matchedLeads, setMatchedLeads] = useState([]);
    const [loadingMatchedLeads, setLoadingMatchedLeads] = useState(false);
    const [selectedMatchedLeads, setSelectedMatchedLeads] = useState([]);
    const [matchedLeadFilter, setMatchedLeadFilter] = useState('all'); // 'all' | 'preferred'
    const [matchedLeadSearch, setMatchedLeadSearch] = useState('');

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

    // 🚀 Multi-WhatsApp & Group Broadcast State
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [waGroups, setWaGroups] = useState([]);
    const [selectedWaGroups, setSelectedWaGroups] = useState([]);
    const [loadingWaGroups, setLoadingWaGroups] = useState(false);

    const meta = deal?.broadcastMetadata;

    const selectedAccount = useMemo(() => {
        return accounts.find(a => (a.id || a._id) === selectedAccountId) || accounts[0] || null;
    }, [accounts, selectedAccountId]);

    const isBaileys = selectedAccount?.provider === 'BAILEYS';

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
            console.warn('[MarketingTab] Failed to load WhatsApp groups:', e.message);
        } finally {
            setLoadingWaGroups(false);
        }
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setLoadingMatchedLeads(true);
                const [
                    groupsRes,
                    contactGroupsRes,
                    templatesRes,
                    analyticsRes,
                    registryRes,
                    accountsRes,
                    localWaTemplatesRes,
                    smsGatewayTemplatesRes,
                    localSmsTemplatesRes,
                    localRcsTemplatesRes,
                    localEmailTemplatesRes,
                    matchedLeadsRes
                ] = await Promise.all([
                    api.get('/company-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    api.get('/contact-groups', { _silentError: true }).catch(() => ({ data: { data: [] } })),
                    api.get('/marketing/whatsapp/templates', { _silentError: true }).catch(() => ({ data: { templates: [] } })),
                    api.get(`/marketing/broadcast/analytics/${dealId}`, { _silentError: true }).catch(() => ({ data: { success: false } })),
                    api.get('/marketing/whatsapp/variable-registry', { _silentError: true }).catch(() => ({ data: { success: true, data: { "1": "customer_name", "2": "property_list_default" } } })),
                    whatsappService.getAccounts().catch(() => ({ data: [] })),
                    systemSettingsAPI.getByKey('crm_whatsapp_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    smsService.getTemplates().catch(() => ({ data: [] })),
                    systemSettingsAPI.getByKey('crm_sms_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    systemSettingsAPI.getByKey('crm_rcs_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    systemSettingsAPI.getByKey('crm_email_templates', { _silentError: true }).catch(() => ({ data: { value: [] } })),
                    dealId ? api.get('/leads/match', { params: { dealId }, _silentError: true }).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } })
                ]);
                setGroups(groupsRes.data?.data || []);
                setContactGroups(contactGroupsRes.data?.data || []);

                const rawMatched = matchedLeadsRes.data?.data || [];
                const sortedMatched = [...rawMatched].sort((a, b) => {
                    if (Boolean(b.isPreferred) !== Boolean(a.isPreferred)) return b.isPreferred ? 1 : -1;
                    return (Number(b.score) || 0) - (Number(a.score) || 0);
                });
                setMatchedLeads(sortedMatched);

                // Only APPROVED templates
                const approved = (templatesRes.data?.templates || []).filter(t => t.status === 'APPROVED');
                setTemplates(approved);
                if (approved.length > 0 && !selectedTemplate) {
                    setSelectedTemplate(approved[0]);
                }
                if (analyticsRes.data?.success) setAnalytics(analyticsRes.data.data);
                setRegistry(registryRes.data?.data || {});

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

                // 2. Merge SMS Templates
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

                // 3. Merge RCS Templates
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

                // 4. Merge Email Templates
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

                // WhatsApp Accounts
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
            } catch (err) {
                console.error("Failed to fetch broadcast data", err);
            } finally {
                setLoading(false);
                setLoadingMatchedLeads(false);
            }
        };
        fetchData();
    }, [dealId, loadBaileysGroups]);

    const handleSanitize = async () => {
        setSanitizing(true);
        try {
            await api.post(`/deals/${dealId}/sanitize`);
            toast.success("Broadcast metadata updated!");
            onRefresh();
        } catch (error) {
            const errMsg = error.response?.data?.error || error.response?.data?.message || "Failed to prepare deal for broadcast";
            toast.error(errMsg);
        } finally {
            setSanitizing(false);
        }
    };

    // ── Channel Template Groupings ──────────────────────────────────────────
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

    const webTemplatePreviewText = useMemo(() => {
        if (!selectedWebTemplate) return null;
        return interpolateWebTemplateText(selectedWebTemplate, { meta, deal, currentUser, users });
    }, [selectedWebTemplate, meta, deal, currentUser, users]);

    // 🧠 Build live preview from selected template + deal metadata using Registry
    const templatePreview = useMemo(() => {
        if (!selectedTemplate || !meta) return null;
        const body = selectedTemplate.components?.find(c => c.type === 'BODY');
        if (!body) return null;

        const recipientName = '[Broker Company Name]';
        const recipientFirstName = '[Broker Company Name]';

        // Resolve assigned employee / user
        let assignedUser = null;
        if (deal?.assignedTo && typeof deal.assignedTo === 'object') {
            assignedUser = deal.assignedTo;
        } else if (deal?.assignedTo && Array.isArray(users) && users.length > 0) {
            assignedUser = users.find(u => String(u._id || u.id) === String(deal.assignedTo));
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
            deal?.team ||
            assignedUser?.team ||
            currentUser?.team,
            'Sales Team'
        );

        const assignedVisibility = getSafeString(
            deal?.visibleTo ||
            deal?.visibility ||
            'Everyone',
            'Everyone'
        );

        const inv = (deal?.inventoryId && typeof deal.inventoryId === 'object') ? deal.inventoryId : {};
        const spec = (deal?.unitSpecification && typeof deal.unitSpecification === 'object') ? deal.unitSpecification : {};
        const invSpec = (inv?.unitSpecification && typeof inv.unitSpecification === 'object') ? inv.unitSpecification : {};

        const rawSubCategory = getSafeString(
            deal?.subCategory || spec.subCategory || inv.subCategory || invSpec.subCategory || deal?.propertyType,
            ''
        );
        const dealSubCategory = cleanSubCategory(rawSubCategory) || '';
        const dealCategory = getSafeString(
            deal?.category || spec.category || inv.category || invSpec.category || deal?.propertyType,
            ''
        );
        const dealDirection = getSafeString(
            deal?.direction || spec.direction || inv.direction || invSpec.direction || inv.orientation || spec.orientation,
            ''
        );
        const dealRoadWidth = getSafeString(
            deal?.roadWidth || spec.roadWidth || inv.roadWidth || invSpec.roadWidth,
            ''
        );
        const dealFacing = getSafeString(
            deal?.facing || spec.facing || inv.facing || invSpec.facing,
            ''
        );
        const dealBuiltupType = getSafeString(
            deal?.builtupType || spec.builtupType || inv.builtupType || invSpec.builtupType,
            ''
        );
        const dealBlock = getSafeString(deal?.block || inv.block, '');
        const dealUnitNo = getSafeString(deal?.unitNo || deal?.unitNumber || inv.unitNumber || inv.unitNo, '');
        const dealIntent = getSafeString(deal?.intent || deal?.primaryDealIntent || inv?.intent || spec?.intent || targetLead?.intent, 'Sell');
        const dealTransactionType = getSafeString(deal?.transactionType || deal?.transaction_type || deal?.dealType || inv?.transactionType || spec?.transactionType, 'Full White');
        
        let dealSize = '';
        if (deal?.size && typeof deal.size === 'object') {
            const val = deal.size.value || '';
            let unit = deal.size.unit || 'Sq.Yd.';
            unit = String(unit).replace(/\s*\(\s*sq\.?\s*yd\.?\s*\)/gi, '').trim();
            dealSize = val ? `${val} ${unit}`.trim() : '';
        } else if (deal?.size) {
            dealSize = String(deal.size).trim();
        } else if (inv.size && typeof inv.size === 'object') {
            const val = inv.size.value || '';
            let unit = inv.size.unit || 'Sq.Ft.';
            unit = String(unit).replace(/\s*\(\s*sq\.?\s*yd\.?\s*\)/gi, '').trim();
            dealSize = val ? `${val} ${unit}`.trim() : '';
        }
        const dealSizeType = getSafeString(
            deal?.sizeType || 
            inv.sizeType || 
            deal?.unitSpecification?.sizeLabel || 
            inv.unitSpecification?.sizeLabel || 
            deal?.sizeLabel || 
            inv.sizeLabel, 
            ''
        ).trim();
        
        let dealFullSpecs = '';
        if (dealSizeType && dealSize) {
            const cleanSizeBase = dealSize.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
            const cleanTypeBase = dealSizeType.toLowerCase();
            const normSize = cleanSizeBase.replace(/[^a-z0-9]/g, '');
            const normType = cleanTypeBase.replace(/[^a-z0-9]/g, '');
            if (normType.includes(normSize)) {
                dealFullSpecs = dealSizeType;
            } else if (normSize.includes(normType)) {
                dealFullSpecs = dealSize;
            } else {
                dealFullSpecs = `${dealSize} (${dealSizeType})`;
            }
        } else {
            dealFullSpecs = dealSizeType || dealSize || getSafeString(meta.features?.[0], '');
        }

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
            projectName: getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), ''),
            projectname: getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), ''),
            title: getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), ''),
            location: getSafeString(meta?.location, ''),
            price: getSafeString(meta?.price, ''),
            description: getSafeString(meta?.description, ''),
            subcategory: dealSubCategory,
            sub_category: dealSubCategory,
            property_subcategory: dealSubCategory,
            propertycategory: dealCategory,
            category: dealCategory,
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
            sizetype: dealFullSpecs,
            size: dealFullSpecs,
            specs: dealFullSpecs,
            unitno: dealUnitNo || getSafeString(deal?.dealCode, 'DEAL-REF'),
            unit_no: dealUnitNo || getSafeString(deal?.dealCode, 'DEAL-REF'),
            block: dealBlock,
            intent: dealIntent,
            deal_intent: dealIntent,
            primaryDealIntent: dealIntent,
            dealIntent: dealIntent,
            transactiontype: dealTransactionType,
            transaction_type: dealTransactionType,
            transactionType: dealTransactionType,
            dealtype: dealTransactionType,
            deal_type: dealTransactionType,
            companyname: 'Bharat Properties'
        };

        const resolveSource = (source, idx) => {
            switch(source) {
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
                    return `1️⃣ 🏢 ${getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), 'Project')} | 📐 ${dealFullSpecs} | 💰 ${getSafeString(meta?.price, 'Price')}`;
                case 'property_list_dtl':
                case 'matchListDetailed':
                    return `1️⃣ 🏢 ${getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), 'Project')}\n📍 ${getSafeString(meta?.location, 'Kurukshetra')}\n💰 ${getSafeString(meta?.price, 'Price')}\n📐 ${dealFullSpecs}\n📝 ${getSafeString(meta?.description, '')}`;
                case 'subCategory':
                case 'subcategory':
                case 'sub_category':
                case 'property_subcategory':
                    return dealSubCategory;
                case 'sizeType':
                case 'sizetype':
                case 'size_type':
                case 'size':
                case 'specs':
                    return dealFullSpecs;
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
                case 'block':
                case 'block_name':
                    return dealBlock;
                case 'projectName': return getSafeString(cleanProjectName(meta?.title || deal?.projectName || deal?.title), '');
                case 'location': return getSafeString(meta.location, '');
                case 'price': return getSafeString(meta.price, '');
                case 'description': return getSafeString(meta.description, '');
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
    }, [selectedTemplate, meta, registry, currentUser, users, deal]);

    // 🧠 Rich Direct BNA text for WhatsApp Web Mode & Groups
    const bnaRichPreview = useMemo(() => {
        if (!meta) return null;
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

        preview += `📝 *Details:* ${getSafeString(meta.description || deal?.remarks, 'Verified property listing')}\n\n` +
            `🔗 Ref: ${getSafeString(deal?.dealCode, dealId?.substring(0, 8).toUpperCase() || 'DEAL-REF')}\n` +
            `Contact us for commission split and site visits.`;
        return preview;
    }, [meta, deal, dealId]);

    const defaultSmsPreviewText = useMemo(() => {
        if (!meta) return '';
        const title = getSafeString(meta.title || deal?.title || deal?.projectName, 'Prime Deal');
        const loc = getSafeString(meta.location || deal?.location, 'Kurukshetra');
        const price = getSafeString(meta.price, deal?.price ? `₹ ${Number(deal.price).toLocaleString('en-IN')}` : 'P.O.R');
        const ref = getSafeString(deal?.dealCode, dealId?.substring(0, 8).toUpperCase() || 'DEAL-REF');
        return `[BHARAT PROPERTIES] Verified Deal: ${title} at ${loc}. Price: ${price}. Ref: ${ref}. Inspection ready. Call 8700000000 for brochure & booking.`;
    }, [meta, deal, dealId]);

    const smsPreviewText = useMemo(() => {
        if (selectedSmsTemplate) {
            return interpolateWebTemplateText(selectedSmsTemplate, { meta, deal, currentUser, users }) || defaultSmsPreviewText;
        }
        return defaultSmsPreviewText;
    }, [selectedSmsTemplate, meta, deal, defaultSmsPreviewText, currentUser, users]);

    const rcsPreviewData = useMemo(() => {
        const title = getSafeString(meta?.title || deal?.title || deal?.projectName, 'Featured Property Deal');
        const loc = getSafeString(meta?.location || deal?.location, 'Kurukshetra');
        const price = getSafeString(meta?.price, deal?.price ? `₹ ${Number(deal.price).toLocaleString('en-IN')}` : 'Price on Request');
        const specs = getSafeString(meta?.features || deal?.unitType, 'Prime Specification');
        const defaultDesc = getSafeString(meta?.description || deal?.remarks, 'Prime location property with high capital appreciation potential and clear title.');
        const desc = selectedRcsTemplate
            ? interpolateWebTemplateText(selectedRcsTemplate, { meta, deal, currentUser, users })
            : defaultDesc;
        const ref = getSafeString(deal?.dealCode, dealId?.substring(0, 8).toUpperCase() || 'DEAL-REF');
        const buttons = Array.isArray(selectedRcsTemplate?.buttons) && selectedRcsTemplate.buttons.length > 0
            ? selectedRcsTemplate.buttons.map(btn => ({
                ...btn,
                text: interpolateTemplateString(getSafeString(btn.text, 'Action'), { meta, deal, currentUser, users })
            }))
            : null;
        return { title, loc, price, specs, desc, ref, buttons, templateName: getSafeString(selectedRcsTemplate?.name, '') || null };
    }, [meta, deal, dealId, selectedRcsTemplate, currentUser, users]);

    const emailPreviewData = useMemo(() => {
        const title = getSafeString(meta?.title || deal?.title || deal?.projectName, 'Exclusive Verified Deal');
        const loc = getSafeString(meta?.location || deal?.location, 'Kurukshetra');
        const price = getSafeString(meta?.price, deal?.price ? `₹ ${Number(deal.price).toLocaleString('en-IN')}` : 'Price on Request');
        const specs = getSafeString(meta?.features || deal?.unitType, 'Prime Spec');
        const ref = getSafeString(deal?.dealCode, dealId?.substring(0, 8).toUpperCase() || 'DEAL-REF');
        const subject = selectedEmailTemplate?.subject
            ? interpolateTemplateString(getSafeString(selectedEmailTemplate.subject), { meta, deal, currentUser, users })
            : `[Exclusive Deal Alert] ${title}`;
        const customHtml = selectedEmailTemplate
            ? interpolateTemplateString(getSafeString(selectedEmailTemplate.content || selectedEmailTemplate.body, ''), { meta, deal, isHtml: true, currentUser, users })
            : null;
        return { title, loc, price, specs, ref, subject, customHtml, templateName: getSafeString(selectedEmailTemplate?.name, '') || null };
    }, [meta, deal, dealId, selectedEmailTemplate, currentUser, users]);

    const filteredMatchedLeads = useMemo(() => {
        return matchedLeads.filter(lead => {
            if (matchedLeadFilter === 'preferred' && !lead.isPreferred) return false;
            if (matchedLeadSearch.trim()) {
                const q = matchedLeadSearch.toLowerCase();
                const name = getSafeString(lead.contactDetails?.name || lead.fullName || lead.name, '').toLowerCase();
                const mobile = getSafeString(lead.contactDetails?.mobile || lead.mobile, '').toLowerCase();
                const loc = getSafeString(lead.location, '').toLowerCase();
                const req = getSafeString(lead.requirement, '').toLowerCase();
                return name.includes(q) || mobile.includes(q) || loc.includes(q) || req.includes(q);
            }
            return true;
        });
    }, [matchedLeads, matchedLeadFilter, matchedLeadSearch]);

    // 📊 Enterprise Target Audience Reach & Deduplicated Member Count Engine
    const audienceStats = useMemo(() => {
        const brokerMemberSet = new Set();
        let brokerFallbackCount = 0;
        selectedGroups.forEach(gid => {
            const grp = groups.find(g => String(g._id) === String(gid));
            if (grp) {
                if (Array.isArray(grp.memberIds) && grp.memberIds.length > 0) {
                    grp.memberIds.forEach(id => brokerMemberSet.add(String(id)));
                } else {
                    brokerFallbackCount += Number(grp.memberCount || 0);
                }
            }
        });
        const uniqueBrokerMembersCount = brokerMemberSet.size + brokerFallbackCount;

        const contactMemberSet = new Set();
        let contactFallbackCount = 0;
        selectedContactGroups.forEach(gid => {
            const grp = contactGroups.find(g => String(g._id) === String(gid));
            if (grp) {
                if (Array.isArray(grp.memberIds) && grp.memberIds.length > 0) {
                    grp.memberIds.forEach(id => contactMemberSet.add(String(id)));
                } else {
                    contactFallbackCount += Number(grp.memberCount || 0);
                }
            }
        });
        const uniqueContactMembersCount = contactMemberSet.size + contactFallbackCount;

        const selectedMatchedLeadsCount = selectedMatchedLeads.length;

        let waGroupParticipantsCount = 0;
        selectedWaGroups.forEach(jid => {
            const wg = waGroups.find(g => g.id === jid);
            if (wg) {
                waGroupParticipantsCount += Number(wg.participantsCount || 1);
            }
        });

        const totalDirectRecipients =
            uniqueBrokerMembersCount +
            uniqueContactMembersCount +
            selectedMatchedLeadsCount +
            selectedWaGroups.length;

        const totalAudienceReach =
            uniqueBrokerMembersCount +
            uniqueContactMembersCount +
            selectedMatchedLeadsCount +
            waGroupParticipantsCount;

        return {
            uniqueBrokerMembersCount,
            uniqueContactMembersCount,
            selectedMatchedLeadsCount,
            selectedWaGroupsCount: selectedWaGroups.length,
            waGroupParticipantsCount,
            totalDirectRecipients,
            totalAudienceReach
        };
    }, [selectedGroups, groups, selectedContactGroups, contactGroups, selectedMatchedLeads, selectedWaGroups, waGroups]);

    const totalSelectedTargets = selectedGroups.length + selectedContactGroups.length + selectedMatchedLeads.length + selectedWaGroups.length;
    const activeChannelCount = Object.values(channels).filter(Boolean).length;
    const isLaunchDisabled = sending || totalSelectedTargets === 0 || activeChannelCount === 0 || (channels.whatsapp && !isBaileys && !selectedTemplate);

    const handleBroadcast = async () => {
        const hasCompany = selectedGroups.length > 0;
        const hasContact = selectedContactGroups.length > 0;
        const hasMatchedLead = selectedMatchedLeads.length > 0;
        const hasWaGroup = selectedWaGroups.length > 0;

        if (!hasCompany && !hasContact && !hasMatchedLead && !hasWaGroup) {
            toast.error("Please select at least one broker group, contact group, matched lead, or WhatsApp group");
            return;
        }
        const selectedChannels = Object.entries(channels).filter(([_, v]) => v).map(([k]) => k);
        if (selectedChannels.length === 0) {
            toast.error("Please select at least one omnichannel delivery channel");
            return;
        }
        if (channels.whatsapp && !isBaileys && !selectedTemplate) {
            toast.error("Select a WhatsApp template for Meta Cloud API, or switch to WhatsApp Web");
            return;
        }

        setSending(true);
        try {
            const res = await api.post('/marketing/broadcast/bna', {
                dealId,
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
                templateText: channels.whatsapp && isBaileys && selectedWebTemplate ? webTemplatePreviewText : undefined,
                isBaileys: Boolean(isBaileys),
                language: isBaileys ? undefined : (selectedTemplate?.language || 'en'),
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
            });
            if (res.data.success) {
                toast.success(`Broadcast dispatched to ${res.data.dispatchCount} recipients!`);
                const aRes = await api.get(`/marketing/broadcast/analytics/${dealId}`);
                if (aRes.data?.success) setAnalytics(aRes.data.data);
            }
        } catch (error) {
            const errMsg = error.response?.data?.error || "Broadcast failed";
            toast.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: '80px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Step 1: Metadata Preparation ─────────────────────────── */}
            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: meta?.isReady ? '16px' : '0' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: meta?.isReady ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className={`fas ${meta?.isReady ? 'fa-check-circle' : 'fa-shield-alt'}`} style={{ color: meta?.isReady ? '#16a34a' : '#2563eb', fontSize: '14px' }}></i>
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>
                                {meta?.isReady ? 'Broadcast Ready' : 'Step 1 — Prepare Deal'}
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0 36px', fontSize: '0.72rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                            {meta?.isReady
                                ? `Last updated: ${meta.lastSanitizedAt ? new Date(meta.lastSanitizedAt).toLocaleString('en-IN') : 'Recently'}`
                                : 'Sanitize deal data before broadcasting to brokers'}
                        </p>
                    </div>
                    <button
                        onClick={handleSanitize}
                        disabled={sanitizing}
                        style={{
                            padding: '8px 16px', fontSize: '0.78rem', fontWeight: 700,
                            borderRadius: '10px', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                            background: meta?.isReady ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff' : '#6366f1', color: meta?.isReady ? isDark ? 'var(--text-main)' : '#475569' : '#fff',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        {sanitizing ? <i className="fas fa-spinner fa-spin"></i> : <i className={`fas ${meta?.isReady ? 'fa-sync' : 'fa-bolt'}`}></i>}
                        {sanitizing ? 'Preparing...' : (meta?.isReady ? 'Refresh' : 'Prepare Now')}
                    </button>
                </div>

                {/* Deal Metadata Preview */}
                {meta?.isReady && (
                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '12px', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px' }}>DEAL DATA FOR BROADCAST</span>
                            <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>
                                <i className="fas fa-check-circle"></i> Verified
                            </span>
                        </div>
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>{renderValue(meta.title, 'Featured Deal')}</div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1' }}>
                                    <i className="fas fa-tag" style={{ marginRight: '4px' }}></i>{renderValue(meta.price, 'Price on Request')}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                    <i className="fas fa-map-marker-alt" style={{ marginRight: '4px' }}></i>{renderValue(meta.location, 'Kurukshetra')}
                                </span>
                            </div>
                            {meta.detailedSections?.map((sec, idx) => (
                                <div key={idx} style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>{renderValue(sec.title)}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {(sec.lines || []).map((line, li) => (
                                            <span key={li} style={{ fontSize: '0.7rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 8px', color: isDark ? 'var(--text-main)' : '#475569' }}>
                                                {renderValue(line)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Step 2: Broadcast Configuration ──────────────────────── */}
            {meta?.isReady && (
                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-bullhorn" style={{ color: '#d97706', fontSize: '13px' }}></i>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>Step 2 — Configure Omnichannel Broadcast</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                        {/* LEFT: Omnichannel Delivery Channels + Dynamic Per-Channel Template Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                            {/* Omnichannel Delivery Channels */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '12px', padding: '14px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#64748b', letterSpacing: '0.5px', margin: 0, display: 'block' }}>
                                            OMNICHANNEL DELIVERY CHANNELS <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                                            Select channels to display their template selectors
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 800, background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff', padding: '2px 8px', borderRadius: '10px' }}>
                                        {activeChannelCount} Active
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {[
                                        { key: 'whatsapp', icon: 'fab fa-whatsapp', color: '#10b981', label: 'WhatsApp', note: isBaileys ? (selectedWebTemplate ? `📢 ${selectedWebTemplate.name}` : 'Direct Rich') : 'Meta Cloud API' },
                                        { key: 'sms', icon: 'fas fa-comment-dots', color: '#3b82f6', label: 'SMS', note: selectedSmsTemplate ? `📢 ${selectedSmsTemplate.name}` : 'DLT High-Priority' },
                                        { key: 'rcs', icon: 'fas fa-mobile-alt', color: '#06b6d4', label: 'RCS', note: selectedRcsTemplate ? `📢 ${selectedRcsTemplate.name}` : 'Verified Rich Card' },
                                        { key: 'email', icon: 'fas fa-envelope', color: '#ef4444', label: 'Email', note: selectedEmailTemplate ? `📢 ${selectedEmailTemplate.name}` : 'HTML Newsletter' }
                                    ].map(ch => (
                                        <label key={ch.key} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px',
                                            border: `1.5px solid ${channels[ch.key] ? ch.color : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            borderRadius: '10px',
                                            background: channels[ch.key] ? (isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff') : 'transparent',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={channels[ch.key]}
                                                onChange={e => handleToggleChannel(ch.key, e.target.checked)}
                                                style={{ accentColor: ch.color, width: '15px', height: '15px' }}
                                            />
                                            <i className={ch.icon} style={{ color: ch.color, fontSize: '15px' }}></i>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>{ch.label}</div>
                                                <div style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.note}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {activeChannelCount === 0 && (
                                <div style={{
                                    padding: '14px', borderRadius: '12px',
                                    background: isDark ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2',
                                    border: '1px dashed #ef4444', textAlign: 'center',
                                    fontSize: '0.74rem', color: isDark ? '#fca5a5' : '#b91c1c', fontWeight: 700
                                }}>
                                    Select at least one Omnichannel above to configure its broadcast template.
                                </div>
                            )}

                            {/* ── 1. WhatsApp Configuration & Template (Shown when channels.whatsapp is checked) ── */}
                            {channels.whatsapp && (
                                <div style={{
                                    background: isDark ? 'rgba(16, 185, 129, 0.04)' : '#f0fdf4',
                                    border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #bbf7d0',
                                    borderRadius: '12px', padding: '14px',
                                    display: 'flex', flexDirection: 'column', gap: '12px'
                                }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#34d399' : '#065f46', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                                            <i className="fab fa-whatsapp" style={{ marginRight: '5px', color: '#10b981' }}></i>
                                            WHATSAPP SENDER ACCOUNT <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        {accounts.length === 0 ? (
                                            <div style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                                                No WhatsApp accounts connected.
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
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #86efac', fontSize: '0.8rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
                                                    outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                {accounts.map(acc => {
                                                    const accId = acc.id || acc._id;
                                                    const isWhatsAppWeb = acc.provider === 'BAILEYS';
                                                    return (
                                                        <option key={accId} value={accId}>
                                                            {isWhatsAppWeb ? '🟢 [WhatsApp Web] ' : '🔵 [Meta Cloud API] '}
                                                            {acc.name || acc.phoneNumber || 'WhatsApp Account'}
                                                            {acc.phoneNumber ? ` (+${acc.phoneNumber.replace(/^\+/, '')})` : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        )}
                                    </div>

                                    {isBaileys ? (
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#065f46', letterSpacing: '0.5px', margin: 0 }}>
                                                    WHATSAPP TEMPLATE SELECTION
                                                </label>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '10px', background: '#dcfce7', color: '#15803d' }}>
                                                    ✓ {allWhatsAppTemplates.length} Templates
                                                </span>
                                            </div>
                                            <select
                                                value={selectedWebTemplateId}
                                                onChange={(e) => {
                                                    setSelectedWebTemplateId(e.target.value);
                                                    setPreviewChannel('whatsapp');
                                                }}
                                                style={{
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #86efac', fontSize: '0.8rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
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
                                        </div>
                                    ) : (
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#065f46', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                                                META APPROVED WHATSAPP TEMPLATE <span style={{ color: '#ef4444' }}>*</span>
                                            </label>
                                            <select
                                                value={selectedTemplate?.name || ''}
                                                onChange={(e) => {
                                                    setSelectedTemplate(templates.find(t => t.name === e.target.value) || null);
                                                    setPreviewChannel('whatsapp');
                                                }}
                                                style={{
                                                    width: '100%', padding: '9px 12px', borderRadius: '10px',
                                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700,
                                                    background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
                                                    outline: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <option value="">— Choose Approved Template —</option>
                                                {templates.map(t => (
                                                    <option key={t.name} value={t.name}>
                                                        {t.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 2. SMS Template Selection (Shown when channels.sms is checked) ── */}
                            {channels.sms && (
                                <div style={{
                                    background: isDark ? 'rgba(59, 130, 246, 0.04)' : '#eff6ff',
                                    border: isDark ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid #bfdbfe',
                                    borderRadius: '12px', padding: '14px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#60a5fa' : '#1e40af', letterSpacing: '0.5px', margin: 0 }}>
                                            <i className="fas fa-comment-dots" style={{ marginRight: '5px', color: '#3b82f6' }}></i>
                                            SMS DLT TEMPLATE SELECTION
                                        </label>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '10px', background: '#dbeafe', color: '#1e40af' }}>
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
                                            width: '100%', padding: '9px 12px', borderRadius: '10px',
                                            border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #93c5fd', fontSize: '0.8rem', fontWeight: 700,
                                            background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
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
                                    <div style={{ marginTop: '6px', fontSize: '0.65rem', color: isDark ? '#94a3b8' : '#1e40af', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Header: <strong>{selectedSmsTemplate?.dltHeaderId || 'BHRPRP'}</strong></span>
                                        <span>{smsPreviewText.length} chars ({Math.ceil(smsPreviewText.length / 160)} Credit{Math.ceil(smsPreviewText.length / 160) > 1 ? 's' : ''})</span>
                                    </div>
                                </div>
                            )}

                            {/* ── 3. RCS Template Selection (Shown when channels.rcs is checked) ── */}
                            {channels.rcs && (
                                <div style={{
                                    background: isDark ? 'rgba(6, 182, 212, 0.04)' : '#ecfeff',
                                    border: isDark ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid #a5f3fc',
                                    borderRadius: '12px', padding: '14px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#22d3ee' : '#0e7490', letterSpacing: '0.5px', margin: 0 }}>
                                            <i className="fas fa-mobile-alt" style={{ marginRight: '5px', color: '#06b6d4' }}></i>
                                            RCS RICH CARD TEMPLATE SELECTION
                                        </label>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '10px', background: '#cffafe', color: '#0891b2' }}>
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
                                            width: '100%', padding: '9px 12px', borderRadius: '10px',
                                            border: isDark ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid #67e8f9', fontSize: '0.8rem', fontWeight: 700,
                                            background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
                                            outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">⭐ Default Verified RCS Rich Card (Recommended)</option>
                                        {rcsBroadcastTemplates.length > 0 && (
                                            <optgroup label="📢 Marketing Broadcast RCS Templates">
                                                {rcsBroadcastTemplates.map(t => (
                                                    <option key={t.id || t.name} value={t.id || t.name}>
                                                        📢 {t.name} ({t.buttons?.length || 3} CTA Buttons)
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {otherRcsTemplates.length > 0 && (
                                            <optgroup label="📋 All RCS Rich Templates">
                                                {otherRcsTemplates.map(t => (
                                                    <option key={t.id || t.name} value={t.id || t.name}>
                                                        📱 {t.name} ({t.buttons?.length || 3} CTA Buttons)
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            )}

                            {/* ── 4. Email Template Selection (Shown when channels.email is checked) ── */}
                            {channels.email && (
                                <div style={{
                                    background: isDark ? 'rgba(239, 68, 68, 0.04)' : '#fef2f2',
                                    border: isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid #fecaca',
                                    borderRadius: '12px', padding: '14px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#f87171' : '#991b1b', letterSpacing: '0.5px', margin: 0 }}>
                                            <i className="fas fa-envelope" style={{ marginRight: '5px', color: '#ef4444' }}></i>
                                            EMAIL HTML TEMPLATE SELECTION
                                        </label>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '10px', background: '#fee2e2', color: '#dc2626' }}>
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
                                            width: '100%', padding: '9px 12px', borderRadius: '10px',
                                            border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fca5a5', fontSize: '0.8rem', fontWeight: 700,
                                            background: isDark ? '#1e293b' : '#fff', color: isDark ? 'var(--text-main)' : '#0f172a',
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
                                    <div style={{ marginTop: '6px', fontSize: '0.65rem', color: isDark ? '#94a3b8' : '#991b1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        Subject: <strong>{emailPreviewData.subject}</strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Target Audience + Matched Leads + Launch */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Target Audience Header with Total Reach Badge */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', borderRadius: '12px',
                                background: isDark ? 'rgba(99, 102, 241, 0.08)' : '#eef2ff',
                                border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid #c7d2fe'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-bullseye" style={{ color: '#4f46e5', fontSize: '14px' }}></i>
                                    <span style={{ fontSize: '0.76rem', fontWeight: 900, color: isDark ? '#e0e7ff' : '#312e81', letterSpacing: '0.5px' }}>
                                        TARGET AUDIENCE
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 900, padding: '3px 9px', borderRadius: '20px',
                                        background: audienceStats.totalAudienceReach > 0 ? '#4f46e5' : (isDark ? '#1e293b' : '#fff'),
                                        color: audienceStats.totalAudienceReach > 0 ? '#fff' : '#64748b'
                                    }}>
                                        {audienceStats.totalAudienceReach} Total Reach
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: '20px',
                                        background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7',
                                        color: '#15803d'
                                    }}>
                                        {audienceStats.totalDirectRecipients} Direct
                                    </span>
                                </div>
                            </div>

                            {/* 🎯 MATCHED LEADS SECTION (Enterprise Buyer Intent Matching) */}
                            <div style={{
                                background: isDark ? 'rgba(139, 92, 246, 0.05)' : '#faf5ff',
                                border: isDark ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid #e9d5ff',
                                borderRadius: '12px', padding: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? '#ddd6fe' : '#6b21a8', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-user-check" style={{ color: '#7c3aed' }}></i>
                                        MATCHED LEADS ({matchedLeads.length})
                                        {selectedMatchedLeads.length > 0 && (
                                            <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px', background: '#7c3aed', color: '#fff', fontWeight: 800 }}>
                                                {selectedMatchedLeads.length} Selected
                                            </span>
                                        )}
                                    </label>
                                    {matchedLeads.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMatchedLeads(filteredMatchedLeads.map(l => String(l._id)))}
                                                style={{ fontSize: '0.65rem', fontWeight: 800, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Select All ({filteredMatchedLeads.length})
                                            </button>
                                            <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>|</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMatchedLeads([])}
                                                style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {matchedLeads.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', background: isDark ? '#1e293b' : '#f3e8ff', borderRadius: '8px', padding: '2px' }}>
                                            {[
                                                { id: 'all', label: `All (${matchedLeads.length})` },
                                                { id: 'preferred', label: `⭐ Preferred (${matchedLeads.filter(l => l.isPreferred).length})` }
                                            ].map(f => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    onClick={() => setMatchedLeadFilter(f.id)}
                                                    style={{
                                                        padding: '3px 8px', borderRadius: '6px', border: 'none',
                                                        background: matchedLeadFilter === f.id ? '#7c3aed' : 'transparent',
                                                        color: matchedLeadFilter === f.id ? '#fff' : (isDark ? '#cbd5e1' : '#6b21a8'),
                                                        fontSize: '0.64rem', fontWeight: 800, cursor: 'pointer'
                                                    }}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            value={matchedLeadSearch}
                                            onChange={(e) => setMatchedLeadSearch(e.target.value)}
                                            placeholder="Search lead name, mobile, location..."
                                            style={{
                                                flex: 1, padding: '4px 10px', borderRadius: '8px',
                                                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #d8b4fe',
                                                background: isDark ? '#0f172a' : '#fff',
                                                color: isDark ? '#f8fafc' : '#1e293b',
                                                fontSize: '0.7rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                )}

                                {loadingMatchedLeads ? (
                                    <div style={{ fontSize: '0.73rem', color: '#94a3b8', padding: '12px', textAlign: 'center' }}>
                                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px', color: '#7c3aed' }}></i> Matching high-intent buyer leads...
                                    </div>
                                ) : filteredMatchedLeads.length === 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', padding: '10px', textAlign: 'center', border: '1px dashed #d8b4fe', borderRadius: '8px' }}>
                                        {matchedLeads.length === 0 ? 'No matching buyer leads found for this deal criteria' : 'No matched leads match your filter'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '175px', overflowY: 'auto', paddingRight: '4px' }}>
                                        {filteredMatchedLeads.map(lead => {
                                            const lid = String(lead._id);
                                            const isSelected = selectedMatchedLeads.includes(lid);
                                            const leadName = getSafeString(lead.contactDetails?.name || lead.fullName || lead.name, 'Prospect Lead');
                                            const leadMobile = getSafeString(lead.contactDetails?.mobile || lead.mobile, '');
                                            const score = Math.round(Number(lead.score) || 0);
                                            const scoreColor = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#6366f1';
                                            const reqSummary = [
                                                getSafeString(lead.requirement, ''),
                                                getSafeString(lead.propertyType, ''),
                                                getSafeString(lead.location, '')
                                            ].filter(Boolean).join(' • ');

                                            return (
                                                <div
                                                    key={lid}
                                                    onClick={() => {
                                                        if (isSelected) setSelectedMatchedLeads(selectedMatchedLeads.filter(id => id !== lid));
                                                        else setSelectedMatchedLeads([...selectedMatchedLeads, lid]);
                                                    }}
                                                    style={{
                                                        padding: '8px 10px', borderRadius: '10px',
                                                        border: `1.5px solid ${isSelected ? '#7c3aed' : (isDark ? 'rgba(255,255,255,0.08)' : '#e9d5ff')}`,
                                                        background: isSelected
                                                            ? (isDark ? 'rgba(124, 58, 237, 0.2)' : '#f3e8ff')
                                                            : (isDark ? '#0f172a' : '#ffffff'),
                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                        <div style={{
                                                            width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                                                            border: isSelected ? 'none' : '1.5px solid #cbd5e1',
                                                            background: isSelected ? '#7c3aed' : 'transparent',
                                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px'
                                                        }}>
                                                            {isSelected && <i className="fas fa-check"></i>}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {leadName}
                                                                </span>
                                                                {lead.isPreferred && (
                                                                    <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                                                                        ⭐ Preferred
                                                                    </span>
                                                                )}
                                                                {leadMobile && (
                                                                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                                                        📱 {leadMobile}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {reqSummary && (
                                                                <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {reqSummary}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.64rem', fontWeight: 900, padding: '2px 7px', borderRadius: '12px', flexShrink: 0,
                                                        background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}40`
                                                    }}>
                                                        {score}% Match
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 🏢 BROKER GROUPS */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#64748b', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-handshake" style={{ color: '#6366f1' }}></i>
                                        BROKER GROUPS ({groups.length})
                                        {audienceStats.uniqueBrokerMembersCount > 0 && (
                                            <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px', background: '#6366f1', color: '#fff', fontWeight: 800 }}>
                                                {audienceStats.uniqueBrokerMembersCount} Brokers
                                            </span>
                                        )}
                                    </label>
                                    {groups.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedGroups(groups.map(g => g._id))}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Select All
                                            </button>
                                            <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>|</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedGroups([])}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {groups.length === 0 ? (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '12px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                        No broker groups found
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {groups.map(g => {
                                            const isSelected = selectedGroups.includes(g._id);
                                            const mCount = Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0));
                                            return (
                                                <button
                                                    key={g._id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) setSelectedGroups(selectedGroups.filter(id => id !== g._id));
                                                        else setSelectedGroups([...selectedGroups, g._id]);
                                                    }}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.74rem', fontWeight: 700,
                                                        border: `1.5px solid ${isSelected ? g.color || '#6366f1' : '#e2e8f0'}`,
                                                        background: isSelected ? (g.color || '#6366f1') : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                                        color: isSelected ? '#fff' : isDark ? 'var(--text-main)' : '#475569',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                    <span>{g.name}</span>
                                                    <span style={{
                                                        fontSize: '0.62rem', padding: '1px 6px', borderRadius: '10px',
                                                        background: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'),
                                                        color: isSelected ? '#fff' : '#64748b', fontWeight: 800
                                                    }}>
                                                        {mCount}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 👥 CONTACT GROUPS */}
                            <div style={{ marginTop: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#64748b', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-address-book" style={{ color: '#10b981' }}></i>
                                        CONTACT GROUPS ({contactGroups.length})
                                        {audienceStats.uniqueContactMembersCount > 0 && (
                                            <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px', background: '#10b981', color: '#fff', fontWeight: 800 }}>
                                                {audienceStats.uniqueContactMembersCount} Contacts
                                            </span>
                                        )}
                                    </label>
                                    {contactGroups.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedContactGroups(contactGroups.map(g => g._id))}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Select All
                                            </button>
                                            <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>|</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedContactGroups([])}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {contactGroups.length === 0 ? (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '12px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                        No contact groups found
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {contactGroups.map(g => {
                                            const isSelected = selectedContactGroups.includes(g._id);
                                            const mCount = Number(g.memberCount ?? (Array.isArray(g.memberIds) ? g.memberIds.length : 0));
                                            return (
                                                <button
                                                    key={g._id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) setSelectedContactGroups(selectedContactGroups.filter(id => id !== g._id));
                                                        else setSelectedContactGroups([...selectedContactGroups, g._id]);
                                                    }}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.74rem', fontWeight: 700,
                                                        border: `1.5px solid ${isSelected ? g.color || '#10b981' : '#e2e8f0'}`,
                                                        background: isSelected ? (g.color || '#10b981') : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                                        color: isSelected ? '#fff' : isDark ? 'var(--text-main)' : '#475569',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {isSelected && <i className="fas fa-check" style={{ fontSize: '10px' }}></i>}
                                                    <span>{g.name}</span>
                                                    <span style={{
                                                        fontSize: '0.62rem', padding: '1px 6px', borderRadius: '10px',
                                                        background: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'),
                                                        color: isSelected ? '#fff' : '#64748b', fontWeight: 800
                                                    }}>
                                                        {mCount}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 📱 WHATSAPP GROUPS (@g.us) */}
                            <div style={{ marginTop: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 900, color: isDark ? 'var(--text-muted)' : '#64748b', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fab fa-whatsapp" style={{ color: '#25D366' }}></i>
                                        WHATSAPP GROUPS {waGroups.length > 0 ? `(${waGroups.length})` : ''}
                                        {audienceStats.selectedWaGroupsCount > 0 && (
                                            <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px', background: '#128C7E', color: '#fff', fontWeight: 800 }}>
                                                {audienceStats.selectedWaGroupsCount} Groups • {audienceStats.waGroupParticipantsCount} Members
                                            </span>
                                        )}
                                    </label>
                                    {waGroups.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedWaGroups(waGroups.map(g => g.id))}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Select All
                                            </button>
                                            <span style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>|</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedWaGroups([])}
                                                style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {loadingWaGroups ? (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '12px', textAlign: 'center' }}>
                                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading WhatsApp Groups...
                                    </div>
                                ) : waGroups.length === 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', padding: '10px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                        {isBaileys ? 'No WhatsApp groups found on this account' : 'Switch to WhatsApp Web account to load WhatsApp Groups'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                                        {[...waGroups].sort((a, b) => {
                                            const aCan = a.canSend !== false;
                                            const bCan = b.canSend !== false;
                                            if (aCan !== bCan) return aCan ? -1 : 1;
                                            return (b.participantsCount || 0) - (a.participantsCount || 0);
                                        }).map(g => {
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
                                                        padding: '5px 12px', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700,
                                                        border: `1.5px solid ${isSelected ? '#128C7E' : '#e2e8f0'}`,
                                                        background: isSelected ? '#128C7E' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
                                                        color: isSelected ? '#fff' : isDark ? 'var(--text-main)' : '#475569',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        opacity: g.canSend === false ? 0.75 : 1
                                                    }}
                                                    title={g.canSend === false ? `${g.subject} (Admin-only Channel)` : g.subject}
                                                >
                                                    <i className="fab fa-whatsapp" style={{ fontSize: '11px', color: isSelected ? '#fff' : '#128C7E' }}></i>
                                                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {g.subject || g.name || 'Group'}
                                                    </span>
                                                    {g.canSend === false && (
                                                        <span style={{ fontSize: '10px' }} title="Admin-only channel">🔒</span>
                                                    )}
                                                    {g.participantsCount ? (
                                                        <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '10px', background: isSelected ? 'rgba(255,255,255,0.2)' : '#f1f5f9', color: isSelected ? '#fff' : '#64748b' }}>
                                                            {g.participantsCount}
                                                        </span>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 📊 LIVE BROADCAST AUDIENCE REACH BREAKDOWN BANNER */}
                            <div style={{
                                padding: '10px 12px', borderRadius: '12px',
                                background: isDark ? 'rgba(15, 23, 42, 0.7)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center'
                            }}>
                                <div style={{ padding: '6px 4px', borderRadius: '8px', background: isDark ? 'rgba(124, 58, 237, 0.12)' : '#f3e8ff' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#7c3aed' }}>{audienceStats.selectedMatchedLeadsCount}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#c4b5fd' : '#6b21a8' }}>MATCHED LEADS</div>
                                </div>
                                <div style={{ padding: '6px 4px', borderRadius: '8px', background: isDark ? 'rgba(99, 102, 241, 0.12)' : '#eef2ff' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#4f46e5' }}>{audienceStats.uniqueBrokerMembersCount}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#a5b4fc' : '#3730a3' }}>BROKERS</div>
                                </div>
                                <div style={{ padding: '6px 4px', borderRadius: '8px', background: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#10b981' }}>{audienceStats.uniqueContactMembersCount}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#6ee7b7' : '#065f46' }}>CONTACTS</div>
                                </div>
                                <div style={{ padding: '6px 4px', borderRadius: '8px', background: isDark ? 'rgba(18, 140, 126, 0.15)' : '#f0fdf4' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#128C7E' }}>{audienceStats.waGroupParticipantsCount}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: isDark ? '#5eead4' : '#115e59' }}>WA REACH ({audienceStats.selectedWaGroupsCount})</div>
                                </div>
                            </div>

                            {/* Launch Button */}
                            <button
                                onClick={handleBroadcast}
                                disabled={isLaunchDisabled}
                                style={{
                                    marginTop: 'auto', width: '100%', padding: '14px',
                                    borderRadius: '12px', border: 'none',
                                    background: isLaunchDisabled
                                        ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: isLaunchDisabled ? '#94a3b8' : '#fff',
                                    fontWeight: 900, fontSize: '0.85rem',
                                    cursor: isLaunchDisabled ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    transition: 'all 0.2s', boxShadow: isLaunchDisabled ? 'none' : '0 4px 12px rgba(99,102,241,0.3)'
                                }}
                            >
                                {sending
                                    ? <><i className="fas fa-spinner fa-spin"></i> Dispatching...</>
                                    : <><i className="fas fa-paper-plane"></i> Launch Broadcast ({audienceStats.totalAudienceReach} Audience • {audienceStats.totalDirectRecipients} Direct)</>
                                }
                            </button>
                            {totalSelectedTargets === 0 && (
                                <p style={{ margin: '-8px 0 0', fontSize: '0.65rem', color: '#f59e0b', textAlign: 'center' }}>
                                    <i className="fas fa-arrow-up"></i> Select at least one matched lead, broker group, contact group, or WhatsApp group
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Omnichannel Live Message Preview ──────── */}
                    <div style={{
                        marginTop: '20px',
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
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a', letterSpacing: '0.5px' }}>
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
                                    {renderWhatsAppFormattedText(
                                        isBaileys
                                            ? (selectedWebTemplate ? (webTemplatePreviewText || bnaRichPreview) : bnaRichPreview)
                                            : (templatePreview || bnaRichPreview)
                                    )}
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
                </div>
            )}

            {/* ── Analytics Section ─────────────────────────────────────── */}
            {analytics && analytics.total > 0 && (
                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', borderTop: '3px solid #6366f1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <i className="fas fa-chart-bar" style={{ color: '#6366f1', fontSize: '14px' }}></i>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>Broadcast Analytics</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {[
                            { label: 'TOTAL REACH', val: analytics.total, bg: '#f8fafc', color: isDark ? 'var(--text-main)' : '#0f172a' },
                            { label: 'SENT', val: analytics.sent || analytics.total - (analytics.failed || 0), bg: '#f0fdf4', color: '#166534' },
                            { label: 'FAILED', val: analytics.failed, bg: '#fef2f2', color: '#991b1b' },
                            { label: 'CHANNELS', val: `${Object.entries(analytics.channels || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(' | ') || 'N/A'}`, bg: '#f5f3ff', color: '#5b21b6', small: true }
                        ].map((s, i) => (
                            <div key={i} style={{ background: s.bg, padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: s.small ? '0.65rem' : '1.3rem', fontWeight: 900, color: s.color, wordBreak: 'break-all' }}>{s.val}</div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: s.color, opacity: 0.7, marginTop: '2px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MarketingTab;
