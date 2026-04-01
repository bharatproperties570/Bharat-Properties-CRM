import { useState } from 'react';
import { useUserContext } from '../../context/UserContext';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import logo from '../../assets/logo.png';

const LoginPage = () => {
    const { login } = useUserContext();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Dynamic Wallpaper Logic: Night view starts at 6:30 PM (18:30)
    const currentHour = new Date().getHours();
    const currentMinutes = new Date().getMinutes();
    const isNightTime = currentHour > 18 || (currentHour === 18 && currentMinutes >= 30);
    const backgroundImage = isNightTime ? '/login-night.png' : '/login-day.png';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const result = await login(formData);
        setLoading(false);
        if (result.success) {
            toast.success('Access Granted. Welcome back.');
        } else {
            toast.error(result.error || 'Authentication failed');
        }
    };

    return (
        <div style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Ambient Overlay */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.95) 100%)',
                zIndex: 1
            }} />

            <div style={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                maxWidth: '440px',
                padding: '20px'
            }}>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '32px',
                    border: '1px solid rgba(255, 255, 255, 0.125)',
                    padding: '48px',
                    boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '32px'
                }}>
                    {/* Header Section */}
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            margin: '0 auto 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4))'
                        }}>
                            <img 
                                src={logo} 
                                alt="Bharat Properties Logo" 
                                style={{ 
                                    maxWidth: '100%', 
                                    maxHeight: '100%', 
                                    objectFit: 'contain' 
                                }} 
                            />
                        </div>
                        <h1 style={{
                            fontSize: '2rem',
                            fontWeight: 800,
                            margin: '0 0 4px 0',
                            letterSpacing: '-1.5px',
                            color: '#fff',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                        }}>
                            Bharat Properties
                        </h1>
                        <p style={{
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '0.95rem',
                            fontWeight: 400
                        }}>
                            Advanced Real Estate Ecosystem
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Email Input */}
                        <div style={{ position: 'relative' }}>
                            <label style={{
                                display: 'block',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: 'rgba(255, 255, 255, 0.5)',
                                textTransform: 'uppercase',
                                marginBottom: '8px',
                                letterSpacing: '1px'
                            }}>
                                Corporate Email
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{
                                    position: 'absolute',
                                    left: '16px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'rgba(255, 255, 255, 0.4)'
                                }} />
                                <input
                                    type="email"
                                    required
                                    placeholder="name@company.com"
                                    style={{
                                        width: '100%',
                                        padding: '14px 16px 14px 48px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '14px',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <label style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}>
                                    Secure Password
                                </label>
                                <a href="/forgot-password" style={{
                                    fontSize: '0.75rem',
                                    color: '#3b82f6',
                                    textDecoration: 'none',
                                    fontWeight: 500,
                                    transition: 'color 0.2s'
                                }}>
                                    Forgot Password?
                                </a>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{
                                    position: 'absolute',
                                    left: '16px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'rgba(255, 255, 255, 0.4)'
                                }} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder="••••••••"
                                    style={{
                                        width: '100%',
                                        padding: '14px 48px 14px 48px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '14px',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: 'rgba(255, 255, 255, 0.4)',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '16px',
                                marginTop: '12px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '14px',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: loading ? 'none' : '0 10px 15px -3px rgba(59, 130, 246, 0.4)',
                                opacity: loading ? 0.7 : 1,
                                transform: loading ? 'scale(0.98)' : 'none'
                             }}
                        >
                            {loading ? 'Verifying...' : (
                                <>
                                    <span>Sign into Dashboard</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div style={{
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: 'rgba(255, 255, 255, 0.3)',
                        letterSpacing: '0.5px'
                    }}>
                        CRM SYSTEM • © 2025 BHARAT PROPERTIES
                    </div>
                </div>
            </div>

            {/* In-page global styles for focus effects */}
            <style>
                {`
                    input:focus {
                        background: rgba(255, 255, 255, 0.08) !important;
                        border-color: rgba(59, 130, 246, 0.5) !important;
                        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15) !important;
                    }
                    button:hover:not(:disabled) {
                        transform: translateY(-1px);
                        filter: brightness(1.1);
                        box-shadow: 0 12px 20px -3px rgba(59, 130, 246, 0.5);
                    }
                    a:hover {
                        color: #60a5fa !important;
                        text-decoration: underline !important;
                    }
                `}
            </style>
        </div>
    );
};

export default LoginPage;
