import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { LucidePlus, LucideTrash2, LucideSettings, LucideMoveUp, LucideMoveDown, LucideChevronLeft, LucideSave, LucideEye } from 'lucide-react';

const LeadFormBuilder = ({ form, onSave, onCancel }) => {
    const [formData, setFormData] = useState(form || {
        name: 'New Lead Form',
        slug: 'new-lead-form',
        isActive: true,
        sections: [
            { id: 'sec_1', title: 'Basic Information', fields: [] }
        ],
        settings: {
            successMessage: "Thank you for your interest! We will contact you soon.",
            autoTags: ['Web Lead'],
            enableUTMTracking: true,
            theme: { primaryColor: '#10b981', layout: 'single' }
        }
    });

    const [activeSectionId, setActiveSectionId] = useState('sec_1');
    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [isPreviewMode, setIsPreviewMode] = useState(false);

    // --- Actions ---

    const handleSave = async () => {
        try {
            if (formData._id) {
                await axios.put(`/api/lead-forms/${formData._id}`, formData);
            } else {
                await axios.post('/api/lead-forms', formData);
            }
            toast.success('Form saved successfully');
            onSave();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save form');
        }
    };

    const addSection = () => {
        const newId = `sec_${Date.now()}`;
        setFormData({
            ...formData,
            sections: [...formData.sections, { id: newId, title: 'New Section', fields: [] }]
        });
        setActiveSectionId(newId);
    };

    const addField = (sectionId, type) => {
        const newField = {
            id: `field_${Date.now()}`,
            label: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
            type: type,
            required: false,
            placeholder: '',
            weight: 0,
            mappingField: '',
            options: type === 'select' || type === 'radio' || type === 'multi-select' ? ['Option 1', 'Option 2'] : []
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

    const removeField = (sectionId, fieldId) => {
        const newSections = formData.sections.map(sec => {
            if (sec.id === sectionId) {
                return { ...sec, fields: sec.fields.filter(f => f.id !== fieldId) };
            }
            return sec;
        });
        setFormData({ ...formData, sections: newSections });
        if (selectedFieldId === fieldId) setSelectedFieldId(null);
    };

    const updateField = (fieldId, updates) => {
        const newSections = formData.sections.map(sec => ({
            ...sec,
            fields: sec.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
        }));
        setFormData({ ...formData, sections: newSections });
    };

    const moveField = (sectionId, fieldId, direction) => {
        const section = formData.sections.find(s => s.id === sectionId);
        const index = section.fields.findIndex(f => f.id === fieldId);
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === section.fields.length - 1)) return;

        const newFields = [...section.fields];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];

        const newSections = formData.sections.map(sec => sec.id === sectionId ? { ...sec, fields: newFields } : sec);
        setFormData({ ...formData, sections: newSections });
    };

    // --- Sub-components ---

    const PropertyEditor = () => {
        const field = formData.sections.flatMap(s => s.fields).find(f => f.id === selectedFieldId);
        if (!field) return <div style={{ padding: '24px', color: '#94a3b8', textAlign: 'center' }}>Select a field to edit its properties.</div>;

        const mappingOptions = [
            { label: 'None', value: '' },
            { label: 'First Name', value: 'firstName' },
            { label: 'Last Name', value: 'lastName' },
            { label: 'Mobile Number', value: 'mobile' },
            { label: 'Email Address', value: 'email' },
            { label: 'Requirement (Buy/Rent)', value: 'requirement' },
            { label: 'Budget', value: 'budget' },
            { label: 'Location', value: 'location' },
            { label: 'Project Name', value: 'projectName' },
            { label: 'Property Type', value: 'propertyType' },
            { label: 'Timeline', value: 'timeline' },
            { label: 'Purpose', value: 'purpose' },
            { label: 'Source', value: 'source' },
            { label: 'City', value: 'locCity' },
            { label: 'Description', value: 'description' }
        ];

        return (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>Field Properties</h3>

                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>LABEL</label>
                    <input
                        type="text"
                        value={field.label}
                        onChange={e => updateField(field.id, { label: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>

                <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>MAPPING FIELD</label>
                    <select
                        value={field.mappingField}
                        onChange={e => updateField(field.id, { mappingField: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                    >
                        {mappingOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>REQUIRED</label>
                        <input
                            type="checkbox"
                            checked={field.required}
                            onChange={e => updateField(field.id, { required: e.target.checked })}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>WEIGHT (SCORE)</label>
                        <input
                            type="number"
                            value={field.weight}
                            onChange={e => updateField(field.id, { weight: Number(e.target.value) })}
                            style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>
                </div>

                {(field.type === 'select' || field.type === 'radio' || field.type === 'multi-select') && (
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>OPTIONS (one per line)</label>
                        <textarea
                            value={field.options.join('\n')}
                            onChange={e => updateField(field.id, { options: e.target.value.split('\n').filter(o => o.trim()) })}
                            style={{ width: '100%', minHeight: '100px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'inherit' }}
                        />
                    </div>
                )}

                <button
                    onClick={() => removeField(activeSectionId, field.id)}
                    style={{ marginTop: '12px', padding: '10px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                    <LucideTrash2 size={16} />
                    Delete Field
                </button>
            </div>
        );
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
            {/* Top Bar */}
            <div style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LucideChevronLeft size={20} />
                        Back
                    </button>
                    <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', border: 'none', outline: 'none', padding: '4px' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        style={{ background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <LucideEye size={18} />
                        {isPreviewMode ? 'Exit Preview' : 'Preview'}
                    </button>
                    <button
                        onClick={handleSave}
                        style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px -3px rgba(16, 185, 129, 0.4)' }}
                    >
                        <LucideSave size={18} />
                        Save Form
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left: Settings Sidebar */}
                <div style={{ width: '300px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '32px', overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 24px', fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>General Settings</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>URL SLUG</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>/</span>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.9rem', fontWeight: 700, color: '#475569', width: '100%' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>SUCCESS MESSAGE</label>
                            <textarea
                                value={formData.settings.successMessage}
                                onChange={e => setFormData({ ...formData, settings: { ...formData.settings, successMessage: e.target.value } })}
                                style={{ width: '100%', minHeight: '80px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                Form Published
                            </label>
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '0.8rem', fontWeight: 800, color: '#1e293b' }}>ADD FIELDS</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {['text', 'phone', 'email', 'select', 'date', 'radio'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => addField(activeSectionId, type)}
                                    style={{ padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer', textAlign: 'left' }}
                                >
                                    + {type.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Center: Canvas */}
                <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '700px', background: '#fff', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        {/* Form Header */}
                        <div style={{ padding: '40px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#1e293b' }}>{formData.name}</h1>
                            <p style={{ margin: '12px 0 0', color: '#64748b' }}>Please fill out the details below.</p>
                        </div>

                        {/* Sections & Fields */}
                        <div style={{ padding: '40px' }}>
                            {formData.sections.map(section => (
                                <div key={section.id} style={{ marginBottom: '40px', border: activeSectionId === section.id ? '2px solid var(--primary-color)' : '1px transparent', borderRadius: '16px', padding: '4px' }} onClick={() => setActiveSectionId(section.id)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>{section.title}</h2>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {section.fields.map(field => (
                                            <div
                                                key={field.id}
                                                onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                                                style={{
                                                    padding: '20px',
                                                    background: selectedFieldId === field.id ? '#f0fdf4' : '#fff',
                                                    border: `2px solid ${selectedFieldId === field.id ? 'var(--primary-color)' : '#f1f5f9'}`,
                                                    borderRadius: '12px',
                                                    position: 'relative',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                                        {field.label}
                                                        {field.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); moveField(section.id, field.id, 'up'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><LucideMoveUp size={14} /></button>
                                                        <button onClick={(e) => { e.stopPropagation(); moveField(section.id, field.id, 'down'); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><LucideMoveDown size={14} /></button>
                                                    </div>
                                                </div>

                                                {/* Visual Placeholder for Field */}
                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                    {field.type === 'select' || field.type === 'radio' ? 'Select an option...' : field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                                                </div>
                                            </div>
                                        ))}

                                        {section.fields.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                                No fields in this section. Add fields from the left sidebar.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addSection}
                                style={{ width: '100%', padding: '16px', background: '#fff', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#64748b', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                            >
                                <LucidePlus size={18} />
                                Add New Section
                            </button>
                        </div>

                        {/* Form Footer */}
                        <div style={{ padding: '0 40px 40px' }}>
                            <button style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)' }}>
                                Submit Lead
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Property Editor */}
                <div style={{ width: '300px', background: '#fff', borderLeft: '1px solid #e2e8f0', overflowY: 'auto' }}>
                    <PropertyEditor />
                </div>
            </div>
        </div>
    );
};

export default LeadFormBuilder;
