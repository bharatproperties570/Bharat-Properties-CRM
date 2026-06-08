import mongoose from "mongoose";
import Inventory from "./models/Inventory.js";

mongoose.connect("mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority").then(async () => {
    
    const db = mongoose.connection.db;
    const activities = await db.collection("activities").find({ type: "Call Back" }).sort({_id: -1}).limit(1).toArray();
    const a = activities[0];
    const inventoryIds = new Set();
    
    if (String(a.entityType || '').toLowerCase() === 'inventory' && a.entityId) {
        inventoryIds.add(String(a.entityId).trim());
    } else if (Array.isArray(a.relatedTo)) {
        a.relatedTo.forEach(r => {
            if (String(r.model || '').toLowerCase() === 'inventory' && r.id) {
                inventoryIds.add(String(r.id).trim());
            }
        });
    }
    
    const validInventoryObjIds = Array.from(inventoryIds).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    
    const inventories = await Inventory.find({ _id: { $in: validInventoryObjIds } }).select('projectName block').lean();
    
    const inventoryMap = new Map();
    inventories.forEach(inv => {
        inventoryMap.set(String(inv._id), { project: inv.projectName, block: inv.block });
    });
    
    let inventoryMatch = null;
    const eId = String(a.entityId || '');
    const eType = String(a.entityType || '').toLowerCase();
    
    if (eType === 'inventory') inventoryMatch = inventoryMap.get(eId);
    
    if (!inventoryMatch && Array.isArray(a.relatedTo)) {
        for (const r of a.relatedTo) {
            if (String(r.model || '').toLowerCase() === 'inventory') {
                inventoryMatch = inventoryMap.get(String(r.id));
                if (inventoryMatch) break;
            }
        }
    }
    
    if (inventoryMatch) {
        a.details = { ...a.details, project: inventoryMatch.project, block: inventoryMatch.block };
    }
    
    console.log("Details after populate:", a.details);
    
    process.exit(0);
});
