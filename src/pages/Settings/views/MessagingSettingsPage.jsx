import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { whatsappTemplates, smsTemplates, rcsTemplates } from '../../../constants/templates';
import { systemSettingsAPI } from '../../../utils/api';
import { useWhatsAppTemplatesDb, useSaveWhatsAppTemplatesMutation, useSubmitWhatsAppTemplateMutation, useSyncWhatsAppTemplatesCommand } from '../../../utils/crmHooks';
import Swal from 'sweetalert2';
import { toast } from 'react-hot-toast';
import { Sparkles, ShieldCheck, MessageSquare, Clock, Globe, Settings, Database, History, Ban, Search, Copy, Check, X } from 'lucide-react';
import smsService from '../../../services/smsService';
import whatsappService from '../../../services/whatsappService';
import VariableTextarea from '../../../components/VariableTextarea';
import { renderWhatsAppFormattedText } from '../../../utils/whatsappFormatter';
import { DataTable } from '../../../components/ui/DataTable/DataTable';


// --- Sub-Components ---

const MessagingTemplateModal = ({ isOpen, onClose, channelType, initialData, onSave }) => {
    let isDark = false;
    try {
        const themeCtx = useTheme();
        isDark = themeCtx?.isDark || false;
    } catch (e) {
        isDark = false;
    }

    const [step, setStep] = useState(1);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [templateData, setTemplateData] = useState({
        name: '',
        channel: initialData?.channel || (channelType === 'whatsapp' ? 'web' : 'sms'),
        category: 'MARKETING',
        subCategory: 'DEFAULT',
        language: 'en_US',
        headerType: 'NONE',
        headerText: '',
        headerFile: null,
        body: '',
        footer: '',
        buttons: [],
        tags: [],
        shared: true,
        dltTemplateId: '',
        dltHeaderId: '',
        systemContext: initialData?.systemContext || [],
        variableMapping: {}
    });
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            if (initialData) {
                setTemplateData({
                    ...initialData,
                    channel: initialData.channel || (channelType === 'whatsapp' ? 'web' : 'sms'),
                    buttons: initialData.buttons || [],
                    tags: initialData.tags || [],
                    headerType: initialData.headerType || 'NONE',
                    subCategory: initialData.subCategory || 'DEFAULT',
                    variableMapping: initialData.variableMapping || {}
                });
            } else {
                setTemplateData({
                    name: '',
                    channel: channelType === 'whatsapp' ? 'web' : 'sms',
                    category: channelType === 'sms' ? 'Transactional' : 'MARKETING',
                    subCategory: 'DEFAULT',
                    language: 'en_US',
                    headerType: 'NONE',
                    headerText: '',
                    headerFile: null,
                    body: '',
                    footer: '',
                    buttons: [],
                    tags: [],
                    shared: true,
                    dltTemplateId: '',
                    dltHeaderId: '',
                    variableMapping: {}
                });
            }
        }
    }, [isOpen, initialData, channelType]);

    if (!isOpen) return null;

    const charCount = (templateData.body || '').length;
    const segments = Math.ceil(charCount / 160) || 1;
    const variableCount = (templateData.body.match(/\{\{([^{}]+)\}\}/g) || []).length;

    const addButton = () => {
        const maxBtns = channelType === 'whatsapp' ? 10 : (channelType === 'rcs' ? 4 : 3);
        if (templateData.buttons.length < maxBtns) {
            setTemplateData({
                ...templateData,
                buttons: [...templateData.buttons, { type: 'QUICK_REPLY', text: '' }]
            });
        }
    };

    const updateButton = (idx, field, value) => {
        const newButtons = [...templateData.buttons];
        newButtons[idx][field] = value;
        setTemplateData({ ...templateData, buttons: newButtons });
    };

    const removeButton = (idx) => {
        setTemplateData({
            ...templateData,
            buttons: templateData.buttons.filter((_, i) => i !== idx)
        });
    };

    const getChannelTheme = () => {
        if (channelType === 'whatsapp') {
            return {
                icon: 'fab fa-whatsapp',
                color: '#10b981',
                gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                bgLight: '#ecfdf5',
                borderLight: '#a7f3d0',
                badgeText: templateData.channel === 'web' ? 'WhatsApp Web (Instant Active)' : (templateData.channel === 'cloud_api' ? 'Meta Cloud API (Official)' : 'Universal (Web + Meta)'),
                label: 'WhatsApp'
            };
        }
        if (channelType === 'rcs') {
            return {
                icon: 'fas fa-mobile-alt',
                color: '#06b6d4',
                gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                bgLight: '#ecfeff',
                borderLight: '#a5f3fc',
                badgeText: 'Google Verified RCS Card',
                label: 'RCS'
            };
        }
        return {
            icon: 'fas fa-comment-dots',
            color: '#3b82f6',
            gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            bgLight: '#eff6ff',
            borderLight: '#bfdbfe',
            badgeText: 'DLT Verified SMS Alert',
            label: 'SMS'
        };
    };

    const cTheme = getChannelTheme();

    const renderWhatsAppStep1 = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.25s ease-out' }}>
            {/* 1. Target Channel Selection Tiles */}
            <div style={{
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                            Target WhatsApp Deployment Channel
                        </div>
                        <div style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            Choose whether this template is dispatched via WhatsApp Web (scanner bridge) or Meta Cloud API.
                        </div>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                        REQUIRED
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '14px' }}>
                    {[
                        {
                            id: 'web',
                            title: 'WhatsApp Web',
                            icon: 'fab fa-whatsapp',
                            badge: '⚡ Instant Active',
                            desc: 'Zero Meta verification delay • Markdown formatting • Auto clickable links',
                            accent: '#10b981',
                            bg: 'rgba(16, 185, 129, 0.06)'
                        },
                        {
                            id: 'cloud_api',
                            title: 'Meta Cloud API',
                            icon: 'fas fa-cloud',
                            badge: '🔵 Official WABA',
                            desc: 'Meta 24h compliance • Button cards & quick replies • Global delivery',
                            accent: '#3b82f6',
                            bg: 'rgba(59, 130, 246, 0.06)'
                        },
                        {
                            id: 'both',
                            title: 'Universal (All)',
                            icon: 'fas fa-globe',
                            badge: '🌐 Dual Delivery',
                            desc: 'Full hybrid support • Dispatches seamlessly on both Web and Meta API',
                            accent: '#8b5cf6',
                            bg: 'rgba(139, 92, 246, 0.06)'
                        }
                    ].map(ch => {
                        const isSelected = templateData.channel === ch.id;
                        return (
                            <div
                                key={ch.id}
                                onClick={() => setTemplateData({ ...templateData, channel: ch.id })}
                                style={{
                                    padding: '16px 14px',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    border: isSelected ? `2px solid ${ch.accent}` : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                    background: isSelected ? ch.bg : (isDark ? '#0f172a' : '#ffffff'),
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative',
                                    boxShadow: isSelected ? `0 4px 12px ${ch.accent}25` : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isSelected ? ch.accent : (isDark ? '#1e293b' : '#f1f5f9'), color: isSelected ? '#ffffff' : ch.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className={ch.icon} style={{ fontSize: '16px' }}></i>
                                    </div>
                                    <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: isSelected ? ch.accent : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'), color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569') }}>
                                        {ch.badge}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isSelected ? (isDark ? '#f8fafc' : ch.accent) : (isDark ? '#f8fafc' : '#1e293b') }}>
                                    {ch.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                                    {ch.desc}
                                </div>
                                {isSelected && (
                                    <div style={{ position: 'absolute', top: '10px', right: '10px', width: '8px', height: '8px', borderRadius: '50%', background: ch.accent }}></div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {templateData.channel === 'web' && (
                    <div style={{
                        marginTop: '14px',
                        padding: '12px 14px',
                        background: isDark ? 'rgba(16, 185, 129, 0.1)' : '#f0fdf4',
                        border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #bbf7d0',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="fas fa-bolt" style={{ fontSize: '13px' }}></i>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: isDark ? '#a7f3d0' : '#166534', lineHeight: '1.4' }}>
                            <strong>WhatsApp Web Mode Active:</strong> This template is immediately usable across Marketing Broadcasts, CRM Deals, and Follow-ups with full rich markdown formatting and zero Meta review waiting time.
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Category Selection Segmented Bar */}
            <div style={{
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', marginBottom: '4px' }}>
                    Template Category & Purpose
                </div>
                <div style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '14px' }}>
                    Categorize your template according to business objective for automated deliverability optimization.
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px',
                    background: isDark ? '#0f172a' : '#f1f5f9',
                    padding: '4px', borderRadius: '12px'
                }}>
                    {[
                        { id: 'MARKETING', label: 'Marketing & Deals', icon: 'fas fa-bullhorn', color: '#f59e0b' },
                        { id: 'UTILITY', label: 'Utility & Updates', icon: 'fas fa-bell', color: '#3b82f6' },
                        { id: 'AUTHENTICATION', label: 'Authentication', icon: 'fas fa-shield-alt', color: '#10b981' }
                    ].map(cat => {
                        const isSelected = templateData.category === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setTemplateData({ ...templateData, category: cat.id })}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: isSelected ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                                    color: isSelected ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <i className={cat.icon} style={{ color: cat.color }}></i>
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Subcategory options */}
                {(templateData.category === 'MARKETING' || templateData.category === 'UTILITY') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                        {(templateData.category === 'MARKETING' ? [
                            { id: 'DEFAULT', title: 'Standard Deal Broadcast', desc: 'Promote properties, broker deals, investment portfolios, and special offers.' },
                            { id: 'CATALOGUE', title: 'Product / Project Catalogue', desc: 'Connect property listings with media cards and structured pricing.' },
                            { id: 'FLOWS', title: 'Interactive WhatsApp Forms (Flows)', desc: 'Capture lead inquiry forms, site visit bookings, and buyer requirement surveys.' },
                            { id: 'ORDER_DETAILS', title: 'Token & Booking Details', desc: 'Send verified booking confirmations and token payment summaries.' },
                            { id: 'CALLING_PERMISSIONS', title: 'Call Permission Request', desc: 'Request phone call schedule permissions from prospective investors.' }
                        ] : [
                            { id: 'DEFAULT', title: 'Account & Deal Milestone', desc: 'Send critical milestone notifications regarding documentation, registry, and inspections.' },
                            { id: 'FLOWS', title: 'Feedback & Survey Flows', desc: 'Interactive forms for post-visit feedback, satisfaction surveys, and KYC.' },
                            { id: 'ORDER_STATUS', title: 'Transaction Status', desc: 'Live updates on agreement execution, bank approvals, and registry filing.' }
                        ]).map(sub => {
                            const isSubSelected = templateData.subCategory === sub.id;
                            return (
                                <div
                                    key={sub.id}
                                    onClick={() => setTemplateData({ ...templateData, subCategory: sub.id })}
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        border: isSubSelected ? '2px solid #0284c7' : (isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'),
                                        background: isSubSelected ? (isDark ? 'rgba(2, 132, 199, 0.1)' : '#f0f9ff') : (isDark ? '#0f172a' : '#fafafa'),
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '12px',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <div style={{ marginTop: '2px' }}>
                                        <div style={{
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            border: `2px solid ${isSubSelected ? '#0284c7' : '#94a3b8'}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {isSubSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }}></div>}
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isSubSelected ? '#0369a1' : (isDark ? '#f8fafc' : '#1e293b') }}>
                                            {sub.title}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                                            {sub.desc}
                                        </div>

                                        {isSubSelected && sub.id === 'FLOWS' && (
                                            <div style={{ marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: '4px' }}>
                                                    WhatsApp Flow ID <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 123456789012345"
                                                    value={templateData.flowId || ''}
                                                    onChange={e => setTemplateData({ ...templateData, flowId: e.target.value })}
                                                    style={{ width: '100%', padding: '8px 12px', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#fff' : '#000', fontSize: '0.82rem' }}
                                                />
                                            </div>
                                        )}

                                        {isSubSelected && sub.id === 'CATALOGUE' && (
                                            <div style={{ marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569', display: 'block', marginBottom: '4px' }}>
                                                    Meta Catalogue ID <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 987654321098765"
                                                    value={templateData.catalogueId || ''}
                                                    onChange={e => setTemplateData({ ...templateData, catalogueId: e.target.value })}
                                                    style={{ width: '100%', padding: '8px 12px', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1', borderRadius: '6px', background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#fff' : '#000', fontSize: '0.82rem' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    const renderWhatsAppStep2 = () => {
        const cardBg = isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff';
        const cardBorder = isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0';
        const inputBg = isDark ? '#1e293b' : '#ffffff';
        const inputBorder = isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1';
        const textMain = isDark ? '#f8fafc' : '#0f172a';
        const textMuted = isDark ? '#94a3b8' : '#64748b';

        // Count variables in body
        const detectedVars = (templateData.body.match(/\{\{[^}]+\}\}/g) || []).length;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease-out' }}>
                {/* ── Card 1: Template Identity & Language ───────────────────────── */}
                <div style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                        }}>
                            <i className="fas fa-fingerprint" style={{ fontSize: '15px' }}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: textMain }}>
                                Template Identity & Localization
                            </div>
                            <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                Unique identifier slug and primary language for recipient delivery.
                            </div>
                        </div>
                        {templateData.name && (
                            <span style={{
                                fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                                background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                color: '#6366f1', fontFamily: 'monospace'
                            }}>
                                slug: {templateData.name}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: textMuted, display: 'block', marginBottom: '6px' }}>
                                Template Name (slug) <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: inputBorder, borderRadius: '8px',
                                    background: inputBg, color: textMain,
                                    fontSize: '0.86rem', outline: 'none'
                                }}
                                placeholder="e.g. deal_alert_featured_villa"
                                value={templateData.name}
                                onChange={e => setTemplateData({ ...templateData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                            />
                            {/* Quick Name Suggestions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.68rem', color: textMuted }}>Quick:</span>
                                {[
                                    'deal_alert_featured',
                                    'site_visit_reminder',
                                    'exclusive_property_pitch',
                                    'token_booking_receipt'
                                ].map(sug => (
                                    <button
                                        key={sug}
                                        type="button"
                                        onClick={() => setTemplateData({ ...templateData, name: sug })}
                                        style={{
                                            border: 'none', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                            color: textMuted, padding: '2px 8px', borderRadius: '4px',
                                            fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'monospace'
                                        }}
                                    >
                                        +{sug}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: textMuted, display: 'block', marginBottom: '6px' }}>
                                Language
                            </label>
                            <select
                                value={templateData.language}
                                onChange={e => setTemplateData({ ...templateData, language: e.target.value })}
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: inputBorder, borderRadius: '8px',
                                    background: inputBg, color: textMain,
                                    fontSize: '0.86rem', outline: 'none'
                                }}
                            >
                                <option value="en_US">English (US)</option>
                                <option value="en_GB">English (UK)</option>
                                <option value="hi">Hindi (हिन्दी)</option>
                                <option value="gu">Gujarati (ગુજરાતી)</option>
                                <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                                <option value="mr">Marathi (मराठी)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── Card 2: Header Component (Optional) ────────────────────────── */}
                <div style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <i className="fas fa-heading" style={{ fontSize: '15px' }}></i>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: textMain }}>
                                    Header Component <span style={{ fontSize: '0.75rem', fontWeight: 400, color: textMuted }}>• Optional</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                    Add an eye-catching announcement headline, property photo, or brochure PDF.
                                </div>
                            </div>
                        </div>

                        {templateData.headerType !== 'NONE' && (
                            <button
                                type="button"
                                onClick={() => setTemplateData({ ...templateData, headerType: 'NONE', headerText: '', headerFile: null })}
                                style={{
                                    border: 'none', background: 'transparent', color: '#ef4444',
                                    fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <i className="fas fa-times-circle"></i> Remove Header
                            </button>
                        )}
                    </div>

                    {/* Header Type Selector Buttons */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px',
                        background: isDark ? '#0f172a' : '#f1f5f9',
                        padding: '4px', borderRadius: '10px', marginBottom: '14px'
                    }}>
                        {[
                            { id: 'NONE', label: 'None', icon: 'fas fa-ban' },
                            { id: 'TEXT', label: 'Text Headline', icon: 'fas fa-font' },
                            { id: 'IMAGE', label: 'Image', icon: 'fas fa-image' },
                            { id: 'DOCUMENT', label: 'Document (PDF)', icon: 'fas fa-file-pdf' },
                            { id: 'VIDEO', label: 'Video', icon: 'fas fa-video' }
                        ].map(ht => {
                            const isSelected = templateData.headerType === ht.id;
                            return (
                                <button
                                    key={ht.id}
                                    type="button"
                                    onClick={() => setTemplateData({ ...templateData, headerType: ht.id })}
                                    style={{
                                        padding: '8px 6px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: isSelected ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                                        color: isSelected ? (isDark ? '#f8fafc' : '#0f172a') : textMuted,
                                        fontWeight: isSelected ? 800 : 600,
                                        fontSize: '0.74rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: isSelected ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <i className={ht.icon} style={{ color: isSelected ? '#3b82f6' : 'inherit' }}></i>
                                    <span>{ht.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Header Text Input */}
                    {templateData.headerType === 'TEXT' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="e.g. 🏡 AVAILABLE FOR SALE 🏡 or {{projectName}} Deal Alert"
                                    value={templateData.headerText || ''}
                                    onChange={e => setTemplateData({ ...templateData, headerText: e.target.value })}
                                    style={{
                                        width: '100%', padding: '10px 14px',
                                        border: inputBorder, borderRadius: '8px',
                                        background: inputBg, color: textMain,
                                        fontSize: '0.88rem', outline: 'none'
                                    }}
                                    maxLength={60}
                                />
                                <span style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '0.7rem', color: textMuted
                                }}>
                                    {(templateData.headerText || '').length}/60
                                </span>
                            </div>

                            {/* Quick Emoji Bar */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', borderRadius: '8px',
                                background: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted }}>Quick Headline Icons:</span>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { emoji: '🏡', label: 'Available' },
                                        { emoji: '🎯', label: 'Deal Alert' },
                                        { emoji: '📢', label: 'Notice' },
                                        { emoji: '🔥', label: 'Hot Deal' },
                                        { emoji: '✨', label: 'Luxury' },
                                        { emoji: '⭐', label: 'Verified' },
                                        { emoji: '🏢', label: 'Commercial' },
                                        { emoji: '💰', label: 'Price Drop' }
                                    ].map(item => (
                                        <button
                                            key={item.emoji}
                                            type="button"
                                            onClick={() => {
                                                const current = templateData.headerText || '';
                                                setTemplateData({
                                                    ...templateData,
                                                    headerText: current ? `${current} ${item.emoji}` : `${item.emoji} `
                                                });
                                            }}
                                            style={{
                                                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                                background: isDark ? '#1e293b' : '#ffffff',
                                                borderRadius: '6px', padding: '3px 8px',
                                                fontSize: '0.76rem', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                color: textMain
                                            }}
                                            title={`Add ${item.emoji} ${item.label}`}
                                        >
                                            <span>{item.emoji}</span>
                                            <span style={{ fontSize: '0.68rem', color: textMuted }}>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Media Upload Zone */}
                    {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType) && (
                        <div style={{
                            position: 'relative',
                            padding: '24px 16px',
                            border: '2px dashed #3b82f6',
                            borderRadius: '12px',
                            textAlign: 'center',
                            background: isDark ? 'rgba(59, 130, 246, 0.05)' : '#eff6ff',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}>
                            <input
                                type="file"
                                accept={templateData.headerType === 'IMAGE' ? 'image/*' : templateData.headerType === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'}
                                onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setTemplateData({
                                                ...templateData,
                                                headerFile: { name: file.name, type: file.type, data: reader.result, size: file.size }
                                            });
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                            />
                            {templateData.headerFile ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '10px',
                                        background: '#dbeafe', color: '#1e40af',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                                    }}>
                                        <i className="fas fa-file-check"></i>
                                    </div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#1e40af' }}>
                                        {templateData.headerFile.name}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                        Click or drop to replace media file
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '42px', height: '42px', borderRadius: '10px',
                                        background: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#3b82f6', fontSize: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                                    }}>
                                        <i className={templateData.headerType === 'IMAGE' ? 'fas fa-cloud-upload-alt' : templateData.headerType === 'VIDEO' ? 'fas fa-video' : 'fas fa-file-pdf'}></i>
                                    </div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: textMain }}>
                                        Drag & drop or click to upload sample {templateData.headerType.toLowerCase()}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                        Supports JPG, PNG (Max 5MB) or PDF brochures (Max 100MB)
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Card 3: Message Body (Core Content) ────────────────────────── */}
                <div style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <i className="fas fa-align-left" style={{ fontSize: '15px' }}></i>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: textMain }}>
                                    Message Body <span style={{ color: '#ef4444' }}>*</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                    Formatting toolbar (*bold*, _italic_), font styler, emojis, and auto deal variables.
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {detectedVars > 0 && (
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                    background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7',
                                    color: '#059669'
                                }}>
                                    <i className="fas fa-database" style={{ marginRight: '4px' }}></i>
                                    {detectedVars} Variable{detectedVars > 1 ? 's' : ''} Detected
                                </span>
                            )}
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 700,
                                color: templateData.body.length > 1000 ? '#ef4444' : textMuted
                            }}>
                                {templateData.body.length}/1024
                            </span>
                        </div>
                    </div>

                    <VariableTextarea
                        minHeight="170px"
                        placeholder="Enter your high-converting WhatsApp message body here... e.g.
🏡 *Available For Sale* 🏡

🎯 *Location:* {{location}}
👉 *Property:* {{deal_title}}
👉 *Size:* {{size}}
👉 *Direction:* {{direction}}
👉 *Road:* {{road_width}}
👉 *Facing:* {{facing}}

💰 *Asking Price:* {{price}}

*Bharat Properties*
Suraj Keshwar
☎️ 9991333570"
                        value={templateData.body}
                        onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                    />
                </div>

                {/* ── Card 4: Footer Component (Optional) ────────────────────────── */}
                <div style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <i className="fas fa-shoe-prints" style={{ fontSize: '15px' }}></i>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: textMain }}>
                                    Footer Component <span style={{ fontSize: '0.75rem', fontWeight: 400, color: textMuted }}>• Optional</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                    Subtle signature, disclaimers, or verified contact info.
                                </div>
                            </div>
                        </div>

                        {templateData.channel === 'web' ? (
                            <span style={{ fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                <i className="fab fa-whatsapp" style={{ marginRight: '4px' }}></i> WhatsApp Web (Max 140 chars)
                            </span>
                        ) : (
                            <span style={{ fontSize: '0.7rem', color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                Meta API (Max 60 chars)
                            </span>
                        )}
                    </div>

                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                        <input
                            type="text"
                            placeholder={templateData.channel === 'web' ? "e.g. *Bharat Properties* • Suraj Keshwar • ☎️ 9991333570" : "Add a short line of text to the bottom..."}
                            value={templateData.footer || ''}
                            onChange={e => setTemplateData({ ...templateData, footer: e.target.value })}
                            style={{
                                width: '100%', padding: '10px 14px',
                                border: inputBorder, borderRadius: '8px',
                                background: inputBg, color: textMain,
                                fontSize: '0.86rem', outline: 'none'
                            }}
                            maxLength={templateData.channel === 'web' ? 140 : 60}
                        />
                        <span style={{
                            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.7rem', color: textMuted
                        }}>
                            {(templateData.footer || '').length}/{templateData.channel === 'web' ? 140 : 60}
                        </span>
                    </div>

                    {/* Quick Contact Emojis */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: textMuted }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>Quick Contact Icons:</span>
                            {['☎️', '📞', '🌐', '📍', '🏢', '🤝'].map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => setTemplateData({ ...templateData, footer: (templateData.footer || '') + (templateData.footer ? ' ' : '') + emoji })}
                                    style={{
                                        cursor: 'pointer', padding: '2px 6px', fontSize: '0.85rem',
                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                                        background: isDark ? '#1e293b' : '#ffffff',
                                        borderRadius: '4px'
                                    }}
                                    title={`Add ${emoji}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Card 5: Interactive Call-to-Actions (Buttons) ──────────────── */}
                <div style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <i className="fas fa-hand-pointer" style={{ fontSize: '15px' }}></i>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: textMain }}>
                                    Interactive Buttons & Action Prompts <span style={{ fontSize: '0.75rem', fontWeight: 400, color: textMuted }}>• Optional</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: textMuted }}>
                                    {templateData.channel === 'web'
                                        ? 'Deliverability optimization for WhatsApp Web mode.'
                                        : 'Add interactive quick reply, website visit, or WhatsApp voice call buttons.'}
                                </div>
                            </div>
                        </div>

                        {templateData.channel !== 'web' && templateData.buttons.length < 10 && (
                            <button
                                type="button"
                                onClick={addButton}
                                style={{
                                    fontSize: '0.78rem', color: '#0284c7', background: isDark ? 'rgba(2, 132, 199, 0.15)' : '#e0f2fe',
                                    border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '8px',
                                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <i className="fas fa-plus"></i> Add Button
                            </button>
                        )}
                    </div>

                    {/* WhatsApp Web Notice with Action Shortcuts */}
                    {templateData.channel === 'web' ? (
                        <div style={{
                            padding: '16px',
                            background: isDark ? 'rgba(2, 132, 199, 0.08)' : '#f0f9ff',
                            border: isDark ? '1px dashed rgba(2, 132, 199, 0.3)' : '1px dashed #7dd3fc',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: '#0284c7', color: '#ffffff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                }}>
                                    <i className="fab fa-whatsapp" style={{ fontSize: '20px' }}></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: isDark ? '#38bdf8' : '#0369a1' }}>
                                        Interactive Buttons Hidden for WhatsApp Web (Optimal Deliverability)
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: textMuted, marginTop: '4px', lineHeight: '1.5' }}>
                                        WhatsApp Web does not support native clickable button cards. To include links or contact prompts, simply add <code>https://...</code> URLs or phone numbers directly into your body text — WhatsApp renders them as auto-clickable links on recipient phones with <strong>zero ban risk</strong>. Header and Footer are seamlessly formatted with your message.
                                    </div>
                                </div>
                            </div>

                            {/* Quick Body Injection Shortcuts */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                                paddingTop: '8px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e0f2fe'
                            }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: textMuted }}>Quick Links to insert in body:</span>
                                {[
                                    { label: '🌐 Website Link', snippet: '\n\n🌐 Visit Website: https://bharatproperties.co' },
                                    { label: '☎️ Office Phone', snippet: '\n\n☎️ Call Office: +91 9991333570' },
                                    { label: '📍 Google Map', snippet: '\n\n📍 Office Location: https://maps.google.com' }
                                ].map(shortcut => (
                                    <button
                                        key={shortcut.label}
                                        type="button"
                                        onClick={() => setTemplateData({ ...templateData, body: (templateData.body || '') + shortcut.snippet })}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px',
                                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #bae6fd',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            color: '#0284c7', fontSize: '0.74rem', fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Add {shortcut.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {templateData.buttons.length === 0 ? (
                                <div style={{
                                    padding: '20px', textAlign: 'center', color: textMuted,
                                    border: isDark ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed #cbd5e1',
                                    borderRadius: '10px', fontSize: '0.8rem'
                                }}>
                                    No buttons added yet. Click <strong>+ Add Button</strong> above to attach interactive links or call actions.
                                </div>
                            ) : (
                                templateData.buttons.map((btn, i) => (
                                    <div key={i} style={{
                                        display: 'flex', flexDirection: 'column', gap: '10px',
                                        background: isDark ? '#1e293b' : '#f8fafc',
                                        padding: '14px', borderRadius: '10px',
                                        border: cardBorder
                                    }}>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <select
                                                value={btn.type}
                                                onChange={e => updateButton(i, 'type', e.target.value)}
                                                style={{
                                                    padding: '8px 10px', border: inputBorder,
                                                    borderRadius: '6px', fontSize: '0.84rem',
                                                    background: inputBg, color: textMain, flex: 1
                                                }}
                                            >
                                                <option value="QUICK_REPLY">Custom (Quick Reply)</option>
                                                <option value="URL">Visit website</option>
                                                <option value="VOICE_CALL">Call on WhatsApp</option>
                                                <option value="PHONE">Call phone number</option>
                                                <option value="FLOW">Complete flow</option>
                                                <option value="COPY_CODE">Copy offer code</option>
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="Button text (e.g. Schedule Visit)"
                                                value={btn.text}
                                                onChange={e => updateButton(i, 'text', e.target.value)}
                                                style={{
                                                    flex: 2, padding: '8px 12px',
                                                    border: inputBorder, borderRadius: '6px',
                                                    fontSize: '0.84rem', background: inputBg, color: textMain
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeButton(i)}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: '#ef4444', padding: '6px 10px', fontSize: '0.88rem'
                                                }}
                                                title="Delete button"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>

                                        {btn.type === 'URL' && (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <select
                                                    value={btn.url_type || 'STATIC'}
                                                    onChange={e => updateButton(i, 'url_type', e.target.value)}
                                                    style={{
                                                        padding: '8px 10px', border: inputBorder,
                                                        borderRadius: '6px', fontSize: '0.84rem',
                                                        background: inputBg, color: textMain, flex: 1
                                                    }}
                                                >
                                                    <option value="STATIC">Static URL</option>
                                                    <option value="DYNAMIC">Dynamic URL</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Website URL (e.g. https://bharatproperties.co)"
                                                    value={btn.url || ''}
                                                    onChange={e => updateButton(i, 'url', e.target.value)}
                                                    onBlur={e => {
                                                        let val = e.target.value.trim();
                                                        if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                                                            val = 'https://' + val;
                                                        }
                                                        if (btn.url_type === 'DYNAMIC' && !val.includes('{{1}}')) {
                                                            val += '{{1}}';
                                                        }
                                                        updateButton(i, 'url', val);
                                                    }}
                                                    style={{
                                                        flex: 3, padding: '8px 12px',
                                                        border: inputBorder, borderRadius: '6px',
                                                        fontSize: '0.84rem', background: inputBg, color: textMain
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {btn.type === 'VOICE_CALL' && (
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <label style={{ fontSize: '0.82rem', color: textMuted, whiteSpace: 'nowrap' }}>Active for:</label>
                                                <select
                                                    value={btn.ttl_minutes || '10080'}
                                                    onChange={e => updateButton(i, 'ttl_minutes', e.target.value)}
                                                    style={{
                                                        padding: '8px 10px', border: inputBorder,
                                                        borderRadius: '6px', fontSize: '0.84rem',
                                                        background: inputBg, color: textMain, flex: 1
                                                    }}
                                                >
                                                    <option value="1440">1 day</option>
                                                    <option value="4320">3 days</option>
                                                    <option value="10080">7 days</option>
                                                </select>
                                            </div>
                                        )}

                                        {btn.type === 'PHONE' && (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <select
                                                    value={btn.country_code || '+91'}
                                                    onChange={e => updateButton(i, 'country_code', e.target.value)}
                                                    style={{
                                                        padding: '8px 10px', border: inputBorder,
                                                        borderRadius: '6px', fontSize: '0.84rem',
                                                        background: inputBg, color: textMain, flex: 1
                                                    }}
                                                >
                                                    <option value="+91">India (+91)</option>
                                                    <option value="+1">US (+1)</option>
                                                    <option value="+44">UK (+44)</option>
                                                    <option value="+971">UAE (+971)</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Phone number (e.g. 9991333570)"
                                                    value={btn.phone_number || ''}
                                                    onChange={e => updateButton(i, 'phone_number', e.target.value.replace(/\D/g, ''))}
                                                    style={{
                                                        flex: 3, padding: '8px 12px',
                                                        border: inputBorder, borderRadius: '6px',
                                                        fontSize: '0.84rem', background: inputBg, color: textMain
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {btn.type === 'FLOW' && (
                                            <input
                                                type="text"
                                                placeholder="Flow ID (e.g. 1234567890)"
                                                value={btn.flow_id || ''}
                                                onChange={e => updateButton(i, 'flow_id', e.target.value)}
                                                style={{
                                                    width: '100%', padding: '8px 12px',
                                                    border: inputBorder, borderRadius: '6px',
                                                    fontSize: '0.84rem', background: inputBg, color: textMain
                                                }}
                                            />
                                        )}

                                        {btn.type === 'COPY_CODE' && (
                                            <input
                                                type="text"
                                                placeholder="Offer code (e.g. BHARAT50)"
                                                value={btn.example || ''}
                                                onChange={e => updateButton(i, 'example', e.target.value)}
                                                style={{
                                                    width: '100%', padding: '8px 12px',
                                                    border: inputBorder, borderRadius: '6px',
                                                    fontSize: '0.84rem', background: inputBg, color: textMain
                                                }}
                                            />
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };


    const renderRCSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Same as original RCS fields */}
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Rich Media (Card)</label>
                <div style={{ padding: '24px', border: '2px dashed rgba(148, 163, 184, 0.15)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-light)' }}>
                    <i className="fas fa-images" style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block' }}></i>
                    <span style={{ fontSize: '0.85rem' }}>Upload High-Res Image or Video</span>
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>RCS Body Text <span style={{ color: '#ef4444' }}>*</span></label>
                <VariableTextarea
                    minHeight="100px"
                    placeholder="Enter your rich message content..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Suggested Actions (Max 4)</label>
                    {templateData.buttons.length < 4 && <button onClick={() => setTemplateData({ ...templateData, buttons: [...templateData.buttons, { type: 'URL', text: '' }] })} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>+ Add Action</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templateData.buttons.map((btn, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select value={btn.type} onChange={e => updateButton(i, 'type', e.target.value)} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <option value="URL">Open Website</option>
                                <option value="PHONE">Dial Number</option>
                                <option value="MAP">Show Location</option>
                                <option value="CALENDAR">Add Event</option>
                            </select>
                            <input type="text" placeholder="Action Label" value={btn.text} onChange={e => updateButton(i, 'text', e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.8rem' }} />
                            <i className="fas fa-trash-alt" style={{ color: 'var(--border-color)', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeButton(i)}></i>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderSMSFields = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Same as original SMS fields */}
            <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Message Body <span style={{ color: '#ef4444' }}>*</span></label>
                <VariableTextarea
                    minHeight="180px"
                    placeholder="Enter your SMS content here..."
                    value={templateData.body}
                    onChange={e => setTemplateData({ ...templateData, body: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', background: 'var(--bg-light)', padding: '10px 16px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Characters: <span style={{ fontWeight: 700, color: charCount > 160 ? '#f59e0b' : 'var(--text-main)' }}>{charCount}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Segments: <span style={{ fontWeight: 700, color: segments > 1 ? '#f59e0b' : 'var(--text-main)' }}>{segments}</span> / 160 chars
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Category</label>
                    <select
                        value={templateData.category}
                        onChange={e => setTemplateData({ ...templateData, category: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    >
                        <option value="Promotional">Promotional</option>
                        <option value="Transactional">Transactional</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>DLT Template ID</label>
                    <input
                        type="text"
                        placeholder="e.g. 12071234567890"
                        value={templateData.dltTemplateId || ''}
                        onChange={e => setTemplateData({ ...templateData, dltTemplateId: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>DLT Header/Sender ID</label>
                    <input
                        type="text"
                        placeholder="e.g. BHARAT"
                        value={templateData.dltHeaderId || ''}
                        onChange={e => setTemplateData({ ...templateData, dltHeaderId: e.target.value })}
                        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                </div>
            </div>
        </div>
    );

    const getChannelIcon = () => {
        switch (channelType) {
            case 'whatsapp': return 'fab fa-whatsapp';
            case 'rcs': return 'fas fa-comment-dots';
            default: return 'fas fa-comment-alt';
        }
    };

    const getChannelTitle = () => {
        switch (channelType) {
            case 'whatsapp': return 'WhatsApp';
            case 'rcs': return 'RCS';
            default: return 'SMS';
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '16px', overflowY: 'auto'
        }}>
            <div style={{
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
                borderRadius: '20px',
                width: '100%', maxWidth: '1180px', maxHeight: '92vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden'
            }}>
                {/* ── Modal Top Header ────────────────────────────────────────── */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: channelType === 'whatsapp'
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : channelType === 'rcs'
                                    ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
                                    : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: channelType === 'whatsapp'
                                ? '0 4px 12px rgba(16, 185, 129, 0.35)'
                                : channelType === 'rcs'
                                    ? '0 4px 12px rgba(6, 182, 212, 0.35)'
                                    : '0 4px 12px rgba(59, 130, 246, 0.35)',
                            color: '#fff'
                        }}>
                            <i className={getChannelIcon()} style={{ fontSize: '20px' }}></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                    {channelType === 'whatsapp'
                                        ? (step === 1 ? 'Create WhatsApp Template' : 'Edit WhatsApp Template')
                                        : `Add ${getChannelTitle()} Template`}
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px',
                                    background: templateData.channel === 'web' ? '#ecfdf5' : '#eff6ff',
                                    color: templateData.channel === 'web' ? '#047857' : '#1d4ed8',
                                    border: templateData.channel === 'web' ? '1px solid #a7f3d0' : '1px solid #bfdbfe'
                                }}>
                                    <i className={`fas ${templateData.channel === 'web' ? 'fa-globe' : 'fa-bolt'}`} style={{ marginRight: '5px' }}></i>
                                    {templateData.channel === 'web'
                                        ? 'WhatsApp Web Engine'
                                        : (templateData.channel === 'cloud_api' ? 'Meta Cloud API' : (channelType === 'rcs' ? 'RCS Verified' : 'DLT SMS'))}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                    <i className="far fa-clock" style={{ color: '#10b981', fontSize: '11px' }}></i>
                                    <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    <span style={{ opacity: 0.4 }}>•</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
                                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                    </span>
                                </div>
                                <span style={{ opacity: 0.3 }}>•</span>
                                <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                    Enterprise Omnichannel Delivery
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Step Navigation Pills for WhatsApp */}
                    {channelType === 'whatsapp' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: isDark ? '#1e293b' : '#f1f5f9',
                            padding: '4px 6px', borderRadius: '12px',
                            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0'
                        }}>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                                    background: step === 1 ? (isDark ? '#0f172a' : '#ffffff') : 'transparent',
                                    color: step === 1 ? '#10b981' : (isDark ? '#94a3b8' : '#64748b'),
                                    fontWeight: step === 1 ? 800 : 600, fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    boxShadow: step === 1 ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span style={{
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: step === 1 ? '#10b981' : (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1'),
                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800
                                }}>
                                    1
                                </span>
                                <span>Setup & Channel</span>
                            </button>

                            <i className="fas fa-chevron-right" style={{ fontSize: '10px', color: isDark ? '#64748b' : '#cbd5e1' }}></i>

                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                                    background: step === 2 ? (isDark ? '#0f172a' : '#ffffff') : 'transparent',
                                    color: step === 2 ? '#10b981' : (isDark ? '#94a3b8' : '#64748b'),
                                    fontWeight: step === 2 ? 800 : 600, fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    boxShadow: step === 2 ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span style={{
                                    width: '18px', height: '18px', borderRadius: '50%',
                                    background: step === 2 ? '#10b981' : (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1'),
                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800
                                }}>
                                    2
                                </span>
                                <span>Content & Formatting</span>
                            </button>
                        </div>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                            color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b'}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* ── Modal Body (Dual-Pane Layout) ─────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left Panel: Form */}
                    <div style={{
                        flex: 3.4, padding: '24px', overflowY: 'auto',
                        borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                        display: 'flex', flexDirection: 'column', gap: '20px'
                    }}>
                        {channelType === 'whatsapp' ? (
                            step === 1 ? renderWhatsAppStep1() : renderWhatsAppStep2()
                        ) : channelType === 'rcs' ? (
                            <>
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '16px', padding: '18px'
                                }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '8px' }}>
                                        Template Name <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', padding: '12px 14px', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#fff' : '#000' }}
                                        placeholder="e.g. lead_follow_up_rcs"
                                        value={templateData.name}
                                        onChange={e => setTemplateData({ ...templateData, name: e.target.value })}
                                    />
                                </div>
                                {renderRCSFields()}
                            </>
                        ) : (
                            <>
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '16px', padding: '18px'
                                }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '8px' }}>
                                        Template Name <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', padding: '12px 14px', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#fff' : '#000' }}
                                        placeholder="e.g. dlt_deal_alert"
                                        value={templateData.name}
                                        onChange={e => setTemplateData({ ...templateData, name: e.target.value })}
                                    />
                                </div>
                                {renderSMSFields()}
                            </>
                        )}

                        {/* CRM Internal Settings & Tags Card */}
                        <div style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                            borderRadius: '16px', padding: '18px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                                }}>
                                    <i className="fas fa-users-cog" style={{ fontSize: '15px' }}></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                        Enterprise CRM Access & Tags
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                        Configure team-wide sharing permissions and tagging for rapid search.
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: isDark ? '#1e293b' : '#f8fafc', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '0.84rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', display: 'block' }}>
                                        Share with everyone on team
                                    </label>
                                    <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                        Allow all agents and managers to use this template in broadcasts.
                                    </div>
                                </div>
                                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '22px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={templateData.shared !== false}
                                        onChange={e => setTemplateData({ ...templateData, shared: e.target.checked })}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: templateData.shared !== false ? '#10b981' : (isDark ? '#475569' : '#cbd5e1'),
                                        transition: '.3s', borderRadius: '22px'
                                    }}>
                                        <span style={{
                                            position: 'absolute', content: '""', height: '16px', width: '16px',
                                            left: templateData.shared !== false ? '17px' : '3px', bottom: '3px',
                                            backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                                        }}></span>
                                    </span>
                                </label>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>
                                    Assign Filter Tags
                                </label>
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                    borderRadius: '8px', minHeight: '42px', alignItems: 'center',
                                    background: isDark ? '#1e293b' : '#ffffff'
                                }}>
                                    {templateData.tags.map(tag => (
                                        <div key={tag} style={{
                                            background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                            padding: '3px 10px', borderRadius: '6px', fontSize: '0.78rem',
                                            color: isDark ? '#a5b4fc' : '#4338ca', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600
                                        }}>
                                            {tag}
                                            <i
                                                className="fas fa-times"
                                                style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                                                onClick={() => setTemplateData({ ...templateData, tags: templateData.tags.filter(t => t !== tag) })}
                                            ></i>
                                        </div>
                                    ))}
                                    <input
                                        type="text"
                                        style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px', fontSize: '0.84rem', background: 'transparent', color: isDark ? '#f8fafc' : '#0f172a' }}
                                        placeholder={templateData.tags.length === 0 ? "Press Enter to add tag (e.g. VIP, Luxury, Plots)..." : ""}
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && tagInput.trim()) {
                                                e.preventDefault();
                                                setTemplateData({ ...templateData, tags: [...templateData.tags, tagInput.trim()] });
                                                setTagInput('');
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Photorealistic Smartphone Simulator */}
                    <div style={{
                        flex: 2.6, padding: '24px',
                        background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px'
                    }}>
                        {/* Simulator Top Badge */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px 12px', borderRadius: '10px',
                            background: isDark ? '#1e293b' : '#ffffff',
                            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '0.5px' }}>
                                {channelType === 'whatsapp'
                                    ? (templateData.channel === 'web' ? 'WHATSAPP WEB SIMULATOR' : 'WHATSAPP CLOUD API SIMULATOR')
                                    : (channelType === 'rcs' ? 'RCS RICH CARD SIMULATOR' : 'SMS SIMULATOR')}
                            </span>
                        </div>

                        {/* Photorealistic Smartphone Frame */}
                        <div style={{
                            width: '300px', height: '590px',
                            background: '#111827',
                            borderRadius: '40px',
                            border: '9px solid #1f2937',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45), inset 0 0 2px 2px rgba(255,255,255,0.08)',
                            position: 'relative', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column'
                        }}>
                            {/* Dynamic Island Notch */}
                            <div style={{
                                position: 'absolute', top: '7px', left: '50%', transform: 'translateX(-50%)',
                                width: '90px', height: '22px',
                                background: '#000000',
                                borderRadius: '20px', zIndex: 30,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '0 8px'
                            }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1e293b' }}></div>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#0284c7' }}></div>
                            </div>

                            {/* Status Bar */}
                            <div style={{
                                height: '28px', background: channelType === 'whatsapp' ? '#075e54' : (channelType === 'rcs' ? '#0f172a' : '#1e293b'),
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 16px 0 16px', color: '#ffffff', fontSize: '11px', fontWeight: 800,
                                zIndex: 10
                            }}>
                                <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '9px' }}>5G</span>
                                    <i className="fas fa-wifi" style={{ fontSize: '9px' }}></i>
                                    <div style={{
                                        width: '18px', height: '9px', borderRadius: '2px', border: '1px solid #ffffff',
                                        padding: '1px', display: 'flex', alignItems: 'center'
                                    }}>
                                        <div style={{ width: '85%', height: '100%', background: '#10b981', borderRadius: '1px' }}></div>
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp Screen Body */}
                            <div style={{
                                width: '100%', flex: 1,
                                background: channelType === 'rcs' ? (isDark ? '#0f172a' : '#f1f5f9') : '#ece5dd',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative'
                            }}>
                                {/* WhatsApp Doodle Wallpaper */}
                                {channelType === 'whatsapp' && (
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                        opacity: 0.35,
                                        backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                                        backgroundSize: '280px', zIndex: 1
                                    }}></div>
                                )}

                                {/* WhatsApp App Bar Header */}
                                <div style={{
                                    background: channelType === 'rcs' ? (isDark ? '#1e293b' : '#ffffff') : '#075e54',
                                    padding: '8px 12px',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    borderBottom: channelType === 'rcs' ? '1px solid #e2e8f0' : 'none',
                                    zIndex: 5, boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}>
                                    <i className="fas fa-arrow-left" style={{ color: channelType === 'rcs' ? '#3b82f6' : '#ffffff', fontSize: '13px' }}></i>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        background: channelType === 'rcs' ? '#dbeafe' : '#ffffff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: '11px', color: '#075e54', flexShrink: 0
                                    }}>
                                        BP
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, color: channelType === 'rcs' ? (isDark ? '#fff' : '#000') : '#ffffff' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                Bharat Properties
                                            </span>
                                            <i className="fas fa-check-circle" style={{ color: channelType === 'rcs' ? '#3b82f6' : '#25d366', fontSize: '11px' }}></i>
                                        </div>
                                        <div style={{ fontSize: '0.62rem', opacity: 0.85 }}>online</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: channelType === 'rcs' ? '#3b82f6' : '#ffffff', fontSize: '12px' }}>
                                        <i className="fas fa-video"></i>
                                        <i className="fas fa-phone-alt"></i>
                                        <i className="fas fa-ellipsis-v"></i>
                                    </div>
                                </div>

                                {/* Chat Scroll Canvas */}
                                <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', zIndex: 5, overflowY: 'auto' }}>
                                    {/* Today Pill */}
                                    <div style={{ textAlign: 'center', margin: '4px 0 10px 0' }}>
                                        <span style={{
                                            fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                                            background: 'rgba(0,0,0,0.12)', color: '#475569'
                                        }}>
                                            TODAY
                                        </span>
                                    </div>

                                    {/* Outgoing WhatsApp Speech Bubble */}
                                    <div style={{
                                        background: isDark ? '#054640' : '#dcf8c6',
                                        borderRadius: '12px 12px 2px 12px',
                                        padding: '8px 10px',
                                        maxWidth: '92%',
                                        alignSelf: 'flex-end',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                        border: isDark ? '1px solid #047857' : '1px solid #bbf7d0',
                                        position: 'relative'
                                    }}>
                                        {/* Header Text or Media */}
                                        {channelType === 'whatsapp' && templateData.headerType !== 'NONE' && (
                                            <div style={{
                                                background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                                                borderRadius: '6px', padding: '6px 8px', marginBottom: '6px',
                                                fontSize: '0.78rem', fontWeight: 800,
                                                color: isDark ? '#f8fafc' : '#0f172a',
                                                borderBottom: '1px solid rgba(0,0,0,0.06)'
                                            }}>
                                                {templateData.headerType === 'TEXT' ? (
                                                    renderWhatsAppFormattedText(templateData.headerText || '🏡 AVAILABLE FOR SALE 🏡')
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284c7' }}>
                                                        <i className={templateData.headerType === 'IMAGE' ? 'fas fa-image' : templateData.headerType === 'VIDEO' ? 'fas fa-video' : 'fas fa-file-pdf'}></i>
                                                        <span style={{ fontSize: '0.72rem' }}>
                                                            {templateData.headerFile?.name || `[${templateData.headerType} Attached]`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Message Body Content */}
                                        <div style={{
                                            fontSize: '0.78rem',
                                            lineHeight: '1.5',
                                            color: isDark ? '#ecfdf5' : '#14532d',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word'
                                        }}>
                                            {templateData.body ? (
                                                channelType === 'whatsapp' ? renderWhatsAppFormattedText(templateData.body) : templateData.body
                                            ) : (
                                                <span style={{ opacity: 0.6 }}>
                                                    Message body preview will appear here as you type...
                                                </span>
                                            )}
                                        </div>

                                        {/* Footer Component */}
                                        {channelType === 'whatsapp' && templateData.footer && (
                                            <div style={{
                                                fontSize: '0.68rem',
                                                color: isDark ? '#a7f3d0' : '#4b5563',
                                                marginTop: '6px', paddingTop: '4px',
                                                borderTop: '1px solid rgba(0,0,0,0.06)',
                                                fontStyle: 'italic'
                                            }}>
                                                {renderWhatsAppFormattedText(templateData.footer)}
                                            </div>
                                        )}

                                        {/* Timestamp & Double Blue Ticks */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px',
                                            marginTop: '4px', fontSize: '0.6rem', color: isDark ? '#6ee7b7' : '#6b7280'
                                        }}>
                                            <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <i className="fas fa-check-double" style={{ color: '#34b7f1', fontSize: '10px' }}></i>
                                        </div>
                                    </div>

                                    {/* Action Buttons for Meta Cloud API */}
                                    {channelType === 'whatsapp' && templateData.channel !== 'web' && templateData.buttons.length > 0 && (
                                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '92%', alignSelf: 'flex-end', width: '100%' }}>
                                            {templateData.buttons.map((btn, i) => (
                                                <div key={i} style={{
                                                    background: '#ffffff', padding: '8px 10px',
                                                    borderRadius: '8px', border: '1px solid #cbd5e1',
                                                    color: '#0284c7', fontSize: '0.74rem', fontWeight: 700,
                                                    textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                                                }}>
                                                    {btn.type === 'PHONE' && <i className="fas fa-phone-alt"></i>}
                                                    {btn.type === 'URL' && <i className="fas fa-external-link-alt"></i>}
                                                    {btn.type === 'VOICE_CALL' && <i className="fab fa-whatsapp"></i>}
                                                    {btn.type === 'QUICK_REPLY' && <i className="fas fa-reply"></i>}
                                                    {btn.type === 'COPY_CODE' && <i className="fas fa-copy"></i>}
                                                    {btn.type === 'FLOW' && <i className="fas fa-poll-h"></i>}
                                                    <span>{btn.text || 'Action Label'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* WhatsApp Web Notice Pill */}
                                    {channelType === 'whatsapp' && templateData.channel === 'web' && (
                                        <div style={{
                                            marginTop: '8px', padding: '6px 8px', borderRadius: '8px',
                                            background: 'rgba(255,255,255,0.75)', border: '1px dashed #10b981',
                                            color: '#065f46', fontSize: '0.64rem', textAlign: 'center', fontWeight: 600
                                        }}>
                                            <i className="fas fa-link" style={{ marginRight: '4px', color: '#10b981' }}></i>
                                            WhatsApp Web: Links & numbers are interactive on mobile
                                        </div>
                                    )}
                                </div>

                                {/* Bottom Home Bar */}
                                <div style={{
                                    width: '110px', height: '4px', background: '#64748b',
                                    borderRadius: '4px', margin: '4px auto 3px auto', zIndex: 10
                                }}></div>
                            </div>
                        </div>

                        {/* Simulator Footer Label */}
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#10b981' }}></i>
                            Deliverability Verified • Zero Ban Risk
                        </div>
                    </div>
                </div>

                {/* ── Modal Footer ────────────────────────────────────────── */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                    background: isDark ? '#0f172a' : '#ffffff'
                }}>
                    <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>
                            Channel: <strong style={{ color: '#10b981' }}>{templateData.channel === 'web' ? 'WhatsApp Web' : (templateData.channel === 'cloud_api' ? 'Meta Cloud API' : 'Universal')}</strong>
                        </span>
                        <span>•</span>
                        <span>
                            Category: <strong style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>{templateData.category}</strong>
                        </span>
                        <span>•</span>
                        <span style={{
                            padding: '3px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
                            color: '#10b981', fontWeight: 800
                        }}>
                            <i className="fas fa-check-circle" style={{ marginRight: '5px' }}></i>
                            {channelType === 'whatsapp' ? `Step ${step} of 2` : 'Ready to Save'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {channelType === 'whatsapp' && step === 2 && (
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                style={{
                                    padding: '10px 18px', borderRadius: '10px',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                    background: 'transparent',
                                    color: isDark ? '#f8fafc' : '#334155', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i> Previous
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '10px 18px', borderRadius: '10px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                background: 'transparent',
                                color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.82rem', fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>

                        {channelType === 'whatsapp' && step === 1 ? (
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#ffffff',
                                    fontSize: '0.85rem', fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span>Next: Content & Formatting</span>
                                <i className="fas fa-arrow-right"></i>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { onSave(templateData); onClose(); }}
                                style={{
                                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#ffffff',
                                    fontSize: '0.85rem', fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <i className="fas fa-save"></i>
                                <span>{channelType === 'whatsapp' ? 'Submit for Review' : 'Save Template'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


const ALL_TEMPLATE_VARIABLES = [
    // 🤝 Deal & Transaction Data (Populated from Deal Form & Inventory)
    { var: '{{intent}}', desc: 'Primary Deal Intent (e.g. Sell, Rent, Lease, Purchase) selected in Deal Form', ctx: 'Deal / Transaction', example: 'Sell' },
    { var: '{{deal_intent}}', desc: 'Deal Intent (lowercase alias for standard compatibility)', ctx: 'Deal / Transaction', example: 'Sell' },
    { var: '{{transactionType}}', desc: 'Deal Transaction Type selected in Deal Form (e.g. Full White, Collector Rate, Flexible, Sale, Resale)', ctx: 'Deal / Transaction', example: 'Full White' },
    { var: '{{transaction_type}}', desc: 'Deal Transaction Type (lowercase alias for standard compatibility)', ctx: 'Deal / Transaction', example: 'Full White' },
    { var: '{{dealType}}', desc: 'Deal Type (Direct, Brokerage, Co-broking, Investor)', ctx: 'Deal / Transaction', example: 'Direct' },
    { var: '{{dealCode}}', desc: 'Deal Reference / Tracking Code (e.g. DEAL-0042)', ctx: 'Deal / Transaction', example: 'DEAL-8492' },
    { var: '{{stage}}', desc: 'Deal Stage (e.g. Site Visit, Negotiation, Deal Won)', ctx: 'Deal / Transaction', example: 'Negotiation' },
    { var: '{{property_price}}', desc: 'Deal / Listed Price (e.g. ₹ 85 Lac / ₹ 1.25 Cr)', ctx: 'Deal / Transaction', example: '₹ 80 Lac' },
    { var: '{{price}}', desc: 'Deal Asking Price (Short alias)', ctx: 'Deal / Transaction', example: '₹ 80 Lac' },

    // 👤 Customer / Lead Data
    { var: '{{first_name}}', desc: 'Customer First Name', ctx: 'Lead/Contact', example: 'Rohit' },
    { var: '{{last_name}}', desc: 'Customer Last Name / Surname', ctx: 'Lead/Contact', example: 'Sharma' },
    { var: '{{full_name}}', desc: 'Customer Full Name', ctx: 'Lead/Contact', example: 'Rohit Sharma' },
    { var: '{{mobile}}', desc: 'Customer Mobile Number', ctx: 'Lead/Contact', example: '+91 9876543210' },
    { var: '{{email}}', desc: 'Customer Email Address', ctx: 'Lead/Contact', example: 'client@example.com' },
    { var: '{{lead_source}}', desc: 'Lead Source (e.g. Website, Facebook, Referral)', ctx: 'Lead/Contact', example: 'Website' },
    { var: '{{lead_status}}', desc: 'Lead Status (e.g. New, Follow-up, Qualified)', ctx: 'Lead/Contact', example: 'Qualified' },
    { var: '{{lead_stage}}', desc: 'Sales Stage (e.g. Negotiation, Won)', ctx: 'Lead/Contact', example: 'Negotiation' },
    { var: '{{lead_requirement}}', desc: 'Property Requirement (Buy/Rent & Property Type)', ctx: 'Lead/Contact', example: 'Residential Plot' },
    { var: '{{budget_min}}', desc: 'Minimum Budget', ctx: 'Lead/Contact', example: '₹ 50 Lac' },
    { var: '{{budget_max}}', desc: 'Maximum Budget', ctx: 'Lead/Contact', example: '₹ 1 Cr' },
    { var: '{{preferred_city}}', desc: 'Preferred City', ctx: 'Lead/Contact', example: 'Kurukshetra' },
    { var: '{{preferred_area}}', desc: 'Preferred Area / Locality / Sector', ctx: 'Lead/Contact', example: 'Sector 3' },

    // 🏢 Property / Inventory Data
    { var: '{{project_name}}', desc: 'Property Project Name (Cleaned without sale suffixes)', ctx: 'Property', example: 'Sector 3 Kurukshetra' },
    { var: '{{unit_number}}', desc: 'Property Unit / Plot Number', ctx: 'Property', example: 'Plot #42' },
    { var: '{{block_name}}', desc: 'Property Block / Tower', ctx: 'Property', example: 'Block A' },
    { var: '{{unit_type}}', desc: 'Unit Type (e.g. 2 BHK, 3 BHK, Residential Plot)', ctx: 'Property', example: 'Residential Plot' },
    { var: '{{property_category}}', desc: 'Property Category (e.g. Residential, Commercial)', ctx: 'Property', example: 'Residential' },
    { var: '{{property_subcategory}}', desc: 'Property Sub-Category (e.g. Plot, Flat, Villa)', ctx: 'Property', example: 'Plot' },
    { var: '{{builtup_type}}', desc: 'Built-up Type', ctx: 'Property', example: 'Independent' },
    { var: '{{size_label}}', desc: 'Size Type / Label (e.g. 250 Sq.Yd., 8 Marla)', ctx: 'Property', example: '250 Sq.Yd.' },
    { var: '{{property_size}}', desc: 'Property Size / Area', ctx: 'Property', example: '250 Sq.Yd.' },
    { var: '{{property_direction}}', desc: 'Property Direction (East, North, West, South)', ctx: 'Property', example: 'East' },
    { var: '{{property_facing}}', desc: 'Property Facing (e.g. Park Facing, Road Facing)', ctx: 'Property', example: 'Housing Board' },
    { var: '{{road_width}}', desc: 'Road Width in front of property', ctx: 'Property', example: '9 Mtr (30 Feet) Wide' },
    { var: '{{property_location}}', desc: 'Property Location / Address', ctx: 'Property', example: 'Sector 3, Kurukshetra' },

    // 👥 System & Assignment Data
    { var: '{{EmployeeName}}', desc: 'Assigned Employee / User Name', ctx: 'System & Assignment', example: 'Bharat Properties' },
    { var: '{{EmployeeMobile}}', desc: 'Assigned Employee Mobile Number', ctx: 'System & Assignment', example: '+91 9991333570' },
    { var: '{{agent_name}}', desc: 'Assigned Agent / Staff Full Name', ctx: 'System & Assignment', example: 'Bharat Properties' },
    { var: '{{agent_mobile}}', desc: 'Assigned Agent Mobile Number', ctx: 'System & Assignment', example: '+91 9991333570' },
    { var: '{{agent_email}}', desc: 'Assigned Agent Email Address', ctx: 'System & Assignment', example: 'deals@bharatproperties.co' },
    { var: '{{team}}', desc: 'Assigned Team (e.g. Sales, Rental, Luxury)', ctx: 'System & Assignment', example: 'Sales Team' },
    { var: '{{assignedTo}}', desc: 'Assigned User / Staff Name', ctx: 'System & Assignment', example: 'Bharat Properties' },
    { var: '{{visibleTo}}', desc: 'Visibility Scope (Everyone / Team / Private)', ctx: 'System & Assignment', example: 'Everyone' },
    { var: '{{company_name}}', desc: 'Your Company Name (Bharat Properties)', ctx: 'System & Assignment', example: 'Bharat Properties' },

    // 📋 Feedback / Updates Data
    { var: '{{OwnerName}}', desc: 'Owner Name for Feedback & Site Visit updates', ctx: 'Feedback', example: 'Mr. Rajesh Kumar' },
    { var: '{{subcategory}}', desc: 'Property Sub-Category for Feedback updates', ctx: 'Feedback', example: 'Plot' },
    { var: '{{unitnumber}}', desc: 'Property Unit Number for Feedback updates', ctx: 'Feedback', example: 'Plot #42' },
    { var: '{{projectname}}', desc: 'Property Project Name for Feedback updates', ctx: 'Feedback', example: 'Sector 3' },
    { var: '{{DiscussionSummary}}', desc: 'Combined Status, Feedback and Next Action', ctx: 'Feedback', example: 'Client visited site and approved location' },

    // ⚡ Dynamic / Match Data
    { var: '{{property_list_default}}', desc: 'Formatted multi-property bulleted list', ctx: 'Match / Portfolio', example: '1️⃣ 🏢 Deal A | 💰 ₹80 Lac ...' },
    { var: '{{property_list_dtl}}', desc: 'Detailed property list with specs & pricing', ctx: 'Match / Portfolio', example: '1️⃣ 🏢 Project\n📍 Sector 3\n💰 ₹80 Lac ...' },
    { var: '{{requirement_summary}}', desc: 'Summary of customer property requirement', ctx: 'Match / Portfolio', example: 'Looking for Plot in Sector 3 (Budget: ₹80 Lac)' },
    { var: '{{properties_count}}', desc: 'Total number of properties matched', ctx: 'Match / Portfolio', example: '3' },
    { var: '{{match_percentage}}', desc: 'AI Match Percentage Score', ctx: 'Match / Portfolio', example: '98%' },

    // 💳 Payment & Reminders Data
    { var: '{{amount}}', desc: 'Due Amount (For payment reminders)', ctx: 'System & Assignment', example: '₹ 80,000' },
    { var: '{{due_date}}', desc: 'Due Date (For payment & event reminders)', ctx: 'System & Assignment', example: 'This Weekend' },
    { var: '{{document_list}}', desc: 'Required Document List checklist', ctx: 'System & Assignment', example: '• Aadhaar • PAN • Cheque' }
];

const VARIABLE_CATEGORIES = [
    { id: 'ALL', label: 'All Categories' },
    { id: 'Deal / Transaction', label: 'Deal & Transaction' },
    { id: 'Lead/Contact', label: 'Lead & Contact' },
    { id: 'Property', label: 'Property & Inventory' },
    { id: 'System & Assignment', label: 'Staff & System' },
    { id: 'Match / Portfolio', label: 'Matches & Portfolio' },
    { id: 'Feedback', label: 'Feedback & Updates' }
];

const getContextBadgeStyle = (ctx) => {
    switch (ctx) {
        case 'Deal / Transaction':
            return { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
        case 'Lead/Contact':
            return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
        case 'Property':
            return { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' };
        case 'System & Assignment':
            return { bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
        case 'Match / Portfolio':
            return { bg: '#ecfeff', color: '#0891b2', border: '#a5f3fc' };
        case 'Feedback':
            return { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' };
        default:
            return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
    }
};

const VariableRegistryTab = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('ALL');
    const [copiedVar, setCopiedVar] = useState(null);

    const handleCopy = (variableSyntax) => {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(variableSyntax);
            setCopiedVar(variableSyntax);
            toast.success(`Copied ${variableSyntax} to clipboard!`, { id: 'copy-var-toast', duration: 2000 });
            setTimeout(() => setCopiedVar(null), 2000);
        }
    };

    const filteredVariables = useMemo(() => {
        const query = searchTerm.trim().toLowerCase().replace(/[{}]/g, '');
        return ALL_TEMPLATE_VARIABLES.filter(item => {
            const matchesCategory = activeCategory === 'ALL' || item.ctx === activeCategory;
            if (!matchesCategory) return false;

            if (!query) return true;
            const cleanVar = item.var.toLowerCase().replace(/[{}]/g, '');
            const cleanDesc = item.desc.toLowerCase();
            const cleanCtx = item.ctx.toLowerCase();
            const cleanEx = (item.example || '').toLowerCase();

            return cleanVar.includes(query) || cleanDesc.includes(query) || cleanCtx.includes(query) || cleanEx.includes(query);
        });
    }, [searchTerm, activeCategory]);

    const variablesData = useMemo(() => {
        return filteredVariables.map(item => ({
            ...item,
            id: item.var
        }));
    }, [filteredVariables]);

    const variableColumns = useMemo(() => [
        {
            header: 'Variable Syntax',
            accessor: 'var',
            render: (item) => {
                const isCopied = copiedVar === item.var;
                return (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <div
                            onClick={() => handleCopy(item.var)}
                            title="Click to copy syntax"
                            style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: 'var(--primary-color, #4f46e5)',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '0.82rem',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease',
                                userSelect: 'all'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#818cf8';
                                e.currentTarget.style.background = '#eef2ff';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#e2e8f0';
                                e.currentTarget.style.background = '#f8fafc';
                            }}
                        >
                            {item.var}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleCopy(item.var)}
                            title={`Copy ${item.var}`}
                            style={{
                                border: 'none',
                                background: isCopied ? '#ecfdf5' : 'transparent',
                                color: isCopied ? '#059669' : '#94a3b8',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                                if (!isCopied) {
                                    e.currentTarget.style.color = '#4f46e5';
                                    e.currentTarget.style.background = '#f1f5f9';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isCopied) {
                                    e.currentTarget.style.color = '#94a3b8';
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            {isCopied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                        </button>
                    </div>
                );
            }
        },
        {
            header: 'Description & Data Source',
            accessor: 'desc',
            render: (item) => (
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{item.desc}</span>
            )
        },
        {
            header: 'Sample Data',
            accessor: 'example',
            render: (item) => (
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {item.example || '—'}
                </span>
            )
        },
        {
            header: 'Context',
            accessor: 'ctx',
            render: (item) => {
                const badge = getContextBadgeStyle(item.ctx);
                return (
                    <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        display: 'inline-block',
                        whiteSpace: 'nowrap'
                    }}>
                        {item.ctx}
                    </span>
                );
            }
        }
    ], [copiedVar]);

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header Card */}
            <div style={{
                marginBottom: '20px',
                background: 'var(--bg-card)',
                padding: '20px 24px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Database size={22} color="var(--primary-color, #6366f1)" />
                            <span>Supported Template Variables</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '750px', lineHeight: '1.4' }}>
                            Use these dynamic variables inside your WhatsApp, SMS, RCS, and Email templates.
                            When broadcasting or sending messages from deals, leads, or inventory, the CRM automatically replaces them with real live data.
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', background: '#f1f5f9', color: '#475569' }}>
                            {filteredVariables.length} of {ALL_TEMPLATE_VARIABLES.length} Variables
                        </span>
                    </div>
                </div>

                {/* 🔍 Search Input & Filters Bar */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={17} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Search variables by syntax (e.g. transactionType, price, mobile), description, or context..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '11px 40px 11px 42px',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#0f172a',
                                fontSize: '0.9rem',
                                outline: 'none',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = '#6366f1';
                                e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = '#cbd5e1';
                                e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                            }}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                title="Clear Search"
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: '#e2e8f0',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '22px',
                                    height: '22px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#475569'
                                }}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Category Filter Pills */}
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', alignItems: 'center' }}>
                        {VARIABLE_CATEGORIES.map(cat => {
                            const count = cat.id === 'ALL'
                                ? ALL_TEMPLATE_VARIABLES.length
                                : ALL_TEMPLATE_VARIABLES.filter(v => v.ctx === cat.id).length;
                            const isActive = activeCategory === cat.id;

                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setActiveCategory(cat.id)}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '9999px',
                                        fontSize: '0.78rem',
                                        fontWeight: isActive ? 700 : 500,
                                        border: `1px solid ${isActive ? '#6366f1' : '#e2e8f0'}`,
                                        background: isActive ? '#6366f1' : '#ffffff',
                                        color: isActive ? '#ffffff' : '#64748b',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span>{cat.label}</span>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        padding: '1px 6px',
                                        borderRadius: '9999px',
                                        background: isActive ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                                        color: isActive ? '#ffffff' : '#64748b',
                                        fontWeight: 700
                                    }}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Variables Table */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
                <DataTable
                    columns={variableColumns}
                    data={variablesData}
                    keyField="id"
                    emptyMessage={
                        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔍</div>
                            <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                                No variables found matching &quot;{searchTerm}&quot;
                            </div>
                            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: 'var(--text-muted)' }}>
                                Check for typos or try clearing your search query.
                            </div>
                            <button
                                type="button"
                                onClick={() => { setSearchTerm(''); setActiveCategory('ALL'); }}
                                style={{
                                    marginTop: '14px',
                                    padding: '7px 16px',
                                    borderRadius: '7px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#334155',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Clear Search & Filters
                            </button>
                        </div>
                    }
                />
            </div>
        </div>
    );
};

// AutomationEngineTab logic removed as it has been moved to Global Business Rules

const ContextEditModal = ({ isOpen, onClose, template, onSave }) => {
    const [selectedContext, setSelectedContext] = useState([]);

    useEffect(() => {
        if (isOpen && template) {
            setSelectedContext(template.systemContext || []);
        }
    }, [isOpen, template]);

    if (!isOpen || !template) return null;

    const options = [
        { value: 'marketing_broadcast', label: 'Marketing Broadcast (Deal BNA / WhatsApp Web & Meta)' },
        { value: 'add_lead_modal', label: 'Add Lead (Auto-Send Modal)' },
        { value: 'lead_match_full', label: 'Lead Match (Full Details)' },
        { value: 'lead_match_short', label: 'Lead Match (Short Details)' },
        { value: 'deal_match', label: 'Deal Match (Auto-Dispatch)' },
        { value: 'deal_match_modal', label: 'Deal Match (Message Modal)' },
        { value: 'marketing_blast', label: 'Marketing Blast' },
        { value: 'welcome', label: 'Welcome/Auto-Reply' },
        { value: 'feedback_form', label: 'Feedback Form (Meta Flow)' }
    ];

    const handleToggle = (val) => {
        if (selectedContext.includes(val)) {
            setSelectedContext(selectedContext.filter(c => c !== val));
        } else {
            setSelectedContext([...selectedContext, val]);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
            <div style={{ background: 'var(--bg-card)', width: '500px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Set System Trigger Context</h3>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}></i>
                </div>
                <div style={{ padding: '24px' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', marginTop: 0 }}>
                        Select where this template should be used automatically by the system.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {options.map(opt => {
                            const isSelected = selectedContext.includes(opt.value);
                            return (
                                <div 
                                    key={opt.value}
                                    onClick={() => handleToggle(opt.value)}
                                    style={{ 
                                        padding: '12px 16px', 
                                        borderRadius: '8px', 
                                        border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                        background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-light)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ 
                                        width: '20px', height: '20px', borderRadius: '4px', 
                                        border: `2px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                        background: isSelected ? 'var(--primary-color)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {isSelected && <i className="fas fa-check" style={{ color: '#fff', fontSize: '12px' }}></i>}
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isSelected ? 'var(--primary-color)' : 'var(--text-main)' }}>
                                        {opt.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: 'var(--bg-light)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn-outline" onClick={onClose} style={{ background: 'var(--bg-card)' }}>Cancel</button>
                    <button className="btn-primary" onClick={() => { onSave(template, selectedContext); onClose(); }}>Save Context</button>
                </div>
            </div>
        </div>
    );
};

const MessagingSettingsPage = () => {
    
    const [subTab, setSubTab] = useState('templates');
    const [templateType, setTemplateType] = useState('whatsapp');
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [contextEditingTemplate, setContextEditingTemplate] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const { mutateAsync: saveWhatsAppTemplates } = useSaveWhatsAppTemplatesMutation();
    const { mutateAsync: submitWhatsAppTemplate } = useSubmitWhatsAppTemplateMutation();
    const { mutateAsync: syncWhatsAppTemplates } = useSyncWhatsAppTemplatesCommand();
    const { data: dbWhatsappTemplates } = useWhatsAppTemplatesDb();

    const [isSyncingMeta, setIsSyncingMeta] = useState(false); // Enterprise Sync State
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [waChannelFilter, setWaChannelFilter] = useState('ALL'); // 'ALL' | 'WEB' | 'CLOUD_API'

    // Initialize from hardcoded defaults; DB overrides on mount
    const [allTemplates, setAllTemplates] = useState({
        whatsapp: whatsappTemplates,
        sms: smsTemplates,
        rcs: rcsTemplates
    });

    // ── Load persisted WhatsApp + RCS templates from DB ──
    const loadPersistedTemplates = async () => {
        try {
            const [waRes, rcsRes] = await Promise.all([
                systemSettingsAPI.getByKey('crm_whatsapp_templates'),
                systemSettingsAPI.getByKey('crm_rcs_templates'),
            ]);
            
            setAllTemplates(prev => {
                const mergeTemplates = (defaultList, dbList) => {
                    if (!dbList || !dbList.length) return defaultList;
                    const merged = [...defaultList];
                    dbList.forEach(dbTpl => {
                        const idx = merged.findIndex(t => String(t.id) === String(dbTpl.id));
                        if (idx >= 0) merged[idx] = dbTpl; // Override existing
                        else merged.push(dbTpl); // Add new
                    });
                    return merged;
                };

                return {
                    ...prev,
                    whatsapp: mergeTemplates(whatsappTemplates, waRes?.data?.value),
                    rcs: mergeTemplates(rcsTemplates, rcsRes?.data?.value),
                };
            });
        } catch (err) {
            console.warn('Could not load persisted templates, using defaults:', err.message);
        }
    };

    // ── Persist WhatsApp / RCS to DB ──
    const persistTemplates = async (type, templateList) => {
        const keyMap = { whatsapp: 'crm_whatsapp_templates', rcs: 'crm_rcs_templates' };
        const key = keyMap[type];
        if (!key) return; // SMS uses its own smsService
        try {
            if (type === 'whatsapp') { await saveWhatsAppTemplates(templateList); } else { await systemSettingsAPI.upsert(key, { value: templateList }); }
        } catch (err) {
            console.error(`Failed to persist ${type} templates:`, err.message);
        }
    };

    const handleDirectMetaSubmit = async (template) => {
        setIsSyncing(true);
        const toastId = toast.loading('Submitting template to Meta for review...');
        try {
            const savedData = {
                ...template,
                body: template.body || template.content || '',
            };
            await submitWhatsAppTemplate(savedData);
            toast.success('Successfully submitted to Meta!', { id: toastId });
            handleSyncFromMeta(); // Sync to update status to PENDING
        } catch (err) {
            toast.error(err.response?.data?.error || err.message, { id: toastId });
            console.error(err);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDelete = (templateId) => {
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--primary-color)',
            cancelButtoncolor: 'var(--text-muted)',
            confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (templateType === 'sms') {
                    try {
                        await smsService.deleteTemplate(templateId);
                        toast.success('Template deleted successfully');
                        loadSmsTemplates();
                    } catch (err) {
                        toast.error('Failed to delete template: ' + err.message);
                    }
                } else {
                    const updatedList = allTemplates[templateType].filter(t => t.id !== templateId);
                    setAllTemplates(prev => ({ ...prev, [templateType]: updatedList }));
                    await persistTemplates(templateType, updatedList);
                    toast.success('Template deleted successfully');
                }
            }
        });
    };

    const handleEdit = (template) => {
        setEditingTemplate({
            ...template,
            body: template.body || template.content || '',
        });
        setIsTemplateModalOpen(true);
    };

    const handleSaveTemplate = async (data) => {
        setIsSyncing(true);
        try {
            if (templateType === 'sms') {
                await smsService.saveTemplate(data.id ? { ...data, _id: data.id } : data);
                loadSmsTemplates();
            } else {
                // Keep body + content in sync for compatibility locally
                const targetChannel = data.channel || 'web';
                const savedData = {
                    ...data,
                    channel: targetChannel,
                    buttons: targetChannel === 'web' ? [] : (data.buttons || []),
                    body:    data.body    || data.content || '',
                    content: data.content || data.body    || '',
                    status: targetChannel === 'web' ? 'APPROVED' : (data.status || 'PENDING')
                };

                // ENTERPRISE UPGRADE: Sync Up to Meta Cloud API ONLY IF applicable
                if (templateType === 'whatsapp' && (targetChannel === 'cloud_api' || targetChannel === 'both')) {
                    try {
                        const toastId = toast.loading('Submitting template to Meta for review...');
                        await submitWhatsAppTemplate(savedData);
                        toast.success('Successfully submitted to Meta!', { id: toastId });
                    } catch (err) {
                        console.warn('Meta Submission Error:', err);
                        const errorMessage = err.response?.data?.error || err.message || 'Meta API integration incomplete. Saved locally only.';
                        toast.error(errorMessage);
                    }
                } else if (templateType === 'whatsapp' && targetChannel === 'web') {
                    toast.success('WhatsApp Web template saved and activated instantly!');
                }


                // Compute updatedList synchronously BEFORE setState to avoid race condition
                const currentList = allTemplates[templateType] || [];
                let sanitizedList = [...currentList];

                // 🚨 ENFORCEMENT LOGIC: 1-to-1 mapping for exclusive contexts (deal_match, feedback_form)
                const exclusiveContexts = ['deal_match', 'feedback_form'];
                for (const ctx of exclusiveContexts) {
                    if (savedData.systemContext?.includes(ctx)) {
                        let strippedCount = 0;
                        sanitizedList = sanitizedList.map(t => {
                            if (t.id !== data.id && t.systemContext?.includes(ctx)) {
                                strippedCount++;
                                return {
                                    ...t,
                                    systemContext: t.systemContext.filter(c => c !== ctx)
                                };
                            }
                            return t;
                        });
                        if (strippedCount > 0) {
                            setTimeout(() => {
                                toast.success(`${ctx} context was removed from ${strippedCount} other template(s) in this channel.`);
                            }, 500);
                        }
                    }
                }

                let updatedList;
                if (data.id) {
                    updatedList = sanitizedList.map(t => t.id === data.id ? savedData : t);
                } else {
                    updatedList = [...sanitizedList, { ...savedData, id: `local_${Date.now()}` }];
                }

                // Update state with computed list
                setAllTemplates(prev => ({ ...prev, [templateType]: updatedList }));

                // Persist to DB immediately with the computed list (no race condition)
                await persistTemplates(templateType, updatedList);
            }
            toast.success(data.id ? 'Template updated & saved ✓' : 'Template created & saved ✓');
        } catch (err) {
            toast.error('Failed to save template: ' + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSaveContext = async (template, newContext) => {
        setIsSyncing(true);
        try {
            const updatedData = { ...template, systemContext: newContext };
            
            // Re-use the save logic (it handles DB persist and deal_match logic)
            // But we don't submit to meta again just for context update
            let updatedList;
            
            // Compute the new list synchronously to pass to both state and DB
            const currentList = allTemplates[templateType] || [];
            let sanitizedList = [...currentList];
            
            // ENFORCEMENT LOGIC: 1-to-1 mapping for exclusive contexts (deal_match, feedback_form)
            const exclusiveContexts = ['deal_match', 'feedback_form'];
            for (const ctx of exclusiveContexts) {
                if (updatedData.systemContext?.includes(ctx)) {
                    let strippedCount = 0;
                    sanitizedList = sanitizedList.map(t => {
                        if (t.id !== template.id && t.systemContext?.includes(ctx)) {
                            strippedCount++;
                            return {
                                ...t,
                                systemContext: t.systemContext.filter(c => c !== ctx)
                            };
                        }
                        return t;
                    });
                    if (strippedCount > 0) {
                        setTimeout(() => {
                            toast.success(`${ctx} context was removed from ${strippedCount} other template(s).`);
                        }, 500);
                    }
                }
            }

            updatedList = sanitizedList.map(t => t.id === template.id ? updatedData : t);

            // Update local state
            setAllTemplates(prev => ({ ...prev, [templateType]: updatedList }));

            // Sync shared WhatsAppTemplateContext so InventoryFeedbackModal picks up instantly
            

            // Update database
            await persistTemplates(templateType, updatedList);
            toast.success('System trigger context updated ✓');
        } catch (err) {
            toast.error('Failed to update context: ' + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    // ENTERPRISE UPGRADE: Sync Down from Meta
    const handleSyncFromMeta = async () => {
        if (templateType !== 'whatsapp') return;
        setIsSyncingMeta(true);
        const toastId = toast.loading('Syncing approved templates from Meta WhatsApp Manager...');
        
        try {
            const res = await syncWhatsAppTemplates();
            if (res?.success && res.data) {
                setAllTemplates(prev => {
                    const localTemplates = prev.whatsapp || [];
                    const mergedTemplates = [...localTemplates];
                    
                    res.data.forEach(metaTpl => {
                        const existingIdx = mergedTemplates.findIndex(t => t.id === metaTpl.id || t.name === metaTpl.name);
                        if (existingIdx >= 0) {
                            // Preserve local-only fields (systemContext, triggers, tags) when merging from Meta
                            const localOnly = {
                                systemContext: mergedTemplates[existingIdx].systemContext,
                                triggers: mergedTemplates[existingIdx].triggers,
                                tags: mergedTemplates[existingIdx].tags,
                            };
                            mergedTemplates[existingIdx] = { ...mergedTemplates[existingIdx], ...metaTpl, ...localOnly };
                        } else {
                            mergedTemplates.push(metaTpl);
                        }
                    });
                    
                    persistTemplates('whatsapp', mergedTemplates);
                    return { ...prev, whatsapp: mergedTemplates };
                });
                toast.success(`Successfully synced templates from Meta!`, { id: toastId });
            } else {
                throw new Error('Invalid response format');
            }
        } catch (err) {
            console.error('Meta Sync failed:', err);
            // Fallback mock success if backend isn't ready
            toast.error('Meta API endpoint not connected yet. Check backend logs.', { id: toastId });
        } finally {
            setIsSyncingMeta(false);
        }
    };

    const loadSmsTemplates = async () => {
        try {
            const res = await smsService.getTemplates();
            setAllTemplates(prev => ({
                ...prev,
                sms: res.data.map(t => ({ ...t, id: t._id }))
            }));
        } catch (err) {
            console.error('Failed to load SMS templates', err);
        }
    };

    useEffect(() => {
        loadSmsTemplates();
        loadPersistedTemplates();
    }, []);

    const tabs = [
        { id: 'templates', label: 'Templates' },
        { id: 'variables', label: 'Variables' },
        { id: 'block-list', label: 'Block list' },
        { id: 'logs', label: 'Logs' }
    ];

    const renderTabs = () => (
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #f1f5f9', marginBottom: '32px' }}>
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => setSubTab(tab.id)}
                    style={{
                        padding: '12px 0',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: subTab === tab.id ? 'var(--primary-color)' : 'var(--text-muted)',
                        borderBottom: subTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    {tab.label}
                </div>
            ))}
        </div>
    );

    const renderTemplates = () => {
        let templatesToDisplay = allTemplates[templateType] || [];
        if (templateType === 'whatsapp' && waChannelFilter !== 'ALL') {
            if (waChannelFilter === 'WEB') {
                templatesToDisplay = templatesToDisplay.filter(t => t.channel === 'web' || t.channel === 'both' || !t.channel);
            } else if (waChannelFilter === 'CLOUD_API') {
                templatesToDisplay = templatesToDisplay.filter(t => t.channel === 'cloud_api' || t.channel === 'both');
            }
        }

        const templatesData = templatesToDisplay.map((row, i) => ({
            ...row,
            id: row.id || row._id || `tpl-${i}`
        }));

        const templateColumns = [
            {
                header: 'Template name',
                accessor: 'name',
                render: (row) => (
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                        <div>{row.name}</div>
                        {Array.isArray(row.systemContext) && row.systemContext.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                {row.systemContext.map(ctx => (
                                    <span key={ctx} style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: ctx === 'marketing_broadcast' ? '#dcfce7' : '#ede9fe',
                                        color: ctx === 'marketing_broadcast' ? '#15803d' : '#6d28d9',
                                        border: ctx === 'marketing_broadcast' ? '1px solid #bbf7d0' : '1px solid #ddd6fe'
                                    }}>
                                        {ctx === 'marketing_broadcast' ? '📢 Marketing Broadcast' : ctx.replace(/_/g, ' ')}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )
            },
            {
                header: 'Channel',
                accessor: 'channel',
                render: (row) => (
                    templateType === 'whatsapp' ? (
                        row.channel === 'web' ? (
                            <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fab fa-whatsapp" style={{ color: '#10b981' }}></i> WhatsApp Web
                            </span>
                        ) : row.channel === 'cloud_api' ? (
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fas fa-cloud" style={{ color: '#3b82f6' }}></i> Meta Cloud API
                            </span>
                        ) : (
                            <span style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fas fa-globe" style={{ color: '#8b5cf6' }}></i> All Channels
                            </span>
                        )
                    ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{templateType.toUpperCase()}</span>
                    )
                )
            },
            {
                header: 'Status',
                accessor: 'status',
                render: (row) => (
                    <span style={{
                        color: row.status === 'APPROVED' ? '#22c55e' : (row.status === 'REJECTED' ? '#ef4444' : (row.status === 'PENDING' ? '#eab308' : '#3b82f6')),
                        fontWeight: 600,
                        background: row.status === 'APPROVED' ? '#f0fdf4' : (row.status === 'REJECTED' ? '#fef2f2' : (row.status === 'PENDING' ? '#fefce8' : '#eff6ff')),
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                    }}>
                        {row.status ? row.status : (row.channel === 'web' ? 'APPROVED' : 'Local')}
                    </span>
                )
            },
            {
                header: 'Dated',
                accessor: 'date',
                render: () => '05/02/2026'
            },
            {
                header: 'Tags',
                accessor: 'tags',
                render: (row) => (
                    <span style={{ background: 'var(--bg-light)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {row.tags ? row.tags[0] : 'Property'}
                    </span>
                )
            },
            {
                header: 'Created by',
                accessor: 'createdBy',
                render: () => 'Bharat Properties'
            },
            {
                header: 'Sharing',
                accessor: 'sharing',
                render: () => 'Owned by you'
            },
            {
                header: '',
                accessor: 'actions',
                render: (row, i) => (
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                        <div
                            style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}
                            onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === row.id ? null : row.id); }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <i className="fas fa-ellipsis-v" style={{ color: 'var(--text-muted)' }}></i>
                        </div>
                        {activeDropdown === row.id && (
                            <>
                                <div
                                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
                                    onClick={() => setActiveDropdown(null)}
                                />
                                <div style={{ position: 'absolute', right: '0', top: i >= templatesToDisplay.length - 2 && templatesToDisplay.length > 2 ? 'auto' : '32px', bottom: i >= templatesToDisplay.length - 2 && templatesToDisplay.length > 2 ? '32px' : 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 9999, width: '220px', padding: '4px 0', textAlign: 'left' }}>
                                    {templateType === 'whatsapp' && row.status !== 'APPROVED' && row.status !== 'PENDING' && (
                                        <div
                                            style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontWeight: 600 }}
                                            onClick={() => { setActiveDropdown(null); handleDirectMetaSubmit(row); }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#d1fae5'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <i className="fab fa-whatsapp" style={{ width: '16px', textAlign: 'center' }}></i> Submit to Meta
                                        </div>
                                    )}
                                    <div
                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontWeight: 600 }}
                                        onClick={() => { setActiveDropdown(null); handleEdit(row); }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <i className="far fa-edit" style={{ width: '16px', color: '#3b82f6', textAlign: 'center' }}></i> Edit Template
                                    </div>
                                    <div
                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontWeight: 600 }}
                                        onClick={() => { setActiveDropdown(null); setContextEditingTemplate(row); }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <i className="fas fa-plug" style={{ width: '16px', color: 'var(--primary-color)', textAlign: 'center' }}></i> System Trigger Context
                                    </div>
                                    <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }}></div>
                                    <div
                                        style={{ padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: 600 }}
                                        onClick={() => { setActiveDropdown(null); handleDelete(row.id); }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <i className="far fa-trash-alt" style={{ width: '16px', textAlign: 'center' }}></i> Delete Template
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )
            }
        ];

        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', background: 'var(--bg-light)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <button onClick={() => setTemplateType('sms')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'sms' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'sms' ? 'var(--primary-color)' : 'var(--text-muted)', boxShadow: templateType === 'sms' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>SMS</button>
                        <button onClick={() => setTemplateType('whatsapp')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'whatsapp' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'whatsapp' ? 'var(--primary-color)' : 'var(--text-muted)', boxShadow: templateType === 'whatsapp' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>Whatsapp</button>
                        <button onClick={() => setTemplateType('rcs')} style={{ padding: '8px 32px', border: 'none', background: templateType === 'rcs' ? 'var(--bg-card)' : 'transparent', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: templateType === 'rcs' ? '#4285F4' : 'var(--text-muted)', boxShadow: templateType === 'rcs' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>RCS</button>
                    </div>
                </div>

                {/* WhatsApp Channel Sub-Filter Tabs */}
                {templateType === 'whatsapp' && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                        {[
                            { id: 'ALL', label: 'All Templates', count: (allTemplates.whatsapp || []).length },
                            { id: 'WEB', label: '⚡ WhatsApp Web', count: (allTemplates.whatsapp || []).filter(t => t.channel === 'web' || t.channel === 'both' || !t.channel).length },
                            { id: 'CLOUD_API', label: '🔵 Meta Cloud API', count: (allTemplates.whatsapp || []).filter(t => t.channel === 'cloud_api' || t.channel === 'both').length }
                        ].map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => setWaChannelFilter(filter.id)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '20px',
                                    border: `1.5px solid ${waChannelFilter === filter.id ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                    background: waChannelFilter === filter.id ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card)',
                                    color: waChannelFilter === filter.id ? 'var(--primary-color)' : 'var(--text-muted)',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {filter.label} ({filter.count})
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative' }}>
                            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--border-color)' }}></i>
                            <input type="text" placeholder="Search..." style={{ padding: '8px 12px 8px 36px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '240px' }} />
                        </div>
                        <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)' }}>Filter tags <i className="fas fa-chevron-down"></i></button>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {templateType === 'whatsapp' && (
                            <button 
                                className="btn-outline" 
                                onClick={handleSyncFromMeta}
                                disabled={isSyncingMeta}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', color: '#059669', borderColor: '#10b981' }}>
                                <i className={`fas fa-sync ${isSyncingMeta ? 'fa-spin' : ''}`}></i> Sync from Meta
                            </button>
                        )}
                        <button className="btn-primary" onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}>
                            <i className="fas fa-plus" style={{ marginRight: '6px' }}></i>Add template
                        </button>
                    </div>
                    {isSyncing && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#6366f1', fontWeight: 600 }}>
                            <i className="fas fa-circle-notch fa-spin"></i> Saving…
                        </span>
                    )}
                </div>

                <DataTable
                    columns={templateColumns}
                    data={templatesData}
                    keyField="id"
                    emptyMessage={
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No templates found for this channel.
                        </div>
                    }
                />
            </div>
        );
    };



    const renderBlocklist = () => (
        <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Block Messaging</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>Block SMS and WhatsApp messages from specific numbers.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                <input type="text" style={{ padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '240px' }} placeholder="+91..." />
                <button className="btn-outline" style={{ padding: '8px 16px' }}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                    { name: 'Aastha Gupta', num: '+91-7888485883', channels: ['SMS', 'WhatsApp'] },
                    { name: 'Parampreet Singh Malhali', num: '+91-897534321', channels: ['WhatsApp'] },
                    { name: 'ramesh', num: '+91-9812345678', channels: ['SMS', 'WhatsApp'] }
                ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>{item.name}</span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{item.num}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {item.channels.join(', ')}
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Unblock</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase' }}>Messaging Settings</h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>Manage SMS, WhatsApp, and social media integration settings.</div>
            </div>

            <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
                {renderTabs()}

                {subTab === 'templates' && renderTemplates()}
                {subTab === 'variables' && <VariableRegistryTab />}
                {subTab === 'block-list' && renderBlocklist()}


                {subTab === 'logs' && (
                    <div style={{ padding: '80px', textAlign: 'center', background: 'var(--bg-light)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                        <i className="fas fa-comment-alt-lines" style={{ fontSize: '3rem', color: 'var(--border-color)', marginBottom: '20px' }}></i>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Conversation Logs</h3>
                        <p style={{ color: 'var(--text-muted)' }}>All sent and received messages will appear here.</p>
                    </div>
                )}
            </div>

            <MessagingTemplateModal
                isOpen={isTemplateModalOpen}
                onClose={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }}
                channelType={templateType}
                initialData={editingTemplate}
                onSave={handleSaveTemplate}
            />

            <ContextEditModal
                isOpen={!!contextEditingTemplate}
                onClose={() => setContextEditingTemplate(null)}
                template={contextEditingTemplate}
                onSave={handleSaveContext}
            />
        </div>
    );
};

export default MessagingSettingsPage;
