import mongoose from "mongoose";

const PaymentEntrySchema = new mongoose.Schema({
    label: { type: String }, // "Token", "Part Payment 1", "Agreement", "Registry"
    dueDate: { type: Date },
    dueAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paidDate: { type: Date },
    paymentMode: { type: String, enum: ['Cash', 'Cheque', 'NEFT', 'UPI', 'DD', 'RTGS', 'Other'] },
    referenceNo: { type: String },
    bankName: { type: String },
    remarks: { type: String },
    payerName: { type: String },
    payeeName: { type: String },
    payeeAccountDetails: { type: String },
    receiptUrl: { type: String },
    isReceiptUploaded: { type: Boolean, default: false },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Pending', 'Partial', 'Paid', 'Overdue'], default: 'Pending' },
    transactions: [{
        amount: { type: Number },
        paymentMode: { type: String },
        referenceNo: { type: String },
        bankName: { type: String },
        payeeAccountDetails: { type: String },
        paidDate: { type: Date }
    }],
    paymentPurpose: { type: String }
}, { timestamps: true, _id: true });

const BookingSchema = new mongoose.Schema({
    type: { type: String, enum: ['Sale', 'Rent'], default: 'Sale' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    bookingDate: { type: Date },
    applicationNo: { type: String },

    // ─── Financials ────────────────────────────────────────────────────
    totalDealAmount: { type: Number },
    tokenAmount: { type: Number, default: 0 },
    agreementAmount: { type: Number },
    agreementDate: { type: Date },
    partPaymentAmount: { type: Number },
    partPaymentDate: { type: Date },
    finalPaymentDate: { type: Date },
    registryDate: { type: Date },

    // ─── Payment Tracking ───────────────────────────────────────────────
    // Total money actually received from buyer
    totalPaidAmount: { type: Number, default: 0 },
    // Computed: totalDealAmount - totalPaidAmount
    totalBalanceAmount: { type: Number, default: 0 },

    // Installment schedule — each milestone is a payment entry
    paymentSchedule: [PaymentEntrySchema],

    // ─── Stakeholders ──────────────────────────────────────────────────
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    channelPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    buyerSide: { type: String }, // 'Internal', 'External'
    department: { type: String, index: true },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],

    // ─── Seller Brokerage ──────────────────────────────────────────────
    sellerBrokeragePercent: { type: Number, default: 0 },
    sellerBrokerageAmount: { type: Number, default: 0 },

    // ─── Buyer Brokerage ───────────────────────────────────────────────
    buyerBrokeragePercent: { type: Number, default: 0 },
    buyerBrokerageAmount: { type: Number, default: 0 },

    // ─── Channel Partner Brokerage ──────────────────────────────────────
    channelPartnerBrokeragePercent: { type: Number, default: 0 },
    channelPartnerBrokerageAmount: { type: Number, default: 0 },
    channelPartnerCommissionReceived: { type: Number, default: 0 },

    // ─── Executive Incentive ───────────────────────────────────────────
    executiveIncentivePercent: { type: Number, default: 0 },
    executiveIncentiveAmount: { type: Number, default: 0 },

    // ─── Commission Reconciliation ────────────────────────────────────
    // Total brokerage to be earned by the firm
    totalCommissionAmount: { type: Number, default: 0 },
    // Amount actually received/collected from both parties
    commissionReceived: { type: Number, default: 0 },
    // Auto-computed: totalCommissionAmount - commissionReceived
    commissionPending: { type: Number, default: 0 },

    // ─── Deal Health Engine ────────────────────────────────────────────
    // Auto-computed nightly by bookingHealthWorker
    health: {
        type: String,
        enum: ['On Track', 'At Risk', 'Delayed', 'Critical'],
        default: 'On Track'
    },
    healthReason: { type: String }, // Human-readable reason: "Final payment overdue by 5 days"
    healthUpdatedAt: { type: Date },

    // ─── Next Action Engine ────────────────────────────────────────────
    nextAction: {
        label: { type: String },        // "Collect Agreement Payment"
        urgency: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
        dueDate: { type: Date },
        completedAt: { type: Date }
    },

    // ─── Document Control ──────────────────────────────────────────────
    documents: [{
        type: { type: String }, // 'Short Agreement', 'Token Receipt', 'Demand Letter', 'Possession Letter', 'Brokerage Invoice', 'NOC'
        generatedAt: { type: Date },
        generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fileUrl: { type: String },  // Google Drive URL if saved
        version: { type: Number, default: 1 }
    }],

    remarks: { type: String },
    status: {
        type: String,
        enum: ['Pending', 'Booked', 'Agreement', 'Registry', 'Cancelled'],
        default: 'Pending'
    },

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

// ─── Pre-Save Hook: Auto-compute derived financial fields ──────────────────
BookingSchema.pre('save', function (next) {
    // 1. Compute totalCommissionAmount
    this.totalCommissionAmount = (this.sellerBrokerageAmount || 0) + (this.buyerBrokerageAmount || 0);

    // 2. Compute commissionPending
    this.commissionPending = Math.max(0, this.totalCommissionAmount - (this.commissionReceived || 0));

    // 3. Compute totalPaidAmount from paymentSchedule if exists
    if (this.paymentSchedule && this.paymentSchedule.length > 0) {
        this.totalPaidAmount = this.paymentSchedule.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    }

    // 4. Compute totalBalanceAmount
    this.totalBalanceAmount = Math.max(0, (this.totalDealAmount || 0) - (this.totalPaidAmount || 0));

    // 5. Auto-compute health score
    this.health = computeHealth(this);
    this.healthUpdatedAt = new Date();

    // 6. Auto-compute next action
    this.nextAction = computeNextAction(this);

    next();
});

// ─── Health Scoring Engine ─────────────────────────────────────────────────
function computeHealth(booking) {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // CRITICAL: Final payment date has passed and balance is still due
    if (booking.finalPaymentDate && booking.finalPaymentDate < now && booking.totalBalanceAmount > 0) {
        booking.healthReason = `Final payment overdue since ${booking.finalPaymentDate.toLocaleDateString('en-IN')}`;
        return 'Critical';
    }

    // DELAYED: Agreement date passed and status is still Pending/Booked
    if (booking.agreementDate && booking.agreementDate < now && ['Pending', 'Booked'].includes(booking.status)) {
        booking.healthReason = `Agreement due date ${booking.agreementDate.toLocaleDateString('en-IN')} passed`;
        return 'Delayed';
    }

    // AT RISK: Final payment due within 7 days and significant balance remains
    if (booking.finalPaymentDate) {
        const daysUntilFinal = Math.ceil((booking.finalPaymentDate - now) / dayMs);
        const paidPercent = booking.totalDealAmount > 0 ? (booking.totalPaidAmount / booking.totalDealAmount) * 100 : 0;
        if (daysUntilFinal <= 7 && paidPercent < 80) {
            booking.healthReason = `Final payment in ${daysUntilFinal} days, only ${Math.round(paidPercent)}% paid`;
            return 'At Risk';
        }
    }

    // AT RISK: Agreement not signed 30+ days after booking
    if (booking.bookingDate && !booking.agreementDate) {
        const daysSinceBooking = Math.ceil((now - booking.bookingDate) / dayMs);
        if (daysSinceBooking > 30 && booking.status === 'Pending') {
            booking.healthReason = `Agreement not done in ${daysSinceBooking} days since booking`;
            return 'At Risk';
        }
    }

    // AT RISK: Overdue payment in schedule
    if (booking.paymentSchedule) {
        const overdueItem = booking.paymentSchedule.find(p =>
            p.dueDate && p.dueDate < now && (p.paidAmount || 0) < (p.dueAmount || 0)
        );
        if (overdueItem) {
            booking.healthReason = `"${overdueItem.label}" payment overdue`;
            return 'At Risk';
        }
    }

    booking.healthReason = null;
    return 'On Track';
}

// ─── Next Action Engine ────────────────────────────────────────────────────
function computeNextAction(booking) {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    if (booking.closingDetails?.isClosed) {
        return { label: 'Closed — Collect Feedback', urgency: 'Low', dueDate: null };
    }

    if (booking.status === 'Pending' && !booking.agreementDate) {
        const daysSince = booking.bookingDate ? Math.ceil((now - booking.bookingDate) / dayMs) : 0;
        return {
            label: 'Get Agreement Signed',
            urgency: daysSince > 15 ? 'High' : 'Medium',
            dueDate: booking.agreementDate || null
        };
    }

    if (booking.finalPaymentDate) {
        const daysLeft = Math.ceil((booking.finalPaymentDate - now) / dayMs);
        if (daysLeft <= 0) {
            return { label: 'Collect Final Payment — OVERDUE', urgency: 'Critical', dueDate: booking.finalPaymentDate };
        }
        if (daysLeft <= 7) {
            return { label: `Collect Final Payment (${daysLeft}d left)`, urgency: 'High', dueDate: booking.finalPaymentDate };
        }
    }

    if (booking.status === 'Agreement') {
        return { label: 'Schedule Registry', urgency: 'Medium', dueDate: booking.registryDate || null };
    }

    if (booking.commissionPending > 0) {
        return { label: 'Collect Commission', urgency: 'Medium', dueDate: null };
    }

    return { label: 'Follow Up with Buyer', urgency: 'Low', dueDate: null };
}

export default mongoose.model("Booking", BookingSchema);
