import React, { Suspense, lazy } from 'react';

// Lazy load pages for massive bundle reduction
const DashboardPage = lazy(() => import('../pages/Dashboard/DashboardPage'));
const ContactsPage = lazy(() => import('../pages/Contacts/ContactsPage'));
const LeadsPage = lazy(() => import('../pages/Leads/LeadsPage'));
const FormsPage = lazy(() => import('../pages/Forms/FormsPage'));
const DealsPage = lazy(() => import('../pages/Deals/DealsPage'));
const CompanyPage = lazy(() => import('../pages/Company/CompanyPage'));
const AccountPage = lazy(() => import('../pages/Account/AccountPage'));
const ActivitiesPage = lazy(() => import('../pages/Activities/ActivitiesPage'));
const BookingPage = lazy(() => import('../pages/Booking/BookingPage'));
const InventoryPage = lazy(() => import('../pages/Inventory/InventoryPage'));
const InventoryDetailPage = lazy(() => import('../pages/Inventory/InventoryDetailPage'));
const MarketingPage = lazy(() => import('../pages/Marketing/MarketingPage'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage'));
const ProjectsPage = lazy(() => import('../pages/Projects/ProjectsPage'));
const ReportsPage = lazy(() => import('../pages/Reports/ReportsPage'));
const WizardPage = lazy(() => import('../pages/Wizard/WizardPage'));
const SettingsPage = lazy(() => import('../pages/Settings/SettingsPage'));
const CommunicationPage = lazy(() => import('../pages/Communication/CommunicationPage'));
const DealIntakePage = lazy(() => import('../pages/Deals/views/DealIntakePage'));
const DealMatchingPage = lazy(() => import('../pages/Deals/views/DealMatchingPage'));
const LeadMatchingPage = lazy(() => import('../pages/Leads/views/LeadMatchingPage'));
const DealDetailPage = lazy(() => import('../pages/Deals/DealDetailPage'));
const ProjectDetailPage = lazy(() => import('../pages/Projects/ProjectDetailPage'));
const CompanyDetailPage = lazy(() => import('../pages/Company/CompanyDetailPage'));

// Settings Sub-Pages
const EmailSettingsPage = lazy(() => import('../pages/Settings/views/EmailSettingsPage'));
const IntegrationsSettingsPage = lazy(() => import('../pages/Settings/views/IntegrationsSettingsPage'));
const MessagingSettingsPage = lazy(() => import('../pages/Settings/views/MessagingSettingsPage'));
const NotificationSettingsPage = lazy(() => import('../pages/Settings/views/NotificationSettingsPage'));
const SalesGoalsSettingsPage = lazy(() => import('../pages/Settings/views/SalesGoalsSettingsPage'));
const VoiceSettingsPage = lazy(() => import('../pages/Settings/views/VoiceSettingsPage'));

const ContactDetail = lazy(() => import('../pages/Contacts/ContactDetail'));

import { leadData } from '../data/mockData';

// Premium Loading State for Suspense
const RouteLoading = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', gap: '20px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>SYNCING TRANSACTION DATA...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

const AppRouter = ({ currentView, currentContactId, onNavigate, onEditContact, onEditCompany, onAddActivity, onAddDeal, onAddInventory, onAddProject }) => {
    const renderContent = () => {
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

    return (
        <Suspense fallback={<RouteLoading />}>
            {renderContent()}
        </Suspense>
    );
};

export default AppRouter;
