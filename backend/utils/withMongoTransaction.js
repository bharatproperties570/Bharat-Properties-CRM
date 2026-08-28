import mongoose from 'mongoose';

/**
 * Enterprise Transaction Wrapper (Phase 4.3)
 * 
 * Executes a callback within a MongoDB transaction.
 * Ensures the session is properly created, committed, aborted, and ended.
 * Implements retry logic for transient transaction errors.
 *
 * @param {Function} callback - Async function that takes the Mongoose session. 
 *                              Must pass this session to all DB operations: `.save({ session })`
 * @param {Object} options - Transaction options (e.g. readPreference, maxTimeMS, maxRetries)
 * @returns {Promise<any>} - The result of the callback
 */
export const withMongoTransaction = async (callback, options = {}) => {
    const maxRetries = options.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        attempt++;
        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async (txnSession) => {
                // Execute business logic with the active transaction session
                result = await callback(txnSession);
            }, {
                readPreference: options.readPreference || 'primary',
                readConcern: { level: 'local' },
                writeConcern: { w: 'majority' }
            });
            return result;
        } catch (error) {
            // Check if error is a transient transaction error (e.g. WriteConflict)
            const isTransient = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');
            const isCommitError = error.hasErrorLabel && error.hasErrorLabel('UnknownTransactionCommitResult');

            if ((isTransient || isCommitError) && attempt < maxRetries) {
                console.warn(`[Transaction] Transient error encountered. Retrying attempt ${attempt}/${maxRetries}...`, error.message);
                // Exponential backoff
                await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 100));
                continue; // Retry loop
            }

            // Propagate non-transient errors or exhausted retries
            throw error;
        } finally {
            // Always end the session to return it to the pool
            await session.endSession();
        }
    }
};

export default withMongoTransaction;
