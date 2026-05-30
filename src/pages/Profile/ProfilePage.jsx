import { useState, useEffect, useRef } from 'react';
import { useUserContext } from '../../context/UserContext';
import Swal from 'sweetalert2';

const ProfilePage = () => {
    const { currentUser, updateProfile, logout } = useUserContext();

    // Mock user statistics
    const stats = [
        { label: 'Deals Managed', value: '₹ 142.5 Cr', icon: 'fa-handshake', color: '#3b82f6' },
        { label: 'Active Leads', value: '84', icon: 'fa-filter', color: '#10b981' },
        { label: 'Conversion', value: '12.4%', icon: 'fa-chart-line', color: '#8b5cf6' },
        { label: 'Ranking', value: '#3', icon: 'fa-trophy', color: '#f59e0b' }
    ];

    const [profilePicture, setProfilePicture] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Enterprise States
    const [preferences, setPreferences] = useState({
        language: 'English (United States)',
        currency: 'INR (₹)',
        workingHours: { start: '09:00', end: '18:30' },
        emailSignature: '',
        whatsappSignature: '',
        smsSignature: ''
    });
    const [toggles, setToggles] = useState({
        twoFactor: false,
        emailNotif: true,
        pushNotif: true,
        smsNotif: false
    });
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (currentUser) {
            setProfilePicture(currentUser.avatar || '');
            if (currentUser.preferences) {
                setPreferences({
                    language: currentUser.preferences.language || 'English (United States)',
                    currency: currentUser.preferences.currency || 'INR (₹)',
                    workingHours: currentUser.preferences.workingHours || { start: '09:00', end: '18:30' },
                    emailSignature: currentUser.preferences.emailSignature || '',
                    whatsappSignature: currentUser.preferences.whatsappSignature || '',
                    smsSignature: currentUser.preferences.smsSignature || ''
                });
            }
            if (currentUser.security || currentUser.notifications) {
                setToggles({
                    twoFactor: currentUser.security?.twoFactorEnabled || false,
                    emailNotif: currentUser.notifications?.email ?? true,
                    pushNotif: currentUser.notifications?.push ?? true,
                    smsNotif: currentUser.notifications?.sms ?? false
                });
            }
        }
    }, [currentUser]);

    const handlePictureUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('Image size should be less than 2MB');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result;
                setProfilePicture(base64);
                // Also trigger save for avatar immediately or let save button do it
            };
            reader.readAsDataURL(file);
        }
    };

    const toggleSwitch = (key) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handlePreferenceChange = (field, value, isWorkingHour = false) => {
        if (isWorkingHour) {
            setPreferences(prev => ({ ...prev, workingHours: { ...prev.workingHours, [field]: value } }));
        } else {
            setPreferences(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const data = {
            avatar: profilePicture,
            preferences,
            security: { twoFactorEnabled: toggles.twoFactor },
            notifications: { email: toggles.emailNotif, push: toggles.pushNotif, sms: toggles.smsNotif }
        };
        const res = await updateProfile(data);
        setIsSaving(false);
        if (res.success) {
            Swal.fire('Saved!', 'Profile updated successfully.', 'success');
        } else {
            Swal.fire('Error', res.error || 'Failed to update profile', 'error');
        }
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
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'BP'}
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {currentUser?.name || 'User'} {currentUser?.isAdmin ? '(Admin)' : ''}
                        </h1>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Professional Management Console</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-outline" style={{ padding: '6px 16px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#475569' }}>
                        <i className="fas fa-history" style={{ marginRight: '6px' }}></i> Log
                    </button>
                    <button className="btn-primary" onClick={handleSave} disabled={isSaving} style={{ padding: '6px 20px', fontSize: '0.8rem', borderRadius: '8px', opacity: isSaving ? 0.7 : 1 }}>
                        {isSaving ? 'SAVING...' : 'SAVE'}
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
                                <img src={profilePicture || "https://ui-avatars.com/api/?name=Suraj+Key&background=0D8ABC&color=fff&size=150"} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handlePictureUpload}
                            />
                            <button onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <i className="fas fa-camera" style={{ fontSize: '0.65rem' }}></i>
                            </button>
                        </div>
                        <h4 style={{ margin: '0', fontSize: '1.1rem', fontWeight: 800 }}>{currentUser?.name || 'User'}</h4>
                        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '2px 0 15px 0' }}>{currentUser?.employeeId || 'BP-EMP-001'}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Designation</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{currentUser?.role?.name || 'User'}</div>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Department</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{currentUser?.department || 'Sales'}</div>
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
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentUser?.phone || currentUser?.mobile || 'Not Provided'}</div>
                            </div>
                            <div>
                                <label className="section-label" style={{ fontSize: '0.6rem' }}>Email Address</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentUser?.email || 'Not Provided'}</div>
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
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>Email Signature (HTML)</label>
                                        <div style={{ marginTop: '4px' }}>
                                            <textarea 
                                                className="form-control" 
                                                style={{ fontSize: '0.75rem', padding: '10px', height: '80px', resize: 'none' }}
                                                value={preferences.emailSignature}
                                                onChange={(e) => handlePreferenceChange('emailSignature', e.target.value)}
                                                placeholder={`<strong>${currentUser?.name || 'User'}</strong><br/>...`}
                                            ></textarea>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>WhatsApp Signature (Text)</label>
                                        <div style={{ marginTop: '4px' }}>
                                            <textarea 
                                                className="form-control" 
                                                style={{ fontSize: '0.75rem', padding: '10px', height: '60px', resize: 'none' }}
                                                value={preferences.whatsappSignature}
                                                onChange={(e) => handlePreferenceChange('whatsappSignature', e.target.value)}
                                                placeholder={`*Regards,*\n${currentUser?.name || currentUser?.fullName || ''}\nBharat Properties\nEmail: ${currentUser?.email || ''}\nPh: ${currentUser?.phone || currentUser?.mobile || ''}`}
                                            ></textarea>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>SMS Signature (Short)</label>
                                        <div style={{ marginTop: '4px' }}>
                                            <textarea 
                                                className="form-control" 
                                                style={{ fontSize: '0.75rem', padding: '10px', height: '40px', resize: 'none' }}
                                                value={preferences.smsSignature}
                                                onChange={(e) => handlePreferenceChange('smsSignature', e.target.value)}
                                                placeholder={`- Bharat Properties, Ph: ${currentUser?.phone || currentUser?.mobile || ''}`}
                                            ></textarea>
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
                                        <select className="form-control" value={preferences.language} onChange={(e) => handlePreferenceChange('language', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                                            <option value="English (United States)">English (United States)</option>
                                            <option value="Hindi">Hindi</option>
                                            <option value="Spanish">Spanish</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="section-label" style={{ fontSize: '0.6rem' }}>Working Hours</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input type="time" className="form-control" value={preferences.workingHours.start} onChange={(e) => handlePreferenceChange('start', e.target.value, true)} style={{ fontSize: '0.8rem', padding: '6px 5px' }} />
                                            <span style={{ fontSize: '0.7rem' }}>-</span>
                                            <input type="time" className="form-control" value={preferences.workingHours.end} onChange={(e) => handlePreferenceChange('end', e.target.value, true)} style={{ fontSize: '0.8rem', padding: '6px 5px' }} />
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
                                <select className="form-control" value={preferences.currency} onChange={(e) => handlePreferenceChange('currency', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                                    <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                                    <option value="USD ($)">USD ($) - US Dollar</option>
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

                            <button className="btn-outline" onClick={() => logout()} style={{ width: '100%', fontSize: '0.75rem', padding: '10px', color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2' }}>
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

export default ProfilePage;
