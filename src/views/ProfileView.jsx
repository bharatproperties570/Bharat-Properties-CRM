import React, { useState } from 'react';

const ProfileView = () => {
    // Mock user statistics
    const stats = [
        { label: 'Deals Managed', value: '₹ 142.5 Cr', icon: 'fa-handshake', color: '#3b82f6' },
        { label: 'Active Leads', value: '84', icon: 'fa-filter', color: '#10b981' },
        { label: 'Conversion', value: '12.4%', icon: 'fa-chart-line', color: '#8b5cf6' },
        { label: 'Ranking', value: '#3', icon: 'fa-trophy', color: '#f59e0b' }
    ];

    const [toggles, setToggles] = useState({
        twoFactor: true,
        dataSync: true,
        emailNotif: true
    });

    const toggleSwitch = (key) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <section id="profileView" className="view-section active" style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#f1f5f9',
            height: '100%',
            overflow: 'hidden'
        }}>

            {/* Page Header - Compact */}
            <div className="profile-header" style={{ padding: '16px 40px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>BP</div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Suraj Key (Admin)</h1>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Professional Management Console</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-outline" style={{ padding: '6px 16px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#475569' }}>
                        <i className="fas fa-history" style={{ marginRight: '6px' }}></i> Log
                    </button>
                    <button className="btn-primary" style={{ padding: '6px 20px', fontSize: '0.8rem', borderRadius: '8px' }}>
                        SAVE
                    </button>
                </div>
            </div>

            <div className="profile-main-grid" style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '300px 1fr 350px',
                gap: '20px',
                padding: '20px',
                height: 'calc(100% - 64px)',
                boxSizing: 'border-box'
            }}>

                {/* Column 1: Identity & Bio */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Identity Card */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ position: 'relative', width: '90px', height: '90px', margin: '0 auto 15px auto' }}>
                            <div style={{
                                width: '90px',
                                height: '90px',
                                borderRadius: '50%',
                                background: '#f1f5f9',
                                border: '3px solid #fff',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                overflow: 'hidden'
                            }}>
                                <img src="https://ui-avatars.com/api/?name=Suraj+Key&background=0D8ABC&color=fff&size=150" alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <button style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <i className="fas fa-pen" style={{ fontSize: '0.65rem' }}></i>
                            </button>
                        </div>
                        <h4 style={{ margin: '0', fontSize: '1.1rem', fontWeight: 800 }}>Suraj Key</h4>
                        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '2px 0 15px 0' }}>BP-SRM-2024-084</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Designation</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>Senior Relationship Manager</div>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Department</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>Sales Development</div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info Card */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', flex: 1 }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-phone-alt" style={{ color: 'var(--primary-color)', fontSize: '0.8rem', transform: 'scaleX(-1) rotate(5deg)' }}></i> Contact Details
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Mobile Number</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>+91 9991333570</div>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Email Address</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>suraj.key@bharatproperties.in</div>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Official Address</label>
                                <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.4' }}>Plot 12, Tower B, Sector 44, Gurugram, Haryana</div>
                            </div>
                            <div style={{ marginTop: '5px' }}>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Professional Bio</label>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>8+ yrs in Real Estate. Luxury Residential specialist.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Performance & Digital Presence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Compact Stats Row */}
                    <div style={{
                        background: '#1e293b',
                        borderRadius: '12px',
                        padding: '15px 20px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '15px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}>
                        {stats.map((stat, idx) => (
                            <div key={idx} style={{ textAlign: 'center' }}>
                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>{stat.label}</div>
                                <div style={{ color: stat.color, fontSize: '1.1rem', fontWeight: 800 }}>{stat.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Email & Digital Card */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-at" style={{ color: '#ec4899', fontSize: '0.8rem' }}></i> Communication
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>Email Signature</label>
                                        <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9', fontSize: '0.75rem' }}>
                                            <strong>Suraj Key</strong><br />
                                            Bharat Properties SRM<br />
                                            <span style={{ color: 'var(--primary-color)' }}>www.bharatproperties.in</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>WhatsApp Business</label>
                                        <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                                            <input type="text" className="form-control" defaultValue="wa.me/919991333570" style={{ fontSize: '0.8rem', padding: '6px 10px' }} readOnly />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fas fa-sliders-h" style={{ color: '#f59e0b', fontSize: '0.8rem' }}></i> Preferences
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>Language</label>
                                        <select className="form-control" style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                                            <option>English (United States)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>Working Hours</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="time" className="form-control" defaultValue="09:00" style={{ fontSize: '0.8rem', padding: '6px 5px' }} />
                                            <span style={{ fontSize: '0.7rem' }}>-</span>
                                            <input type="time" className="form-control" defaultValue="18:30" style={{ fontSize: '0.8rem', padding: '6px 5px' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Storage & Region Bottom */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Currency & Format</label>
                                <select className="form-control" style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                                    <option>INR (₹) - Indian Rupee</option>
                                </select>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Document Storage</label>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Used 0 of 49 GB</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px' }}>
                                    <div style={{ width: '5%', height: '100%', background: 'var(--primary-color)', borderRadius: '3px' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 3: Security & Activity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Security Hub Card */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', flex: 1 }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#ef4444', fontSize: '0.8rem' }}></i> Security Hub
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Two-Factor Auth</div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Enhanced protection</div>
                                </div>
                                <div
                                    onClick={() => toggleSwitch('twoFactor')}
                                    style={{ width: '36px', height: '20px', background: toggles.twoFactor ? 'var(--primary-color)' : '#cbd5e1', borderRadius: '10px', padding: '2px', cursor: 'pointer', position: 'relative' }}
                                >
                                    <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', right: toggles.twoFactor ? '2px' : 'auto', left: toggles.twoFactor ? 'auto' : '2px', transition: '0.2s' }}></div>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Last login Activity</label>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginTop: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <i className="fas fa-desktop" style={{ color: '#94a3b8' }}></i> MacOS • Chrome
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>IP: 103.21.144.17 (Active Now)</div>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginTop: '10px', opacity: 0.6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <i className="fas fa-mobile-alt" style={{ color: '#94a3b8' }}></i> iPhone 15 • Safari
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>15 Jan 2026, 09:45 PM</div>
                                </div>
                            </div>

                            <button className="btn-outline" style={{ width: '100%', fontSize: '0.75rem', padding: '10px', color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2' }}>
                                Sign out all devices
                            </button>
                        </div>
                    </div>

                    {/* Quick Access Card */}
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', height: '100px' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>LinkedIn Network</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, padding: '8px', background: '#f0f9ff', borderRadius: '6px', fontSize: '0.75rem', color: '#0369a1' }}>
                                linked.com/in/surajkey
                            </div>
                            <button className="btn-outline" style={{ padding: '6px 10px' }}><i className="fas fa-external-link-alt"></i></button>
                        </div>
                    </div>
                </div>

            </div>

        </section>
    );
};

export default ProfileView;
