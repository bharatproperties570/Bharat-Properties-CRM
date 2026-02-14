import React, { useState, useEffect } from 'react';
import { useActivities } from '../context/ActivityContext';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

// Modals
// Modals
import AddContactModal from '../components/AddContactModal';
import AddCompanyModal from '../components/AddCompanyModal';
import CreateActivityModal from '../components/CreateActivityModal';
import AddProjectModal from '../components/AddProjectModal';
import AddInventoryModal from '../components/AddInventoryModal';
import AddLeadModal from '../components/AddLeadModal';
import AddDealModal from '../components/AddDealModal';

const MainLayout = ({ children, currentView, onNavigate }) => {
    // Global Modal State
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showAddLeadModal, setShowAddLeadModal] = useState(false);
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
    const [showAddProjectModal, setShowAddProjectModal] = useState(false);
    const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
    const [showAddDealModal, setShowAddDealModal] = useState(false);
    const [editingInventory, setEditingInventory] = useState(null);
    const [dealContext, setDealContext] = useState(null);

    // Modal Data State
    const [modalEntityType, setModalEntityType] = useState('contact'); // 'contact' or 'lead'
    const [editingContact, setEditingContact] = useState(null);
    const [editingCompany, setEditingCompany] = useState(null);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [showActivityModal, setShowActivityModal] = useState(false);

    // Global Context
    const { addActivity } = useActivities();

    const handleSaveGlobalActivity = (activityData) => {
        // activityData is already restructured by CreateActivityModal
        addActivity(activityData);
        setShowActivityModal(false);
    };

    // Deep Linking for Project Modal
    useEffect(() => {
        const path = window.location.pathname;
        if (path === '/projects/new') {
            setShowAddProjectModal(true);
        }
    }, []);

    // Handle Project Modal URL state
    const handleAddProject = () => {
        setShowAddProjectModal(true);
        window.history.pushState({ view: currentView, modal: 'add-project' }, '', '/projects/new');
    };

    const handleCloseProjectModal = () => {
        setShowAddProjectModal(false);
        // If we are currently at /projects/new, go back. 
        // We check this to avoid going back if the user navigated elsewhere (edge case)
        if (window.location.pathname === '/projects/new') {
            window.history.back();
        }
    };

    // Listen for browser back/forward interactions for Modals (specifically Project)
    useEffect(() => {
        const handlePopState = (event) => {
            const path = window.location.pathname;
            if (path === '/projects/new') {
                setShowAddProjectModal(true);
            } else {
                // If we were showing it and now path changed, likely close it
                // But be careful not to conflict with App.jsx routing. 
                // App.jsx controls main VIEW. MainLayout controls MODALS.
                setShowAddProjectModal(false);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handlers exposed to children
    const modalHandlers = {
        onEditContact: (contact) => {
            setEditingContact(contact);
            setModalEntityType('contact');
            setShowAddContactModal(true);
        },
        onEditCompany: (company) => {
            setEditingCompany(company);
            setShowAddCompanyModal(true);
        },
        onAddActivity: (relatedTo, context) => {
            setActivityInitialData({
                relatedTo: relatedTo || [],
                ...context
            });
            setShowActivityModal(true);
        },
        onAddProject: handleAddProject,
        onAddInventory: (inventory) => {
            setEditingInventory(inventory || null);
            setShowAddInventoryModal(true);
        },
        onAddDeal: (dealData) => {
            setDealContext(dealData || null);
            setShowAddDealModal(true);
        }
    };

    return (
        <div className="app-container">
            <Sidebar currentView={currentView} onNavigate={onNavigate} />

            <main className="main-area">
                <Header
                    onNavigate={onNavigate}
                    onAddContact={() => {
                        setModalEntityType('contact');
                        setEditingContact(null);
                        setShowAddContactModal(true);
                    }}
                    onAddLead={() => {
                        setModalEntityType('lead');
                        setShowAddLeadModal(true);
                    }}
                    onAddCompany={() => {
                        setEditingCompany(null);
                        setShowAddCompanyModal(true);
                    }}
                    onAddActivity={() => {
                        setActivityInitialData({ relatedTo: [] });
                        setShowActivityModal(true);
                    }}
                    onAddDeal={() => setShowAddDealModal(true)}
                    onAddProject={handleAddProject}
                    onAddInventory={() => setShowAddInventoryModal(true)}
                />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    {/* Render Children with injected props if children is a function, otherwise regular render */}
                    {typeof children === 'function' ? children(modalHandlers) : children}
                </div>

                {/* Modals Rendered at Root of Layout */}
                <AddContactModal
                    isOpen={showAddContactModal}
                    onClose={() => setShowAddContactModal(false)}
                    initialData={editingContact}
                    entityType={modalEntityType}
                    onAdd={() => setShowAddContactModal(false)}
                />

                <AddLeadModal
                    isOpen={showAddLeadModal}
                    onClose={() => setShowAddLeadModal(false)}
                    onAdd={() => setShowAddLeadModal(false)}
                />

                <AddCompanyModal
                    isOpen={showAddCompanyModal}
                    onClose={() => setShowAddCompanyModal(false)}
                    initialData={editingCompany}
                    onAdd={() => setShowAddCompanyModal(false)}
                />

                <CreateActivityModal
                    isOpen={showActivityModal}
                    onClose={() => setShowActivityModal(false)}
                    initialData={activityInitialData}
                    onSave={handleSaveGlobalActivity}
                />

                <AddProjectModal
                    isOpen={showAddProjectModal}
                    onClose={handleCloseProjectModal}
                    onSave={handleCloseProjectModal}
                />

                <AddInventoryModal
                    isOpen={showAddInventoryModal}
                    onClose={() => {
                        setShowAddInventoryModal(false);
                        setEditingInventory(null);
                    }}
                    property={editingInventory}
                    onSave={() => {
                        setShowAddInventoryModal(false);
                        setEditingInventory(null);
                        // Trigger global refresh for inventory list
                        window.dispatchEvent(new Event('inventory-updated'));
                    }}
                />

                <AddDealModal
                    isOpen={showAddDealModal}
                    onClose={() => {
                        setShowAddDealModal(false);
                        setDealContext(null);
                    }}
                    deal={dealContext}
                    onSave={() => {
                        setShowAddDealModal(false);
                        setDealContext(null);
                        // Trigger global refresh for deals list
                        window.dispatchEvent(new Event('deal-updated'));
                    }}
                />
            </main>
        </div>
    );
};

export default MainLayout;
