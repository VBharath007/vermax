const router = require("express").Router();
const printController = require("./print.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

// All print endpoints require a valid token and tenant context
router.use(verifyToken, tenantContext);

// GET /api/print/project/:projectNo
router.get("/project/:projectNo", printController.printProjectSummary);

// GET /api/print/approval/:approvalId
router.get("/approval/:approvalId", printController.printApproval);

// GET /api/print/dealer-payment/:paymentId
router.get("/dealer-payment/:paymentId", printController.printDealerPayment);

// GET /api/print/labour-payment/:paymentId
router.get("/labour-payment/:paymentId", printController.printLabourPayment);

module.exports = router;
