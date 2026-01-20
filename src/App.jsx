import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AddContactModal from './components/AddContactModal';
import AppRouter from './router/AppRouter';

// Data
import { contactData, leadData } from './data/mockData';

function App() {
    // Global Navigation State
    const [currentView, setCurrentView] = useState('dashboard');
    const [lastView, setLastView] = useState('dashboard'); // For history (simple)

    // Global Modal State
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [modalEntityType, setModalEntityType] = useState('contact'); // 'contact' or 'lead'
    const [editingContact, setEditingContact] = useState(null);

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

    return (
        <div className="app-container">
            {/* Sidebar handles navigation */}
            <Sidebar currentView={currentView} onNavigate={setCurrentView} />

            {/* Main Area: Header + AppRouter */}
            <main className="main-area">
                <Header
                    onNavigate={setCurrentView}
                    onAddContact={() => {
                        setModalEntityType('contact');
                        setEditingContact(null);
                        setShowAddContactModal(true);
                    }}
                    onAddLead={() => {
                        setModalEntityType('lead');
                        setShowAddContactModal(true);
                    }}
                />

                {/* Router Component Handling View Switch */}
                <AppRouter
                    currentView={currentView}
                    onNavigate={setCurrentView}
                    onEditContact={handleEditContact}
                />

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
                    entityType={modalEntityType}
                />
            </main>
        </div>
    );
}

export default App;
