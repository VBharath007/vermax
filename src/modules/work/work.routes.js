const express = require("express");
    const router = express.Router();
    const workController = require("./work.controller");
    const { verifyToken, isSiteManager } = require("../../middleware/auth.middleware");
    const { authorize } = require("../../middleware/role.middleware");
    const { tenantContext } = require("../../middleware/tenant.middleware");

    const isAdmin = [verifyToken, authorize(["admin"]), tenantContext];
    const isManager = [verifyToken, isSiteManager, tenantContext];

    // IMPORTANT: specific paths MUST come before /:workId to avoid route conflict
    router.get("/project/:projectNo/date/:date", isManager, workController.getWorkByDate);
    router.get("/project/:projectNo/week", isManager, workController.getWorksByWeek);
    router.get("/project/:projectNo/labour", isManager, workController.getLabourByProject);
    router.get("/project/:projectNo/:workId", isManager, workController.getWorkById);
    router.get("/project/:projectNo", isManager, workController.getWorks);
    router.get("/master/:labourId/works", isManager, workController.getWorksByLabour);

    // ── Reverse lookup: all works a labour was assigned to ───────────────────────
    // GET /api/works/labour/:labourId


    // ── Hierarchical Labour Assignment ──────────────────────────────────────────
    router.post("/project/:projectNo/:workId/master", isManager, workController.assignLabourToWork);

    // ── Sub-Labour CRUD ──────────────────────────────────────────────────────────
    // POST   /api/works/project/:projectNo/:workId/:labourId/sublabour        → add / merge counts
    // PUT    /api/works/project/:projectNo/:workId/:labourId/sublabour/:type  → edit one type count
    // DELETE /api/works/project/:projectNo/:workId/:labourId/sublabour/:type  → delete one type entry
    // All these operations are used by supervisors/managers at site:
    router.post("/project/:projectNo/:workId/:labourId/sublabour", isManager, workController.updateSubLabourForWork);
    router.put("/project/:projectNo/:workId/:labourId/sublabour/:type", isManager, workController.editSubLabourCount);
    router.delete("/project/:projectNo/:workId/:labourId/sublabour/:type", isManager, workController.deleteSubLabourType);

    // ── Standard Work CRUD ──────────────────────────────────────────────────────
    router.post("/", isManager, workController.createWork);
    router.get("/", isManager, workController.getWorks);
    router.get("/:workId", isManager, workController.getWorkById);
    router.put("/:workId", isManager, workController.updateWork);
    router.delete("/:workId", isAdmin, workController.deleteWork); // delete remains admin-only

    router.put("/:projectNo/:workId", verifyToken, workController.updateWorkDate);




    module.exports = router;