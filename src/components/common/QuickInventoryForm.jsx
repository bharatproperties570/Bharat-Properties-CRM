import { useState, useEffect } from 'react';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { api } from '../../utils/api';

// Consolidated Style
const labelStyle = { fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' };
const selectStyle = { ...inputStyle, appearance: 'none', background: '#fff', cursor: 'pointer' };
const disabledStyle = { ...selectStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' };

const QuickInventoryForm = ({ formData, setFormData, onTriggerModal }) => {
    const { projects: contextProjects, sizes } = usePropertyConfig();
    const [dynamicProjects, setDynamicProjects] = useState([]);
    const [dynamicBlocks, setDynamicBlocks] = useState([]);
    const [dynamicUnits, setDynamicUnits] = useState([]);
    const [loadingUnits, setLoadingUnits] = useState(false);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await api.get('/deal-forms/public/inventory/projects');
                if (res.data?.success) setDynamicProjects(res.data.data);
            } catch (err) {
                console.error("Error fetching projects", err);
            }
        };
        fetchProjects();
    }, []);

    useEffect(() => {
        const fetchBlocks = async () => {
            if (!formData.projectName || formData.projectName === 'ADD_NEW') {
                setDynamicBlocks([]);
                return;
            }
            try {
                const res = await api.get(`/deal-forms/public/inventory/blocks?projectName=${encodeURIComponent(formData.projectName)}`);
                if (res.data?.success) setDynamicBlocks(res.data.data);
            } catch (err) {
                console.error("Error fetching blocks", err);
            }
        };
        fetchBlocks();
    }, [formData.projectName]);

    useEffect(() => {
        const fetchUnits = async () => {
            if (!formData.projectName || !formData.block || formData.projectName === 'ADD_NEW' || formData.block === 'ADD_NEW') {
                setDynamicUnits([]);
                return;
            }
            setLoadingUnits(true);
            try {
                const res = await api.get(`/deal-forms/public/inventory/units?projectName=${encodeURIComponent(formData.projectName)}&block=${encodeURIComponent(formData.block)}`);
                if (res.data?.success) setDynamicUnits(res.data.data);
            } catch (err) {
                console.error("Error fetching units", err);
            } finally {
                setLoadingUnits(false);
            }
        };
        fetchUnits();
    }, [formData.projectName, formData.block]);

    // Merge backend distinct lists with context static lists
    const allProjects = [...new Set([...dynamicProjects, ...contextProjects.map(p => p.name)])].sort();


    return (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-home" style={{ color: '#3b82f6' }}></i> Basic Unit Details
            </h4>

            {/* Row 1: Project & Block */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                    <label style={labelStyle}>Project Name</label>
                    <select
                        style={selectStyle}
                        value={formData.projectName}
                        onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                                onTriggerModal('PROJECT');
                            } else {
                                setFormData(prev => ({ ...prev, projectName: e.target.value, block: '', size: '' }));
                            }
                        }}
                    >
                        <option value="">Select Project</option>
                        {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
                        <option value="ADD_NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Project</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Block / Tower</label>
                    <select
                        style={!formData.projectName ? disabledStyle : selectStyle}
                        value={formData.block}
                        disabled={!formData.projectName}
                        onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                                onTriggerModal('BLOCK');
                            } else {
                                setFormData(prev => ({ ...prev, block: e.target.value, unitNo: '', size: '' }));
                            }
                        }}
                    >
                        <option value="">{formData.projectName ? "Select Block" : "Select Project First"}</option>
                        {(() => {
                            const ctxProj = contextProjects.find(p => p.name === formData.projectName);
                            const ctxBlocks = ctxProj?.blocks || [];
                            const allBlocks = [...new Set([...dynamicBlocks, ...ctxBlocks])].sort();
                            return (
                                <>
                                    {allBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                                    {formData.projectName && <option value="ADD_NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Block</option>}
                                </>
                            );
                        })()}
                    </select>
                </div>
            </div>

            {/* Row 2: Unit No & Size */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                    <label style={labelStyle}>
                        Unit Number
                        {loadingUnits && <i className="fas fa-spinner fa-spin" style={{ marginLeft: '8px', color: '#3b82f6', fontSize: '0.75rem' }}></i>}
                    </label>
                    <select
                        style={(!formData.projectName || !formData.block) ? disabledStyle : selectStyle}
                        value={formData.unitNo}
                        disabled={!formData.projectName || !formData.block}
                        onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                                // Fallback to prompt since we don't have a specific Unit Number modal natively in DealIntake yet
                                const customUnit = window.prompt("Enter new Unit Number:");
                                if (customUnit) {
                                    setFormData(prev => ({ ...prev, unitNo: customUnit }));
                                }
                            } else {
                                setFormData(prev => ({ ...prev, unitNo: e.target.value }));
                            }
                        }}
                    >
                        <option value="">{(!formData.projectName || !formData.block) ? "Select Block First" : "Select Unit"}</option>
                        {dynamicUnits.map(u => <option key={u} value={u}>{u}</option>)}
                        {/* We add formData.unitNo manually if it's a custom prompt input that's not in the list */}
                        {formData.unitNo && !dynamicUnits.includes(formData.unitNo) && (
                            <option value={formData.unitNo} style={{ background: '#f1f5f9' }}>{formData.unitNo}</option>
                        )}
                        {formData.projectName && formData.block && <option value="ADD_NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add Custom Unit</option>}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Start / Size</label>
                    <select
                        style={(!formData.projectName || !formData.block) ? disabledStyle : selectStyle}
                        value={formData.size}
                        disabled={!formData.projectName || !formData.block}
                        onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                                onTriggerModal('SIZE');
                            } else {
                                setFormData(prev => ({ ...prev, size: e.target.value }));
                            }
                        }}
                    >
                        <option value="">Select Size</option>
                        {(() => {
                            // Filter Sizes based on Context + User Added
                            const relevantSizes = sizes.filter(s => s.project === formData.projectName && s.block === formData.block);
                            // Fallback to legacy masterFields if no sizing in new structure? For now, assume 'sizes' in context is source.
                            // Previously: masterFields.projectSizes?.[formData.projectName]?.[formData.block]

                            return (
                                <>
                                    {relevantSizes.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    {formData.projectName && formData.block && <option value="ADD_NEW" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Add New Size</option>}
                                </>
                            );
                        })()}
                    </select>
                    {/* Fallback Display if using mock lookup from masterFields for legacy */}
                </div>
            </div>

            {/* Row 3: Unit Type & Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>Type</label>
                    <select
                        style={selectStyle}
                        value={formData.type}
                        onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    >
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Industrial">Industrial</option>
                        <option value="Agricultural">Agricultural</option>
                    </select>
                </div>
                {/* Can add more fields here if needed */}
            </div>

        </div>
    );
};

export default QuickInventoryForm;
