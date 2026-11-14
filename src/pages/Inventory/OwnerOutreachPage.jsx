import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

const batchSizes = [50,100,200,300,400,500,600,700,800,900,1000,1250,1500,1750,2000];
const channels = [{ value: 'whatsapp', label: 'WhatsApp', available: true }, { value: 'sms', label: 'SMS', available: false }, { value: 'rcs', label: 'RCS', available: false }, { value: 'email', label: 'Email', available: false }];
const field = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #dbe2ea', borderRadius: 9, background: '#fff', color: '#172033' };
const card = { background: '#fff', border: '1px solid #e5eaf1', borderRadius: 14, padding: 20 };
const label = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7 };
const button = { border: '1px solid #d8e0eb', background: '#fff', borderRadius: 9, padding: '9px 12px', fontWeight: 700, cursor: 'pointer' };
const dateLabel = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—';
const istDateTimeToIso = (value, endOfDay = false) => {
    if (!value) return null;
    const [datePart, timePart = '00:00'] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, endOfDay ? 59 : 0, endOfDay ? 999 : 0)).toISOString();
};
const statusTone = (status) => ({
    DRAFT: '#64748b', APPROVED: '#2563eb', ACTIVE: '#2563eb', PAUSED: '#b7791f',
    COMPLETED: '#15803d', CANCELLED: '#b91c1c', SCHEDULED: '#2563eb', CLAIMED: '#7c3aed',
    PLANNED: '#0f766e', READY: '#0f766e', DISPATCHING: '#b45309', PARTIAL: '#b45309',
    RECONCILIATION_REQUIRED: '#b91c1c'
}[status] || '#64748b');

