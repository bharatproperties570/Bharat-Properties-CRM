import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const ImportContext = createContext(null);

export const useImport = () => {
    const context = useContext(ImportContext);
    if (!context) {
        throw new Error('useImport must be used within an ImportProvider');
    }
    return context;
};

export const ImportProvider = ({ children }) => {
    const [activeImports, setActiveImports] = useState([]);

    const startBackgroundImport = useCallback(async (importTask) => {
        const {
            id = Date.now().toString(),
            module,
            moduleLabel,
            endpoint,
            transformedData,
            chunkSize = 10,
            basePayload = {},
            onComplete
        } = importTask;

        const totalRecords = transformedData.length;

        // Initialize import state
        setActiveImports(prev => [...prev, {
            id,
            module,
            moduleLabel: moduleLabel || module,
            totalRecords,
            processedRecords: 0,
            progress: 0,
            status: 'running', // running, completed, error
            errors: [],
            successLogs: [],
            stats: { success: 0, failed: 0, newCount: 0, updatedCount: 0 },
            startTime: Date.now()
        }]);

        // Helper to update state
        const updateImport = (updates) => {
            setActiveImports(prev => prev.map(imp => imp.id === id ? { ...imp, ...updates } : imp));
        };

        let totalSuccessCount = 0;
        let totalErrorCount = 0;
        let totalNewCount = 0;
        let totalUpdatedCount = 0;
        let aggregatedErrors = [];
        let aggregatedSuccess = [];

        try {
            for (let i = 0; i < totalRecords; i += chunkSize) {
                const chunk = transformedData.slice(i, i + chunkSize);
                
                const payload = {
                    ...basePayload,
                    data: chunk
                };

                const response = await api.post(endpoint, payload, { timeout: 60000 });

                if (response.data.success) {
                    const { successCount, errorCount, newCount, updatedCount, errors, successLogs } = response.data;
                    
                    totalSuccessCount += (successCount || 0);
                    totalErrorCount += (errorCount || 0);
                    totalNewCount += (newCount || 0);
                    totalUpdatedCount += (updatedCount || 0);
                    if (errors) aggregatedErrors = [...aggregatedErrors, ...errors];
                    if (successLogs) aggregatedSuccess = [...aggregatedSuccess, ...successLogs];

                    const processed = i + chunk.length;
                    const progress = Math.min(Math.round((processed / totalRecords) * 100), 100);

                    updateImport({
                        processedRecords: processed,
                        progress,
                        stats: {
                            success: totalSuccessCount,
                            failed: totalErrorCount,
                            newCount: totalNewCount,
                            updatedCount: totalUpdatedCount
                        }
                    });
                } else {
                    console.error(`Batch at index ${i} failed:`, response.data.message);
                    totalErrorCount += chunk.length;
                    aggregatedErrors.push({ row: i + 1, name: 'Batch Failure', reason: response.data.message || 'Server rejected batch' });
                    
                    const processed = i + chunk.length;
                    const progress = Math.min(Math.round((processed / totalRecords) * 100), 100);
                    
                    updateImport({
                        processedRecords: processed,
                        progress,
                        stats: {
                            success: totalSuccessCount,
                            failed: totalErrorCount,
                            newCount: totalNewCount,
                            updatedCount: totalUpdatedCount
                        }
                    });
                }
            }

            // Finished successfully
            updateImport({
                status: 'completed',
                progress: 100,
                processedRecords: totalRecords,
                errors: aggregatedErrors,
                successLogs: aggregatedSuccess
            });
            
            toast.success(`Import for ${moduleLabel || module} completed in background!`);
            
            if (onComplete) {
                onComplete({
                    success: totalSuccessCount,
                    failed: totalErrorCount,
                    newCount: totalNewCount,
                    updatedCount: totalUpdatedCount,
                    errors: aggregatedErrors,
                    successLogs: aggregatedSuccess
                });
            }
            
            // Automatically clear completed imports after 15 seconds if no errors, else keep them so user can see
            if (aggregatedErrors.length === 0) {
                setTimeout(() => clearImport(id), 15000);
            }

        } catch (err) {
            console.error('Background Import Error:', err);
            updateImport({ status: 'error', progress: 100 });
            toast.error(`Import for ${moduleLabel || module} failed.`);
        }
    }, []);

    const clearImport = useCallback((id) => {
        setActiveImports(prev => prev.filter(imp => imp.id !== id));
    }, []);

    return (
        <ImportContext.Provider value={{ activeImports, startBackgroundImport, clearImport }}>
            {children}
        </ImportContext.Provider>
    );
};
