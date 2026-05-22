import { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { fixDriveUrl, getYoutubeId } from '../utils/helpers';
import toast from 'react-hot-toast';

// Helper: Get YouTube Thumbnail
const getYouTubeThumbnail = (url) => {
    const ytId = getYoutubeId(url);
    if (ytId) {
        return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    }
    return null;
};

const UploadModal = ({ isOpen, onClose, onSave, project = null, type = 'project', entityId = null, entityType = null, onSuccess = null }) => {
    const [formData, setFormData] = useState({
        projectImages: [],
        projectVideos: []
    });
    
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({}); // { [fileIndex]: 'idle' | 'uploading' | 'success' | 'failed' }
    const fileInputRef = useRef(null);

    // Dynamic Entity Type and Directory Name Resolution
    const isInventory = entityType === 'Inventory' || entityType === 'Property' || type === 'property' || type === 'inventory';
    const resolvedEntityType = isInventory ? 'Properties' : 'Projects';
    
    // Resolve clean property / project name
    const resolvedEntityName = isInventory 
        ? `${project?.unitNo || project?.unitNumber || project?.id || 'Property'} - ${project?.projectName || project?.projectId?.name || 'Unknown Project'}`
        : `${project?.name || 'Unknown Project'}`;

    useEffect(() => {
        if (isOpen) {
            const initialImages = project?.inventoryImages || project?.projectImages || [];
            const initialVideos = project?.inventoryVideos || project?.projectVideos || [];

            setFormData({
                projectImages: initialImages.length > 0 
                    ? initialImages.map(img => ({ ...img, file: null, previewUrl: null })) 
                    : [],
                projectVideos: initialVideos.length > 0 
                    ? initialVideos.map(vid => ({ ...vid, file: null })) 
                    : []
            });
            setUploadProgress({});
        }
    }, [isOpen, project]);

    if (!isOpen) return null;

    // --- Dynamic Drag & Drop Handling ---
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const processFiles = (files) => {
        const newImages = [];
        const newVideos = [];

        Array.from(files).forEach(file => {
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            const formattedTitle = fileNameWithoutExt
                .replace(/[-_]/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

            if (file.type.startsWith('image/')) {
                newImages.push({
                    title: formattedTitle,
                    category: 'Main',
                    file: file,
                    previewUrl: URL.createObjectURL(file)
                });
            } else if (file.type.startsWith('video/')) {
                newVideos.push({
                    title: formattedTitle,
                    type: 'Upload',
                    url: '',
                    file: file
                });
            }
        });

        if (newImages.length > 0 || newVideos.length > 0) {
            setFormData(prev => ({
                projectImages: [...prev.projectImages, ...newImages],
                projectVideos: [...prev.projectVideos, ...newVideos]
            }));
            toast.success(`Loaded ${newImages.length} Images and ${newVideos.length} Videos. Fill details & Save!`);
        } else {
            toast.error("Unsupported file format! Please upload images or videos.");
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    const handleFileInputChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    };

    // --- Action Handlers ---
    const addImageRow = () => {
        setFormData(prev => ({
            ...prev,
            projectImages: [...prev.projectImages, { title: '', category: 'Main', file: null, previewUrl: null }]
        }));
    };

    const addVideoRow = () => {
        setFormData(prev => ({
            ...prev,
            projectVideos: [...prev.projectVideos, { title: '', type: 'YouTube', url: '', file: null }]
        }));
    };

    const removeImageRow = (index) => {
        setFormData(prev => ({
            ...prev,
            projectImages: prev.projectImages.filter((_, i) => i !== index)
        }));
        // Clean up object URL to prevent memory leak
        const img = formData.projectImages[index];
        if (img?.previewUrl) {
            URL.revokeObjectURL(img.previewUrl);
        }
    };

    const removeVideoRow = (index) => {
        setFormData(prev => ({
            ...prev,
            projectVideos: prev.projectVideos.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        // Validation: Must have at least something or confirm empty
        if (formData.projectImages.length === 0 && formData.projectVideos.length === 0) {
            const confirmEmpty = window.confirm("No media rows present. Saving will clear all existing images and videos. Do you want to proceed?");
            if (!confirmEmpty) return;
        }

        const toastId = toast.loading('Uploading assets securely to Google Drive...');

        try {
            // 1. Process and Upload Images sequentially/concurrently
            const updatedImages = await Promise.all(formData.projectImages.map(async (img, index) => {
                if (img.file) {
                    setUploadProgress(prev => ({ ...prev, [`img-${index}`]: 'uploading' }));
                    const uploadData = new FormData();
                    uploadData.append('file', img.file);
                    uploadData.append('entityType', resolvedEntityType);
                    uploadData.append('entityName', resolvedEntityName);
                    uploadData.append('docCategory', 'Media');
                    uploadData.append('docType', 'Images');
                    
                    try {
                        const res = await api.post('/upload', uploadData);
                        if (res.data && res.data.success) {
                            setUploadProgress(prev => ({ ...prev, [`img-${index}`]: 'success' }));
                            return { title: img.title || 'Untitled', category: img.category || 'Main', url: res.data.url };
                        }
                    } catch (err) {
                        setUploadProgress(prev => ({ ...prev, [`img-${index}`]: 'failed' }));
                        throw err;
                    }
                }
                // Return already uploaded image without file object
                return img.url ? { title: img.title || 'Untitled', category: img.category || 'Main', url: img.url } : null;
            }));

            // 2. Process and Upload Videos
            const updatedVideos = await Promise.all(formData.projectVideos.map(async (vid, index) => {
                if (vid.type === 'Upload' && vid.file) {
                    setUploadProgress(prev => ({ ...prev, [`vid-${index}`]: 'uploading' }));
                    const uploadData = new FormData();
                    uploadData.append('file', vid.file);
                    uploadData.append('entityType', resolvedEntityType);
                    uploadData.append('entityName', resolvedEntityName);
                    uploadData.append('docCategory', 'Media');
                    uploadData.append('docType', 'Videos');
                    
                    try {
                        const res = await api.post('/upload', uploadData);
                        if (res.data && res.data.success) {
                            setUploadProgress(prev => ({ ...prev, [`vid-${index}`]: 'success' }));
                            return { title: vid.title || 'Untitled', type: 'Upload', url: res.data.url };
                        }
                    } catch (err) {
                        setUploadProgress(prev => ({ ...prev, [`vid-${index}`]: 'failed' }));
                        throw err;
                    }
                }
                
                // YouTube link or already uploaded video
                return vid.url ? { title: vid.title || 'Untitled', type: vid.type, url: vid.url } : null;
            }));

            const finalData = {
                images: updatedImages.filter(Boolean),
                videos: updatedVideos.filter(Boolean)
            };

            // Bridge logic for Inventory vs Project
            if (onSave) {
                // Projects Page save
                onSave(finalData);
            } else if ((entityType === 'Inventory' || entityType === 'Property') && entityId) {
                // Direct update for Inventory 
                const payload = {
                    inventoryImages: finalData.images,
                    inventoryVideos: finalData.videos
                };

                await api.put(`inventory/${entityId}`, payload);
                if (onSuccess) onSuccess();
            }

            toast.success('Media vault synchronized successfully!', { id: toastId });
            onClose();
        } catch (error) {
            console.error("Upload error:", error);
            toast.error(error.response?.data?.error || error.message || "Failed to sync media", { id: toastId });
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modalContainer} className="animate-slideIn">
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={styles.headerIconWrapper}>
                            <i className="fas fa-photo-video" style={{ color: '#6366f1', fontSize: '1.2rem' }}></i>
                        </div>
                        <div>
                            <h2 style={styles.title}>Media & Marketing Vault</h2>
                            <p style={styles.subtitle}>
                                Sync premium photos and video walkthroughs for: <span style={styles.entityNameBadge}>{resolvedEntityName}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} style={styles.closeBtn} title="Close Modal">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body Content */}
                <div style={styles.body}>
                    {/* Bulk Drag-and-Drop Vault Zone */}
                    <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            ...styles.dropzone,
                            backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.06)' : 'rgba(248, 250, 252, 0.6)',
                            borderColor: isDragging ? '#6366f1' : '#cbd5e1'
                        }}
                    >
                        <input 
                            type="file" 
                            multiple 
                            accept="image/*,video/*" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={handleFileInputChange}
                        />
                        <div style={styles.dropzoneIconWrapper}>
                            <i className="fas fa-cloud-upload-alt" style={{ color: isDragging ? '#6366f1' : '#94a3b8', fontSize: '2rem' }}></i>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                                Drag & Drop Multiple Images/Videos
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                or <span style={{ color: '#6366f1', fontWeight: 600 }}>browse files</span> to batch upload to Google Drive
                            </p>
                        </div>
                    </div>

                    {/* Section 1: Images */}
                    <div style={styles.sectionCard}>
                        <div style={styles.sectionHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-images" style={{ color: '#6366f1' }}></i>
                                <span style={styles.sectionTitle}>Image Gallery</span>
                                <span style={styles.counterBadge}>{formData.projectImages.length}</span>
                            </div>
                            <button onClick={addImageRow} style={styles.addBtn}>
                                <i className="fas fa-plus"></i> Add Row
                            </button>
                        </div>

                        {formData.projectImages.length === 0 ? (
                            <div style={styles.emptyState}>
                                <i className="far fa-image" style={styles.emptyStateIcon}></i>
                                <span>No images uploaded yet. Drag files above or click Add Row.</span>
                            </div>
                        ) : (
                            <div style={styles.rowsContainer}>
                                {formData.projectImages.map((img, idx) => {
                                    const progress = uploadProgress[`img-${idx}`];
                                    return (
                                        <div key={idx} style={styles.rowGrid} className="fade-in">
                                            {/* Preview Thumbnail */}
                                            <div style={styles.thumbnailWrapper}>
                                                {img.previewUrl || img.url ? (
                                                    <img 
                                                        src={img.previewUrl || fixDriveUrl(img.url)} 
                                                        alt="preview" 
                                                        style={styles.thumbnail}
                                                        onClick={() => window.open(img.previewUrl || fixDriveUrl(img.url), '_blank')}
                                                        title="Click to view full image"
                                                    />
                                                ) : (
                                                    <i className="far fa-image" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                                                )}
                                                {progress === 'uploading' && <div style={styles.uploadSpinnerOverlay}><i className="fas fa-circle-notch fa-spin"></i></div>}
                                                {progress === 'success' && <div style={{...styles.uploadSpinnerOverlay, background: 'rgba(34, 197, 94, 0.8)'}}><i className="fas fa-check"></i></div>}
                                                {progress === 'failed' && <div style={{...styles.uploadSpinnerOverlay, background: 'rgba(239, 68, 68, 0.8)'}}><i className="fas fa-exclamation-triangle"></i></div>}
                                            </div>

                                            {/* Image Title */}
                                            <div style={{ flex: 2 }}>
                                                <label style={styles.fieldLabel}>Image Title</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Living Room, Master Bedroom, Layout..."
                                                    value={img.title || ''}
                                                    style={styles.textInput}
                                                    onChange={(e) => {
                                                        const copy = [...formData.projectImages];
                                                        copy[idx].title = e.target.value;
                                                        setFormData(prev => ({ ...prev, projectImages: copy }));
                                                    }}
                                                />
                                            </div>

                                            {/* Image Category */}
                                            <div style={{ flex: 1.2 }}>
                                                <label style={styles.fieldLabel}>Category</label>
                                                <select 
                                                    value={img.category || 'Main'}
                                                    style={styles.selectInput}
                                                    onChange={(e) => {
                                                        const copy = [...formData.projectImages];
                                                        copy[idx].category = e.target.value;
                                                        setFormData(prev => ({ ...prev, projectImages: copy }));
                                                    }}
                                                >
                                                    <option>Main</option>
                                                    <option>Bedroom</option>
                                                    <option>Kitchen</option>
                                                    <option>Bathroom</option>
                                                    <option>Exterior</option>
                                                    <option>Layout Plan</option>
                                                    <option>Other</option>
                                                </select>
                                            </div>

                                            {/* File Picker Indicator */}
                                            <div style={{ flex: 1.5 }}>
                                                <label style={styles.fieldLabel}>Source File</label>
                                                <label style={styles.filePickerLabel}>
                                                    {img.file ? (
                                                        <span style={{ color: '#1e293b', fontWeight: 600 }}><i className="fas fa-file-image"></i> {img.file.name}</span>
                                                    ) : img.url ? (
                                                        <span style={{ color: '#22c55e' }}><i className="fas fa-cloud"></i> Google Drive Cloud</span>
                                                    ) : (
                                                        <span><i className="fas fa-upload"></i> Choose Image</span>
                                                    )}
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const copy = [...formData.projectImages];
                                                                copy[idx].file = file;
                                                                copy[idx].previewUrl = URL.createObjectURL(file);
                                                                if (!copy[idx].title) {
                                                                    copy[idx].title = file.name.substring(0, file.name.lastIndexOf('.'));
                                                                }
                                                                setFormData(prev => ({ ...prev, projectImages: copy }));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>

                                            {/* Remove Button */}
                                            <button 
                                                type="button" 
                                                onClick={() => removeImageRow(idx)}
                                                style={styles.deleteBtn}
                                                title="Delete this row"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Section 2: Videos */}
                    <div style={styles.sectionCard}>
                        <div style={styles.sectionHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-video" style={{ color: '#ef4444' }}></i>
                                <span style={styles.sectionTitle}>Video Walkthroughs & YouTube URLs</span>
                                <span style={styles.counterBadge}>{formData.projectVideos.length}</span>
                            </div>
                            <button onClick={addVideoRow} style={styles.addBtn}>
                                <i className="fas fa-plus"></i> Add Row
                            </button>
                        </div>

                        {formData.projectVideos.length === 0 ? (
                            <div style={styles.emptyState}>
                                <i className="far fa-play-circle" style={styles.emptyStateIcon}></i>
                                <span>No videos or virtual tours linked. Add a YouTube link or drag video files above.</span>
                            </div>
                        ) : (
                            <div style={styles.rowsContainer}>
                                {formData.projectVideos.map((vid, idx) => {
                                    const progress = uploadProgress[`vid-${idx}`];
                                    const hasYTThumb = vid.type === 'YouTube' && getYouTubeThumbnail(vid.url);
                                    return (
                                        <div key={idx} style={styles.rowGrid} className="fade-in">
                                            {/* Video Thumbnail */}
                                            <div style={styles.thumbnailWrapper}>
                                                {hasYTThumb ? (
                                                    <img 
                                                        src={getYouTubeThumbnail(vid.url)} 
                                                        alt="YT thumb" 
                                                        style={styles.thumbnail}
                                                        onClick={() => window.open(vid.url, '_blank')}
                                                        title="Watch on YouTube"
                                                    />
                                                ) : vid.file ? (
                                                    <div style={styles.videoFileBadge}><i className="fas fa-file-video" style={{ fontSize: '1.2rem', color: '#6366f1' }}></i><span style={{ fontSize: '0.55rem', fontWeight: 700 }}>VIDEO FILE</span></div>
                                                ) : vid.url ? (
                                                    <div style={styles.videoFileBadge}><i className="fas fa-cloud-video" style={{ fontSize: '1.2rem', color: '#22c55e' }}></i><span style={{ fontSize: '0.55rem', fontWeight: 700 }}>DRIVE MP4</span></div>
                                                ) : (
                                                    <i className="fas fa-video" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                                                )}
                                                {progress === 'uploading' && <div style={styles.uploadSpinnerOverlay}><i className="fas fa-circle-notch fa-spin"></i></div>}
                                                {progress === 'success' && <div style={{...styles.uploadSpinnerOverlay, background: 'rgba(34, 197, 94, 0.8)'}}><i className="fas fa-check"></i></div>}
                                                {progress === 'failed' && <div style={{...styles.uploadSpinnerOverlay, background: 'rgba(239, 68, 68, 0.8)'}}><i className="fas fa-exclamation-triangle"></i></div>}
                                            </div>

                                            {/* Video Title */}
                                            <div style={{ flex: 2 }}>
                                                <label style={styles.fieldLabel}>Video Title</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Virtual Tour, Walkthrough..."
                                                    value={vid.title || ''}
                                                    style={styles.textInput}
                                                    onChange={(e) => {
                                                        const copy = [...formData.projectVideos];
                                                        copy[idx].title = e.target.value;
                                                        setFormData(prev => ({ ...prev, projectVideos: copy }));
                                                    }}
                                                />
                                            </div>

                                            {/* Video Type selector */}
                                            <div style={{ flex: 1.2 }}>
                                                <label style={styles.fieldLabel}>Video Type</label>
                                                <select 
                                                    value={vid.type || 'YouTube'}
                                                    style={styles.selectInput}
                                                    onChange={(e) => {
                                                        const copy = [...formData.projectVideos];
                                                        copy[idx].type = e.target.value;
                                                        copy[idx].url = '';
                                                        copy[idx].file = null;
                                                        setFormData(prev => ({ ...prev, projectVideos: copy }));
                                                    }}
                                                >
                                                    <option value="YouTube">YouTube URL</option>
                                                    <option value="Upload">File Upload</option>
                                                </select>
                                            </div>

                                            {/* Conditional Field (URL or File Upload) */}
                                            <div style={{ flex: 2.2 }}>
                                                {vid.type === 'YouTube' ? (
                                                    <>
                                                        <label style={styles.fieldLabel}>YouTube Link</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="https://youtube.com/watch?v=..."
                                                            value={vid.url || ''}
                                                            style={styles.textInput}
                                                            onChange={(e) => {
                                                                const copy = [...formData.projectVideos];
                                                                copy[idx].url = e.target.value;
                                                                setFormData(prev => ({ ...prev, projectVideos: copy }));
                                                            }}
                                                        />
                                                    </>
                                                ) : (
                                                    <>
                                                        <label style={styles.fieldLabel}>Choose Video File</label>
                                                        <label style={styles.filePickerLabel}>
                                                            {vid.file ? (
                                                                <span style={{ color: '#1e293b', fontWeight: 600 }}><i className="fas fa-file-video"></i> {vid.file.name}</span>
                                                            ) : vid.url ? (
                                                                <span style={{ color: '#22c55e' }}><i className="fas fa-cloud"></i> Google Drive Cloud</span>
                                                            ) : (
                                                                <span><i className="fas fa-upload"></i> Choose Video</span>
                                                            )}
                                                            <input 
                                                                type="file" 
                                                                accept="video/*" 
                                                                style={{ display: 'none' }}
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        const copy = [...formData.projectVideos];
                                                                        copy[idx].file = file;
                                                                        if (!copy[idx].title) {
                                                                            copy[idx].title = file.name.substring(0, file.name.lastIndexOf('.'));
                                                                        }
                                                                        setFormData(prev => ({ ...prev, projectVideos: copy }));
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    </>
                                                )}
                                            </div>

                                            {/* Remove Button */}
                                            <button 
                                                type="button" 
                                                onClick={() => removeVideoRow(idx)}
                                                style={styles.deleteBtn}
                                                title="Delete this row"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div style={styles.footer}>
                    <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                    <button onClick={handleSave} style={styles.saveBtn}>Save Media Vault</button>
                </div>
            </div>
            
            {/* Inline CSS Animations */}
            <style>{`
                .animate-slideIn {
                    animation: modalSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .fade-in {
                    animation: modalFadeIn 0.3s ease-out;
                }
                @keyframes modalSlideUp {
                    from { opacity: 0; transform: translateY(24px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes modalFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

// --- Enterprise-Grade CSS-in-JS Styles ---
const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backdropFilter: 'blur(6px)',
        padding: '20px'
    },
    modalContainer: {
        background: '#ffffff',
        width: '100%',
        maxWidth: '1100px',
        height: '92vh',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 40px rgba(99, 102, 241, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
    },
    header: {
        padding: '20px 28px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #ffffff, #f8fafc)'
    },
    headerIconWrapper: {
        width: '42px',
        height: '42px',
        background: '#e0e7ff',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    title: {
        fontSize: '1.25rem',
        fontWeight: 800,
        color: '#0f172a',
        margin: 0,
        letterSpacing: '-0.02em'
    },
    subtitle: {
        fontSize: '0.85rem',
        color: '#64748b',
        margin: '3px 0 0 0',
        fontWeight: 500
    },
    entityNameBadge: {
        background: '#eff6ff',
        color: '#1d4ed8',
        padding: '2px 8px',
        borderRadius: '6px',
        fontWeight: 700,
        fontSize: '0.8rem',
        border: '1px solid #bfdbfe',
        marginLeft: '4px'
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: '#94a3b8',
        fontSize: '1.3rem',
        padding: '6px',
        borderRadius: '8px',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    body: {
        flex: 1,
        overflowY: 'auto',
        background: '#f8fafc',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
    },
    dropzone: {
        border: '2px dashed #6366f1',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minHeight: '120px'
    },
    dropzoneIconWrapper: {
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
    },
    sectionCard: {
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '12px'
    },
    sectionTitle: {
        fontSize: '0.95rem',
        fontWeight: 800,
        color: '#1e293b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    counterBadge: {
        background: '#f1f5f9',
        color: '#475569',
        borderRadius: '12px',
        padding: '2px 8px',
        fontSize: '0.75rem',
        fontWeight: 700
    },
    addBtn: {
        background: '#eff6ff',
        color: '#2563eb',
        border: 'none',
        padding: '6px 14px',
        borderRadius: '8px',
        fontSize: '0.8rem',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s'
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 20px',
        color: '#94a3b8',
        fontSize: '0.85rem',
        gap: '8px',
        textAlign: 'center'
    },
    emptyStateIcon: {
        fontSize: '1.8rem',
        color: '#cbd5e1'
    },
    rowsContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
    },
    rowGrid: {
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        background: '#fafbfd',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #f1f5f9'
    },
    thumbnailWrapper: {
        width: '74px',
        height: '56px',
        background: '#f1f5f9',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        cursor: 'pointer'
    },
    uploadSpinnerOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1rem'
    },
    videoFileBadge: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        color: '#64748b'
    },
    fieldLabel: {
        fontSize: '0.75rem',
        fontWeight: 700,
        color: '#64748b',
        display: 'block',
        marginBottom: '5px'
    },
    textInput: {
        width: '100%',
        height: '38px',
        padding: '0 12px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.85rem',
        color: '#1e293b',
        outline: 'none',
        transition: 'all 0.2s',
        boxSizing: 'border-box'
    },
    selectInput: {
        width: '100%',
        height: '38px',
        padding: '0 12px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        fontSize: '0.85rem',
        color: '#1e293b',
        outline: 'none',
        backgroundColor: '#ffffff',
        boxSizing: 'border-box'
    },
    filePickerLabel: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '38px',
        background: '#ffffff',
        border: '1px dashed #cbd5e1',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#64748b',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '0 12px',
        boxSizing: 'border-box',
        transition: 'all 0.2s'
    },
    deleteBtn: {
        height: '38px',
        width: '38px',
        borderRadius: '8px',
        border: 'none',
        background: '#fef2f2',
        color: '#ef4444',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '18px',
        transition: 'all 0.2s'
    },
    footer: {
        padding: '16px 28px',
        borderTop: '1px solid #f1f5f9',
        background: '#f8fafc',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '12px'
    },
    cancelBtn: {
        padding: '10px 22px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        background: '#ffffff',
        color: '#475569',
        fontWeight: 700,
        fontSize: '0.85rem',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    saveBtn: {
        padding: '10px 24px',
        borderRadius: '8px',
        border: 'none',
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        color: '#ffffff',
        fontWeight: 700,
        fontSize: '0.85rem',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
        transition: 'all 0.2s'
    }
};

export default UploadModal;
