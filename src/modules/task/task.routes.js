const router = require("express").Router();
const ctrl = require("./task.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth = [verifyToken, tenantContext];

router.get("/smart/counts",    isAuth, ctrl.getSmartCounts);
router.get("/smart/today",      isAuth, ctrl.getToday);
router.get("/smart/scheduled",  isAuth, ctrl.getScheduled);
router.get("/smart/flagged",    isAuth, ctrl.getFlagged);
router.get("/smart/completed",  isAuth, ctrl.getCompleted);
router.get("/list/:listId",     isAuth, ctrl.getByList);

router.get("/",                isAuth, ctrl.getAllTasks);
router.post("/",               isAuth, ctrl.createTask);
router.get("/:id",             isAuth, ctrl.getTaskById);
router.put("/:id",             isAuth, ctrl.updateTask);
router.delete("/:id",          isAuth, ctrl.deleteTask);
router.patch("/:id/completed", isAuth, ctrl.completeTask);

module.exports = router;