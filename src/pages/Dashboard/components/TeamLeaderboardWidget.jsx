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

    if (leaderboard.length === 0) return null;

    return (
        <div className="glass-card" style={{ padding: '24px', background: 'rgba(30, 41, 59, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '0.05em' }}>TEAM LEADERBOARD</h3>
                    <p style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, margin: '2px 0 0 0' }}>TOP PERFORMERS (THIS WEEK)</p>
                </div>
                <i className="fas fa-trophy" style={{ color: '#f59e0b', fontSize: '1.2rem' }}></i>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leaderboard.map((user, idx) => (
                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ 
                            width: '28px', height: '28px', borderRadius: '50%', 
                            background: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : '#334155',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 900, flexShrink: 0
                        }}>
                            {idx + 1}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{user.siteVisits} Visits • {user.dealsClosed} Deals</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>{user.score}</div>
                            <div style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 800 }}>PTS</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default memo(TeamLeaderboardWidget);
