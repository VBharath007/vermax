const express = require("express");
const router = express.Router();
const labourController = require("./labour.controller");
const workController = require("../work/work.controller");
const { verifyToken, isSiteManager } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

// ⚠️ tenantContext MUST be included so req.tenantId is set before reaching any service.
// Without it, req.tenantId is undefined → Firestore .where("tenant_id", "==", undefined) → 500
const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];
const isManager = [verifyToken, isSiteManager, tenantContext];

// ─── Head Labour Master CRUD ───
router.post("/master", isManager, labourController.addMasterLabour);
router.get("/master", isManager, labourController.getAllHeadLabours);
router.get("/master/:id", isManager, labourController.getHeadLabourById);
router.put("/master/:id", isManager, labourController.updateMasterLabour);
router.delete("/master/:id", isAdmin, labourController.deleteMasterLabour);

// ─── Labour work history (delegates to work module) ───
router.get("/master/:labourId/projects/:projectNo/works", isManager, labourController.getLabourProjectWorks);
router.get("/master/:labourId/works", isManager, workController.getWorksByLabour);

// ─── Sub-Labour Type CRUD ───
router.post("/sublabour/other", isManager, labourController.addOtherType);
router.get("/sublabour/other", isManager, labourController.getAllSubTypes);
router.put("/sublabour/other/:id", isManager, labourController.updateSubType);
router.delete("/sublabour/other/:id", isAdmin, labourController.deleteSubType);

// ─── LABOUR PAYMENTS ───
// Specific paths FIRST
router.get("/payment/:paymentId", isManager, labourController.getPaymentDetails);
router.put("/payment/:paymentId", isManager, labourController.updatePayment);
router.delete("/payment/:paymentId", isAdmin, labourController.deletePayment);

// Parameterized paths AFTER
router.post("/:labourId/:projectNo/payment", isManager, labourController.recordPayment);
router.get("/:labourId/:projectNo/payments", isManager, labourController.getProjectPayments);
router.get("/:labourId/payments", isManager, labourController.getPaymentHistory);

module.exports = router;