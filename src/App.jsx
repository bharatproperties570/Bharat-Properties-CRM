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

function App() {
    // Global Navigation State (Routing Logic Only)
    const [currentView, setCurrentView] = useState(() => {
        const path = window.location.pathname;
        if (path.startsWith('/contacts/')) return 'contact-detail';
        if (path === '/contacts') return 'contacts';
        if (path === '/leads') return 'leads';
        if (path === '/deals') return 'deals';
        if (path === '/activities') return 'activities';
        if (path === '/projects') return 'projects';
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
            const path = window.location.pathname;

            if (state) {
                setCurrentView(state.view);
                setCurrentContactId(state.contactId);
            } else {
                // Fallback for direct browser nav or initial load via history
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

    return (
        <ContactConfigProvider>
            <FieldRulesProvider>
                <PropertyConfigProvider>
                    <ActivityProvider>
                        <DistributionProvider>
                            <SequenceProvider>
                                <TriggersProvider>
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
                                </TriggersProvider>
                            </SequenceProvider>
                        </DistributionProvider>
                    </ActivityProvider>
                </PropertyConfigProvider>
            </FieldRulesProvider>
        </ContactConfigProvider>
    );
}

export default App;

