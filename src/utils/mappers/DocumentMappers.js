/**
 * PURE FUNCTION: Maps a legacy document item from an entity.documents array
 * into the normalized DocumentViewModel.
 */
export const LegacyDocumentMapper = (legacyItem, entityType, entityId) => {
    if (!legacyItem) return null;

    const docUrl = typeof legacyItem.documentPicture === 'object' 
        ? legacyItem.documentPicture?.url 
        : legacyItem.documentPicture;

    const docNameFromPic = typeof legacyItem.documentPicture === 'object' 
        ? legacyItem.documentPicture?.name 
        : '';

    let urlFilename = '';
    if (docUrl && typeof docUrl === 'string') {
        try {
            urlFilename = decodeURIComponent(docUrl.split('/').pop().split('?')[0]);
        } catch (e) {
            // ignore
        }
    }

    const fallbackFileName = docNameFromPic || urlFilename || 'Legacy Document';

    // Normalize metadata
    const extractLookup = (val) => val && typeof val === 'object' ? (val.lookup_value || val.name || val._id) : val;

    return {
        id: legacyItem._id || `legacy-${Math.random()}`,
        documentId: null, // Legacy documents do not have a R4 Document ID
        isLegacy: true,
        entityType,
        entityId,
        metadata: {
            documentCategory: extractLookup(legacyItem.documentCategory),
            documentType: extractLookup(legacyItem.documentType),
            documentName: extractLookup(legacyItem.documentName) || extractLookup(legacyItem.name),
            documentNo: legacyItem.documentNo || legacyItem.documentNumber || legacyItem.registrationNo || '',
            projectName: extractLookup(legacyItem.projectName),
            unitNumber: legacyItem.unitNumber || '',
            block: legacyItem.block || ''
        },
        fileName: fallbackFileName,
        mimeType: 'unknown',
        sizeBytes: 0,
        state: 'ACTIVE', // Legacy is always considered active if present
        uploadedAt: legacyItem.uploadedAt || legacyItem.createdAt || legacyItem.date || null,
        createdAt: legacyItem.createdAt || legacyItem.uploadedAt || legacyItem.date || null,
        updatedAt: legacyItem.uploadedAt || legacyItem.createdAt || null,
        readCapability: !!docUrl,
        deleteCapability: true,
        // Legacy fields for direct opening
        legacyUrl: docUrl
    };
};

/**
 * PURE FUNCTION: Maps a new Document DTO into the normalized DocumentViewModel.
 */
export const DocumentMapper = (dto) => {
    if (!dto) return null;

    const extractLookup = (val) => val && typeof val === 'object' ? (val.lookup_value || val.name || val._id) : val;
    const md = dto.metadata || {};

    return {
        id: dto.documentId,
        documentId: dto.documentId,
        isLegacy: false,
        entityType: dto.entityType,
        entityId: dto.entityId,
        metadata: {
            documentCategory: extractLookup(md.documentCategory),
            documentType: extractLookup(md.documentType),
            documentName: extractLookup(md.documentName) || extractLookup(md.name),
            documentNo: md.documentNo || md.documentNumber || md.registrationNo || '',
            projectName: extractLookup(md.projectName),
            unitNumber: md.unitNumber || '',
            block: md.block || ''
        },
        fileName: md.documentName || `Document-${dto.documentId}`, // Real filename comes from stream usually, fallback
        mimeType: dto.mimeType || 'unknown',
        sizeBytes: dto.sizeBytes || 0,
        state: dto.state,
        uploadedAt: dto.createdAt,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
        readCapability: dto.state === 'ACTIVE',
        deleteCapability: dto.state !== 'DELETED'
    };
};
