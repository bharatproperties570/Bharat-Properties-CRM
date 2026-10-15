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
      boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)',
      borderRadius: '12px', padding: '12px 16px', fontSize: '0.78rem',
      color: isDark ? '#e2e8f0' : '#1e293b',
      zIndex: 100
    }}>
      <div style={{ fontWeight: 800, marginBottom: 8, color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.82rem' }}>{data.month}</div>
      <div style={{ color: '#f59e0b', fontWeight: 800, marginBottom: 6, borderBottom: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)'}`, paddingBottom: 6 }}>
        Overall Index: ₹{new Intl.NumberFormat('en-IN').format(data.Overall || 0)} / {trendMetricUnit}
      </div>
      {activeCategories.map((loc, idx) => {
        if (!data[loc]) return null;
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
        const lineCol = colors[idx % colors.length];
        return (
          <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center', gap: '16px' }}>
            <span style={{ color: lineCol, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: lineCol }}></span>
              {loc}:
            </span>
            <span style={{ fontWeight: 700, color: lineCol }}>₹{new Intl.NumberFormat('en-IN').format(data[loc])}</span>
          </div>
        );
      })}
      <div style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '8px', fontStyle: 'italic', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, paddingTop: '4px' }}>
        Based on {data.count} deals in window
      </div>
    </div>
  );
};

