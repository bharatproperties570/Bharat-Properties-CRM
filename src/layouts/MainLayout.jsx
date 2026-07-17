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
                    <>
                        <style>{`
                            @keyframes flyIcon {
                                0% { transform: translateY(-50%) rotate(-5deg); }
                                50% { transform: translateY(-50%) rotate(5deg) scale(1.1); }
                                100% { transform: translateY(-50%) rotate(-5deg); }
                            }
                            @keyframes pulseTrack {
                                0% { opacity: 0.8; box-shadow: 0 0 5px rgba(59,130,246,0.5); }
                                50% { opacity: 1; box-shadow: 0 0 15px rgba(59,130,246,0.8); }
                                100% { opacity: 0.8; box-shadow: 0 0 5px rgba(59,130,246,0.5); }
                            }
                            .futuristic-widget {
                                background: var(--bg-card, #ffffff);
                                backdrop-filter: blur(12px);
                                border: 1px solid var(--border-color, #e2e8f0);
                                border-radius: 16px;
                                padding: 20px;
                                color: var(--text-main, #1e293b);
                                box-shadow: 0 10px 30px rgba(0,0,0,0.08);
                                overflow: hidden;
                                position: relative;
                                transition: all 0.3s ease;
                            }
                            .futuristic-widget::before {
                                content: '';
                                position: absolute;
                                inset: 0;
                                background: linear-gradient(90deg, transparent, rgba(59,130,246,0.03) 1px, transparent 1px),
                                            linear-gradient(180deg, transparent, rgba(59,130,246,0.03) 1px, transparent 1px);
                                background-size: 10px 10px;
                                pointer-events: none;
                            }
                        `}</style>
                        <div style={{
                            position: 'fixed',
                            bottom: '24px',
                            right: '24px',
                            width: '360px',
                            zIndex: 9999,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                        }}>
                            {activeImports.map(imp => {
                                const getModuleIcon = (mod) => {
                                    if(mod === 'propertyOwners' || mod === 'contacts') return 'fa-user-tie';
                                    if(mod === 'inventory') return 'fa-building';
                                    if(mod === 'leads') return 'fa-bolt';
                                    if(mod === 'sizes') return 'fa-ruler-combined';
                                    return 'fa-file-csv';
                                };
                                const modIcon = getModuleIcon(imp.module || imp.moduleLabel?.toLowerCase());

                                return (
                                <div key={imp.id} className="futuristic-widget" style={{
                                    borderLeft: `4px solid ${imp.status === 'completed' ? '#10b981' : imp.status === 'error' ? '#ef4444' : '#3b82f6'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {imp.status === 'running' ? (
                                                <div style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className={`fas ${modIcon} fa-bounce`} style={{ fontSize: '0.9rem' }}></i>
                                                </div>
                                            ) : imp.status === 'completed' ? (
                                                <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-check" style={{ fontSize: '0.9rem' }}></i>
                                                </div>
                                            ) : (
                                                <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-exclamation-triangle" style={{ fontSize: '0.9rem' }}></i>
                                                </div>
                                            )}
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {imp.moduleLabel} INGESTION
                                            </h4>
                                        </div>
                                        <button 
                                            onClick={() => clearImport(imp.id)}
                                            style={{ background: 'var(--bg-light, #f1f5f9)', border: 'none', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-light, #f1f5f9)'; e.currentTarget.style.color = 'var(--text-muted, #94a3b8)'; }}
                                        >
                                            <i className="fas fa-times" style={{ fontSize: '0.8rem' }}></i>
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
                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontWeight: 700, marginBottom: '8px' }}>
                                                    <span>PROCESSED: {imp.processedRecords} / {imp.totalRecords}</span>
                                                    <span style={{ color: '#3b82f6' }}>{imp.progress}%</span>
                                                </div>
                                                
                                                {/* Animated Entity Progress Track */}
                                                <div style={{ position: 'relative', height: '36px', marginBottom: '8px' }}>
                                                    {/* The Track Line */}
                                                    <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, height: '6px', background: 'var(--bg-light, #e2e8f0)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ 
                                                            height: '100%', width: `${imp.progress}%`, 
                                                            background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                                                            transition: 'width 0.3s ease',
                                                            animation: 'pulseTrack 2s infinite'
                                                        }}></div>
                                                    </div>
                                                    
                                                    {/* The moving entity icon */}
                                                    <div style={{ 
                                                        position: 'absolute', 
                                                        top: '50%', 
                                                        left: `calc(${imp.progress}% - 14px)`, 
                                                        transform: 'translateY(-50%)',
                                                        width: '28px', 
                                                        height: '28px', 
                                                        background: '#fff', 
                                                        border: '2px solid #3b82f6', 
                                                        borderRadius: '50%', 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        color: '#3b82f6',
                                                        boxShadow: '0 0 10px rgba(59,130,246,0.3)',
                                                        transition: 'left 0.3s ease',
                                                        zIndex: 2,
                                                        animation: 'flyIcon 1s infinite ease-in-out'
                                                    }}>
                                                        <i className={`fas ${modIcon}`} style={{ fontSize: '0.75rem' }}></i>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.5px' }}>
                                                    <span><i className="fas fa-clock fa-spin" style={{ marginRight: '6px', animationDuration: '4s' }}></i> ETA: {etaText.toUpperCase()}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    
                                    {imp.status === 'completed' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', zIndex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ padding: '6px 10px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                    <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i> {imp.stats?.success || 0} Synced
                                                </div>
                                                {imp.stats?.failed > 0 && (
                                                    <div style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                                                        <i className="fas fa-exclamation-circle" style={{ marginRight: '4px' }}></i> {imp.stats.failed} Errors
                                                    </div>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => clearImport(imp.id)}
                                                style={{ 
                                                    width: '100%', padding: '10px', 
                                                    background: 'linear-gradient(135deg, #3b82f6, #4f46e5)', 
                                                    color: '#fff', border: 'none', borderRadius: '8px', 
                                                    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                                                    boxShadow: '0 4px 10px rgba(59,130,246,0.3)',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 15px rgba(59,130,246,0.4)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(59,130,246,0.3)'; }}
                                            >
                                                <i className="fas fa-chart-bar"></i> View Full Report
                                            </button>
                                        </div>
                                    )}
                                    
                                    {imp.status === 'error' && (
                                        <div style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 700, position: 'relative', zIndex: 1 }}>
                                            <i className="fas fa-times-circle" style={{ marginRight: '6px' }}></i> Process Terminated
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default MainLayout;
