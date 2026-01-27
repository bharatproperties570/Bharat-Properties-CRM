import React, { useState, useEffect } from 'react';

function AddDocumentModal({ isOpen, onClose, onSave, project }) {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (project && project.documents && project.documents.length > 0) {
                // If editing an existing project with documents, load them
                // Deep copy to avoid mutating props directly
                setDocuments(JSON.parse(JSON.stringify(project.documents)));
            } else {
                // Default clean state
                setDocuments([{ documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }]);
            }
        }
    }, [isOpen, project]);

    const handleSave = () => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            onSave(documents);
            setIsLoading(false);
            onClose();
        }, 800);
    };

    if (!isOpen) return null;

    // Shared Styles (copied from AddProjectModal for consistency)
    const labelStyle = {
        fontSize: '0.8rem',
        fontWeight: 600,
        color: '#334155',
        marginBottom: '6px',
        display: 'block'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'all 0.2s',
        background: '#fff',
        color: '#1e293b'
    };

    const sectionStyle = {
        background: '#fff',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
    };

    const buttonStyle = {
        primary: {
            background: 'var(--primary-color)',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem',
            boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)'
        },
        secondary: {
            background: '#fff',
            color: '#64748b',
            border: '1px solid #cbd5e1',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem'
        },
        cancel: {
            background: 'transparent',
            color: '#ef4444',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem'
        },
        success: {
            background: '#10b981',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem',
            boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1000px', height: '85vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} className="animate-slideIn">

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#ecfdf5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-file-contract" style={{ color: '#059669' }}></i>
                            </div>
                            Manage Documents & Approvals
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500, marginLeft: '42px' }}>
                            {project ? `Project: ${project.name}` : 'New Project Documents'}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FB', padding: '24px' }}>
                    <div style={sectionStyle}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-stamp" style={{ color: '#8b5cf6' }}></i> Approvals & Certificates
                        </h4>

                        {documents.map((doc, index) => (
                            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 40px', gap: '16px', marginBottom: '16px', alignItems: 'end' }}>
                                <div>
                                    <label style={labelStyle}>Document Name</label>
                                    <input
                                        type="text"
                                        value={doc.documentName}
                                        placeholder="e.g. RERA Approval"
                                        onChange={(e) => {
                                            const newDocs = [...documents];
                                            newDocs[index].documentName = e.target.value;
                                            setDocuments(newDocs);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Approval Authority</label>
                                    <input
                                        type="text"
                                        value={doc.approvalAuthority}
                                        placeholder="Authority Name"
                                        onChange={(e) => {
                                            const newDocs = [...documents];
                                            newDocs[index].approvalAuthority = e.target.value;
                                            setDocuments(newDocs);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Registration No.</label>
                                    <input
                                        type="text"
                                        value={doc.registrationNo}
                                        placeholder="Reg No."
                                        onChange={(e) => {
                                            const newDocs = [...documents];
                                            newDocs[index].registrationNo = e.target.value;
                                            setDocuments(newDocs);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Approval Date</label>
                                    <input
                                        type="date"
                                        value={doc.date}
                                        onChange={(e) => {
                                            const newDocs = [...documents];
                                            newDocs[index].date = e.target.value;
                                            setDocuments(newDocs);
                                        }}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>File</label>
                                    <label style={{
                                        width: '100%',
                                        height: '42px',
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        color: '#64748b',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        padding: '0 8px'
                                    }}>
                                        {doc.file ? (doc.file.name || 'File Selected') : 'Upload'}
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const newDocs = [...documents];
                                                    newDocs[index].file = file;
                                                    setDocuments(newDocs);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (index === 0) {
                                            setDocuments([
                                                ...documents,
                                                { documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }
                                            ]);
                                        } else {
                                            const newDocs = documents.filter((_, i) => i !== index);
                                            setDocuments(newDocs);
                                        }
                                    }}
                                    style={{
                                        height: '42px',
                                        width: '40px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: index === 0 ? '#eff6ff' : '#fef2f2',
                                        color: index === 0 ? '#3b82f6' : '#ef4444',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <button onClick={handleSave} disabled={isLoading} style={buttonStyle.success}>
                        {isLoading ? 'Saving...' : 'Save Documents'}
                    </button>
                </div>

                <style>{`
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                `}</style>
            </div>
        </div>
    );
}

export default AddDocumentModal;
