
import React, { useState } from 'react';
import { LucidePlus, LucideTrash2, LucideGripVertical, LucideSettings, LucideSave, LucideX, LucideChevronDown, LucideLayout } from 'lucide-react';
import { api } from '../utils/api';
import { toast } from 'react-hot-toast';

const FIELD_TYPES = [
    { type: 'text', label: 'Single Line Text', icon: 'fa-font' },
    { type: 'phone', label: 'Phone Number', icon: 'fa-phone' },
    { type: 'email', label: 'Email Address', icon: 'fa-envelope' },
    { type: 'select', label: 'Dropdown Select', icon: 'fa-list' },
    { type: 'radio', label: 'Radio Buttons', icon: 'fa-dot-circle' },
    { type: 'checkbox', label: 'Checkbox', icon: 'fa-check-square' },
    { type: 'date', label: 'Date Picker', icon: 'fa-calendar' },
    { type: 'datetime', label: 'Date & Time', icon: 'fa-clock' },
    { type: 'rating', label: 'Star Rating', icon: 'fa-star' },
    { type: 'file', label: 'File Upload', icon: 'fa-upload' }
];

const UniversalFormBuilder = ({ form, onSave, onCancel, category = 'custom' }) => {
    const [name, setName] = useState(form?.name || '');
    const [description, setDescription] = useState(form?.description || '');
    const [sections, setSections] = useState(form?.sections || [
        { id: 'sec_1', title: 'Basic Information', fields: [] }
    ]);
    const [settings, setSettings] = useState(form?.settings || {
        successMessage: 'Thank you! Your response has been recorded.',
        primaryColor: '#3b82f6',
        layout: 'single'
    });
    const [isSaving, setIsSaving] = useState(false);

    const addField = (sectionId, type) => {
        const newField = {
            id: 'field_' + Math.random().toString(36).substring(2, 9),
            label: 'New ' + type + ' field',
            type: type,
            required: false,
            placeholder: '',
            options: type === 'select' || type === 'radio' ? ['Option 1', 'Option 2'] : []
        };

        setSections(prev => prev.map(sec => 
            sec.id === sectionId ? { ...sec, fields: [...sec.fields, newField] } : sec
        ));
    };

    const removeField = (sectionId, fieldId) => {
        setSections(prev => prev.map(sec => 
            sec.id === sectionId ? { ...sec, fields: sec.fields.filter(f => f.id !== fieldId) } : sec
        ));
    };

    const updateField = (sectionId, fieldId, updates) => {
        setSections(prev => prev.map(sec => 
            sec.id === sectionId ? {
                ...sec,
                fields: sec.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
            } : sec
        ));
    };

    const handleSave = async () => {
        if (!name) return toast.error('Form name is required');
        
        try {
            setIsSaving(true);
            const payload = {
                name,
                description,
                category,
                sections,
                settings
            };

            if (form?._id) {
                await api.put(`/dynamic-forms/${form._id}`, payload);
            } else {
                await api.post('/dynamic-forms', payload);
            }

            toast.success('Form saved successfully');
            onSave();
        } catch (error) {
            toast.error('Failed to save form');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f1f5f9', height: '100%' }}>
            {/* Toolbar */}
            <div style={{ padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={onCancel} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><LucideX size={20} /></button>
                    <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }}></div>
                    <div>
                        <input 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder="Enter form name..."
                            style={{ border: 'none', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', outline: 'none', width: '300px' }}
                        />
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Category: <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{category}</span></div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        style={{ padding: '8px 24px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {isSaving ? 'Saving...' : <><LucideSave size={18} /> Save Form</>}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel: Field Types */}
                <div style={{ width: '280px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '24px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.5px' }}>Form Elements</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                        {FIELD_TYPES.map(ft => (
                            <div 
                                key={ft.type}
                                onClick={() => addField(sections[0].id, ft.type)}
                                style={{ padding: '12px', border: '1px solid #f1f5f9', borderRadius: '10px', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                                onMouseOut={e => e.currentTarget.style.borderColor = '#f1f5f9'}
                            >
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                    <i className={`fas ${ft.icon}`}></i>
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{ft.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center: Canvas */}
                <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '700px' }}>
                        {sections.map((section, sIdx) => (
                            <div key={section.id} style={{ background: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '32px', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <input 
                                    value={section.title} 
                                    onChange={e => {
                                        const newSecs = [...sections];
                                        newSecs[sIdx].title = e.target.value;
                                        setSections(newSecs);
                                    }}
                                    style={{ width: '100%', border: 'none', borderBottom: '2px solid #f1f5f9', padding: '8px 0', fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '24px', outline: 'none' }}
                                />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {section.fields.map((field, fIdx) => (
                                        <div key={field.id} style={{ padding: '20px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#fff', position: 'relative' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <input 
                                                        value={field.label}
                                                        onChange={e => updateField(section.id, field.id, { label: e.target.value })}
                                                        style={{ width: '100%', border: 'none', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', outline: 'none' }}
                                                        placeholder="Field Label"
                                                    />
                                                </div>
                                                <button onClick={() => removeField(section.id, field.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><LucideTrash2 size={16} /></button>
                                            </div>
                                            
                                            <div style={{ display: 'flex', gap: '12px', marginBottom: (field.type === 'select' || field.type === 'radio') ? '12px' : '0' }}>
                                                <div style={{ flex: 1, padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                    {field.placeholder || `Enter ${field.type}...`}
                                                </div>
                                                <div style={{ width: '120px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={field.required} onChange={e => updateField(section.id, field.id, { required: e.target.checked })} />
                                                        Required
                                                    </label>
                                                </div>
                                            </div>

                                            {(field.type === 'select' || field.type === 'radio') && (
                                                <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Options Source</label>
                                                        <select 
                                                            value={field.dynamicSource || 'static'}
                                                            onChange={e => updateField(section.id, field.id, { dynamicSource: e.target.value === 'static' ? null : e.target.value })}
                                                            style={{ fontSize: '0.7rem', border: 'none', background: 'none', color: '#3b82f6', fontWeight: 800, outline: 'none', cursor: 'pointer' }}
                                                        >
                                                            <option value="static">Static List</option>
                                                            <option value="projects">Real-time Projects</option>
                                                            <option value="users">Team Members</option>
                                                        </select>
                                                    </div>
                                                    
                                                    {!field.dynamicSource ? (
                                                        <input 
                                                            value={field.options?.join(', ') || ''}
                                                            onChange={e => updateField(section.id, field.id, { options: e.target.value.split(',').map(o => o.trim()).filter(o => o) })}
                                                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', fontSize: '0.85rem', outline: 'none' }}
                                                            placeholder="Option 1, Option 2, Option 3"
                                                        />
                                                    ) : (
                                                        <div style={{ padding: '8px', background: '#eff6ff', borderRadius: '6px', fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600 }}>
                                                            <i className="fas fa-sync-alt fa-spin" style={{ marginRight: '8px' }}></i>
                                                            Fetching from {field.dynamicSource} database...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {section.fields.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed #f1f5f9', borderRadius: '16px', color: '#94a3b8' }}>
                                            <LucidePlus size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>Drag or click elements to add fields</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Settings */}
                <div style={{ width: '320px', background: '#fff', borderLeft: '1px solid #e2e8f0', padding: '24px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '24px', letterSpacing: '0.5px' }}>Form Settings</h3>
                    
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Description</label>
                        <textarea 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85rem', minHeight: '80px', outline: 'none' }}
                            placeholder="Form internal description..."
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Success Message</label>
                        <textarea 
                            value={settings.successMessage}
                            onChange={e => setSettings({ ...settings, successMessage: e.target.value })}
                            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85rem', minHeight: '80px', outline: 'none' }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Theme Color</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['#3b82f6', '#10b981', '#6366f1', '#ec4899', '#f59e0b', '#0f172a'].map(c => (
                                <div 
                                    key={c}
                                    onClick={() => setSettings({ ...settings, primaryColor: c })}
                                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, cursor: 'pointer', border: settings.primaryColor === c ? '3px solid #fff' : 'none', boxShadow: settings.primaryColor === c ? '0 0 0 2px ' + c : 'none' }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UniversalFormBuilder;
