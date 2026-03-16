import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { renderValue } from '../../utils/renderUtils';

const AccountPage = ({ onNavigate, initialContextId }) => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState(initialContextId || '');

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const response = await api.get('/bookings');
            if (response.data && response.data.success) {
                setBookings(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching accounts:', error);
            toast.error('Failed to load financial records');
        } finally {
            setLoading(false);
        }
    };

    // Calculate aggregated stats from live bookings
    const stats = {
        receivables: bookings.reduce((sum, b) => sum + (b.totalDealAmount || 0), 0),
        received: bookings.reduce((sum, b) => sum + (b.tokenAmount || 0) + (b.partPaymentAmount || 0), 0),
        pending: bookings.reduce((sum, b) => sum + ((b.totalDealAmount || 0) - (b.tokenAmount || 0) - (b.partPaymentAmount || 0)), 0),
        commissions: bookings.reduce((sum, b) => sum + (b.sellerBrokerageAmount || 0) + (b.buyerBrokerageAmount || 0), 0)
    };

    const filteredBookings = bookings.filter(b => {
        const matchesSearch =
            (b.property?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (b.lead?.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (b.lead?.lastName || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (filter === 'All') return true;
        if (filter === 'Receivables') return b.status !== 'Cancelled';
        if (filter === 'Payables') return b.sellerBrokerageAmount > 0;
        return true;
    });

    const renderHeader = () => (
        <div className="page-header" style={{ padding: '20px 2rem', background: '#fff', borderBottom: '1px solid #eef2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="page-title-group" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ background: '#0ea5e9', color: '#fff', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)' }}>
                    <i className="fas fa-file-invoice-dollar"></i>
                </div>
                <div>
                    <span className="working-list-label" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Intelligence</span>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Accounts & Ledgers</h1>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-outline" style={{ borderRadius: '8px', fontWeight: 600 }}>
                    <i className="fas fa-download" style={{ marginRight: '8px' }}></i> Export Tally
                </button>
                <button className="btn-primary" style={{ borderRadius: '8px', fontWeight: 600, background: '#0f172a' }}>
                    <i className="fas fa-plus" style={{ marginRight: '8px' }}></i> New Receipt
                </button>
            </div>
        </div>
    );

    const renderStats = () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', padding: '24px 2rem' }}>
            {[
                { label: 'Total Receivables', value: `₹${(stats.receivables / 10000000).toFixed(2)} Cr`, icon: 'fa-hand-holding-usd', color: '#3b82f6', trend: '+12%' },
                { label: 'Collections Done', value: `₹${(stats.received / 10000000).toFixed(2)} Cr`, icon: 'fa-check-circle', color: '#10b981', trend: '+8.4%' },
                { label: 'Pending Dues', value: `₹${(stats.pending / 10000000).toFixed(2)} Cr`, icon: 'fa-clock', color: '#f59e0b', trend: '-2.1%' },
                { label: 'Agency Commission', value: `₹${(stats.commissions / 100000).toFixed(2)} L`, icon: 'fa-percentage', color: '#8b5cf6', trend: '+15%' }
            ].map((s, i) => (
                <div key={i} className="stat-card" style={{ background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ background: `${s.color}10`, color: s.color, width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className={`fas ${s.icon}`}></i>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.trend.startsWith('+') ? '#10b981' : '#ef4444' }}>{s.trend}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>{s.value}</div>
                </div>
            ))}
        </div>
    );

    return (
        <section className="view-section active" style={{ background: '#f8fafc', minHeight: '100vh' }}>
            {renderHeader()}
            {renderStats()}

            <div style={{ padding: '0 2rem 24px' }}>
                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #eef2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['All', 'Receivables', 'Payables'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setFilter(t)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid',
                                        borderColor: filter === t ? '#0ea5e9' : '#e2e8f0',
                                        background: filter === t ? '#f0f9ff' : 'transparent',
                                        color: filter === t ? '#0ea5e9' : '#64748b',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        <div className="search-box" style={{ width: '300px' }}>
                            <i className="fas fa-search"></i>
                            <input
                                type="text"
                                placeholder="Search by Project or Client..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Project & Unit</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Client Name</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Deal Value</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Received</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Balance</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Status</th>
                                <th style={{ padding: '15px 20px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        <div style={{ width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid #0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }}></div>
                                        Fetching financial records...
                                    </td>
                                </tr>
                            ) : filteredBookings.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No financial records found.</td>
                                </tr>
                            ) : filteredBookings.map((item, i) => {
                                const received = (item.tokenAmount || 0) + (item.partPaymentAmount || 0);
                                const balance = (item.totalDealAmount || 0) - received;
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '15px 20px' }}>
                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.property?.name || 'N/A'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Unit: {item.property?.unitNumber || 'N/A'}</div>
                                        </td>
                                        <td style={{ padding: '15px 20px' }}>
                                            <div style={{ fontWeight: 600, color: '#334155' }}>{(item.lead?.firstName || 'N/A')} {(item.lead?.lastName || '')}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.lead?.mobile || 'N/A'}</div>
                                        </td>
                                        <td style={{ padding: '15px 20px', fontWeight: 700, color: '#0f172a' }}>₹{(item.totalDealAmount || 0).toLocaleString()}</td>
                                        <td style={{ padding: '15px 20px', fontWeight: 700, color: '#10b981' }}>₹{received.toLocaleString()}</td>
                                        <td style={{ padding: '15px 20px', fontWeight: 700, color: '#ef4444' }}>₹{balance.toLocaleString()}</td>
                                        <td style={{ padding: '15px 20px' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                textTransform: 'uppercase',
                                                background: item.status === 'Registry' ? '#dcfce7' : item.status === 'Booked' ? '#dbeafe' : '#fef3c7',
                                                color: item.status === 'Registry' ? '#166534' : item.status === 'Booked' ? '#1e40af' : '#92400e'
                                            }}>
                                                {renderValue(item.status)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '15px 20px' }}>
                                            <button
                                                onClick={() => onNavigate('booking', item._id)}
                                                className="btn-icon"
                                                title="View Ledger"
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .search-box { position: relative; }
                .search-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
                .search-box input { width: 100%; padding: 8px 12px 8px 35px; border: 1px solid #e2e8f0; borderRadius: 8px; fontSize: 0.85rem; outline: none; transition: border 0.2s; }
                .search-box input:focus { border-color: #0ea5e9; }
                .btn-icon { background: #f8fafc; border: 1px solid #e2e8f0; width: 32px; height: 32px; borderRadius: 8px; color: #64748b; cursor: pointer; transition: all 0.2s; }
                .btn-icon:hover { background: #0ea5e9; color: #fff; border-color: #0ea5e9; }
            `}</style>
        </section>
    );
};

export default AccountPage;
