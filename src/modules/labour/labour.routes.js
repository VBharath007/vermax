const express = require("express");
const router = express.Router();
const labourController = require("./labour.controller");
const workController = require("../work/work.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

// ⚠️ tenantContext MUST be included so req.tenantId is set before reaching any service.
// Without it, req.tenantId is undefined → Firestore .where("tenant_id", "==", undefined) → 500
const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// ─── Head Labour Master CRUD ───
router.post("/master", isAdmin, labourController.addMasterLabour);
router.get("/master", isAdmin, labourController.getAllHeadLabours);
router.get("/master/:id", isAdmin, labourController.getHeadLabourById);
router.put("/master/:id", isAdmin, labourController.updateMasterLabour);
router.delete("/master/:id", isAdmin, labourController.deleteMasterLabour);

// ─── Labour work history (delegates to work module) ───
router.get("/master/:labourId/projects/:projectNo/works", isAdmin, labourController.getLabourProjectWorks);
router.get("/master/:labourId/works", isAdmin, workController.getWorksByLabour);

// ─── Sub-Labour Type CRUD ───
router.post("/sublabour/other", isAdmin, labourController.addOtherType);
router.get("/sublabour/other", isAdmin, labourController.getAllSubTypes);
router.put("/sublabour/other/:id", isAdmin, labourController.updateSubType);
router.delete("/sublabour/other/:id", isAdmin, labourController.deleteSubType);

// ─── LABOUR PAYMENTS ───
// Specific paths FIRST
router.get("/payment/:paymentId", isAdmin, labourController.getPaymentDetails);
router.put("/payment/:paymentId", isAdmin, labourController.updatePayment);
router.delete("/payment/:paymentId", isAdmin, labourController.deletePayment);

// Parameterized paths AFTER
router.post("/:labourId/:projectNo/payment", isAdmin, labourController.recordPayment);
router.get("/:labourId/:projectNo/payments", isAdmin, labourController.getProjectPayments);
router.get("/:labourId/payments", isAdmin, labourController.getPaymentHistory);

module.exports = router;