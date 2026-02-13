import React from 'react';

// Pages
import DashboardPage from '../pages/Dashboard/DashboardPage';
import ContactsPage from '../pages/Contacts/ContactsPage';
import LeadsPage from '../pages/Leads/LeadsPage';
import FormsPage from '../pages/Forms/FormsPage';
import DealsPage from '../pages/Deals/DealsPage';
import CompanyPage from '../pages/Company/CompanyPage';
import AccountPage from '../pages/Account/AccountPage';
import ActivitiesPage from '../pages/Activities/ActivitiesPage';
import BookingPage from '../pages/Booking/BookingPage';
import InventoryPage from '../pages/Inventory/InventoryPage';
import InventoryDetailPage from '../pages/Inventory/InventoryDetailPage';
import MarketingPage from '../pages/Marketing/MarketingPage';
import ProfilePage from '../pages/Profile/ProfilePage';
import ProjectsPage from '../pages/Projects/ProjectsPage';
import ReportsPage from '../pages/Reports/ReportsPage';
import WizardPage from '../pages/Wizard/WizardPage';
import SettingsPage from '../pages/Settings/SettingsPage';
import CommunicationPage from '../pages/Communication/CommunicationPage';
import DealIntakePage from '../pages/Deals/views/DealIntakePage';
import DealMatchingPage from '../pages/Deals/views/DealMatchingPage';
import LeadMatchingPage from '../pages/Leads/views/LeadMatchingPage';
import DealDetailPage from '../pages/Deals/DealDetailPage';
import ProjectDetailPage from '../pages/Projects/ProjectDetailPage';
import CompanyDetailPage from '../pages/Company/CompanyDetailPage';

// Settings Sub-Pages
import EmailSettingsPage from '../pages/Settings/views/EmailSettingsPage';
import IntegrationsSettingsPage from '../pages/Settings/views/IntegrationsSettingsPage';
import MessagingSettingsPage from '../pages/Settings/views/MessagingSettingsPage';
import NotificationSettingsPage from '../pages/Settings/views/NotificationSettingsPage';
import SalesGoalsSettingsPage from '../pages/Settings/views/SalesGoalsSettingsPage';
import VoiceSettingsPage from '../pages/Settings/views/VoiceSettingsPage';

import ContactDetail from '../pages/Contacts/ContactDetail';

import { leadData } from '../data/mockData';

const AppRouter = ({ currentView, currentContactId, onNavigate, onEditContact, onEditCompany, onAddActivity, onAddDeal, onAddInventory, onAddProject }) => {
    switch (currentView) {
        case 'dashboard':
            return <DashboardPage />;
        case 'contacts':
            return <ContactsPage onEdit={onEditContact} onAddActivity={onAddActivity} onNavigate={onNavigate} />;
        case 'contact-detail':
            const isLead = leadData.some(l => l.mobile === currentContactId);
            return <ContactDetail
                contactId={currentContactId}
                onBack={() => onNavigate(isLead ? 'leads' : 'contacts')}
                onAddActivity={onAddActivity}
            />;
        case 'company':
            return <CompanyPage onEdit={onEditCompany} onNavigate={onNavigate} />;
        case 'company-detail':
            return <CompanyDetailPage
                companyId={currentContactId}
                onBack={() => onNavigate('company')}
                onNavigate={onNavigate}
                onAddActivity={onAddActivity}
                onAddProject={onAddProject}
                onAddInventory={onAddInventory}
                onAddDeal={onAddDeal}
                onAddContact={onEditContact}
            />;
        case 'leads':
            return <LeadsPage onAddActivity={onAddActivity} onEdit={onEditContact} onNavigate={onNavigate} />;
        case 'forms':
            return <FormsPage />;
        case 'deals':
            return <DealsPage onNavigate={onNavigate} />;
        case 'deal-matching':
            return <DealMatchingPage onNavigate={onNavigate} dealId={currentContactId} />;
        case 'lead-matching':
            return <LeadMatchingPage onNavigate={onNavigate} leadId={currentContactId} />;
        case 'deal-detail':
            return <DealDetailPage
                dealId={currentContactId}
                onBack={() => onNavigate('deals')}
                onNavigate={onNavigate}
                onAddActivity={onAddActivity}
            />;
        case 'marketing':
            return <MarketingPage onNavigate={onNavigate} />;
        case 'wizard':
            return <WizardPage onBack={() => onNavigate('marketing')} />;
        case 'projects':
            return <ProjectsPage onNavigate={onNavigate} onAddProject={onAddProject} />;
        case 'project-detail':
            return <ProjectDetailPage
                projectId={currentContactId}
                onBack={() => onNavigate('projects')}
                onNavigate={onNavigate}
                onAddActivity={onAddActivity}
            />;
        case 'inventory':
            return <InventoryPage onNavigate={onNavigate} />;
        case 'inventory-detail':
            return <InventoryDetailPage
                inventoryId={currentContactId}
                onBack={() => onNavigate('inventory')}
                onNavigate={onNavigate}
                onAddActivity={onAddActivity}
                onAddDeal={onAddDeal}
                onEditInventory={onAddInventory}
            />;
        case 'activities':
            return <ActivitiesPage />;
        case 'booking':
            return <BookingPage onNavigate={onNavigate} initialContextId={currentContactId} />;
        case 'account':
            return <AccountPage onNavigate={onNavigate} initialContextId={currentContactId} />;
        case 'communication':
            return <CommunicationPage />;


        case 'reports':
            return <ReportsPage />;
        case 'profile':
            return <ProfilePage />;
        case 'deal-intake':
            return <DealIntakePage />;

        // Settings Routes
        case 'settings':
            return <SettingsPage onNavigate={onNavigate} />;
        case 'settings-email':
            return <EmailSettingsPage onBack={() => onNavigate('settings')} />;
        case 'settings-integrations':
            return <IntegrationsSettingsPage onBack={() => onNavigate('settings')} />;
        case 'settings-messaging':
            return <MessagingSettingsPage onBack={() => onNavigate('settings')} />;
        case 'settings-notifications':
            return <NotificationSettingsPage onBack={() => onNavigate('settings')} />;
        case 'settings-sales-goals':
            return <SalesGoalsSettingsPage onBack={() => onNavigate('settings')} />;
        case 'settings-voice':
            return <VoiceSettingsPage onBack={() => onNavigate('settings')} />;

        default:
            return <DashboardPage />;
    }
};

export default AppRouter;
