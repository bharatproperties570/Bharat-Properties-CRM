import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AddContactModal from './components/AddContactModal';
import { contactData, leadData } from './data/mockData';
import ContactsView from './views/ContactsView';
import LeadsView from './views/LeadsView';
import MarketingView from './views/MarketingView';
import WizardView from './views/WizardView';
import ProjectsView from './views/ProjectsView';
import InventoryView from './views/InventoryView';
import DealsView from './views/DealsView';
import ActivitiesView from './views/ActivitiesView';
import BookingView from './views/BookingView';
import AccountView from './views/AccountView';
import CommunicationView from './views/CommunicationView';
import ReportsView from './views/ReportsView';
import DashboardView from './views/DashboardView';
import ProfileView from './views/ProfileView';
import SettingsHubView from './views/SettingsHubView';
import CompanyView from './views/CompanyView';
import PersonView from './views/PersonView';
import AddContactFormView from './views/AddContactFormView';
import FormsHubView from './views/FormsHubView';

function App() {
    const [currentView, setCurrentView] = useState('dashboard'); // leads | contacts | marketing | wizard | dashboard
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [modalEntityType, setModalEntityType] = useState('contact'); // 'contact' or 'lead'


    const [editingContact, setEditingContact] = useState(null);

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setShowAddContactModal(true);
    };

    const handleUpdateContact = (formData) => {
        // Find index of contact being edited
        // In real app we use ID, here finding by mobile or fallback to name matching for mock
        const index = contactData.findIndex(c => c.mobile === editingContact.mobile);

        if (index !== -1) {
            const updatedContact = {
                ...contactData[index],
                name: `${formData.title} ${formData.name} ${formData.surname}`.trim(),
                mobile: formData.phones[0]?.number || '',
                email: formData.emails[0]?.address || '',
                address: [
                    formData.personalAddress.hNo,
                    formData.personalAddress.location,
                    formData.personalAddress.area,
                    formData.personalAddress.postOffice,
                    formData.personalAddress.tehsil,
                    formData.personalAddress.city,
                    formData.personalAddress.state,
                    formData.personalAddress.pinCode ? `- ${formData.personalAddress.pinCode}` : ''
                ].filter(Boolean).join(', '),
                professional: formData.professionCategory || 'General',
                designation: formData.designation || '',
                company: formData.company || '',
                tags: formData.tags.join(', ') || '-',
                source: formData.source || 'Direct',
                // Keep existing system fields unless changed
                category: formData.professionSubCategory || contactData[index].category
            };
            contactData[index] = updatedContact;
        }

        setEditingContact(null);
        setShowAddContactModal(false);
        setCurrentView('contacts');
    };

    const handleSaveContact = (formData) => {
        if (editingContact) {
            handleUpdateContact(formData);
            return;
        }

        const newContact = {
            name: `${formData.title} ${formData.name} ${formData.surname}`.trim(),
            mobile: formData.phones[0]?.number || '',
            email: formData.emails[0]?.address || '',
            address: [
                formData.personalAddress.hNo,
                formData.personalAddress.location,
                formData.personalAddress.area,
                formData.personalAddress.postOffice,
                formData.personalAddress.tehsil,
                formData.personalAddress.city,
                formData.personalAddress.state,
                formData.personalAddress.pinCode ? `- ${formData.personalAddress.pinCode}` : ''
            ].filter(Boolean).join(', '),
            professional: formData.professionCategory || 'General',
            designation: formData.designation || '',
            company: formData.company || '',
            tags: formData.tags.join(', ') || '-',
            source: formData.source || 'Direct',
            lastComm: 'Just Added',
            actionable: 'Review',
            ownership: 'Bharat Properties (Admin)',
            addOnDate: new Date().toLocaleDateString('en-GB'),
            addOnTime: new Date().toLocaleTimeString(),
            group: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
            icon: 'fa-user',
            crmLinks: {},
            category: formData.professionSubCategory || 'Contact'
        };

        // Add to mock data (in-memory update)
        contactData.unshift(newContact);

        // Close modal and switch view
        setShowAddContactModal(false);
        setCurrentView('contacts');
    };

    const handleSaveLead = (formData) => {
        const newLead = {
            score: { val: 50, class: 'medium' }, // Default score
            name: `${formData.title} ${formData.name} ${formData.surname}`.trim(),
            mobile: formData.phones[0]?.number || '',
            // Mapping contact fields to lead requirements as best as possible or leaving generic
            req: {
                type: 'Buy Residential', // Default for now as form doesn't have these specific lead tabs anymore
                size: '2000 Sq. Ft'
            },
            budget: '₹50L - ₹1Cr', // Default placeholder
            location: [
                formData.personalAddress.city,
                formData.personalAddress.tehsil
            ].filter(Boolean).join(', ') || 'Any',
            matched: 0,
            status: { label: 'New', class: 'new' },
            source: formData.source || 'Direct',
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


    const renderView = () => {
        switch (currentView) {
            case 'contacts':
                return <ContactsView onEdit={handleEditContact} />;
            case 'company':
                return <CompanyView />;
            case 'person':
                return <PersonView />;
            case 'leads':
                return <LeadsView />;
            case 'marketing':
                return <MarketingView onNavigate={setCurrentView} />;
            case 'wizard':
                return <WizardView onBack={() => setCurrentView('marketing')} />;
            case 'projects':
                return <ProjectsView />;
            case 'inventory':
                return <InventoryView />;
            case 'deals':
                return <DealsView />;
            case 'activities':
                return <ActivitiesView />;
            case 'forms':
                return <FormsHubView />;
            case 'booking':
                return <BookingView onNavigate={setCurrentView} />;
            case 'account':
                return <AccountView onNavigate={setCurrentView} />;
            case 'communication':
                return <CommunicationView />;
            case 'reports':
                return <ReportsView />;
            case 'dashboard':
                return <DashboardView />;
            case 'profile':
                return <ProfileView />;
            case 'settings':
                return <SettingsHubView />;
            default:
                return <DashboardView />;
        }
    };

    return (
        <div className="app-container">
            {/* Sidebar handles navigation */}
            <Sidebar currentView={currentView} onNavigate={setCurrentView} />

            {/* Main Area: Header + Views */}
            <main className="main-area">
                <Header
                    onNavigate={setCurrentView}
                    onAddContact={() => {
                        setModalEntityType('contact');
                        setShowAddContactModal(true);
                    }}
                    onAddLead={() => {
                        setModalEntityType('lead');
                        setShowAddContactModal(true);
                    }}
                />
                {renderView()}
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
