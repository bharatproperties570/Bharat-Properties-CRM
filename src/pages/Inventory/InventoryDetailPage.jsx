import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from "../../utils/api";
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { useTriggers } from '../../context/TriggersContext';
import { useCall } from '../../context/CallContext';
import { renderValue } from '../../utils/renderUtils';

export default function InventoryDetailPage({ inventoryId, onBack, onNavigate, onAddActivity, onAddDeal, onEditInventory }) {
    const { masterFields } = usePropertyConfig();
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
            unitType: inventory.unitType,
            intent: type === 'Sell' ? 'For Sale' : 'For Rent',
            size: inventory.size,
            sizeUnit: inventory.sizeUnit,
            location: inventory.address?.locality || inventory.address?.area,
            owner: inventory.owners?.[0] || { name: inventory.ownerName, phone: inventory.ownerPhone },
            associatedContact: inventory.associates?.[0] || { name: inventory.associatedContact, phone: inventory.associatedPhone },
            isOwnerSelected: !!inventory.owners?.[0],
            isAssociateSelected: !!inventory.associates?.[0]
        });
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
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                                {renderValue(inventory.unitNo)}
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
                            {renderValue(inventory.projectName)} • {renderValue(inventory.block)} • {renderValue(inventory.category)}
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
                    <button
                        className="toolbar-btn"
                        onClick={() => onEditInventory(inventory)}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s' }}
                    >
                        <i className="fas fa-edit" style={{ marginRight: '6px', color: '#2563eb' }}></i> Edit
                    </button>
                    <button
                        className="toolbar-btn"
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s' }}
                        onClick={() => fireEvent('inventory_status_change_requested', inventory)}
                    >
                        <i className="fas fa-history" style={{ marginRight: '6px', color: '#f59e0b' }}></i> Status
                    </button>
                    <button
                        className="toolbar-btn"
                        onClick={() => onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }])}
                        style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, transition: 'all 0.2s' }}
                    >
                        <i className="fas fa-plus" style={{ marginRight: '6px', color: '#16a34a' }}></i> Activity
                    </button>
                    <div className="dropdown" style={{ position: 'relative' }}>
                        <button
                            className="primary-btn"
                            style={{ padding: '10px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}
                            onClick={() => setShowDealDropdown(!showDealDropdown)}
                        >
                            Create Deal <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem', marginLeft: '6px' }}></i>
                        </button>
                        {showDealDropdown && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '14px',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', minWidth: '200px',
                                zIndex: 1000, padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                                backdropFilter: 'blur(10px)'
                            }}>
                                {['Sell', 'Rent', 'Lease'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                            handleCreateDeal(type);
                                            setShowDealDropdown(false);
                                        }}
                                        style={{
                                            padding: '12px 14px', textAlign: 'left', background: 'transparent',
                                            border: 'none', borderRadius: '10px', cursor: 'pointer',
                                            fontSize: '0.9rem', fontWeight: 600, color: '#334155',
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#eff6ff';
                                            e.currentTarget.style.color = '#2563eb';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.color = '#334155';
                                        }}
                                    >
                                        <i className={`fas fa-${type === 'Sell' ? 'hand-holding-usd' : type === 'Rent' ? 'key' : 'file-signature'}`} style={{ width: '16px' }}></i>
                                        For {type}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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
                                            <span style={{ fontWeight: 600, color: '#334155' }}>{type}</span>
                                            {dealExists && <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontWeight: 700 }}>ACTIVE DEAL</span>}
                                        </div>
                                        {dealExists ? (
                                            <button
                                                className="secondary-btn"
                                                style={{ fontSize: '0.85rem' }}
                                                onClick={() => onNavigate('deal-matching', dealForType._id)}
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
                                );
                            })}
                        </div>
                        {currentStatus === 'Sold Out' && (
                            <p style={{ marginTop: '12px', fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                                <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }}></i> Sell type is locked because inventory is Sold.
                            </p>
                        )}
                    </section>

                    {/* BASIC UNIT DETAILS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                                <i className="fas fa-home" style={{ marginRight: '8px', color: '#2563eb' }}></i> Basic Unit Details
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailField label="Category" value={inventory.category} />
                                <DetailField label="Subcategory" value={inventory.subCategory} />
                                <DetailField label="Unit Type" value={inventory.unitType} />
                                <DetailField label="Unit Number" value={inventory.unitNo} />
                                <DetailField label="Project" value={inventory.projectName} />
                                <DetailField label="Block" value={inventory.block} />
                                <DetailField label="Size / Area" value={`${renderValue(inventory.size)} ${renderValue(inventory.sizeUnit)}`} />
                                <DetailField label="Floor" value={inventory.floor} />
                            </div>
                        </section>

                        <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                                <i className="fas fa-compass" style={{ marginRight: '8px', color: '#f59e0b' }}></i> Orientation & Features
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <DetailField label="Direction" value={inventory.direction} />
                                <DetailField label="Facing" value={inventory.facing} />
                                <DetailField label="Road Width" value={inventory.roadWidth} />
                                <DetailField label="Corner Unit" value={inventory.corner ? 'Yes' : 'No'} />
                                <DetailField label="Furnish Status" value={inventory.furnishType} />
                                <DetailField label="Construction Age" value={inventory.constructionAge} />
                                <DetailField label="Possession" value={inventory.possessionStatus} />
                                <DetailField label="Occupation Date" value={inventory.occupationDate} />
                            </div>
                        </section>
                    </div>

                    {/* LOCATION CARD */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <i className="fas fa-map-marker-alt" style={{ marginRight: '8px', color: '#ef4444' }}></i> Location Details
                        </h3>
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

                    {/* OWNER CARD */}
                    <section className="detail-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                <i className="fas fa-user-tie" style={{ marginRight: '8px', color: '#6366f1' }}></i> Owner Information
                            </h3>
                            <button className="text-btn" style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}>Edit Owner</button>
                        </div>
                        <div style={{ display: 'flex', gap: '24px' }}>
                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: '#94a3b8' }}>
                                <i className="fas fa-user"></i>
                            </div>
                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '20px' }}>
                                <div>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 4px 0' }}>Owner Name</p>
                                    <p style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>{renderValue(inventory.ownerName)}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 4px 0' }}>Phone Number</p>
                                    <p style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>{renderValue(inventory.ownerPhone)}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 4px 0' }}>Ownership Type</p>
                                    <p style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>{renderValue(inventory.ownership)}</p>
                                </div>
                                <div style={{ gridColumn: 'span 3' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="toolbar-btn" style={{ fontSize: '0.75rem' }}><i className="fas fa-phone-alt"></i> Call</button>
                                        <button className="toolbar-btn" style={{ fontSize: '0.75rem' }}><i className="fas fa-comment-alt"></i> Message</button>
                                        <button className="toolbar-btn" style={{ fontSize: '0.75rem' }}><i className="fas fa-envelope"></i> Email</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* TABS SECTION */}
                    <section className="tabs-container" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div className="tab-header" style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <TabBtn active={activeTab === 'full-details'} onClick={() => setActiveTab('full-details')}>Full Details</TabBtn>
                            <TabBtn active={activeTab === 'activity-log'} onClick={() => setActiveTab('activity-log')}>Activity Log</TabBtn>
                            <TabBtn active={activeTab === 'media'} onClick={() => setActiveTab('media')}>Media & Documents</TabBtn>
                        </div>
                        <div className="tab-content" style={{ padding: '24px' }}>
                            {activeTab === 'full-details' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                                    <DetailField label="Built-up breakup" value={inventory.builtupType} />
                                    <DetailField label="Dimensions" value={inventory.dimensions} />
                                    <DetailField label="Built-up Area" value={inventory.builtUpArea} />
                                    <DetailField label="Carpet Area" value={inventory.carpetArea} />
                                    <DetailField label="Super Area" value={inventory.superArea} />
                                    <DetailField label="Land Ownership" value={inventory.landOwnership} />
                                </div>
                            )}
                            {activeTab === 'activity-log' && (
                                <div style={{ padding: '10px' }}>
                                    {activitiesLoading ? (
                                        <div style={{ textAlign: 'center', padding: '20px' }}><div className="loader" style={{ width: '20px', height: '20px', margin: '0 auto' }}></div></div>
                                    ) : activities.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {activities.map((act, i) => (
                                                <div key={act._id || i} style={{ display: 'flex', gap: '16px', position: 'relative', paddingLeft: '20px' }}>
                                                    {i < activities.length - 1 && <div style={{ position: 'absolute', left: '26px', top: '24px', bottom: '-10px', width: '2px', background: '#f1f5f9' }}></div>}
                                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb', marginTop: '6px', zIndex: 1, border: '3px solid #fff', boxShadow: '0 0 0 1px #2563eb' }}></div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{act.subject}</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(act.dueDate || act.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>{act.description}</p>
                                                        {act.type && <span style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: '4px', color: '#475569' }}>{act.type}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                            <i className="fas fa-stream" style={{ fontSize: '2rem', marginBottom: '12px' }}></i>
                                            <p>No activities recorded for this inventory.</p>
                                            <button
                                                className="secondary-btn"
                                                style={{ marginTop: '12px' }}
                                                onClick={() => onAddActivity([{ type: 'Inventory', id: inventory._id, name: inventory.unitNo, model: 'Inventory' }])}
                                            >
                                                Add First Activity
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'media' && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                    <i className="fas fa-images" style={{ fontSize: '2rem', marginBottom: '12px' }}></i>
                                    <p>Photos and documents will be displayed here.</p>
                                    <button className="secondary-btn" style={{ marginTop: '16px' }}><i className="fas fa-upload"></i> Upload Media</button>
                                </div>
                            )}
                        </div>
                    </section>

                </main>

                {/* RIGHT SIDEBAR */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

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

                    {/* LEAD REFERENCE CARD */}
                    <section className="detail-card" style={{
                        ...glassCardStyle,
                        background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(219, 234, 254, 0.7) 100%)',
                        border: '1px solid rgba(37, 99, 235, 0.1)'
                    }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e40af', marginBottom: '16px' }}>Lead Reference</h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#2563eb', margin: 0, lineHeight: 1 }}>{matchingLeads.length}</p>
                                <p style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600, margin: '4px 0 0 0' }}>Matching Leads</p>
                            </div>
                            <div style={{ width: '1px', height: '30px', background: 'rgba(37, 99, 235, 0.2)' }}></div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#16a34a', margin: 0, lineHeight: 1 }}>{activeLeadsCount}</p>
                                <p style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, margin: '4px 0 0 0' }}>Active Interest</p>
                            </div>
                        </div>
                        <button
                            className="primary-btn"
                            style={{
                                width: '100%',
                                justifyContent: 'center',
                                borderRadius: '10px',
                                height: '44px',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                                border: 'none',
                                fontWeight: 700
                            }}
                            onClick={() => fireEvent('inventory_matching_requested', inventory)}
                        >
                            View Matching Leads
                        </button>
                    </section>

                </aside>

            </div>

            {/* SIMILAR PROPERTIES SECTION */}
            {similarProperties.length > 0 && (
                <div style={{ padding: '0 24px 40px', maxWidth: '1600px', margin: '0 auto' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-layer-group" style={{ color: '#2563eb' }}></i> Other units in {renderValue(inventory.projectName)}
                    </h3>
                    <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '16px', scrollbarWidth: 'thin' }}>
                        {similarProperties.map(prop => (
                            <div
                                key={prop._id}
                                onClick={() => onNavigate('inventory-detail', prop._id)}
                                style={{
                                    minWidth: '280px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0',
                                    padding: '16px', cursor: 'pointer', transition: 'all 0.2s ease',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ fontWeight: 800, color: '#1e293b' }}>{renderValue(prop.unitNo)}</span>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: '10px', color: '#64748b', fontWeight: 700 }}>{renderValue(prop.category)}</span>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0' }}>{renderValue(prop.block)} • {renderValue(prop.floor)} Floor</p>
                                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: '8px 0 0' }}>{renderValue(prop.size)} {renderValue(prop.sizeUnit)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
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
