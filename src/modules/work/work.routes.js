    const express = require("express");
    const router = express.Router();
    const workController = require("./work.controller");
    const { verifyToken } = require("../../middleware/auth.middleware");
    const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

    const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];

    // IMPORTANT: specific paths MUST come before /:workId to avoid route conflict
    router.get("/project/:projectNo/date/:date", isAdmin, workController.getWorkByDate);
    router.get("/project/:projectNo/week", isAdmin, workController.getWorksByWeek);
    router.get("/project/:projectNo/labour", isAdmin, workController.getLabourByProject);
    router.get("/project/:projectNo/:workId", isAdmin, workController.getWorkById);
    router.get("/project/:projectNo", isAdmin, workController.getWorks);
    router.get("/master/:labourId/works", isAdmin, workController.getWorksByLabour);

    // ── Reverse lookup: all works a labour was assigned to ───────────────────────
    // GET /api/works/labour/:labourId


    // ── Hierarchical Labour Assignment ──────────────────────────────────────────
    router.post("/project/:projectNo/:workId/master", isAdmin, workController.assignLabourToWork);

    // ── Sub-Labour CRUD ──────────────────────────────────────────────────────────
    // POST   /api/works/project/:projectNo/:workId/:labourId/sublabour        → add / merge counts
    // PUT    /api/works/project/:projectNo/:workId/:labourId/sublabour/:type  → edit one type count
    // DELETE /api/works/project/:projectNo/:workId/:labourId/sublabour/:type  → delete one type entry
    router.post("/project/:projectNo/:workId/:labourId/sublabour", isAdmin, workController.updateSubLabourForWork);
    router.put("/project/:projectNo/:workId/:labourId/sublabour/:type", isAdmin, workController.editSubLabourCount);
    router.delete("/project/:projectNo/:workId/:labourId/sublabour/:type", isAdmin, workController.deleteSubLabourType);

    // ── Standard Work CRUD ──────────────────────────────────────────────────────
    router.post("/", isAdmin, workController.createWork);
    router.get("/", isAdmin, workController.getWorks);
    router.get("/:workId", isAdmin, workController.getWorkById);
    router.put("/:workId", isAdmin, workController.updateWork);
    router.delete("/:workId", isAdmin, workController.deleteWork);

    router.put("/:projectNo/:workId", verifyToken, workController.updateWorkDate);




    module.exports = router;