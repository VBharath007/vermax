const express = require("express");
const router = express.Router();
const mouldController = require("./mould.controller");
const mouldValidation = require("./mould.validation");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

/** Purchase Routes */
router.post("/purchase", isAdmin, mouldValidation.validatePurchase, mouldController.createPurchase);
router.get("/purchase", isAdmin, mouldController.getAllPurchases);
router.get("/purchase/:id", isAdmin, mouldController.getPurchaseById);
router.put("/purchase/:id", isAdmin, mouldController.updatePurchase);
router.delete("/purchase/:id", isAdmin, mouldController.deletePurchase);

/** Rental Routes */
router.post("/rental/:id", isAdmin, mouldValidation.validateRental, mouldController.createRental);
router.get("/rental/history", isAdmin, mouldController.getClientMaterialHistory); // must be before /:id
router.get("/rental/ledger/:phoneNumber", isAdmin, mouldController.getCustomerLedger);
router.get("/rental", isAdmin, mouldController.getAllRentals);
router.get("/rental/:id", isAdmin, mouldController.getRentalById);
router.put("/rental/:id", isAdmin, mouldController.updateRental);
router.delete("/rental/:id", isAdmin, mouldController.deleteRental);

/** Payment & Close */
router.post("/rental/calculate", isAdmin, mouldValidation.validateCalculateRental, mouldController.calculateRental);
router.put("/rental/:id/payment-update", isAdmin, mouldValidation.validatePaymentUpdate, mouldController.paymentUpdate);
router.post("/rental/:id/payment", isAdmin, mouldValidation.validatePayment, mouldController.addPayment);
router.post("/rental/:id/close", isAdmin, mouldController.closeRental);

/** General Mould Inventory (New Structure) */
router.post("/add", isAdmin, mouldValidation.validateAddNewMould, mouldController.addNewMould);
router.get("/all", isAdmin, mouldController.getAllMoulds);

module.exports = router;