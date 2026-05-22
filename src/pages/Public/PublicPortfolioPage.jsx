import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../utils/api';
import { fixDriveUrl } from '../../utils/helpers';
import toast from 'react-hot-toast';

const PublicPortfolioPage = () => {
    const { token } = useParams();
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPortfolio = async () => {
            try {
                const res = await api.get(`portfolios/public/${token}`);
                if (res.data?.success) {
                    setPortfolio(res.data.data);
                } else {
                    setError('Portfolio not found');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load portfolio. It may have expired.');
            } finally {
                setLoading(false);
            }
        };

        fetchPortfolio();
    }, [token]);

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
            <div className="loader"></div>
        </div>
    );

    if (error) return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', color: '#cbd5e1', marginBottom: '20px' }}>
                <i className="fas fa-folder-open"></i>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>Portfolio Not Available</h1>
            <p style={{ color: '#64748b', maxWidth: '400px' }}>{error}</p>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
            {/* Branded Header */}
            <header style={{ background: '#fff', padding: '24px 20px', borderBottom: '1px solid #e2e8f0', sticky: 'top', zIndex: 100 }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>{portfolio.title}</h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Curated recommendations for you</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Prepared By</span>
                        <p style={{ margin: 0, fontWeight: 800, color: '#6366f1' }}>{portfolio.agent?.fullName || portfolio.branding?.agentName}</p>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {portfolio.items.map((item, idx) => (
                        <div key={idx} style={{ background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', transition: 'transform 0.3s' }}>
                            <div style={{ height: '220px', overflow: 'hidden', position: 'relative' }}>
                                <img 
                                    src={fixDriveUrl(item.propertyImages?.[0]) || `https://picsum.photos/seed/${item._id}/600/400`} 
                                    alt={item.projectName} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.9)', padding: '6px 12px', borderRadius: '100px', fontWeight: 800, fontSize: '0.9rem', color: '#16a34a', backdropFilter: 'blur(4px)' }}>
                                    ₹{(item.price / 100000).toFixed(1)}L
                                </div>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800 }}>{item.projectName}</h3>
                                <p style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i>
                                    {item.address?.city || 'Premium Location'}
                                </p>
                                
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                    <div style={{ flex: 1, background: '#f8fafc', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                                        <span style={{ display: 'block', fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Type</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.category?.lookup_value || 'Property'}</span>
                                    </div>
                                    <div style={{ flex: 1, background: '#f8fafc', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                                        <span style={{ display: 'block', fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Size</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.size} {item.sizeUnit}</span>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => toast.success('Site visit request sent to agent!')}
                                    style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#0f172a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', transition: 'background 0.3s' }}
                                >
                                    I'm Interested
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* Sticky Agent Footer (Mobile Friendly) */}
            <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '16px 20px', borderTop: '1px solid #e2e8f0', zIndex: 200 }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                            <i className="fas fa-user-tie"></i>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem' }}>{portfolio.agent?.fullName}</p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Your Dedicated Advisor</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <a href={`tel:${portfolio.agent?.mobile}`} style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                            <i className="fas fa-phone"></i>
                        </a>
                        <a href={`https://wa.me/91${portfolio.agent?.mobile}`} style={{ height: '44px', padding: '0 20px', borderRadius: '12px', background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontWeight: 700, gap: '8px' }}>
                            <i className="fab fa-whatsapp"></i> Chat
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicPortfolioPage;
