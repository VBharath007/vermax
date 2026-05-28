const router = require("express").Router();
const controller = require("../controllers/employee.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { tenantContext, featureGuard } = require("../middleware/tenant.middleware");

// Create employee (Admin only)
router.post(
    "/add",
    verifyToken,
    authorize(["admin"]),
    tenantContext,
    featureGuard("employee_management"),
    controller.addEmployee
);

// Delete employee (Admin only)
router.delete(
    "/:empID",
    verifyToken,
    authorize(["admin"]),
    tenantContext,
    featureGuard("employee_management"),
    controller.deleteEmployee
);

// Update employee (Admin OR Self)
router.put(
    "/:empID",
    verifyToken,
    authorize(["admin", "employee"]),
    tenantContext,
    controller.updateEmployee
);

// Dashboard (Employee only)
router.get(
    "/dashboard",
    verifyToken,
    authorize(["employee"]),
    tenantContext,
    controller.getDashboard
);

module.exports = router;
