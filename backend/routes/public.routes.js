import express from "express";  
import { 
    getListings, 
    getProjects, 
    getListingBySlug,
    getProjectBySlug,
    submitPropertyForm,
    submitLeadForm,
    getPublicSettings,
    getAvailableUnits,
    getGoogleReviews
} from "../controllers/public.controller.js";
import { verifyApiKey } from "../middleware/apiKey.middleware.js";
import * as parsingRuleController from '../src/modules/parsing/parsingRule.controller.js';

const router = express.Router();

/**
 * PUBLIC ROUTES
 * These endpoints are used by the public website (http://bharatproperties.co)
 * All routes are protected by X-API-KEY middleware.
 */

// Truly Public (No API Key Required)
router.get("/parsing-rules", parsingRuleController.getRules);

// Apply API Key verification to all other public routes
router.use(verifyApiKey);

router.get("/listings", getListings);
router.get("/projects", getProjects);
router.get("/listings/:slug", getListingBySlug);
router.get("/projects/:slug", getProjectBySlug);

// Submission Routes
router.post("/submit-property", submitPropertyForm);
router.post("/submit-lead", submitLeadForm);

// Metadata Routes
router.get("/public-settings", getPublicSettings);
router.get("/available-units", getAvailableUnits);
router.get("/google-reviews", getGoogleReviews);

export default router;
