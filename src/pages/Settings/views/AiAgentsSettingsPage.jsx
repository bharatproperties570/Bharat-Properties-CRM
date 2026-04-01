import React, { useState, useEffect } from 'react';
import { aiAgentsAPI, integrationSettingsAPI } from '../../../utils/api';
import toast from 'react-hot-toast';
import { Bot, Plus, Edit2, Trash2, Database, MessageSquare, Zap, Activity } from 'lucide-react';

const ROLES = ['Sales', 'Support', 'Marketing', 'Analysis', 'General'];
const USE_CASES = [
    { id: 'whatsapp_live', label: 'WhatsApp Automation' },
    { id: 'sms_automation', label: 'SMS Campaigns' },
    { id: 'email_drip', label: 'Email Marketing' },
    { id: 'voice_calls', label: 'Voice AI (ElevenLabs)' },
    { id: 'social_media', label: 'Social Media Generation' },
    { id: 'lead_qualification', label: 'Lead Qualification Bot' }
];
const MEMORY_ACCESS = [
    { id: 'leads', label: 'Leads & Contacts', icon: <Activity size={14} /> },
    { id: 'inventory', label: 'Property Inventory', icon: <Database size={14} /> },
    { id: 'deals', label: 'Active Pipeline Deals', icon: <Zap size={14} /> },
    { id: 'communications', label: 'Past Communications History', icon: <MessageSquare size={14} /> }
];

