// src/modules/project/bank.routes.js

const express = require("express");
const router = express.Router();
const bankController = require("./bank.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// Bank account management
router.get("/", isAdmin, bankController.getAllBanks);
router.post("/", isAdmin, bankController.createBank);
router.post("/create-for-advance", isAdmin, bankController.createTemporaryBankForAdvance);
router.put("/:bankId", isAdmin, bankController.updateBank);

// Bank balance operations
router.post("/:bankId/increment-balance", isAdmin, bankController.incrementBankBalance);
router.post("/:bankId/decrement-balance", isAdmin, bankController.decrementBankBalance);

// Add advance with payment mode
router.post("/:projectNo/advance-payment", isAdmin, bankController.addAdvanceWithPaymentMode);

module.exports = router;