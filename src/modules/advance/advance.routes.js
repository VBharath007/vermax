// src/modules/advance/advance.routes.js

const express = require("express");
const router = express.Router();
const advanceController = require("./advance.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

/**
 * POST /api/advances
 * Create a new advance payment
 * Body: { projectNo, amountReceived, paymentMethod, bankId?, remark?, date? }
 */
router.post("/", isAdmin, advanceController.createAdvance);

/**
 * GET /api/advances
 * Get all advances globally
 */
router.get("/", isAdmin, advanceController.getAdvances);

/**
 * GET /api/advances/bank/:bankId/transactions
 * Get transaction history for a specific bank account
 */
router.get("/bank/:bankId/transactions", isAdmin, advanceController.getBankTransactionHistory);

/**
 * GET /api/advances/project/:projectNo
 * Get advances for a specific project
 */
router.get("/project/:projectNo", isAdmin, advanceController.getAdvances);

/**
 * PUT /api/advances/:id
 * Update an advance record
 * If amount or paymentMethod changes, bank balance and transactions are updated
 */
router.put("/:id", isAdmin, advanceController.updateAdvance);

/**
 * DELETE /api/advances/:id
 * Delete an advance record
 * If paymentMethod was BANK, the bank balance will be reverted
 */
router.delete("/:id", isAdmin, advanceController.deleteAdvance);

module.exports = router;