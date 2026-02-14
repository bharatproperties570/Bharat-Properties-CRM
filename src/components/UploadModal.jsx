import React, { useState, useRef, useEffect } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

// Helper: Get YouTube Thumbnail
const getYouTubeThumbnail = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        return `https://img.youtube.com/vi/${match[2]}/mqdefault.jpg`;
    }
    return null;
};

const UploadModal = ({ isOpen, onClose, onSave, project = null, type = 'project' }) => {
    const { projectMasterFields } = usePropertyConfig();
    const projectMasterFieldsSafe = projectMasterFields || {};
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const [formData, setFormData] = useState({
        projectDocuments: [],
        projectImages: [],
        projectVideos: []
    });

    useEffect(() => {
        if (isOpen && project) {
            setFormData({
                projectDocuments: project.projectDocuments || [{ documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }],
                projectImages: project.projectImages || [{ title: '', category: 'Main', file: null }],
                projectVideos: project.projectVideos || [{ title: '', type: 'YouTube', url: '', file: null }]
            });
        } else {
            // Default initial state
            setFormData({
                projectDocuments: [{ documentName: '', approvalAuthority: '', registrationNo: '', date: '', file: null }],
                projectImages: [{ title: '', category: 'Main', file: null }],
                projectVideos: [{ title: '', type: 'YouTube', url: '', file: null }]
            });
        }
    }, [isOpen, project]);

    const handleSave = async () => {
        const toastId = toast.loading('Uploading media to Google Drive...');

        try {
            // 1. Upload Images
            const updatedImages = await Promise.all(formData.projectImages.map(async (img) => {
                if (img.file) {
                    const uploadData = new FormData();
                    uploadData.append('file', img.file);
                    const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                    if (res.data && res.data.success) {
                        return { ...img, url: res.data.url, file: null, previewUrl: null };
                    }
                }
                return img;
            }));

            // 2. Upload Videos
            const updatedVideos = await Promise.all(formData.projectVideos.map(async (vid) => {
                if (vid.type === 'Upload' && vid.file) {
                    const uploadData = new FormData();
                    uploadData.append('file', vid.file);
                    const res = await api.post('/upload', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
                    if (res.data && res.data.success) {
                        return { ...vid, url: res.data.url, file: null };
                    }
                }
                return vid;
            }));

            const finalData = {
                ...formData,
                projectImages: updatedImages,
                projectVideos: updatedVideos
            };

            onSave(finalData);
            toast.success('Media uploaded successfully!', { id: toastId });
            onClose();
        } catch (error) {
            console.error("Upload error:", error);
            toast.error(error.response?.data?.error || "Failed to upload media", { id: toastId });
        }
    };

    if (!isOpen) return null;

    // --- Styles ---
    const labelStyle = {
        fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block'
    };
    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
        fontSize: '0.9rem', outline: 'none', color: '#1e293b', transition: 'all 0.2s',
        backgroundColor: '#fff', height: '42px', boxSizing: 'border-box'
    };
    const customSelectStyle = {
        ...inputStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '32px'
    };
    const sectionStyle = {
        background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: '24px'
    };
    const buttonStyle = {
        cancel: { padding: '10px 24px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontWeight: 600, cursor: 'pointer' },
        success: { padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, cursor: 'pointer' }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', width: '95%', maxWidth: '1000px', height: '90vh', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0' }} className="animate-slideIn">

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-cloud-upload-alt" style={{ color: '#2563eb' }}></i>
                            </div>
                            Upload {type === 'project' ? 'Project' : 'Property'} Media
                        </h2>
                        {project && (
                            <span style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px', marginLeft: '42px' }}>
                                For: <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {type === 'property'
                                        ? `${project.unitNo || project.id} - ${project.area || project.location || 'Deal'}`
                                        : project.name}
                                </span>
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FB', padding: '24px' }}>
                    <div className="fade-in">

                        {/* Section 2: Project Images */}
                        <div style={sectionStyle}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-images" style={{ color: '#3b82f6' }}></i> {type === 'project' ? 'Project' : 'Property'} Images
                            </h4>
                            {formData.projectImages.map((img, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '80px 2fr 1.5fr minmax(120px, 1fr) 40px', gap: '16px', marginBottom: '16px', alignItems: 'end' }}>
                                    <div style={{ width: '80px', height: '60px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {img.previewUrl ? (
                                            <img src={img.previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <i className="fas fa-image" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                                        )}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Image Title</label>
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            placeholder="e.g. Living Room, Exterior"
                                            value={img.title}
                                            onChange={(e) => {
                                                const newImages = [...formData.projectImages];
                                                newImages[index].title = e.target.value;
                                                setFormData({ ...formData, projectImages: newImages });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Category</label>
                                        <select
                                            style={customSelectStyle}
                                            value={img.category}
                                            onChange={(e) => {
                                                const newImages = [...formData.projectImages];
                                                newImages[index].category = e.target.value;
                                                setFormData({ ...formData, projectImages: newImages });
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
                                    <div>
                                        <label style={labelStyle}>File</label>
                                        <label style={{
                                            width: '100%',
                                            height: '42px',
                                            background: '#f8fafc',
                                            border: '1px dashed #cbd5e1',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem',
                                            color: '#64748b',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            padding: '0 8px'
                                        }}>
                                            {img.file ? (img.file.name || 'File Selected') : 'Upload Image'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ display: 'none' }}
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const newImages = [...formData.projectImages];
                                                        newImages[index].file = file;
                                                        newImages[index].previewUrl = URL.createObjectURL(file);
                                                        setFormData({ ...formData, projectImages: newImages });
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (index === 0) {
                                                setFormData({
                                                    ...formData,
                                                    projectImages: [...formData.projectImages, { title: '', category: 'Main', file: null }]
                                                });
                                            } else {
                                                const newImages = formData.projectImages.filter((_, i) => i !== index);
                                                setFormData({ ...formData, projectImages: newImages });
                                            }
                                        }}
                                        style={{
                                            height: '42px',
                                            width: '40px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: index === 0 ? '#eff6ff' : '#fef2f2',
                                            color: index === 0 ? '#3b82f6' : '#ef4444',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Section 3: Project Videos */}
                        <div style={sectionStyle}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-video" style={{ color: '#ef4444' }}></i> {type === 'project' ? 'Project' : 'Property'} Videos & YouTube Links
                            </h4>
                            {formData.projectVideos.map((vid, index) => (
                                <div key={index} style={{ display: 'grid', gridTemplateColumns: '80px 1.5fr 1fr 2fr 40px', gap: '16px', marginBottom: '16px', alignItems: 'end' }}>
                                    <div style={{ width: '80px', height: '60px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {vid.type === 'YouTube' && getYouTubeThumbnail(vid.url) ? (
                                            <img src={getYouTubeThumbnail(vid.url)} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : vid.file ? (
                                            <div style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center' }}>Video File</div>
                                        ) : (
                                            <i className="fas fa-video" style={{ color: '#cbd5e1', fontSize: '1.2rem' }}></i>
                                        )}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Video Title</label>
                                        <input
                                            type="text"
                                            style={inputStyle}
                                            placeholder="e.g. Tour, Feature"
                                            value={vid.title}
                                            onChange={(e) => {
                                                const newVideos = [...formData.projectVideos];
                                                newVideos[index].title = e.target.value;
                                                setFormData({ ...formData, projectVideos: newVideos });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Type</label>
                                        <select
                                            style={customSelectStyle}
                                            value={vid.type}
                                            onChange={(e) => {
                                                const newVideos = [...formData.projectVideos];
                                                newVideos[index].type = e.target.value;
                                                newVideos[index].url = '';
                                                newVideos[index].file = null;
                                                setFormData({ ...formData, projectVideos: newVideos });
                                            }}
                                        >
                                            <option value="YouTube">YouTube Link</option>
                                            <option value="Upload">File Upload</option>
                                        </select>
                                    </div>
                                    <div>
                                        {vid.type === 'YouTube' ? (
                                            <>
                                                <label style={labelStyle}>YouTube URL</label>
                                                <input
                                                    type="text"
                                                    style={inputStyle}
                                                    placeholder="https://youtube.com/watch?v=..."
                                                    value={vid.url}
                                                    onChange={(e) => {
                                                        const newVideos = [...formData.projectVideos];
                                                        newVideos[index].url = e.target.value;
                                                        setFormData({ ...formData, projectVideos: newVideos });
                                                    }}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <label style={labelStyle}>Video File</label>
                                                <label style={{
                                                    width: '100%',
                                                    height: '42px',
                                                    background: '#f8fafc',
                                                    border: '1px dashed #cbd5e1',
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    color: '#64748b',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    padding: '0 8px'
                                                }}>
                                                    {vid.file ? (vid.file.name || 'File Selected') : 'Upload Video'}
                                                    <input
                                                        type="file"
                                                        accept="video/*"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => {
                                                            const file = e.target.files[0];
                                                            if (file) {
                                                                const newVideos = [...formData.projectVideos];
                                                                newVideos[index].file = file;
                                                                setFormData({ ...formData, projectVideos: newVideos });
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (index === 0) {
                                                setFormData({
                                                    ...formData,
                                                    projectVideos: [...formData.projectVideos, { title: '', type: 'YouTube', url: '', file: null }]
                                                });
                                            } else {
                                                const newVideos = formData.projectVideos.filter((_, i) => i !== index);
                                                setFormData({ ...formData, projectVideos: newVideos });
                                            }
                                        }}
                                        style={{
                                            height: '42px',
                                            width: '40px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: index === 0 ? '#eff6ff' : '#fef2f2',
                                            color: index === 0 ? '#3b82f6' : '#ef4444',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <i className={`fas ${index === 0 ? 'fa-plus' : 'fa-trash'}`}></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                    <button onClick={onClose} style={buttonStyle.cancel}>Cancel</button>
                    <button onClick={handleSave} style={buttonStyle.success}>Save Uploads</button>
                </div>

                <style>{`
                    .grid-2-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
                    .animate-slideIn { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .fade-in { animation: fadeIn 0.3s ease-out; }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
};

export default UploadModal;
