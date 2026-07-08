import { useState, useEffect } from 'react';
import { useActivities } from '../context/ActivityContext';
import { useImport } from '../context/ImportContext';
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
import AddQuoteModal from '../components/AddQuoteModal';
import AddOfferModal from '../components/AddOfferModal';
import ClosingFormModal from '../components/ClosingFormModal';
import AddBookingModal from '../components/AddBookingModal';
import { REQUIRED_FORM_TYPES } from '../utils/FormTriggerService';
import { leadsAPI, dealsAPI } from '../utils/api';

const MainLayout = ({ children, currentView, onNavigate }) => {
    // Global Modal State
    const [showAddContactModal, setShowAddContactModal] = useState(false);
    const [showAddLeadModal, setShowAddLeadModal] = useState(false);
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
    const [showAddProjectModal, setShowAddProjectModal] = useState(false);
    const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
    const [showAddDealModal, setShowAddDealModal] = useState(false);
    const [showAddBookingModal, setShowAddBookingModal] = useState(false);
    const [editingInventory, setEditingInventory] = useState(null);
    const [editingProject, setEditingProject] = useState(null);
    const [dealContext, setDealContext] = useState(null);

    // Modal Data State
    const [modalEntityType, setModalEntityType] = useState('contact'); // 'contact' or 'lead'
    const [editingContact, setEditingContact] = useState(null);
    const [editingCompany, setEditingCompany] = useState(null);
    const [activityInitialData, setActivityInitialData] = useState(null);
    const [showActivityModal, setShowActivityModal] = useState(false);

    // Dynamic Form Triggering States
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [showOfferModal, setShowOfferModal] = useState(false);
    const [showClosingModal, setShowClosingModal] = useState(false);
    const [activeEntity, setActiveEntity] = useState(null);
    const [initialTab, setInitialTab] = useState(null);
    const [editingLead, setEditingLead] = useState(null);

    // Global Context
    const { addActivity } = useActivities();
    const { activeImports, clearImport } = useImport();

    const handleSaveGlobalActivity = (activityData) => {
        // activityData is already restructured by CreateActivityModal
        addActivity(activityData);
        setShowActivityModal(false);
    };

    // Deep Linking for Project Modal
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location) {
            const path = window.location.pathname;
            if (path === '/projects/new') {
                setShowAddProjectModal(true);
            }
        }
    }, []);

    // Handle Project Modal URL state
    const handleAddProject = () => {
        setEditingProject(null);
        setShowAddProjectModal(true);
        if (typeof window !== 'undefined' && window.history) {
            window.history.pushState({ view: currentView, modal: 'add-project' }, '', '/projects/new');
        }
    };

    const handleCloseProjectModal = () => {
        setShowAddProjectModal(false);
        setEditingProject(null);
        // If we are currently at /projects/new, go back. 
        // We check this to avoid going back if the user navigated elsewhere (edge case)
        if (typeof window !== 'undefined' && window.location && window.location.pathname === '/projects/new') {
            if (window.history) window.history.back();
        }
    };

    // Listen for browser back/forward interactions for Modals (specifically Project)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handlePopState = () => {
            if (!window.location) return;
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

    // --- GLOBAL FORM TRIGGERING LISTENER ---
    useEffect(() => {
        const handleTriggerForm = async (event) => {
            const { formType, entityId, type: entityTypeContext } = event.detail;
            console.log(`[MainLayout] Global Trigger: ${formType} for ${entityId}`);

            setActiveEntity({ id: entityId, type: entityTypeContext });

            switch (formType) {
                case REQUIRED_FORM_TYPES.REQUIREMENT:
                    setInitialTab('requirement');
                    try {
                        const res = await leadsAPI.getById(entityId);
                        if (res.success || res.status === 'success') {
                            setEditingLead(res.record || res.data);
                            setShowAddLeadModal(true);
                        }
                    } catch (err) {
                        console.error("Failed to fetch lead for requirement form", err);
                        setShowAddLeadModal(true); // Fallback to add mode or empty
                    }
                    break;
                case REQUIRED_FORM_TYPES.MEETING:
                    setActivityInitialData({
                        relatedTo: [{ id: entityId, type: entityTypeContext === 'lead' ? 'Lead' : 'Contact' }],
                        activityType: 'Meeting'
                    });
                    setShowActivityModal(true);
                    break;
                case REQUIRED_FORM_TYPES.SITE_VISIT:
                    setActivityInitialData({
                        relatedTo: [{ id: entityId, type: entityTypeContext === 'lead' ? 'Lead' : 'Contact' }],
                        activityType: 'Site Visit'
                    });
                    setShowActivityModal(true);
                    break;
                case REQUIRED_FORM_TYPES.QUOTATION:
                    try {
                        const res = await dealsAPI.getById(entityId);
                        if (res.success || res.status === 'success') {
                            setActiveEntity(res.record || res.data);
                            setShowQuoteModal(true);
                        }
                    } catch (err) {
                        console.error("Failed to fetch deal for quote form", err);
                    }
                    break;
                case REQUIRED_FORM_TYPES.OFFER:
                    try {
                        const res = await dealsAPI.getById(entityId);
                        if (res.success || res.status === 'success') {
                            const dealData = res.record || res.data;
                            setActiveEntity(dealData);
                            setShowOfferModal(true);
                        }
                    } catch (err) {
                        console.error("Failed to fetch deal for offer form", err);
                    }
                    break;
                case REQUIRED_FORM_TYPES.FEEDBACK:
                    setShowClosingModal(true);
                    break;
                default:
                    console.warn(`[MainLayout] Unhandled form type: ${formType}`);
            }
        };

        window.addEventListener('trigger-form', handleTriggerForm);
        return () => window.removeEventListener('trigger-form', handleTriggerForm);
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
        onEditProject: (project) => {
            setEditingProject(project);
            setShowAddProjectModal(true);
        },
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
                    onAddBooking={() => setShowAddBookingModal(true)}
                />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    {/* Render Children with injected props if children is a function, otherwise regular render */}
                    {typeof children === 'function' ? children(modalHandlers) : children}
                </div>

                {/* Modals Rendered at Root of Layout */}
                <AddContactModal
                    isOpen={showAddContactModal}
                    onClose={() => {
                        setShowAddContactModal(false);
                        setEditingContact(null);
                    }}
                    initialData={editingContact}
                    mode={editingContact ? "edit" : "add"}
                    entityType={modalEntityType}
                    onAdd={() => {
                        setShowAddContactModal(false);
                        setEditingContact(null);
                    }}
                    onEdit={() => {
                        setShowAddContactModal(false);
                        setEditingContact(null);
                    }}
                />

                <AddLeadModal
                    isOpen={showAddLeadModal}
                    onClose={() => {
                        setShowAddLeadModal(false);
                        setEditingLead(null);
                        setInitialTab(null);
                    }}
                    onAdd={() => setShowAddLeadModal(false)}
                    initialData={editingLead}
                    initialTab={initialTab}
                    mode={editingLead ? "edit" : "add"}
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
                    onSave={() => {
                        handleCloseProjectModal();
                        // Trigger global refresh
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new Event('project-updated'));
                        }
                    }}
                    projectToEdit={editingProject}
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
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new Event('inventory-updated'));
                        }
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
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new Event('deal-updated'));
                        }
                    }}
                />

                {showAddBookingModal && (
                    <AddBookingModal
                        isOpen={showAddBookingModal}
                        onClose={() => setShowAddBookingModal(false)}
                        onSave={() => {
                            setShowAddBookingModal(false);
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new Event('booking-updated'));
                            }
                        }}
                    />
                )}

                {/* Additional Dynamic Modals */}
                {showQuoteModal && (
                    <AddQuoteModal
                        isOpen={showQuoteModal}
                        onClose={() => setShowQuoteModal(false)}
                        deal={activeEntity}
                        onSave={() => {
                            setShowQuoteModal(false);
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new Event('deal-updated'));
                            }
                        }}
                    />
                )}

                {showOfferModal && (
                    <AddOfferModal
                        isOpen={showOfferModal}
                        onClose={() => setShowOfferModal(false)}
                        leads={activeEntity?.matchedLeads || []}
                        onSave={() => {
                            setShowOfferModal(false);
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new Event('deal-updated'));
                            }
                        }}
                    />
                )}

                {showClosingModal && (
                    <ClosingFormModal
                        isOpen={showClosingModal}
                        onClose={() => setShowClosingModal(false)}
                        entity={activeEntity}
                        entityType={activeEntity?.type === 'lead' ? 'Lead' : 'Deal'}
                        onComplete={() => {
                            setShowClosingModal(false);
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new Event('inventory-updated'));
                            }
                        }}
                    />
                )}
                {/* Background Import Tracking Widget */}
                {activeImports.length > 0 && (
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        width: '320px',
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        {activeImports.map(imp => (
                            <div key={imp.id} style={{
                                background: '#fff',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                borderLeft: `4px solid ${imp.status === 'completed' ? '#16a34a' : imp.status === 'error' ? '#dc2626' : '#3b82f6'}`,
                                position: 'relative'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                                        {imp.moduleLabel} Import
                                    </h4>
                                    <button 
                                        onClick={() => clearImport(imp.id)}
                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                                
                                {imp.status === 'running' && (() => {
                                    const elapsed = Date.now() - (imp.startTime || Date.now());
                                    let etaText = 'Calculating...';
                                    if (imp.progress > 0 && imp.progress < 100) {
                                        const totalEstimatedTime = (elapsed / imp.progress) * 100;
                                        const remainingTime = totalEstimatedTime - elapsed;
                                        const remainingSecs = Math.max(0, Math.ceil(remainingTime / 1000));
                                        if (remainingSecs > 60) {
                                            etaText = `${Math.ceil(remainingSecs / 60)} min remaining`;
                                        } else {
                                            etaText = `${remainingSecs} sec remaining`;
                                        }
                                    }

                                    return (
                                        <>
                                            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                                                <div style={{ height: '100%', width: `${imp.progress}%`, background: '#3b82f6', transition: 'width 0.3s' }}></div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                                <span>{imp.processedRecords} / {imp.totalRecords}</span>
                                                <span style={{ color: '#3b82f6' }}>{imp.progress}%</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                <span><i className="fas fa-clock"></i> {etaText}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                                
                                {imp.status === 'completed' && (
                                    <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-check-circle"></i> Completed ({imp.stats?.success || 0} added/updated
                                        {imp.stats?.failed > 0 && (
                                            <span style={{ color: '#dc2626' }}>, {imp.stats.failed} failed</span>
                                        )})
                                    </div>
                                )}

                                {imp.status === 'error' && (
                                    <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fas fa-exclamation-circle"></i> Failed to complete
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default MainLayout;
