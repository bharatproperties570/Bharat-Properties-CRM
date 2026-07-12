--- Chunk 0.0 ---
    const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
    const [editingStageCell, setEditingStageCell] = useState(null);
    const [analyticsData, setAnalyticsData] = useState({ leads: [], deals: [], loading: true });
    const [densityEntityType, setDensityEntityType] = useState('leads');
    const [densityTimeframe, setDensityTimeframe] = useState('30');
    
    // Stability Lock Form State
    const [localStabilityConfig, setLocalStabilityConfig] = useState({});
    useEffect(() => {
        if (stabilityLockConfig && Object.keys(stabilityLockConfig).length > 0) {
            setLocalStabilityConfig(stabilityLockConfig);
        }
    }, [stabilityLockConfig]);

    const handleSaveStabilityConfig = () => {
        setStabilityLockConfig(localStabilityConfig);
        showToast('Stability Lock Rules saved successfully to database!', 'success');
    };

--- Chunk 0.1 ---
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-lock" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Stability Rules per Stage
                            </span>
                            <button 
                                onClick={handleSaveStabilityConfig}
                                style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(99,102,241,0.2)' }}
                            >
                                <i className="fas fa-save" /> Save Rules
                            </button>
                        </div>

                        {/* Header Row */}

--- Chunk 0.2 ---
                        {STAGE_PIPELINE.filter(s => !['New', 'Closed', 'Closed Lost', 'Stalled'].includes(s.label)).map((stage, idx, arr) => {
                            const lock = localStabilityConfig[stage.label] || { minActivities: 0, minDays: 0, label: '' };
                            return (
                                <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr', padding: '16px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                                    {/* Stage */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color }} />
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>{stage.label}</span>
                                    </div>
                                    {/* Min Activities */}
                                    <div>
                                        <input 
                                            type="number" 
                                            value={lock.minActivities} 
                                            onChange={e => setLocalStabilityConfig({ ...localStabilityConfig, [stage.label]: { ...lock, minActivities: Number(e.target.value) } })}
                                            style={{ width: '80px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }} 
                                        />
                                    </div>
                                    {/* Min Days */}
                                    <div>
                                        <input 
                                            type="number" 
                                            value={lock.minDays} 
                                            onChange={e => setLocalStabilityConfig({ ...localStabilityConfig, [stage.label]: { ...lock, minDays: Number(e.target.value) } })}
                                            style={{ width: '80px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }} 
                                        />
                                    </div>
                                    {/* Label */}
                                    <div>
                                        <input 
                                            type="text" 
                                            value={lock.label} 
                                            placeholder="Lock reason..."
                                            onChange={e => setLocalStabilityConfig({ ...localStabilityConfig, [stage.label]: { ...lock, label: e.target.value } })}
                                            style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', color: '#6b7280' }} 
                                        />
                                    </div>
                                </div>
                            );
                        })}

--- Chunk 1.0 ---
import React, { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { ChevronRight, Filter, Download, Plus, LayoutDashboard, Settings, MoreVertical, LayoutTemplate, Shield, Clock, TrendingUp, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
import { api, API_BASE_URL, stageEngineAPI } from '../../../utils/api';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';
import { stageTransitionRulesAPI } from '../../../utils/api';
import Toast from '../../../components/Toast';

--- Chunk 1.1 ---
    const [analyticsData, setAnalyticsData] = useState({ leads: [], deals: [], loading: true });
    const [densityEntityType, setDensityEntityType] = useState('leads');
    const [densityTimeframe, setDensityTimeframe] = useState('30');
    
    // Observability State (Engine Status)
    const [engineHealth, setEngineHealth] = useState(null);
    const [failedTransitions, setFailedTransitions] = useState([]);
    const [observabilityLoading, setObservabilityLoading] = useState(false);

--- Chunk 1.2 ---
    useEffect(() => {
        if (activeTab === 'density' || activeTab === 'forecast') {
            fetchStageAnalytics();
        }
    }, [activeTab, fetchStageAnalytics]);

    const fetchObservabilityData = async () => {
        setObservabilityLoading(true);
        try {
            const healthRes = await stageEngineAPI.getHealth();
            if (healthRes.success) {
                setEngineHealth(healthRes.data);
            }
            const failedRes = await stageEngineAPI.getFailedTransitions(7); // Last 7 days
            if (failedRes.success) {
                setFailedTransitions(failedRes.data || []);
            }
        } catch (error) {
            console.error('[StagePage] Failed to fetch observability data:', error);
            showToast('Failed to load engine observability data', 'error');
        } finally {
            setObservabilityLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'status') {
            fetchObservabilityData();
        }
    }, [activeTab]);