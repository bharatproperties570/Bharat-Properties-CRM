import React, { useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { renderValue, formatSafeDate, formatSafeDateTime } from '../../../utils/renderUtils';
import { getInitials } from '../../../utils/helpers';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { DataTable } from '../../../components/ui/DataTable/DataTable';

const InventoryTable = ({
    inventoryItems = [],
    selectedIds = [],
    toggleSelect,
    handleSelectAll,
    getLookupValue,
    resolveInventoryLookup,
    onNavigate,
    getUserName,
    getTeamName,
    loading
}) => {
    const { isDark } = useTheme();
    const { sizes } = usePropertyConfig();
    const isAllSelected = inventoryItems.length > 0 && selectedIds.length === inventoryItems.length;

    const resolveSizeLabel = (item, resolveLookupFn) => {
        if (!item) return null;

        // ✅ Use Size Master system first
        if (item.sizeId && Array.isArray(sizes)) {
            const matchedSize = sizes.find(s => s.id === item.sizeId || s.id === String(item.sizeId));
            if (matchedSize) {
                return matchedSize.name || `${matchedSize.unitType || ''} ${matchedSize.totalArea ? matchedSize.totalArea + ' ' + (matchedSize.resultMetric || 'Sq Yd') : ''}`.trim();
            }
        }

        if (item.totalLandAreaText) return item.totalLandAreaText;

        const extractStr = (val) => {
            if (!val) return null;
            if (typeof val === 'string') return /^[0-9a-fA-F]{24}$/.test(val) ? null : val;
            if (typeof val === 'object') {
                if (val.lookup_value) return val.lookup_value;
                if (val.name) return val.name;
                if (val.label) return val.label;
            }
            return null;
        };

        const c1 = resolveLookupFn(item.sizeConfig, 'Size') || extractStr(item.sizeConfig);
        if (c1 && c1 !== '0' && c1 !== 0) return c1;

        const c2 = resolveLookupFn(item.sizeType, 'PropertyType') || extractStr(item.sizeType);
        if (c2 && c2 !== '0' && c2 !== 0) return c2;

        const c3 = resolveLookupFn(item.sizeLabel, 'Size') || extractStr(item.sizeLabel);
        if (c3 && c3 !== '0' && c3 !== 0) return c3;

        if (item.size) {
            if (typeof item.size === 'object') {
                const val = Number(item.size.value);
                if (!isNaN(val) && val > 0) return `${val} ${item.size.unit || ''}`.trim();
            }
            if (typeof item.size === 'string' && item.size !== '0' && item.size !== '0 Sq.Ft.') {
                return item.size;
            }
        }

        return null;
    };

    const renderContactAddress = (contact) => {
        if (!contact) return null;
        const addr = contact.personalAddress || contact.correspondenceAddress;
        if (!addr) return null;

        const parts = [
            addr.hNo,
            addr.street,
            resolveInventoryLookup(addr.locality, 'Locality') || resolveInventoryLookup(addr.location, 'Location') || renderValue(addr.area),
            resolveInventoryLookup(addr.tehsil, 'Tehsil'),
            resolveInventoryLookup(addr.postOffice, 'PostOffice'),
            resolveInventoryLookup(addr.city, 'City'),
            resolveInventoryLookup(addr.pincode || addr.pinCode, 'Pincode')
        ].filter(Boolean);

        if (parts.length === 0) return null;
        return (
            <div style={{
                fontSize: '0.62rem',
                color: 'var(--text-muted)',
                marginTop: '1px',
                lineHeight: 1.2,
                fontWeight: 600,
                fontStyle: 'italic',
                maxWidth: '220px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }} title={parts.join(', ')}>
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.55rem', marginRight: '3px', opacity: 0.7 }}></i>
                {parts.join(', ')}
            </div>
        );
    };

    const columns = useMemo(() => [
        {
            key: 'selection',
            isSelection: true,
            disablePrimaryTrigger: true,
            header: (
                <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={isAllSelected}
                    style={{ cursor: 'pointer' }}
                    aria-label="Select all properties"
                />
            ),
            headerStyle: { width: '40px', textAlign: 'center', padding: '12px 8px' },
            cellStyle: { width: '40px', textAlign: 'center', padding: '12px 8px' },
            render: (item) => {
                const isSelected = selectedIds.includes(item._id);
                return (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item._id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                        aria-label={`Select property ${item.unitNo || item._id}`}
                    />
                );
            }
        },
        {
            key: 'propertyDetails',
            header: 'Property Details',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '220px' },
            cellStyle: { minWidth: '220px' },
            render: (item) => {
                const statusVal = getLookupValue('Status', item.status);
                const isActive = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                const sizeStr = resolveSizeLabel(item, resolveInventoryLookup);

                return (
                    <div className="super-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <button
                                type="button"
                                data-prevent-row-click="true"
                                style={{
                                    minWidth: '55px',
                                    width: 'auto',
                                    height: '26px',
                                    padding: '0 8px',
                                    background: isActive
                                        ? (isDark ? '#065f46' : '#dcfce7')
                                        : (isDark ? '#334155' : '#f1f5f9'),
                                    borderRadius: '6px',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.85rem', fontWeight: 900,
                                    color: isActive
                                        ? (isDark ? '#6ee7b7' : '#15803d')
                                        : (isDark ? '#cbd5e1' : '#1e293b'),
                                    border: isActive
                                        ? (isDark ? '1px solid #047857' : '1px solid #bdf4c9')
                                        : (isDark ? '1px solid #475569' : '1px solid #e2e8f0'),
                                    cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate('inventory-detail', item._id);
                                }}
                            >
                                {renderValue(item.unitNo)}
                            </button>
                            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: isDark ? 'var(--gold)' : '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {(() => {
                                    if (item.isCorner) return 'CORNER';
                                    if (item.isTwoSideOpen) return 'TWO SIDE OPEN';
                                    const ut = getLookupValue('UnitType', item.unitType);
                                    return ut ? renderValue(ut) : '';
                                })()}
                            </div>
                        </div>
                        <div style={{ paddingLeft: '2px' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                                {renderValue(resolveInventoryLookup(item.category, 'Category'))} | {renderValue(resolveInventoryLookup(item.subCategory, 'SubCategory'))}
                            </div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? 'var(--gold)' : '#2563eb', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.65rem' }}></i>
                                {sizeStr ? renderValue(sizeStr) : null}
                            </div>
                        </div>
                    </div>
                );
            }
        },
        {
            key: 'projectLocation',
            header: 'Project & Location',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '200px' },
            cellStyle: { minWidth: '200px' },
            render: (item) => {
                const locality = resolveInventoryLookup(item.address?.locality, 'Locality') || resolveInventoryLookup(item.address?.area, 'Area') || resolveInventoryLookup(item.address?.location, 'Location');
                const city = resolveInventoryLookup(item.address?.city, 'City');
                const pincode = resolveInventoryLookup(item.address?.pincode, 'Pincode') || item.address?.pincode || '';

                return (
                    <div className="super-cell">
                        <div style={{
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            color: isDark ? 'var(--gold)' : '#2563eb',
                            marginBottom: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {renderValue(item.projectName) || renderValue(item.projectId?.name) || 'Unknown Project'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i>
                            <span className="text-ellipsis">
                                {`${renderValue(locality)}${city ? ', ' + renderValue(city) : ''}${pincode && pincode !== '-' ? ' - ' + renderValue(pincode) : ''}`}
                            </span>
                        </div>
                        {item.block && (
                            <div style={{ marginTop: '4px' }}>
                                <span style={{ fontSize: '0.58rem', padding: '2px 8px', background: 'var(--bg-gray)', color: 'var(--text-muted)', fontWeight: 800, borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    BLOCK: {renderValue(item.block)}
                                </span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            key: 'orientation',
            header: 'Orientation',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '140px' },
            cellStyle: { minWidth: '140px' },
            render: (item) => {
                const orientationLabel = resolveInventoryLookup(item.orientation, 'Orientation');
                const facingLabel = resolveInventoryLookup(item.facing, 'Facing');
                const val = orientationLabel || facingLabel;
                const dir = resolveInventoryLookup(item.direction, 'Direction');
                const rw = resolveInventoryLookup(item.roadWidth, 'RoadWidth') || item.roadWidth;

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {val && val !== '-' && val !== 'None' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <i className="fas fa-compass" style={{ fontSize: '0.9rem', color: '#4f46e5', flexShrink: 0 }}></i>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderValue(val)}</span>
                            </div>
                        )}
                        {dir && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <i className="fas fa-location-arrow" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}></i>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderValue(dir)}</span>
                            </div>
                        )}
                        {rw && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <i className="fas fa-road" style={{ fontSize: '0.8rem', color: '#f59e0b', flexShrink: 0 }}></i>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{renderValue(rw)}</span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            key: 'ownerProfile',
            header: 'Owner Profile',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '180px' },
            cellStyle: { minWidth: '180px' },
            render: (item) => {
                const cid = item.owners?.[0]?._id || item.owners?.[0]?.id;
                const ownerName = renderValue(item.owners?.[0]?.name) || renderValue(item.ownerName) || 'No owner data';
                return (
                    <div className="super-cell">
                        {cid ? (
                            <button
                                type="button"
                                data-prevent-row-click="true"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    font: 'inherit',
                                    textAlign: 'left',
                                    fontSize: '0.82rem',
                                    fontWeight: 800,
                                    color: isDark ? 'var(--gold)' : '#2563eb',
                                    marginBottom: '2px',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    display: 'block'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onNavigate) onNavigate('contact-detail', cid);
                                }}
                            >
                                {ownerName}
                            </button>
                        ) : (
                            <div style={{
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                color: isDark ? 'var(--gold)' : '#2563eb',
                                marginBottom: '2px'
                            }}>
                                {ownerName}
                            </div>
                        )}
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {renderValue(item.owners?.[0]?.phones?.[0]?.number) || renderValue(item.ownerPhone) || ''}
                        </div>
                        {renderContactAddress(item.owners?.[0])}
                    </div>
                );
            }
        },
        {
            key: 'associateContact',
            header: 'Associate Contact',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '160px' },
            cellStyle: { minWidth: '160px' },
            render: (item) => {
                if (!item.associates || item.associates.length === 0) {
                    return <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>--</div>;
                }
                const cid = item.associates?.[0]?.contact?._id || item.associates?.[0]?.contact?.id;
                const assocName = renderValue(item.associates[0]?.contact?.name) || renderValue(item.associates[0]?.name);
                return (
                    <div className="super-cell">
                        {cid ? (
                            <button
                                type="button"
                                data-prevent-row-click="true"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    font: 'inherit',
                                    textAlign: 'left',
                                    fontSize: '0.82rem',
                                    fontWeight: 800,
                                    color: 'var(--text-main)',
                                    marginBottom: '2px',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    display: 'block'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onNavigate) onNavigate('contact-detail', cid);
                                }}
                            >
                                {assocName}
                            </button>
                        ) : (
                            <div style={{
                                fontSize: '0.82rem',
                                fontWeight: 800,
                                color: 'var(--text-main)',
                                marginBottom: '2px'
                            }}>
                                {assocName}
                            </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: isDark ? 'var(--gold)' : '#2563eb', fontWeight: 700 }}>
                            {renderValue(item.associates[0]?.contact?.phones?.[0]?.number) || renderValue(item.associates[0]?.mobile) || ''}
                        </div>
                        {renderContactAddress(item.associates[0]?.contact)}
                    </div>
                );
            }
        },
        {
            key: 'interaction',
            header: 'Interaction',
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '180px' },
            cellStyle: { minWidth: '180px' },
            render: (item) => {
                const statusVal = getLookupValue('Status', item.status);
                const isActive = statusVal === 'Active' || String(item.status?.lookup_value) === 'Active' || String(item.status) === 'Active';
                const history = item.history || [];
                const latest = history
                    .filter(h => h && (h.type === 'Feedback' || h.details?.responses))
                    .sort((a, b) => {
                        const dateA = a.date ? new Date(a.date).getTime() : 0;
                        const dateB = b.date ? new Date(b.date).getTime() : 0;
                        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                    })[0];

                const outcome = latest?.details?.result;
                const reason = latest?.details?.reason;
                const feedbackDate = latest?.date
                    ? formatSafeDate(latest.date, { day: '2-digit', month: 'short', year: 'numeric' }, null)
                    : (latest?.performedAt
                        ? formatSafeDate(latest.performedAt, { day: '2-digit', month: 'short', year: 'numeric' }, null)
                        : null);
                const followUp = item.followUpDate ? formatSafeDate(item.followUpDate, {}, null) : null;

                return (
                    <div className="super-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.58rem',
                                fontWeight: 900,
                                background: isActive ? '#22c55e' : '#64748b',
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                width: 'fit-content'
                            }}>
                                {isActive ? 'Active' : 'Inactive'}
                            </div>
                            {feedbackDate && (
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, opacity: 0.8 }}>
                                    {feedbackDate}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {outcome && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)' }}>{renderValue(outcome)}</span>
                                    {reason && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>({renderValue(reason)})</span>}
                                </div>
                            )}
                            {followUp && (
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: isDark ? 'var(--gold)' : '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <i className="far fa-calendar-alt" style={{ fontSize: '0.6rem' }}></i>
                                    Follow-up: {followUp}
                                </div>
                            )}
                            {!outcome && !followUp && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Recent Feedback</span>}
                        </div>
                    </div>
                );
            }
        },
        {
            key: 'assignment',
            header: <div style={{ textAlign: 'right' }}>Assignment</div>,
            disablePrimaryTrigger: true,
            headerStyle: { minWidth: '160px', textAlign: 'right' },
            cellStyle: { minWidth: '160px', textAlign: 'right' },
            render: (item) => (
                <div className="assignment-cell-final" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '2px',
                    paddingRight: '0.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                            style={{
                                width: '24px', height: '24px',
                                background: 'var(--bg-gray)', border: '1px solid var(--border-color)',
                                borderRadius: '50%', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 800,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                flexShrink: 0
                            }}
                        >
                            {getInitials(getUserName(item.assignedTo))}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
                            {renderValue(getUserName(item.assignedTo))}
                        </div>
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>
                        {renderValue(getTeamName(item.team))}
                    </div>
                    <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '1px' }}>
                        <i className="far fa-clock" style={{ fontSize: '0.55rem' }}></i>
                        {formatSafeDateTime(item.updatedAt || item.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                </div>
            )
        }
    ], [isAllSelected, selectedIds, handleSelectAll, toggleSelect, getLookupValue, resolveInventoryLookup, onNavigate, getUserName, getTeamName, isDark, sizes]);

    const getRowStyle = (item) => {
        if (!item) return {};
        const isSelected = selectedIds.includes(item._id);
        const intent = String(item.primaryDealIntent || '').toLowerCase();

        let background = 'var(--bg-card, #ffffff)';
        if (isSelected) {
            background = '#f1f5f9';
        } else if (intent === 'sell') {
            background = isDark ? 'rgba(244, 63, 94, 0.1)' : '#ffe4e6';
        } else if (intent === 'rent') {
            background = isDark ? 'rgba(234, 179, 8, 0.1)' : '#fef9c3';
        } else if (intent === 'lease') {
            background = isDark ? 'rgba(59, 130, 246, 0.1)' : '#dbeafe';
        }

        let borderLeft = '1px solid #f1f5f9';
        if (intent === 'sell') {
            borderLeft = '4px solid #ec4899';
        } else if (intent === 'rent') {
            borderLeft = '4px solid #f59e0b';
        } else if (intent === 'lease') {
            borderLeft = '4px solid #3b82f6';
        }

        return {
            background,
            borderLeft
        };
    };

    return (
        <div className="table-wrapper" style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'auto', overflowY: 'hidden' }}>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
            {loading && (
                <div style={{
                    position: 'absolute',
                    top: '41px',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <div className="premium-spinner" style={{
                        width: '36px',
                        height: '36px',
                        border: '3px solid rgba(99, 102, 241, 0.1)',
                        borderTop: '3px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }}></div>
                    <span style={{ marginTop: '14px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em', fontFamily: "'Inter', sans-serif" }}>
                        REFRESHING INVENTORY...
                    </span>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <DataTable
                    columns={columns}
                    data={inventoryItems}
                    keyField="_id"
                    disableRowKeyboardTrigger={true}
                    onRowClick={(item) => toggleSelect(item._id)}
                    getRowStyle={getRowStyle}
                    emptyMessage="No inventory found matching your criteria."
                    className="inventory-datatable"
                />
            </div>
        </div>
    );
};

export default React.memo(InventoryTable);
