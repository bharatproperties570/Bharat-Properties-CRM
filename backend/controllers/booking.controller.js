import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Activity from "../models/Activity.js";
import AuditLog from "../models/AuditLog.js";
import Lookup from "../models/Lookup.js";
import { getVisibilityFilter } from "../utils/visibility.js";

/**
 * @section Enterprise Booking Controller
 * Robust handling of property bookings, deal lifecycle synchronization, and inventory state management.
 */

export const createBooking = async (req, res) => {
    try {
        const bookingData = req.body;
        console.log(`[BOOKING_ENGINE] Initializing new booking for Deal: ${bookingData.dealId || 'Manual'}`);

        // Duplicate Check: Prevent duplicate booking for same property, same lead, and same seller
        const BookingModel = mongoose.model('Booking');
        if (bookingData.property && bookingData.lead && bookingData.seller) {
            const duplicateBooking = await BookingModel.findOne({
                property: bookingData.property,
                lead: bookingData.lead,
                seller: bookingData.seller,
                status: { $ne: 'Cancelled' } // Allow if previous was cancelled
            });
            
            if (duplicateBooking) {
                return res.status(400).json({
                    success: false,
                    message: "A booking already exists for this exact Lead, Owner, and Property combination."
                });
            }
        }

        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !bookingData.department) bookingData.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!bookingData.teams || bookingData.teams.length === 0)) {
                bookingData.teams = req.user.teams.map(t => t._id || t);
            }
        }

        let bookingId;
        const session = await mongoose.startSession();
        
        try {
            let isIdempotentReturn = false;
            await session.withTransaction(async () => {
                const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
                let idK = null;
                const AutomationLog = mongoose.model('AutomationLog');

                if (idempotencyKey) {
                    idK = `booking_${idempotencyKey}`;
                    const existingLog = await AutomationLog.findOne({ idempotencyKey: idK }).session(session);
                    if (existingLog && existingLog.entityId) {
                        bookingId = existingLog.entityId;
                        isIdempotentReturn = true;
                        return; 
                    }
                    try {
                        await AutomationLog.collection.insertOne({ idempotencyKey: idK, status: 'success', description: 'Booking Creation Idempotency Lock' }, { session });
                    } catch (err) {
                        if (err.code === 11000) {
                            throw new Error('IDEMPOTENT_CONFLICT: Booking creation in progress.');
                        }
                        throw err;
                    }
                }

                const booking = new Booking(bookingData);
                const savedBookings = await Booking.create([bookingData], { session });
                const savedBooking = savedBookings[0];
                bookingId = savedBooking._id;
                if (idK) {
                    await AutomationLog.updateOne({ idempotencyKey: idK }, { $set: { entityId: bookingId } }, { session });
                }

                // 🚀 Deal Lifecycle Synchronization
                const Deal = mongoose.model('Deal');
                let dealToUpdate = null;

                if (bookingData.dealId) {
                    dealToUpdate = await Deal.findById(bookingData.dealId).session(session);
                } else if (bookingData.property && (bookingData.lead || bookingData.customer)) {
                    dealToUpdate = await Deal.findOne({
                        inventoryId: bookingData.property,
                        associatedContact: bookingData.lead || bookingData.customer,
                        stage: { $ne: 'Closed' }
                    }).session(session);
                }

                if (dealToUpdate) {
                    console.log(`[BOOKING_ENGINE] Syncing Deal ${dealToUpdate._id} to BOOKED status.`);
                    
                    const updateOps = {
                        $set: {
                            stage: 'Booked',
                            status: 'Won',
                            bookingId: savedBooking._id
                        }
                    };

                    if (dealToUpdate.negotiationRounds) {
                        updateOps.$push = {
                            negotiationRounds: {
                                round: (dealToUpdate.negotiationRounds.length + 1),
                                offerPrice: savedBooking.totalDealAmount,
                                status: 'Accepted',
                                date: new Date(),
                                note: `Booking confirmed with Token: ₹${savedBooking.tokenAmount}`
                            }
                        };
                    }
                    
                    await Deal.findByIdAndUpdate(dealToUpdate._id, updateOps, { session });

                    if (!savedBooking.dealId) {
                        await Booking.findByIdAndUpdate(savedBooking._id, { $set: { dealId: dealToUpdate._id } }, { session });
                    }
                }

                // 🏠 Inventory State management
                if (bookingData.property) {
                    console.log(`[BOOKING_ENGINE] Marking Inventory ${bookingData.property} as BOOKED.`);
                    const Inventory = mongoose.model('Inventory');
                    const Lookup = mongoose.model('Lookup');
                    
                    // 1. Resolve 'Available' and 'Active' ObjectIds
                    const sourceLookups = await Lookup.find({ lookup_type: 'Status', lookup_value: { $in: ['Available', 'Active'] } }).select('_id').lean().session(session);
                    const sourceIds = sourceLookups.map(l => l._id);
                    
                    // 2. Resolve 'Booked' ObjectId
                    const targetLookups = await Lookup.find({ lookup_type: 'Status', lookup_value: 'Booked' }).select('_id').lean().session(session);
                    const targetStatusId = targetLookups.length > 0 ? targetLookups[0]._id : 'Booked';

                    const invQuery = { 
                        _id: bookingData.property,
                        $or: [
                            { status: null },
                            { status: { $exists: false } }
                        ]
                    };
                    if (sourceIds.length > 0) {
                        invQuery.$or.push({ status: { $in: sourceIds } });
                    }
                    
                    const updatedInv = await Inventory.findOneAndUpdate(
                        invQuery,
                        { 
                            $set: { 
                                status: targetStatusId,
                                lastStatusUpdate: new Date()
                            }
                        },
                        { new: true, session }
                    );

                    if (!updatedInv) {
                        throw new Error(`INVENTORY_UNAVAILABLE: Unit ${bookingData.property} cannot be booked. It may already be reserved.`);
                    }
                }

                // 📝 Record Activity
                const Activity = mongoose.model('Activity');
                await Activity.create([{
                    type: 'Task',
                    subject: `Property Booked: ${savedBooking.applicationNo || 'New Booking'}`,
                    entityType: savedBooking.dealId ? 'Deal' : 'Lead',
                    entityId: savedBooking.dealId || savedBooking.lead,
                    dueDate: new Date(),
                    status: 'Completed',
                    description: `Booking confirmed for deal amount ₹${savedBooking.totalDealAmount} with token ₹${savedBooking.tokenAmount}.`,
                    relatedTo: [{
                        id: savedBooking.lead,
                        model: 'Lead'
                    }],
                    createdBy: req.user?._id
                }], { session });
            });
        } catch (err) {
            session.endSession();
            // Map the transaction error to a 400 Bad Request if it's our inventory business rule
            if (err.message && err.message.includes('INVENTORY_UNAVAILABLE')) {
                return res.status(400).json({ success: false, message: err.message });
            }
            throw err;
        }
        
        session.endSession();

        const populated = await Booking.findById(bookingId)
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
        const {
            limit = 50, skip = 0,
            sortBy = 'bookingDate', sortOrder = -1,
            // ── Enterprise Filters ──────────────────────────────────────
            contactId,          // Filter by buyer or seller contact ID
            status,             // Single status: Pending|Booked|Agreement|Registry|Cancelled
            health,             // On Track|At Risk|Delayed|Critical
            salesAgent,         // User ObjectId
            channelPartner,     // Contact ObjectId
            project,            // Project name text match
            dateFrom,           // bookingDate >= dateFrom
            dateTo,             // bookingDate <= dateTo
            minValue,           // totalDealAmount >= minValue
            maxValue,           // totalDealAmount <= maxValue
            search,             // text search across applicationNo
        } = req.query;

        // Dynamic Sort Mapping
        let sortCriteria = {};
        sortCriteria[sortBy] = Number(sortOrder);
        if (sortBy !== 'createdAt') sortCriteria['createdAt'] = -1;

        const visibilityFilter = await getVisibilityFilter(req.user);
        const queryFilter = { ...visibilityFilter };

        // ── Contact filter (buyer or seller) ───────────────────────────
        if (contactId) {
            queryFilter.$or = [
                { lead: contactId },
                { seller: contactId }
            ];
        }

        // ── Status filter ──────────────────────────────────────────────
        if (status && status !== 'All') {
            queryFilter.status = status;
        }

        // ── Health filter ──────────────────────────────────────────────
        if (health && health !== 'All') {
            queryFilter.health = health;
        }

        // ── Sales Agent filter ─────────────────────────────────────────
        if (salesAgent) {
            queryFilter.salesAgent = salesAgent;
        }

        // ── Channel Partner filter ──────────────────────────────────────
        if (channelPartner) {
            queryFilter.channelPartner = channelPartner;
        }

        // ── Date range filter ──────────────────────────────────────────
        if (dateFrom || dateTo) {
            queryFilter.bookingDate = {};
            if (dateFrom) queryFilter.bookingDate.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                queryFilter.bookingDate.$lte = end;
            }
        }

        // ── Deal value range filter ────────────────────────────────────
        if (minValue || maxValue) {
            queryFilter.totalDealAmount = {};
            if (minValue) queryFilter.totalDealAmount.$gte = Number(minValue);
            if (maxValue) queryFilter.totalDealAmount.$lte = Number(maxValue);
        }

        // ── Application No. text search ────────────────────────────────
        if (search) {
            queryFilter.applicationNo = { $regex: search, $options: 'i' };
        }

        const totalCount = await Booking.countDocuments(queryFilter);

        let query = Booking.find(queryFilter)
            .populate({ path: 'property', populate: { path: 'projectId' } })
            .populate({
                path: 'lead',
                populate: [
                    { path: 'personalAddress.location', model: 'Lookup' }, { path: 'personalAddress.city', model: 'Lookup' }, { path: 'personalAddress.state', model: 'Lookup' },
                    { path: 'personalAddress.tehsil', model: 'Lookup' }, { path: 'personalAddress.postOffice', model: 'Lookup' }, { path: 'personalAddress.pincode', model: 'Lookup' }
                ]
            })
            .populate({
                path: 'seller',
                populate: [
                    { path: 'personalAddress.location', model: 'Lookup' }, { path: 'personalAddress.city', model: 'Lookup' }, { path: 'personalAddress.state', model: 'Lookup' },
                    { path: 'personalAddress.tehsil', model: 'Lookup' }, { path: 'personalAddress.postOffice', model: 'Lookup' }, { path: 'personalAddress.pincode', model: 'Lookup' }
                ]
            })
            .populate('salesAgent', 'fullName name email')
            .populate('channelPartner', 'name phones')
            .sort(sortCriteria)
            .limit(Number(limit))
            .skip(Number(skip));

        const bookings = await query;

        // Enterprise Enrichment: resolve owner from inventory when not closed
        const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
            const bookingObj = booking.toObject();
            if (!bookingObj.closingDetails?.isClosed && bookingObj.property) {
                const Inventory = mongoose.model('Inventory');
                const inventory = await Inventory.findById(bookingObj.property._id || bookingObj.property).populate('owners');
                if (inventory?.owners?.length > 0) {
                    bookingObj.seller = inventory.owners[0];
                }
                // Resolve project name from property
                if (inventory?.projectId && typeof inventory.projectId === 'object') {
                    bookingObj.resolvedProject = inventory.projectId.name || inventory.projectId.projectName;
                }
            }
            return bookingObj;
        }));

        // ── Server-side project name filter (post-populate) ────────────
        let finalBookings = enrichedBookings;
        if (project) {
            const lc = project.toLowerCase();
            finalBookings = enrichedBookings.filter(b =>
                (b.resolvedProject || b.property?.projectName || '').toLowerCase().includes(lc)
            );
        }

        res.status(200).json({ success: true, count: totalCount, data: finalBookings });
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
                populate: [{ path: 'projectId' }, { path: 'owners.contact' }]
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
                bookingObj.seller = inventory.owners[0].contact || inventory.owners[0];
            }
        }

        // --- Manual Lookup Resolver for Mixed Address Fields ---
        const lookupIds = new Set();
        const extractIds = (addr) => {
             if(!addr) return;
             ['city', 'tehsil', 'postOffice', 'pincode', 'state', 'location'].forEach(field => {
                 if (addr[field] && mongoose.Types.ObjectId.isValid(addr[field].toString())) {
                     lookupIds.add(addr[field].toString());
                 }
             });
        };
        
        if (bookingObj.lead?.personalAddress) extractIds(bookingObj.lead.personalAddress);
        if (bookingObj.seller?.personalAddress) extractIds(bookingObj.seller.personalAddress);
        
        if (lookupIds.size > 0) {
            const lookups = await Lookup.find({ _id: { $in: Array.from(lookupIds) } });
            const lookupDict = {};
            lookups.forEach(l => lookupDict[l._id.toString()] = l.lookup_value);
            
            const resolveAddr = (addr) => {
                if(!addr) return;
                ['city', 'tehsil', 'postOffice', 'pincode', 'state', 'location'].forEach(field => {
                     if (addr[field] && lookupDict[addr[field].toString()]) {
                         addr[field] = { _id: addr[field], lookup_value: lookupDict[addr[field].toString()] };
                     }
                });
            };
            
            if (bookingObj.lead?.personalAddress) resolveAddr(bookingObj.lead.personalAddress);
            if (bookingObj.seller?.personalAddress) resolveAddr(bookingObj.seller.personalAddress);
        }

        res.status(200).json({ success: true, data: bookingObj });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBooking = async (req, res) => {
    const session = await mongoose.startSession();
    let updatedBooking = null;

    try {
        await session.withTransaction(async () => {
            const visibilityFilter = await getVisibilityFilter(req.user);
            const booking = await Booking.findOne({ _id: req.params.id, ...visibilityFilter }).session(session);
            
            if (!booking) throw new Error("Booking record unavailable or access denied.");

            // 1. Reject Property Reassignment
            if (req.body.property && req.body.property.toString() !== (booking.property ? booking.property.toString() : '')) {
                throw new Error("Property reassignment is not supported via updateBooking. Please cancel and recreate the booking.");
            }

            // 2. Reject 'Registry' direct status update
            if (req.body.status === 'Registry' && booking.status !== 'Registry') {
                throw new Error("Registry closure must go through the dedicated closeBooking API.");
            }

            // 3. Handle Cancellation
            if (req.body.status === 'Cancelled' && booking.status !== 'Cancelled') {
                booking.status = 'Cancelled';
                
                // Release Inventory to 'Available'
                if (booking.property) {
                    const Inventory = mongoose.model('Inventory');
                    const Lookup = mongoose.model('Lookup');
                    const targetLookups = await Lookup.find({ lookup_type: 'Status', lookup_value: 'Available' }).select('_id').lean().session(session);
                    const availableStatusId = targetLookups.length > 0 ? targetLookups[0]._id : 'Available';

                    await Inventory.findByIdAndUpdate(booking.property, { 
                        status: availableStatusId
                    }, { session });
                }

                // Deal Synchronization Note:
                // Because there is no existing cancellationReason to differentiate customer
                // cancellation from administrative correction, we are deliberately NOT forcing
                // the Deal to 'Closed Lost' to preserve the pipeline state.
            } else if (req.body.status && ['Pending', 'Booked', 'Agreement'].includes(req.body.status)) {
                booking.status = req.body.status;
            }

            // 4. Apply Safe Fields
            const ALLOWED_FIELDS = [
                'type', 'bookingDate', 'applicationNo', 'totalDealAmount', 'tokenAmount', 
                'agreementAmount', 'agreementDate', 'partPaymentAmount', 'partPaymentDate', 
                'finalPaymentDate', 'registryDate', 'sellerBrokeragePercent', 
                'sellerBrokerageAmount', 'buyerBrokeragePercent', 'buyerBrokerageAmount',
                'channelPartnerBrokeragePercent', 'channelPartnerBrokerageAmount',
                'executiveIncentivePercent', 'executiveIncentiveAmount',
                'remarks', 'paymentSchedule'
            ];

            for (const field of ALLOWED_FIELDS) {
                if (req.body[field] !== undefined) {
                    booking[field] = req.body[field];
                }
            }

            await booking.save({ session });
            updatedBooking = booking;
        });

        console.log(`[BOOKING_ENGINE] Updated Booking ${req.params.id}`);
        res.status(200).json({ success: true, data: updatedBooking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally {
        await session.endSession();
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
    const session = await mongoose.startSession();
    let updatedBooking = null;

    try {
        const { id } = req.params;
        const { checklist, closingDate, remarks, newOwnerId } = req.body;

        await session.withTransaction(async () => {
            // [SECURITY] Validate Visibility and Team Isolation
            const visibilityFilter = await getVisibilityFilter(req.user);
            const booking = await Booking.findOne({ _id: id, ...visibilityFilter }).populate('property lead seller').session(session);
            if (!booking) throw new Error("Booking reference missing or access denied.");
            
            if (booking.status === 'Registry' || booking.status === 'Cancelled') {
                throw new Error(`Booking cannot be closed from current status: ${booking.status}`);
            }

            // 1. Update Booking Status
            booking.status = 'Registry'; 
            booking.closingDetails = {
                isClosed: true,
                closingDate: closingDate || new Date(),
                checklist: checklist,
                remarks: remarks,
                feedbackStatus: { buyerContacted: false, sellerContacted: false }
            };
            await booking.save({ session });
            updatedBooking = booking;

            // 2. ATOMIC INVENTORY TRANSITION
            if (booking.property) {
                const Inventory = mongoose.model('Inventory');
                const Lookup = mongoose.model('Lookup');
                
                const targetLookups = await Lookup.find({ lookup_type: 'Status', lookup_value: { $in: ['Sold Out', 'Sold'] } }).select('_id').lean().session(session);
                const targetStatusId = targetLookups.length > 0 ? targetLookups[0]._id : 'Sold Out';

                const sourceLookups = await Lookup.find({ lookup_type: 'Status', lookup_value: { $in: ['Available', 'Active', 'Blocked', 'Booked', 'Token Received'] } }).select('_id').lean().session(session);
                const sourceIds = sourceLookups.map(l => l._id);

                // Atomic query (prevent Invalid state transition)
                const invQuery = { 
                    _id: booking.property._id || booking.property,
                    $or: [
                        { status: null },
                        { status: { $exists: false } },
                        { status: { $in: ['Available', 'Active', 'Blocked', 'Booked', 'Token Received'] } }
                    ]
                };
                if (sourceIds.length > 0) {
                    invQuery.$or.push({ status: { $in: sourceIds } });
                }

                const updateFields = { status: targetStatusId };
                if (newOwnerId) {
                    updateFields.owners = [newOwnerId];
                } else if (booking.lead) {
                    updateFields.owners = [booking.lead._id || booking.lead];
                }

                const invUpdate = await Inventory.findOneAndUpdate(invQuery, updateFields, { new: true, session });
                if (!invUpdate) {
                    throw new Error("INVENTORY_UNAVAILABLE: The associated property cannot transition to Sold Out. It may be reserved or in an invalid state.");
                }
            }

            // 3. ATOMIC DEAL UPDATE
            if (booking.dealId) {
                const Deal = mongoose.model('Deal');
                await Deal.findOneAndUpdate(
                    { _id: booking.dealId },
                    { 
                        stage: 'Closed',
                        status: 'Won',
                        closingDetails: {
                            isClosed: true,
                            closingDate: booking.updatedAt || new Date(),
                            remarks: 'Post-Sale Registry confirmed.'
                        }
                    },
                    { new: true, session }
                );
            }
        });

        // External side effects
        res.status(200).json({ success: true, message: "Transaction finalized and ownership transferred.", data: updatedBooking });
    } catch (error) {
        const msg = error.message;
        if (msg.includes('INVENTORY_UNAVAILABLE') || msg.includes('access denied') || msg.includes('Booking cannot be closed')) {
            return res.status(400).json({ success: false, message: msg });
        }
        res.status(500).json({ success: false, message: msg });
    } finally {
        await session.endSession();
    }
};

/**
 * @route POST /api/bookings/:id/payments
 * Record a payment received against a booking.
 * Supports both paymentSchedule entry update and ad-hoc payment recording.
 */
export const recordPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduleItemId, label, dueDate, dueAmount, paidAmount, paidDate, paymentMode, referenceNo, bankName, remarks, payerName, payeeName, payeeAccountDetails, transactions, paymentPurpose } = req.body;

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        if (scheduleItemId) {
            // Update existing schedule item
            const item = booking.paymentSchedule.id(scheduleItemId);
            if (!item) return res.status(404).json({ success: false, message: "Payment schedule item not found." });

            const newPaidAmount = Number(paidAmount) || 0;
            item.paidAmount = (item.paidAmount || 0) + newPaidAmount;
            item.paidDate = paidDate || new Date();
            
            // Backward compatibility for single mode
            item.paymentMode = paymentMode || item.paymentMode;
            item.referenceNo = referenceNo || item.referenceNo;
            item.bankName = bankName || item.bankName;
            item.payeeAccountDetails = payeeAccountDetails || item.payeeAccountDetails;
            
            item.remarks = remarks || item.remarks;
            item.payerName = payerName || item.payerName;
            item.payeeName = payeeName || item.payeeName;
            item.paymentPurpose = paymentPurpose || item.paymentPurpose || label;
            item.recordedBy = req.user?._id;

            // Handle split transactions
            if (transactions && Array.isArray(transactions)) {
                if (!item.transactions) item.transactions = [];
                transactions.forEach(t => {
                    item.transactions.push({
                        amount: Number(t.amount) || 0,
                        paymentMode: t.paymentMode || 'Cash',
                        referenceNo: t.referenceNo || '',
                        bankName: t.bankName || '',
                        payeeAccountDetails: t.payeeAccountDetails || '',
                        paidDate: t.paidDate || new Date()
                    });
                });
            } else if (newPaidAmount > 0) {
                // If single legacy payment, push it to transactions as well for consistency
                if (!item.transactions) item.transactions = [];
                item.transactions.push({
                    amount: newPaidAmount,
                    paymentMode: paymentMode || 'Cash',
                    referenceNo: referenceNo || '',
                    bankName: bankName || '',
                    payeeAccountDetails: payeeAccountDetails || '',
                    paidDate: paidDate || new Date()
                });
            }

            item.status = item.paidAmount >= item.dueAmount ? 'Paid' : 'Partial';
        } else {
            // Add new ad-hoc payment entry
            const newTransactions = [];
            let totalNewAmount = Number(paidAmount) || 0;

            if (transactions && Array.isArray(transactions)) {
                totalNewAmount = transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
                transactions.forEach(t => {
                    newTransactions.push({
                        amount: Number(t.amount) || 0,
                        paymentMode: t.paymentMode || 'Cash',
                        referenceNo: t.referenceNo || '',
                        bankName: t.bankName || '',
                        payeeAccountDetails: t.payeeAccountDetails || '',
                        paidDate: t.paidDate || new Date()
                    });
                });
            } else if (totalNewAmount > 0) {
                newTransactions.push({
                    amount: totalNewAmount,
                    paymentMode: paymentMode || 'Cash',
                    referenceNo: referenceNo || '',
                    bankName: bankName || '',
                    payeeAccountDetails: payeeAccountDetails || '',
                    paidDate: paidDate || new Date()
                });
            }

            booking.paymentSchedule.push({
                label: label || 'Ad-hoc Payment',
                dueDate: dueDate,
                dueAmount: dueAmount || totalNewAmount,
                paidAmount: totalNewAmount,
                paidDate: paidDate || new Date(),
                paymentMode: paymentMode || 'Cash',
                referenceNo: referenceNo,
                bankName: bankName,
                payeeAccountDetails: payeeAccountDetails,
                remarks: remarks,
                payerName: payerName,
                payeeName: payeeName,
                paymentPurpose: paymentPurpose || label,
                recordedBy: req.user?._id,
                status: totalNewAmount >= (dueAmount || totalNewAmount) ? 'Paid' : 'Partial',
                transactions: newTransactions
            });
        }

        // pre-save hook will recompute totalPaidAmount, totalBalanceAmount, health, nextAction
        await booking.save();

        // Log activity
        try {
            await Activity.create({
                type: 'Note',
                title: `Payment Recorded: ₹${Number(paidAmount).toLocaleString('en-IN')}`,
                description: `${paymentMode || 'Payment'} of ₹${Number(paidAmount).toLocaleString('en-IN')} recorded via ${paymentMode || 'N/A'}. Ref: ${referenceNo || 'N/A'}. Balance: ₹${booking.totalBalanceAmount?.toLocaleString('en-IN')}`,
                leadId: booking.lead,
                createdBy: req.user?._id,
                timestamp: new Date()
            });
        } catch (actErr) {
            console.warn(`[BOOKING_ENGINE] Activity skipped: ${actErr.message}`);
        }

        res.status(200).json({
            success: true,
            message: "Payment recorded successfully.",
            data: {
                totalPaidAmount: booking.totalPaidAmount,
                totalBalanceAmount: booking.totalBalanceAmount,
                health: booking.health,
                nextAction: booking.nextAction,
                paymentSchedule: booking.paymentSchedule
            }
        });
    } catch (error) {
        console.error(`[BOOKING_ENGINE] Payment recording failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route POST /api/bookings/:id/payment-schedule
 * Initialize or replace the full payment schedule for a booking.
 */
export const setPaymentSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { schedule } = req.body; // Array of { label, dueDate, dueAmount }

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        booking.paymentSchedule = schedule.map(s => ({
            label: s.label,
            dueDate: s.dueDate,
            dueAmount: s.dueAmount,
            paidAmount: s.paidAmount || 0,
            status: 'Pending'
        }));

        await booking.save();
        res.status(200).json({ success: true, message: "Payment schedule saved.", data: booking.paymentSchedule });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route PATCH /api/bookings/:id/commission
 * Mark commission amount as received and optionally update channel partner commission.
 */
export const updateCommission = async (req, res) => {
    try {
        const { id } = req.params;
        const { commissionReceived, channelPartnerCommissionReceived, remarks } = req.body;

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        if (commissionReceived !== undefined) {
            booking.commissionReceived = Number(commissionReceived);
        }
        if (channelPartnerCommissionReceived !== undefined) {
            booking.channelPartnerCommissionReceived = Number(channelPartnerCommissionReceived);
        }

        // pre-save hook recomputes commissionPending
        await booking.save();

        res.status(200).json({
            success: true,
            message: "Commission updated.",
            data: {
                totalCommissionAmount: booking.totalCommissionAmount,
                commissionReceived: booking.commissionReceived,
                commissionPending: booking.commissionPending
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route GET /api/bookings/dashboard/stats
 * Aggregate KPI stats across ALL bookings (not paginated).
 * Used for the KPI cards in Post-Sale Command Center.
 */
export const getDashboardStats = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);

        const [stats] = await Booking.aggregate([
            { $match: visibilityFilter },
            {
                $group: {
                    _id: null,
                    totalBookings: { $sum: 1 },
                    activeBookings: {
                        $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, 1, 0] }
                    },
                    totalPipelineValue: {
                        $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, { $ifNull: ['$totalDealAmount', 0] }, 0] }
                    },
                    totalPaidValue: {
                        $sum: { $ifNull: ['$totalPaidAmount', 0] }
                    },
                    totalCommission: {
                        $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, { $ifNull: ['$totalCommissionAmount', 0] }, 0] }
                    },
                    totalCommissionReceived: {
                        $sum: { $ifNull: ['$commissionReceived', 0] }
                    },
                    totalCommissionPending: {
                        $sum: { $ifNull: ['$commissionPending', 0] }
                    },
                    atRiskCount: {
                        $sum: { $cond: [{ $in: ['$health', ['At Risk', 'Delayed', 'Critical']] }, 1, 0] }
                    },
                    criticalCount: {
                        $sum: { $cond: [{ $eq: ['$health', 'Critical'] }, 1, 0] }
                    },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
                    },
                    bookedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] }
                    },
                    agreementCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Agreement'] }, 1, 0] }
                    },
                    registryCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Registry'] }, 1, 0] }
                    },
                    cancelledCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: stats || {
                totalBookings: 0, activeBookings: 0, totalPipelineValue: 0,
                totalPaidValue: 0, totalCommission: 0, totalCommissionReceived: 0,
                totalCommissionPending: 0, atRiskCount: 0, criticalCount: 0,
                pendingCount: 0, bookedCount: 0, agreementCount: 0, registryCount: 0, cancelledCount: 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


/**
 * @route POST /api/bookings/:id/payments/:paymentId/receipt
 * Upload a signed receipt for a payment.
 */
export const uploadPaymentReceipt = async (req, res) => {
    try {
        const { id, paymentId } = req.params;
        const { receiptUrl } = req.body;

        if (!receiptUrl) return res.status(400).json({ success: false, message: "Receipt URL is required." });

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        const item = booking.paymentSchedule.id(paymentId);
        if (!item) return res.status(404).json({ success: false, message: "Payment schedule item not found." });

        item.receiptUrl = receiptUrl;
        item.isReceiptUploaded = true;

        await booking.save();

        res.status(200).json({ success: true, message: "Receipt uploaded successfully", data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error uploading receipt", error: error.message });
    }
};

/**
 * @route DELETE /api/bookings/:id/payments/:paymentId/receipt
 * Remove a signed receipt for a payment.
 */
export const deletePaymentReceipt = async (req, res) => {
    try {
        const { id, paymentId } = req.params;

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        const item = booking.paymentSchedule.id(paymentId);
        if (!item) return res.status(404).json({ success: false, message: "Payment schedule item not found." });

        item.receiptUrl = null;
        item.isReceiptUploaded = false;

        await booking.save();

        res.status(200).json({ success: true, message: "Receipt removed successfully", data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error removing receipt", error: error.message });
    }
};

/**
 * @route PUT /api/bookings/:id/payments/:paymentId
 * Edit an existing payment entry with Audit Logging
 */
export const editPayment = async (req, res) => {
    try {
        const { id, paymentId } = req.params;
        const { dueAmount, paidAmount, paymentMode, bankName, referenceNo, payeeAccountDetails, paidDate, remarks, payerName, payeeName, paymentPurpose, transactions } = req.body;

        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

        const item = booking.paymentSchedule.id(paymentId);
        if (!item) return res.status(404).json({ success: false, message: "Payment schedule item not found." });

        // Capture previous state for audit log
        const beforeState = item.toObject();

        const totalNewAmount = transactions && Array.isArray(transactions) 
            ? transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
            : (Number(paidAmount) || item.paidAmount);

        // Apply Updates
        item.paidAmount = totalNewAmount;
        if (dueAmount !== undefined) item.dueAmount = dueAmount;
        if (paymentMode !== undefined) item.paymentMode = paymentMode;
        if (bankName !== undefined) item.bankName = bankName;
        if (referenceNo !== undefined) item.referenceNo = referenceNo;
        if (payeeAccountDetails !== undefined) item.payeeAccountDetails = payeeAccountDetails;
        if (paidDate !== undefined) item.paidDate = paidDate;
        if (remarks !== undefined) item.remarks = remarks;
        if (payerName !== undefined) item.payerName = payerName;
        if (payeeName !== undefined) item.payeeName = payeeName;
        if (paymentPurpose !== undefined) item.paymentPurpose = paymentPurpose;
        if (transactions && Array.isArray(transactions)) {
            item.transactions = transactions;
        }

        item.status = totalNewAmount >= (item.dueAmount) ? 'Paid' : 'Partial';

        // Recompute booking totals
        booking.totalPaidAmount = booking.paymentSchedule.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);

        await booking.save();

        // Save Audit Log securely
        try {
            await AuditLog.logEntityUpdate(
                'payment_updated',
                'payment',
                paymentId,
                item.label,
                req.user?._id,
                { before: beforeState, after: item.toObject() },
                `Payment updated from ₹${beforeState.paidAmount} to ₹${item.paidAmount} by ${req.user?.fullName || 'System'}`
            );
        } catch (auditErr) {
            console.error('[AUDIT_LOG_ERROR] Failed to save edit payment log:', auditErr.message);
        }

        res.status(200).json({ success: true, message: "Payment updated successfully", data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating payment", error: error.message });
    }
};