export default function OwnerOutreachPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        messageBody: 'Namaste, Bharat Properties se sampark kar rahe hain. Aapki property {{property}} ke sambandh mein baat karni thi. Kya aap abhi bhi is property ke owner hain aur iske sale/rent ke liye available hain? Agar aap aise messages nahi chahte, to STOP reply karein.',
        providerAccountId: '', project: '', owners: true, associates: false, excludeBrokers: true,
        channel: 'whatsapp', frequency: 'DAILY', batch: 100, startAt: '', endAt: '',
        windowStart: '10:00', windowEnd: '18:00'
    });
    const [selectedInventory, setSelectedInventory] = useState([]);
    const [inventoryQuery, setInventoryQuery] = useState('');
    const [inventoryResults, setInventoryResults] = useState([]);
    const [inventorySearching, setInventorySearching] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewFingerprint, setPreviewFingerprint] = useState('');
    const [campaigns, setCampaigns] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [campaignDetail, setCampaignDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const detailRequestRef = useRef(0);

    const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
    const audience = useMemo(() => ({
        inventoryIds: selectedInventory.map((item) => item.id),
        filters: form.project.trim() ? { project: form.project.trim() } : {},
        includeOwners: form.owners,
        includeAssociates: form.associates,
        excludeBrokers: form.excludeBrokers,
        channels: [form.channel]
    }), [selectedInventory, form.project, form.owners, form.associates, form.excludeBrokers, form.channel]);
    const fingerprint = useMemo(() => JSON.stringify(audience), [audience]);
    const previewIsCurrent = Boolean(preview && previewFingerprint === fingerprint);

    useEffect(() => {
        setPreview(null);
        setPreviewFingerprint('');
    }, [fingerprint]);

    const refreshCampaigns = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/owner-outreach/campaigns');
            setCampaigns(response.data?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Campaigns load nahi hue');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCampaignDetail = useCallback(async (id) => {
        if (!id) return;
        setSelectedCampaignId(id);
        const requestId = ++detailRequestRef.current;
        setDetailLoading(true);
        setCampaignDetail(null);
        try {
            const response = await api.get('/owner-outreach/campaigns/' + id);
            if (requestId === detailRequestRef.current) setCampaignDetail(response.data?.data || null);
        } catch (error) {
            if (requestId === detailRequestRef.current) {
                setCampaignDetail(null);
                toast.error(error.response?.data?.error || 'Campaign details load nahi hue');
            }
        } finally {
            if (requestId === detailRequestRef.current) setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshCampaigns();
        api.get('/owner-outreach/accounts').then((response) => {
            const list = response.data?.data || [];
            setAccounts(list);
            if (list.length === 1) setForm((old) => ({ ...old, providerAccountId: list[0].id }));
        }).catch((error) => toast.error(error.response?.data?.error || 'WhatsApp accounts load nahi hue'));
    }, [refreshCampaigns]);

    const searchInventory = async () => {
        if (inventoryQuery.trim().length < 2) {
            toast.error('Inventory search ke liye kam se kam 2 characters likhein');
            return;
        }
        setInventorySearching(true);
        try {
            const response = await api.get('/owner-outreach/inventory-search', { params: { q: inventoryQuery.trim(), limit: 25 } });
            setInventoryResults(response.data?.data?.items || []);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Inventory search failed');
        } finally {
            setInventorySearching(false);
        }
    };

    const addInventory = (item) => {
        setSelectedInventory((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
        setInventoryResults([]);
        setPreview(null);
    };
    const removeInventory = (id) => setSelectedInventory((current) => current.filter((item) => item.id !== id));

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
        event.preventDefault();
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
            setForm((old) => ({ ...old, name: '' }));
            setSelectedInventory([]);
            setPreview(null);
            setPreviewFingerprint('');
            await refreshCampaigns();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Draft save nahi hua');
        } finally {
            setBusy(false);
        }
    };

    const campaignAction = async (id, action) => {
        const messages = {
            approve: 'Approve schedule? Isse sirf schedule ledger create hoga; koi message send nahi hoga.',
            pause: 'Pause this campaign schedule?',
            resume: 'Resume this campaign schedule?',
            cancel: 'Cancel this campaign schedule?'
        };
        if (!window.confirm(messages[action])) return;
        setBusy(true);
        try {
            await api.post('/owner-outreach/campaigns/' + id + '/' + action, action === 'cancel' ? { reason: 'Cancelled by campaign owner' } : {});
            toast.success(action === 'approve' ? 'Schedule approved. Dispatch remains disabled.' : 'Campaign ' + action + 'd.');
            await refreshCampaigns();
            if (selectedCampaignId === id) await loadCampaignDetail(id);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Campaign action failed');
        } finally {
            setBusy(false);
        }
    };

    const input = (key, props = {}) => (
        <input style={field} value={form[key]} onChange={(event) => set(key, event.target.value)} {...props} />
    );
    const summary = campaignDetail?.batchSummary || { total: 0, byStatus: {} };

    return (
        <main style={{ background: '#f5f7fb', minHeight: '100%', padding: '26px clamp(16px,3vw,34px)', color: '#172033' }}>
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
                    <div>
                        <div style={{ color: '#b7791f', fontSize: 11, fontWeight: 800, letterSpacing: '.13em' }}>INVENTORY CRM · OUTREACH</div>
                        <h1 style={{ margin: '7px 0', fontSize: 30 }}>Owner Outreach</h1>
                        <p style={{ margin: 0, color: '#64748b' }}>Inventory owners aur selected associates ke liye consent-aware campaign planning.</p>
                    </div>
                    <button onClick={() => navigate('/inventory')} style={button}>Back to Inventory</button>
                </header>

                <div style={{ border: '1px solid #f0d7a6', background: '#fffaf0', borderRadius: 12, padding: '12px 16px', marginBottom: 18, color: '#854d0e', fontSize: 13 }}>
                    <strong>Safe planning mode:</strong> Phase 2 mein campaign scheduling aur monitoring available hai. Provider dispatch, outbound queueing aur actual WhatsApp sending disabled hain.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(290px,.8fr)', gap: 18, alignItems: 'start' }}>
                    <form onSubmit={saveDraft} style={card}>
                        <h2 style={{ margin: '0 0 18px', fontSize: 18 }}>Create campaign draft</h2>
                        <label style={label}>CAMPAIGN NAME</label>
                        {input('name', { placeholder: 'Sector 3 Owner Update – November', maxLength: 120 })}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                            <div>
                                <label style={label}>AUTHORIZED WHATSAPP ACCOUNT</label>
                                <select style={field} value={form.providerAccountId} onChange={(event) => set('providerAccountId', event.target.value)}>
                                    <option value=''>Select connected account</option>
                                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.provider} · {account.connectionType}</option>)}
                                </select>
                                {accounts.length === 0 && <small style={{ color: '#b45309' }}>No fully connected, authorized WhatsApp account found.</small>}
                            </div>
                            <div>
                                <label style={label}>MESSAGE TEXT</label>
                                <textarea style={{ ...field, minHeight: 110 }} maxLength={4096} value={form.messageBody} onChange={(event) => set('messageBody', event.target.value)} />
                                <small style={{ color: '#64748b' }}>Max 4096 characters. Use {'{{property}}'} for inventory property reference.</small>
                            </div>
                        </div>

                        <section style={{ marginTop: 18, padding: 14, background: '#f8fafc', borderRadius: 11, border: '1px solid #e8edf4' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div><strong style={{ fontSize: 14 }}>Select CRM inventory</strong><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>Search only returns records visible to your CRM account. No owner phone/email is exposed here.</p></div>
                                <span style={{ fontSize: 12, color: '#475569' }}>{selectedInventory.length} selected</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <input style={{ ...field, flex: 1 }} value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); searchInventory(); } }} placeholder='Search project, sector, unit number…' />
                                <button type='button' disabled={inventorySearching} onClick={searchInventory} style={{ ...button, background: '#1a2744', color: '#fff', borderColor: '#1a2744' }}>{inventorySearching ? 'Searching…' : 'Search'}</button>
                            </div>
                            {inventoryResults.length > 0 && (
                                <div style={{ marginTop: 9, border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', maxHeight: 230, overflowY: 'auto' }}>
                                    {inventoryResults.map((item) => (
                                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 10, borderBottom: '1px solid #f1f5f9' }}>
                                            <div><strong style={{ fontSize: 13 }}>{item.project} · {item.unit}</strong><div style={{ color: '#64748b', fontSize: 11 }}>{item.size || 'Size not specified'}</div></div>
                                            <button type='button' style={button} disabled={selectedInventory.some((row) => row.id === item.id)} onClick={() => addInventory(item)}>{selectedInventory.some((row) => row.id === item.id) ? 'Added' : 'Add'}</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {selectedInventory.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                                    {selectedInventory.map((item) => <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eaf0f8', color: '#1a2744', borderRadius: 20, padding: '6px 9px', fontSize: 11 }}>{item.project} · {item.unit}<button type='button' aria-label={'Remove ' + item.label} onClick={() => removeInventory(item.id)} style={{ border: 0, background: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 800 }}>×</button></span>)}
                                </div>
                            )}
                            <div style={{ marginTop: 12 }}>
                                <label style={label}>OPTIONAL PROJECT / SECTOR FILTER</label>
                                {input('project', { placeholder: 'Sector 3 / IT City' })}
                                <small style={{ color: '#64748b' }}>Selected inventory IDs and this project filter are intersected; visibility rules always apply.</small>
                            </div>
                        </section>

                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '14px 0', borderBottom: '1px solid #edf1f6', marginBottom: 16 }}>
                            {[['owners', 'Include owners'], ['associates', 'Include associates'], ['excludeBrokers', 'Exclude brokers by default']].map(([key, title]) => (
                                <label key={key} style={{ fontSize: 13 }}><input type='checkbox' checked={form[key]} onChange={(event) => set(key, event.target.checked)} /> {title}</label>
                            ))}
                        </div>

                        <label style={label}>PRIMARY CHANNEL</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
                            {channels.map((channel) => (
                                <label key={channel.value} title={channel.available ? 'Available in Phase 1' : 'Channel-specific consent and provider adapter are not implemented'} style={{ border: form.channel === channel.value ? '1.5px solid #c9921a' : '1px solid #e2e8f0', borderRadius: 9, padding: 10, background: form.channel === channel.value ? '#fffbeb' : '#f8fafc', fontSize: 12, fontWeight: 700, opacity: channel.available ? 1 : .5 }}>
                                    <input type='radio' name='channel' value={channel.value} checked={form.channel === channel.value} disabled={!channel.available} onChange={() => set('channel', channel.value)} /> {channel.label}
                                    {!channel.available && <small style={{ display: 'block', fontSize: 9, marginTop: 4 }}>Coming later</small>}
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                            <div><label style={label}>FREQUENCY</label><select style={field} value={form.frequency} onChange={(event) => set('frequency', event.target.value)}>{['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((value) => <option key={value}>{value}</option>)}</select></div>
                            <div><label style={label}>ENDPOINTS PER PERIOD</label><select style={field} value={form.batch} onChange={(event) => set('batch', event.target.value)}>{batchSizes.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                            <div><label style={label}>START DATE & TIME (IST)</label>{input('startAt', { type: 'datetime-local' })}</div>
                            <div><label style={label}>END DATE (OPTIONAL)</label>{input('endAt', { type: 'date' })}</div>
                            <div><label style={label}>WINDOW START</label>{input('windowStart', { type: 'time' })}</div>
                            <div><label style={label}>WINDOW END</label>{input('windowEnd', { type: 'time' })}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button type='button' disabled={busy || (!selectedInventory.length && !form.project.trim())} onClick={previewAudience} style={{ ...button, borderColor: '#c9921a', color: '#8a5b08' }}>{busy ? 'Please wait…' : 'Preview audience'}</button>
                            <button type='submit' disabled={busy || !previewIsCurrent} style={{ ...button, background: previewIsCurrent ? '#1a2744' : '#94a3b8', color: '#fff', border: 0 }}>Save draft only</button>
                        </div>
                        <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, marginBottom: 0 }}>Preview becomes invalid whenever audience filters or selection changes. Provider connection does not equal marketing consent.</p>
                    </form>

                    <aside style={{ display: 'grid', gap: 14 }}>
                        <section style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <h2 style={{ fontSize: 17, margin: '0 0 14px' }}>Audience preview</h2>
                                {previewIsCurrent && <span style={{ fontSize: 10, color: '#15803d', fontWeight: 800 }}>CURRENT</span>}
                            </div>
                            {!preview ? <p style={{ fontSize: 13, color: '#94a3b8' }}>Select inventory and preview to view masked, deduplicated endpoints and consent eligibility.</p> : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                                        {[['Unique people', preview.counts?.uniquePeople], ['Endpoints', preview.counts?.uniqueEndpoints], ['Consent required', preview.counts?.consentRequired], ['Suppressed', preview.counts?.suppressed]].map(([title, value]) => <div key={title} style={{ background: '#f8fafc', padding: 12, borderRadius: 9 }}><div style={{ fontSize: 11, color: '#64748b' }}>{title}</div><strong style={{ fontSize: 22 }}>{Number(value || 0).toLocaleString('en-IN')}</strong></div>)}
                                    </div>
                                    <p style={{ fontSize: 12, color: '#64748b' }}>Inventory scanned: {preview.inventoryCount || 0}</p>
                                    <div style={{ maxHeight: 250, overflow: 'auto' }}>{(preview.endpoints || []).slice(0, 35).map((item, index) => <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #f1f5f9', padding: '8px 0', fontSize: 11 }}><span>{item.channel.toUpperCase()} · {item.maskedEndpoint}</span><span>{item.eligibility}</span></div>)}</div>
                                </>
                            )}
                        </section>
                        <section style={{ ...card, background: '#fffaf0', borderColor: '#f4dfb3' }}>
                            <strong style={{ fontSize: 13, color: '#854d0e' }}>Compliance guardrail</strong>
                            <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.55, marginBottom: 0 }}>Opt-outs are suppressed. Only explicitly consented recipients can enter the schedule ledger. No provider send or CRM contact/inventory write occurs.</p>
                        </section>
                    </aside>
                </div>

                <section style={{ ...card, marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div><h2 style={{ fontSize: 18, margin: '0 0 4px' }}>Campaigns & schedule monitor</h2><p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Schedule-ledger progress only; not message delivery progress.</p></div>
                        <button type='button' style={button} onClick={refreshCampaigns} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh campaigns'}</button>
                    </div>
                    {loading ? <p>Loading campaigns…</p> : campaigns.length === 0 ? <p style={{ color: '#94a3b8' }}>No campaigns yet.</p> : (
                        <div style={{ overflowX: 'auto', marginTop: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                                <thead><tr>{['Campaign', 'Channel', 'Frequency', 'Batch size', 'Recipients', 'Next scheduled run', 'Status', 'Actions'].map((title) => <th key={title} style={{ padding: 9, whiteSpace: 'nowrap' }}>{title}</th>)}</tr></thead>
                                <tbody>{campaigns.map((campaign) => <tr key={campaign._id} style={{ borderTop: '1px solid #edf1f6' }}>
                                    <td style={{ padding: 9, minWidth: 170 }}><strong>{campaign.name}</strong><div style={{ color: '#64748b', fontSize: 10 }}>{campaign._id}</div></td>
                                    <td style={{ padding: 9 }}>{(campaign.channels || []).join(', ')}</td>
                                    <td style={{ padding: 9 }}>{campaign.frequency}</td>
                                    <td style={{ padding: 9 }}>{campaign.batchSize}</td>
                                    <td style={{ padding: 9 }}>{Number(campaign.totals?.recipients || 0).toLocaleString('en-IN')}</td>
                                    <td style={{ padding: 9, whiteSpace: 'nowrap' }}>{dateLabel(campaign.nextRunAt)}</td>
                                    <td style={{ padding: 9 }}><span style={{ color: statusTone(campaign.status), fontWeight: 800 }}>{campaign.status}</span></td>
                                    <td style={{ padding: 9, whiteSpace: 'nowrap' }}>
                                        <button type='button' style={button} disabled={busy} onClick={() => loadCampaignDetail(campaign._id)}>Details</button>{' '}
                                        {campaign.status === 'DRAFT' && <button type='button' style={button} disabled={busy} onClick={() => campaignAction(campaign._id, 'approve')}>Approve schedule</button>}
                                        {['APPROVED', 'ACTIVE'].includes(campaign.status) && <button type='button' style={button} disabled={busy} onClick={() => campaignAction(campaign._id, 'pause')}>Pause</button>}
                                        {campaign.status === 'PAUSED' && <button type='button' style={button} disabled={busy} onClick={() => campaignAction(campaign._id, 'resume')}>Resume</button>}
                                        {!['CANCELLED', 'COMPLETED'].includes(campaign.status) && <button type='button' style={button} disabled={busy} onClick={() => campaignAction(campaign._id, 'cancel')}>Cancel</button>}
                                    </td>
                                </tr>)}</tbody>
                            </table>
                        </div>
                    )}
                </section>

                {selectedCampaignId && (
                    <section style={{ ...card, marginTop: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div><h2 style={{ margin: 0, fontSize: 18 }}>Campaign detail & batch monitor</h2><p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 12 }}>Batch state is planning lifecycle only. No outbound messages are dispatched.</p></div>
                            <div style={{ display: 'flex', gap: 8 }}><button type='button' style={button} disabled={detailLoading} onClick={() => loadCampaignDetail(selectedCampaignId)}>Refresh detail</button><button type='button' style={button} onClick={() => { setSelectedCampaignId(''); setCampaignDetail(null); }}>Close</button></div>
                        </div>
                        {detailLoading ? <p>Loading campaign details…</p> : !campaignDetail ? <p style={{ color: '#b91c1c' }}>Campaign detail unavailable. Refresh to retry.</p> : (
                            <>
                                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 9 }}>
                                    {[['Total batches', summary.total], ...Object.entries(summary.byStatus || {}).map(([status, count]) => [status.replaceAll('_', ' '), count])].map(([title, value]) => <div key={title} style={{ background: '#f8fafc', border: '1px solid #edf1f6', borderRadius: 9, padding: 12 }}><div style={{ color: '#64748b', fontSize: 11 }}>{title}</div><strong style={{ fontSize: 21 }}>{Number(value || 0).toLocaleString('en-IN')}</strong></div>)}
                                </div>
                                {campaignDetail.batchesTruncated && <p role='status' style={{ margin: '12px 0 0', padding: 10, borderRadius: 8, background: '#fffaf0', color: '#854d0e', fontSize: 12 }}>Showing the first 500 schedule rows. Summary counts above include all {summary.total.toLocaleString('en-IN')} batches; refresh or use a future paginated view for older rows.</p>}
                                <div style={{ marginTop: 14, overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                        <thead><tr>{['Batch', 'Scheduled at (IST)', 'Status', 'Selected', 'Started', 'Completed', 'Error code'].map((title) => <th key={title} style={{ padding: 9, whiteSpace: 'nowrap' }}>{title}</th>)}</tr></thead>
                                        <tbody>{(campaignDetail.batches || []).map((batch) => <tr key={batch._id} style={{ borderTop: '1px solid #edf1f6' }}>
                                            <td style={{ padding: 9 }}>#{batch.sequence}</td><td style={{ padding: 9, whiteSpace: 'nowrap' }}>{dateLabel(batch.scheduledAt)}</td>
                                            <td style={{ padding: 9, color: statusTone(batch.status), fontWeight: 800 }}>{batch.status}</td><td style={{ padding: 9 }}>{batch.counts?.selected || 0}</td>
                                            <td style={{ padding: 9, whiteSpace: 'nowrap' }}>{dateLabel(batch.startedAt)}</td><td style={{ padding: 9, whiteSpace: 'nowrap' }}>{dateLabel(batch.completedAt)}</td>
                                            <td style={{ padding: 9 }}>{batch.lastErrorCode || '—'}</td>
                                        </tr>)}</tbody>
                                    </table>
                                    {(campaignDetail.batches || []).length === 0 && <p style={{ color: '#64748b' }}>No schedule batches have been created yet.</p>}
                                </div>
                                <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Recipient eligibility summary</h3>
                                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                    <thead><tr><th style={{ padding: 8 }}>Channel</th><th style={{ padding: 8 }}>Eligibility</th><th style={{ padding: 8 }}>Schedule state</th><th style={{ padding: 8 }}>Count</th></tr></thead>
                                    <tbody>{(campaignDetail.byState || []).map((row, index) => <tr key={index} style={{ borderTop: '1px solid #edf1f6' }}><td style={{ padding: 8 }}>{row._id?.channel}</td><td style={{ padding: 8 }}>{row._id?.eligibility}</td><td style={{ padding: 8 }}>{row._id?.dispatchState}</td><td style={{ padding: 8 }}>{row.count}</td></tr>)}</tbody>
                                </table></div>
                                <p style={{ color: '#64748b', fontSize: 11, marginBottom: 0 }}>Recipient sample contains masked endpoints only. This panel does not represent accepted, delivered or failed WhatsApp messages.</p>
                            </>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}
