import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const AddNoteModal = ({ isOpen, onClose, entityId, entityType, onNoteAdded }) => {
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setNote('');
        }
    }, [isOpen]);

    const handleSave = async () => {
        if (!note.trim()) {
            toast.error("Please enter a note");
            return;
        }

        setIsSaving(true);
        try {
            const response = await api.post('activities', {
                entityId,
                entityType,
                type: 'Note',
                subject: 'Quick Note Added',
                description: note,
                status: 'Completed',
                date: new Date().toISOString()
            });

            if (response.data.success) {
                toast.success("Note added successfully");
                if (onNoteAdded) onNoteAdded();
                onClose();
            } else {
                toast.error("Failed to add note");
            }
        } catch (error) {
            console.error("Error adding note:", error);
            toast.error("An error occurred while adding the note");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
        }} onClick={onClose}>
            <div style={{
                background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '450px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden', animation: 'slideUp 0.3s ease-out'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                        <i className="fas fa-sticky-note text-amber-500 mr-2"></i> Add Quick Note
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div style={{ padding: '32px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                        Note Content
                    </label>
                    <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Type your note here..."
                        style={{
                            width: '100%', minHeight: '120px', padding: '16px', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '0.95rem', color: '#1e293b',
                            lineHeight: '1.5', outline: 'none', transition: 'all 0.2s', resize: 'none'
                        }}
                        className="focus:border-amber-500 focus:ring-4 focus:ring-amber-50/50"
                    />
                </div>

                <div style={{ padding: '24px 32px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{
                            padding: '10px 24px', borderRadius: '10px', border: 'none',
                            background: isSaving ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: '#fff', fontWeight: 800, cursor: isSaving ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.2)'
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save Note'}
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default AddNoteModal;
