const router = require("express").Router();
const tenantController = require("./tenant.controller");
const { verifyToken, isAdmin } = require("../../middleware/auth.middleware");

// These routes should be protected by Super Admin middleware. 
// For now, using the existing verifyToken and isAdmin as a placeholder for Super Admin check.
// In a real 25-yr SaaS, we'd have a specific `isSuperAdmin` middleware.

router.post("/", verifyToken, isAdmin, tenantController.createTenant);
router.get("/", verifyToken, isAdmin, tenantController.getAllTenants);
router.put("/:id/features", verifyToken, isAdmin, tenantController.updateTenantFeatures);
router.put("/:id/status", verifyToken, isAdmin, tenantController.toggleTenantStatus);
router.delete("/:id", verifyToken, isAdmin, tenantController.deleteTenant);

module.exports = router;
