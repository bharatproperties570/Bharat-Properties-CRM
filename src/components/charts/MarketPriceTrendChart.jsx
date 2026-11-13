import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import {
  calculateBasePriceFromRate,
  calculateAdjustedUnitPrice,
  resolveOrientationAdjustments
} from '../../utils/orientationPricingUtils';

// ── Static Constants to guarantee stable references for Recharts ────────────────
const LEGEND_WRAPPER_STYLE = { fontSize: '0.75rem', paddingTop: '10px' };
const CHART_MARGIN = { top: 10, right: 30, left: 10, bottom: 0 };
const LINE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

// ── Canonical Unit Normalization & Geometric Conversions ─────────────────────────
// 1 Gaj (Sq.Yard) = 9 Sq.Feet = 0.836127 Sq.Meters. 1 Marla = 25 Sq.Yards = 225 Sq.Feet.
const normalizeAreaUnit = (rawUnit) => {
  if (!rawUnit) return 'Sq.Yd';
  const u = String(rawUnit).toLowerCase().trim();
  if (u.includes('marla')) return 'Marla';
  if (u.includes('yd') || u.includes('yard') || u.includes('gaj')) return 'Sq.Yd';
  if (u.includes('ft') || u.includes('feet')) return 'Sq.Ft.';
  if (u.includes('mt') || u.includes('meter') || u.includes('sqm')) return 'Sq.Mt.';
  if (u.includes('acre')) return 'Acre';
  return 'Sq.Yd';
};

const convertToSqYards = (area, unit) => {
  if (!area || isNaN(area) || area <= 0) return 0;
  const norm = normalizeAreaUnit(unit);
  if (norm === 'Sq.Yd') return area;
  if (norm === 'Sq.Ft.') return area / 9;
  if (norm === 'Marla') return area * 25;
  if (norm === 'Sq.Mt.') return area * 1.19599;
  if (norm === 'Acre') return area * 4840;
  return area;
};

const convertToSqFt = (area, unit) => {
  if (!area || isNaN(area) || area <= 0) return 0;
  const norm = normalizeAreaUnit(unit);
  if (norm === 'Sq.Ft.') return area;
  if (norm === 'Sq.Yd') return area * 9;
  if (norm === 'Marla') return area * 225; // 25 * 9
  if (norm === 'Sq.Mt.') return area * 10.7639;
  if (norm === 'Acre') return area * 43560;
  return area * 9;
};

// ── Generic Safe Number Parser ──────────────────────────────────
const parseNumber = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object' && val.value !== undefined) {
    const num = parseFloat(val.value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof val !== 'string') return 0;
  const parsed = parseFloat(val.replace(/[^\d.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

// ── Price Trend Tooltip ──────────────────────────────────────────
const PriceTrendTooltip = React.memo(({ active, payload, isDark, trendMetricUnit, activeCategories = [], selectedIntent = 'Sell' }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const unitSuffix = selectedIntent === 'Sell' ? trendMetricUnit : `${trendMetricUnit}/Mo`;
  const titleLabel = selectedIntent === 'Sell' ? 'Overall Index' : selectedIntent === 'Rent' ? 'Overall Rental Index' : 'Overall Lease Index';

  const formatRate = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    if (selectedIntent === 'Sell') {
      return new Intl.NumberFormat('en-IN').format(Math.round(val));
    }
    if (trendMetricUnit === 'Sq.Ft' && val < 100) {
      return (Math.round(val * 10) / 10).toFixed(1);
    }
    return new Intl.NumberFormat('en-IN').format(Math.round(val));
  };

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
        {titleLabel}: ₹{formatRate(data.Overall || 0)} / {unitSuffix}
      </div>
      {(activeCategories || []).map((loc, idx) => {
        if (data[loc] === null || data[loc] === undefined) return null;
        const lineCol = LINE_COLORS[idx % LINE_COLORS.length];
        return (
          <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center', gap: '16px' }}>
            <span style={{ color: lineCol, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: lineCol }}></span>
              {loc}:
            </span>
            <span style={{ fontWeight: 700, color: lineCol }}>₹{formatRate(data[loc])} / {unitSuffix}</span>
          </div>
        );
      })}
      <div style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '8px', fontStyle: 'italic', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, paddingTop: '4px' }}>
        Based on {data.count} {selectedIntent.toLowerCase()} deals in window
      </div>
    </div>
  );
});

