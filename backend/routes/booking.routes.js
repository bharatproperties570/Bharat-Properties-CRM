import express from "express";
import { createBooking, getBookings, getBooking, updateBooking, deleteBooking, closeBooking } from "../controllers/booking.controller.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/:id", getBooking);
router.put("/:id", updateBooking);
router.post("/:id/close", closeBooking);
router.delete("/:id", deleteBooking);

export default router;
