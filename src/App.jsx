import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AddContactModal from './components/AddContactModal';
import CreateActivityModal from './components/CreateActivityModal';
import AppRouter from './router/AppRouter';

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
                // Initial load / default logic for back button to initial page
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
    const [modalEntityType, setModalEntityType] = useState(null); // 'contact' or 'lead'
    const [editingContact, setEditingContact] = useState(null);

    // Global Activity Modal State
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activityInitialData, setActivityInitialData] = useState(null);

    // Handlers
    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setModalEntityType('contact');
        setShowAddContactModal(true);
    };

    const handleSaveContact = (formData) => {
        if (editingContact) {
            // Edit Mode - Update existing
            const index = contactData.findIndex(c => c.mobile === editingContact.mobile);
            if (index !== -1) {
                contactData[index] = { ...contactData[index], ...formData };
            }
        } else {
            // Add Mode
            const newContact = {
                ...formData,
                professional: 'Investor', // Default or derived
                designation: 'New Client',
                company: 'Self',
                source: 'Direct',
                tags: 'New',
                crmLinks: {},
                lastComm: 'Just Added',
                date: new Date().toLocaleDateString('en-GB'),
                actionable: 'Call',
                category: 'Prospect'
            };
            contactData.unshift(newContact);
        }
        setShowAddContactModal(false);
        setEditingContact(null);
    };

    const handleSaveLead = (formData) => {
        // Add Lead Logic
        const newLead = {
            ...formData,
            req: { type: 'Buy Residential', size: 'N/A' }, // Defaults
            score: { val: 60, class: 'medium' },
            matched: 0,
            budget: '₹ TBD',
            location: 'Gurgaon',
            status: { label: 'New', class: 'new' },
            source: 'Direct',
            remarks: 'New Lead Entry',
            activity: 'Call', // Next action
            lastAct: 'Today',
            owner: 'Assign Pending',
            addOn: 'Just Now',
            crmLinks: {},
            professional: 'Investor',
            designation: 'New Client',
            company: 'Self',
            tags: 'New',
            lastComm: 'Just Added',
            date: new Date().toLocaleDateString('en-GB'),
            actionable: 'Call',
            category: 'Lead'
        };

        leadData.unshift(newLead);
        setShowAddContactModal(false);
        setModalEntityType('contact');
        setCurrentView('leads');
    };

    const handleOpenActivityModal = (relatedTo = []) => {
        setActivityInitialData({ relatedTo });
        setShowActivityModal(true);
    };

    const handleSaveActivity = (activityData) => {
        // Here we would typically save to backend
        console.log('Activity Saved:', activityData);
        setShowActivityModal(false);
    };

    return (
        <div className="app-container">
            {/* Sidebar handles navigation */}
            <Sidebar currentView={currentView} onNavigate={handleNavigate} />

            {/* Main Area: Header + AppRouter */}
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
                    onAddActivity={() => handleOpenActivityModal([])}
                />

                {/* Router Component Handling View Switch */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AppRouter
                        currentView={currentView}
                        currentContactId={currentContactId}
                        onNavigate={handleNavigate}
                        onEditContact={handleEditContact}
                        onAddActivity={handleOpenActivityModal}
                    />
                </div>

                <AddContactModal
                    isOpen={showAddContactModal}
                    onClose={() => {
                        setShowAddContactModal(false);
                        setEditingContact(null);
                        setModalEntityType('contact'); // Reset to default
                    }}
                    onAdd={modalEntityType === 'lead' ? handleSaveLead : handleSaveContact}
                    initialData={editingContact}
                    mode={editingContact ? 'edit' : 'add'}
                    entityType={modalEntityType || 'contact'}
                />

                <CreateActivityModal
                    isOpen={showActivityModal}
                    onClose={() => setShowActivityModal(false)}
                    onSave={handleSaveActivity}
                    initialData={activityInitialData}
                />
            </main>
        </div>
    );
}

export default App;
