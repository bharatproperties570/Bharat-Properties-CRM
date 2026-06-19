import { useCallback } from 'react';
import { usePropertyConfig } from '../context/PropertyConfigContext';

/**
 * Resolve all lookup fields in a given data object.
 * Returns a new object with the same shape where every ID / object reference
 * is replaced by its display label.
 */
export const useResolvedFormData = (rawData) => {
  const { getLookupValue } = usePropertyConfig();

  const resolveField = useCallback((val, type) => {
    if (!val) return '';
    // Map internal camelCase keys to the exact lookup type names used in the backend
    const typeMap = {
      RoadWidth: 'Road Width',
      UnitType: 'UnitType',
      Category: 'Category',
      SubCategory: 'SubCategory',
      Status: 'Status',
      Intent: 'Intent',
      BuiltupType: 'BuiltupType',
      Direction: 'Direction',
      Facing: 'Facing',
      PossessionStatus: 'PossessionStatus',
      FurnishType: 'FurnishType',
      PropertyType: 'PropertyType',
    };
    const lookupType = typeMap[type] || type;

    if (typeof val === 'object') {
      const label = val.lookup_value || val.name || val.label;
      if (label && !/^[0-9a-fA-F]{24}$/.test(String(label))) return label;
      val = val._id || val.id || val;
    }
    const resolved = getLookupValue(lookupType, val);
    if (resolved && !/^[0-9a-fA-F]{24}$/.test(String(resolved))) return String(resolved);
    if (typeof val === 'string' && !/^[0-9a-fA-F]{24}$/.test(val)) return val;
    return '';
  }, [getLookupValue]);

  // Clone and resolve known lookup keys
  const resolved = { ...rawData };
  const lookupKeys = [
    'category', 'subCategory', 'unitType', 'builtupType',
    'direction', 'facing', 'roadWidth', 'status', 'intent',
    'possessionStatus', 'furnishType', 'sizeType', 'propertyType'
  ];

  lookupKeys.forEach((key) => {
    if (key in resolved) {
      const capitalised = key.charAt(0).toUpperCase() + key.slice(1);
      resolved[key] = resolveField(resolved[key], capitalised);
    }
  });

  // Resolve nested address fields (country, state, city, location, tehsil, postOffice, pincode)
  if (resolved.address) {
    const addr = { ...resolved.address };
    ['country', 'state', 'city', 'location', 'tehsil', 'postOffice', 'pincode'].forEach((a) => {
      if (addr[a]) {
        const label = addr[a].lookup_value || addr[a].name || addr[a].label;
        if (label && !/^[0-9a-fA-F]{24}$/.test(String(label))) {
          addr[a] = label;
        } else if (addr[a]._id) {
          const r = getLookupValue(a.charAt(0).toUpperCase() + a.slice(1), addr[a]._id);
          addr[a] = r || '';
        }
      }
    });
    resolved.address = addr;
  }

  return resolved;
};