const MarketPriceTrendChart = ({ deals = [], sizes = [], getLookupValue, isDark }) => {
  const [trendMetricUnit, setTrendMetricUnit] = useState('Sq.Yd');
  const [trendPriceType, setTrendPriceType] = useState('Expected'); // 'Expected' | 'Booking'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('Top 5');

  // Fast O(1) size lookup map from sizes array
  const sizeMap = useMemo(() => {
    const map = new Map();
    (sizes || []).forEach(s => {
      if (s.id) map.set(String(s.id), s);
      if (s._id) map.set(String(s._id), s);
    });
    return map;
  }, [sizes]);

  // Extract all unique categories for the dropdown
  const availableCategories = useMemo(() => {
    const cats = new Set();
    (deals || []).forEach(deal => {
      const categoryId = deal.category || deal.propertyType;
      const categoryLabel = (getLookupValue && (getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId))) || 'Other';
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
      const categoryLabel = (getLookupValue && (getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId))) || 'Other';
      
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

  // Enterprise Smart Area & Unit Resolver
  const resolveDealArea = useMemo(() => {
    return (deal) => {
      // 1. Direct numeric size on deal
      if (typeof deal.size === 'number' && deal.size > 0) {
        return { area: deal.size, unit: deal.sizeUnit || 'Sq.Ft.' };
      }
      if (deal.size && typeof deal.size === 'object' && deal.size.value > 0) {
        return { area: deal.size.value, unit: deal.size.unit || deal.sizeUnit || 'Sq.Ft.' };
      }
      
      // 2. Parse string size (e.g. '14 Marla (381.04 Sq Yd)' or '250 Sq Yd')
      if (typeof deal.size === 'string' && deal.size.trim()) {
        const s = deal.size;
        const sqYdMatch = s.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards)/i);
        if (sqYdMatch) return { area: parseFloat(sqYdMatch[1].replace(/,/g, '')), unit: 'Sq.Yd' };
        
        const sqFtMatch = s.match(/([0-9,.]+)\s*(?:sq\.?\s*ft|sqft|feet)/i);
        if (sqFtMatch) return { area: parseFloat(sqFtMatch[1].replace(/,/g, '')), unit: 'Sq.Ft.' };
        
        const marlaMatch = s.match(/([0-9,.]+)\s*marla/i);
        if (marlaMatch) return { area: parseFloat(marlaMatch[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
      }

      // 3. Resolve via sizeConfig ID in deal
      const sizeId = deal.sizeConfig && typeof deal.sizeConfig === 'object' ? (deal.sizeConfig._id || deal.sizeConfig.id) : deal.sizeConfig;
      if (sizeId && sizeMap.has(String(sizeId))) {
        const sLookup = sizeMap.get(String(sizeId));
        const tot = parseFloat(sLookup.totalArea || sLookup.metadata?.totalArea);
        if (tot > 0) return { area: tot, unit: sLookup.resultMetric || sLookup.metadata?.resultMetric || 'Sq.Yd' };
      }

      // 4. Resolve via unitSpecification.sizeLabel (Deal or linked Inventory)
      const spec = deal.unitSpecification || deal.inventory?.unitSpecification || (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId.unitSpecification : null);
      const sizeLabelId = spec?.sizeLabel;
      if (sizeLabelId && sizeMap.has(String(sizeLabelId))) {
        const lk = sizeMap.get(String(sizeLabelId));
        const tot = parseFloat(lk.totalArea || lk.metadata?.totalArea);
        if (tot > 0) return { area: tot, unit: lk.resultMetric || lk.metadata?.resultMetric || 'Sq.Yd' };
      }

      // 5. Compute from length x width in meters
      if (spec && spec.length > 0 && spec.width > 0) {
        // Dimensions in meters: length(m) * width(m) * 1.19599 = Sq.Yd
        const sqYards = spec.length * spec.width * 1.19599;
        if (sqYards > 0) return { area: Math.round(sqYards * 100) / 100, unit: 'Sq.Yd' };
      }

      // 6. Fallback to linked inventory (supporting both deal.inventory and populated deal.inventoryId)
      const inv = (deal.inventory && typeof deal.inventory === 'object') ? deal.inventory : (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId : null);
      if (inv) {
        if (typeof inv.area === 'number' && inv.area > 0) return { area: inv.area, unit: inv.sizeUnit || 'Sq.Ft.' };
        if (typeof inv.size === 'number' && inv.size > 0) return { area: inv.size, unit: inv.sizeUnit || 'Sq.Ft.' };
        if (typeof inv.size === 'object' && inv.size?.value > 0) return { area: inv.size.value, unit: inv.size.unit || inv.sizeUnit || 'Sq.Ft.' };
        if (typeof inv.size === 'string') {
          const sqYd = inv.size.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards)/i);
          if (sqYd) return { area: parseFloat(sqYd[1].replace(/,/g, '')), unit: 'Sq.Yd' };
          const sqFt = inv.size.match(/([0-9,.]+)\s*(?:sq\.?\s*ft|sqft|feet)/i);
          if (sqFt) return { area: parseFloat(sqFt[1].replace(/,/g, '')), unit: 'Sq.Ft.' };
        }
      }

      return null;
    };
  }, [sizeMap]);

  // Main Trend Computation
  const { trendData, activeCategories, totalDealsAnalyzed } = useMemo(() => {
    const months = {};
    const now = new Date();
    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = { month: key, sum: 0, count: 0, locs: {} };
    }

    const locVolume = {}; // Track deal volume per location
    let analyzedCount = 0;

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
      const categoryLabel = (getLookupValue && (getLookupValue('Category', categoryId) || getLookupValue('PropertyType', categoryId))) || 'Other';
      
      // Exclude Agricultural for Sq.Ft/Sq.Yd metrics
      if (categoryLabel?.toLowerCase().includes('agri')) return;

      if (selectedCategory !== 'All' && categoryLabel !== selectedCategory) {
        return;
      }

      const rawPrice = trendPriceType === 'Booking' ? (deal.closedPrice || deal.price) : deal.price;
      const priceToUse = parseNumber(rawPrice);
      if (!priceToUse || priceToUse <= 0) return;

      // 3. Resolve Area using Smart Engine
      const areaInfo = resolveDealArea(deal);
      if (!areaInfo || !areaInfo.area || areaInfo.area <= 0) return;

      let areaInSqFt = areaInfo.area;
      const unitLower = String(areaInfo.unit).toLowerCase();
      if (unitLower.includes('sq.yd') || unitLower.includes('sq. yd') || unitLower.includes('sqyd') || unitLower.includes('yard')) {
        areaInSqFt = areaInfo.area * 9;
      } else if (unitLower.includes('sq.mt') || unitLower.includes('sq. mt') || unitLower.includes('sqm') || unitLower.includes('sq mt')) {
        areaInSqFt = areaInfo.area * 10.7639;
      } else if (unitLower.includes('acre')) {
        areaInSqFt = areaInfo.area * 43560;
      }

      // 4. AVM: Residual Land Value Method for Built-up Properties
      const isBuiltUp = categoryLabel?.toLowerCase().includes('house') || categoryLabel?.toLowerCase().includes('villa') || categoryLabel?.toLowerCase().includes('floor');
      let effectiveLandPrice = priceToUse;

      const inv = (deal.inventory && typeof deal.inventory === 'object') ? deal.inventory : (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId : null);
      if (isBuiltUp && inv) {
        const builtUpArea = parseNumber(inv.builtUpArea);
        if (builtUpArea > 0) {
          let baseCostPerSqFt = 3500;
          const builtTypeStr = (inv.builtupType || '').toLowerCase();
          if (builtTypeStr.includes('double') || builtTypeStr.includes('2')) baseCostPerSqFt += 200;
          if (builtTypeStr.includes('triple') || builtTypeStr.includes('3')) baseCostPerSqFt += 400;
          if (builtTypeStr.includes('premium') || builtTypeStr.includes('luxury') || builtTypeStr.includes('kothi')) baseCostPerSqFt += 1500;

          const ageStr = (inv.ageOfConstruction || inv.constructionAge || '').toLowerCase();
          let ageYears = 0;
          if (ageStr.includes('1-5')) ageYears = 3;
          else if (ageStr.includes('5-10')) ageYears = 7.5;
          else if (ageStr.includes('10-15')) ageYears = 12.5;
          else if (ageStr.includes('15+') || ageStr.includes('15-20') || ageStr.includes('old')) ageYears = 20;

          const depreciationMultiplier = Math.max(0.4, 1 - (ageYears * 0.015)); 
          const finalCostPerSqFt = baseCostPerSqFt * depreciationMultiplier;
          const constructionValue = builtUpArea * finalCostPerSqFt;
          effectiveLandPrice = Math.max(priceToUse * 0.2, priceToUse - constructionValue); 
        }
      }

      let pricePerSqFt = effectiveLandPrice / areaInSqFt;
      let finalPricePerUnit = trendMetricUnit === 'Sq.Yd' ? pricePerSqFt * 9 : pricePerSqFt;

      // Filter extreme unphysical rates
      if (pricePerSqFt < 10 || pricePerSqFt > 1000000) return;

      // 5. Resolve Location
      let locationLabel = 'Kurukshetra';
      if (deal.location) {
        let resolvedLocation = deal.location;
        if (getLookupValue) {
          resolvedLocation = getLookupValue('Location', deal.location) || getLookupValue('City', deal.location) || deal.location;
        }
        locationLabel = typeof resolvedLocation === 'string' ? resolvedLocation.trim() : String(resolvedLocation).trim();
      }

      const cd = new Date(deal.createdAt || Date.now());
      const key = cd.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      if (months[key]) {
        locVolume[locationLabel] = (locVolume[locationLabel] || 0) + 1;

        if (!months[key].locs[locationLabel]) {
          months[key].locs[locationLabel] = { sum: 0, count: 0 };
        }
        months[key].locs[locationLabel].sum += finalPricePerUnit;
        months[key].locs[locationLabel].count++;
        
        months[key].sum += finalPricePerUnit;
        months[key].count++;
        analyzedCount++;
      }
    });

    // Determine Locations to plot
    let plotLocations = [];
    if (selectedLocation === 'Top 5') {
      plotLocations = Object.entries(locVolume)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
    } else {
      plotLocations = [selectedLocation];
    }
    
    // Calculate Averages and Carry-forward
    let lastOverallPrice = 0;
    const locLastPrices = {};
    plotLocations.forEach(loc => locLastPrices[loc] = 0);

    const data = Object.values(months).map(m => {
      const row = { month: m.month, count: m.count };
      
      let overallAvg = m.count > 0 ? Math.round(m.sum / m.count) : null;
      if (overallAvg !== null) {
        lastOverallPrice = overallAvg;
      } else if (lastOverallPrice > 0) {
        overallAvg = lastOverallPrice;
      }
      row.Overall = overallAvg;

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

    return { 
      trendData: data, 
      activeCategories: plotLocations,
      totalDealsAnalyzed: analyzedCount 
    };
  }, [deals, resolveDealArea, trendMetricUnit, trendPriceType, selectedCategory, selectedLocation, getLookupValue]);

  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const hasValidPoints = trendData.some(d => d.Overall > 0);

  // Self-contained Enterprise Button Style
  const btnStyle = (active) => ({
    padding: '4px 10px',
    fontSize: '0.72rem',
    fontWeight: 700,
    borderRadius: '8px',
    cursor: 'pointer',
    border: active ? '1px solid #6366f1' : `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1'}`,
    background: active ? '#6366f1' : (isDark ? 'rgba(255,255,255,0.05)' : '#ffffff'),
    color: active ? '#ffffff' : (isDark ? '#e2e8f0' : '#475569'),
    transition: 'all 0.15s ease'
  });

  const selectStyle = {
    padding: '4px 10px',
    fontSize: '0.72rem',
    fontWeight: 600,
    borderRadius: '8px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1'}`,
    background: isDark ? '#1e293b' : '#ffffff',
    color: isDark ? '#e2e8f0' : '#334155',
    cursor: 'pointer',
    maxWidth: '150px'
  };

  return (
    <div style={{
      background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
      borderRadius: '20px',
      padding: '22px 24px',
      boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.03)',
      backdropFilter: 'blur(12px)',
      minHeight: '410px',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Header with Title & Enterprise Filters */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '18px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
            color: '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem'
          }}>
            <i className="fas fa-chart-line" />
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
              Market Price by Location (Per {trendMetricUnit})
            </div>
            <div style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
              {totalDealsAnalyzed} deals indexed across micro-markets
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Category Filter */}
          <select 
            style={selectStyle}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="All">All Categories</option>
            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          
          {/* Location Filter */}
          <select 
            style={selectStyle}
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="Top 5">Top 5 Locations</option>
            {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>

          {/* Pricing Type Toggle */}
          <div style={{ display: 'flex', gap: '3px', borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, paddingRight: '8px' }}>
            <button 
              style={btnStyle(trendPriceType === 'Expected')} 
              onClick={() => setTrendPriceType('Expected')}
            >
              Expected
            </button>
            <button 
              style={btnStyle(trendPriceType === 'Booking')} 
              onClick={() => setTrendPriceType('Booking')}
            >
              Booking
            </button>
          </div>

          {/* Unit Toggle */}
          <div style={{ display: 'flex', gap: '3px' }}>
            <button 
              style={btnStyle(trendMetricUnit === 'Sq.Ft')} 
              onClick={() => setTrendMetricUnit('Sq.Ft')}
            >
              Sq.Ft
            </button>
            <button 
              style={btnStyle(trendMetricUnit === 'Sq.Yd')} 
              onClick={() => setTrendMetricUnit('Sq.Yd')}
            >
              Sq.Yd
            </button>
          </div>
        </div>
      </div>
      
      {/* Chart Canvas with Guaranteed Non-Zero Height */}
      <div style={{ width: '100%', height: '320px', minHeight: '320px', flex: 1, position: 'relative' }}>
        {hasValidPoints ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis 
                tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} 
                axisLine={false} 
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<PriceTrendTooltip isDark={isDark} trendMetricUnit={trendMetricUnit} activeCategories={activeCategories} />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
              
              {/* Render active location lines */}
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
                name="Overall Index"
                stroke="#f59e0b" 
                strokeWidth={3.5} 
                dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#ffffff', stroke: '#f59e0b', strokeWidth: 2 }}
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#94a3b8' : '#64748b',
            background: isDark ? 'rgba(15, 23, 42, 0.4)' : '#f8fafc',
            borderRadius: '12px',
            border: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
            padding: '24px'
          }}>
            <i className="fas fa-chart-line" style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.4 }} />
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '4px' }}>
              No price benchmark data for {selectedCategory !== 'All' ? selectedCategory : 'selected filter'}
            </div>
            <div style={{ fontSize: '0.74rem', maxWidth: '380px', textAlign: 'center', lineHeight: 1.4 }}>
              Switch to "All Categories" or click "Expected" to inspect broader market listings.
            </div>
            <button 
              onClick={() => { setSelectedCategory('All'); setSelectedLocation('Top 5'); setTrendPriceType('Expected'); }}
              style={{
                marginTop: '12px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(MarketPriceTrendChart);
