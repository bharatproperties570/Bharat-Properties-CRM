import React, { useState } from 'react';

const GoalCard = ({ title, description, icon, onDisable, onPeriodChange, resolutionPeriod, currentPeriod, users, onUserGoalChange, goalSuffix = '' }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const teamTotal = users.reduce((acc, u) => acc + (parseFloat(u.goal) || 0), 0);

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
                    <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>Changing the resolution period will affect the current period as well as future ones.</div>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                        <i className="fas fa-flag"></i> Set Goals for
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <button style={{ padding: '6px 10px', background: '#f8fafc', border: 'none', borderRight: '1px solid #e2e8f0' }}><i className="fas fa-chevron-left"></i></button>
                            <div style={{ padding: '6px 20px', background: '#fff', minWidth: '140px', textAlign: 'center' }}>{currentPeriod}</div>
                            <button style={{ padding: '6px 10px', background: '#f8fafc', border: 'none', borderLeft: '1px solid #e2e8f0' }}><i className="fas fa-chevron-right"></i></button>
                        </div>
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
                            <input type="checkbox" checked={true} readOnly style={{ width: '16px', height: '16px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
                                <div style={{ width: '110px', position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.9rem' }}>{goalSuffix}</span>
                                    <input
                                        type="text"
                                        value={user.goal}
                                        onChange={(e) => onUserGoalChange(user.id, e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px 8px 24px', border: '1px solid #e2e8f0', borderRadius: '4px', textAlign: 'left', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{user.name}</span>
                            </div>
                        </div>
                    ))}

                    <div style={{ marginTop: '12px', paddingLeft: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
                            <div style={{ width: '110px', textAlign: 'center', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                {goalSuffix} {teamTotal}
                            </div>
                            <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 800 }}>Team Total</span>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '24px', fontSize: '0.8rem', color: '#94a3b8' }}>Changes are automatically saved.</div>
            </div>

            <div style={{ textAlign: 'right', marginTop: '-20px' }}>
                <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Go to Goal Report</span>
            </div>
        </div>
    );
};

const ResolutionPeriodModal = ({ isOpen, onClose, onSelect }) => {
    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', width: '450px', borderRadius: '12px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>How long do you want each period for this goal to be?</h3>
                <div style={{ border: '1px solid #fee2e2', background: '#fef2f2', padding: '12px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                    <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', marginTop: '4px' }}></i>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c', lineHeight: '1.5', fontWeight: 600 }}>
                        Choose carefully! The Resolution Period is set once for the entire goal. If you choose to change this period later, all goal data will be reset.
                    </p>
                </div>

                <div style={{ marginBottom: '32px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '8px' }}>Select a Resolution Period</label>
                    <select style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem' }}>
                        <option>Weekly</option>
                        <option selected>Monthly</option>
                        <option>Quarterly</option>
                        <option>Yearly</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-primary" onClick={() => onSelect('Monthly')} style={{ padding: '10px 24px', fontSize: '0.9rem', fontWeight: 700 }}>Next</button>
                    <button className="btn-outline" onClick={onClose} style={{ padding: '10px 24px', border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 700 }}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

const SalesGoalsSettings = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [salesUsers, setSalesUsers] = useState([
        { id: 1, name: 'Ramesh', goal: '129' },
        { id: 2, name: 'Real Deal', goal: '5398' },
        { id: 3, name: 'Suraj', goal: '879' }
    ]);
    const [wonDealsUsers, setWonDealsUsers] = useState([
        { id: 1, name: 'Ramesh', goal: '1' },
        { id: 2, name: 'Real Deal', goal: '0' },
        { id: 3, name: 'Suraj', goal: '0' }
    ]);
    const [siteVisitsUsers, setSiteVisitsUsers] = useState([
        { id: 1, name: 'Ramesh', goal: '1' },
        { id: 2, name: 'Real Deal', goal: '0' },
        { id: 3, name: 'Suraj', goal: '0' }
    ]);

    const handleGoalChange = (setter, users) => (id, value) => {
        setter(users.map(u => u.id === id ? { ...u, goal: value } : u));
    };

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '40px', overflowY: 'auto' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '32px' }}>Goals</h1>

            <GoalCard
                title="Sales Revenue"
                description="Set goals for the value of won deals for your team."
                icon="fas fa-dollar-sign"
                resolutionPeriod="Monthly"
                currentPeriod="January 2024"
                users={salesUsers}
                onUserGoalChange={handleGoalChange(setSalesUsers, salesUsers)}
                onDisable={() => { }}
                onPeriodChange={() => setIsModalOpen(true)}
                goalSuffix="$"
            />

            <GoalCard
                title="Won Deals"
                description="Set goals for the amount of won deals for your team"
                icon="fas fa-trophy"
                resolutionPeriod="Monthly"
                currentPeriod="February 2024"
                users={wonDealsUsers}
                onUserGoalChange={handleGoalChange(setWonDealsUsers, wonDealsUsers)}
                onDisable={() => { }}
                onPeriodChange={() => setIsModalOpen(true)}
            />

            <GoalCard
                title="Site Visits"
                description="Set goals for the number of Site Visits for your team"
                icon="fas fa-map-marked-alt"
                resolutionPeriod="Monthly"
                currentPeriod="February 2024"
                users={siteVisitsUsers}
                onUserGoalChange={handleGoalChange(setSiteVisitsUsers, siteVisitsUsers)}
                onDisable={() => { }}
                onPeriodChange={() => setIsModalOpen(true)}
            />

            <ResolutionPeriodModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelect={(p) => { setIsModalOpen(false); }}
            />
        </div>
    );
};

export default SalesGoalsSettings;
