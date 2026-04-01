import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';

export const useDealFinancials = (deal) => {
    const [govtCharges, setGovtCharges] = useState({
        collectorRate: '',
        unitArea: '',
        unitType: 'Sq Ft',
        roadMultiplier: 0,
        floorMultiplier: 0,
        stampDutyPercent: 7,
        registrationPercent: 1,
        miscCharges: 0,
        legalCharges: 15000,
        brokeragePercent: 1,
        useCollectorRate: true,
        buyerGender: 'male'
    });

    const [govtChargesConfig, setGovtChargesConfig] = useState(null);
    const [valuationData, setValuationData] = useState(null);
    const [valuationLoading, setValuationLoading] = useState(false);
    const [valuationError, setValuationError] = useState(null);

    // Fetch dynamic settings for Government Charges
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await api.get('system-settings/govt_charges_config');
                if (response.data && (response.data.success || response.data.status === 'success') && response.data.data) {
                    const settings = response.data.data.value;
                    setGovtChargesConfig(settings);

                    let initialStampDuty = settings.stampDutyMale || 7;
                    if (govtCharges.buyerGender === 'female') initialStampDuty = settings.stampDutyFemale || 5;
                    else if (govtCharges.buyerGender === 'joint') initialStampDuty = settings.stampDutyJoint || 6;

                    setGovtCharges(prev => ({
                        ...prev,
                        stampDutyPercent: initialStampDuty,
                        registrationPercent: settings.registrationPercent || 1,
                        legalCharges: settings.legalFees || 15000,
                        brokeragePercent: settings.brokeragePercent || 1,
                        useCollectorRate: settings.useCollectorRateDefault !== undefined ? settings.useCollectorRateDefault : true
                    }));
                }
            } catch (error) {
                console.error("Failed to fetch govt charges settings:", error);
            }
        };
        fetchConfig();
    }, [govtCharges.buyerGender]);

    // Update stamp duty when gender changes using fetched config
    useEffect(() => {
        if (govtChargesConfig && govtCharges.buyerGender) {
            let rate = 7;
            if (govtCharges.buyerGender === 'female') rate = govtChargesConfig.stampDutyFemale || 5;
            else if (govtCharges.buyerGender === 'joint') rate = govtChargesConfig.stampDutyJoint || 6;
            else rate = govtChargesConfig.stampDutyMale || 7;

            setGovtCharges(prev => ({ ...prev, stampDutyPercent: rate }));
        }
    }, [govtCharges.buyerGender, govtChargesConfig]);

    // Effect to populate defaults from Deal/Inventory
    useEffect(() => {
        if (deal && deal.inventoryId && !govtCharges.unitArea) {
            setGovtCharges(prev => ({
                ...prev,
                unitArea: deal.inventoryId.superArea || deal.inventoryId.area || 0,
            }));
        }
    }, [deal, govtCharges.unitArea]);

    // Backend Valuation Logic Integration
    useEffect(() => {
        if (!deal?._id) return;

        const timer = setTimeout(async () => {
            setValuationLoading(true);
            try {
                const response = await api.post('/valuation/calculate', {
                    dealId: deal._id,
                    buyerGender: govtCharges.buyerGender,
                    customMarketPrice: parseFloat(deal.price) || 0
                });
                if (response.data.status === 'success') {
                    setValuationData(response.data.data);
                    setValuationError(null);
                }
            } catch (error) {
                console.error("Valuation calculation failed:", error);
                setValuationData(null);
                setValuationError(error.response?.data?.message || "Valuation calculation failed");
            } finally {
                setValuationLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [deal?._id, deal?.price, deal?.transactionType, deal?.flexiblePercentage, govtCharges.buyerGender]);

    // Calculation Logic
    const financials = useMemo(() => {
        if (!deal) return {};

        if (valuationData) {
            return {
                dealValue: valuationData.marketPrice,
                collectorValue: valuationData.collectorValue,
                effectiveRate: valuationData.breakdown.baseRate,
                applicableValue: valuationData.stampDutyBase,
                effectiveStampDutyPercent: (valuationData.stampDutyAmount / valuationData.stampDutyBase) * 100,
                stampDutyAmount: valuationData.stampDutyAmount,
                registrationAmount: valuationData.registrationAmount,
                brokerageAmount: (deal.price || 0) * (govtCharges.brokeragePercent / 100),
                totalGovtCharges: valuationData.totalCharges,
                grandTotal: (deal.price || 0) + valuationData.totalCharges + ((deal.price || 0) * (govtCharges.brokeragePercent / 100)),
                valuationData
            };
        }

        // Fallback Logic (if valuationData is still loading or failed)
        const marketPrice = deal.price || 0;
        const transactionType = deal.transactionType || 'Full White';
        const flexiblePercentage = (deal.flexiblePercentage !== undefined && deal.flexiblePercentage !== null) ? parseFloat(deal.flexiblePercentage) : 100;

        // Basic area calculation
        const unitArea = deal.inventoryId?.size?.value || deal.inventoryId?.superArea || deal.inventoryId?.area || 0;
        const baseRate = parseFloat(govtCharges.collectorRate) || 0;
        const collectorValue = (baseRate * unitArea) || 0;

        let registryValue = marketPrice;
        if (transactionType === 'Collector Rate') {
            registryValue = collectorValue;
        } else if (transactionType === 'Flexible') {
            registryValue = marketPrice * (flexiblePercentage / 100);
        }

        const applicableValue = Math.max(registryValue, collectorValue);
        const stampDutyAmount = applicableValue * (govtCharges.stampDutyPercent / 100);
        const registrationAmount = applicableValue * (govtCharges.registrationPercent / 100);
        const brokerageAmount = marketPrice * (govtCharges.brokeragePercent / 100);
        const totalGovtCharges = stampDutyAmount + registrationAmount + govtCharges.miscCharges + (parseFloat(govtCharges.legalCharges) || 0);

        return {
            dealValue: marketPrice,
            collectorValue,
            applicableValue,
            stampDutyAmount,
            registrationAmount,
            brokerageAmount,
            totalGovtCharges,
            grandTotal: marketPrice + totalGovtCharges + brokerageAmount
        };
    }, [deal, govtCharges, valuationData]);

    return {
        govtCharges,
        setGovtCharges,
        financials,
        valuationData,
        valuationLoading,
        valuationError
    };
};
