import mongoose from 'mongoose';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Inventory from '../models/Inventory.js';
import Conversation from '../models/Conversation.js';
import Company from '../models/Company.js';
import Activity from '../models/Activity.js';
import MergeAudit from '../models/MergeAudit.js';

function nameSimilarity(name1, name2) {
    if (!name1 || !name2) return 'missing';
    let n1 = name1.toLowerCase().replace(/[^a-z]/g, '');
    let n2 = name2.toLowerCase().replace(/[^a-z]/g, '');
    if (n1 === n2) return 'exact';
    if (n1.includes(n2) || n2.includes(n1)) return 'strong';
    return 'conflict';
}

export const classifyGroup = (group) => {
    group.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const canonical = group[0];
    
    let classification = 'SAFE_AUTO_MERGE';
    let reasons = [];
    
    for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        
        const nSim = nameSimilarity(canonical.name, dup.name);
        if (nSim === 'conflict') {
            reasons.push(`Name Conflict: ${canonical.name} vs ${dup.name}`);
            classification = 'DO_NOT_MERGE';
        } else if (nSim === 'missing') {
            reasons.push(`Name Missing`);
            if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
        }
        
        if (canonical.owner && dup.owner && canonical.owner.toString() !== dup.owner.toString()) {
            reasons.push(`Ownership Conflict`);
            if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
        }
        
        if (canonical.documents?.length > 0 && dup.documents?.length > 0) {
            reasons.push(`Document Conflict`);
            if (classification === 'SAFE_AUTO_MERGE') classification = 'REVIEW_REQUIRED';
        }
    }
    
    return { classification, reasons, canonical, duplicates: group.slice(1) };
};

