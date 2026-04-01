import React from 'react';

const InventoryOwnerSection = ({
    formData,
    setFormData,
    ownerSearch,
    setOwnerSearch,
    showOwnerResults,
    setShowOwnerResults,
    filteredOwners,
    selectedContactToLink,
    setSelectedContactToLink,
    linkData,
    setLinkData,
    handleLinkOwner,
    teams,
    users,
    handleInputChange,
    inputStyle,
    labelStyle,
    customSelectStyle,
    buttonStyle,
    sectionStyle
}) => {
    return (
        <div className="tab-content fade-in">
            {/* Search Section */}
            {!selectedContactToLink ? (
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#ecfdf5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-user-plus" style={{ color: '#10b981' }}></i>
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Add Property Owners</h4>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Search and link owners or associates to this property</p>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <i className="fas fa-search" style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8', fontSize: '0.9rem' }}></i>
                                <input
                                    style={{ ...inputStyle, paddingLeft: '40px', background: '#f8fafc' }}
                                    placeholder="Search by name or mobile number..."
                                    value={ownerSearch}
                                    onChange={(e) => {
                                        setOwnerSearch(e.target.value);
                                        setShowOwnerResults(true);
                                    }}
                                    onFocus={() => setShowOwnerResults(true)}
                                />
                            </div>
                        </div>

                        {showOwnerResults && filteredOwners.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', marginTop: '8px', zIndex: 100, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' }}>
                                {filteredOwners.map(contact => (
                                    <div
                                        key={contact.mobile}
                                        onClick={() => {
                                            setSelectedContactToLink(contact);
                                            setShowOwnerResults(false);
                                        }}
                                        style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '2px' }}
                                        className="hover:bg-slate-50"
                                    >
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{contact.fullName || contact.name || `${contact.firstName} ${contact.lastName}`}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            <i className="fas fa-phone-alt" style={{ marginRight: '6px' }}></i>
                                            {contact.phones?.[0]?.number || contact.mobile || 'No mobile'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ ...sectionStyle, border: '1.5px solid #3b82f6', background: '#eff6ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ width: '48px', height: '48px', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#3b82f6', fontWeight: 700 }}>
                                {selectedContactToLink.name.charAt(0)}
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{selectedContactToLink.name}</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>{selectedContactToLink.mobile}</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setSelectedContactToLink(null)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div style={{ gridColumn: linkData.role === 'Associate' ? 'span 2' : 'span 1' }}>
                            <label style={labelStyle}>Role</label>
                            <select
                                style={{ ...customSelectStyle, background: '#fff' }}
                                value={linkData.role}
                                onChange={e => setLinkData({ ...linkData, role: e.target.value, relationship: '' })}
                            >
                                <option>Property Owner</option>
                                <option>Associate</option>
                            </select>
                        </div>
                        {linkData.role === 'Property Owner' && (
                            <div>
                                <label style={labelStyle}>Source/Reason</label>
                                <select
                                    style={{ ...customSelectStyle, background: '#fff' }}
                                    value={linkData.source || 'Update data'}
                                    onChange={e => setLinkData({ ...linkData, source: e.target.value })}
                                >
                                    <option>Deal by us</option>
                                    <option>Deal by competitor</option>
                                    <option>Family transfer</option>
                                    <option>Deal by yourself</option>
                                    <option>Update data</option>
                                </select>
                            </div>
                        )}
                        {linkData.role === 'Associate' && (
                            <div>
                                <label style={labelStyle}>Relationship to Owner</label>
                                <select
                                    style={{ ...customSelectStyle, background: '#fff' }}
                                    value={linkData.relationship}
                                    onChange={e => setLinkData({ ...linkData, relationship: e.target.value })}
                                >
                                    <option value="">Select Relationship</option>
                                    <option>Husband</option>
                                    <option>Wife</option>
                                    <option>Father</option>
                                    <option>Mother</option>
                                    <option>Brother</option>
                                    <option>Sister</option>
                                    <option>Son</option>
                                    <option>Daughter</option>
                                    <option>Partner</option>
                                    <option>Broker</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={handleLinkOwner}
                            disabled={linkData.role === 'Associate' && !linkData.relationship}
                            style={{
                                ...buttonStyle.primary,
                                opacity: (linkData.role === 'Associate' && !linkData.relationship) ? 0.6 : 1,
                                cursor: (linkData.role === 'Associate' && !linkData.relationship) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Confirm & Add
                        </button>
                    </div>
                </div>
            )}

            {/* List of Added Owners */}
            {formData.owners.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Linked People</h4>
                    {formData.owners.map((owner, idx) => (
                        <div key={idx} style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: owner.role === 'Property Owner' ? '#eff6ff' : '#fefce8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: owner.role === 'Property Owner' ? '#3b82f6' : '#ca8a04', fontWeight: 700 }}>
                                    {owner.name.charAt(0)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{owner.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        {owner.role === 'Property Owner' ? 'Owner' : `Associate (${owner.relationship})`} • {owner.mobile}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, owners: prev.owners.filter((_, i) => i !== idx) }))}
                                style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* System Assignment & Visibility */}
            <div style={{ ...sectionStyle, marginTop: '32px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-layer-group" style={{ color: '#6366f1' }}></i> System Assignment
                </h4>
                <div className="grid-3-col">
                    <div>
                        <label style={labelStyle}>Team</label>
                        <select
                            style={customSelectStyle}
                            value={formData.team}
                            onChange={e => {
                                const newTeam = e.target.value;
                                setFormData(prev => ({
                                    ...prev,
                                    team: newTeam,
                                    assignedTo: '' // Reset assigned user when team changes
                                }));
                            }}
                        >
                            <option value="">Select Team</option>
                            {teams?.map(team => (
                                <option key={team._id} value={team._id}>{team.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Assign</label>
                        <select
                            style={customSelectStyle}
                            value={formData.assignedTo}
                            onChange={e => handleInputChange('assignedTo', e.target.value)}
                        >
                            <option value="">Select Salesperson</option>
                            {users
                                .filter(user => !formData.team || (user.team && user.team === formData.team) || (user.team?._id === formData.team))
                                .map(user => (
                                    <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
                                ))
                            }
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Visibility</label>
                        <select
                            style={customSelectStyle}
                            value={formData.visibleTo}
                            onChange={e => handleInputChange('visibleTo', e.target.value)}
                        >
                            <option value="Private">Private</option>
                            <option value="Team">Team</option>
                            <option value="Everyone">Everyone</option>
                        </select>
                    </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', fontStyle: 'italic' }}>
                    <i className="fas fa-info-circle mr-1"></i> Assignment is derived automatically based on Project selection but can be manually overridden.
                </p>
            </div>
        </div>
    );
};

export default React.memo(InventoryOwnerSection);
