import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AddContactModal from './components/AddContactModal';
import AddCompanyModal from './components/AddCompanyModal';
import CreateActivityModal from './components/CreateActivityModal';
import AppRouter from './router/AppRouter';
import DashboardPage from './pages/Dashboard/DashboardPage';

// Data
import { contactData, leadData } from './data/mockData';

function App() {
    // Global Navigation State
    const [currentView, setCurrentView] = useState(() => {
        const path = window.location.pathname;
        if (path.startsWith('/contacts/')) return 'contact-detail';
        if (path === '/contacts') return 'contacts';
        if (path === '/leads') return 'leads';
        if (path === '/deals') return 'deals';
        if (path === '/activities') return 'activities';
        return 'dashboard';
    });
    const [currentContactId, setCurrentContactId] = useState(() => {
        const path = window.location.pathname;
        if (path.startsWith('/contacts/')) {
            return path.split('/').pop();
        }
        return null;
    });

    // Custom Navigation Handler
    const handleNavigate = (view, contactId = null) => {
        setCurrentView(view);
        setCurrentContactId(contactId);

        let url = '/';
        if (view === 'contacts') url = '/contacts';
        else if (view === 'contact-detail' && contactId) url = `/contacts/${contactId}`;
        else if (view === 'dashboard') url = '/';
        else url = `/${view}`;

        window.history.pushState({ view, contactId }, '', url);
    };

    // Handle session popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = (event) => {
            const state = event.state;
            if (state) {
                setCurrentView(state.view);
                setCurrentContactId(state.contactId);
            } else {
                const path = window.location.pathname;
                if (path.startsWith('/contacts/')) {
                    setCurrentView('contact-detail');
                    setCurrentContactId(path.split('/').pop());
                } else if (path === '/contacts') {
                    setCurrentView('contacts');
                } else {
                    setCurrentView('dashboard');
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Global Modal State
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
    const [modalEntityType, setModalEntityType] = useState('contact'); // 'contact' or 'lead'
    const [editingContact, setEditingContact] = useState(null);
    const [editingCompany, setEditingCompany] = useState(null);

    // Global Activity Modal State
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activityInitialData, setActivityInitialData] = useState(null);

    return (
        <div className="app-container">
            <Sidebar currentView={currentView} onNavigate={handleNavigate} />
            <main className="main-area">
                <Header
                    onNavigate={handleNavigate}
                    onAddContact={() => {
                        setModalEntityType('contact');
                        setEditingContact(null);
                        setShowAddContactModal(true);
                    }}
                    onAddLead={() => {
                        setModalEntityType('lead');
                        setShowAddContactModal(true);
                    }}
                    onAddCompany={() => {
                        setEditingCompany(null);
                        setShowAddCompanyModal(true);
                    }}
                    onAddActivity={() => {
                        setActivityInitialData({ relatedTo: [] });
                        setShowActivityModal(true);
                    }}
                />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AppRouter
                        currentView={currentView}
                        currentContactId={currentContactId}
                        onNavigate={handleNavigate}
                        onEditContact={(c) => {
                            setEditingContact(c);
                            setModalEntityType('contact');
                            setShowAddContactModal(true);
                        }}
                        onEditCompany={(c) => {
                            setEditingCompany(c);
                            setShowAddCompanyModal(true);
                        }}
                        onAddActivity={(relatedTo) => {
                            setActivityInitialData({ relatedTo });
                            setShowActivityModal(true);
                        }}
                    />
                </div>

                <AddContactModal
                    isOpen={showAddContactModal}
                    onClose={() => setShowAddContactModal(false)}
                    initialData={editingContact}
                    entityType={modalEntityType}
                    onAdd={(data) => {
                        console.log('Added:', data);
                        setShowAddContactModal(false);
                    }}
                />

                <AddCompanyModal
                    isOpen={showAddCompanyModal}
                    onClose={() => setShowAddCompanyModal(false)}
                    initialData={editingCompany}
                    onAdd={(data) => {
                        console.log('Company Added/Updated:', data);
                        setShowAddCompanyModal(false);
                    }}
                />

                <CreateActivityModal
                    isOpen={showActivityModal}
                    onClose={() => setShowActivityModal(false)}
                    initialData={activityInitialData}
                    onSave={(data) => {
                        console.log('Activity Saved:', data);
                        setShowActivityModal(false);
                    }}
                />
            </main>
        </div>
    );
}

export default App;
