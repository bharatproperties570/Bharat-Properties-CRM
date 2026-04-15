import { useState, useEffect, useRef } from 'react';

const ProfileMenu = ({ currentUser, logout, onNavigate }) => {
    const [profilePicture, setProfilePicture] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        const savedPicture = localStorage.getItem('userProfilePicture');
        if (savedPicture) {
            setProfilePicture(savedPicture);
        }
    }, []);

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
                localStorage.setItem('userProfilePicture', base64);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="profile-wrapper">
            <div
                className="profile-circle"
                style={{ position: 'relative', overflow: 'hidden' }}
                title="Profile"
                onClick={() => fileInputRef.current?.click()}
            >
                {profilePicture ? (
                    <img
                        src={profilePicture}
                        alt="Profile"
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover'
                        }}
                    />
                ) : (
                    currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'BP'
                )}
            </div>
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePictureUpload}
            />
            <div className="profile-dropdown-content" style={{ zIndex: 100001 }}>
                <div className="p-dropdown-header">
                    <strong>{currentUser?.name || 'Bharat Properties'}</strong>
                    <span>{typeof currentUser?.role === 'object' ? currentUser.role?.name : (currentUser?.role || 'Administrator')}</span>
                </div>
                <div className="p-dropdown-divider"></div>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('profile'); }}>
                    <i className="fas fa-user-circle"></i> Profile
                </a>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('settings'); }}>
                    <i className="fas fa-cog"></i> Settings
                </a>
                <div className="p-dropdown-divider"></div>
                <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{ color: '#ef4444' }}>
                    <i className="fas fa-sign-out-alt"></i> Logout
                </a>
            </div>
        </div>
    );
};

export default ProfileMenu;
