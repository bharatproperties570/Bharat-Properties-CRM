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

const DealIntakePage = () => {
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

    const [leadData, setLeadData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const [dealData, setDealData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [intakeLoadError, setIntakeLoadError] = useState(null);
    // const [contactData, setContactData] = useState([]);

    useEffect(() => {
        const fetchSupportData = async () => {
            try {
                const [leads, inv, deals, contacts] = await Promise.all([
                    api.get('/leads'),
                    api.get('/inventory'),
                    api.get('/deals'),
                    api.get('/contacts')
                ]);
                if (leads.data && leads.data.success) setLeadData(leads.data.data || []);
                if (inv.data && inv.data.success) setInventoryData(inv.data.data || []);
                if (deals.data && deals.data.success) setDealData(deals.data.data || []);
                if (contacts.data && contacts.data.success) {
                    // setContactData(contacts.data.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch support data:", err);
            }
        };
        fetchSupportData();
    }, []);


    // ===== DUPLICATE DETECTION & DATA PERSISTENCE UTILITIES =====

    const loadIntakeHistory = async () => {
        try {
            const response = await intakeAPI.getIntakes();
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
    };

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

    // Load history on component mount
    useEffect(() => {
        loadIntakeHistory();

        // Run re-fetch periodically instead of cleanup (live sync)
        const fetchInterval = setInterval(loadIntakeHistory, 30000); // 30s
        return () => clearInterval(fetchInterval);
    }, [loadIntakeHistory]);

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
            const dealMatch = dealData.find(d => d.title.includes(parsedData.address.unitNumber)); // simplistic check on title
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
    const handleQuickDealCreate = async (dealData) => {
        setIsProcessing(true);
        const toastId = toast.loading("Creating Deal & Updating Intake...");

        try {
            // 1. Prepare Deal Payload
            const price = parseFloat(dealData.price?.toString().replace(/[^0-9.]/g, '')) || 0;
            const dealPayload = {
                owner: dealData.owner?._id || dealData.owner?.id,
                inventoryId: dealData.property?._id || dealData.property?.id,
                projectName: dealData.property?.projectName || dealData.property?.area?.split(',')[0],
                block: dealData.property?.block || dealData.property?.location,
                unitNo: dealData.property?.unitNo,
                intent: dealData.type,
                price: price,
                status: 'Open',
                source: dealData.source || 'Manual',
                verificationStatus: dealData.verificationStatus || 'unverified'
            };

            // 2. Create the Deal in Backend
            const dealResponse = await api.post('/deals', dealPayload);
            if (!dealResponse.data?.success) {
                throw new Error("Failed to persist deal to database");
            }

            // 3. Update Local State (Legacy UI logic)
            setSelectedOwner(dealData.owner);
            setSelectedInventory(dealData.property);
            setDealForm({
                intent: dealData.type,
                price: dealData.price,
                status: 'Open',
                verificationStatus: dealData.verificationStatus
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

            const verificationBadge = dealData.verificationStatus === 'confirmed' ? '✓ Verified' :
                dealData.verificationStatus === 'unverified' ? '⚠️ Unverified' : '';
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
                const searchData = dealData.length > 2000 ? dealData.slice(0, 2000) : dealData;

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

    // Filter intake items by category
    const filteredIntakeItems = useMemo(() => {
        if (categoryFilter === 'all') return intakeItems;
        return intakeItems.filter(item => (item.category || 'new') === categoryFilter);
    }, [intakeItems, categoryFilter]);

    return (
        <div style={{ display: 'flex', height: '100vh', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
            {/* Left Panel: Workflow Steps / Inbox */}
            <div style={{ width: '350px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <i className="fas fa-magic" style={{ color: '#6366f1' }}></i>
                            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#1e293b', margin: 0 }}>Unified Intake Engine</h2>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b', margin: 0 }}>Processing Queue: {intakeItems.length} items</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={loadIntakeHistory}
                            title="Refresh Queue"
                            style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className="fas fa-sync-alt" style={{ color: isDark ? 'var(--text-muted)' : '#64748b' }}></i>
                        </button>
                        <button
                            onClick={() => {
                                loadMonitoredSources();
                                setIsMonitorModalOpen(true);
                            }}
                            title="Monitored URLs"
                            style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f5f3ff',
                                border: '1px solid #ddd6fe',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className="fas fa-redo-alt" style={{ color: '#8b5cf6' }}></i>
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            title="Add Intake"
                            style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className="fas fa-plus" style={{ color: isDark ? 'var(--text-muted)' : '#64748b' }}></i>
                        </button>
                    </div>
                </div>

                {/* Category Filters */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                            { key: 'all', label: 'All', color: isDark ? 'var(--text-muted)' : '#64748b' },
                            { key: 'new', label: 'New', color: '#10b981' },
                            { key: 'repeat1x', label: '1x', color: '#f59e0b' },
                            { key: 'repeat2x', label: '2x', color: '#f97316' },
                            { key: 'repeat3x', label: '3x', color: '#ef4444' },
                            { key: 'repeat3plus', label: '3+', color: '#991b1b' }
                        ].map(filter => {
                            const count = filter.key === 'all'
                                ? intakeItems.length
                                : intakeItems.filter(item => (item.category || 'new') === filter.key).length;

                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => setCategoryFilter(filter.key)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: categoryFilter === filter.key ? `2px solid ${filter.color}` : '1px solid #e2e8f0',
                                        background: categoryFilter === filter.key ? `${filter.color}15` : '#fff',
                                        color: categoryFilter === filter.key ? filter.color : isDark ? 'var(--text-muted)' : '#64748b',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    {filter.label}
                                    <span style={{
                                        background: filter.color,
                                        color: '#fff',
                                        borderRadius: '10px',
                                        padding: '2px 6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700
                                    }}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
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
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: item.source === 'WhatsApp' ? '#22c55e' : '#f59e0b', background: item.source === 'WhatsApp' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>{item.source}</span>
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
                                        {(item.category || 'new') && (item.category || 'new') !== 'new' && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                color: '#fff',
                                                background: getCategoryColor(item.category || 'new'),
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {(item.category || 'new').toUpperCase()}
                                            </span>
                                        )}
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
                                <div style={{ fontSize: '0.8rem', color: isDark ? 'var(--text-primary)' : '#334155', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                                    color: isDark ? 'var(--text-primary)' : '#475569',
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {isProcessing && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255, 255, 255, 0.7)', zIndex: 100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: '12px', backdropFilter: 'blur(2px)'
                    }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <div style={{ fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#1e293b' }}>Processing Deal Data...</div>
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
                        {/* Header: Progress */}
                        <div style={{ padding: '20px 40px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#0f172a', margin: 0 }}>Intake #{currentItem?._id ? currentItem._id.slice(-6).toUpperCase() : renderValue(currentItem?.id)}</h2>
                                        <div style={{
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800,
                                            background: intakeType === 'BUYER' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#f0fdf4' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#eff6ff',
                                            color: intakeType === 'BUYER' ? '#16a34a' : '#3b82f6',
                                            border: '1px solid currentColor'
                                        }}>
                                            {intakeType} INTENT DETECTED
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[1, 2, 3, 4].map(s => (
                                        <div key={s}
                                            style={{
                                                width: '40px', height: '4px',
                                                background: stage >= s ? (intakeType === 'BUYER' ? '#16a34a' : '#3b82f6') : '#e2e8f0',
                                                borderRadius: '2px',
                                                transition: 'background 0.3s'
                                            }}
                                            title={`Stage ${s}`}
                                        ></div>
                                    ))}
                                    {extractedReq.tags && extractedReq.tags.length > 0 && (
                                        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {extractedReq.tags.map((tag, i) => (
                                                <span key={i} style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    color: tag === 'URGENT' ? '#b91c1c' : tag === 'DIRECT' ? '#15803d' : '#0369a1',
                                                    background: tag === 'URGENT' ? '#fecaca' : tag === 'DIRECT' ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#dcfce7' : isDark ? 'rgba(255, 255, 255, 0.03)' : '#e0f2fe',
                                                    border: '1px solid currentColor'
                                                }}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

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
                                                    color: activeDealIndex === idx ? isDark ? 'var(--text-primary)' : '#1e293b' : isDark ? 'var(--text-muted)' : '#64748b',
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

                            {/* Raw Source Data Box */}
                            <div style={{ padding: '16px 40px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-align-left"></i> Original Raw Message
                                </div>
                                <div style={{ 
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', 
                                    border: '1px solid #cbd5e1', 
                                    borderRadius: '6px', 
                                    padding: '12px', 
                                    fontSize: '0.85rem', 
                                    color: isDark ? 'var(--text-primary)' : '#1e293b', 
                                    whiteSpace: 'pre-wrap', 
                                    maxHeight: '150px', 
                                    overflowY: 'auto',
                                    fontFamily: 'monospace',
                                    lineHeight: '1.4'
                                }}>
                                    {currentItem?.content || "No raw content available."}
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
                            {(currentItem?.verification_status || currentItem?.confidence_score) && (
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
                                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: isDark ? 'var(--text-primary)' : '#1e293b' }}>AI Verification Layer</span>
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
                                                    color: currentItem.verification_status === 'verified' ? '#059669' : currentItem.verification_status === 'suspicious' ? '#b91c1c' : isDark ? 'var(--text-primary)' : '#475569',
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
                                                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.85rem', color: isDark ? 'var(--text-primary)' : '#475569' }}>
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
                                                    <div style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-primary)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.summary}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>SELLER INTENT</div>
                                                    <div style={{ fontSize: '0.85rem', color: isDark ? 'var(--text-primary)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.seller_intent}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>RECOMMENDED ACTION</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 700 }}>{currentItem.ai_assistant.next_action}</div>
                                                </div>
                                                <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>URGENCY</div>
                                                    <div style={{ fontSize: '0.85rem', color: currentItem.ai_assistant.urgency === 'High' ? '#dc2626' : currentItem.ai_assistant.urgency === 'Medium' ? '#d97706' : isDark ? 'var(--text-primary)' : '#334155', fontWeight: 600 }}>{currentItem.ai_assistant.urgency}</div>
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
                                                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem', color: isDark ? 'var(--text-primary)' : '#475569' }}>
                                                        {currentItem.ai_assistant.verification_actions.map((action, idx) => (
                                                            <li key={idx}>{action}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            )}

                            <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                {/* Header: Raw Text */}
                                <div style={{ padding: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: isDark ? 'var(--text-primary)' : '#475569', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
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
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#0f172a' }}>
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
                                    style={{ padding: '6px 12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? 'var(--text-primary)' : '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>

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
                                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#1e293b', marginBottom: '16px' }}>1. Confirm Property Owner</h3>
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
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: isDark ? 'var(--text-primary)' : '#475569', marginBottom: '15px' }}>1. Lead Classification</h3>

                                                    {detectedContacts.length > 0 ? (
                                                        <div style={{ padding: '15px', background: buyerContact?.isBroker ? '#FEF2F2' : (buyerContact?.isNew ? '#F0F9FF' : '#F0FDF4'), border: '1px solid', borderColor: buyerContact?.isBroker ? '#FECACA' : (buyerContact?.isNew ? '#BAE6FD' : '#BBF7D0'), borderRadius: '8px', marginBottom: '15px' }}>
                                                            {/* Header Row */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#0f172a' }}>
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
                                                                        <span title="Deals" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-primary)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-handshake" style={{ color: '#3b82f6', marginRight: '4px' }}></i> {buyerContact.stats.deals} Deals</span>
                                                                    )}
                                                                    {buyerContact.stats.inventory > 0 && (
                                                                        <span title="Inventory" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-primary)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-building" style={{ color: '#8b5cf6', marginRight: '4px' }}></i> {buyerContact.stats.inventory} Unit</span>
                                                                    )}
                                                                    {buyerContact.stats.leads > 0 && (
                                                                        <span title="Leads" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-primary)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-filter" style={{ color: '#f59e0b', marginRight: '4px' }}></i> {buyerContact.stats.leads} Leads</span>
                                                                    )}
                                                                    {buyerContact.stats.activities > 0 && (
                                                                        <span title="Activities" style={{ fontSize: '0.7rem', padding: '3px 8px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: isDark ? 'var(--text-primary)' : '#0f172a', fontWeight: 600 }}><i className="fas fa-clock" style={{ color: isDark ? 'var(--text-muted)' : '#64748b', marginRight: '4px' }}></i> {buyerContact.stats.activities} Actv.</span>
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
                                                            <span style={{ fontWeight: 600, color: isDark ? 'var(--text-primary)' : '#334155' }}>Mark as Temporary Lead (15-Day Expiry)</span>
                                                        </label>
                                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '24px', marginTop: '2px' }}>
                                                            {isTemporaryLead ? 'This lead will expire automatically in 15 days.' : 'This lead will follow the standard long-term lifecycle.'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right: Requirements */}
                                                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: isDark ? 'var(--text-primary)' : '#475569', marginBottom: '15px' }}>2. Requirement Parsing</h3>
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

                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#1e293b', marginBottom: '16px' }}>
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
                                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: isDark ? 'var(--text-primary)' : '#0f172a' }}>{match.deal.title}</div>
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
                                                    style={{ padding: '12px 30px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#475569', cursor: 'pointer' }}
                                                >
                                                    Fast Close
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

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
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#475569', marginBottom: '8px' }}>Campaign Source</label>
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
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-primary)' : '#475569', marginBottom: '8px' }}>Content Input</label>

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
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: isDark ? 'rgba(255, 255, 255, 0.03)' : isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? 'var(--text-primary)' : '#475569', fontWeight: 600, cursor: 'pointer' }}
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
                            <h3 style={{ marginTop: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#1e293b' }}>Import Data</h3>
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
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isDark ? 'var(--text-primary)' : '#1e293b' }}>{selectedFile.name}</div>
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
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? 'var(--text-primary)' : '#1e293b' }}>
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
                                            <div style={{ fontWeight: 700, color: source.is_active ? isDark ? 'var(--text-primary)' : '#1e293b' : '#94a3b8', fontSize: '0.9rem', marginBottom: '4px' }}>{source.source}</div>
                                            <div style={{ fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b', wordBreak: 'break-all' }}>{source.url}</div>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f1f5f9', color: isDark ? 'var(--text-primary)' : '#475569', fontWeight: 700 }}>DAILY</span>
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
