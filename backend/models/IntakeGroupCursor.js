/**
 * ============================================================
 *  INTAKE GROUP CURSOR MODEL
 *  Enterprise Cursor Tracking for WhatsApp Group → Intake Pipeline
 * ============================================================
 *
 *  Tracks the last processed message index per WhatsApp group
 *  conversation to ensure exactly-once processing semantics.
 *
 *  One document per groupJid — cursor advances monotonically.
 * ============================================================
 */

import mongoose from 'mongoose';

const intakeGroupCursorSchema = new mongoose.Schema({
    groupJid: {
        type: String,
        required: true,
        unique: true,
        index: true,
        description: 'WhatsApp group JID (e.g., 120363xxx@g.us)'
    },
    groupName: {
        type: String,
        default: null,
        description: 'Human-readable group name for admin dashboards'
    },
    whatsappIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppIntegration', index: true },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        description: 'Reference to the Conversation document containing this group'
    },
    lastProcessedIndex: {
        type: Number,
        default: -1,
        description: 'Index of the last processed message in the conversation.messages array. -1 = no messages processed yet.'
    },
    lastProcessedMessageId: {
        type: String,
        default: null,
        description: 'messageId of the last successfully processed message (for verification)'
    },
    lastProcessedAt: {
        type: Date,
        default: null,
        description: 'Timestamp of last successful scan'
    },
    totalProcessed: {
        type: Number,
        default: 0,
        description: 'Running total of messages sent to intake pipeline'
    },
    totalSkipped: {
        type: Number,
        default: 0,
        description: 'Running total of non-property messages skipped'
    },
    is_active: {
        type: Boolean,
        default: true,
        index: true,
        description: 'Admin toggle — false = skip this group during scans'
    },
    scan_frequency_minutes: {
        type: Number,
        default: 5,
        description: 'How often to scan this group (configurable per group)'
    },
    error_log: [{
        timestamp: { type: Date, default: Date.now },
        message: String,
        traceId: String
    }],
    deactivation_reason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Compound index for efficient scanner queries
intakeGroupCursorSchema.index({ is_active: 1, updatedAt: 1 });

const IntakeGroupCursor = mongoose.model('IntakeGroupCursor', intakeGroupCursorSchema);

export default IntakeGroupCursor;
