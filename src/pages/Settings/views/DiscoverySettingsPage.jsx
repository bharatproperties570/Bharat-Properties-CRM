import React, { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const DiscoverySettingsPage = () => {
    const [configs, setConfigs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);

    // Form State
    const [name, setName] = useState('');
    const [keywords, setKeywords] = useState('');
    const [locationFilters, setLocationFilters] = useState('');
    const [propertyTypes, setPropertyTypes] = useState('');
    const [scheduleCron, setScheduleCron] = useState('0 0 * * *');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const res = await api.get('/discovery');
            if (res.data.success) {
                setConfigs(res.data.data);
            }
        } catch (error) {
            console.error("Error fetching discovery configs", error);
            toast.error("Failed to fetch discovery configs");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenModal = (config = null) => {
        if (config) {
            setEditingConfig(config);
            setName(config.name);
            setKeywords(config.keywords.join(', '));
            setLocationFilters(config.location_filters.join(', '));
            setPropertyTypes(config.property_types.join(', '));
            setScheduleCron(config.schedule_cron);
            setIsActive(config.is_active);
        } else {
            setEditingConfig(null);
            setName('');
            setKeywords('');
            setLocationFilters('');
            setPropertyTypes('');
            setScheduleCron('0 0 * * *');
            setIsActive(true);
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!name || !keywords) {
            return toast.error("Name and Keywords are required");
        }

        const payload = {
            name,
            keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
            location_filters: locationFilters.split(',').map(s => s.trim()).filter(Boolean),
            property_types: propertyTypes.split(',').map(s => s.trim()).filter(Boolean),
            schedule_cron: scheduleCron,
            is_active: isActive
        };

        const tId = toast.loading('Saving config...');
        try {
            if (editingConfig) {
                await api.put(`/discovery/${editingConfig._id}`, payload);
                toast.success("Updated successfully", { id: tId });
            } else {
                await api.post('/discovery', payload);
                toast.success("Created successfully", { id: tId });
            }
            setIsModalOpen(false);
            fetchConfigs();
        } catch (error) {
            toast.error("Failed to save", { id: tId });
            console.error(error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this discovery configuration?")) return;
        
        const tId = toast.loading("Deleting...");
        try {
            await api.delete(`/discovery/${id}`);
            toast.success("Deleted", { id: tId });
            fetchConfigs();
        } catch (error) {
            toast.error("Failed to delete", { id: tId });
        }
    };

    const handleTrigger = async (id) => {
        const tId = toast.loading("Triggering discovery run...");
        try {
            await api.post(`/discovery/${id}/trigger`);
            toast.success("Discovery triggered! Jobs are running in background.", { id: tId });
            setTimeout(fetchConfigs, 3000); // Check status after 3s
        } catch (error) {
            toast.error("Failed to trigger", { id: tId });
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>Google Discovery Engine</h2>
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>Automate public property discovery from indexed web pages.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    style={{ background: '#3b82f6', color: '#ffffff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <i className="fas fa-plus"></i> New Config
                </button>
            </div>

            {isLoading ? (
                <div>Loading configurations...</div>
            ) : configs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                    <i className="fab fa-google" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '16px' }}></i>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '8px' }}>No Discovery Configs</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Create a search configuration to start discovering properties.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                    {configs.map(config => (
                        <div key={config._id} style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{config.name}</h3>
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, background: config.is_active ? '#dcfce7' : 'var(--bg-light)', color: config.is_active ? '#166534' : 'var(--text-muted)' }}>
                                        {config.is_active ? 'ACTIVE' : 'PAUSED'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    <strong>Keywords:</strong> {config.keywords.join(', ')}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
                                    <span><i className="far fa-clock"></i> {config.schedule_cron}</span>
                                    <span><i className="fas fa-link"></i> {config.urls_discovered_count} URLs Found</span>
                                    <span>
                                        Status: 
                                        <span style={{ 
                                            marginLeft: '4px',
                                            color: config.last_run_status === 'success' ? '#10b981' : config.last_run_status === 'failed' ? '#ef4444' : '#f59e0b',
                                            fontWeight: 600
                                        }}>
                                            {config.last_run_status.toUpperCase()}
                                        </span>
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => handleTrigger(config._id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>
                                    <i className="fas fa-play"></i> Run Now
                                </button>
                                <button onClick={() => handleOpenModal(config)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    Edit
                                </button>
                                <button onClick={() => handleDelete(config._id)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: 'var(--danger-bg)', color: '#ef4444', cursor: 'pointer' }}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90vw' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.2rem', fontWeight: 800 }}>{editingConfig ? 'Edit Config' : 'New Discovery Config'}</h3>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Configuration Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Haryana Urgent Sales" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Keywords (comma separated)</label>
                            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. urgent sale, distress property" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Locations</label>
                                <input value={locationFilters} onChange={e => setLocationFilters(e.target.value)} placeholder="e.g. sector 8, kurukshetra" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Property Types</label>
                                <input value={propertyTypes} onChange={e => setPropertyTypes(e.target.value)} placeholder="e.g. house, plot, shop" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Cron Schedule</label>
                            <input value={scheduleCron} onChange={e => setScheduleCron(e.target.value)} placeholder="0 0 * * *" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'monospace' }} />
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Default: 0 0 * * * (Daily at midnight)</div>
                        </div>

                        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} id="isActiveToggle" />
                            <label htmlFor="isActiveToggle" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Active / Scheduled</label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleSave} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#ffffff', cursor: 'pointer', fontWeight: 600 }}>Save Config</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiscoverySettingsPage;
