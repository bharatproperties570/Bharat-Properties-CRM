import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const QuickFillModal = ({ isOpen, onClose, lead, onUpdate, getLookupValue }) => {
    const [formData, setFormData] = useState({
        requirement: '',
        propertyType: [],
        location: '',
        budgetMin: 0,
        budgetMax: 0,
        areaMin: 0,
        areaMax: 0,
        sector: '',
        locArea: ''
    });
    const [loading, setLoading] = useState(false);
    const [lookups, setLookups] = useState({
        requirements: [],
        propertyTypes: [],
        locations: []
    });

    useEffect(() => {
        if (lead) {
            setFormData({
                requirement: lead.requirement?._id || lead.requirement || '',
                propertyType: Array.isArray(lead.propertyType) ? lead.propertyType.map(p => p._id || p) : [],
                location: lead.location?._id || lead.location || '',
                budgetMin: lead.budgetMin || 0,
                budgetMax: lead.budgetMax || 0,
                areaMin: lead.areaMin || 0,
                areaMax: lead.areaMax || 0,
                sector: lead.sector || '',
                locArea: lead.locArea || ''
            });
        }
    }, [lead, isOpen]);

    useEffect(() => {
        const fetchLookups = async () => {
            try {
                const res = await api.get('lookups');
                if (res.data?.success) {
                    const all = res.data.data;
                    setLookups({
                        requirements: all.filter(l => l.parent_lookup_id === 'requirement'),
                        propertyTypes: all.filter(l => l.parent_lookup_id === 'property_type'),
                        locations: all.filter(l => l.parent_lookup_id === 'location')
                    });
                }
            } catch (err) {
                console.error('Failed to fetch lookups', err);
            }
        };
        if (isOpen) fetchLookups();
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await api.put(`leads/${lead._id}`, formData);
            if (res.data?.success) {
                toast.success('Lead requirement updated successfully');
                onUpdate(res.data.data);
                onClose();
            }
        } catch (err) {
            toast.error('Failed to update lead');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    };

    const modalStyle = {
        backgroundColor: '#fff', width: '100%', maxWidth: '600px',
        borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        maxHeight: '90vh', overflowY: 'auto'
    };

    const inputGroupStyle = { marginBottom: '20px' };
    const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' };
    const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' };

    return (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Quick Fill Requirement</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Requirement Type</label>
                        <select 
                            style={inputStyle} 
                            value={formData.requirement}
                            onChange={(e) => setFormData({...formData, requirement: e.target.value})}
                        >
                            <option value="">Select...</option>
                            {lookups.requirements.map(l => <option key={l._id} value={l._id}>{l.lookup_value}</option>)}
                        </select>
                    </div>

                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Property Type</label>
                        <select 
                            style={inputStyle} 
                            multiple
                            value={formData.propertyType}
                            onChange={(e) => setFormData({...formData, propertyType: Array.from(e.target.selectedOptions, o => o.value)})}
                            size="3"
                        >
                            {lookups.propertyTypes.map(l => <option key={l._id} value={l._id}>{l.lookup_value}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Budget Min (₹)</label>
                        <input 
                            type="number" style={inputStyle} value={formData.budgetMin}
                            onChange={(e) => setFormData({...formData, budgetMin: e.target.value})}
                        />
                    </div>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Budget Max (₹)</label>
                        <input 
                            type="number" style={inputStyle} value={formData.budgetMax}
                            onChange={(e) => setFormData({...formData, budgetMax: e.target.value})}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Area Min (SqYd)</label>
                        <input 
                            type="number" style={inputStyle} value={formData.areaMin}
                            onChange={(e) => setFormData({...formData, areaMin: e.target.value})}
                        />
                    </div>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>Area Max (SqYd)</label>
                        <input 
                            type="number" style={inputStyle} value={formData.areaMax}
                            onChange={(e) => setFormData({...formData, areaMax: e.target.value})}
                        />
                    </div>
                </div>

                <div style={inputGroupStyle}>
                    <label style={labelStyle}>Location / Area Name</label>
                    <input 
                        type="text" style={inputStyle} value={formData.locArea}
                        placeholder="e.g. Sector 45, Gurgaon"
                        onChange={(e) => setFormData({...formData, locArea: e.target.value})}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                    <button
                        onClick={onClose}
                        style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        style={{ flex: 2, padding: '14px', borderRadius: '14px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}
                    >
                        {loading ? 'Updating...' : 'Update Lead'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickFillModal;
