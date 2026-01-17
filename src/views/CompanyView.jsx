import React, { useState } from 'react';
import { companyData, companyTypes } from '../data/companyData';
import { getInitials } from '../utils/helpers';

function CompanyView() {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const isSelected = (id) => selectedIds.includes(id);
    const selectedCount = selectedIds.length;

    // Filter companies
    const filteredCompanies = companyData.filter(company => {
        const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            company.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            company.phone.includes(searchTerm) ||
            company.address.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesSearch;
    });

    const totalCount = companyData.length;

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
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button className="btn-outline"><i className="fas fa-filter"></i> Filters</button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="content-body" style={{ display: 'flex', flexDirection: 'column', height: 'auto', overflow: 'visible', paddingTop: 0, position: 'relative' }}>
                    {/* Toolbar - Sticky */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '5px 2rem', minHeight: '45px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eef2f5', background: '#fff' }}>
                        {selectedCount > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedCount} Selected
                                </div>
                                <button className="action-btn" title="Export"><i className="fas fa-file-export"></i> Export</button>
                                <button className="action-btn" title="Assign Team"><i className="fas fa-users"></i> Assign</button>
                                <button className="action-btn" title="Add Tags"><i className="fas fa-tag"></i> Tag</button>
                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" onClick={() => setSelectedIds([])}><i className="fas fa-times"></i> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <>
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
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Items: <strong>{filteredCompanies.length}</strong> / <strong>{totalCount}</strong>
                                </div>
                            </>
                        )}
                    </div>

                    {/* List Header - Dark */}
                    <div className="list-header" style={{
                        position: 'sticky',
                        top: '45px',
                        background: '#0f172a',
                        color: '#fff',
                        zIndex: 100,
                        borderBottom: '2px solid #1e293b',
                        display: 'grid',
                        gridTemplateColumns: '40px 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 100px',
                        padding: '12px 2rem',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        letterSpacing: '0.5px'
                    }}>
                        <div><input type="checkbox" style={{ cursor: 'pointer' }} /></div>
                        <div>PERSONAL DETAILS</div>
                        <div>ADDRESS</div>
                        <div>EMPLOYEES</div>
                        <div>CATEGORY</div>
                        <div>SOURCE</div>
                        <div>TEAM</div>
                        <div>OWNERSHIP</div>
                        <div>ADD ON</div>
                    </div>

                    {/* List Content */}
                    <div id="companyListContent" style={{ background: '#fff' }}>
                        {filteredCompanies.map((company, idx) => (
                            <div
                                key={company.id}
                                className="list-item"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '40px 2fr 1.5fr 1fr 1fr 1fr 1.5fr',
                                    padding: '16px 2rem',
                                    borderBottom: '1px solid #f1f5f9',
                                    alignItems: 'center',
                                    background: isSelected(company.id) ? '#f0f9ff' : '#fff',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                }}
                                onMouseOver={(e) => {
                                    if (!isSelected(company.id)) e.currentTarget.style.background = '#fafbfc';
                                }}
                                onMouseOut={(e) => {
                                    if (!isSelected(company.id)) e.currentTarget.style.background = '#fff';
                                }}
                            >
                                <input
                                    type="checkbox"
                                    className="item-check"
                                    checked={isSelected(company.id)}
                                    onChange={() => toggleSelect(company.id)}
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
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {company.name}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#8e44ad', fontWeight: 600 }}>
                                                <i className="fas fa-envelope" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i>
                                                {company.email}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                            <i className="fas fa-phone-alt" style={{ marginRight: '4px', transform: 'scaleX(-1) rotate(5deg)' }}></i>
                                            {company.phone}
                                        </div>
                                    </div>
                                </div>

                                {/* Address */}
                                <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4, overflow: 'hidden' }}>
                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.7rem', marginRight: '6px' }}></i>
                                    <span className="address-clamp" style={{ fontSize: '0.75rem' }}>{company.address}</span>
                                </div>

                                {/* Employees */}
                                <div style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 700, textAlign: 'center' }}>
                                    <i className="fas fa-users" style={{ marginRight: '6px', color: '#64748b', fontSize: '0.75rem' }}></i>
                                    {company.employees}
                                </div>

                                {/* Category */}
                                <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3 }}>
                                    {company.category}
                                </div>

                                {/* Source */}
                                <div>
                                    <span style={{
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        background: company.source === 'Direct' ? '#dbeafe' :
                                            company.source === 'Government' ? '#fef3c7' :
                                                company.source === 'Referral' ? '#dcfce7' :
                                                    company.source === 'Partnership' ? '#ede9fe' : '#f1f5f9',
                                        color: company.source === 'Direct' ? '#1e40af' :
                                            company.source === 'Government' ? '#92400e' :
                                                company.source === 'Referral' ? '#166534' :
                                                    company.source === 'Partnership' ? '#5b21b6' : '#475569'
                                    }}>
                                        {company.source}
                                    </span>
                                </div>

                                {/* Team / Ownership / Date */}
                                <div style={{ fontSize: '0.75rem', lineHeight: 1.6 }}>
                                    <div style={{ color: '#0f172a', fontWeight: 700 }}>
                                        <i className="fas fa-users" style={{ marginRight: '6px', color: '#64748b', fontSize: '0.7rem' }}></i>
                                        {company.team}
                                    </div>
                                    <div style={{ color: '#64748b', marginTop: '4px' }}>
                                        <i className="fas fa-user" style={{ marginRight: '6px', fontSize: '0.7rem' }}></i>
                                        {company.ownership}
                                    </div>
                                    <div style={{ color: '#94a3b8', fontWeight: 600, marginTop: '4px', fontSize: '0.7rem' }}>
                                        <i className="far fa-calendar" style={{ marginRight: '6px' }}></i>
                                        {company.addedOn}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* No Results */}
                    {filteredCompanies.length === 0 && (
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
                            Total Company: <span style={{ color: 'var(--primary-color)' }}>{companyData.length}</span>
                        </div>
                        <div style={{ width: '2px', height: '20px', background: '#cbd5e1' }}></div>
                        {companyTypes.map((type, idx) => {
                            const count = companyData.filter(c => c.type === type).length;
                            if (count === 0) return null;
                            return (
                                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{type}:</span>
                                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CompanyView;
