import React, { useState, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable/DataTable';
import { renderValue } from '../../../utils/renderUtils';
import { formatIndianCurrency } from '../../../utils/numberToWords';
import { downloadFile } from '../../../utils/dataManagementUtils';

const ProjectInventoryTab = ({
    inventoryData = [],
    blocksData = [],
    onNavigate,
    onEditUnit,
    onDeleteUnit,
    onOpenBulkModal,
    isDark = false,
    projectName = 'Project'
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBlock, setSelectedBlock] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'heatmap'

    // Extract unique blocks
    const blockOptions = useMemo(() => {
        const set = new Set();
        blocksData.forEach(b => {
            if (b?.name) set.add(b.name);
        });
        inventoryData.forEach(u => {
            const blk = renderValue(u.block);
            if (blk && blk !== '--') set.add(blk);
        });
        return Array.from(set);
    }, [blocksData, inventoryData]);

    // Extract unique unit types
    const typeOptions = useMemo(() => {
        const set = new Set();
        inventoryData.forEach(u => {
            const t = renderValue(u.unitType) || renderValue(u.category);
            if (t && t !== '--') set.add(t);
        });
        return Array.from(set);
    }, [inventoryData]);

    // Helper to extract canonical status string
    const getStatusString = (unit) => {
        if (!unit) return 'Available';
        if (unit.status && typeof unit.status === 'object' && unit.status.lookup_value) {
            return unit.status.lookup_value;
        }
        return renderValue(unit.status) || 'Available';
    };

    // Filtered data based on toolbar controls
    const filteredUnits = useMemo(() => {
        return inventoryData.filter(unit => {
            const unitNo = String(unit.unitNo || unit.unitNumber || '').toLowerCase();
            const block = renderValue(unit.block) || '';
            const status = getStatusString(unit).toLowerCase();
            const type = (renderValue(unit.unitType) || renderValue(unit.category) || '').toLowerCase();

            // Search filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchesNo = unitNo.includes(term);
                const matchesBlock = block.toLowerCase().includes(term);
                if (!matchesNo && !matchesBlock) return false;
            }

            // Block filter
            if (selectedBlock !== 'all') {
                if (block.toLowerCase() !== selectedBlock.toLowerCase()) return false;
            }

            // Status filter
            if (selectedStatus !== 'all') {
                if (!status.includes(selectedStatus.toLowerCase())) return false;
            }

            // Type filter
            if (selectedType !== 'all') {
                if (type !== selectedType.toLowerCase()) return false;
            }

            return true;
        });
    }, [inventoryData, searchTerm, selectedBlock, selectedStatus, selectedType]);

    // Export to CSV
    const handleExportCSV = () => {
        if (filteredUnits.length === 0) return;
        const headers = ['Unit No', 'Block', 'Unit Type', 'Area Size', 'Unit Size Type', 'Price (INR)', 'Floor', 'Facing', 'Status'];
        
        const rows = filteredUnits.map(u => {
            const rawPrice = typeof u.price === 'object' && u.price !== null ? (u.price.value ?? '') : (u.price || u.totalCost?.value || u.allInclusivePrice?.value || '');
            const sizeVal = typeof u.size === 'object' && u.size !== null ? (u.size.value ?? '') : (u.size || u.sizeLabel || '');
            const sizeUnit = (typeof u.size === 'object' && u.size !== null ? u.size.unit : null) || u.sizeUnit || 'Sq.Ft.';
            return [
                `"${u.unitNo || u.unitNumber || ''}"`,
                `"${renderValue(u.block) || 'Default'}"`,
                `"${renderValue(u.unitType) || renderValue(u.category) || ''}"`,
                `"${sizeVal}"`,
                `"${sizeUnit}"`,
                `"${rawPrice}"`,
                `"${renderValue(u.floor) || ''}"`,
                `"${renderValue(u.facing) || ''}"`,
                `"${getStatusString(u)}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\r\n');
        const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
        downloadFile(csvContent, filename);
    };

    // Columns for DataTable
    const unitColumns = useMemo(() => [
        {
            header: 'Block / Unit',
            accessor: 'unitNo',
            render: (unit) => (
                <div>
                    <div
                        onClick={(e) => { e.stopPropagation(); onNavigate?.('inventory-detail', unit._id || unit.id); }}
                        style={{ fontWeight: 800, color: 'var(--primary, #3b82f6)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                        title="Open Unit Dossier"
                        className="hover-text-primary"
                    >
                        {unit.unitNo || unit.unitNumber || '--'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                        {renderValue(unit.block) || 'Default Block'}
                    </div>
                </div>
            )
        },
        {
            header: 'Unit Type',
            accessor: 'unitType',
            render: (unit) => (
                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.8rem' }}>
                    {renderValue(unit.unitType) || renderValue(unit.category) || 'Residential'}
                </div>
            )
        },
        {
            header: 'Area / Dimension',
            accessor: 'size',
            render: (unit) => {
                const sizeVal = typeof unit.size === 'object' && unit.size !== null
                    ? (unit.size.value ?? '')
                    : (unit.size || unit.sizeLabel || '');
                const sizeUnit = (typeof unit.size === 'object' && unit.size !== null ? unit.size.unit : null) || unit.sizeUnit || 'Sq.Ft.';
                const hasSize = sizeVal !== '' && sizeVal !== null && sizeVal !== undefined;
                return (
                    <div>
                        <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.8rem' }}>
                            {hasSize ? String(sizeVal) : '--'}
                        </span>
                        {hasSize && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '3px' }}>
                                {sizeUnit}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'Listing Price',
            accessor: 'price',
            render: (unit) => {
                const rawVal = typeof unit.price === 'object' && unit.price !== null
                    ? unit.price.value
                    : (unit.price || (typeof unit.totalCost === 'object' && unit.totalCost !== null ? unit.totalCost.value : unit.totalCost));
                const numVal = rawVal !== undefined && rawVal !== null && rawVal !== '' ? Number(rawVal) : null;
                const hasPrice = numVal !== null && !isNaN(numVal) && numVal > 0;
                return (
                    <div style={{ fontWeight: 900, color: hasPrice ? '#10b981' : 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {hasPrice ? formatIndianCurrency(numVal) : 'On Request'}
                    </div>
                );
            }
        },
        {
            header: 'Specs & Floor',
            accessor: 'attributes',
            render: (unit) => (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {unit.floor && (
                        <span style={{ padding: '2px 6px', background: 'var(--bg-gray)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Flr {renderValue(unit.floor)}
                        </span>
                    )}
                    {unit.facing && (
                        <span style={{ padding: '2px 6px', background: 'var(--bg-gray)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {renderValue(unit.facing)} Facing
                        </span>
                    )}
                    {unit.direction && (
                        <span style={{ padding: '2px 6px', background: 'var(--bg-gray)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {renderValue(unit.direction)}
                        </span>
                    )}
                    {!unit.floor && !unit.facing && !unit.direction && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                    )}
                </div>
            )
        },
        {
            header: 'Allocation Status',
            accessor: 'status',
            render: (unit) => {
                const rawStatus = getStatusString(unit);
                const isAvail = rawStatus.toLowerCase().includes('available');
                const isSold = rawStatus.toLowerCase().includes('sold');
                return (
                    <span style={{
                        fontSize: '0.7rem',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: isAvail ? '#dcfce7' : (isSold ? '#fee2e2' : '#fef3c7'),
                        color: isAvail ? '#166534' : (isSold ? '#991b1b' : '#92400e'),
                        fontWeight: 800
                    }}>
                        {rawStatus}
                    </span>
                );
            }
        },
        {
            header: 'Actions',
            accessor: 'actions',
            align: 'right',
            render: (unit) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEditUnit?.(unit); }}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', transition: 'color 0.2s' }}
                        title="Edit Unit"
                        aria-label={`Edit unit ${unit.unitNo || unit.unitNumber || unit.id}`}
                    >
                        <i className="fas fa-edit hover-text-blue"></i>
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteUnit?.(unit._id || unit.id); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', transition: 'color 0.2s' }}
                        title="Delete Unit"
                        aria-label={`Delete unit ${unit.unitNo || unit.unitNumber || unit.id}`}
                    >
                        <i className="fas fa-trash hover-text-red"></i>
                    </button>
                </div>
            )
        }
    ], [onNavigate, onEditUnit, onDeleteUnit]);

    const unitTableData = useMemo(() => {
        return filteredUnits.map((u, idx) => ({
            ...u,
            id: u._id || u.id || `unit-${idx}`
        }));
    }, [filteredUnits]);

    // Group units by block for Heatmap view
    const heatmapByBlock = useMemo(() => {
        const map = {};
        filteredUnits.forEach(unit => {
            const blk = renderValue(unit.block) || 'Default Block';
            if (!map[blk]) map[blk] = [];
            map[blk].push(unit);
        });
        return map;
    }, [filteredUnits]);

    // Status counts for filtered set
    const counts = useMemo(() => {
        let avail = 0, sld = 0, hld = 0;
        inventoryData.forEach(u => {
            const s = getStatusString(u).toLowerCase();
            if (s.includes('available')) avail++;
            else if (s.includes('sold')) sld++;
            else hld++;
        });
        return { avail, sld, hld, total: inventoryData.length };
    }, [inventoryData]);

    return (
        <div className="project-inventory-tab" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Header Toolbar with Filters & View Modes */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--bg-card)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
            }}>
                {/* Search & Selectors */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                    {/* Search box */}
                    <div style={{ position: 'relative', minWidth: '160px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
                        <input
                            type="text"
                            placeholder="Search unit / block..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 12px 6px 28px',
                                background: 'var(--bg-gray)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                color: 'var(--text-main)',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Block selector */}
                    <select
                        value={selectedBlock}
                        onChange={(e) => setSelectedBlock(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--bg-gray)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-main)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Blocks ({blockOptions.length})</option>
                        {blockOptions.map((b, idx) => (
                            <option key={idx} value={b}>{b}</option>
                        ))}
                    </select>

                    {/* Status selector */}
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--bg-gray)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-main)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Status ({counts.total})</option>
                        <option value="available">🟢 Available ({counts.avail})</option>
                        <option value="sold">🔴 Sold Out ({counts.sld})</option>
                        <option value="hold">🟡 Hold / Booking ({counts.hld})</option>
                    </select>

                    {/* Type selector */}
                    {typeOptions.length > 0 && (
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            style={{
                                padding: '6px 10px',
                                background: 'var(--bg-gray)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: 'var(--text-main)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Unit Types</option>
                            {typeOptions.map((t, idx) => (
                                <option key={idx} value={t}>{t}</option>
                            ))}
                        </select>
                    )}

                    {(searchTerm || selectedBlock !== 'all' || selectedStatus !== 'all' || selectedType !== 'all') && (
                        <button
                            onClick={() => {
                                setSearchTerm('');
                                setSelectedBlock('all');
                                setSelectedStatus('all');
                                setSelectedType('all');
                            }}
                            style={{
                                padding: '6px 10px',
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: 'var(--danger-color, #ef4444)',
                                cursor: 'pointer'
                            }}
                        >
                            Reset
                        </button>
                    )}
                </div>

                {/* Right Actions: View Toggle, CSV Export, Bulk Add */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* View Mode Toggle */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--bg-gray)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        padding: '2px'
                    }}>
                        <button
                            onClick={() => setViewMode('table')}
                            style={{
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '6px',
                                background: viewMode === 'table' ? 'var(--bg-card)' : 'transparent',
                                color: viewMode === 'table' ? '#2563eb' : 'var(--text-muted)',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                            title="Table View"
                        >
                            <i className="fas fa-table-list" style={{ marginRight: '4px' }}></i> Table
                        </button>
                        <button
                            onClick={() => setViewMode('heatmap')}
                            style={{
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '6px',
                                background: viewMode === 'heatmap' ? 'var(--bg-card)' : 'transparent',
                                color: viewMode === 'heatmap' ? '#2563eb' : 'var(--text-muted)',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'heatmap' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                            title="Visual Heatmap Matrix"
                        >
                            <i className="fas fa-grip" style={{ marginRight: '4px' }}></i> Heatmap
                        </button>
                    </div>

                    {/* CSV Export */}
                    <button
                        onClick={handleExportCSV}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                        title="Download Filtered Units as CSV"
                    >
                        <i className="fas fa-file-excel text-emerald-600"></i> Export ({filteredUnits.length})
                    </button>

                    {/* Bulk Add */}
                    <button
                        onClick={onOpenBulkModal}
                        style={{
                            padding: '6px 12px',
                            background: '#3b82f6',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className="fas fa-layer-group"></i> Bulk Add
                    </button>
                </div>
            </div>

            {/* 2. Main View Mode Render */}
            {viewMode === 'table' ? (
                /* DataTable View */
                <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <DataTable
                        columns={unitColumns}
                        data={unitTableData}
                        keyField="id"
                        emptyMessage={
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <i className="fas fa-box-open" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.5, display: 'block' }}></i>
                                {inventoryData.length === 0 
                                    ? "No units added to this project yet. Use 'Bulk Add' to initialize inventory."
                                    : "No units match your selected filter criteria. Try resetting filters."
                                }
                            </div>
                        }
                    />
                </div>
            ) : (
                /* Visual Heatmap / Unit Matrix View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Heatmap Legend */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '10px 16px',
                        background: 'var(--bg-card)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.75rem',
                        fontWeight: 700
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>Heatmap Legend:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981' }}></div>
                            <span>Available ({counts.avail})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444' }}></div>
                            <span>Sold Out ({counts.sld})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b' }}></div>
                            <span>Hold / Booked ({counts.hld})</span>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Click any unit chip to open unit dossier
                        </span>
                    </div>

                    {/* Block-wise grids */}
                    {Object.keys(heatmapByBlock).length > 0 ? (
                        Object.entries(heatmapByBlock).map(([blockName, units], bIdx) => (
                            <div
                                key={bIdx}
                                style={{
                                    background: 'var(--bg-card)',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)',
                                    padding: '16px 20px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-cubes text-blue-500"></i>
                                        <h5 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                            {blockName}
                                        </h5>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-gray)', color: 'var(--text-muted)', fontWeight: 700 }}>
                                            {units.length} units
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                                    gap: '8px'
                                }}>
                                    {units.map((unit, uIdx) => {
                                        const status = getStatusString(unit).toLowerCase();
                                        const isAvail = status.includes('available');
                                        const isSold = status.includes('sold');
                                        const chipColor = isAvail ? '#10b981' : (isSold ? '#ef4444' : '#f59e0b');
                                        const chipBg = isAvail ? 'rgba(16, 185, 129, 0.12)' : (isSold ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)');
                                        const unitPrice = unit.price?.value || unit.price;
                                        
                                        return (
                                            <div
                                                key={uIdx}
                                                onClick={() => onNavigate?.('inventory-detail', unit._id || unit.id)}
                                                title={`Unit ${unit.unitNo || unit.unitNumber}\nStatus: ${getStatusString(unit)}\nType: ${renderValue(unit.unitType) || 'Residential'}\nPrice: ${unitPrice ? formatIndianCurrency(unitPrice) : 'On Request'}`}
                                                style={{
                                                    padding: '8px 4px',
                                                    borderRadius: '8px',
                                                    background: chipBg,
                                                    border: `1px solid ${chipColor}44`,
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                className="hover:scale-105"
                                            >
                                                <div style={{ fontSize: '0.78rem', fontWeight: 900, color: chipColor }}>
                                                    {unit.unitNo || unit.unitNumber || '--'}
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {renderValue(unit.unitType) || 'Unit'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No units found matching the selected filters.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProjectInventoryTab;
