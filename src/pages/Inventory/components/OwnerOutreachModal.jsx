import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { 
    Send, 
    ShieldCheck, 
    Users, 
    Layers, 
    Calendar, 
    Clock, 
    AlertCircle, 
    CheckCircle2, 
    X,
    Filter,
    FileText,
    Info
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal/Modal';
import { useTheme } from '../../../context/ThemeContext';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';
import InventoryAutocompletePicker from './InventoryAutocompletePicker';

const batchSizes = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000];
const channels = [
    { value: 'whatsapp', label: 'WhatsApp', available: true },
    { value: 'sms', label: 'SMS', available: false },
    { value: 'rcs', label: 'RCS', available: false },
    { value: 'email', label: 'Email', available: false }
];

const istDateTimeToIso = (value, endOfDay = false) => {
    if (!value) return null;
    const [datePart, timePart = '00:00'] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, endOfDay ? 59 : 0, endOfDay ? 999 : 0)).toISOString();
};

export default function OwnerOutreachModal({ isOpen, onClose, initialInventory = [], onSuccess }) {
    const { isDark } = useTheme();

    const [form, setForm] = useState({
        name: '',
        messageBody:
            'Namaste, Bharat Properties se sampark kar rahe hain. Aapki property {{property}} ke sambandh mein baat karni thi. Kya aap abhi bhi is property ke owner hain aur iske sale/rent ke liye available hain? Agar aap aise messages nahi chahte, to STOP reply karein.',
        providerAccountId: '',
        project: '',
        owners: true,
        associates: false,
        excludeBrokers: true,
        channel: 'whatsapp',
        frequency: 'DAILY',
        batch: 100,
        startAt: '',
        endAt: '',
        windowStart: '10:00',
        windowEnd: '18:00'
    });

    const [selectedInventory, setSelectedInventory] = useState(initialInventory || []);
    const [preview, setPreview] = useState(null);
    const [previewFingerprint, setPreviewFingerprint] = useState('');
    const [accounts, setAccounts] = useState([]);
    const [busy, setBusy] = useState(false);

    const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));

    // Reset or initialize when modal opens
    useEffect(() => {
        if (isOpen) {
            if (initialInventory && initialInventory.length > 0) {
                setSelectedInventory(initialInventory);
            }
            api.get('/owner-outreach/accounts')
                .then((response) => {
                    const list = response.data?.data || [];
                    setAccounts(list);
                    if (list.length === 1) {
                        setForm((old) => ({ ...old, providerAccountId: list[0].id }));
                    }
                })
                .catch((error) => toast.error(error.response?.data?.error || 'WhatsApp accounts load nahi hue'));
        }
    }, [isOpen, initialInventory]);

    const audience = useMemo(
        () => ({
            inventoryIds: selectedInventory.map((item) => item.id),
            filters: form.project.trim() ? { project: form.project.trim() } : {},
            includeOwners: form.owners,
            includeAssociates: form.associates,
            excludeBrokers: form.excludeBrokers,
            channels: [form.channel]
        }),
        [selectedInventory, form.project, form.owners, form.associates, form.excludeBrokers, form.channel]
    );

    const fingerprint = useMemo(() => JSON.stringify(audience), [audience]);
    const previewIsCurrent = Boolean(preview && previewFingerprint === fingerprint);

    // Invalidate preview on any audience criteria change
    useEffect(() => {
        setPreview(null);
        setPreviewFingerprint('');
    }, [fingerprint]);

    const addInventory = (item) => {
        setSelectedInventory((current) => (current.some((row) => row.id === item.id) ? current : [...current, item]));
        setPreview(null);
    };

    const removeInventory = (id) => {
        setSelectedInventory((current) => current.filter((item) => item.id !== id));
        setPreview(null);
    };

    const previewAudience = async () => {
        setBusy(true);
        setPreview(null);
        try {
            const response = await api.post('/owner-outreach/audience-preview', audience);
            setPreview(response.data?.data || null);
            setPreviewFingerprint(fingerprint);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Audience preview failed');
        } finally {
            setBusy(false);
        }
    };

    const saveDraft = async (event) => {
        if (event) event.preventDefault();
        if (!form.name.trim() || !form.startAt || !previewIsCurrent || !form.providerAccountId || !form.messageBody.trim()) {
            toast.error('Campaign name, message, connected WhatsApp account, start time aur latest audience preview zaroori hain');
            return;
        }
        if (!form.owners && !form.associates) {
            toast.error('Kam se kam Owners ya Associates mein se ek audience type select karein');
            return;
        }
        if (form.windowStart >= form.windowEnd) {
            toast.error('Dispatch window ka end time start se baad hona chahiye');
            return;
        }

        setBusy(true);
        try {
            await api.post('/owner-outreach/campaigns', {
                name: form.name.trim(),
                messageBody: form.messageBody,
                providerAccountId: form.providerAccountId,
                ...audience,
                channels: [form.channel],
                channelStrategy: 'PRIMARY_ONLY',
                frequency: form.frequency,
                batchSize: Number(form.batch),
                startAt: istDateTimeToIso(form.startAt),
                endAt: form.endAt ? istDateTimeToIso(form.endAt + 'T23:59', true) : null,
                dispatchWindow: { start: form.windowStart, end: form.windowEnd }
            });
            toast.success('Draft saved. Koi message send nahi hua.');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Draft save nahi hua');
        } finally {
            setBusy(false);
        }
    };

    const inputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'}`,
        borderRadius: 8,
        background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontSize: 13,
        outline: 'none',
        transition: 'border-color 0.2s'
    };

    const labelStyle = {
        display: 'block',
        fontSize: 11,
        fontWeight: 700,
        color: isDark ? '#94a3b8' : '#475569',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
    };

    const cardStyle = {
        background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
        borderRadius: 12,
        padding: 16
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Owner Outreach — Campaign Planning"
            size="xl"
            role="dialog"
            aria-label="Owner Outreach Campaign Planning Form"
            style={{ maxWidth: 1040 }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldCheck size={14} style={{ color: '#16a34a' }} />
                        <span>Safe planning mode. Outbound WhatsApp provider dispatch remains disabled.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                color: isDark ? '#cbd5e1' : '#475569',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1'}`,
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={busy || (!selectedInventory.length && !form.project.trim())}
                            onClick={previewAudience}
                            style={{
                                padding: '8px 16px',
                                background: isDark ? 'rgba(201, 146, 26, 0.15)' : '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #f59e0b',
                                borderRadius: 8,
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: busy || (!selectedInventory.length && !form.project.trim()) ? 'not-allowed' : 'pointer',
                                opacity: busy || (!selectedInventory.length && !form.project.trim()) ? 0.6 : 1
                            }}
                        >
                            {busy ? 'Please wait…' : 'Preview audience'}
                        </button>
                        <button
                            type="button"
                            onClick={saveDraft}
                            disabled={busy || !previewIsCurrent}
                            style={{
                                padding: '8px 20px',
                                background: previewIsCurrent ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : '#94a3b8',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: previewIsCurrent && !busy ? 'pointer' : 'not-allowed',
                                boxShadow: previewIsCurrent ? '0 3px 10px rgba(15, 23, 42, 0.25)' : 'none'
                            }}
                        >
                            Save draft only
                        </button>
                    </div>
                </div>
            }
        >
            <div style={{ maxHeight: 'calc(85vh - 140px)', overflowY: 'auto', paddingRight: 4 }}>
                {/* Safe Planning Notice */}
                <div
                    style={{
                        border: '1px solid #f0d7a6',
                        background: isDark ? 'rgba(180, 83, 9, 0.12)' : '#fffaf0',
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: 16,
                        color: isDark ? '#fbbf24' : '#854d0e',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}
                >
                    <Info size={16} style={{ flexShrink: 0 }} />
                    <div>
                        <strong>Safe planning mode:</strong> Phase 2 campaign scheduling and monitoring available. Provider dispatch, outbound queueing and live WhatsApp sends are disabled.
                    </div>
                </div>

                {/* 2-Column Responsive Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(290px, 0.85fr)', gap: 16, alignItems: 'start' }}>
                    {/* Left Column: Form Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={cardStyle}>
                            <label htmlFor="modal-outreach-name" style={labelStyle}>Campaign Name</label>
                            <input
                                id="modal-outreach-name"
                                style={inputStyle}
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder="e.g. Sector 3 Owner Update – November"
                                maxLength={120}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                                <div>
                                    <label htmlFor="modal-outreach-account" style={labelStyle}>Authorized WhatsApp Account</label>
                                    <select
                                        id="modal-outreach-account"
                                        style={inputStyle}
                                        value={form.providerAccountId}
                                        onChange={(e) => set('providerAccountId', e.target.value)}
                                    >
                                        <option value="">Select connected account</option>
                                        {accounts.map((account) => (
                                            <option key={account.id} value={account.id}>
                                                {account.label} · {account.provider}
                                            </option>
                                        ))}
                                    </select>
                                    {accounts.length === 0 && (
                                        <small style={{ color: '#b45309', display: 'block', marginTop: 4 }}>
                                            No fully connected, authorized WhatsApp account found.
                                        </small>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-channel" style={labelStyle}>Primary Channel</label>
                                    <select
                                        id="modal-outreach-channel"
                                        style={inputStyle}
                                        value={form.channel}
                                        onChange={(e) => set('channel', e.target.value)}
                                    >
                                        {channels.map((ch) => (
                                            <option key={ch.value} value={ch.value} disabled={!ch.available}>
                                                {ch.label} {!ch.available ? '(Coming later)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: 12 }}>
                                <label htmlFor="modal-outreach-message" style={labelStyle}>Message Text</label>
                                <textarea
                                    id="modal-outreach-message"
                                    style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                                    maxLength={4096}
                                    value={form.messageBody}
                                    onChange={(e) => set('messageBody', e.target.value)}
                                />
                                <small style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 11, display: 'block', marginTop: 4 }}>
                                    Max 4096 characters. Use {'{{property}}'} for inventory property reference.
                                </small>
                            </div>
                        </div>

                        {/* Searchable Inventory Autocomplete Picker */}
                        <div style={{ ...cardStyle, background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div>
                                    <strong style={{ fontSize: 13, color: isDark ? '#f1f5f9' : '#0f172a' }}>Select CRM Inventory</strong>
                                    <p style={{ margin: '2px 0 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}>
                                        Search properties visible to your CRM account. Zero contact PII is exposed.
                                    </p>
                                </div>
                                <span style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#475569', fontWeight: 600 }}>
                                    {selectedInventory.length} selected
                                </span>
                            </div>

                            <InventoryAutocompletePicker
                                selectedItems={selectedInventory}
                                onSelect={addInventory}
                                onRemove={removeInventory}
                                disabled={busy}
                                placeholder="Type at least 2 characters (e.g. Sector 13, Tower A)..."
                            />

                            <div style={{ marginTop: 12 }}>
                                <label htmlFor="modal-outreach-project" style={labelStyle}>Optional Project / Sector Filter</label>
                                <input
                                    id="modal-outreach-project"
                                    style={inputStyle}
                                    value={form.project}
                                    onChange={(e) => set('project', e.target.value)}
                                    placeholder="e.g. Sector 3 / IT City"
                                />
                                <small style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 11, display: 'block', marginTop: 4 }}>
                                    Selected inventory IDs and this project filter are intersected; visibility rules always apply.
                                </small>
                            </div>
                        </div>

                        {/* Audience Inclusion Checkboxes */}
                        <div style={{ ...cardStyle, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px' }}>
                            {[
                                ['owners', 'Include owners'],
                                ['associates', 'Include associates'],
                                ['excludeBrokers', 'Exclude brokers by default']
                            ].map(([key, labelText]) => (
                                <label key={key} style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                                    <input
                                        type="checkbox"
                                        checked={form[key]}
                                        onChange={(e) => set(key, e.target.checked)}
                                    />
                                    {labelText}
                                </label>
                            ))}
                        </div>

                        {/* Schedule Configuration */}
                        <div style={cardStyle}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                Schedule Configuration
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label htmlFor="modal-outreach-frequency" style={labelStyle}>Frequency</label>
                                    <select
                                        id="modal-outreach-frequency"
                                        style={inputStyle}
                                        value={form.frequency}
                                        onChange={(e) => set('frequency', e.target.value)}
                                    >
                                        {['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((v) => (
                                            <option key={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-batch" style={labelStyle}>Endpoints per Period</label>
                                    <select
                                        id="modal-outreach-batch"
                                        style={inputStyle}
                                        value={form.batch}
                                        onChange={(e) => set('batch', e.target.value)}
                                    >
                                        {batchSizes.map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-start" style={labelStyle}>Start Date & Time (IST)</label>
                                    <input
                                        id="modal-outreach-start"
                                        type="datetime-local"
                                        style={inputStyle}
                                        value={form.startAt}
                                        onChange={(e) => set('startAt', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-end" style={labelStyle}>End Date (Optional)</label>
                                    <input
                                        id="modal-outreach-end"
                                        type="date"
                                        style={inputStyle}
                                        value={form.endAt}
                                        onChange={(e) => set('endAt', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-window-start" style={labelStyle}>Window Start (IST)</label>
                                    <input
                                        id="modal-outreach-window-start"
                                        type="time"
                                        style={inputStyle}
                                        value={form.windowStart}
                                        onChange={(e) => set('windowStart', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="modal-outreach-window-end" style={labelStyle}>Window End (IST)</label>
                                    <input
                                        id="modal-outreach-window-end"
                                        type="time"
                                        style={inputStyle}
                                        value={form.windowEnd}
                                        onChange={(e) => set('windowEnd', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Audience Preview & Privacy Telemetry */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                    Audience Preview
                                </h3>
                                {previewIsCurrent && (
                                    <span style={{ fontSize: 10, color: '#15803d', fontWeight: 800, background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                                        CURRENT
                                    </span>
                                )}
                            </div>

                            {!preview ? (
                                <p style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5, margin: 0 }}>
                                    Select inventory properties and click <strong>Preview audience</strong> to view masked, deduplicated recipient counts and consent metrics.
                                </p>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {[
                                            ['Unique People', preview.counts?.uniquePeople],
                                            ['Endpoints', preview.counts?.uniqueEndpoints],
                                            ['Consent Required', preview.counts?.consentRequired],
                                            ['Suppressed', preview.counts?.suppressed]
                                        ].map(([title, val]) => (
                                            <div
                                                key={title}
                                                style={{
                                                    background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                                                    padding: 10,
                                                    borderRadius: 8,
                                                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9'}`
                                                }}
                                            >
                                                <div style={{ fontSize: 10, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase' }}>
                                                    {title}
                                                </div>
                                                <strong style={{ fontSize: 18, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                                                    {Number(val || 0).toLocaleString('en-IN')}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', marginTop: 10 }}>
                                        Inventory scanned: <strong>{preview.inventoryCount || 0}</strong>
                                    </div>

                                    <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 10, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}`, paddingTop: 8 }}>
                                        {(preview.endpoints || []).slice(0, 30).map((ep, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    gap: 6,
                                                    padding: '6px 0',
                                                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'}`,
                                                    fontSize: 11
                                                }}
                                            >
                                                <span style={{ color: isDark ? '#cbd5e1' : '#334155' }}>
                                                    {(ep.channel || 'whatsapp').toUpperCase()} · {ep.maskedEndpoint || ep.endpointMasked || '—'}
                                                </span>
                                                <span style={{ fontWeight: 600, color: ep.eligibility === 'ELIGIBLE' ? '#16a34a' : '#b45309' }}>
                                                    {ep.eligibility}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Privacy & Compliance Card */}
                        <div
                            style={{
                                ...cardStyle,
                                background: isDark ? 'rgba(180, 83, 9, 0.1)' : '#fffaf0',
                                borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#f4dfb3'
                            }}
                        >
                            <strong style={{ fontSize: 12, color: isDark ? '#fbbf24' : '#854d0e', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ShieldCheck size={14} /> Consent & Privacy Policy
                            </strong>
                            <p style={{ fontSize: 11, color: isDark ? '#fde68a' : '#92400e', lineHeight: 1.5, margin: '6px 0 0' }}>
                                Endpoints are masked and protected using HMAC-SHA-256 keyed hashing. All outreach adheres to Indian Real Estate compliance standards.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

OwnerOutreachModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    initialInventory: PropTypes.array,
    onSuccess: PropTypes.func
};
