import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './MatchBrochure.css';
import { renderValue, resolveLookup } from '../../../utils/helper';
import { numberToIndianWords } from '../../../utils/numberToWords';

const MatchBrochure = ({ token }) => {
    const [matchData, setMatchData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchMatchData = async () => {
            try {
                // Public endpoints might be served under a different baseUrl, 
                // but usually axios will prepend the current origin if not specified
                // Assuming standard CRM API path
                const res = await axios.get(`/api/public/matches/${token}`);
                if (res.data.success) {
                    setMatchData(res.data.data);
                } else {
                    setError('Match not found');
                }
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.message || 'Failed to load match data');
            } finally {
                setLoading(false);
            }
        };
        fetchMatchData();
    }, [token]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#fff' }}>
                <i className="fas fa-circle-notch fa-spin fa-3x" style={{ color: '#38bdf8' }}></i>
            </div>
        );
    }

    if (error || !matchData) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#fff' }}>
                <i className="fas fa-exclamation-triangle fa-4x" style={{ color: '#f43f5e', marginBottom: '20px' }}></i>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Oops! Link Expired or Invalid</h2>
                <p style={{ color: '#94a3b8', marginTop: '10px' }}>{error}</p>
            </div>
        );
    }

    const { leadId, dealIds, createdBy } = matchData;
    
    // Formatting helper for size
    const formatSize = (item) => {
        let sz = 'Standard Size';
        if (item.sizeConfig?.lookup_value || item.sizeConfig?.name || item.sizeConfig?.label) {
            sz = item.sizeConfig.lookup_value || item.sizeConfig.name || item.sizeConfig.label;
        } else if (typeof item.sizeConfig === 'string') {
            sz = item.sizeConfig;
        } else if (item.size?.value) {
            sz = `${item.size.value} ${item.size.unit || ''}`.trim();
        } else if (item.size && typeof item.size === 'string') {
            sz = item.size;
        }
        return sz;
    };

    return (
        <div className="match-brochure-container">
            <header className="match-header">
                <div className="match-greeting">Handpicked For You</div>
                <h1 className="match-title">
                    {leadId?.firstName ? `Hi ${leadId.firstName},` : 'Welcome,'}
                </h1>
                <p className="match-subtitle">
                    Based on your requirements, we've carefully selected the following premium properties that match your criteria. 
                    Take a look and let us know which ones catch your eye!
                </p>
            </header>

            <main className="properties-grid">
                {dealIds.map((deal, index) => (
                    <div className="property-card" key={deal._id || index}>
                        <div className="property-image-container">
                            {deal.images && deal.images.length > 0 ? (
                                <img src={deal.images[0].url} alt="Property" className="property-image" />
                            ) : (
                                <div className="no-image">
                                    <i className="fas fa-image fa-3x" style={{ marginBottom: '10px', opacity: 0.5 }}></i>
                                    <span>No Image Available</span>
                                </div>
                            )}
                            <div className="property-price-tag">
                                ₹{renderValue(deal.price)}
                            </div>
                        </div>

                        <div className="property-details">
                            <div className="property-location">
                                <i className="fas fa-map-marker-alt"></i> 
                                {renderValue(deal.address?.locality?.name || deal.address?.locality?.lookup_value || deal.address?.area || deal.location || 'Location Not Specified')}
                            </div>
                            
                            <h3 className="property-name">{deal.projectName || deal.title || 'Premium Listing'}</h3>
                            
                            <div className="property-specs">
                                <div className="spec-item">
                                    <i className="fas fa-building spec-icon"></i>
                                    {renderValue(deal.subCategory?.name || deal.subCategory?.lookup_value || deal.propertyType || deal.type || 'Property')}
                                </div>
                                <div className="spec-item">
                                    <i className="fas fa-ruler-combined spec-icon"></i>
                                    {formatSize(deal)}
                                </div>
                                {(deal.bhk || deal.bedrooms) && (
                                    <div className="spec-item">
                                        <i className="fas fa-bed spec-icon"></i>
                                        {deal.bhk || deal.bedrooms} BHK
                                    </div>
                                )}
                            </div>
                            
                            <div className="property-desc">
                                {deal.description ? (
                                    deal.description.length > 120 ? deal.description.substring(0, 120) + '...' : deal.description
                                ) : (
                                    'A stunning property matching your precise requirements. Contact us for detailed floor plans and more pictures.'
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </main>

            {createdBy && (
                <div className="agent-branding">
                    <div className="agent-info">
                        <div className="agent-avatar">
                            {createdBy.profileImage ? (
                                <img src={createdBy.profileImage} alt="Agent" />
                            ) : (
                                (createdBy.firstName?.charAt(0) || 'A') + (createdBy.lastName?.charAt(0) || '')
                            )}
                        </div>
                        <div className="agent-text">
                            <h4>{createdBy.firstName} {createdBy.lastName}</h4>
                            <p>Senior Property Consultant</p>
                        </div>
                    </div>
                    
                    <a href={`https://wa.me/${(createdBy.mobile || createdBy.phone || '').replace(/[^0-9]/g, '')}?text=Hi ${createdBy.firstName}, I checked the property matches you sent me and I'm interested.`} 
                       target="_blank" rel="noreferrer" className="contact-btn">
                        <i className="fab fa-whatsapp" style={{ fontSize: '1.2rem' }}></i>
                        Discuss Matches
                    </a>
                </div>
            )}
        </div>
    );
};

export default MatchBrochure;
