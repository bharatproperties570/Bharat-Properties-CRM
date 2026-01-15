import React, { useState } from 'react';
import './WizardPreview.css';

function WizardView({ onBack }) {
    const [step, setStep] = useState(1);
    const [campaignType, setCampaignType] = useState('sms');

    // Preview States
    const [formData, setFormData] = useState({
        name: '',
        category: 'ONLINE CAMPAIGN',
        desc: '',
        // Channel specific
        smsText: '',
        emailSubject: '',
        emailText: '',
        whatsappText: '',
        rcsTitle: '',
        rcsText: '',
        // Meta
        metaHeadline: '',
        metaText: '',
        // Google
        googleHeadline: '',
        googleDesc: '',
        // LinkedIn
        linkedInBio: '',
        // X
        xText: '',
        // Launch Refined
        launchMethod: 'now', // 'now' | 'schedule'
        scheduleDate: '',
        scheduleTime: ''
    });

    const updateFormData = (key, val) => {
        setFormData(prev => ({ ...prev, [key]: val }));
    };

    const nextStep = () => {
        if (step < 4) setStep(step + 1);
        else {
            if (formData.launchMethod === 'schedule') {
                if (!formData.scheduleDate || !formData.scheduleTime) {
                    alert("Please select both date and time for scheduling.");
                    return;
                }
                alert(`Campaign Scheduled for ${formData.scheduleDate} at ${formData.scheduleTime}`);
            } else {
                alert("Campaign Launched Successfully!");
            }
            onBack();
        }
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
        else onBack();
    };

    return (
        <section id="wizardView" className="view-section active">
            <div className="page-header wizard-header">
                <div className="page-title-group">
                    <i className="fas fa-chevron-left back-btn" onClick={onBack} style={{ cursor: 'pointer' }}></i>
                    <h1>CREATE CAMPAIGN</h1>
                </div>
            </div>

            <div className="wizard-container">
                {/* Stepper */}
                <div className="wizard-stepper">
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className={`step ${step === s ? 'active' : ''}`}>
                            <div className="step-circle">{s}</div>
                            <div className="step-label">{s === 1 ? 'Setup' : s === 2 ? 'Select List' : s === 3 ? 'Template' : 'Review'}</div>
                        </div>
                    ))}
                </div>

                <div className="wizard-layout-grid">
                    <div className="wizard-main-content">
                        <div className="wizard-content">
                            {/* Steps Content */}
                            {step === 1 && <Step1Setup campaignType={campaignType} setCampaignType={setCampaignType} formData={formData} updateFormData={updateFormData} />}
                            {step === 2 && <Step2Audience />}
                            {step === 3 && <Step3Template type={campaignType} formData={formData} updateFormData={updateFormData} />}
                            {step === 4 && <Step4Review formData={formData} updateFormData={updateFormData} />}
                        </div>
                    </div>

                    {/* Preview Sidebar */}
                    <div className="wizard-sidebar-preview">
                        <WizardPreview type={campaignType} formData={formData} />
                    </div>
                </div>

                <div className="wizard-actions">
                    <button className="btn-secondary" onClick={prevStep}>Back</button>
                    <div className="progress-wrapper">
                        <div className="progress-info">COMPLETED <span>{step * 25}%</span></div>
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${step * 25}%` }}></div>
                        </div>
                    </div>
                    <button className="btn-primary" onClick={nextStep}>{step === 4 ? 'Launch' : 'Next'}</button>
                </div>
            </div>
        </section>
    );
}

function Step1Setup({ campaignType, setCampaignType, formData, updateFormData }) {
    return (
        <div className="wizard-step active">
            <h3>Campaign Setup</h3>
            <div className="section-title">General Information</div>
            <div className="form-row">
                <div className="form-group flex-1">
                    <label>Campaign Name*</label>
                    <input
                        type="text"
                        placeholder="e.g. Summer Launch 2024"
                        value={formData.name}
                        onChange={(e) => updateFormData('name', e.target.value)}
                    />
                </div>
                <div className="form-group flex-1">
                    <label>Campaign Type</label>
                    <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)}>
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="rcs">RCS</option>
                        <option value="meta">Meta Ads (FB/Insta)</option>
                        <option value="google">Google Ads</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="x">X (Twitter)</option>
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label>Campaign Category</label>
                <select value={formData.category} onChange={(e) => updateFormData('category', e.target.value)}>
                    <option value="OFFLINE CAMPAIGN">OFFLINE CAMPAIGN</option>
                    <option value="ONLINE CAMPAIGN">ONLINE CAMPAIGN</option>
                    <option value="ORGANIC CAMPAIGN">ORGANIC CAMPAIGN</option>
                </select>
            </div>

            <div className="section-title">Campaign Settings</div>
            <div className="form-group">
                <label>Description / Internal Note</label>
                <textarea
                    placeholder="Write a brief description..."
                    style={{ minHeight: '80px' }}
                    value={formData.desc}
                    onChange={(e) => updateFormData('desc', e.target.value)}
                ></textarea>
            </div>

            <div style={{ background: '#fff9f0', padding: '1rem', borderRadius: '8px', border: '1px solid #ffeeba', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <i className="fas fa-info-circle" style={{ color: '#856404', marginTop: '3px' }}></i>
                <div style={{ fontSize: '0.8rem', color: '#856404', lineHeight: '1.4' }}>
                    <strong>Pro Tip:</strong> Using a clear naming convention pomaga helps you track performance more easily in the dashboard.
                </div>
            </div>
        </div>
    );
}

function Step2Audience() {
    return (
        <div className="wizard-step active">
            <h3>Select Audience</h3>
            <div className="filter-grid">
                <div className="filter-item"><label>Addition</label><select><option>Contact</option></select></div>
                <div className="filter-item"><label>City</label><select><option>Select City</option></select></div>
                <div className="filter-item"><label>Project Attention</label><select><option>Select Project</option></select></div>
                <div className="filter-item"><label>Sales Agent</label><select><option>Select Agent</option></select></div>
                <div className="filter-item"><label>Source</label><select><option>Select Source</option></select></div>
                <div className="filter-item"><label>Stage</label><select><option>Select Stage</option></select></div>
                <div className="filter-item"><label>Category</label><select><option>Project</option></select></div>
            </div>
            <div className="mini-table-container">
                <table className="mini-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" /></th>
                            <th>Details</th>
                            <th>Sales Agent</th>
                            <th>Co-Owners</th>
                            <th>Project</th>
                            <th>Lead Status</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No contacts found in selected criteria.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Step3Template({ type, formData, updateFormData }) {
    return (
        <div className="wizard-step active">
            <h3>Message Content ({type.toUpperCase()})</h3>

            {/* SMS Editor */}
            {type === 'sms' && (
                <div id="smsEditor">
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Sender ID</label>
                            <select id="smsSenderId">
                                <option>BHARATPROP</option>
                                <option>BP_REALTY</option>
                            </select>
                        </div>
                        <div className="form-group flex-1">
                            <label>Validity</label>
                            <input type="date" id="smsValidity" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Choose SMS Template</label>
                        <select id="smsTemplateSelect">
                            <option value="">Select Template...</option>
                            <option>New Property Launch</option>
                            <option>Monthly Newsletter</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                            <label style={{ marginBottom: '0px' }}>Message Content</label>
                            <div className="editor-helper-bar" style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-xs-outline"><i className="fas fa-smile"></i> Emoji</button>
                                <button className="btn-xs-outline"><i className="fas fa-user-tag"></i> {"{Name}"}</button>
                            </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <textarea
                                id="smsText"
                                className="rich-textarea"
                                placeholder="Type your SMS here..."
                                style={{ minHeight: '120px' }}
                                value={formData.smsText}
                                onChange={(e) => updateFormData('smsText', e.target.value)}
                            ></textarea>
                            <div className="char-counter" style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '0.7rem', color: '#94a3b8' }}>
                                {formData.smsText.length} / 160
                            </div>
                        </div>
                    </div>
                    <div className="form-group checkbox-group">
                        <input type="checkbox" id="addOptOut" defaultChecked />
                        <label htmlFor="addOptOut" style={{ display: 'inline', marginLeft: '8px', textTransform: 'none' }}>Include Opt-out instructions (STOP to unsub)</label>
                    </div>
                </div>
            )}

            {/* Email Editor */}
            {type === 'email' && (
                <div id="emailEditor">
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>From Name</label>
                            <input type="text" placeholder="Bharat Properties" />
                        </div>
                        <div className="form-group flex-1">
                            <label>From Email</label>
                            <select>
                                <option>info@bharatproperties.com</option>
                                <option>marketing@bharatproperties.com</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Subject Line</label>
                        <input
                            type="text"
                            placeholder="Enticing subject line..."
                            value={formData.emailSubject}
                            onChange={(e) => updateFormData('emailSubject', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Preheader Text (Snippet)</label>
                        <input type="text" placeholder="Short summary for inbox preview..." />
                    </div>
                    <div className="rich-editor-container">
                        <div className="rich-editor-toolbar">
                            <button><i className="fas fa-bold"></i></button>
                            <button><i className="fas fa-italic"></i></button>
                            <button><i className="fas fa-underline"></i></button>
                            <span className="toolbar-sep"></span>
                            <button><i className="fas fa-link"></i></button>
                            <button><i className="fas fa-image"></i></button>
                        </div>
                        <textarea
                            className="rich-textarea"
                            style={{ height: '200px', borderTop: 'none' }}
                            placeholder="Start designing your email..."
                            value={formData.emailText}
                            onChange={(e) => updateFormData('emailText', e.target.value)}
                        ></textarea>
                    </div>
                </div>
            )}

            {/* WhatsApp Editor */}
            {type === 'whatsapp' && (
                <div id="whatsappEditor">
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Category</label>
                            <select>
                                <option>Marketing</option>
                                <option>Utility / Alerts</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group flex-1">
                        <label>Media Header</label>
                        <select>
                            <option>None</option>
                            <option>Image</option>
                            <option>Video</option>
                            <option>Document</option>
                        </select>
                        <div className="media-dropzone" style={{ marginTop: '10px', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer' }}>
                            <div style={{ fontSize: '1.5rem', color: '#94a3b8', marginBottom: '8px' }}><i className="fas fa-cloud-upload-alt"></i></div>
                            <div style={{ fontWeight: 600, color: '#475569', fontSize: '0.8rem' }}>Click to upload media</div>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Choose WhatsApp Template</label>
                        <select>
                            <option value="">Custom Message</option>
                            <option>New Offer Alert</option>
                            <option>Event Invitation</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <div className="editor-helper-bar" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <button className="btn-xs-outline"><i className="fas fa-smile"></i> Emoji</button>
                            <button className="btn-xs-outline"><i className="fas fa-user-tag"></i> {"{Name}"}</button>
                        </div>
                        <textarea
                            placeholder="Type your WhatsApp message..."
                            className="rich-textarea"
                            style={{ minHeight: '120px' }}
                            value={formData.whatsappText}
                            onChange={(e) => updateFormData('whatsappText', e.target.value)}
                        ></textarea>
                    </div>
                    <div className="form-group">
                        <label>Interactive Buttons</label>
                        <div className="button-config-row" style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Label (e.g. Call Now)" className="flex-1" />
                            <select className="flex-1">
                                <option>Quick Reply</option>
                                <option>Phone Number</option>
                                <option>URL Link</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* RCS Editor */}
            {type === 'rcs' && (
                <div id="rcsEditor">
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>RCS Template</label>
                            <select>
                                <option>Rich Card</option>
                                <option>Carousel</option>
                            </select>
                        </div>
                        <div className="form-group flex-1">
                            <label>Chip Suggestions</label>
                            <select>
                                <option>Location / Map</option>
                                <option>Calendar Event</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Rich Card Title</label>
                        <input
                            type="text"
                            placeholder="Headline for the rich card"
                            value={formData.rcsTitle}
                            onChange={(e) => updateFormData('rcsTitle', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Rich Card Description</label>
                        <textarea
                            placeholder="Enter description for the rich card..."
                            className="rich-textarea"
                            style={{ minHeight: '100px' }}
                            value={formData.rcsText}
                            onChange={(e) => updateFormData('rcsText', e.target.value)}
                        ></textarea>
                    </div>
                    <div className="form-group">
                        <label>Suggested Actions</label>
                        <div className="button-config-row" style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Action Label" className="flex-1" />
                            <select className="flex-1">
                                <option>Open URL</option>
                                <option>Dial Number</option>
                                <option>View Location</option>
                            </select>
                        </div>
                    </div>
                    <div className="media-dropzone" style={{ marginTop: '10px', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '1rem', textAlign: 'center', background: '#f8fafc' }}>
                        <div style={{ color: '#94a3b8' }}><i className="fas fa-image"></i> Add Card Image</div>
                    </div>
                </div>
            )}

            {/* Meta Ads Editor */}
            {type === 'meta' && (
                <div id="metaEditor">
                    <div className="form-group">
                        <label>Ad Objective</label>
                        <select>
                            <option>Lead Generation</option>
                            <option>Page Likes</option>
                            <option>Website Traffic</option>
                            <option>Message Inquiries</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Ad Headline</label>
                        <input
                            type="text"
                            placeholder="Headline (appears next to CRM)"
                            value={formData.metaHeadline}
                            onChange={(e) => updateFormData('metaHeadline', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Primary Text</label>
                        <textarea
                            placeholder="What this ad is about..."
                            className="rich-textarea"
                            style={{ minHeight: '100px' }}
                            value={formData.metaText}
                            onChange={(e) => updateFormData('metaText', e.target.value)}
                        ></textarea>
                    </div>
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Daily Budget (₹)</label>
                            <input type="number" placeholder="500" />
                        </div>
                        <div className="form-group flex-1">
                            <label>Call to Action</label>
                            <select>
                                <option>Learn More</option>
                                <option>Book Now</option>
                                <option>Contact Us</option>
                                <option>Download</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Google Ads Editor */}
            {type === 'google' && (
                <div id="googleEditor">
                    <div className="form-group">
                        <label>Ad Type</label>
                        <select>
                            <option>Search Ad</option>
                            <option>Display Ad</option>
                            <option>YouTube Ad</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Ad Headline</label>
                        <input
                            type="text"
                            placeholder="Headline 1"
                            value={formData.googleHeadline}
                            onChange={(e) => updateFormData('googleHeadline', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            placeholder="Ad description..."
                            className="rich-textarea"
                            style={{ minHeight: '100px' }}
                            value={formData.googleDesc}
                            onChange={(e) => updateFormData('googleDesc', e.target.value)}
                        ></textarea>
                    </div>
                    <div className="form-group">
                        <label>Target Keywords (Comma separated)</label>
                        <input type="text" placeholder="property, buy flat, luxury villa" />
                    </div>
                </div>
            )}

            {/* LinkedIn Ads Editor */}
            {type === 'linkedin' && (
                <div id="linkedInEditor">
                    <div className="form-group">
                        <label>Target Industry</label>
                        <select>
                            <option>Real Estate</option>
                            <option>Finance</option>
                            <option>Technology</option>
                            <option>Legal</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Professional Summary</label>
                        <textarea
                            placeholder="Professional bio or ad text..."
                            className="rich-textarea"
                            style={{ minHeight: '120px' }}
                            value={formData.linkedInBio}
                            onChange={(e) => updateFormData('linkedInBio', e.target.value)}
                        ></textarea>
                    </div>
                </div>
            )}

            {/* X Ads Editor */}
            {type === 'x' && (
                <div id="xEditor">
                    <div className="form-group">
                        <label>Tweet Text</label>
                        <textarea
                            placeholder="What's happening?"
                            className="rich-textarea"
                            style={{ minHeight: '120px' }}
                            value={formData.xText}
                            onChange={(e) => updateFormData('xText', e.target.value)}
                        ></textarea>
                        <div className="char-counter" style={{ textAlign: 'right', fontSize: '0.7rem', marginTop: '4px' }}>
                            {formData.xText.length} / 280
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Step4Review({ formData, updateFormData }) {
    return (
        <div className="wizard-step active">
            <div className="final-confirmation-slide">
                <i className="fas fa-check-circle" style={{ fontSize: '3rem', color: '#388E3C', marginBottom: '1rem' }}></i>
                <h3>All Set!</h3>
                <p>How would you like to launch this campaign?</p>

                <div className="launch-options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2rem', marginBottom: '2rem' }}>
                    <div
                        className={`launch-card ${formData.launchMethod === 'now' ? 'active' : ''}`}
                        onClick={() => updateFormData('launchMethod', 'now')}
                        style={{
                            padding: '1.5rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center',
                            background: formData.launchMethod === 'now' ? '#f0f9ff' : '#fff',
                            borderColor: formData.launchMethod === 'now' ? 'var(--primary-color)' : '#e2e8f0'
                        }}
                    >
                        <i className="fas fa-paper-plane" style={{ fontSize: '1.5rem', color: formData.launchMethod === 'now' ? 'var(--primary-color)' : '#94a3b8', marginBottom: '10px' }}></i>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: formData.launchMethod === 'now' ? 'var(--primary-color)' : '#475569' }}>SEND NOW</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Launch immediately</div>
                    </div>

                    <div
                        className={`launch-card ${formData.launchMethod === 'schedule' ? 'active' : ''}`}
                        onClick={() => updateFormData('launchMethod', 'schedule')}
                        style={{
                            padding: '1.5rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'center',
                            background: formData.launchMethod === 'schedule' ? '#f0f9ff' : '#fff',
                            borderColor: formData.launchMethod === 'schedule' ? 'var(--primary-color)' : '#e2e8f0'
                        }}
                    >
                        <i className="fas fa-calendar-alt" style={{ fontSize: '1.5rem', color: formData.launchMethod === 'schedule' ? 'var(--primary-color)' : '#94a3b8', marginBottom: '10px' }}></i>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: formData.launchMethod === 'schedule' ? 'var(--primary-color)' : '#475569' }}>SCHEDULE</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Pick a future date</div>
                    </div>
                </div>

                {formData.launchMethod === 'schedule' && (
                    <div className="form-group animation-fade-in" style={{ marginTop: '1rem', textAlign: 'left' }}>
                        <label>Select Date & Time</label>
                        <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="date"
                                className="flex-1"
                                value={formData.scheduleDate}
                                onChange={(e) => updateFormData('scheduleDate', e.target.value)}
                            />
                            <input
                                type="time"
                                className="flex-1"
                                value={formData.scheduleTime}
                                onChange={(e) => updateFormData('scheduleTime', e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const PhoneFrame = ({ children }) => (
    <div className="phone-mockup">
        <div className="status-bar">
            <div className="time">9:41</div>
            <div className="icons">
                <i className="fas fa-signal"></i>
                <i className="fas fa-wifi"></i>
                <i className="fas fa-battery-full"></i>
            </div>
        </div>
        <div className="phone-screen">
            {children}
        </div>
    </div>
);

const BrowserFrame = ({ children, url }) => (
    <div className="browser-mockup">
        <div className="browser-header">
            <div className="browser-dots">
                <div className="browser-dot dot-red"></div>
                <div className="browser-dot dot-yellow"></div>
                <div className="browser-dot dot-green"></div>
            </div>
            <div className="browser-address">{url}</div>
        </div>
        <div className="browser-content">
            {children}
        </div>
    </div>
);

function WizardPreview({ type, formData }) {
    if (type === 'sms') {
        return (
            <div className="preview-container">
                <div className="preview-label">SMS Message</div>
                <PhoneFrame>
                    <div className="sms-app">
                        <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#8e8e93', margin: '10px 0' }}>Today 9:41 AM</div>
                        <div className="sms-bubble sent">
                            {formData.smsText || 'Type your message to see a preview...'}
                        </div>
                    </div>
                </PhoneFrame>
            </div>
        );
    }

    if (type === 'whatsapp') {
        return (
            <div className="preview-container">
                <div className="preview-label">WhatsApp Business</div>
                <PhoneFrame>
                    <div className="wa-header">
                        <i className="fas fa-arrow-left"></i>
                        <div className="social-avatar" style={{ width: '32px', height: '32px', fontSize: '0.7rem' }}>BP</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Bharat Properties</div>
                            <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>online</div>
                        </div>
                        <i className="fas fa-video"></i>
                        <i className="fas fa-phone"></i>
                    </div>
                    <div className="wa-body">
                        <div className="wa-bubble sent">
                            {formData.whatsappText || 'WhatsApp message content...'}
                            <div style={{ textAlign: 'right', fontSize: '0.6rem', color: '#555', marginTop: '2px' }}>
                                9:41 AM <i className="fas fa-check-double" style={{ color: '#34b7f1' }}></i>
                            </div>
                        </div>
                    </div>
                </PhoneFrame>
            </div>
        );
    }

    if (type === 'email') {
        return (
            <div className="preview-container">
                <div className="preview-label">Newsletter Preview</div>
                <BrowserFrame url="mail.google.com">
                    <div className="email-mockup" style={{ border: 'none', boxShadow: 'none' }}>
                        <div className="email-header" style={{ background: '#fff' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#202124', marginBottom: '4px' }}>{formData.emailSubject || '(No Subject)'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="social-avatar" style={{ width: '32px', height: '32px', fontSize: '0.7rem' }}>BP</div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bharat Properties <span style={{ fontWeight: 400, color: '#5f6368' }}>&lt;marketing@bharatprop.com&gt;</span></div>
                                    <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>to me <i className="fas fa-caret-down"></i></div>
                                </div>
                            </div>
                        </div>
                        <div className="email-body" style={{ padding: '20px', background: '#fff', minHeight: '300px' }}>
                            {formData.emailText || 'Start typing your email content to see it presented here in a realistic layout...'}
                        </div>
                    </div>
                </BrowserFrame>
            </div>
        );
    }

    if (type === 'meta') {
        return (
            <div className="preview-container">
                <div className="preview-label">Facebook Sponsored ad</div>
                <div className="social-mockup meta">
                    <div className="social-header">
                        <div className="social-avatar">BP</div>
                        <div className="social-meta">
                            <div className="social-name">Bharat Properties <i className="fas fa-check-circle" style={{ color: '#1877f2', fontSize: '0.7rem' }}></i></div>
                            <div className="social-status">Sponsored · <i className="fas fa-globe-americas"></i></div>
                        </div>
                        <i className="fas fa-ellipsis-h" style={{ marginLeft: 'auto', color: '#65676b' }}></i>
                    </div>
                    <div className="social-content">{formData.metaText || 'Your ad copy will appear here...'}</div>
                    <div className="social-image-box">
                        <i className="fas fa-image" style={{ fontSize: '2rem' }}></i>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px', background: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #ddd' }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: '#65676b', textTransform: 'uppercase' }}>BHARATPROPERTIES.COM</div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{formData.metaHeadline || 'Headline goes here'}</div>
                            </div>
                            <button className="social-cta" style={{ background: '#e4e6eb', color: '#050505', borderRadius: '6px', padding: '6px 12px', fontWeight: 600, fontSize: '0.8rem' }}>Learn More</button>
                        </div>
                    </div>
                    <div className="social-action-bar">
                        <div className="action-item"><i className="far fa-thumbs-up"></i> Like</div>
                        <div className="action-item"><i className="far fa-comment"></i> Comment</div>
                        <div className="action-item"><i className="far fa-share-square"></i> Share</div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'google') {
        return (
            <div className="preview-container">
                <div className="preview-label">Google Search Result</div>
                <BrowserFrame url="google.com/search?q=luxury+real+estate">
                    <div style={{ padding: '20px', background: '#fff' }}>
                        <div style={{ fontSize: '0.85rem', color: '#202124', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 700 }}>Ad</span> · <span>https://www.bharatproperties.com</span> <i className="fas fa-caret-down"></i>
                        </div>
                        <div style={{ fontSize: '1.25rem', color: '#1a0dab', marginBottom: '4px', cursor: 'pointer', hover: { textDecoration: 'underline' } }}>
                            {formData.googleHeadline || 'Your Global Reach Starts Here | Luxury Properties'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#4d5156', lineHeight: '1.5' }}>
                            {formData.googleDesc || 'Expand your business with professional ad campaigns managed directly from your CRM. Targeted, efficient, and results-driven real estate marketing solutions.'}
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginTop: '12px' }}>
                            <div style={{ color: '#1a0dab', fontSize: '0.85rem', cursor: 'pointer' }}>Property Listings</div>
                            <div style={{ color: '#1a0dab', fontSize: '0.85rem', cursor: 'pointer' }}>Contact Sales</div>
                        </div>
                    </div>
                </BrowserFrame>
            </div>
        );
    }

    if (type === 'linkedin') {
        return (
            <div className="preview-container">
                <div className="preview-label">LinkedIn Promoted</div>
                <div className="social-mockup linkedin" style={{ border: '1px solid #e0e0e0' }}>
                    <div className="social-header">
                        <div className="social-avatar" style={{ borderRadius: '4px', background: '#004182', color: '#fff' }}>BP</div>
                        <div className="social-meta">
                            <div className="social-name">Bharat Properties <span style={{ fontWeight: 400, color: '#666', fontSize: '0.75rem' }}>· 1st</span></div>
                            <div className="social-status">Real Estate Professionals</div>
                            <div className="social-status">Promoted</div>
                        </div>
                        <i className="fas fa-ellipsis-h" style={{ marginLeft: 'auto', color: '#666' }}></i>
                    </div>
                    <div className="social-content">{formData.linkedInBio || 'Professional summary for LinkedIn ad campaign...'}</div>
                    <div className="social-image-box" style={{ background: '#e1e9ee' }}>
                        <i className="fas fa-building" style={{ fontSize: '2.5rem', opacity: 0.5 }}></i>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px', background: '#fff', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Luxury Real Estate Solutions</div>
                                <div style={{ fontSize: '0.7rem', color: '#666' }}>bharatproperties.com</div>
                            </div>
                            <button className="social-cta" style={{ borderRadius: '20px', color: '#0a66c2', border: '1px solid #0a66c2', padding: '4px 12px', background: 'transparent', fontWeight: 600 }}>Apply</button>
                        </div>
                    </div>
                    <div className="social-action-bar" style={{ justifyContent: 'flex-start', gap: '20px' }}>
                        <div className="action-item"><i className="far fa-thumbs-up"></i> Like</div>
                        <div className="action-item"><i className="far fa-comment-dots"></i> Comment</div>
                        <div className="action-item"><i className="fas fa-share"></i> Share</div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'rcs') {
        return (
            <div className="preview-container">
                <div className="preview-label">RCS Rich Business Message</div>
                <PhoneFrame>
                    <div className="sms-app" style={{ background: '#f0f2f5' }}>
                        <div className="rcs-card" style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', marginTop: '20px' }}>
                            <div className="social-image-box" style={{ height: '160px' }}>
                                <i className="fas fa-gem" style={{ fontSize: '3rem' }}></i>
                            </div>
                            <div style={{ padding: '16px' }}>
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#202124', marginBottom: '8px' }}>{formData.rcsTitle || 'Exclusive Offer for You'}</div>
                                <div style={{ fontSize: '0.85rem', color: '#5f6368', lineHeight: '1.5' }}>{formData.rcsText || 'This is how your rich business message will appear on a high-end Android device with full RCS support.'}</div>
                            </div>
                            <div style={{ padding: '12px', borderTop: '1px solid #f1f3f4' }}>
                                <button style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#f8f9fa', color: '#1a73e8', border: '1px solid #dadce0', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                                    Visit Website
                                </button>
                                <button style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#f8f9fa', color: '#1a73e8', border: '1px solid #dadce0', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginTop: '8px' }}>
                                    Call Now
                                </button>
                            </div>
                        </div>
                    </div>
                </PhoneFrame>
            </div>
        );
    }

    if (type === 'x') {
        return (
            <div className="preview-container">
                <div className="preview-label">X Ad (formerly Twitter)</div>
                <div className="social-mockup x" style={{ border: '1px solid #eff3f4' }}>
                    <div className="social-header">
                        <div className="social-avatar" style={{ background: '#000' }}>
                            <i className="fab fa-x-twitter" style={{ fontSize: '1rem', color: '#fff' }}></i>
                        </div>
                        <div className="social-meta">
                            <div className="social-name" style={{ fontSize: '0.95rem' }}>Bharat Properties <i className="fas fa-check-circle" style={{ color: '#1d9bf0', fontSize: '0.8rem' }}></i> <span style={{ fontWeight: 400, color: '#536471' }}>@bharat_prop · 1h</span></div>
                            <div style={{ fontSize: '0.8rem', color: '#536471' }}>Promoted</div>
                        </div>
                        <i className="fas fa-ellipsis-h" style={{ marginLeft: 'auto', color: '#536471' }}></i>
                    </div>
                    <div className="social-content" style={{ fontSize: '1rem' }}>{formData.xText || "What's happening? Your tweet copy will appear here with professional formatting..."}</div>
                    <div className="social-image-box" style={{ borderRadius: '16px', margin: '0 12px 12px', border: '1px solid #eff3f4' }}>
                        <i className="fas fa-chart-line" style={{ fontSize: '2.5rem' }}></i>
                    </div>
                    <div className="social-actions" style={{ border: 'none', paddingBottom: '15px' }}>
                        <span><i className="far fa-comment"></i> 128</span>
                        <span><i className="fas fa-retweet"></i> 45</span>
                        <span><i className="far fa-heart"></i> 1.2k</span>
                        <span><i className="far fa-chart-bar"></i> 45k</span>
                        <span><i className="far fa-share-square"></i></span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="preview-container">
            <div className="preview-label">{type.toUpperCase()} PREVIEW</div>
            <div className="empty-preview">
                Generating high-fidelity preview for {type}...
            </div>
        </div>
    );
}

export default WizardView;
