import React from 'react';
import { renderValue } from '../../utils/renderUtils';

const DealTechnicalSpecs = ({ deal, getLookupValue, getStrictLookupValue }) => {
    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '12px' 
    };

    const formatSizeLabel = (deal) => {
        const size = renderValue(deal.size);
        const unit = renderValue(deal.sizeUnit)?.toLowerCase();
        
        if (unit === 'marla') {
            const sqYd = (parseFloat(deal.size) * 29.545).toFixed(2);
            return `${size} Marla (${sqYd} Sq Yd)`;
        }
        
        return `${size} ${renderValue(deal.sizeUnit)}`;
    };

    // Use data from deal or linked inventoryId object
    const data = {
        category: deal.category || deal.inventoryId?.category,
        subCategory: deal.subCategory || deal.inventoryId?.subCategory,
        unitType: deal.unitType || deal.inventoryId?.unitType,
        direction: deal.direction || deal.orientation || deal.inventoryId?.direction || deal.inventoryId?.orientation,
        facing: deal.facing || deal.inventoryId?.facing,
        roadWidth: deal.roadWidth || deal.inventoryId?.roadWidth,
        ownership: deal.ownership || deal.inventoryId?.ownership,
        sizeConfig: deal.sizeConfig || deal.inventoryId?.sizeConfig,
        sizeLabel: deal.sizeLabel || deal.inventoryId?.sizeLabel,
        width: deal.width || deal.frontage || deal.inventoryId?.width || deal.inventoryId?.frontage,
        length: deal.length || deal.depth || deal.inventoryId?.length || deal.inventoryId?.depth,
        unitNo: deal.unitNo,
        block: deal.block
    };

    return (
        <div style={cardStyle}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(to right, #fff, #f8fafc)' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-home" style={{ color: '#2563eb' }}></i>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Unit Specifications</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Technical details & orientation</p>
                </div>
            </div>

            <div style={{ padding: '24px' }}>
                <div style={gridStyle}>
                    <SpecItem label="Category" value={renderValue(getLookupValue('Category', data.category))} icon="tag" />
                    <SpecItem label="Subcategory" value={renderValue(getLookupValue('SubCategory', data.subCategory))} icon="tags" />
                    <SpecItem label="Unit Type" value={renderValue(getLookupValue('UnitType', data.unitType)) || data.unitType} icon="shapes" />
                    <SpecItem label="Direction" value={renderValue(getLookupValue('Orientation', data.direction))} icon="location-arrow" />
                    <SpecItem label="Facing" value={renderValue(getLookupValue('Facing', data.facing))} icon="expand-arrows-alt" />
                    <SpecItem label="Road Width" value={renderValue(getLookupValue('RoadWidth', data.roadWidth)) || (data.roadWidth ? `${data.roadWidth} Mtr.` : '-')} icon="road" />
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
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                            {renderValue(getLookupValue('Size', data.sizeConfig)) || renderValue(data.sizeLabel) || formatSizeLabel(deal)}
                        </h2>
                    </div>
                    <div style={{ width: '1px', height: '40px', background: 'rgba(59, 130, 246, 0.2)' }}></div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Width</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
                            {data.width ? `${data.width} Mtr.` : '-'}
                        </p>
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Length</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
                            {data.length ? `${data.length} Mtr.` : '-'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SpecItem = ({ label, value, icon }) => (
    <div style={{ 
        padding: '14px', 
        background: 'rgba(248, 250, 252, 0.5)', 
        borderRadius: '16px', 
        border: '1px solid #f1f5f9',
        display: 'flex',
        flexDirection: 'column',
    }}>
        <p style={{ margin: '0 0 6px 0', fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fas fa-${icon}`} style={{ width: '12px', textAlign: 'center', color: '#cbd5e1' }}></i>
            {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
            {value || '-'}
        </p>
    </div>
);

export default DealTechnicalSpecs;
