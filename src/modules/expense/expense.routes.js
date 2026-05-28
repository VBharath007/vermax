const express = require("express");
const router = express.Router();
const expenseController = require("./expense.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

// Define parameter route first to avoid 404 collisions
// Define specific routes before generic ones if needed
router.get("/project/:projectNo", isAdmin, expenseController.getExpenses);
router.get("/history/:projectNo", isAdmin, expenseController.getFinancialHistory);
router.post("/", isAdmin, expenseController.createExpense);
router.put("/:id", isAdmin, expenseController.updateExpense);
router.delete("/:id", isAdmin, expenseController.deleteExpense);

module.exports = router;