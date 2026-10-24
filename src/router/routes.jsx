import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, useOutletContext, Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import PublicChatWidget from '../components/PublicChatWidget';
import ErrorBoundary from '../components/ErrorBoundary';

// Public Pages
import LoginPage from '../pages/Auth/LoginPage';
import ForgotPasswordPage from '../pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from '../pages/Auth/ResetPasswordPage';
import PublicLeadForm from '../pages/Public/PublicLeadForm';
import PublicDealForm from '../pages/Public/PublicDealForm';
import PublicFeedbackForm from '../pages/Public/PublicFeedbackForm';
import CaptureFormPage from '../pages/Public/CaptureFormPage';

// Lazy Loaded Public Pages
const MatchBrochure = lazy(() => import('../pages/Public/MatchBrochure'));
const PublicPortfolioPage = lazy(() => import('../pages/Public/PublicPortfolioPage'));
const ClientSiteVisitJourneyPage = lazy(() => import('../pages/Public/ClientSiteVisitJourneyPage'));

// Lazy Loaded Protected Pages
const DashboardPage = lazy(() => import('../pages/Dashboard/DashboardPage'));
const ContactsPage = lazy(() => import('../pages/Contacts/ContactsPage'));
const LeadsPage = lazy(() => import('../pages/Leads/LeadsPage'));
const DealsPage = lazy(() => import('../pages/Deals/DealsPageV2'));
const LeadAnalyticsPage = lazy(() => import('../pages/Leads/LeadAnalyticsPage'));
const CompanyPage = lazy(() => import('../pages/Company/CompanyPage'));
const AccountPage = lazy(() => import('../pages/Account/AccountPage'));
const ActivitiesPage = lazy(() => import('../pages/Activities/ActivitiesPage'));
const BookingPage = lazy(() => import('../pages/Booking/BookingPage'));
const InventoryPage = lazy(() => import('../pages/Inventory/InventoryPageV2'));
const InventoryDetailPage = lazy(() => import('../pages/Inventory/InventoryDetailPage'));
const InventoryMatchingPage = lazy(() => import('../pages/Inventory/views/InventoryMatchingPage'));
const InventoryAnalyticsPage = lazy(() => import('../pages/Inventory/InventoryAnalyticsPage'));
const MarketingOverviewPage = lazy(() => import('../pages/Marketing/MarketingOverviewPage'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage'));
const ProjectsPage = lazy(() => import('../pages/Projects/ProjectsPageV2'));
const ReportsPage = lazy(() => import('../pages/Reports/ReportsPage'));
const WizardPage = lazy(() => import('../pages/Wizard/WizardPage'));
const SettingsPage = lazy(() => import('../pages/Settings/SettingsPage'));
const SequenceBuilderPage = lazy(() => import('../pages/Marketing/SequenceBuilder'));
const CommunicationPage = lazy(() => import('../pages/Communication/CommunicationPage'));
const DealIntakePage = lazy(() => import('../pages/Deals/views/DealIntakePage'));
const DealMatchingPage = lazy(() => import('../pages/Deals/views/DealMatchingPage'));
const LeadMatchingPage = lazy(() => import('../pages/Leads/views/LeadMatchingPage'));
const DealDetailPage = lazy(() => import('../pages/Deals/DealDetailPage'));
const DealAnalyticsPage = lazy(() => import('../pages/Deals/DealAnalyticsPage'));
const ProjectDetailPage = lazy(() => import('../pages/Projects/ProjectDetailPage'));
const ProjectMasterPlanPage = lazy(() => import('../pages/Projects/ProjectMasterPlanPage'));
const CompanyDetailPage = lazy(() => import('../pages/Company/CompanyDetailPage'));
const GoogleCallback = lazy(() => import('../pages/Settings/GoogleCallback'));
const EmailSettingsPage = lazy(() => import('../pages/Settings/views/EmailSettingsPage'));
const IntegrationsSettingsPage = lazy(() => import('../pages/Settings/views/IntegrationsSettingsPage'));
const MessagingSettingsPage = lazy(() => import('../pages/Settings/views/MessagingSettingsPage'));
const NotificationSettingsPage = lazy(() => import('../pages/Settings/views/NotificationSettingsPage'));
const SalesGoalsSettingsPage = lazy(() => import('../pages/Settings/views/SalesGoalsSettingsPage'));
const VoiceSettingsPage = lazy(() => import('../pages/Settings/views/VoiceSettingsPage'));
const EnrichmentSettingsPage = lazy(() => import('../pages/Settings/views/EnrichmentSettingsPage'));
const AiAgentsSettingsPage = lazy(() => import('../pages/Settings/views/AiAgentsSettingsPage'));
const ContactDetail = lazy(() => import('../pages/Contacts/ContactDetail'));

const RouteLoading = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', height: '100vh', gap: '20px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>LOADING...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

const PublicLayout = ({ children }) => (
    <>
        <Suspense fallback={<RouteLoading />}>
            {children || <Outlet />}
        </Suspense>
        <PublicChatWidget />
    </>
);


const ProtectedLayout = () => {
    const context = useOutletContext();
    return (
        <ErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
                <Outlet context={context} />
            </Suspense>
        </ErrorBoundary>
    );
};

// HOC to inject onNavigate, modal handlers and route params
const WithNav = ({ Component }) => {
    let context = {};
    try {
        context = useOutletContext() || {};
    } catch (e) {
        // Not in an outlet
    }
    const params = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const handleBack = () => {
        if (context?.onNavigate) {
            const currentSection = location.pathname.split('/')[1] || 'deals';
            context.onNavigate(currentSection);
        } else if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/deals');
        }
    };

    // Determine the right contextual onEdit based on component or route
    let contextualOnEdit = context?.onEdit;
    if (Component === CompanyPage || location.pathname.startsWith('/company')) {
        contextualOnEdit = context?.onEditCompany || context?.onEdit;
    } else if (Component === ContactsPage || Component === LeadsPage || location.pathname.startsWith('/contacts') || location.pathname.startsWith('/leads')) {
        contextualOnEdit = context?.onEditContact || context?.onEdit;
    }

    return <Component 
        {...context} 
        onEdit={contextualOnEdit}
        onEditContact={context?.onEditContact}
        onEditCompany={context?.onEditCompany}
        onAddActivity={context?.onAddActivity}
        onAddProject={context?.onAddProject}
        onEditProject={context?.onEditProject}
        onAddInventory={context?.onAddInventory}
        onAddDeal={context?.onAddDeal}
        {...params} 
        dealId={params?.id} 
        projectId={params?.id} 
        inventoryId={params?.id} 
        contactId={params?.id} 
        onBack={handleBack}
    />;
};


// We define our router here
export const router = createBrowserRouter([
    // Auth Routes
    { path: '/login', element: <WithNav Component={LoginPage} /> },
    { path: '/forgot-password', element: <WithNav Component={ForgotPasswordPage} /> },
    { path: '/reset-password/:token', element: <WithNav Component={ResetPasswordPage} /> },
    
    // Public Feature Routes
    { 
        element: <WithNav Component={PublicLayout} />, 
        children: [
            { path: '/public/form/:slug', element: <WithNav Component={PublicLeadForm} /> },
            { path: '/public/deal/:slug', element: <WithNav Component={PublicDealForm} /> },
            { path: '/public/feedback/:slug', element: <WithNav Component={PublicFeedbackForm} /> },
            { path: '/capture/:slug', element: <WithNav Component={CaptureFormPage} /> },
            { path: '/matches/:id', element: <WithNav Component={MatchBrochure} /> },
            { path: '/p/:slug', element: <WithNav Component={PublicPortfolioPage} /> },
            { path: '/journey/:token', element: <WithNav Component={ClientSiteVisitJourneyPage} /> },
            { path: '/public/journey/:token', element: <WithNav Component={ClientSiteVisitJourneyPage} /> }
        ]
    },

    // Protected Routes
    {
        element: <WithNav Component={AuthGuard} />,
        errorElement: <ErrorBoundary />,
        children: [
            {
                element: <ProtectedLayout />,
                children: [
                    { path: '/', element: <WithNav Component={DashboardPage} /> },
                    
                    { path: '/contacts', element: <WithNav Component={ContactsPage} /> },
                    { path: '/contacts/:id', element: <WithNav Component={ContactDetail} /> },
                    
                    { path: '/leads', element: <WithNav Component={LeadsPage} /> },
                    { path: '/lead-analytics', element: <WithNav Component={LeadAnalyticsPage} /> },
                    { path: '/leads/match/:id', element: <WithNav Component={LeadMatchingPage} /> },
                    { path: '/leads/match', element: <WithNav Component={LeadMatchingPage} /> },
                    { path: '/lead-matching', element: <WithNav Component={LeadMatchingPage} /> },
                    { path: '/lead-matching/:id', element: <WithNav Component={LeadMatchingPage} /> },
                    
                    { path: '/deals', element: <WithNav Component={DealsPage} /> },
                    { path: '/deal-analytics', element: <WithNav Component={DealAnalyticsPage} /> },
                    { path: '/deals/match/:id', element: <WithNav Component={DealMatchingPage} /> },
                    { path: '/deals/match', element: <WithNav Component={DealMatchingPage} /> },
                    { path: '/deal-matching', element: <WithNav Component={DealMatchingPage} /> },
                    { path: '/deal-matching/:id', element: <WithNav Component={DealMatchingPage} /> },
                    { path: '/deals/:id', element: <WithNav Component={DealDetailPage} /> },
                    { path: '/deal-intake', element: <WithNav Component={DealIntakePage} /> },
                    
                    { path: '/company', element: <WithNav Component={CompanyPage} /> },
                    { path: '/company/:id', element: <WithNav Component={CompanyDetailPage} /> },
                    
                    { path: '/inventory', element: <WithNav Component={InventoryPage} /> },
                    { path: '/inventory-analytics', element: <WithNav Component={InventoryAnalyticsPage} /> },
                    { path: '/inventory-matching/:id', element: <WithNav Component={InventoryMatchingPage} /> },
                    { path: '/inventory/:id', element: <WithNav Component={InventoryDetailPage} /> },
                    
                    { path: '/projects', element: <WithNav Component={ProjectsPage} /> },
                    { path: '/projects/:id', element: <WithNav Component={ProjectDetailPage} /> },
                    { path: '/projects/:id/master-plan', element: <WithNav Component={ProjectMasterPlanPage} /> },
                    
                    { path: '/activities', element: <WithNav Component={ActivitiesPage} /> },
                    { path: '/booking', element: <WithNav Component={BookingPage} /> },
                    { path: '/account', element: <WithNav Component={AccountPage} /> },
                    { path: '/communication', element: <WithNav Component={CommunicationPage} /> },
                    { path: '/reports', element: <WithNav Component={ReportsPage} /> },
                    { path: '/profile', element: <WithNav Component={ProfilePage} /> },
                    
                    { path: '/marketing', element: <WithNav Component={MarketingOverviewPage} /> },
                    { path: '/marketings', element: <Navigate to="/marketing-overview" replace /> },
                    { path: '/marketing-overview', element: <WithNav Component={MarketingOverviewPage} /> },
                    { path: '/marketing/sequences/:id', element: <WithNav Component={SequenceBuilderPage} /> },
                    { path: '/wizard', element: <WithNav Component={WizardPage} /> },
                    
                    { path: '/settings', element: <WithNav Component={SettingsPage} /> },
                    { path: '/settings/email', element: <WithNav Component={EmailSettingsPage} /> },
                    { path: '/settings/integrations', element: <WithNav Component={IntegrationsSettingsPage} /> },
                    { path: '/settings/messaging', element: <WithNav Component={MessagingSettingsPage} /> },
                    { path: '/settings/notifications', element: <WithNav Component={NotificationSettingsPage} /> },
                    { path: '/settings/sales-goals', element: <WithNav Component={SalesGoalsSettingsPage} /> },
                    { path: '/settings/voice', element: <WithNav Component={VoiceSettingsPage} /> },
                    { path: '/settings/enrichment', element: <WithNav Component={EnrichmentSettingsPage} /> },
                    { path: '/settings/ai-agents', element: <WithNav Component={AiAgentsSettingsPage} /> },
                    
                    { path: '/google-callback', element: <WithNav Component={GoogleCallback} /> },
                    
                    // Fallback
                    { path: '*', element: <div style={{ padding: '50px', textAlign: 'center' }}><h1>404 - Not Found</h1></div> }
                ]
            }
        ]
    }
]);