const MarketPriceTrendChart = ({ deals = [], sizes = [], projects = [], getLookupValue, isDark }) => {
  const [selectedIntent, setSelectedIntent] = useState('Sell'); // 'Sell' | 'Rent' | 'Lease'
  const [trendMetricUnit, setTrendMetricUnit] = useState('Sq.Yd');
  const [trendPriceType, setTrendPriceType] = useState('Expected'); // 'Expected' | 'Booking'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('Top 5');

  // Keep getLookupValue ref stable across renders to prevent unnecessary re-render cascades
  const getLookupValueRef = useRef(getLookupValue);
  getLookupValueRef.current = getLookupValue;

  // Fast O(1) size lookup map from sizes array
  const sizeMap = useMemo(() => {
    const map = new Map();
    (sizes || []).forEach(s => {
      if (s.id) map.set(String(s.id), s);
      if (s._id) map.set(String(s._id), s);
    });
    return map;
  }, [sizes]);

  // Fast O(1) project name lookup map
  const projectMap = useMemo(() => {
    const map = new Map();
    (projects || []).forEach(p => {
      const id = p.id || p._id;
      const name = p.name || p.projectName || p.title;
      if (id && name) {
        map.set(String(id), name);
      }
    });
    return map;
  }, [projects]);

  const isBlockName = (val) => {
    if (!val) return false;
    return /(?:block|huda market|housing board colony|part\s*i)/i.test(String(val).trim());
  };

  const formatProjectTitle = (val) => {
    if (!val) return '';
    let s = typeof val === 'object' ? (val.name || val.title || val.projectName || val.lookup_value || '') : String(val);
    if (!s) return '';
    s = s.split(' | ')[0].trim();
    if (s.includes(' - ') && /(?:sell|sale|rent|ordinary|corner|plot|house|flat|booth|shop|sco)/i.test(s)) {
      s = s.split(' - ')[0].trim();
    }
    s = s.replace(/\s*(?:\||-)?\s*ordinary\s*(?:for\s*)?(?:sell|sale)?/gi, '').trim();
    s = s.replace(/\s*(?:\||-)?\s*(?:for\s*)?(?:sell|sale)$/gi, '').trim();
    return s
      .toLowerCase()
      .replace(/\b([a-z])/g, (c) => c.toUpperCase())
      .replace(/\bKurukshetra\b/i, 'Kurukshetra')
      .replace(/\bSrs\b/i, 'SRS')
      .replace(/\bHuda\b/i, 'HUDA')
      .replace(/\b(i|ii|iii|iv|v)\b/gi, (m) => m.toUpperCase())
      .trim();
  };

  // Enterprise Location Resolver: Strictly per Project Name, NEVER standalone block name
  const resolveLocationLabel = useCallback((deal) => {
    const lookupFn = getLookupValueRef.current;
    // 1. Primary: Direct Project Name from deal
    if (deal.projectName && typeof deal.projectName === 'string' && deal.projectName.trim()) {
      const p = formatProjectTitle(deal.projectName.trim());
      if (p && !isBlockName(p)) return p;
    }

    // 2. Project reference from deal or inventory (via projectMap or lookup)
    const prj = deal.project || deal.projectId || deal.inventory?.project;
    if (prj) {
      if (projectMap.has(String(prj))) {
        const p = formatProjectTitle(projectMap.get(String(prj)));
        if (p && !isBlockName(p)) return p;
      }
      if (lookupFn) {
        const resolved = lookupFn('Project', prj);
        if (resolved && !/^[0-9a-fA-F]{24}$/.test(String(resolved).trim())) {
          const p = formatProjectTitle(String(resolved).trim());
          if (p && !isBlockName(p)) return p;
        }
      }
      if (typeof prj === 'string' && !/^[0-9a-fA-F]{24}$/.test(prj.trim())) {
        const p = formatProjectTitle(prj.trim());
        if (p && !isBlockName(p)) return p;
      }
    }

    // 3. Pre-resolved human-readable locationName (from backend enrichment, strictly rejecting block names)
    if (deal.locationName && typeof deal.locationName === 'string' && !/^[0-9a-fA-F]{24}$/.test(deal.locationName.trim())) {
      const loc = formatProjectTitle(deal.locationName.trim());
      if (loc && !isBlockName(loc)) return loc;
    }

    // 4. Resolve deal.location via lookup helper (strictly rejecting block names)
    if (deal.location) {
      if (typeof deal.location === 'string' && !/^[0-9a-fA-F]{24}$/.test(deal.location.trim())) {
        const loc = formatProjectTitle(deal.location.trim());
        if (loc && !isBlockName(loc)) return loc;
      }
      if (lookupFn) {
        const resolved = lookupFn('Location', deal.location) || lookupFn('City', deal.location) || lookupFn('Area', deal.location);
        if (resolved && !/^[0-9a-fA-F]{24}$/.test(String(resolved).trim())) {
          const loc = formatProjectTitle(String(resolved).trim());
          if (loc && !isBlockName(loc)) return loc;
        }
      }
    }

    // 5. Resolve from linked inventory location (strictly rejecting block names)
    const inv = (deal.inventory && typeof deal.inventory === 'object') ? deal.inventory : (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId : null);
    const invLoc = inv?.address?.location || inv?.address?.locality || inv?.address?.area;
    if (invLoc) {
      if (typeof invLoc === 'string' && !/^[0-9a-fA-F]{24}$/.test(invLoc.trim())) {
        const loc = formatProjectTitle(invLoc.trim());
        if (loc && !isBlockName(loc)) return loc;
      }
      if (lookupFn) {
        const resolved = lookupFn('Location', invLoc) || lookupFn('City', invLoc);
        if (resolved && !/^[0-9a-fA-F]{24}$/.test(String(resolved).trim())) {
          const loc = formatProjectTitle(String(resolved).trim());
          if (loc && !isBlockName(loc)) return loc;
        }
      }
    }

    // 6. Sector (strictly rejecting block names)
    const sec = deal.sector || inv?.sector;
    if (sec && !/^[0-9a-fA-F]{24}$/.test(String(sec).trim())) {
      const loc = formatProjectTitle(String(sec).trim());
      if (loc && !isBlockName(loc)) return loc;
    }

    // Explicitly NO standalone block names
    return 'Kurukshetra';
  }, [projectMap]);

  // Enterprise Category Resolver
  const resolveCategoryLabel = useCallback((deal) => {
    if (deal.categoryName && typeof deal.categoryName === 'string' && !/^[0-9a-fA-F]{24}$/.test(deal.categoryName.trim())) {
      return deal.categoryName.trim();
    }
    const catId = deal.category || deal.propertyType;
    if (catId) {
      const lookupFn = getLookupValueRef.current;
      if (lookupFn) {
        const val = lookupFn('Category', catId) || lookupFn('PropertyType', catId);
        if (val && !/^[0-9a-fA-F]{24}$/.test(String(val).trim())) return String(val).trim();
      }
      if (typeof catId === 'string' && !/^[0-9a-fA-F]{24}$/.test(catId.trim())) {
        return catId.trim();
      }
    }
    return 'Residential';
  }, []);

  // Enterprise Intent Resolver (Canonical: 'Sell' | 'Rent' | 'Lease')
  const resolveIntentLabel = useCallback((deal) => {
    if (deal.intent && typeof deal.intent === 'string' && ['Sell', 'Rent', 'Lease'].includes(deal.intent)) {
      return deal.intent;
    }
    const rawIntent = deal.intent || deal.inventory?.intent;
    let intentStr = '';
    const lookupFn = getLookupValueRef.current;
    if (rawIntent) {
      if (Array.isArray(rawIntent)) {
        intentStr = rawIntent.map(x => (lookupFn ? lookupFn('Intent', x) : '') || String(x)).join(' ');
      } else {
        intentStr = (lookupFn ? lookupFn('Intent', rawIntent) : '') || String(rawIntent);
      }
    }
    if (!intentStr && deal.monthlyRent && deal.monthlyRent > 0) return 'Rent';
    const s = intentStr.toLowerCase();
    if (s.includes('rent')) return 'Rent';
    if (s.includes('lease')) return 'Lease';
    return 'Sell';
  }, []);

  // Explicit User Handlers to eliminate cascading useEffect re-renders
  const handleIntentChange = (newIntent) => {
    setSelectedIntent(newIntent);
    setSelectedCategory('All');
    setSelectedLocation('Top 5');
    setTrendMetricUnit(newIntent === 'Sell' ? 'Sq.Yd' : 'Sq.Ft');
  };

  const handleCategoryChange = (newCategory) => {
    setSelectedCategory(newCategory);
    setSelectedLocation('Top 5');
  };

  // Extract all unique categories for the dropdown based on selectedIntent
  const availableCategories = useMemo(() => {
    const cats = new Set();
    (deals || []).forEach(deal => {
      if (resolveIntentLabel(deal) !== selectedIntent) return;
      const categoryLabel = resolveCategoryLabel(deal);
      if (!categoryLabel.toLowerCase().includes('agri')) {
        cats.add(categoryLabel);
      }
    });
    return Array.from(cats).sort();
  }, [deals, selectedIntent, resolveIntentLabel, resolveCategoryLabel]);

  // Extract all unique locations based on selected category & intent (guaranteed NO blocks)
  const availableLocations = useMemo(() => {
    const locs = new Set();
    (deals || []).forEach(deal => {
      if (resolveIntentLabel(deal) !== selectedIntent) return;
      const categoryLabel = resolveCategoryLabel(deal);
      if (categoryLabel?.toLowerCase().includes('agri')) return;
      if (selectedCategory !== 'All' && categoryLabel !== selectedCategory) return;
      
      const locName = resolveLocationLabel(deal);
      if (locName && !isBlockName(locName)) locs.add(locName);
    });
    return Array.from(locs).sort();
  }, [deals, selectedIntent, selectedCategory, resolveIntentLabel, resolveCategoryLabel, resolveLocationLabel]);

  // Enterprise Smart Area & Unit Resolver (Enhanced for Deal and Inventory dimensions & sizeConfigs)
  const resolveDealArea = useMemo(() => {
    return (deal) => {
      // 1. Direct numeric size on deal
      if (typeof deal.size === 'number' && deal.size > 0) {
        return { area: deal.size, unit: deal.sizeUnit || 'Sq.Yd' };
      }
      if (deal.size && typeof deal.size === 'object' && deal.size.value > 0) {
        return { area: deal.size.value, unit: deal.size.unit || deal.sizeUnit || 'Sq.Yd' };
      }
      
      // 2. Parse string size (e.g. '14 Marla (381.04 Sq Yd)', '250 Sq Yd', '263.12')
      if (typeof deal.size === 'string' && deal.size.trim()) {
        const s = deal.size.trim();
        const sqYdMatch = s.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards|gaj|yd)/i);
        if (sqYdMatch) return { area: parseFloat(sqYdMatch[1].replace(/,/g, '')), unit: 'Sq.Yd' };
        
        const sqFtMatch = s.match(/([0-9,.]+)\s*(?:sq\.?\s*ft|sqft|feet|ft)/i);
        if (sqFtMatch) return { area: parseFloat(sqFtMatch[1].replace(/,/g, '')), unit: 'Sq.Ft.' };
        
        const marlaMatch = s.match(/([0-9,.]+)\s*marla/i);
        if (marlaMatch) return { area: parseFloat(marlaMatch[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };

        // Clean numeric string (e.g. "263.12") paired with deal.sizeUnit (skip raw 24-char ObjectId strings)
        if (!/^[0-9a-fA-F]{24}$/.test(s)) {
          const cleanNum = parseFloat(s.replace(/,/g, ''));
          if (!isNaN(cleanNum) && cleanNum > 0) {
            return { area: cleanNum, unit: deal.sizeUnit || 'Sq.Yd' };
          }
        }
      }

      // 3. Resolve via sizeConfig ID or String in deal OR linked inventory
      const sizeId = deal.sizeConfig && typeof deal.sizeConfig === 'object' 
        ? (deal.sizeConfig._id || deal.sizeConfig.id) 
        : (deal.sizeConfig || deal.inventory?.sizeConfig);
      if (sizeId) {
        if (sizeMap.has(String(sizeId))) {
          const sLookup = sizeMap.get(String(sizeId));
          const tot = parseFloat(sLookup.totalArea || sLookup.metadata?.totalArea);
          if (tot > 0) return { area: tot, unit: sLookup.resultMetric || sLookup.metadata?.resultMetric || 'Sq.Yd' };
        }
        if (typeof sizeId === 'string') {
          const mYd = sizeId.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards|yd)/i);
          if (mYd) return { area: parseFloat(mYd[1].replace(/,/g, '')), unit: 'Sq.Yd' };
          const mMarla = sizeId.match(/([0-9,.]+)\s*marla/i);
          if (mMarla) return { area: parseFloat(mMarla[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
        }
      }

      // 4. Resolve via unitSpecification.sizeLabel (Deal or linked Inventory)
      const spec = deal.unitSpecification || deal.inventory?.unitSpecification || (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId.unitSpecification : null);
      const sizeLabelId = spec?.sizeLabel || deal.inventory?.sizeLabel;
      if (sizeLabelId && sizeMap.has(String(sizeLabelId))) {
        const lk = sizeMap.get(String(sizeLabelId));
        const tot = parseFloat(lk.totalArea || lk.metadata?.totalArea);
        if (tot > 0) return { area: tot, unit: lk.resultMetric || lk.metadata?.resultMetric || 'Sq.Yd' };
      }

      // 5. Compute from length x width in meters (Deal spec or Inventory dimensions)
      const l = spec?.length || deal.inventory?.length;
      const w = spec?.width || deal.inventory?.width;
      if (l > 0 && w > 0) {
        // Dimensions in meters: length(m) * width(m) * 1.19599 = Sq.Yd
        const sqYards = l * w * 1.19599;
        if (sqYards > 0) return { area: Math.round(sqYards * 100) / 100, unit: 'Sq.Yd' };
      }

      // 6. Check unitSpecification totalSaleableArea / builtUpArea / carpetArea
      const builtUpVal = parseNumber(spec?.builtUpArea?.value || spec?.builtUpArea || spec?.totalSaleableArea?.value || spec?.totalSaleableArea || spec?.carpetArea?.value || spec?.carpetArea);
      if (builtUpVal > 0) {
        return { area: builtUpVal, unit: spec?.builtUpArea?.unit || spec?.totalSaleableArea?.unit || 'Sq.Ft.' };
      }

      // 7. Check unitSpecification.facing (e.g. '3 Marla' or '10 Marla')
      const facingStr = typeof spec?.facing === 'object' ? (spec.facing.lookup_value || '') : String(spec?.facing || '');
      const facingMarla = facingStr.match(/([0-9,.]+)\s*marla/i);
      if (facingMarla) {
        return { area: parseFloat(facingMarla[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
      }

      // 8. Fallback to linked inventory (supporting both deal.inventory and populated deal.inventoryId)
      const inv = (deal.inventory && typeof deal.inventory === 'object') ? deal.inventory : (deal.inventoryId && typeof deal.inventoryId === 'object' ? deal.inventoryId : null);
      if (inv) {
        if (typeof inv.sizeLabel === 'string') {
          const sqYdMatch = inv.sizeLabel.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards|yd)/i);
          if (sqYdMatch) return { area: parseFloat(sqYdMatch[1].replace(/,/g, '')), unit: 'Sq.Yd' };
          const marlaMatch = inv.sizeLabel.match(/([0-9,.]+)\s*marla/i);
          if (marlaMatch) return { area: parseFloat(marlaMatch[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
        }
        if (typeof inv.sizeConfig === 'string') {
          const sqYdMatch = inv.sizeConfig.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards|yd)/i);
          if (sqYdMatch) return { area: parseFloat(sqYdMatch[1].replace(/,/g, '')), unit: 'Sq.Yd' };
          const marlaMatch = inv.sizeConfig.match(/([0-9,.]+)\s*marla/i);
          if (marlaMatch) return { area: parseFloat(marlaMatch[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
        }
        if (typeof inv.area === 'number' && inv.area > 0) return { area: inv.area, unit: inv.sizeUnit || 'Sq.Yd' };
        if (typeof inv.size === 'number' && inv.size > 0) return { area: inv.size, unit: inv.sizeUnit || 'Sq.Yd' };
        if (typeof inv.size === 'object' && inv.size?.value > 0) return { area: inv.size.value, unit: inv.size.unit || inv.sizeUnit || 'Sq.Yd' };
        if (typeof inv.size === 'string' && !/^[0-9a-fA-F]{24}$/.test(inv.size.trim())) {
          const sqYd = inv.size.match(/([0-9,.]+)\s*(?:sq\.?\s*yd|sqyd|yards|yd)/i);
          if (sqYd) return { area: parseFloat(sqYd[1].replace(/,/g, '')), unit: 'Sq.Yd' };
          const sqFt = inv.size.match(/([0-9,.]+)\s*(?:sq\.?\s*ft|sqft|feet|ft)/i);
          if (sqFt) return { area: parseFloat(sqFt[1].replace(/,/g, '')), unit: 'Sq.Ft.' };
          const marla = inv.size.match(/([0-9,.]+)\s*marla/i);
          if (marla) return { area: parseFloat(marla[1].replace(/,/g, '')) * 25, unit: 'Sq.Yd' };
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

    (deals || []).forEach(deal => {
      // 0. Filter by Intent
      const dealIntent = resolveIntentLabel(deal);
      if (dealIntent !== selectedIntent) return;

      // Gate 3: Exclude unverified intake deals from official market analytics
      const vStatus = deal.verificationStatus || deal.verification_status;
      if (vStatus === 'unverified') return;

      // 1. Filter by Stage (Expected vs Booking)
      if (trendPriceType === 'Booking' && deal.stage !== 'Closed Won' && deal.stage !== 'Closed') {
        return;
      }

      // 2. Filter by Category
      const categoryLabel = resolveCategoryLabel(deal);
      
      // Exclude Agricultural for Sq.Ft/Sq.Yd metrics
      if (categoryLabel?.toLowerCase().includes('agri')) return;

      if (selectedCategory !== 'All' && categoryLabel !== selectedCategory) {
        return;
      }

      // 3. Resolve Price according to Intent
      let priceToUse = 0;
      if (selectedIntent === 'Sell') {
        const rawPrice = trendPriceType === 'Booking' ? (deal.closedPrice || deal.price) : deal.price;
        priceToUse = parseNumber(rawPrice);
      } else if (selectedIntent === 'Rent') {
        const rawRent = deal.monthlyRent || (deal.inventory?.rentPrice?.value || deal.inventory?.rentPrice) || deal.price;
        priceToUse = parseNumber(rawRent);
      } else if (selectedIntent === 'Lease') {
        const rawLease = deal.monthlyRent || (deal.inventory?.leasePrice?.value || deal.inventory?.leasePrice) || deal.price;
        priceToUse = parseNumber(rawLease);
      }

      if (!priceToUse || priceToUse <= 0) return;

      // 4. Resolve Area using Smart Engine
      const areaInfo = resolveDealArea(deal);
      if (!areaInfo || !areaInfo.area || areaInfo.area <= 0) return;

      // 5. Valuation Logic
      let finalPricePerUnit = 0;

      if (selectedIntent === 'Sell') {
        // AVM: Residual Land Value Method for Built-up Properties
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

        // Canonical Land Rate per Sq.Yard (Gaj)
        const areaInSqYd = convertToSqYards(areaInfo.area, areaInfo.unit);
        if (!areaInSqYd || areaInSqYd <= 0) return;

        const rawPricePerSqYd = effectiveLandPrice / areaInSqYd;

        // Market Outlier Filter: ₹5,000 to ₹1,000,000 / Sq.Yd
        if (rawPricePerSqYd < 5000 || rawPricePerSqYd > 1000000) return;

        // Authoritative Orientation Normalization: Derive pure Base Price (Standard 9m Road)
        const basePricePerSqYd = calculateBasePriceFromRate(rawPricePerSqYd, {
          roadWidth: deal.roadWidth || deal.inventory?.roadWidth,
          direction: deal.direction || deal.inventory?.direction,
          facing: deal.facing || deal.inventory?.facing
        });

        // Rate based on user-selected metric toggle
        finalPricePerUnit = trendMetricUnit === 'Sq.Yd' ? basePricePerSqYd : (basePricePerSqYd / 9);

      } else if (selectedIntent === 'Rent') {
        // Rent Valuation: Monthly Rent per Covered/Built-up Area
        const areaInSqFt = convertToSqFt(areaInfo.area, areaInfo.unit);
        if (!areaInSqFt || areaInSqFt <= 0) return;

        const rentPerSqFt = priceToUse / areaInSqFt;

        // Rent Outlier Filter: ₹0.50 to ₹500 / Sq.Ft / Month
        if (rentPerSqFt < 0.5 || rentPerSqFt > 500) return;

        finalPricePerUnit = trendMetricUnit === 'Sq.Ft' ? rentPerSqFt : (rentPerSqFt * 9);

      } else if (selectedIntent === 'Lease') {
        // Commercial Lease Valuation: Monthly Lease per Super Area
        const areaInSqFt = convertToSqFt(areaInfo.area, areaInfo.unit);
        if (!areaInSqFt || areaInSqFt <= 0) return;

        const leasePerSqFt = priceToUse / areaInSqFt;

        // Lease Outlier Filter: ₹1 to ₹2000 / Sq.Ft / Month
        if (leasePerSqFt < 1 || leasePerSqFt > 2000) return;

        finalPricePerUnit = trendMetricUnit === 'Sq.Ft' ? leasePerSqFt : (leasePerSqFt * 9);
      }

      // 6. Resolve Location
      const locationLabel = resolveLocationLabel(deal);
      if (isBlockName(locationLabel)) return;

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
        .filter(([loc]) => !isBlockName(loc))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
    } else {
      plotLocations = isBlockName(selectedLocation) ? [] : [selectedLocation];
    }
    
    // Rounding helper based on intent & unit
    const roundRate = (val) => {
      if (val === null || val === undefined) return null;
      if (selectedIntent === 'Sell') return Math.round(val);
      if (trendMetricUnit === 'Sq.Ft') return Math.round(val * 10) / 10;
      return Math.round(val);
    };

    // Calculate Averages and Carry-forward
    let lastOverallPrice = 0;
    const locLastPrices = {};
    plotLocations.forEach(loc => locLastPrices[loc] = 0);

    const data = Object.values(months).map(m => {
      const row = { month: m.month, count: m.count };
      
      let overallAvg = m.count > 0 ? roundRate(m.sum / m.count) : null;
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
          locAvg = roundRate(locStats.sum / locStats.count);
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
  }, [deals, selectedIntent, resolveDealArea, resolveIntentLabel, resolveCategoryLabel, resolveLocationLabel, trendMetricUnit, trendPriceType, selectedCategory, selectedLocation]);

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

  const yAxisFormatter = useCallback((val) => {
    if (val === null || val === undefined || isNaN(val)) return '';
    if (selectedIntent === 'Sell') {
      if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
      return `₹${val}`;
    }
    if (val < 10) return `₹${val.toFixed(1)}`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
    return `₹${Math.round(val)}`;
  }, [selectedIntent]);

  // Memoized custom Tooltip renderer
  const renderTooltip = useCallback((tooltipProps) => (
    <PriceTrendTooltip 
      {...tooltipProps} 
      isDark={isDark} 
      trendMetricUnit={trendMetricUnit} 
      activeCategories={activeCategories} 
      selectedIntent={selectedIntent} 
    />
  ), [isDark, trendMetricUnit, activeCategories, selectedIntent]);

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
              {selectedIntent === 'Sell' 
                ? `Market Price by Project (Per ${trendMetricUnit})`
                : selectedIntent === 'Rent'
                  ? `Market Rental Index by Project (Per ${trendMetricUnit}/Mo)`
                  : `Commercial Lease Benchmark (Per ${trendMetricUnit}/Mo)`}
            </div>
            <div style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
              {totalDealsAnalyzed} {selectedIntent.toLowerCase()} deals indexed across micro-markets
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Intent Toggle */}
          <div style={{ display: 'flex', gap: '3px', borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`, paddingRight: '8px' }}>
            <button 
              style={btnStyle(selectedIntent === 'Sell')} 
              onClick={() => handleIntentChange('Sell')}
            >
              Sell
            </button>
            <button 
              style={btnStyle(selectedIntent === 'Rent')} 
              onClick={() => handleIntentChange('Rent')}
            >
              Rent
            </button>
            <button 
              style={btnStyle(selectedIntent === 'Lease')} 
              onClick={() => handleIntentChange('Lease')}
            >
              Lease
            </button>
          </div>

          {/* Category Filter */}
          <select 
            style={selectStyle}
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="All">All Categories</option>
            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          
          {/* Project / Location Filter */}
          <select 
            style={selectStyle}
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="Top 5">Top 5 Projects</option>
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
            <LineChart data={trendData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis 
                tick={{ fill: tickColor, fontSize: 10, fontWeight: 600 }} 
                axisLine={false} 
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={yAxisFormatter}
              />
              <Tooltip content={renderTooltip} />
              <Legend iconType="circle" wrapperStyle={LEGEND_WRAPPER_STYLE} />
              
              {/* Render active location lines */}
              {activeCategories.map((loc, idx) => {
                const strokeColor = LINE_COLORS[idx % LINE_COLORS.length];
                return (
                  <Line 
                    key={loc}
                    type="monotone" 
                    dataKey={loc} 
                    name={loc}
                    stroke={strokeColor} 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: strokeColor, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#ffffff', stroke: strokeColor, strokeWidth: 2 }}
                    connectNulls={true}
                  />
                );
              })}

              {/* Bold Overall Trend */}
              <Line 
                type="monotone" 
                dataKey="Overall" 
                name={selectedIntent === 'Sell' ? 'Overall Index' : selectedIntent === 'Rent' ? 'Overall Rental Index' : 'Overall Lease Index'}
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
              No {selectedIntent.toLowerCase()} benchmark data for {selectedCategory !== 'All' ? selectedCategory : 'selected filter'}
            </div>
            <div style={{ fontSize: '0.74rem', maxWidth: '380px', textAlign: 'center', lineHeight: 1.4 }}>
              Switch to "All Categories" or click "Expected" to inspect broader {selectedIntent.toLowerCase()} listings.
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
