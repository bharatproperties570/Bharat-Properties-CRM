import React from 'react';
import { renderValue } from '../../utils/renderUtils';
import { getInitials } from '../../utils/helpers';

const ContactRow = ({ name, role, phone }) => {
    const cleanPhone = phone ? phone.replace(/\s+/g, '').replace('+', '') : '';

    return (
        <div style={{ padding: '14px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '16px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', transition: 'all 0.2s' }}>
            <div style={{ 
                width: '40px', height: '40px', 
                background: 'linear-gradient(135deg, var(--premium-blue, #4f46e5), #818cf8)', 
                borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                color: '#fff', fontSize: '0.9rem', fontWeight: 900,
                boxShadow: '0 4px 10px var(--premium-blue-glow, rgba(79, 70, 229, 0.15))'
            }}>
                {getInitials(name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>{name}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 650 }}>
                    {role} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>•</span> {phone || 'N/A'}
                </p>
            </div>
            {phone && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={`tel:${phone}`} style={{ 
                        width: '32px', height: '32px', background: '#ecfdf5', color: '#10b981', 
                        borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '0.8rem', border: '1px solid #d1fae5', transition: 'all 0.2s'
                    }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                        <i className="fas fa-phone-alt"></i>
                    </a>
                    <a href={`https://wa.me/${cleanPhone}`} target="_blank" rel="noopener noreferrer" style={{ 
                        width: '32px', height: '32px', background: '#f0fdf4', color: '#22c55e', 
                        borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '1rem', border: '1px solid #dcfce7', transition: 'all 0.2s'
                    }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                        <i className="fab fa-whatsapp"></i>
                    </a>
                </div>
            )}
        </div>
    );
};

const PropertyOwnerSection = ({ inventory, onOwnerClick }) => {
    if (!inventory) return null;

    return (
        <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', background: 'var(--premium-blue-glow, rgba(79, 70, 229, 0.15))', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-users-cog" style={{ color: 'var(--premium-blue, #4f46e5)', fontSize: '0.9rem' }}></i>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Property Owner</h3>
                </div>
                {onOwnerClick && (
                    <button 
                        onClick={onOwnerClick}
                        style={{ border: 'none', background: '#f1f5f9', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        EDIT GROUP
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(inventory.owners || []).map((o, idx) => (
                    <ContactRow key={idx} name={renderValue(o.name)} role="Primary Owner" phone={renderValue(o.phones?.[0]?.number) || renderValue(o.mobile)} />
                ))}
                {(inventory.associates || []).map((a, idx) => (
                    <ContactRow 
                        key={idx} 
                        name={renderValue(a.contact?.name) || renderValue(a.name) || 'Associate'} 
                        role={`Associate (${a.relationship || 'General'})`}
                        phone={renderValue(a.contact?.phones?.[0]?.number) || renderValue(a.mobile)} 
                    />
                ))}
                {(!inventory.owners?.length && !inventory.associates?.length && inventory.ownerName) && (
                    <ContactRow name={renderValue(inventory.ownerName)} role="Property Owner" phone={renderValue(inventory.ownerPhone)} />
                )}
            </div>
        </div>
    );
};

export default PropertyOwnerSection;
