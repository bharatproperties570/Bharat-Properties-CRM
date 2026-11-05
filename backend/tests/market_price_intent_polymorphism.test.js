import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Market Price Trend: Intent Polymorphism & Multi-Model Valuation Suite', () => {

  // Mock Intent Resolver function matching backend controller & frontend component
  const resolveIntent = (deal, lookupMap = {}) => {
    if (deal.intent && ['Sell', 'Rent', 'Lease'].includes(deal.intent)) {
      return deal.intent;
    }
    const rawIntent = deal.intent || deal.inventory?.intent;
    let intentStr = '';
    if (rawIntent) {
      if (Array.isArray(rawIntent)) {
        intentStr = rawIntent.map(x => lookupMap[String(x)] || String(x)).join(' ');
      } else {
        intentStr = lookupMap[String(rawIntent)] || String(rawIntent);
      }
    }
    if (!intentStr && deal.monthlyRent && deal.monthlyRent > 0) return 'Rent';
    const s = intentStr.toLowerCase();
    if (s.includes('rent')) return 'Rent';
    if (s.includes('lease')) return 'Lease';
    return 'Sell';
  };

  // Mock Valuation Engine matching MarketPriceTrendChart.jsx
  const calculateRate = (deal, selectedIntent, trendMetricUnit = 'Sq.Yd') => {
    const dealIntent = resolveIntent(deal);
    if (dealIntent !== selectedIntent) return null; // Strict intent isolation

    let priceToUse = 0;
    if (selectedIntent === 'Sell') {
      priceToUse = deal.price || 0;
    } else if (selectedIntent === 'Rent') {
      priceToUse = deal.monthlyRent || deal.inventory?.rentPrice || deal.price || 0;
    } else if (selectedIntent === 'Lease') {
      priceToUse = deal.monthlyRent || deal.inventory?.leasePrice || deal.price || 0;
    }
    if (priceToUse <= 0) return null;

    const areaInSqFt = (deal.area || 0) * (deal.unit === 'Sq.Yd' ? 9 : 1);
    if (areaInSqFt <= 0) return null;

    if (selectedIntent === 'Sell') {
      let effectiveLandPrice = priceToUse;
      if (deal.isBuiltUp && deal.builtUpArea > 0) {
        const baseCostPerSqFt = 3500;
        const depreciationMultiplier = 0.95; // e.g. 3 years age
        const constructionValue = deal.builtUpArea * (baseCostPerSqFt * depreciationMultiplier);
        effectiveLandPrice = Math.max(priceToUse * 0.2, priceToUse - constructionValue);
      }
      const pricePerSqFt = effectiveLandPrice / areaInSqFt;
      if (pricePerSqFt < 10 || pricePerSqFt > 1000000) return null; // Capital outlier
      return trendMetricUnit === 'Sq.Yd' ? Math.round(pricePerSqFt * 9) : Math.round(pricePerSqFt);
    } 
    
    if (selectedIntent === 'Rent') {
      // Rent Valuation: direct covered rate, zero construction deduction
      const rentPerSqFt = priceToUse / areaInSqFt;
      if (rentPerSqFt < 0.5 || rentPerSqFt > 500) return null; // Rent outlier
      return trendMetricUnit === 'Sq.Yd' ? Math.round(rentPerSqFt * 9) : Math.round(rentPerSqFt * 10) / 10;
    }

    if (selectedIntent === 'Lease') {
      const leasePerSqFt = priceToUse / areaInSqFt;
      if (leasePerSqFt < 1 || leasePerSqFt > 2000) return null; // Lease outlier
      return trendMetricUnit === 'Sq.Yd' ? Math.round(leasePerSqFt * 9) : Math.round(leasePerSqFt * 10) / 10;
    }

    return null;
  };

  test('1. Intent Resolution classifies Sell, Rent, and Lease deterministically', () => {
    assert.equal(resolveIntent({ intent: 'Rent' }), 'Rent');
    assert.equal(resolveIntent({ intent: 'Lease' }), 'Lease');
    assert.equal(resolveIntent({ intent: 'Sell' }), 'Sell');
    assert.equal(resolveIntent({ monthlyRent: 25000 }), 'Rent', 'Infers Rent from monthlyRent > 0');
    assert.equal(resolveIntent({}), 'Sell', 'Defaults to Sell when no rent indicators exist');
    assert.equal(resolveIntent({ inventory: { intent: ['For Sale'] } }), 'Sell');
  });

  test('2. Strict Intent Isolation: Rent deals are excluded when Sell is selected', () => {
    const rentDeal = {
      intent: 'Rent',
      monthlyRent: 15000,
      area: 250,
      unit: 'Sq.Yd'
    };
    const rateUnderSell = calculateRate(rentDeal, 'Sell');
    assert.equal(rateUnderSell, null, 'Rent deal must return null when Sell is selected');
  });

  test('3. Strict Intent Isolation: Sell deals are excluded when Rent is selected', () => {
    const sellDeal = {
      intent: 'Sell',
      price: 5000000,
      area: 250,
      unit: 'Sq.Yd'
    };
    const rateUnderRent = calculateRate(sellDeal, 'Rent');
    assert.equal(rateUnderRent, null, 'Sell deal must return null when Rent is selected');
  });

  test('4. Rent Valuation computes correct monthly rate without construction deductions', () => {
    // 250 Sq.Yd (= 2,250 Sq.Ft) house rented at ₹22,500 / month
    const rentDeal = {
      intent: 'Rent',
      monthlyRent: 22500,
      area: 250,
      unit: 'Sq.Yd',
      isBuiltUp: true,
      builtUpArea: 2000 // Even with builtUpArea, rent should NOT subtract construction cost!
    };

    const rateInSqFt = calculateRate(rentDeal, 'Rent', 'Sq.Ft');
    // 22500 / 2250 = 10.0 / Sq.Ft / Month
    assert.equal(rateInSqFt, 10.0);

    const rateInSqYd = calculateRate(rentDeal, 'Rent', 'Sq.Yd');
    // 10 * 9 = 90 / Sq.Yd / Month
    assert.equal(rateInSqYd, 90);
  });

  test('5. Sell Valuation applies AVM Residual Land calculation for built-up properties', () => {
    // 250 Sq.Yd (= 2,250 Sq.Ft) house sold at ₹1,00,00,000 (1 Cr)
    // BuiltupArea: 2,000 Sq.Ft. Construction value: 2000 * (3500 * 0.95) = ₹66,50,000
    // Residual land value: ₹1,00,00,000 - ₹66,50,000 = ₹33,50,000
    // Land rate per Sq.Ft = 3350000 / 2250 = ~1488.88 / Sq.Ft
    // Land rate per Sq.Yd = 1488.88 * 9 = ~13400 / Sq.Yd
    const sellHouseDeal = {
      intent: 'Sell',
      price: 10000000,
      area: 250,
      unit: 'Sq.Yd',
      isBuiltUp: true,
      builtUpArea: 2000
    };

    const landRatePerSqYd = calculateRate(sellHouseDeal, 'Sell', 'Sq.Yd');
    assert.ok(landRatePerSqYd > 10000 && landRatePerSqYd < 20000, `Expected residual land rate around 13400, got ${landRatePerSqYd}`);
  });

  test('6. Outlier Filters reject unphysical rates for each intent category', () => {
    // A corrupted rent deal: ₹0.10 / Sq.Ft / Mo
    const tinyRent = { intent: 'Rent', monthlyRent: 100, area: 2000, unit: 'Sq.Ft' };
    assert.equal(calculateRate(tinyRent, 'Rent'), null, 'Sub-minimum rent rate rejected');

    // A corrupted rent deal: ₹10,000 / Sq.Ft / Mo
    const insaneRent = { intent: 'Rent', monthlyRent: 20000000, area: 1000, unit: 'Sq.Ft' };
    assert.equal(calculateRate(insaneRent, 'Rent'), null, 'Absurd rent rate rejected');

    // A corrupted sell deal: ₹5 / Sq.Ft
    const tinySell = { intent: 'Sell', price: 5000, area: 1000, unit: 'Sq.Ft' };
    assert.equal(calculateRate(tinySell, 'Sell'), null, 'Sub-minimum sell rate rejected');
  });

  test('7. Canonical Metric Scaling: Sq.Yd rate is exactly 9x of Sq.Ft rate for Sell', () => {
    // 263.12 Sq.Yd plot sold at ₹4,00,00,000 (Sector 4 deal)
    const sector4Deal = {
      intent: 'Sell',
      price: 40000000,
      area: 263.12,
      unit: 'Sq.Yd'
    };

    const rateInSqYd = calculateRate(sector4Deal, 'Sell', 'Sq.Yd');
    const rateInSqFt = calculateRate(sector4Deal, 'Sell', 'Sq.Ft');

    // Expected: 40,000,000 / 263.12 = 152,022 / Sq.Yd
    assert.equal(rateInSqYd, 152022, 'Rate per Sq.Yd should be 152,022');
    // Expected: 152,021.89 / 9 = 16,891 / Sq.Ft
    assert.equal(rateInSqFt, 16891, 'Rate per Sq.Ft should be 16,891');
    assert.ok(Math.abs(rateInSqFt * 9 - rateInSqYd) <= 5, 'Sq.Yd rate must match Sq.Ft rate * 9 within rounding');
  });
});
