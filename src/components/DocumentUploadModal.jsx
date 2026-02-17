import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { fetchLookup } from '../utils/fetchLookup'; // Ensure this utility exists or use api directly

const DocumentUploadModal = ({ isOpen, onClose, entityId, entityType = 'Contact', onUpdate }) => {
    const { masterFields } = usePropertyConfig();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Form State
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');

    const [types, setTypes] = useState([]);
    const [selectedType, setSelectedType] = useState('');

    const [docNumber, setDocNumber] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    // Inventory Linking State
    const [linkToInventory, setLinkToInventory] = useState(false);

    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');

    const [blocks, setBlocks] = useState([]);
    const [selectedBlock, setSelectedBlock] = useState('');

    const [units, setUnits] = useState([]); // Inventory items
    const [selectedUnit, setSelectedUnit] = useState('');

    // Duplication Check
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState('');

    useEffect(() => {
        if (isOpen && entityId) {
            fetchDocuments();
            fetchCategories();
            fetchProjects();
        }
    }, [isOpen, entityId]);

    // Fetch Categories
    const fetchCategories = async () => {
        const data = await fetchLookup("Document-Category");
        setCategories(data || []);
    };

    // Fetch Types when Category changes
    useEffect(() => {
        if (selectedCategory) {
            const loadTypes = async () => {
                const data = await fetchLookup("Document-Type", selectedCategory);
                setTypes(data || []);
            };
            loadTypes();
        } else {
            setTypes([]);
        }
    }, [selectedCategory]);

    // Fetch Projects
    const fetchProjects = async () => {
        try {
            const res = await api.get('/projects');
            if (res.data.success) {
                setProjects(res.data.data || []);
            }
        } catch (error) {
            console.error("Error fetching projects:", error);
        }
    };

    // Set Blocks when Project changes
    useEffect(() => {
        if (selectedProject) {
            const project = projects.find(p => p._id === selectedProject);
            setBlocks(project?.blocks || []);
            // Reset dependent fields
            setSelectedBlock('');
            setSelectedUnit('');
        } else {
            setBlocks([]);
        }
    }, [selectedProject, projects]);

    // Fetch Units (Inventory) when Block changes
    useEffect(() => {
        if (selectedProject) {
            const fetchInventory = async () => {
                try {
                    // Fetch inventory filtered by Project and Block (if selected)
                    // If block is not selected, maybe show all units? Or wait for block?
                    // User requirement: Project -> Block -> Unit. So wait for block if blocks exist.

                    const params = {
                        project: selectedProject,
                        status: 'Available' // Only show available units? Or all? User didn't specify, but usually link to valid units.
                    };

                    // If project has blocks, require block selection? 
                    // Let's filter by block if selected.
                    if (selectedBlock) {
                        params.block = selectedBlock.name || selectedBlock; // Adjust based on block object structure
                    }

                    const res = await api.get('/inventory', { params });
                    if (res.data.success) {
                        setUnits(res.data.data || []);
                    }
                } catch (error) {
                    console.error("Error fetching inventory units:", error);
                }
            };

            if (selectedBlock || (blocks.length === 0 && selectedProject)) {
                fetchInventory();
            } else {
                setUnits([]);
            }
        } else {
            setUnits([]);
        }
    }, [selectedProject, selectedBlock, blocks]);


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

    // Check for duplication
    useEffect(() => {
        const checkDuplication = async () => {
            if (!selectedType || !docNumber) {
                setIsDuplicate(false);
                setDuplicateMessage('');
                return;
            }

            try {
                const response = await api.post('duplication-rules/check-document', {
                    documentType: selectedType, // ID of lookup
                    documentNo: docNumber,
                    excludeEntityId: entityId,
                    entityType: entityType
                });

                if (response.data && response.data.isDuplicate) {
                    setIsDuplicate(true);
                    setDuplicateMessage(`Document Number already exists.`);
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
    }, [selectedType, docNumber, entityId, entityType]);


    const handleFileChange = (e) => {
        setSelectedFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!selectedCategory) {
            alert("Please select Document Category");
            return;
        }
        if (!selectedType) {
            alert("Please select Document Type");
            return;
        }
        if (!docNumber) {
            alert("Please enter Document Number");
            return;
        }

        if (isDuplicate) {
            alert("Cannot upload duplicate document number.");
            return;
        }

        setUploading(true);

        try {
            let fileUrl = '';
            if (selectedFile) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', selectedFile);
                const uploadRes = await api.post('upload', uploadFormData);
                if (uploadRes.data.success) {
                    fileUrl = uploadRes.data.url;
                }
            }

            // Find names for display/fallback
            const categoryObj = categories.find(c => c._id === selectedCategory);
            const typeObj = types.find(t => t._id === selectedType);
            const projectObj = projects.find(p => p._id === selectedProject);

            const newDocument = {
                documentCategory: selectedCategory, // ID
                documentType: selectedType, // ID
                documentName: typeObj ? typeObj._id : selectedType, // Legacy Field, map to Type ID

                documentNo: docNumber,
                documentPicture: fileUrl,

                // Inventory Links
                projectName: linkToInventory ? (projectObj?.name || '') : '',
                block: linkToInventory ? (selectedBlock?.name || selectedBlock || '') : '', // Handle object or string
                unitNumber: linkToInventory ? selectedUnit : '' // Assuming selectedUnit is unit number string from inventory
            };

            const updatedDocuments = [...documents, newDocument];

            const response = await api.patch(`${getEndpoint()}/${entityId}`, {
                documents: updatedDocuments
            });

            if (response.data.success) {
                setDocuments(updatedDocuments);
                // Reset Form
                setSelectedCategory('');
                // Types will clear via effect
                setDocNumber('');
                setSelectedFile(null);
                setLinkToInventory(false);
                setSelectedProject('');
                // Blocks/Units clear via effect

                if (onUpdate) onUpdate();
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
        background: '#fff', padding: '24px', borderRadius: '12px', width: '600px', maxWidth: '95%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto'
    };

    const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' };
    const labelStyle = { display: 'block', fontSize: '0.9rem', marginBottom: '6px', color: '#475569', fontWeight: 500 };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Manage Documents</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>

                {/* Add New Document Form */}
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>Add New Document</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={labelStyle}>Document Category <span style={{ color: 'red' }}>*</span></label>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">Select Category</option>
                                {categories.map(cat => (
                                    <option key={cat._id} value={cat._id}>{cat.lookup_value}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Document Type <span style={{ color: 'red' }}>*</span></label>
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                style={inputStyle}
                                disabled={!selectedCategory}
                            >
                                <option value="">Select Type</option>
                                {types.map(type => (
                                    <option key={type._id} value={type._id}>{type.lookup_value}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Document Number <span style={{ color: 'red' }}>*</span></label>
                        <input
                            type="text"
                            value={docNumber}
                            onChange={(e) => setDocNumber(e.target.value)}
                            placeholder="Enter document number"
                            style={{ ...inputStyle, borderColor: isDuplicate ? '#ef4444' : '#cbd5e1' }}
                        />
                        {isDuplicate && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px' }}>{duplicateMessage}</p>}
                    </div>

                    {/* Inventory Link Toggle */}
                    <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>Link to Inventory?</span>
                        <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                            <input
                                type="checkbox"
                                checked={linkToInventory}
                                onChange={(e) => setLinkToInventory(e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: linkToInventory ? '#3b82f6' : '#ccc', borderRadius: '20px', transition: '.4s'
                            }}>
                                <span style={{
                                    position: 'absolute', content: '""', height: '16px', width: '16px', left: '2px', bottom: '2px',
                                    backgroundColor: 'white', borderRadius: '50%', transition: '.4s',
                                    transform: linkToInventory ? 'translateX(20px)' : 'translateX(0)'
                                }}></span>
                            </span>
                        </label>
                    </div>

                    {/* Inventory Selection */}
                    {linkToInventory && (
                        <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Project</label>
                                    <select
                                        value={selectedProject}
                                        onChange={(e) => setSelectedProject(e.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="">Select Project</option>
                                        {projects.map(p => (
                                            <option key={p._id} value={p._id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Block</label>
                                    <select
                                        value={selectedBlock}
                                        onChange={(e) => setSelectedBlock(e.target.value)}
                                        style={inputStyle}
                                        disabled={!selectedProject}
                                    >
                                        <option value="">Select Block</option>
                                        {blocks.map((b, idx) => (
                                            <option key={idx} value={b.name || b}>{b.name || b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Unit Number</label>
                                    <select
                                        value={selectedUnit}
                                        onChange={(e) => setSelectedUnit(e.target.value)}
                                        style={inputStyle}
                                        disabled={!selectedBlock && blocks.length > 0}
                                    >
                                        <option value="">Select Unit</option>
                                        {units.map((u, idx) => (
                                            <option key={idx} value={u.unitNumber}>{u.unitNumber} ({u.status})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Upload File</label>
                        <input type="file" onChange={handleFileChange} />
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={uploading || isDuplicate || !selectedCategory || !selectedType || !docNumber}
                        style={{
                            width: '100%', padding: '12px', background: uploading ? '#94a3b8' : '#3b82f6',
                            color: '#fff', border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem'
                        }}
                    >
                        {uploading ? 'Uploading...' : 'Add Document'}
                    </button>
                </div>

                {/* Existing Documents List */}
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#334155' }}>Uploaded Documents</h4>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#64748b' }}>Loading...</p>
                ) : documents.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
                        {documents.map((doc, index) => {
                            // Helper to display lookup values if they are populated objects
                            const categoryName = typeof doc.documentCategory === 'object' ? doc.documentCategory?.lookup_value : 'Unknown Category';
                            // Fallback for Category if it wasn't saved in older records (maybe infer from type?)

                            const typeName = typeof doc.documentType === 'object' ? doc.documentType?.lookup_value :
                                (typeof doc.documentName === 'object' ? doc.documentName?.lookup_value : doc.documentType || 'Unknown Type');

                            return (
                                <li key={index} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px'
                                }}>
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                {categoryName !== 'Unknown Category' ? categoryName : 'Doc'}
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>{typeName}</span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                                            <span style={{ fontWeight: 500 }}>No:</span> {doc.documentNo}
                                        </div>
                                        {doc.projectName && (
                                            <div style={{ fontSize: '0.8rem', color: '#059669', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="fas fa-building"></i>
                                                {doc.projectName} {doc.block ? `- ${doc.block}` : ''} {doc.unitNumber ? `- ${doc.unitNumber}` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {doc.documentPicture && (
                                            <a href={doc.documentPicture} target="_blank" rel="noopener noreferrer"
                                                style={{ padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', color: '#3b82f6', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 500 }}>
                                                View
                                            </a>
                                        )}
                                        <button onClick={() => handleDelete(index)} style={{ padding: '6px 10px', color: '#ef4444', background: '#fee2e2', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <i className="fas fa-file-upload" style={{ fontSize: '2rem', marginBottom: '10px', color: '#cbd5e1' }}></i>
                        <p style={{ margin: 0 }}>No documents uploaded yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentUploadModal;
