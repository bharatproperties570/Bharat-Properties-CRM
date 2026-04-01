import { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useContactConfig } from '../context/ContactConfigContext';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const AddInventoryDocumentModal = ({ isOpen, onClose, onSave, project = null }) => {
    usePropertyConfig();
    const config = useContactConfig();
    const documentConfig = config?.documentConfig || {};

    const [formData, setFormData] = useState({
        inventoryDocuments: [{
            documentName: '',
            documentType: '',
            documentNumber: '', // New field
            linkedContactMobile: '',
            file: null
        }],
        owners: []
    });

    useEffect(() => {
        if (isOpen && project) {
            let potentialOwners = [];
            try {
                if (project && typeof project === 'object') {
                    // Populate from 'owners' array
                    if (Array.isArray(project.owners)) {
                        project.owners.forEach(owner => {
                            if (owner && typeof owner === 'object') {
                                const name = owner.name || owner.fullName || owner.displayName || 'Unknown Owner';
                                const mobile = owner.mobile || (owner.phones && owner.phones[0]?.number) || '';
                                if (name && mobile) {
                                    potentialOwners.push({ name: String(name), mobile: String(mobile), role: 'Property Owner' });
                                }
                            }
                        });
                    }

                    // Populate from 'associates' array
                    if (Array.isArray(project.associates)) {
                        project.associates.forEach(assoc => {
                            const contact = assoc && typeof assoc === 'object' ? (assoc.contact || assoc) : null;
                            if (contact && typeof contact === 'object') {
                                const name = contact.name || contact.fullName || 'Unknown Associate';
                                const mobile = contact.mobile || (contact.phones && contact.phones[0]?.number) || '';
                                if (name && mobile) {
                                    potentialOwners.push({ 
                                        name: String(name), 
                                        mobile: String(mobile), 
                                        role: String(assoc.relationship || 'Associate') 
                                    });
                                }
                            }
                        });
                    }

                    // Fallback for legacy fields if no owners/associates found
                    if (potentialOwners.length === 0) {
                        if (project.ownerName) {
                            potentialOwners.push({
                                name: String(project.ownerName),
                                mobile: project.ownerPhone ? String(project.ownerPhone) : '',
                                role: 'Property Owner'
                            });
                        }
                        if (project.associatedContact) {
                            potentialOwners.push({
                                name: String(project.associatedContact),
                                mobile: project.associatedPhone ? String(project.associatedPhone) : '',
                                role: 'Associate'
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Error processing project owners", e);
            }

            setFormData(prev => ({
                ...prev,
                owners: potentialOwners,
                inventoryDocuments: [{ documentName: '', documentType: '', documentNumber: '', linkedContactMobile: '', file: null }]
            }));
        } else if (isOpen) {
            setFormData({
                inventoryDocuments: [{ documentName: '', documentType: '', documentNumber: '', linkedContactMobile: '', file: null }],
                owners: []
            });
        }
    }, [isOpen, project]);

    const [isAuthExpired, setIsAuthExpired] = useState(false);
    
    const handleReconnect = async () => {
        try {
            const res = await api.get('/settings/google/url');
            if (res.data?.success && res.data.url) {
                window.location.href = res.data.url;
            }
        } catch (err) {
            console.error("Failed to get auth URL", err);
            toast.error("Could not start re-authentication. Go to Settings > Integrations.");
        }
    };

    const handleSave = async () => {
        const toastId = toast.loading('Uploading documents to Google Drive...');
        try {
            const updatedDocs = await Promise.all(formData.inventoryDocuments.map(async (doc) => {
                if (doc.file) {
                    // Find Category and Type names
                    const categoryObj = Object.values(documentConfig).find(c => (c.id || c._id) === doc.documentName);
                    const typeObj = categoryObj?.types?.find(t => (t.id || t._id) === doc.documentType);

                    const uploadData = new FormData();
                    uploadData.append('file', doc.file);
                    uploadData.append('entityType', 'Inventory');
                    uploadData.append('entityName', project?.unitNo || project?.unitNumber || 'Unknown Unit');
                    uploadData.append('docCategory', categoryObj?.name || 'General');
                    uploadData.append('docType', typeObj?.name || 'Document');

                    const response = await api.post('/upload', uploadData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    if (response.data && response.data.success) {
                        return {
                            ...doc,
                            url: response.data.url,
                            file: null // Remove file object after upload
                        };
                    }
                }
                return doc;
            }));

            if (typeof onSave === 'function') {
                onSave(updatedDocs);
            }
            toast.success('Documents uploaded successfully!', { id: toastId });
            if (typeof onClose === 'function') {
                onClose();
            }
        } catch (error) {
            console.error("Upload error:", error);
            const errorMessage = error.response?.data?.error || error.message || "Failed to upload documents";
            
            if (errorMessage.includes('invalid_grant')) {
                setIsAuthExpired(true);
                toast.error("Google Drive connection expired. Please re-connect below.", { 
                    id: toastId,
                    duration: 6000 
                });
            } else {
                toast.error(errorMessage, { id: toastId });
            }
        }
    };

    if (!isOpen) return null;

    // --- Styles ---
    const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s', backgroundColor: '#fff', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' };
    const customSelectStyle = { ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', backgroundSize: '12px' };
    const customSelectStyleDisabled = { ...customSelectStyle, background: '#f8fafc', cursor: 'not-allowed', color: '#94a3b8', borderColor: '#f1f5f9' };
    const sectionStyle = { background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)', padding: '28px', borderRadius: '20px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', marginBottom: '24px' };
    const buttonStyle = {
        cancel: { padding: '12px 28px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' },
        success: { padding: '12px 28px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', transition: 'all 0.2s' }
    };

    // --- Safety Getters ---
    const getDocCategories = () => {
        try {
            // Enhanced version to support hyphenated and non-hyphenated types if they exist
            // and handle both object structure or flat array if needed
            if (!documentConfig) return [];

            return Object.values(documentConfig).map(cat => ({
                id: cat.id || cat._id,
                lookup_value: cat.name || cat.lookup_value,
                subCategories: cat.subCategories || []
            }));
        } catch (e) {
            console.error("Error getting doc categories", e);
            return [];
        }
    };

    const getDocTypes = (catName, categories) => {
        if (!catName || !Array.isArray(categories)) return [];
        try {
            const cat = categories.find(c => c && (c.name === catName || c.lookup_value === catName || c.id === catName));
            const types = cat?.subCategories || [];
            return Array.isArray(types) ? types : [];
        } catch (e) {
            console.error("Error in getDocTypes", e);
            return [];
        }
    };

    const docCategories = getDocCategories();

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '900px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} className="animate-slideIn">

                {/* Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.2)' }}>
                            <i className="fas fa-file-contract" style={{ color: '#fff', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                                Manage Property Documents
                            </h2>
                            {project && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Inventory:</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '2px 10px', borderRadius: '6px' }}>
                                        {String(project.unitNo || project.unitNumber || 'N/A')}
                                    </span>
                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#cbd5e1' }}></span>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{String(project.projectName || project.project || 'Deal')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} className="hover:bg-slate-200">
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

                            {formData.inventoryDocuments.map((doc, idx) => {
                                const availableDocTypes = getDocTypes(doc.documentName, docCategories);
                                return (
                                    <div key={idx} style={{
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '16px',
                                        padding: '20px',
                                        marginBottom: '20px',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        position: 'relative'
                                    }} className="doc-card-hover">
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                            {/* Category Select */}
                                            <div>
                                                <label style={labelStyle}>Document Category</label>
                                                <select
                                                    style={customSelectStyle}
                                                    value={String(doc.documentName || '')}
                                                    onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].documentName = e.target.value;
                                                        newDocs[idx].documentType = '';
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                >
                                                    <option value="">Select Category</option>
                                                    {docCategories.map((c, cidx) => {
                                                        const val = typeof c === 'object' ? (c.name || c.lookup_value || c.id || cidx) : c;
                                                        const label = typeof c === 'object' ? (c.name || c.lookup_value || c.id || `Category ${cidx}`) : c;
                                                        return <option key={`cat-${cidx}-${val}`} value={String(val)}>{String(label)}</option>;
                                                    })}
                                                </select>
                                            </div>
                                            {/* Type Select */}
                                            <div>
                                                <label style={labelStyle}>Specific Type</label>
                                                <select
                                                    style={!doc.documentName ? customSelectStyleDisabled : customSelectStyle}
                                                    value={String(doc.documentType || '')}
                                                    disabled={!doc.documentName}
                                                    onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].documentType = e.target.value;
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                >
                                                    <option value="">Select Type</option>
                                                    {availableDocTypes.map((t, tidx) => {
                                                        const val = typeof t === 'object' ? (t.name || t.lookup_value || t.id || tidx) : t;
                                                        const label = typeof t === 'object' ? (t.name || t.lookup_value || t.id || `Option ${tidx}`) : t;
                                                        return <option key={`type-${tidx}-${val}`} value={String(val)}>{String(label)}</option>;
                                                    })}
                                                </select>
                                            </div>
                                            {/* Document Number */}
                                            <div>
                                                <label style={labelStyle}>Document / Ref Number</label>
                                                <input
                                                    type="text"
                                                    style={inputStyle}
                                                    placeholder="e.g. REG-12345"
                                                    value={doc.documentNumber || ''}
                                                    onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].documentNumber = e.target.value;
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'end' }}>
                                            {/* Contact Link */}
                                            <div>
                                                <label style={labelStyle}>Number Linked to Contact</label>
                                                <select
                                                    style={customSelectStyle}
                                                    value={String(doc.linkedContactMobile || '')}
                                                    onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].linkedContactMobile = e.target.value;
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                >
                                                    <option value="">Select Related Contact</option>
                                                    {Array.isArray(formData.owners) && formData.owners.map((owner, oidx) => (
                                                        <option key={`${owner.mobile}-${oidx}`} value={String(owner.mobile || '')}>
                                                            {String(owner.name)} - {String(owner.mobile || 'No Phone')} ({String(owner.role)})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* File Upload Area */}
                                            <div style={{ position: 'relative' }}>
                                                <label style={labelStyle}>Document File</label>
                                                <label style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                                                    background: doc.file ? '#ecfdf5' : '#f8fafc',
                                                    border: doc.file ? '1px solid #10b981' : '1px dashed #cbd5e1',
                                                    borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s',
                                                    height: '42px', boxSizing: 'border-box'
                                                }} className="upload-btn-hover">
                                                    <i className={`fas ${doc.file ? 'fa-check-circle' : 'fa-cloud-upload-alt'}`} style={{ color: doc.file ? '#10b981' : '#64748b' }}></i>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: doc.file ? '#065f46' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {doc.file ? doc.file.name : (doc.url ? "File Uploaded" : "Choose File or Drop Here")}
                                                    </span>
                                                    <input type="file" style={{ display: 'none' }} onChange={e => {
                                                        const newDocs = [...formData.inventoryDocuments];
                                                        newDocs[idx].file = e.target.files[0];
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }} />
                                                </label>
                                            </div>
                                        </div>

                                        {/* Action Buttons (Add/Remove) */}
                                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', display: 'flex', gap: '8px' }}>
                                            {idx === 0 ? (
                                                <button
                                                    onClick={() => setFormData({ ...formData, inventoryDocuments: [...formData.inventoryDocuments, { documentName: '', documentType: '', documentNumber: '', linkedContactMobile: '', file: null }] })}
                                                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Add Another Document"
                                                >
                                                    <i className="fas fa-plus"></i>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        const newDocs = formData.inventoryDocuments.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, inventoryDocuments: newDocs });
                                                    }}
                                                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 6px rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Remove This Document"
                                                >
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                    {isAuthExpired && (
                        <button 
                            onClick={handleReconnect}
                            style={{ 
                                ...buttonStyle.success, 
                                background: '#4285F4', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                marginRight: 'auto' 
                            }}
                        >
                            <i className="fab fa-google"></i>
                            Reconnect Google Drive
                        </button>
                    )}
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <button onClick={handleSave} style={buttonStyle.success}>Save Documents</button>
                </div>

                <style>{`
                    .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .fade-in { animation: fadeIn 0.3s ease-out; }
                    .upload-label-hover:hover { border-color: #3b82f6 !important; background: #eff6ff !important; }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
};

export default AddInventoryDocumentModal;
