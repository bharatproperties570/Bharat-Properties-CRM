import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const AddOwnerModal = ({ isOpen, onClose, onSave, currentOwners = [] }) => {
    // Styling Constants (Reused from AddInventoryModal)
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '10px', display: 'block'
    };
    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', color: '#1e293b', outline: 'none', transition: 'all 0.2s'
    };
    const customSelectStyle = {
        ...inputStyle, appearance: 'none', background: '#fff url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e") no-repeat right 12px center', backgroundSize: '16px'
    };
    const buttonStyle = {
        primary: { background: '#2563eb', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' },
        secondary: { background: '#fff', color: '#64748b', padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
        cancel: { background: '#f1f5f9', color: '#64748b', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
        success: { background: '#10b981', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' }
    };

    const [owners, setOwners] = useState([]);
    const [linkData, setLinkData] = useState({ mobile: '', role: 'Property Owner', name: '', relationship: '' });

    useEffect(() => {
        if (isOpen) {
            setOwners(currentOwners);
            setLinkData({ mobile: '', role: 'Property Owner', name: '', relationship: '' });
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, currentOwners]);

    // Handle Owner Link
    const handleLinkOwner = () => {
        if (!linkData.mobile || linkData.mobile.length !== 10) {
            toast.error('Valid 10-digit mobile number required');
            return;
        }
        if (linkData.role === 'Associate' && !linkData.relationship) {
            toast.error('Relationship is required for associates');
            return;
        }

        // Simulate Name Fetch (In real app, fetch from API)
        const dummyName = "Unknown User";

        const newOwner = {
            ...linkData,
            name: linkData.name || dummyName // Use entered name or dummy
        };

        const updatedOwners = [...owners, newOwner];
        setOwners(updatedOwners);
        setLinkData({ mobile: '', role: 'Property Owner', name: '', relationship: '' });
        toast.success('Owner/Associate Added');
    };

    const handleSave = () => {
        onSave(owners);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div className="animate-slideIn" style={{ background: '#fff', width: '95%', maxWidth: '600px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Manage Owners</h2>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Add or remove property owners and associates</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '60vh' }}>

                    {/* Input Form */}
                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Add New Person</h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={labelStyle}>Start with Mobile Number</label>
                                <input
                                    type="text"
                                    maxLength="10"
                                    placeholder="Enter 10-digit mobile"
                                    value={linkData.mobile}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        setLinkData({ ...linkData, mobile: val });
                                    }}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Role</label>
                                <select
                                    value={linkData.role}
                                    onChange={(e) => setLinkData({ ...linkData, role: e.target.value })}
                                    style={customSelectStyle}
                                >
                                    <option value="Property Owner">Property Owner</option>
                                    <option value="Associate">Associate (Family/Partner)</option>
                                </select>
                            </div>
                        </div>

                        {/* Name Input (Simulated) */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Name</label>
                            <input
                                value={linkData.name}
                                onChange={(e) => setLinkData({ ...linkData, name: e.target.value })}
                                style={inputStyle}
                                placeholder="Enter Name"
                            />
                        </div>

                        {linkData.role === 'Associate' && (
                            <div>
                                <label style={labelStyle}>Relationship</label>
                                <select
                                    value={linkData.relationship}
                                    onChange={(e) => setLinkData({ ...linkData, relationship: e.target.value })}
                                    style={customSelectStyle}
                                >
                                    <option value="">Select Relationship</option>
                                    <option>Father</option>
                                    <option>Mother</option>
                                    <option>Brother</option>
                                    <option>Sister</option>
                                    <option>Spouse</option>
                                    <option>Partner</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleLinkOwner}
                                style={buttonStyle.primary}
                            >
                                <i className="fas fa-plus" style={{ marginRight: '8px' }}></i> Add Person
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Owners & Associates</h4>
                        {owners.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '20px' }}>No owners linked yet.</div>}
                        {owners.map((owner, idx) => (
                            <div key={idx} style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', background: owner.role === 'Property Owner' ? '#eff6ff' : '#fefce8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: owner.role === 'Property Owner' ? '#3b82f6' : '#ca8a04', fontWeight: 700 }}>
                                        {owner.name ? owner.name.charAt(0) : 'U'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>{owner.name || 'Unknown'}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                            {owner.role === 'Property Owner' ? 'Owner' : `Associate ${owner.relationship ? `(${owner.relationship})` : ''}`} • {owner.mobile}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setOwners(owners.filter((_, i) => i !== idx))}
                                    style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <button onClick={handleSave} style={buttonStyle.success}>Save Changes</button>
                </div>
            </div>
            <style>{`
                 @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                 .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
            `}</style>
        </div>
    );
};

export default AddOwnerModal;
