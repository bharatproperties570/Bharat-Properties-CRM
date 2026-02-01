import React, { useState, useEffect, useMemo } from 'react';
import { inventoryData, contactData, leadData, dealData } from '../../../data/mockData';
import { dealIntakeData } from '../../../data/dealIntakeData';
import { parseWhatsAppZip, parseTribunePdf } from '../../../utils/importParsers';
import { parseDealContent } from '../../../utils/dealParser';
import toast from 'react-hot-toast';
import { useTriggers } from '../../../context/TriggersContext';
import { useDistribution } from '../../../context/DistributionContext';

const DealIntakePage = () => {
    // Shared State
    const [intakeItems, setIntakeItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(null);
    const [intakeType, setIntakeType] = useState('SELLER'); // 'SELLER' | 'BUYER'
    const [stage, setStage] = useState(0); // 0=Source, 1=Classification, 2=Match, 3=Action, 4=Result

    // New Intake State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null); // New state for 2-step import
    const [newSourceContent, setNewSourceContent] = useState('');
    const [newSourceType, setNewSourceType] = useState('WhatsApp');

    // ... (existing code) ...

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

    // BUYER Flow State
    const [buyerContact, setBuyerContact] = useState(null);
    const [isTemporaryLead, setIsTemporaryLead] = useState(false);
    const [extractedReq, setExtractedReq] = useState({ type: '', location: '', budget: '', size: '' });
    const [leadId, setLeadId] = useState(null);
    const [matchedDeals, setMatchedDeals] = useState([]);

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

    const parseContacts = (text) => {
        const phoneRegex = /[6-9]\d{9}/g;
        const phones = [...new Set(text.match(phoneRegex) || [])]; // Deduplicate

        return phones.map(phone => {
            const existing = contactData.find(c => c.mobile.includes(phone) || (c.phones && c.phones.some(p => p.number.includes(phone))));
            // Check if BROKER
            const isBroker = existing && (existing.category === 'Broker' || existing.role === 'Broker' || existing.professionSubCategory === 'Real Estate Agent');

            const stats = getContactUsageStats(phone, existing?.name);

            return {
                mobile: phone,
                name: existing ? existing.name : 'Unknown',
                role: existing ? existing.category || 'Contact' : 'New Contact',
                id: existing ? existing.id : null,
                isNew: !existing,
                isBroker: isBroker,
                stats: stats
            };
        });
    };

    // --- LEGACY HELPERS REMOVED (Replaced by dealParser.js) ---

    const handleSelectIntake = (item) => {
        setCurrentItem(item);

        // Use World-Class Parser
        const parsedData = parseDealContent(item.content);

        setDetectedContacts(parsedData.allContacts);
        setIntakeType(parsedData.intent);

        // Reset States
        setStage(1);
        setSelectedOwner(null);
        setSelectedInventory(null);
        setMatchedInventory([]);
        setMatchedDeals([]);
        setBuyerContact(null);
        setIsTemporaryLead(false);
        setLeadId(null);

        // Store Full Parsed Data
        // We map the new parser structure to the component's expected state
        setExtractedReq({
            type: parsedData.type,
            location: parsedData.location,
            budget: parsedData.specs.price,
            size: parsedData.specs.size,
            // Store extra references
            unit: parsedData.address.unitNumber,
            category: parsedData.category,
            rawParsed: parsedData
        });

        // Auto Select Contact if only one found & Valid Intent
        if (parsedData.allContacts.length > 0) {
            const contact = parsedData.allContacts[0];
            if (parsedData.intent === 'BUYER') {
                setBuyerContact(contact);
                setIsTemporaryLead(contact.role === 'Broker');
            }
        }
    };

    const handleAddIntake = () => {
        if (!newSourceContent.trim()) return;
        const newItem = {
            id: Date.now(),
            source: newSourceType,
            content: newSourceContent,
            receivedAt: new Date().toISOString(),
            status: 'Raw Received'
        };
        setIntakeItems([newItem, ...intakeItems]);
        setNewSourceContent('');
        setIsAddModalOpen(false);
        toast.success('New Intake Added');
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
            } else {
                throw new Error('Unsupported format. Please upload .zip (WhatsApp) or .pdf (Tribune).');
            }

            if (parsedItems.length === 0) {
                toast.error('No valid messages found', { id: toastId });
            } else {
                setIntakeItems(prev => [...parsedItems, ...prev]);
                toast.success(`Imported ${parsedItems.length} items!`, { id: toastId });
                setIsImportModalOpen(false);
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
        // detailedReq contains: unit, location (sector/project), city, type, size
        const parsed = extractedReq.rawParsed || {};
        const pAddr = parsed.address || {};
        const pSpecs = parsed.specs || {};

        if (!pAddr.unitNumber && !pAddr.sector && !owner) {
            setMatchedInventory([]);
            return;
        }

        let matches = inventoryData.map(inv => {
            let score = 0;
            let reasons = [];

            // A. Identity Match (Unit No included)
            if (pAddr.unitNumber && inv.unitNo && inv.unitNo.toLowerCase() === pAddr.unitNumber.toLowerCase()) {
                score += 50;
                reasons.push('Unit Match');
            } else if (pAddr.unitNumber && inv.unitNo && inv.unitNo.toLowerCase().includes(pAddr.unitNumber.toLowerCase())) {
                score += 30;
                reasons.push('Unit Partial');
            }

            // B. Project/Location Match (Crucial)
            // inv.area usually contains "Sector 66", "Mohali", etc.
            if (pAddr.sector && inv.area && inv.area.toLowerCase().includes(pAddr.sector.toLowerCase())) {
                score += 30;
                reasons.push('Location/Project Match');
            }
            if (pAddr.city && inv.area && inv.area.toLowerCase().includes(pAddr.city.toLowerCase())) {
                score += 10;
                reasons.push('City Match');
            }

            // C. Block Match
            // inv.location usually contains "A Block", "First Block"
            // We search for block patterns in the raw text if not explicitly parsed, or checks parsed text
            // For now, assuming inv.location is Block
            if (text.toLowerCase().includes(inv.location.toLowerCase())) {
                score += 20;
                reasons.push('Block Match');
            }

            // D. Owner Match (Verification)
            if (owner && inv.ownerName && owner.name && inv.ownerName.toLowerCase().includes(owner.name.toLowerCase())) {
                score += 40;
                reasons.push('Owner Match');
            }

            // E. Type/Category Helper
            if (parsed.type && inv.type && inv.type.toLowerCase().includes(parsed.type.toLowerCase())) {
                score += 10;
            }
            // F. Size Helper
            if (pSpecs.size && inv.size && inv.size.toLowerCase().includes(pSpecs.size.toLowerCase())) {
                score += 10;
            }

            return { inventory: inv, score: Math.min(score, 100), reasons };
        });

        // Filter and Sort
        // Strict Threshold: Must have at least some relevance
        matches = matches.filter(m => m.score > 20).sort((a, b) => b.score - a.score);
        setMatchedInventory(matches.slice(0, 5));
    };

    // New State for Quick Create
    const [quickAddForm, setQuickAddForm] = useState({
        city: '',
        project: '',
        block: '',
        unitNo: '',
        type: 'Residential',
        size: ''
    });

    const handleQuickAddInventory = () => {
        const newInv = {
            id: Date.now(),
            unitNo: quickAddForm.unitNo,
            location: quickAddForm.block, // Mapping Block to 'location' in mock schema
            area: `${quickAddForm.project} ${quickAddForm.city}`, // Mapping Project+City to 'area'
            type: quickAddForm.type,
            size: quickAddForm.size,
            status: 'Active',
            ownerName: selectedOwner?.name || 'Unknown',
            ownerPhone: selectedOwner?.mobile || '',
        };

        // In a real app, this would be an API call
        // inventoryData.push(newInv); // Pushing to mock (if mutable) or just selecting it

        setSelectedInventory(newInv);
        setStage(3);
        setIsManualLinkOpen(false);
        toast.success(`New Unit Created: ${newInv.unitNo} @ ${quickAddForm.project}`);
    };

    // Pre-fill Quick Form when opening manual link
    useEffect(() => {
        if (isManualLinkOpen && extractedReq.rawParsed) {
            setQuickAddForm({
                city: extractedReq.rawParsed.address.city || '',
                project: extractedReq.rawParsed.address.sector || '',
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
                        <button onClick={() => setIsImportModalOpen(true)} title="Import File" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-file-import" style={{ color: '#16a34a' }}></i>
                        </button>
                        <button onClick={() => setIsAddModalOpen(true)} title="Add Manually" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-plus" style={{ color: '#64748b' }}></i>
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {intakeItems.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>queue is empty</div>}
                    {intakeItems.map(item => (
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
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: item.source === 'WhatsApp' ? '#22c55e' : '#f59e0b', background: item.source === 'WhatsApp' ? '#dcfce7' : '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>{item.source}</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {item.content}
                            </div>
                        </div>
                    ))}
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
                                </div>
                            </div>

                            {/* Smart Structured ID Card */}
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                {/* Header: Raw Text */}
                                <div style={{ padding: '12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <i className="fas fa-quote-left" style={{ color: '#cbd5e1', marginTop: '2px' }}></i>
                                    <div style={{ lineHeight: '1.6' }}>
                                        {(() => {
                                            let text = currentItem.content;
                                            const phoneRegex = /[6-9]\d{9}/g;
                                            const parts = text.split(/([6-9]\d{9})/g);
                                            return parts.map((part, i) => {
                                                if (part.match(phoneRegex)) {
                                                    return <span key={i} style={{ background: '#fef08a', color: '#854d0e', padding: '0 4px', borderRadius: '4px', fontWeight: 700 }}>{part}</span>
                                                }
                                                return part;
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* Body: Parsed Fields Grid */}
                                {extractedReq.rawParsed && (
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
                                )}
                            </div>

                            {/* Pro Actions Bar */}
                            <div style={{ padding: '10px 40px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => {
                                        const phones = currentItem.content.match(/[6-9]\d{9}/g);
                                        if (phones && phones[0]) window.open(`https://wa.me/91${phones[0]}`, '_blank');
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
                                                    No phone numbers detected. <button style={{ border: 'none', background: 'none', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer' }}>Add Manually</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                                    {detectedContacts.map((contact, idx) => (
                                                        <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                                            <div style={{ fontWeight: 700 }}>{contact.name}</div>
                                                            <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '12px' }}>{contact.mobile}</div>

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

                                                            <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#475569' }}><i className="fas fa-plus-circle"></i> Quick Add Unit</h4>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>City</label>
                                                                        <input type="text" value={quickAddForm.city} onChange={e => setQuickAddForm({ ...quickAddForm, city: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} placeholder="e.g. Mohali" />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Project Name</label>
                                                                        <input type="text" value={quickAddForm.project} onChange={e => setQuickAddForm({ ...quickAddForm, project: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} placeholder="e.g. IT City" />
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Block</label>
                                                                        <input type="text" value={quickAddForm.block} onChange={e => setQuickAddForm({ ...quickAddForm, block: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} placeholder="e.g. A" />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Unit No (Crucial)</label>
                                                                        <input type="text" value={quickAddForm.unitNo} onChange={e => setQuickAddForm({ ...quickAddForm, unitNo: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} placeholder="e.g. 104" />
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Type</label>
                                                                        <select value={quickAddForm.type} onChange={e => setQuickAddForm({ ...quickAddForm, type: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}>
                                                                            <option value="Residential">Residential</option>
                                                                            <option value="Commercial">Commercial</option>
                                                                            <option value="Industrial">Industrial</option>
                                                                            <option value="Agricultural">Agricultural</option>
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Size w/ Unit</label>
                                                                        <input type="text" value={quickAddForm.size} onChange={e => setQuickAddForm({ ...quickAddForm, size: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} placeholder="e.g. 1 Kanal" />
                                                                    </div>
                                                                </div>

                                                                <button onClick={handleQuickAddInventory} style={{ width: '100%', background: '#3b82f6', color: '#fff', padding: '8px', borderRadius: '6px', border: 'none', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}>
                                                                    Create & Ensure Match
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
                                                            <button onClick={handleCreateDeal} style={{ width: '100%', background: '#2563eb', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}>
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
            {isAddModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: '#fff', width: '500px', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.2rem', fontWeight: 800 }}>Add New Intake</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Source</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => setNewSourceType('WhatsApp')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: newSourceType === 'WhatsApp' ? '2px solid #22c55e' : '1px solid #e2e8f0', background: newSourceType === 'WhatsApp' ? '#dcfce7' : '#fff', fontWeight: 600, color: newSourceType === 'WhatsApp' ? '#14532d' : '#64748b', cursor: 'pointer' }}>WhatsApp</button>
                                <button onClick={() => setNewSourceType('Tribune')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: newSourceType === 'Tribune' ? '2px solid #f59e0b' : '1px solid #e2e8f0', background: newSourceType === 'Tribune' ? '#fef3c7' : '#fff', fontWeight: 600, color: newSourceType === 'Tribune' ? '#78350f' : '#64748b', cursor: 'pointer' }}>Tribune / PDF</button>
                            </div>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Content / Paste Text</label>
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
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleAddIntake} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add to Queue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {isImportModalOpen && (
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
            )}
        </div>
    );
};

export default DealIntakePage;
