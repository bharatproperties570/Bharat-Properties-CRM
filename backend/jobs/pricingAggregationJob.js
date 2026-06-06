import mongoose from 'mongoose';
import cron from 'node-cron';
import Deal from '../models/Deal.js';
import PricingBenchmark from '../models/PricingBenchmark.js';
import Lookup from '../models/Lookup.js';
import { calcOrientationPremium, getAreaUnit } from '../utils/pricingUtils.js';

export const runPricingAggregation = async () => {
    console.log('[Pricing Engine] Starting nightly market aggregation...');
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Fetch deals from last 90 days
        const deals = await Deal.find({
            createdAt: { $gte: ninetyDaysAgo },
            price: { $gt: 0 }
        }).populate('subCategory', 'lookup_value').populate('sizeConfig');

        const grouped = {};

        for (const deal of deals) {
            const loc = deal.location || 'Unknown';
            const subCatValue = deal.subCategory?.lookup_value || 'Unknown';
            const key = `${loc}|${subCatValue}`;

            if (!grouped[key]) {
                grouped[key] = {
                    location: loc,
                    subCategory: subCatValue,
                    areaUnit: getAreaUnit(subCatValue),
                    deals: []
                };
            }
            grouped[key].deals.push(deal);
        }

        let updatedCount = 0;

        for (const [key, group] of Object.entries(grouped)) {
            // We only benchmark locations with at least 3 deals (adjust to 5 in prod)
            if (group.deals.length < 3) continue;

            let totalClosedRPU = 0;
            let closedCount = 0;
            let totalExpectedRPU = 0;
            let expectedCount = 0;

            for (const d of group.deals) {
                // Calculate RPU
                let area = 0;
                if (d.sizeConfig && d.sizeConfig.metadata && d.sizeConfig.metadata.totalArea) {
                    area = parseFloat(d.sizeConfig.metadata.totalArea);
                } else if (d.size) {
                    area = parseFloat(d.size);
                }

                if (area > 0) {
                    const rpu = (d.closedPrice || d.price) / area;
                    if (d.stage === 'Closed' || d.stage === 'Closed Won') {
                        totalClosedRPU += rpu;
                        closedCount++;
                    }
                    totalExpectedRPU += (d.price / area);
                    expectedCount++;
                }
            }

            if (expectedCount > 0) {
                const avgExpected = totalExpectedRPU / expectedCount;
                const avgClosed = closedCount > 0 ? (totalClosedRPU / closedCount) : null;

                // Update Benchmark
                await PricingBenchmark.findOneAndUpdate(
                    { location: group.location, subCategory: group.subCategory, period: 'trailing-90d' },
                    {
                        $set: {
                            areaUnit: group.areaUnit,
                            dealCount: group.deals.length,
                            avgExpectedRPU: avgExpected,
                            avgClosedRPU: avgClosed || avgExpected * 0.9, // fallback estimation if no closed deals yet
                            trend: 'stable',
                            computedAt: new Date(),
                            isStale: false
                        }
                    },
                    { upsert: true, new: true }
                );
                updatedCount++;
            }
        }

        console.log(`[Pricing Engine] Aggregation complete. Updated ${updatedCount} benchmarks.`);
    } catch (error) {
        console.error('[Pricing Engine] Error during aggregation:', error);
    }
};

// Schedule job to run at 2:00 AM every night
export const startPricingCron = () => {
    cron.schedule('0 2 * * *', () => {
        runPricingAggregation();
    });
    console.log('[Pricing Engine] Nightly cron scheduled for 2:00 AM');
};
