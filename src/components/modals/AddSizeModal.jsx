import { useState, useEffect } from 'react';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import toast from 'react-hot-toast';

const AddSizeModal = ({ isOpen, onClose, onSave, projectName, block, category, subCategory }) => {
    const { addSize } = usePropertyConfig();
    const [sizeName, setSizeName] = useState(''); // e.g. 8 Marla, 3BHK
    const [width, setWidth] = useState('');
    const [length, setLength] = useState('');
    const [dimensionMetric, setDimensionMetric] = useState('Feet'); // Feet, Meter, Yard
    const [area, setArea] = useState('');
    const [unit, setUnit] = useState('Sq Yd');

    // Auto-calculate area from dimensions
    useEffect(() => {
        if (width && length) {
            const w = parseFloat(width);
            const l = parseFloat(length);
            if (!isNaN(w) && !isNaN(l) && w > 0 && l > 0) {
                const toMeters = (val, metric) => {
                    if (metric === 'Feet') return val * 0.3048;
                    if (metric === 'Yard') return val * 0.9144;
                    return val;
                };
                const wM = toMeters(w, dimensionMetric);
                const lM = toMeters(l, dimensionMetric);
                const areaSqM = wM * lM;
                let calculatedArea = areaSqM;
                if (unit === 'Sq Ft') calculatedArea = areaSqM * 10.7639;
                else if (unit === 'Sq Yd') calculatedArea = areaSqM * 1.19599;
                else if (unit === 'Sq M') calculatedArea = areaSqM;
                setArea(calculatedArea.toFixed(2));
            }
        }
    }, [width, length, dimensionMetric, unit]);

    const handleSubmit = async () => {
        if (!sizeName.trim()) return toast.error('Size Name is required');

        const projNameStr = typeof projectName === 'object' ? projectName?.name : (projectName || '');
        const blockNameStr = typeof block === 'object' ? block?.name : (block || '');

        const newSize = {
            project: projNameStr,
            block: blockNameStr,
            category: category || 'Residential',
            subCategory: subCategory || '',
            name: `${sizeName} (${area ? area + ' ' + unit : ''})`.trim(),
            sizeType: sizeName,
            unitType: sizeName,
            saleableArea: unit === 'Sq Ft' ? area : '',
            totalArea: area || '',
            resultMetric: unit,
            width: width ? String(width).trim() : '',
            length: length ? String(length).trim() : '',
            widthMetric: width ? dimensionMetric : '',
            lengthMetric: length ? dimensionMetric : '',
            description: `Auto-created Size`
        };

        try {
            const saved = await addSize(newSize);
            if (onSave) onSave(newSize.name, newSize.sizeType, saved);
            toast.success(`Size added with specifications!`);
            onClose();
            setSizeName('');
            setWidth('');
            setLength('');
            setArea('');
        } catch (err) {
            toast.error(err?.message || 'Failed to save size');
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000
        }}>
            <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '460px', maxWidth: '92%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Add New Unit Size</h3>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
                            For: <strong>{typeof projectName === 'object' ? projectName?.name : projectName}</strong> &bull; {typeof block === 'object' ? block?.name : block}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#94a3b8', cursor: 'pointer' }}>&times;</button>
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Configuration / Type *</label>
                    <input 
                        autoFocus 
                        type="text" 
                        value={sizeName} 
                        onChange={e => setSizeName(e.target.value)} 
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} 
                        placeholder="e.g. 8 Marla, 1 Kanal, 3 BHK" 
                    />
                </div>

                {/* Dimensions (Width & Length) */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Dimensions</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Unit:</span>
                            <select 
                                value={dimensionMetric} 
                                onChange={e => setDimensionMetric(e.target.value)}
                                style={{ padding: '2px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', background: '#fff' }}
                            >
                                <option value="Feet">Feet</option>
                                <option value="Meter">Meter</option>
                                <option value="Yard">Yard</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>Width ({dimensionMetric})</label>
                            <input 
                                type="number" 
                                step="any"
                                value={width} 
                                onChange={e => setWidth(e.target.value)} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }} 
                                placeholder="e.g. 24" 
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>Length ({dimensionMetric})</label>
                            <input 
                                type="number" 
                                step="any"
                                value={length} 
                                onChange={e => setLength(e.target.value)} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }} 
                                placeholder="e.g. 75" 
                            />
                        </div>
                    </div>
                </div>

                {/* Total Area & Unit */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Total Area</label>
                        <input 
                            type="number" 
                            step="any"
                            value={area} 
                            onChange={e => setArea(e.target.value)} 
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} 
                            placeholder="e.g. 200" 
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Area Unit</label>
                        <select 
                            value={unit} 
                            onChange={e => setUnit(e.target.value)} 
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff' }}
                        >
                            <option value="Sq Yd">Sq Yd</option>
                            <option value="Sq Ft">Sq Ft</option>
                            <option value="Sq M">Sq M</option>
                            <option value="Marla">Marla</option>
                            <option value="Kanal">Kanal</option>
                            <option value="Acres">Acres</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancel</button>
                    <button onClick={handleSubmit} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}>Save Size</button>
                </div>
            </div>
        </div>
    );
};

export default AddSizeModal;
