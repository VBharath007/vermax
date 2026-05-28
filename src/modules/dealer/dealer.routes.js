const express = require("express");
const router = express.Router();

const dealerController = require("./dealer.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

// Middleware for Admin protection
const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// ============================================================================
// DEALER ROUTES
// Base URL: /api/dealers
// ============================================================================

// ─── GET ROUTES ─────────────────────────────────────────────────────────────

// 1. Get List of all dealers 
router.get("/", isAdmin, dealerController.getAllDealers);

// 2. Get specific project payment log under a dealer
router.get("/:phoneNumber/project/:projectNo/payment-log", isAdmin, dealerController.getDealerProjectPaymentLog);

// 3. Get full global payment log for a dealer (Across all projects)
router.get("/:phoneNumber/payment-log", isAdmin, dealerController.getDealerPaymentLog);

// 4. Get bill-level payment history for a dealer
router.get("/:phoneNumber/payments", isAdmin, dealerController.getDealerPaymentHistory);

// 5. Get dealer complete history (Project cards overview)
// Important: This general route MUST be last among the GET routes!
router.get("/:phoneNumber", isAdmin, dealerController.getDealerHistory);


// ─── PUT / POST ROUTES ──────────────────────────────────────────────────────

// 6. Apply payment to a SPECIFIC project under a dealer
router.put("/:phoneNumber/project/:projectNo/payment", isAdmin, dealerController.payDealerProjectPayment);

// 7. Apply general payment across ALL projects (FIFO)
router.put("/:phoneNumber/payment", isAdmin, dealerController.updateDealerPayment);

// 8. Delete dealer and all associated records
router.delete("/:phoneNumber", isAdmin, dealerController.deleteDealer);


module.exports = router;