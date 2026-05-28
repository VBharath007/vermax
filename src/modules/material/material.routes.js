const express = require("express");
const router = express.Router();
const materialController = require("./material.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");
const {
    validateRecordMaterialReceived,
    validateUpdateMaterialReceived,
    validateUpdateReceiptPayment,
    validateRecordMaterialUsed,
    validateCreateMaterialAdvance,
} = require("./material.validation");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// --- Material Master --- //
// router.post("/", isAdmin, materialController.createMaterial);
// router.get("/", isAdmin, materialController.getMaterials);

// --- Material Received --- //
router.post("/received", isAdmin, validateRecordMaterialReceived, materialController.recordMaterialReceived);
router.get("/received", isAdmin, materialController.getMaterialReceived);
router.get("/received/:materialId", isAdmin, materialController.getMaterialReceivedByMaterialId);
router.put("/received/:receiptId", isAdmin, validateUpdateMaterialReceived, materialController.updateMaterialReceived);
router.put("/received/:receiptId/payment", isAdmin, validateUpdateReceiptPayment, materialController.updateReceiptPayment);
router.delete("/received/:receiptId", isAdmin, materialController.deleteMaterialReceived);

// --- Material Used --- //
router.post("/used", isAdmin, validateRecordMaterialUsed, materialController.recordMaterialUsed);
router.get("/used", isAdmin, materialController.getAllMaterialUsed);
router.get("/used/:projectNo", isAdmin, materialController.getAllMaterialUsed);
router.put("/used/:usageId", isAdmin, materialController.updateMaterialUsed);
router.delete("/used/:usageId", isAdmin, materialController.deleteMaterialUsed);

// --- Material Stock --- //
router.get("/stock/:projectNo", isAdmin, materialController.getMaterialStock);

// --- Material Required --- //
router.post("/required", isAdmin, materialController.addMaterialRequired);
router.get("/required", isAdmin, materialController.getAllMaterialRequired);
router.get("/required/:projectNo", isAdmin, materialController.getMaterialRequired);

// ═══════════════════════════════════════════════════════════════════════════════
// ADD THESE ROUTES TO material_routes.js
// PASTE AFTER THE EXISTING MATERIAL REQUIRED ROUTES
// (AFTER: router.get("/required/:projectNo", isAdmin, materialController.getMaterialRequired);)
// ═══════════════════════════════════════════════════════════════════════════════

// --- Material Required - Update & Delete --- //
/**
 * PUT /api/materials/required/:requiredId
 * Update a material required record
 * Body: { requiredQuantity?, materialName?, remark? }
 */
router.put("/required/:requiredId", isAdmin, materialController.updateMaterialRequired);

/**
 * DELETE /api/materials/required/:requiredId
 * Delete a material required record
 */
router.delete("/required/:requiredId", isAdmin, materialController.deleteMaterialRequired);
// ═════════════════════════════════════════════════════════════════════════════
// ──── MATERIAL ADVANCE PAYMENT ROUTES ──────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/materials/advances
 * Create a new material advance payment
 * Body: { projectNo, amountAdvance, paymentMethod, bankId?, remark?, date? }
 */
router.post("/advances", isAdmin, validateCreateMaterialAdvance, materialController.createMaterialAdvance);

/**
 * GET /api/materials/advances
 * Get all material advances globally
 */
router.get("/advances", isAdmin, materialController.getMaterialAdvances);

/**
 * GET /api/materials/advances/bank/:bankId/transactions
 * Get transaction history for a specific bank account
 */
router.get("/advances/bank/:bankId/transactions", isAdmin, materialController.getBankTransactionHistoryForMaterialAdvance);

/**
 * GET /api/materials/advances/project/:projectNo
 * Get material advances for a specific project
 */
router.get("/advances/project/:projectNo", isAdmin, materialController.getMaterialAdvances);

/**
 * PUT /api/materials/advances/:id
 * Update a material advance record
 * If amount or paymentMethod changes, bank balance and transactions are updated
 */
router.put("/advances/:id", isAdmin, materialController.updateMaterialAdvance);

/**
 * DELETE /api/materials/advances/:id
 * Delete a material advance record
 * If paymentMethod was BANK, the bank balance will be reverted
 */
router.delete("/advances/:id", isAdmin, materialController.deleteMaterialAdvance);

module.exports = router;