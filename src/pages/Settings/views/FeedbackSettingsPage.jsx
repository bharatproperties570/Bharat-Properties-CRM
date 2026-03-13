import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import { toast } from 'react-hot-toast';
import FeedbackFormBuilder from '../../../components/FeedbackFormBuilder/FeedbackFormBuilder';

const FeedbackSettingsPage = () => {
    const [view, setView] = useState('list');
    const [forms, setForms] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchForms();
    }, []);

    const fetchForms = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/feedback-forms');
            setForms(response.data.data);
        } catch (error) {
            toast.error('Failed to fetch feedback forms');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this feedback form?')) return;
        try {
            await api.delete(`/feedback-forms/${id}`);
            toast.success('Form deleted');
            fetchForms();
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    if (view === 'builder') {
        return <FeedbackFormBuilder form={selectedForm} onSave={() => { setView('list'); fetchForms(); }} onCancel={() => setView('list')} />;
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>SITE VISIT FEEDBACK FORMS</h2>
                    <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Create surveys to capture customer sentiment after project site visits.</p>
                </div>
                <button
                    onClick={() => { setSelectedForm(null); setView('builder'); }}
                    style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                    Create New Survey
                </button>
            </div>

            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                {forms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '100px', background: '#f8fafc', borderRadius: '24px' }}>
                        <h3 style={{ color: '#1e293b' }}>No Feedback Surveys</h3>
                        <p style={{ color: '#64748b' }}>Start collecting site visit feedback today.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {forms.map(form => (
                            <div key={form._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px' }}>SURVEY</span>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button onClick={() => {
                                            const url = window.location.origin + '/public/feedback/' + form.slug;
                                            navigator.clipboard.writeText(url);
                                            toast.success('Survey link copied!');
                                        }} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            Copy Link
                                        </button>
                                    </div>
                                </div>
                                <h3 style={{ margin: 0, fontWeight: 800 }}>{form.name}</h3>
                                <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>SUBMISSIONS</div>
                                        <div style={{ fontWeight: 800 }}>{form.analytics?.submissions || 0}</div>
                                    </div>
                                    <div style={{ textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>AVG RATING</div>
                                        <div style={{ fontWeight: 800, color: '#f59e0b' }}>{form.analytics?.averageRating?.toFixed(1) || '0.0'}</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                    <button onClick={() => { setSelectedForm(form); setView('builder'); }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                                    <button onClick={() => handleDelete(form._id)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #fee2e2', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeedbackSettingsPage;
