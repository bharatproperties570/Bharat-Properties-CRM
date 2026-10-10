import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { Modal, Button, Input } from './ui';

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
                window.dispatchEvent(new CustomEvent('note-added', { detail: { entityId, entityType } }));
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

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
            </Button>
            <Button
                variant="primary"
                onClick={handleSave}
                loading={isSaving}
                style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.2)'
                }}
            >
                Save Note
            </Button>
        </>
    );

    const titleContent = (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-sticky-note" style={{ color: '#f59e0b' }}></i> Add Quick Note
        </span>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={titleContent}
            footer={footer}
            size="sm"
        >
            <Input
                type="textarea"
                label="NOTE CONTENT"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Type your note here..."
                autoFocus
                style={{
                    minHeight: '120px',
                    lineHeight: '1.5'
                }}
                className="focus:border-amber-500 focus:ring-4 focus:ring-amber-50/50"
            />
        </Modal>
    );
};

export default AddNoteModal;
