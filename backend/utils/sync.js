import Contact from "../models/Contact.js";
import Inventory from "../models/Inventory.js";
import mongoose from "mongoose";

/**
 * Syncs documents with linkedContactMobile to the corresponding Contact record.
 */
export const syncDocumentsToContact = async (documents, metadata = {}) => {
    if (!documents || !Array.isArray(documents)) return;

    for (const doc of documents) {
        if (doc.linkedContactMobile && doc.url) {
            try {
                // Find contact by mobile
                const contact = await Contact.findOne({ "phones.number": doc.linkedContactMobile });
                
                if (contact) {
                    // Check if duplicate
                    const isDuplicate = contact.documents.some(d => d.documentNo === doc.documentNo && d.documentPicture === doc.url);
                    
                    if (!isDuplicate) {
                        const docCategory = doc.documentCategory || doc.documentName; 
                        const docType = doc.documentType;
                        const docNo = doc.documentNo || doc.documentNumber;

                        contact.documents.push({
                            documentCategory: mongoose.Types.ObjectId.isValid(docCategory) ? docCategory : undefined,
                            documentType: mongoose.Types.ObjectId.isValid(docType) ? docType : undefined,
                            documentName: mongoose.Types.ObjectId.isValid(docType) ? docType : undefined,
                            documentNo: docNo,
                            projectName: metadata.projectName || doc.projectName,
                            block: metadata.block || doc.block,
                            unitNumber: metadata.unitNumber || doc.unitNumber,
                            documentPicture: doc.url
                        });
                        
                        await contact.save();
                        console.log(`[SYNC -> CONTACT] Document synced: ${contact.name} (${doc.linkedContactMobile})`);
                    }
                }
            } catch (error) {
                console.error(`[SYNC ERROR -> CONTACT] ${error.message}`);
            }
        }
    }
};

/**
 * Syncs documents with Inventory links to the corresponding Inventory record.
 */
export const syncDocumentsToInventory = async (documents, ownerInfo = {}) => {
    if (!documents || !Array.isArray(documents)) return;

    for (const doc of documents) {
        if (doc.unitNumber && doc.projectName && doc.url) {
            try {
                // Find Inventory by Project, Block, and UnitNumber
                const query = {
                    projectName: doc.projectName,
                    unitNo: doc.unitNumber // In Inventory model it's often unitNo or unitNumber
                };
                if (doc.block) query.block = doc.block;

                let inventory = await Inventory.findOne(query);
                
                // Fallback for unitNumber field name
                if (!inventory) {
                    delete query.unitNo;
                    query.unitNumber = doc.unitNumber;
                    inventory = await Inventory.findOne(query);
                }

                if (inventory) {
                    // Check if duplicate
                    const isDuplicate = inventory.inventoryDocuments.some(d => d.url === doc.url);
                    
                    if (!isDuplicate) {
                        inventory.inventoryDocuments.push({
                            documentName: doc.documentNo || doc.documentNumber, // Or map to Type Name if needed
                            documentType: doc.documentType, // ID
                            linkedContactMobile: ownerInfo.mobile || ownerInfo.phone || "",
                            url: doc.url
                        });
                        
                        await inventory.save();
                        console.log(`[SYNC -> INVENTORY] Document synced to unit: ${doc.unitNumber}`);
                    }
                } else {
                    console.warn(`[SYNC] Inventory not found for unit: ${doc.unitNumber} in project: ${doc.projectName}`);
                }
            } catch (error) {
                console.error(`[SYNC ERROR -> INVENTORY] ${error.message}`);
            }
        }
    }
};
