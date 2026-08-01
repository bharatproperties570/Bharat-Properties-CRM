import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { contactsAPI } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { usePropertyConfig } from '../../context/PropertyConfigContext';

const MergeContactsModal = ({ isOpen, onClose, selectedContactsData, onSuccess }) => {
    const { isDark } = useTheme();
    const { getLookupValue } = usePropertyConfig();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [masterId, setMasterId] = useState('');
    const [resolvedData, setResolvedData] = useState({});
    const [availableAddresses, setAvailableAddresses] = useState([]);
    const [availablePhones, setAvailablePhones] = useState([]);
    const [availableEmails, setAvailableEmails] = useState([]);

    // Reset when modal opens/closes or selection changes
    useEffect(() => {
        if (isOpen && selectedContactsData?.length > 1) {
            // Default to the first one as master
            const firstId = selectedContactsData[0]._id;
            setMasterId(firstId);
            
            // Auto-resolve non-conflicting fields
            autoResolveFields(firstId, selectedContactsData);
        }
    }, [isOpen, selectedContactsData]);

    const autoResolveFields = (currentMasterId, contacts) => {
        if (!contacts || contacts.length === 0) return;
        
        const master = contacts.find(c => c._id === currentMasterId) || contacts[0];
        
        const initialResolution = {
            firstName: master.firstName || master.name || '',
            surname: master.surname || '',
            title: master.title || '',
            mobile: master.mobile || master.phones?.[0]?.number || '',
            email: master.email || master.emails?.[0]?.address || '',
            assignedTo: master.assignedTo?._id || master.assignedTo || '',
            leadSource: master.leadSource || master.source || '',
            personalAddress: master.personalAddress || null,
            correspondenceAddress: master.correspondenceAddress || null,
        };

        // Combine Arrays automatically
        const allTags = new Set();
        const allGroups = new Set();
        const allPhones = [];
        const allEmails = [];
        const allAddresses = []; // Track all unique address objects
        
        // Helper to stringify address for uniqueness check
        const getAddressString = (addr) => {
            if (!addr) return '';
            return `${addr.hNo||''} ${addr.street||''} ${addr.landmark||''} ${addr.city||''} ${addr.state||''} ${addr.pincode||''}`.trim().toLowerCase();
        };

        contacts.forEach((c, idx) => {
            if (c.tags && Array.isArray(c.tags)) c.tags.forEach(t => allTags.add(typeof t === 'object' ? t._id || t.value : t));
            if (c.groups && Array.isArray(c.groups)) c.groups.forEach(g => allGroups.add(typeof g === 'object' ? g._id || g.value : g));
            
            // Collect all unique phones and emails
            if (c.phones && Array.isArray(c.phones)) {
                c.phones.forEach(p => {
                    if (p.number && !allPhones.some(existing => existing.number === p.number)) {
                        allPhones.push(p);
                    }
                });
            } else if (c.mobile && !allPhones.some(existing => existing.number === c.mobile)) {
                allPhones.push({ number: c.mobile, type: 'Personal' });
            }
            
            if (c.emails && Array.isArray(c.emails)) {
                c.emails.forEach(e => {
                    if (e.address && !allEmails.some(existing => existing.address === e.address)) {
                        allEmails.push(e);
                    }
                });
            } else if (c.email && !allEmails.some(existing => existing.address === c.email)) {
                allEmails.push({ address: c.email, type: 'Personal' });
            }

            // Extract Addresses
            const addrs = [
                { type: 'Personal', data: c.personalAddress, source: `Contact ${idx + 1}` },
                { type: 'Correspondence', data: c.correspondenceAddress, source: `Contact ${idx + 1}` }
            ];
            
            addrs.forEach(addr => {
                if (addr.data && Object.keys(addr.data).some(k => addr.data[k])) {
                    const addrStr = getAddressString(addr.data);
                    if (addrStr && !allAddresses.some(existing => getAddressString(existing.data) === addrStr)) {
                        allAddresses.push(addr);
                    }
                }
            });
        });

        initialResolution.tags = Array.from(allTags);
        initialResolution.groups = Array.from(allGroups);
        initialResolution.phones = allPhones;
        initialResolution.emails = allEmails;
        // Do not auto-resolve addresses, let user pick from allAddresses, but set defaults to master's
        // Master's addresses are already set in initialResolution.personalAddress and initialResolution.correspondenceAddress

        setResolvedData(initialResolution);
        // Expose to state so we can render them
        setAvailableAddresses(allAddresses);
        setAvailablePhones(allPhones);
        setAvailableEmails(allEmails);
    };

    const handleMasterSelection = (id) => {
        setMasterId(id);
        autoResolveFields(id, selectedContactsData);
    };

    const handleFieldResolve = (field, value) => {
        setResolvedData(prev => ({ ...prev, [field]: value }));
    };

    const handleMerge = async () => {
        if (!masterId) return toast.error("Please select a Master Contact");
        
        const duplicateIds = selectedContactsData
            .map(c => c._id)
            .filter(id => id !== masterId);

        if (duplicateIds.length === 0) return toast.error("No duplicates to merge");

        setIsSubmitting(true);
        try {
            const payload = {
                masterContactId: masterId,
                duplicateContactIds: duplicateIds,
                resolvedData
            };
            
            const response = await contactsAPI.mergeContacts(payload);
            if (response.success) {
                toast.success('Contacts merged successfully');
                onSuccess(); // Triggers a reload of the list
                onClose();
            } else {
                throw new Error(response.message || 'Merge failed');
            }
        } catch (error) {
            console.error('Merge Error:', error);
            toast.error(error?.response?.data?.message || error.message || 'Failed to merge contacts');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !selectedContactsData || selectedContactsData.length < 2) return null;

    const overlayStyle = {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.2s ease-out"
    };

    const modalStyle = {
        width: "90%",
        maxWidth: "1000px",
        height: "90vh",
        backgroundColor: isDark ? "#1e293b" : "#fff",
        color: isDark ? "#f8fafc" : "#0f172a",
        borderRadius: "16px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "scaleIn 0.2s ease-out"
    };

    const headerStyle = {
        padding: "20px 24px",
        borderBottom: isDark ? "1px solid #334155" : "1px solid #f1f5f9",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: isDark ? "#1e293b" : "#fff",
    };

    const bodyStyle = {
        flex: 1,
        padding: "24px 32px 40px 32px",
        overflowY: "auto",
        backgroundColor: isDark ? "#0f172a" : "#f8fafc",
    };

    const footerStyle = {
        padding: "16px 24px",
        borderTop: isDark ? "1px solid #334155" : "1px solid #f1f5f9",
        backgroundColor: isDark ? "#1e293b" : "#f8fafc",
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: "12px"
    };

    const buttonStyles = {
        cancel: {
            padding: "10px 24px",
            borderRadius: "8px",
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#ef4444",
            fontWeight: 600,
            cursor: "pointer",
        },
        primary: {
            padding: "10px 24px",
            borderRadius: "8px",
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
        }
    };

    return (
        <div style={overlayStyle}>
            <style>
                {`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                `}
            </style>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Merge Contacts ({selectedContactsData.length})</h2>
                    <button 
                        onClick={onClose} 
                        disabled={isSubmitting}
                        style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: isDark ? '#94a3b8' : '#64748b' }}
                    >
                        &times;
                    </button>
                </div>
                
                <div style={bodyStyle}>
                    <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'var(--bg-warning, #fff3cd)', color: 'var(--text-warning, #856404)', borderRadius: '4px', fontSize: '0.9rem' }}>
                        <strong>Warning:</strong> Merging cannot be undone. All related records will be transferred to the Master Contact, and duplicates will be soft-deleted. Arrays (phones, emails, documents, etc.) are combined automatically.
                    </div>

                    <div style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>1. Select Master Contact</h3>
                        <div style={{ display: 'flex', gap: '15px', overflowX: 'auto' }}>
                            {selectedContactsData.map((contact, idx) => (
                                <div 
                                    key={`master-${contact._id}`}
                                    onClick={() => handleMasterSelection(contact._id)}
                                    style={{ 
                                        flex: '1', minWidth: '200px', padding: '15px', borderRadius: '8px', cursor: 'pointer',
                                        border: masterId === contact._id ? '2px solid #3b82f6' : (isDark ? '1px solid #334155' : '1px solid #e2e8f0'),
                                        backgroundColor: masterId === contact._id ? (isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff') : (isDark ? '#0f172a' : '#fff')
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Contact {idx + 1}</div>
                                    <div style={{ fontSize: '0.9rem', color: isDark ? '#cbd5e1' : '#475569' }}>{contact.firstName || contact.name} {contact.surname}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '5px' }}>ID: {contact._id.slice(-6)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>2. Resolve Conflicts</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '15px', marginTop: '-10px' }}>
                            Only fields with conflicting values are shown below. Identical fields have been auto-resolved.
                        </p>
                        
                        <div className="merge-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedContactsData.length + 1}, 1fr)`, gap: '15px', overflowX: 'auto' }}>
                            {/* Headers */}
                            <div className="merge-col-header" style={{ fontWeight: 'bold', color: '#64748b' }}>Field</div>
                            {selectedContactsData.map((contact, idx) => (
                                <div key={`res-header-${contact._id}`} className="merge-col-header" style={{ fontWeight: 'bold', textAlign: 'center', color: masterId === contact._id ? '#3b82f6' : 'inherit' }}>
                                    Contact {idx + 1} {masterId === contact._id && '(Master)'}
                                </div>
                            ))}

                            {/* Dynamic Rows Helper */}
                            {(() => {
                                const renderDiffRow = (label, fieldKey, extractVal = v => v) => {
                                    const values = selectedContactsData.map(c => extractVal(c[fieldKey]));
                                    const allIdentical = values.every(v => JSON.stringify(v) === JSON.stringify(values[0]));
                                    
                                    if (allIdentical) return null; // Hide if identical

                                    return (
                                        <React.Fragment key={`row-${fieldKey}`}>
                                            <div className="merge-cell" style={{ fontWeight: '600', padding: '10px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
                                                {label}
                                            </div>
                                            {selectedContactsData.map(contact => {
                                                const val = contact[fieldKey];
                                                const displayVal = extractVal(val);
                                                
                                                // Quick string check for object comparison
                                                const isSelected = typeof resolvedData[fieldKey] === 'object' && resolvedData[fieldKey] !== null
                                                    ? JSON.stringify(resolvedData[fieldKey]) === JSON.stringify(val)
                                                    : resolvedData[fieldKey] === val;

                                                return (
                                                    <div key={`cell-${fieldKey}-${contact._id}`} className="merge-cell" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', padding: '5px', borderRadius: '4px', backgroundColor: isSelected ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : 'transparent' }}>
                                                            <input 
                                                                type="radio" 
                                                                name={`resolved_${fieldKey}`} 
                                                                checked={isSelected}
                                                                onChange={() => handleFieldResolve(fieldKey, val)}
                                                            />
                                                            <span style={{ fontSize: '0.9rem' }}>{displayVal || 'N/A'}</span>
                                                        </label>
                                                    </div>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                };

                                return (
                                    <>
                                        {/* Name requires special handling since it maps to firstName */}
                                        {(() => {
                                            const nameVals = selectedContactsData.map(c => `${c.firstName || c.name} ${c.surname || ''}`.trim());
                                            const allNamesIdentical = nameVals.every(v => v === nameVals[0]);
                                            if (allNamesIdentical) return null;
                                            return (
                                                <React.Fragment key="row-fullName">
                                                    <div className="merge-cell" style={{ fontWeight: '600', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>Full Name</div>
                                                    {selectedContactsData.map(contact => (
                                                        <div key={`name-${contact._id}`} className="merge-cell" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: 'pointer' }}>
                                                                <input 
                                                                    type="radio" 
                                                                    name="resolvedName" 
                                                                    checked={resolvedData.firstName === (contact.firstName || contact.name)} 
                                                                    onChange={() => {
                                                                        handleFieldResolve('firstName', contact.firstName || contact.name);
                                                                        handleFieldResolve('surname', contact.surname || '');
                                                                    }}
                                                                />
                                                                {contact.firstName || contact.name} {contact.surname}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </React.Fragment>
                                            );
                                        })()}

                                        {renderDiffRow('Title', 'title', v => v?.lookup_value || v)}
                                        {renderDiffRow('Primary Mobile', 'mobile', (v) => v)}
                                        {renderDiffRow('Email', 'email', (v) => v)}
                                        {renderDiffRow('Company', 'company')}
                                        {renderDiffRow('Designation', 'designation', v => v?.lookup_value || v)}
                                        {renderDiffRow('Lead Source', 'leadSource', v => v?.lookup_value || v)}
                                        {renderDiffRow('Assigned To', 'assignedTo', v => v?.name || v?.fullName || v?._id || v)}
                                        

                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', padding: '15px', backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#1d4ed8' }}>✓ Arrays will be Consolidated Automatically</h4>
                        <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#475569' }}>
                            The backend engine will intelligently merge the following lists from all selected contacts into the master record without losing any data:
                        </p>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', fontSize: '0.85rem', fontWeight: '500' }}>
                            <span style={{ padding: '4px 8px', background: isDark ? '#334155' : '#fff', borderRadius: '4px' }}>📎 Documents & KYC</span>
                            <span style={{ padding: '4px 8px', background: isDark ? '#334155' : '#fff', borderRadius: '4px' }}>🎓 Educations</span>
                            <span style={{ padding: '4px 8px', background: isDark ? '#334155' : '#fff', borderRadius: '4px' }}>💰 Incomes & Loans</span>
                            <span style={{ padding: '4px 8px', background: isDark ? '#334155' : '#fff', borderRadius: '4px' }}>🏷️ Tags & Groups</span>
                        </div>
                    </div>

                    <div style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', padding: '15px', borderRadius: '8px', marginTop: '20px', marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>3. Select Phones & Emails</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '15px', marginTop: '-10px' }}>
                            Select the phone numbers and email addresses you want to keep. By default, all unique records are selected.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Phone Numbers</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {availablePhones.map((phone, i) => {
                                        const isChecked = (resolvedData.phones || []).some(p => p.number === phone.number);
                                        return (
                                            <label key={`ph-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '6px', backgroundColor: isChecked ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                                <input type="checkbox" checked={isChecked} onChange={(e) => {
                                                    const newPhones = e.target.checked 
                                                        ? [...(resolvedData.phones || []), phone] 
                                                        : (resolvedData.phones || []).filter(p => p.number !== phone.number);
                                                    handleFieldResolve('phones', newPhones);
                                                }} />
                                                <span>{phone.number} {phone.type ? `(${phone.type})` : ''}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Email Addresses</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {availableEmails.map((email, i) => {
                                        const isChecked = (resolvedData.emails || []).some(e => e.address === email.address);
                                        return (
                                            <label key={`em-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '6px', backgroundColor: isChecked ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                                <input type="checkbox" checked={isChecked} onChange={(e) => {
                                                    const newEmails = e.target.checked 
                                                        ? [...(resolvedData.emails || []), email] 
                                                        : (resolvedData.emails || []).filter(em => em.address !== email.address);
                                                    handleFieldResolve('emails', newEmails);
                                                }} />
                                                <span>{email.address} {email.type ? `(${email.type})` : ''}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>


                    {availableAddresses.length > 0 && (
                        <div style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9', padding: '15px', borderRadius: '8px', marginTop: '20px', marginBottom: '20px' }}>
                            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>4. Map Addresses</h3>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '15px', marginTop: '-10px' }}>
                                We found addresses across the selected contacts. Please map them accordingly.
                            </p>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                {/* Permanent Address Selector */}
                                <div>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Permanent Address</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '6px', backgroundColor: resolvedData.personalAddress === null ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                            <input type="radio" name="permAddr" checked={resolvedData.personalAddress === null} onChange={() => handleFieldResolve('personalAddress', null)} />
                                            <span style={{ fontSize: '0.85rem' }}>None</span>
                                        </label>
                                        {availableAddresses.map((addr, i) => {
                                            const isChecked = JSON.stringify(resolvedData.personalAddress) === JSON.stringify(addr.data);
                                            
                                            // Format Address Function using getLookupValue
                                            const formatAddr = (addressData) => {
                                                const getVal = (val, type) => typeof val === 'object' ? val?.lookup_value || val?.name : (getLookupValue(type, val) || val);
                                                const parts = [
                                                    addressData.hNo,
                                                    addressData.street,
                                                    addressData.landmark,
                                                    getVal(addressData.city, 'City'),
                                                    getVal(addressData.state, 'State'),
                                                    getVal(addressData.pincode, 'Pincode')
                                                ].filter(Boolean);
                                                return parts.join(', ');
                                            };

                                            return (
                                                <label key={`perm-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '6px', backgroundColor: isChecked ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                                    <input type="radio" name="permAddr" style={{ marginTop: '3px' }} checked={isChecked} onChange={() => handleFieldResolve('personalAddress', addr.data)} />
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatAddr(addr.data) || 'Empty Address'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '4px' }}>Source: {addr.source} ({addr.type})</div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                                
                                {/* Correspondence Address Selector */}
                                <div>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Correspondence Address</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '6px', backgroundColor: resolvedData.correspondenceAddress === null ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                            <input type="radio" name="corrAddr" checked={resolvedData.correspondenceAddress === null} onChange={() => handleFieldResolve('correspondenceAddress', null)} />
                                            <span style={{ fontSize: '0.85rem' }}>None</span>
                                        </label>
                                        {availableAddresses.map((addr, i) => {
                                            const isChecked = JSON.stringify(resolvedData.correspondenceAddress) === JSON.stringify(addr.data);
                                            
                                            // Format Address Function using getLookupValue
                                            const formatAddr = (addressData) => {
                                                const getVal = (val, type) => typeof val === 'object' ? val?.lookup_value || val?.name : (getLookupValue(type, val) || val);
                                                const parts = [
                                                    addressData.hNo,
                                                    addressData.street,
                                                    addressData.landmark,
                                                    getVal(addressData.city, 'City'),
                                                    getVal(addressData.state, 'State'),
                                                    getVal(addressData.pincode, 'Pincode')
                                                ].filter(Boolean);
                                                return parts.join(', ');
                                            };

                                            return (
                                                <label key={`corr-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', padding: '10px', borderRadius: '6px', backgroundColor: isChecked ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? '#0f172a' : '#fff'), border: '1px solid var(--border-color)' }}>
                                                    <input type="radio" name="corrAddr" style={{ marginTop: '3px' }} checked={isChecked} onChange={() => handleFieldResolve('correspondenceAddress', addr.data)} />
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatAddr(addr.data) || 'Empty Address'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '4px' }}>Source: {addr.source} ({addr.type})</div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                <div style={footerStyle}>
                    <button style={buttonStyles.cancel} onClick={onClose} disabled={isSubmitting}>Cancel</button>
                    <button style={buttonStyles.primary} onClick={handleMerge} disabled={isSubmitting}>
                        {isSubmitting ? 'Merging...' : 'Confirm & Merge'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MergeContactsModal;
