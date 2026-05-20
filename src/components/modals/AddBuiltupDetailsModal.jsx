import React, { useState, useEffect } from 'react';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';

export default function AddBuiltupDetailsModal({
    isOpen,
    onClose,
    entityId,
    entityType, // 'Deal' or 'Inventory'
    entityData,
    onSave
}) {
    const { propertyConfig, getLookupId, getLookupValue, projects, projectMasterFields } = usePropertyConfig();

    const [loading, setLoading] = useState(false);
    const [subCategory, setSubCategory] = useState('');
    const [builtupType, setBuiltupType] = useState('');
    const [builtupDetails, setBuiltupDetails] = useState([]);
    const [occupationDate, setOccupationDate] = useState('');
    const [ageOfConstruction, setAgeOfConstruction] = useState('');
    const [possessionStatus, setPossessionStatus] = useState('');
    const [furnishType, setFurnishType] = useState('');
    const [furnishedItems, setFurnishedItems] = useState([]);
    const [currentFurnishedItem, setCurrentFurnishedItem] = useState('');
    const [heroImage, setHeroImage] = useState('');
    const [projectImages, setProjectImages] = useState([]);
    const [builtupVideoUrl, setBuiltupVideoUrl] = useState('');
    const [overallVideoUploading, setOverallVideoUploading] = useState(false);

    // Fetch details and initialize state
    useEffect(() => {
        if (isOpen && entityData) {
            const catVal = getLookupValue('Category', entityData.category) || entityData.category || 'Residential';
            const subCatVal = getLookupValue('SubCategory', entityData.subCategory) || entityData.subCategory || '';
            const bTypeVal = getLookupValue('BuiltupType', entityData.builtupType) || entityData.builtupType || '';
            
            setSubCategory(subCatVal);
            setBuiltupType(bTypeVal);
            setBuiltupVideoUrl(entityData.builtupVideoUrl || '');
            
            const initialDetails = (entityData.builtupDetails && entityData.builtupDetails.length > 0)
                ? entityData.builtupDetails.map(row => ({
                    floor: row.floor || 'Ground Floor',
                    cluster: row.cluster || '',
                    length: row.length || '',
                    width: row.width || '',
                    totalArea: row.totalArea || '',
                    imageUrl: row.imageUrl || '',
                    videoUrl: row.videoUrl || ''
                }))
                : [{ floor: 'Ground Floor', cluster: '', length: '', width: '', totalArea: '', imageUrl: '', videoUrl: '' }];
            setBuiltupDetails(initialDetails);
            
            if (entityData.occupationDate) {
                setOccupationDate(new Date(entityData.occupationDate).toISOString().split('T')[0]);
            } else {
                setOccupationDate('');
            }
            
            setAgeOfConstruction(entityData.ageOfConstruction || entityData.constructionAge || '');
            setPossessionStatus(entityData.possessionStatus || '');
            setFurnishType(entityData.furnishType || '');
            setHeroImage(entityData.websiteMetadata?.featuredImage || '');
            
            const items = entityData.furnishedItems 
                ? entityData.furnishedItems.split(',').map(s => s.trim()).filter(Boolean)
                : [];
            setFurnishedItems(items);
        }
    }, [isOpen, entityData, getLookupValue]);

    // Fetch project details for live gallery/plans dropdown
    useEffect(() => {
        const fetchProjectImages = async () => {
            let projId = entityData?.projectId?._id || 
                           (typeof entityData?.projectId === 'string' ? entityData?.projectId : null) ||
                           entityData?.inventoryId?.projectId?._id ||
                           (typeof entityData?.inventoryId?.projectId === 'string' ? entityData?.inventoryId.projectId : null);
            
            // Fallback: search in projects list by name if no projId found
            if (!projId && entityData?.projectName && Array.isArray(projects)) {
                const matchedProj = projects.find(p => p.name?.toLowerCase() === entityData.projectName.toLowerCase());
                if (matchedProj) {
                    projId = matchedProj._id || matchedProj.id;
                }
            }

            if (!projId) {
                setProjectImages([]);
                return;
            }
            try {
                const response = await api.get(`/projects/${projId}`);
                if (response.data && response.data.success && response.data.data) {
                    setProjectImages(response.data.data.projectImages || []);
                }
            } catch (err) {
                console.error("Error fetching project details in AddBuiltupDetailsModal:", err);
                setProjectImages([]);
            }
        };

        if (isOpen && entityData) {
            fetchProjectImages();
        }
    }, [isOpen, entityData, projects]);

    const toggleHeroImage = (imageUrl) => {
        if (heroImage === imageUrl) {
            setHeroImage('');
        } else {
            setHeroImage(imageUrl);
        }
    };

    if (!isOpen || !entityData) return null;

    // Resolve Category
    const categoryName = getLookupValue('Category', entityData.category) || entityData.category || 'Residential';
    const currentCategoryConfig = propertyConfig[categoryName] || {};
    const subCategories = (currentCategoryConfig.subCategories || []).map(sc => sc.name);

    // Resolve sizeType/Configuration name
    const sizeType = getLookupValue('PropertyType', entityData.sizeType) || entityData.sizeType || '';

    // Dynamically calculate Built-up Types
    const builtUpTypes = (() => {
        if (!subCategory) return [];
        const subCatConfig = (currentCategoryConfig.subCategories || []).find(sc => sc.name === subCategory);
        if (!subCatConfig) return [];

        const allBuiltUpTypes = new Set();
        
        // Try finding types config matching sizeType
        const typeConfig = (subCatConfig.types || []).find(t => t.name === sizeType);
        if (typeConfig && Array.isArray(typeConfig.builtupTypes)) {
            typeConfig.builtupTypes.forEach(bt => {
                if (typeof bt === 'object' && bt !== null) {
                    allBuiltUpTypes.add(JSON.stringify({ _id: bt._id || bt.id, name: bt.name }));
                } else {
                    allBuiltUpTypes.add(JSON.stringify({ name: bt }));
                }
            });
        } else {
            // Fallback: load all builtupTypes across all types in the subcategory
            (subCatConfig.types || []).forEach(t => {
                if (Array.isArray(t.builtupTypes)) {
                    t.builtupTypes.forEach(bt => {
                        if (typeof bt === 'object' && bt !== null) {
                            allBuiltUpTypes.add(JSON.stringify({ _id: bt._id || bt.id, name: bt.name }));
                        } else {
                            allBuiltUpTypes.add(JSON.stringify({ name: bt }));
                        }
                    });
                }
            });
        }

        return Array.from(allBuiltUpTypes).map(s => JSON.parse(s));
    })();

    // Handlers for Builtup details
    const handleAddBuiltupRow = () => {
        setBuiltupDetails(prev => [...prev, { floor: 'Ground Floor', cluster: '', length: '', width: '', totalArea: '', imageUrl: '', videoUrl: '' }]);
    };

    const handleRemoveBuiltupRow = (index) => {
        if (builtupDetails.length === 1) {
            setBuiltupDetails([{ floor: 'Ground Floor', cluster: '', length: '', width: '', totalArea: '', imageUrl: '', videoUrl: '' }]);
        } else {
            setBuiltupDetails(prev => prev.filter((_, idx) => idx !== index));
        }
    };

    const updateBuiltupRow = (index, field, value) => {
        setBuiltupDetails(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            
            // Recalculate totalArea if width or length is changed
            if (field === 'width' || field === 'length') {
                const w = parseFloat(field === 'width' ? value : updated[index].width) || 0;
                const l = parseFloat(field === 'length' ? value : updated[index].length) || 0;
                updated[index].totalArea = w && l ? (w * l).toFixed(2) : '';
            }
            return updated;
        });
    };

    // Handler for row-wise video upload
    const handleVideoUpload = async (index, file) => {
        if (!file) return;

        // Set row state to uploading
        setBuiltupDetails(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], videoUploading: true };
            return updated;
        });

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.success) {
                const uploadedUrl = res.data.url;
                setBuiltupDetails(prev => {
                    const updated = [...prev];
                    updated[index] = {
                        ...updated[index],
                        videoUrl: uploadedUrl,
                        videoUploading: false
                    };
                    return updated;
                });
                toast.success(`Video walkthrough for row #${index + 1} uploaded successfully!`);
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[AddBuiltupDetailsModal] Row video upload error:', error);
            setBuiltupDetails(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], videoUploading: false };
                return updated;
            });
            toast.error('Failed to upload video. Please try again.');
        }
    };

    const handleAddVideoUrlPrompt = (index) => {
        const url = window.prompt("Enter walkthrough video URL (e.g. YouTube, Google Drive, or MP4 link):");
        if (url !== null) {
            updateBuiltupRow(index, 'videoUrl', url.trim());
        }
    };

    const handleOverallVideoUpload = async (file) => {
        if (!file) return;
        setOverallVideoUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.success) {
                setBuiltupVideoUrl(res.data.url);
                toast.success('Overall property walkthrough video uploaded successfully!');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[AddBuiltupDetailsModal] Overall video upload error:', error);
            toast.error('Failed to upload walkthrough video. Please try again.');
        } finally {
            setOverallVideoUploading(false);
        }
    };

    // Handler for row-wise image upload
    const handleImageUpload = async (index, file) => {
        if (!file) return;

        // Set row state to uploading
        setBuiltupDetails(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], uploading: true };
            return updated;
        });

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.success) {
                const uploadedUrl = res.data.url;
                setBuiltupDetails(prev => {
                    const updated = [...prev];
                    updated[index] = {
                        ...updated[index],
                        imageUrl: uploadedUrl,
                        uploading: false
                    };
                    return updated;
                });
                setHeroImage(prev => prev ? prev : uploadedUrl);
                toast.success(`Image for row #${index + 1} uploaded successfully!`);
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('[AddBuiltupDetailsModal] Row image upload error:', error);
            setBuiltupDetails(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], uploading: false };
                return updated;
            });
            toast.error('Failed to upload image. Please try again.');
        }
    };

    // Handlers for Furnished Items tags
    const handleAddFurnishedItem = () => {
        const trimmed = currentFurnishedItem.trim();
        if (trimmed && !furnishedItems.includes(trimmed)) {
            setFurnishedItems(prev => [...prev, trimmed]);
            setCurrentFurnishedItem('');
        }
    };

    const handleFurnishedItemKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddFurnishedItem();
        }
    };

    const removeFurnishedItem = (itemToRemove) => {
        setFurnishedItems(prev => prev.filter(item => item !== itemToRemove));
    };

    // Save handler
    const handleSave = async () => {
        setLoading(true);
        const toastId = toast.loading('Saving details...');

        try {
            // Resolve Lookups to IDs for API persistence
            const resolvedSubCategory = getLookupId('SubCategory', subCategory);
            const resolvedBuiltupType = getLookupId('BuiltupType', builtupType);

            const payload = {
                subCategory: resolvedSubCategory,
                builtupType: resolvedBuiltupType,
                occupationDate: occupationDate === '' ? null : occupationDate,
                ageOfConstruction: ageOfConstruction,
                possessionStatus: possessionStatus,
                furnishType: furnishType,
                furnishedItems: furnishType === 'Unfurnished' ? '' : furnishedItems.join(', '),
                builtupVideoUrl: builtupVideoUrl || '',
                builtupDetails: builtupDetails.map(row => ({
                    floor: row.floor,
                    cluster: row.cluster,
                    length: row.length === '' ? null : Number(row.length),
                    width: row.width === '' ? null : Number(row.width),
                    totalArea: row.totalArea === '' ? null : Number(row.totalArea),
                    imageUrl: row.imageUrl || '',
                    videoUrl: row.videoUrl || ''
                }))
            };

            if (entityType === 'Deal') {
                payload.websiteMetadata = {
                    ...entityData.websiteMetadata,
                    featuredImage: heroImage
                };
            }

            const endpoint = entityType === 'Deal' ? `/deals/${entityId}` : `/inventory/${entityId}`;
            const response = await api.put(endpoint, payload);

            if (response.data && response.data.success) {
                toast.success('Built-up & Furnishing details updated successfully!', { id: toastId });
                if (onSave) onSave();
                onClose();
            } else {
                throw new Error(response.data?.error || 'Failed to update details');
            }
        } catch (error) {
            console.error('[AddBuiltupDetailsModal] Save error:', error);
            toast.error(error.message || 'Failed to save details. Please try again.', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    // Inline CSS Styles for Premium Enterprise Look
    const labelStyle = { fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' };
    const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' };
    const selectStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', background: '#fff', boxSizing: 'border-box' };

    const grandTotalArea = builtupDetails.reduce((sum, row) => {
        const area = parseFloat(row.totalArea) || 0;
        return sum + area;
    }, 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '950px', maxHeight: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                
                {/* Header */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-layer-group" style={{ color: '#2563eb', fontSize: '1.1rem' }}></i>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Add Builtup Details</h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Updating {entityType}: #{entityData.dealId || entityData.unitNo || entityId}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Read-Only Context Block */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Category</span>
                            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>{categoryName}</span>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Project / Block</span>
                            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>{entityData.projectName || 'N/A'} {entityData.block ? `(${entityData.block})` : ''}</span>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Unit No</span>
                            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>{entityData.unitNo || entityData.unitNumber || 'N/A'}</span>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Configuration</span>
                            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>{sizeType || 'N/A'}</span>
                        </div>
                    </div>

                    {/* Sub Category & Builtup Type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <label style={labelStyle}>Sub Category</label>
                            <select 
                                style={selectStyle} 
                                value={subCategory} 
                                onChange={e => {
                                    setSubCategory(e.target.value);
                                    setBuiltupType(''); // Reset builtupType when subcategory changes
                                }}
                            >
                                <option value="">Select Sub-Category</option>
                                {subCategories.map(sc => (
                                    <option key={sc} value={sc}>{sc}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Built-up Type</label>
                            <select 
                                style={!subCategory ? { ...selectStyle, background: '#f1f5f9', cursor: 'not-allowed' } : selectStyle} 
                                value={builtupType}
                                disabled={!subCategory}
                                onChange={e => setBuiltupType(e.target.value)}
                            >
                                <option value="">Select Built-up Type</option>
                                {builtUpTypes.map(t => (
                                    <option key={t.name || t} value={t.name || t}>{t.name || t}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Builtup Details Rows */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <label style={{ ...labelStyle, margin: 0 }}>Floor-wise Builtup Details</label>
                            <button 
                                type="button" 
                                onClick={handleAddBuiltupRow} 
                                style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <i className="fas fa-plus"></i> Add Row
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {builtupDetails.map((row, idx) => (
                                <div key={idx} style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr 0.6fr 0.8fr 1.5fr 1.5fr 36px', gap: '10px', alignItems: 'center' }}>
                                    <div>
                                        <select 
                                            style={selectStyle} 
                                            value={row.floor} 
                                            onChange={e => updateBuiltupRow(idx, 'floor', e.target.value)}
                                        >
                                            <option value="">Select Floor</option>
                                            {projectMasterFields?.floors && projectMasterFields.floors.length > 0 ? (
                                                projectMasterFields.floors.map((floorName, floorIdx) => (
                                                    <option key={floorIdx} value={floorName}>
                                                        {floorName}
                                                    </option>
                                                ))
                                            ) : (
                                                <>
                                                    <option value="Ground Floor">Ground Floor</option>
                                                    <option value="First Floor">First Floor</option>
                                                    <option value="Second Floor">Second Floor</option>
                                                    <option value="Third Floor">Third Floor</option>
                                                    <option value="Other">Other</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <select 
                                            style={selectStyle} 
                                            value={row.cluster} 
                                            onChange={e => {
                                                const selectedValue = e.target.value;
                                                updateBuiltupRow(idx, 'cluster', selectedValue);
                                                
                                                // Find matching image to auto-populate imageUrl
                                                const matchedImage = projectImages.find((img, imgIdx) => {
                                                    const imgTitle = img.title || `${img.category || 'Plan'} ${imgIdx + 1}`;
                                                    return imgTitle === selectedValue || img.category === selectedValue;
                                                });
                                                if (matchedImage && matchedImage.url) {
                                                    updateBuiltupRow(idx, 'imageUrl', matchedImage.url);
                                                    setHeroImage(prev => prev ? prev : matchedImage.url);
                                                }
                                            }}
                                        >
                                            <option value="">Select Plan</option>
                                            {/* Render configured layout types from Settings > Project > Images */}
                                            {projectMasterFields?.images && projectMasterFields.images.length > 0 && (
                                                <optgroup label="Configured Layout Types (Settings)">
                                                    {projectMasterFields.images.map((imgName, imgIdx) => (
                                                        <option key={`cfg-${imgIdx}`} value={imgName}>
                                                            {imgName}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            {/* Render uploaded project media gallery images */}
                                            {projectImages && projectImages.length > 0 && (
                                                <optgroup label="Project Gallery Images">
                                                    {projectImages.map((img, imgIdx) => {
                                                        const displayName = img.title || `${img.category || 'Plan'} ${imgIdx + 1}`;
                                                        return (
                                                            <option key={`media-${imgIdx}`} value={displayName}>
                                                                {displayName}
                                                            </option>
                                                        );
                                                    })}
                                                </optgroup>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <input type="number" style={inputStyle} placeholder="Width" value={row.width} onChange={e => updateBuiltupRow(idx, 'width', e.target.value)} />
                                    </div>
                                    <div>
                                        <input type="number" style={inputStyle} placeholder="Length" value={row.length} onChange={e => updateBuiltupRow(idx, 'length', e.target.value)} />
                                    </div>
                                    <div style={{ fontSize: '0.8rem', background: '#e2e8f0', padding: '8px 12px', borderRadius: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '38px', boxSizing: 'border-box' }}>
                                        {row.totalArea ? `${row.totalArea} SqFt` : '-'}
                                    </div>
                                    
                                    {/* Image Column */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {row.imageUrl ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                                <a href={row.imageUrl} target="_blank" rel="noreferrer" title="Click to view full image">
                                                    <img 
                                                        src={row.imageUrl} 
                                                        alt={`Floor ${idx + 1}`} 
                                                        style={{ width: '38px', height: '38px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #cbd5e1', cursor: 'zoom-in' }} 
                                                    />
                                                </a>
                                                <button 
                                                    type="button" 
                                                    onClick={() => toggleHeroImage(row.imageUrl)} 
                                                    style={row.imageUrl === heroImage ? {
                                                        border: 'none', background: '#fef3c7', color: '#d97706', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
                                                    } : {
                                                        border: 'none', background: '#f1f5f9', color: '#94a3b8', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                    title={row.imageUrl === heroImage ? "Featured Hero Image (Active)" : "Set as Featured Hero Image"}
                                                >
                                                    <i className={row.imageUrl === heroImage ? "fas fa-star" : "far fa-star"} style={{ fontSize: '0.75rem' }}></i>
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => {
                                                        if (row.imageUrl === heroImage) {
                                                            setHeroImage('');
                                                        }
                                                        updateBuiltupRow(idx, 'imageUrl', '');
                                                    }} 
                                                    style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                    title="Remove image"
                                                >
                                                    <i className="fas fa-trash-alt" style={{ fontSize: '0.75rem' }}></i>
                                                </button>
                                            </div>
                                        ) : row.uploading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#2563eb' }}>
                                                <i className="fas fa-spinner fa-spin"></i> Uploading...
                                            </div>
                                        ) : (
                                            <div>
                                                <label 
                                                    htmlFor={`file-input-${idx}`}
                                                    style={{ 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '6px', 
                                                        padding: '8px 12px', 
                                                        background: '#fff', 
                                                        border: '1px dashed #cbd5e1', 
                                                        borderRadius: '6px', 
                                                        fontSize: '0.75rem', 
                                                        fontWeight: 600, 
                                                        color: '#64748b', 
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <i className="fas fa-cloud-upload-alt"></i> Upload Image
                                                </label>
                                                <input 
                                                    id={`file-input-${idx}`}
                                                    type="file" 
                                                    accept="image/*" 
                                                    onChange={e => handleImageUpload(idx, e.target.files[0])} 
                                                    style={{ display: 'none' }} 
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Video Column */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {row.videoUrl ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                                <a href={row.videoUrl} target="_blank" rel="noreferrer" title="Click to view walkthrough video" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }}>
                                                    <i className="fas fa-video" style={{ fontSize: '0.9rem' }}></i>
                                                </a>
                                                <button 
                                                    type="button" 
                                                    onClick={() => updateBuiltupRow(idx, 'videoUrl', '')} 
                                                    style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                    title="Remove video"
                                                >
                                                    <i className="fas fa-trash-alt" style={{ fontSize: '0.75rem' }}></i>
                                                </button>
                                            </div>
                                        ) : row.videoUploading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#2563eb' }}>
                                                <i className="fas fa-spinner fa-spin"></i> Uploading...
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <label 
                                                    htmlFor={`video-input-${idx}`}
                                                    style={{ 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '6px', 
                                                        padding: '8px 10px', 
                                                        background: '#fff', 
                                                        border: '1px dashed #cbd5e1', 
                                                        borderRadius: '6px', 
                                                        fontSize: '0.75rem', 
                                                        fontWeight: 600, 
                                                        color: '#64748b', 
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    title="Upload Video Walkthrough"
                                                >
                                                    <i className="fas fa-file-video"></i> Upload
                                                </label>
                                                <input 
                                                    id={`video-input-${idx}`}
                                                    type="file" 
                                                    accept="video/*" 
                                                    onChange={e => handleVideoUpload(idx, e.target.files[0])} 
                                                    style={{ display: 'none' }} 
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddVideoUrlPrompt(idx)}
                                                    style={{ 
                                                        padding: '8px 10px', 
                                                        background: '#f8fafc', 
                                                        border: '1px solid #cbd5e1', 
                                                        borderRadius: '6px', 
                                                        color: '#64748b', 
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    title="Add Video Link"
                                                >
                                                    <i className="fas fa-link" style={{ fontSize: '0.75rem' }}></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveBuiltupRow(idx)} 
                                        disabled={builtupDetails.length === 1}
                                        style={builtupDetails.length === 1 ? {
                                            width: '38px', height: '38px', background: '#f1f5f9', color: '#94a3b8', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        } : {
                                            width: '38px', height: '38px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}

                            {builtupDetails.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: '4px solid #2563eb', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Total Floors/Rows:</span>
                                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>{builtupDetails.length}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Grand Total Area:</span>
                                        <span style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>{grandTotalArea.toFixed(2)} SqFt</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Possession Status, Occupation Date, Age of Construction, Walkthrough Video */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div>
                            <label style={labelStyle}>Possession Status</label>
                            <select style={selectStyle} value={possessionStatus} onChange={e => setPossessionStatus(e.target.value)}>
                                <option value="">Select Status</option>
                                <option value="Ready to Move">Ready to Move</option>
                                <option value="Under Construction">Under Construction</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Occupation Date</label>
                            <input type="date" style={inputStyle} value={occupationDate} onChange={e => setOccupationDate(e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle}>Age of Construction</label>
                            <input type="text" style={inputStyle} placeholder="e.g. 5 Years" value={ageOfConstruction} onChange={e => setAgeOfConstruction(e.target.value)} />
                        </div>
                        <div>
                            <label style={labelStyle}>Walkthrough Video</label>
                            {builtupVideoUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', minHeight: '42px', boxSizing: 'border-box' }}>
                                    <a href={builtupVideoUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#16a34a', fontWeight: 600, fontSize: '0.8rem' }}>
                                        <i className="fas fa-video"></i> View Video
                                    </a>
                                    <button 
                                        type="button" 
                                        onClick={() => setBuiltupVideoUrl('')} 
                                        style={{ marginLeft: 'auto', border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        title="Remove Video"
                                    >
                                        <i className="fas fa-trash-alt" style={{ fontSize: '0.75rem' }}></i>
                                    </button>
                                </div>
                            ) : overallVideoUploading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', fontSize: '0.8rem', minHeight: '42px' }}>
                                    <i className="fas fa-spinner fa-spin"></i> Uploading...
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <label 
                                        htmlFor="overall-video-upload"
                                        style={{ 
                                            flex: 1,
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            gap: '6px', 
                                            padding: '10px 12px', 
                                            background: '#fff', 
                                            border: '1px dashed #cbd5e1', 
                                            borderRadius: '8px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 600, 
                                            color: '#64748b', 
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        <i className="fas fa-cloud-upload-alt"></i> Upload
                                    </label>
                                    <input 
                                        id="overall-video-upload"
                                        type="file" 
                                        accept="video/*" 
                                        onChange={e => handleOverallVideoUpload(e.target.files[0])} 
                                        style={{ display: 'none' }} 
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const url = window.prompt("Enter walkthrough video URL (e.g. YouTube or Drive link):");
                                            if (url !== null) setBuiltupVideoUrl(url.trim());
                                        }}
                                        style={{ 
                                            padding: '10px 12px', 
                                            background: '#f8fafc', 
                                            border: '1px solid #cbd5e1', 
                                            borderRadius: '8px', 
                                            color: '#64748b', 
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        title="Add Video Link"
                                    >
                                        <i className="fas fa-link"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Furnishing Status */}
                    <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                            <div>
                                <label style={labelStyle}>Furnish Status</label>
                                <select style={selectStyle} value={furnishType} onChange={e => setFurnishType(e.target.value)}>
                                    <option value="">Select Furnish Status</option>
                                    <option>Fully Furnished</option>
                                    <option>Semi Furnished</option>
                                    <option>Unfurnished</option>
                                </select>
                            </div>
                            
                            {furnishType && furnishType !== 'Unfurnished' && (
                                <div>
                                    <label style={labelStyle}>Furnished Items</label>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input 
                                            type="text" 
                                            style={inputStyle} 
                                            placeholder="Type item & press Enter or click Add" 
                                            value={currentFurnishedItem}
                                            onChange={e => setCurrentFurnishedItem(e.target.value)}
                                            onKeyDown={handleFurnishedItemKeyDown}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={handleAddFurnishedItem}
                                            style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {furnishedItems.map((item, idx) => (
                                            <span key={idx} style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1' }}>
                                                {item}
                                                <i className="fas fa-times" onClick={() => removeFurnishedItem(item)} style={{ cursor: 'pointer', fontSize: '0.7rem', color: '#94a3b8' }}></i>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button 
                        onClick={onClose} 
                        disabled={loading}
                        style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={loading}
                        style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i> Saving...
                            </>
                        ) : 'Save Details'}
                    </button>
                </div>
            </div>
        </div>
    );
}
