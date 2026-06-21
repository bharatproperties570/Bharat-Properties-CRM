import { useState, useEffect, useRef } from 'react';
import { useTriggers } from '../context/TriggersContext';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import smsService from '../services/smsService';
import whatsappService from '../services/whatsappService';
import { systemSettingsAPI } from '../utils/api';
import { whatsappTemplates as whatsappTemplatesConst, smsTemplates as smsTemplatesConst, rcsTemplates as rcsTemplatesConst } from '../constants/templates';
import { renderValue } from '../utils/renderUtils';
import { useUserContext } from '../context/UserContext';
const SendMessageModal = ({ 
    isOpen, 
    onClose, 
    onSend, 
    initialRecipients = [], 
    initialProperty = null,
    initialProperties = [],
    initialTemplateId = '',
    initialChannel = 'SMS'
}) => {
    const { fireEvent } = useTriggers();
    const { getLookupValue, lookups, projects, sizes } = usePropertyConfig();
    const { currentUser } = useUserContext();
    const [channel, setChannel] = useState('SMS'); // SMS, WHATSAPP, RCS
    const [recipients, setRecipients] = useState([]);
    const [properties, setProperties] = useState([]);
    const [recipientInput, setRecipientInput] = useState('');

    // Message Content States
    const [messageBody, setMessageBody] = useState('');
    const [templateId, setTemplateId] = useState('');

    // RCS Specifics
    const [rcsTitle, setRcsTitle] = useState('');
    const [rcsActions, setRcsActions] = useState([]);

    // Reference / Context (New Feature)
    const [referenceType, setReferenceType] = useState(''); // 'property', 'booking', 'invoice'
    const [selectedReference, setSelectedReference] = useState(null);
    const [attachment, setAttachment] = useState(null); // { type: 'pdf'|'image'|'video', name: 'file.pdf', url: '...' }

    // SMS Templates State
    const [smsTemplates, setSmsTemplates] = useState([]);
    const [isLoadingSms, setIsLoadingSms] = useState(false);

    // WhatsApp Templates State
    const [whatsappTemplates, setWhatsappTemplates] = useState([]);
    const [templateLanguage, setTemplateLanguage] = useState('en_US');
    const [whatsappComponents, setWhatsappComponents] = useState([]);
    const [isLoadingWhatsApp, setIsLoadingWhatsApp] = useState(false);
    const [variableRegistry, setVariableRegistry] = useState({});

    // Real Data for References (Passed from parent or fetched)
    const [propertyRefs, setPropertyRefs] = useState([]);
    
    useEffect(() => {
        if (isOpen) {
            setChannel(initialChannel);
            setRecipients(initialRecipients);
            setProperties(initialProperties || (initialProperty ? [initialProperty] : []));
            setMessageBody('');
            setTemplateId(initialTemplateId);
            setRcsTitle('');
            setRcsActions([]);
            setShowSchedule(false);
            setScheduleDate('');
            setScheduleTime('');
            loadSmsTemplates();
            loadWhatsAppTemplates();
            loadVariableRegistry();
            setWhatsappComponents([]);
        }
    }, [isOpen, initialChannel, initialTemplateId]);

    useEffect(() => {
        if (initialProperty) {
            setPropertyRefs([{
                id: initialProperty._id || initialProperty.id,
                name: initialProperty.unitNo || initialProperty.projectName || 'Current Property',
                attachmentType: initialProperty.brochureUrl ? 'pdf' : 'image',
                fileName: initialProperty.brochureUrl ? 'Brochure.pdf' : 'Image.jpg',
                link: initialProperty.brochureUrl || initialProperty.images?.[0]?.url || '#'
            }]);
            setReferenceType('property');
            setSelectedReference({
                id: initialProperty._id || initialProperty.id,
                name: initialProperty.unitNo || initialProperty.projectName || 'Current Property'
            });
            if (initialProperty.brochureUrl || initialProperty.images?.[0]?.url) {
                setAttachment({
                    type: initialProperty.brochureUrl ? 'pdf' : 'image',
                    name: initialProperty.brochureUrl ? 'Brochure.pdf' : 'Image.jpg',
                    url: initialProperty.brochureUrl || initialProperty.images?.[0]?.url
                });
            }
        }
    }, [initialProperty]);

    const mockReferences = {
        property: propertyRefs.length > 0 ? propertyRefs : [
            { id: 'p1', name: 'Luxury Villa in Sector 17', attachmentType: 'pdf', fileName: 'Villa_Brochure.pdf', link: 'https://bharatprops.com/b/123' },
            { id: 'p2', name: '3BHK Apartment (Zirakpur)', attachmentType: 'image', fileName: 'Apartment_View.jpg', link: 'https://bharatprops.com/i/456' },
        ],
        booking: [
            { id: 'b1', name: 'Unit A-402 (Highland Park)', attachmentType: 'pdf', fileName: 'Booking_Receipt_A402.pdf' },
        ],
        invoice: [
            { id: 'inv1', name: 'INV-2023-001 (₹50k)', attachmentType: 'pdf', fileName: 'Invoice_001_Signed.pdf' },
        ]
    };

    // Scheduling
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const textAreaRef = useRef(null);

    // Consolidated state initialization moved up


    const loadSmsTemplates = async () => {
        setIsLoadingSms(true);
        try {
            const res = await smsService.getTemplates();
            const templates = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
            if (templates && templates.length > 0) {
                setSmsTemplates(templates);
            } else {
                setSmsTemplates(smsTemplatesConst);
            }
        } catch (err) {
            console.error('Failed to load SMS templates', err);
            setSmsTemplates(smsTemplatesConst);
        } finally {
            setIsLoadingSms(false);
        }
    };

    const loadWhatsAppTemplates = async () => {
        setIsLoadingWhatsApp(true);
        try {
            const res = await whatsappService.getTemplates();
            const templates = Array.isArray(res) ? res : (res && Array.isArray(res.templates) ? res.templates : []);
            if (templates && templates.length > 0) {
                setWhatsappTemplates(templates);
            } else {
                setWhatsappTemplates(whatsappTemplatesConst);
            }
        } catch (err) {
            console.error('Failed to load WhatsApp templates', err);
            setWhatsappTemplates(whatsappTemplatesConst);
        } finally {
            setIsLoadingWhatsApp(false);
        }
    };

    const handleAddRecipient = (e) => {
        if (e.key === 'Enter' && recipientInput.trim()) {
            e.preventDefault();
            setRecipients([...recipients, { name: recipientInput.trim(), phone: recipientInput.trim() }]);
            setRecipientInput('');
        }
    };

    const removeRecipient = (index) => {
        setRecipients(recipients.filter((_, i) => i !== index));
    };

    const insertText = (text) => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText = messageBody.substring(0, start) + text + messageBody.substring(end);
            setMessageBody(newText);
            // setTimeout(() => {
            //     textarea.focus();
            //     textarea.setSelectionRange(start + text.length, start + text.length);
            // }, 0);
        } else {
            setMessageBody(prev => prev + text);
        }
    };

    const wrapSelection = (char) => {
        const textarea = textAreaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = messageBody.substring(start, end);
            const newText = messageBody.substring(0, start) + char + selectedText + char + messageBody.substring(end);
            setMessageBody(newText);
        }
    };

    const loadVariableRegistry = async () => {
        try {
            const res = await systemSettingsAPI.getByKey('messaging_variable_registry');
            if (res.success && res.data?.value) {
                setVariableRegistry(res.data.value);
            }
        } catch (err) {
            console.error('Failed to load Variable Registry', err);
        }
    };


    // 🚀 Reactive Template Resolver
    useEffect(() => {
        if (!templateId) return;

        let resolvedBody = '';
        const components = [];
        const recipient = recipients[0] || {};

        // Helper to retrieve flat or nested inventory fields
        // Checks backend-enriched _label fields first (prevents ObjectId leakage in WhatsApp variables)
        const getPropVal = (key) => {
            if (properties.length === 0) return '';
            const p = properties[0];
            // First priority: backend-enriched label field (e.g. facing_label, roadWidth_label)
            const labelKey = `${key}_label`;
            if (p.inventoryId && typeof p.inventoryId === 'object' && p.inventoryId[labelKey] !== undefined && p.inventoryId[labelKey] !== null && p.inventoryId[labelKey] !== '') {
                return p.inventoryId[labelKey];
            }
            let val = p[key];
            if (val === null || val === undefined || val === '') {
                if (p.unitSpecification && typeof p.unitSpecification === 'object') {
                    val = p.unitSpecification[key];
                }
            }
            if (val === null || val === undefined || val === '') {
                if (p.inventoryId && typeof p.inventoryId === 'object') {
                    val = p.inventoryId[key];
                    if ((val === null || val === undefined || val === '') && p.inventoryId.unitSpecification && typeof p.inventoryId.unitSpecification === 'object') {
                        val = p.inventoryId.unitSpecification[key];
                    }
                }
            }
            return val !== undefined && val !== null ? val : '';
        };

        // Helper to resolve lookups to human-readable labels
        const resolveLookup = (val, type) => {
            if (!val) return '';
            
            let idVal = val;
            if (typeof val === 'object') {
                const label = val.lookup_value || val.name || val.label || val.fullName;
                if (label && typeof label !== 'object' && !/^[0-9a-fA-F]{24}$/.test(String(label))) return String(label);
                idVal = val._id || val.id || val;
            }

            const idStr = String(idVal).trim();
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) {
                return idStr;
            }

            const resolved = getLookupValue(type, idStr);
            if (resolved && typeof resolved !== 'object' && !/^[0-9a-fA-F]{24}$/.test(String(resolved))) {
                return String(resolved);
            }

            // Fallback direct scanners
            if (lookups) {
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

            if (sizes && Array.isArray(sizes)) {
                const foundSize = sizes.find(s => String(s._id || s.id) === idStr);
                if (foundSize) {
                    const foundVal = foundSize.name || foundSize.lookup_value;
                    if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
                }
            }

            if (projects && Array.isArray(projects)) {
                const foundProj = projects.find(p => String(p._id || p.id) === idStr);
                if (foundProj) {
                    const foundVal = foundProj.name || foundProj.projectName || foundProj.title;
                    if (foundVal && !/^[0-9a-fA-F]{24}$/.test(String(foundVal))) return String(foundVal);
                }
            }

            return '';
        };

        const categoryRaw = getPropVal('category') || getPropVal('propertyType');
        const categoryResolved = resolveLookup(categoryRaw, 'Category');

        const subCategoryRaw = getPropVal('subCategory');
        const subCategoryResolved = resolveLookup(subCategoryRaw, 'SubCategory');

        const builtupTypeRaw = getPropVal('builtupType');
        // Backend pre-resolves ObjectIds to strings; resolveLookup is a client-side fallback
        const builtupTypeResolved = builtupTypeRaw && !/^[0-9a-fA-F]{24}$/.test(String(builtupTypeRaw))
            ? builtupTypeRaw // Already a human-readable string from backend
            : resolveLookup(builtupTypeRaw, 'BuiltupType');

        const sizeLabelRaw = getPropVal('sizeLabel') || getPropVal('sizeConfig');
        const sizeLabelResolved = (sizeLabelRaw && !/^[0-9a-fA-F]{24}$/.test(String(sizeLabelRaw)))
            ? sizeLabelRaw
            : (resolveLookup(sizeLabelRaw, 'Size') || getPropVal('size'));

        const directionRaw = getPropVal('direction');
        const directionResolved = directionRaw && !/^[0-9a-fA-F]{24}$/.test(String(directionRaw))
            ? directionRaw
            : resolveLookup(directionRaw, 'Direction');

        const facingRaw = getPropVal('facing');
        const facingResolved = facingRaw && !/^[0-9a-fA-F]{24}$/.test(String(facingRaw))
            ? facingRaw
            : resolveLookup(facingRaw, 'Facing');

        const roadWidthRaw = getPropVal('roadWidth');
        const roadWidthResolved = roadWidthRaw && !/^[0-9a-fA-F]{24}$/.test(String(roadWidthRaw))
            ? roadWidthRaw
            : resolveLookup(roadWidthRaw, 'RoadWidth');

        const sizeRaw = getPropVal('size');
        const sizeVal = typeof sizeRaw === 'object' ? (sizeRaw.value ? `${sizeRaw.value} ${sizeRaw.unit || 'Sq.Yd.'}` : '') : sizeRaw;

        const priceVal = getPropVal('price');
        const projectNameVal = getPropVal('projectName') || getPropVal('unitNo') || 'Premium Listing';

        const locationRaw = getPropVal('location') || getPropVal('city') || getPropVal('sector');
        const locationResolved = resolveLookup(locationRaw, 'Location') || resolveLookup(locationRaw, 'City') || resolveLookup(locationRaw, 'Locality') || locationRaw;

        const propertyListDefault = properties.map((p, i) => {
            const propVal = (key) => {
                let v = p[key];
                if (v === null || v === undefined || v === '') {
                    if (p.inventoryId && typeof p.inventoryId === 'object') v = p.inventoryId[key];
                }
                return v !== undefined && v !== null ? v : '';
            };
            const loc = propVal('location') || propVal('city') || propVal('sector');
            const resolvedLoc = resolveLookup(loc, 'Location') || resolveLookup(loc, 'City') || resolveLookup(loc, 'Locality') || loc || 'Sector';
            return `${i + 1}️⃣ ${propVal('unitNo') || 'Unit'} - ${resolvedLoc}`;
        }).join('\n');

        const propertyListDetailed = properties.map((p, i) => {
            const propVal = (key) => {
                let v = p[key];
                if (v === null || v === undefined || v === '') {
                    if (p.inventoryId && typeof p.inventoryId === 'object') v = p.inventoryId[key];
                }
                return v !== undefined && v !== null ? v : '';
            };
            const loc = propVal('location') || propVal('city') || propVal('sector');
            const resolvedLoc = resolveLookup(loc, 'Location') || resolveLookup(loc, 'City') || resolveLookup(loc, 'Locality') || loc || 'Sector';
            const szRaw = propVal('size');
            const szVal = typeof szRaw === 'object' ? (szRaw.value ? `${szRaw.value} ${szRaw.unit || 'Sq.Yd.'}` : '') : szRaw;
            return `${i + 1}️⃣ 📍 ${resolvedLoc}\n📏 Size: ${szVal}\n💰 Price: ₹${propVal('price') || ''}`;
        }).join('\n');

        const agentName = recipient.assignedTo?.name || recipient.owner || recipient.agentName || currentUser?.name || 'Our Representative';
        const agentMobile = recipient.assignment?.assignedTo?.mobile || recipient.assignedTo?.mobile || recipient.ownerMobile || recipient.agentMobile || currentUser?.mobile || currentUser?.phone || '';
        const agentDetails = agentMobile ? `${agentName} (📞 ${agentMobile})` : agentName;

        const unifiedContext = {
            // Contact/Lead Exact Fields
            'name': recipient.name,
            'firstName': recipient.firstName || recipient.name?.split(' ')[0] || 'customer',
            'surname': recipient.surname || '',
            'mobile': recipient.phone || recipient.mobile || '',
            'email': recipient.email || '',
            'source': recipient.source || '',
            'status': recipient.status || recipient.stage || '',
            'requirement': recipient.requirement || recipient.requirementType || 'property',
            'budgetMin': recipient.budgetMin || recipient.budget || '',
            'budgetMax': recipient.budgetMax || '',
            'areaMin': recipient.areaMin || '',
            'areaMax': recipient.areaMax || '',
            'locCity': recipient.locCity || recipient.location || '',
            'locArea': recipient.locArea || '',
            
            // System Details
            'assignedTo': agentDetails,
            'ownerMobile': agentMobile,
            'ownerEmail': recipient.assignedTo?.email || currentUser?.email || '',

            // Project/Inventory Exact Fields
            'projectName': projectNameVal,
            'unitNo': getPropVal('unitNo'),
            'block': getPropVal('block'),
            'unitType': resolveLookup(getPropVal('unitType'), 'UnitType'),
            'category': categoryResolved,
            'subCategory': subCategoryResolved,
            'builtupType': builtupTypeResolved,
            'sizeType': sizeLabelResolved, // sizeType maps directly to the resolved size label as requested by the user
            'sizeLabel': sizeLabelResolved,
            'direction': directionResolved,
            'facing': facingResolved,
            'roadWidth': roadWidthResolved,
            'price': priceVal || 'N/A',
            'size': sizeVal || 'N/A',
            'location': locationResolved || recipient.location || 'our project',
            
            // Computed / Summary Helpers
            'propertyList': propertyListDefault,
            'property_list_default': propertyListDefault,
            'property_list_detailed': propertyListDetailed,
            'requirementSummary': (recipient.requirement || recipient.requirementType) ? `Looking for ${recipient.requirement || recipient.requirementType} in ${locationResolved || recipient.location || 'our area'} budget ${recipient.budgetMin || recipient.budget || ''}` : 'Your property requirement',
            'propertiesCount': properties.length || 0,
            
            // Fallbacks for older numeric mapping
            'customer_name': recipient.firstName || recipient.name?.split(' ')[0] || 'customer'
        };

        const resolveVars = (text) => {
            if (!text) return text;
            return text.replace(/{{([^}]+)}}/g, (match, vIdx) => {
                const cleanKey = vIdx.trim();
                
                // 1. DLT Index-based mapping
                if (/^\d+$/.test(cleanKey)) {
                    const defaultRegistry = {
                        '1': 'customer_name',
                        '2': 'property_list_default',
                        '3': 'assignedTo'
                    };
                    const mappedField = variableRegistry[cleanKey] || variableRegistry[String(cleanKey)] || defaultRegistry[String(cleanKey)];
                    const val = unifiedContext[mappedField] !== undefined ? renderValue(unifiedContext[mappedField], '') : match;
                    components.push({ type: 'text', text: val });
                    return val;
                }
                
                // 2. Standardized Named Variables (e.g. {{firstName}}, {{location}})
                if (unifiedContext[cleanKey] !== undefined) {
                    const val = renderValue(unifiedContext[cleanKey], '');
                    components.push({ type: 'text', text: val });
                    return val;
                }
                
                // 3. Fallbacks for specific legacy/hardcoded strings
                const legacyHardcoded = {
                    'MatchCount': 'several',
                    'OldPrice': 'N/A',
                    'NewPrice': 'N/A',
                    'Savings': 'N/A',
                    'Deadline': 'tomorrow',
                    'Amount': 'the due amount',
                    'DueDate': 'the due date',
                    'PaymentType': 'payment',
                    'PaymentMethods': 'Bank Transfer / UPI',
                    'MatchPercentage': '95',
                    'MatchReasons': '- Matches your budget\n- Preferred location\n- Right size',
                    'CompetingBuyers': '2',
                    'Slot1': 'Tomorrow 10 AM',
                    'Slot2': 'Tomorrow 2 PM',
                    'Slot3': 'Day after 11 AM',
                    'PositiveFeedback': 'Location, Amenities',
                    'Concerns': 'Price negotiation',
                    'NextSteps': 'I will share a revised offer',
                    'DocumentList': '- Aadhaar Card\n- PAN Card\n- Cancelled Cheque'
                };
                
                if (legacyHardcoded[cleanKey] !== undefined) {
                    const val = renderValue(legacyHardcoded[cleanKey], '');
                    components.push({ type: 'text', text: val });
                    return val;
                }

                return match;
            });
        };

        if (channel === 'SMS') {
            console.log("SMS Resolver: templateId =", templateId, "type =", typeof templateId);
            console.log("smsTemplates available:", smsTemplates);
            const template = smsTemplates.find(t => t._id === templateId || String(t.id) === String(templateId));
            console.log("Found template:", template);
            if (template) {
                resolvedBody = resolveVars(template.body || '');
                console.log("Resolved body:", resolvedBody);
                setMessageBody(resolvedBody);
            }
        } else if (channel === 'WHATSAPP') {
            const template = whatsappTemplates.find(t => t.name === templateId || String(t.id) === String(templateId));
            if (template) {
                // 1. Process Body (Meta components support + robust fallback for local content)
                const bodyComp = template.components?.find(c => c.type === 'BODY');
                if (bodyComp) {
                    resolvedBody = resolveVars(bodyComp.text || template.body || '');
                } else {
                    resolvedBody = resolveVars(template.body || template.content || template.text || '');
                }

                // 2. Process Buttons (to capture variables for URLs)
                const buttonComp = template.components?.find(c => c.type === 'BUTTONS');
                if (buttonComp?.buttons) {
                    buttonComp.buttons.forEach(btn => {
                        if (btn.url) resolveVars(btn.url);
                    });
                }
                
                // Replace standard non-indexed tags for visual preview only
                resolvedBody = resolvedBody.replace(/{{Name}}/g, recipient.name || 'valued customer');
                resolvedBody = resolvedBody.replace(/{{FirstName}}/g, recipient.firstName || recipient.name?.split(' ')[0] || 'valued customer');
                resolvedBody = resolvedBody.replace(/{{Phone}}/g, recipient.phone || 'your phone');

                // 🛡️ SAFETY FILTER: Strip any surviving raw MongoDB ObjectIds (24-char hex)
                // Prevents database IDs from leaking into WhatsApp messages.
                resolvedBody = resolvedBody.replace(/\b[0-9a-fA-F]{24}\b/g, '');

                setWhatsappComponents(components);
                setMessageBody(resolvedBody);
                setIsTemplateModified(false);
            }
        } else if (channel === 'RCS') {
            const template = rcsTemplatesConst.find(t => String(t.id) === String(templateId));
            if (template) {
                setRcsTitle(template.name || '');
                resolvedBody = resolveVars(template.body || '');
                console.log("Resolved body:", resolvedBody);
                setMessageBody(resolvedBody);
                setRcsActions(template.buttons || []);
            }
        }
    }, [isOpen, templateId, channel, whatsappTemplates, smsTemplates, recipients, variableRegistry, initialProperty, properties]);

    const handleTemplateChange = (e) => {
        setTemplateId(e.target.value);
    };

    const [isTemplateModified, setIsTemplateModified] = useState(false);

    const handleReferenceSelect = (type, id) => {
        setReferenceType(type);
        if (!id) {
            setSelectedReference(null);
            setAttachment(null);
            return;
        }

        const item = mockReferences[type].find(i => i.id === id);
        setSelectedReference(item);

        if (item) {
            setAttachment({
                type: item.attachmentType,
                name: item.fileName,
                url: item.link || '#'
            });
        }
    };

    const handleSend = async (isScheduled) => {
        const data = {
            channel,
            recipients,
            content: {
                body: messageBody,
                templateId,
                rcs: { title: rcsTitle, actions: rcsActions },
                mediaUrl: attachment?.url,
                filename: attachment?.name,
                type: attachment?.type || 'text'
            },
            schedule: isScheduled && showSchedule ? { date: scheduleDate, time: scheduleTime } : null
        };

        try {
            let res;
            if (channel === 'WHATSAPP') {
                res = await whatsappService.sendMessage({
                    mobile: recipients[0]?.phone || recipients[0]?.mobile,
                    message: messageBody,
                    templateId,
                    // 🚀 SENIOR PROFESSIONAL: Best effort delivery. 
                    // Even if modified, we send the resolved components. 
                    // Meta will reject if the body doesn't match the template pattern, 
                    // and our backend will fallback to a plain text message anyway.
                    templateComponents: templateId ? whatsappComponents.map(c => c.text) : [],
                    language: templateLanguage,
                    mediaUrl: attachment?.url,
                    filename: attachment?.name,
                    type: attachment?.type || 'text'
                });
            } else {
                res = await smsService.sendMessage(data);
            }

            if (res && res.success) {
                // If the parent provided an onSend callback, tell it we succeeded
                if (onSend) onSend(data, res);

                // Fire Triggers
                fireEvent('message_sent', data, { entityType: 'communication' });

                // Dispatch Global Sync Event
                window.dispatchEvent(new CustomEvent('activity-completed', {
                    detail: { 
                        entityId: recipients[0]?.id || recipients[0]?._id,
                        type: channel
                    }
                }));

                onClose();
            } else {
                throw new Error(res?.error || "Failed to send message: Success flag false");
            }
        } catch (error) {
            console.error(`${channel} Sending Error:`, error);
            const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Unknown error";
            alert(`Failed to send message: ${errorMsg}`);
        }
    };

    if (!isOpen) return null;

    // --- LOGIC HELPERS ---
    const charCount = messageBody.length;
    const segments = Math.ceil(charCount / 160) || 1;

    // --- STYLES ---
    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };

    const modalStyle = {
        backgroundColor: '#fff', width: '1100px', height: '90vh',
        borderRadius: '20px', display: 'flex', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    };

    const leftPanelStyle = {
        flex: 3, padding: '40px', overflowY: 'auto',
        borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column'
    };

    const rightPanelStyle = {
        flex: 2, backgroundColor: '#f8fafc', padding: '40px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column'
    };

    const labelStyle = {
        display: 'block', fontSize: '0.85rem', fontWeight: 600,
        color: '#475569', marginBottom: '8px'
    };

    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: '8px',
        border: '1px solid #e2e8f0', fontSize: '0.95rem',
        outline: 'none', transition: 'border 0.2s', backgroundColor: '#fff'
    };

    const toolbarBtnStyle = {
        padding: '6px 10px', borderRadius: '4px', border: 'none', backgroundColor: 'transparent',
        color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s'
    };

    const channelBtnStyle = (active) => ({
        flex: 1, padding: '14px', border: 'none',
        backgroundColor: active ? '#fff' : 'transparent',
        color: active ? (channel === 'RCS' ? '#4285F4' : channel === 'WHATSAPP' ? '#059669' : '#2563eb') : '#64748b',
        boxShadow: active ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
        borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
    });

    return (
        <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={modalStyle}>

                {/* --- LEFT PANEL: CONFIGURATION --- */}
                <div style={leftPanelStyle}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Send Message</h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '32px' }}>Configure your campaign details and recipients.</p>


                    {/* 1. Recipients */}
                    <div style={{ marginBottom: '32px' }}>
                        <label style={labelStyle}>Recipients</label>
                        <div style={{ ...inputStyle, display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '52px', alignItems: 'center' }}>
                            {recipients.map((r, i) => (
                                <span key={i} style={{
                                    background: '#eff6ff', color: '#2563eb', padding: '4px 12px',
                                    borderRadius: '50px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center',
                                    border: '1px solid #dbeafe'
                                }}>
                                    {r.name}
                                    <i className="fas fa-times" style={{ marginLeft: '8px', cursor: 'pointer', opacity: 0.6, fontSize: '0.8rem' }} onClick={() => removeRecipient(i)}></i>
                                </span>
                            ))}
                            <input
                                value={recipientInput}
                                onChange={e => setRecipientInput(e.target.value)}
                                onKeyDown={handleAddRecipient}
                                placeholder={recipients.length ? "" : "Type name or number & press Enter..."}
                                style={{ border: 'none', outline: 'none', flex: 1, minWidth: '150px', fontSize: '0.95rem' }}
                            />
                        </div>
                    </div>


                    {/* 2. Channel Selection */}
                    <div style={{ marginBottom: '32px' }}>
                        <label style={labelStyle}>Select Channel</label>
                        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '6px', borderRadius: '16px', gap: '6px' }}>
                            <button type="button" onClick={() => setChannel('SMS')} style={channelBtnStyle(channel === 'SMS')}>
                                <i className="fas fa-comment-alt"></i> SMS
                            </button>
                            <button type="button" onClick={() => { setChannel('WHATSAPP'); loadWhatsAppTemplates(); }} style={channelBtnStyle(channel === 'WHATSAPP')}>
                                <i className="fab fa-whatsapp"></i> WhatsApp
                            </button>
                            <button type="button" onClick={() => setChannel('RCS')} style={channelBtnStyle(channel === 'RCS')}>
                                <i className="fas fa-comment-dots"></i> RCS
                            </button>
                        </div>
                    </div>



                    {/* 2.5 Reference / Attachment Selection */}
                    {channel !== 'SMS' && (
                        <div style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <i className="fas fa-paperclip" style={{ color: '#0284c7' }}></i>
                                <label style={{ ...labelStyle, marginBottom: 0, color: '#0369a1' }}>Attach Documents / Media</label>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', marginBottom: attachment ? '16px' : '0' }}>
                                <div style={{ flex: 1 }}>
                                    <select
                                        style={inputStyle}
                                        value={referenceType}
                                        onChange={(e) => {
                                            setReferenceType(e.target.value);
                                            setSelectedReference(null);
                                            setAttachment(null);
                                        }}
                                    >
                                        <option value="">-- Select Type --</option>
                                        <option value="property">Property Brochure/Video</option>
                                        <option value="booking">Booking Receipt</option>
                                        <option value="invoice">Invoice (Signed)</option>
                                    </select>
                                </div>
                                <div style={{ flex: 2 }}>
                                    <select
                                        style={inputStyle}
                                        value={selectedReference?.id || ''}
                                        onChange={(e) => handleReferenceSelect(referenceType, e.target.value)}
                                        disabled={!referenceType}
                                    >
                                        <option value="">-- Select Item --</option>
                                        {referenceType && mockReferences[referenceType].map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {attachment && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e0f2fe' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                                        <i className={`fas ${attachment.type === 'pdf' ? 'fa-file-pdf' : attachment.type === 'image' ? 'fa-image' : 'fa-video'}`} style={{ fontSize: '1.2rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{attachment.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Ready to send • 2.4 MB</div>
                                    </div>
                                    <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '1.2rem' }}></i>
                                </div>
                            )}
                        </div>
                    )}


                    {/* 3. Dynamic Fields */}
                    <div style={{ flex: 1 }}>

                        {/* ================= SMS VIEW ================= */}
                        {channel === 'SMS' && (
                            <div className="animate-fade-in">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Select Template</label>
                                    <select
                                        value={templateId}
                                        onChange={handleTemplateChange}
                                        style={inputStyle}
                                        disabled={isLoadingSms}
                                    >
                                        <option value="">-- {isLoadingSms ? 'Loading templates...' : 'Choose an SMS Template'} --</option>
                                        {smsTemplates.map(t => (
                                            <option key={t._id || t.id} value={t._id || t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={labelStyle}>Text Message</label>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>GSM 7-bit</div>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                    {/* Toolbar (Variables only) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Phone}}')} title="Insert Phone"><i className="fas fa-phone" style={{ marginRight: '4px' }}></i> Phone</button>
                                        <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                    </div>
                                    <textarea
                                        ref={textAreaRef}
                                        style={{ ...inputStyle, border: 'none', minHeight: '180px', resize: 'vertical', lineHeight: '1.6' }}
                                        placeholder="Type your SMS message here..."
                                        value={messageBody}
                                        onChange={e => {
                                            setMessageBody(e.target.value);
                                            if (templateId) setIsTemplateModified(true);
                                        }}
                                    />
                                </div>
                                {templateId && isTemplateModified && (
                                    <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fef3c7', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <i className="fas fa-exclamation-triangle" style={{ color: '#d97706', fontSize: '0.9rem' }}></i>
                                        <span style={{ fontSize: '0.8rem', color: '#92400e' }}>
                                            <strong>DLT Warning:</strong> Manual edits to a pre-approved template may cause rejection by the gateway.
                                        </span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginTop: '8px', paddingLeft: '4px' }}>
                                    <span>Used characters: <strong>{charCount}</strong></span>
                                    <span>Segments: <strong>{segments}</strong></span>
                                </div>
                            </div>
                        )}

                        {/* ================= WHATSAPP VIEW ================= */}
                        {channel === 'WHATSAPP' && (
                            <div className="animate-fade-in">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Select Template</label>
                                    <select
                                        value={templateId}
                                        onChange={handleTemplateChange}
                                        style={inputStyle}
                                        disabled={isLoadingWhatsApp}
                                    >
                                        <option value="">-- {isLoadingWhatsApp ? 'Loading...' : 'Choose a WhatsApp Template'} --</option>
                                        {whatsappTemplates.map(t => (
                                            <option key={t.id || t.name} value={t.name}>{t.name} ({t.language})</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={labelStyle}>Message Body</label>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        {/* Full Toolbar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('*')} title="Bold"><i className="fas fa-bold"></i></button>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('_')} title="Italic"><i className="fas fa-italic"></i></button>
                                            <button style={toolbarBtnStyle} onClick={() => wrapSelection('~')} title="Strikethrough"><i className="fas fa-strikethrough"></i></button>
                                            <div style={{ width: '1px', height: '18px', backgroundColor: '#e2e8f0', margin: '0 6px' }}></div>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                        </div>
                                        <textarea
                                            ref={textAreaRef}
                                            style={{ ...inputStyle, border: 'none', minHeight: '150px', resize: 'vertical', lineHeight: '1.6' }}
                                            placeholder="Select a template or type..."
                                            value={messageBody}
                                            onChange={e => setMessageBody(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div style={{ padding: '12px 16px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#065f46', display: 'flex', gap: '8px' }}>
                                        <i className="fas fa-info-circle" style={{ marginTop: '2px' }}></i>
                                        <span>Use pre-approved templates for initial contact.</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ================= RCS VIEW ================= */}
                        {channel === 'RCS' && (
                            <div className="animate-fade-in">
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Select Template</label>
                                    <select
                                        value={templateId}
                                        onChange={handleTemplateChange}
                                        style={inputStyle}
                                    >
                                        <option value="">-- Choose an RCS Template --</option>
                                        {rcsTemplatesConst.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Card Title</label>
                                    <input
                                        style={inputStyle}
                                        placeholder="e.g. Exclusive Launch Offer"
                                        value={rcsTitle}
                                        onChange={e => setRcsTitle(e.target.value)}
                                    />
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Description / Body</label>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Name}}')} title="Insert Name"><i className="fas fa-user-tag" style={{ marginRight: '4px' }}></i> Name</button>
                                            <button style={toolbarBtnStyle} onClick={() => insertText('{{Link}}')} title="Insert Link"><i className="fas fa-link" style={{ marginRight: '4px' }}></i> Link</button>
                                        </div>
                                        <textarea
                                            ref={textAreaRef}
                                            style={{ ...inputStyle, border: 'none', minHeight: '120px', resize: 'vertical', lineHeight: '1.6' }}
                                            placeholder="Describe your offer in detail..."
                                            value={messageBody}
                                            onChange={e => setMessageBody(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Rich Media */}
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={labelStyle}>Rich Media</label>
                                    <div style={{ padding: '20px', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.5rem', color: '#94a3b8' }}></i>
                                        <div>
                                            <span style={{ fontWeight: 600, color: '#475569' }}>Click to upload</span>
                                            <span style={{ fontSize: '0.8rem', display: 'block' }}>Image or Video (Max 10MB)</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions / Buttons */}
                                <div>
                                    <label style={labelStyle}>Suggested Actions (Buttons)</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {rcsActions.map((action, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                                                <input style={{ ...inputStyle, flex: 1 }} placeholder="Button Label" value={action.label} readOnly />
                                                <button onClick={() => setRcsActions(rcsActions.filter((_, i) => i !== idx))} style={{ ...toolbarBtnStyle, color: '#ef4444' }}><i className="fas fa-trash"></i></button>
                                            </div>
                                        ))}
                                        {rcsActions.length < 3 && (
                                            <button
                                                onClick={() => setRcsActions([...rcsActions, { label: 'Visit Website', type: 'url' }])}
                                                style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#2563eb', fontWeight: 600, cursor: 'pointer', background: '#f0f9ff', borderColor: '#bae6fd' }}
                                            >
                                                <i className="fas fa-plus-circle"></i> Add Action Button
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer Actions */}
                    <div style={{ marginTop: '32px' }}>
                        {showSchedule && (
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Date</label>
                                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={inputStyle} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Time</label>
                                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button onClick={onClose} style={{ padding: '12px 24px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>

                            <div style={{ flex: 1 }}></div>

                            <button
                                onClick={() => setShowSchedule(!showSchedule)}
                                style={{
                                    padding: '12px 24px', borderRadius: '10px', border: '1px solid #cbd5e1',
                                    background: showSchedule ? '#e2e8f0' : '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer',
                                    fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <i className="far fa-clock"></i> {showSchedule ? 'Hide Schedule' : 'Schedule'}
                            </button>

                            {channel === 'WHATSAPP' && !showSchedule && (
                                <button
                                    id="whatsapp-send-via-app-btn"
                                    onClick={async () => {
                                        if (recipients.length === 0) return;
                                        let phone = recipients[0].phone || recipients[0].mobile || '';
                                        phone = phone.replace(/\D/g, '');
                                        if (phone.length === 10) phone = '91' + phone;
                                        
                                        // ━━ ENTERPRISE: Same smart dispatch as Portfolio send ━━
                                        // Step 1: Copy to clipboard FIRST (desktop users will need to paste)
                                        try {
                                            await navigator.clipboard.writeText(messageBody);
                                        } catch (e) {
                                            console.warn('Clipboard copy failed:', e.message);
                                        }

                                        const encodedMsg = encodeURIComponent(messageBody);
                                        const isDesktop = /Win|Mac/.test(navigator.platform || navigator.userAgentData?.platform || '');

                                        if (isDesktop) {
                                            // Step 2a: Try native whatsapp:// protocol for desktop app
                                            window.location.href = `whatsapp://send?phone=${phone}&text=${encodedMsg}`;
                                            // Step 2b: Fallback to web after 2.5s if native didn't open
                                            setTimeout(() => {
                                                window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`, '_blank');
                                            }, 2500);
                                        } else {
                                            window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`, '_blank');
                                        }

                                        // Step 3: Inform user to paste in desktop app
                                        import('react-hot-toast').then(({ default: toastLib }) => {
                                            toastLib(
                                                (t) => (
                                                    <div style={{ maxWidth: '300px' }}>
                                                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>✅ Message Copied!</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                                                            Desktop app opens — <strong>paste (⌘V / Ctrl+V)</strong> in the message box.
                                                        </div>
                                                    </div>
                                                ),
                                                { duration: 7000, icon: '📲' }
                                            );
                                        });
                                        onClose();
                                    }}
                                    style={{
                                        padding: '12px 24px', borderRadius: '10px', border: '1px solid #10b981',
                                        background: '#ecfdf5', color: '#10b981', fontWeight: 700, cursor: 'pointer',
                                        fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <i className="fab fa-whatsapp"></i> Send via App
                                </button>
                            )}

                            <button
                                onClick={() => handleSend(showSchedule)}
                                style={{
                                    padding: '12px 32px', borderRadius: '10px', border: 'none',
                                    background: 'var(--primary-color)', color: '#fff', fontWeight: 700, cursor: 'pointer',
                                    fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                <i className="fas fa-paper-plane"></i> {showSchedule ? 'Schedule Campaign' : 'Send Now'}
                            </button>
                        </div>
                    </div>

                </div>

                {/* --- RIGHT PANEL: PREVIEW --- */}
                <div style={rightPanelStyle}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#94a3b8', marginBottom: '24px', letterSpacing: '1px', textTransform: 'uppercase' }}>Live Preview</h3>

                    {/* Device Frame */}
                    <div style={{
                        width: '320px', height: '640px', backgroundColor: '#1e293b',
                        borderRadius: '40px', padding: '12px', position: 'relative',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 2px #334155'
                    }}>
                        {/* Notch */}
                        <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '24px', background: '#1e293b', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', zIndex: 10 }}></div>

                        {/* Screen */}
                        <div style={{
                            width: '100%', height: '100%', backgroundColor: '#fff',
                            borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                        }}>
                            {/* Status Bar Mock */}
                            <div style={{ height: '30px', background: channel === 'WHATSAPP' ? '#075e54' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', fontSize: '10px', color: channel === 'WHATSAPP' ? '#fff' : '#000' }}>
                                <span>9:41</span>
                                <span><i className="fas fa-signal"></i> <i className="fas fa-wifi"></i> <i className="fas fa-battery-full"></i></span>
                            </div>

                            {/* App Header */}
                            <div style={{
                                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                                background: channel === 'WHATSAPP' ? '#075e54' : '#fff',
                                color: channel === 'WHATSAPP' ? '#fff' : '#000',
                                borderBottom: channel !== 'WHATSAPP' ? '1px solid #e2e8f0' : 'none'
                            }}>
                                <i className="fas fa-arrow-left"></i>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                    <i className="fas fa-building"></i>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bharat Properties</div>
                                    {channel === 'WHATSAPP' && <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Business Account</div>}
                                </div>
                            </div>

                            {/* Chat Area */}
                            <div style={{ flex: 1, backgroundColor: channel === 'WHATSAPP' ? '#efeae2' : '#fff', padding: '16px', backgroundImage: channel === 'WHATSAPP' ? 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' : 'none', backgroundSize: 'contain' }}>

                                {/* Date Label */}
                                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                    <span style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: '8px', fontSize: '0.7rem', color: '#555' }}>Today</span>
                                </div>

                                {/* Message Bubble */}
                                <div style={{
                                    backgroundColor: channel === 'WHATSAPP' ? '#fff' : channel === 'SMS' ? '#e2e8f0' : '#e8f0fe', // SMS gray, RCS blue tint
                                    padding: '0',
                                    borderRadius: '12px',
                                    maxWidth: '85%',
                                    alignSelf: 'flex-start',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    overflow: 'hidden'
                                }}>
                                    {/* RCS Rich Media */}
                                    {channel === 'RCS' && (
                                        <div style={{ height: '120px', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-image" style={{ fontSize: '2rem', color: '#fff' }}></i>
                                        </div>
                                    )}

                                    {/* Attachment Preview (PDF/Image/Video) */}
                                    {attachment && (
                                        <div style={{ margin: '4px', marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                            {attachment.type === 'image' ? (
                                                <div style={{ height: '120px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                                    <i className="fas fa-image" style={{ fontSize: '2rem' }}></i>
                                                </div>
                                            ) : attachment.type === 'video' ? (
                                                <div style={{ height: '120px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                                    <i className="fas fa-play-circle" style={{ fontSize: '2rem' }}></i>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '32px', height: '32px', background: '#ffeded', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                        <i className="fas fa-file-pdf"></i>
                                                    </div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachment.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>PDF • 1 Page</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ padding: '12px' }}>
                                        {channel === 'RCS' && rcsTitle && (
                                            <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '0.9rem' }}>{rcsTitle}</div>
                                        )}

                                        <div style={{ fontSize: '0.85rem', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                                            {messageBody || (templateId ? "Hello! This is a preview of the selected template..." : "Your message content will appear here.")}
                                        </div>

                                        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#94a3b8', marginTop: '6px' }}>
                                            10:30 AM {channel === 'WHATSAPP' && <i className="fas fa-check-double" style={{ color: '#34b7f1', marginLeft: '2px' }}></i>}
                                        </div>
                                    </div>

                                    {/* RCS Actions */}
                                    {channel === 'RCS' && (
                                        <div style={{ borderTop: '1px solid #bfdbfe' }}>
                                            <div style={{ padding: '10px', textAlign: 'center', color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}>
                                                View Details
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Input Bar Mock */}
                            <div style={{ height: '60px', background: '#f0f2f5', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px' }}>
                                <i className="fas fa-plus" style={{ color: '#007bff' }}></i>
                                <div style={{ flex: 1, height: '36px', background: '#fff', borderRadius: '18px', border: '1px solid #e2e8f0' }}></div>
                                <i className="fas fa-microphone" style={{ color: '#007bff' }}></i>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SendMessageModal;
