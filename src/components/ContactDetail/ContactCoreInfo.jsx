import React from 'react';

const ContactCoreInfo = React.memo(function ContactCoreInfo({
    contact,
    recordType,
    expandedSections,
    toggleSection,
    renderLookup,
    handleAutoSave
}) {
    if (!expandedSections.includes('core')) {
        return (
            <div className="glass-card" style={{ borderRadius: '16px' }}>
                <div onClick={() => toggleSection('core')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>{recordType === 'lead' ? 'Lead' : 'Contact'} 360° Unified Dashboard</span>
                    <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ borderRadius: '16px' }}>
            <div onClick={() => toggleSection('core')} style={{ padding: '14px 20px', background: 'rgba(248, 250, 252, 0.5)', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>{recordType === 'lead' ? 'Lead' : 'Contact'} 360° Unified Dashboard</span>
                <i className="fas fa-chevron-up" style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Row 1: Primary Identity & Lead Status */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-id-card"></i> Primary Identity
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Phone Details</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {Array.isArray(contact.phones) ? contact.phones.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Phone', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{p.number}</div>
                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{p.type}</span>
                                        </div>
                                    )) : (
                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Phone', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.mobile}</div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Email Details</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {Array.isArray(contact.emails) ? contact.emails.map((e, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Email', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{e.address}</div>
                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{e.type}</span>
                                        </div>
                                    )) : (
                                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Email', e.target.innerText)} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{contact.email || '-'}</div>
                                    )}
                                </div>
                            </div>

                            {/* Social Connect Icons */}
                            {contact.socialMedia && contact.socialMedia.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    {contact.socialMedia.filter(soc => soc && soc.url).map((soc, i) => (
                                        <a key={i} href={String(soc.url).startsWith('http') ? soc.url : `https://${soc.url}`} target="_blank" rel="noopener noreferrer" style={{
                                            width: '28px', height: '28px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s'
                                        }} title={renderLookup(soc.platform)}>
                                            <i className={`fab fa-${(renderLookup(soc.platform, '')).toLowerCase()}`} style={{ fontSize: '0.9rem' }}></i>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-users-cog"></i> Family Connect
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Father's Name</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Father Name', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.fatherName || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Gender</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Gender', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.gender || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Birth Date</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Birth Date', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.birthDate || '-'}</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Marital Status</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Marital Status', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.maritalStatus || '-'}</div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Anniversary Date</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Anniversary Date', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{contact.anniversaryDate || '-'}</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-briefcase"></i> Professional Identity
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Branch / Office</label>
                                <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Branch', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>{contact.workOffice || 'Main Office'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1, padding: '12px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '10px', border: '1px solid #eef2f6' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Category</div>
                                    <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Category', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionCategory)}</div>
                                </div>
                                <div style={{ flex: 1, padding: '12px', background: 'rgba(79, 70, 229, 0.02)', borderRadius: '10px', border: '1px solid #eef2f6' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Sub-Category</div>
                                    <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Sub-Category', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{renderLookup(contact.professionSubCategory)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }}></div>

                {/* Row 1.5: Education & Financial Strength */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
                    {/* Education */}
                    <div>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-user-graduate"></i> Academic Background
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {contact.educations?.map((edu, i) => (
                                <div key={i} style={{ paddingLeft: '12px', borderLeft: '2px solid #e2e8f0' }}>
                                    <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Degree', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{renderLookup(edu.degree)}</div>
                                    <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('School', e.target.innerText)} style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{edu.school || '-'}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>{renderLookup(edu.education)}</div>
                                </div>
                            )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No education details provided</div>}
                        </div>
                    </div>

                    {/* Financial Strength (Incomes & Loans) */}
                    <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                        <div>
                            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-money-bill-wave"></i> Income Profiles
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {contact.incomes?.map((inc, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534' }}>{renderLookup(inc.incomeType)}</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#059669' }}>₹{Number(inc.amount || 0).toLocaleString()}</span>
                                    </div>
                                )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No income details provided</div>}
                            </div>
                        </div>
                        <div>
                            <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-hand-holding-usd"></i> Liability / Loans
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {contact.loans?.map((loan, i) => (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b' }}>{renderLookup(loan.loanType)}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ef4444' }}>₹{Number(loan.loanAmount || 0).toLocaleString()}</span>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: 600 }}>{renderLookup(loan.bank)}</div>
                                    </div>
                                )) || <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No loan details provided</div>}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }}></div>

                {/* Row 2: Location Intelligence */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-map-marked-alt"></i> Location Portfolio
                        </h4>
                    </div>
                    <div style={{ padding: '12px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Permanent Address</label>
                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Permanent Address', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                            {[
                                contact.personalAddress?.hNo,
                                contact.personalAddress?.street,
                                contact.personalAddress?.area,
                                renderLookup(contact.personalAddress?.location, ''),
                                renderLookup(contact.personalAddress?.city, ''),
                                renderLookup(contact.personalAddress?.state, ''),
                                contact.personalAddress?.pinCode
                            ].filter(Boolean).join(', ') || 'No Permanent Address Provided'}
                        </div>
                    </div>
                    <div style={{ padding: '12px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                        <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Correspondence Address</label>
                        <div contentEditable suppressContentEditableWarning className="editable-field" onBlur={(e) => handleAutoSave('Correspondence Address', e.target.innerText)} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.4' }}>
                            {[
                                contact.correspondenceAddress?.hNo,
                                contact.correspondenceAddress?.street,
                                contact.correspondenceAddress?.area,
                                renderLookup(contact.correspondenceAddress?.location, ''),
                                renderLookup(contact.correspondenceAddress?.city, ''),
                                renderLookup(contact.correspondenceAddress?.state, ''),
                                contact.correspondenceAddress?.pinCode
                            ].filter(Boolean).join(', ') || 'No Correspondence Address Provided'}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
});

ContactCoreInfo.displayName = 'ContactCoreInfo';

export default ContactCoreInfo;
