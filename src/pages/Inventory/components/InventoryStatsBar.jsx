import React from 'react';
import { renderValue } from '../../../utils/renderUtils';

const InventoryStatsBar = ({ statusFilter, setStatusFilter, activeCount, inactiveCount, setCurrentPage, onNavigate }) => {
    return (
        <div className="inventory-stats-row" style={{ padding: '8px 25px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                {/* INACTIVE TAB */}
                <div
                    onClick={() => {
                        setStatusFilter(prev => prev === 'InActive' ? '' : 'InActive');
                        setCurrentPage(1);
                    }}
                    style={{
                        padding: '10px 25px 10px 20px',
                        cursor: 'pointer',
                        backgroundColor: statusFilter === 'InActive' ? '#f1f5f9' : '#fff',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        borderRight: 'none',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        position: 'relative',
                        zIndex: statusFilter === 'InActive' ? 2 : 1,
                        clipPath: 'polygon(0% 0%, 95% 0%, 100% 50%, 95% 100%, 0% 100%)',
                        transition: 'all 0.2s'
                    }}
                >
                    <i className="fas fa-ban" style={{ fontSize: '0.75rem' }}></i>
                    <span>Inactive ({renderValue(inactiveCount)})</span>
                </div>

                {/* ACTIVE TAB */}
                <div
                    onClick={() => {
                        setStatusFilter(prev => prev === 'Active' ? '' : 'Active');
                        setCurrentPage(1);
                    }}
                    style={{
                        padding: '10px 25px 10px 30px',
                        cursor: 'pointer',
                        backgroundColor: statusFilter === 'Active' ? '#f1f5f9' : '#fff',
                        color: statusFilter === 'Active' ? '#10b981' : '#64748b',
                        border: '1px solid #e2e8f0',
                        marginLeft: '-10px',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        clipPath: 'polygon(0% 0%, 95% 0%, 100% 50%, 95% 100%, 0% 100%, 5% 50%)',
                        transition: 'all 0.2s'
                    }}
                >
                    <i className="fas fa-check-circle" style={{ fontSize: '0.75rem' }}></i>
                    <span>Active ({renderValue(activeCount)})</span>
                </div>
            </div>

            {/* DEAL INTAKE ENGINE ICON */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                <button
                    onClick={() => onNavigate('deal-intake')}
                    title="Deal Intake Engine"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '34px',
                        height: '34px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        color: '#fff',
                        border: '1.5px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 3px 10px rgba(79, 70, 229, 0.3)',
                        zIndex: 10
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 5px 12px rgba(99, 102, 241, 0.3)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = '0 3px 10px rgba(99, 102, 241, 0.2)';
                    }}
                >
                    <i className="fas fa-magic" style={{ fontSize: '1rem' }}></i>
                </button>
            </div>
        </div>
    );
};

export default React.memo(InventoryStatsBar);
