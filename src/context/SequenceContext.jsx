import React, { createContext, useContext, useState, useEffect } from 'react';
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

    const enrollInSequence = (entityId, sequenceId) => {
        const sequence = sequences.find(s => s.id === sequenceId);
        if (!sequence) return;

        // Check if already enrolled
        const existing = enrollments.find(e => e.entityId === entityId && e.sequenceId === sequenceId && e.status === 'active');
        if (existing) return;

        const newEnrollment = {
            id: `enr_${Date.now()}`,
            entityId,
            sequenceId,
            currentStep: 0,
            status: 'active',
            enrolledAt: new Date().toISOString(),
            nextStepAt: calculateStepExecutionTime(new Date(), sequence.steps[0].day, sequence.steps[0].time).toISOString(),
            logs: [{
                timestamp: new Date().toISOString(),
                message: `Enrolled in ${sequence.name}`,
                event: 'enrolled'
            }]
        };

        setEnrollments(prev => [...prev, newEnrollment]);
        addLog(entityId, sequenceId, 'Enrolled', `Enrolled in ${sequence.name}`);
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

    const evaluateAndEnroll = (entity, module = 'leads') => {
        const activeSequences = sequences.filter(s => s.active && s.module === module);

        activeSequences.forEach(seq => {
            if (evaluateSequenceTrigger(entity, seq.trigger)) {
                enrollInSequence(entity, seq.id);
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
            getSequenceStats
        }}>
            {children}
        </SequenceContext.Provider>
    );
};

export const useSequences = () => useContext(SequenceContext);
