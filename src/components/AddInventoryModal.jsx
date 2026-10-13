import { useState, useEffect } from 'react';
import { useTeams, useActiveUsers, useProjects } from '../utils/crmHooks';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { useTriggers } from '../context/TriggersContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import { useTheme } from '../context/ThemeContext';
import AddSizeModal from './modals/AddSizeModal';

// Modular Sections
import InventoryUnitSection from './inventory/InventoryUnitSection';
import InventoryLocationSection from './inventory/InventoryLocationSection';
import InventoryOwnerSection from './inventory/InventoryOwnerSection';

// Custom Hook
import { useInventoryForm } from '../hooks/useInventoryForm';

const AddInventoryModal = ({ isOpen, onClose, onSave, initialProject = null, property = null, initialTab = 'Unit' }) => {
    const { isDark } = useTheme();
    const {
        masterFields = {},
        propertyConfig,
        sizes,
        getLookupId,
        getLookupValue
    } = usePropertyConfig();
    const { data: users = [] } = useActiveUsers();
    
    // Canonical Project State
    const { data: projectQueryData } = useProjects({ limit: 1000 });
    const allProjects = projectQueryData?.data || [];
    
    const { data: teams = [] } = useTeams();
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const { evaluateAndEnroll } = useSequences();

    const [activeTab, setActiveTab] = useState(initialTab);

    useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isAddSizeModalOpen, setIsAddSizeModalOpen] = useState(false);

    const {
        formData, setFormData,
        isSaving,
        duplicateWarning,
        isBlocked,
        isCheckingDuplicate,
        ownerSearch, setOwnerSearch,
        searchResults,
        showOwnerResults, setShowOwnerResults,
        selectedContactToLink, setSelectedContactToLink,
        linkData, setLinkData,
        disabledAddressFields,
        currentFurnishedItem, setCurrentFurnishedItem,
        mapRef, searchInputRef,
        handleProjectChange,
        handleLinkOwner,
        handleSave,
        handleInputChange,
        handleAddBuiltupRow,
        handleRemoveBuiltupRow,
        updateBuiltupRow,
        handleAddLandRow,
        handleRemoveLandRow,
        updateLandRow,
        handleFurnishedItemKeyDown,
        removeFurnishedItem,
        clearPolygon,
        activateDrawing,
        finishDrawing,
        drawingPointsCount,
        autoDetectLandmarks,
        isDetectingLandmarks
    } = useInventoryForm(
        isOpen,
        initialProject,
        property,
        allProjects,
        sizes,
        getLookupId,
        getLookupValue,
        executeDistribution,
        fireEvent,
        evaluateAndEnroll,
        validateAsync,
        onClose,
        onSave,
        activeTab
    );

    useEffect(() => {
        if (!isOpen) return;
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setTimeout(() => setIsLoading(false), 50);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
            setActiveTab('Unit');
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    // Enterprise Broadcast Design Styles
    const labelStyle = {
        fontSize: '0.71rem', fontWeight: 800,
        color: isDark ? '#94a3b8' : '#64748b',
        marginBottom: '6px', display: 'block',
        textTransform: 'uppercase', letterSpacing: '0.45px'
    };
    const inputStyle = {
        width: '100%', padding: '9px 12px', borderRadius: '10px',
        border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #e2e8f0',
        fontSize: '0.84rem', fontWeight: 500, outline: 'none',
        color: isDark ? '#f1f5f9' : '#1e293b', transition: 'all 0.15s ease',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff',
        height: '40px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        backgroundSize: '10px', paddingRight: '32px', cursor: 'pointer'
    };
    const customSelectStyleDisabled = {
        ...customSelectStyle,
        background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
        cursor: 'not-allowed', color: isDark ? '#64748b' : '#94a3b8',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
        backgroundImage: 'none'
    };
    const sectionStyle = {
        background: isDark ? '#1e293b' : '#ffffff',
        padding: '20px 24px', borderRadius: '16px',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
        marginBottom: '20px'
    };
    const buttonStyle = {
        cancel: {
            padding: '9px 20px', borderRadius: '10px',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
            background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
            color: isDark ? '#cbd5e1' : '#475569',
            fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s'
        },
        secondary: {
            padding: '9px 20px', borderRadius: '10px',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1.5px solid #e2e8f0',
            background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
            color: isDark ? '#cbd5e1' : '#475569',
            fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: '6px'
        },
        primary: {
            padding: '9px 22px', borderRadius: '10px', border: 'none',
            background: isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe',
            color: isDark ? '#38bdf8' : '#0284c7',
            fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: '6px'
        },
        success: {
            padding: '9px 24px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#fff', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer',
            transition: 'all 0.15s', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
            display: 'flex', alignItems: 'center', gap: '6px'
        }
    };

    const TABS = [
        { id: 'Unit', label: 'Unit Specifications', icon: 'fas fa-home', color: '#0284c7' },
        { id: 'Location', label: 'Location & Map', icon: 'fas fa-map-marker-alt', color: '#10b981' },
        { id: 'Owner', label: 'Owner & Linkage', icon: 'fas fa-user-tag', color: '#8b5cf6' }
    ];

    const handleNext = () => {
        const idx = TABS.findIndex(t => t.id === activeTab);
        if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
    };
    const handlePrev = () => {
        const idx = TABS.findIndex(t => t.id === activeTab);
        if (idx > 0) setActiveTab(TABS[idx - 1].id);
    };

    const currentCategoryConfig = propertyConfig[formData.category] || {};
    const subCategories = (currentCategoryConfig.subCategories || []).map(sc => sc.name);
    const builtUpTypes = (() => {
        if (!formData.subCategory) return [];
        const subCatConfig = (currentCategoryConfig.subCategories || []).find(sc => sc.name === formData.subCategory);
        if (!subCatConfig) return [];
        
        const allBuiltUpTypes = new Set();
        
        // Built-up Types are dependent on the selected Sub Category
        (subCatConfig.builtupTypes || []).forEach(bt => {
            if (typeof bt === 'object' && bt !== null) {
                allBuiltUpTypes.add(JSON.stringify({ _id: bt._id || bt.id, name: bt.name }));
            } else {
                allBuiltUpTypes.add(JSON.stringify({ name: bt }));
            }
        });
        
        return Array.from(allBuiltUpTypes).map(s => JSON.parse(s));
    })();
    const filteredOwners = searchResults.filter(c => !formData.owners.some(o => o.mobile === c.mobile));

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)', padding: '16px' }} onClick={onClose}>
            <div style={{
                background: isDark ? '#0f172a' : '#ffffff',
                width: '96%', maxWidth: '1160px', height: '90vh', maxHeight: '90vh',
                borderRadius: '18px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0'
            }} onClick={e => e.stopPropagation()} className="animate-slideIn">

                {/* Header */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)', color: '#fff',
                            flexShrink: 0
                        }}>
                            <i className="fas fa-boxes-stacked" style={{ fontSize: '18px' }}></i>
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                                    {property ? 'Update Inventory' : 'Add New Inventory'}
                                </h2>
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                                    background: property ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7') : (isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe'),
                                    color: property ? '#f59e0b' : '#0284c7',
                                    border: property ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(2, 132, 199, 0.3)'
                                }}>
                                    {property ? 'EDIT MODE' : 'NEW RECORD'}
                                </span>
                                {(formData.projectName || formData.unitNo) && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 700,
                                        color: isDark ? '#38bdf8' : '#0284c7',
                                        background: isDark ? 'rgba(2, 132, 199, 0.15)' : '#e0f2fe',
                                        padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd'
                                    }}>
                                        {[formData.projectName, formData.unitNo ? `Unit #${formData.unitNo}` : ''].filter(Boolean).join(' • ')}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginTop: '3px' }}>
                                <i className="far fa-clock" style={{ color: '#0284c7', fontSize: '11px' }}></i>
                                <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                <span style={{ opacity: 0.4 }}>•</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </span>
                                <span style={{ opacity: 0.3 }}>•</span>
                                <span>Real Estate Inventory Asset</span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                            color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease', fontSize: '14px'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b'; }}
                        title="Close"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Tab Navigation Bar - Enterprise Pill Design */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 24px',
                    background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                    borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #e2e8f0',
                    overflowX: 'auto', flexShrink: 0
                }} className="no-scrollbar">
                    {TABS.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                                    borderRadius: '10px', border: 'none',
                                    background: active ? (isDark ? 'rgba(2, 132, 199, 0.2)' : '#ffffff') : 'transparent',
                                    color: active ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#94a3b8' : '#64748b'),
                                    boxShadow: active ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                                    fontWeight: active ? 800 : 600, fontSize: '0.82rem', cursor: 'pointer',
                                    whiteSpace: 'nowrap', transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={tab.icon} style={{ color: active ? tab.color : 'inherit', fontSize: '13px' }}></i>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="no-scrollbar" style={{
                    flex: 1, overflowY: 'auto',
                    background: isDark ? '#0b1329' : '#f8fafc',
                    padding: '24px', scrollbarWidth: 'none', msOverflowStyle: 'none'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ height: '120px', background: isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            {activeTab === 'Unit' && (
                                <InventoryUnitSection 
                                    formData={formData} setFormData={setFormData} allProjects={allProjects} masterFields={masterFields} subCategories={subCategories} builtUpTypes={builtUpTypes} sizes={sizes} duplicateWarning={duplicateWarning} isCheckingDuplicate={isCheckingDuplicate} isBlocked={isBlocked} handleProjectChange={handleProjectChange} updateBuiltupRow={updateBuiltupRow} handleAddBuiltupRow={handleAddBuiltupRow} handleRemoveBuiltupRow={handleRemoveBuiltupRow} handleAddLandRow={handleAddLandRow} handleRemoveLandRow={handleRemoveLandRow} updateLandRow={updateLandRow} currentFurnishedItem={currentFurnishedItem} setCurrentFurnishedItem={setCurrentFurnishedItem} handleFurnishedItemKeyDown={handleFurnishedItemKeyDown} removeFurnishedItem={removeFurnishedItem} setIsAddSizeModalOpen={setIsAddSizeModalOpen} customSelectStyle={customSelectStyle} customSelectStyleDisabled={customSelectStyleDisabled} inputStyle={inputStyle} labelStyle={labelStyle} sectionStyle={sectionStyle}
                                />
                            )}
                            {activeTab === 'Location' && (
                                <InventoryLocationSection 
                                    formData={formData} setFormData={setFormData} mapRef={mapRef} searchInputRef={searchInputRef} disabledAddressFields={disabledAddressFields} inputStyle={inputStyle} sectionStyle={sectionStyle} clearPolygon={clearPolygon} activateDrawing={activateDrawing} finishDrawing={finishDrawing} drawingPointsCount={drawingPointsCount} autoDetectLandmarks={autoDetectLandmarks} isDetectingLandmarks={isDetectingLandmarks}
                                />

                            )}
                            {activeTab === 'Owner' && (
                                <InventoryOwnerSection 
                                    formData={formData} setFormData={setFormData} ownerSearch={ownerSearch} setOwnerSearch={setOwnerSearch} showOwnerResults={showOwnerResults} setShowOwnerResults={setShowOwnerResults} filteredOwners={filteredOwners} selectedContactToLink={selectedContactToLink} setSelectedContactToLink={setSelectedContactToLink} linkData={linkData} setLinkData={setLinkData} handleLinkOwner={handleLinkOwner} teams={teams} users={users} handleInputChange={handleInputChange} inputStyle={inputStyle} labelStyle={labelStyle} customSelectStyle={customSelectStyle} buttonStyle={buttonStyle} sectionStyle={sectionStyle}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer fixed at bottom */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                    background: isDark ? '#0f172a' : '#ffffff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {(formData.projectName || formData.unitNo) && (
                            <span style={{ fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: '6px' }}></i>
                                {formData.projectName} {formData.unitNo ? `• Unit #${formData.unitNo}` : ''} {formData.size ? `(${formData.size})` : ''}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button type="button" onClick={onClose} style={buttonStyle.cancel}>Cancel</button>

                        {activeTab !== 'Unit' && (
                            <button type="button" onClick={handlePrev} style={buttonStyle.secondary}>
                                <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i>
                                Previous
                            </button>
                        )}

                        {activeTab !== 'Owner' ? (
                            <button type="button" onClick={handleNext} style={buttonStyle.primary}>
                                Next
                                <i className="fas fa-arrow-right" style={{ marginLeft: '6px' }}></i>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving || isBlocked}
                                style={{
                                    ...buttonStyle.success,
                                    opacity: (isSaving || isBlocked) ? 0.7 : 1,
                                    cursor: (isSaving || isBlocked) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <i className="fas fa-check" style={{ marginRight: '6px' }}></i>
                                {isSaving ? 'Saving...' : (property ? 'Update Inventory' : 'Save Inventory')}
                            </button>
                        )}
                    </div>
                </div>
                <AddSizeModal isOpen={isAddSizeModalOpen} projectName={formData.projectName} block={formData.block} category={formData.category} subCategory={formData.subCategory} onClose={() => setIsAddSizeModalOpen(false)} onSave={(name, sizeType) => setFormData(prev => ({ ...prev, size: name, sizeType: sizeType }))} />
                <style>{`
                    .grid-2-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; }
                    .grid-3-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
                    .grid-4-col { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
                    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .fade-in { animation: fadeIn 0.3s ease-out; }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
};

export default AddInventoryModal;
