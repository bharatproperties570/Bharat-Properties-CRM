import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const GoalCard = ({ title, description, icon, onDisable, onPeriodChange, resolutionPeriod, currentPeriod, users, onUserGoalChange, goalSuffix = '' }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = Array.isArray(users) ? users.filter(u => u.name?.toLowerCase().includes(searchTerm.toLowerCase())) : [];
    const teamTotal = filteredUsers.reduce((acc, u) => acc + (parseFloat(u.goal) || 0), 0);

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '32px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '1.5rem' }}>
                        <i className={icon}></i>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>{title}</h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0, maxWidth: '400px', lineHeight: '1.5' }}>{description}</p>
                        <button
                            onClick={onDisable}
                            style={{ marginTop: '16px', border: '1px solid #e2e8f0', background: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="fas fa-times"></i> Disable Goal
                        </button>
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
                        Enabled
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 600, marginBottom: '4px' }}>Resolution Period: {resolutionPeriod}</div>
                    <div onClick={onPeriodChange} style={{ fontSize: '0.85rem', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Change Period <i className="fas fa-exclamation-triangle" style={{ fontSize: '0.75rem' }}></i>
                    </div>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                        <i className="fas fa-flag"></i> Current Period: {currentPeriod}
                    </div>
                </div>

                <div style={{ position: 'relative', marginBottom: '24px', maxWidth: '300px' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: '0.85rem' }}></i>
                    <input
                        type="text"
                        placeholder="Filter users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredUsers.map(user => (
                        <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {user.avatar ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%' }} /> : <i className="fas fa-user" style={{ fontSize: '0.8rem', color: '#94a3b8' }}></i>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '300px' }}>
                                <div style={{ minWidth: '100px', fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{goalSuffix}{user.goal}</div>
                                <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{user.name}</span>
                            </div>
                        </div>
                    ))}

                    <div style={{ marginTop: '12px', paddingLeft: '48px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
                            <div style={{ width: '110px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                {goalSuffix} {teamTotal}
                            </div>
                            <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 800 }}>Team Total</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UnifiedGoalModal = ({ isOpen, onClose, users, onSave, loading }) => {
    const [selectedUser, setSelectedUser] = useState('');
    const [goals, setGoals] = useState({
        revenue: '0',
        deals: '0',
        siteVisits: '0',
        period: 'monthly'
    });

    if (!isOpen) return null;

    const handleSave = () => {
        if (!selectedUser) return toast.error('Please select a user');
        onSave({ 
            userId: selectedUser, 
            ...goals,
            month: new Date().getMonth(), 
            year: new Date().getFullYear() 
        });
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '500px', borderRadius: '12px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Set Goals for User</h3>
                    <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={onClose}></i>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Select User</label>
                    <select 
                        value={selectedUser} 
                        onChange={(e) => setSelectedUser(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem' }}
                    >
                        <option value="">Choose a user...</option>
                        {users.map(u => (
                            <option key={u._id} value={u._id}>{u.fullName}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Revenue Goal ($)</label>
                        <input 
                            type="number" 
                            value={goals.revenue} 
                            onChange={(e) => setGoals({ ...goals, revenue: e.target.value })}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Deals Goal (Count)</label>
                        <input 
                            type="number" 
                            value={goals.deals} 
                            onChange={(e) => setGoals({ ...goals, deals: e.target.value })}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Site Visits Goal (Count)</label>
                        <input 
                            type="number" 
                            value={goals.siteVisits} 
                            onChange={(e) => setGoals({ ...goals, siteVisits: e.target.value })}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Resolution Period</label>
                        <select 
                            value={goals.period} 
                            onChange={(e) => setGoals({ ...goals, period: e.target.value })}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem' }}
                        >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 24px', borderRadius: '6px', fontWeight: 600 }}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '10px 24px', borderRadius: '6px', fontWeight: 600 }}>
                        {loading ? 'Saving...' : 'Save Goals'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SalesGoalsSettings = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [goals, setGoals] = useState([]);
    
    // Period helper
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    const periodStr = `${currentMonth} ${currentYear}`;

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [usersRes, goalsRes] = await Promise.all([
                api.get('/sales-goals/users'),
                api.get('/sales-goals')
            ]);
            
            if (usersRes.data.success) setUsers(usersRes.data.data);
            if (goalsRes.data.success) setGoals(goalsRes.data.data);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            toast.error('Failed to load goal data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const handleSaveUnifiedGoal = async (data) => {
        try {
            setLoading(true);
            const res = await api.post('/sales-goals', {
                userId: data.userId,
                month: data.month,
                year: data.year,
                revenueGoal: parseFloat(data.revenue),
                dealsGoal: parseInt(data.deals),
                siteVisitsGoal: parseInt(data.siteVisits),
                period: data.period
            });

            if (res.data.success) {
                toast.success('Goals updated successfully');
                setIsModalOpen(false);
                fetchInitialData();
            }
        } catch (error) {
            toast.error('Failed to save goals');
        } finally {
            setLoading(false);
        }
    };

    // Format data for GoalCards
    const revenueUsers = goals.map(g => ({ id: g._id, name: g.user?.fullName, goal: g.revenueGoal, avatar: g.user?.avatar }));
    const dealUsers = goals.map(g => ({ id: g._id, name: g.user?.fullName, goal: g.dealsGoal, avatar: g.user?.avatar }));
    const visitUsers = goals.map(g => ({ id: g._id, name: g.user?.fullName, goal: g.siteVisitsGoal, avatar: g.user?.avatar }));

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '40px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Goals Management</h1>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="btn-primary" 
                    style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <i className="fas fa-plus"></i> Set User Goals
                </button>
            </div>

            {loading && goals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '100px', color: '#64748b' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                    <p>Loading goals...</p>
                </div>
            ) : (
                <>
                    <GoalCard
                        title="Sales Revenue"
                        description="Set goals for the value of won deals for your team."
                        icon="fas fa-dollar-sign"
                        resolutionPeriod="Monthly"
                        currentPeriod={periodStr}
                        users={revenueUsers}
                        onUserGoalChange={() => {}}
                        onDisable={() => { }}
                        onPeriodChange={() => setIsModalOpen(true)}
                        goalSuffix="$"
                    />

                    <GoalCard
                        title="Won Deals"
                        description="Set goals for the amount of won deals for your team"
                        icon="fas fa-trophy"
                        resolutionPeriod="Monthly"
                        currentPeriod={periodStr}
                        users={dealUsers}
                        onUserGoalChange={() => {}}
                        onDisable={() => { }}
                        onPeriodChange={() => setIsModalOpen(true)}
                    />

                    <GoalCard
                        title="Site Visits"
                        description="Set goals for the number of Site Visits for your team"
                        icon="fas fa-map-marked-alt"
                        resolutionPeriod="Monthly"
                        currentPeriod={periodStr}
                        users={visitUsers}
                        onUserGoalChange={() => {}}
                        onDisable={() => { }}
                        onPeriodChange={() => setIsModalOpen(true)}
                    />
                </>
            )}

            <UnifiedGoalModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                users={users}
                onSave={handleSaveUnifiedGoal}
                loading={loading}
            />
        </div>
    );
};

export default SalesGoalsSettings;
