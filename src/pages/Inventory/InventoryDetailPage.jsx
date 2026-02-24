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

export default function InventoryDetailPage({ inventoryId, onBack, onNavigate, onAddActivity, onAddDeal, onEditInventory }) {
    const { masterFields, getLookupValue } = usePropertyConfig();
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
    const [activities, setActivities] = useState([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [similarProperties, setSimilarProperties] = useState([]);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [modalData, setModalData] = useState([]);

    const fetchInventoryDetails = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Inventory
            const invResponse = await api.get(`inventory/${inventoryId}`);
            if (invResponse.data && invResponse.data.success) {
                const inv = invResponse.data.data;
                setInventory(inv);

                // 2. Fetch Deals for this Unit
                const dealsResponse = await api.get(`deals?search=${inv.unitNo}`);
                if (dealsResponse.data && dealsResponse.data.success) {
                    const unitDeals = (dealsResponse.data.records || []).filter(d =>
                        d.unitNo === inv.unitNo && d.projectName === inv.projectName
                    );
                    setDeals(unitDeals);
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

    const fetchActivities = useCallback(async () => {
        setActivitiesLoading(true);
        try {
            const response = await api.get(`activities?entityId=${inventoryId}&entityType=Inventory`);
            if (response.data && response.data.success) {
                setActivities(response.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching activities:", error);
        } finally {
            setActivitiesLoading(false);
        }
    }, [inventoryId]);

    useEffect(() => {
        if (inventoryId) {
            fetchInventoryDetails();
            fetchActivities();
        }
    }, [inventoryId, fetchInventoryDetails, fetchActivities]);

    const handleWhatsAppShare = () => {
        if (!inventory) return;
        const text = `*Property Listing:* ${inventory.unitNo}\n*Project:* ${inventory.projectName}\n*Block:* ${inventory.block}\n*Type:* ${inventory.category} (${inventory.subCategory})\n*Size:* ${inventory.size} ${inventory.sizeUnit}\n*Locality:* ${inventory.address?.locality || inventory.address?.area}\n*Price:* ${inventory.price || 'Ask for Price'}\n\nInterested? Let me know!`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleCopyDetails = () => {
        if (!inventory) return;
        const text = `Property: ${inventory.unitNo} | Project: ${inventory.projectName} | Block: ${inventory.block} | Type: ${inventory.category} | Size: ${inventory.size} ${inventory.sizeUnit} | Locality: ${inventory.address?.locality || inventory.address?.area}`;
        navigator.clipboard.writeText(text);
        setIsCopying(true);
        toast.success("Listing details copied to clipboard!");
        setTimeout(() => setIsCopying(false), 2000);
    };

    const handleCreateDeal = (type) => {
        if (!inventory) return;
        onAddDeal({
            unitNo: inventory.unitNo,
            projectName: inventory.projectName,
            projectId: inventory.projectId,
            block: inventory.block,
            category: inventory.category,
            subCategory: inventory.subCategory,
            unitType: getLookupValue('UnitType', inventory.unitType),
            intent: type === 'Sell' ? 'For Sale' : 'For Rent',
            size: inventory.size,
            sizeUnit: inventory.sizeUnit,
            location: inventory.address?.locality || inventory.address?.area,
            owner: inventory.owners?.[0] ? {
                ...inventory.owners[0],
                phone: inventory.owners[0].phones?.[0]?.number || inventory.owners[0].mobile || ''
            } : { name: inventory.ownerName, phone: inventory.ownerPhone },
            associatedContact: inventory.associates?.[0] ? {
                ...inventory.associates[0],
                phone: inventory.associates[0].phones?.[0]?.number || inventory.associates[0].mobile || ''
            } : { name: inventory.associatedContact, phone: inventory.associatedPhone },
            isOwnerSelected: !!inventory.owners?.[0],
            isAssociateSelected: !!inventory.associates?.[0]
        });
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

            let newStatus = inventory.status;
            if (data.markAsSold && data.reason) {
                if (String(data.reason).includes('Sold Out')) {
                    newStatus = 'Sold Out';
                } else if (String(data.reason).includes('Rented Out')) {
                    newStatus = 'Rented Out';
                } else {
                    newStatus = 'Inactive';
                }
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

            const response = await api.put(`inventory/${inventoryId}`, updates);

            if (response.data && response.data.success) {
                toast.success("Feedback recorded successfully");
                fetchInventoryDetails();
                fetchActivities();
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

    const currentStatus = renderValue(inventory.status) || 'Active';
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
                            <span style={{
                                backgroundColor: statusStyle.bg,
                                color: statusStyle.text,
                                padding: '4px 10px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                textTransform: 'uppercase', letterSpacing: '0.03em',
                                border: `1px solid ${statusStyle.dot}33`
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusStyle.dot }}></span>
                                {currentStatus}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                            {renderValue(inventory.projectName)} • {renderValue(inventory.block)}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className="toolbar-btn"
                        onClick={handleCopyDetails}
                        title="Copy Listing Details"
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', width: '40px', height: '40px', padding: 0, borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                        <i className={isCopying ? "fas fa-check" : "fas fa-copy"}></i>
                    </button>
                    <button
                        className="toolbar-btn"
                        onClick={handleWhatsAppShare}
                        title="Share on WhatsApp"
                        style={{ background: '#25D366', color: '#fff', border: 'none', width: '40px', height: '40px', padding: 0, borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                        <i className="fab fa-whatsapp" style={{ fontSize: '1.2rem' }}></i>
                    </button>
                    <div style={{ width: '1px', height: '30px', background: '#e2e8f0', margin: 'auto 4px' }}></div>

                    {/* Action Buttons */}
                    <button
                        className="toolbar-btn"
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
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fas fa-phone-alt" style={{ color: '#2563eb' }}></i> Call
                    </button>
                    <button
                        className="toolbar-btn"
                        onClick={handleEmailClick}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fas fa-envelope" style={{ color: '#ea580c' }}></i> Email
                    </button>
                    <button
                        className="toolbar-btn"
                        onClick={handleMessageClick}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fas fa-comment-alt" style={{ color: '#8b5cf6' }}></i> Message
                    </button>

                    <button
                        className="toolbar-btn"
                        onClick={handleFeedbackClick}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fas fa-comment-dots" style={{ color: '#f59e0b' }}></i> Feedback
                    </button>

                    <button
                        className="primary-btn"
                        onClick={() => onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }], { inventory })}
                        style={{
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                        }}
                    >
                        <i className="fas fa-plus"></i> Activity
                    </button>
                </div>
            </header>

            <div className="detail-content-grid" style={{
                display: 'grid', gridTemplateColumns: '1fr 350px',
                gap: '24px', padding: '24px', maxWidth: '1600px', margin: '0 auto'
            }}>

                {/* LEFT MAIN SECTION */}
                <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* DEAL CONTROL CARD */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Transaction Types for This Inventory</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {['Sell', 'Rent', 'Lease'].map(type => {
                                const dealForType = deals.find(d => {
                                    if (type === 'Sell') return d.intent === 'For Sale' || d.intent === 'Sale';
                                    if (type === 'Rent') return d.intent === 'For Rent' || d.intent === 'Rent';
                                    if (type === 'Lease') return d.intent === 'Lease';
                                    return false;
                                });
                                const dealExists = !!dealForType;
                                const isSold = currentStatus === 'Sold Out' && type === 'Sell';
                                const isDisabled = isSold || currentStatus === 'Inactive';

                                return (
                                    <div key={type}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '14px 18px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '12px',
                                            border: '1px solid rgba(241, 245, 249, 0.8)',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#fff';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                background: type === 'Sell' ? '#eff6ff' : type === 'Rent' ? '#f0fdf4' : '#faf5ff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: type === 'Sell' ? '#2563eb' : type === 'Rent' ? '#16a34a' : '#9333ea'
                                            }}>
                                                <i className={`fas fa-${type === 'Sell' ? 'hand-holding-usd' : type === 'Rent' ? 'key' : 'file-signature'}`}></i>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>{type}</span>
                                                {dealExists && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>
                                                            {dealForType.price || dealForType.budget || 'Price N/A'}
                                                        </span>
                                                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                                            • {new Date(dealForType.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {dealExists && <span style={{ fontSize: '0.6rem', padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontWeight: 800, marginLeft: '4px' }}>ACTIVE DEAL</span>}
                                        </div>

                                        {/* Matching Stats Inline */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                            <div style={{ display: 'flex', gap: '20px' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Matching Leads</span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#2563eb' }}>
                                                        {matchingLeads.filter(l => {
                                                            const lReq = l.requirement?.lookup_value || l.requirement || '';
                                                            const lIntent = l.intent || (typeof lReq === 'string' ? lReq : '');
                                                            if (type === 'Sell') return lIntent.toLowerCase().includes('buy') || lIntent.toLowerCase().includes('sale');
                                                            if (type === 'Rent') return lIntent.toLowerCase().includes('rent');
                                                            if (type === 'Lease') return lIntent.toLowerCase().includes('lease');
                                                            return false;
                                                        }).length}
                                                    </span>
                                                </div>
                                                <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>
                                                <div>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block' }}>Active Interest</span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#16a34a' }}>
                                                        {matchingLeads.filter(l => {
                                                            const lReq = l.requirement?.lookup_value || l.requirement || '';
                                                            const lIntent = l.intent || (typeof lReq === 'string' ? lReq : '');
                                                            const matchesIntent = (type === 'Sell' && (lIntent.toLowerCase().includes('buy') || lIntent.toLowerCase().includes('sale'))) ||
                                                                (type === 'Rent' && lIntent.toLowerCase().includes('rent')) ||
                                                                (type === 'Lease' && lIntent.toLowerCase().includes('lease'));
                                                            return matchesIntent && (l.status?.lookup_value === 'Active' || l.status === 'Active');
                                                        }).length}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Lead Match Icon Button */}
                                            <button
                                                className="primary-btn"
                                                style={{
                                                    width: '32px', height: '32px',
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                                                    color: '#fff',
                                                    border: 'none',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    padding: 0
                                                }}
                                                onClick={() => onNavigate('inventory-matching', inventory._id)}
                                                title="Find Matching Leads"
                                            >
                                                <i className="fas fa-sync-alt" style={{ fontSize: '0.8rem' }}></i>
                                            </button>

                                            {dealExists ? (
                                                <button
                                                    className="secondary-btn"
                                                    style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                                                    onClick={() => onNavigate('deal-detail', dealForType._id)}
                                                >
                                                    View Deal
                                                </button>
                                            ) : (
                                                <button
                                                    className="primary-btn"
                                                    disabled={isDisabled}
                                                    onClick={() => handleCreateDeal(type)}
                                                    style={{
                                                        fontSize: '0.85rem', padding: '6px 16px',
                                                        opacity: isDisabled ? 0.5 : 1,
                                                        cursor: isDisabled ? 'not-allowed' : 'pointer'
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

                                    {/* Dimensions Row (Size, Length, Width) */}
                                    <div style={{
                                        gridColumn: 'span 2',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: '16px',
                                        background: '#f8fafc',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #f1f5f9'
                                    }}>
                                        <DetailField label="Size / Area" value={`${renderValue(inventory.size)} ${renderValue(inventory.sizeUnit)}`} />
                                        <DetailField label="Length" value={inventory.length || (inventory.builtupDetails?.[0]?.length)} />
                                        <DetailField label="Width" value={inventory.width || (inventory.builtupDetails?.[0]?.width)} />
                                    </div>
                                </div>
                            </div>

                            {/* Sub-section: Orientation */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <i className="fas fa-compass" style={{ marginRight: '8px', fontSize: '0.8rem', color: '#f59e0b' }}></i> Orientation & Features
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <DetailField label="Direction" value={getLookupValue('Direction', inventory.direction)} />
                                    <DetailField label="Facing" value={getLookupValue('Facing', inventory.facing)} />
                                    <DetailField label="Road Width" value={getLookupValue('RoadWidth', inventory.roadWidth)} />
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailField label="City" value={inventory.address?.city} />
                                <DetailField label="Locality / Area" value={inventory.address?.locality || inventory.address?.area} />
                                <DetailField label="Post Office / Pincode" value={`${renderValue(inventory.address?.postOffice)} - ${renderValue(inventory.address?.pinCode)}`} />
                                <DetailField label="Landmark" value={inventory.address?.landmark} />
                                <div style={{ gridColumn: 'span 2' }}>
                                    <DetailField label="Full Address" value={`${renderValue(inventory.address?.hNo)} ${renderValue(inventory.address?.street)} ${renderValue(inventory.address?.locality)}`} />
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', borderRadius: '10px', height: '180px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                {(inventory.address?.lat && inventory.address?.lng) ? (
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        frameBorder="0"
                                        style={{ border: 0 }}
                                        src={`https://www.google.com/maps/embed/v1/view?key=YOUR_API_KEY&center=${inventory.address.lat},${inventory.address.lng}&zoom=15`}
                                        allowFullScreen
                                    ></iframe>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                            <DetailField label="Built-up Type" value={getLookupValue('BuiltupType', inventory.builtupType)} />
                            <DetailField label="Possession Status" value={inventory.possessionStatus} />
                            <DetailField label="Occupation Date" value={inventory.occupationDate ? new Date(inventory.occupationDate).toLocaleDateString() : '-'} />
                            <DetailField label="Age of Construction" value={inventory.ageOfConstruction || inventory.constructionAge} />
                            <DetailField label="Furnish Status" value={inventory.furnishType} />
                            <div style={{ gridColumn: 'span 3' }}>
                                <DetailField label="Furnished Items" value={inventory.furnishedItems} />
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

                        {/* IMAGES & VIDEOS GALLERY */}
                        <div style={{ marginTop: '32px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-images" style={{ color: '#3b82f6' }}></i> Images & Videos Gallery
                                </h4>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                                {/* Images rendering */}
                                {inventory.projectImages && inventory.projectImages.length > 0 ? (
                                    inventory.projectImages.map((img, idx) => (
                                        <div key={`img-${idx}`} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', height: '110px', background: '#f8fafc' }}>
                                            {img.url || img.previewUrl ? (
                                                <img src={img.url || img.previewUrl} alt={img.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-image" style={{ color: '#cbd5e1', fontSize: '1.5rem' }}></i>
                                                </div>
                                            )}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '8px 4px', fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>
                                                {img.title || img.category}
                                            </div>
                                        </div>
                                    ))
                                ) : null}

                                {/* Videos rendering */}
                                {inventory.projectVideos && inventory.projectVideos.length > 0 ? (
                                    inventory.projectVideos.map((vid, idx) => {
                                        const ytThumb = vid.type === 'YouTube' ? `https://img.youtube.com/vi/${vid.url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1]}/mqdefault.jpg` : null;
                                        return (
                                            <div key={`vid-${idx}`} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', height: '110px', background: '#0f172a', cursor: 'pointer' }} onClick={() => window.open(vid.url, '_blank')}>
                                                {ytThumb ? (
                                                    <img src={ytThumb} alt={vid.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <i className="fas fa-video" style={{ color: '#cbd5e1', fontSize: '1.5rem' }}></i>
                                                    </div>
                                                )}
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-play-circle" style={{ color: '#fff', fontSize: '2rem', opacity: 0.8 }}></i>
                                                </div>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '4px 8px', fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>
                                                    {vid.title}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : null}

                                {(!inventory.projectImages?.length && !inventory.projectVideos?.length) && (
                                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
                                        <i className="fas fa-camera-retro" style={{ fontSize: '2rem', color: '#cbd5e1', marginBottom: '12px' }}></i>
                                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No media files uploaded yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>




                    {/* PROPERTY ACTIVITIES TIMELINE */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-stream" style={{ color: '#2563eb' }}></i> Activity Timeline
                            </h3>
                            <button
                                onClick={() => onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }], { inventory })}
                                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <i className="fas fa-plus"></i> New Activity
                            </button>
                        </div>

                        <div style={{ padding: '0 10px' }}>
                            {activitiesLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}><div className="loader"></div></div>
                            ) : activities.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                    {activities.map((act, i) => (
                                        <div key={act._id || i} style={{ display: 'flex', gap: '20px', position: 'relative' }}>
                                            {/* Left line */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px' }}>
                                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fff', border: '3px solid #2563eb', zIndex: 1 }}></div>
                                                {i < activities.length - 1 && <div style={{ flex: 1, width: '2px', background: '#e2e8f0' }}></div>}
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1, paddingBottom: (i === activities.length - 1) ? '0' : '32px' }}>
                                                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #f1f5f9' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                        <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{act.subject}</span>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: '#fff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                            {new Date(act.dueDate || act.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 12px 0', lineHeight: '1.5' }}>{act.description}</p>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        {act.type && (
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
                                                                {act.type}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <i className="far fa-user" style={{ fontSize: '0.65rem' }}></i> {renderValue(act.assignedTo) || 'Owner/Associate'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 40px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
                                    <div style={{ width: '64px', height: '64px', background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                        <i className="fas fa-stream" style={{ fontSize: '1.5rem', color: '#cbd5e1' }}></i>
                                    </div>
                                    <h4 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>No Activities Yet</h4>
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 20px 0' }}>Start tracking interactions for this property unit and its contacts.</p>
                                    <button
                                        onClick={() => onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }], { inventory })}
                                        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}
                                    >
                                        Add First Activity
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                </main>

                {/* RIGHT SIDEBAR */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* CONSOLIDATED CONTACT INFO */}
                    <section className="detail-card" style={glassCardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-user-tie" style={{ color: '#6366f1', fontSize: '0.8rem' }}></i> Contact Information
                            </h3>
                            <button
                                className="text-btn"
                                style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
                                onClick={() => setIsOwnerModalOpen(true)}
                            >
                                Edit
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Unified view of Owner & Associate */}
                            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px', border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <i className="fas fa-crown" style={{ color: '#4f46e5', fontSize: '0.8rem' }}></i>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '0 0 2px 0', fontWeight: 700, textTransform: 'uppercase' }}>Owner</p>
                                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>{renderValue(inventory.owners?.[0]?.name || inventory.ownerName)}</p>
                                        <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>{renderValue(inventory.owners?.[0]?.phones?.[0]?.number || inventory.ownerPhone)}</p>
                                    </div>
                                </div>

                                {inventory.associatedContact && (
                                    <div style={{ display: 'flex', gap: '12px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <i className="fas fa-user-friends" style={{ color: '#16a34a', fontSize: '0.8rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '0 0 2px 0', fontWeight: 700, textTransform: 'uppercase' }}>Associate</p>
                                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>{renderValue(inventory.associates?.[0]?.name || inventory.associatedContact)}</p>
                                            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>{renderValue(inventory.associates?.[0]?.phones?.[0]?.number || inventory.associatedPhone)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => {
                                        const phone = inventory.owners?.[0]?.phones?.[0]?.number || inventory.ownerPhone;
                                        startCall(phone, inventory.owners?.[0]?.name || inventory.ownerName);
                                    }}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #d1fae5', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                                >
                                    <i className="fas fa-phone-alt"></i> Call
                                </button>
                                <button
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #dbeafe', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                                    onClick={() => {
                                        const phone = (inventory.owners?.[0]?.phones?.[0]?.number || inventory.ownerPhone || '').replace(/\D/g, '');
                                        window.open(`https://wa.me/${phone}`, '_blank');
                                    }}
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
                                            onClick={() => window.open(doc.fileUrl, '_blank')}
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

                    {/* LIFECYCLE CARD */}
                    <section className="detail-card" style={glassCardStyle}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-sync" style={{ color: '#2563eb', fontSize: '0.8rem' }}></i> Inventory Lifecycle
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <SidebarStat label="Created On" value={new Date(inventory.createdAt).toLocaleDateString()} />
                            <SidebarStat label="Last Updated" value={new Date(inventory.updatedAt).toLocaleDateString()} />
                            <SidebarStat label="Total Activities" value={activities.length} />
                            <SidebarStat label="Days in System" value={Math.floor((new Date() - new Date(inventory.createdAt)) / (1000 * 60 * 60 * 24))} />
                        </div>
                    </section>

                    {/* ASSIGNMENT CARD */}
                    <section className="detail-card" style={glassCardStyle}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-user-shield" style={{ color: '#16a34a', fontSize: '0.8rem' }}></i> Assignment & Visibility
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                            <SidebarStat label="Assigned To" value={renderValue(inventory.assignedTo) || 'Unassigned'} />
                            <SidebarStat label="Visibility" value={renderValue(inventory.visibleTo) || 'Everyone'} />
                        </div>
                        <button className="toolbar-btn" style={{ width: '100%', justifyContent: 'center', borderRadius: '10px', height: '40px', background: '#fff' }}>Change Assignment</button>
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

                </aside>

            </div>


            {/* MODALS */}
            <AddInventoryDocumentModal
                isOpen={isDocumentModalOpen}
                onClose={() => setIsDocumentModalOpen(false)}
                onSave={async (newDocs) => {
                    try {
                        const response = await api.put(`inventory/${inventoryId}`, {
                            inventoryDocuments: [...(inventory.inventoryDocuments || []), ...newDocs]
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

            <AddOwnerModal
                isOpen={isOwnerModalOpen}
                onClose={() => setIsOwnerModalOpen(false)}
                currentOwners={[
                    ...(inventory.owners && inventory.owners.length > 0
                        ? inventory.owners.map(o => ({
                            name: o.name,
                            mobile: o.phones?.[0]?.number || o.mobile || '',
                            role: 'Property Owner'
                        }))
                        : (inventory.ownerName ? [{ name: inventory.ownerName, mobile: inventory.ownerPhone, role: 'Property Owner' }] : [])
                    ),
                    ...(inventory.associates && inventory.associates.length > 0
                        ? inventory.associates.map(a => ({
                            name: a.name,
                            mobile: a.phones?.[0]?.number || a.mobile || '',
                            role: 'Associate'
                        }))
                        : (inventory.associatedContact ? [{ name: inventory.associatedContact, mobile: inventory.associatedPhone, role: 'Associate' }] : [])
                    )
                ]}
                onSave={async (owners) => {
                    try {
                        const owner = owners.find(o => o.role === 'Owner' || o.role === 'Property Owner');
                        const associate = owners.find(o => o.role === 'Associate' || o.role === 'Buyer');

                        const updates = {
                            ownerName: owner?.name || '',
                            ownerPhone: owner?.mobile || '',
                            associatedContact: associate?.name || '',
                            associatedPhone: associate?.mobile || ''
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
                initialRecipients={modalData}
            />

            <InventoryFeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                inventory={inventory}
                onSave={handleSaveFeedback}
            />

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
