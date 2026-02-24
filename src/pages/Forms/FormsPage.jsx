import React, { useState } from 'react';
import AddContactModal from '../../components/AddContactModal';
import ComposeEmailModal from '../Communication/components/ComposeEmailModal';
import CreateActivityModal from '../../components/CreateActivityModal';
import SendMessageModal from '../../components/SendMessageModal';
import CallModal from '../../components/CallModal';
import CreateCampaignModal from '../../components/CreateCampaignModal';

const FormsPage = () => {
    const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
    const [isSendMailOpen, setIsSendMailOpen] = useState(false);
    const [isCreateActivityModalOpen, setIsCreateActivityModalOpen] = useState(false);
    const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);
    const [isCreateOnlineCampaignOpen, setIsCreateOnlineCampaignOpen] = useState(false);
    const [isCreateOfflineCampaignOpen, setIsCreateOfflineCampaignOpen] = useState(false);
    const [isCreateOrganicCampaignOpen, setIsCreateOrganicCampaignOpen] = useState(false);

    const handleAddContact = (contactData) => {
        console.log('New contact:', contactData);
        alert('Contact added successfully!');
        setIsAddContactModalOpen(false);
    };

    const formsList = [
        // Contact & Communication Forms
        { id: 'add-contact', label: 'Add Contact', icon: 'fa-user-plus', description: 'Create a new contact with detailed information', category: 'Contact Management' },
        { id: 'create-activity', label: 'Create Activity', icon: 'fa-calendar-plus', description: 'Schedule a call, meeting, or task', category: 'Contact Management' },
        { id: 'call-contact', label: 'Call Contact', icon: 'fa-phone-alt', description: 'Initiate GSM or IVR call', category: 'Contact Management' },
        { id: 'send-message', label: 'Send Message', icon: 'fa-comment-alt', description: 'Send SMS, WhatsApp, or RCS to contacts', category: 'Contact Management' },
        { id: 'send-email', label: 'Send Email', icon: 'fa-envelope', description: 'Compose and send emails to contacts', category: 'Contact Management' },

        // Marketing Campaign Forms
        { id: 'create-online-campaign', label: 'Create Online Campaign', icon: 'fa-globe', description: 'Launch Google Ads, Facebook, Instagram, LinkedIn campaigns', category: 'Marketing Campaigns' },
        { id: 'create-offline-campaign', label: 'Create Offline Campaign', icon: 'fa-bullhorn', description: 'Setup exhibitions, hoardings, print ads, TV/Radio campaigns', category: 'Marketing Campaigns' },
        { id: 'create-organic-campaign', label: 'Create Organic Campaign', icon: 'fa-seedling', description: 'Track SEO, content marketing, social media organic reach', category: 'Marketing Campaigns' },

        // Data Entry Forms
        { id: 'add-user', label: 'Add User', icon: 'fa-user-shield', description: 'Add a new user to the system', category: 'System Management' },
        { id: 'add-lead', label: 'Add Lead', icon: 'fa-filter', description: 'Create a new lead entry', category: 'Sales Pipeline' },
        { id: 'add-deal', label: 'Add Deal', icon: 'fa-handshake', description: 'Create a new deal', category: 'Sales Pipeline' },
        { id: 'add-property', label: 'Add Property', icon: 'fa-building', description: 'Add a new property to inventory', category: 'Inventory' }
    ];
    return (
        <>
            <section id="formsHubView" className="view-section active" style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', height: '100%', flex: 1 }}>
                {/* Sidebar */}
                <div className="profile-side-nav" style={{ width: '240px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', height: '100%', overflowY: 'auto', padding: '24px 0', flexShrink: 0 }}>
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ padding: '0 24px 8px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MANAGEMENT</div>
                        <div className="nav-items-group">
                            {formsList.map(form => (
                                <div
                                    key={form.id}
                                    onClick={() => {
                                        if (form.id === 'add-contact') setIsAddContactModalOpen(true);
                                        else if (form.id === 'send-email') setIsSendMailOpen(true);
                                        else if (form.id === 'create-activity') setIsCreateActivityModalOpen(true);
                                        else if (form.id === 'call-contact') setIsCallModalOpen(true);
                                        else if (form.id === 'send-message') setIsSendMessageOpen(true);
                                        else if (form.id === 'create-online-campaign') setIsCreateOnlineCampaignOpen(true);
                                        else if (form.id === 'create-offline-campaign') setIsCreateOfflineCampaignOpen(true);
                                        else if (form.id === 'create-organic-campaign') setIsCreateOrganicCampaignOpen(true);
                                    }}
                                    style={{
                                        padding: '8px 24px',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        color: '#64748b',
                                        background: 'transparent',
                                        cursor: ['add-contact', 'send-email', 'create-activity', 'call-contact', 'send-message', 'create-online-campaign', 'create-offline-campaign', 'create-organic-campaign'].includes(form.id) ? 'pointer' : 'default',
                                        borderLeft: '4px solid transparent',
                                        transition: 'all 0.2s',
                                        opacity: ['add-contact', 'send-email', 'create-activity', 'call-contact', 'send-message', 'create-online-campaign', 'create-offline-campaign', 'create-organic-campaign'].includes(form.id) ? 1 : 0.6
                                    }}
                                >
                                    {form.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '32px 40px 0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>FORMS</div>
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Forms Management</h1>
                        </div>
                    </div>

                    {/* Forms Grid */}
                    <div style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '24px'
                        }}>
                            {formsList.map(form => {
                                const isClickable = ['add-contact', 'send-email', 'create-activity', 'call-contact', 'send-message', 'create-online-campaign', 'create-offline-campaign', 'create-organic-campaign'].includes(form.id);
                                return (
                                    <div
                                        key={form.id}
                                        onClick={() => {
                                            if (form.id === 'add-contact') setIsAddContactModalOpen(true);
                                            else if (form.id === 'send-email') setIsSendMailOpen(true);
                                            else if (form.id === 'create-activity') setIsCreateActivityModalOpen(true);
                                            else if (form.id === 'call-contact') setIsCallModalOpen(true);
                                            else if (form.id === 'send-message') setIsSendMessageOpen(true);
                                            else if (form.id === 'create-online-campaign') setIsCreateOnlineCampaignOpen(true);
                                            else if (form.id === 'create-offline-campaign') setIsCreateOfflineCampaignOpen(true);
                                            else if (form.id === 'create-organic-campaign') setIsCreateOrganicCampaignOpen(true);
                                        }}
                                        style={{
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            padding: '24px',
                                            cursor: isClickable ? 'pointer' : 'default',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                            opacity: isClickable ? 1 : 0.6
                                        }}
                                        onMouseEnter={(e) => {
                                            if (isClickable) {
                                                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.borderColor = 'var(--primary-color)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                        }}
                                    >
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '12px',
                                            background: 'var(--primary-color)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginBottom: '16px'
                                        }}>
                                            <i className={`fas ${form.icon}`} style={{ fontSize: '1.2rem', color: '#fff' }}></i>
                                        </div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>{form.label}</h3>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4', marginBottom: '12px' }}>{form.description}</p>
                                        {!isClickable && (
                                            <div style={{
                                                display: 'inline-block',
                                                background: '#f1f5f9',
                                                color: '#475569',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                textTransform: 'uppercase'
                                            }}>
                                                Coming Soon
                                            </div>
                                        )}
                                        {isClickable && (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                color: 'var(--primary-color)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600
                                            }}>
                                                Open Form <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Info Section */}
                        <div style={{
                            marginTop: '40px',
                            padding: '24px',
                            background: '#f8fafc',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                                <i className="fas fa-info-circle" style={{ color: 'var(--primary-color)', marginRight: '8px' }}></i>
                                About Forms
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.6' }}>
                                Forms allow you to create and manage different types of data entries in your CRM. Each form is designed to capture specific information relevant to its category. Click on any available form card to open and start entering data.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Add Contact Modal */}
            <AddContactModal
                isOpen={isAddContactModalOpen}
                onClose={() => setIsAddContactModalOpen(false)}
                onAdd={handleAddContact}
            />

            {/* Compose Email Modal */}
            <ComposeEmailModal
                isOpen={isSendMailOpen}
                onClose={() => setIsSendMailOpen(false)}
            />

            {/* Create Activity Modal */}
            <CreateActivityModal
                isOpen={isCreateActivityModalOpen}
                onClose={() => setIsCreateActivityModalOpen(false)}
                onSave={(data) => {
                    console.log('Activity Created:', data);
                    alert('Activity Created Successfully!');
                }}
            />

            {/* Send Message Modal */}
            <SendMessageModal
                isOpen={isSendMessageOpen}
                onClose={() => setIsSendMessageOpen(false)}
                onSend={(data) => {
                    console.log('Message Sent:', data);
                    alert(`${data.channel} campaign sent successfully!`);
                }}
            />

            {/* Call Modal */}
            <CallModal
                isOpen={isCallModalOpen}
                onClose={() => setIsCallModalOpen(false)}
                contact={{ name: 'Demo Contact', mobile: '9876543210' }} // Mock contact for forms page demo
                onCallEnd={(data) => {
                    console.log('Call Ended:', data);
                    // In a real app, this would refresh the activity list
                }}
            />

            {/* Create Online Campaign Modal */}
            <CreateCampaignModal
                isOpen={isCreateOnlineCampaignOpen}
                onClose={() => setIsCreateOnlineCampaignOpen(false)}
                campaignType="online"
                onSave={(data) => {
                    console.log('Online Campaign Created:', data);
                    alert(`${data.platform} campaign "${data.name}" created successfully! Budget: ₹${parseInt(data.budgetPlanned).toLocaleString('en-IN')}`);
                    setIsCreateOnlineCampaignOpen(false);
                }}
            />

            {/* Create Offline Campaign Modal */}
            <CreateCampaignModal
                isOpen={isCreateOfflineCampaignOpen}
                onClose={() => setIsCreateOfflineCampaignOpen(false)}
                campaignType="offline"
                onSave={(data) => {
                    console.log('Offline Campaign Created:', data);
                    alert(`${data.platform} campaign "${data.name}" created successfully! Budget: ₹${parseInt(data.budgetPlanned).toLocaleString('en-IN')}`);
                    setIsCreateOfflineCampaignOpen(false);
                }}
            />

            {/* Create Organic Campaign Modal */}
            <CreateCampaignModal
                isOpen={isCreateOrganicCampaignOpen}
                onClose={() => setIsCreateOrganicCampaignOpen(false)}
                campaignType="organic"
                onSave={(data) => {
                    console.log('Organic Campaign Created:', data);
                    alert(`${data.platform} campaign "${data.name}" created successfully! Goal: ${data.goalLeads} leads`);
                    setIsCreateOrganicCampaignOpen(false);
                }}
            />
        </>
    );
};

export default FormsPage;
