import React, { useState } from 'react';

const CreateCampaignModal = ({ isOpen, onClose, campaignType = 'online', onSave }) => {
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        platform: campaignType === 'online' ? 'Google Ads' : campaignType === 'offline' ? 'Exhibition' : 'SEO',
        status: 'Planning',

        // Budget & Goals
        budgetPlanned: '',
        budgetPeriod: 'monthly',
        goalLeads: '',
        goalRevenue: '',

        // Property Targeting
        propertyType: 'Plot',
        budgetRange: '₹50L-₹1Cr',
        sector: 'Sector 17',

        // Campaign Specific (Online)
        targetAudience: '',
        adCopy: '',
        landingPageURL: '',

        // Campaign Specific (Offline)
        location: '',
        duration: '',
        contactNumber: '',

        // Campaign Specific (Organic)
        contentType: '',
        keywords: '',
        targetURL: ''
    });

    const getTitle = () => {
        if (campaignType === 'online') return 'Create Online Campaign';
        if (campaignType === 'offline') return 'Create Offline Campaign';
        return 'Create Organic Campaign';
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
        // Reset form
        setFormData({
            name: '',
            platform: campaignType === 'online' ? 'Google Ads' : campaignType === 'offline' ? 'Exhibition' : 'SEO',
            status: 'Planning',
            budgetPlanned: '',
            budgetPeriod: 'monthly',
            goalLeads: '',
            goalRevenue: '',
            propertyType: 'Plot',
            budgetRange: '₹50L-₹ 1Cr',
            sector: 'Sector 17',
            targetAudience: '',
            adCopy: '',
            landingPageURL: '',
            location: '',
            duration: '',
            contactNumber: '',
            contentType: '',
            keywords: '',
            targetURL: ''
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
        }}>
            <div style={{
                background: '#fff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 32px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #1273eb 0%, #0d5bb9 100%)'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>
                            {getTitle()}
                        </h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.9)' }}>
                            {campaignType === 'online' && 'Launch digital advertising campaigns'}
                            {campaignType === 'offline' && 'Setup traditional marketing campaigns'}
                            {campaignType === 'organic' && 'Track organic marketing efforts'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            color: '#fff',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        ×
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
                    {/* Basic Information Section */}
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            📋 Basic Information
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Campaign Name *
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g., Google Ads - Sector 17 Plots"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#1273eb'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Platform/Channel *
                                </label>
                                <select
                                    name="platform"
                                    value={formData.platform}
                                    onChange={handleChange}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        background: '#fff'
                                    }}
                                >
                                    {campaignType === 'online' && (
                                        <>
                                            <option value="Google Ads">Google Ads</option>
                                            <option value="Facebook">Facebook</option>
                                            <option value="Instagram">Instagram</option>
                                            <option value="LinkedIn">LinkedIn</option>
                                            <option value="YouTube">YouTube</option>
                                        </>
                                    )}
                                    {campaignType === 'offline' && (
                                        <>
                                            <option value="Exhibition">Exhibition/Property Expo</option>
                                            <option value="Hoarding">Hoarding/Billboard</option>
                                            <option value="Print">Print (Newspaper/Magazine)</option>
                                            <option value="TV">TV Commercial</option>
                                            <option value="Radio">Radio</option>
                                            <option value="SMS Blast">SMS Blast</option>
                                        </>
                                    )}
                                    {campaignType === 'organic' && (
                                        <>
                                            <option value="SEO">SEO (Search Engine)</option>
                                            <option value="Content Marketing">Content Marketing</option>
                                            <option value="Social Media">Social Media Organic</option>
                                            <option value="Referral">Referral Program</option>
                                            <option value="Email Marketing">Email Marketing</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Status
                                </label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        background: '#fff'
                                    }}
                                >
                                    <option value="Planning">Planning</option>
                                    <option value="Running">Running</option>
                                    <option value="Paused">Paused</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Property Type
                                </label>
                                <select
                                    name="propertyType"
                                    value={formData.propertyType}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        background: '#fff'
                                    }}
                                >
                                    <option value="Plot">Plot/Land</option>
                                    <option value="Flat">Flat/Apartment</option>
                                    <option value="Commercial">Commercial</option>
                                    <option value="Villa">Independent Villa</option>
                                    <option value="Mixed">Mixed Property Types</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Budget & Goals Section */}
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            💰 Budget & Goals
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Budget (₹) *
                                </label>
                                <input
                                    type="number"
                                    name="budgetPlanned"
                                    value={formData.budgetPlanned}
                                    onChange={handleChange}
                                    required
                                    placeholder="50000"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Period
                                </label>
                                <select
                                    name="budgetPeriod"
                                    value={formData.budgetPeriod}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        background: '#fff'
                                    }}
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="one-time">One-time</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Goal Leads
                                </label>
                                <input
                                    type="number"
                                    name="goalLeads"
                                    value={formData.goalLeads}
                                    onChange={handleChange}
                                    placeholder="100"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Goal Revenue (₹)
                                </label>
                                <input
                                    type="number"
                                    name="goalRevenue"
                                    value={formData.goalRevenue}
                                    onChange={handleChange}
                                    placeholder="2500000"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Real Estate Targeting */}
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            🏠 Real Estate Targeting
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Budget Range
                                </label>
                                <select
                                    name="budgetRange"
                                    value={formData.budgetRange}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        background: '#fff'
                                    }}
                                >
                                    <option value="₹20L-₹30L">₹20L-₹30L</option>
                                    <option value="₹30L-₹50L">₹30L-₹50L</option>
                                    <option value="₹50L-₹1Cr">₹50L-₹1Cr</option>
                                    <option value="₹1Cr-₹2Cr">₹1Cr-₹2Cr</option>
                                    <option value="₹2Cr+">₹2Cr+</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                    Target Sector/Area
                                </label>
                                <input
                                    type="text"
                                    name="sector"
                                    value={formData.sector}
                                    onChange={handleChange}
                                    placeholder="Sector 17, Urban Estate"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Campaign Specific Fields - Online */}
                    {campaignType === 'online' && (
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                🌐 Online Campaign Details
                            </h3>

                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Target Audience
                                    </label>
                                    <input
                                        type="text"
                                        name="targetAudience"
                                        value={formData.targetAudience}
                                        onChange={handleChange}
                                        placeholder="Age 30-45, Income 10L+, First-time buyers"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Ad Copy/Message
                                    </label>
                                    <textarea
                                        name="adCopy"
                                        value={formData.adCopy}
                                        onChange={handleChange}
                                        placeholder="Write your ad copy here..."
                                        rows={3}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Landing Page URL
                                    </label>
                                    <input
                                        type="url"
                                        name="landingPageURL"
                                        value={formData.landingPageURL}
                                        onChange={handleChange}
                                        placeholder="https://bharatproperties.com/sector-17"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Campaign Specific Fields - Offline */}
                    {campaignType === 'offline' && (
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                📍 Offline Campaign Details
                            </h3>

                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Location/Venue
                                    </label>
                                    <input
                                        type="text"
                                        name="location"
                                        value={formData.location}
                                        onChange={handleChange}
                                        placeholder="DLF Cyber Hub, Gurgaon"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Duration
                                    </label>
                                    <input
                                        type="text"
                                        name="duration"
                                        value={formData.duration}
                                        onChange={handleChange}
                                        placeholder="15th-17th March 2025"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Contact Number for Tracking
                                    </label>
                                    <input
                                        type="tel"
                                        name="contactNumber"
                                        value={formData.contactNumber}
                                        onChange={handleChange}
                                        placeholder="1800-XXX-XXXX"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Campaign Specific Fields - Organic */}
                    {campaignType === 'organic' && (
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                🌱 Organic Campaign Details
                            </h3>

                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Content Type
                                    </label>
                                    <select
                                        name="contentType"
                                        value={formData.contentType}
                                        onChange={handleChange}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            background: '#fff'
                                        }}
                                    >
                                        <option value="">Select Type</option>
                                        <option value="Blog Post">Blog Post</option>
                                        <option value="Video">Video</option>
                                        <option value="Infographic">Infographic</option>
                                        <option value="Social Media Post">Social Media Post</option>
                                        <option value="Email Newsletter">Email Newsletter</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Target Keywords (comma separated)
                                    </label>
                                    <input
                                        type="text"
                                        name="keywords"
                                        value={formData.keywords}
                                        onChange={handleChange}
                                        placeholder="plots in sector 17, residential land gurgaon"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                        Target URL
                                    </label>
                                    <input
                                        type="url"
                                        name="targetURL"
                                        value={formData.targetURL}
                                        onChange={handleChange}
                                        placeholder="https://bharatproperties.com/blog/sector-17-guide"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '10px 24px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                color: '#64748b',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: '10px 32px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #1273eb 0%, #0d5bb9 100%)',
                                color: '#fff',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 12px rgba(18,115,235,0.3)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            Create Campaign
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateCampaignModal;
