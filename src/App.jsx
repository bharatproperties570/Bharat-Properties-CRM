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

function App() {
    const [currentView, setCurrentView] = useState('leads'); // leads | contacts | marketing | wizard

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
            default:
                return <LeadsView />;
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
