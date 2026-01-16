import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
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

function App() {
    const [currentView, setCurrentView] = useState('dashboard'); // leads | contacts | marketing | wizard | dashboard

    const renderView = () => {
        switch (currentView) {
            case 'contacts':
                return <ContactsView />;
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
                <Header />
                {renderView()}
            </main>
        </div>
    );
}

export default App;
