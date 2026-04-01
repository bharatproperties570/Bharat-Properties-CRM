import React from 'react';
import { renderValue } from '../../utils/renderUtils';

const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '₹ 0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(val);
};

const DealCostSheet = ({ financials, deal }) => {
    if (!financials) return null;

    return (
        <div className="glass-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
            {/* Background Accent */}
            <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '100px', height: '100px', background: 'var(--premium-blue-glow)', borderRadius: '50%', filter: 'blur(40px)', zIndex: 0 }}></div>

            <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'var(--premium-blue-glow)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-file-invoice-dollar" style={{ color: 'var(--premium-blue)', fontSize: '1.2rem' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Cost Sheet</h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Purchase summary & charges</p>
                    </div>
                </div>

                {/* Transaction Type Badge */}
                <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    padding: '4px 10px', 
                    background: (financials.valuationData?.transactionType || deal.transactionType) === 'Full White' ? '#f0fdf4' : (financials.valuationData?.transactionType || deal.transactionType) === 'Collector Rate' ? '#fff7ed' : '#eff6ff', 
                    borderRadius: '20px', 
                    border: '1px solid',
                    borderColor: (financials.valuationData?.transactionType || deal.transactionType) === 'Full White' ? '#bbf7d0' : (financials.valuationData?.transactionType || deal.transactionType) === 'Collector Rate' ? '#ffedd5' : '#bfdbfe',
                    marginBottom: '16px'
                }}>
                    <i className={`fas ${ (financials.valuationData?.transactionType || deal.transactionType) === 'Full White' ? 'fa-check-circle' : 'fa-exchange-alt' }`} style={{ fontSize: '0.65rem', color: (financials.valuationData?.transactionType || deal.transactionType) === 'Full White' ? '#166534' : (financials.valuationData?.transactionType || deal.transactionType) === 'Collector Rate' ? '#9a3412' : '#1e40af' }}></i>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: (financials.valuationData?.transactionType || deal.transactionType) === 'Full White' ? '#166534' : (financials.valuationData?.transactionType || deal.transactionType) === 'Collector Rate' ? '#9a3412' : '#1e40af', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        {financials.valuationData?.transactionType || deal.transactionType || 'Full White'}
                        {(financials.valuationData?.transactionType || deal.transactionType) === 'Flexible' && ` (${financials.valuationData?.flexiblePercentage || deal.flexiblePercentage}%)`}
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Basic Consideration */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Basic Sale Consideration</span>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(financials.dealValue)}</span>
                        </div>
                        
                        {/* Flexible/Collector Rate Breakdown */}
                        {(financials.valuationData?.transactionType || deal.transactionType) !== 'Full White' && (
                            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>White / Registry Component:</span>
                                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{formatCurrency(financials.valuationData?.stampDutyBase || financials.applicableValue)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Cash / Black Component:</span>
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}>{formatCurrency(financials.dealValue - (financials.valuationData?.stampDutyBase || financials.applicableValue))}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Government Charges Breakout */}
                    <div style={{ padding: '16px', background: 'rgba(248, 250, 252, 0.3)', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Government Charges</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(financials.totalGovtCharges)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <SubRow label="Stamp Duty" value={financials.stampDutyAmount} />
                            <SubRow label="Registration Fees" value={financials.registrationAmount} />
                            <SubRow label="Other Legal Charges" value={financials.totalGovtCharges - (financials.stampDutyAmount || 0) - (financials.registrationAmount || 0)} />
                        </div>
                    </div>

                    {/* Brokerage */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Service / Brokerage Fee</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(financials.brokerageAmount)}</span>
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, #e2e8f0, transparent)', margin: '8px 0' }}></div>

                    {/* Total */}
                    <div style={{ padding: '20px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: '16px', boxShadow: '0 10px 20px -5px rgba(15, 23, 42, 0.3)' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Landed Cost</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>{formatCurrency(financials.grandTotal)}</div>
                    </div>
                </div>

                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: financials.valuationData ? '#22c55e' : '#94a3b8', fontStyle: 'italic', fontWeight: financials.valuationData ? 700 : 400 }}>
                        {financials.valuationData ? '✓ Live valuation applied' : '* Prices are subject to agreement terms.'}
                    </p>
                </div>
            </div>
        </div>
    );
};

const SubRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 700 }}>{formatCurrency(value)}</span>
    </div>
);

export default DealCostSheet;
