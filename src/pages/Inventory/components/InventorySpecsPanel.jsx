import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const InventorySpecsPanel = ({ inventory, getLookupValue, handleToggleIntent, handleCreateDeal, onFeedback, isInventoryActive, hideConsole = false }) => {
    const intents = Array.isArray(inventory.intent) 
        ? inventory.intent.map(i => (i && typeof i === 'object' ? i.lookup_value : i))
        : [inventory.intent && typeof inventory.intent === 'object' ? inventory.intent.lookup_value : inventory.intent].filter(Boolean);

    const isSell = intents.includes('Sell');
    const isLease = intents.includes('Lease');
    const isRent = intents.includes('Rent');

    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '12px' 
    };

    const formatSizeLabel = (inventory) => {
        const size = renderValue(inventory.size);
        const unit = renderValue(inventory.sizeUnit)?.toLowerCase();
        
        if (unit === 'marla') {
            const sqYd = (parseFloat(inventory.size) * 29.545).toFixed(2);
            return `${size} Marla (${sqYd} Sq Yd)`;
        }
        
        return `${size} ${renderValue(inventory.sizeUnit)}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Transaction Console */}
            {!hideConsole && (
                <div className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '40px', height: '40px', background: 'var(--premium-blue-glow)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-bolt" style={{ color: 'var(--premium-blue)' }}></i>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Transaction Console</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Manage listing intent & interactions</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <TransactionCard
                            type="Sell"
                            active={isSell}
                            disabled={!isInventoryActive}
                            onToggle={() => onFeedback('Sell')}
                            onAction={() => onFeedback('Sell')}
                            icon="hand-holding-usd"
                            color="#10b981"
                            label="SALE"
                            desc={!isInventoryActive ? "LOCKED" : (isSell ? "Active" : "Enable")}
                        />
                        <TransactionCard
                            type="Lease"
                            active={isLease}
                            disabled={!isInventoryActive}
                            onToggle={() => onFeedback('Lease')}
                            onAction={() => onFeedback('Lease')}
                            icon="file-signature"
                            color="#3b82f6"
                            label="LEASE"
                            desc={!isInventoryActive ? "LOCKED" : (isLease ? "Active" : "Enable")}
                        />
                        <TransactionCard
                            type="Rent"
                            active={isRent}
                            disabled={!isInventoryActive}
                            onToggle={() => onFeedback('Rent')}
                            onAction={() => onFeedback('Rent')}
                            icon="key"
                            color="#f59e0b"
                            label="RENT"
                            desc={!isInventoryActive ? "LOCKED" : (isRent ? "Active" : "Enable")}
                        />
                    </div>
                </div>
            )}

            {/* Unified Unit Specifications */}
            <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'var(--premium-blue-glow)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-home" style={{ color: 'var(--premium-blue)' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Unit Specifications</h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Live property details & orientation</p>
                    </div>
                </div>

                <div style={gridStyle}>
                    <SpecItem label="Category" value={renderValue(getLookupValue('Category', inventory.category))} icon="tag" />
                    <SpecItem label="Subcategory" value={renderValue(getLookupValue('SubCategory', inventory.subCategory))} icon="tags" />
                    <SpecItem label="Unit Type" value={renderValue(getLookupValue('UnitType', inventory.unitType))} icon="shapes" />
                    <SpecItem label="Direction" value={renderValue(getLookupValue('Orientation', inventory.direction || inventory.orientation))} icon="location-arrow" />
                    <SpecItem label="Facing" value={renderValue(getLookupValue('Facing', inventory.facing))} icon="expand-arrows-alt" />
                    <SpecItem label="Road Width" value={renderValue(getLookupValue('RoadWidth', inventory.roadWidth)) || (inventory.roadWidth ? `${inventory.roadWidth} Mtr.` : '-')} icon="road" />
                    <SpecItem label="Ownership" value={renderValue(inventory.ownership)} icon="id-card" />
                </div>

                {/* Sizing & Dimensions Strip - MOVED TO BOTTOM */}
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
                    boxShadow: '0 10px 30px -15px rgba(59, 130, 246, 0.2)'
                }}>
                    <div style={{ flex: 2 }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '0.65rem', fontWeight: 800, color: 'var(--premium-blue)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            <i className="fas fa-expand-arrows-alt" style={{ marginRight: '8px' }}></i> Size Label (Primary)
                        </p>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                            {renderValue(getLookupValue('Size', inventory.sizeConfig)) || renderValue(inventory.sizeLabel) || formatSizeLabel(inventory)}
                        </h2>
                    </div>
                    <div style={{ width: '1px', height: '40px', background: 'rgba(59, 130, 246, 0.2)' }}></div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Width</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
                            {inventory.frontage || inventory.width ? `${inventory.frontage || inventory.width} Mtr.` : '-'}
                        </p>
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Length</p>
                        <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
                            {inventory.depth || inventory.length ? `${inventory.depth || inventory.length} Mtr.` : '-'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TransactionCard = ({ active, onToggle, onAction, icon, color, label, desc, disabled }) => (
    <div style={{
        padding: '20px', borderRadius: '20px', background: active ? '#fff' : 'rgba(248, 250, 252, 0.5)',
        border: `1px solid ${active ? color : '#e2e8f0'}`,
        display: 'flex', flexDirection: 'column', gap: '16px', transition: 'all 0.3s ease',
        boxShadow: active ? `0 10px 25px -5px ${color}15` : 'none',
        position: 'relative', overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '44px', height: '44px', background: `${color}15`, color: color, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                <i className={`fas fa-${icon}`}></i>
            </div>
            <div style={{ position: 'relative', width: '40px', height: '22px', background: active ? color : '#cbd5e1', borderRadius: '11px', cursor: 'pointer', transition: 'all 0.3s' }} onClick={onToggle}>
                <div style={{ position: 'absolute', top: '2px', left: active ? '20px' : '2px', width: '18px', height: '18px', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'all 0.3s' }}></div>
            </div>
        </div>
        <div>
            <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 900, color: active ? '#0f172a' : '#64748b', letterSpacing: '0.5px' }}>{label}</h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>{desc}</p>
        </div>
        <button
            onClick={onAction}
            disabled={disabled}
            style={{
                width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
                background: disabled ? '#f1f5f9' : (active ? color : '#f1f5f9'), 
                color: disabled ? '#cbd5e1' : (active ? '#fff' : '#475569'),
                fontSize: '0.75rem', fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
            }}
        >
            <i className={`fas fa-${disabled ? 'lock' : (active ? 'pen-nib' : 'plus')}`}></i> 
            {disabled ? 'UNIT INACTIVE' : (active ? 'FEEDBACK' : 'ENABLE INTENT')}
        </button>
    </div>
);

const SpecItem = ({ label, value, icon, highlight = false }) => (
    <div style={{ 
        padding: highlight ? '18px 16px' : '14px', 
        background: highlight ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(37, 99, 235, 0.03))' : 'rgba(248, 250, 252, 0.5)', 
        borderRadius: '16px', 
        border: highlight ? '1.5px solid rgba(59, 130, 246, 0.2)' : '1px solid #f1f5f9',
        boxShadow: highlight ? '0 10px 20px -10px rgba(59, 130, 246, 0.2)' : 'none',
        transition: 'all 0.3s ease',
        transform: highlight ? 'translateY(-2px)' : 'none',
        zIndex: highlight ? 2 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
    }}>
        <p style={{ margin: '0 0 6px 0', fontSize: '0.65rem', fontWeight: 800, color: highlight ? 'var(--premium-blue)' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fas fa-${icon}`} style={{ width: '12px', textAlign: 'center', color: highlight ? 'var(--premium-blue)' : '#cbd5e1' }}></i>
            {label}
        </p>
        <p style={{ 
            margin: 0, 
            fontSize: highlight ? '1rem' : '0.85rem', 
            fontWeight: highlight ? 900 : 700, 
            color: highlight ? '#0f172a' : '#1e293b',
            letterSpacing: highlight ? '-0.3px' : 'normal'
        }}>
            {value || '-'}
        </p>
    </div>
);

export default React.memo(InventorySpecsPanel);
