const router = require("express").Router();
const controller = require("../controllers/attendance.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { tenantContext } = require("../middleware/tenant.middleware");

router.post("/checkin", verifyToken, tenantContext, controller.checkIn);
router.post("/checkout", verifyToken, tenantContext, controller.checkOut);
router.get("/today", verifyToken, tenantContext, controller.getTodayAttendance);
router.get("/today-all", verifyToken, tenantContext, authorize(["admin"]), controller.getAllTodayAttendance);
router.get("/:empID/:month", verifyToken, tenantContext, authorize(["employee", "admin"]), controller.getAttendanceByMonth);
router.post("/reset-today", verifyToken, tenantContext, controller.resetTodayAttendance);

module.exports = router;