export const previewMerge = async (canonical, duplicate) => {
    const fieldChanges = [];
    const referenceRewires = [];
    const consolidatedFields = { $set: {}, $addToSet: {} };
    
    // Arrays
    if (duplicate.phones) {
        const newPhones = duplicate.phones.filter(dp => !canonical.phones.some(cp => cp.number === dp.number));
        if (newPhones.length > 0) {
            consolidatedFields.$addToSet.phones = { $each: newPhones };
            fieldChanges.push({ field: 'phones', oldValue: canonical.phones, newValue: [...canonical.phones, ...newPhones] });
        }
    }
    
    if (duplicate.emails) {
        const newEmails = duplicate.emails.filter(dp => !canonical.emails.some(cp => cp.address === dp.address));
        if (newEmails.length > 0) {
            consolidatedFields.$addToSet.emails = { $each: newEmails };
            fieldChanges.push({ field: 'emails', oldValue: canonical.emails, newValue: [...canonical.emails, ...newEmails] });
        }
    }
    
    if (duplicate.tags) {
        const newTags = duplicate.tags.filter(t => !canonical.tags.includes(t));
        if (newTags.length > 0) {
            consolidatedFields.$addToSet.tags = { $each: newTags };
            fieldChanges.push({ field: 'tags', oldValue: canonical.tags, newValue: [...canonical.tags, ...newTags] });
        }
    }
    
    // Scalars
    const scalars = ['company', 'designation', 'source', 'subSource', 'campaign', 'professionCategory'];
    for (const f of scalars) {
        if (!canonical[f] && duplicate[f]) {
            consolidatedFields.$set[f] = duplicate[f];
            fieldChanges.push({ field: f, oldValue: null, newValue: duplicate[f] });
        }
    }
    
    // Addresses
    if (!canonical.personalAddress?.city && duplicate.personalAddress?.city) {
        consolidatedFields.$set.personalAddress = duplicate.personalAddress;
        fieldChanges.push({ field: 'personalAddress', oldValue: canonical.personalAddress, newValue: duplicate.personalAddress });
    }
    
    // References
    const dupId = duplicate._id;
    const masId = canonical._id;
    
    const appendRewire = (col, docId, field, oldV, newV) => {
        referenceRewires.push({ collectionName: col, documentId: docId, field, oldValue: oldV, newValue: newV });
    };

    // Leads
    const leads = await Lead.find({ contactDetails: dupId }).lean();
    for (const l of leads) {
        appendRewire('Lead', l._id, 'contactDetails', dupId, masId);
    }
    
    // Deals
    const deals = await Deal.find({ $or: [{owner: dupId}, {buyer: dupId}, {channelPartner: dupId}, {associatedContact: dupId}] }).lean();
    for (const d of deals) {
        if (d.owner?.toString() === dupId.toString()) appendRewire('Deal', d._id, 'owner', dupId, masId);
        if (d.buyer?.toString() === dupId.toString()) appendRewire('Deal', d._id, 'buyer', dupId, masId);
        if (d.channelPartner?.toString() === dupId.toString()) appendRewire('Deal', d._id, 'channelPartner', dupId, masId);
        if (d.associatedContact?.toString() === dupId.toString()) appendRewire('Deal', d._id, 'associatedContact', dupId, masId);
    }
    
    // Bookings
    const bookings = await Booking.find({ $or: [{lead: dupId}, {seller: dupId}, {channelPartner: dupId}] }).lean();
    for (const b of bookings) {
        if (b.lead?.toString() === dupId.toString()) appendRewire('Booking', b._id, 'lead', dupId, masId);
        if (b.seller?.toString() === dupId.toString()) appendRewire('Booking', b._id, 'seller', dupId, masId);
        if (b.channelPartner?.toString() === dupId.toString()) appendRewire('Booking', b._id, 'channelPartner', dupId, masId);
    }
    
    // Inventory
    const invs = await Inventory.find({ $or: [{owners: dupId}, {'associates.contact': dupId}, {'ownerHistory.contactId': dupId}] }).lean();
    for (const inv of invs) {
        if (inv.owners?.some(o => o.toString() === dupId.toString())) appendRewire('Inventory', inv._id, 'owners', dupId, masId);
        if (inv.associates?.some(a => a.contact?.toString() === dupId.toString())) appendRewire('Inventory', inv._id, 'associates.contact', dupId, masId);
        if (inv.ownerHistory?.some(oh => oh.contactId?.toString() === dupId.toString())) appendRewire('Inventory', inv._id, 'ownerHistory.contactId', dupId, masId);
    }
    
    // Activity
    const acts = await Activity.find({ $or: [{entityId: dupId}, {'relatedTo.id': dupId}] }).lean();
    for (const act of acts) {
        if (act.entityId?.toString() === dupId.toString()) appendRewire('Activity', act._id, 'entityId', dupId, masId);
        if (act.relatedTo?.some(r => r.id?.toString() === dupId.toString() && r.model === 'Contact')) appendRewire('Activity', act._id, 'relatedTo.id', dupId, masId);
    }
    
    // Conversation
    const convs = await Conversation.find({ contact: dupId }).lean();
    for (const c of convs) {
        appendRewire('Conversation', c._id, 'contact', dupId, masId);
    }
    
    // Company
    const comps = await Company.find({ employees: dupId }).lean();
    for (const c of comps) {
        appendRewire('Company', c._id, 'employees', dupId, masId);
    }

    if (Object.keys(consolidatedFields.$set).length === 0) delete consolidatedFields.$set;
    if (Object.keys(consolidatedFields.$addToSet).length === 0) delete consolidatedFields.$addToSet;
    
    return { fieldChanges, referenceRewires, consolidatedFields };
};

