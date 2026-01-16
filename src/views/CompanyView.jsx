import React, { useState } from 'react';

function CompanyView() {
    const [searchTerm, setSearchTerm] = useState('');

    const companyData = [
        { id: 1, name: 'Bharat Properties', industry: 'Real Estate', location: 'Kurukshetra', status: 'Active' },
        { id: 2, name: 'Alpha Tech', industry: 'Software', location: 'Mohali', status: 'Active' },
        { id: 3, name: 'Green Valley', industry: 'Agriculture', location: 'Panipat', status: 'Inactive' },
    ];

    return (
        <section id="companyView" className="view-section active">
            <div className="view-scroll-wrapper">
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-city" style={{ color: 'var(--primary-color)' }}></i>
                        <div>
                            <span className="working-list-label">Business Entities</span>
                            <h1>Company Portfolio</h1>
                        </div>
                    </div>
                </div>

                <div className="content-body" style={{ padding: '2rem' }}>
                    <div className="toolbar-container" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <input
                                type="text"
                                className="search-input-premium"
                                placeholder="Search companies..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <button className="btn-primary">Add Company</button>
                    </div>

                    <div className="list-header" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr 100px',
                        padding: '12px 20px',
                        background: '#f8fafc',
                        borderBottom: '2px solid #e2e8f0',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        color: '#64748b'
                    }}>
                        <div>Company Name</div>
                        <div>Industry</div>
                        <div>Location</div>
                        <div>Status</div>
                    </div>

                    <div className="list-content">
                        {companyData.map(company => (
                            <div key={company.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr 100px',
                                padding: '15px 20px',
                                borderBottom: '1px solid #f1f5f9',
                                alignItems: 'center',
                                background: '#fff'
                            }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{company.name}</div>
                                <div style={{ color: '#475569', fontSize: '0.85rem' }}>{company.industry}</div>
                                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{company.location}</div>
                                <div>
                                    <span className={`status-badge ${company.status.toLowerCase()}`} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px' }}>
                                        {company.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CompanyView;
