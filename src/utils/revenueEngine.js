/**
 * Enterprise Real Estate Revenue Forecasting Engine
 * Calculates dynamic commissions, tax deductions, and net realizable revenue.
 */

/**
 * Calculates the gross expected commission for a deal based on dynamic Real Estate categories.
 * 
 * @param {Object} deal - The deal object.
 * @param {Object} config - The dynamic forecast configuration.
 * @returns {number} Gross Expected Commission
 */
export const calculateGrossCommission = (deal, config) => {
    const dealValue = deal.price || 0;
    if (!dealValue) return 0;

    const type = (deal.transactionType || deal.category || '').toLowerCase();
    
    // Allow deal-level override if it exists
    if (deal.customCommissionRate) {
        return dealValue * (deal.customCommissionRate / 100);
    }

    if (type.includes('rent') || type.includes('lease')) {
        // Rental is usually based on 1 Month Rent
        // The config defines what % of annual value 1 month is (usually 8.33%)
        const rentalRate = config.rentalRate?.value ?? 8.33; 
        // Assuming dealValue is Annual Rent. If it's Monthly Rent, it would be * 1.
        // We will assume dealValue is total deal value (Annual Rent) for consistency.
        return dealValue * (rentalRate / 100);
    }

    if (type.includes('resale') || type.includes('secondary')) {
        const resaleRate = config.resaleRate?.value ?? 2; // e.g. 1% buyer + 1% seller
        return dealValue * (resaleRate / 100);
    }

    // Default to Primary Market / Builder Sales
    const primaryRate = config.primaryRate?.value ?? 5; 
    return dealValue * (primaryRate / 100);
};

/**
 * Calculates Net Realizable Revenue after statutory deductions (TDS, GST impact).
 * 
 * @param {number} grossCommission 
 * @param {Object} config 
 * @returns {number} Net Revenue
 */
export const calculateNetRevenue = (grossCommission, config) => {
    if (!grossCommission) return 0;

    const tdsRate = config.tdsRate?.value ?? 5; // e.g. 5% TDS under 194H
    let net = grossCommission;

    // Deduct TDS
    if (config.applyTDS?.value !== false) {
        net -= (grossCommission * (tdsRate / 100));
    }

    // GST is typically charged ON TOP of commission by the agency, 
    // so it doesn't reduce Net Realizable Revenue unless the agency 
    // absorbs it. For a pure forecast, Net Realizable = Gross - TDS.

    return Math.max(0, net);
};
