import React from 'react';
import { formatIndianCurrency } from '../../../utils/numberToWords';

const ProjectPricingSection = ({ project, onEditPricing }) => {
    const pricing = project?.pricing;
    const basePrice = pricing?.basePrice;
    const unitPrices = pricing?.unitPrices || [];
    const masterCharges = pricing?.masterCharges || [];
    const paymentPlans = pricing?.paymentPlans || [];

    const hasAnyPricingData = Boolean(
        basePrice?.amount || 
        unitPrices.length > 0 || 
        masterCharges.length > 0 || 
        paymentPlans.length > 0
    );

    const cardStyle = {
        background: 'var(--bg-card)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        marginBottom: '10px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)'
    };

    const sectionTitleStyle = {
        fontSize: '0.78rem',
        fontWeight: 800,
        color: 'var(--text-main)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    if (!hasAnyPricingData) {
        return (
            <div style={{ ...cardStyle, padding: '28px 16px', textAlign: 'center' }}>
                <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    margin: '0 auto 10px'
                }}>
                    <i className="fas fa-tags"></i>
                </div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    Pricing Structure Not Configured
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 14px' }}>
                    Configure base rates, unit-wise rate matrix, master charges (EDC/IDC/PLC), and payment milestone plans for this project.
                </p>
                {onEditPricing && (
                    <button
                        onClick={onEditPricing}
                        style={{
                            padding: '6px 14px',
                            background: '#3b82f6',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        <i className="fas fa-cog" style={{ marginRight: '6px' }}></i> Configure Project Pricing
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="project-pricing-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Base Price Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2563eb' }}>
                        Base Selling Rate
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                            {basePrice?.amount ? formatIndianCurrency(Number(basePrice.amount)) : 'Rate On Request'}
                        </span>
                        {basePrice?.unit && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                / {basePrice.unit}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pricing Model</span>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {pricing?.pricingType || 'Standard Schedule'}
                        </div>
                    </div>
                    {onEditPricing && (
                        <button
                            onClick={onEditPricing}
                            style={{
                                padding: '6px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: 'var(--text-main)',
                                cursor: 'pointer'
                            }}
                        >
                            <i className="fas fa-edit" style={{ marginRight: '6px', color: '#3b82f6' }}></i> Edit Pricing
                        </button>
                    )}
                </div>
            </div>

            {/* Unit Price Matrix */}
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h4 style={sectionTitleStyle}>
                        <i className="fas fa-table-cells text-blue-500"></i> Unit Price Matrix ({unitPrices.length})
                    </h4>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    {unitPrices.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-gray)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Block</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Sub Category</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Area Type</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Size</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unitPrices.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-main)' }}>
                                            {row.block || 'All Blocks'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>
                                            {row.subCategory || '--'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            {row.areaType || 'Super Area'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>
                                            {typeof row.size === 'object' && row.size !== null
                                                ? (`${row.size.value ?? ''} ${row.size.unit ?? ''}`.trim() || '--')
                                                : renderValue(row.size, '--')}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#10b981', textAlign: 'right' }}>
                                            {row.price ? formatIndianCurrency(typeof row.price === 'object' && row.price !== null ? row.price.value : Number(row.price)) : '--'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No specific unit pricing tiers defined. Base rate applies across all configurations.
                        </div>
                    )}
                </div>
            </div>

            {/* Master Charges & Additional Costs */}
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h4 style={sectionTitleStyle}>
                        <i className="fas fa-receipt text-indigo-500"></i> Master Charges & Statutories ({masterCharges.length})
                    </h4>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    {masterCharges.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-gray)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Charge Name</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Category</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)' }}>Calculation Basis</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'right' }}>Amount / Rate</th>
                                    <th style={{ padding: '10px 16px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'center' }}>GST Applicable</th>
                                </tr>
                            </thead>
                            <tbody>
                                {masterCharges.map((charge, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {charge.name}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                                            {charge.category || 'Statutory'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>
                                            {charge.basis || 'Lump Sum'}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#2563eb', textAlign: 'right' }}>
                                            {charge.amount ? formatIndianCurrency(Number(charge.amount)) : '--'}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                background: charge.gstEnabled ? '#ecfdf5' : '#f1f5f9',
                                                color: charge.gstEnabled ? '#059669' : '#64748b'
                                            }}>
                                                {charge.gstEnabled ? 'YES (+GST)' : 'EXEMPT'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No additional master charges (EDC/IDC, PLC, Club) mapped for this project.
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Plans */}
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h4 style={sectionTitleStyle}>
                        <i className="fas fa-calendar-check text-emerald-500"></i> Payment Plans ({paymentPlans.length})
                    </h4>
                </div>
                <div style={{ padding: '20px' }}>
                    {paymentPlans.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                            {paymentPlans.map((plan, idx) => (
                                <div 
                                    key={idx}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        background: 'var(--bg-gray)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                            {plan.name}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3', fontWeight: 800 }}>
                                            {plan.type || 'Construction Linked'}
                                        </span>
                                    </div>

                                    {plan.milestones && plan.milestones.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {plan.milestones.map((m, mIdx) => (
                                                <div 
                                                    key={mIdx}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '8px 12px',
                                                        background: 'var(--bg-card)',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border-color)',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{m.name}</div>
                                                        {m.stage && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.stage}</div>}
                                                    </div>
                                                    <span style={{ fontWeight: 900, color: '#10b981', fontSize: '0.85rem' }}>
                                                        {m.percentage}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No milestones registered.</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '16px' }}>
                            Standard payment schedule (10% token, 80% on agreement, 10% on possession).
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectPricingSection;
