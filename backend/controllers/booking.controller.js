import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Activity from "../models/Activity.js";

/**
 * @section Enterprise Booking Controller
 * Robust handling of property bookings, deal lifecycle synchronization, and inventory state management.
 */

export const createBooking = async (req, res) => {
    try {
        const bookingData = req.body;
        console.log(`[BOOKING_ENGINE] Initializing new booking for Deal: ${bookingData.dealId || 'Manual'}`);

        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !bookingData.department) bookingData.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!bookingData.teams || bookingData.teams.length === 0)) {
                bookingData.teams = req.user.teams.map(t => t._id || t);
            }
        }

        const booking = new Booking(bookingData);
        await booking.save();

        // 🚀 Deal Lifecycle Synchronization
        const Deal = mongoose.model('Deal');
        let dealToUpdate = null;

        if (bookingData.dealId) {
            dealToUpdate = await Deal.findById(bookingData.dealId);
        } else if (bookingData.property && (bookingData.lead || bookingData.customer)) {
            // Contextual Fallback: Find open deal for same entity
            dealToUpdate = await Deal.findOne({
                inventoryId: bookingData.property,
                associatedContact: bookingData.lead || bookingData.customer,
                stage: { $ne: 'Closed' }
            });
        }

        if (dealToUpdate) {
            console.log(`[BOOKING_ENGINE] Syncing Deal ${dealToUpdate._id} to BOOKED status.`);
            dealToUpdate.stage = 'Booked';
            dealToUpdate.status = 'Won';
            dealToUpdate.bookingId = booking._id;
            
            // Add to deal negotiation history
            if (dealToUpdate.negotiationRounds) {
                dealToUpdate.negotiationRounds.push({
                    round: (dealToUpdate.negotiationRounds.length + 1),
                    offerPrice: booking.totalDealAmount,
                    status: 'Accepted',
                    date: new Date(),
                    note: `Booking confirmed with Token: ₹${booking.tokenAmount}`
                });
            }
            
            await dealToUpdate.save();

            // Circular link
            if (!booking.dealId) {
                booking.dealId = dealToUpdate._id;
                await booking.save();
            }
        }

        // 🏠 Inventory State management
        if (booking.property) {
            console.log(`[BOOKING_ENGINE] Marking Inventory ${booking.property} as BOOKED.`);
            const Inventory = mongoose.model('Inventory');
            await Inventory.findByIdAndUpdate(booking.property, { 
                status: 'Booked',
                lastStatusUpdate: new Date()
            });
        }

        // 📝 Record Activity
        try {
            await Activity.create({
                type: 'Booking',
                title: `Property Booked: ${booking.applicationNo || 'New Booking'}`,
                description: `Booking confirmed for deal amount ₹${booking.totalDealAmount} with token ₹${booking.tokenAmount}.`,
                leadId: booking.lead,
                dealId: booking.dealId,
                createdBy: req.user?._id,
                timestamp: new Date()
            });
        } catch (actErr) {
            console.warn(`[BOOKING_ENGINE] Activity logging skipped: ${actErr.message}`);
        }

        const populated = await Booking.findById(booking._id)
            .populate('property')
            .populate('lead')
            .populate('salesAgent', 'fullName name');

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        console.error(`[BOOKING_ENGINE] Critical Failure:`, error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getBookings = async (req, res) => {
    try {
        const { limit = 50, skip = 0, sortBy = 'createdAt', sortOrder = -1 } = req.query;
        
        // Dynamic Sort Mapping
        let sortCriteria = {};
        sortCriteria[sortBy] = Number(sortOrder);

        const visibilityFilter = await getVisibilityFilter(req.user);
        const bookings = await Booking.find({ ...visibilityFilter })
            .populate({
                path: 'property',
                populate: { path: 'projectId' }
            })
            .populate('lead')
            .populate('seller')
            .populate('salesAgent', 'fullName name')
            .populate('channelPartner')
            .sort(sortCriteria)
            .limit(Number(limit))
            .skip(Number(skip));

        // Enterprise Enrichment: Live state resolution
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

        res.status(200).json({ success: true, count: enrichedBookings.length, data: enrichedBookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getBooking = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const booking = await Booking.findOne({ _id: req.params.id, ...visibilityFilter })
            .populate({
                path: 'property',
                populate: [{ path: 'projectId' }, { path: 'owners' }]
            })
            .populate('lead')
            .populate('seller')
            .populate('salesAgent', 'fullName name')
            .populate('channelPartner')
            .populate('dealId');

        if (!booking) return res.status(404).json({ success: false, message: "Booking record not detected." });

        const bookingObj = booking.toObject();
        if (!bookingObj.closingDetails?.isClosed && bookingObj.property) {
            const inventory = bookingObj.property;
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
        const visibilityFilter = await getVisibilityFilter(req.user);
        const booking = await Booking.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, req.body, { new: true, runValidators: true });
        if (!booking) return res.status(404).json({ success: false, message: "Booking record unavailable or access denied." });
        
        console.log(`[BOOKING_ENGINE] Updated Booking ${req.params.id}`);
        res.status(200).json({ success: true, data: booking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteBooking = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const booking = await Booking.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found or access denied" });
        res.status(200).json({ success: true, message: "Booking removed from active records." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const closeBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { checklist, closingDate, remarks, newOwnerId } = req.body;

        const booking = await Booking.findById(id).populate('property lead seller');
        if (!booking) return res.status(404).json({ success: false, message: "Booking reference missing." });

        booking.status = 'Registry'; 
        booking.closingDetails = {
            isClosed: true,
            closingDate: closingDate || new Date(),
            checklist: checklist,
            remarks: remarks,
            feedbackStatus: { buyerContacted: false, sellerContacted: false }
        };
        await booking.save();

        if (booking.property) {
            const Inventory = mongoose.model('Inventory');
            const updateFields = { status: 'Sold Out' };

            if (newOwnerId) {
                updateFields.owners = [newOwnerId];
            } else if (booking.lead) {
                updateFields.owners = [booking.lead._id || booking.lead];
            }

            await Inventory.findByIdAndUpdate(booking.property._id || booking.property, updateFields);
        }

        if (booking.dealId) {
            const Deal = mongoose.model('Deal');
            await Deal.findByIdAndUpdate(booking.dealId, { 
                stage: 'Closed Won',
                status: 'Won',
                isVisible: false 
            });
        }

        res.status(200).json({ success: true, message: "Transaction finalized and ownership transferred.", data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
