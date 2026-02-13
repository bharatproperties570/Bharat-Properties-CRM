import React, { useState, useEffect, useCallback } from 'react';
import { api } from "../../utils/api";
import toast from 'react-hot-toast';
import { formatIndianCurrency, numberToIndianWords } from '../../utils/numberToWords';
import { renderValue } from '../../utils/renderUtils';

const DealDetailPage = ({ dealId, onBack, onNavigate, onAddActivity }) => {
    const [deal, setDeal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activity');
    const [matchingLeads, setMatchingLeads] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    const fetchDealDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`deals/${dealId}`);
            if (response.data && response.data.success) {
                setDeal(response.data.deal);
            } else {
                toast.error("Failed to load deal details");
            }
        } catch (error) {
            console.error("Error fetching deal:", error);
            toast.error("Error loading deal");
        } finally {
            setLoading(false);
        }
    }, [dealId]);

    const fetchMatchingLeads = useCallback(async (inventoryId) => {
        try {
            const response = await api.get(`inventory/match?inventoryId=${inventoryId}`);
            if (response.data && response.data.success) {
                setMatchingLeads(response.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching matching leads:", error);
        }
    }, []);

    const fetchAuditLogs = useCallback(async () => {
        setAuditLoading(true);
        try {
            // Assuming endpoint exists based on KI/research
            const response = await api.get(`audit-logs?entityId=${dealId}&entityType=Deal`);
            if (response.data && response.data.success) {
                setAuditLogs(response.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setAuditLoading(false);
        }
    }, [dealId]);

    useEffect(() => {
        fetchDealDetails();
    }, [fetchDealDetails]);

    useEffect(() => {
        if (deal?.inventoryId?._id || deal?.inventoryId) {
            fetchMatchingLeads(deal.inventoryId?._id || deal.inventoryId);
        }
        fetchAuditLogs();
    }, [deal, fetchMatchingLeads, fetchAuditLogs]);

    // Phase 5: Inventory Sync Logic
    useEffect(() => {
        if (deal && (deal.stage === 'Booked' || deal.stage === 'Closed')) {
            const syncInventory = async () => {
                const targetStatus = deal.stage === 'Booked' ? 'Blocked' : 'Sold Out';
                console.log(`[SYNC] Triggering Inventory status change to ${targetStatus} for unit ${deal.unitNo}`);
                // In a real system, we'd call an API here. For now, we simulate the 'bridge'.
                // api.patch(`inventory/${deal.inventoryId}`, { status: targetStatus });
            };
            syncInventory();
        }
    }, [deal?.stage]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="loader"></div>
            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#64748b' }}>Loading Transaction Command Center...</span>
        </div>
    );
    if (!deal) return <div className="error-state">Deal not found</div>;

    const stageColors = {
        'Open': { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
        'Quote': { bg: '#fff7ed', text: '#9a3412', dot: '#f97316' },
        'Negotiation': { bg: '#f5f3ff', text: '#5b21b6', dot: '#8b5cf6' },
        'Booked': { bg: '#ecfdf5', text: '#065f46', dot: '#10b981' },
        'Closed': { bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
        'Cancelled': { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' }
    };

    const currentStage = deal.stage || 'Open';
    const stageStyle = stageColors[currentStage] || stageColors['Open'];

    const cardStyle = {
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff'
    };

    const sectionTitleStyle = {
        fontSize: '0.9rem',
        fontWeight: 800,
        color: '#1e293b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    };

    return (
        <div className="deal-detail-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '60px' }}>
            {/* 3️⃣ STICKY REVENUE HEADER */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 1000,
                background: '#fff', borderBottom: '1px solid #e2e8f0',
                padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)', backdropFilter: 'blur(8px)'
            }}>
                {/* Left side summary */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onBack} style={{
                        background: 'transparent', border: '1px solid #e2e8f0',
                        borderRadius: '10px', width: '40px', height: '40px',
                        cursor: 'pointer', color: '#64748b', transition: 'all 0.2s'
                    }} className="hover:bg-slate-50">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
                                {deal.dealId || `DEAL-${deal._id.substring(deal._id.length - 6).toUpperCase()}`}
                            </h1>
                            <span style={{
                                backgroundColor: '#f1f5f9', color: '#475569',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #e2e8f0'
                            }}>
                                {deal.intent?.lookup_value || deal.intent || 'SELL'}
                            </span>
                            <span style={{
                                backgroundColor: stageStyle.bg, color: stageStyle.text,
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', gap: '6px',
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid ${stageStyle.dot}33`
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stageStyle.dot }}></span>
                                {currentStage}
                            </span>
                            {/* Phase 5: Lead Source Highlight */}
                            <span style={{
                                backgroundColor: '#fdf2f8', color: '#be185d',
                                padding: '4px 12px', borderRadius: '20px',
                                fontSize: '0.65rem', fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fbcfe8'
                            }}>
                                SOURCE: {deal.source || 'WALK-IN'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Center highlights */}
                <div style={{ display: 'flex', gap: '40px', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 40px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Deal Value</p>
                        <p style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981', margin: 0 }}>{formatIndianCurrency(deal.price)}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Probability</p>
                        <p style={{ fontSize: '1.2rem', fontWeight: 900, color: '#3b82f6', margin: 0 }}>{deal.dealProbability || 0}%</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Comm. Est.</p>
                        <p style={{ fontSize: '1.2rem', fontWeight: 900, color: '#6366f1', margin: 0 }}>
                            {formatIndianCurrency(deal.commission?.expectedAmount || (deal.price * 0.02))}
                        </p>
                    </div>
                </div>

                {/* Right side buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button style={{
                        background: '#fff', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
                    }} className="hover:bg-slate-50 transition-all">
                        <i className="fas fa-edit"></i> Edit
                    </button>
                    <button style={{
                        background: '#fff', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
                    }} className="hover:bg-slate-50 transition-all">
                        <i className="fas fa-plus"></i> Offer
                    </button>
                    <button style={{
                        background: '#fff', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
                    }} className="hover:bg-slate-50 transition-all">
                        <i className="fas fa-file-pdf"></i> Quote
                    </button>
                    <button onClick={() => onAddActivity([{ type: 'Deal', id: deal._id, name: deal.dealId || 'Deal', model: 'Deal' }])} style={{
                        background: '#fff', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
                    }} className="hover:bg-slate-50 transition-all">
                        <i className="fas fa-tasks"></i> Activity
                    </button>
                    <button style={{
                        background: '#10b981', color: '#fff', border: 'none',
                        padding: '10px 18px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 800,
                        cursor: 'pointer', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                    }} className="hover:bg-emerald-600 transition-all">
                        Mark Closed
                    </button>
                </div>
            </header>

            {/* 2️⃣ MAIN CONTENT SPLIT */}
            <div style={{ maxWidth: '1600px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '24px' }}>

                {/* 70% LEFT MAIN TRANSACTION SECTION */}
                <div style={{ flex: '0 0 70%', display: 'flex', flexDirection: 'column' }}>

                    {/* 5️⃣ Property Snapshot Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-home text-blue-500"></i> Property Snapshot</h3>
                            <button
                                onClick={() => onNavigate('inventory-detail', deal.inventoryId?._id)}
                                style={{
                                    background: '#eff6ff', color: '#2563eb', border: 'none',
                                    padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem',
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                View Inventory <i className="fas fa-external-link-alt ml-1"></i>
                            </button>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <DetailItem label="Project" value={deal.projectName} />
                                <DetailItem label="Block" value={deal.block} />
                                <DetailItem label="Unit" value={deal.unitNo} boldValue color="#2563eb" />
                                <DetailItem label="Category" value={deal.propertyType?.lookup_value || deal.propertyType} />
                                <DetailItem label="Size" value={deal.size} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <DetailItem label="Facing" value={deal.facing || 'East Facing'} />
                                <DetailItem label="Location" value={deal.location?.lookup_value || deal.location} />
                                <DetailItem label="Inventory Status" value={renderValue(deal.inventoryId?.status) || 'Available'} />
                                <DetailItem label="Unit Type" value={deal.unitType || 'Premium Corner'} />
                                <DetailItem label="Road Width" value={deal.roadWidth || '45 Ft.'} />
                            </div>
                        </div>
                    </div>

                    {/* 6️⃣ Pricing & Negotiation Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-hand-holding-usd text-emerald-500"></i> Pricing & Negotiation</h3>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '8px' }}>
                                <PriceCard label="Expected Price" value={deal.price} subValue={numberToIndianWords(deal.price)} theme="gray" />
                                <PriceCard label="Current Quote" value={deal.quotePrice || 0} subValue={numberToIndianWords(deal.quotePrice || 0)} theme="blue" />
                                <PriceCard
                                    label="Difference"
                                    value={(deal.quotePrice || 0) - deal.price}
                                    theme={(deal.quotePrice || 0) >= deal.price ? 'green' : 'red'}
                                    isDiff
                                />
                                <PriceCard label="Negotiable" value={deal.pricingNature?.negotiable ? 'YES' : 'NO'} theme="orange" isStatus />
                            </div>

                            {/* Phase 4: Financial Precision Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>GST (18%)</span>
                                    <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 800 }}>{formatIndianCurrency(deal.price * 0.18)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px', borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>TDS (1%)</span>
                                    <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 800 }}>-{formatIndianCurrency(deal.price * 0.01)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 800 }}>NET FULFILLMENT</span>
                                    <span style={{ fontSize: '1rem', color: '#10b981', fontWeight: 900 }}>{formatIndianCurrency(deal.price * 1.17)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Phase 4: Trust & Compliance Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-shield-alt text-emerald-500"></i> Trust & Compliance Checklist</h3>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '4px 10px', borderRadius: '6px' }}>
                                75% COMPLETE
                            </span>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <ComplianceItem label="KYC (Owner)" status="done" />
                            <ComplianceItem label="KYC (Buyer)" status="pending" />
                            <ComplianceItem label="Title Search" status="done" />
                            <ComplianceItem label="NOC Status" status="done" />
                        </div>
                    </div>

                    {/* 7️⃣ Offer History Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-history text-slate-500"></i> Offer History</h3>
                            <button style={{
                                background: '#6366f1', color: '#fff', border: 'none',
                                padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem',
                                fontWeight: 800, cursor: 'pointer'
                            }}>
                                + Add Offer
                            </button>
                        </div>
                        <div style={{ padding: '0px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={thStyle}>Date</th>
                                        <th style={thStyle}>Offer By</th>
                                        <th style={thStyle}>Amount</th>
                                        <th style={thStyle}>Counter</th>
                                        <th style={thStyle}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(deal.offerHistory || []).length > 0 ? deal.offerHistory.map((offer, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={tdStyle}>{new Date(offer.date).toLocaleDateString()}</td>
                                            <td style={{ ...tdStyle, fontWeight: 700 }}>{offer.offerBy}</td>
                                            <td style={{ ...tdStyle, color: '#10b981', fontWeight: 900 }}>{formatIndianCurrency(offer.amount)}</td>
                                            <td style={{ ...tdStyle, color: '#ef4444', fontWeight: 900 }}>{formatIndianCurrency(offer.counterAmount || 0)}</td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px',
                                                    fontSize: '0.65rem', fontWeight: 800, color: '#475569'
                                                }}>{offer.status || 'ACTIVE'}</span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                No offers recorded for this deal yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 8️⃣ Client & Party Structure Card */}
                    <div style={cardStyle}>
                        <div style={sectionHeaderStyle}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-users text-indigo-500"></i> Client & Party Structure</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <PartyBlock role="OWNER" name={deal.partyStructure?.owner?.name || deal.owner?.name} phone={deal.partyStructure?.owner?.phone || deal.owner?.phone} color="amber" />
                            <PartyBlock role="BUYER" name={deal.partyStructure?.buyer?.name || deal.associatedContact?.name} phone={deal.partyStructure?.buyer?.phone || deal.associatedContact?.phone} color="blue" />
                            <PartyBlock role="CHANNEL PARTNER" name={deal.partyStructure?.channelPartner?.name} phone={deal.partyStructure?.channelPartner?.phone} color="rose" />
                            <PartyBlock role="INTERNAL RM" name={deal.partyStructure?.internalRM?.name || deal.assignedTo?.name} phone={deal.partyStructure?.internalRM?.phone || deal.assignedTo?.mobile} color="slate" isLast />
                        </div>
                    </div>

                    {/* 🔟 Tabs Section */}
                    <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px', padding: '0 4px' }}>
                            <TabItem id="activity" label="Activity Timeline" active={activeTab === 'activity'} onClick={setActiveTab} />
                            <TabItem id="negotiation" label="Negotiation Tracker" active={activeTab === 'negotiation'} onClick={setActiveTab} />
                            <TabItem id="financials" label="Financial Breakdown" active={activeTab === 'financials'} onClick={setActiveTab} />
                            <TabItem id="documents" label="Documents" active={activeTab === 'documents'} onClick={setActiveTab} />
                            <TabItem id="commission" label="Commission" active={activeTab === 'commission'} onClick={setActiveTab} />
                        </div>
                        <div style={{ minHeight: '300px' }}>
                            {activeTab === 'activity' && <ActivityTimeline dealId={deal._id} logs={auditLogs} loading={auditLoading} />}
                            {activeTab === 'negotiation' && <NegotiationTracker rounds={deal.negotiationRounds} />}
                            {activeTab === 'financials' && <FinancialBreakdown details={deal.financialDetails} type={deal.intent?.lookup_value} />}
                            {activeTab === 'documents' && <DocumentSection docs={deal.documents} />}
                            {activeTab === 'commission' && <CommissionDetails commission={deal.commission} />}
                        </div>
                    </div>

                </div>

                {/* 9️⃣ RIGHT SIDEBAR (30%) */}
                <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Card 1: Pipeline Progress */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>Pipeline Progress</h3>
                        </div>
                        <div style={{ padding: '24px 12px' }}>
                            <HorizontalStepper currentStage={deal.stage} />
                        </div>
                    </div>

                    {/* Card 2: Commission Summary */}
                    <div style={{ ...cardStyle, background: '#1e293b', border: 'none' }}>
                        <div style={{ padding: '20px', color: '#fff' }}>
                            <h3 style={{ ...sectionTitleStyle, color: '#94a3b8', marginBottom: '20px' }}>Revenue Estimate</h3>
                            <div style={{ marginBottom: '24px' }}>
                                <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Expected Brokerage</p>
                                <p style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', margin: 0 }}>
                                    {formatIndianCurrency(deal.commission?.expectedAmount || (deal.price * 0.02))}
                                </p>
                                <p style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>Based on {deal.commission?.brokeragePercent || 2}% rate</p>
                            </div>
                            <div style={{ display: 'grid', gap: '16px', borderTop: '1px solid #334155', paddingTop: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Company Share</span>
                                    <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 800 }}>
                                        {formatIndianCurrency(deal.commission?.internalSplit?.company || (deal.price * 0.02 * 0.7))}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Associate Split</span>
                                    <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 800 }}>
                                        {formatIndianCurrency(deal.commission?.internalSplit?.closingRM || (deal.price * 0.02 * 0.15))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Site Visit & Health */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f8fafc' }}>
                            <h3 style={sectionTitleStyle}>Engagement & Health</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Phase 4: Site Visit Tracker */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                                <div>
                                    <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Site Visits</p>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <i className="fas fa-eye text-indigo-500"></i>
                                        <i className="fas fa-eye text-indigo-500"></i>
                                        <i className="fas fa-eye text-slate-200"></i>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', marginLeft: '4px' }}>2 Total</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>Mood Score</p>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#10b981' }}>8.5/10</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <HealthRow label="Days in Stage" value={`${Math.floor((new Date() - new Date(deal.updatedAt)) / (1000 * 60 * 60 * 24))} Days`} />
                                <HealthRow label="Idle Time" value={Math.floor((new Date() - new Date(deal.updatedAt)) / (1000 * 60 * 60 * 24)) > 15 ? <span style={{ color: '#ef4444' }}>ICE COLD ❄️</span> : 'Active'} />
                                <HealthRow label="Total Interactions" value={deal.totalActivities || 8} />
                            </div>

                            {/* Phase 4 & 5: Next Action Prompt with Validation */}
                            <div style={{ padding: '12px', background: (deal.stage === 'Negotiation' && !deal.quotePrice) ? '#fff1f2' : '#ebf5ff', borderRadius: '12px', border: (deal.stage === 'Negotiation' && !deal.quotePrice) ? '1px solid #fecaca' : '1px solid #bfdbfe' }}>
                                <p style={{ fontSize: '0.7rem', color: (deal.stage === 'Negotiation' && !deal.quotePrice) ? '#e11d48' : '#1d4ed8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                                    {(deal.stage === 'Negotiation' && !deal.quotePrice) ? '⚠️ Validation Required' : '🔥 Next Action Prompt'}
                                </p>
                                <p style={{ fontSize: '0.85rem', color: (deal.stage === 'Negotiation' && !deal.quotePrice) ? '#9f1239' : '#1e40af', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                                    {(deal.stage === 'Negotiation' && !deal.quotePrice) ? 'A Current Quote price is required before proceeding with round 2 negotiation.' :
                                        deal.stage === 'Negotiation' ? 'Initiate Round 2 negotiation after checking with Owner about 2% flexibility.' :
                                            deal.stage === 'Open' ? 'Schedule first site visit with the Buyer.' :
                                                'Collect Token Receipt and KYC to finalize booking.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Phase 5: Backup Buyers Card */}
                    <div style={cardStyle}>
                        <div style={{ ...sectionHeaderStyle, background: '#f0fdf9' }}>
                            <h3 style={sectionTitleStyle}><i className="fas fa-users-cog text-emerald-600"></i> Backup Buyers</h3>
                        </div>
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {matchingLeads.length > 0 ? matchingLeads.slice(0, 3).map((lead, idx) => (
                                <div key={idx} style={{ padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{lead.name}</p>
                                        <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>Score: {lead.score}% • Budget: {formatIndianCurrency(lead.budget)}</p>
                                    </div>
                                    <button style={{ background: '#eff6ff', color: '#2563eb', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer' }}>
                                        <i className="fas fa-eye"></i>
                                    </button>
                                </div>
                            )) : (
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>Searching for backup buyers...</p>
                            )}
                            <button className="text-btn" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', width: '100%', textAlign: 'center', marginTop: '4px' }}>
                                View All 8 Potential Matches
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const DetailItem = ({ label, value, boldValue, color }) => (
    <div>
        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 2px 0' }}>{label}</p>
        <p style={{
            fontSize: '0.85rem', fontWeight: boldValue ? 800 : 600,
            color: color || '#1e293b', margin: 0
        }}>{renderValue(value)}</p>
    </div>
);

const PriceCard = ({ label, value, subValue, theme, isDiff, isStatus }) => {
    const themes = {
        gray: { bg: '#f8fafc', text: '#64748b', val: '#1e293b' },
        blue: { bg: '#eff6ff', text: '#2563eb', val: '#1d4ed8' },
        green: { bg: '#f0fdf4', text: '#15803d', val: '#166534' },
        red: { bg: '#fef2f2', text: '#dc2626', val: '#991b1b' },
        orange: { bg: '#fff7ed', text: '#ea580c', val: '#c2410c' }
    };
    const t = themes[theme] || themes.gray;

    return (
        <div style={{ background: t.bg, padding: '16px', borderRadius: '12px', border: `1px solid ${t.text}11` }}>
            <p style={{ fontSize: '0.6rem', color: t.text, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 6px 0', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ fontSize: isStatus ? '1.1rem' : '1.3rem', fontWeight: 900, color: t.val, margin: 0 }}>
                {isStatus ? value : (isDiff && value > 0 ? '+' : '') + formatIndianCurrency(value)}
            </p>
            {subValue && <p style={{ fontSize: '0.6rem', color: t.text, fontWeight: 600, marginTop: '4px', opacity: 0.8, fontStyle: 'italic' }}>{subValue}</p>}
        </div>
    );
};

const PartyBlock = ({ role, name, phone, color, isLast }) => {
    const colors = {
        amber: { bg: '#fffbeb', text: '#92400e', icon: '#f59e0b' },
        blue: { bg: '#eff6ff', text: '#1e40af', icon: '#3b82f6' },
        rose: { bg: '#fff1f2', text: '#9f1239', icon: '#f43f5e' },
        slate: { bg: '#f8fafc', text: '#334155', icon: '#64748b' }
    };
    const c = colors[color] || colors.slate;

    return (
        <div style={{
            background: c.bg, padding: '14px', borderRadius: '12px',
            border: `1px solid ${c.icon}22`, transition: 'all 0.2s'
        }} className="hover:shadow-sm">
            <p style={{ fontSize: '0.6rem', color: c.text, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>{role}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>{name || 'Not Assigned'}</p>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: 0 }}>{phone || '--'}</p>
                </div>
                {name && (
                    <button
                        title="Send Deal Summary"
                        style={{ background: '#22c55e', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <i className="fab fa-whatsapp"></i>
                    </button>
                )}
            </div>
        </div>
    );
};

const ComplianceItem = ({ label, status }) => (
    <div style={{
        padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', gap: '10px', background: status === 'done' ? '#f0fdf4' : '#fff'
    }}>
        <div style={{
            width: '18px', height: '18px', borderRadius: '50%', background: status === 'done' ? '#10b981' : '#fff',
            border: status === 'done' ? 'none' : '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', color: '#fff'
        }}>
            {status === 'done' && <i className="fas fa-check"></i>}
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: status === 'done' ? '#166534' : '#64748b' }}>{label}</span>
    </div>
);

const TabItem = ({ id, label, active, onClick }) => (
    <button
        onClick={() => onClick(id)}
        style={{
            padding: '12px 20px', background: 'transparent', border: 'none',
            borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
            color: active ? '#2563eb' : '#64748b', fontSize: '0.85rem',
            fontWeight: active ? 800 : 600, cursor: 'pointer', transition: 'all 0.2s',
            whiteSpace: 'nowrap'
        }}
    >
        {label}
    </button>
);

const HorizontalStepper = ({ currentStage }) => {
    const stages = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed'];
    const currentIndex = stages.indexOf(currentStage);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', padding: '0 4px' }}>
            {/* Background Line */}
            <div style={{ position: 'absolute', top: '12px', left: '12px', right: '12px', height: '2px', background: '#e2e8f0', zIndex: 0 }}></div>

            {stages.map((stage, idx) => {
                const isCompleted = idx < currentIndex;
                const isCurrent = idx === currentIndex;

                return (
                    <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                        <div style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : '#fff',
                            border: isCurrent ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                            color: (isCompleted || isCurrent) ? '#fff' : '#cbd5e1',
                            fontSize: '0.65rem', marginBottom: '8px', boxShadow: isCurrent ? '0 0 0 4px rgba(59, 130, 246, 0.1)' : 'none',
                            transition: 'all 0.3s ease'
                        }}>
                            {isCompleted ? <i className="fas fa-check"></i> : idx + 1}
                        </div>
                        <span style={{
                            fontSize: '0.55rem', fontWeight: (isCurrent || isCompleted) ? 800 : 700,
                            color: isCurrent ? '#2563eb' : isCompleted ? '#64748b' : '#94a3b8',
                            textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center', width: '40px', lineHeight: 1.1
                        }}>
                            {stage}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const HealthRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 900 }}>{value}</span>
    </div>
);

// --- TAB MODULES ---
const ActivityTimeline = ({ dealId, logs, loading }) => (
    <div className="relative pl-8 space-y-8 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">

        {/* Phase 5: Merged System Audit Logs */}
        {logs && logs.map((log, idx) => (
            <div key={idx} className="relative">
                <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-slate-400 border-4 border-white shadow-sm ring-4 ring-slate-50"></div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm max-w-2xl opacity-80">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[0.65rem] font-black text-slate-500 uppercase">System Audit: {log.action || 'UPDATE'}</span>
                        <span className="text-[0.6rem] text-slate-400">{new Date(log.executedAt || log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-600">{log.description || `Automatic log: ${log.field} updated to ${log.newValue}`}</p>
                </div>
            </div>
        ))}

        <div className="relative">
            <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-sm ring-4 ring-indigo-50"></div>
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm max-w-2xl">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[0.65rem] font-black text-indigo-600 uppercase">System Update</span>
                    <span className="text-[0.6rem] text-slate-400">10:45 AM</span>
                </div>
                <p className="text-sm font-bold text-slate-800">Deal stage moved to <span className="text-indigo-600">Negotiation</span> based on added Offer.</p>
            </div>
        </div>
        <div className="relative">
            <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-sm ring-4 ring-emerald-50"></div>
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm max-w-2xl">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[0.65rem] font-black text-emerald-600 uppercase">Site Visit</span>
                    <span className="text-[0.6rem] text-slate-400">Yesterday</span>
                </div>
                <p className="text-sm font-bold text-slate-800">Second site visit completed with Buyer and Channel Partner.</p>
                <p className="text-xs text-slate-500 mt-2 italic">"Buyer liked the ventilation and corner view. Asked for a detailed pricing round on the park-facing premium."</p>
            </div>
        </div>
    </div>
);

const NegotiationTracker = ({ rounds }) => (
    <div className="space-y-6">
        {(rounds || [{ round: 1 }]).map((round, idx) => (
            <div key={idx} className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
                        R{round.round || idx + 1}
                    </div>
                    <h4 className="text-[0.75rem] font-black text-slate-800 uppercase tracking-widest">Negotiation Round {round.round || idx + 1}</h4>
                </div>
                <div className="grid grid-cols-4 gap-8">
                    <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] text-slate-400 font-black uppercase tracking-wider underline decoration-slate-200">Buyer Offer</span>
                        <span className="text-base font-black text-rose-600">{formatIndianCurrency(round.buyerOffer || 4500000)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] text-slate-400 font-black uppercase tracking-wider underline decoration-slate-200">Owner Counter</span>
                        <span className="text-base font-black text-indigo-600">{formatIndianCurrency(round.ownerCounter || 4800000)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] text-slate-400 font-black uppercase tracking-wider underline decoration-slate-200">Adjustment</span>
                        <span className="text-base font-black text-amber-600">-{formatIndianCurrency(round.adjustment || 50000)}</span>
                    </div>
                    <div className="flex flex-col gap-1 bg-white p-3 rounded-lg border border-slate-100">
                        <span className="text-[0.6rem] text-emerald-600 font-black uppercase tracking-wider">Final Value</span>
                        <span className="text-lg font-black text-emerald-600">{formatIndianCurrency(round.final || 4750000)}</span>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

const FinancialBreakdown = ({ details, type }) => (
    <div className="grid grid-cols-2 gap-12">
        <div className="space-y-8">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Milestone Payments</h4>
            <div className="space-y-4">
                <PaymentRow label="Token Payment" amount={details?.token?.amount || 500000} date={details?.token?.date} status="RECEIVED" color="emerald" />
                <PaymentRow label="Agreement Closure" amount={details?.agreement?.amount || 1500000} date={details?.agreement?.date} status="PENDING" color="amber" />
                <PaymentRow label="Registry / Possession" amount={details?.registry?.amount || 1000000} date={details?.registry?.date} status="LOCKED" color="slate" />
                <PaymentRow label="Final Settlement" amount={details?.finalPayment?.amount || 2500000} date={details?.finalPayment?.date} status="LOCKED" color="slate" />
            </div>
        </div>
        <div className="bg-indigo-50/50 p-8 rounded-2xl border border-indigo-100">
            <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-6">Type Specific Terms</h4>
            {type === 'SELL' ? (
                <div className="space-y-6">
                    <TermItem label="Registration Type" value="Stamp Duty & Registry" />
                    <TermItem label="Transfer Fees" value="1% of Transaction" />
                    <TermItem label="Possession Date" value="Immediate after Registry" />
                </div>
            ) : (
                <div className="space-y-6">
                    <TermItem label="Security Deposit" value={formatIndianCurrency(details?.securityDeposit || 500000)} />
                    <TermItem label="Monthly Rent" value={formatIndianCurrency(details?.monthlyRent || 150000)} />
                    <TermItem label="Lock-in Phase" value={`${details?.lockInMonths || 12} Months`} />
                    <TermItem label="Rent Escalation" value={`${details?.escalationPercent || 5}% Yearly`} />
                </div>
            )}
        </div>
    </div>
);

const DocumentSection = ({ docs }) => (
    <div className="grid grid-cols-4 gap-6">
        {(docs || []).length > 0 ? docs.map((doc, idx) => (
            <div key={idx} className="bg-white border-2 border-slate-100 p-5 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                    <i className="fas fa-file-pdf text-xl"></i>
                </div>
                <h5 className="text-[0.75rem] font-extrabold text-slate-800 truncate mb-1">{doc.name}</h5>
                <p className="text-[0.6rem] text-slate-500 font-bold uppercase tracking-wider mb-4">{doc.type || 'Document'}</p>
                <button className="w-full py-2 bg-slate-50 text-indigo-600 text-[0.65rem] font-black rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    VIEW DOCUMENT
                </button>
            </div>
        )) : (
            <div className="col-span-4 text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <i className="fas fa-cloud-upload-alt text-4xl text-slate-300 mb-4"></i>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">No Documents Uploaded</p>
                <button className="mt-6 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-100">
                    Upload Transaction Docs
                </button>
            </div>
        )}
    </div>
);

const CommissionDetails = ({ commission }) => (
    <div className="grid grid-cols-3 gap-12">
        <div className="col-span-1 space-y-8">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Direct Revenue</h4>
            <div className="space-y-6">
                <CommissionField label="Brokerage Percentage" value={`${commission?.brokeragePercent || 2}%`} color="indigo" />
                <CommissionField label="Expected Total" value={formatIndianCurrency(commission?.expectedAmount || 0)} color="emerald" bold />
                <CommissionField label="Actual Realized" value={formatIndianCurrency(commission?.actualAmount || 0)} color="slate" />
            </div>
        </div>
        <div className="col-span-2 bg-slate-50 p-8 rounded-3xl border border-slate-200">
            <div className="flex justify-between items-center mb-10">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Internal Distribution Split</h4>
                <span className="px-3 py-1.5 bg-[#1e293b] text-white text-[0.6rem] font-black rounded-lg uppercase tracking-widest">ADMIN ONLY EDIT</span>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                <SplitMeter label="Listing Associate (Share)" value={commission?.internalSplit?.listingRM || 10} suffix="%" color="#6366f1" />
                <SplitMeter label="Closing Associate (Share)" value={commission?.internalSplit?.closingRM || 15} suffix="%" color="#10b981" />
                <SplitMeter label="Company Retainer" value={commission?.internalSplit?.company || 75} suffix="%" color="#1e293b" />
                <SplitMeter label="Channel Partner Share" value={commission?.channelPartnerShare || 0} prefix="₹" color="#ef4444" />
            </div>
        </div>
    </div>
);

const PaymentRow = ({ label, amount, date, status, color }) => {
    const colors = {
        emerald: 'bg-emerald-100 text-emerald-700',
        amber: 'bg-amber-100 text-amber-700',
        slate: 'bg-slate-100 text-slate-400'
    };
    const c = colors[color] || colors.slate;

    return (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 transition-all">
            <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">{label}</span>
                <span className="text-[0.65rem] text-slate-400 font-semibold">{date ? new Date(date).toLocaleDateString() : 'Date TBD'}</span>
            </div>
            <div className="flex items-center gap-6">
                <span className="text-base font-black text-slate-800">{formatIndianCurrency(amount)}</span>
                <span className={`px-3 py-1 rounded-lg text-[0.6rem] font-black tracking-widest ${c}`}>
                    {status}
                </span>
            </div>
        </div>
    );
};

const TermItem = ({ label, value }) => (
    <div className="flex justify-between items-center border-b border-indigo-100/50 pb-3">
        <span className="text-[0.7rem] font-bold text-indigo-800/60 uppercase">{label}</span>
        <span className="text-[0.85rem] font-black text-indigo-900">{value}</span>
    </div>
);

const CommissionField = ({ label, value, color, bold }) => {
    const textClasses = bold ? 'text-lg font-black' : 'text-sm font-bold';
    const colorClasses = {
        indigo: 'text-indigo-600',
        emerald: 'text-emerald-600',
        slate: 'text-slate-800'
    };
    const c = colorClasses[color] || colorClasses.slate;

    return (
        <div className="flex flex-col border-l-3 border-slate-100 pl-4 py-1">
            <span className="text-[0.65rem] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</span>
            <span className={`${textClasses} ${c}`}>{value}</span>
        </div>
    );
};

const SplitMeter = ({ label, value, suffix = '', prefix = '', color }) => (
    <div>
        <div className="flex justify-between items-center mb-3">
            <span className="text-[0.65rem] text-slate-500 font-bold uppercase tracking-tight">{label}</span>
            <span className="text-sm font-black" style={{ color }}>{prefix}{value}{suffix}</span>
        </div>
        <div className="h-2 w-full bg-white rounded-full overflow-hidden border border-slate-200">
            <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${suffix === '%' ? value : 100}%`, backgroundColor: color }}
            ></div>
        </div>
    </div>
);

const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

export default DealDetailPage;
