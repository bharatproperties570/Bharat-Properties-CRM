import { useState, useEffect, Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { isWeb, safeWindow, getPathname } from './utils/platform';
import { Toaster } from 'react-hot-toast';
import { View, Text, Platform } from 'react-native';
import { PropertyConfigProvider } from './context/PropertyConfigContext';
import { ContactConfigProvider } from './context/ContactConfigContext';
import { ThemeProvider } from './context/ThemeContext';

import { FieldRulesProvider } from './context/FieldRulesContext';
import { DistributionProvider } from './context/DistributionContext';
import { SequenceProvider } from './context/SequenceContext';
import { TriggersProvider } from './context/TriggersContext';
import { AutomatedActionsProvider } from './context/AutomatedActionsContext';
import { CallProvider, useCall } from './context/CallContext'; // Import CallProvider and hook
import { ParsingProvider } from './context/ParsingContext'; // Import ParsingProvider
import { UserProvider, useUserContext } from './context/UserContext';
import { ImportProvider } from './context/ImportContext';
import { TemplateProvider } from './context/TemplateContext';
import { WhatsAppTemplateProvider } from './context/WhatsAppTemplateContext';
import { WhatsAppAnimationProvider } from './context/WhatsAppAnimationContext';
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
import { RouterProvider } from 'react-router-dom';
import { router } from './router/routes';

const AppContent = () => {
    return <RouterProvider router={router} />;
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
                                <WhatsAppAnimationProvider>
                                    <ParsingProvider>
                                                                                    <DistributionProvider>
                                                <SequenceProvider>
                                                    <AutomatedActionsProvider>
                                                        <TriggersProvider>
                                                            <CallProvider>
                                                                <ImportProvider>
                                                                    <WhatsAppTemplateProvider>
                                                                    <TemplateProvider>
                                                                        {isWeb && <Toaster 
                                                                            position="top-right" 
                                                                            containerStyle={{ zIndex: 999999 }}
                                                                        />}
                                                                        <AppContent />
                                                                    </TemplateProvider>
                                                                    </WhatsAppTemplateProvider>
                                                                </ImportProvider>
                                                            </CallProvider>
                                                        </TriggersProvider>
                                                    </AutomatedActionsProvider>
                                                </SequenceProvider>
                                            </DistributionProvider>
                                                                            </ParsingProvider>
                                </WhatsAppAnimationProvider>
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
