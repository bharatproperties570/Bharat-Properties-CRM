import React, { useState } from 'react';
import AddUserModal from '../../components/AddUserModal';
import CreateRoleModal from '../../components/CreateRoleModal';
import SalesGoalsSettingsPage from './views/SalesGoalsSettingsPage';
import NotificationSettingsPage from './views/NotificationSettingsPage';
import EmailSettingsPage from './views/EmailSettingsPage';
import VoiceSettingsPage from './views/VoiceSettingsPage';
import MessagingSettingsPage from './views/MessagingSettingsPage';
import IntegrationsSettingsPage from './views/IntegrationsSettingsPage';
import ScoringSettingsPage from './views/ScoringSettingsPage';

// --- Sub-Components (Defined Outside to prevent re-creation crashes) ---

const UserCard = ({ name, team, initials, isAdmin, count, hasAddIcon, isHighlighted }) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{
            background: '#fff',
            border: isHighlighted ? '2px solid #22c55e' : '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 16px',
            minWidth: '220px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            position: 'relative'
        }}>
            {isAdmin && (
                <span style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '12px',
                    background: '#22c55e',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                }}>ADMIN</span>
            )}
            <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: '#f1f5f9',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                border: '1px solid #e2e8f0'
            }}>
                {initials}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{name}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{team}</div>
            </div>
            {hasAddIcon && (
                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    <i className="fas fa-user-plus"></i>
                </div>
            )}
        </div>
        {count !== undefined && (
            <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: '1px solid var(--primary-color)',
                color: 'var(--primary-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: '#fff',
                marginLeft: '8px',
                zIndex: 2
            }}>
                {count}
            </div>
        )}
    </div>
);

