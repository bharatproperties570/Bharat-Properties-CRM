import mongoose from "mongoose";
import Booking from "../models/Booking.js";

export const createBooking = async (req, res) => {
    try {
        const bookingData = req.body;
        const booking = new Booking(bookingData);
        await booking.save();

        // Automate Deal Status: Closed (Won)
        const Deal = mongoose.model('Deal');
        let dealToUpdate = null;

        if (bookingData.dealId) {
            dealToUpdate = await Deal.findById(bookingData.dealId);
        } else if (bookingData.property && bookingData.lead) {
            // Find an open deal for the same property and lead
            dealToUpdate = await Deal.findOne({
                inventoryId: bookingData.property,
                'partyStructure.buyer': bookingData.lead,
                stage: { $ne: 'Closed' }
            });
        }

        if (dealToUpdate) {
            dealToUpdate.stage = 'Closed';
            dealToUpdate.status = 'Won';
            await dealToUpdate.save();

            // Link deal to booking if not already linked
            if (!booking.dealId) {
                booking.dealId = dealToUpdate._id;
                await booking.save();
            }
        }

        // Update Inventory Status to 'Sold Out' on Booking
        if (booking.property) {
            const Inventory = mongoose.model('Inventory');
            await Inventory.findByIdAndUpdate(booking.property, { status: 'Sold Out' });
        }

        res.status(201).json({ success: true, data: booking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getBookings = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate('property')
            .populate('lead')
            .populate('seller')
            .populate('salesAgent')
            .populate('channelPartner')
            .sort({ createdAt: -1 });

        // Live Owner Sync: If NOT registry/closed, fetch current owner from inventory
        const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
            const bookingObj = booking.toObject();
            if (!bookingObj.closingDetails?.isClosed && bookingObj.property) {
                const Inventory = mongoose.model('Inventory');
                const inventory = await Inventory.findById(bookingObj.property._id || bookingObj.property).populate('owners');
                if (inventory && inventory.owners && inventory.owners.length > 0) {
                    bookingObj.seller = inventory.owners[0];
                }
            }
            return bookingObj;
        }));

        res.status(200).json({ success: true, data: enrichedBookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('property')
            .populate('lead')
            .populate('seller')
            .populate('salesAgent')
            .populate('channelPartner');

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const bookingObj = booking.toObject();
        if (!bookingObj.closingDetails?.isClosed && bookingObj.property) {
            const Inventory = mongoose.model('Inventory');
            const inventory = await Inventory.findById(bookingObj.property._id || bookingObj.property).populate('owners');
            if (inventory && inventory.owners && inventory.owners.length > 0) {
                bookingObj.seller = inventory.owners[0];
            }
        }

        res.status(200).json({ success: true, data: bookingObj });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBooking = async (req, res) => {
    try {
        const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        res.status(200).json({ success: true, data: booking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findByIdAndDelete(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        res.status(200).json({ success: true, message: "Booking deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const closeBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { checklist, closingDate, remarks, newOwnerId } = req.body;

        const booking = await Booking.findById(id).populate('property lead seller');
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Update Booking
        booking.status = 'Registry'; // Match enum
        booking.closingDetails = {
            isClosed: true,
            closingDate: closingDate || new Date(),
            checklist: checklist,
            remarks: remarks,
            feedbackStatus: { buyerContacted: false, sellerContacted: false }
        };
        await booking.save();

        // Update Inventory Lifecycle: Set back to 'Active' and Change Owner
        if (booking.property) {
            const Inventory = mongoose.model('Inventory');
            const updateFields = { status: 'Active' };

            if (newOwnerId) {
                updateFields.owners = [newOwnerId];
            } else if (booking.lead) {
                // Default to the buyer if no specific owner provided
                updateFields.owners = [booking.lead._id || booking.lead];
            }

            await Inventory.findByIdAndUpdate(booking.property._id || booking.property, updateFields);
        }

        // Remove Deal from list if linked
        if (booking.dealId) {
            const Deal = mongoose.model('Deal');
            await Deal.findByIdAndUpdate(booking.dealId, { isVisible: false });
        }

        // TODO: Notification trigger
        console.log(`[Notification] Triggering feedback for Booking ${id}`);

        res.status(200).json({ success: true, message: "Booking closed successfully", data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
