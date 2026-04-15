import { TableContainer } from './DealCommon';
import { formatIndianCurrency } from '../../utils/numberToWords';

export const NegotiationTracker = ({ rounds = [] }) => {
    const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

    return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {rounds.length > 0 ? (
                <TableContainer>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={thStyle}>Date</th>
                                <th style={thStyle}>Offer By</th>
                                <th style={thStyle}>Amount</th>
                                <th style={thStyle}>Counter</th>
                                <th style={thStyle}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rounds.map((round, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={tdStyle}>{new Date(round.date || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td style={tdStyle}>
                                        <span style={{ fontWeight: 600, color: '#475569' }}>{round.offerBy || 'Buyer'}</span>
                                        {round.notes && <div style={{ fontSize: '0.65rem', color: '#94a3b8', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round.notes}</div>}
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatIndianCurrency(round.buyerOffer)}</span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ fontWeight: 800, color: '#64748b' }}>{formatIndianCurrency(round.ownerCounter)}</span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px',
                                            background: '#f0fdf4', color: '#166534', border: '1px solid #dcfce7', textTransform: 'uppercase'
                                        }} title={round.notes}>
                                            {round.status || 'Active'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TableContainer>
            ) : (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <i className="fas fa-inbox text-slate-400" style={{ fontSize: '1.2rem' }}></i>
                    </div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>No Offer History</p>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>All negotiation rounds will be tracked here.</p>
                </div>
            )}
        </div>
    );
};

export const FinancialBreakdown = ({ details = [] }) => {
    const data = Array.isArray(details) ? details : [];
    const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

    return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <TableContainer>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={thStyle}>Component</th>
                            <th style={thStyle}>Value</th>
                            <th style={thStyle}>Tax/GST</th>
                            <th style={thStyle}>Net Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={tdStyle}>
                                    <span style={{ fontWeight: 700, color: '#475569' }}>{item.component}</span>
                                </td>
                                <td style={tdStyle}>{formatIndianCurrency(item.value)}</td>
                                <td style={tdStyle}>{formatIndianCurrency(item.tax)} ({item.gstPercent}%)</td>
                                <td style={tdStyle}>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatIndianCurrency(item.total)}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableContainer>
        </div>
    );
};

export const CommissionDetails = ({ commission = {} }) => {
    const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

    return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Expected Commission</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981' }}>{formatIndianCurrency(commission.expectedAmount || 0)}</span>
                </div>
                <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Status</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>{commission.status || 'Pending'}</span>
                </div>
                <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Split</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{commission.splitType || 'Full'}</span>
                </div>
            </div>
            
            <TableContainer>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                            <th style={thStyle}>Entity</th>
                            <th style={thStyle}>Percentage</th>
                            <th style={thStyle}>Amount</th>
                            <th style={thStyle}>Share Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(commission.splits || []).map((split, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '32px', height: '32px', background: '#e0e7ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-user-tie text-indigo-600" style={{ fontSize: '0.8rem' }}></i>
                                        </div>
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#1e293b', display: 'block' }}>{split.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{typeof split.role === 'object' ? split.role?.name : split.role}</span>
                                        </div>
                                    </div>
                                </td>
                                <td style={tdStyle}>{split.percent}%</td>
                                <td style={tdStyle}>
                                    <span style={{ fontWeight: 800, color: '#1e293b' }}>{formatIndianCurrency(split.amount)}</span>
                                </td>
                                <td style={tdStyle}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>{split.status || 'Verified'}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TableContainer>
        </div>
    );
};

export const CostSheet = ({ financials, deal }) => (
    <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ background: '#1e293b', color: '#fff', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Cost Sheet</h2>
                <p style={{ opacity: 0.8, fontSize: '0.85rem', marginTop: '4px' }}>Property Purchase Breakdown</p>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{deal.unitNo}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{deal.projectName}</div>
            </div>
        </div>

        <div style={{ padding: '32px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '12px 0', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Description</th>
                        <th style={{ textAlign: 'right', padding: '12px 0', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colSpan="2" style={{ padding: '8px 0' }}></td></tr>
                    <CostRow label="A. Basic Sale Consideration" value={financials.dealValue} bold />
                    <tr><td colSpan="2" style={{ borderBottom: '1px dashed #e2e8f0', padding: '8px 0' }}></td></tr>

                    <CostRow label="B. Government Charges" value={financials.totalGovtCharges} bold />
                    <CostRow label="- Stamp Duty" value={financials.stampDutyAmount} indent />
                    <CostRow label="- Registration Fees" value={financials.registrationAmount} indent />
                    <CostRow label="- Legal & Documentation" value={financials.totalGovtCharges - financials.stampDutyAmount - financials.registrationAmount} indent />
                    <tr><td colSpan="2" style={{ borderBottom: '1px dashed #e2e8f0', padding: '8px 0' }}></td></tr>

                    <CostRow label="C. Brokerage / Service Fee" value={financials.brokerageAmount} bold />
                    <tr><td colSpan="2" style={{ borderBottom: '2px solid #e2e8f0', padding: '16px 0' }}></td></tr>

                    <tr style={{ fontSize: '1.25rem' }}>
                        <td style={{ padding: '16px 0', fontWeight: 800, color: '#0f172a' }}>Total Landed Cost (A+B+C)</td>
                        <td style={{ padding: '16px 0', fontWeight: 900, color: '#2563eb', textAlign: 'right' }}>{formatIndianCurrency(financials.grandTotal)}</td>
                    </tr>
                </tbody>
            </table>

            <div style={{ marginTop: '40px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#334155', marginBottom: '12px' }}>Payment Schedule</h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>As per agreed payment plan.</p>
            </div>
        </div>

        <div style={{ background: '#f1f5f9', padding: '16px 32px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
            Generated by Bharat Properties CRM on {new Date().toLocaleDateString()}
        </div>
    </div>
);

const CostRow = ({ label, value, bold, indent }) => (
    <tr>
        <td style={{
            padding: '8px 0',
            paddingLeft: indent ? '24px' : '0',
            fontWeight: bold ? 700 : 500,
            color: bold ? '#334155' : '#64748b',
            fontSize: indent ? '0.85rem' : '0.9rem'
        }}>
            {label}
        </td>
        <td style={{
            textAlign: 'right', padding: '8px 0',
            fontWeight: bold ? 800 : 600,
            color: bold ? '#1e293b' : '#64748b'
        }}>
            {formatIndianCurrency(value)}
        </td>
    </tr>
);
