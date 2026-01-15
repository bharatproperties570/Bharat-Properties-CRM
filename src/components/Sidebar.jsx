import React from 'react';
import { Home, Users, BarChart3, Settings, Grid, MessageSquare } from 'lucide-react';
// Note: We use lucide-react, but the legacy CSS uses FontAwesome classes.
// For pixel perfection, we should ideally use the same icons or similar.
// Since we have FontAwesome CSS loaded (via index.css -> font-awesome), we can specificy <i> tags too.
// However, the prompt migration plan suggested lucide.
// Let's stick to the CSS classes for now to match exactly what the user had (FontAwesome).
// If we want to use Lucide, we need to adapt the CSS.
// Strategy: Use the <i> tags from the original HTML to guarantee match.

function Sidebar({ currentView, onNavigate }) {
    return (
        <nav className="sidebar">
            {/* Platform Logo */}
            <div className="sidebar-logo">
                <div className="logo-icon">B</div>
            </div>

            <div className="sidebar-menu">
                <a
                    href="#"
                    className={`sidebar-icon ${currentView === 'dashboard' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onNavigate('dashboard'); }}
                    title="Dashboard"
                >
                    <i className="fas fa-home"></i>
                </a>
                <a
                    href="#"
                    className={`sidebar-icon ${currentView === 'leads' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onNavigate('leads'); }}
                    title="Leads"
                >
                    <i className="fas fa-filter"></i>
                </a>
                <a
                    href="#"
                    className={`sidebar-icon ${currentView === 'contacts' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onNavigate('contacts'); }}
                    title="Contacts"
                >
                    <i className="fas fa-user-friends"></i>
                </a>
                <a
                    href="#"
                    className={`sidebar-icon ${currentView === 'marketing' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onNavigate('marketing'); }}
                    title="Marketing"
                >
                    <i className="fas fa-bullhorn"></i>
                </a>
                <a
                    href="#"
                    className={`sidebar-icon ${currentView === 'reports' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onNavigate('reports'); }}
                    title="Reports"
                >
                    <i className="fas fa-chart-line"></i>
                </a>
            </div>

            <div className="sidebar-footer">
                <a href="#" className="sidebar-icon settings-icon" title="Settings">
                    <i className="fas fa-cog"></i>
                </a>
                <div className="user-profile-small">
                    <img src="https://ui-avatars.com/api/?name=Suraj+Key&background=0D8ABC&color=fff" alt="User" />
                </div>
            </div>
        </nav>
    );
}

export default Sidebar;
