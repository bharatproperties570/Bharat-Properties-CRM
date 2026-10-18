import { useTheme } from '../../../context/ThemeContext';
import { useState, useEffect, useMemo, useCallback } from 'react';
// Mock data removed
import { splitIntakeMessage } from '../../../utils/dealParser';
import toast from 'react-hot-toast';
import { useParsing } from '../../../context/ParsingContext'; // Dynamic Parser
import { useCall } from '../../../context/CallContext';
import QuickInventoryForm from '../../../components/common/QuickInventoryForm';
import AddProjectModal from '../../../components/modals/AddProjectModal';
import AddBlockModal from '../../../components/modals/AddBlockModal';
import AddSizeModal from '../../../components/modals/AddSizeModal';
import AddContactModal from '../../../components/AddContactModal'; 
import UploadSummaryModal from '../../../components/UploadSummaryModal';
import QuickDealForm from '../../../components/QuickDealForm';
import { intakeAPI, api } from '../../../utils/api';
import { renderValue } from '../../../utils/renderUtils';
import { useDeals, useAddDealMutation } from '../../../utils/crmHooks';

const DealIntakePage = () => {
    const { isDark } = useTheme();
    // Shared State
    const [intakeItems, setIntakeItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(null);
    const [intakeType, setIntakeType] = useState('SELLER'); // 'SELLER' | 'BUYER'
    const [stage, setStage] = useState(0); // 0=Source, 1=Classification, 2=Match, 3=Action, 4=Result

    const { startCall, startWhatsAppCall } = useCall(); // Call Engine Hook
    const { customPatterns } = useParsing(); // Dynamic Regex from Context

    // New Intake State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
    const [monitoredSources, setMonitoredSources] = useState([]);
    const [intakeGroups, setIntakeGroups] = useState([]);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');
    const [isScanningGroups, setIsScanningGroups] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null); // New state for 2-step import
    const [newSourceContent, setNewSourceContent] = useState('');
    const [newSourceType] = useState('WhatsApp');

    // Campaign Details State
    const [campaignName, setCampaignName] = useState('');
    const [isAutomated, setIsAutomated] = useState(false);
    const [campaignSource, setCampaignSource] = useState('WhatsApp');
    // const [campaignDate, setCampaignDate] = useState('');
    const [contentInputMode, setContentInputMode] = useState('paste'); // 'paste' or 'import'

    // Call Outcome State (Strict Gating)
    const [ownerCallOutcome, setOwnerCallOutcome] = useState(null); // 'Confirmed' | 'Follow-up' etc.

    // Duplicate Detection & Data Retention State
    const [showUploadSummary, setShowUploadSummary] = useState(false);
    const [uploadSummaryData] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('all'); 
    const [useQuickDeal] = useState(true);

    // WhatsApp Verification Desk State
    const [waLoadingPreview, setWaLoadingPreview] = useState(false);
    const [waSendingInquiry, setWaSendingInquiry] = useState(false);
    const [waCheckingStatus, setWaCheckingStatus] = useState(false);
    const [waTargetPhone, setWaTargetPhone] = useState('');
    const [waTargetType, setWaTargetType] = useState('text_contact');
    const [waCustomMessage, setWaCustomMessage] = useState('');
    const [waPreviewData, setWaPreviewData] = useState(null);
    const [waDeskExpanded, setWaDeskExpanded] = useState(true);
    const [waHistoryOpen, setWaHistoryOpen] = useState(false);

    const [leadData, setLeadData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const { data: dealsPayload } = useDeals({ limit: 1000 });
    const addDealMutation = useAddDealMutation();
    const dealsList = dealsPayload?.records || [];

    const [isProcessing, setIsProcessing] = useState(false);
    const [intakeLoadError, setIntakeLoadError] = useState(null);
    // const [contactData, setContactData] = useState([]);

    useEffect(() => {
        const fetchSupportData = async () => {
            try {
                const [leads, inv, contacts] = await Promise.all([
                    api.get('/leads'),
                    api.get('/inventory'),
                    api.get('/contacts')
                ]);
                if (leads.data && leads.data.success) setLeadData(leads.data.data || []);
                if (inv.data && inv.data.success) setInventoryData(inv.data.data || []);
                if (contacts.data && contacts.data.success) {
                    // setContactData(contacts.data.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch support data:", err);
            }
        };
        fetchSupportData();
        loadIntakeGroups();
    }, []);


    // ===== DUPLICATE DETECTION & DATA PERSISTENCE UTILITIES =====

    const getItemCategory = useCallback((item) => {
        if (!item) return 'new';
        if (item.category && item.category !== 'new') return item.category;
        const dupCount = (item.duplicate_intelligence?.possible_duplicate_ids || []).length;
        if (dupCount === 1) return 'repeat1x';
        if (dupCount === 2) return 'repeat2x';
        if (dupCount === 3) return 'repeat3x';
        if (dupCount > 3) return 'repeat3plus';
        return item.category || 'new';
    }, []);

    const loadIntakeHistory = useCallback(async (filterJid) => {
        try {
            const params = { limit: 500 };
            const effectiveJid = filterJid !== undefined ? filterJid : selectedGroupFilter;
            if (effectiveJid && effectiveJid !== 'all' && effectiveJid !== 'whatsapp_group_all') {
                params.groupJid = effectiveJid;
            } else if (effectiveJid === 'whatsapp_group_all') {
                params.source_type = 'whatsapp_group';
            }
            const response = await intakeAPI.getIntakes(params);
            if (response.success) {
                setIntakeItems(response.data.map(item => ({
                    ...item,
                    id: item._id
                })));
                setIntakeLoadError(null);
            }
        } catch (error) {
            console.error(error);
            setIntakeLoadError(error.message || "Failed to connect to backend");
        }
    }, [selectedGroupFilter]);

    const loadMonitoredSources = async () => {
        try {
            const response = await api.get('/intake/monitors');
            if (response.data.success) {
                setMonitoredSources(response.data.data);
            }
        } catch (error) {
            console.error("Failed to load monitored sources", error);
        }
    };

    const handleToggleMonitor = async (id) => {
        try {
            const response = await api.patch(`/intake/monitors/${id}/toggle`);
            if (response.data.success) {
                toast.success(response.data.message);
                loadMonitoredSources();
            }
        } catch (error) {
            toast.error("Failed to toggle monitor");
        }
    };

    const handleDeleteMonitor = async (id) => {
        if (!window.confirm("Are you sure you want to stop monitoring this URL?")) return;
        try {
            const response = await api.delete(`/intake/monitors/${id}`);
            if (response.data.success) {
                toast.success("Monitor deleted");
                loadMonitoredSources();
            }
        } catch (error) {
            toast.error("Failed to delete monitor");
        }
    };

    // ===== WHATSAPP GROUPS LIVE INGESTION HANDLERS =====
    const loadIntakeGroups = useCallback(async () => {
        try {
            const response = await intakeAPI.getGroups();
            if (response.success) {
                setIntakeGroups(response.data || []);
            }
        } catch (err) {
            console.error("Failed to load intake groups:", err);
        }
    }, []);

    const handleToggleGroup = async (id) => {
        try {
            const response = await intakeAPI.toggleGroup(id);
            if (response.success) {
                toast.success(response.message);
                loadIntakeGroups();
            }
        } catch (err) {
            toast.error("Failed to toggle group");
        }
    };

    const handleScanGroupsNow = async () => {
        try {
            setIsScanningGroups(true);
            const response = await intakeAPI.scanGroupsNow();
            if (response.success) {
                toast.success("WhatsApp group scanner triggered! Scanning new messages...");
                setTimeout(async () => {
                    await Promise.all([loadIntakeHistory(), loadIntakeGroups()]);
                    setIsScanningGroups(false);
                }, 3000);
            }
        } catch (err) {
            toast.error("Failed to trigger scan");
            setIsScanningGroups(false);
        }
    };

    const handleBackfillGroup = async (id = 'all') => {
        if (!window.confirm("Are you sure you want to re-scan historical messages from this group? Existing duplicate deals will be automatically skipped.")) return;
        try {
            setIsScanningGroups(true);
            const response = await intakeAPI.backfillGroup(id);
            if (response.success) {
                toast.success(response.message);
                setTimeout(async () => {
                    await Promise.all([loadIntakeHistory(), loadIntakeGroups()]);
                    setIsScanningGroups(false);
                }, 3500);
            }
        } catch (err) {
            toast.error("Failed to start backfill");
            setIsScanningGroups(false);
        }
    };

    // Check if intake is duplicate based on property details (95% match)

    /*
    const checkDuplicateAndFrequency = (newIntake, existingDeals = []) => {
        const newDetails = extractPropertyDetails(newIntake);

        // If no property details found, mark as new
        const hasDetails = Object.values(newDetails).some(val => val && val.length > 0);
        if (!hasDetails) {
            return { isDuplicate: false, frequency: 0, category: 'new', matchDetails: null };
        }

        // Function to calculate overall match percentage
        const calculatePropertyMatch = (details1, details2) => {
            const fields = ['unitNumber', 'project', 'location', 'category', 'type', 'city'];
            let totalScore = 0;
            let fieldCount = 0;

            fields.forEach(field => {
                if (details1[field] && details2[field]) {
                    const similarity = calculateSimilarity(details1[field], details2[field]);
                    totalScore += similarity;
                    fieldCount++;
                }
            });

            return fieldCount > 0 ? totalScore / fieldCount : 0;
        };

        // Check against existing deals (Deal List View)
        let inDeals = false;
        for (const deal of existingDeals) {
            const dealDetails = extractPropertyDetails(deal);
            const matchScore = calculatePropertyMatch(newDetails, dealDetails);
            if (matchScore >= 95) {
                inDeals = true;
                break;
            }
        }

        // Check against intake history
        const historyMatches = intakeHistory.filter(item => {
            const itemDetails = extractPropertyDetails(item);
            const matchScore = calculatePropertyMatch(newDetails, itemDetails);
            return matchScore >= 95;
        });

        const frequency = historyMatches.length;
        const isDuplicate = inDeals || frequency > 0;

        // Categorize by frequency
        let category = 'new';
        if (frequency === 1) category = 'repeat1x';
        else if (frequency === 2) category = 'repeat2x';
        else if (frequency === 3) category = 'repeat3x';
        else if (frequency > 3) category = 'repeat3plus';

        return {
            isDuplicate,
            frequency,
            category,
            matchDetails: newDetails,
            lastSeen: historyMatches.length > 0 ? historyMatches[0].receivedAt : null
        };
    };
    */

    // Load history and groups on component mount and sync periodically
    useEffect(() => {
        loadIntakeHistory();
        loadIntakeGroups();

        // Run re-fetch periodically (live sync)
        const fetchInterval = setInterval(() => {
            loadIntakeHistory();
            loadIntakeGroups();
        }, 30000); // 30s
        return () => clearInterval(fetchInterval);
    }, [loadIntakeHistory, loadIntakeGroups]);

    // ===== END DUPLICATE DETECTION UTILITIES =====

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImportProcess = async () => {
        if (!selectedFile) return;

        setIsImporting(true);
        const toastId = toast.loading('Processing file via backend...');

        try {
            let response;
            if (selectedFile.name.endsWith('.zip')) {
                response = await intakeAPI.uploadZip(selectedFile);
            } else if (selectedFile.name.endsWith('.pdf')) {
                response = await intakeAPI.uploadPdf(selectedFile);
            } else if (selectedFile.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
                response = await intakeAPI.uploadOcr(selectedFile);
            } else {
                throw new Error('Unsupported format. Please upload .zip, .pdf or image.');
            }

            if (response.success) {
                toast.success('Imported successfully!', { id: toastId });
                setIsImportModalOpen(false);
                setSelectedFile(null);
                loadIntakeHistory(); // Refresh from backend
            } else {
                throw new Error(response.message || 'Import failed');
            }

        } catch (error) {
            console.error(error);
            toast.error(error.message, { id: toastId });
        } finally {
            setIsImporting(false);
        }
    };

    // SELLER Flow State
    const [detectedContacts, setDetectedContacts] = useState([]);
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [matchedInventory, setMatchedInventory] = useState([]);
    const [selectedInventory, setSelectedInventory] = useState(null);
    const [dealForm, setDealForm] = useState({
        projectName: '',
        block: '',
        unitNo: '',
        intent: 'Sell',
        price: '',
        status: 'Open',
        remarks: ''
    });
    const [matchedBuyers, setMatchedBuyers] = useState([]);
    // Manual Link State
    const [isManualLinkOpen, setIsManualLinkOpen] = useState(false);
    const [manualSearchQuery, setManualSearchQuery] = useState('');
    const [manualSearchResults, setManualSearchResults] = useState([]);

    // Quick Add Contact State
    const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
    const [prefilledContactData, setPrefilledContactData] = useState(null);

    // BUYER Flow State
    const [buyerContact, setBuyerContact] = useState(null);
    const [isTemporaryLead, setIsTemporaryLead] = useState(false);
    const [extractedReq, setExtractedReq] = useState({ type: '', location: '', budget: '', size: '' });
    const [ , setLeadId] = useState(null);
    const [matchedDeals, setMatchedDeals] = useState([]);
    const [parsedDeals, setParsedDeals] = useState([]);
    const [activeDealIndex, setActiveDealIndex] = useState(0);
    const [duplicateStatus, setDuplicateStatus] = useState(null);
    const [visibleCount, setVisibleCount] = useState(50); // Pagination Limit





    // parseContacts Removed - Logic centralized in dealParser.js

    // --- LEGACY HELPERS REMOVED (Replaced by dealParser.js) ---

    const [isLoadingFullItem, setIsLoadingFullItem] = useState(false);

    const handleSelectIntake = async (item) => {
        setIsLoadingFullItem(true);
        try {
            // Fetch separate full content if not already present (due to list projection)
            let fullItem = item;
            if (!item.content) {
                const response = await intakeAPI.getById(item._id);
                if (response.success) {
                    fullItem = response.data;
                }
            }

            setCurrentItem(fullItem);
            setWaPreviewData(null);
            setWaCustomMessage('');
            if (fullItem.wa_verification?.target_phone) {
                setWaTargetPhone(fullItem.wa_verification.target_phone);
                setWaTargetType(fullItem.wa_verification.target_type || 'text_contact');
            } else {
                setWaTargetPhone('');
                setWaTargetType('text_contact');
            }

            // Use Backend Parsed Data if available, else fallback to frontend splitter
            let deals = [];
            if (fullItem.meta?.parsedData) {
                // Backend returns a single object for PDF/OCR and an array for ZIP
                if (Array.isArray(fullItem.meta.parsedData)) {
                    deals = fullItem.meta.parsedData;
                } else {
                    deals = [fullItem.meta.parsedData];
                }
            } else {
                deals = splitIntakeMessage(fullItem.content, customPatterns);
            }

            console.log("Parsed Deals:", deals); 
            setParsedDeals(deals);
            setActiveDealIndex(0);

            if (deals && deals.length > 0) {
                loadDealIntoWorkflow(deals[0]);
            }
        } catch (error) {
            console.error("Critical Parsing Error:", error);
            toast.error("Error loading intake details");
        } finally {
            setIsLoadingFullItem(false);
        }
    };



    const checkDuplicates = (parsedData) => {
        if (!parsedData) return null;

        // 1. Inventory Match (Strongest Signal: Unit Number + Project/Location)
        if (parsedData.address?.unitNumber) {
            const unit = parsedData.address.unitNumber.toLowerCase();
            const loc = (parsedData.location || '').toLowerCase(); // "Sector 82" or similar

            // Find in Inventory
            const invMatch = inventoryData.find(inv => {
                const invUnit = (inv.unitNo || '').toLowerCase();
                if (invUnit !== unit) return false;

                // If unit matches, check location context if available
                if (inv.area && loc) {
                    return inv.area.toLowerCase().includes(loc) || loc.includes(inv.area.toLowerCase());
                }
                return true; // Match on Unit Number alone if no location context (risky but acceptable for warning)
            });

            if (invMatch) {
                return { isDuplicate: true, type: 'INVENTORY', match: invMatch, message: `Unit ${invMatch.unitNo} already exists in Inventory (${invMatch.category || 'Property'})` };
            }
        }

        // 2. Existing Deal Match (Fuzzy)
        // Check if we have an open deal for similar specs
        // This is harder without strict IDs, but we can check if a deal exists with same unit
        if (parsedData.address?.unitNumber) {
            const dealMatch = dealsList.find(d => d?.title?.includes(parsedData.address.unitNumber)); // simplistic check on title
            if (dealMatch) {
                return { isDuplicate: true, type: 'DEAL', match: dealMatch, message: `Active Deal found for Unit ${parsedData.address.unitNumber}` };
            }
        }

        return null;
    };

    const loadDealIntoWorkflow = (parsedData) => {
        setDetectedContacts(parsedData.allContacts);
        setIntakeType(parsedData.intent);

        // Reset Workflow
        setStage(1);
        setSelectedOwner(null);
        setSelectedInventory(null);
        setMatchedInventory([]);
        setMatchedDeals([]);
        setBuyerContact(null);
        setIsTemporaryLead(false);
        setLeadId(null);
        setOwnerCallOutcome(null);

        // DUPLICATE CHECK
        const dupCheck = checkDuplicates(parsedData);
        setDuplicateStatus(dupCheck);


        // Store Full Parsed Data
        setExtractedReq({
            type: parsedData.type,
            location: parsedData.location,
            budget: parsedData.specs.price,
            size: parsedData.specs.size,
            unitNo: parsedData.address.unitNo || parsedData.address.unitNumber,
            category: parsedData.category,
            remarks: parsedData.remarks, // New Field
            rawParsed: parsedData
        });

        // Auto Select Contact if found
        if (parsedData.allContacts.length > 0) {
            const contact = parsedData.allContacts[0];
            if (parsedData.intent === 'BUYER') {
                setBuyerContact(contact);
                setIsTemporaryLead(contact.role === 'Broker');
            }
        }
    };

    const handleSwitchDeal = (index) => {
        setActiveDealIndex(index);
        loadDealIntoWorkflow(parsedDeals[index]);
    };

    // --- LIVE WHATSAPP BROKER VERIFICATION DESK HANDLERS ---
    const handleFetchWAPreview = async (itemId) => {
        const id = itemId || currentItem?._id || currentItem?.id;
        if (!id) return;
        setWaLoadingPreview(true);
        try {
            const res = await intakeAPI.previewWAVerification(id);
            if (res.success) {
                setWaPreviewData(res);
                setWaCustomMessage(res.draftMessage || '');
                if (res.targetPhones?.recommendedTarget) {
                    setWaTargetPhone(res.targetPhones.recommendedTarget);
                    setWaTargetType(res.targetPhones.targetType || 'text_contact');
                } else if (res.targetPhones?.textContacts?.length > 0) {
                    setWaTargetPhone(res.targetPhones.textContacts[0]);
                    setWaTargetType('text_contact');
                } else if (res.targetPhones?.senderPhone) {
                    setWaTargetPhone(res.targetPhones.senderPhone);
                    setWaTargetType('sender');
                }
                toast.success('✨ Gemini Flash drafted broker inquiry!');
            } else {
                toast.error(res.message || 'Failed to preview verification inquiry');
            }
        } catch (err) {
            console.error('handleFetchWAPreview Error:', err);
            toast.error(err.message || 'Error generating inquiry preview');
        } finally {
            setWaLoadingPreview(false);
        }
    };

    const handleSendWAVerification = async () => {
        const id = currentItem?._id || currentItem?.id;
        if (!id) return toast.error('No intake item selected');
        if (!waTargetPhone) return toast.error('Please select or enter a target phone number');
        if (!waCustomMessage || !waCustomMessage.trim()) return toast.error('Message content cannot be empty');

        setWaSendingInquiry(true);
        try {
            const res = await intakeAPI.sendWAVerification(id, {
                targetPhone: waTargetPhone,
                targetType: waTargetType,
                message: waCustomMessage
            });
            if (res.success) {
                toast.success('🚀 Verification inquiry sent via WhatsApp Web!');
                // Update local currentItem state
                setCurrentItem(prev => ({
                    ...prev,
                    verification_status: 'pending',
                    wa_verification: {
                        ...(prev?.wa_verification || {}),
                        status: 'inquiry_sent',
                        target_phone: waTargetPhone,
                        target_type: waTargetType,
                        outbound_message: waCustomMessage,
                        initiated_at: new Date()
                    }
                }));
            } else {
                toast.error(res.message || 'Failed to send inquiry');
            }
        } catch (err) {
            console.error('handleSendWAVerification Error:', err);
            toast.error(err.message || 'Error sending inquiry via WhatsApp');
        } finally {
            setWaSendingInquiry(false);
        }
    };

    const handleRefreshWAStatus = async () => {
        const id = currentItem?._id || currentItem?.id;
        if (!id) return;
        setWaCheckingStatus(true);
        try {
            const res = await intakeAPI.getWAVerificationStatus(id);
            if (res.success) {
                setCurrentItem(prev => ({
                    ...prev,
                    wa_verification: res.wa_verification || prev?.wa_verification,
                    verification_status: res.verification_status || prev?.verification_status,
                    confidence_score: res.confidence_score ?? prev?.confidence_score,
                    extracted_entities: res.extracted_entities || prev?.extracted_entities
                }));
                if (res.wa_verification?.status === 'replied_verified') {
                    toast.success('🎉 Broker replied! Deal verified successfully.');
                } else if (res.wa_verification?.status === 'replied_incomplete') {
                    toast('Broker replied, but unit number was undisclosed', { icon: 'ℹ️' });
                } else {
                    toast('Still awaiting broker response...', { icon: '⏳' });
                }
            }
        } catch (err) {
            console.error('handleRefreshWAStatus Error:', err);
            toast.error('Error fetching verification status');
        } finally {
            setWaCheckingStatus(false);
        }
    };

    const handleApplyVerifiedValues = () => {
        const extracted = currentItem?.wa_verification?.extracted_data;
        if (!extracted) {
            toast.error('No verified data found');
            return;
        }

        const unitNumber = extracted.unit_number && extracted.unit_number !== 'UNDISCLOSED' && extracted.unit_number !== 'UNKNOWN' ? extracted.unit_number : '';
        const loc = extracted.location_confirmed || currentItem?.location || '';
        const finalPrice = extracted.final_price || currentItem?.price || '';

        // Update currentItem
        setCurrentItem(prev => ({
            ...prev,
            location: loc || prev?.location,
            price: finalPrice || prev?.price,
            verification_status: 'verified',
            confidence_score: Math.max(prev?.confidence_score || 0, 95),
            extracted_entities: {
                ...(prev?.extracted_entities || {}),
                unitNumber: unitNumber || prev?.extracted_entities?.unitNumber,
                location: loc || prev?.extracted_entities?.location,
                specs: {
                    ...(prev?.extracted_entities?.specs || {}),
                    price: finalPrice || prev?.extracted_entities?.specs?.price
                }
            }
        }));

        // Update extractedReq
        setExtractedReq(prev => ({
            ...prev,
            location: loc || prev?.location,
            budget: finalPrice || prev?.budget,
            unitNo: unitNumber || prev?.unitNo,
            rawParsed: prev?.rawParsed ? {
                ...prev.rawParsed,
                location: loc || prev.rawParsed.location,
                address: {
                    ...(prev.rawParsed.address || {}),
                    unitNumber: unitNumber || prev.rawParsed.address?.unitNumber,
                    unitNo: unitNumber || prev.rawParsed.address?.unitNo,
                    sector: loc || prev.rawParsed.address?.sector
                },
                specs: {
                    ...(prev.rawParsed.specs || {}),
                    price: finalPrice || prev.rawParsed.specs?.price
                }
            } : prev?.rawParsed
        }));

        // Update QuickAdd form
        setQuickAddForm(prev => ({
            ...prev,
            unitNo: unitNumber || prev?.unitNo,
            projectName: loc || prev?.projectName,
            price: finalPrice || prev?.price
        }));

        toast.success(`✅ Applied verified Unit #${unitNumber || 'Confirmed'} & Price ${finalPrice} to deal workflow!`);
    };

    const handleAddIntake = async () => {
        if (!newSourceContent.trim()) return;

        const toastId = toast.loading('Saving to backend...');
        try {
            const payload = {
                source: campaignSource || newSourceType,
                content: newSourceContent,
                campaignName: campaignName
            };

            // In our backend, we should probably have a manual post endpoint or just use another one.
            // Let's assume we can POST to /intake directly or use a specific one.
            // Since I didn't add a specific "manual" POST, I'll use the generic one if I add it, 
            // OR I can add it to intake.controller.js now.
            // Actually, I'll add a generic create endpoint to intake.controller.js.

            // For now, let's assume I'll add a 'create' method.
            const responseIntake = await intakeAPI.createIntake(payload);
        const dataIntake = responseIntake;

        if (dataIntake.success) {
                toast.success('New Intake Added', { id: toastId });
                setNewSourceContent('');
                setCampaignName('');
                setCampaignSource('WhatsApp');
                setIsAddModalOpen(false);
                loadIntakeHistory(); // Refresh
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to save intake', { id: toastId });
        }
    };

    const handleURLImport = async () => {
        if (!newSourceContent.trim()) {
            toast.error('Please enter a valid URL');
            return;
        }

        let urlToProcess = newSourceContent.trim();
        
        // 🛡️ Senior Strategy: Auto-fix common protocol typos (e.g. https//: -> https://)
        if (urlToProcess.includes('//:')) {
            urlToProcess = urlToProcess.replace('//:', '://');
        }

        // Auto-prepend https:// if protocol is missing (e.g. www.99acres.com -> https://www.99acres.com)
        if (!urlToProcess.match(/^[a-zA-Z]+:\/\//) && urlToProcess.length > 3) {
            urlToProcess = 'https://' + urlToProcess;
        }

        try {
            new URL(urlToProcess);
        } catch {
            toast.error('Invalid URL format. Please enter a valid website link.');
            return;
        }

        const toastId = toast.loading(isAutomated ? 'Setting up automated monitor...' : 'Fetching URL via backend queue...');
        try {
            let response;
            if (isAutomated) {
                // Call the new automated monitor endpoint
                response = await api.post('/intake/monitors', {
                    url: urlToProcess,
                    source: campaignSource || 'Website',
                    frequency: 'daily'
                });
            } else {
                response = await intakeAPI.processURL(urlToProcess, campaignSource || 'Website');
            }
            
            if (response.data?.success || response.success) {
                toast.success(isAutomated ? 'Automated Monitor active! Checking daily.' : 'URL queued for processing!', { id: toastId });
                setNewSourceContent('');
                setCampaignName('');
                setCampaignSource('Website');
                setIsAutomated(false);
                setIsAddModalOpen(false);
                loadIntakeHistory(); // Refresh queue view
            }
        } catch (error) {
            console.error(error);
            toast.error(error.message || 'Failed to fetch URL', { id: toastId });
        }
    };

    // Process selected file when Add Intake button is clicked
    const handleFileImport = async () => {
        if (!selectedFile) {
            toast.error('Please select a file first');
            return;
        }

        setIsImporting(true);
        const toastId = toast.loading('Processing file via backend...');

        try {
            let response;
            if (selectedFile.name.endsWith('.zip')) {
                response = await intakeAPI.uploadZip(selectedFile);
            } else if (selectedFile.name.endsWith('.pdf')) {
                response = await intakeAPI.uploadPdf(selectedFile);
            } else if (selectedFile.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
                response = await intakeAPI.uploadOcr(selectedFile);
            } else {
                throw new Error('Unsupported format. Please upload .zip, .pdf or image.');
            }

            if (response.success) {
                toast.success('Successfully imported!', { id: toastId });
                setIsAddModalOpen(false);
                setCampaignName('');
                setCampaignSource('WhatsApp');
                setContentInputMode('paste');
                setSelectedFile(null);
                loadIntakeHistory(); // Refresh
            } else {
                throw new Error(response.message || 'Import failed');
            }

        } catch (error) {
            console.error(error);
            toast.error(error.message, { id: toastId });
        } finally {
            setIsImporting(false);
        }
    };

    // --- SELLER FLOW HANDLERS ---
    const handleConfirmOwner = (contact) => {
        setSelectedOwner(contact);
        matchInventory(currentItem.content, contact);
        setStage(2);
    };

    // --- INVENTORY MATCHING ENGINE ---

    const matchInventory = (text, owner) => {
        setIsProcessing(true);
        // Delay processing slightly to allow UI to show loader if needed
        setTimeout(() => {
            try {
                const parsed = extractedReq.rawParsed || {};
                const pAddr = parsed.address || {};
                const pSpecs = parsed.specs || {};
                const rawTextLower = text.toLowerCase();

                // Pre-calculate search patterns to avoid RegExp creation in loop
                const searchUnit = pAddr.unitNumber ? pAddr.unitNumber.toLowerCase() : null;
                const searchUnitRegex = searchUnit ? new RegExp(`\\b${searchUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) : null;
                const searchSector = pAddr.sector ? pAddr.sector.toLowerCase() : null;

                // PERFORMANCE: Limit the search if inventoryData is massive
                const searchData = inventoryData.length > 2000 ? inventoryData.slice(0, 2000) : inventoryData;

                let matches = searchData.map(inv => {
                    let score = 0;
                    let reasons = [];

                    const unitStr = typeof inv.unitNo === 'object' ? (inv.unitNo.lookup_value || inv.unitNo.name || '') : (inv.unitNo || '');
                    const invUnit = unitStr.toLowerCase();
                    const areaStr = typeof inv.area === 'object' ? (inv.area.lookup_value || inv.area.name || '') : (inv.area || '');
                    const invArea = areaStr.toLowerCase();
                    const locStr = typeof inv.location === 'object' ? (inv.location.lookup_value || inv.location.name || '') : (inv.location || '');
                    const invLoc = locStr.toLowerCase();

                    // A. UNIT NUMBER
                    if (invUnit) {
                        if (searchUnit && invUnit === searchUnit) {
                            score += 50;
                            reasons.push('Exact Unit Match (Parsed)');
                        } else {
                            const safeUnit = invUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`\\b${safeUnit}\\b`);

                            if (regex.test(rawTextLower)) {
                                score += 45;
                                reasons.push('Unit # Found in Text');
                            } else if (invUnit.length > 2 && rawTextLower.includes(invUnit)) {
                                score += 30;
                                reasons.push('Unit # Partial Match');
                            }
                        }
                    }

                    // B. BLOCK MATCH
                    if (invLoc) {
                        if (rawTextLower.includes(invLoc)) {
                            score += 25;
                            reasons.push('Full Block Match');
                        } else {
                            const blockCode = invLoc.replace(/block/g, '').trim();
                            if (blockCode.length > 0 && (rawTextLower.includes(`block ${blockCode}`) || rawTextLower.includes(`${blockCode} block`))) {
                                score += 25;
                                reasons.push('Block Code Match');
                            }
                        }
                    }

                    // C. PROJECT / AREA / SECTOR MATCH
                    if (invArea) {
                        if (searchSector && invArea.includes(searchSector)) {
                            score += 30;
                            reasons.push('Sector/Project Match');
                        } else {
                            const tokens = invArea.split(/[\s,()-]+/).filter(t => t.length > 2 && !['sector', 'phase', 'mohali', 'city'].includes(t));
                            let tokenMatches = tokens.filter(token => rawTextLower.includes(token)).length;

                            if (tokenMatches > 0) {
                                score += (15 * tokenMatches);
                                reasons.push(`Area Keywords (${tokenMatches})`);
                            }
                        }
                    }

                    // D. OWNER MATCH
                    if (owner?.name && inv.ownerName?.toLowerCase().includes(owner.name.toLowerCase())) {
                        score += 40;
                        reasons.push('Owner Match');
                    }

                    return { inventory: inv, score: Math.min(score, 100), reasons };
                });

                matches = matches.filter(m => m.score >= 15).sort((a, b) => b.score - a.score);
                setMatchedInventory(matches.slice(0, 5));
            } finally {
                setIsProcessing(false);
            }
        }, 10);
    };

    // New State for Quick Create
    const [quickAddForm, setQuickAddForm] = useState({
        city: '',
        projectName: '',
        block: '',
        unitNo: '',
        type: 'Residential',
        size: ''
    });

    // Modal State for Quick Add
    const [modalTriggers, setModalTriggers] = useState({
        project: false,
        block: false,
        size: false
    });

    const handleTriggerModal = (type) => { // 'PROJECT', 'BLOCK', 'SIZE'
        setModalTriggers(prev => ({ ...prev, [type.toLowerCase()]: true }));
    };

    const handleQuickAddInventory = () => {
        if (!quickAddForm.projectName || !quickAddForm.unitNo) {
            toast.error("Project and Unit Number are required");
            return;
        }

        const newInv = {
            id: Date.now(),
            unitNo: quickAddForm.unitNo,
            location: quickAddForm.block, // Mapping Block to 'location'
            area: `${quickAddForm.projectName}, ${quickAddForm.city}`, // Mapping Project+City to 'area'
            type: quickAddForm.type,
            size: quickAddForm.size,
            status: 'Active',
            ownerName: selectedOwner?.name || 'Unknown',
            ownerPhone: selectedOwner?.mobile || '',
        };

        // In a real app, this would be an API call
        // inventoryData.push(newInv); 

        setSelectedInventory(newInv);
        setStage(3);
        setIsManualLinkOpen(false);
        toast.success(`New Unit Created: ${newInv.unitNo} @ ${quickAddForm.projectName}`);
    };

    // Pre-fill Quick Form when opening manual link
    useEffect(() => {
        if (isManualLinkOpen && extractedReq.rawParsed) {
            setQuickAddForm({
                city: extractedReq.rawParsed.address.city || '',
                projectName: extractedReq.rawParsed.address.sector || '',
                block: '', // Parser might need update to catch block explicitly
                unitNo: extractedReq.rawParsed.address.unitNo || extractedReq.rawParsed.address.unitNumber || '',
                type: extractedReq.rawParsed.type || 'Residential',
                size: extractedReq.rawParsed.specs.size || ''
            });
        }
    }, [isManualLinkOpen, extractedReq.rawParsed]);


    // ... (Inside the render)
    // Replacement for the Inventory Match UI Section


    const handleCreateDeal = () => {
        setStage(4);
        matchBuyers();
        toast.success("Deal Created Successfully!");
    };

    const matchBuyers = () => {
        if (!selectedInventory) return;
        const type = selectedInventory.type.split('(')[0];
        const matches = leadData.filter(lead => {
            return lead.req.type.includes(type) || lead.remarks.includes('int');
        });
        setMatchedBuyers(matches.slice(0, 3));
    };

    // --- QUICK DEAL HANDLERS ---
    const handleQuickDealCreate = async (quickDealData) => {
        setIsProcessing(true);
        const toastId = toast.loading("Creating Deal & Updating Intake...");

        try {
            // 1. Prepare Deal Payload
            const price = parseFloat(quickDealData.price?.toString().replace(/[^0-9.]/g, '')) || 0;
            const dealPayload = {
                owner: quickDealData.owner?._id || quickDealData.owner?.id,
                inventoryId: quickDealData.property?._id || quickDealData.property?.id,
                projectName: quickDealData.property?.projectName || quickDealData.property?.area?.split(',')[0],
                block: quickDealData.property?.block || quickDealData.property?.location,
                unitNo: quickDealData.property?.unitNo,
                intent: quickDealData.type,
                price: price,
                status: 'Open',
                source: quickDealData.source || 'Manual',
                verificationStatus: quickDealData.verificationStatus || 'unverified'
            };

            // 2. Create the Deal in Backend
            const dealResponse = { data: await addDealMutation.mutateAsync(dealPayload) };
            if (!dealResponse.data?.success && dealResponse.data?.status !== 'success') {
                throw new Error("Failed to persist deal to database");
            }

            // 3. Update Local State (Legacy UI logic)
            setSelectedOwner(quickDealData.owner);
            setSelectedInventory(quickDealData.property);
            setDealForm({
                intent: quickDealData.type,
                price: quickDealData.price,
                status: 'Open',
                verificationStatus: quickDealData.verificationStatus
            });

            // 4. Mark Intake as Processed in Backend
            if (currentItem && (currentItem.id || currentItem._id)) {
                try {
                    await intakeAPI.updateStatus(currentItem.id || currentItem._id, 'Processed');
                } catch (err) {
                    console.error("Failed to update intake status:", err);
                    // Non-blocking for the deal creation success
                }
            }

            const verificationBadge = quickDealData.verificationStatus === 'confirmed' ? '✓ Verified' :
                quickDealData.verificationStatus === 'unverified' ? '⚠️ Unverified' : '';
            toast.success(`Deal Created Successfully ${verificationBadge}`, { id: toastId });

            // 5. Move to buyer matching stage
            setStage(4);
            matchBuyers();

            // 6. Close workflow after brief delay
            setTimeout(() => {
                setCurrentItem(null);
                setStage(0);
                loadIntakeHistory(); // Refresh list to show updated status
            }, 2000);

        } catch (error) {
            console.error("Quick Deal Creation Error:", error);
            const errMsg = error.response?.data?.error || error.message || "Failed to create deal";
            toast.error(errMsg, { id: toastId });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleQuickDealSkip = () => {
        toast('Deal creation skipped');
        setCurrentItem(null);
        setStage(0);
    };

    const handleQuickDealBack = () => {
        setCurrentItem(null);
        setStage(0);
    };

    // --- BUYER FLOW HANDLERS ---
    const handleCreateLead = () => {
        // Mock Lead Creation
        const newLeadId = 'L-' + Date.now();
        setLeadId(newLeadId);
        toast.success(isTemporaryLead ? "Temporary Lead Created (15 Day Expiry)" : "Permanent Lead Created");

        // Auto Match Deals
        matchDeals();
        setStage(2); // Move to Match Stage
    };

    const matchDeals = () => {
        setIsProcessing(true);
        setTimeout(() => {
            try {
                const req = extractedReq;
                const searchLoc = req.location ? req.location.toLowerCase() : null;
                const searchType = req.type || null;

                // PERFORMANCE: Limit search
                const searchData = dealsList.length > 2000 ? dealsList.slice(0, 2000) : dealsList;

                let matches = searchData.map(deal => {
                    let score = 0;
                    const locationStr = typeof deal.location === 'object' ? (deal.location.lookup_value || deal.location.name || '') : (deal.location || '');
                    const typeStr = typeof deal.type === 'object' ? (deal.type.lookup_value || deal.type.name || '') : (deal.type || '');
                    const priceStr = deal.price || '';
                    const descStr = deal.description || '';

                    if (searchLoc && locationStr.toLowerCase().includes(searchLoc)) score += 40;
                    if (searchType && typeStr.includes(searchType)) score += 30;
                    if (req.budget && priceStr.includes(req.budget)) score += 20;
                    if (searchType && descStr.toLowerCase().includes(searchType.toLowerCase())) score += 10;

                    return { deal, score: Math.min(score, 100) };
                });

                matches = matches.filter(m => m.score > 20).sort((a, b) => b.score - a.score);
                setMatchedDeals(matches);
            } finally {
                setIsProcessing(false);
            }
        }, 10);
    };


    const handleOpenAddContact = (mobile) => {
        setPrefilledContactData({
            phones: [{ number: mobile || '', type: 'Personal' }],
            name: '',
            title: 'Mr.'
        });
        setIsAddContactModalOpen(true);
    };

    const handleContactAdded = (newContact) => {
        // 1. Update Mock Data (In-memory) - In real app, API update happens in Modal
        // contactData.push(newContact); // Assuming import reference is mutable or we rely on re-fetch
        // Since we deal with mockData, we might need to manually ensure it's "found" in next render
        // For now, let's manually update the detectedContacts state

        const newDetected = {
            mobile: newContact.phones[0]?.number,
            name: newContact.name + ' ' + (newContact.surname || ''),
            role: 'New Contact', // Or whatever default
            id: newContact.id,
            isNew: false, // Now it exists
            isBroker: false,
            stats: { leads: 0, inventory: 0, deals: 0, activities: 0, total: 0 }
        };

        // Update detected contacts list if this was a blank add or specific
        setDetectedContacts(prev => [newDetected, ...prev]);
        toast.success("Contact Added & Linked");
    };

    // Scope items by selected WhatsApp group source filter
    const scopedIntakeItems = useMemo(() => {
        if (!intakeItems) return [];
        if (selectedGroupFilter === 'all') return intakeItems;
        if (selectedGroupFilter === 'whatsapp_group_all') {
            return intakeItems.filter(item => 
                item.source_type === 'whatsapp_group' || 
                (item.source && item.source.startsWith('WhatsApp Group'))
            );
        }
        return intakeItems.filter(item => 
            item.raw_source_data?.groupJid === selectedGroupFilter ||
            item.extracted_entities?._whatsappGroup?.groupJid === selectedGroupFilter
        );
    }, [intakeItems, selectedGroupFilter]);

    // Filter scoped intake items by category (All, New, 1x, 2x, 3x, 3+)
    const filteredIntakeItems = useMemo(() => {
        if (categoryFilter === 'all') return scopedIntakeItems;
        return scopedIntakeItems.filter(item => getItemCategory(item) === categoryFilter);
    }, [scopedIntakeItems, categoryFilter, getItemCategory]);

    return (
        <div style={{ display: 'flex', height: '100vh', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
            {/* Left Panel: Workflow Steps / Inbox */}
            <div style={{ width: '360px', minWidth: '360px', maxWidth: '360px', flexShrink: 0, background: isDark ? 'var(--surface-color, #0f172a)' : '#ffffff', borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Header Top Row: Title + Utility Action Icons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                <i className="fas fa-magic" style={{ color: '#6366f1', fontSize: '0.95rem' }}></i>
                                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: isDark ? 'var(--text-main, #f8fafc)' : '#1e293b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Unified Intake Engine</h2>
                            </div>
                            <p style={{ fontSize: '0.72rem', color: isDark ? 'var(--text-muted, #94a3b8)' : '#64748b', margin: 0 }}>Processing Queue: <strong style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>{scopedIntakeItems.length}</strong> items</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button
                                onClick={loadIntakeHistory}
                                title="Refresh Queue"
                                style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className="fas fa-sync-alt" style={{ fontSize: '0.75rem', color: isDark ? 'var(--text-muted, #cbd5e1)' : '#64748b' }}></i>
                            </button>
                            <button
                                onClick={() => {
                                    loadMonitoredSources();
                                    setIsMonitorModalOpen(true);
                                }}
                                title="Monitored URLs"
                                style={{
                                    background: isDark ? 'rgba(139, 92, 246, 0.15)' : '#f5f3ff',
                                    border: isDark ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid #ddd6fe',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className="fas fa-redo-alt" style={{ fontSize: '0.75rem', color: '#8b5cf6' }}></i>
                            </button>
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                title="Add Intake"
                                style={{
                                    background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                                    border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid #bfdbfe',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className="fas fa-plus" style={{ fontSize: '0.75rem', color: '#3b82f6' }}></i>
                            </button>
                        </div>
                    </div>

                    {/* Dedicated WhatsApp Hub Button */}
                    <button
                        onClick={() => {
                            loadIntakeGroups();
                            setIsGroupModalOpen(true);
                        }}
                        className="btn-whatsapp-hub"
                        title="Open WhatsApp Groups Live Ingestion Hub"
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: isDark 
                                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(21, 128, 61, 0.35))' 
                                : 'linear-gradient(135deg, #16a34a, #15803d)',
                            border: isDark ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid #16a34a',
                            borderRadius: '8px',
                            color: '#ffffff',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                            boxSizing: 'border-box',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <i className="fab fa-whatsapp" style={{ fontSize: '0.9rem', color: '#fff' }}></i>
                            </div>
                            <div style={{ textAlign: 'left', lineHeight: 1.2, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    WhatsApp Hub
                                </div>
                                <div style={{ fontSize: '0.68rem', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {intakeGroups.length} Groups Connected
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {intakeGroups.reduce((acc, g) => acc + (g.totalProcessed || 0), 0) > 0 && (
                                <span style={{
                                    background: '#ffffff',
                                    color: '#15803d',
                                    fontSize: '0.68rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }}>
                                    {intakeGroups.reduce((acc, g) => acc + (g.totalProcessed || 0), 0)} msgs
                                </span>
                            )}
                            <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem', opacity: 0.85 }}></i>
                        </div>
                    </button>
                </div>

                {/* Category Filters */}
                <div style={{ padding: '12px 14px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {[
                            { key: 'all', label: 'All', color: isDark ? '#94a3b8' : '#64748b' },
                            { key: 'new', label: 'New', color: '#10b981' },
                            { key: 'repeat1x', label: '1x', color: '#f59e0b' },
                            { key: 'repeat2x', label: '2x', color: '#f97316' },
                            { key: 'repeat3x', label: '3x', color: '#ef4444' },
                            { key: 'repeat3plus', label: '3+', color: '#991b1b' }
                        ].map(filter => {
                            const count = filter.key === 'all'
                                ? scopedIntakeItems.length
                                : scopedIntakeItems.filter(item => getItemCategory(item) === filter.key).length;

                            const isSelected = categoryFilter === filter.key;
                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => setCategoryFilter(filter.key)}
                                    style={{
                                        padding: '5px 8px',
                                        borderRadius: '6px',
                                        border: isSelected ? `2px solid ${filter.color}` : (isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0'),
                                        background: isSelected 
                                            ? (isDark ? `${filter.color}25` : `${filter.color}15`) 
                                            : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff'),
                                        color: isSelected ? filter.color : (isDark ? '#cbd5e1' : '#64748b'),
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        boxSizing: 'border-box',
                                        minWidth: 0,
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {filter.label}
                                    </span>
                                    <span style={{
                                        background: filter.color,
                                        color: '#ffffff',
                                        borderRadius: '10px',
                                        padding: '1px 5px',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        flexShrink: 0,
                                        minWidth: '16px',
                                        textAlign: 'center'
                                    }}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* WhatsApp Groups / Source Filter Dropdown */}
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                <i className="fab fa-whatsapp" style={{ color: '#22c55e', fontSize: '0.85rem' }}></i> Source Filter
                            </span>
                            {selectedGroupFilter !== 'all' && (
                                <button
                                    onClick={() => {
                                        setSelectedGroupFilter('all');
                                        loadIntakeHistory('all');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#3b82f6',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        padding: 0
                                    }}
                                >
                                    Reset Filter
                                </button>
                            )}
                        </div>
                        <div style={{ width: '100%', minWidth: 0 }}>
                            <select
                                value={selectedGroupFilter}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedGroupFilter(val);
                                    loadIntakeHistory(val);
                                }}
                                style={{
                                    width: '100%',
                                    minWidth: 0,
                                    maxWidth: '100%',
                                    boxSizing: 'border-box',
                                    fontSize: '0.74rem',
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                                    background: isDark ? '#1e293b' : '#ffffff',
                                    color: isDark ? '#f8fafc' : '#1e293b',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <option value="all">All Sources ({intakeItems.length})</option>
                                <option value="whatsapp_group_all">
                                    🟢 All WhatsApp Groups ({intakeItems.filter(i => i.source_type === 'whatsapp_group' || (i.source && i.source.startsWith('WhatsApp Group'))).length})
                                </option>
                                {intakeGroups.map(g => {
                                    const groupLiveCount = intakeItems.filter(i => 
                                        i.raw_source_data?.groupJid === g.groupJid ||
                                        i.extracted_entities?._whatsappGroup?.groupJid === g.groupJid
                                    ).length;
                                    return (
                                        <option key={g.groupJid} value={g.groupJid}>
                                            💬 {g.groupName || g.groupJid} ({groupLiveCount > 0 ? `${groupLiveCount} live` : `${g.totalProcessed || 0} processed`})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {intakeLoadError ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ef4444' }}>
                            <i className="fas fa-exclamation-triangle" style={{ fontSize: '3rem', opacity: 0.5, marginBottom: '10px' }}></i>
                            <p style={{ fontWeight: 600 }}>Connection Error</p>
                            <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>{intakeLoadError}</p>
                            <button 
                                onClick={loadIntakeHistory}
                                style={{
                                    marginTop: '15px',
                                    padding: '8px 16px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
                                Retry Connection
                            </button>
                        </div>
                    ) : (!filteredIntakeItems || filteredIntakeItems.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                            <i className="fas fa-inbox" style={{ fontSize: '3rem', opacity: 0.2, marginBottom: '10px' }}></i>
                            <p>Queue is empty</p>
                            <p style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.8 }}>
                                {categoryFilter === 'all' ? 'Great job! You\'ve processed all items.' : `No ${categoryFilter} items found.`}
                            </p>
                        </div>
                    ) : (
                        filteredIntakeItems.slice(0, visibleCount).map(item => {
                        const getCategoryColor = (category) => {
                            const colors = {
                                new: '#10b981',
                                repeat1x: '#f59e0b',
                                repeat2x: '#f97316',
                                repeat3x: '#ef4444',
                                repeat3plus: '#991b1b'
                            };
                            return colors[category] || '#64748b';
                        };

                        return (
                            <div
                                key={item._id || item.id}
                                onClick={() => handleSelectIntake(item)}
                                style={{
                                    padding: '15px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    background: ((currentItem?._id || currentItem?.id) === (item._id || item.id)) ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                    borderLeft: ((currentItem?._id || currentItem?.id) === (item._id || item.id)) ? '4px solid #3b82f6' : '4px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {item.source_type === 'whatsapp_group' || (item.source && item.source.startsWith('WhatsApp Group')) ? (
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                color: isDark ? '#4ade80' : '#15803d',
                                                background: isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
                                                border: isDark ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid #86efac',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                maxWidth: '190px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                boxShadow: '0 1px 2px rgba(34, 197, 94, 0.15)'
                                            }} title={item.raw_source_data?.groupName || item.extracted_entities?._whatsappGroup?.groupName || item.source}>
                                                <i className="fab fa-whatsapp" style={{ color: '#22c55e', fontSize: '0.85rem' }}></i>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.raw_source_data?.groupName || item.extracted_entities?._whatsappGroup?.groupName || (item.source && item.source.replace(/^WhatsApp Group:\s*/, '')) || 'WhatsApp Group'}
                                                </span>
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: item.source === 'WhatsApp' ? '#22c55e' : '#f59e0b', background: item.source === 'WhatsApp' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>{item.source}</span>
                                        )}
                                        {(item.status === 'Needs Review' || item.verification_status === 'needs_review' || item.verification_status === 'suspicious') && (
                                            <span style={{ 
                                                fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', 
                                                color: item.verification_status === 'suspicious' ? '#b91c1c' : '#ef4444', 
                                                background: item.verification_status === 'suspicious' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#fef2f2' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2', 
                                                border: item.verification_status === 'suspicious' ? '1px solid #fca5a5' : '1px solid #fecaca' 
                                            }}>
                                                <i className="fas fa-exclamation-circle" style={{ marginRight: '4px' }}></i>
                                                {item.verification_status === 'suspicious' ? 'SUSPICIOUS' : 'NEEDS REVIEW'}
                                            </span>
                                        )}
                                        {(() => {
                                            const itemCat = getItemCategory(item);
                                            if (itemCat === 'new') return null;
                                            const categoryLabels = {
                                                repeat1x: '1x Duplicate',
                                                repeat2x: '2x Duplicate',
                                                repeat3x: '3x Duplicate',
                                                repeat3plus: '3+ Duplicate'
                                            };
                                            const categoryColors = {
                                                repeat1x: { bg: isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7', text: isDark ? '#fbbf24' : '#b45309', border: '#fde68a' },
                                                repeat2x: { bg: isDark ? 'rgba(249, 115, 22, 0.25)' : '#ffedd5', text: isDark ? '#fb923c' : '#c2410c', border: '#fed7aa' },
                                                repeat3x: { bg: isDark ? 'rgba(239, 68, 68, 0.25)' : '#fee2e2', text: isDark ? '#f87171' : '#b91c1c', border: '#fca5a5' },
                                                repeat3plus: { bg: isDark ? 'rgba(153, 27, 27, 0.35)' : '#fdf2f8', text: isDark ? '#fda4af' : '#991b1b', border: '#fbcfe8' }
                                            };
                                            const styling = categoryColors[itemCat] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
                                            return (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    color: styling.text,
                                                    background: styling.bg,
                                                    border: `1px solid ${styling.border}`,
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}>
                                                    <i className="fas fa-copy" style={{ fontSize: '0.6rem' }}></i>
                                                    {categoryLabels[itemCat] || itemCat}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
                                                {new Date(item.receivedAt || item.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>
                                                {new Date(item.receivedAt || item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                        {item.status === 'Failed' && (
                                            <span style={{ fontSize: '0.6rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2', color: '#ef4444', padding: '2px 4px', borderRadius: '4px', fontWeight: 900 }}>FAILED</span>
                                        )}
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (window.confirm("Remove this item from queue?")) {
                                                    try {
                                                        const response = await api.delete(`/intake/${item.id || item._id}`);
                                                        const data = response.data;
                                                        if (data.success) {
                                                            toast.success('Item removed');
                                                            loadIntakeHistory();
                                                            if ((currentItem?._id || currentItem?.id) === (item._id || item.id)) setCurrentItem(null);
                                                        }
                                                    } catch (err) {
                                                        toast.error('Failed to remove item');
                                                    }
                                                }
                                            }}
                                            className="delete-btn-hover"
                                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.8 }}
                                            title="Dismiss"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-main)' : '#334155', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {item.contentSnippet || item.content}
                                </div>
                            </div>
                        );
                    }))}

                    {visibleCount < intakeItems.length && (
                        <div style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                                onClick={() => setVisibleCount(prev => prev + 50)}
                                style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: isDark ? 'var(--text-main)' : '#475569',
                                    width: '100%'
                                }}
                            >
                                Load More ({intakeItems.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Workflow Stage View */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                {isProcessing && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255, 255, 255, 0.7)', zIndex: 100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: '12px', backdropFilter: 'blur(2px)'
                    }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <div style={{ fontWeight: 700, color: isDark ? 'var(--text-main)' : '#1e293b' }}>Processing Deal Data...</div>
                        <style>{`
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        `}</style>
                    </div>
                )}
                {!currentItem ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column' }}>
                        <i className="far fa-comments" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                        <p>Select a message to process</p>
                    </div>
                ) : (
                    <>
                        {/* Pinned Top Bar: Intake ID, Intent Badge & Stage Dots */}
                        <div style={{
                            padding: '14px 36px',
                            background: isDark ? 'var(--surface-color, #1e293b)' : '#ffffff',
                            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                            flexShrink: 0,
                            zIndex: 10,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: isDark ? 'var(--text-main, #f8fafc)' : '#0f172a', margin: 0 }}>
                                    Intake #{currentItem?._id ? currentItem._id.slice(-6).toUpperCase() : renderValue(currentItem?.id)}
                                </h2>
                                <div style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800,
                                    background: intakeType === 'BUYER' ? (isDark ? 'rgba(22, 163, 74, 0.2)' : '#f0fdf4') : (isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff'),
                                    color: intakeType === 'BUYER' ? '#16a34a' : '#3b82f6',
                                    border: '1px solid currentColor'
                                }}>
                                    {intakeType} INTENT DETECTED
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[1, 2, 3, 4].map(s => (
                                        <div key={s}
                                            style={{
                                                width: '36px', height: '4px',
                                                background: stage >= s ? (intakeType === 'BUYER' ? '#16a34a' : '#3b82f6') : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                                                borderRadius: '2px',
                                                transition: 'background 0.3s'
                                            }}
                                            title={`Stage ${s}`}
                                        ></div>
                                    ))}
                                </div>
                                {extractedReq.tags && extractedReq.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {extractedReq.tags.map((tag, i) => (
                                            <span key={i} style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                color: tag === 'URGENT' ? '#b91c1c' : tag === 'DIRECT' ? '#15803d' : '#0369a1',
                                                background: tag === 'URGENT' ? (isDark ? 'rgba(220, 38, 38, 0.2)' : '#fecaca') : tag === 'DIRECT' ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7') : (isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe'),
                                                border: '1px solid currentColor'
                                            }}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Scrollable Right Panel Viewport */}
                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '24px 36px', background: isDark ? 'rgba(255, 255, 255, 0.01)' : '#ffffff', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0' }}>

                            {/* Multi-Deal Switcher */}
                            {parsedDeals.length > 1 && (
                                <div style={{ padding: '10px 40px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', marginBottom: '8px' }}>
                                        <i className="fas fa-layer-group"></i> Multiple Deals Detected ({parsedDeals.length})
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                                        {parsedDeals.map((deal, idx) => (
                                            <button
                                                key={`deal-switch-${idx}-${deal.location}`}
                                                onClick={() => handleSwitchDeal(idx)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: activeDealIndex === idx ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                                                    background: activeDealIndex === idx ? isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                                    color: activeDealIndex === idx ? isDark ? 'var(--text-main)' : '#1e293b' : isDark ? 'var(--text-muted)' : '#64748b',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                #{idx + 1}: {deal.address?.unitNumber ? `Unit ${deal.address.unitNumber}` : deal.location} ({deal.specs?.price || 'No Price'})
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* WhatsApp Group Ingestion Provenance */}
                            {(currentItem?.source_type === 'whatsapp_group' || currentItem?.extracted_entities?._whatsappGroup || (currentItem?.source && currentItem?.source.startsWith('WhatsApp Group'))) && (
                                <div style={{ padding: '16px 40px', background: isDark ? 'rgba(34, 197, 94, 0.08)' : '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-whatsapp" style={{ color: '#22c55e', fontSize: '1.25rem' }}></i>
                                            Live WhatsApp Group Provenance
                                        </div>
                                        <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontWeight: 800, border: '1px solid #86efac' }}>
                                            🟢 LIVE INGESTION ENGINE
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
                                        <div style={{ background: isDark ? 'rgba(0,0,0,0.2)' : '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                            <div style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '3px' }}>Original Group Name</div>
                                            <div style={{ color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 700, wordBreak: 'break-word' }}>
                                                {currentItem?.extracted_entities?._whatsappGroup?.groupName || currentItem?.raw_source_data?.groupName || (currentItem?.source && currentItem.source.replace(/^WhatsApp Group:\s*/, '')) || 'WhatsApp Group'}
                                            </div>
                                        </div>
                                        <div style={{ background: isDark ? 'rgba(0,0,0,0.2)' : '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                            <div style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '3px' }}>Broker / Sender Name</div>
                                            <div style={{ color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 700 }}>
                                                {currentItem?.extracted_entities?._whatsappGroup?.senderName || currentItem?.raw_source_data?.senderName || currentItem?.extracted_entities?.brokerName || 'Group Member'}
                                            </div>
                                        </div>
                                        <div style={{ background: isDark ? 'rgba(0,0,0,0.2)' : '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                            <div style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '3px' }}>Participant Mobile Number</div>
                                            <div style={{ color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 700, fontFamily: 'monospace' }}>
                                                {(() => {
                                                    const raw = currentItem?.extracted_entities?._whatsappGroup?.participant || currentItem?.raw_source_data?.participant || currentItem?.extracted_entities?.phone || '';
                                                    const clean = raw.replace(/@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
                                                    return clean ? (clean.startsWith('+') ? clean : `+${clean}`) : 'N/A';
                                                })()}
                                            </div>
                                        </div>
                                        <div style={{ background: isDark ? 'rgba(0,0,0,0.2)' : '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                            <div style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '3px' }}>Message Timestamp</div>
                                            <div style={{ color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 700 }}>
                                                {currentItem?.receivedAt ? new Date(currentItem.receivedAt).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Raw Source Data Box */}
                            <div style={{ padding: '16px 40px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-align-left"></i> Original Raw Message
                                </div>
                                <div style={{ 
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', 
                                    border: '1px solid #cbd5e1', 
                                    borderRadius: '6px', 
                                    padding: '12px', 
                                    fontSize: '0.85rem', 
                                    color: isDark ? 'var(--text-main)' : '#1e293b', 
                                    whiteSpace: 'pre-wrap', 
                                    maxHeight: '150px', 
                                    overflowY: 'auto',
                                    fontFamily: 'monospace',
                                    lineHeight: '1.4'
                                }}>
                                    {currentItem?.content || currentItem?.description || "No raw content available."}
                                </div>
                            </div>

                            {/* Smart Structured ID Card */}
                            {duplicateStatus && (
                                <div className="animate-fade-in" style={{ marginBottom: '16px', padding: '12px 16px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#9a3412' }}>
                                    <div style={{ background: '#ffedd5', padding: '8px', borderRadius: '50%' }}>
                                        <i className="fas fa-exclamation-triangle" style={{ color: '#f97316' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Possible Duplicate Detected</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{renderValue(duplicateStatus.message)}</div>
                                    </div>
                                    <button style={{ padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', cursor: 'pointer' }}>
                                        View Existing
                                    </button>
                                </div>
                            )}

                            {/* AI Verification Layer Panel */}
                            {currentItem && (
                                <div style={{ 
                                    marginBottom: '16px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: '1px solid #cbd5e1', 
                                    borderRadius: '8px', overflow: 'hidden' 
                                }}>
                                    <div style={{ 
                                        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', 
                                        alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff' 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-robot" style={{ color: '#6366f1' }}></i>
                                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: isDark ? 'var(--text-main)' : '#1e293b' }}>AI Verification Layer</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {/* Confidence Score Badge */}
                                            {currentItem.confidence_score !== undefined && (
                                                <span style={{
                                                    fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                                                    background: currentItem.confidence_score >= 80 ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : currentItem.confidence_score >= 50 ? '#fef3c7' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2',
                                                    color: currentItem.confidence_score >= 80 ? '#16a34a' : currentItem.confidence_score >= 50 ? '#d97706' : '#dc2626',
                                                    border: '1px solid currentColor'
                                                }}>
                                                    Confidence: {currentItem.confidence_score}%
                                                </span>
                                            )}
                                            {/* Verification Status Badge */}
                                            {currentItem.verification_status && (
                                                <span style={{
                                                    fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                                                    background: currentItem.verification_status === 'verified' ? '#d1fae5' : currentItem.verification_status === 'suspicious' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                                    color: currentItem.verification_status === 'verified' ? '#059669' : currentItem.verification_status === 'suspicious' ? '#b91c1c' : isDark ? 'var(--text-main)' : '#475569',
                                                    border: '1px solid currentColor'
                                                }}>
                                                    {currentItem.verification_status.toUpperCase().replace('_', ' ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div style={{ padding: '16px', display: 'flex', gap: '20px' }}>
                                        {/* Risk Flags */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '8px' }}>RISK FLAGS</div>
                                            {(!currentItem.risk_flags || currentItem.risk_flags.length === 0) ? (
                                                <div style={{ fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <i className="fas fa-check-circle"></i> No risks detected
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {currentItem.risk_flags.map((flag, i) => (
                                                        <span key={i} style={{
                                                            fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '4px',
                                                            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}>
                                                            <i className="fas fa-exclamation-triangle" style={{ fontSize: '0.65rem' }}></i>
                                                            {flag.toUpperCase().replace(/_/g, ' ')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* AI Notes */}
                                        <div style={{ flex: 2, borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '8px' }}>AI ANALYSIS NOTES</div>
                                            {(!currentItem.verification_notes || currentItem.verification_notes.length === 0) ? (
                                                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No notes available.</div>
                                            ) : (
                                                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#475569' }}>
                                                    {currentItem.verification_notes.map((note, i) => (
                                                        <li key={i} style={{ marginBottom: '4px' }}>{note}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    {/* Duplicate Intelligence Engine Panel */}
                                    {currentItem.duplicate_intelligence && currentItem.duplicate_intelligence.duplicate_probability > 40 && (
                                        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: '#fff1f2' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <i className="fas fa-clone" style={{ color: '#e11d48' }}></i>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#be123c' }}>
                                                    DUPLICATE INTELLIGENCE (Probability: {currentItem.duplicate_intelligence.duplicate_probability}%)
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#9f1239', marginBottom: '8px' }}>
                                                The system detected strong similarities with existing properties in the database.
                                            </div>
                                            {currentItem.duplicate_intelligence.merge_suggestions && currentItem.duplicate_intelligence.merge_suggestions.length > 0 && (
                                                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#881337', fontWeight: 600 }}>
                                                    {currentItem.duplicate_intelligence.merge_suggestions.map((sug, idx) => (
                                                        <li key={idx} style={{ marginBottom: '4px' }}>{sug}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}

                                    {/* Intake AI Assistant Panel */}
                                    {currentItem.ai_assistant && (
                                        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                                <i className="fas fa-magic" style={{ color: '#8b5cf6' }}></i>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase' }}>
                                                    Intake AI Assistant
                                                </div>
                                                {currentItem.ai_assistant.is_hot_deal && (
                                                    <span style={{ background: '#fef08a', color: '#a16207', fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', marginLeft: 'auto' }}>
                                                        <i className="fas fa-fire"></i> HOT DEAL
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>SUMMARY</div>
                                                    <div style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.summary}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>SELLER INTENT</div>
                                                    <div style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.seller_intent}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>RECOMMENDED ACTION</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 700 }}>{currentItem.ai_assistant.next_action}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>URGENCY</div>
                                                    <div style={{ fontSize: '0.85rem', color: currentItem.ai_assistant.urgency === 'High' ? '#dc2626' : currentItem.ai_assistant.urgency === 'Medium' ? '#d97706' : isDark ? 'var(--text-main)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.urgency}</div>
                                                </div>
                                            </div>

                                            {currentItem.ai_assistant.whatsapp_response && (
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#166534', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                                        <span><i className="fab fa-whatsapp"></i> SUGGESTED WHATSAPP RESPONSE</span>
                                                        <span onClick={() => { navigator.clipboard.writeText(currentItem.ai_assistant.whatsapp_response); toast.success('Copied!'); }} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Copy</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#14532d', fontStyle: 'italic' }}>"{currentItem.ai_assistant.whatsapp_response}"</div>
                                                </div>
                                            )}

                                            {currentItem.ai_assistant.verification_actions && currentItem.ai_assistant.verification_actions.length > 0 && (
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>VERIFICATION ACTIONS</div>
                                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: isDark ? 'var(--text-main)' : '#475569' }}>
                                                        {currentItem.ai_assistant.verification_actions.map((action, idx) => (
                                                            <li key={idx}>{action}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── LIVE WHATSAPP BROKER VERIFICATION DESK ─── */}
                                    <div style={{
                                        borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                                        background: isDark ? 'rgba(34, 197, 94, 0.04)' : '#f0fdf4',
                                        padding: '16px'
                                    }}>
                                        {/* Desk Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontSize: '0.95rem'
                                                }}>
                                                    <i className="fab fa-whatsapp"></i>
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isDark ? '#4ade80' : '#15803d' }}>
                                                            Live WhatsApp Broker Verification Desk
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                            background: isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff',
                                                            color: isDark ? '#a5b4fc' : '#4338ca', border: '1px solid rgba(99, 102, 241, 0.3)'
                                                        }}>
                                                            Gemini 2.5 Flash
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                        Verify Location, Plot/Unit #, and Bottom Asking Price with Broker via WhatsApp Web
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Badge & Actions */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {(() => {
                                                    const waStatus = currentItem.wa_verification?.status || 'idle';
                                                    if (waStatus === 'replied_verified') {
                                                        return (
                                                            <span style={{
                                                                fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px',
                                                                background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}>
                                                                <i className="fas fa-check-circle"></i> VERIFIED BY BROKER
                                                            </span>
                                                        );
                                                    }
                                                    if (waStatus === 'inquiry_sent') {
                                                        return (
                                                            <span style={{
                                                                fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px',
                                                                background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}>
                                                                <i className="fas fa-circle-notch fa-spin"></i> AWAITING REPLY
                                                            </span>
                                                        );
                                                    }
                                                    if (waStatus === 'replied_incomplete') {
                                                        return (
                                                            <span style={{
                                                                fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '12px',
                                                                background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa',
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}>
                                                                <i className="fas fa-user-secret"></i> CONFIDENTIAL / PARTIAL
                                                            </span>
                                                        );
                                                    }
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px',
                                                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                                                            color: isDark ? '#cbd5e1' : '#64748b'
                                                        }}>
                                                            IDLE / READY
                                                        </span>
                                                    );
                                                })()}

                                                {currentItem.wa_verification?.status === 'inquiry_sent' && (
                                                    <button
                                                        onClick={handleRefreshWAStatus}
                                                        disabled={waCheckingStatus}
                                                        style={{
                                                            padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700,
                                                            background: isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff',
                                                            border: '1px solid #cbd5e1', borderRadius: '6px',
                                                            color: isDark ? '#f8fafc' : '#334155', cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                        title="Check if broker has replied on WhatsApp Web"
                                                    >
                                                        <i className={`fas fa-sync-alt ${waCheckingStatus ? 'fa-spin' : ''}`}></i>
                                                        Check Live
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setWaDeskExpanded(!waDeskExpanded)}
                                                    style={{
                                                        background: 'transparent', border: 'none',
                                                        color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer',
                                                        padding: '4px', fontSize: '0.8rem'
                                                    }}
                                                >
                                                    <i className={`fas fa-chevron-${waDeskExpanded ? 'up' : 'down'}`}></i>
                                                </button>
                                            </div>
                                        </div>

                                        {waDeskExpanded && (
                                            <div>
                                                {/* Case 1: Verified Outcome Card */}
                                                {currentItem.wa_verification?.status === 'replied_verified' && (
                                                    <div style={{
                                                        background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                                                        border: '2px solid #10b981', borderRadius: '8px',
                                                        padding: '14px', marginBottom: '14px'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.85rem', color: '#047857' }}>
                                                                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                                                                BROKER-VERIFIED DEAL PARAMETERS
                                                            </div>
                                                            <button
                                                                onClick={handleApplyVerifiedValues}
                                                                style={{
                                                                    padding: '6px 14px', background: '#059669', color: '#ffffff',
                                                                    border: 'none', borderRadius: '6px', fontSize: '0.78rem',
                                                                    fontWeight: 800, cursor: 'pointer', display: 'flex',
                                                                    alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
                                                                }}
                                                            >
                                                                <i className="fas fa-bolt"></i> Apply Verified Values to Deal
                                                            </button>
                                                        </div>

                                                        {/* Parameters Grid */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                                                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>
                                                                    <i className="fas fa-map-pin" style={{ marginRight: '4px' }}></i> Location / Project
                                                                </div>
                                                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isDark ? '#a7f3d0' : '#064e3b', marginTop: '2px' }}>
                                                                    {currentItem.wa_verification?.extracted_data?.location_confirmed || currentItem.location || 'Confirmed'}
                                                                </div>
                                                            </div>

                                                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>
                                                                    <i className="fas fa-door-open" style={{ marginRight: '4px' }}></i> Verified Unit / Plot #
                                                                </div>
                                                                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                                                                    #{currentItem.wa_verification?.extracted_data?.unit_number || 'N/A'}
                                                                </div>
                                                            </div>

                                                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>
                                                                    <i className="fas fa-tag" style={{ marginRight: '4px' }}></i> Last / Bottom Price
                                                                </div>
                                                                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
                                                                    {currentItem.wa_verification?.extracted_data?.final_price || currentItem.price || 'Confirmed'}
                                                                    {currentItem.wa_verification?.extracted_data?.price_type && (
                                                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, marginLeft: '4px', opacity: 0.8 }}>
                                                                            ({currentItem.wa_verification.extracted_data.price_type})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Inbound Broker Reply Quote */}
                                                        {currentItem.wa_verification?.inbound_reply && (
                                                            <div style={{
                                                                fontSize: '0.78rem', color: isDark ? '#e2e8f0' : '#1e293b',
                                                                background: isDark ? 'rgba(0, 0, 0, 0.2)' : '#ffffff',
                                                                padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #10b981'
                                                            }}>
                                                                <span style={{ fontWeight: 700, color: '#059669', marginRight: '6px' }}>Broker Reply:</span>
                                                                "{currentItem.wa_verification.inbound_reply}"
                                                                {currentItem.wa_verification.replied_at && (
                                                                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: '8px' }}>
                                                                        ({new Date(currentItem.wa_verification.replied_at).toLocaleTimeString('en-IN')})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Case 2: Awaiting Reply Card */}
                                                {currentItem.wa_verification?.status === 'inquiry_sent' && (
                                                    <div style={{
                                                        background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
                                                        border: '1px solid #fcd34d', borderRadius: '8px',
                                                        padding: '12px 14px', marginBottom: '14px', display: 'flex',
                                                        alignItems: 'center', justifyContent: 'space-between'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '10px', height: '10px', borderRadius: '50%',
                                                                background: '#f59e0b', boxShadow: '0 0 8px #f59e0b'
                                                            }}></div>
                                                            <div>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#fbbf24' : '#92400e' }}>
                                                                    Inquiry Sent to Broker: {currentItem.wa_verification.target_phone}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: isDark ? '#cbd5e1' : '#78350f', marginTop: '2px' }}>
                                                                    Outbound inquiry dispatched at {currentItem.wa_verification.initiated_at ? new Date(currentItem.wa_verification.initiated_at).toLocaleTimeString('en-IN') : 'recently'}. Baileys worker is listening for reply.
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={handleRefreshWAStatus}
                                                            disabled={waCheckingStatus}
                                                            style={{
                                                                padding: '6px 12px', background: '#d97706', color: '#ffffff',
                                                                border: 'none', borderRadius: '6px', fontSize: '0.75rem',
                                                                fontWeight: 700, cursor: 'pointer', display: 'flex',
                                                                alignItems: 'center', gap: '5px'
                                                            }}
                                                        >
                                                            <i className={`fas fa-sync-alt ${waCheckingStatus ? 'fa-spin' : ''}`}></i>
                                                            Refresh Reply
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Case 3: Incomplete / Confidential Reply Card */}
                                                {currentItem.wa_verification?.status === 'replied_incomplete' && (
                                                    <div style={{
                                                        background: isDark ? 'rgba(249, 115, 22, 0.12)' : '#fff7ed',
                                                        border: '1px solid #fdba74', borderRadius: '8px',
                                                        padding: '12px 14px', marginBottom: '14px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.82rem', color: '#c2410c', marginBottom: '6px' }}>
                                                            <i className="fas fa-exclamation-triangle"></i> Broker Kept Unit Number Confidential
                                                        </div>
                                                        <div style={{ fontSize: '0.78rem', color: isDark ? '#fed7aa' : '#7c2d12', fontStyle: 'italic', marginBottom: '8px' }}>
                                                            "{currentItem.wa_verification.inbound_reply}"
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: isDark ? '#cbd5e1' : '#9a3412' }}>
                                                            Suggested Action: Direct phone call required to confirm unit number before locking client presentation.
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Inquiry Drafting & Dispatch Control */}
                                                <div style={{
                                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                                    borderRadius: '8px', padding: '14px'
                                                }}>
                                                    {/* Target Phone Selector */}
                                                    <div style={{ marginBottom: '10px' }}>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                            1. Target Broker WhatsApp Number:
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                                            {/* Options from detection */}
                                                            {(() => {
                                                                // Text contacts
                                                                const textContacts = (currentItem.contact_numbers && currentItem.contact_numbers.length > 0)
                                                                    ? currentItem.contact_numbers
                                                                    : (currentItem.extracted_entities?.contact_numbers || []);
                                                                // Group sender
                                                                const senderParticipant = currentItem.extracted_entities?._whatsappGroup?.participant ||
                                                                    currentItem.raw_source_data?.participant;

                                                                return (
                                                                    <>
                                                                        {textContacts.map((phone, idx) => (
                                                                            <button
                                                                                key={`tc-${idx}`}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setWaTargetPhone(phone);
                                                                                    setWaTargetType('text_contact');
                                                                                }}
                                                                                style={{
                                                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                                                                                    border: waTargetPhone === phone ? '2px solid #22c55e' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                                                                                    background: waTargetPhone === phone ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7') : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc'),
                                                                                    color: waTargetPhone === phone ? '#15803d' : (isDark ? '#cbd5e1' : '#334155'),
                                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                                                }}
                                                                            >
                                                                                <i className="fas fa-file-alt" style={{ fontSize: '0.65rem' }}></i>
                                                                                <span>Text Contact (P1): {phone}</span>
                                                                            </button>
                                                                        ))}

                                                                        {senderParticipant && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setWaTargetPhone(senderParticipant);
                                                                                    setWaTargetType('sender');
                                                                                }}
                                                                                style={{
                                                                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 700,
                                                                                    border: waTargetPhone === senderParticipant ? '2px solid #22c55e' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                                                                                    background: waTargetPhone === senderParticipant ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7') : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc'),
                                                                                    color: waTargetPhone === senderParticipant ? '#15803d' : (isDark ? '#cbd5e1' : '#334155'),
                                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                                                                }}
                                                                            >
                                                                                <i className="fas fa-users" style={{ fontSize: '0.65rem' }}></i>
                                                                                <span>Group Sender (P2): {senderParticipant.replace(/@s\.whatsapp\.net/g, '')}</span>
                                                                            </button>
                                                                        )}

                                                                        {/* Custom phone input */}
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '170px', flex: 1 }}>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Or enter +91..."
                                                                                value={waTargetPhone}
                                                                                onChange={(e) => {
                                                                                    setWaTargetPhone(e.target.value);
                                                                                    setWaTargetType('custom');
                                                                                }}
                                                                                style={{
                                                                                    width: '100%', padding: '5px 8px', fontSize: '0.75rem',
                                                                                    borderRadius: '6px',
                                                                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                                                                                    background: isDark ? '#1e293b' : '#ffffff',
                                                                                    color: isDark ? '#f8fafc' : '#0f172a'
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Inquiry Message Generator & Editor */}
                                                    <div style={{ marginBottom: '10px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>
                                                                2. Hinglish Inquiry Draft:
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFetchWAPreview(currentItem._id)}
                                                                disabled={waLoadingPreview}
                                                                style={{
                                                                    background: isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff',
                                                                    color: isDark ? '#a5b4fc' : '#4338ca',
                                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                                    borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem',
                                                                    fontWeight: 700, cursor: 'pointer', display: 'flex',
                                                                    alignItems: 'center', gap: '4px'
                                                                }}
                                                            >
                                                                <i className={`fas fa-magic ${waLoadingPreview ? 'fa-spin' : ''}`}></i>
                                                                {waCustomMessage ? 'Regenerate Draft with Gemini' : 'Draft with Gemini 2.5 Flash'}
                                                            </button>
                                                        </div>

                                                        <textarea
                                                            rows={3}
                                                            value={waCustomMessage}
                                                            onChange={(e) => setWaCustomMessage(e.target.value)}
                                                            placeholder="Click 'Draft with Gemini 2.5 Flash' to generate natural Hinglish inquiry asking for Plot/Unit #, location confirmation, and last closing price..."
                                                            style={{
                                                                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                                                                fontSize: '0.8rem', lineHeight: 1.4, borderRadius: '6px',
                                                                border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                                                                background: isDark ? '#1e293b' : '#ffffff',
                                                                color: isDark ? '#f8fafc' : '#0f172a',
                                                                resize: 'vertical'
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Send Action */}
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={handleSendWAVerification}
                                                            disabled={waSendingInquiry || !waTargetPhone || !waCustomMessage.trim()}
                                                            style={{
                                                                padding: '8px 16px', borderRadius: '6px',
                                                                background: (!waTargetPhone || !waCustomMessage.trim()) ? '#94a3b8' : 'linear-gradient(135deg, #16a34a, #15803d)',
                                                                color: '#ffffff', border: 'none', fontSize: '0.82rem',
                                                                fontWeight: 800, cursor: (!waTargetPhone || !waCustomMessage.trim()) ? 'not-allowed' : 'pointer',
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)'
                                                            }}
                                                        >
                                                            <i className={`fab fa-whatsapp ${waSendingInquiry ? 'fa-spin' : ''}`}></i>
                                                            {waSendingInquiry ? 'Dispatching via Baileys...' : 'Send WhatsApp Inquiry via Baileys'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Conversation History Accordion */}
                                                {currentItem.wa_verification?.conversation_history && currentItem.wa_verification.conversation_history.length > 0 && (
                                                    <div style={{ marginTop: '12px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setWaHistoryOpen(!waHistoryOpen)}
                                                            style={{
                                                                background: 'transparent', border: 'none',
                                                                color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.72rem',
                                                                fontWeight: 700, cursor: 'pointer', padding: 0,
                                                                display: 'flex', alignItems: 'center', gap: '6px'
                                                            }}
                                                        >
                                                            <i className={`fas fa-chevron-${waHistoryOpen ? 'down' : 'right'}`}></i>
                                                            Verification Conversation History ({currentItem.wa_verification.conversation_history.length} messages)
                                                        </button>

                                                        {waHistoryOpen && (
                                                            <div style={{
                                                                marginTop: '8px', padding: '10px', borderRadius: '6px',
                                                                background: isDark ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                                                                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
                                                                maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px'
                                                            }}>
                                                                {currentItem.wa_verification.conversation_history.map((msg, i) => (
                                                                    <div
                                                                        key={i}
                                                                        style={{
                                                                            alignSelf: msg.sender === 'system' ? 'flex-end' : 'flex-start',
                                                                            maxWidth: '85%', padding: '6px 10px', borderRadius: '8px',
                                                                            fontSize: '0.75rem', lineHeight: 1.35,
                                                                            background: msg.sender === 'system' ? (isDark ? '#166534' : '#dcfce7') : (isDark ? '#334155' : '#ffffff'),
                                                                            color: msg.sender === 'system' ? (isDark ? '#f0fdf4' : '#14532d') : (isDark ? '#f8fafc' : '#1e293b'),
                                                                            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #cbd5e1'
                                                                        }}
                                                                    >
                                                                        <div style={{ fontSize: '0.62rem', fontWeight: 800, opacity: 0.8, marginBottom: '2px' }}>
                                                                            {msg.sender === 'system' ? 'Bharat Properties Desk' : 'Broker'} • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-IN') : ''}
                                                                        </div>
                                                                        {msg.message}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            )}

                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                {/* Header: Raw Text */}
                                <div style={{ padding: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: isDark ? 'var(--text-main)' : '#475569', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <i className="fas fa-quote-left" style={{ color: '#cbd5e1', marginTop: '2px' }}></i>
                                    <div style={{ lineHeight: '1.6' }}>
                                        {(() => {
                                            try {
                                                let text = extractedReq?.rawParsed?.raw || currentItem?.content || "";
                                                if (!text) return null;

                                                // PERFORMANCE: Truncate very large texts for the highlighter
                                                const MAX_HIGHLIGHT_CHARS = 3000;
                                                const isTruncated = text.length > MAX_HIGHLIGHT_CHARS;
                                                const displayText = isTruncated ? text.substring(0, MAX_HIGHLIGHT_CHARS) + "..." : text;

                                                // Enhanced Regex for Highlight
                                                const phoneRegex = /([6-9][0-9\s-]{8,12}[0-9])/g;
                                                const parts = displayText.split(phoneRegex);
                                                
                                                // PERFORMANCE: Cap the number of highlighted parts to avoid DOM explosion
                                                const renderedParts = parts.slice(0, 500); 
                                                const result = renderedParts.map((part, i) => {
                                                    if (part && part.match(phoneRegex)) {
                                                        return <span key={`phone-${i}`} style={{ background: '#fef08a', color: '#854d0e', padding: '0 4px', borderRadius: '4px', fontWeight: 700 }}>{part}</span>
                                                    }
                                                    return part;
                                                });

                                                if (isTruncated || parts.length > 500) {
                                                    result.push(<span key="more" style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}> [Text truncated for performance]</span>);
                                                }
                                                return result;
                                            } catch (e) {
                                                console.error("Render Error in ID Card:", e);
                                                return <span>Error rendering text</span>;
                                            }
                                        })()}
                                    </div>
                                </div>

                                {/* Body: Parsed Fields Grid */}
                                {extractedReq.rawParsed && (
                                    <>
                                        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#ecfdf5' }}>
                                            {[
                                                { label: 'City', value: extractedReq.rawParsed.address.city, icon: 'fa-city' },
                                                { label: 'Location', value: extractedReq.rawParsed.address.sector, icon: 'fa-map-marker-alt' },
                                                { label: 'Unit', value: extractedReq.rawParsed.address.unitNumber, icon: 'fa-door-open' },
                                                { label: 'Category', value: extractedReq.rawParsed.category, icon: 'fa-building' },
                                                { label: 'Type', value: extractedReq.rawParsed.type, icon: 'fa-home' },
                                                { label: 'Size', value: extractedReq.rawParsed.specs.size, icon: 'fa-ruler-combined' },
                                                { label: 'Price', value: extractedReq.rawParsed.specs.price, icon: 'fa-tag' },
                                                { label: 'Intent', value: extractedReq.rawParsed.intent, icon: 'fa-exchange-alt' },
                                            ].map((field, i) => (
                                                <div key={i} style={{ opacity: field.value ? 1 : 0.4 }}>
                                                    <div style={{ fontSize: '0.7rem', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <i className={`fas ${field.icon}`} style={{ fontSize: '0.6rem' }}></i> {field.label.toUpperCase()}
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a' }}>
                                                        {renderValue(field.value) || '-'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Remarks Section */}
                                        {extractedReq.remarks && (
                                            <div style={{ padding: '12px 16px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fffbeb', borderTop: '1px solid #fef3c7' }}>
                                                <div style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 700, marginBottom: '4px' }}>
                                                    <i className="fas fa-sticky-note"></i> REMARKS / OTHER DETAILS
                                                </div>
                                                <div style={{ fontSize: '0.9rem', color: '#451a03', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                    {extractedReq.remarks}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Pro Actions Bar */}
                            <div style={{ padding: '10px 40px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => {
                                        // Use Detected Contacts from Parser instead of raw regex
                                        const phone = detectedContacts[0]?.mobile;
                                        if (phone) window.open(`https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`, '_blank');
                                        else toast.error('No phone number found');
                                    }}
                                    style={{ padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <i className="fab fa-whatsapp"></i> Reply on WA
                                </button>
                                <button
                                    onClick={() => {
                                        if (currentItem?.content) {
                                            navigator.clipboard.writeText(currentItem.content);
                                            toast.success("Text Copied!");
                                        }
                                    }}
                                    style={{ padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? 'var(--text-main)' : '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="far fa-copy"></i> Copy Text
                                </button>
                                <button
                                    onClick={() => {
                                        if (window.confirm("Mark as Spam and Remove?")) {
                                            setIntakeItems(prev => prev.filter(i => (i._id || i.id) !== (currentItem._id || currentItem.id)));
                                            setCurrentItem(null);
                                            setStage(0);
                                            toast.success("Marked as Spam");
                                        }
                                    }}
                                    style={{ padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
                                    <i className="far fa-trash-alt"></i> Spam
                                </button>
                            </div>
                        </div>

                        {/* WORKFLOW CONTENT */}
                        <div style={{ padding: '32px 36px', background: isDark ? 'transparent' : '#f8fafc' }}>

                            {/* ================= SELLER FLOW ================= */}
                            {intakeType === 'SELLER' && (
                                <>
                                    {useQuickDeal ? (
                                        /* Simplified Single-Screen Quick Deal */
                                        <QuickDealForm
                                            currentItem={currentItem}
                                            detectedContacts={detectedContacts}
                                            matchedInventory={matchedInventory}
                                            intakeType={intakeType}
                                            extractedReq={extractedReq}
                                            onCreateDeal={handleQuickDealCreate}
                                            onSkip={handleQuickDealSkip}
                                            onBack={handleQuickDealBack}
                                            onOpenAddContact={handleOpenAddContact}
                                            onTriggerModal={handleTriggerModal}
                                            startCall={startCall}
                                            startWhatsAppCall={startWhatsAppCall}
                                        />
                                    ) : (
                                        /* Traditional Multi-Stage Workflow */
                                        <>
                                            {stage === 1 && (
                                                <div className="animate-fade-in">
                                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b', marginBottom: '16px' }}>1. Confirm Property Owner</h3>
                                                    {detectedContacts.length === 0 ? (
                                                        <div style={{ padding: '20px', background: '#fff1f2', color: '#be123c', borderRadius: '8px', border: '1px solid #fb7185', textAlign: 'center' }}>
                                                            No phone numbers detected. <button onClick={() => handleOpenAddContact()} style={{ border: 'none', background: 'none', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', color: '#be123c' }}>Add Manually</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                                            {detectedContacts.map((contact, idx) => (
                                                                <div key={idx} style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', position: 'relative' }}>

                                                                    {/* Call Context Action */}
                                                                    <button
                                                                        onClick={() => startCall(contact, {
                                                                            purpose: 'Owner Verification',
                                                                            entityId: currentItem.id,
                                                                            entityType: 'deal_intake'
                                                                        }, (log) => {
                                                                            if (log.outcome === 'Confirmed') setOwnerCallOutcome('Confirmed');
                                                                        })}
                                                                        style={{
                                                                            position: 'absolute', top: '10px', right: '10px',
                                                                            width: '32px', height: '32px', borderRadius: '50%',
                                                                            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', color: '#3b82f6', border: 'none',
                                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                        }}
                                                                        title="Verify via Call"
                                                                    >
                                                                        <i className="fas fa-phone-alt"></i>
                                                                    </button>

                                                                    <div style={{ fontWeight: 700 }}>{contact.name}</div>
                                                                    <div style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        {contact.mobile}
                                                                        {contact.isNew && (
                                                                            <button
                                                                                onClick={() => handleOpenAddContact(contact.mobile)}
                                                                                style={{ fontSize: '0.7rem', padding: '2px 6px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer' }}
                                                                            >
                                                                                + Add to CRM
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Role Selection */}
                                                                    <div style={{ marginBottom: '12px', padding: '10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>

                                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '6px' }}>Align Contact As:</label>
                                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                                <input type="radio" name={`role-${idx}`} checked={contact.selectedRole !== 'Associate'} onChange={() => {
                                                                                    const newContacts = [...detectedContacts];
                                                                                    newContacts[idx].selectedRole = 'Owner';
                                                                                    setDetectedContacts(newContacts);
                                                                                }} />
                                                                                Owner
                                                                            </label>
                                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                                <input type="radio" name={`role-${idx}`} checked={contact.selectedRole === 'Associate'} onChange={() => {
                                                                                    const newContacts = [...detectedContacts];
                                                                                    newContacts[idx].selectedRole = 'Associate';
                                                                                    setDetectedContacts(newContacts);
                                                                                }} />
                                                                                Associate / Broker
                                                                            </label>
                                                                        </div>

                                                                        {/* Relation Input if Associate */}
                                                                        {contact.selectedRole === 'Associate' && (
                                                                            <div style={{ marginTop: '8px', animation: 'fadeIn 0.2s' }}>
                                                                                <select
                                                                                    value={contact.relation || ''}
                                                                                    onChange={(e) => {
                                                                                        const newContacts = [...detectedContacts];
                                                                                        newContacts[idx].relation = e.target.value;
                                                                                        setDetectedContacts(newContacts);
                                                                                    }}
                                                                                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                                                >
                                                                                    <option value="">Select Relation...</option>
                                                                                    <option value="Broker">Broker / Agent</option>
                                                                                    <option value="Caretaker">Caretaker</option>
                                                                                    <option value="Family Member">Family Member</option>
                                                                                    <option value="POA Holder">POA Holder</option>
                                                                                    <option value="Invested Partner">Invested Partner</option>
                                                                                </select>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <button
                                                                        onClick={() => handleConfirmOwner(contact)}
                                                                        className="btn-primary"
                                                                        style={{ width: '100%', borderRadius: '6px', fontSize: '0.85rem', padding: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                                                                    >
                                                                        <span>Confirm as {contact.selectedRole === 'Associate' ? 'Associate' : 'Owner'}</span>
                                                                        <i className="fas fa-arrow-right"></i>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {(stage === 2 || stage === 3 || stage === 4) && (
                                                // Reuse existing Inventory Match UI...
                                                // Simplified for brevity in this rewrite, assuming logic carried over or I can paste it fully.
                                                // I will assume I need to fully render it.
                                                <div className="animate-fade-in">
                                                    {/* ... Inventory Match UI ... */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>2. Match Inventory</h3>
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.85rem' }}>Owner: <strong>{selectedOwner?.name}</strong></span>
                                                            {!isManualLinkOpen && <button onClick={() => setIsManualLinkOpen(true)} style={{ fontSize: '0.75rem', padding: '4px 8px', border: '1px solid #3b82f6', color: '#3b82f6', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: '4px', cursor: 'pointer' }}>+ Link Manually</button>}
                                                        </div>
                                                    </div>

                                                    {/* Manual Link Interface */}
                                                    {isManualLinkOpen && (
                                                        <div className="animate-fade-in" style={{ marginBottom: '16px', padding: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Search Unit # or Location..."
                                                                    value={manualSearchQuery}
                                                                    onChange={(e) => {
                                                                        setManualSearchQuery(e.target.value);
                                                                        // Simple Live Search
                                                                        if (e.target.value.length > 1) {
                                                                            const q = e.target.value.toLowerCase();
                                                                            const hits = inventoryData.filter(inv =>
                                                                                inv.unitNo.toLowerCase().includes(q) ||
                                                                                inv.location.toLowerCase().includes(q)
                                                                            ).slice(0, 3);
                                                                            setManualSearchResults(hits);
                                                                        } else {
                                                                            setManualSearchResults([]);
                                                                        }
                                                                    }}
                                                                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                                                />
                                                                <button onClick={() => setIsManualLinkOpen(false)} style={{ background: 'none', border: 'none', color: isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
                                                            </div>

                                                            {manualSearchResults.length > 0 ? (
                                                                <div>
                                                                    {manualSearchResults.map(res => (
                                                                        <div key={res.id} onClick={() => { setSelectedInventory(res); setStage(3); setIsManualLinkOpen(false); }}
                                                                            style={{ padding: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <span style={{ fontWeight: 700 }}>Unit {typeof res.unitNo === 'object' ? (res.unitNo.lookup_value || res.unitNo.name) : res.unitNo}</span>
                                                                            <span style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>{typeof res.location === 'object' ? (res.location.lookup_value || res.location.name) : res.location}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                                                    {manualSearchQuery.length > 1 && <div style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '8px', fontWeight: 600 }}>No match found. Create New?</div>}

                                                                    <div style={{ marginTop: '12px' }}>
                                                                        <QuickInventoryForm
                                                                            formData={quickAddForm}
                                                                            setFormData={setQuickAddForm}
                                                                            onTriggerModal={handleTriggerModal}
                                                                        />

                                                                        <button onClick={handleQuickAddInventory} style={{ width: '100%', background: '#3b82f6', color: '#fff', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', marginTop: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                            <i className="fas fa-magic"></i> Create & Ensure Match
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', gap: '20px' }}>
                                                        <div style={{ flex: 1 }}>
                                                            {matchedInventory.map((match, idx) => (
                                                                <div key={idx} onClick={() => { setSelectedInventory(match.inventory); setStage(3); }}
                                                                    style={{
                                                                        background: selectedInventory?.id === match.inventory.id ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                                                        border: selectedInventory?.id === match.inventory.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                                                        borderRadius: '8px', padding: '12px', marginBottom: '8px', cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Unit {renderValue(match.inventory.unitNo)}</div>
                                                                    <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>{renderValue(match.inventory.location)} - Score: {match.score}</div>
                                                                </div>
                                                            ))}
                                                            {matchedInventory.length === 0 && !isManualLinkOpen && (
                                                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderRadius: '8px', border: '2px dashed #e2e8f0' }}>
                                                                    No matches found. <button onClick={() => setIsManualLinkOpen(true)} style={{ color: '#3b82f6', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Link Manually</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {selectedInventory && stage >= 3 && (
                                                            <div className="animate-fade-in" style={{ width: '400px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                <h4 style={{ margin: 0, fontSize: '1rem' }}>Create Deal</h4>

                                                                {/* Auto-Linked Info */}
                                                                <div style={{ padding: '10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', borderRadius: '6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{renderValue(selectedInventory.unitNo)}</div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#14532d' }}>{renderValue(selectedInventory.location)}</div>
                                                                        <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Linked to: {selectedOwner?.name}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Form Fields matching AddDealModal */}
                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '4px' }}>Intent</label>
                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                        {['Sell', 'Rent', 'Lease'].map(type => (
                                                                            <button key={type} onClick={() => setDealForm({ ...dealForm, intent: type })}
                                                                                style={{ flex: 1, padding: '6px', borderRadius: '4px', fontSize: '0.8rem', border: `1px solid ${dealForm.intent === type ? '#2563eb' : '#cbd5e1'}`, background: dealForm.intent === type ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: dealForm.intent === type ? '#2563eb' : isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer' }}>
                                                                                {type}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                                    <div>
                                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '4px' }}>Expected Price</label>
                                                                        <input type="text" placeholder="e.g. 1.5 Cr" value={dealForm.price} onChange={e => setDealForm({ ...dealForm, price: e.target.value })}
                                                                            style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '4px' }}>Status</label>
                                                                        <select value={dealForm.status} onChange={e => setDealForm({ ...dealForm, status: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }}>
                                                                            <option value="Open">Open</option>
                                                                            <option value="Quote">Quote</option>
                                                                            <option value="Negotiation">Negotiation</option>
                                                                        </select>
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? 'var(--text-muted)' : '#64748b', marginBottom: '4px' }}>Remarks / Notes</label>
                                                                    <textarea placeholder="Any additional details..." value={dealForm.remarks} onChange={e => setDealForm({ ...dealForm, remarks: e.target.value })}
                                                                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', minHeight: '60px', resize: 'vertical' }} />
                                                                </div>

                                                                <div style={{ paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                                                                    {ownerCallOutcome !== 'Confirmed' ? (
                                                                        <div style={{ marginBottom: '10px', padding: '10px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', color: '#be123c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <i className="fas fa-exclamation-triangle"></i>
                                                                            <span><b>Action Required:</b> Verify Owner via Call first.</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ marginBottom: '10px', padding: '8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4', borderRadius: '6px', color: '#166534', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <i className="fas fa-check-circle"></i> Owner Verified
                                                                        </div>
                                                                    )}

                                                                    <button
                                                                        onClick={handleCreateDeal}
                                                                        disabled={ownerCallOutcome !== 'Confirmed'}
                                                                        style={{
                                                                            width: '100%',
                                                                            background: ownerCallOutcome === 'Confirmed' ? '#2563eb' : '#94a3b8',
                                                                            color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 600,
                                                                            cursor: ownerCallOutcome === 'Confirmed' ? 'pointer' : 'not-allowed',
                                                                            boxShadow: ownerCallOutcome === 'Confirmed' ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
                                                                            opacity: ownerCallOutcome === 'Confirmed' ? 1 : 0.7
                                                                        }}
                                                                    >
                                                                        <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i> Create Deal
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {stage === 4 && (
                                                        <div style={{ marginTop: '20px', padding: '20px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7', borderRadius: '8px', textAlign: 'center' }}>
                                                            <h3>Deal Created!</h3>
                                                            <p>Found {matchedBuyers.length} Potential Buyers</p>
                                                            {matchedBuyers.map((b, i) => <div key={i}>{renderValue(b.name)}</div>)}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}

                            {/* ================= BUYER FLOW ================= */}
                            {intakeType === 'BUYER' && (
                                <>
                                    {stage === 1 && (
                                        <div className="animate-fade-in">
                                            {/* Step 1: Classification & Extraction */}
                                            <div style={{ display: 'flex', gap: '20px' }}>
                                                {/* Left: Contact Info */}
                                                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '15px' }}>1. Lead Classification</h3>

                                                    {detectedContacts.length > 0 ? (
                                                        <div style={{ padding: '15px', background: buyerContact?.isBroker ? '#FEF2F2' : (buyerContact?.isNew ? '#F0F9FF' : '#F0FDF4'), border: '1px solid', borderColor: buyerContact?.isBroker ? '#FECACA' : (buyerContact?.isNew ? '#BAE6FD' : '#BBF7D0'), borderRadius: '8px', marginBottom: '15px' }}>
                                                            {/* Header Row */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#0f172a' }}>
                                                                        {buyerContact?.name || "Unknown"}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-muted)' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <i className="fas fa-phone-alt" style={{ fontSize: '0.75rem' }}></i> {buyerContact?.mobile}
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    {buyerContact?.isNew ? (
                                                                        <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase' }}>NEW</span>
                                                                    ) : (
                                                                        <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase' }}>EXISTING</span>
                                                                    )}
                                                                    {buyerContact?.isBroker && <span style={{ background: '#dc2626', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase' }}>BROKER</span>}
                                                                </div>
                                                            </div>

                                                            {/* Usage Stats Grid */}
                                                            {!buyerContact?.isNew && buyerContact?.stats && (
                                                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                                                    {buyerContact.stats.deals > 0 && (
                                                                        <span title="Deals" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-handshake" style={{ color: '#3b82f6', marginRight: '4px' }}></i> {buyerContact.stats.deals} Deals</span>
                                                                    )}
                                                                    {buyerContact.stats.inventory > 0 && (
                                                                        <span title="Inventory" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-building" style={{ color: '#8b5cf6', marginRight: '4px' }}></i> {buyerContact.stats.inventory} Unit</span>
                                                                    )}
                                                                    {buyerContact.stats.leads > 0 && (
                                                                        <span title="Leads" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-filter" style={{ color: '#f59e0b', marginRight: '4px' }}></i> {buyerContact.stats.leads} Leads</span>
                                                                    )}
                                                                    {buyerContact.stats.activities > 0 && (
                                                                        <span title="Activities" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-main)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-clock" style={{ color: isDark ? 'var(--text-muted)' : '#64748b', marginRight: '4px' }}></i> {buyerContact.stats.activities} Actv.</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Create/Link Actions */}
                                                            {buyerContact?.isNew && (
                                                                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#0369a1', fontStyle: 'italic' }}>
                                                                    <i className="fas fa-info-circle"></i> This contact will be created automatically.
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontStyle: 'italic', marginBottom: '15px' }}>No contact detected. Treated as Walk-in/Unknown.</div>
                                                    )}

                                                    <div style={{ marginBottom: '10px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isTemporaryLead}
                                                                onChange={(e) => setIsTemporaryLead(e.target.checked)}
                                                            />
                                                            <span style={{ fontWeight: 600, color: isDark ? 'var(--text-main)' : '#334155' }}>Mark as Temporary Lead (15-Day Expiry)</span>
                                                        </label>
                                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '24px', marginTop: '2px' }}>
                                                            {isTemporaryLead ? 'This lead will expire automatically in 15 days.' : 'This lead will follow the standard long-term lifecycle.'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right: Requirements */}
                                                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '15px' }}>2. Requirement Parsing</h3>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Type</label>
                                                            <input type="text" value={extractedReq.type} onChange={e => setExtractedReq({ ...extractedReq, type: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Location</label>
                                                            <input type="text" value={extractedReq.location} onChange={e => setExtractedReq({ ...extractedReq, location: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>Max Budget</label>
                                                            <input type="text" value={extractedReq.budget} onChange={e => setExtractedReq({ ...extractedReq, budget: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                                                <button onClick={handleCreateLead} className="btn-primary" style={{ padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>Create {isTemporaryLead ? 'Temp' : 'Permanent'} Lead</span>
                                                    <i className="fas fa-arrow-right"></i>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {stage >= 2 && (
                                        <div className="animate-fade-in" style={{ marginTop: '20px' }}>
                                            <div style={{ padding: '20px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div>
                                                    <h3 style={{ margin: 0, color: '#166534' }}><i className="fas fa-check-circle"></i> Lead Created Successfully!</h3>
                                                    <p style={{ margin: '4px 0 0 0', color: '#15803d', fontSize: '0.9rem' }}>
                                                        {isTemporaryLead ? 'Expiry set to 15 days from now.' : 'Added to main Leads database.'}
                                                    </p>
                                                </div>
                                                <button className="btn-outline" onClick={() => setStage(1)} style={{ fontSize: '0.8rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff' }}>Edit</button>
                                            </div>

                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b', marginBottom: '16px' }}>
                                                3. Matching Active Deals ({matchedDeals.length})
                                            </h3>

                                            {matchedDeals.length === 0 ? (
                                                <div style={{ padding: '30px', textAlign: 'center', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: '8px', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                                    No active deals match these requirements currently.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '16px' }}>
                                                    {matchedDeals.map((match, idx) => (
                                                        <div key={idx} style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: isDark ? 'var(--text-main)' : '#0f172a' }}>{match.deal.title}</div>
                                                                    <div style={{ padding: '2px 8px', background: '#e2e8f0', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{typeof match.deal.status === 'object' ? (match.deal.status.lookup_value || match.deal.status.name) : match.deal.status}</div>
                                                                    <div style={{ padding: '2px 8px', background: '#FEF3C7', color: '#B45309', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{match.deal.price}</div>
                                                                </div>
                                                                <div style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.9rem' }}>{typeof match.deal.location === 'object' ? (match.deal.location.lookup_value || match.deal.location.name) : match.deal.location} | {typeof match.deal.type === 'object' ? (match.deal.type.lookup_value || match.deal.type.name) : match.deal.type}</div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#16a34a' }}>{match.score}% MATCH</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Relevance</div>
                                                                </div>
                                                                <button style={{ padding: '10px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <i className="fab fa-whatsapp"></i> Share Deal
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div style={{ marginTop: '30px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => {
                                                        setIntakeItems(prev => prev.filter(i => (i._id || i.id) !== (currentItem._id || currentItem.id)));
                                                        setStage(0);
                                                        setCurrentItem(null);
                                                        toast.success("Buyer Intake Completed");
                                                    }}
                                                    style={{ padding: '12px 30px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569', cursor: 'pointer' }}
                                                >
                                                    Fast Close
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                        </div>
                    </div>
                </>
            )}
        </div>

            {/* Add Intake Modal */}
            {
                isAddModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                        <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', width: '500px', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <h3 style={{ marginTop: 0, marginBottom: '4px', fontSize: '1.2rem', fontWeight: 800 }}>Add New Intake</h3>
                                <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 500 }}>
                                    <i className="fas fa-clock" style={{ marginRight: '6px' }}></i>
                                    {new Date().toLocaleString('en-IN', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                        timeZone: 'Asia/Kolkata'
                                    })}
                                </div>
                            </div>

                            {/* Campaign Details Fields */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '8px' }}>Campaign Source</label>
                                <select
                                    value={campaignSource}
                                    onChange={e => setCampaignSource(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff' }}
                                >
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Tribune">Tribune / Newspaper</option>
                                    <option value="Facebook">Facebook</option>
                                    <option value="Instagram">Instagram</option>
                                    <option value="Website">Website</option>
                                    <option value="Walk-in">Walk-in</option>
                                    <option value="Referral">Referral</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>



                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#475569', marginBottom: '8px' }}>Content Input</label>

                                {/* Paste/Import Toggle */}
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                    <button
                                        onClick={() => setContentInputMode('paste')}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: contentInputMode === 'paste' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                            background: contentInputMode === 'paste' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                            fontWeight: 600,
                                            color: contentInputMode === 'paste' ? '#1e40af' : isDark ? 'var(--text-muted)' : '#64748b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-paste"></i> Paste Text
                                    </button>
                                    <button
                                        onClick={() => setContentInputMode('import')}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: contentInputMode === 'import' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                                            background: contentInputMode === 'import' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                            fontWeight: 600,
                                            color: contentInputMode === 'import' ? '#15803d' : isDark ? 'var(--text-muted)' : '#64748b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-file-import"></i> File
                                    </button>
                                    <button
                                        onClick={() => setContentInputMode('url')}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: contentInputMode === 'url' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                                            background: contentInputMode === 'url' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#f5f3ff' : isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                                            fontWeight: 600,
                                            color: contentInputMode === 'url' ? '#6d28d9' : isDark ? 'var(--text-muted)' : '#64748b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-link"></i> Public URL
                                    </button>
                                </div>

                                {contentInputMode === 'paste' ? (
                                    <>
                                        <textarea
                                            value={newSourceContent}
                                            onChange={e => setNewSourceContent(e.target.value)}
                                            rows={6}
                                            placeholder="Paste the message or extracted text here..."
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', resize: 'vertical' }}
                                        ></textarea>
                                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                            <strong>Tip:</strong> Use keywords like "Need", "Buy" for Buyer Detection.
                                        </div>
                                    </>
                                ) : contentInputMode === 'url' ? (
                                    <div style={{ padding: '20px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f5f3ff', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#4c1d95', marginBottom: '8px' }}>
                                            <i className="fas fa-globe" style={{ marginRight: '6px' }}></i>
                                            Public Webpage URL
                                        </label>
                                        <input
                                            type="url"
                                            value={newSourceContent}
                                            onChange={e => setNewSourceContent(e.target.value)}
                                            placeholder="https://www.example.com/property-listing"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #c4b5fd', fontSize: '0.9rem' }}
                                        />
                                        <p style={{ fontSize: '0.75rem', color: '#6d28d9', marginTop: '10px', lineHeight: '1.4' }}>
                                            The system will fetch the HTML, clean it, and run AI extraction to build the intake record automatically.
                                        </p>
                                        <div style={{ marginTop: '12px', padding: '10px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRadius: '8px', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input 
                                                type="checkbox" 
                                                id="autoMonitor" 
                                                checked={isAutomated} 
                                                onChange={e => setIsAutomated(e.target.checked)} 
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                            <label htmlFor="autoMonitor" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4c1d95', cursor: 'pointer' }}>
                                                <i className="fas fa-redo-alt" style={{ marginRight: '6px' }}></i>
                                                Auto-Monitor Daily (Daily New Deals)
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '30px', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: selectedFile?.name.endsWith('.zip') ? 1 : 0.5 }}>
                                                <i className="fas fa-file-archive" style={{ fontSize: '1.8rem', color: '#f59e0b' }}></i>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#92400e' }}>WHATSAPP ZIP</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: selectedFile?.name.endsWith('.pdf') ? 1 : 0.5 }}>
                                                <i className="fas fa-file-pdf" style={{ fontSize: '1.8rem', color: '#ef4444' }}></i>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#991b1b' }}>TRIBUNE PDF</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', opacity: selectedFile?.name.match(/\.(jpg|jpeg|png|gif)$/i) ? 1 : 0.5 }}>
                                                <i className="fas fa-file-image" style={{ fontSize: '1.8rem', color: '#10b981' }}></i>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#065f46' }}>ESTATE IMAGE</span>
                                            </div>
                                        </div>

                                        <p style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.85rem', marginBottom: '16px', lineHeight: '1.4' }}>
                                            {selectedFile
                                                ? `Selected: ${selectedFile.name}`
                                                : "Upload WhatsApp export, Tribune PDF, or property photos for automated extraction."}
                                        </p>

                                        {selectedFile && (
                                            <div style={{ marginBottom: '16px' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
                                                    <span style={{ color: '#1e40af', fontWeight: 600, fontSize: '0.8rem' }}>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                                    <button
                                                        onClick={() => setSelectedFile(null)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px', fontSize: '0.9rem' }}
                                                    >
                                                        <i className="fas fa-times-circle"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <label style={{ display: 'inline-block', padding: '10px 24px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)' }}>
                                            {selectedFile ? 'Change File' : 'Browse Files'}
                                            <input
                                                type="file"
                                                accept=".zip,.pdf,image/*"
                                                onChange={handleFileSelect}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button
                                    onClick={() => {
                                        setIsAddModalOpen(false);
                                        setCampaignName('');
                                        setCampaignSource('WhatsApp');
                                        setNewSourceContent('');
                                        setContentInputMode('paste');
                                    }}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? 'var(--text-main)' : '#475569', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={contentInputMode === 'paste' ? handleAddIntake : contentInputMode === 'url' ? handleURLImport : handleFileImport}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <i className={contentInputMode === 'paste' ? 'fas fa-plus' : contentInputMode === 'url' ? 'fas fa-cloud-download-alt' : 'fas fa-file-import'}></i> 
                                    {contentInputMode === 'paste' ? 'Add Intake' : contentInputMode === 'url' ? 'Fetch URL' : 'Import File'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Import Modal */}
            {
                isImportModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                        <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', width: '450px', borderRadius: '16px', padding: '30px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                            <div style={{ width: '60px', height: '60px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.5rem', color: '#3b82f6' }}></i>
                            </div>
                            <h3 style={{ marginTop: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b' }}>Import Data</h3>
                            <p style={{ color: isDark ? 'var(--text-muted)' : '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>
                                Upload <strong>WhatsApp Export (.zip)</strong> or <br /> <strong>Tribune Advertisement (.pdf)</strong>
                            </p>

                            {!selectedFile ? (
                                <label style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '12px', cursor: 'pointer',
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', transition: 'all 0.2s'
                                }}
                                    className="hover:bg-slate-50 hover:border-blue-400"
                                >
                                    <span style={{ fontWeight: 700, color: '#3b82f6', marginBottom: '8px' }}>Click to Browse</span>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Supports .zip and .pdf</span>
                                    <input
                                        type="file"
                                        accept=".zip,.pdf"
                                        style={{ display: 'none' }}
                                        onChange={handleFileSelect}
                                    />
                                </label>
                            ) : (
                                <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                        <i className="fas fa-file-alt" style={{ fontSize: '1.5rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}></i>
                                        <div style={{ textAlign: 'left', flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isDark ? 'var(--text-main)' : '#1e293b' }}>{selectedFile.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>{(selectedFile.size / 1024).toFixed(1)} KB</div>
                                        </div>
                                        <button onClick={() => setSelectedFile(null)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleImportProcess}
                                        disabled={isImporting}
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                                            background: isImporting ? '#94a3b8' : '#3b82f6', color: '#fff', fontWeight: 700, cursor: isImporting ? 'default' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        {isImporting ? (
                                            <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                                        ) : (
                                            <><i className="fas fa-check"></i> Start Import</>
                                        )}
                                    </button>
                                </div>
                            )}

                            <button onClick={() => { setIsImportModalOpen(false); setSelectedFile(null); }} style={{ marginTop: '16px', background: 'transparent', border: 'none', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }
            {/* --- Modals for Quick Add --- */}
            <AddProjectModal
                isOpen={modalTriggers.project}
                onClose={() => setModalTriggers(prev => ({ ...prev, project: false }))}
                onSave={(newProj) => {
                    setQuickAddForm(prev => ({ ...prev, projectName: newProj.name, city: newProj.city || prev.city }));
                }}
            />
            <AddBlockModal
                isOpen={modalTriggers.block}
                projectName={quickAddForm.projectName}
                onClose={() => setModalTriggers(prev => ({ ...prev, block: false }))}
                onSave={(blockName) => {
                    setQuickAddForm(prev => ({ ...prev, block: blockName }));
                }}
            />
            <AddSizeModal
                isOpen={modalTriggers.size}
                projectName={quickAddForm.projectName}
                block={quickAddForm.block}
                category={quickAddForm.type}
                onClose={() => setModalTriggers(prev => ({ ...prev, size: false }))}
                onSave={(sizeName) => {
                    setQuickAddForm(prev => ({ ...prev, size: sizeName }));
                }}
            />
            {/* Add Contact Modal */}
            <AddContactModal
                isOpen={isAddContactModalOpen}
                onClose={() => setIsAddContactModalOpen(false)}
                onAdd={handleContactAdded}
                initialData={prefilledContactData}
                mode="add"
            />

            {/* Monitored Sources Modal */}
            {isMonitorModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', width: '600px', borderRadius: '16px', padding: '30px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                                <i className="fas fa-redo-alt" style={{ color: '#8b5cf6', marginRight: '10px' }}></i>
                                Daily Monitored URLs
                            </h3>
                            <button onClick={() => setIsMonitorModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
                            {monitoredSources.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                    <i className="fas fa-link" style={{ fontSize: '2rem', opacity: 0.2, marginBottom: '10px' }}></i>
                                    <p>No URLs are being monitored currently.</p>
                                    <p style={{ fontSize: '0.8rem' }}>Add a URL and check "Auto-Monitor Daily" to see it here.</p>
                                </div>
                            ) : (
                                monitoredSources.map(source => (
                                    <div key={source._id} style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '15px', background: source.is_active ? isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, color: source.is_active ? isDark ? 'var(--text-main)' : '#1e293b' : '#94a3b8', fontSize: '0.9rem', marginBottom: '4px' }}>{source.source}</div>
                                            <div style={{ fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b', wordBreak: 'break-all' }}>{source.url}</div>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', color: isDark ? 'var(--text-main)' : '#475569', fontWeight: 700 }}>DAILY</span>
                                                {source.last_run_at && (
                                                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Last run: {new Date(source.last_run_at).toLocaleString()}</span>
                                                )}
                                                {source.last_run_status === 'failed' && (
                                                    <span title={source.error_log?.[source.error_log.length - 1]?.message} style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}><i className="fas fa-exclamation-triangle"></i> FAILED</span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => handleToggleMonitor(source._id)}
                                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: source.is_active ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#fee2e2', color: source.is_active ? '#166534' : '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                {source.is_active ? 'ACTIVE' : 'PAUSED'}
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteMonitor(source._id)}
                                                style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #fee2e2', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: '#ef4444', cursor: 'pointer' }}
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <button 
                            onClick={() => setIsMonitorModalOpen(false)}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* WhatsApp Groups Live Ingestion Modal */}
            {isGroupModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: isDark ? 'var(--surface-color, #1e293b)' : '#fff', width: '680px', maxHeight: '90vh', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? 'var(--text-main)' : '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <i className="fab fa-whatsapp" style={{ color: '#22c55e', fontSize: '1.4rem' }}></i>
                                    WhatsApp Groups Live Ingestion Hub
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                    Live property messages from connected groups are automatically parsed into Deal Intake via AI.
                                </p>
                            </div>
                            <button onClick={() => setIsGroupModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: isDark ? 'var(--text-muted)' : '#64748b', cursor: 'pointer' }}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Top Action Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '16px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-muted)' : '#475569', fontWeight: 600 }}>
                                Connected Groups: <strong>{intakeGroups.length}</strong> | Total Processed: <strong>{intakeGroups.reduce((acc, g) => acc + (g.totalProcessed || 0), 0)}</strong> deals
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handleScanGroupsNow}
                                    disabled={isScanningGroups}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        border: '1px solid #22c55e',
                                        background: isScanningGroups ? '#e2e8f0' : '#22c55e',
                                        color: '#fff',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: isScanningGroups ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <i className={`fas fa-sync-alt ${isScanningGroups ? 'fa-spin' : ''}`}></i>
                                    {isScanningGroups ? 'Scanning...' : 'Scan Now'}
                                </button>
                                <button
                                    onClick={() => handleBackfillGroup('all')}
                                    disabled={isScanningGroups}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                                        color: isDark ? 'var(--text-main)' : '#475569',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: isScanningGroups ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                    title="Resets scan cursor and re-evaluates all historical messages"
                                >
                                    <i className="fas fa-history"></i>
                                    Backfill All
                                </button>
                            </div>
                        </div>

                        {/* Groups List */}
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', maxHeight: '420px', paddingRight: '4px' }}>
                            {intakeGroups.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: isDark ? 'var(--text-muted)' : '#64748b' }}>
                                    <i className="fab fa-whatsapp" style={{ fontSize: '2.5rem', opacity: 0.2, marginBottom: '10px' }}></i>
                                    <p>No WhatsApp groups detected yet.</p>
                                    <p style={{ fontSize: '0.8rem' }}>Group messages arriving via WhatsApp Scanner will be registered automatically.</p>
                                </div>
                            ) : (
                                intakeGroups.map(group => (
                                    <div
                                        key={group._id}
                                        style={{
                                            padding: '12px 16px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '10px',
                                            marginBottom: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: group.is_active ? (isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff') : (isDark ? 'rgba(255, 255, 255, 0.01)' : '#f8fafc'),
                                            borderLeft: group.is_active ? '4px solid #22c55e' : '4px solid #cbd5e1'
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: group.is_active ? (isDark ? 'var(--text-main)' : '#0f172a') : '#94a3b8' }}>
                                                    {group.groupName || 'Unnamed Group'}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                                    {group.totalProcessed || 0} Deals
                                                </span>
                                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                                                    {group.totalSkipped || 0} Filtered
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: isDark ? 'var(--text-muted)' : '#64748b', fontFamily: 'monospace' }}>
                                                {group.groupJid}
                                            </div>
                                            {group.lastProcessedAt && (
                                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px' }}>
                                                    Last scan: {new Date(group.lastProcessedAt).toLocaleString()}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button
                                                onClick={() => {
                                                    setSelectedGroupFilter(group.groupJid);
                                                    loadIntakeHistory(group.groupJid);
                                                    setIsGroupModalOpen(false);
                                                    toast.success(`Showing deals for: ${group.groupName || group.groupJid}`);
                                                }}
                                                style={{
                                                    padding: '5px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #22c55e',
                                                    background: selectedGroupFilter === group.groupJid ? '#22c55e' : (isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4'),
                                                    color: selectedGroupFilter === group.groupJid ? '#fff' : '#15803d',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                                title="Filter Deal Intake queue to this group only"
                                            >
                                                <i className="fas fa-filter"></i>
                                                {selectedGroupFilter === group.groupJid ? 'Filtering' : 'View Deals'}
                                            </button>
                                            <button
                                                onClick={() => handleBackfillGroup(group._id)}
                                                title="Re-scan all messages from this group"
                                                style={{
                                                    padding: '5px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff',
                                                    color: isDark ? 'var(--text-main)' : '#475569',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <i className="fas fa-history" style={{ marginRight: '4px' }}></i>
                                                Re-scan
                                            </button>
                                            <button
                                                onClick={() => handleToggleGroup(group._id)}
                                                style={{
                                                    padding: '5px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #e2e8f0',
                                                    background: group.is_active ? '#dcfce7' : '#fee2e2',
                                                    color: group.is_active ? '#15803d' : '#b91c1c',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {group.is_active ? 'ACTIVE' : 'PAUSED'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <button
                            onClick={() => setIsGroupModalOpen(false)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#22c55e',
                                color: '#fff',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Upload Summary Modal */}
            <UploadSummaryModal
                isOpen={showUploadSummary}
                onClose={() => setShowUploadSummary(false)}
                summaryData={uploadSummaryData}
            />
        </div >
    );
};

export default DealIntakePage;
