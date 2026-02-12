import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateEntity } from '../utils/fieldRuleEngine';
import { fieldRulesAPI } from '../utils/api';

const FieldRulesContext = createContext();

export const useFieldRules = () => {
    return useContext(FieldRulesContext);
};

export const FieldRulesProvider = ({ children }) => {
    const [rules, setRules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load rules from backend on mount
    useEffect(() => {
        const loadRules = async () => {
            try {
                const data = await fieldRulesAPI.getAll();
                // Ensure data is always an array
                if (Array.isArray(data)) {
                    setRules(data);
                } else if (data && Array.isArray(data.rules)) {
                    // Handle case where API returns {rules: [...]}
                    setRules(data.rules);
                } else {
                    console.warn('Field rules API returned non-array data:', data);
                    setRules([]);
                }
            } catch (error) {
                console.error('Failed to load field rules from backend:', error);
                // Fall back to localStorage
                try {
                    const saved = localStorage.getItem('fieldRules');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        setRules(Array.isArray(parsed) ? parsed : []);
                    } else {
                        // Use default seed rules
                        setRules([
                            {
                                id: 'lr-1',
                                module: 'lead',
                                ruleName: 'Requirement is Mandatory',
                                field: 'requirement',
                                ruleType: 'MANDATORY',
                                isActive: true,
                                conditions: [],
                                message: 'Requirement type (Buy/Rent) is required.'
                            },
                            {
                                id: 'lr-2',
                                module: 'lead',
                                ruleName: 'Budget Mandatory for Prospects',
                                field: 'budgetMin',
                                ruleType: 'MANDATORY',
                                isActive: true,
                                matchType: 'AND',
                                conditions: [
                                    { field: 'stage', operator: 'not_equals', value: 'New' },
                                    { field: 'stage', operator: 'not_equals', value: 'Contacted' }
                                ],
                                message: 'Budget is required for leads in Prospect stage or higher.'
                            },
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
                        ]);
                    }
                } catch (parseError) {
                    console.error('Failed to parse localStorage rules:', parseError);
                    setRules([]);
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadRules();
    }, []);

    // Persist to LocalStorage as backup
    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem('fieldRules', JSON.stringify(rules));
        }
    }, [rules, isLoading]);

    // Actions with backend integration
    const addRule = async (newRule) => {
        try {
            const saved = await fieldRulesAPI.create(newRule);
            setRules(prev => [...prev, saved]);
        } catch (error) {
            console.error('Failed to add rule to backend:', error);
            // Fallback to local state
            setRules(prev => [...prev, { ...newRule, id: Date.now().toString() }]);
        }
    };

    const updateRule = async (id, updatedRule) => {
        try {
            await fieldRulesAPI.update(id, updatedRule);
            setRules(prev => prev.map(r => r.id === id ? { ...updatedRule, id } : r));
        } catch (error) {
            console.error('Failed to update rule on backend:', error);
            // Fallback to local state
            setRules(prev => prev.map(r => r.id === id ? updatedRule : r));
        }
    };

    const deleteRule = async (id) => {
        try {
            await fieldRulesAPI.delete(id);
            setRules(prev => prev.filter(r => r.id !== id));
        } catch (error) {
            console.error('Failed to delete rule from backend:', error);
            // Fallback to local state
            setRules(prev => prev.filter(r => r.id !== id));
        }
    };

    const toggleRuleStatus = async (id) => {
        if (!Array.isArray(rules)) {
            console.error('Rules is not an array:', rules);
            return;
        }
        const rule = rules.find(r => r.id === id);
        if (rule) {
            const updated = { ...rule, isActive: !rule.isActive };
            try {
                await fieldRulesAPI.update(id, updated);
                setRules(prev => prev.map(r => r.id === id ? updated : r));
            } catch (error) {
                console.error('Failed to toggle rule status on backend:', error);
                // Fallback to local state
                setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
            }
        }
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
        const uniqueRules = Array.isArray(rules) ? rules.filter(r =>
            r.module === module &&
            r.isActive &&
            r.ruleType === 'UNIQUE' &&
            data[r.field] // Only check if value exists
        ) : [];

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
