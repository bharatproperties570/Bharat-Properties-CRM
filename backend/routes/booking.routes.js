import express from "express";
import {
    createBooking,
    getBookings,
    getBooking,
    updateBooking,
    deleteBooking,
    closeBooking,
    recordPayment,
    setPaymentSchedule,
    updateCommission,
    getDashboardStats,
    uploadPaymentReceipt,
    deletePaymentReceipt,
    editPayment
} from "../controllers/booking.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ─── Dashboard Aggregate (must be before /:id routes) ─────────────────────
router.get("/dashboard/stats", getDashboardStats);

// ─── Core CRUD ────────────────────────────────────────────────────────────
router.get("/", getBookings);
router.post("/", createBooking);
router.get("/:id", getBooking);
router.put("/:id", updateBooking);
router.delete("/:id", deleteBooking);

// ─── Lifecycle Actions ────────────────────────────────────────────────────
router.post("/:id/close", closeBooking);

// ─── Payment Tracking ─────────────────────────────────────────────────────
router.post("/:id/payments", recordPayment);
router.put("/:id/payments/:paymentId", editPayment);
router.post("/:id/payments/:paymentId/receipt", uploadPaymentReceipt);
router.delete("/:id/payments/:paymentId/receipt", deletePaymentReceipt);
router.post("/:id/payment-schedule", setPaymentSchedule);

// ─── Commission Reconciliation ────────────────────────────────────────────
router.patch("/:id/commission", updateCommission);

export default router;
