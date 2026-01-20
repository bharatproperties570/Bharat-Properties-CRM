import React from 'react';

const AddUserModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Add User (Stub)</h2>
                <button onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default AddUserModal;
