import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { 
    LucideChevronLeft, LucidePlus, LucideSettings, LucideGripVertical, LucideTrash2, LucideCopy, LucideLayout, LucideSmile, LucideEdit2,
    LucideStar, LucideMonitor, LucideMessageSquare, LucideCheckSquare, LucideCalendar, LucideArrowUp, LucideArrowDown
} from 'lucide-react';

const FormField = ({ field, index, total, onSelect, onRemove, onMove }) => {
    const style = {
        padding: '20px',
        marginBottom: '16px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
        cursor: 'pointer',
        position: 'relative'
    };

    return (
        <div style={style} onClick={() => onSelect(field.id)} className="field-hover-border">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <button disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} style={{ background: 'none', border: 'none', color: index === 0 ? '#cbd5e1' : '#64748b', cursor: index === 0 ? 'not-allowed' : 'pointer' }}><LucideArrowUp size={16} /></button>
                <button disabled={index === total - 1} onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} style={{ background: 'none', border: 'none', color: index === total - 1 ? '#cbd5e1' : '#64748b', cursor: index === total - 1 ? 'not-allowed' : 'pointer' }}><LucideArrowDown size={16} /></button>
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                    {field.label} {field.required && <span style={{color: '#ef4444'}}>*</span>}
                    {field.visibilityRule && <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>LOGIC</span>}
                </div>
                
                {/* 🎨 Mock UI Rendering based on field type */}
                <div style={{ pointerEvents: 'none', opacity: 0.8 }}>
                    {(field.type === 'text' || field.type === 'phone' || field.type === 'email') && (
                        <div style={{ width: '100%', height: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                            {field.placeholder || `Enter ${field.type}...`}
                        </div>
                    )}
                    {field.type === 'select' && (
                        <div style={{ width: '100%', height: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
                            <span>Select an option...</span>
                            <LucideMonitor size={14} />
                        </div>
                    )}
                    {field.type === 'radio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(field.options || ['Option 1', 'Option 2']).slice(0, 3).map((opt, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#475569' }}>
                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #cbd5e1' }}></div>
                                    {opt}
                                </div>
                            ))}
                        </div>
                    )}
                    {field.type === 'textarea' && (
                        <div style={{ width: '100%', height: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'flex-start', color: '#94a3b8', fontSize: '0.9rem' }}>
                            {field.placeholder || 'Enter your comments here...'}
                        </div>
                    )}
                    {field.type === 'checkbox' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {(field.options || ['Option 1', 'Option 2']).slice(0, 3).map((opt, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#475569' }}>
                                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1px solid #cbd5e1' }}></div>
                                    {opt}
                                </div>
                            ))}
                        </div>
                    )}
                    {(field.type === 'date' || field.type === 'datetime') && (
                        <div style={{ width: '100%', height: '40px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
                            <span>Select {field.type === 'date' ? 'Date' : 'Date & Time'}...</span>
                            <LucideCalendar size={14} />
                        </div>
                    )}
                    {field.type === 'rating' && (
                        <div style={{ display: 'flex', gap: '8px', color: '#cbd5e1' }}>
                            {[1,2,3,4,5].map(i => <LucideStar key={i} size={24} fill="#cbd5e1" />)}
                        </div>
                    )}
                    {field.type === 'nps' && (
                        <div style={{ width: '100%', marginTop: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
                                {[0,1,2,3,4,5,6,7,8,9,10].map(i => (
                                    <div key={i} style={{ 
                                        flex: '0 0 auto',
                                        width: '32px', height: '32px', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        border: '1px solid #e2e8f0', borderRadius: '4px', 
                                        background: '#f8fafc', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 
                                    }}>
                                        {i}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', padding: '0 4px' }}>
                                <span>Not likely at all</span>
                                <span>Extremely likely</span>
                            </div>
                        </div>
                    )}
                    {field.type === 'property_feedback' && (
                        <div style={{ padding: '12px', background: '#f0fdfa', border: '1px dashed #5eead4', borderRadius: '8px', color: '#0f766e', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LucideLayout size={16} /> Dynamic property list will render here
                        </div>
                    )}
                </div>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(field.id); }} 
                style={{ background: '#fef2f2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '8px', borderRadius: '6px' }}
                title="Remove Field"
            >
                <LucideTrash2 size={16} />
            </button>
        </div>
    );
};

const EnterpriseFormBuilder = ({ form, onSave, onCancel, mode = 'custom' }) => {
    // Mode defines what field types are available
    const availableFieldTypes = [
        { type: 'text', icon: <LucideLayout size={14} />, label: 'Single Line Text' },
        { type: 'textarea', icon: <LucideMessageSquare size={14} />, label: 'Multi-line Text' },
        { type: 'phone', icon: <LucideLayout size={14} />, label: 'Phone Number' },
        { type: 'select', icon: <LucideMonitor size={14} />, label: 'Dropdown Select' },
        { type: 'radio', icon: <LucideMonitor size={14} />, label: 'Radio Buttons' },
        { type: 'checkbox', icon: <LucideCheckSquare size={14} />, label: 'Checkboxes' },
        { type: 'date', icon: <LucideCalendar size={14} />, label: 'Date Picker' },
        { type: 'datetime', icon: <LucideCalendar size={14} />, label: 'Date & Time' },
        { type: 'rating', icon: <LucideStar size={14} />, label: 'Star Rating' }
    ];

    if (mode === 'feedback') {
        availableFieldTypes.unshift({ type: 'property_feedback', icon: <LucideLayout size={14} />, label: 'Property Repeater' });
        availableFieldTypes.push({ type: 'nps', icon: <LucideSmile size={14} />, label: 'NPS Score' });
    }

    const [formData, setFormData] = useState(form || {
        name: 'New Form',
        slug: 'new-form',
        isActive: true,
        sections: [{ id: 'sec_1', title: 'Basic Information', fields: [] }],
        settings: { successMessage: "Thank you!", theme: { primaryColor: '#3b82f6', layout: 'single' } }
    });

    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!formData.name) return toast.error('Form name is required');
        
        try {
            setIsSaving(true);
            const endpoint = mode === 'lead' ? '/lead-forms' : 
                             mode === 'deal' ? '/deal-forms' : 
                             mode === 'feedback' ? '/feedback-forms' : '/dynamic-forms';

            // Auto-generate a unique slug if it's new
            let finalSlug = formData.slug;
            if (!finalSlug || finalSlug === 'new-form') {
                finalSlug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);
            }

            // Add basic formatting to make it compatible with endpoints expected
            const payload = {
                ...formData,
                slug: finalSlug,
                category: formData.category || mode
            };

            if (formData._id) {
                await api.put(`${endpoint}/${formData._id}`, payload);
            } else {
                await api.post(endpoint, payload);
            }
            toast.success('Form saved successfully');
            onSave();
        } catch (error) {
            toast.error(error.message || 'Failed to save form');
        } finally {
            setIsSaving(false);
        }
    };

    const addField = (type) => {
        const newField = {
            id: `field_${Date.now()}`,
            label: `New ${type} question`,
            type: type,
            required: false,
            options: ['select', 'radio', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : [],
            visibilityRule: null // Logic rule
        };

        const newSections = formData.sections.map((sec, idx) => {
            if (idx === 0) return { ...sec, fields: [...sec.fields, newField] };
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

    const removeField = (fieldId) => {
        const newSections = formData.sections.map(sec => ({
            ...sec,
            fields: sec.fields.filter(f => f.id !== fieldId)
        }));
        setFormData({ ...formData, sections: newSections });
        if (selectedFieldId === fieldId) setSelectedFieldId(null);
    };

    const moveField = (index, direction) => {
        const section = formData.sections[0];
        const newFields = [...section.fields];
        const newIndex = index + direction;
        
        [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
        
        setFormData({
            ...formData,
            sections: [{ ...section, fields: newFields }]
        });
    };

    const selectedField = formData.sections[0]?.fields.find(f => f.id === selectedFieldId);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
            {/* Topbar */}
            <div style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <LucideChevronLeft size={20} /> Back
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', border: '1px solid transparent', borderBottom: '1px solid #cbd5e1', outline: 'none', background: 'transparent', transition: 'border-color 0.2s', padding: '2px 4px' }}
                                placeholder="Form Name"
                                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                onBlur={e => e.target.style.borderColor = 'transparent'}
                            />
                            <LucideEdit2 size={14} color="#94a3b8" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748b', padding: '0 4px', marginTop: '4px' }}>
                            <span>Link: /public/feedback/</span>
                            <input
                                type="text"
                                value={formData.slug === 'new-form' ? '' : formData.slug}
                                onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                                placeholder="custom-url-name"
                                style={{ fontSize: '0.75rem', color: '#2563eb', border: 'none', borderBottom: '1px dashed #cbd5e1', outline: 'none', background: 'transparent', width: '150px' }}
                            />
                        </div>
                    </div>
                    <div style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                        {mode} Mode
                    </div>
                </div>
                <div>
                    <button onClick={handleSave} disabled={isSaving} style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                        {isSaving ? 'Saving...' : 'Save Form'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left: Palette */}
                <div style={{ width: '280px', background: '#fff', borderRight: '1px solid #e2e8f0', padding: '24px', overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>ADD FIELDS</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {availableFieldTypes.map(ft => (
                            <button
                                key={ft.type}
                                onClick={() => addField(ft.type)}
                                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', color: '#334155', fontWeight: 600 }}
                            >
                                <div style={{ color: '#64748b' }}>{ft.icon}</div>
                                {ft.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Center: Canvas */}
                <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '700px' }}>
                        <div style={{ background: '#fff', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                            <h2 style={{ margin: '0 0 24px', color: '#0f172a', fontSize: '1.5rem', fontWeight: 800 }}>Form Layout</h2>
                            
                            {formData.sections[0].fields.map((field, idx) => (
                                <FormField 
                                    key={field.id} 
                                    field={field} 
                                    index={idx}
                                    total={formData.sections[0].fields.length}
                                    onSelect={setSelectedFieldId} 
                                    onRemove={removeField} 
                                    onMove={moveField}
                                />
                            ))}

                            {formData.sections[0].fields.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '12px', color: '#94a3b8' }}>
                                    <LucidePlus size={32} style={{ margin: '0 auto 12px' }} />
                                    Click a field on the left to start building your form.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Properties & Logic */}
                <div style={{ width: '350px', background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    {selectedField ? (
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Selected Field</div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{selectedField.type}</div>
                            </div>
                            
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>LABEL / QUESTION</label>
                                    <input
                                        type="text"
                                        value={selectedField.label}
                                        onChange={e => updateField(selectedField.id, { label: e.target.value })}
                                        style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                    />
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedField.required}
                                        onChange={e => updateField(selectedField.id, { required: e.target.checked })}
                                    />
                                    Required Field
                                </label>

                                {['select', 'radio', 'checkbox'].includes(selectedField.type) && (
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>OPTIONS (one per line)</label>
                                        <textarea
                                            value={selectedField.options?.join('\n') || ''}
                                            onChange={e => updateField(selectedField.id, { options: e.target.value.split('\n').filter(o => o.trim()) })}
                                            style={{ width: '100%', minHeight: '100px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                        />
                                    </div>
                                )}

                                {/* Enterprise Logic Engine */}
                                <div style={{ marginTop: '20px', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 800, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <LucideSettings size={14} /> CONDITIONAL LOGIC
                                    </h4>
                                    <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: '12px' }}>
                                        Show this field only if another field matches a specific value.
                                    </div>
                                    <textarea
                                        value={selectedField.visibilityRule ? JSON.stringify(selectedField.visibilityRule, null, 2) : ''}
                                        onChange={e => {
                                            try {
                                                const val = e.target.value.trim();
                                                updateField(selectedField.id, { visibilityRule: val ? JSON.parse(val) : null });
                                            } catch (err) {
                                                // Invalid JSON, ignore
                                            }
                                        }}
                                        placeholder='{"fieldId": "field_1", "operator": "equals", "value": "Yes"}'
                                        style={{ width: '100%', height: '80px', padding: '8px', fontSize: '0.7rem', fontFamily: 'monospace', borderRadius: '6px', border: '1px solid #93c5fd', outline: 'none' }}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8' }}>
                            <LucideSettings size={32} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                            <p style={{ fontSize: '0.9rem' }}>Select a field on the canvas to edit its properties.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EnterpriseFormBuilder;
