import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// ── Price Trend Tooltip ──────────────────────────────────────────
const PriceTrendTooltip = ({ active, payload, isDark, trendMetricUnit, activeCategories }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div style={{
      background: isDark ? '#1e293b' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
      boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
      borderRadius: '10px', padding: '10px 14px', fontSize: '0.75rem',
      color: isDark ? '#e2e8f0' : '#1e293b'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: isDark ? '#94a3b8' : '#64748b' }}>{data.month}</div>
      <div style={{ color: '#f59e0b', fontWeight: 800, marginBottom: 4, borderBottom: '1px solid #f59e0b40', paddingBottom: 4 }}>
        Overall Index: ₹{new Intl.NumberFormat('en-IN').format(data.Overall || 0)} / {trendMetricUnit}
      </div>
      {activeCategories.map((loc, idx) => {
        if (!data[loc]) return null;
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
        const lineCol = colors[idx % colors.length];
        return (
          <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
            <span style={{ color: lineCol, marginRight: 12, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: lineCol }}></span>
              {loc}:
            </span>
            <span style={{ fontWeight: 700, color: lineCol }}>₹{new Intl.NumberFormat('en-IN').format(data[loc])}</span>
          </div>
        );
      })}
      <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '6px', fontStyle: 'italic' }}>
        Based on {data.count} deals
      </div>
    </div>
  );
};

