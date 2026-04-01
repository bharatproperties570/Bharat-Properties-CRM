import { useState } from 'react';
import { api } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { 
    LucideChevronLeft, LucideStar, 
    LucideSmile, LucideLayout, LucideMonitor
} from 'lucide-react';

const FeedbackFormBuilder = ({ form, onSave, onCancel }) => {
    const [formData, setFormData] = useState(form || {
        name: 'After Site Visit Feedback',
        slug: 'site-visit-feedback',
        isActive: true,
        sections: [
            { id: 'sec_1', title: 'Visit Experience', fields: [
                { id: 'field_1', label: 'How would you rate your site visit experience?', type: 'rating', required: true, order: 0 },
                { id: 'field_2', label: 'Any specific comments about the project?', type: 'text', required: false, order: 1 }
            ] }
        ],
        settings: {
            successMessage: "Thank you for sharing your feedback with us!",
            autoTags: ['Site Visit Feedback'],
            theme: { primaryColor: '#3b82f6', layout: 'single' }
        }
    });

    const [activeSectionId] = useState('sec_1');
    const [selectedFieldId, setSelectedFieldId] = useState(null);

    const handleSave = async () => {
        try {
            if (formData._id) {
                await api.put(`/feedback-forms/${formData._id}`, formData);
            } else {
                await api.post('/feedback-forms', formData);
            }
            toast.success('Feedback form saved successfully');
            onSave();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save form');
        }
    };

    const addField = (sectionId, type) => {
        const newField = {
            id: `field_${Date.now()}`,
            label: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Question`,
            type: type,
            required: false,
            placeholder: '',
            options: ['select', 'radio'].includes(type) ? ['Option 1', 'Option 2'] : []
        };

        const newSections = formData.sections.map(sec => {
            if (sec.id === sectionId) {
                return { ...sec, fields: [...sec.fields, newField] };
            }
            return sec;
        });

        setFormData({ ...formData, sections: newSections });
        setSelectedFieldId(newField.id);
    };

    const updateField = (fieldId, updates) => {
        const newSections = formData.sections.map(sec => ({
            ...sec,
            fields: sec.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
        }));
        setFormData({ ...formData, sections: newSections });
    };

    const PropertyEditor = () => {
        const field = formData.sections.flatMap(s => s.fields).find(f => f.id === selectedFieldId);
        if (!field) return <div style={{ padding: '24px', color: '#94a3b8', textAlign: 'center' }}>Select a question to edit.</div>;

        return (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>Question Properties</h3>
                
                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>LABEL / QUESTION</label>
                    <input
                        type="text"
                        value={field.label}
                        onChange={e => updateField(field.id, { label: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>

                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>REQUIRED</label>
                    <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateField(field.id, { required: e.target.checked })}
                    />
                </div>

                {['select', 'radio'].includes(field.type) && (
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>OPTIONS (one per line)</label>
                        <textarea
                            value={field.options.join('\n')}
                            onChange={e => updateField(field.id, { options: e.target.value.split('\n').filter(o => o.trim()) })}
                            style={{ width: '100%', minHeight: '100px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LucideChevronLeft size={20} /> Back
                    </button>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', border: 'none', outline: 'none' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleSave} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                        Save Feedback Form
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '300px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '32px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.8rem', fontWeight: 800 }}>ADD QUESTIONS</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                        {[
                            { type: 'rating', icon: <LucideStar size={14} />, label: 'Star Rating' },
                            { type: 'nps', icon: <LucideSmile size={14} />, label: 'NPS Score' },
                            { type: 'text', icon: <LucideLayout size={14} />, label: 'Text Field' },
                            { type: 'radio', icon: <LucideMonitor size={14} />, label: 'Multiple Choice' }
                        ].map(item => (
                            <button
                                key={item.type}
                                onClick={() => addField(activeSectionId, item.type)}
                                style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                            >
                                {item.icon} {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '700px', background: '#fff', borderRadius: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', padding: '40px' }}>
                        <h1 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 900, marginBottom: '40px' }}>{formData.name}</h1>
                        
                        {formData.sections.map(section => (
                            <div key={section.id}>
                                {section.fields.map(field => (
                                    <div 
                                        key={field.id} 
                                        onClick={() => setSelectedFieldId(field.id)}
                                        style={{ marginBottom: '24px', padding: '20px', borderRadius: '12px', border: `2px solid ${selectedFieldId === field.id ? '#2563eb' : '#f1f5f9'}` }}
                                    >
                                        <label style={{ fontSize: '0.9rem', fontWeight: 700, display: 'block', marginBottom: '12px' }}>{field.label}</label>
                                        
                                        {field.type === 'rating' && (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {[1,2,3,4,5].map(s => <LucideStar key={s} size={24} color="#e2e8f0" />)}
                                            </div>
                                        )}
                                        {field.type === 'nps' && (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {[...Array(11).keys()].map(i => <div key={i} style={{ width: '30px', height: '30px', border: '1px solid #e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>{i}</div>)}
                                            </div>
                                        )}
                                        {field.type === 'text' && <div style={{ height: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}></div>}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ width: '300px', background: '#fff', borderLeft: '1px solid #e2e8f0' }}>
                    <PropertyEditor />
                </div>
            </div>
        </div>
    );
};

export default FeedbackFormBuilder;
