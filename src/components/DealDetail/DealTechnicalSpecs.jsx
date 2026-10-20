import { useTheme } from '../../context/ThemeContext';
import React, { useMemo } from 'react';
import { renderValue } from '../../utils/renderUtils';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { resolveUnitDimensionsAndSize } from '../../utils/sizeDimensionUtils';

const DealTechnicalSpecs = ({ deal = {}, inventory = null, getLookupValue, getStrictLookupValue }) => {
    const { isDark } = useTheme();
    const config = usePropertyConfig();
    const sizes = config?.sizes || [];

    const cardStyle = {
        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff',
        borderRadius: '20px',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '12px' 
    };

    const linkedInv = inventory || (deal?.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId : null);

    // Dynamic resolution of specifications, size labels, and database dimensions
    const specsData = useMemo(() => {
        return resolveUnitDimensionsAndSize(deal, {
            linkedInventory: linkedInv,
            sizes,
            getLookupValue: getLookupValue || ((type, val) => renderValue(val))
        });
    }, [deal, linkedInv, sizes, getLookupValue]);

    // Use data from deal or linked inventory object
    const data = {
        category: deal?.category || linkedInv?.category,
        subCategory: deal?.subCategory || linkedInv?.subCategory,
        unitType: deal?.unitType || linkedInv?.unitType,
        direction: deal?.direction || deal?.orientation || linkedInv?.direction || linkedInv?.orientation,
        facing: deal?.facing || linkedInv?.facing,
        roadWidth: deal?.roadWidth || linkedInv?.roadWidth,
        ownership: deal?.ownership || linkedInv?.ownership,
        unitNo: deal?.unitNo || linkedInv?.unitNo,
        block: deal?.block || linkedInv?.block
    };

    const safeLookup = (type, val) => {
        if (typeof getLookupValue === 'function') {
            const res = getLookupValue(type, val);
            if (res && res !== '-') return res;
        }
        return renderValue(val);
    };

    return (
        <div style={cardStyle}>
            <div style={{ padding: '20px 24px', borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'linear-gradient(to right, #fff, #f8fafc)' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-home" style={{ color: '#2563eb' }}></i>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : '#0f172a', letterSpacing: '-0.3px' }}>Unit Specifications</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: isDark ? 'var(--text-muted)' : '#64748b', fontWeight: 600 }}>Technical details &amp; orientation</p>
                </div>
            </div>

            <div style={{ padding: '24px' }}>
                <div style={gridStyle}>
                    <SpecItem label="Category" value={safeLookup('Category', data.category)} icon="tag" />
                    <SpecItem label="Subcategory" value={safeLookup('SubCategory', data.subCategory)} icon="tags" />
                    <SpecItem label="Unit Type" value={safeLookup('UnitType', data.unitType) || renderValue(data.unitType)} icon="shapes" />
                    <SpecItem label="Direction" value={safeLookup('Orientation', data.direction)} icon="location-arrow" />
                    <SpecItem label="Facing" value={safeLookup('Facing', data.facing)} icon="expand-arrows-alt" />
                    <SpecItem label="Road Width" value={safeLookup('RoadWidth', data.roadWidth) || (data.roadWidth ? `${renderValue(data.roadWidth)} Mtr.` : '-')} icon="road" />
                    <SpecItem label="Ownership" value={renderValue(data.ownership)} icon="id-card" />
                </div>

                {/* Sizing & Dimensions Strip */}
                <div style={{ 
                    marginTop: '20px', 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))', 
                    borderRadius: '24px', 
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                }}>
                    <div style={{ flex: 2 }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.65rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            <i className="fas fa-expand-arrows-alt" style={{ marginRight: '8px' }}></i> Size Label (Primary)
                        </p>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : '#0f172a', letterSpacing: '-0.5px' }}>
                            {specsData.fullSizeText}
                        </h2>
                    </div>
                    <div style={{ width: '1px', height: '40px', background: 'rgba(59, 130, 246, 0.2)' }}></div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Width</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                            {specsData.formattedWidth}
                        </p>
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Length</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                            {specsData.formattedLength}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SpecItem = ({ label, value, icon }) => {
    const { isDark } = useTheme();
    return (
        <div style={{ 
            padding: '14px', 
            background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(248, 250, 252, 0.5)', 
            borderRadius: '16px', 
            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <p style={{ margin: '0 0 6px 0', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className={`fas fa-${icon}`} style={{ width: '12px', textAlign: 'center', color: '#cbd5e1' }}></i>
                {label}
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: isDark ? 'var(--text-main)' : '#1e293b' }}>
                {value || '-'}
            </p>
        </div>
    );
};

export default DealTechnicalSpecs;
