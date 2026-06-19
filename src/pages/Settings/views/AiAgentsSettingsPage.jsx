import React, { useState, useEffect } from 'react';
import { aiAgentsAPI, integrationSettingsAPI } from '../../../utils/api';
import toast from 'react-hot-toast';
import { Bot, Plus, Edit2, Trash2, Database, MessageSquare, Zap, Activity } from 'lucide-react';

const ROLES = ['Sales', 'Support', 'Marketing', 'Analysis', 'General'];
const USE_CASES = [
    { id: 'whatsapp_live', label: 'WhatsApp Automation' },
    { id: 'website_live_chat', label: 'Website Live Chat (Bot)' },
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
    const [seeding, setSeeding] = useState(false);

    const MARKETING_OS_AGENTS = [
        { name: 'Metrics Manager', role: 'Analysis', provider: 'gemini', modelName: 'gemini-1.5-pro', isActive: true, useCases: ['social_media','lead_qualification'], memoryAccess: ['leads','deals','communications'], systemPrompt: 'You are a marketing analytics AI for Bharat Properties, Kurukshetra. Analyze social media performance, campaign metrics, and CRM data. RESPONSIBILITIES: 1) Analyze 7-30 day content performance (likes, saves, shares, leads, CTR). 2) Identify top-performing content types. 3) Enforce 70% real estate project content rule. 4) Generate weekly reports with action items. POWERED BY: Google Gemini 1.5 Pro via AI Studio API.' },
        { name: 'Social Media Manager', role: 'Marketing', provider: 'openai', modelName: 'gpt-4o', isActive: true, useCases: ['social_media','email_drip'], memoryAccess: ['leads','inventory','deals'], systemPrompt: 'You are a social media content strategist for Bharat Properties, Kurukshetra. CONTENT RULES: 80% Project Posts, 10% Educational, 7% Trust, 3% Festival. CAPTION FORMULA: Hinglish hook + Location + Price + CTA + Hashtags. Platforms: Instagram, Facebook, WhatsApp, LinkedIn. Always inject property location, price point, and booking urgency. POWERED BY: OpenAI GPT-4o.' },
        { name: 'Designer (Visual AI)', role: 'Marketing', provider: 'gemini', modelName: 'gemini-1.5-flash', isActive: true, useCases: ['social_media'], memoryAccess: ['inventory','deals'], systemPrompt: 'You are a visual design AI for Bharat Properties. Generate DALL-E 3 image prompts, Runway v3 video prompts, and Canva layout instructions. BRAND: Navy Blue + Gold, cinematic, premium Indian real estate, Kurukshetra context. OUTPUT: For each post: 1) DALL-E prompt (no text, golden hour) 2) Runway prompt (smooth 4K drone) 3) Canva layout (colors, typography, CTA). POWERED BY: Google Gemini Flash (Nano).' },
        { name: 'Scheduling Manager', role: 'General', provider: 'gemini', modelName: 'gemini-1.5-pro', isActive: true, useCases: ['social_media','sms_automation','email_drip'], memoryAccess: ['leads','deals','communications'], systemPrompt: 'You are a scheduling optimization AI for Bharat Properties. Manage BullMQ content queue. TIMING RULES: Instagram ONLY 7-8:30 PM, WhatsApp 9 AM or 6 PM, Facebook 10 AM/3 PM/7 PM, LinkedIn 8:30 AM or 5:30 PM. QUEUE: BullMQ + Redis, 3 workers, retry 3x exponential backoff. OUTPUT: ISO timestamps, delay calculations, priority scores 1-10. POWERED BY: Google Gemini 1.5 Pro.' },
    ];

    const seedMarketingAgents = async () => {
        setSeeding(true);
        let created = 0, skipped = 0;
        for (const agentDef of MARKETING_OS_AGENTS) {
            try {
                const exists = agents.some(a => a.name === agentDef.name);
                if (exists) { skipped++; continue; }
                await aiAgentsAPI.create(agentDef);
                created++;
                await new Promise(r => setTimeout(r, 200));
            } catch(err) { console.error('Seed error:', err); }
        }
        await fetchData();
        setSeeding(false);
        if (created > 0) toast.success(`✅ ${created} Marketing OS agents created!`);
        if (skipped > 0) toast(`ℹ️ ${skipped} agents already exist`, { icon: '⚙️' });
    };

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

    const [availableProviders, setAvailableProviders] = useState(['openai', 'gemini']);
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
        <div style={{ padding: '32px 40px', background: 'var(--bg-light)', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Bot size={28} color="#3b82f6" /> AI Agent Hub
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
                        Build and manage custom AI personas with specific memory access and roles.
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'var(--bg-card)',
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
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
                    <Bot size={48} color='var(--border-color)' style={{ marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>No AI Agents Configured</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>Create your first specialized AI agent to automate your workflows.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                    {agents.map(agent => (
                        <div key={agent._id} style={{
                            background: 'var(--bg-card)',
                            borderRadius: '16px',
                            border: '1px solid var(--border-color)',
                            padding: '24px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{agent.name}</h3>
                                        <span style={{
                                            background: agent.isActive ? '#dcfce7' : 'var(--bg-light)',
                                            color: agent.isActive ? '#166534' : 'var(--text-muted)',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.7rem',
                                            fontWeight: 600
                                        }}>
                                            {agent.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <span style={{ color: '#3b82f6', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {typeof agent.role === 'object' ? agent.role?.name : agent.role} Agent
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleOpenModal(agent)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(agent._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <p style={{
                                color: 'var(--text-muted)',
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
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Memory Access</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {agent.memoryAccess?.length > 0 ? agent.memoryAccess.map(acc => (
                                            <span key={acc} style={{ background: 'var(--bg-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {MEMORY_ACCESS.find(m => m.id === acc)?.icon} {MEMORY_ACCESS.find(m => m.id === acc)?.label || acc}
                                            </span>
                                        )) : <span style={{ fontSize: '0.75rem', color: 'var(--border-color)' }}>No memory access</span>}
                                    </div>
                                </div>

                                <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Bot size={14} color="#3b82f6" /> 
                                        <strong>{agent.provider.toUpperCase()}</strong>: {agent.modelName}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status</span>
                                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                                            <input
                                                type="checkbox"
                                                checked={agent.isActive}
                                                onChange={() => handleToggleStatus(agent)}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: agent.isActive ? '#3b82f6' : 'var(--border-color)',
                                                transition: '.4s', borderRadius: '20px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', content: '""', height: '16px', width: '16px', left: '2px', bottom: '2px',
                                                    backgroundColor: 'var(--bg-card)', transition: '.4s', borderRadius: '50%',
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

            
            {/* ══ MARKETING OS AGENTS — Pre-seed section ══ */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '16px', padding: '24px', marginBottom: '28px', border: '1px solid rgba(66,133,244,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--bg-card)', marginBottom: '4px' }}>🤖 Marketing OS — AI Agent Configuration</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>4 specialized agents with model assignments for the Marketing Overview page</div>
                    </div>
                    <button onClick={seedMarketingAgents} disabled={seeding} style={{ background: 'linear-gradient(135deg, #4285f4 0%, #3b82f6 100%)', color: 'var(--bg-card)', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {seeding ? '⏳ Seeding...' : '⚡ Seed 4 Marketing Agents'}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    {[
                        { id: 'metrics', n: 'Metrics Manager', model: 'gemini-1.5-pro', provider: 'Google Gemini', icon: '📊', color: '#4285f4', task: 'Analytics · Performance · ROI tracking' },
                        { id: 'social', n: 'Social Media Manager', model: 'gpt-4o', provider: 'OpenAI GPT-4o', icon: '📅', color: '#10a37f', task: 'Content calendar · Hinglish captions · Strategy' },
                        { id: 'designer', n: 'Designer (Visual AI)', model: 'gemini-1.5-flash', provider: 'Google Gemini Flash', icon: '🎨', color: '#fbbc04', task: 'DALL-E prompts · Runway video · Canva layouts' },
                        { id: 'scheduler', n: 'Scheduling Manager', model: 'gemini-1.5-pro', provider: 'Google Gemini', icon: '⏱', color: '#ef4444', task: 'BullMQ queue · Timing optimization · Auto-publish' },
                    ].map(a => (
                        <div key={a.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${a.color}30`, borderRadius: '10px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{ width: '36px', height: '36px', background: `${a.color}20`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{a.icon}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--bg-card)', marginBottom: '2px' }}>{a.n}</div>
                                <div style={{ fontSize: '10px', color: a.color, fontWeight: 700, marginBottom: '4px' }}>{a.provider} · {a.model}</div>
                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{a.task}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Agent Builder Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: '20px', width: '90%', maxWidth: '800px', maxHeight: '90vh',
                        display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Bot size={24} color="#3b82f6" /> {editingAgent ? 'Edit AI Agent' : 'Build New AI Agent'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Agent Name <span style={{color: 'red'}}>*</span></label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Lead Engagement SDR"
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Agent Role <span style={{color: 'red'}}>*</span></label>
                                    <select
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-card)' }}
                                    >
                                        {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                                    System Prompt (Personality & Instructions) <span style={{color: 'red'}}>*</span>
                                </label>
                                <textarea
                                    required
                                    value={formData.systemPrompt}
                                    onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                                    placeholder="You are a professional real estate SDR. Your goal is to..."
                                    rows={6}
                                    style={{ width: '100%', padding: '14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'monospace' }}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>This defines how the AI will respond, its rules, tone, and goals.</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>AI Provider</label>
                                    <select
                                        value={formData.provider}
                                        onChange={e => setFormData({ ...formData, provider: e.target.value, modelName: e.target.value === 'openai' ? 'gpt-4o' : (e.target.value === 'anthropic' ? 'claude-3-5-sonnet-20240620' : 'gemini-1.5-pro') })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-card)' }}
                                    >
                                        {availableProviders.includes('openai') && <option value="openai">OpenAI (GPT)</option>}
                                        {availableProviders.includes('anthropic') && <option value="anthropic">Anthropic (Claude)</option>}
                                        {availableProviders.includes('gemini') && <option value="gemini">Google (Gemini)</option>}
                                        {availableProviders.length === 0 && <option value="openai">OpenAI (Default)</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Model Engine</label>
                                    <select
                                        value={formData.modelName}
                                        onChange={e => setFormData({ ...formData, modelName: e.target.value })}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-card)' }}
                                    >
                                        {formData.provider === 'openai' && (
                                            <>
                                                <option value="gpt-4o">GPT-4o — Social Media / Content</option>
                                                <option value="gpt-4o-mini">GPT-4o Mini — Fast & Efficient</option>
                                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                            </>
                                        )}
                                        {formData.provider === 'anthropic' && (
                                            <>
                                                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                                                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                                                <option value="claude-haiku-4-5-20251001">Claude 3 Haiku</option>
                                            </>
                                        )}
                                        {formData.provider === 'gemini' && (
                                            <>
                                                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Smarter)</option>
                                                <option value="gemini-pro">Gemini Pro (Classic/Most Compatible)</option>
                                                <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash Latest</option>
                                            </>
                                        )}
                                        {formData.provider === 'openai' && formData.modelName === 'gpt-4o' && null}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                {/* Use Cases Block */}
                                <div style={{ background: 'var(--bg-light)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>Target Use Cases</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {USE_CASES.filter(uc => availableChannels.length === 0 || availableChannels.includes(uc.id)).map(uc => (
                                            <label key={uc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
                                <div style={{ background: 'var(--bg-light)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>CRM Memory & Data Access</label>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>Select which CRM databases this AI is allowed to query and inject into its context window.</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {MEMORY_ACCESS.map(mem => (
                                            <label key={mem.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.memoryAccess.includes(mem.id)}
                                                    onChange={() => handleToggleArray('memoryAccess', mem.id)}
                                                    style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                                                />
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: formData.memoryAccess.includes(mem.id) ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: formData.memoryAccess.includes(mem.id) ? 600 : 400 }}>
                                                    {mem.icon} {mem.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ padding: '24px 32px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto', background: 'var(--bg-light)', borderRadius: '0 0 20px 20px', margin: '-32px' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: 'var(--bg-card)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}>
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
