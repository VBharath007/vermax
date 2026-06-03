const express = require("express");
const router = express.Router();
const safetyController = require("./safety.controller");
const { verifyToken, isAdmin } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth = [verifyToken, tenantContext, isAdmin];

// ─── Toolbox Briefings ───
router.post("/toolbox", isAuth, safetyController.createBriefing);
router.get("/toolbox", isAuth, safetyController.getBriefings);
router.put("/toolbox/:id", isAuth, safetyController.updateBriefing);
router.delete("/toolbox/:id", isAuth, safetyController.deleteBriefing);

// ─── Incidents ───
router.post("/incident", isAuth, safetyController.createIncident);
router.get("/incident", isAuth, safetyController.getIncidents);
router.put("/incident/:id", isAuth, safetyController.updateIncident);
router.delete("/incident/:id", isAuth, safetyController.deleteIncident);

// ─── PPE Workers ───
router.post("/worker", isAuth, safetyController.createWorker);
router.get("/worker", isAuth, safetyController.getWorkers);
router.put("/worker/:id", isAuth, safetyController.updateWorker);
router.delete("/worker/:id", isAuth, safetyController.deleteWorker);

module.exports = router;
