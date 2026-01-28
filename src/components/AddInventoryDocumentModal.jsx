import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useContactConfig } from '../context/ContactConfigContext';

// Mock Contact Data for Linking (Should ideally come from context or props)
import { contactData } from '../data/mockData';

const AddInventoryDocumentModal = ({ isOpen, onClose, onSave, project = null }) => {
    const { propertyConfig } = usePropertyConfig();
    const { profileConfig = {} } = useContactConfig();

    const [formData, setFormData] = useState({
        inventoryDocuments: [{ documentName: '', documentType: '', linkedContactMobile: '', file: null }],
        owners: [] // To hold potential owners if passed, or we can fetch relevant contacts
    });

    useEffect(() => {
        if (isOpen && project) {
            // If project (property) data is passed, we might want to pre-fill owners or existing docs
            // For now, initializing with one empty row as per "Add" behavior
            // But we should try to populate 'owners' from the project if available to enable linking
            let potentialOwners = [];
            if (project.ownerName) {
                // Mocking an owner object structure to match AddInventoryModal expectation
                potentialOwners.push({
                    name: project.ownerName,
                    mobile: project.ownerPhone || '',
                    role: 'Property Owner'
                });
            }
            if (project.associatedContact) {
                potentialOwners.push({
                    name: project.associatedContact,
                    mobile: project.associatedPhone || '',
                    role: 'Associate'
                });
            }

            setFormData(prev => ({
                ...prev,
                owners: potentialOwners,
                inventoryDocuments: project.inventoryDocuments || [{ documentName: '', documentType: '', linkedContactMobile: '', file: null }]
            }));
        } else if (isOpen) {
            setFormData({
                inventoryDocuments: [{ documentName: '', documentType: '', linkedContactMobile: '', file: null }],
                owners: []
            });
        }
    }, [isOpen, project]);


    const handleSave = () => {
        onSave(formData.inventoryDocuments);
        onClose();
    };

    if (!isOpen) return null;

    // --- Styles (Copied from AddInventoryModal) ---
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block'
    };
    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s',
        backgroundColor: '#fff', height: '42px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px'
    };
    const customSelectStyleDisabled = { ...customSelectStyle, background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' };

    const sectionStyle = {
        background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px'
    };
    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '900px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} className="animate-slideIn">

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-file-contract" style={{ color: '#6366f1' }}></i>
                            </div>
                            Manage Property Documents
                        </h2>
                        {project && (
                            <span style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px', marginLeft: '42px' }}>
                                For: <span style={{ fontWeight: 600, color: '#0f172a' }}>{project.unitNo} - {project.area}</span>
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FB', padding: '24px' }}>
                    <div className="fade-in">
                        <div style={sectionStyle}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-file-contract" style={{ color: '#6366f1' }}></i> Inventory Documents
                            </h4>

                            {(() => {
                                const docCategories = profileConfig?.Documents?.subCategories || [];
                                const getDocTypes = (catName) => {
                                    const cat = docCategories.find(c => c.name === catName);
                                    return cat?.types || [];
                                };

                                return formData.inventoryDocuments.map((doc, idx) => {
                                    const availableDocTypes = getDocTypes(doc.documentName);
                                    return (
                                        <div key={idx} style={{
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '12px',
                                            marginBottom: '12px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                        }}>
                                            {/* Row 1: Identity */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: '8px', marginBottom: '12px' }}>
                                                <div>
                                                    <label style={labelStyle}>Category</label>
                                                    <select
                                                        style={{ ...customSelectStyle, fontSize: '0.85rem', padding: '8px' }}
                                                        value={doc.documentName}
                                                        onChange={e => {
                                                            const newDocs = [...formData.inventoryDocuments];
                                                            newDocs[idx].documentName = e.target.value;
                                                            newDocs[idx].documentType = '';
                                                            setFormData({ ...formData, inventoryDocuments: newDocs });
                                                        }}
                                                    >
                                                        <option value="">Select Category</option>
                                                        {docCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Document Type</label>
                                                    <select
                                                        style={{ ...(!doc.documentName ? customSelectStyleDisabled : customSelectStyle), fontSize: '0.85rem', padding: '8px' }}
                                                        value={doc.documentType}
                                                        disabled={!doc.documentName}
                                                        onChange={e => {
                                                            const newDocs = [...formData.inventoryDocuments];
                                                            newDocs[idx].documentType = e.target.value;
                                                            setFormData({ ...formData, inventoryDocuments: newDocs });
                                                        }}
                                                    >
                                                        <option value="">Select Type</option>
                                                        {availableDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'end' }}>
                                                    <button
                                                        onClick={() => {
                                                            if (idx === 0) {
                                                                setFormData({ ...formData, inventoryDocuments: [...formData.inventoryDocuments, { documentName: '', documentType: '', registrationNo: '', linkedContactMobile: '', file: null }] });
                                                            } else {
                                                                const newDocs = formData.inventoryDocuments.filter((_, i) => i !== idx);
                                                                setFormData({ ...formData, inventoryDocuments: newDocs });
                                                            }
                                                        }}
                                                        style={{ height: '36px', width: '100%', borderRadius: '6px', border: 'none', background: idx === 0 ? '#eff6ff' : '#fef2f2', color: idx === 0 ? '#3b82f6' : '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <i className={`fas ${idx === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Row 2: Contact Context */}
                                            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #f1f5f9', marginBottom: '12px' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                                                    Link to Contact (Optional)
                                                </label>
                                                <select
                                                    style={{ ...customSelectStyle, background: '#fff', fontSize: '0.85rem', padding: '8px' }}
                                                    value={doc.linkedContactMobile}
                                                    onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].linkedContactMobile = e.target.value;
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                >
                                                    <option value="">Select Owner/Associate</option>
                                                    {formData.owners && formData.owners.map(owner => (
                                                        <option key={owner.mobile} value={owner.mobile}>
                                                            {owner.name} ({owner.role})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Row 3: Evidence */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{
                                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#fff',
                                                        border: '1px dashed #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '0.85rem',
                                                        transition: 'all 0.2s', ':hover': { borderColor: '#3b82f6', background: '#eff6ff' }
                                                    }}>
                                                        <div style={{ width: '28px', height: '28px', background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <i className="fas fa-file-upload" style={{ color: '#10b981', fontSize: '0.9rem' }}></i>
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontWeight: 600, color: '#334155' }}>
                                                                {doc.file ? doc.file.name : "Upload Document File"}
                                                            </span>
                                                            {!doc.file && <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '6px' }}>PDF or Image</span>}
                                                        </div>
                                                        <input type="file" style={{ display: 'none' }} onChange={e => {
                                                            const newDocs = [...formData.inventoryDocuments];
                                                            newDocs[idx].file = e.target.files[0];
                                                            setFormData({ ...formData, inventoryDocuments: newDocs });
                                                        }} />
                                                        {doc.file ? (
                                                            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>File Selected</span>
                                                        ) : (
                                                            <span style={{ padding: '4px 10px', background: '#f1f5f9', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Browse</span>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <button onClick={handleSave} style={buttonStyle.success}>Save Documents</button>
                </div>

                <style>{`
                    .grid-2-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
                    .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .fade-in { animation: fadeIn 0.3s ease-out; }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
};

export default AddInventoryDocumentModal;
