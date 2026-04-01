
const DealDocuments = ({ deal, setIsDocumentModalOpen }) => {
    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #fff, #f8fafc)'
    };

    const sectionTitleStyle = {
        fontSize: '0.95rem',
        fontWeight: 900,
        color: '#0f172a',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    };

    return (
        <div style={cardStyle}>
            <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>
                    <i className="fas fa-file-contract text-blue-600"></i> Property Documents
                </h3>
                <button
                    onClick={() => setIsDocumentModalOpen(true)}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                    <i className="fas fa-plus"></i>
                </button>
            </div>
            <div style={{ padding: '20px' }}>
                {deal.inventoryId?.documents?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {deal.inventoryId.documents.map((doc, idx) => (
                            <div key={idx} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                    <i className="fas fa-file-pdf"></i>
                                </div>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name || 'Property Document'}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{doc.type || 'Legal'} • {new Date(doc.uploadedAt || Date.now()).toLocaleDateString()}</div>
                                </div>
                                <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: '#94a3b8' }}>
                                    <i className="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0', border: '1px dashed #e2e8f0', borderRadius: '12px' }}>
                        <i className="fas fa-file-upload" style={{ fontSize: '1.5rem', color: '#cbd5e1', marginBottom: '8px' }}></i>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, margin: 0 }}>No documents uploaded</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DealDocuments;
