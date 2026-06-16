import { useTheme } from '../../context/ThemeContext';

import React from 'react';

const ContactBookings = ({ expandedSections, toggleSection, contactBookings, renderValue, renderLookup, onNavigate }) => {
    const { isDark } = useTheme();
    const isExpanded = expandedSections.includes('bookings');

    return (
        <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fff', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div 
                style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' : isDark ? 'var(--bg-card)' : '#fff' }}
                onClick={() => toggleSection('bookings')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-file-contract" style={{ color: isDark ? 'var(--bg-card)' : 'var(--premium-blue)', fontSize: '1rem' }}></i>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Bookings & Post-Sale ({contactBookings?.length || 0})
                    </h3>
                </div>
                <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: 'var(--text-muted)', fontSize: '0.8rem', transition: 'transform 0.2s' }}></i>
            </div>

            {isExpanded && (
                <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)' }}>
                    {contactBookings && contactBookings.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {contactBookings.map((booking) => {
                                const bDate = booking.bookingDate ? new Date(booking.bookingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                                const amount = booking.totalDealAmount ? `₹${booking.totalDealAmount.toLocaleString('en-IN')}` : 'N/A';
                                const propertyTitle = booking.property ? (booking.property.title || renderLookup(booking.property.projectId) || 'Property') : 'Unknown Property';

                                return (
                                    <div key={booking._id} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>{propertyTitle}</div>
                                            <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', background: booking.status === 'Registry' ? '#10b981' : 'var(--primary-color)', color: '#fff', fontWeight: 800 }}>
                                                {booking.status || 'Active'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '15px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="fas fa-calendar-alt"></i> {bDate}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}>
                                                <i className="fas fa-rupee-sign"></i> {amount}
                                            </div>
                                        </div>
                                        {booking.applicationNo && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                App No: {booking.applicationNo}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                            <i className="fas fa-file-contract" style={{ fontSize: '1.5rem', marginBottom: '8px', opacity: 0.5, display: 'block' }}></i>
                            No bookings or post-sale records.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ContactBookings;