const UserHierarchy = ({ showPermissions, setShowPermissions, onAddUser }) => {
    const [permissionModule, setPermissionModule] = useState('leads');
    const [showModuleDropdown, setShowModuleDropdown] = useState(false);

    const modules = ['leads', 'contacts', 'prospects and customers', 'deals'];

    return (
        <div style={{ flex: 1, padding: '32px 40px', background: '#f8fafc', overflow: 'auto', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                        <input type="text" placeholder="Search..." style={{ width: '200px', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.8rem' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            onClick={() => setShowPermissions(!showPermissions)}
                            style={{ width: '36px', height: '20px', background: showPermissions ? 'var(--primary-color)' : '#cbd5e1', borderRadius: '10px', padding: '2px', cursor: 'pointer', position: 'relative' }}
                        >
                            <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', right: showPermissions ? '2px' : 'auto', left: showPermissions ? 'auto' : '2px', transition: '0.2s' }}></div>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>Show permissions</span>
                        {showPermissions && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#475569' }}>
                                <span>On hover, show permissions for</span>
                                <div style={{ position: 'relative' }}>
                                    <div
                                        onClick={() => setShowModuleDropdown(!showModuleDropdown)}
                                        style={{
                                            padding: '4px 12px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '4px',
                                            background: '#fff',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            fontWeight: 700,
                                            color: 'var(--primary-color)',
                                            textDecoration: 'underline'
                                        }}
                                    >
                                        {permissionModule} <i className="fas fa-chevron-down" style={{ fontSize: '0.6rem' }}></i>
                                    </div>
                                    {showModuleDropdown && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '180px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '4px' }}>
                                            {modules.map(mod => (
                                                <div
                                                    key={mod}
                                                    onClick={() => { setPermissionModule(mod); setShowModuleDropdown(false); }}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9' }}
                                                    onMouseOver={(e) => e.target.style.background = '#f8fafc'}
                                                    onMouseOut={(e) => e.target.style.background = 'transparent'}
                                                >
                                                    {mod}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <button className="btn-outline" style={{ background: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #e2e8f0' }}>Center Hierarchy</button>
            </div>
            {/* Tree visualization matching uploaded_image_2 */}
            <div style={{ display: 'flex', alignItems: 'center', minHeight: '500px', position: 'relative', paddingLeft: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ color: '#cbd5e1', cursor: 'pointer' }} onClick={() => onAddUser()}><i className="fas fa-user-plus"></i></div>
                        <UserCard initials="RD" name="Real Deal" team="Real Deal's team, Sales" count={2} />
                    </div>
                    <div style={{ width: '60px', height: '1px', background: '#e2e8f0', position: 'relative' }}>
                        <div style={{ position: 'absolute', right: '-8px', top: '-6px', color: '#cbd5e1' }}><i className="fas fa-caret-right"></i></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCard initials="Ra" name="Ramesh" team="Sale Team Chandigrah" isHighlighted={showPermissions} />
                            <div style={{ color: '#cbd5e1', cursor: 'pointer' }} onClick={() => onAddUser({ manager: 'Ramesh' })}><i className="fas fa-user-plus"></i></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCard initials="Su" name="Suraj" team="Inventory Management" isHighlighted={showPermissions} />
                            <div style={{ color: '#cbd5e1', cursor: 'pointer' }} onClick={() => onAddUser({ manager: 'Suraj' })}><i className="fas fa-user-plus"></i></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UserList = ({ searchTerm, setSearchTerm, onNewUser, users }) => {
    const [openActionId, setOpenActionId] = useState(null);

    return (
        <div style={{ flex: 1, background: '#fff', padding: '32px 40px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '240px', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.8rem' }} />
                    </div>
                    <div style={{ display: 'flex', border: '1px solid var(--primary-color)', borderRadius: '4px', overflow: 'hidden' }}>
                        {['Active (2)', 'Deactivated (0)', 'Pending actions (0)'].map((label, i) => (
                            <div key={i} style={{ padding: '8px 16px', fontSize: '0.75rem', fontWeight: 600, background: i === 0 ? '#e0f2fe' : '#fff', color: 'var(--primary-color)', cursor: 'pointer', borderRight: i < 2 ? '1px solid var(--primary-color)' : 'none' }}>{label}</div>
                        ))}
                    </div>
                </div>
                <button className="btn-primary" onClick={() => onNewUser()} style={{ padding: '8px 20px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}>+ New user</button>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Name</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Contact</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Department</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Designation</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>User Name</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Call Log Sync</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Last Login</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Location</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left' }}>Status</th>
                            <th style={{ padding: '12px 16px', width: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase())).map(user => (
                            <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px', fontWeight: 700 }}>{user.name}</td>
                                <td style={{ padding: '16px' }}>{user.email}<br />{user.phone}</td>
                                <td style={{ padding: '16px', fontWeight: 700 }}>{user.department}</td>
                                <td style={{ padding: '16px', fontWeight: 700 }}>{user.designation}</td>
                                <td style={{ padding: '16px', color: 'var(--primary-color)', fontWeight: 600 }}>{user.userName}</td>
                                <td style={{ padding: '16px' }}>{user.callSync} ({user.lastSync})</td>
                                <td style={{ padding: '16px' }}>{user.lastLogin}</td>
                                <td style={{ padding: '16px', textAlign: 'center' }}><i className="fas fa-map-marker-alt" style={{ color: 'var(--primary-color)' }}></i></td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{ background: user.status === 'Active' ? '#22c55e' : '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem' }}>{user.status}</span>
                                </td>
                                <td style={{ padding: '16px', position: 'relative' }}>
                                    <button
                                        onClick={() => setOpenActionId(openActionId === user.id ? null : user.id)}
                                        style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                    >
                                        <i className="fas fa-caret-down"></i>
                                    </button>
                                    {openActionId === user.id && (
                                        <div style={{ position: 'absolute', top: '100%', right: 0, width: '160px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 100 }}>
                                            <div style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} onMouseOver={e => e.target.style.background = '#f8fafc'} onMouseOut={e => e.target.style.background = 'transparent'}>Edit User</div>
                                            <div style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} onMouseOver={e => e.target.style.background = '#f8fafc'} onMouseOut={e => e.target.style.background = 'transparent'}>Reset Password</div>
                                            <div style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', color: '#ef4444' }} onMouseOver={e => e.target.style.background = '#fef2f2'} onMouseOut={e => e.target.style.background = 'transparent'}>{user.status === 'Active' ? 'Deactivate' : 'Activate'}</div>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const RolesList = ({ onNewRole, roles }) => {
    return (
        <div style={{ flex: 1, background: '#fff', padding: '32px 40px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ position: 'relative' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1', fontSize: '0.8rem' }}></i>
                    <input type="text" placeholder="Search..." style={{ width: '240px', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.8rem' }} />
                </div>
                <button className="btn-primary" onClick={() => onNewRole()} style={{ padding: '8px 20px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700 }}>+ New role</button>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Role name</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Description</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Assigned users</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map(role => (
                            <tr key={role.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px', fontWeight: 700, color: '#1e293b' }}>{role.name}</td>
                                <td style={{ padding: '16px', color: '#64748b' }}>{role.description}</td>
                                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{role.assignedUsers}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const EmptyState = ({ title }) => (
    <div style={{ flex: 1, padding: '32px 64px', background: '#fff', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px' }}>{title}</h1>
        <div style={{ padding: '80px 40px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
            <i className="fas fa-tools" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '20px' }}></i>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Module Configuration</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>This feature is coming soon.</p>
        </div>
    </div>
);

// --- Main Settings Hub Component ---

const SettingsHubPage = () => {
    const [activeTab, setActiveTab] = useState('users');
    const [subTab, setSubTab] = useState('user-list');
    const [searchTerm, setSearchTerm] = useState('');
    const [showPermissions, setShowPermissions] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
    const [prefilledManager, setPrefilledManager] = useState('');

    const [users, setUsers] = useState([
        { id: 1, name: 'Ramesh', email: 'ramesh@bharatproperties.com', phone: '9876543210', department: 'Sale Team Chandigrah', designation: 'Sales Manager', userName: 'rames_admin', callSync: 'Connected', lastSync: '10 min ago', lastLogin: 'Today, 10:30 AM', status: 'Active' },
        { id: 2, name: 'Suraj', email: 'suraj@bharatproperties.com', phone: '9876543211', department: 'Inventory Management', designation: 'Inventory Head', userName: 'suraj_inv', callSync: 'Connected', lastSync: '1 hour ago', lastLogin: 'Yesterday, 4:45 PM', status: 'Active' }
    ]);

    const [roles, setRoles] = useState([
        { id: 1, name: 'Manager (Sales)', description: 'Sales group manager with full pipeline access', assignedUsers: 1 }
    ]);

    const handleAddUser = (userData) => {
        setUsers([...users, { ...userData, id: users.length + 1, callSync: 'Connected', lastSync: 'Just now', lastLogin: 'Never', status: 'Active' }]);
        setIsAddUserModalOpen(false);
    };

    const handleSaveRole = (roleData) => {
        setRoles([...roles, { ...roleData, id: roles.length + 1, assignedUsers: 0 }]);
        setIsCreateRoleModalOpen(false);
    };

    const sidebarSections = [
        { title: 'Manage', items: [{ id: 'users', label: 'Users' }, { id: 'notifications', label: 'Notifications' }, { id: 'sales-goals', label: 'Sales goals' }] },
        { title: 'Data', items: [{ id: 'import', label: 'Import' }, { id: 'bulk-update', label: 'Bulk update' }, { id: 'export', label: 'Export' }, { id: 'lead-capture', label: 'Lead capture' }, { id: 'duplicate-mgt', label: 'Duplicate management' }, { id: 'enrichment', label: 'Prospecting and enrichment' }] },
        { title: 'Communication channels', items: [{ id: 'email', label: 'Email' }, { id: 'calls', label: 'Calls' }, { id: 'messaging', label: 'Messaging' }] },
        { title: 'Customize', items: [{ id: 'leads-c', label: 'Leads' }, { id: 'contacts-c', label: 'Contacts' }, { id: 'properties-c', label: 'Properties' }, { id: 'templates', label: 'templates' }, { id: 'task-c', label: 'Task' }] },
        { title: 'Notes', items: [{ id: 'post-sales', label: 'Post Sales' }, { id: 'layouts', label: 'Layouts' }] },
        { title: 'Integrations', items: [{ id: 'integrations', label: 'Integrations' }, { id: 'api', label: 'API' }] },
        { title: 'Business rules', items: [{ id: 'field-rules', label: 'Field rules' }, { id: 'distributions', label: 'Distributions' }, { id: 'sequences', label: 'Sequences' }, { id: 'automated-actions', label: 'Automated actions' }, { id: 'triggers', label: 'Triggers' }, { id: 'scoring', label: 'Scoring' }] }
    ];

    const currentLabel = sidebarSections.flatMap(s => s.items).find(i => i.id === activeTab)?.label || 'Settings';

    return (
        <section id="settingsHubView" className="view-section active" style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', height: '100%', flex: 1 }}>
            {/* Sidebar */}
            <div className="profile-side-nav" style={{ width: '240px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', height: '100%', overflowY: 'auto', padding: '24px 0', flexShrink: 0 }}>
                {sidebarSections.map((section, idx) => (
                    <div key={idx} style={{ marginBottom: '24px' }}>
                        {section.title && <div style={{ padding: '0 24px 8px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{section.title}</div>}
                        <div className="nav-items-group">
                            {section.items.map(item => (
                                <div key={item.id} onClick={() => setActiveTab(item.id)} style={{ padding: '8px 24px', fontSize: '0.85rem', fontWeight: activeTab === item.id ? 700 : 500, color: activeTab === item.id ? '#0f172a' : '#64748b', background: activeTab === item.id ? '#e2e8f1' : 'transparent', cursor: 'pointer', borderLeft: activeTab === item.id ? '4px solid var(--primary-color)' : '4px solid transparent', transition: 'all 0.2s' }}>{item.label}</div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
                {/* Global Settings Header */}
                <div style={{ padding: '32px 40px 0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>SETTINGS</div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>{activeTab === 'users' ? 'User Management' : currentLabel}</h1>
                    </div>
                </div>

                {/* Sub Tabs (Only for Users) */}
                {activeTab === 'users' && (
                    <div style={{ display: 'flex', gap: '24px', padding: '0 40px', borderBottom: '1px solid #e2e8f0', marginTop: '20px' }}>
                        {[{ id: 'user-list', label: 'User List' }, { id: 'user-hierarchy', label: 'User Hierarchy' }, { id: 'roles', label: 'Roles' }].map(tab => (
                            <div key={tab.id} onClick={() => setSubTab(tab.id)} style={{ padding: '12px 4px', fontSize: '0.85rem', fontWeight: 700, color: subTab === tab.id ? 'var(--primary-color)' : '#94a3b8', borderBottom: subTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer', marginBottom: '-1px' }}>{tab.label}</div>
                        ))}
                    </div>
                )}

                {/* Body Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {activeTab === 'users' ? (
                        <>
                            {subTab === 'user-list' && <UserList searchTerm={searchTerm} setSearchTerm={setSearchTerm} users={users} onNewUser={() => { setPrefilledManager(''); setIsAddUserModalOpen(true); }} />}
                            {subTab === 'user-hierarchy' && <UserHierarchy showPermissions={showPermissions} setShowPermissions={setShowPermissions} onAddUser={(ctx) => { setPrefilledManager(ctx?.manager || ''); setIsAddUserModalOpen(true); }} />}
                            {subTab === 'roles' && <RolesList onNewRole={() => setIsCreateRoleModalOpen(true)} roles={roles} />}
                        </>
                    ) : activeTab === 'sales-goals' ? (
                        <SalesGoalsSettingsPage />
                    ) : activeTab === 'notifications' ? (
                        <NotificationSettingsPage />
                    ) : activeTab === 'email' ? (
                        <EmailSettingsPage />
                    ) : activeTab === 'calls' ? (
                        <VoiceSettingsPage />
                    ) : activeTab === 'messaging' ? (
                        <MessagingSettingsPage />
                    ) : activeTab === 'integrations' ? (
                        <IntegrationsSettingsPage />
                    ) : activeTab === 'scoring' ? (
                        <ScoringSettingsPage />
                    ) : (
                        <EmptyState title={currentLabel} />
                    )}
                </div>

                {/* Fixed Footer */}
                <div style={{ padding: '16px 40px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#fff' }}>
                    <button className="btn-primary" style={{ padding: '10px 32px', borderRadius: '6px', fontWeight: 700 }}>Save</button>
                </div>
            </div>

            {/* Modals */}
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onAdd={handleAddUser}
                prefilledManager={prefilledManager}
            />
            <CreateRoleModal
                isOpen={isCreateRoleModalOpen}
                onClose={() => setIsCreateRoleModalOpen(false)}
                onSave={handleSaveRole}
            />
        </section>
    );
};

export default SettingsHubPage;
