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
                    className="btn-outline"
                    onClick={() => setIsFilterPanelOpen(true)}
                    style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', position: 'relative',
                        height: '38px', padding: '0 15px', borderRadius: '10px'
                    }}
                >
                    <i className="fas fa-filter"></i>
                    Filters
                    {activeFiltersCount > 0 && (
                        <span style={{
                            position: 'absolute', top: '-5px', right: '-5px',
                            width: '10px', height: '10px', background: 'red', borderRadius: '50%',
                            border: '2px solid #fff', boxShadow: '0 0 5px rgba(255,0,0,0.3)'
                        }}></span>
                    )}
                </button>
            </div>
        </div>
    );
};

export default React.memo(InventoryPageHeader);
