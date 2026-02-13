import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import AppRouter from './router/AppRouter';
import MainLayout from './layouts/MainLayout';
import { PropertyConfigProvider } from './context/PropertyConfigContext';
import { ContactConfigProvider } from './context/ContactConfigContext';

import { ActivityProvider } from './context/ActivityContext';
import { FieldRulesProvider } from './context/FieldRulesContext';
import { DistributionProvider } from './context/DistributionContext';
import { SequenceProvider } from './context/SequenceContext';
import { TriggersProvider } from './context/TriggersContext';
import { AutomatedActionsProvider } from './context/AutomatedActionsContext';
import { CallProvider, useCall } from './context/CallContext'; // Import CallProvider and hook
import { ParsingProvider } from './context/ParsingContext'; // Import ParsingProvider
import { UserProvider } from './context/UserContext';
import CallModal from './components/CallModal'; // Import CallModal
import ErrorBoundary from './components/ErrorBoundary';

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

function App() {
    // Global Navigation State (Routing Logic Only)
    const [currentView, setCurrentView] = useState(() => {
        const path = window.location.pathname;
        if (path.startsWith('/contacts/')) return 'contact-detail';
        if (path.startsWith('/inventory/')) return 'inventory-detail';
        if (path === '/contacts') return 'contacts';
        if (path === '/inventory') return 'inventory';
        if (path === '/leads') return 'leads';
        if (path.startsWith('/deals/')) {
            const possibleId = path.split('/').pop();
            if (possibleId !== 'deals' && possibleId !== 'match') return 'deal-detail';
        }
        if (path === '/deals') return 'deals';
        if (path === '/activities') return 'activities';
        if (path === '/projects') return 'projects';
        if (path.startsWith('/projects/')) return 'project-detail';
        if (path === '/account') return 'account';
        if (path === '/deal-intake') return 'deal-intake';
        if (path.startsWith('/deals/match/')) return 'deal-matching';
        if (path.startsWith('/leads/match/')) return 'lead-matching';
        return 'dashboard';
    });

    const [currentContactId, setCurrentContactId] = useState(() => {
        const path = window.location.pathname;
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
        return null;
    });

    // Custom Navigation Handler
    const handleNavigate = (view, contactId = null) => {
        setCurrentView(view);
        setCurrentContactId(contactId);

        let url = '/';
        if (view === 'contacts') url = '/contacts';
        else if (view === 'inventory') url = '/inventory';
        else if (view === 'contact-detail' && contactId) url = `/contacts/${contactId}`;
        else if (view === 'inventory-detail' && contactId) url = `/inventory/${contactId}`;
        else if (view === 'deal-detail' && contactId) url = `/deals/${contactId}`;
        else if (view === 'deal-matching' && contactId) url = `/deals/match/${contactId}`;
        else if (view === 'lead-matching' && contactId) url = `/leads/match/${contactId}`;
        else if (view === 'project-detail' && contactId) url = `/projects/${contactId}`;
        else if (view === 'dashboard') url = '/';
        else url = `/${view}`;

        window.history.pushState({ view, contactId }, '', url);
    };

    // Handle session popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = (event) => {
            const state = event.state;
            const path = window.location.pathname;

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
                } else {
                    setCurrentView('dashboard');
                }
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    return (
        <ErrorBoundary>
            <ContactConfigProvider>
                <FieldRulesProvider>
                    <PropertyConfigProvider>
                        <ParsingProvider>
                            <ActivityProvider>
                                <DistributionProvider>
                                    <SequenceProvider>
                                        <AutomatedActionsProvider>
                                            <TriggersProvider>
                                                <UserProvider>
                                                    <CallProvider>
                                                        <Toaster position="top-right" />
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
                                                    </CallProvider>
                                                </UserProvider>
                                            </TriggersProvider>
                                        </AutomatedActionsProvider>
                                    </SequenceProvider>
                                </DistributionProvider>
                            </ActivityProvider>
                        </ParsingProvider>
                    </PropertyConfigProvider>
                </FieldRulesProvider>
            </ContactConfigProvider >
        </ErrorBoundary>
    );
}

export default App;
