const express = require("express");
const router = express.Router();
const approvalController = require("./approval.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// ✅ STATIC ROUTES FIRST
router.get("/summary/date-range", isAdmin, approvalController.getSummaryByDateRange);
router.get("/next-approval-no", isAdmin, approvalController.getNextApprovalNo);

// Project types
router.post("/project-type", isAdmin, approvalController.addProjectType);
router.get("/project-type", approvalController.getProjectTypes);
router.put("/project-type/:id/confirm", isAdmin, approvalController.confirmProjectType);
router.delete("/project-type/:id", isAdmin, approvalController.deleteProjectType);

// CRUD
router.post("/", isAdmin, approvalController.createApproval);
router.get("/", isAdmin, approvalController.getApprovals);

// ✅ SEMI-DYNAMIC ROUTES (IMPORTANT)
router.put("/:id/totalfees", isAdmin, approvalController.updateTotalFees);
router.post("/:id/advance", isAdmin, approvalController.addAdvance);
router.get("/:id/advance", isAdmin, approvalController.getAdvances);
router.post("/:id/expense", isAdmin, approvalController.addExpense);
router.get("/:id/expense", isAdmin, approvalController.getExpenses);
router.put("/:id/status", isAdmin, approvalController.updateStatus);

// ✅ NON-ID BASED (no conflict)
router.put("/advance/:advanceId", isAdmin, approvalController.updateAdvance);
router.delete("/advance/:advanceId", isAdmin, approvalController.deleteAdvance);
router.put("/expense/:expenseId", isAdmin, approvalController.updateExpense);
router.delete("/expense/:expenseId", isAdmin, approvalController.deleteExpense);

// 🔥 LAST: PURE DYNAMIC
router.get("/:id", isAdmin, approvalController.getApprovalById);
router.put("/:id", isAdmin, approvalController.updateApproval);
router.delete("/:id", isAdmin, approvalController.deleteApproval);

module.exports = router;