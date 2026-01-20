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
import MarketingPage from '../pages/Marketing/MarketingPage';
import ProfilePage from '../pages/Profile/ProfilePage';
import ProjectsPage from '../pages/Projects/ProjectsPage';
import ReportsPage from '../pages/Reports/ReportsPage';
import WizardPage from '../pages/Wizard/WizardPage';
import SettingsPage from '../pages/Settings/SettingsPage';
import CommunicationPage from '../pages/Communication/CommunicationPage';

// Settings Sub-Pages
import EmailSettingsPage from '../pages/Settings/views/EmailSettingsPage';
import IntegrationsSettingsPage from '../pages/Settings/views/IntegrationsSettingsPage';
import MessagingSettingsPage from '../pages/Settings/views/MessagingSettingsPage';
import NotificationSettingsPage from '../pages/Settings/views/NotificationSettingsPage';
import SalesGoalsSettingsPage from '../pages/Settings/views/SalesGoalsSettingsPage';
import VoiceSettingsPage from '../pages/Settings/views/VoiceSettingsPage';

const AppRouter = ({ currentView, onNavigate, onEditContact }) => {
    switch (currentView) {
        case 'dashboard':
            return <DashboardPage />;
        case 'contacts':
            return <ContactsPage onEdit={onEditContact} />;
        case 'company':
            return <CompanyPage />;
        case 'leads':
            return <LeadsPage />;
        case 'forms':
            return <FormsPage />;
        case 'deals':
            return <DealsPage />;
        case 'marketing':
            return <MarketingPage onNavigate={onNavigate} />;
        case 'wizard':
            return <WizardPage onBack={() => onNavigate('marketing')} />;
        case 'projects':
            return <ProjectsPage />;
        case 'inventory':
            return <InventoryPage />;
        case 'activities':
            return <ActivitiesPage />;
        case 'booking':
            return <BookingPage onNavigate={onNavigate} />;
        case 'account':
            return <AccountPage onNavigate={onNavigate} />;
        case 'communication':
            return <CommunicationPage />;
        case 'reports':
            return <ReportsPage />;
        case 'profile':
            return <ProfilePage />;

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
