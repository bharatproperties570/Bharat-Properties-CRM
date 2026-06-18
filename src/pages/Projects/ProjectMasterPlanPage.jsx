import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import ProjectMasterPlanTab from './ProjectMasterPlanTab';

const ProjectMasterPlanPage = ({ projectId, onBack }) => {
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchProjectDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`projects/${projectId}`);
            if (response.data && response.data.success) {
                setProject(response.data.data);
            } else {
                toast.error("Failed to load project details");
            }
        } catch (error) {
            console.error("Error fetching project:", error);
            toast.error("Error loading project");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-gray)' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--primary)' }}></i>
            </div>
        );
    }

    if (!project) return null;

    return (
        <div style={{ height: '100vh', width: '100vw', background: 'var(--bg-gray)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
            
            {/* Header Toolbar */}
            <div style={{ 
                height: '60px', 
                background: 'var(--bg-card)', 
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={onBack}
                        style={{ background: 'var(--bg-gray)', border: '1px solid var(--border-color)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        <i className="fas fa-arrow-left" style={{ color: 'var(--text-main)' }}></i>
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {project.name} - Master Plan Workspace
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Full Screen Plotting Mode
                        </span>
                    </div>
                </div>
            </div>

            {/* Canvas Area */}
            <div style={{ flex: 1, position: 'relative' }}>
                <ProjectMasterPlanTab project={project} onProjectUpdate={fetchProjectDetails} />
            </div>

        </div>
    );
};

export default ProjectMasterPlanPage;
