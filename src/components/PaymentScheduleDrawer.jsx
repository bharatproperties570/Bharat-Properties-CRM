import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const urgencyColor = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Critical: '#dc2626' };
const statusConfig = {
    Paid:    { bg: '#f0fdf4', text: '#15803d', icon: 'fa-check-circle' },
    Partial: { bg: '#fffbeb', text: '#d97706', icon: 'fa-adjust' },
    Overdue: { bg: '#fef2f2', text: '#b91c1c', icon: 'fa-exclamation-circle' },
    Pending: { bg: '#f8fafc', text: '#64748b', icon: 'fa-clock' },
};

const PAYMENT_MODES = ['Cash', 'Cheque', 'NEFT', 'UPI', 'DD', 'RTGS', 'Other'];
const PAYMENT_PURPOSES = ['Token', 'Earnest Money', 'Transfer Fees', 'Extension Fees', 'Interest of Installment', 'Part Payment', 'Final Payment', 'Other'];

const numberToWords = (num) => {
    if (num === 0) return 'Zero Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = num.toString()).length > 9) return 'Overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return;
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : 'Only';
    return str.trim();
};

export default function PaymentScheduleDrawer({ booking, onClose, onUpdate }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'commission' | 'schedule'
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        label: '', paymentPurpose: 'Part Payment', paidDate: new Date().toISOString().split('T')[0], remarks: '', payerName: '', payeeName: '', scheduleItemId: null, editingPaymentId: null,
        transactions: [{ amount: '', paymentMode: 'Cash', referenceNo: '', bankName: '', payeeAccountDetails: '' }]
    });
    const [commissionForm, setCommissionForm] = useState({ commissionReceived: '', channelPartnerCommissionReceived: '' });
    const [saving, setSaving] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [lookupDict, setLookupDict] = useState({});

    useEffect(() => {
        api.get('/users?limit=500&status=Active')
            .then(res => { if (res.data?.success) setAllUsers(res.data.data); })
            .catch(console.error);

        api.get('/lookups?limit=5000&lookup_type=City,State,Tehsil,PostOffice,District,Country,Location')
            .then(res => {
                if (res.data?.status === 'success' || res.data?.data) {
                    const dict = {};
                    (res.data.data || []).forEach(l => {
                        if (l._id) dict[l._id] = l.lookup_value;
                    });
                    setLookupDict(dict);
                }
            })
            .catch(console.error);
    }, []);

    // Schedule builder
    const defaultSchedule = useCallback(() => {
        if (!booking) return [];
        const total = booking.financials?.dealValue || 0;
        return [
            { label: 'Token', dueDate: booking.dealDate?.split?.('T')[0] || '', dueAmount: booking.financials?.agreementAmount || Math.round(total * 0.02) },
            { label: 'Agreement Payment', dueDate: '', dueAmount: Math.round(total * 0.08) },
            { label: 'Part Payment 1', dueDate: '', dueAmount: Math.round(total * 0.30) },
            { label: 'Final Payment', dueDate: '', dueAmount: Math.round(total * 0.60) },
        ];
    }, [booking]);

    const [scheduleRows, setScheduleRows] = useState([]);

    const fetchFull = useCallback(async () => {
        if (!booking?._id) return;
        setLoading(true);
        try {
            const res = await api.get(`/bookings/${booking._id}`);
            if (res.data.success) {
                setData(res.data.data);
                setCommissionForm({
                    commissionReceived: res.data.data.commissionReceived || '',
                    channelPartnerCommissionReceived: res.data.data.channelPartnerCommissionReceived || ''
                });
                if (!res.data.data.paymentSchedule?.length) {
                    setScheduleRows(defaultSchedule());
                    setActiveTab('schedule');
                }
            }
        } catch (e) {
            toast.error('Failed to load booking details');
        } finally {
            setLoading(false);
        }
    }, [booking?._id, defaultSchedule]);

    useEffect(() => { fetchFull(); }, [fetchFull]);

    const handleRecordPayment = async (scheduleItem = null) => {
        if (scheduleItem) {
            setPaymentForm(prev => ({
                ...prev,
                label: scheduleItem.label,
                paymentPurpose: scheduleItem.label || 'Part Payment',
                scheduleItemId: scheduleItem._id,
                editingPaymentId: null,
                transactions: [{ amount: scheduleItem.dueAmount - (scheduleItem.paidAmount || 0), paymentMode: 'Cash', referenceNo: '', bankName: '', payeeAccountDetails: '' }]
            }));
        } else {
            setPaymentForm({ label: '', paymentPurpose: 'Part Payment', paidDate: new Date().toISOString().split('T')[0], remarks: '', payerName: '', payeeName: '', scheduleItemId: null, editingPaymentId: null, transactions: [{ amount: '', paymentMode: 'Cash', referenceNo: '', bankName: '', payeeAccountDetails: '' }] });
        }
        setShowPaymentForm(true);
    };

    const handleEditPayment = (item) => {
        setPaymentForm({
            label: item.label || '',
            paymentPurpose: item.paymentPurpose || item.label || 'Part Payment',
            paidDate: item.paidDate ? new Date(item.paidDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            remarks: item.remarks || '',
            payerName: item.payerName || '',
            payeeName: item.payeeName || '',
            scheduleItemId: null,
            editingPaymentId: item._id,
            transactions: item.transactions && item.transactions.length > 0 ? item.transactions.map(t => ({
                amount: t.amount,
                paymentMode: t.paymentMode || 'Cash',
                referenceNo: t.referenceNo || '',
                bankName: t.bankName || '',
                payeeAccountDetails: t.payeeAccountDetails || ''
            })) : [{ amount: item.paidAmount || '', paymentMode: item.paymentMode || 'Cash', referenceNo: item.referenceNo || '', bankName: item.bankName || '', payeeAccountDetails: item.payeeAccountDetails || '' }]
        });
        setShowPaymentForm(true);
    };

    const submitPayment = async () => {
        const totalPaid = paymentForm.transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
        if (totalPaid <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...paymentForm,
                paidAmount: totalPaid
            };
            if (paymentForm.editingPaymentId) {
                await api.put(`/bookings/${booking._id}/payments/${paymentForm.editingPaymentId}`, payload);
                toast.success('Payment updated successfully!');
            } else {
                await api.post(`/bookings/${booking._id}/payments`, payload);
                toast.success('Payment recorded successfully!');
            }
            setShowPaymentForm(false);
            await fetchFull();
            onUpdate?.();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to record payment');
        } finally {
            setSaving(false);
        }
    };

    const submitCommission = async () => {
        setSaving(true);
        try {
            await api.patch(`/bookings/${booking._id}/commission`, commissionForm);
            toast.success('Commission updated!');
            await fetchFull();
            onUpdate?.();
        } catch (e) {
            toast.error('Failed to update commission');
        } finally {
            setSaving(false);
        }
    };

    const submitSchedule = async () => {
        if (scheduleRows.some(r => !r.label || !r.dueAmount)) {
            toast.error('Please fill all schedule entries');
            return;
        }
        setSaving(true);
        try {
            await api.post(`/bookings/${booking._id}/payment-schedule`, { schedule: scheduleRows });
            toast.success('Payment schedule saved!');
            setShowScheduleForm(false);
            setActiveTab('payments');
            await fetchFull();
            onUpdate?.();
        } catch (e) {
            toast.error('Failed to save schedule');
        } finally {
            setSaving(false);
        }
    };

    const b = data || {};
    const schedule = b.paymentSchedule || [];
    const totalPaid = b.totalPaidAmount || 0;
    const totalBalance = b.totalBalanceAmount || 0;
    const dealValue = b.totalDealAmount || 0;
    const paidPct = dealValue > 0 ? Math.min((totalPaid / dealValue) * 100, 100) : 0;
    const commission = {
        total: b.totalCommissionAmount || 0,
        received: b.commissionReceived || 0,
        pending: b.commissionPending || 0,
        cpTotal: b.channelPartnerBrokerageAmount || 0,
        cpReceived: b.channelPartnerCommissionReceived || 0,
    };

    const handleGenerateReceipt = async (item) => {
        const loadingToast = toast.loading('Generating receipt...');
        try {
            // b is the full raw backend document from fetchFull
            let fullSeller = b.seller || booking.customer?.seller?.raw || {};
            let fullBuyer = b.lead || booking.customer?.buyer?.raw || {};

            if (fullSeller._id) {
                const res = await api.get(`/contacts/${fullSeller._id}`);
                if (res.data.success) fullSeller = res.data.data;
            }
            if (fullBuyer._id) {
                const res = await api.get(`/contacts/${fullBuyer._id}`);
                if (res.data.success) fullBuyer = res.data.data;
            }

            toast.dismiss(loadingToast);

            const printWindow = window.open('', '_blank', 'width=900,height=800');
            if (printWindow) {
                const formatAddress = (addr) => {
                    if (!addr) return '';
                    const parts = [];
                    if (addr.hNo) parts.push(`House No. ${addr.hNo}`);
                    if (addr.street) parts.push(addr.street);
                    if (addr.area) parts.push(addr.area);
                    
                    const resolve = (val) => {
                        if (!val) return '';
                        if (val.lookup_value) return val.lookup_value;
                        if (typeof val === 'string') return lookupDict[val] || val;
                        return '';
                    };

                    const loc = resolve(addr.location);
                    const po = resolve(addr.postOffice);
                    const tehsil = resolve(addr.tehsil);
                    const city = resolve(addr.city);
                    const state = resolve(addr.state);
                    const pin = resolve(addr.pincode);

                    if (loc) parts.push(loc);
                    if (po) parts.push(`PO ${po}`);
                    if (tehsil) parts.push(`Tehsil ${tehsil}`);
                    if (city) parts.push(`Distt ${city}`);
                    if (state) parts.push(state);
                    if (pin) parts.push(`– ${pin}`);
                    
                    return parts.join(', ');
                };

                const payer = item.payerName || fullBuyer.fullName || fullBuyer.name || '___________________________';
                const payerFather = fullBuyer.fatherName ? `son of Sh. ${fullBuyer.fatherName}` : '';
                const payerAddress = formatAddress(fullBuyer.personalAddress) ? `resident of ${formatAddress(fullBuyer.personalAddress)}` : '';
                const payerParts = [payerFather, payerAddress].filter(Boolean);
                const fullPayerString = `<strong>${payer}</strong>${payerParts.length > 0 ? `, ${payerParts.join(', ')}` : ''}`;

                const payee = item.payeeName || fullSeller.fullName || fullSeller.name || '___________________________';
                const payeeFather = fullSeller.fatherName ? `son of Sh. ${fullSeller.fatherName}` : '';
                const payeeAddress = formatAddress(fullSeller.personalAddress) ? `resident of ${formatAddress(fullSeller.personalAddress)}` : '';
                const payeeParts = [payeeFather, payeeAddress].filter(Boolean);
                const fullPayeeString = `<strong>${payee}</strong>${payeeParts.length > 0 ? `, ${payeeParts.join(', ')}` : ''}`;

                const amount = item.paidAmount || item.dueAmount || 0;
                const mode = item.paymentMode || '________';
                const date = item.paidDate ? new Date(item.paidDate).toLocaleDateString('en-IN') : '________';
                const projectName = b.property?.projectName || b.property?.projectId?.name || b.project?.name || '_________________';
                const unitName = (b.property?.unitNo || b.property?.unitNumber) !== 'N/A' && (b.property?.unitNo || b.property?.unitNumber) ? b.property?.unitNo || b.property?.unitNumber : '_________________';
                
                // Generate multiple transaction lines for the receipt
                const transactionsList = item.transactions && item.transactions.length > 0 
                    ? item.transactions 
                    : [{ amount: amount, paymentMode: mode, referenceNo: item.referenceNo, payeeAccountDetails: item.payeeAccountDetails }];
                
                const formattedTransactions = transactionsList.map((t, index) => {
                    const tAmt = Number(t.amount || 0);
                    const amtWords = numberToWords(tAmt);
                    const purposeString = item.paymentPurpose || item.label || 'Part Payment';
                    return `
                        ${index + 1}. Rs. <span class="amount">${tAmt.toLocaleString('en-IN')}/-</span> (${amtWords}) as <strong>${purposeString}</strong> received via ${t.paymentMode || 'Cash'} ${t.referenceNo ? `Ref No. ${t.referenceNo}` : ''} in the name of ${payee}, dated ${date}.
                        ${t.payeeAccountDetails ? `<br>Received in Account: <strong>${t.payeeAccountDetails}</strong>` : ''}
                        <br><br>
                    `;
                }).join('');

                const html = `
                    <html>
                    <head>
                        <title>Receipt - ${item.label}</title>
                        <style>
                            body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; }
                            h2 { text-align: center; text-decoration: underline; margin-bottom: 40px; }
                            .content { font-size: 16px; text-align: justify; }
                            .amount { font-weight: bold; }
                            .signatures { margin-top: 80px; display: flex; justify-content: space-between; }
                            .sig-line { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
                            .witnesses { margin-top: 80px; }
                            .witness { margin-bottom: 40px; }
                        </style>
                    </head>
                    <body>
                        <h2>RECEIPT</h2>
                        <div class="content">
                            I, ${fullPayeeString}, do hereby acknowledge receipt of the following amounts in respect of my property <strong>${projectName} Unit ${unitName}</strong>, which I have sold to ${fullPayerString} as per the terms and conditions of the sale agreement, in the presence of witnesses:
                            <br><br>
                            ${formattedTransactions}
                            <strong>Total Amount Received: Rs. ${amount.toLocaleString('en-IN')}/-</strong>
                        </div>
                        
                        <div style="margin-top: 40px;">
                            Date: ${date}
                        </div>

                        <div class="witnesses">
                            <div class="witness">Witness No. 1: __________________________</div>
                            <div class="witness">Witness No. 2: __________________________</div>
                        </div>

                        <div class="signatures">
                            <div></div>
                            <div class="sig-line">
                                <strong>SELLER</strong><br>
                                (${payee})
                            </div>
                        </div>
                        <script>
                            window.onload = function() { window.print(); }
                        </script>
                    </body>
                    </html>
                `;
                printWindow.document.write(html);
                printWindow.document.close();
            }
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error('Failed to load contact details for receipt');
            console.error(err);
        }
    };

    const handleUploadReceipt = async (item, e) => {
        const file = e.target.files[0];
        if (!file) return;

        const loadingToast = toast.loading('Uploading receipt...');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('entityType', 'Bookings');
            formData.append('entityName', b.bookingId || b._id);
            formData.append('docCategory', 'Payment Receipts');
            formData.append('docType', item.paymentPurpose || item.label || 'Receipt');

            const uploadRes = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (uploadRes.data.success) {
                const url = uploadRes.data.url;
                await api.post(`/bookings/${b._id}/payments/${item._id}/receipt`, { receiptUrl: url });
                toast.success('Receipt uploaded successfully!', { id: loadingToast });
                await fetchFull();
                onUpdate?.();
            }
        } catch (error) {
            toast.error('Failed to upload receipt', { id: loadingToast });
        }
    };

    const handleDeleteReceipt = async (item) => {
        if (!window.confirm("Are you sure you want to remove this receipt?")) return;
        const loadingToast = toast.loading('Removing receipt...');
        try {
            await api.delete(`/bookings/${b._id}/payments/${item._id}/receipt`);
            toast.success('Receipt removed successfully!', { id: loadingToast });
            await fetchFull();
            onUpdate?.();
        } catch (error) {
            toast.error('Failed to remove receipt', { id: loadingToast });
        }
    };

    const healthColors = { 'On Track': '#10b981', 'At Risk': '#f59e0b', 'Delayed': '#ef4444', 'Critical': '#dc2626' };
    const healthBg = { 'On Track': '#f0fdf4', 'At Risk': '#fffbeb', 'Delayed': '#fef2f2', 'Critical': '#fef2f2' };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 9998, backdropFilter: 'blur(2px)' }} />

            {/* Drawer */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', background: '#fff',
                zIndex: 9999, display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
                animation: 'slideInRight 0.25s ease-out'
            }}>
                <style>{`
                    @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                    .psd-tab { padding: 10px 16px; border: none; background: transparent; font-size: 0.85rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; color: #64748b; transition: all 0.2s; }
                    .psd-tab.active { color: #6366f1; border-bottom-color: #6366f1; }
                    .psd-tab:hover:not(.active) { color: #334155; }
                    .schedule-row { display: grid; grid-template-columns: 1fr 140px 130px 100px; gap: 8px; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
                    .psd-input { width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; outline: none; color: #0f172a; }
                    .psd-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
                    .psd-btn { padding: 9px 18px; border-radius: 8px; border: none; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
                    .psd-btn-primary { background: #6366f1; color: #fff; }
                    .psd-btn-primary:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
                    .psd-btn-secondary { background: #f1f5f9; color: #334155; }
                    .psd-btn-secondary:hover { background: #e2e8f0; }
                    .psd-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                `}</style>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                                {b.applicationNo || booking?.id}
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>
                                {booking?.customer?.buyer?.name || 'Buyer'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
                                {booking?.property?.project} {booking?.property?.unit !== 'N/A' ? `• Unit ${booking?.property?.unit}` : ''}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-times" />
                            </button>
                            {b.health && (
                                <span style={{ background: healthBg[b.health], color: healthColors[b.health], fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px' }}>
                                    ● {b.health}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Deal Value + Progress */}
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginBottom: '6px' }}>
                            <span>Total Deal: <strong style={{ color: '#fff' }}>{fmt(dealValue)}</strong></span>
                            <span>Collected: <strong style={{ color: '#fff' }}>{fmt(totalPaid)}</strong> ({Math.round(paidPct)}%)</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '99px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${paidPct}%`, background: paidPct >= 100 ? '#4ade80' : '#fbbf24', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                            Balance: <strong style={{ color: '#fbbf24', marginLeft: '4px' }}>{fmt(totalBalance)}</strong>
                        </div>
                    </div>
                </div>

                {/* Health Reason Banner */}
                {b.healthReason && (
                    <div style={{ padding: '10px 24px', background: healthBg[b.health] || '#fffbeb', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8rem', color: healthColors[b.health] || '#d97706' }}>
                        <i className="fas fa-exclamation-triangle" />
                        <span>{b.healthReason}</span>
                    </div>
                )}

                {/* Next Action Banner */}
                {b.nextAction?.label && (
                    <div style={{ padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justify: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-bolt" style={{ color: urgencyColor[b.nextAction.urgency] || '#f59e0b', fontSize: '0.9rem' }} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Next: {b.nextAction.label}</span>
                        </div>
                        {b.nextAction.dueDate && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Due: {fmtDate(b.nextAction.dueDate)}</span>
                        )}
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 8px' }}>
                    <button className={`psd-tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
                        <i className="fas fa-money-bill-wave" style={{ marginRight: '6px' }} />Payments
                        {schedule.length > 0 && <span style={{ marginLeft: '6px', background: '#6366f1', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '99px' }}>{schedule.length}</span>}
                    </button>
                    <button className={`psd-tab ${activeTab === 'commission' ? 'active' : ''}`} onClick={() => setActiveTab('commission')}>
                        <i className="fas fa-hand-holding-usd" style={{ marginRight: '6px' }} />Commission
                    </button>
                    <button className={`psd-tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => { setScheduleRows(schedule.length ? schedule : defaultSchedule()); setActiveTab('schedule'); }}>
                        <i className="fas fa-calendar-alt" style={{ marginRight: '6px' }} />Setup Schedule
                    </button>
                </div>

                {/* Tab Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px', color: '#64748b' }}>
                            <div style={{ width: '24px', height: '24px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            Loading...
                        </div>
                    ) : (
                        <>
                            {/* ── PAYMENTS TAB ── */}
                            {activeTab === 'payments' && (
                                <>
                                    {/* Summary row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                        {[
                                            { label: 'Total Deal', value: fmt(dealValue), color: '#6366f1' },
                                            { label: 'Collected', value: fmt(totalPaid), color: '#10b981' },
                                            { label: 'Balance', value: fmt(totalBalance), color: '#ef4444' },
                                        ].map(c => (
                                            <div key={c.label} style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 800, color: c.color, marginTop: '4px' }}>{c.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Payment Schedule List */}
                                    {schedule.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                                            <i className="fas fa-calendar-plus" style={{ fontSize: '2rem', color: '#cbd5e1', marginBottom: '12px', display: 'block' }} />
                                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>No payment schedule yet</div>
                                            <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>Setup a schedule to track installments</div>
                                            <button className="psd-btn psd-btn-primary" onClick={() => { setScheduleRows(defaultSchedule()); setActiveTab('schedule'); }}>
                                                <i className="fas fa-plus" /> Setup Schedule
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                                Payment Installments
                                            </div>
                                            {schedule.map((item, i) => {
                                                let displayStatus = item.status;
                                                let sc = statusConfig[item.status] || statusConfig.Pending;
                                                
                                                if (item.paidAmount > 0 && !item.isReceiptUploaded) {
                                                    displayStatus = 'Awaiting Receipt';
                                                    sc = { bg: '#fffbeb', text: '#d97706', icon: 'fa-file-signature' };
                                                } else if (item.status === 'Paid') {
                                                    displayStatus = 'Completed';
                                                }

                                                const itemPct = item.dueAmount > 0 ? Math.min((item.paidAmount / item.dueAmount) * 100, 100) : 0;
                                                const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'Paid';
                                                return (
                                                    <div key={item._id || i} style={{ background: '#fff', border: `1px solid ${isOverdue ? '#fecaca' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', marginBottom: '10px', transition: 'all 0.2s' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{item.label}</div>
                                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                                    Due: {fmtDate(item.dueDate)}
                                                                    {isOverdue && <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: '6px' }}>OVERDUE</span>}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                                <span style={{ background: sc.bg, color: sc.text, fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '99px' }}>
                                                                    <i className={`fas ${sc.icon}`} style={{ marginRight: '4px' }} />{displayStatus}
                                                                </span>
                                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{fmt(item.dueAmount)}</span>
                                                            </div>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '99px', marginBottom: '10px' }}>
                                                            <div style={{ height: '100%', width: `${itemPct}%`, background: item.status === 'Paid' ? '#10b981' : '#6366f1', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                                Paid: <strong style={{ color: '#10b981' }}>{fmt(item.paidAmount)}</strong>
                                                                {item.paymentMode && <span style={{ marginLeft: '8px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>{item.paymentMode}</span>}
                                                                {item.referenceNo && <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>Ref: {item.referenceNo}</span>}
                                                                
                                                                {/* Receipt Actions if payment has been made */}
                                                                {item.paidAmount > 0 && (
                                                                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                                                                        <button onClick={() => handleGenerateReceipt(item)} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                            <i className="fas fa-file-pdf" style={{ color: '#dc2626' }}></i> Generate Receipt
                                                                        </button>
                                                                        {!item.isReceiptUploaded ? (
                                                                            <label style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                                <i className="fas fa-upload"></i> Upload Signed
                                                                                <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => handleUploadReceipt(item, e)} />
                                                                            </label>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                                <button onClick={() => handleEditPayment(item)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                                    <i className="fas fa-edit"></i> Edit
                                                                                </button>
                                                                                <a href={item.receiptUrl} target="_blank" rel="noreferrer" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                                    <i className="fas fa-eye"></i> View Receipt
                                                                                </a>
                                                                                <button onClick={() => handleDeleteReceipt(item)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                                    <i className="fas fa-trash"></i> Remove
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {item.paidAmount < item.dueAmount && (
                                                                <button onClick={() => handleRecordPayment(item)} className="psd-btn psd-btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                                                                    <i className="fas fa-plus" /> Collect
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            <button onClick={() => handleRecordPayment(null)} className="psd-btn psd-btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
                                                <i className="fas fa-plus-circle" style={{ color: '#6366f1' }} /> Record Ad-hoc Payment
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── COMMISSION TAB ── */}
                            {activeTab === 'commission' && (
                                <div>
                                    {/* Commission Summary */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                        {[
                                            { label: 'Total Commission', value: fmt(commission.total), color: '#6366f1', icon: 'fa-percentage' },
                                            { label: 'Received', value: fmt(commission.received), color: '#10b981', icon: 'fa-check-circle' },
                                            { label: 'Pending', value: fmt(commission.pending), color: '#ef4444', icon: 'fa-hourglass-half' },
                                            { label: 'CP Commission', value: fmt(commission.cpTotal), color: '#f59e0b', icon: 'fa-handshake' },
                                        ].map(c => (
                                            <div key={c.label} style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                    <i className={`fas ${c.icon}`} style={{ color: c.color, fontSize: '0.9rem' }} />
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</span>
                                                </div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: c.color }}>{c.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Brokerage Breakdown */}
                                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                            Brokerage Breakdown
                                        </div>
                                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                {[
                                                    { label: 'Seller Brokerage', pct: b.sellerBrokeragePercent, amt: b.sellerBrokerageAmount },
                                                    { label: 'Buyer Brokerage', pct: b.buyerBrokeragePercent, amt: b.buyerBrokerageAmount },
                                                    { label: 'Executive Incentive', pct: b.executiveIncentivePercent, amt: b.executiveIncentiveAmount },
                                                    { label: 'Channel Partner', pct: b.channelPartnerBrokeragePercent, amt: b.channelPartnerBrokerageAmount },
                                                ].map(row => row.amt > 0 && (
                                                    <tr key={row.label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={{ padding: '8px 4px', color: '#475569' }}>{row.label}</td>
                                                        <td style={{ padding: '8px 4px', color: '#94a3b8', textAlign: 'center' }}>{row.pct}%</td>
                                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{fmt(row.amt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Commission Update Form */}
                                    <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
                                            <i className="fas fa-edit" style={{ marginRight: '8px', color: '#6366f1' }} />Update Commission Received
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Firm Commission Received (₹)</label>
                                                <input type="number" className="psd-input" placeholder="0" value={commissionForm.commissionReceived}
                                                    onChange={e => setCommissionForm(p => ({ ...p, commissionReceived: e.target.value }))} />
                                            </div>
                                            {commission.cpTotal > 0 && (
                                                <div>
                                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Channel Partner Commission Received (₹)</label>
                                                    <input type="number" className="psd-input" placeholder="0" value={commissionForm.channelPartnerCommissionReceived}
                                                        onChange={e => setCommissionForm(p => ({ ...p, channelPartnerCommissionReceived: e.target.value }))} />
                                                </div>
                                            )}
                                            <button className="psd-btn psd-btn-primary" onClick={submitCommission} disabled={saving}>
                                                {saving ? 'Saving...' : <><i className="fas fa-save" /> Update Commission</>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── SCHEDULE SETUP TAB ── */}
                            {activeTab === 'schedule' && (
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '16px', lineHeight: 1.6 }}>
                                        Define the payment milestones for this booking. Each entry will be tracked individually with payment status.
                                    </div>
                                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '4px 16px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 130px 80px', gap: '8px', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                                            {['Milestone', 'Due Date', 'Amount (₹)', ''].map(h => (
                                                <div key={h} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                                            ))}
                                        </div>
                                        {scheduleRows.map((row, i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 130px 80px', gap: '8px', padding: '10px 0', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                                                <input className="psd-input" placeholder="e.g. Token" value={row.label}
                                                    onChange={e => setScheduleRows(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} />
                                                <input type="date" className="psd-input" value={row.dueDate || ''}
                                                    onChange={e => setScheduleRows(prev => prev.map((r, j) => j === i ? { ...r, dueDate: e.target.value } : r))} />
                                                <input type="number" className="psd-input" placeholder="0" value={row.dueAmount || ''}
                                                    onChange={e => setScheduleRows(prev => prev.map((r, j) => j === i ? { ...r, dueAmount: e.target.value } : r))} />
                                                <button onClick={() => setScheduleRows(p => p.filter((_, j) => j !== i))}
                                                    style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                    <i className="fas fa-trash" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total check */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#475569', marginBottom: '16px', padding: '0 4px' }}>
                                        <span>Schedule Total:</span>
                                        <strong style={{ color: scheduleRows.reduce((s, r) => s + (Number(r.dueAmount) || 0), 0) > dealValue ? '#ef4444' : '#10b981' }}>
                                            {fmt(scheduleRows.reduce((s, r) => s + (Number(r.dueAmount) || 0), 0))}
                                            {' '}/ {fmt(dealValue)}
                                        </strong>
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="psd-btn psd-btn-secondary" onClick={() => setScheduleRows(p => [...p, { label: '', dueDate: '', dueAmount: '' }])}>
                                            <i className="fas fa-plus" /> Add Row
                                        </button>
                                        <button className="psd-btn psd-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submitSchedule} disabled={saving}>
                                            {saving ? 'Saving...' : <><i className="fas fa-save" /> Save Schedule</>}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Payment Recording Modal */}
            {showPaymentForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem', marginBottom: '4px' }}>
                            {paymentForm.editingPaymentId ? 'Edit Payment' : 'Record Payment'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '20px' }}>
                            {paymentForm.label ? `For: ${paymentForm.label}` : 'Ad-hoc payment entry'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {(!paymentForm.scheduleItemId && !paymentForm.editingPaymentId) && (
                                    <div>
                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payment Label *</label>
                                        <input className="psd-input" placeholder="e.g. Part Payment 1" value={paymentForm.label}
                                            onChange={e => setPaymentForm(p => ({ ...p, label: e.target.value }))} />
                                    </div>
                                )}
                                <div style={(paymentForm.scheduleItemId || paymentForm.editingPaymentId) ? { gridColumn: '1 / span 2' } : {}}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payment Purpose *</label>
                                    <select className="psd-input" value={paymentForm.paymentPurpose} onChange={e => setPaymentForm(p => ({ ...p, paymentPurpose: e.target.value }))}>
                                        {PAYMENT_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payer Name *</label>
                                    <select className="psd-input" value={paymentForm.payerName} onChange={e => setPaymentForm(p => ({ ...p, payerName: e.target.value }))}>
                                        <option value="">Select Payer</option>
                                        <option value={b?.lead?.fullName || b?.lead?.name || 'Buyer'}>{b?.lead?.fullName || b?.lead?.name || 'Buyer'} (Buyer)</option>
                                        <option value={b?.seller?.fullName || b?.seller?.name || 'Seller'}>{b?.seller?.fullName || b?.seller?.name || 'Seller'} (Seller)</option>
                                        {allUsers.map(u => <option key={u._id} value={u.fullName || u.name}>{u.fullName || u.name} (User)</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payee Name *</label>
                                    <select className="psd-input" value={paymentForm.payeeName} onChange={e => setPaymentForm(p => ({ ...p, payeeName: e.target.value }))}>
                                        <option value="">Select Payee</option>
                                        <option value={b?.seller?.fullName || b?.seller?.name || 'Seller'}>{b?.seller?.fullName || b?.seller?.name || 'Seller'} (Seller)</option>
                                        <option value={b?.lead?.fullName || b?.lead?.name || 'Buyer'}>{b?.lead?.fullName || b?.lead?.name || 'Buyer'} (Buyer)</option>
                                        {allUsers.map(u => <option key={u._id} value={u.fullName || u.name}>{u.fullName || u.name} (User)</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#334155' }}>Payment Methods</div>
                                    <button onClick={() => setPaymentForm(p => ({ ...p, transactions: [...p.transactions, { amount: '', paymentMode: 'Cash', referenceNo: '', bankName: '', payeeAccountDetails: '' }] }))} style={{ background: '#eff6ff', color: '#3b82f6', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className="fas fa-plus"></i> Add Mode
                                    </button>
                                </div>
                                {paymentForm.transactions.map((t, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', marginBottom: '10px', position: 'relative' }}>
                                        {paymentForm.transactions.length > 1 && (
                                            <button onClick={() => setPaymentForm(p => { const arr = [...p.transactions]; arr.splice(idx, 1); return { ...p, transactions: arr }; })} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                                <i className="fas fa-times"></i>
                                            </button>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Amount (₹) *</label>
                                                <input type="number" className="psd-input" placeholder="0" value={t.amount}
                                                    onChange={e => setPaymentForm(p => { const arr = [...p.transactions]; arr[idx].amount = e.target.value; return { ...p, transactions: arr }; })} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Mode *</label>
                                                <select className="psd-input" value={t.paymentMode} onChange={e => setPaymentForm(p => { const arr = [...p.transactions]; arr[idx].paymentMode = e.target.value; return { ...p, transactions: arr }; })}>
                                                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        {t.paymentMode !== 'Cash' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Ref / Cheque No</label>
                                                    <input className="psd-input" placeholder="Ref #" value={t.referenceNo}
                                                        onChange={e => setPaymentForm(p => { const arr = [...p.transactions]; arr[idx].referenceNo = e.target.value; return { ...p, transactions: arr }; })} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Bank Name</label>
                                                    <input className="psd-input" placeholder="e.g. SBI" value={t.bankName}
                                                        onChange={e => setPaymentForm(p => { const arr = [...p.transactions]; arr[idx].bankName = e.target.value; return { ...p, transactions: arr }; })} />
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payee Account Details (If specific)</label>
                                            <input className="psd-input" placeholder="e.g. Account Number or UPI ID" value={t.payeeAccountDetails}
                                                onChange={e => setPaymentForm(p => { const arr = [...p.transactions]; arr[idx].payeeAccountDetails = e.target.value; return { ...p, transactions: arr }; })} />
                                        </div>
                                    </div>
                                ))}
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', textAlign: 'right', marginTop: '10px' }}>
                                    Total Amount: ₹ {paymentForm.transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0).toLocaleString('en-IN')}
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Payment Date</label>
                                <input type="date" className="psd-input" value={paymentForm.paidDate}
                                    onChange={e => setPaymentForm(p => ({ ...p, paidDate: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Remarks</label>
                                <input className="psd-input" placeholder="Optional notes" value={paymentForm.remarks}
                                    onChange={e => setPaymentForm(p => ({ ...p, remarks: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                <button className="psd-btn psd-btn-secondary" onClick={() => setShowPaymentForm(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                                <button className="psd-btn psd-btn-primary" onClick={submitPayment} disabled={saving} style={{ flex: 2, justifyContent: 'center' }}>
                                    {saving ? 'Saving...' : <><i className="fas fa-check" /> {paymentForm.editingPaymentId ? 'Save Changes' : 'Record'} ₹{Number(paymentForm.transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0)).toLocaleString('en-IN')}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
