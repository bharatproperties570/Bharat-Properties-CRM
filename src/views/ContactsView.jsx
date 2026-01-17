import React, { useState } from 'react';
import { contactData } from '../data/mockData';
import { getInitials, getSourceBadgeClass } from '../utils/helpers';
import { useContactSync } from '../hooks/useContactSync';

function ContactsView() {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Contact Sync Hook
    const { getSyncStatus, syncMultipleContacts } = useContactSync();

    // Handle bulk sync
    const handleBulkSync = async () => {
        const contactsToSync = contactData.filter(c => selectedIds.includes(c.mobile));
        if (contactsToSync.length === 0) {
            alert('Please select contacts to sync');
            return;
        }

        const result = await syncMultipleContacts(contactsToSync);
        if (result.success) {
            const totalSynced = result.results.google.synced + result.results.apple.synced;
            alert(`✅ Successfully synced ${totalSynced} contact(s)!`);
            setSelectedIds([]); // Clear selection
        } else {
            alert('❌ Sync failed: ' + result.error);
        }
    };

    // Filtering logic
    const filteredContacts = contactData.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.mobile.includes(searchTerm) ||
        (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Grouping Logic
    const groups = {};
    filteredContacts.forEach(c => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
    });

    // Selection Handling
    const toggleSelect = (mobile) => {
        if (selectedIds.includes(mobile)) {
            setSelectedIds(selectedIds.filter(id => id !== mobile));
        } else {
            setSelectedIds([...selectedIds, mobile]);
        }
    }

    const isSelected = (mobile) => selectedIds.includes(mobile);
    const totalCount = contactData.length;
    const selectedCount = selectedIds.length;

    return (
        <section id="contactsView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-bars" style={{ color: '#68737d' }}></i>
                        <div>
                            <span className="working-list-label">Luxury CRM</span>
                            <h1>Contacts Portfolio</h1>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button
                            className="btn-outline"
                            onClick={handleBulkSync}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-sync-alt"></i>
                            Sync Contacts
                        </button>
                        <button className="btn-outline">Download CSV</button>
                        <button className="btn-outline"><i className="fas fa-filter"></i> Filters</button>
                    </div>
                </div>

                <div className="content-body" style={{ overflowY: 'visible', paddingTop: 0, position: 'relative' }}>
                    {/* Toolbar */}
                    <div className="toolbar-container" style={{ position: 'sticky', top: 0, zIndex: 101, padding: '15px 2rem', borderBottom: '1px solid #eef2f5', minHeight: '65px', display: 'flex', alignItems: 'center', background: '#fff' }}>
                        {selectedCount > 0 ? (
                            <div className="action-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', overflowX: 'auto', paddingBottom: '2px' }}>
                                <div className="selection-count" style={{ marginRight: '10px', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                    {selectedCount} Selected
                                </div>

                                {/* Single Selection Only */}
                                {selectedCount === 1 && (
                                    <>
                                        <button className="action-btn" title="Call Contact"><i className="fas fa-phone-alt" style={{ transform: 'scaleX(-1) rotate(5deg)' }}></i> Call</button>
                                        <button className="action-btn" title="Email Contact"><i className="fas fa-envelope"></i> Email</button>
                                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }}></div>
                                    </>
                                )}

                                <button className="action-btn" title="Bulk Actions"><i className="fas fa-layer-group"></i> Bulk</button>
                                <button className="action-btn" title="Add Tag"><i className="fas fa-tag"></i> Tag</button>

                                <div style={{ marginLeft: 'auto' }}>
                                    <button className="action-btn danger" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <div style={{ position: 'relative', width: '350px' }}>
                                    <input
                                        type="text"
                                        className="search-input-premium"
                                        placeholder="Search by name, phone or email..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                    <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Showing: <strong>{filteredContacts.length}</strong> / <strong>{totalCount}</strong>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Header Strip (Pati) */}
                    <div className="list-header contact-list-grid" style={{ position: 'sticky', top: '65px', background: '#f8fafc', zIndex: 100, borderBottom: '2px solid #e2e8f0' }}>
                        <div><input type="checkbox" /></div>
                        <div>Contact Identity</div>
                        <div>Location & Address</div>
                        <div>Classification</div>
                        <div>Last Interaction</div>
                        <div>Assignment & History</div>
                    </div>

                    <div id="contactListContent">
                        {Object.keys(groups).map(groupName => (
                            <div key={groupName} className="list-group">
                                <div className="group-header" style={{ padding: '12px 2rem', letterSpacing: '0.5px' }}>{groupName.toUpperCase()}</div>
                                {groups[groupName].map((item, idx) => (
                                    <div key={item.mobile} className="list-item contact-list-grid" style={{ padding: '15px 2rem' }}>
                                        <input
                                            type="checkbox"
                                            className="item-check"
                                            checked={isSelected(item.mobile)}
                                            onChange={() => toggleSelect(item.mobile)}
                                        />
                                        <div className="col-identity">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <div className={`avatar-circle avatar-${(idx % 5) + 1}`} style={{ width: '38px', height: '38px', fontSize: '0.85rem' }}>
                                                    {getInitials(item.name)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{item.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{item.mobile}</span>
                                                        <span className={`source-badge ${getSourceBadgeClass(item.source)}`} style={{ fontSize: '0.65rem', padding: '1px 8px' }}>{item.source}</span>

                                                        {/* Sync Status Indicators */}
                                                        {(() => {
                                                            const syncStatus = getSyncStatus(item);
                                                            return (
                                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                    {syncStatus.google.synced && (
                                                                        <span title={`Synced to Google Contacts on ${new Date(syncStatus.google.lastSyncTime).toLocaleDateString()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: '#4285F410', borderRadius: '4px' }}>
                                                                            <i className="fab fa-google" style={{ color: '#4285F4', fontSize: '0.7rem' }}></i>
                                                                            <span style={{ fontSize: '0.6rem', color: '#4285F4', fontWeight: 700 }}>G</span>
                                                                        </span>
                                                                    )}
                                                                    {syncStatus.apple.synced && (
                                                                        <span title={`Synced to Apple Contacts on ${new Date(syncStatus.apple.lastSyncTime).toLocaleDateString()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', background: '#64748b10', borderRadius: '4px' }}>
                                                                            <i className="fab fa-apple" style={{ color: '#64748b', fontSize: '0.7rem' }}></i>
                                                                            <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>A</span>
                                                                        </span>
                                                                    )}
                                                                    {!syncStatus.google.synced && !syncStatus.apple.synced && (
                                                                        <span title="Not synced to any cloud provider" style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px' }}>
                                                                            <i className="fas fa-cloud-upload-alt" style={{ color: '#cbd5e1', fontSize: '0.7rem' }}></i>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-address">
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                <i className="fas fa-map-marker-alt" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}></i>
                                                <div className="address-clamp" style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, lineHeight: 1.4 }}>{item.address || 'Address not listed'}</div>
                                            </div>
                                        </div>

                                        <div className="col-classification">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <span className="prof-badge" style={{ fontSize: '0.6rem', padding: '3px 10px', fontWeight: 800 }}>{item.professional.toUpperCase()}</span>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 800 }}>#{item.tags.replace(' ', '')}</div>
                                            </div>
                                        </div>

                                        <div className="col-interaction">
                                            <div style={{ lineHeight: '1.4' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{item.lastComm}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Active: {item.actionable}</div>
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                                    <i className="fas fa-phone-alt" style={{ color: '#388E3C', fontSize: '0.75rem', transform: 'scaleX(-1) rotate(5deg)' }}></i>
                                                    <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '0.75rem' }}></i>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-assignment">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div className="profile-circle" style={{ width: '28px', height: '28px', fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b' }}>{item.ownership.charAt(0)}</div>
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{item.ownership}</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>Added {item.addOnDate}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <footer className="summary-footer" style={{ height: '60px', padding: '0 2rem' }}>
                <div className="summary-label" style={{ background: '#334155', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '0.7rem' }}>LIVE SYNC</div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div className="stat-pill">TOTAL <strong>{totalCount}</strong></div>
                    <div className="stat-pill">CUSTOMERS <strong>2</strong></div>
                    <div className="stat-pill" style={{ color: 'var(--primary-color)' }}>NEW LEADS <strong>14</strong></div>
                </div>
            </footer>
        </section>
    );
}

export default ContactsView;
