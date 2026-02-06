import React, { useState, useEffect, useMemo } from 'react';
import { inventoryData, contactData, leadData, dealData } from '../../../data/mockData';
import { dealIntakeData } from '../../../data/dealIntakeData';
import { parseWhatsAppZip, parseTribunePdf } from '../../../utils/importParsers';
import { parseDealContent, splitIntakeMessage } from '../../../utils/dealParser';
import toast from 'react-hot-toast';
import { useParsing } from '../../../context/ParsingContext'; // Dynamic Parser
import { useTriggers } from '../../../context/TriggersContext';
import { useCall } from '../../../context/CallContext';
import { useDistribution } from '../../../context/DistributionContext';
import QuickInventoryForm from '../../../components/common/QuickInventoryForm';
import AddProjectModal from '../../../components/modals/AddProjectModal';
import AddBlockModal from '../../../components/modals/AddBlockModal';
import AddSizeModal from '../../../components/modals/AddSizeModal';
import AddContactModal from '../../../components/AddContactModal'; // Imported AddContactModal
import UploadSummaryModal from '../../../components/UploadSummaryModal';

const DealIntakePage = () => {
    // Shared State
    const [intakeItems, setIntakeItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(null);
    const [intakeType, setIntakeType] = useState('SELLER'); // 'SELLER' | 'BUYER'
    const [stage, setStage] = useState(0); // 0=Source, 1=Classification, 2=Match, 3=Action, 4=Result

    const { startCall } = useCall(); // Call Engine Hook
    const { customPatterns } = useParsing(); // Dynamic Regex from Context

    // New Intake State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null); // New state for 2-step import
    const [newSourceContent, setNewSourceContent] = useState('');
    const [newSourceType, setNewSourceType] = useState('WhatsApp');

    // Campaign Details State
    const [campaignName, setCampaignName] = useState('');
    const [campaignSource, setCampaignSource] = useState('WhatsApp');
    const [campaignDate, setCampaignDate] = useState('');
    const [contentInputMode, setContentInputMode] = useState('paste'); // 'paste' or 'import'

    // Call Outcome State (Strict Gating)
    const [ownerCallOutcome, setOwnerCallOutcome] = useState(null); // 'Confirmed' | 'Follow-up' etc.

    // Duplicate Detection & Data Retention State
    const [intakeHistory, setIntakeHistory] = useState([]); // Last 30 days of all intakes
    const [duplicateStats, setDuplicateStats] = useState({
        new: 0,
        repeat1x: 0,
        repeat2x: 0,
        repeat3x: 0,
        repeat3plus: 0
    });
    const [showUploadSummary, setShowUploadSummary] = useState(false);
    const [uploadSummaryData, setUploadSummaryData] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'new' | 'repeat1x' | 'repeat2x' | 'repeat3x' | 'repeat3plus'

    // ... (existing code) ...

    // ===== DUPLICATE DETECTION & DATA PERSISTENCE UTILITIES =====

    // Extract phone number from content
    const extractPhoneNumber = (content) => {
        if (!content) return null;
        // Match Indian phone numbers: 10 digits, optionally with +91 or 0 prefix
        const phoneRegex = /(?:\+91|91|0)?[6-9]\d{9}/g;
        const matches = content.match(phoneRegex);
        if (!matches) return null;
        // Normalize: remove +91, 91, 0 prefix and keep only 10 digits
        const normalized = matches[0].replace(/^(\+91|91|0)/, '').slice(-10);
        return normalized.length === 10 ? normalized : null;
    };

    // Load intake history from localStorage
    const loadIntakeHistory = () => {
        try {
            const stored = localStorage.getItem('dealIntakeHistory');
            if (stored) {
                const history = JSON.parse(stored);
                // Filter out entries older than 30 days
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const filtered = history.filter(item =>
                    new Date(item.receivedAt) > thirtyDaysAgo
                );
                return filtered;
            }
        } catch (error) {
            console.error('Error loading intake history:', error);
        }
        return [];
    };

    // Save intake history to localStorage
    const saveIntakeHistory = (history) => {
        try {
            localStorage.setItem('dealIntakeHistory', JSON.stringify(history));
        } catch (error) {
            console.error('Error saving intake history:', error);
            // If localStorage is full, remove oldest entries
            if (error.name === 'QuotaExceededError') {
                const reduced = history.slice(0, Math.floor(history.length / 2));
                localStorage.setItem('dealIntakeHistory', JSON.stringify(reduced));
            }
        }
    };

    // Cleanup old intakes (older than 30 days)
    const cleanupOldIntakes = () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const filtered = intakeHistory.filter(item =>
            new Date(item.receivedAt) > thirtyDaysAgo
        );

        if (filtered.length !== intakeHistory.length) {
            setIntakeHistory(filtered);
            saveIntakeHistory(filtered);
        }
    };

    // Calculate string similarity (Levenshtein distance based)
    const calculateSimilarity = (str1, str2) => {
        if (!str1 || !str2) return 0;
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        if (s1 === s2) return 100;

        // Simple similarity: count matching words
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        const allWords = new Set([...words1, ...words2]);
        const matchingWords = words1.filter(w => words2.includes(w)).length;

        return (matchingWords / allWords.size) * 100;
    };

    // Extract property details from parsed data
    const extractPropertyDetails = (item) => {
        // If item has rawParsed data (from dealParser), use that
        if (item.rawParsed) {
            return {
                unitNumber: item.rawParsed.address?.unitNumber || '',
                project: item.rawParsed.address?.project || '',
                location: item.rawParsed.location || '',
                category: item.rawParsed.category || '',
                type: item.rawParsed.type || '',
                city: item.rawParsed.address?.city || ''
            };
        }

        // Otherwise try to extract from content
        const content = item.content || '';
        return {
            unitNumber: content.match(/(?:unit|plot|house|flat|shop)\s*#?\s*(\d+[\w-]*)/i)?.[1] || '',
            project: content.match(/(?:project|society|colony|scheme)\s*:?\s*([a-z0-9\s]+)/i)?.[1]?.trim() || '',
            location: content.match(/(?:location|sector|area)\s*:?\s*([a-z0-9\s]+)/i)?.[1]?.trim() || '',
            category: content.match(/(?:residential|commercial|industrial|agricultural|institutional)/i)?.[0] || '',
            type: content.match(/(?:plot|house|flat|apartment|villa|shop|office|warehouse|farmhouse)/i)?.[0] || '',
            city: content.match(/(?:chandigarh|mohali|panchkula|zirakpur|kharar)/i)?.[0] || ''
        };
    };

    // Check if intake is duplicate based on property details (95% match)
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

    // Load history on component mount
    useEffect(() => {
        const history = loadIntakeHistory();
        setIntakeHistory(history);

        // Run cleanup daily
        const cleanupInterval = setInterval(cleanupOldIntakes, 24 * 60 * 60 * 1000);
        return () => clearInterval(cleanupInterval);
    }, []);

    // Cleanup on mount and periodically
    useEffect(() => {
        if (intakeHistory.length > 0) {
            cleanupOldIntakes();
        }
    }, [intakeHistory.length]);

    // ===== END DUPLICATE DETECTION UTILITIES =====

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImportProcess = async () => {
        if (!selectedFile) return;

        setIsImporting(true);
        const toastId = toast.loading('Parsing file...');

        try {
            let parsedItems = [];

            if (selectedFile.name.endsWith('.zip')) {
                parsedItems = await parseWhatsAppZip(selectedFile);
            } else if (selectedFile.name.endsWith('.pdf')) {
                parsedItems = await parseTribunePdf(selectedFile);
            } else {
                throw new Error('Unsupported format. Please upload .zip (WhatsApp) or .pdf (Tribune).');
            }

            if (parsedItems.length === 0) {
                toast.error('No valid messages found', { id: toastId });
            } else {
                setIntakeItems(prev => [...parsedItems, ...prev]);
                toast.success(`Imported ${parsedItems.length} items!`, { id: toastId });
                setIsImportModalOpen(false);
                setSelectedFile(null); // Reset
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
    const [leadId, setLeadId] = useState(null);
    const [matchedDeals, setMatchedDeals] = useState([]);
    const [parsedDeals, setParsedDeals] = useState([]);
    const [activeDealIndex, setActiveDealIndex] = useState(0);
    const [duplicateStatus, setDuplicateStatus] = useState(null);
    const [visibleCount, setVisibleCount] = useState(50); // Pagination Limit

    // Initialize with Expiry Logic (Mock: Filter > 30 days)
    useEffect(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const validItems = dealIntakeData.filter(item => {
            const received = new Date(item.receivedAt);
            return received > thirtyDaysAgo;
        });
        setIntakeItems(validItems);
    }, []);

    // --- CONTACT USAGE ANALYTICS ---
    const getContactUsageStats = (mobile, name) => {
        if (!mobile) return null;

        // Normalize
        const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

        // 1. Leads
        const leadsCount = leadData.filter(l =>
            (l.mobile && l.mobile.includes(cleanMobile)) ||
            (l.contactId && l.contactId.includes(cleanMobile))
        ).length;

        // 2. Inventory (Owner)
        const inventoryCount = inventoryData.filter(i =>
            (i.ownerPhone && i.ownerPhone.includes(cleanMobile))
        ).length;

        // 3. Deals (Owner or Requirements)
        const dealsCount = dealData.filter(d =>
            (d.requirements && d.requirements.includes(name)) || // Loose match by name for now as dealData mocks lack phone sometimes
            inventoryData.find(inv => inv.id === d.inventoryId)?.ownerPhone?.includes(cleanMobile)
        ).length;

        // 4. Activities (In Contact Data)
        const contact = contactData.find(c => c.mobile.includes(cleanMobile));
        const activitiesCount = contact?.activities?.length || 0;

        return {
            leads: leadsCount,
            inventory: inventoryCount,
            deals: dealsCount,
            activities: activitiesCount,
            total: leadsCount + inventoryCount + dealsCount + activitiesCount
        };
    };

    // parseContacts Removed - Logic centralized in dealParser.js

    // --- LEGACY HELPERS REMOVED (Replaced by dealParser.js) ---

    const handleSelectIntake = (item) => {
        setCurrentItem(item);

        try {
            // Use Multi-Deal Splitter (With dynamic patterns)
            const deals = splitIntakeMessage(item.content, customPatterns);
            console.log("Parsed Deals:", deals); // Debug Log
            setParsedDeals(deals);
            setActiveDealIndex(0);

            if (deals && deals.length > 0) {
                loadDealIntoWorkflow(deals[0]);
            }
        } catch (error) {
            console.error("Critical Parsing Error:", error);
            toast.error("Error parsing deal content");
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
            unit: parsedData.address.unitNumber,
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

    const handleAddIntake = () => {
        if (!newSourceContent.trim()) return;

        const newItem = {
            id: Date.now(),
            source: campaignSource || newSourceType,
            content: newSourceContent,
            receivedAt: new Date().toISOString(),
            status: 'Raw Received',
            campaignName: campaignName,
            campaignDate: campaignDate
        };

        // Check for duplicates
        const duplicateInfo = checkDuplicateAndFrequency(newItem, dealData);
        newItem.duplicateInfo = duplicateInfo;
        newItem.category = duplicateInfo.category;

        // Add to intake items
        setIntakeItems([newItem, ...intakeItems]);

        // Add to history and save to localStorage
        const updatedHistory = [newItem, ...intakeHistory];
        setIntakeHistory(updatedHistory);
        saveIntakeHistory(updatedHistory);

        // Clear form
        setNewSourceContent('');
        setCampaignName('');
        setCampaignSource('WhatsApp');
        setCampaignDate('');
        setIsAddModalOpen(false);

        // Show notification with duplicate info
        if (duplicateInfo.isDuplicate) {
            toast.warning(`Intake added - ${duplicateInfo.category.toUpperCase()} (seen ${duplicateInfo.frequency}x before)`, {
                duration: 4000
            });
        } else {
            toast.success('New Intake Added');
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const toastId = toast.loading('Parsing file...');

        try {
            let parsedItems = [];

            if (file.name.endsWith('.zip')) {
                parsedItems = await parseWhatsAppZip(file);
            } else if (file.name.endsWith('.pdf')) {
                parsedItems = await parseTribunePdf(file);
            } else if (file.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
                // Handle image files - create a single intake item
                parsedItems = [{
                    id: Date.now(),
                    source: campaignSource || 'Image Upload',
                    content: `Image uploaded: ${file.name}`,
                    receivedAt: new Date().toISOString(),
                    status: 'Raw Received',
                    campaignName: campaignName,
                    campaignDate: campaignDate,
                    attachments: [file.name]
                }];
            } else {
                throw new Error('Unsupported format. Please upload .zip (WhatsApp), .pdf (Tribune), or image files.');
            }

            if (parsedItems.length === 0) {
                toast.error('No valid messages found', { id: toastId });
            } else {
                // Add campaign details to parsed items
                const itemsWithCampaign = parsedItems.map(item => ({
                    ...item,
                    campaignName: campaignName,
                    campaignDate: campaignDate,
                    source: campaignSource || item.source
                }));

                setIntakeItems(prev => [...itemsWithCampaign, ...prev]);
                toast.success(`Imported ${parsedItems.length} items!`, { id: toastId });

                // Close Add modal and reset form
                setIsAddModalOpen(false);
                setCampaignName('');
                setCampaignSource('WhatsApp');
                setCampaignDate('');
                setContentInputMode('paste');

                // Also close import modal if it was open
                setIsImportModalOpen(false);
            }

        } catch (error) {
            console.error(error);
            toast.error(error.message, { id: toastId });
        } finally {
            setIsImporting(false);
        }
    };

    // Process selected file when Add Intake button is clicked
    const handleFileImport = async () => {
        if (!selectedFile) {
            toast.error('Please select a file first');
            return;
        }

        setIsImporting(true);
        const toastId = toast.loading('Parsing file...');

        try {
            let parsedItems = [];

            if (selectedFile.name.endsWith('.zip')) {
                parsedItems = await parseWhatsAppZip(selectedFile);
            } else if (selectedFile.name.endsWith('.pdf')) {
                parsedItems = await parseTribunePdf(selectedFile);
            } else if (selectedFile.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
                // Handle image files - create a single intake item
                parsedItems = [{
                    id: Date.now(),
                    source: campaignSource || 'Image Upload',
                    content: `Image uploaded: ${selectedFile.name}`,
                    receivedAt: new Date().toISOString(),
                    status: 'Raw Received',
                    campaignName: campaignName,
                    campaignDate: campaignDate,
                    attachments: [selectedFile.name]
                }];
            } else {
                throw new Error('Unsupported format. Please upload .zip (WhatsApp), .pdf (Tribune), or image files.');
            }

            if (parsedItems.length === 0) {
                toast.error('No valid messages found', { id: toastId });
            } else {
                // Add campaign details and check for duplicates
                const stats = {
                    new: 0,
                    repeat1x: 0,
                    repeat2x: 0,
                    repeat3x: 0,
                    repeat3plus: 0,
                    total: parsedItems.length
                };

                const duplicatesList = [];

                const itemsWithCampaign = parsedItems.map(item => {
                    const enrichedItem = {
                        ...item,
                        campaignName: campaignName,
                        campaignDate: campaignDate,
                        source: campaignSource || item.source
                    };

                    // Check for duplicates
                    const duplicateInfo = checkDuplicateAndFrequency(enrichedItem, dealData);
                    enrichedItem.duplicateInfo = duplicateInfo;
                    enrichedItem.category = duplicateInfo.category;

                    // Update stats
                    stats[duplicateInfo.category]++;

                    // Track duplicates for summary
                    if (duplicateInfo.isDuplicate) {
                        duplicatesList.push({
                            ...enrichedItem,
                            duplicateInfo
                        });
                    }

                    return enrichedItem;
                });

                // Add to intake items
                setIntakeItems(prev => [...itemsWithCampaign, ...prev]);

                // Add to history and save to localStorage
                const updatedHistory = [...itemsWithCampaign, ...intakeHistory];
                setIntakeHistory(updatedHistory);
                saveIntakeHistory(updatedHistory);

                // Update duplicate stats
                setDuplicateStats(stats);

                // Prepare upload summary data
                setUploadSummaryData({
                    stats,
                    duplicatesList,
                    totalUploaded: parsedItems.length,
                    fileName: selectedFile.name
                });

                toast.success(`Imported ${parsedItems.length} items!`, { id: toastId });

                // Close Add modal and reset form
                setIsAddModalOpen(false);
                setCampaignName('');
                setCampaignSource('WhatsApp');
                setCampaignDate('');
                setContentInputMode('paste');
                setSelectedFile(null);

                // Show upload summary modal
                setShowUploadSummary(true);
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
        // 1. Get Extracted Data (Already parsed in handleSelectIntake)
        const parsed = extractedReq.rawParsed || {};
        const pAddr = parsed.address || {};
        const pSpecs = parsed.specs || {};
        const rawTextLower = text.toLowerCase();

        // REMOVED EARLY RETURN: Always attempt raw text fallback matching

        let matches = inventoryData.map(inv => {
            let score = 0;
            let reasons = [];

            const invUnit = (inv.unitNo || '').toLowerCase();
            const invArea = (inv.area || '').toLowerCase(); // Found in Project/City field
            const invLoc = (inv.location || '').toLowerCase(); // Found in Block/Location field

            // A. UNIT NUMBER (Highest Priority)
            if (invUnit) {
                if (pAddr.unitNumber && invUnit === pAddr.unitNumber.toLowerCase()) {
                    score += 50;
                    reasons.push('Exact Unit Match (Parsed)');
                } else {
                    // Regex to find unit number as a whole word in raw text
                    // Escaping special regex chars in unit number just in case
                    const safeUnit = invUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${safeUnit}\\b`);

                    if (regex.test(rawTextLower)) {
                        score += 45; // Very strong signal
                        reasons.push('Unit # Found in Text');
                    } else if (rawTextLower.includes(invUnit) && invUnit.length > 2) {
                        // Fallback for non-boundary matches (e.g. #7419)
                        score += 30;
                        reasons.push('Unit # Partial Match');
                    }
                }
            }

            // B. BLOCK MATCH
            // Handles "Block H", "H Block", "North Block"
            if (invLoc) {
                // If text contains the full block string
                if (rawTextLower.includes(invLoc)) {
                    score += 25;
                    reasons.push('Full Block Match');
                } else {
                    // Try to extract just the code (e.g. "H" from "Block H")
                    const blockCode = invLoc.replace(/block/g, '').trim();
                    if (blockCode.length > 0) {
                        if (rawTextLower.includes(`block ${blockCode}`) || rawTextLower.includes(`${blockCode} block`)) {
                            score += 25;
                            reasons.push('Block Code Match');
                        }
                    }
                }
            }

            // C. PROJECT / AREA / SECTOR MATCH
            if (invArea) {
                // 1. Prefer Parsed Sector Match
                if (pAddr.sector && invArea.includes(pAddr.sector.toLowerCase())) {
                    score += 30;
                    reasons.push('Sector/Project Match');
                }
                // 2. Token Fallback for Raw Text
                else {
                    // Tokenize Inventory Area (e.g. "Sector 82, Aerocity") -> ["sector", "82", "aerocity"]
                    const tokens = invArea.split(/[\s,()-]+/).filter(t => t.length > 2 && !['sector', 'phase', 'mohali', 'city'].includes(t));

                    let tokenMatches = 0;
                    tokens.forEach(token => {
                        if (rawTextLower.includes(token)) tokenMatches++;
                    });

                    if (tokenMatches > 0) {
                        score += (15 * tokenMatches);
                        reasons.push(`Area Keywords (${tokenMatches})`);
                    }
                }
            }

            // D. OWNER MATCH (Verification)
            if (owner && inv.ownerName && owner.name && inv.ownerName.toLowerCase().includes(owner.name.toLowerCase())) {
                score += 40;
                reasons.push('Owner Match');
            }

            // E. SIZE HELPER
            if (pSpecs.size && inv.size) {
                const targetSize = pSpecs.size.replace(/\D/g, '');
                const invSizeDig = inv.size.replace(/\D/g, '');
                if (targetSize && invSizeDig && targetSize === invSizeDig) {
                    score += 15;
                    reasons.push('Size Match');
                }
            }

            return { inventory: inv, score: Math.min(score, 100), reasons };
        });

        // Filter and Sort
        // Reduced threshold to capture more potential candidates
        matches = matches.filter(m => m.score >= 15).sort((a, b) => b.score - a.score);
        setMatchedInventory(matches.slice(0, 5));
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
                unitNo: extractedReq.rawParsed.address.unitNumber || '',
                type: extractedReq.rawParsed.type || 'Residential',
                size: extractedReq.rawParsed.specs.size || ''
            });
        }
    }, [isManualLinkOpen]);


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
        // Match Lead Requirements against Active Deals
        // Logic: Location + Type + Budget

        const req = extractedReq;

        let matches = dealData.map(deal => {
            let score = 0;
            // Location
            if (req.location && deal.location.toLowerCase().includes(req.location.toLowerCase())) score += 40;

            // Type
            if (req.type && deal.type.includes(req.type)) score += 30;

            // Budget (Very simple text match for now)
            if (req.budget && deal.price.includes(req.budget)) score += 20;

            // Description fuzzy match
            if (deal.description.toLowerCase().includes(req.type.toLowerCase())) score += 10;

            return { deal, score: Math.min(score, 100) };
        });

        matches = matches.filter(m => m.score > 20).sort((a, b) => b.score - a.score);
        setMatchedDeals(matches);
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
        return intakeItems.filter(item => item.category === categoryFilter);
    }, [intakeItems, categoryFilter]);

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f8fafc' }}>
            {/* Left Panel: Workflow Steps / Inbox */}
            <div style={{ width: '350px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <i className="fas fa-magic" style={{ color: '#6366f1' }}></i>
                            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Unified Intake Engine</h2>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Processing Queue: {intakeItems.length} items</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            title="Add Intake"
                            style={{
                                background: '#f1f5f9',
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
                            <i className="fas fa-plus" style={{ color: '#64748b' }}></i>
                        </button>
                    </div>
                </div>

                {/* Category Filters */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                            { key: 'all', label: 'All', color: '#64748b' },
                            { key: 'new', label: 'New', color: '#10b981' },
                            { key: 'repeat1x', label: '1x', color: '#f59e0b' },
                            { key: 'repeat2x', label: '2x', color: '#f97316' },
                            { key: 'repeat3x', label: '3x', color: '#ef4444' },
                            { key: 'repeat3plus', label: '3+', color: '#991b1b' }
                        ].map(filter => {
                            const count = filter.key === 'all'
                                ? intakeItems.length
                                : intakeItems.filter(item => item.category === filter.key).length;

                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => setCategoryFilter(filter.key)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: categoryFilter === filter.key ? `2px solid ${filter.color}` : '1px solid #e2e8f0',
                                        background: categoryFilter === filter.key ? `${filter.color}15` : '#fff',
                                        color: categoryFilter === filter.key ? filter.color : '#64748b',
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
                    {filteredIntakeItems.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                        {categoryFilter === 'all' ? 'queue is empty' : `No ${categoryFilter} intakes`}
                    </div>}
                    {filteredIntakeItems.slice(0, visibleCount).map(item => {
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
                                key={item.id}
                                onClick={() => handleSelectIntake(item)}
                                style={{
                                    padding: '15px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    background: currentItem?.id === item.id ? '#eff6ff' : '#fff',
                                    borderLeft: currentItem?.id === item.id ? '4px solid #3b82f6' : '4px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: item.source === 'WhatsApp' ? '#22c55e' : '#f59e0b', background: item.source === 'WhatsApp' ? '#dcfce7' : '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>{item.source}</span>
                                        {item.category && item.category !== 'new' && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                color: '#fff',
                                                background: getCategoryColor(item.category),
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {item.category.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm("Remove this item from queue?")) {
                                                    setIntakeItems(prev => prev.filter(i => i.id !== item.id));
                                                    if (currentItem?.id === item.id) setCurrentItem(null);
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
                                <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {item.content}
                                </div>
                            </div>
                        );
                    })}

                    {visibleCount < intakeItems.length && (
                        <div style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                                onClick={() => setVisibleCount(prev => prev + 50)}
                                style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: '#475569',
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {!currentItem ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column' }}>
                        <i className="far fa-comments" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                        <p>Select a message to process</p>
                    </div>
                ) : (
                    <>
                        {/* Header: Progress */}
                        <div style={{ padding: '20px 40px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Intake #{currentItem.id}</h2>
                                        <div style={{
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800,
                                            background: intakeType === 'BUYER' ? '#f0fdf4' : '#eff6ff',
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
                                                    background: tag === 'URGENT' ? '#fecaca' : tag === 'DIRECT' ? '#dcfce7' : '#e0f2fe',
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
                                                key={idx}
                                                onClick={() => handleSwitchDeal(idx)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: activeDealIndex === idx ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                                                    background: activeDealIndex === idx ? '#fff' : '#f1f5f9',
                                                    color: activeDealIndex === idx ? '#1e293b' : '#64748b',
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

                            {/* Smart Structured ID Card */}
                            {duplicateStatus && (
                                <div className="animate-fade-in" style={{ marginBottom: '16px', padding: '12px 16px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', color: '#9a3412' }}>
                                    <div style={{ background: '#ffedd5', padding: '8px', borderRadius: '50%' }}>
                                        <i className="fas fa-exclamation-triangle" style={{ color: '#f97316' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Possible Duplicate Detected</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{duplicateStatus.message}</div>
                                    </div>
                                    <button style={{ padding: '6px 12px', background: '#fff', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', cursor: 'pointer' }}>
                                        View Existing
                                    </button>
                                </div>
                            )}

                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                {/* Header: Raw Text */}
                                <div style={{ padding: '12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <i className="fas fa-quote-left" style={{ color: '#cbd5e1', marginTop: '2px' }}></i>
                                    <div style={{ lineHeight: '1.6' }}>
                                        {(() => {
                                            try {
                                                // Show the RAW content of the CURRENT SEGMENT, not the full message if split?
                                                // Ideally yes, but currentItem.content is the full message.
                                                // We should show the specific raw text for this deal if available used 'raw' from parser.
                                                // If we use extractedReq.rawParsed.raw, that serves us better.
                                                let text = extractedReq?.rawParsed?.raw || currentItem?.content || "";
                                                if (!text) return null;

                                                // Enhanced Regex for Highlight
                                                const phoneRegex = /([6-9][0-9\s-]{8,12}[0-9])/g;
                                                // Safety check for split
                                                const parts = text.split(phoneRegex);
                                                return parts.map((part, i) => {
                                                    if (part && part.match(phoneRegex)) {
                                                        return <span key={i} style={{ background: '#fef08a', color: '#854d0e', padding: '0 4px', borderRadius: '4px', fontWeight: 700 }}>{part}</span>
                                                    }
                                                    return part;
                                                });
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
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <i className={`fas ${field.icon}`} style={{ fontSize: '0.6rem' }}></i> {field.label.toUpperCase()}
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                                                        {field.value || '-'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Remarks Section */}
                                        {extractedReq.remarks && (
                                            <div style={{ padding: '12px 16px', background: '#fffbeb', borderTop: '1px solid #fef3c7' }}>
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
                            <div style={{ padding: '10px 40px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => {
                                        // Use Detected Contacts from Parser instead of raw regex
                                        const phone = detectedContacts[0]?.mobile;
                                        if (phone) window.open(`https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}`, '_blank');
                                        else toast.error('No phone number found');
                                    }}
                                    style={{ padding: '6px 12px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <i className="fab fa-whatsapp"></i> Reply on WA
                                </button>
                                <button style={{ padding: '6px 12px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="far fa-copy"></i> Copy Text
                                </button>
                                <button style={{ padding: '6px 12px', background: '#fff', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
                                    <i className="far fa-trash-alt"></i> Spam
                                </button>
                            </div>
                        </div>

                        {/* WORKFLOW CONTENT */}
                        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>

                            {/* ================= SELLER FLOW ================= */}
                            {intakeType === 'SELLER' && (
                                <>
                                    {stage === 1 && (
                                        <div className="animate-fade-in">
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>1. Confirm Property Owner</h3>
                                            {detectedContacts.length === 0 ? (
                                                <div style={{ padding: '20px', background: '#fff1f2', color: '#be123c', borderRadius: '8px', border: '1px solid #fb7185', textAlign: 'center' }}>
                                                    No phone numbers detected. <button onClick={() => handleOpenAddContact()} style={{ border: 'none', background: 'none', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', color: '#be123c' }}>Add Manually</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                                    {detectedContacts.map((contact, idx) => (
                                                        <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', position: 'relative' }}>

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
                                                                    background: '#eff6ff', color: '#3b82f6', border: 'none',
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                }}
                                                                title="Verify via Call"
                                                            >
                                                                <i className="fas fa-phone-alt"></i>
                                                            </button>

                                                            <div style={{ fontWeight: 700 }}>{contact.name}</div>
                                                            <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {contact.mobile}
                                                                {contact.isNew && (
                                                                    <button
                                                                        onClick={() => handleOpenAddContact(contact.mobile)}
                                                                        style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer' }}
                                                                    >
                                                                        + Add to CRM
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* Role Selection */}
                                                            <div style={{ marginBottom: '12px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>

                                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>Align Contact As:</label>
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
                                                    {!isManualLinkOpen && <button onClick={() => setIsManualLinkOpen(true)} style={{ fontSize: '0.75rem', padding: '4px 8px', border: '1px solid #3b82f6', color: '#3b82f6', background: '#fff', borderRadius: '4px', cursor: 'pointer' }}>+ Link Manually</button>}
                                                </div>
                                            </div>

                                            {/* Manual Link Interface */}
                                            {isManualLinkOpen && (
                                                <div className="animate-fade-in" style={{ marginBottom: '16px', padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
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
                                                        <button onClick={() => setIsManualLinkOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><i className="fas fa-times"></i></button>
                                                    </div>

                                                    {manualSearchResults.length > 0 ? (
                                                        <div>
                                                            {manualSearchResults.map(res => (
                                                                <div key={res.id} onClick={() => { setSelectedInventory(res); setStage(3); setIsManualLinkOpen(false); }}
                                                                    style={{ padding: '8px', background: '#fff', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontWeight: 700 }}>Unit {res.unitNo}</span>
                                                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{res.location}</span>
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
                                                                background: selectedInventory?.id === match.inventory.id ? '#eff6ff' : '#fff',
                                                                border: selectedInventory?.id === match.inventory.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                                                borderRadius: '8px', padding: '12px', marginBottom: '8px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Unit {match.inventory.unitNo}</div>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{match.inventory.location} - Score: {match.score}</div>
                                                        </div>
                                                    ))}
                                                    {matchedInventory.length === 0 && !isManualLinkOpen && (
                                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '2px dashed #e2e8f0' }}>
                                                            No matches found. <button onClick={() => setIsManualLinkOpen(true)} style={{ color: '#3b82f6', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Link Manually</button>
                                                        </div>
                                                    )}
                                                </div>
                                                {selectedInventory && stage >= 3 && (
                                                    <div className="animate-fade-in" style={{ width: '400px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>Create Deal</h4>

                                                        {/* Auto-Linked Info */}
                                                        <div style={{ padding: '10px', background: '#f0fdf4', borderRadius: '6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{selectedInventory.unitNo}</div>
                                                            <div>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#14532d' }}>{selectedInventory.location}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Linked to: {selectedOwner?.name}</div>
                                                            </div>
                                                        </div>

                                                        {/* Form Fields matching AddDealModal */}
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Intent</label>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                {['Sell', 'Rent', 'Lease'].map(type => (
                                                                    <button key={type} onClick={() => setDealForm({ ...dealForm, intent: type })}
                                                                        style={{ flex: 1, padding: '6px', borderRadius: '4px', fontSize: '0.8rem', border: `1px solid ${dealForm.intent === type ? '#2563eb' : '#cbd5e1'}`, background: dealForm.intent === type ? '#eff6ff' : '#fff', color: dealForm.intent === type ? '#2563eb' : '#64748b', cursor: 'pointer' }}>
                                                                        {type}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Expected Price</label>
                                                                <input type="text" placeholder="e.g. 1.5 Cr" value={dealForm.price} onChange={e => setDealForm({ ...dealForm, price: e.target.value })}
                                                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }} />
                                                            </div>
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Status</label>
                                                                <select value={dealForm.status} onChange={e => setDealForm({ ...dealForm, status: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }}>
                                                                    <option value="Open">Open</option>
                                                                    <option value="Quote">Quote</option>
                                                                    <option value="Negotiation">Negotiation</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Remarks / Notes</label>
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
                                                                <div style={{ marginBottom: '10px', padding: '8px', background: '#f0fdf4', borderRadius: '6px', color: '#166534', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                                <div style={{ marginTop: '20px', padding: '20px', background: '#dcfce7', borderRadius: '8px', textAlign: 'center' }}>
                                                    <h3>Deal Created!</h3>
                                                    <p>Found {matchedBuyers.length} Potential Buyers</p>
                                                    {matchedBuyers.map((b, i) => <div key={i}>{b.name}</div>)}
                                                </div>
                                            )}
                                        </div>
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
                                                <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#475569', marginBottom: '15px' }}>1. Lead Classification</h3>

                                                    {detectedContacts.length > 0 ? (
                                                        <div style={{ padding: '15px', background: buyerContact?.isBroker ? '#FEF2F2' : (buyerContact?.isNew ? '#F0F9FF' : '#F0FDF4'), border: '1px solid', borderColor: buyerContact?.isBroker ? '#FECACA' : (buyerContact?.isNew ? '#BAE6FD' : '#BBF7D0'), borderRadius: '8px', marginBottom: '15px' }}>
                                                            {/* Header Row */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                <div>
                                                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                                                                        {buyerContact?.name || "Unknown"}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                                                        <span title="Deals" style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#0f172a', fontWeight: 600 }}><i className="fas fa-handshake" style={{ color: '#3b82f6', marginRight: '4px' }}></i> {buyerContact.stats.deals} Deals</span>
                                                                    )}
                                                                    {buyerContact.stats.inventory > 0 && (
                                                                        <span title="Inventory" style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#0f172a', fontWeight: 600 }}><i className="fas fa-building" style={{ color: '#8b5cf6', marginRight: '4px' }}></i> {buyerContact.stats.inventory} Unit</span>
                                                                    )}
                                                                    {buyerContact.stats.leads > 0 && (
                                                                        <span title="Leads" style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#0f172a', fontWeight: 600 }}><i className="fas fa-filter" style={{ color: '#f59e0b', marginRight: '4px' }}></i> {buyerContact.stats.leads} Leads</span>
                                                                    )}
                                                                    {buyerContact.stats.activities > 0 && (
                                                                        <span title="Activities" style={{ fontSize: '0.7rem', padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#0f172a', fontWeight: 600 }}><i className="fas fa-clock" style={{ color: '#64748b', marginRight: '4px' }}></i> {buyerContact.stats.activities} Actv.</span>
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
                                                        <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: '15px' }}>No contact detected. Treated as Walk-in/Unknown.</div>
                                                    )}

                                                    <div style={{ marginBottom: '10px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isTemporaryLead}
                                                                onChange={(e) => setIsTemporaryLead(e.target.checked)}
                                                            />
                                                            <span style={{ fontWeight: 600, color: '#334155' }}>Mark as Temporary Lead (15-Day Expiry)</span>
                                                        </label>
                                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '24px', marginTop: '2px' }}>
                                                            {isTemporaryLead ? 'This lead will expire automatically in 15 days.' : 'This lead will follow the standard long-term lifecycle.'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right: Requirements */}
                                                <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                                                    <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#475569', marginBottom: '15px' }}>2. Requirement Parsing</h3>
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
                                                <button className="btn-outline" onClick={() => setStage(1)} style={{ fontSize: '0.8rem', background: '#fff' }}>Edit</button>
                                            </div>

                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>
                                                3. Matching Active Deals ({matchedDeals.length})
                                            </h3>

                                            {matchedDeals.length === 0 ? (
                                                <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: '8px', color: '#64748b' }}>
                                                    No active deals match these requirements currently.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '16px' }}>
                                                    {matchedDeals.map((match, idx) => (
                                                        <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{match.deal.title}</div>
                                                                    <div style={{ padding: '2px 8px', background: '#e2e8f0', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{match.deal.status}</div>
                                                                    <div style={{ padding: '2px 8px', background: '#FEF3C7', color: '#B45309', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{match.deal.price}</div>
                                                                </div>
                                                                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>{match.deal.location} | {match.deal.type}</div>
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
                                                        setIntakeItems(prev => prev.filter(i => i.id !== currentItem.id));
                                                        setStage(0);
                                                        setCurrentItem(null);
                                                        toast.success("Buyer Intake Completed");
                                                    }}
                                                    style={{ padding: '12px 30px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
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
                        <div style={{ background: '#fff', width: '500px', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                            <h3 style={{ marginTop: 0, fontSize: '1.2rem', fontWeight: 800 }}>Add New Intake</h3>

                            {/* Campaign Details Fields */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Campaign Source</label>
                                <select
                                    value={campaignSource}
                                    onChange={e => setCampaignSource(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
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

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Campaign Date</label>
                                <input
                                    type="date"
                                    value={campaignDate}
                                    onChange={e => setCampaignDate(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Content Input</label>

                                {/* Paste/Import Toggle */}
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                    <button
                                        onClick={() => setContentInputMode('paste')}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: contentInputMode === 'paste' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                            background: contentInputMode === 'paste' ? '#eff6ff' : '#fff',
                                            fontWeight: 600,
                                            color: contentInputMode === 'paste' ? '#1e40af' : '#64748b',
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
                                            background: contentInputMode === 'import' ? '#f0fdf4' : '#fff',
                                            fontWeight: 600,
                                            color: contentInputMode === 'import' ? '#15803d' : '#64748b',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <i className="fas fa-file-import"></i> Import File
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
                                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                                            <strong>Tip:</strong> Use keywords like "Need", "Buy" for Buyer Detection.
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center', background: '#f8fafc' }}>
                                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '12px' }}></i>
                                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '12px' }}>
                                            Upload WhatsApp Export (.zip), Tribune Ad (.pdf), or Images
                                        </p>
                                        {selectedFile && (
                                            <div style={{ marginBottom: '12px' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
                                                    <i className="fas fa-file" style={{ color: '#3b82f6' }}></i>
                                                    <span style={{ color: '#1e40af', fontWeight: 600, fontSize: '0.85rem' }}>{selectedFile.name}</span>
                                                    <button
                                                        onClick={() => setSelectedFile(null)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 4px' }}
                                                        title="Remove file"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <label style={{ display: 'inline-block', padding: '10px 20px', background: '#3b82f6', color: '#fff', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                                            {selectedFile ? 'Change File' : 'Choose File'}
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
                                        setCampaignDate('');
                                        setNewSourceContent('');
                                        setContentInputMode('paste');
                                    }}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={contentInputMode === 'paste' ? handleAddIntake : handleFileImport}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <i className={contentInputMode === 'paste' ? 'fas fa-plus' : 'fas fa-file-import'}></i> Add Intake
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
                        <div style={{ background: '#fff', width: '450px', borderRadius: '16px', padding: '30px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center' }}>
                            <div style={{ width: '60px', height: '60px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <i className="fas fa-cloud-upload-alt" style={{ fontSize: '1.5rem', color: '#3b82f6' }}></i>
                            </div>
                            <h3 style={{ marginTop: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Import Data</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px' }}>
                                Upload <strong>WhatsApp Export (.zip)</strong> or <br /> <strong>Tribune Advertisement (.pdf)</strong>
                            </p>

                            {!selectedFile ? (
                                <label style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '12px', cursor: 'pointer',
                                    background: '#fff', transition: 'all 0.2s'
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
                                <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                        <i className="fas fa-file-alt" style={{ fontSize: '1.5rem', color: '#64748b' }}></i>
                                        <div style={{ textAlign: 'left', flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{selectedFile.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{(selectedFile.size / 1024).toFixed(1)} KB</div>
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

                            <button onClick={() => { setIsImportModalOpen(false); setSelectedFile(null); }} style={{ marginTop: '16px', background: 'transparent', border: 'none', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
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