export const executeMerge = async (canonicalId, duplicateId, previewData, options = {}) => {
    return await withMongoTransaction(async (session) => {
        const auditId = new mongoose.Types.ObjectId().toString();
        
        let audit = await MergeAudit.create([{
            mergeOperationId: auditId,
            masterContactId: canonicalId,
            duplicateContactId: duplicateId,
            status: 'PENDING',
            fieldChanges: previewData.fieldChanges,
            referenceRewires: previewData.referenceRewires,
            createdBy: options.userId || null
        }], { session });
        
        audit = audit[0];
        
        const masId = canonicalId;
        const dupId = duplicateId;
        
        // 1. Rewire References
        for (let i = 0; i < audit.referenceRewires.length; i++) {
            const rw = audit.referenceRewires[i];
            const Model = mongoose.model(rw.collectionName);
            
            const doc = await Model.findById(rw.documentId).session(session).lean();
            if (!doc) continue;

            if (rw.field === 'owners' || rw.field === 'employees') {
                const originalArray = doc[rw.field] || [];
                // Save full exact original array to audit log for mathematically perfect rollback
                rw.oldValue = originalArray;
                rw.newValue = masId;

                // Deterministically compute the final array
                const newArray = [];
                const seen = new Set();
                for (const item of originalArray) {
                    if (!item) continue;
                    let strId = item.toString();
                    if (strId === dupId.toString()) strId = masId.toString();
                    if (!seen.has(strId)) {
                        seen.add(strId);
                        newArray.push(new mongoose.Types.ObjectId(strId));
                    }
                }
                
                await Model.updateOne({ _id: rw.documentId }, { $set: { [rw.field]: newArray } }, { session });
                
            } else if (rw.field === 'ownerHistory.contactId') {
                const originalArray = doc.ownerHistory || [];
                rw.oldValue = originalArray;
                rw.newValue = masId;

                const newArray = [];
                for (const h of originalArray) {
                    const newItem = { ...h };
                    if (newItem.contactId?.toString() === dupId.toString()) {
                        newItem.contactId = new mongoose.Types.ObjectId(masId.toString());
                    }
                    newArray.push(newItem);
                }
                
                await Model.updateOne({ _id: rw.documentId }, { $set: { ownerHistory: newArray } }, { session });
                
            } else if (rw.field === 'associates.contact') {
                const originalArray = doc.associates || [];
                rw.oldValue = originalArray;
                rw.newValue = masId;

                const newArray = [];
                const seenContacts = new Set();
                for (const a of originalArray) {
                    if (!a.contact) {
                        newArray.push(a);
                        continue;
                    }
                    let cId = a.contact.toString();
                    if (cId === dupId.toString()) cId = masId.toString();
                    
                    if (!seenContacts.has(cId)) {
                        seenContacts.add(cId);
                        const newItem = { ...a };
                        newItem.contact = new mongoose.Types.ObjectId(cId);
                        newArray.push(newItem);
                    }
                }
                
                await Model.updateOne({ _id: rw.documentId }, { $set: { associates: newArray } }, { session });
                
            } else if (rw.field === 'relatedTo.id') {
                const originalArray = doc.relatedTo || [];
                rw.oldValue = originalArray;
                rw.newValue = masId;

                const newArray = [];
                const seen = new Set();
                for (const r of originalArray) {
                    if (!r.id || r.model !== 'Contact') {
                        newArray.push(r);
                        continue;
                    }
                    let rId = r.id.toString();
                    if (rId === dupId.toString()) rId = masId.toString();
                    
                    const key = `${r.model}_${rId}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        const newItem = { ...r };
                        newItem.id = new mongoose.Types.ObjectId(rId);
                        newArray.push(newItem);
                    }
                }
                
                await Model.updateOne({ _id: rw.documentId }, { $set: { relatedTo: newArray } }, { session });
                
            } else {
                // Primitive field
                await Model.updateOne({ _id: rw.documentId }, { $set: { [rw.field]: masId } }, { session });
            }
        }
        
        // 2. Consolidate Master
        if (previewData.consolidatedFields && Object.keys(previewData.consolidatedFields).length > 0) {
            await Contact.updateOne({ _id: canonicalId }, previewData.consolidatedFields, { session });
        }
        
        // 3. Mark Duplicate as Merged
        await Contact.updateOne({ _id: duplicateId }, { $set: { isMerged: true, mergedInto: canonicalId, isDeleted: true } }, { session });
        
        // 4. Complete Audit
        audit.status = 'COMPLETED';
        audit.completedAt = new Date();
        audit.markModified("referenceRewires");
        await audit.save({ session });
        
        return audit;
    });
};

export const rollbackMerge = async (mergeOperationId) => {
    return await withMongoTransaction(async (session) => {
        const audit = await MergeAudit.findOne({ mergeOperationId }).session(session);
        if (!audit || audit.status !== 'COMPLETED') throw new Error('Invalid or uncompleted audit record');
        if (!audit.rollbackAvailable) throw new Error('Rollback not available');
        
        // 1. Un-mark Duplicate
        await Contact.updateOne({ _id: audit.duplicateContactId }, { $set: { isMerged: false, isDeleted: false }, $unset: { mergedInto: 1 } }, { session });
        
        // 2. Un-consolidate Master fields
        if (audit.fieldChanges && audit.fieldChanges.length > 0) {
            const unsetFields = {};
            const setFields = {};
            for (const change of audit.fieldChanges) {
                if (change.oldValue === null || change.oldValue === undefined) {
                    unsetFields[change.field] = 1;
                } else {
                    setFields[change.field] = change.oldValue;
                }
            }
            const updateObj = {};
            if (Object.keys(unsetFields).length > 0) updateObj.$unset = unsetFields;
            if (Object.keys(setFields).length > 0) updateObj.$set = setFields;
            if (Object.keys(updateObj).length > 0) {
                await Contact.updateOne({ _id: audit.masterContactId }, updateObj, { session });
            }
        }
        
        // 3. Un-rewire references
        for (const rw of audit.referenceRewires) {
            const Model = mongoose.model(rw.collectionName);
            if (rw.field === 'owners' || rw.field === 'employees') {
                if (Array.isArray(rw.oldValue)) {
                    // Perfect state restoration
                    await Model.updateOne({ _id: rw.documentId }, { $set: { [rw.field]: rw.oldValue } }, { session });
                } else {
                    // Legacy fallback
                    await Model.updateOne({ _id: rw.documentId }, { $pull: { [rw.field]: rw.newValue } }, { session });
                    await Model.updateOne({ _id: rw.documentId }, { $addToSet: { [rw.field]: rw.oldValue } }, { session });
                }
            } else if (rw.field === 'ownerHistory.contactId') {
                if (Array.isArray(rw.oldValue)) {
                    await Model.updateOne({ _id: rw.documentId }, { $set: { ownerHistory: rw.oldValue } }, { session });
                } else {
                    await Model.updateOne({ _id: rw.documentId, 'ownerHistory.contactId': rw.newValue }, { $set: { 'ownerHistory.$.contactId': rw.oldValue } }, { session });
                }
            } else if (rw.field === 'associates.contact') {
                if (Array.isArray(rw.oldValue)) {
                    await Model.updateOne({ _id: rw.documentId }, { $set: { associates: rw.oldValue } }, { session });
                } else {
                    await Model.updateOne({ _id: rw.documentId, 'associates.contact': rw.newValue }, { $set: { 'associates.$.contact': rw.oldValue } }, { session });
                }
            } else if (rw.field === 'relatedTo.id') {
                if (Array.isArray(rw.oldValue)) {
                    await Model.updateOne({ _id: rw.documentId }, { $set: { relatedTo: rw.oldValue } }, { session });
                } else {
                    await Model.updateOne({ _id: rw.documentId, 'relatedTo.id': rw.newValue, 'relatedTo.model': 'Contact' }, { $set: { 'relatedTo.$.id': rw.oldValue } }, { session });
                }
            } else {
                await Model.updateOne({ _id: rw.documentId }, { $set: { [rw.field]: rw.oldValue } }, { session });
            }
        }
        
        audit.status = 'ROLLED_BACK';
        audit.rollbackAvailable = false;
        await audit.save({ session });
        
        return audit;
    });
};
