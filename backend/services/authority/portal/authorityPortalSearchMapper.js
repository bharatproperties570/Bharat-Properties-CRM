/**
 * Pure CRM-to-portal search mapping. It does not submit a portal form.
 * Dropdown values must subsequently be matched against actual portal options.
 */

import { getAuthorityPortalDefinition } from './authorityPortalDefinitions.js';

const asText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value === 'object') {
        const candidate = value.lookup_value ?? value.name ?? value.title ?? value.value ?? value.label;
        return candidate === null || candidate === undefined ? '' : String(candidate).trim();
    }
    return '';
};

const firstText = (...values) => {
    for (const value of values) {
        const text = asText(value);
        if (text) return text;
    }
    return '';
};

const GMADA_LOCATION_ALIASES = Object.freeze({ 'sas nagar': 'Mohali' });
const KNOWN_GMADA_CITY_SUFFIXES = Object.freeze([
    'Mohali', 'Kharar', 'Zirakpur', 'Dera Bassi', 'Naya Gaon'
]);

export function normalizeAuthorityLocation(value) {
    const raw = asText(value);
    if (!raw) return '';
    return GMADA_LOCATION_ALIASES[raw.toLocaleLowerCase('en-IN')] || raw;
}

/**
 * Project name is only a fallback when it ends with a known GMADA locality.
 * Arbitrary project names are never treated as portal Location values.
 */
export function inferKnownGmadaLocationFromProjectName(projectName) {
    const project = asText(projectName);
    if (!project) return '';
    const suffix = KNOWN_GMADA_CITY_SUFFIXES.find((city) =>
        project.toLocaleLowerCase('en-IN').endsWith(city.toLocaleLowerCase('en-IN'))
    );
    return suffix || '';
}

export function normalizePortalOptionLabel(value) {
    return asText(value)
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-IN');
}

/** Exact match only; fuzzy dropdown selection is deliberately unsupported. */
export function resolveExactPortalOption(requestedValue, options = []) {
    const requested = normalizePortalOptionLabel(requestedValue);
    if (!requested) return { matched: false, value: null, reason: 'EMPTY_REQUESTED_VALUE' };

    const option = options.find((candidate) => {
        const label = typeof candidate === 'string'
            ? candidate
            : candidate?.label ?? candidate?.text ?? candidate?.value;
        return normalizePortalOptionLabel(label) === requested;
    });

    if (!option) return { matched: false, value: null, reason: 'NO_EXACT_OPTION_MATCH' };

    const value = typeof option === 'string'
        ? option
        : option?.value ?? option?.label ?? option?.text;
    return { matched: true, value, reason: null };
}

function result(authorityCode, searchMode, criteria, { requiredAll = [], anyOf = [] } = {}) {
    const missing = requiredAll.filter((key) => !asText(criteria[key]));
    const missingAnyOf = anyOf.filter((group) => !group.some((key) => Boolean(asText(criteria[key]))));
    const missingGroups = [
        ...missing,
        ...missingAnyOf.map((group) => group.join('|'))
    ];
    return Object.freeze({
        authorityCode,
        searchMode,
        criteria: Object.freeze(criteria),
        missingGroups: Object.freeze(missingGroups),
        ready: missingGroups.length === 0
    });
}

/**
 * @param {object} args
 * @param {string} args.authorityCode HSVP | GMADA | CHD
 * @param {object} [args.inventory] CRM Inventory object
 * @param {object} [args.authorityLink] PropertyAuthorityLink object
 * @param {object} [args.overrides] Explicit operator-supplied portal search inputs
 */
export function buildAuthorityPortalSearchInput({
    authorityCode,
    inventory = {},
    authorityLink = {},
    overrides = {}
} = {}) {
    const definition = getAuthorityPortalDefinition(authorityCode);
    const sector = firstText(authorityLink.sectorNumber, inventory.sector, inventory.sectorNumber);
    const propertyNumber = firstText(authorityLink.propertyId, inventory.propertyId, inventory.unitNo, inventory.unitNumber);

    if (definition.authorityCode === 'HSVP') {
        return result('HSVP', 'URBAN_ESTATE_SECTOR_PLOT', {
            urbanEstate: firstText(authorityLink.urbanEstate, inventory.city, inventory.address?.city),
            sector,
            plotNumber: propertyNumber
        }, { requiredAll: ['urbanEstate', 'sector', 'plotNumber'] });
    }

    if (definition.authorityCode === 'GMADA') {
        const crmCity = firstText(inventory.city, inventory.address?.city);
        const location = normalizeAuthorityLocation(
            firstText(crmCity, inferKnownGmadaLocationFromProjectName(inventory.projectName))
        );
        const criteria = {
            location,
            sectors: sector,
            usageType: firstText(inventory.category),
            propertyType: firstText(inventory.subCategory),
            propertyNo: propertyNumber,
            formNo: firstText(authorityLink.formNumber, inventory.formNumber)
        };
        return result(
            'GMADA',
            criteria.propertyNo ? 'PROPERTY_NUMBER' : 'FORM_NUMBER',
            criteria,
            { requiredAll: ['location', 'sectors'], anyOf: [['propertyNo', 'formNo']] }
        );
    }

    const plotCriteria = { plotNo: propertyNumber, sectorNo: sector };
    const fileCriteria = {
        fileType: firstText(overrides.fileType),
        fileNumber: firstText(authorityLink.fileNumber, inventory.fileNumber, overrides.fileNumber)
    };

    if (plotCriteria.plotNo && plotCriteria.sectorNo) {
        return result('CHD', 'PLOT_SECTOR', plotCriteria, { requiredAll: ['plotNo', 'sectorNo'] });
    }
    return result(
        'CHD',
        'FILE_NUMBER',
        fileCriteria,
        { requiredAll: ['fileType', 'fileNumber'] }
    );
}
