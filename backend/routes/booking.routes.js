import express from "express";
import { createBooking, getBookings, getBooking, updateBooking, deleteBooking, closeBooking } from "../controllers/booking.controller.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/:id", getBooking);
router.put("/:id", updateBooking);
router.post("/:id/close", closeBooking);
router.delete("/:id", deleteBooking);

export default router;
