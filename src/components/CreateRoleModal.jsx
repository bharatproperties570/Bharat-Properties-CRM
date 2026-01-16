import React, { useState } from 'react';

const CreateRoleModal = ({ isOpen, onClose, onSave }) => {
    const [activeModule, setActiveModule] = useState('leads'); // leads | contacts | properties | task | booking | report
    const [roleData, setRoleData] = useState({
        name: 'Manager (Sales)',
        description: 'Authorize work for sales',
        sidebarPermissions: {
            profile: false, user: true, notification: true, salesGoal: true,
            import: false, export: false, bulkUpdate: false, duplicateMgt: false,
            prospecting: false, leadCapture: false,
            email: true, calls: false, messaging: false,
            lead: true, contact: true, task: true, properties: true,
            notes: false, templates: false, layout: false, postSales: false,
            integrations: false, api: false,
            fieldRules: false, distributions: false, sequences: false,
            automatedActions: false, triggers: false, scoring: false
        },
        modulePermissions: {
            leads: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' },
            contacts: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' },
            properties: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' },
            task: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' },
            booking: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' },
            report: { view: 'subordinates', add: true, update: 'all', reassign: 'subordinates', delete: 'subordinates' }
        }
    });

    if (!isOpen) return null;

    const modules = [
        { id: 'leads', label: 'Leads' },
        { id: 'contacts', label: 'Contacts' },
        { id: 'properties', label: 'Properties' },
        { id: 'task', label: 'Task' },
        { id: 'booking', label: 'Booking' },
        { id: 'report', label: 'Report' }
    ];

    const settingSections = [
        { label: 'Manage', items: [{ id: 'profile', label: 'Profile' }, { id: 'user', label: 'User' }, { id: 'notification', label: 'Notification' }, { id: 'salesGoal', label: 'Sales Goal' }] },
        { label: 'Data', items: [{ id: 'import', label: 'Import' }, { id: 'export', label: 'Export' }, { id: 'bulkUpdate', label: 'Bulk Update' }, { id: 'duplicateMgt', label: 'Duplicate Management' }, { id: 'prospecting', label: 'Prospecting & Enrich' }, { id: 'leadCapture', label: 'Lead Capture' }] },
        { label: 'Communication Channels', items: [{ id: 'email', label: 'Email' }, { id: 'calls', label: 'Calls' }, { id: 'messaging', label: 'Messaging' }] },
        { label: 'Customize', items: [{ id: 'lead', label: 'Lead' }, { id: 'contact', label: 'Contact' }, { id: 'task', label: 'Task' }, { id: 'properties', label: 'Properties' }, { id: 'notes', label: 'Notes' }, { id: 'templates', label: 'Templates' }, { id: 'layout', label: 'Layout' }, { id: 'postSales', label: 'Post Sales' }] },
        { label: 'Intergration', items: [{ id: 'integrations', label: 'Integrations' }, { id: 'api', label: 'API' }] },
        { label: 'Business Rule', items: [{ id: 'fieldRules', label: 'Field Rules' }, { id: 'distributions', label: 'Distributions' }, { id: 'sequences', label: 'Sequences' }, { id: 'automatedActions', label: 'Automated Actions' }, { id: 'triggers', label: 'Triggers' }, { id: 'scoring', label: 'Scoring' }] }
    ];

    const toggleSidebarPermission = (id) => {
        setRoleData(prev => ({
            ...prev,
            sidebarPermissions: {
                ...prev.sidebarPermissions,
                [id]: !prev.sidebarPermissions[id]
            }
        }));
    };

    const PermissionGroup = ({ label, type, options, currentValue, onChange }) => (
        <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <input type="checkbox" checked={currentValue !== false} onChange={(e) => onChange(e.target.checked ? options[0].id : false)} style={{ width: '16px', height: '16px' }} />
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{label}</label>
            </div>
            {currentValue !== false && (
                <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {options.map(opt => (
                        <div key={opt.id} onClick={() => onChange(opt.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                            <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                border: currentValue === opt.id ? '5px solid var(--primary-color)' : '1px solid #cbd5e1',
                                background: '#fff'
                            }}></div>
                            <span style={{ fontSize: '0.85rem', color: '#475569' }}>{opt.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                background: '#fff',
                width: '1000px',
                height: '92vh',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>Create a new role</h2>
                </div>

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Left Sidebar (Meta & Settings) */}
                    <div style={{ width: '380px', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Role name <span style={{ color: '#ef4444' }}>*</span></label>
                            <input
                                type="text"
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', marginTop: '6px' }}
                                value={roleData.name}
                                onChange={(e) => setRoleData({ ...roleData, name: e.target.value })}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Description</label>
                            <textarea
                                style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', marginTop: '6px', minHeight: '80px', resize: 'none' }}
                                placeholder="Let people know how this role should be used"
                                value={roleData.description}
                                onChange={(e) => setRoleData({ ...roleData, description: e.target.value })}
                            />
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: '20px' }}>Configure Settings Permissions</h3>
                            {settingSections.map((section, idx) => (
                                <div key={idx} style={{ marginBottom: '24px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '12px' }}>{section.label}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                                        {section.items.map(item => (
                                            <div
                                                key={item.id}
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                                onClick={() => toggleSidebarPermission(item.id)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={roleData.sidebarPermissions[item.id]}
                                                    onChange={() => { }} // Handled by div click
                                                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '0.85rem', color: '#475569' }}>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Content (Module Permissions) */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '20px', padding: '0 32px', borderBottom: '1px solid #f1f5f9' }}>
                            {modules.map(module => (
                                <div
                                    key={module.id}
                                    onClick={() => setActiveModule(module.id)}
                                    style={{
                                        padding: '16px 0',
                                        fontSize: '0.9rem',
                                        fontWeight: 700,
                                        color: activeModule === module.id ? 'var(--primary-color)' : '#94a3b8',
                                        borderBottom: activeModule === module.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {module.label}
                                </div>
                            ))}
                        </div>

                        {/* Permission Editor */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                            <PermissionGroup
                                label={`Can view ${activeModule}`}
                                options={[
                                    { id: 'subordinates', label: `Their and subordinates' ${activeModule}` },
                                    { id: 'peers', label: `Their, subordinates', and peers' ${activeModule}` },
                                    { id: 'manager', label: `Their, subordinates', peers', and manager's ${activeModule}` },
                                    { id: 'all', label: `Same ${activeModule} as their manager` }
                                ]}
                                currentValue={roleData.modulePermissions[activeModule].view}
                                onChange={(val) => {
                                    const newPerms = { ...roleData.modulePermissions };
                                    newPerms[activeModule].view = val;
                                    setRoleData({ ...roleData, modulePermissions: newPerms });
                                }}
                            />

                            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={true} readOnly style={{ width: '16px', height: '16px' }} />
                                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>Can add {activeModule}</label>
                            </div>

                            <PermissionGroup
                                label={`Can update ${activeModule}`}
                                options={[
                                    { id: 'subordinates', label: `Only their and subordinates' ${activeModule}` },
                                    { id: 'all', label: `All ${activeModule} they can view` }
                                ]}
                                currentValue={roleData.modulePermissions[activeModule].update}
                                onChange={(val) => {
                                    const newPerms = { ...roleData.modulePermissions };
                                    newPerms[activeModule].update = val;
                                    setRoleData({ ...roleData, modulePermissions: newPerms });
                                }}
                            />

                            <PermissionGroup
                                label={`Can reassign ownership of ${activeModule}`}
                                options={[
                                    { id: 'subordinates', label: `Only their and subordinates' ${activeModule}` },
                                    { id: 'all', label: `All ${activeModule} they can view` }
                                ]}
                                currentValue={roleData.modulePermissions[activeModule].reassign}
                                onChange={(val) => {
                                    const newPerms = { ...roleData.modulePermissions };
                                    newPerms[activeModule].reassign = val;
                                    setRoleData({ ...roleData, modulePermissions: newPerms });
                                }}
                            />

                            <PermissionGroup
                                label={`Can delete ${activeModule}`}
                                options={[
                                    { id: 'subordinates', label: `Only their and subordinates' ${activeModule}` },
                                    { id: 'all', label: `All ${activeModule} they can view` }
                                ]}
                                currentValue={roleData.modulePermissions[activeModule].delete}
                                onChange={(val) => {
                                    const newPerms = { ...roleData.modulePermissions };
                                    newPerms[activeModule].delete = val;
                                    setRoleData({ ...roleData, modulePermissions: newPerms });
                                }}
                            />

                            {/* View Properties Owner Level (Matching Image 3 bottom) */}
                            <div style={{ marginTop: '40px', borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                                <PermissionGroup
                                    label={`Can view ${activeModule === 'properties' ? 'Properties' : activeModule} Owner`}
                                    options={[
                                        { id: 'subordinates', label: `Their and subordinates' deals` },
                                        { id: 'peers', label: `Their, subordinates', and peers' deals` },
                                        { id: 'manager', label: `Their, subordinates', peers', and manager's deals` },
                                        { id: 'all', label: `Same deals as their manager` }
                                    ]}
                                    currentValue={'subordinates'}
                                    onChange={() => { }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                    <button
                        className="btn-outline"
                        onClick={onClose}
                        style={{ padding: '8px 24px', borderRadius: '6px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 600 }}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => onSave(roleData)}
                        style={{ padding: '8px 24px', borderRadius: '6px', fontWeight: 700 }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateRoleModal;
