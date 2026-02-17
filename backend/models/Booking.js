import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema({
    type: { type: String, enum: ['Sale', 'Rent'], default: 'Sale' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    bookingDate: { type: Date },
    applicationNo: { type: String },

    // Financials
    totalDealAmount: { type: Number },
    tokenAmount: { type: Number, default: 0 },
    agreementAmount: { type: Number },
    agreementDate: { type: Date },
    partPaymentAmount: { type: Number },
    partPaymentDate: { type: Date },
    finalPaymentDate: { type: Date },

    // Stakeholders
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    channelPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    buyerSide: { type: String }, // e.g., 'Internal', 'External'

    // Commissions
    sellerBrokeragePercent: { type: Number, default: 0 },
    sellerBrokerageAmount: { type: Number, default: 0 },
    buyerBrokeragePercent: { type: Number, default: 0 },
    buyerBrokerageAmount: { type: Number, default: 0 },
    executiveIncentivePercent: { type: Number, default: 0 },
    executiveIncentiveAmount: { type: Number, default: 0 },

    remarks: { type: String },
    status: { type: String, enum: ['Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'], default: 'Pending' },
    closingDetails: {
        isClosed: { type: Boolean, default: false },
        closingDate: Date,
        checklist: {
            noc: { type: Boolean, default: false },
            originalDocuments: { type: Boolean, default: false },
            keysHandedOver: { type: Boolean, default: false },
            finalPaymentReceived: { type: Boolean, default: false }
        },
        feedbackStatus: {
            buyerContacted: { type: Boolean, default: false },
            sellerContacted: { type: Boolean, default: false }
        },
        remarks: String
    }
}, { timestamps: true });

export default mongoose.model("Booking", BookingSchema);
