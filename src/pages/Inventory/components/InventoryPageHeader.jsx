import React from 'react';

const InventoryPageHeader = ({ viewMode, setViewMode, setIsFilterPanelOpen, activeFiltersCount, onShowAll }) => {
    return (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0', paddingBottom: '10px' }}>
            <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                title="Click to show all inventory"
                onClick={onShowAll}
            >
                <div style={{ width: '38px', height: '38px', background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-warehouse" style={{ color: '#16a34a', fontSize: '1.1rem' }}></i>
                </div>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Inventory</h1>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, fontWeight: 500 }}>Property Assets Management</p>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
                <div className="view-toggle-group" style={{ marginRight: '10px' }}>
                    <button
                        className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                        onClick={() => setViewMode('list')}
                    >
                        <i className="fas fa-list"></i> List View
                    </button>
                    <button
                        className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                        onClick={() => setViewMode('map')}
                    >
                        <i className="fas fa-map-marked-alt"></i> Map View
                    </button>
                </div>
                <button
                    className="toolbar-btn"
                    onClick={() => setIsFilterPanelOpen(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                        backgroundColor: activeFiltersCount > 0 ? '#eff6ff' : '#fff',
                        color: activeFiltersCount > 0 ? '#2563eb' : '#64748b',
                        border: activeFiltersCount > 0 ? '1px solid #2563eb' : '1px solid #e2e8f0',
                        borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                    }}
                >
                    <i className="fas fa-filter"></i> Filters
                    {activeFiltersCount > 0 && <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>{activeFiltersCount}</span>}
                </button>
            </div>
        </div>
    );
};

export default React.memo(InventoryPageHeader);
