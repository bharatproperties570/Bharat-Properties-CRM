import mongoose from 'mongoose';

export const inventoryWriteLock = async (req, res, next) => {
    try {
        const SystemSetting = mongoose.connection.model('SystemSetting');
        const lock = await SystemSetting.findOne({ key: 'INVENTORY_WRITE_LOCK' }).lean();
        
        if (lock && lock.value === true) {
            return res.status(503).json({ 
                success: false, 
                message: "Inventory maintenance in progress. Please try again later.",
                error: "INVENTORY_WRITE_LOCK_ACTIVE"
            });
        }
        next();
    } catch (error) {
        console.error("[InventoryWriteLock] Failure checking SystemSetting:", error);
        return res.status(503).json({ 
            success: false, 
            message: "System availability check failed. Please try again.",
            error: "SYSTEM_SETTING_READ_FAILURE"
        });
    }
};
