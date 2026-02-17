import React, { useState } from 'react';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import toast from 'react-hot-toast';

const AddSizeModal = ({ isOpen, onClose, onSave, projectName, block, category, subCategory }) => {
    const { addSize } = usePropertyConfig();
    const [sizeName, setSizeName] = useState(''); // e.g. 3BHK
    const [area, setArea] = useState('');
    const [unit, setUnit] = useState('Sq Ft');

    const handleSubmit = async () => {
        if (!sizeName.trim()) return toast.error('Size Name is required');

        const newSize = {
            project: projectName,
            block: block,
            category: category || 'Residential',
            subCategory: subCategory || '',
            name: `${sizeName} (${area} ${unit})`,
            sizeType: sizeName,
            saleableArea: area,
            description: `Auto-created Size`
        };

        await addSize(newSize);
        if (onSave) onSave(newSize.name); // Return the display string

        toast.success(`Size added!`);
        onClose();
        setSizeName('');
        setArea('');
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '400px', maxWidth: '90%' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#1e293b' }}>Add New Layout / Size</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>For: <strong>{projectName}</strong> &bull; {block}</p>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Configuration / Type</label>
                    <input autoFocus type="text" value={sizeName} onChange={e => setSizeName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="e.g. 3BHK + Servant" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Area</label>
                        <input type="number" value={area} onChange={e => setArea(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="1500" />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Unit</label>
                        <select value={unit} onChange={e => setUnit(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            <option>Sq Ft</option>
                            <option>Sq Yd</option>
                            <option>Sq M</option>
                            <option>Acres</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSubmit} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Size</button>
                </div>
            </div>
        </div>
    );
};

export default AddSizeModal;
