const express = require("express");
const router = express.Router();
const additionalWorkController = require("./additionalWork.controller");
const { verifyToken, isAdmin } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth = [verifyToken, tenantContext, isAdmin];

// ─── Additional Work Payment CRUD ───

// POST /api/additional-works
router.post("/", isAuth, additionalWorkController.createAdditionalWork);

// GET /api/additional-works?projectNo=PRO001
router.get("/", isAuth, additionalWorkController.getAllAdditionalWorks);

// GET /api/additional-works/:id
router.get("/:id", isAuth, additionalWorkController.getAdditionalWorkById);

// PUT /api/additional-works/:id
router.put("/:id", isAuth, additionalWorkController.updateAdditionalWork);

// DELETE /api/additional-works/:id
router.delete("/:id", isAuth, additionalWorkController.deleteAdditionalWork);

module.exports = router;
