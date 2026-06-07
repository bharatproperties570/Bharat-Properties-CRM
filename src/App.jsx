console.log('[DEBUG] src/App.jsx module evaluated');
import { useState, useEffect, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { isWeb, safeWindow, getPathname } from './utils/platform';
import { Toaster } from 'react-hot-toast';
import { View, Text, Platform } from 'react-native';
import AppRouter from './router/AppRouter';
import MainLayout from './layouts/MainLayout';
import { PropertyConfigProvider } from './context/PropertyConfigContext';
import { ContactConfigProvider } from './context/ContactConfigContext';
import { ThemeProvider } from './context/ThemeContext';

import { ActivityProvider } from './context/ActivityContext';
import { FieldRulesProvider } from './context/FieldRulesContext';
import { DistributionProvider } from './context/DistributionContext';
import { SequenceProvider } from './context/SequenceContext';
import { TriggersProvider } from './context/TriggersContext';
import { AutomatedActionsProvider } from './context/AutomatedActionsContext';
import { CallProvider, useCall } from './context/CallContext'; // Import CallProvider and hook
import { ParsingProvider } from './context/ParsingContext'; // Import ParsingProvider
import { UserProvider, useUserContext } from './context/UserContext';
import LoginPage from './pages/Auth/LoginPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/Auth/ResetPasswordPage';
import ErrorBoundary from './components/ErrorBoundary';
import PublicLeadForm from './pages/Public/PublicLeadForm';
import PublicDealForm from './pages/Public/PublicDealForm';
import PublicFeedbackForm from './pages/Public/PublicFeedbackForm';
import CaptureFormPage from './pages/Public/CaptureFormPage';
import CallModal from './components/CallModal'; // Import CallModal
import PublicChatWidget from './components/PublicChatWidget';

// Helper Wrapper to connect Context to Modal
const CallModalWrapper = () => {
    const { isCallModalOpen, activeContact, closeCall, endCall, callContext } = useCall();
    return (
        <CallModal
            isOpen={isCallModalOpen}
            onClose={closeCall}
            contact={activeContact}
            context={callContext} // Pass context
            onCallEnd={endCall}
        />
    );
};
const AppContent = () => {
    const { token } = useUserContext();
    console.log('[DEBUG] AppContent rendering, token:', !!token);

    // Global Navigation State (Routing Logic Only)
    const [currentView, setCurrentView] = useState(() => {
        const path = getPathname();
        if (path.startsWith('/contacts/')) return 'contact-detail';
        if (path.startsWith('/inventory/')) return 'inventory-detail';
        if (path === '/contacts') return 'contacts';
        if (path === '/inventory') return 'inventory';
        if (path === '/marketings') return 'marketings';
        if (path === '/leads') return 'leads';
        if (path.startsWith('/company/')) return 'company-detail';
        if (path === '/company') return 'company';
        if (path.startsWith('/deals/')) {
            const possibleId = path.split('/').pop();
            if (possibleId !== 'deals' && possibleId !== 'match') return 'deal-detail';
        }
        if (path === '/contacts') return 'contacts';
        if (path === '/leads') return 'leads';
        if (path === '/activities') return 'activities';
        if (path === '/projects') return 'projects';
        if (path.startsWith('/projects/')) return 'project-detail';
        if (path === '/account') return 'account';
        if (path === '/deal-intake') return 'deal-intake';
        if (path.startsWith('/deals/match/')) return 'deal-matching';
        if (path.startsWith('/leads/match/')) return 'lead-matching';
        if (path.startsWith('/public/form/')) return 'public-lead-form';
        if (path.startsWith('/public/deal/')) return 'public-deal-form';
        if (path.startsWith('/public/feedback/')) return 'public-feedback-form';
        if (path.startsWith('/capture/')) return 'deal-capture';
        if (path === '/forgot-password') return 'forgot-password';
        if (path.startsWith('/reset-password/')) return 'reset-password';
        if (path === '/settings') return 'settings';
        if (path.startsWith('/settings/')) return 'settings';
        if (path.startsWith('/google-callback')) return 'google-callback';
        if (path === '/marketings') return 'marketing-overview';
        if (path === '/marketing') return 'marketing-overview';
        if (path === '/marketing-overview') return 'marketing-overview';
        if (path.startsWith('/p/')) return 'public-portfolio';
        if (path === '/activities') return 'activities';
        return 'dashboard';
    });

    const [currentContactId, setCurrentContactId] = useState(() => {
        const path = getPathname();
        if (path.startsWith('/contacts/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/deals/')) {
            const parts = path.split('/');
            if (parts.length > 2 && parts[2] !== 'match') return parts[2];
        }
        if (path.startsWith('/inventory/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/deals/match/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/leads/match/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/projects/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/projects/')) {
            return path.split('/').pop();
        }
        if (path.startsWith('/company/')) {
            return path.split('/').pop();
        }
        return null;
    });

    // Custom Navigation Handler
    const handleNavigate = (view, contactId = null) => {
        if (view === currentView && view === 'inventory') {
            if (isWeb) safeWindow.dispatchEvent(new CustomEvent('inventory-reset'));
        }
        setCurrentView(view);
        setCurrentContactId(contactId);

        let url = '/';
        if (view === 'contacts') url = '/contacts';
        else if (view === 'inventory') url = '/inventory';
        else if (view === 'marketing' || view === 'marketings' || view === 'marketing-overview') url = '/marketing-overview';
        else if (view === 'contact-detail' && contactId) url = `/contacts/${contactId}`;
        else if (view === 'inventory-detail' && contactId) url = `/inventory/${contactId}`;
        else if (view === 'deal-detail' && contactId) url = `/deals/${contactId}`;
        else if (view === 'deal-matching' && contactId) url = `/deals/match/${contactId}`;
        else if (view === 'lead-matching' && contactId) url = `/leads/match/${contactId}`;
        else if (view === 'project-detail' && contactId) url = `/projects/${contactId}`;
        else if (view === 'company-detail' && contactId) url = `/company/${contactId}`;
        else if (view === 'dashboard') url = '/';
        else if (view === 'marketing-overview') url = '/marketing-overview';
        else url = `/${view}`;

        if (isWeb && safeWindow.history) {
            safeWindow.history.pushState({ view, contactId }, '', url);
        }
    };

    // Handle session popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = (event) => {
            const state = event.state;
            const path = getPathname();

            if (state) {
                setCurrentView(state.view);
                setCurrentContactId(state.contactId);
            } else {
                // Fallback for direct browser nav or initial load via history
                if (path.startsWith('/contacts/')) {
                    setCurrentView('contact-detail');
                    setCurrentContactId(path.split('/').pop());
                } else if (path.startsWith('/deals/')) {
                    const parts = path.split('/');
                    if (parts.length > 2 && parts[2] !== 'match') {
                        setCurrentView('deal-detail');
                        setCurrentContactId(parts[2]);
                    } else if (parts[2] === 'match') {
                        setCurrentView('deal-matching');
                        setCurrentContactId(parts.pop());
                    } else {
                        setCurrentView('deals');
                    }
                } else if (path === '/contacts') {
                    setCurrentView('contacts');
                } else if (path === '/leads') {
                    setCurrentView('leads');
                } else if (path === '/inventory') {
                    setCurrentView('inventory');
                } else if (path === '/deal-intake') {
                    setCurrentView('deal-intake');
                } else if (path.startsWith('/deals/match/')) {
                    setCurrentView('deal-matching');
                    setCurrentContactId(path.split('/').pop());
                } else if (path.startsWith('/leads/match/')) {
                    setCurrentView('lead-matching');
                    setCurrentContactId(path.split('/').pop());
                } else if (path.startsWith('/projects/')) {
                    setCurrentView('project-detail');
                    setCurrentContactId(path.split('/').pop());
                } else if (path === '/forgot-password') {
                    setCurrentView('forgot-password');
                } else if (path.startsWith('/reset-password/')) {
                    setCurrentView('reset-password');
                } else if (path === '/marketing-overview') {
                    setCurrentView('marketing-overview');
                } else {
                    setCurrentView('dashboard');
                }
            }
        };

        if (isWeb) safeWindow.addEventListener('popstate', handlePopState);
        return () => {
            if (isWeb) safeWindow.removeEventListener('popstate', handlePopState);
        };
    }, []);

    if (currentView === 'public-lead-form') {
        const fallback = <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
        const slug = isWeb ? safeWindow.location.pathname.split('/').pop() : 'default';
        return (
            <>
                <Suspense fallback={fallback}>
                    <PublicLeadForm slug={slug} />
                </Suspense>
                {isWeb && <PublicChatWidget />}
            </>
        );
    }

    if (currentView === 'public-feedback-form') {
        const fallback = <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
        const slug = isWeb ? safeWindow.location.pathname.split('/').pop() : 'default';
        return (
            <>
                <Suspense fallback={fallback}>
                    <PublicFeedbackForm slug={slug} />
                </Suspense>
                {isWeb && <PublicChatWidget />}
            </>
        );
    }

    if (currentView === 'public-deal-form') {
        const fallback = <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
        const slug = isWeb ? safeWindow.location.pathname.split('/').pop() : 'default';
        return (
            <>
                <Suspense fallback={fallback}>
                    <PublicDealForm slug={slug} />
                </Suspense>
                {isWeb && <PublicChatWidget />}
            </>
        );
    }

    if (currentView === 'deal-capture') {
        const slug = isWeb ? safeWindow.location.pathname.split('/').pop() : 'professional-deal-capture';
        const fallback = isWeb ? <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div> : <View><Text>Loading...</Text></View>;
        return (
            <>
                <Suspense fallback={fallback}>
                    <CaptureFormPage slug={slug || 'professional-deal-capture'} />
                </Suspense>
                {isWeb && <PublicChatWidget />}
            </>
        );
    }

    if (currentView === 'public-portfolio') {
        const PublicPortfolioPage = React.lazy(() => import('./pages/Public/PublicPortfolioPage'));
        const fallback = <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
        return (
            <Suspense fallback={fallback}>
                <PublicPortfolioPage />
            </Suspense>
        );
    }

    if (currentView === 'forgot-password') {
        return <ForgotPasswordPage />;
    }

    if (currentView === 'reset-password') {
        return <ResetPasswordPage />;
    }

    console.log('[DEBUG] Final render decision, currentView:', currentView, 'hasToken:', !!token);
    
    if (!token) {
        console.log('[DEBUG] Rendering LoginPage');
        return <LoginPage />;
    }

    if (!isWeb) {
        return (
            <View style={{ 
                flex: 1, 
                backgroundColor: '#0f172a', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: 20
            }}>
                <View style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                    padding: 30, 
                    borderRadius: 24, 
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                }}>
                    <Text style={{ 
                        color: '#fff', 
                        fontSize: 24, 
                        fontWeight: '800', 
                        marginBottom: 10,
                        textAlign: 'center'
                    }}>
                        Bharat Properties
                    </Text>
                    <Text style={{ 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        fontSize: 14, 
                        textAlign: 'center',
                        lineHeight: 20
                    }}>
                        Mobile CRM Native interface is currently under optimization.
                    </Text>
                    <View style={{ 
                        marginTop: 30, 
                        padding: 15, 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                        borderRadius: 12,
                        width: '100%'
                    }}>
                        <Text style={{ color: '#3b82f6', fontWeight: '700', textAlign: 'center' }}>
                            Platform: Native {Platform.OS === 'ios' ? 'iOS' : 'Android'}
                        </Text>
                    </View>
                </View>
                <Text style={{ 
                    position: 'absolute', 
                    bottom: 40, 
                    color: 'rgba(255, 255, 255, 0.3)', 
                    fontSize: 10,
                    letterSpacing: 1
                }}>
                    ESTABLISHING SECURE CONNECTION...
                </Text>
            </View>
        );
    }

    return (
        <>
            <MainLayout currentView={currentView} onNavigate={handleNavigate}>
                {(modalHandlers) => (
                    <AppRouter
                        currentView={currentView}
                        currentContactId={currentContactId}
                        onNavigate={handleNavigate}
                        {...modalHandlers}
                    />
                )}
            </MainLayout>
            <CallModalWrapper />
        </>
    );
};

function App() {
    return (
        <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
            <UserProvider>
                <ThemeProvider>
                    <ContactConfigProvider>
                        <FieldRulesProvider>
                            <PropertyConfigProvider>
                                <ParsingProvider>
                                    <ActivityProvider>
                                        <DistributionProvider>
                                            <SequenceProvider>
                                                <AutomatedActionsProvider>
                                                    <TriggersProvider>
                                                        <CallProvider>
                                                            {isWeb && <Toaster 
                                                                position="top-right" 
                                                                containerStyle={{ zIndex: 999999 }}
                                                            />}
                                                            <AppContent />
                                                        </CallProvider>
                                                    </TriggersProvider>
                                                </AutomatedActionsProvider>
                                            </SequenceProvider>
                                        </DistributionProvider>
                                    </ActivityProvider>
                                </ParsingProvider>
                            </PropertyConfigProvider>
                        </FieldRulesProvider>
                    </ContactConfigProvider >
                </ThemeProvider>
            </UserProvider>
        </ErrorBoundary>
        </QueryClientProvider>
    );
}

export default App;
