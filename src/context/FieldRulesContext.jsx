import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateEntity } from '../utils/fieldRuleEngine';

const FieldRulesContext = createContext();

export const useFieldRules = () => {
    return useContext(FieldRulesContext);
};

export const FieldRulesProvider = ({ children }) => {
    // Initial Seed Rules or Load from LocalStorage
    const [rules, setRules] = useState(() => {
        const saved = localStorage.getItem('fieldRules');
        if (saved) {
            return JSON.parse(saved);
        }
        return [
            // --- LEAD MODULE RULES ---
            {
                id: 'lr-1',
                module: 'lead',
                ruleName: 'Requirement is Mandatory',
                field: 'requirement',
                ruleType: 'MANDATORY',
                isActive: true,
                conditions: [], // Always applies
                message: 'Requirement type (Buy/Rent) is required.'
            },
            {
                id: 'lr-2',
                module: 'lead',
                ruleName: 'Budget Mandatory for Prospects',
                field: 'budgetMin', // Simplified for demo
                ruleType: 'MANDATORY',
                isActive: true,
                matchType: 'AND',
                conditions: [
                    { field: 'stage', operator: 'not_equals', value: 'New' }, // If not New (i.e. Prospect or higher)
                    { field: 'stage', operator: 'not_equals', value: 'Contacted' }
                    // In a real app we'd use greater_than on stage index, but string compare for now
                ],
                message: 'Budget is required for leads in Prospect stage or higher.'
            },

            // --- DEAL MODULE RULES ---
            {
                id: 'dr-1',
                module: 'deal',
                ruleName: 'Expected Price Mandatory',
                field: 'expectedPrice',
                ruleType: 'MANDATORY',
                isActive: true,
                conditions: [],
                message: 'Expected Price is critical for deal tracking.'
            }
        ];
    });

    // Persist to LocalStorage
    useEffect(() => {
        localStorage.setItem('fieldRules', JSON.stringify(rules));
    }, [rules]);

    // Actions
    const addRule = (newRule) => {
        setRules(prev => [...prev, { ...newRule, id: Date.now().toString() }]);
    };

    const updateRule = (id, updatedRule) => {
        setRules(prev => prev.map(r => r.id === id ? updatedRule : r));
    };

    const deleteRule = (id) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    const toggleRuleStatus = (id) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
    };

    // Wrapper for Validation Engine (Sync)
    const validate = (module, data, context = null) => {
        return validateEntity(module, data, rules, context);
    };

    // --- ASYNC VALIDATION LAYER (Phase 2) ---
    const checkUnique = async (field, value, module) => {
        // In a real app, this calls api.get(`/check-unique?module=${module}&field=${field}&value=${value}`)
        // Simulating API latency
        await new Promise(resolve => setTimeout(resolve, 600));

        // Mock DB: Simulate specific duplicates for testing
        // Duplicate Mobile
        if (field === 'mobile' && ['9999999999', '9876543210'].includes(value)) {
            return false; // Not unique
        }
        // Duplicate Email
        if (field === 'email' && value === 'duplicate@example.com') {
            return false;
        }

        return true; // Unique
    };

    const validateAsync = async (module, data, context = null) => {
        // 1. Run Sync Validation first (fail fast)
        const syncResult = validateEntity(module, data, rules, context);
        if (!syncResult.isValid) return syncResult;

        // 2. Identify Unique Rules needed
        const uniqueRules = rules.filter(r =>
            r.module === module &&
            r.isActive &&
            r.ruleType === 'UNIQUE' &&
            data[r.field] // Only check if value exists
        );

        if (uniqueRules.length === 0) return syncResult;

        // 3. Run Async Checks
        const errors = {};
        let isValid = true;

        // Parallel checks
        await Promise.all(uniqueRules.map(async (rule) => {
            // Access nested value? data[rule.field] usually simple for now. 
            // If complex path needed, we'll need lodash.get or similar. Assuming simple key for now.
            const value = data[rule.field];
            // Note: For 'phones', 'emails' arrays, logic needs to be smarter. 
            // Assuming flattened data or top-level key for simple MVP.
            // If data is { phones: [{number: '...'}] }, user must create rule for field="phones" and engine handles array logic
            // OR (easier) UI sends { mobile: '...' } flattened.

            // Simplification: We assume the 'AddLeadModal' allows us to validate specific values.
            // But here we are validating the whole object.
            // Let's assume standard field mapping.

            let valToCheck = value;
            if (rule.field === 'mobile' && Array.isArray(value)) valToCheck = value[0]?.number;
            if (rule.field === 'email' && Array.isArray(value)) valToCheck = value[0]?.address;

            if (valToCheck) {
                const isUnique = await checkUnique(rule.field, valToCheck, module);
                if (!isUnique) {
                    isValid = false;
                    errors[rule.field] = rule.message || `${rule.field} already exists in the system.`;
                }
            }
        }));

        if (!isValid) {
            return { ...syncResult, isValid: false, errors: { ...syncResult.errors, ...errors } };
        }

        return syncResult;
    };

    return (
        <FieldRulesContext.Provider value={{
            rules,
            addRule,
            updateRule,
            deleteRule,
            toggleRuleStatus,
            validate,
            validateAsync
        }}>
            {children}
        </FieldRulesContext.Provider>
    );
};
