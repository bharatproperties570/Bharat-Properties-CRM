import { memo } from 'react';

const TeamLeaderboardWidget = ({ users, metrics }) => {
    // Generate mock performance data for the leaderboard using the available users
    // In a real backend, this would come from an aggregation query
    
    // Create random but stable scores based on user IDs
    const getScore = (id, salt) => {
        let hash = 0;
        const str = (id || '') + salt;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash % 100);
    };

    const leaderboard = users.slice(0, 5).map(u => ({
        id: u._id,
        name: u.fullName,
        dealsClosed: getScore(u._id, 'deals') % 5,
        siteVisits: getScore(u._id, 'visits') % 20,
        score: getScore(u._id, 'score') + 50
    })).sort((a, b) => b.score - a.score);

    // if (leaderboard.length === 0) return null; // Removing this to show an empty state instead

    return (
        <div className="glass-card" style={{ padding: '24px', background: 'var(--panel-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', margin: 0, letterSpacing: '0.05em' }}>TEAM LEADERBOARD</h3>
                    <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, margin: '2px 0 0 0' }}>TOP PERFORMERS (THIS WEEK)</p>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', cursor: 'pointer' }}>VIEW ALL</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leaderboard.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                        <i className="fas fa-users-slash" style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block', opacity: 0.5 }}></i>
                        NO TEAM DATA AVAILABLE
                    </div>
                ) : (
                    leaderboard.map((user, idx) => (
                        <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.8rem', flexShrink: 0 }}>
                                {idx + 1}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>
                                    {user.dealsClosed} DEALS • {user.siteVisits} VISITS
                                </div>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#10b981' }}>
                                {user.score}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default memo(TeamLeaderboardWidget);
