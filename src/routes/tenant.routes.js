const router = require("express").Router();
const tenantController = require("../modules/tenant/tenant.controller");
const { verifyToken, isAdmin } = require("../middleware/auth.middleware");
const { tenantContext } = require("../middleware/tenant.middleware");
const upload = require("../middleware/upload.middleware");

// GET /api/tenant/profile
router.get("/profile", verifyToken, tenantContext, isAdmin, tenantController.getCompanyProfile);

// PUT /api/tenant/profile
router.put("/profile", verifyToken, tenantContext, isAdmin, tenantController.updateCompanyProfile);

// POST /api/tenant/upload
router.post("/upload", verifyToken, tenantContext, isAdmin, upload.single("file"), tenantController.uploadCompanyFile);

module.exports = router;
