import React, { useState, useEffect, useCallback } from 'react';
import { getInitials } from '../../utils/helpers';
import CompanyFilterPanel from './components/CompanyFilterPanel';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

function CompanyPage({ onEdit, onNavigate }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [filters, setFilters] = useState({});

    // API Data States
    const [companies, setCompanies] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                limit: recordsPerPage,
                search: searchTerm,
                ...filters
            };
            const response = await api.get('/companies', { params });
            if (response.data && response.data.success) {
                setCompanies(response.data.records || []);
                setTotalCount(response.data.totalCount || 0);
                setTotalPages(response.data.totalPages || 0);
            }
        } catch (error) {
            console.error("Error fetching companies:", error);
            toast.error("Failed to load companies");
        } finally {
            setLoading(false);
        }
    }, [currentPage, recordsPerPage, searchTerm, filters]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchData();
        }, 500); // Debounce search
        return () => clearTimeout(timeoutId);
    }, [fetchData]);

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const isSelected = (id) => selectedIds.includes(id);
    const selectedCount = selectedIds.length;

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    // Select All Handler
    const toggleSelectAll = () => {
        if (selectedIds.length === companies.length && companies.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(companies.map(c => c._id));
        }
    };

    // Check if all visible companies are selected
    const isAllSelected = companies.length > 0 && selectedIds.length === companies.length;
    const isIndeterminate = selectedIds.length > 0 && selectedIds.length < companies.length;

    const renderLookup = (field, fallback = '-') => {
        if (!field) return fallback;
        if (typeof field === 'object' && field.lookup_value) return field.lookup_value;
        if (typeof field === 'object' && field.name) return field.name; // For user refs
        if (typeof field === 'object') return fallback;
        return field || fallback;
    };

    const getFirstAddress = (company) => {
        if (!company.addresses) return '-';
        const reg = company.addresses['Registered Office'];
        if (reg) {
            const components = [
                reg.hNo,
                reg.street,
                renderLookup(reg.city),
                renderLookup(reg.state)
            ].filter(Boolean);
            return components.join(', ') || '-';
        }
        return '-';
    };

    return (
        <section id="companyView" className="view-section active">
            <div className="view-scroll-wrapper">
                {/* Header */}
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-building" style={{ color: 'var(--primary-color)' }}></i>
                        <div>
                            <span className="working-list-label">Business Directory</span>
                            <h1>Company Portfolio</h1>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {/* Sync Status Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-check-circle'} text-green-600 text-sm`}></i>
                            <span className="text-xs font-semibold text-green-700">{loading ? 'Syncing...' : 'Synced'}</span>
                        </div>
                        {/* View Toggle Button */}
                        <button
                            className="btn-outline"
                            onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                            title={viewMode === 'list' ? 'Switch to Card View' : 'Switch to List View'}
                        >
                            <i className={`fas ${viewMode === 'list' ? 'fa-th-large' : 'fa-list'}`}></i> {viewMode === 'list' ? 'Card' : 'List'}
                        </button>
                        <button
                            className="btn-outline"
                            onClick={() => setIsFilterPanelOpen(true)}
                            style={{ position: 'relative' }}
                        >
                            <i className="fas fa-filter"></i> Filters
                            {Object.keys(filters).length > 0 && (
                                <span style={{
                                    position: 'absolute', top: '-5px', right: '-5px',
                                    width: '10px', height: '10px', background: 'red', borderRadius: '50%'
                                }}></span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="content-body" style={{ display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'visible', paddingTop: 0, position: 'relative' }}>
                    {/* Toolbar - Sticky */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', minHeight: '45px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eef2f5', background: '#fff' }}>
                        {selectedCount > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
                                {/* Select All Checkbox - Always visible */}
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = isIndeterminate;
                                        }
                                    }}
                                    onChange={toggleSelectAll}
                                    style={{ cursor: 'pointer' }}
                                />
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedCount} Selected
                                </div>
                                {selectedCount === 1 && (
                                    <button
                                        className="action-btn"
                                        title="Edit Business"
                                        onClick={() => {
                                            const companyToEdit = companies.find(c => c._id === selectedIds[0]);
                                            if (companyToEdit) onEdit(companyToEdit);
                                        }}
                                        style={{ color: '#10b981', borderColor: '#10b981', background: '#f0fdf4' }}
                                    >
                                        <i className="fas fa-edit"></i> Edit
                                    </button>
                                )}
                                <button className="action-btn" title="Export"><i className="fas fa-file-export"></i> Export</button>
                                <button className="action-btn" title="Assign Team"><i className="fas fa-users"></i> Assign</button>
                                <button className="action-btn" title="Add Tags"><i className="fas fa-tag"></i> Tag</button>
                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" onClick={() => setSelectedIds([])}><i className="fas fa-trash-alt"></i> Delete</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    {/* Select All Checkbox - Only for Card View */}
                                    {viewMode === 'card' && (
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            ref={input => {
                                                if (input) {
                                                    input.indeterminate = isIndeterminate;
                                                }
                                            }}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    )}
                                    <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
                                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                        <input
                                            type="text"
                                            placeholder="search by name, email, mobile, company and tags"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px 8px 36px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                outline: 'none',
                                                transition: 'all 0.2s'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--primary-color)'}
                                            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        Items: <strong>{companies.length}</strong> / <strong>{totalCount}</strong>
                                    </div>

                                    {/* Records Per Page */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                                        <span>Show:</span>
                                        <select
                                            value={recordsPerPage}
                                            onChange={handleRecordsPerPageChange}
                                            style={{
                                                padding: '4px 8px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                color: '#0f172a',
                                                outline: 'none',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={300}>300</option>
                                            <option value={500}>500</option>
                                            <option value={1000}>1000</option>
                                        </select>
                                    </div>

                                    {/* Pagination Controls */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={goToPreviousPage}
                                            disabled={currentPage === 1}
                                            style={{
                                                padding: '6px 12px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: currentPage === 1 ? '#f8fafc' : '#fff',
                                                color: currentPage === 1 ? '#cbd5e1' : '#0f172a',
                                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <i className="fas fa-chevron-left"></i> Prev
                                        </button>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', minWidth: '80px', textAlign: 'center' }}>
                                            {currentPage} / {totalPages || 1}
                                        </span>
                                        <button
                                            onClick={goToNextPage}
                                            disabled={currentPage >= totalPages}
                                            style={{
                                                padding: '6px 12px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: currentPage >= totalPages ? '#f8fafc' : '#fff',
                                                color: currentPage >= totalPages ? '#cbd5e1' : '#0f172a',
                                                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            Next <i className="fas fa-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* List Header - Only in List View */}
                    {viewMode === 'list' && (
                        <div className="list-header" style={{
                            position: 'sticky',
                            top: '45px',
                            background: '#f8fafc',
                            color: '#64748b',
                            zIndex: 100,
                            borderBottom: '2px solid #e2e8f0',
                            display: 'grid',
                            gridTemplateColumns: '40px 2fr 1.5fr 1fr 1.25fr 1fr 1fr',
                            padding: '12px 2rem',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            letterSpacing: '0.5px'
                        }}>
                            <div>
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = isIndeterminate;
                                        }
                                    }}
                                    onChange={toggleSelectAll}
                                    style={{ cursor: 'pointer' }}
                                />
                            </div>
                            <div>COMPANY NAME</div>
                            <div>ADDRESS</div>
                            <div>EMPLOYEES</div>
                            <div>CATEGORY</div>
                            <div>SOURCE</div>
                            <div>OWNERSHIP</div>
                        </div>
                    )}

                    {/* List Content - Only in List View */}
                    {viewMode === 'list' && (
                        <div id="companyListContent" style={{ background: '#fff' }}>
                            {companies.map((company, idx) => (
                                <div
                                    key={company._id}
                                    className="list-item"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '40px 2fr 1.5fr 1fr 1.25fr 1fr 1fr',
                                        padding: '16px 2rem',
                                        borderBottom: '1px solid #f1f5f9',
                                        alignItems: 'center',
                                        background: isSelected(company._id) ? '#f0f9ff' : '#fff',
                                        transition: 'all 0.2s',
                                        cursor: 'pointer'
                                    }}
                                    onMouseOver={(e) => {
                                        if (!isSelected(company._id)) e.currentTarget.style.background = '#fafbfc';
                                    }}
                                    onMouseOut={(e) => {
                                        if (!isSelected(company._id)) e.currentTarget.style.background = '#fff';
                                        else e.currentTarget.style.background = '#f0f9ff';
                                    }}
                                    onClick={() => toggleSelect(company._id)}
                                >
                                    <input
                                        type="checkbox"
                                        className="item-check"
                                        checked={isSelected(company._id)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleSelect(company._id);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    />

                                    {/* Personal Details */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div className={`avatar-circle avatar-${(idx % 5) + 1}`} style={{
                                            width: '40px',
                                            height: '40px',
                                            fontSize: '0.85rem',
                                            flexShrink: 0
                                        }}>
                                            {getInitials(company.name)}
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <div
                                                onClick={(e) => { e.stopPropagation(); onNavigate('company-detail', company._id); }}
                                                style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                                                className="hover:underline"
                                            >
                                                {company.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#8e44ad', fontWeight: 600 }}>
                                                    <i className="fas fa-envelope" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i>
                                                    {company.emails?.[0]?.address || '-'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                <i className="fas fa-phone-alt" style={{ marginRight: '4px', transform: 'scaleX(-1) rotate(5deg)' }}></i>
                                                {company.phones?.[0]?.phoneNumber ? `${company.phones[0].phoneCode} ${company.phones[0].phoneNumber}` : '-'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4, overflow: 'hidden' }}>
                                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.7rem', marginRight: '6px' }}></i>
                                        <span className="address-clamp" style={{ fontSize: '0.75rem' }}>{getFirstAddress(company)}</span>
                                    </div>

                                    {/* Employees */}
                                    <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700, textAlign: 'center' }}>
                                        <i className="fas fa-users" style={{ marginRight: '6px', color: '#64748b', fontSize: '0.75rem' }}></i>
                                        {company.employees?.length || 0}
                                    </div>

                                    {/* Category / Industry */}
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>
                                        {renderLookup(company.industry)}
                                    </div>

                                    {/* Source */}
                                    <div>
                                        <span style={{
                                            padding: '3px 10px',
                                            borderRadius: '12px',
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            background: '#f1f5f9',
                                            color: '#475569'
                                        }}>
                                            {renderLookup(company.source)}
                                        </span>
                                    </div>

                                    {/* Ownership / Date Combined */}
                                    <div style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>
                                        <div style={{ color: '#0f172a', fontWeight: 700 }}>
                                            <i className="fas fa-user" style={{ marginRight: '6px', color: '#64748b', fontSize: '0.7rem' }}></i>
                                            {renderLookup(company.owner)}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontWeight: 600, marginTop: '4px', fontSize: '0.7rem' }}>
                                            <i className="far fa-calendar" style={{ marginRight: '6px' }}></i>
                                            {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : '-'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Card View - Only in Card Mode */}
                    {viewMode === 'card' && (
                        <div style={{ padding: '2rem', background: '#f8fafc' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                                gap: '1.5rem'
                            }}>
                                {companies.map((company, idx) => (
                                    <div
                                        key={company._id}
                                        style={{
                                            background: '#fff',
                                            border: isSelected(company._id) ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            padding: '20px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            position: 'relative',
                                            boxShadow: isSelected(company._id) ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 3px 0 rgba(0,0,0,0.05)'
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isSelected(company._id)) {
                                                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0,0,0,0.05)';
                                            }
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                        onClick={() => toggleSelect(company._id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected(company._id)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleSelect(company._id);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '15px',
                                                right: '15px',
                                                cursor: 'pointer',
                                                width: '18px',
                                                height: '18px'
                                            }}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                            <div className={`avatar-circle avatar-${(idx % 5) + 1}`} style={{
                                                width: '50px',
                                                height: '50px',
                                                fontSize: '1rem',
                                                flexShrink: 0
                                            }}>
                                                {getInitials(company.name)}
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); onNavigate('company-detail', company._id); }}
                                                    style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '1.05rem', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                                                    className="hover:underline"
                                                >
                                                    {company.name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                                    {renderLookup(company.industry)}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-envelope" style={{ fontSize: '0.75rem', color: '#8e44ad', width: '16px' }}></i>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {company.emails?.[0]?.address || '-'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-phone-alt" style={{ fontSize: '0.75rem', color: '#3498db', width: '16px', transform: 'scaleX(-1) rotate(5deg)' }}></i>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    {company.phones?.[0]?.phoneNumber ? `${company.phones[0].phoneCode} ${company.phones[0].phoneNumber}` : '-'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.75rem', color: '#e74c3c', width: '16px' }}></i>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {getFirstAddress(company)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-users" style={{ fontSize: '0.75rem', color: '#27ae60', width: '16px' }}></i>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    {company.employees?.length || 0} Employees
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Source</div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{renderLookup(company.source)}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Owner</div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{renderLookup(company.owner)}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No Results */}
                    {!loading && companies.length === 0 && (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                            <i className="fas fa-building" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '1rem' }}></i>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#64748b' }}>No companies found</div>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '8px' }}>Try adjusting your search or filters</div>
                        </div>
                    )}

                    {/* Footer Summary */}
                    <div style={{
                        position: 'sticky',
                        bottom: 0,
                        background: '#f8fafc',
                        borderTop: '2px solid #e2e8f0',
                        padding: '16px 2rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '20px',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: '#475569',
                        zIndex: 100,
                        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.02)'
                    }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
                            Total Companies: <span style={{ color: 'var(--primary-color)' }}>{totalCount}</span>
                        </div>
                    </div>
                </div>
            </div>
            {/* Filter Panel */}
            <CompanyFilterPanel
                isOpen={isFilterPanelOpen}
                onClose={() => setIsFilterPanelOpen(false)}
                filters={filters}
                onFilterChange={(newFilters) => {
                    setFilters(newFilters);
                    setCurrentPage(1);
                }}
            />
        </section>
    );
}

export default CompanyPage;