const MarketPriceTrendChart = ({ deals, sizes, getLookupValue, isDark }) => {
  const [trendMetricUnit, setTrendMetricUnit] = useState('Sq.Yd');
  const [trendPriceType, setTrendPriceType] = useState('Expected'); // 'Expected' | 'Booking'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('Top 5');

  // Extract all unique categories for the dropdown
  const availableCategories = useMemo(() => {
    const cats = new Set();
    (deals || []).forEach(deal => {
      const categoryId = deal.category || deal.propertyType;
      const categoryLabel = getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId) || 'Other';
      if (!categoryLabel.toLowerCase().includes('agri')) {
        cats.add(categoryLabel);
      }
    });
    return Array.from(cats).sort();
  }, [deals, getLookupValue]);

  // Extract all unique locations based on selected category
  const availableLocations = useMemo(() => {
    const locs = new Set();
    (deals || []).forEach(deal => {
      const categoryId = deal.category || deal.propertyType;
      const categoryLabel = getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId) || 'Other';
      
      if (categoryLabel?.toLowerCase().includes('agri')) return;
      if (selectedCategory !== 'All' && categoryLabel !== selectedCategory) return;
      
      if (deal.location) {
        let resolvedLocation = deal.location;
        if (getLookupValue) {
          resolvedLocation = getLookupValue('Location', deal.location) || getLookupValue('City', deal.location) || deal.location;
        }
        locs.add(typeof resolvedLocation === 'string' ? resolvedLocation.trim() : String(resolvedLocation).trim());
      }
    });
    return Array.from(locs).sort();
  }, [deals, getLookupValue, selectedCategory]);

  // Reset location when category changes
  React.useEffect(() => {
    setSelectedLocation('Top 5');
  }, [selectedCategory]);

  // Set default category if "All" is too broad, otherwise keep "All"
  // Here we'll stick with "All" to show market overall, but user can drill down.

  const { trendData, activeCategories } = useMemo(() => {
    const months = {};
    const now = new Date();
    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, sum: 0, count: 0, locs: {} };
    }

    const locVolume = {}; // Track deal volume per location

    // Helper to safely parse numbers from formatted strings
    const parseNumber = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val.value !== undefined) {
        const num = parseFloat(val.value);
        return isNaN(num) ? 0 : num;
      }
      if (typeof val !== 'string') return 0;
      const parsed = parseFloat(val.replace(/[^\d.-]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    };

    (deals || []).forEach(deal => {
      // 1. Filter by Stage (Expected vs Booking)
      if (trendPriceType === 'Booking' && deal.stage !== 'Closed Won' && deal.stage !== 'Closed') {
        return;
      }

      // 2. Filter by Category
      const categoryId = deal.category || deal.propertyType;
      const categoryLabel = getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId) || 'Other';
      
      // Always exclude Agricultural for Sq.Ft/Sq.Yd metrics
      if (categoryLabel?.toLowerCase().includes('agri')) return;

      if (selectedCategory !== 'All' && categoryLabel !== selectedCategory) {
        return;
      }

      const rawPrice = trendPriceType === 'Booking' ? (deal.closedPrice || deal.price) : deal.price;
      const priceToUse = parseNumber(rawPrice);
      
      if (!priceToUse) return;

      // 3. Resolve Area & Unit
      const dealSize = parseNumber(deal.size);
      const sizeId = deal.sizeConfig && typeof deal.sizeConfig === 'object' ? (deal.sizeConfig._id || deal.sizeConfig.id) : deal.sizeConfig;
      const sizeLookup = sizeId ? sizes?.find(s => s.id === sizeId) : null;
      let calcArea = sizeLookup?.totalArea ? parseNumber(sizeLookup.totalArea) : dealSize;
      let calcUnit = sizeLookup?.resultMetric || deal.sizeUnit || (deal.size && deal.size.unit ? deal.size.unit : 'sq.ft.');

      // Fallback to inventoryId size if Deal size is 0
      if ((!calcArea || calcArea <= 0) && deal.inventoryId && typeof deal.inventoryId === 'object') {
        const inv = deal.inventoryId;
        const invSize = parseNumber(inv.size);
        const invArea = parseNumber(inv.area);
        calcArea = invArea > 0 ? invArea : invSize;
        if (inv.sizeUnit) calcUnit = inv.sizeUnit;
        else if (inv.size && inv.size.unit) calcUnit = inv.size.unit;
      }

      // Fallback 2: SizeLabel in unitSpecification (from Deal or Inventory)
      if (!calcArea || calcArea <= 0) {
        const specSizeId = deal.unitSpecification?.sizeLabel || (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId.unitSpecification?.sizeLabel : null);
        if (specSizeId) {
          const specSizeIdStr = String(specSizeId);
          const specLookup = sizes?.find(s => String(s.id) === specSizeIdStr || String(s._id) === specSizeIdStr);
          if (specLookup && specLookup.totalArea) {
            calcArea = parseNumber(specLookup.totalArea);
            calcUnit = specLookup.resultMetric || 'sq.ft.';
          }
        }
      }

      if (!calcArea || calcArea <= 0) return;

      let areaInSqFt = calcArea;
      const unitLower = String(calcUnit).toLowerCase();
      if (unitLower.includes('sq.yd') || unitLower.includes('sq. yd') || unitLower.includes('sqyd') || unitLower.includes('sq yd')) {
        areaInSqFt = calcArea * 9;
      } else if (unitLower.includes('sq.mt') || unitLower.includes('sq. mt') || unitLower.includes('sqm') || unitLower.includes('sq mt')) {
        areaInSqFt = calcArea * 10.7639;
      } else if (unitLower.includes('acre')) {
        areaInSqFt = calcArea * 43560;
      }

      // --- AVM: Residual Land Value Method for Built-up Properties ---
      const isBuiltUp = categoryLabel?.toLowerCase().includes('house') || categoryLabel?.toLowerCase().includes('villa') || categoryLabel?.toLowerCase().includes('floor');
      let effectiveLandPrice = priceToUse;

      if (isBuiltUp && deal.inventoryId && typeof deal.inventoryId === 'object') {
        const inv = deal.inventoryId;
        const builtUpArea = parseNumber(inv.builtUpArea);
        
        if (builtUpArea > 0) {
          // 1. Base Construction Cost Assumption (Updated for current market: ~60L-1Cr for 250 SqYd)
          // 250 Sq.Yd plot typically yields ~1500-1800 Sq.Ft built-up.
          // To hit 60L, rate is ~₹3500/Sq.Ft. To hit 1Cr, rate is ~₹5000/Sq.Ft.
          let baseCostPerSqFt = 3500;
          
          // 2. Adjust for Builtup Type (Premium finishes add significant cost)
          const builtTypeStr = (inv.builtupType || '').toLowerCase();
          // Storey multiplier isn't directly added to per-sqft rate because builtUpArea already accounts for total size.
          // However, multi-storey requires stronger foundation, so slight increase.
          if (builtTypeStr.includes('double') || builtTypeStr.includes('2')) baseCostPerSqFt += 200;
          if (builtTypeStr.includes('triple') || builtTypeStr.includes('3')) baseCostPerSqFt += 400;
          if (builtTypeStr.includes('premium') || builtTypeStr.includes('luxury') || builtTypeStr.includes('kothi')) baseCostPerSqFt += 1500;

          // 3. Adjust for Depreciation based on Age
          const ageStr = (inv.ageOfConstruction || inv.constructionAge || '').toLowerCase();
          let ageYears = 0;
          if (ageStr.includes('1-5')) ageYears = 3;
          else if (ageStr.includes('5-10')) ageYears = 7.5;
          else if (ageStr.includes('10-15')) ageYears = 12.5;
          else if (ageStr.includes('15+') || ageStr.includes('15-20') || ageStr.includes('old')) ageYears = 20;

          // Depreciation: ~1.5% per year
          const depreciationMultiplier = Math.max(0.4, 1 - (ageYears * 0.015)); 
          const finalCostPerSqFt = baseCostPerSqFt * depreciationMultiplier;

          // 4. Calculate Total Construction Value
          const constructionValue = builtUpArea * finalCostPerSqFt;

          // 5. Extract Implied Land Value
          // Safeguard: Ensure land value doesn't drop below 20% of total price in case of extreme builtUpArea data
          effectiveLandPrice = Math.max(priceToUse * 0.2, priceToUse - constructionValue); 
        }
      }

      let pricePerSqFt = effectiveLandPrice / areaInSqFt;
      let finalPricePerUnit = trendMetricUnit === 'Sq.Yd' ? pricePerSqFt * 9 : pricePerSqFt;

      // Skip extreme outliers to avoid skewing trends
      if (pricePerSqFt < 10 || pricePerSqFt > 500000) return;

      // 4. Resolve Location
      let locationLabel = 'Unknown';
      if (deal.location) {
        let resolvedLocation = deal.location;
        if (getLookupValue) {
          resolvedLocation = getLookupValue('Location', deal.location) || getLookupValue('City', deal.location) || deal.location;
        }
        locationLabel = typeof resolvedLocation === 'string' ? resolvedLocation.trim() : String(resolvedLocation).trim();
      }

      const cd = new Date(deal.createdAt);
      const key = cd.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      if (months[key]) {
        locVolume[locationLabel] = (locVolume[locationLabel] || 0) + 1;

        if (!months[key].locs[locationLabel]) {
          months[key].locs[locationLabel] = { sum: 0, count: 0 };
        }
        months[key].locs[locationLabel].sum += finalPricePerUnit;
        months[key].locs[locationLabel].count++;
        
        months[key].count++; // Total count for weighted average denominator
      }
    });

    // Determine Locations to plot lines
    let plotLocations = [];
    if (selectedLocation === 'Top 5') {
      plotLocations = Object.entries(locVolume)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
    } else {
      plotLocations = [selectedLocation];
    }
    
    // Calculate Weighted Averages
    let lastOverallPrice = 0;
    const locLastPrices = {};
    plotLocations.forEach(loc => locLastPrices[loc] = 0);

    const data = Object.values(months).map(m => {
      let overallSum = 0;
      const row = { month: m.month, count: m.count };
      
      // Calculate Overall First (Using ALL locations, not just Top 5)
      Object.entries(m.locs).forEach(([loc, locStats]) => {
        if (locStats && locStats.count > 0) {
          overallSum += locStats.sum; // sum of (price * count) for that loc
        }
      });
      
      let overallAvg = m.count > 0 ? Math.round(overallSum / m.count) : null;
      if (overallAvg !== null) {
        lastOverallPrice = overallAvg;
      } else if (lastOverallPrice > 0) {
        overallAvg = lastOverallPrice;
      }
      row.Overall = overallAvg;

      // Calculate selected Location series
      plotLocations.forEach(loc => {
        const locStats = m.locs[loc];
        let locAvg = null;
        if (locStats && locStats.count > 0) {
          locAvg = Math.round(locStats.sum / locStats.count);
          locLastPrices[loc] = locAvg;
        } else if (locLastPrices[loc] > 0) {
          locAvg = locLastPrices[loc];
        }
        row[loc] = locAvg;
      });

      return row;
    });

    return { trendData: data, activeCategories: plotLocations };
  }, [deals, sizes, trendMetricUnit, trendPriceType, selectedCategory, selectedLocation, getLookupValue]);

  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  return (
    <div className="chart-card">
      <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="chart-card-title"><i className="fas fa-chart-line" /> Market Price by Location (Per {trendMetricUnit})</div>
        <div className="analytics-filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Category Filter */}
          <div style={{ marginRight: '8px', display: 'flex', gap: '4px' }}>
            <select 
              className="an-btn outline"
              style={{ padding: '2px 8px', fontSize: '0.7rem', appearance: 'auto', maxWidth: '140px' }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            
            <select 
              className="an-btn outline"
              style={{ padding: '2px 8px', fontSize: '0.7rem', appearance: 'auto', maxWidth: '140px' }}
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="Top 5">Top 5 Locations</option>
              {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--an-border)', paddingRight: '8px' }}>
            <button 
              className={`an-btn ${trendPriceType === 'Expected' ? 'primary' : 'outline'}`} 
              onClick={() => setTrendPriceType('Expected')}
              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
            >Expected</button>
            <button 
              className={`an-btn ${trendPriceType === 'Booking' ? 'primary' : 'outline'}`} 
              onClick={() => setTrendPriceType('Booking')}
              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
            >Booking</button>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              className={`an-btn ${trendMetricUnit === 'Sq.Ft' ? 'primary' : 'outline'}`} 
              onClick={() => setTrendMetricUnit('Sq.Ft')}
              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
            >Sq.Ft</button>
            <button 
              className={`an-btn ${trendMetricUnit === 'Sq.Yd' ? 'primary' : 'outline'}`} 
              onClick={() => setTrendMetricUnit('Sq.Yd')}
              style={{ padding: '2px 8px', fontSize: '0.7rem' }}
            >Sq.Yd</button>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis 
            tick={{ fill: tickColor, fontSize: 10 }} 
            axisLine={false} 
            tickLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<PriceTrendTooltip isDark={isDark} trendMetricUnit={trendMetricUnit} activeCategories={activeCategories} />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
          
          {/* Render active categories */}
          {activeCategories.map((loc, idx) => {
            const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
            return (
              <Line 
                key={loc}
                type="monotone" 
                dataKey={loc} 
                name={loc}
                stroke={colors[idx % colors.length]} 
                strokeWidth={2} 
                dot={{ r: 3, fill: colors[idx % colors.length], strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#ffffff', stroke: colors[idx % colors.length], strokeWidth: 2 }}
                connectNulls={true}
              />
            );
          })}

          {/* Bold Overall Trend */}
          <Line 
            type="monotone" 
            dataKey="Overall" 
            name={`Overall Index`}
            stroke="#f59e0b" 
            strokeWidth={4} 
            dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#ffffff', stroke: '#f59e0b', strokeWidth: 2 }}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarketPriceTrendChart;
