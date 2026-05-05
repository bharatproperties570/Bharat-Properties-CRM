import { createContext, useContext, useState } from 'react';
import { evaluateSequenceTrigger, calculateStepExecutionTime } from '../utils/sequenceEngine';

const SequenceContext = createContext();

export const SequenceProvider = ({ children }) => {
    // Sequence Definitions (Pre-seeded with examples)
    const [sequences, setSequences] = useState([
        {
            id: 'seq1',
            name: 'New Lead Follow-up',
            module: 'leads',
            purpose: 'New Lead',
            trigger: { type: 'onCreated' },
            active: true,
            steps: [
                { id: 1, day: 0, time: '09:00', type: 'Call', instruction: 'Initial Intro Call' },
                { id: 2, day: 1, time: '10:00', type: 'WhatsApp', instruction: 'Send Introduction PDF' },
                { id: 3, day: 3, time: '11:00', type: 'Call', instruction: 'Follow-up on Interest' },
                { id: 4, day: 5, time: '09:00', type: 'Property Match', instruction: 'Send Top 3 Inventory Matches' },
                { id: 5, day: 7, time: '10:00', type: 'Reminder', instruction: 'Check-in Call' }
            ],
            exitConditions: { onDealCreated: true, onLost: true }
        },
        {
            id: 'seq2',
            name: 'Hot Lead Fast-Track',
            module: 'leads',
            purpose: 'Follow-up',
            trigger: { type: 'onScoreBandEntry', minScore: 80, maxScore: 100 },
            active: true,
            steps: [
                { id: 1, day: 0, time: '09:00', type: 'Call', instruction: 'Immediate Connection' },
                { id: 2, day: 1, time: '09:30', type: 'Site Visit', instruction: 'Schedule Property Visit' }
            ],
            exitConditions: { onDealCreated: true }
        }
    ]);

    // Active Enrollments: Array of enrollment objects
    const [enrollments, setEnrollments] = useState([]);

    // Sequence Execution Logs (for Timeline)
    const [sequenceLogs, setSequenceLogs] = useState([]);

    /**
     * Enroll an entity in a sequence.
     *
     * Enterprise Idempotency Rules:
     *   1. An entity CANNOT be enrolled in the same sequence twice if status is 'active' or 'paused'.
     *      (paused = lead responded; re-enrolling would restart the sequence — incorrect behaviour)
     *   2. Re-enrollment IS allowed if previous enrollment is 'completed' or 'stopped'.
     *      (e.g., lead re-enters a stage or score band after some time)
     *   3. source param stamps the audit log — 'trigger', 'sequence_engine', 'manual'
     *
     * @param {string} entityId
     * @param {string} sequenceId
     * @param {Object} options - { source: 'trigger'|'sequence_engine'|'manual' }
     */
    const enrollInSequence = (entityId, sequenceId, options = {}) => {
        const { source = 'system' } = options;
        const sequence = sequences.find(s => s.id === sequenceId);
        if (!sequence) {
            console.warn(`[SequenceEngine] Cannot enroll: Sequence '${sequenceId}' not found.`);
            return { success: false, reason: 'sequence_not_found' };
        }

        // ── Enterprise Idempotency Guard ──────────────────────────────────────────
        // Block re-enrollment if entity already has an ACTIVE or PAUSED enrollment.
        // 'paused' means the lead responded and sequence is waiting — re-enrolling
        // would reset the sequence and erase the lead's progress, which is incorrect.
        const BLOCKING_STATUSES = ['active', 'paused'];
        const existingEnrollment = enrollments.find(
            e => e.entityId === entityId &&
                 e.sequenceId === sequenceId &&
                 BLOCKING_STATUSES.includes(e.status)
        );

        if (existingEnrollment) {
            console.log(
                `[SequenceEngine] IDEMPOTENCY: Skipped duplicate enrollment.` +
                ` Entity: ${entityId}, Sequence: ${sequence.name}, Source: ${source},` +
                ` Existing status: ${existingEnrollment.status}`
            );
            return { success: false, reason: 'already_enrolled', status: existingEnrollment.status };
        }

        const newEnrollment = {
            id: `enr_${Date.now()}`,
            entityId,
            sequenceId,
            currentStep: 0,
            status: 'active',
            enrolledAt: new Date().toISOString(),
            enrolledBy: source,  // ← Audit: who/what triggered enrollment
            nextStepAt: calculateStepExecutionTime(new Date(), sequence.steps[0].day, sequence.steps[0].time).toISOString(),
            logs: [{
                timestamp: new Date().toISOString(),
                message: `Enrolled in ${sequence.name} via ${source}`,
                event: 'enrolled',
                source
            }]
        };

        setEnrollments(prev => [...prev, newEnrollment]);
        addLog(entityId, sequenceId, 'Enrolled', `Enrolled in ${sequence.name} via ${source}`);
        console.log(`[SequenceEngine] Enrolled entity ${entityId} in '${sequence.name}' (source: ${source})`);
        return { success: true, enrollmentId: newEnrollment.id };
    };

    const updateEnrollmentStatus = (entityId, status) => {
        setEnrollments(prev => prev.map(enrollment => {
            if (enrollment.entityId === entityId && enrollment.status === 'active') {
                return {
                    ...enrollment,
                    status,
                    lastUpdated: new Date().toISOString(),
                    logs: [...(enrollment.logs || []), {
                        timestamp: new Date().toISOString(),
                        message: `Status changed to ${status}`,
                        event: status
                    }]
                };
            }
            return enrollment;
        }));
    };

    const addLog = (entityId, sequenceId, event, details) => {
        setSequenceLogs(prev => [
            { id: Date.now(), entityId, sequenceId, event, details, timestamp: new Date().toISOString() },
            ...prev
        ]);
    };

    /**
     * Evaluate all active sequences and enroll the entity in any that match.
     * Called when a lead/contact is first created or updates to a new stage.
     *
     * Source is stamped as 'sequence_engine' to distinguish from trigger-based
     * or manual enrollments in the audit trail.
     *
     * @param {Object} entity - The lead/contact/deal
     * @param {string} module - 'leads', 'contacts', 'deals'
     */
    const evaluateAndEnroll = (entity, module = 'leads') => {
        const entityId = entity._id || entity.id;
        if (!entityId) {
            console.warn('[SequenceEngine] evaluateAndEnroll called without entity ID — skipped.');
            return;
        }

        const activeSequences = sequences.filter(s => s.active && s.module === module);

        activeSequences.forEach(seq => {
            if (evaluateSequenceTrigger(entity, seq.trigger)) {
                // ── Source stamp: 'sequence_engine' = auto-evaluated by Sequence rules
                enrollInSequence(entityId, seq.id, { source: 'sequence_engine' });
            }
        });
    };

    const addSequence = (newSeq) => {
        setSequences(prev => [...prev, { ...newSeq, id: `seq_${Date.now()}`, active: true, createdAt: new Date().toISOString() }]);
    };

    const updateSequence = (id, updatedData) => {
        setSequences(prev => prev.map(s => s.id === id ? { ...s, ...updatedData, updatedAt: new Date().toISOString() } : s));
    };

    const deleteSequence = (id) => {
        // Check if any active enrollments exist
        const activeEnrollments = enrollments.filter(e => e.sequenceId === id && e.status === 'active');
        if (activeEnrollments.length > 0) {
            return { success: false, message: `Cannot delete: ${activeEnrollments.length} active enrollments exist` };
        }
        setSequences(prev => prev.filter(s => s.id !== id));
        return { success: true };
    };

    const toggleSequence = (id) => {
        setSequences(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
    };

    const getEnrollmentCount = (sequenceId) => {
        return enrollments.filter(e => e.sequenceId === sequenceId && e.status === 'active').length;
    };

    /**
     * Check if an entity is currently enrolled (active or paused) in a sequence.
     * Used by EnrollSequenceModal to prevent manual duplicate enrollment.
     *
     * @param {string} entityId
     * @param {string} sequenceId
     * @returns {{ enrolled: boolean, status: string|null }}
     */
    const isEnrolled = (entityId, sequenceId) => {
        const ACTIVE_STATUSES = ['active', 'paused'];
        const enrollment = enrollments.find(
            e => e.entityId === entityId &&
                 e.sequenceId === sequenceId &&
                 ACTIVE_STATUSES.includes(e.status)
        );
        return {
            enrolled: !!enrollment,
            status: enrollment?.status || null,
            enrolledBy: enrollment?.enrolledBy || null
        };
    };

    /**
     * Get all active/paused enrollments for a given entity.
     * Useful for showing current nurture state in Lead Detail sidebar.
     *
     * @param {string} entityId
     * @returns {Array}
     */
    const getActiveEnrollments = (entityId) => {
        const ACTIVE_STATUSES = ['active', 'paused'];
        return enrollments.filter(
            e => e.entityId === entityId && ACTIVE_STATUSES.includes(e.status)
        );
    };

    const getSequenceStats = (sequenceId) => {
        const allEnrollments = enrollments.filter(e => e.sequenceId === sequenceId);
        const active = allEnrollments.filter(e => e.status === 'active').length;
        const completed = allEnrollments.filter(e => e.status === 'completed').length;
        const stopped = allEnrollments.filter(e => e.status === 'stopped').length;
        const paused = allEnrollments.filter(e => e.status === 'paused').length;

        return { total: allEnrollments.length, active, completed, stopped, paused };
    };

    return (
        <SequenceContext.Provider value={{
            sequences,
            enrollments,
            sequenceLogs,
            enrollInSequence,
            evaluateAndEnroll,
            updateEnrollmentStatus,
            addSequence,
            updateSequence,
            deleteSequence,
            toggleSequence,
            getEnrollmentCount,
            getSequenceStats,
            // Enterprise helpers
            isEnrolled,
            getActiveEnrollments
        }}>
            {children}
        </SequenceContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSequences = () => useContext(SequenceContext);
