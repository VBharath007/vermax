const express = require("express");
const router = express.Router();

const bankController = require("./bank.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// ─────────────────────────────────────────────
// 📊 ALL BANKS + SUMMARY
// GET /api/banks
// ─────────────────────────────────────────────
router.get("/", isAdmin, bankController.getAllBanks);
router.post("/", isAdmin, bankController.createBank);
// ─────────────────────────────────────────────
// 🏦 SINGLE BANK
// GET /api/banks/:bankId
// ─────────────────────────────────────────────
router.get("/:bankId", isAdmin, bankController.getBankById);

// ─────────────────────────────────────────────
// 📜 TRANSACTIONS
// GET /api/banks/:bankId/transactions
// ─────────────────────────────────────────────
router.get("/:bankId/transactions", isAdmin, bankController.getBankTransactions);


router.get("/transactions/global", isAdmin, bankController.getGlobalTransactions);

router.put("/:bankId",                     isAdmin,     bankController.updateBank);
// router.post("/:bankId/transactions",      isAdmin,     bankController.addTransaction);
router.put("/:bankId/transactions/:txId",       isAdmin,     bankController.updateTransaction);

// 🗑️ DELETE
router.delete("/:bankId",                       isAdmin,     bankController.deleteBank);
router.delete("/:bankId/transactions/:txId",    isAdmin,     bankController.deleteTransaction);

module.exports = router;