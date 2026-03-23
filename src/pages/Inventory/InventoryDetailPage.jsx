import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from "../../utils/api";
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { renderValue } from '../../utils/renderUtils';
import AddInventoryDocumentModal from '../../components/AddInventoryDocumentModal';
import UploadModal from '../../components/UploadModal';
import AddOwnerModal from '../../components/AddOwnerModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import SendMessageModal from '../../components/SendMessageModal';
import InventoryFeedbackModal from '../../components/InventoryFeedbackModal';
import UnifiedActivitySection from '../../components/Activities/UnifiedActivitySection';
import ManageTagsModal from '../../components/ManageTagsModal';
import ProfessionalMap from '../../components/ProfessionalMap';
import { getInitials } from '../../utils/helpers';


export default function InventoryDetailPage({ inventoryId, onBack, onNavigate, onAddActivity, onAddDeal, onEditInventory }) {
    const { masterFields, getLookupValue, lookups } = usePropertyConfig();
    const { fireEvent } = useTriggers();
    const { startCall } = useCall();

    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('full-details');
    const [deals, setDeals] = useState([]);
    const [matchingLeads, setMatchingLeads] = useState([]);
    const [activeLeadsCount, setActiveLeadsCount] = useState(0);
    const [showDealDropdown, setShowDealDropdown] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [similarProperties, setSimilarProperties] = useState([]);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [modalData, setModalData] = useState([]);
    const [contactPicker, setContactPicker] = useState({ isOpen: false, type: 'call', contacts: [] });
    const [mediaViewer, setMediaViewer] = useState({ isOpen: false, data: null });

    const handleContactClick = (type) => {
        const contactOptions = [];

        // Add Owners
        if (inventory?.owners && inventory.owners.length > 0) {
            inventory.owners.forEach(owner => {
                const phone = owner.phones?.[0]?.number || owner.phone;
                if (phone) {
                    contactOptions.push({
                        id: owner._id || owner.id,
                        name: owner.name,
                        phone: phone,
                        role: 'Owner',
                        relationship: ''
                    });
                }
            });
        } else if (inventory?.ownerPhone) {
            contactOptions.push({
                name: inventory.ownerName || 'Owner',
                phone: inventory.ownerPhone,
                role: 'Owner',
                relationship: ''
            });
        }

        // Add Associates
        if (inventory?.associates && inventory.associates.length > 0) {
            inventory.associates.forEach(assoc => {
                const contact = assoc.contact || assoc;
                const phone = contact.phones?.[0]?.number || contact.phone;
                if (phone) {
                    contactOptions.push({
                        id: contact._id || contact.id,
                        name: contact.name,
                        phone: phone,
                        role: 'Associate',
                        relationship: assoc.relationship || ''
                    });
                }
            });
        } else if (inventory?.associatedPhone) {
            contactOptions.push({
                name: inventory.associatedContact || 'Associate',
                phone: inventory.associatedPhone,
                role: 'Associate',
                relationship: ''
            });
        }

        if (contactOptions.length === 0) {
            toast.error("No contact information available");
            return;
        }

        if (contactOptions.length === 1) {
            const contact = contactOptions[0];
            if (type === 'call') {
                startCall(contact.phone, contact.name);
            } else {
                const cleanPhone = contact.phone.replace(/\D/g, '');
                window.open(`https://wa.me/${cleanPhone}`, '_blank');
            }
        } else {
            setContactPicker({ isOpen: true, type, contacts: contactOptions });
        }
    };

    // Professional Fix: Strict Lookup Resolution to prevent leakage between UnitType and Size
    const getStrictLookupValue = useCallback((type, id) => {
        if (!id) return null;

        // Handle fully populated objects (e.g. from backend response with population)
        if (typeof id === 'object') {
            const val = id.lookup_value || id.name || id.label || id.value || id;
            // Check if object's type matches requested type (if type info is available in object)
            if (id.lookup_type && id.lookup_type.replace(/\s+/g, '') !== type.replace(/\s+/g, '')) {
                return null; // Mismatch
            }
            return val;
        }

        const normalizedType = type ? type.replace(/\s+/g, '') : type;
        if (lookups && lookups[normalizedType]) {
            const found = lookups[normalizedType].find(l =>
                l._id === id ||
                l.id === id ||
                (typeof id === 'string' && l.lookup_value === id)
            );
            if (found) return found.lookup_value;
        }

        // Final fallback: if id is a string but not an ObjectId, it might be the value itself 
        // but only if it doesn't look like an ID
        if (typeof id === 'string' && !id.match(/^[0-9a-fA-F]{24}$/)) {
            return id;
        }

        return null;
    }, [lookups]);

    const fetchInventoryDetails = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Inventory
            const invResponse = await api.get(`inventory/${inventoryId}`);
            if (invResponse.data && invResponse.data.success) {
                const inv = invResponse.data.data;
                setInventory(inv);

                // 2. Use deals from inventory response
                if (inv.deals) {
                    setDeals(inv.deals);
                }

                // 3. Fetch Matching Leads
                const matchResponse = await api.get(`inventory/match?inventoryId=${inventoryId}`);
                if (matchResponse.data && matchResponse.data.success) {
                    setMatchingLeads(matchResponse.data.data || []);
                    setActiveLeadsCount(matchResponse.data.count || 0);
                }

                // 4. Fetch Similar Properties (Same project)
                const projectParam = inv.projectId?._id || inv.projectId || inv.projectName;
                if (projectParam) {
                    const similarResponse = await api.get(`inventory?project=${projectParam}&limit=10`);
                    if (similarResponse.data && similarResponse.data.success) {
                        const filtered = (similarResponse.data.records || []).filter(p => p._id !== inventoryId);
                        setSimilarProperties(filtered);
                    }
                }
            } else {
                toast.error("Failed to load inventory details");
            }
        } catch (error) {
            console.error("Error fetching inventory details:", error);
            toast.error("Error loading inventory details");
        } finally {
            setLoading(false);
        }
    }, [inventoryId]);

    // Activities now handled by UnifiedActivitySection

    useEffect(() => {
        if (inventoryId) {
            fetchInventoryDetails();
        }

        // Professional Fix: Listen for global update events to auto-refresh data
        const handleRefresh = () => {
            console.log("[InventoryDetailPage] Auto-refreshing details...");
            fetchInventoryDetails();
        };

        window.addEventListener('inventory-updated', handleRefresh);
        window.addEventListener('deal-updated', handleRefresh);

        return () => {
            window.removeEventListener('inventory-updated', handleRefresh);
            window.removeEventListener('deal-updated', handleRefresh);
        };
    }, [inventoryId, fetchInventoryDetails]);

    const handleWhatsAppShare = () => {
        if (!inventory) return;
        const text = `*Property Listing:* ${inventory.unitNo}\n*Project:* ${inventory.projectName}\n*Block:* ${inventory.block}\n*Type:* ${inventory.category} (${inventory.subCategory})\n*Size:* ${inventory.size?.value || inventory.size} ${inventory.sizeUnit}\n*Locality:* ${inventory.address?.locality || inventory.address?.area}\n*Price:* ${inventory.price?.value || inventory.price || 'Ask for Price'}\n\nInterested? Let me know!`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleCopyDetails = () => {
        if (!inventory) return;
        const text = `Property: ${inventory.unitNo} | Project: ${inventory.projectName} | Block: ${inventory.block} | Type: ${inventory.category} | Size: ${inventory.size?.value || inventory.size} ${inventory.sizeUnit} | Locality: ${inventory.address?.locality || inventory.address?.area}`;
        navigator.clipboard.writeText(text);
        setIsCopying(true);
        toast.success("Listing details copied to clipboard!");
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleCreateDeal = (type) => {
        if (!inventory) return;

        // BUG FIX: Ensure intent matches deal discovery logic
        const intentValue = type === 'Lease' ? 'Lease' : (type === 'Rent' ? 'Rent' : 'Sell');

        // Pass full inventory context for inheritance
        onAddDeal({
            ...inventory, // Spread original inventory to capture all nested details
            inventoryId: inventory._id,
            intent: intentValue,
            owner: inventory.owners?.[0] || {
                name: inventory.ownerName,
                phone: inventory.ownerPhone,
                email: inventory.ownerEmail
            },
            associatedContact: inventory.associates?.[0]?.contact || inventory.associatedContact
        });
    };

    const handleToggleIntent = async (type) => {
        if (!inventory) return;

        try {
            const currentIntents = Array.isArray(inventory.intent)
                ? inventory.intent.map(i => (i && typeof i === 'object' ? i.lookup_value : i))
                : [inventory.intent && typeof inventory.intent === 'object' ? inventory.intent.lookup_value : inventory.intent].filter(Boolean);

            let newIntents;
            if (currentIntents.includes(type)) {
                // If it's the only one, don't allow removing it? Or allow it? 
                // Usually at least one intent should be there, but let's allow removal for flexibility
                newIntents = currentIntents.filter(i => i !== type);
            } else {
                newIntents = [...currentIntents, type];
            }

            const response = await api.put(`inventory/${inventoryId}`, { intent: newIntents });
            if (response.data && response.data.success) {
                setInventory(response.data.data);
                toast.success(`${type} transaction type ${currentIntents.includes(type) ? 'disabled' : 'enabled'}`);
                window.dispatchEvent(new CustomEvent('inventory-updated'));
            }
        } catch (error) {
            console.error("Error toggling intent:", error);
            toast.error("Failed to update transaction type");
        }
    };

    const updateInventoryField = async (fieldName, value) => {
        if (!inventory) return;
        try {
            const response = await api.put(`inventory/${inventoryId}`, { [fieldName]: value });
            if (response.data && response.data.success) {
                setInventory(response.data.data);
                toast.success('Inventory updated');
                window.dispatchEvent(new CustomEvent('inventory-updated'));
            }
        } catch (error) {
            console.error(`Error updating ${fieldName}:`, error);
            toast.error('Update failed');
        }
    };

    const getTargetContacts = () => {
        const targets = [];
        if (inventory) {
            if (inventory.ownerName) targets.push({ name: inventory.ownerName, mobile: inventory.ownerPhone, email: inventory.ownerEmail || 'owner@example.com' });
            if (inventory.associatedContact) targets.push({ name: inventory.associatedContact, mobile: inventory.associatedPhone, email: inventory.associatedEmail || 'associate@example.com' });

            // Also check owners array if it exists
            if (inventory.owners && inventory.owners.length > 0) {
                inventory.owners.forEach(o => {
                    const mobile = o.phones?.[0]?.number || o.mobile || '';
                    if (o.name && !targets.find(t => t.mobile === mobile)) {
                        targets.push({ name: o.name, mobile: mobile, email: o.emails?.[0]?.address || o.email || 'owner@example.com' });
                    }
                });
            }
            // Check associates array
            if (inventory.associates && inventory.associates.length > 0) {
                inventory.associates.forEach(a => {
                    const mobile = a.phones?.[0]?.number || a.mobile || '';
                    if (a.name && !targets.find(t => t.mobile === mobile)) {
                        targets.push({ name: a.name, mobile: mobile, email: a.emails?.[0]?.address || a.email || 'associate@example.com' });
                    }
                });
            }
        }
        return targets;
    };

    const handleEmailClick = () => {
        const targets = getTargetContacts();
        if (targets.length > 0) {
            setModalData(targets);
            setIsEmailModalOpen(true);
        } else {
            toast.error("No contact information available for this property");
        }
    };

    const handleMessageClick = () => {
        const targets = getTargetContacts().map(t => ({ name: t.name, phone: t.mobile }));
        if (targets.length > 0) {
            setModalData(targets);
            setIsMessageModalOpen(true);
        } else {
            toast.error("No contact information available for this property");
        }
    };

    const handleFeedbackClick = () => {
        setIsFeedbackModalOpen(true);
    };

    const handleSaveFeedback = async (data) => {
        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            let newRemark = `${data.result}`;
            if (data.reason) newRemark += ` (${data.reason})`;
            if (data.feedback) newRemark += `: ${data.feedback}`;
            if (data.nextActionDate) {
                newRemark += ` | Next: ${data.nextActionType} on ${data.nextActionDate} @ ${data.nextActionTime}`;
            }

            // Automation: Mark as Sold/Rented/Inactive (Driven by Business Rules)
            let newStatus = inventory.status;

            // Get business rule from context if it exists
            const rule = masterFields.feedbackRules?.[data.result]?.[data.reason];
            if (rule?.inventoryStatus === 'InActive' && data.markAsSold) {
                // Determine internal status name based on reason
                if (String(data.reason).includes('Sold Out')) newStatus = 'Sold Out';
                else if (String(data.reason).includes('Rented Out')) newStatus = 'Rented Out';
                else newStatus = 'Inactive';
                newStatus = 'Available';
            } else if (['Interested / Warm', 'Interested / Hot', 'Interested', 'Request Call Back'].includes(data.result)) {
                // Professional Fix: Explicitly reset to 'Available' for positive interest outcomes
                newStatus = 'Available';
            }

            const newInteraction = {
                id: Date.now(),
                date: dateStr,
                time: timeStr,
                user: 'You',
                action: data.nextActionType || 'Call',
                result: data.result,
                reason: data.reason,
                note: newRemark
            };

            const currentHistory = inventory.history || [];

            const updates = {
                lastContactDate: dateStr,
                lastContactTime: timeStr,
                lastContactUser: 'You',
                remarks: newRemark,
                status: newStatus,
                history: [newInteraction, ...currentHistory]
            };

            // Automation: If status is set to Available (Active), ensure all transaction types are enabled
            if (newStatus === 'Available') {
                updates.intent = ['Sell', 'Rent', 'Lease'];
            }

            const response = await api.put(`inventory/${inventoryId}`, updates);

            if (response.data && response.data.success) {
                toast.success("Feedback recorded successfully");
                fetchInventoryDetails();
            } else {
                toast.error("Failed to save feedback");
            }
        } catch (error) {
            console.error("Error saving feedback:", error);
            toast.error("Error saving feedback");
        }
    };


    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div className="loader"></div>
            </div>
        );
    }

    if (!inventory) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Inventory not found</h2>
                <button className="primary-btn" onClick={onBack}>Go Back</button>
            </div>
        );
    }

    const statusColors = {
        'Active': { bg: '#dcfce7', text: '#166534', dot: '#22c55e' },
        'Draft': { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
        'On Hold': { bg: '#fef9c3', text: '#854d0e', dot: '#eab308' },
        'Blocked': { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
        'Inactive': { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
        'Sold Out': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
        'Rented Out': { bg: '#e0e7ff', text: '#3730a3', dot: '#6366f1' }
    };

    const currentStatus = getLookupValue('Status', inventory.status) || 'Active';
    const statusStyle = statusColors[currentStatus] || statusColors['Active'];

    const glassCardStyle = {
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(226, 232, 240, 0.5)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        padding: '20px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
    };

    return (
        <div className="inventory-detail-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '40px' }}>
            {/* STICKY HEADER */}
            <header className="detail-sticky-header" style={{
                position: 'sticky', top: 0, zIndex: 100,
                background: 'linear-gradient(90deg, #fff 0%, #f1f5f9 100%)',
                borderBottom: '1px solid #e2e8f0',
                padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                backdropFilter: 'blur(8px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: '1px solid #e2e8f0',
                        borderRadius: '8px', width: '36px', height: '36px',
                        cursor: 'pointer', color: '#64748b'
                    }}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                {renderValue(inventory.unitNo)}
                                ({renderValue(getLookupValue('UnitType', inventory.unitType))})
                            </h2>
                            {(() => {
                                const activeStatusNames = ['Available', 'Active', 'Interested / Warm', 'Interested / Hot', 'Request Call Back', 'Busy / Driving', 'Market Feedback', 'General Inquiry', 'Blocked', 'Booked', 'Interested'];
                                const rawStatus = getLookupValue('Status', inventory.status) || 'Available';
                                const isActive = activeStatusNames.includes(rawStatus) || !rawStatus || rawStatus === '-';
                                const statusLabel = isActive ? 'Active' : 'Inactive';
                                const statusColor = isActive ? '#10b981' : (rawStatus === 'Sold Out' || rawStatus === 'Rented Out') ? '#f59e0b' : '#64748b';
                                const bgColor = isActive ? '#ecfdf5' : (rawStatus === 'Sold Out' || rawStatus === 'Rented Out') ? '#fffbeb' : '#f1f5f9';

                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            backgroundColor: bgColor,
                                            color: statusColor,
                                            padding: '4px 10px', borderRadius: '20px',
                                            fontSize: '0.7rem', fontWeight: 800,
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            textTransform: 'uppercase', letterSpacing: '0.03em',
                                            border: `1px solid ${statusColor}33`
                                        }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }}></span>
                                            {statusLabel}
                                        </span>
                                        {rawStatus !== statusLabel && rawStatus !== 'Available' && (
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                {rawStatus}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                            {renderValue(inventory.projectName)} • {renderValue(inventory.block)}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                    {/* Communication Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            onClick={() => {
                                const targets = getTargetContacts();
                                if (targets.length > 0) {
                                    startCall({
                                        name: targets[0].name || 'Unknown Owner',
                                        mobile: targets[0].mobile
                                    }, {
                                        purpose: 'Owner Update',
                                        entityId: inventory._id,
                                        entityType: 'inventory'
                                    });
                                } else {
                                    toast.error("No contact information available");
                                }
                            }}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            className="hover:bg-slate-50 transition-all"
                        >
                            <i className="fas fa-phone-alt" style={{ color: '#10b981' }}></i> Call
                        </button>
                        <button
                            onClick={handleMessageClick}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            className="hover:bg-slate-50 transition-all"
                        >
                            <i className="fas fa-comment-dots" style={{ color: '#3b82f6' }}></i> SMS
                        </button>
                        <button
                            onClick={handleEmailClick}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            className="hover:bg-slate-50 transition-all"
                        >
                            <i className="fas fa-envelope" style={{ color: '#f59e0b' }}></i> Email
                        </button>
                    </div>

                    {/* Three-Dot More Menu */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                            className="hover:bg-slate-50 transition-all"
                        >
                            <i className="fas fa-ellipsis-v"></i>
                        </button>

                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '200px',
                                padding: '8px 0', overflow: 'hidden'
                            }}>
                                <button
                                    onClick={() => { onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }], { inventory }); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fas fa-calendar-plus" style={{ color: '#ec4899', width: '16px' }}></i> Create Activity
                                </button>
                                <button
                                    onClick={() => { setIsDocumentModalOpen(true); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fas fa-file-alt" style={{ color: '#64748b', width: '16px' }}></i> Document
                                </button>
                                <button
                                    onClick={() => { setIsUploadModalOpen(true); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fas fa-cloud-upload-alt" style={{ color: '#f59e0b', width: '16px' }}></i> Upload
                                </button>
                                <button
                                    onClick={() => { handleFeedbackClick(); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fas fa-comment-dots" style={{ color: '#f59e0b', width: '16px' }}></i> Feedback
                                </button>
                                <button
                                    onClick={() => { setIsTagsModalOpen(true); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fas fa-tags" style={{ color: '#8b5cf6', width: '16px' }}></i> Manage Tags
                                </button>
                                <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
                                <button
                                    onClick={() => { handleWhatsAppShare(); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className="fab fa-whatsapp" style={{ color: '#25D366', width: '16px' }}></i> Share on WhatsApp
                                </button>
                                <button
                                    onClick={() => { handleCopyDetails(); setShowMoreMenu(false); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                    className="hover:bg-slate-50"
                                >
                                    <i className={isCopying ? "fas fa-check" : "fas fa-copy"} style={{ color: '#64748b', width: '16px' }}></i> {isCopying ? 'Copied!' : 'Copy Details'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Refined Assignment Plate - Matching Deal Detail Style */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '4px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                    }}>
                        {/* Name Stack */}
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                {inventory.assignedTo?.fullName || inventory.assignedTo?.name || (typeof inventory.assignedTo === 'string' && !/^[0-9a-fA-F]{24}$/.test(inventory.assignedTo) ? inventory.assignedTo : 'Unassigned')}
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                                {inventory.team?.name || inventory.team?.lookup_value || (typeof inventory.team === 'string' && !/^[0-9a-fA-F]{24}$/.test(inventory.team) ? inventory.team : 'Standard Team')}
                            </span>
                        </div>

                        {/* Divider */}
                        <div style={{ width: '1px', height: '18px', background: '#cbd5e1' }}></div>

                        {/* Visibility Icon */}
                        <div title={`Visibility: ${inventory.visibleTo || 'Everyone'}`} style={{ display: 'flex', alignItems: 'center' }}>
                            {(() => {
                                const v = (inventory.visibleTo || 'Everyone').toLowerCase();
                                if (v === 'private') return <i className="fas fa-lock" style={{ color: '#ef4444', fontSize: '0.85rem' }}></i>;
                                if (v === 'team') return <i className="fas fa-users" style={{ color: '#3b82f6', fontSize: '0.85rem' }}></i>;
                                return <i className="fas fa-globe" style={{ color: '#10b981', fontSize: '0.85rem' }}></i>;
                            })()}
                        </div>
                    </div>
                </div>
            </header>

            <div className="detail-content-grid" style={{
                display: 'flex',
                gap: '24px', padding: '24px', maxWidth: '1600px', margin: '0 auto',
                alignItems: 'flex-start'
            }}>

                {/* LEFT MAIN SECTION */}
                <main style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* DEAL CONTROL CARD */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Transaction Types for This Inventory</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {['Sell', 'Rent', 'Lease'].map(type => {
                                const dealForType = deals.find(d => {
                                    const dIntent = (d.intent || '').toLowerCase();
                                    if (type === 'Sell') return dIntent.includes('sell') || dIntent.includes('sale');
                                    if (type === 'Rent') return dIntent.includes('rent');
                                    if (type === 'Lease') return dIntent.includes('lease');
                                    return false;
                                });
                                const dealExists = !!dealForType;
                                const isSold = currentStatus === 'Sold Out' && type === 'Sell';
                                const isDisabled = isSold || currentStatus === 'Inactive';

                                // Check if this intent is currently active for the inventory
                                const isIntentActive = Array.isArray(inventory?.intent)
                                    ? inventory.intent.some(i => (i && typeof i === 'object' ? i.lookup_value : i) === type)
                                    : (inventory?.intent && typeof inventory.intent === 'object' ? inventory.intent.lookup_value : inventory?.intent) === type;

                                // Pricing mapping
                                const priceField = type === 'Sell' ? 'price' : (type === 'Rent' ? 'rentPrice' : 'leasePrice');
                                const priceValue = inventory?.[priceField]?.value || '';

                                return (
                                    <div
                                        key={type}
                                        onClick={() => !dealExists && !isDisabled && handleToggleIntent(type)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '14px 18px',
                                            background: dealExists ? '#fff1f2' : (isIntentActive ? '#f8fafc' : 'rgba(248, 250, 252, 0.3)'),
                                            borderRadius: '12px',
                                            border: dealExists ? '1px solid #fecdd3' : (isIntentActive ? '1px solid #e2e8f0' : '1px solid rgba(241, 245, 249, 0.5)'),
                                            transition: 'all 0.2s ease',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            opacity: isIntentActive || dealExists ? 1 : 0.7,
                                            cursor: dealExists || isDisabled ? 'default' : 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isDisabled && !dealExists) {
                                                e.currentTarget.style.background = isIntentActive ? '#f1f5f9' : '#fff';
                                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = dealExists ? '#fff1f2' : (isIntentActive ? '#f8fafc' : 'rgba(248, 250, 252, 0.3)');
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                background: type === 'Sell' ? '#eff6ff' : type === 'Rent' ? '#f0fdf4' : '#faf5ff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: type === 'Sell' ? '#2563eb' : type === 'Rent' ? '#16a34a' : '#9333ea',
                                                opacity: isIntentActive ? 1 : 0.5
                                            }}>
                                                <i className={`fas fa-${type === 'Sell' ? 'hand-holding-usd' : type === 'Rent' ? 'key' : 'file-signature'}`}></i>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 700, color: isIntentActive ? '#1e293b' : '#64748b', fontSize: '0.9rem' }}>{type}</span>
                                                    {isIntentActive && !dealExists && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>₹</span>
                                                            <input
                                                                type="number"
                                                                placeholder="Price"
                                                                value={priceValue}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onBlur={(e) => updateInventoryField(priceField, { value: parseFloat(e.target.value) || 0, currency: 'INR' })}
                                                                style={{
                                                                    border: 'none',
                                                                    borderBottom: '1px dashed #cbd5e1',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 600,
                                                                    color: '#0f172a',
                                                                    width: '100px',
                                                                    background: 'transparent',
                                                                    padding: '0 4px',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                {dealExists && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#be123c' }}>
                                                            {dealForType.price || dealForType.budget || 'Price N/A'}
                                                        </span>
                                                        <span style={{ fontSize: '0.65rem', color: '#9f1239', opacity: 0.6 }}>
                                                            • {new Date(dealForType.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {dealExists && <span style={{ fontSize: '0.6rem', padding: '2px 6px', background: '#fb7185', color: '#fff', borderRadius: '4px', fontWeight: 800, marginLeft: '8px' }}>ACTIVE DEAL</span>}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {dealExists ? (
                                                <button
                                                    className="primary-btn"
                                                    style={{
                                                        fontSize: '0.85rem',
                                                        padding: '8px 16px',
                                                        background: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
                                                        border: 'none',
                                                        boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.2)',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}
                                                    onClick={() => onNavigate('deal-detail', dealForType._id)}
                                                >
                                                    <i className="fas fa-external-link-alt"></i>
                                                    View Deal
                                                </button>
                                            ) : (
                                                <button
                                                    className="primary-btn"
                                                    disabled={isDisabled || !isIntentActive}
                                                    onClick={() => handleCreateDeal(type)}
                                                    style={{
                                                        fontSize: '0.85rem', padding: '8px 16px',
                                                        opacity: (isDisabled || !isIntentActive) ? 0.5 : 1,
                                                        cursor: (isDisabled || !isIntentActive) ? 'not-allowed' : 'pointer',
                                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                        border: 'none',
                                                        fontWeight: 700,
                                                        boxShadow: (isDisabled || !isIntentActive) ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
                                                    }}
                                                >
                                                    Create Deal
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Top Match Leads Section (Professional) */}
                        <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: '0.8rem' }}></i> Top Match Leads
                                </h4>
                                <button
                                    onClick={() => onNavigate('inventory-matching', inventory._id)}
                                    style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                                >
                                    View Match Centre →
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {matchingLeads && matchingLeads.length > 0 ? (
                                    matchingLeads.slice(0, 3).map((lead, idx) => (
                                        <div key={idx} style={{
                                            padding: '12px 16px',
                                            background: '#f8fafc',
                                            borderRadius: '12px',
                                            border: '1px solid #f1f5f9',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                                                    {getInitials(lead.contactDetails?.name || lead.name || lead.firstName)}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{lead.contactDetails?.name || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{lead.contactDetails?.mobile || lead.mobile || lead.phone || 'N/A'} • {lead.intent || 'Buying'}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onNavigate('lead-detail', lead._id)}
                                                style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer' }}
                                            >
                                                <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>No matching leads found for this unit.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        {currentStatus === 'Sold Out' && (
                            <p style={{ marginTop: '12px', fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                                <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }}></i> Sell type is locked because inventory is Sold.
                            </p>
                        )}
                    </section>

                    {/* UNIT SPECIFICATIONS (Combined Basic Details & Orientation) */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <i className="fas fa-th-list" style={{ marginRight: '8px', color: '#2563eb' }}></i> Unit Specifications
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            {/* Sub-section: Basic Details */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-home" style={{ marginRight: '8px', fontSize: '0.8rem', color: '#2563eb' }}></i> Basic Details
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Category" value={getLookupValue('Category', inventory.category)} />
                                    <DetailField label="Subcategory" value={getLookupValue('SubCategory', inventory.subCategory)} />
                                    <DetailField label="Unit Type" value={getStrictLookupValue('UnitType', inventory.unitType)} />
                                    <DetailField label="Built-up Type" value={getLookupValue('BuiltupType', inventory.builtupType)} />

                                    {/* Conditional Dimensions/Areas Row */}
                                    {(() => {
                                        // Professional Fix: Extract metadata from lookup to show dimensions even if not in DB directly
                                        const sizeId = inventory.sizeConfig || inventory.unitType;
                                        let sizeMeta = null;
                                        if (sizeId && lookups && lookups['Size']) {
                                            const found = lookups['Size'].find(l =>
                                                l._id === sizeId ||
                                                l.id === sizeId ||
                                                (typeof sizeId === 'object' && l._id === sizeId._id)
                                            );
                                            sizeMeta = found?.metadata;
                                        }

                                        const subCategoryValue = getLookupValue('SubCategory', inventory.subCategory);
                                        const isPlotOrHouse = ['Plot', 'Independent House'].includes(subCategoryValue);

                                        if (isPlotOrHouse) {
                                            const width = inventory.width || sizeMeta?.width || sizeMeta?.plotWidth;
                                            const length = inventory.length || sizeMeta?.length || sizeMeta?.plotLength;
                                            const sizeUnit = inventory.sizeUnit || sizeMeta?.widthMetric || sizeMeta?.lengthMetric || 'Ft';

                                            return (
                                                <div style={{
                                                    gridColumn: 'span 2',
                                                    display: 'grid',
                                                    gridTemplateColumns: '2.2fr 1fr 1fr',
                                                    gap: '24px',
                                                    background: 'linear-gradient(90deg, #f8fafc 0%, #eff6ff 100%)',
                                                    padding: '16px 20px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #dbeafe',
                                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                                    alignItems: 'center'
                                                }}>
                                                    <DetailField label="Size Label" value={getStrictLookupValue('Size', inventory.sizeConfig) || renderValue(inventory.sizeConfig) || inventory.sizeLabel || 'N/A'} />
                                                    <DetailField label="Width" value={width ? `${width} ${renderValue(sizeUnit)}` : 'N/A'} />
                                                    <DetailField label="Length" value={length ? `${length} ${renderValue(sizeUnit)}` : 'N/A'} />
                                                </div>
                                            );
                                        } else {
                                            const saleable = inventory.totalSaleableArea?.value || sizeMeta?.saleableArea || sizeMeta?.totalArea;
                                            const covered = inventory.builtUpArea?.value || sizeMeta?.coveredArea || sizeMeta?.builtupArea;
                                            const carpet = inventory.carpetArea?.value || sizeMeta?.carpetArea;
                                            const areaUnit = inventory.sizeUnit || sizeMeta?.resultMetric || sizeMeta?.areaMetrics || 'Sq.Ft.';

                                            return (
                                                <div style={{
                                                    gridColumn: 'span 2',
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                                                    gap: '16px',
                                                    background: 'linear-gradient(90deg, #f8fafc 0%, #f0fdf4 100%)',
                                                    padding: '16px 20px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #dcfce7',
                                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                                    alignItems: 'center'
                                                }}>
                                                    <DetailField label="Size Label" value={getStrictLookupValue('Size', inventory.sizeConfig) || renderValue(inventory.sizeConfig) || inventory.sizeLabel || 'N/A'} />
                                                    <DetailField label="Total Saleable Area" value={saleable ? `${saleable} ${renderValue(areaUnit)}` : 'N/A'} />
                                                    <DetailField label="Covered Area" value={covered ? `${covered} ${renderValue(areaUnit)}` : 'N/A'} />
                                                    <DetailField label="Carpet Area" value={carpet ? `${carpet} ${renderValue(areaUnit)}` : 'N/A'} />
                                                </div>
                                            );
                                        }
                                    })()}
                                </div>
                            </div>

                            {/* Sub-section: Orientation */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-compass" style={{ marginRight: '8px', fontSize: '0.8rem', color: '#f59e0b' }}></i> Orientation & Features
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Direction" value={getLookupValue('Direction', inventory.direction || inventory.orientation) || renderValue(inventory.direction) || renderValue(inventory.orientation)} />
                                    <DetailField label="Facing" value={getLookupValue('Facing', inventory.facing) || renderValue(inventory.facing)} />
                                    <DetailField label="Road Width" value={getLookupValue('RoadWidth', inventory.roadWidth) || renderValue(inventory.roadWidth)} />
                                    <DetailField label="Ownership" value={inventory.ownership || 'N/A'} />
                                </div>
                            </div>
                        </div>
                    </section>



                    {/* LOCATION CARD (Moved Up) */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                <i className="fas fa-map-marker-alt" style={{ marginRight: '8px', color: '#ef4444' }}></i> Location Details
                            </h3>
                            <button
                                onClick={() => {
                                    const lat = inventory.address?.lat || inventory.latitude;
                                    const lng = inventory.address?.lng || inventory.longitude;
                                    if (lat && lng) {
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                                    } else {
                                        const query = `${inventory.address?.locality || ''} ${inventory.address?.city || ''} ${inventory.address?.state || ''}`.trim();
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                                    }
                                }}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    background: '#f0f9ff',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <i className="fas fa-external-link-alt"></i> View on Google Maps
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                                <DetailField label="Country" value={getLookupValue('Country', inventory.address?.country) || 'India'} />
                                <DetailField label="State" value={getLookupValue('State', inventory.address?.state)} />
                                <DetailField label="City" value={getLookupValue('City', inventory.address?.city || inventory.city)} />
                                <DetailField label="Location" value={getLookupValue('Location', inventory.address?.location || inventory.location)} />
                                <DetailField label="Tehsil" value={getLookupValue('Tehsil', inventory.address?.tehsil)} />
                                <DetailField label="Post Office" value={getLookupValue('PostOffice', inventory.address?.postOffice)} />
                                <DetailField label="Pin Code" value={inventory.address?.pincode || inventory.address?.pinCode} />
                                <DetailField label="House Number" value={inventory.address?.hNo} />
                                <div style={{ gridColumn: 'span 1' }}>
                                    <DetailField label="Street / Road / Landmark" value={`${inventory.address?.street || ''}${inventory.address?.street && inventory.address?.landmark ? ' / ' : ''}${inventory.address?.landmark || ''}` || 'N/A'} />
                                </div>
                                <DetailField label="Area" value={getLookupValue('Area', inventory.address?.area || inventory.address?.locality)} />

                                <div style={{ gridColumn: '1 / -1', marginTop: '12px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                                    <DetailField
                                        label="Full Address"
                                        value={(() => {
                                            const addr = inventory.address;
                                            if (!addr) return 'N/A';
                                            const parts = [];

                                            // Sequence: h. no., street/landmark, area, location, tehsil, post office, city, state, pincode (country)
                                            if (addr.hNo) parts.push(addr.hNo);

                                            const sl = [addr.street, addr.landmark].filter(Boolean).join(' / ');
                                            if (sl) parts.push(sl);

                                            const areaVal = getLookupValue('Area', addr.area || addr.locality);
                                            if (areaVal) parts.push(areaVal);

                                            const locVal = getLookupValue('Location', addr.location);
                                            if (locVal) parts.push(locVal);

                                            const tehsilVal = getLookupValue('Tehsil', addr.tehsil);
                                            if (tehsilVal) parts.push(tehsilVal);

                                            if (addr.postOffice) parts.push(getLookupValue('PostOffice', addr.postOffice));

                                            const cityVal = getLookupValue('City', addr.city);
                                            if (cityVal) parts.push(cityVal);

                                            const stateVal = getLookupValue('State', addr.state);
                                            if (stateVal) parts.push(stateVal);

                                            const pc = addr.pincode || addr.pinCode;
                                            if (pc) parts.push(pc);

                                            const main = parts.filter(Boolean).join(', ');
                                            const countryName = getLookupValue('Country', addr.country) || 'India';

                                            return main ? `${main}${countryName ? ` (${countryName})` : ''}` : 'N/A';
                                        })()}
                                    />
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', borderRadius: '10px', height: '180px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                {((inventory.address?.lat || inventory.latitude) && (inventory.address?.lng || inventory.longitude)) ? (
                                    <ProfessionalMap
                                        items={[{
                                            ...inventory,
                                            lat: inventory.address?.lat || inventory.latitude,
                                            lng: inventory.address?.lng || inventory.longitude
                                        }]}
                                        center={{
                                            lat: parseFloat(inventory.address?.lat || inventory.latitude),
                                            lng: parseFloat(inventory.address?.lng || inventory.longitude)
                                        }}
                                        zoom={15}
                                    />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                        <i className="fas fa-map" style={{ fontSize: '2rem', marginBottom: '8px' }}></i>
                                        <span style={{ fontSize: '0.8rem' }}>Map View Unavailable</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* BUILTUP & FURNISHING DETAILS */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <i className="fas fa-layer-group" style={{ marginRight: '8px', color: '#8b5cf6' }}></i> Builtup & Furnishing Details
                        </h3>
                        <div style={{ marginBottom: '20px' }}>
                            {/* Core Measurement Highlight Group */}
                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: '10px',
                                padding: '16px',
                                marginBottom: '20px',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Built-up Type" value={getLookupValue('BuiltupType', inventory.builtupType)} />
                                    <DetailField label="Floor" value={inventory.floor || 'N/A'} />
                                    <DetailField label="Plan/Cluster" value={inventory.builtupDetails?.[0]?.cluster || 'N/A'} />
                                    <DetailField label="Width" value={inventory.builtupDetails?.[0]?.width || 'N/A'} />
                                    <DetailField label="Length" value={inventory.builtupDetails?.[0]?.length || 'N/A'} />
                                    <DetailField label="Total Area" value={inventory.builtupDetails?.[0]?.totalArea || inventory.builtUpArea?.value || inventory.size?.value || 'N/A'} />
                                </div>
                            </div>

                            {/* Supplementary Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                <DetailField label="Possession Status" value={inventory.possessionStatus} />
                                <DetailField label="Occupation Date" value={inventory.occupationDate ? new Date(inventory.occupationDate).toLocaleDateString() : '-'} />
                                <DetailField label="Age of Construction" value={inventory.ageOfConstruction || inventory.constructionAge} />
                                <DetailField label="Furnish Status" value={inventory.furnishType} />
                                <div style={{ gridColumn: 'span 3' }}>
                                    <DetailField label="Furnished Items" value={inventory.furnishedItems} />
                                </div>
                            </div>
                        </div>

                        {inventory.builtupDetails && inventory.builtupDetails.length > 0 && (
                            <div style={{ marginTop: '20px', borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>Floor-wise Breakdown</p>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                                                <th style={{ padding: '8px', color: '#94a3b8', fontWeight: 600 }}>Floor</th>
                                                <th style={{ padding: '8px', color: '#94a3b8', fontWeight: 600 }}>Plan</th>
                                                <th style={{ padding: '8px', color: '#94a3b8', fontWeight: 600 }}>Dimensions (L x W)</th>
                                                <th style={{ padding: '8px', color: '#94a3b8', fontWeight: 600 }}>Area</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventory.builtupDetails.map((row, idx) => (
                                                <tr key={idx} style={{ borderBottom: idx < inventory.builtupDetails.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                                    <td style={{ padding: '8px', color: '#334155' }}>{row.floor}</td>
                                                    <td style={{ padding: '8px', color: '#334155' }}>{row.cluster || '-'}</td>
                                                    <td style={{ padding: '8px', color: '#334155' }}>{row.length} x {row.width}</td>
                                                    <td style={{ padding: '8px', color: '#334155' }}>{row.totalArea}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                    </section>





                    {/* ACTIVITIES & TIMELINE Section */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
                        <UnifiedActivitySection
                            entityId={inventoryId}
                            entityType="Inventory"
                            entityData={inventory}
                            hideComposer={true}
                        />
                    </section>
                </main >

                {/* RIGHT SIDEBAR */}
                < aside style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '24px' }
                }>

                    {/* CONSOLIDATED CONTACT INFO */}
                    {/* ASSOCIATED CONTACTS & STAKEHOLDERS (Professional Sidebar View) */}
                    <section className="detail-card" style={glassCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-history" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i> Previous Owner History
                            </h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {inventory.previousOwners && inventory.previousOwners.length > 0 ? (
                                inventory.previousOwners.map((owner, idx) => (
                                    <div key={idx} style={{
                                        padding: '12px',
                                        background: '#f8fafc',
                                        borderRadius: '12px',
                                        border: '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{owner.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{owner.phone || owner.mobile}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                                            Owned from: {owner.fromDate || 'N/A'} to {owner.toDate || 'N/A'}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>No previous owner history found</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="detail-card" style={glassCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-address-book" style={{ color: '#6366f1', fontSize: '0.8rem' }}></i> Contact Information
                            </h3>
                            <button
                                className="text-btn"
                                style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
                                onClick={() => setIsOwnerModalOpen(true)}
                            >
                                Manage
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Property Owners Sub-section */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Property Owners</label>
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>{inventory.owners?.length || 0}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {inventory.owners && inventory.owners.length > 0 ? (
                                        inventory.owners.map((owner, idx) => (
                                            <div key={idx} style={{
                                                padding: '10px',
                                                background: '#f8fafc',
                                                borderRadius: '10px',
                                                border: '1px solid #f1f5f9',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px'
                                            }}>
                                                <div style={{
                                                    width: '32px', height: '32px',
                                                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                    borderRadius: '8px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontWeight: 900, fontSize: '0.75rem'
                                                }}>
                                                    {getInitials(owner.name)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{owner.phones?.[0]?.number || 'No Phone'}</div>
                                                </div>
                                                <div style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.5rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, textTransform: 'uppercase', border: '1px solid #d1fae5' }}>Owner</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                                            {inventory.ownerName ? (
                                                <div style={{ textAlign: 'left', color: '#475569', fontStyle: 'normal' }}>
                                                    <p style={{ fontWeight: 800, margin: 0 }}>{inventory.ownerName}</p>
                                                    <p style={{ margin: 0 }}>{inventory.ownerPhone}</p>
                                                </div>
                                            ) : 'No Owners'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Associated Stakeholders Sub-section */}
                            {(inventory.associates?.length > 0 || inventory.associatedContact) && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stakeholders</label>
                                        <span style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700 }}>{inventory.associates?.length || (inventory.associatedContact ? 1 : 0)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {inventory.associates && inventory.associates.length > 0 ? (
                                            inventory.associates.map((assoc, idx) => {
                                                const contact = assoc.contact || assoc;
                                                const relationship = assoc.relationship || '';
                                                return (
                                                    <div key={idx} style={{
                                                        padding: '10px',
                                                        background: '#f8fafc',
                                                        borderRadius: '10px',
                                                        border: '1px solid #f1f5f9',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px'
                                                    }}>
                                                        <div style={{
                                                            width: '32px', height: '32px',
                                                            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                                                            borderRadius: '8px',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            color: '#fff', fontWeight: 900, fontSize: '0.75rem'
                                                        }}>
                                                            {getInitials(contact.name)}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {contact.name}
                                                                {relationship && (
                                                                    <span style={{ marginLeft: '6px', fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700 }}>({relationship})</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{contact.phones?.[0]?.number || 'No Phone'}</div>
                                                        </div>
                                                        <div style={{ background: '#fffbeb', color: '#b45309', fontSize: '0.5rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Assoc</div>
                                                    </div>
                                                );
                                            })
                                        ) : inventory.associatedContact && (
                                            <div style={{
                                                padding: '10px',
                                                background: '#f8fafc',
                                                borderRadius: '10px',
                                                border: '1px solid #f1f5f9',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px'
                                            }}>
                                                <div style={{
                                                    width: '32px', height: '32px',
                                                    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                                                    borderRadius: '8px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontWeight: 900, fontSize: '0.75rem'
                                                }}>
                                                    {getInitials(inventory.associatedContact)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inventory.associatedContact}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{inventory.associatedPhone || 'No Phone'}</div>
                                                </div>
                                                <div style={{ background: '#fffbeb', color: '#b45309', fontSize: '0.5rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Assoc</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0' }}>
                                <button
                                    onClick={() => handleContactClick('call')}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #d1fae5', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                                >
                                    <i className="fas fa-phone-alt"></i> Call
                                </button>
                                <button
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #dbeafe', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                                    onClick={() => handleContactClick('whatsapp')}
                                >
                                    <i className="fab fa-whatsapp"></i> WhatsApp
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* DOCUMENTS SECTION */}
                    <section className="detail-card" style={glassCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-file-alt" style={{ color: '#f59e0b', fontSize: '0.8rem' }}></i> Property Documents
                            </h3>
                            <button
                                className="text-btn"
                                style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
                                onClick={() => setIsDocumentModalOpen(true)}
                            >
                                Manage
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {inventory.inventoryDocuments && inventory.inventoryDocuments.length > 0 ? (
                                inventory.inventoryDocuments.map((doc, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#fff', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-file-pdf" style={{ color: '#f97316', fontSize: '0.9rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '0 0 2px 0', fontWeight: 600, textTransform: 'uppercase' }}>
                                                {doc.documentType || 'Other'}
                                            </p>
                                            <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {doc.documentName}
                                            </p>
                                        </div>
                                        <button
                                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'all 0.2s' }}
                                            onClick={() => window.open(doc.url || doc.fileUrl, '_blank')}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#2563eb'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
                                        >
                                            <i className="fas fa-external-link-alt" style={{ fontSize: '0.75rem' }}></i>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>No documents attached</p>
                                    <button
                                        style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}
                                        onClick={() => setIsDocumentModalOpen(true)}
                                    >
                                        + Add Documents
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* IMAGES & VIDEOS SECTION */}
                    <section className="detail-card" style={glassCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-images" style={{ color: '#3b82f6', fontSize: '0.8rem' }}></i> Gallery & Videos
                            </h3>
                            <button
                                style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, background: '#eff6ff', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
                                onClick={() => setIsUploadModalOpen(true)}
                            >
                                + Add Media
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                            {[...(inventory.inventoryImages || []), ...(inventory.projectImages || [])].map((img, idx) => (
                                <div
                                    key={`img-${idx}`}
                                    className="group"
                                    style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f1f5f9', height: '110px', background: '#f8fafc', cursor: 'pointer', transition: 'all 0.3s ease' }}
                                    onClick={() => setMediaViewer({ isOpen: true, data: { ...img, type: 'image' } })}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    {img.url || img.previewUrl || img.path ? (
                                        <img src={img.url || img.previewUrl || img.path} alt={img.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-image" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                                        </div>
                                    )}
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                        padding: '8px 6px 6px', fontSize: '0.65rem', color: '#fff', fontWeight: 600,
                                        backdropFilter: 'blur(2px)'
                                    }}>
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {img.title || img.category || 'Untitled'}
                                        </div>
                                    </div>
                                    <div style={{ position: 'absolute', top: '5px', right: '5px', opacity: 0, transition: 'opacity 0.2s ease' }} className="group-hover:opacity-100">
                                        <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                            <i className="fas fa-expand text-blue-600" style={{ fontSize: '0.7rem' }}></i>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {[...(inventory.inventoryVideos || []), ...(inventory.projectVideos || [])].map((vid, idx) => {
                                const ytId = vid.url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
                                const ytThumb = vid.type === 'YouTube' ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
                                return (
                                    <div
                                        key={`vid-${idx}`}
                                        style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', height: '110px', background: '#0f172a', cursor: 'pointer', transition: 'all 0.3s ease' }}
                                        onClick={() => setMediaViewer({ isOpen: true, data: { ...vid, type: 'video', ytId } })}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        {ytThumb ? (
                                            <img src={ytThumb} alt={vid.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fas fa-video" style={{ color: '#475569', fontSize: '1.2rem' }}></i>
                                            </div>
                                        )}
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: '1px solid rgba(255,255,255,0.3)', color: '#fff'
                                            }}>
                                                <i className="fas fa-play" style={{ fontSize: '0.8rem', marginLeft: '2px' }}></i>
                                            </div>
                                        </div>
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                                            padding: '8px 6px 6px', fontSize: '0.65rem', color: '#fff', fontWeight: 600
                                        }}>
                                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {vid.title || 'Untitled Video'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {(!inventory.inventoryImages?.length && !inventory.projectImages?.length && !inventory.inventoryVideos?.length && !inventory.projectVideos?.length) && (
                            <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>No media files available</p>
                            </div>
                        )}
                    </section>

                    {/* LIFECYCLE CARD */}
                    <section className="detail-card" style={glassCardStyle}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-sync" style={{ color: '#2563eb', fontSize: '0.8rem' }}></i> Inventory Lifecycle
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <SidebarStat label="Created On" value={new Date(inventory.createdAt).toLocaleDateString()} />
                            <SidebarStat label="Last Updated" value={new Date(inventory.updatedAt).toLocaleDateString()} />
                            <SidebarStat label="Total Activities" value={0} />
                            <SidebarStat label="Days in System" value={Math.floor((new Date() - new Date(inventory.createdAt)) / (1000 * 60 * 60 * 24))} />
                        </div>
                    </section>




                    {/* PREVIOUS OWNER HISTORY CARD */}
                    <section className="detail-card" style={glassCardStyle}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-history" style={{ color: '#64748b', fontSize: '0.8rem' }}></i> Previous Owner History
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {inventory.previousOwners && inventory.previousOwners.length > 0 ? (
                                inventory.previousOwners.map((owner, idx) => (
                                    <div key={idx} style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{owner.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{owner.fromDate} - {owner.toDate}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <i className="fas fa-exchange-alt" style={{ fontSize: '0.65rem', color: '#64748b' }}></i>
                                            <span style={{ fontSize: '0.75rem', color: '#475569' }}>Changed via: <b>{owner.changeReason || 'Sale Deed'}</b></span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>No previous owner history recorded</p>
                                </div>
                            )}
                        </div>
                    </section>

                </aside >

            </div >


            {/* MODALS */}
            < AddInventoryDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={async (newDocs) => {
                    try {
                        const response = await api.put(`inventory/${inventoryId}`, {
                            inventoryDocuments: newDocs
                        });
                        if (response.data && response.data.success) {
                            toast.success("Documents updated successfully");
                            fetchInventoryDetails();
                        }
                    } catch (error) {
                        console.error("Error saving documents:", error);
                        toast.error("Failed to save documents");
                    }
                }}
                project={inventory}
            />

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                type="property"
                project={inventory}
                onSave={async (formData) => {
                    try {
                        const response = await api.put(`inventory/${inventoryId}`, {
                            projectImages: formData.projectImages,
                            projectVideos: formData.projectVideos,
                            projectDocuments: formData.projectDocuments
                        });
                        if (response.data && response.data.success) {
                            toast.success("Media updated successfully");
                            fetchInventoryDetails();
                        }
                    } catch (error) {
                        console.error("Error saving media:", error);
                        toast.error("Failed to save media");
                    }
                }}
            />

            <MediaViewerModal
                isOpen={mediaViewer.isOpen}
                onClose={() => setMediaViewer({ isOpen: false, data: null })}
                data={mediaViewer.data}
            />

            <AddOwnerModal
                isOpen={isOwnerModalOpen}
                onClose={() => setIsOwnerModalOpen(false)}
                currentOwners={[
                    ...(inventory.owners && inventory.owners.length > 0
                        ? inventory.owners.map(o => ({
                            id: o._id || o.id,
                            name: o.name,
                            mobile: o.phones?.[0]?.number || o.mobile || '',
                            role: 'Property Owner'
                        }))
                        : (inventory.ownerName ? [{ name: inventory.ownerName, mobile: inventory.ownerPhone, role: 'Property Owner' }] : [])
                    ),
                    ...(inventory.associates && inventory.associates.length > 0
                        ? inventory.associates.map(a => {
                            const contact = a.contact || a;
                            return {
                                id: contact._id || contact.id,
                                name: contact.name,
                                mobile: contact.phones?.[0]?.number || contact.mobile || '',
                                role: 'Associate',
                                relationship: a.relationship || ''
                            };
                        })
                        : (inventory.associatedContact ? [{ name: inventory.associatedContact, mobile: inventory.associatedPhone, role: 'Associate' }] : [])
                    )
                ]}
                onSave={async (owners) => {
                    try {
                        const owner = owners.find(o => o.role === 'Owner' || o.role === 'Property Owner');
                        const associate = owners.find(o => o.role === 'Associate' || o.role === 'Buyer');

                        const updates = {
                            owners: owners.filter(o => o.role === 'Property Owner').map(o => o.id),
                            associates: owners.filter(o => o.role === 'Associate' || o.role === 'Buyer').map(o => ({
                                contact: o.id,
                                relationship: o.relationship
                            }))
                        };

                        const response = await api.put(`inventory/${inventoryId}`, updates);
                        if (response.data && response.data.success) {
                            toast.success("Owner information updated");
                            fetchInventoryDetails();
                        }
                    } catch (error) {
                        console.error("Error saving owner data:", error);
                        toast.error("Failed to update owner information");
                    }
                }}
            />

            <ComposeEmailModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipients={modalData}
            />

            <SendMessageModal
                isOpen={isMessageModalOpen}
                onClose={() => setIsMessageModalOpen(false)}
                initialRecipients={modalData?.map(item => ({
                    ...item,
                    name: item.name || item.ownerName || item.associatedContact || 'Client',
                    phone: item.phone || item.mobile || item.ownerPhone || item.associatedPhone
                })) || []}
                onSend={(data, res) => {
                    toast.success(res?.message || 'Message Sent!');
                    setIsMessageModalOpen(false);
                }}
            />

            <InventoryFeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                inventory={inventory}
                onSave={handleSaveFeedback}
            />

            <ManageTagsModal
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                selectedContacts={[{ id: inventory._id, tags: inventory.tags || '-' }]}
                onUpdateTags={async (data) => {
                    try {
                        const response = await api.put(`inventory/${inventoryId}`, {
                            tags: data.tags.join(', ')
                        });
                        if (response.data && response.data.success) {
                            toast.success("Tags updated successfully");
                            fetchInventoryDetails();
                        } else {
                            toast.error("Failed to update tags");
                        }
                    } catch (error) {
                        console.error("Error updating tags:", error);
                        toast.error("An error occurred while updating tags");
                    }
                }}
            />

            {/* Contact Picker Modal */}
            {
                contactPicker.isOpen && (
                    <div
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
                            padding: '20px'
                        }}
                        onClick={() => setContactPicker({ ...contactPicker, isOpen: false })}
                    >
                        <div
                            style={{
                                background: '#fff', width: '100%', maxWidth: '420px',
                                borderRadius: '32px', overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                animation: 'modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <style>{`
                            @keyframes modalFadeIn {
                                from { opacity: 0; transform: scale(0.95) translateY(20px); }
                                to { opacity: 1; transform: scale(1) translateY(0); }
                            }
                        `}</style>
                            <div style={{ padding: '28px 28px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.5px' }}>
                                        {contactPicker.type === 'call' ? 'Choose to Call' : 'Choose to Message'}
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>
                                        Select a professional contact
                                    </p>
                                </div>
                                <button
                                    onClick={() => setContactPicker({ ...contactPicker, isOpen: false })}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '10px',
                                        border: 'none', background: '#f8fafc', color: '#94a3b8',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div style={{ padding: '12px', maxHeight: '420px', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {contactPicker.contacts.map((contact, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                if (contactPicker.type === 'call') {
                                                    startCall(contact.phone, contact.name);
                                                } else {
                                                    const cleanPhone = contact.phone.replace(/\D/g, '');
                                                    window.open(`https://wa.me/${cleanPhone}`, '_blank');
                                                }
                                                setContactPicker({ ...contactPicker, isOpen: false });
                                            }}
                                            style={{
                                                padding: '16px', borderRadius: '20px',
                                                background: '#f8fafc', border: '1px solid #f1f5f9',
                                                display: 'flex', alignItems: 'center', gap: '16px',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#fff';
                                                e.currentTarget.style.borderColor = '#e2e8f0';
                                                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = '#f8fafc';
                                                e.currentTarget.style.borderColor = '#f1f5f9';
                                                e.currentTarget.style.boxShadow = 'none';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                            }}
                                        >
                                            <div style={{
                                                width: '48px', height: '48px',
                                                background: contact.role === 'Owner' ? 'linear-gradient(135deg, #4f46e5, #818cf8)' : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                                                borderRadius: '16px', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 900, fontSize: '1.1rem',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                            }}>
                                                {getInitials(contact.name)}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.3px' }}>{contact.name}</div>
                                                    <div style={{
                                                        fontSize: '0.6rem', fontWeight: 900, padding: '2px 8px',
                                                        borderRadius: '6px', background: contact.role === 'Owner' ? '#eef2ff' : '#fffbeb',
                                                        color: contact.role === 'Owner' ? '#4f46e5' : '#b45309', textTransform: 'uppercase',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {contact.role}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                                                    {contact.phone} {contact.relationship && <span style={{ color: '#cbd5e1', margin: '0 4px' }}>•</span>}
                                                    {contact.relationship && <span style={{ color: '#f59e0b', fontWeight: 800 }}>{contact.relationship}</span>}
                                                </div>
                                            </div>
                                            <div style={{
                                                width: '36px', height: '36px', borderRadius: '12px',
                                                background: contactPicker.type === 'call' ? '#ecfdf5' : '#eff6ff',
                                                color: contactPicker.type === 'call' ? '#059669' : '#2563eb',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.9rem'
                                            }}>
                                                <i className={contactPicker.type === 'call' ? 'fas fa-phone-alt' : 'fab fa-whatsapp'}></i>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: '20px 28px 28px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center' }}>
                                <button
                                    onClick={() => setContactPicker({ ...contactPicker, isOpen: false })}
                                    style={{
                                        padding: '12px 32px', borderRadius: '16px',
                                        border: '1px solid #e2e8f0', background: '#fff',
                                        color: '#64748b', fontWeight: 800, fontSize: '0.9rem',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// Helper Components
const DetailField = ({ label, value }) => {
    const renderValueInternal = (val) => {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'object') {
            return val.lookup_value || val.name || val.label || val.value || '-';
        }
        return val;
    };
    return (
        <div style={{ marginBottom: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 4px 0' }}>{label}</p>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', margin: 0 }}>{renderValueInternal(value)}</p>
        </div>
    );
};

const SidebarStat = ({ label, value }) => {
    const renderValueInternal = (val) => {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'object') {
            return val.lookup_value || val.name || val.label || val.value || '-';
        }
        return val;
    };
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span style={{ color: '#64748b' }}>{label}:</span>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{renderValueInternal(value)}</span>
        </div>
    );
};

const TabBtn = ({ children, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            padding: '12px 24px',
            background: active ? '#fff' : 'transparent',
            border: 'none',
            borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
            color: active ? '#2563eb' : '#64748b',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
        }}
    >
        {children}
    </button>
);

const MediaViewerModal = ({ isOpen, onClose, data }) => {
    if (!isOpen || !data) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.95)', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px', backdropFilter: 'blur(10px)'
        }}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: '20px', right: '20px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            >
                <i className="fas fa-times"></i>
            </button>

            <div style={{ maxWidth: '90%', maxHeight: '80%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {data.type === 'image' ? (
                    <img
                        src={data.url || data.previewUrl || data.path}
                        alt={data.title}
                        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                    />
                ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', maxWidth: '1000px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                        {data.ytId ? (
                            <iframe
                                width="100%"
                                height="100%"
                                src={`https://www.youtube.com/embed/${data.ytId}?autoplay=1`}
                                title={data.title}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <video
                                src={data.url}
                                controls
                                autoPlay
                                style={{ width: '100%', height: '100%' }}
                            ></video>
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px 0' }}>{data.title || data.category || 'Media File'}</h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: 600 }}>{data.type === 'video' ? 'Video File' : 'Image File'}</p>
            </div>
        </div>
    );
};