const AiAgentsSettingsPage = () => {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        role: 'General',
        systemPrompt: '',
        useCases: [],
        memoryAccess: [],
        isActive: true,
        provider: 'openai',
        modelName: 'gpt-4o'
    });

    const [availableProviders, setAvailableProviders] = useState(['openai']);
    const [availableChannels, setAvailableChannels] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [agentsRes, integrationsRes] = await Promise.all([
                aiAgentsAPI.getAll(),
                integrationSettingsAPI.getAvailableAi().catch(() => ({ success: false }))
            ]);
            
            if (agentsRes.success) {
                setAgents(agentsRes.data);
            }

            if (integrationsRes && integrationsRes.success) {
                setAvailableProviders(integrationsRes.data.providers || ['openai']);
                setAvailableChannels(integrationsRes.data.channels || []);
            }
        } catch (error) {
            toast.error('Failed to load AI Settings');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (agent = null) => {
        if (agent) {
            setEditingAgent(agent);
            setFormData({
                name: agent.name,
                role: agent.role,
                systemPrompt: agent.systemPrompt,
                useCases: agent.useCases || [],
                memoryAccess: agent.memoryAccess || [],
                isActive: agent.isActive,
                provider: agent.provider || 'openai',
                modelName: agent.modelName || 'gpt-4o'
            });
        } else {
            setEditingAgent(null);
            setFormData({
                name: '',
                role: 'General',
                systemPrompt: 'You are a helpful AI assistant for Bharat Properties CRM...',
                useCases: [],
                memoryAccess: [],
                isActive: true,
                provider: 'openai',
                modelName: 'gpt-4o'
            });
        }
        setIsModalOpen(true);
    };

    const handleToggleArray = (field, value) => {
        setFormData(prev => {
            const array = prev[field];
            if (array.includes(value)) {
                return { ...prev, [field]: array.filter(item => item !== value) };
            } else {
                return { ...prev, [field]: [...array, value] };
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingAgent) {
                await aiAgentsAPI.update(editingAgent._id, formData);
                toast.success('AI Agent updated successfully');
            } else {
                await aiAgentsAPI.create(formData);
                toast.success('AI Agent created successfully');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error(error.message || 'Failed to save AI Agent');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this AI Agent? This cannot be undone.')) {
            try {
                await aiAgentsAPI.delete(id);
                toast.success('AI Agent deleted');
                fetchData();
            } catch (error) {
                toast.error('Failed to delete agent');
            }
        }
    };

    const handleToggleStatus = async (agent) => {
        try {
            await aiAgentsAPI.update(agent._id, { isActive: !agent.isActive });
            toast.success(`Agent ${agent.isActive ? 'disabled' : 'enabled'}`);
            fetchData();
        } catch (error) {
            toast.error('Failed to update agent status');
        }
    };

    return (
        <div style={{ padding: '32px 40px', background: '#f8fafc', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Bot size={28} color="#3b82f6" /> AI Agent Hub
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '4px', fontSize: '0.9rem' }}>
                        Build and manage custom AI personas with specific memory access and roles.
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)'
                    }}
                >
                    <Plus size={18} /> Create Custom Agent
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px' }}>Loading Agents...</div>
            ) : agents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                    <Bot size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>No AI Agents Configured</h3>
                    <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '24px' }}>Create your first specialized AI agent to automate your workflows.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                    {agents.map(agent => (
                        <div key={agent._id} style={{
                            background: '#fff',
                            borderRadius: '16px',
                            border: '1px solid #e2e8f0',
                            padding: '24px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{agent.name}</h3>
                                        <span style={{
                                            background: agent.isActive ? '#dcfce7' : '#f1f5f9',
                                            color: agent.isActive ? '#166534' : '#64748b',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600
                                        }}>
                                            {agent.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <span style={{ color: '#3b82f6', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {agent.role} Agent
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleOpenModal(agent)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(agent._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <p style={{
                                color: '#475569',
                                fontSize: '0.85rem',
                                lineHeight: '1.5',
                                marginBottom: '20px',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                flex: 1
                            }}>
                                "{agent.systemPrompt}"
                            </p>

                            <div style={{ marginTop: 'auto' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Memory Access</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {agent.memoryAccess?.length > 0 ? agent.memoryAccess.map(acc => (
                                            <span key={acc} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {MEMORY_ACCESS.find(m => m.id === acc)?.icon} {MEMORY_ACCESS.find(m => m.id === acc)?.label || acc}
                                            </span>
                                        )) : <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>No memory access</span>}
                                    </div>
                                </div>

                                <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Bot size={14} color="#3b82f6" /> 
                                        <strong>{agent.provider.toUpperCase()}</strong>: {agent.modelName}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Status</span>
                                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                            <input
                                                type="checkbox"
                                                checked={agent.isActive}
                                                onChange={() => handleToggleStatus(agent)}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: agent.isActive ? '#3b82f6' : '#cbd5e1',
                                                transition: '.4s', borderRadius: '20px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', content: '""', height: '16px', width: '16px', left: '2px', bottom: '2px',
                                                    backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                                                    transform: agent.isActive ? 'translateX(16px)' : 'translateX(0)'
                                                }} />
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Agent Builder Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '20px', width: '90%', maxWidth: '800px', maxHeight: '90vh',
                        display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Bot size={24} color="#3b82f6" /> {editingAgent ? 'Edit AI Agent' : 'Build New AI Agent'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Agent Name <span style={{color: 'red'}}>*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Lead Engagement SDR"
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Agent Role <span style={{color: 'red'}}>*</span></label>
                                    <select
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                    >
                                        {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                                    System Prompt (Personality & Instructions) <span style={{color: 'red'}}>*</span>
                                </label>
                                <textarea
                                    required
                                    value={formData.systemPrompt}
                                    onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                                    placeholder="You are a professional real estate SDR. Your goal is to..."
                                    rows={6}
                                    style={{ width: '100%', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'monospace' }}
                                />
                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>This defines how the AI will respond, its rules, tone, and goals.</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>AI Provider</label>
                                    <select
                                        value={formData.provider}
                                        onChange={e => setFormData({ ...formData, provider: e.target.value, modelName: e.target.value === 'openai' ? 'gpt-4o' : (e.target.value === 'anthropic' ? 'claude-3-5-sonnet-20240620' : 'gemini-1.5-pro') })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                    >
                                        {availableProviders.includes('openai') && <option value="openai">OpenAI (GPT)</option>}
                                        {availableProviders.includes('anthropic') && <option value="anthropic">Anthropic (Claude)</option>}
                                        {availableProviders.includes('gemini') && <option value="gemini">Google (Gemini)</option>}
                                        {availableProviders.length === 0 && <option value="openai">OpenAI (Default)</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Model Engine</label>
                                    <select
                                        value={formData.modelName}
                                        onChange={e => setFormData({ ...formData, modelName: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
                                    >
                                        {formData.provider === 'openai' && (
                                            <>
                                                <option value="gpt-4o">GPT-4o</option>
                                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                            </>
                                        )}
                                        {formData.provider === 'anthropic' && (
                                            <>
                                                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                                                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                                                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                                            </>
                                        )}
                                        {formData.provider === 'gemini' && (
                                            <>
                                                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                {/* Use Cases Block */}
                                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>Target Use Cases</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {USE_CASES.filter(uc => availableChannels.length === 0 || availableChannels.includes(uc.id)).map(uc => (
                                            <label key={uc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.useCases.includes(uc.id)}
                                                    onChange={() => handleToggleArray('useCases', uc.id)}
                                                    style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
                                                />
                                                {uc.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Memory Access Block */}
                                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>CRM Memory & Data Access</label>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px', lineHeight: '1.4' }}>Select which CRM databases this AI is allowed to query and inject into its context window.</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {MEMORY_ACCESS.map(mem => (
                                            <label key={mem.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.memoryAccess.includes(mem.id)}
                                                    onChange={() => handleToggleArray('memoryAccess', mem.id)}
                                                    style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                                                />
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: formData.memoryAccess.includes(mem.id) ? '#0f172a' : '#64748b', fontWeight: formData.memoryAccess.includes(mem.id) ? 600 : 400 }}>
                                                    {mem.icon} {mem.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ padding: '24px 32px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto', background: '#f8fafc', borderRadius: '0 0 20px 20px', margin: '-32px' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}>
                                    {editingAgent ? 'Save Changes' : 'Build AI Agent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiAgentsSettingsPage;
