import { PriceCard, TableContainer } from './DealCommon';
import { formatIndianCurrency, numberToIndianWords } from '../../utils/numberToWords';

const DealFinancialSection = ({ deal, setIsOfferModalOpen }) => {
    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #fff, #f8fafc)'
    };

    const sectionTitleStyle = {
        fontSize: '0.95rem',
        fontWeight: 900,
        color: '#0f172a',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    };

    const thStyle = { padding: '14px 20px', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const tdStyle = { padding: '16px 20px', fontSize: '0.85rem', color: '#1e293b' };

    return (
        <div style={cardStyle}>
            <div style={{ ...sectionHeaderStyle, background: 'linear-gradient(135deg, #1e1b4b, #312e81)', borderBottom: 'none' }}>
                <h3 style={{ ...sectionTitleStyle, color: '#fff' }}>
                    <div style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
                        <i className="fas fa-vault text-amber-400" style={{ fontSize: '1rem' }}></i>
                    </div>
                    Pricing & Negotiation Strategy
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        VALUATION: {deal.pricingMode?.toUpperCase() || 'MARKET'}
                    </span>
                </div>
            </div>
            <div style={{ padding: '28px', background: '#fff' }}>
                {/* High Level Price Matrix */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                    <PriceCard label="Target Price" value={deal.price} subValue={numberToIndianWords(deal.price)} theme="indigo" />
                    <PriceCard label="Current Quote" value={deal.quotePrice || 0} subValue={numberToIndianWords(deal.quotePrice || 0)} theme="blue" />
                    <PriceCard
                        label="Deal Spread"
                        value={(deal.quotePrice || 0) - (deal.price || 0)}
                        theme={(deal.quotePrice || 0) >= (deal.price || 0) ? 'green' : 'red'}
                        isDiff
                    />
                    <PriceCard label="Negotiability" value={deal.pricingNature?.negotiable ? 'FLEXIBLE' : 'FIXED'} theme="orange" isStatus />
                </div>

                {/* Offer History */}
                <div style={{ ...cardStyle, boxShadow: 'none', border: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ ...sectionHeaderStyle, background: 'transparent', padding: '16px 20px' }}>
                        <h3 style={{ ...sectionTitleStyle, fontSize: '0.85rem' }}>
                            <i className="fas fa-comments-dollar text-indigo-600 mr-2"></i> Transaction History
                        </h3>
                        <button
                            onClick={() => setIsOfferModalOpen(true)}
                            style={{
                                background: '#4f46e5', color: '#fff', border: 'none',
                                padding: '8px 18px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)'
                            }} className="hover:bg-indigo-700 transition-all">
                            <i className="fas fa-plus"></i> NEW OFFER
                        </button>
                    </div>
                    <div style={{ padding: '0' }}>
                        {(deal.negotiationRounds || []).length > 0 ? (
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
                                        {deal.negotiationRounds.map((round, idx) => (
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
                                                    }}>
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
                                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>No Offers Yet</p>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Start the negotiation by adding the first offer.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DealFinancialSection;
