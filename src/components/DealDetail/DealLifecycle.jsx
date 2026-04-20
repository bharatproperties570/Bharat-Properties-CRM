import SingleDealLifecycle from '../../components/SingleDealLifecycle';
import { getStageProbability } from '../../utils/stageEngine';

const DealLifecycle = ({ deal, activities, currentStage, stageStyle, stageInfo, onStageChange }) => {
    return (
        <div className="no-scrollbar" style={{
            width: '100%',
            padding: '0.75rem 2rem 0.25rem 2rem',
            borderBottom: '1px solid #e2e8f0',
            background: '#fff',
            zIndex: 40
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-route" style={{ color: '#4f46e5' }}></i> Deal Stage Pipeline
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                        CURRENT STATUS: <span style={{ color: '#4f46e5', fontWeight: 900 }}>{String(deal.stage || 'Open').toUpperCase()}</span>
                    </span>
                    {/* Stage Badge with probability */}
                    <span style={{
                        backgroundColor: stageStyle.bg, color: stageStyle.text,
                        padding: '4px 10px', borderRadius: '6px',
                        fontSize: '0.65rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', gap: '6px',
                        textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid ${stageStyle.dot}33`
                    }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: stageStyle.dot }}></span>
                        {currentStage}
                        <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>
                            {getStageProbability(stageInfo?.label || currentStage)}% win
                        </span>
                    </span>
                </div>
            </div>
            <SingleDealLifecycle
                deal={deal}
                activities={activities}
                onStageChange={onStageChange}
            />
        </div>
    );
};

export default DealLifecycle;
