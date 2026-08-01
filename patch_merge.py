import sys

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/contact.controller.js"

with open(file_path, "r") as f:
    content = f.read()

merge_function = """

export const mergeContacts = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { masterContactId, duplicateContactIds, resolvedData } = req.body;

        if (!masterContactId || !duplicateContactIds || !Array.isArray(duplicateContactIds) || duplicateContactIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        // 1. Verify all contacts exist
        const masterContact = await Contact.findById(masterContactId).session(session);
        if (!masterContact) {
            throw new Error('Master contact not found');
        }

        const duplicates = await Contact.find({ _id: { $in: duplicateContactIds } }).session(session);
        if (duplicates.length !== duplicateContactIds.length) {
            throw new Error('One or more duplicate contacts not found');
        }

        // 2. Update Master Contact with resolvedData
        const updatedMaster = await Contact.findByIdAndUpdate(
            masterContactId,
            { $set: resolvedData },
            { new: true, session }
        );

        // 3. Migrate Related Records (Leads, Activities, Bookings, Portfolios, Inventory owners)
        
        // Leads
        await Lead.updateMany(
            { contactDetails: { $in: duplicateContactIds } },
            { $set: { contactDetails: masterContactId } },
            { session }
        );

        // Activities
        await Activity.updateMany(
            { contact: { $in: duplicateContactIds } },
            { $set: { contact: masterContactId } },
            { session }
        );

        // Bookings
        await Booking.updateMany(
            { lead: { $in: duplicateContactIds } },
            { $set: { lead: masterContactId } },
            { session }
        );
        await Booking.updateMany(
            { seller: { $in: duplicateContactIds } },
            { $set: { seller: masterContactId } },
            { session }
        );

        // Inventory owners
        await Inventory.updateMany(
            { owners: { $in: duplicateContactIds } },
            { $addToSet: { owners: masterContactId } },
            { session }
        );
        // Remove duplicate owner IDs from Inventory
        await Inventory.updateMany(
            { owners: { $in: duplicateContactIds } },
            { $pullAll: { owners: duplicateContactIds } },
            { session }
        );

        // 4. Delete Duplicate Contacts
        await Contact.deleteMany({ _id: { $in: duplicateContactIds } }).session(session);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Contacts merged successfully',
            data: updatedMaster
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[ERROR] mergeContacts failed:', error);
        next(error);
    }
};
"""

if "export const mergeContacts" not in content:
    with open(file_path, "a") as f:
        f.write(merge_function)
    print("Function added successfully.")
else:
    print("Function already exists.")
