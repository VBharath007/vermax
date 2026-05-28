const express = require("express");
const router = express.Router();
const extraWorkController = require("./extraWork.controller");
const { verifyToken, isAdmin } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth = [verifyToken, tenantContext, isAdmin];

// ─── Extra Work / Notes CRUD ───

// POST /api/extra-works
router.post("/", isAuth, extraWorkController.createExtraWork);

// GET /api/extra-works?projectNo=PRO001
router.get("/", isAuth, extraWorkController.getAllExtraWorks);

// GET /api/extra-works/:id
router.get("/:id", isAuth, extraWorkController.getExtraWorkById);

// PUT /api/extra-works/:id
router.put("/:id", isAuth, extraWorkController.updateExtraWork);

// DELETE /api/extra-works/:id
router.delete("/:id", isAuth, extraWorkController.deleteExtraWork);

module.exports = router;
