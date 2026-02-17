import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { usePropertyConfig } from '../context/PropertyConfigContext';

const DocumentUploadModal = ({ isOpen, onClose, entityId, entityType = 'Contact', onUpdate }) => {
    const { masterFields } = usePropertyConfig();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Form State
    const [newDocType, setNewDocType] = useState('');
    const [newDocNumber, setNewDocNumber] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    // Duplication Check
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState('');

    useEffect(() => {
        if (isOpen && entityId) {
            fetchDocuments();
        }
    }, [isOpen, entityId]);

    // Construct the endpoint based on entity type
    const getEndpoint = () => {
        return entityType.toLowerCase() === 'contact' ? 'contacts' : 'leads';
    };

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const response = await api.get(`${getEndpoint()}/${entityId}`);
            if (response.data && response.data.success) {
                setDocuments(response.data.data.documents || []);
            }
        } catch (error) {
            console.error("Error fetching documents:", error);
        } finally {
            setLoading(false);
        }
    };

    // Check for duplication on change
    useEffect(() => {
        const checkDuplication = async () => {
            if (!newDocType || !newDocNumber) {
                setIsDuplicate(false);
                setDuplicateMessage('');
                return;
            }

            try {
                // Determine which field to check (Contact or Lead specific logic if needed)
                // For now, assuming Global Duplication Check endpoint handles generic lookup
                const response = await api.post('duplication-rules/check-document', {
                    documentType: newDocType,
                    documentNo: newDocNumber,
                    excludeEntityId: entityId,
                    entityType: entityType
                });

                if (response.data && response.data.isDuplicate) {
                    setIsDuplicate(true);
                    setDuplicateMessage(`Document ${newDocNumber} already exists for another ${response.data.existingEntityType || 'record'}.`);
                } else {
                    setIsDuplicate(false);
                    setDuplicateMessage('');
                }
            } catch (error) {
                console.error("Duplication check failed:", error);
            }
        };

        const timer = setTimeout(() => {
            checkDuplication();
        }, 500);

        return () => clearTimeout(timer);
    }, [newDocType, newDocNumber, entityId, entityType]);


    const handleFileChange = (e) => {
        setSelectedFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!newDocType || !newDocNumber) {
            alert("Please select Document Type and enter Document Number");
            return;
        }

        if (isDuplicate) {
            alert("Cannot upload duplicate document number.");
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('documentType', newDocType);
        formData.append('documentNo', newDocNumber);
        if (selectedFile) {
            formData.append('document', selectedFile);
        }

        try {
            // Using a specific sub-route for document upload if available, 
            // otherwise updating the main entity. 
            // Assuming we patch the entity's document list.

            // Current Approach: Backend might expect a specific structure. 
            // We will send the new document object to the 'update' endpoint of the entity.
            // OR ideally, a dedicated /upload endpoint. 
            // Let's assume a generic entity update for now, appending to 'documents'.

            // Since we need to upload a file, we probably need a specific route that handles multipart/form-data
            // and returns the file URL. Then we add that metadata to the entity.

            let fileUrl = '';
            if (selectedFile) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', selectedFile);
                const uploadRes = await api.post('upload', uploadFormData); // Generic upload endpoint
                if (uploadRes.data.success) {
                    fileUrl = uploadRes.data.url;
                }
            }

            const newDocument = {
                documentType: newDocType,
                documentNo: newDocNumber,
                documentPicture: fileUrl,
                // Add default name using type if needed
                documentName: newDocType
            };

            const updatedDocuments = [...documents, newDocument];

            const response = await api.patch(`${getEndpoint()}/${entityId}`, {
                documents: updatedDocuments
            });

            if (response.data.success) {
                setDocuments(updatedDocuments);
                setNewDocType('');
                setNewDocNumber('');
                setSelectedFile(null);
                if (onUpdate) onUpdate(); // Refresh parent list
            }

        } catch (error) {
            console.error("Error uploading document:", error);
            alert("Failed to upload document");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (index) => {
        if (!window.confirm("Are you sure you want to remove this document?")) return;

        try {
            const updatedDocuments = documents.filter((_, i) => i !== index);
            const response = await api.patch(`${getEndpoint()}/${entityId}`, {
                documents: updatedDocuments
            });

            if (response.data.success) {
                setDocuments(updatedDocuments);
                if (onUpdate) onUpdate();
            }
        } catch (error) {
            console.error("Error deleting document:", error);
        }
    };

    if (!isOpen) return null;

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    };

    const modalStyle = {
        background: '#fff', padding: '24px', borderRadius: '12px', width: '500px', maxWidth: '90%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Manage Documents</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>

                {/* Add New Document Form */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#334155' }}>Add New Document</h4>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#475569' }}>Document Type</label>
                        <select
                            value={newDocType}
                            onChange={(e) => setNewDocType(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cba5e1' }}
                        >
                            <option value="">Select Type</option>
                            {masterFields?.documentTypes?.map(type => (
                                <option key={type} value={type}>{type}</option>
                            )) || <option value="Aadhar Card">Aadhar Card</option>}
                            {/* Fallback if masterFields empty */}
                            <option value="PAN Card">PAN Card</option>
                            <option value="Voter ID">Voter ID</option>
                            <option value="Driving License">Driving License</option>
                            <option value="Passport">Passport</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#475569' }}>Document Number</label>
                        <input
                            type="text"
                            value={newDocNumber}
                            onChange={(e) => setNewDocNumber(e.target.value)}
                            placeholder="Enter document number"
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: isDuplicate ? '1px solid #ef4444' : '1px solid #cbd5e1' }}
                        />
                        {isDuplicate && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px' }}>{duplicateMessage}</p>}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#475569' }}>Upload File</label>
                        <input type="file" onChange={handleFileChange} />
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={uploading || isDuplicate || !newDocType || !newDocNumber}
                        style={{
                            width: '100%', padding: '10px', background: uploading ? '#94a3b8' : '#3b82f6',
                            color: '#fff', border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600
                        }}
                    >
                        {uploading ? 'Uploading...' : 'Add Document'}
                    </button>
                </div>

                {/* Existing Documents List */}
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#334155' }}>Uploaded Documents</h4>
                {loading ? (
                    <p>Loading...</p>
                ) : documents.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
                        {documents.map((doc, index) => (
                            <li key={index} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{doc.documentType}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{doc.documentNo}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {doc.documentPicture && (
                                        <a href={doc.documentPicture} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: '0.9rem' }}>View</a>
                                    )}
                                    <button onClick={() => handleDelete(index)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center' }}>No documents uploaded yet.</p>
                )}

            </div>
        </div>
    );
};

export default DocumentUploadModal;
