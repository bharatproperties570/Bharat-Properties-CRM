import React, { useState } from 'react';

function WizardView({ onBack }) {
    const [step, setStep] = useState(1);
    const [campaignType, setCampaignType] = useState('sms');

    const nextStep = () => {
        if (step < 4) setStep(step + 1);
        else {
            alert("Campaign Created Successfully!");
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
                            {step === 1 && <Step1Setup campaignType={campaignType} setCampaignType={setCampaignType} />}
                            {step === 2 && <Step2Audience />}
                            {step === 3 && <Step3Template type={campaignType} />}
                            {step === 4 && <Step4Review />}
                        </div>
                    </div>

                    {/* Preview Sidebar */}
                    <div className="wizard-sidebar-preview">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Initializing Preview...
                        </div>
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

function Step1Setup({ campaignType, setCampaignType }) {
    return (
        <div className="wizard-step active">
            <h3>Campaign Setup</h3>
            <div className="section-title">General Information</div>
            <div className="form-row">
                <div className="form-group flex-1">
                    <label>Campaign Name*</label>
                    <input type="text" placeholder="e.g. Summer Launch 2024" />
                </div>
                <div className="form-group flex-1">
                    <label>Campaign Type</label>
                    <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)}>
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="rcs">RCS</option>
                    </select>
                </div>
            </div>
            <div className="section-title">Campaign Settings</div>
            <div className="form-group">
                <label>Description</label>
                <textarea placeholder="Description..." style={{ minHeight: '80px' }}></textarea>
            </div>
        </div>
    );
}

function Step2Audience() {
    return (
        <div className="wizard-step active">
            <h3>Select Audience</h3>
            <div className="filter-grid">
                {/* Mock Filters */}
                <div className="filter-item"><label>City</label><select><option>Select City</option></select></div>
                <div className="filter-item"><label>Project</label><select><option>Select Project</option></select></div>
            </div>
            <div className="mini-table-container">
                <table className="mini-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" /></th>
                            <th>Details</th>
                            <th>Sales Agent</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem' }}>No contacts selected</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Step3Template({ type }) {
    return (
        <div className="wizard-step active">
            <h3>Message Content ({type.toUpperCase()})</h3>
            {/* Simple Text Editor Mockup */}
            <div className="form-group">
                <label>Message Body</label>
                <textarea className="rich-textarea" placeholder={`Type your ${type} message...`} style={{ minHeight: '120px' }}></textarea>
            </div>
        </div>
    );
}

function Step4Review() {
    return (
        <div className="wizard-step active">
            <div className="final-confirmation-slide">
                <i className="fas fa-check-circle" style={{ fontSize: '3rem', color: '#388E3C', marginBottom: '1rem' }}></i>
                <h3>All Set!</h3>
                <p>Review your selections in the sidebar before launching.</p>
            </div>
        </div>
    );
}

export default WizardView;
