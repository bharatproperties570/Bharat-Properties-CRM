import { useState, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { useUserContext } from '../context/UserContext';
import { useFieldRules } from '../context/FieldRulesContext';
import { useTriggers } from '../context/TriggersContext';
import { useDistribution } from '../context/DistributionContext';
import { useSequences } from '../context/SequenceContext';
import AddSizeModal from './modals/AddSizeModal';

// Modular Sections
import InventoryUnitSection from './inventory/InventoryUnitSection';
import InventoryLocationSection from './inventory/InventoryLocationSection';
import InventoryOwnerSection from './inventory/InventoryOwnerSection';

// Custom Hook
import { useInventoryForm } from '../hooks/useInventoryForm';

const AddInventoryModal = ({ isOpen, onClose, onSave, initialProject = null, property = null }) => {
    const {
        projects: allProjects,
        masterFields = {},
        propertyConfig,
        sizes,
        getLookupId,
        getLookupValue
    } = usePropertyConfig();
    const { users, teams } = useUserContext();
    const { validateAsync } = useFieldRules();
    const { fireEvent } = useTriggers();
    const { executeDistribution } = useDistribution();
    const { evaluateAndEnroll } = useSequences();

    const [activeTab, setActiveTab] = useState('Unit');
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
        handleFurnishedItemKeyDown,
        removeFurnishedItem
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
        onSave
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

    // Style constants
    const labelStyle = { fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '10px', display: 'block' };
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s', backgroundColor: '#fff', height: '42px', boxSizing: 'border-box' };
    const customSelectStyle = { ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px' };
    const customSelectStyleDisabled = { ...customSelectStyle, background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' };
    const sectionStyle = { background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px' };
    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        secondary: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' },
        primary: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };

    const TABS = ['Unit', 'Location', 'Owner'];
    const TAB_ICONS = { 'Unit': 'fa-home', 'Location': 'fa-map-marker-alt', 'Owner': 'fa-user-tag' };
    const handleNext = () => { const idx = TABS.indexOf(activeTab); if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1]); };
    const handlePrev = () => { const idx = TABS.indexOf(activeTab); if (idx > 0) setActiveTab(TABS[idx - 1]); };

    const currentCategoryConfig = propertyConfig[formData.category] || {};
    const subCategories = (currentCategoryConfig.subCategories || []).map(sc => sc.name);
    const builtUpTypes = (() => {
        if (!formData.subCategory) return [];
        const subCatConfig = (currentCategoryConfig.subCategories || []).find(sc => sc.name === formData.subCategory);
        if (!subCatConfig) return [];
        const allBuiltUpTypes = new Set();
        (subCatConfig.types || []).forEach(type => { (type.builtupTypes || []).forEach(bt => allBuiltUpTypes.add(bt)); });
        return Array.from(allBuiltUpTypes);
    })();
    const filteredOwners = searchResults.filter(c => !formData.owners.some(o => o.mobile === c.mobile));

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1200px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} className="animate-slideIn">
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-boxes" style={{ color: '#2563eb' }}></i>
                            </div>
                            {property ? 'Update Inventory' : 'Add Inventory'}
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontWeight: 500, marginLeft: '42px' }}>
                            {currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ padding: '0 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '30px', background: '#fff' }}>
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '16px 0', fontSize: '0.9rem', fontWeight: 600, color: activeTab === tab ? '#2563eb' : '#64748b',
                                border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab ? '#2563eb' : 'transparent'}`, transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                        >
                            <i className={`fas ${TAB_ICONS[tab]}`}></i> {tab}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FB', padding: '24px' }}>
                    {isLoading ? (
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ height: '120px', background: '#e2e8f0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }}></div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            {activeTab === 'Unit' && (
                                <InventoryUnitSection 
                                    formData={formData} setFormData={setFormData} allProjects={allProjects} masterFields={masterFields} subCategories={subCategories} builtUpTypes={builtUpTypes} sizes={sizes} duplicateWarning={duplicateWarning} isCheckingDuplicate={isCheckingDuplicate} isBlocked={isBlocked} handleProjectChange={handleProjectChange} updateBuiltupRow={updateBuiltupRow} handleAddBuiltupRow={handleAddBuiltupRow} handleRemoveBuiltupRow={handleRemoveBuiltupRow} currentFurnishedItem={currentFurnishedItem} setCurrentFurnishedItem={setCurrentFurnishedItem} handleFurnishedItemKeyDown={handleFurnishedItemKeyDown} removeFurnishedItem={removeFurnishedItem} setIsAddSizeModalOpen={setIsAddSizeModalOpen} customSelectStyle={customSelectStyle} customSelectStyleDisabled={customSelectStyleDisabled} inputStyle={inputStyle} labelStyle={labelStyle} sectionStyle={sectionStyle}
                                />
                            )}
                            {activeTab === 'Location' && (
                                <InventoryLocationSection 
                                    formData={formData} setFormData={setFormData} mapRef={mapRef} searchInputRef={searchInputRef} disabledAddressFields={disabledAddressFields} inputStyle={inputStyle} sectionStyle={sectionStyle}
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

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><button onClick={onClose} style={buttonStyle.cancel}>Cancel</button></div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {activeTab !== 'Unit' && <button onClick={handlePrev} style={buttonStyle.secondary}>Back</button>}
                        {activeTab !== 'Owner' ? (
                            <button onClick={handleNext} style={buttonStyle.primary}>Next</button>
                        ) : (
                            <button
                                onClick={handleSave}
                                disabled={isSaving || isBlocked}
                                style={{ ...buttonStyle.success, opacity: (isSaving || isBlocked) ? 0.7 : 1, cursor: (isSaving || isBlocked) ? 'not-allowed' : 'pointer', background: isBlocked ? '#94a3b8' : '#22c55e' }}
                            >
                                {isSaving ? 'Saving...' : (property ? 'Update Inventory' : 'Save Inventory')}
                            </button>
                        )}
                    </div>
                </div>
                <AddSizeModal isOpen={isAddSizeModalOpen} projectName={formData.projectName} block={formData.block} category={formData.category} subCategory={formData.subCategory} onClose={() => setIsAddSizeModalOpen(false)} onSave={(name) => setFormData(prev => ({ ...prev, size: name }))} />
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
