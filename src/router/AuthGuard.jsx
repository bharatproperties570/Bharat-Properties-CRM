import React from 'react';
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserContext } from '../context/UserContext';
import MainLayout from '../layouts/MainLayout';
import LiveNotificationListener from '../components/LiveNotificationListener';
import CallModal from '../components/CallModal';
import CallResolutionModal from '../components/CallResolutionModal';
import { useCall } from '../context/CallContext';

const CallModalWrapper = () => {
    const { isCallModalOpen, activeContact, closeCall, endCall, callContext } = useCall();
    return (
        <CallModal
            isOpen={isCallModalOpen}
            onClose={closeCall}
            contact={activeContact}
            context={callContext}
            onCallEnd={endCall}
        />
    );
};

export const AuthGuard = () => {
    const { token } = useUserContext();
    const navigate = useNavigate();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    // Shim onNavigate for components that still expect it
    const handleNavigate = (view, contactId = null) => {
        let url = '/';
        if (view === 'contacts') url = '/contacts';
        else if (view === 'inventory') url = '/inventory';
        else if (view === 'marketing' || view === 'marketings' || view === 'marketing-overview') url = '/marketing';
        else if (view === 'contact-detail' && contactId) url = `/contacts/${contactId}`;
        else if (view === 'inventory-detail' && contactId) url = `/inventory/${contactId}`;
        else if (view === 'deal-detail' && contactId) url = `/deals/${contactId}`;
        else if (view === 'deal-matching') url = contactId ? `/deals/match/${contactId}` : '/deals/match';
        else if (view === 'lead-matching') url = contactId ? `/leads/match/${contactId}` : '/leads/match';
        else if (view === 'inventory-matching') url = contactId ? `/inventory-matching/${contactId}` : '/inventory';
        else if (view === 'project-master-plan' && contactId) url = `/projects/${contactId}/master-plan`;
        else if (view === 'project-detail' && contactId) url = `/projects/${contactId}`;
        else if (view === 'company-detail' && contactId) url = `/company/${contactId}`;
        else if (view === 'dashboard') url = '/';
        else if (view === 'sequence-builder' && contactId) url = `/marketing/sequences/${contactId}`;
        else url = view ? (view.startsWith('/') ? view : `/${view}`) : '/';
        
        navigate(url);
    };

    // Derive currentView for Sidebar highlights
    const currentView = location.pathname.split('/')[1] || 'dashboard';

    return (
        <>
            <LiveNotificationListener onNavigate={handleNavigate} />
            <MainLayout currentView={currentView} onNavigate={handleNavigate}>
                {(modalHandlers) => (
                    <Outlet context={{ 
                        onNavigate: handleNavigate,
                        ...modalHandlers,
                        onEditContact: modalHandlers?.onEditContact,
                        onEditCompany: modalHandlers?.onEditCompany,
                        onAddActivity: modalHandlers?.onAddActivity,
                        onAddDeal: modalHandlers?.onAddDeal,
                        onAddInventory: modalHandlers?.onAddInventory,
                        onAddProject: modalHandlers?.onAddProject,
                        onEditProject: modalHandlers?.onEditProject
                    }} />
                )}
            </MainLayout>
            <CallModalWrapper />
            <CallResolutionModal />
        </>
    );
};
