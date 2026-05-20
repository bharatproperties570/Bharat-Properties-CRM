import React, { useState, useEffect } from 'react';
import { renderValue } from '../../utils/renderUtils';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { fixDriveUrl } from '../../utils/helpers';

const DealBuiltupDetails = ({ deal, getLookupValue, onRefresh }) => {
    const [selectedImageUrl, setSelectedImageUrl] = useState(null);

    const gridStyle = { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
        gap: '12px',
        flex: 1
    };

    // Pull data from deal or linked inventoryId
    const inventory = deal?.inventoryId || {};
    const builtupDetails = deal?.builtupDetails || inventory.builtupDetails || [];
    const builtupType = deal?.builtupType || inventory.builtupType;
    const possessionStatus = deal?.possessionStatus || inventory.possessionStatus;
    const occupationDate = deal?.occupationDate || inventory.occupationDate;
    const ageOfConstruction = deal?.ageOfConstruction || inventory.ageOfConstruction;
    const furnishType = deal?.furnishType || inventory.furnishType;
    const furnishedItems = deal?.furnishedItems || inventory.furnishedItems;
    const builtupVideoUrl = deal?.builtupVideoUrl || inventory.builtupVideoUrl;

    // Interactive Modal Form States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newFloor, setNewFloor] = useState('Ground Floor');
    const [newCluster, setNewCluster] = useState('');
    const [newWidth, setNewWidth] = useState('');
    const [newLength, setNewLength] = useState('');
    const [newTotalArea, setNewTotalArea] = useState('');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [imageUploading, setImageUploading] = useState(false);
    const [videoUploading, setVideoUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Auto-calculate Total Area when width or length changes
    useEffect(() => {
        const w = parseFloat(newWidth) || 0;
        const l = parseFloat(newLength) || 0;
        if (w > 0 && l > 0) {
            setNewTotalArea(String(w * l));
        }
    }, [newWidth, newLength]);

    const handleImageUpload = async (file) => {
        if (!file) return;
        setImageUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data && res.data.success) {
                setNewImageUrl(res.data.url);
                toast.success('Layout Plan uploaded successfully!');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[DealBuiltupDetails] Image upload error:', error);
            toast.error('Failed to upload layout image.');
        } finally {
            setImageUploading(false);
        }
    };

    const handleVideoUpload = async (file) => {
        if (!file) return;
        setVideoUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data && res.data.success) {
                setNewVideoUrl(res.data.url);
                toast.success('Video walkthrough uploaded successfully!');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[DealBuiltupDetails] Video upload error:', error);
            toast.error('Failed to upload video walkthrough.');
        } finally {
            setVideoUploading(false);
        }
    };

    // Handle Form Submit (API PUT call to update Deal builtupDetails)
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!deal || !deal._id) return;
        
        setIsSaving(true);
        try {
            const newRow = {
                floor: newFloor,
                cluster: newCluster || 'Standard Layout',
                width: parseFloat(newWidth) || 0,
                length: parseFloat(newLength) || 0,
                totalArea: parseFloat(newTotalArea) || 0,
                imageUrl: newImageUrl || '',
                videoUrl: newVideoUrl || ''
            };

            const currentBuiltup = deal.builtupDetails || [];
            const updatedBuiltup = [...currentBuiltup, newRow];

            const res = await api.put(`deals/${deal._id}`, { builtupDetails: updatedBuiltup });
            if (res.data && (res.data.success || res.data.status === 'success')) {
                toast.success('Specification added successfully! ✨');
                setIsModalOpen(false);
                // Reset form fields
                setNewFloor('Ground Floor');
                setNewCluster('');
                setNewWidth('');
                setNewLength('');
                setNewTotalArea('');
                setNewImageUrl('');
                setNewVideoUrl('');
                if (onRefresh) onRefresh();
            } else {
                toast.error('Failed to save built-up details.');
            }
        } catch (error) {
            console.error('Error saving built-up detail:', error);
            toast.error('Server error while saving details.');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Row Deletion
    const handleDeleteRow = async (indexToDelete) => {
        if (!deal || !deal._id) return;
        const confirm = window.confirm('Are you sure you want to delete this built-up specification?');
        if (!confirm) return;

        try {
            const currentBuiltup = deal.builtupDetails || [];
            const updatedBuiltup = currentBuiltup.filter((_, idx) => idx !== indexToDelete);

            const res = await api.put(`deals/${deal._id}`, { builtupDetails: updatedBuiltup });
            if (res.data && (res.data.success || res.data.status === 'success')) {
                toast.success('Specification removed successfully!');
                if (onRefresh) onRefresh();
            } else {
                toast.error('Failed to remove built-up details.');
            }
        } catch (error) {
            console.error('Error removing built-up detail:', error);
            toast.error('Server error while removing details.');
        }
    };

    return (
        <div style={{ 
            background: '#fff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            marginBottom: '24px',
            overflow: 'hidden',
            padding: '24px'
        }}>
            {/* Header Layout with Visual SaaS Plus Action Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-building" style={{ color: '#4f46e5' }}></i>
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>Built-up Details</h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Structure, floors & furnishing status</p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {builtupVideoUrl && (
                        <a 
                            href={fixDriveUrl(builtupVideoUrl)} 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '8px 16px', 
                                background: 'linear-gradient(135deg, #10b981, #059669)', 
                                color: '#fff', 
                                borderRadius: '20px', 
                                fontSize: '0.8rem', 
                                fontWeight: 700, 
                                textDecoration: 'none',
                                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                                transition: 'transform 0.2s, box-shadow 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 12px -1px rgba(16, 185, 129, 0.3)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.2)';
                            }}
                        >
                            <i className="fas fa-play-circle" style={{ fontSize: '1.1rem' }}></i> Walkthrough Video
                        </a>
                    )}
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#4f46e5',
                            color: '#fff',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)',
                            transition: 'all 0.2s'
                        }}
                        title="Add Built-up Detail"
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <i className="fas fa-plus"></i>
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Floor Wise Details Table list */}
                {builtupDetails.map((floor, fIdx) => (
                    <div key={fIdx} style={{ padding: '20px', background: 'rgba(248, 250, 252, 0.4)', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-layer-group" style={{ color: '#4f46e5', fontSize: '0.9rem' }}></i>
                                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {floor.floor || `Level ${fIdx + 1}`}
                                </span>
                            </div>
                            <button
                                onClick={() => handleDeleteRow(fIdx)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    opacity: 0.6,
                                    transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                                title="Delete floor specification"
                            >
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={gridStyle}>
                                <InfoItem label="Plan/Cluster" value={renderValue(floor.cluster)} icon="project-diagram" />
                                <InfoItem label="Width" value={floor.width ? `${floor.width} ft.` : '-'} icon="arrows-alt-h" />
                                <InfoItem label="Length" value={floor.length ? `${floor.length} ft.` : '-'} icon="arrows-alt-v" />
                                <InfoItem label="Total Area" value={floor.totalArea ? `${floor.totalArea} Sq.Ft.` : '-'} icon="chart-area" />
                            </div>
                            {/* Actions Column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                {floor.imageUrl && (
                                    <div 
                                        style={{ 
                                            position: 'relative', 
                                            width: '100px', 
                                            height: '65px', 
                                            borderRadius: '12px', 
                                            overflow: 'hidden', 
                                            border: '1px solid #e2e8f0', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                        }}
                                        onClick={() => setSelectedImageUrl(floor.imageUrl)}
                                        title="Click to zoom layout plan"
                                    >
                                        <img 
                                            src={fixDriveUrl(floor.imageUrl)} 
                                            alt="Layout Plan" 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                        <div 
                                            style={{ 
                                                position: 'absolute', 
                                                inset: 0, 
                                                backgroundColor: 'rgba(15, 23, 42, 0.4)', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                opacity: 0, 
                                                transition: 'opacity 0.2s' 
                                            }}
                                            className="hover-overlay"
                                            onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                            onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                                        >
                                            <i className="fas fa-search-plus" style={{ color: '#fff', fontSize: '1rem' }}></i>
                                        </div>
                                    </div>
                                )}
                                
                                {floor.videoUrl && (
                                    <a 
                                        href={fixDriveUrl(floor.videoUrl)} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            gap: '6px', 
                                            width: '100px', 
                                            padding: '8px 0', 
                                            background: '#f0fdf4', 
                                            border: '1px solid #bbf7d0', 
                                            borderRadius: '10px', 
                                            color: '#16a34a', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700, 
                                            textDecoration: 'none',
                                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.05)',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
                                        title="Watch Floor Video"
                                    >
                                        <i className="fas fa-video"></i> Walkthrough
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Overall Built-up Specs */}
                <div style={gridStyle}>
                    <InfoItem label="Built-up Type" value={renderValue(getLookupValue('BuiltupType', builtupType)) || renderValue(builtupType)} icon="building" />
                    <InfoItem label="Possession Status" value={renderValue(getLookupValue('Status', possessionStatus)) || renderValue(possessionStatus)} icon="key" />
                    <InfoItem 
                        label="Occupation Date" 
                        value={occupationDate ? new Date(occupationDate).toLocaleDateString('en-GB') : '-'} 
                        icon="calendar-alt" 
                    />
                    <InfoItem label="Age of Construction" value={renderValue(ageOfConstruction)} icon="history" />
                    <InfoItem label="Furnish Status" value={renderValue(getLookupValue('FurnishType', furnishType)) || renderValue(furnishType)} icon="couch" />
                </div>

                {/* Furnished Items List */}
                {furnishType !== 'Unfurnished' && furnishedItems && (
                    <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.05), rgba(79, 70, 229, 0.02))', borderRadius: '16px', border: '1px solid rgba(79, 70, 229, 0.1)' }}>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.65rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <i className="fas fa-list-check" style={{ marginRight: '8px' }}></i> Furnished Items
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(furnishedItems || '').split(',').map((item, idx) => (
                                <span key={idx} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    {item.trim()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Interactive Add Floor Clusters Specification Modal Form Overlay */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#fff',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.18)',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        {/* Modal Header */}
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>Add Built-up Detail</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>Configure structural layer specification</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '1.2rem' }}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Modal Body / Form */}
                        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Floor select */}
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Floor Level</label>
                                <select 
                                    value={newFloor} 
                                    onChange={(e) => setNewFloor(e.target.value)}
                                    style={{ width: '100%', height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                >
                                    <option>Ground Floor</option>
                                    <option>First Floor</option>
                                    <option>Second Floor</option>
                                    <option>Third Floor</option>
                                    <option>Other</option>
                                </select>
                            </div>

                            {/* Plan/Cluster selector with list and custom text entry */}
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Component / Plan</label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <select 
                                        onChange={(e) => {
                                            if (e.target.value !== 'custom') {
                                                setNewCluster(e.target.value);
                                            } else {
                                                setNewCluster('');
                                            }
                                        }}
                                        style={{ width: '45%', height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                    >
                                        <option value="">Select Plan</option>
                                        <option>Type A</option>
                                        <option>Type B</option>
                                        <option>Type C</option>
                                        <option value="custom">Custom...</option>
                                    </select>
                                    <input 
                                        type="text"
                                        placeholder="Or type component name"
                                        value={newCluster}
                                        onChange={(e) => setNewCluster(e.target.value)}
                                        style={{ flex: 1, height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>

                            {/* Width & Length */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Width (ft)</label>
                                    <input 
                                        type="number"
                                        placeholder="e.g. 15"
                                        value={newWidth}
                                        onChange={(e) => setNewWidth(e.target.value)}
                                        style={{ width: '100%', height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Length (ft)</label>
                                    <input 
                                        type="number"
                                        placeholder="e.g. 20"
                                        value={newLength}
                                        onChange={(e) => setNewLength(e.target.value)}
                                        style={{ width: '100%', height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem' }}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Total Area */}
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Area (Sq.Ft.)</label>
                                <input 
                                    type="number"
                                    placeholder="Calculated area"
                                    value={newTotalArea}
                                    onChange={(e) => setNewTotalArea(e.target.value)}
                                    style={{ width: '100%', height: '42px', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem', background: '#f8fafc' }}
                                    required
                                />
                            </div>

                            {/* Layout Plan Image & Walkthrough Video */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Layout Plan Image</label>
                                    {newImageUrl ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', height: '42px', boxSizing: 'border-box' }}>
                                            <img src={fixDriveUrl(newImageUrl)} alt="Preview" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>Uploaded</span>
                                            <button type="button" onClick={() => setNewImageUrl('')} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    ) : imageUploading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#4f46e5', height: '42px' }}>
                                            <i className="fas fa-spinner fa-spin"></i> Uploading...
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <label htmlFor="modal-image-upload" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '42px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', boxSizing: 'border-box' }}>
                                                <i className="fas fa-cloud-upload-alt"></i> Upload
                                            </label>
                                            <input id="modal-image-upload" type="file" accept="image/*" onChange={e => handleImageUpload(e.target.files[0])} style={{ display: 'none' }} />
                                            <button type="button" onClick={() => {
                                                const url = window.prompt("Enter Layout Plan Image URL:");
                                                if (url !== null) setNewImageUrl(url.trim());
                                            }} style={{ padding: '0 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#64748b', cursor: 'pointer' }} title="Add Link">
                                                <i className="fas fa-link"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Walkthrough Video</label>
                                    {newVideoUrl ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', background: '#f8fafc', height: '42px', boxSizing: 'border-box' }}>
                                            <i className="fas fa-video" style={{ color: '#16a34a' }}></i>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>Uploaded</span>
                                            <button type="button" onClick={() => setNewVideoUrl('')} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    ) : videoUploading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#4f46e5', height: '42px' }}>
                                            <i className="fas fa-spinner fa-spin"></i> Uploading...
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <label htmlFor="modal-video-upload" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '42px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', boxSizing: 'border-box' }}>
                                                <i className="fas fa-cloud-upload-alt"></i> Upload
                                            </label>
                                            <input id="modal-video-upload" type="file" accept="video/*" onChange={e => handleVideoUpload(e.target.files[0])} style={{ display: 'none' }} />
                                            <button type="button" onClick={() => {
                                                const url = window.prompt("Enter Walkthrough Video URL:");
                                                if (url !== null) setNewVideoUrl(url.trim());
                                            }} style={{ padding: '0 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#64748b', cursor: 'pointer' }} title="Add Link">
                                                <i className="fas fa-link"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button 
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ height: '42px', padding: '0 20px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSaving}
                                    style={{ height: '42px', padding: '0 24px', border: 'none', borderRadius: '8px', background: '#4f46e5', color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}
                                >
                                    {isSaving ? 'Saving...' : 'Add Specification'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Premium Lightbox Modal for Layout Plan Preview */}
            {selectedImageUrl && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        inset: 0, 
                        zIndex: 10000, 
                        background: 'rgba(15, 23, 42, 0.9)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        backdropFilter: 'blur(12px)',
                        padding: '20px'
                    }}
                    onClick={() => setSelectedImageUrl(null)}
                >
                    <button 
                        onClick={() => setSelectedImageUrl(null)} 
                        style={{ 
                            position: 'absolute', 
                            top: '20px', 
                            right: '20px', 
                            background: 'rgba(255, 255, 255, 0.1)', 
                            border: 'none', 
                            color: '#fff', 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        <i className="fas fa-times" style={{ fontSize: '1.2rem' }}></i>
                    </button>
                    <div style={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <img 
                            src={fixDriveUrl(selectedImageUrl)} 
                            alt="Layout Plan Zoom" 
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '75vh', 
                                objectFit: 'contain',
                                borderRadius: '16px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const InfoItem = ({ label, value, icon }) => (
    <div style={{ padding: '14px', background: 'rgba(248, 250, 252, 0.5)', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
        <p style={{ margin: '0 0 6px 0', fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className={`fas fa-${icon}`} style={{ width: '12px', textAlign: 'center', color: '#cbd5e1' }}></i>
            {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{value || '-'}</p>
    </div>
);

export default DealBuiltupDetails;
