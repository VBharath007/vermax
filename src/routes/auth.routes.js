const router = require("express").Router();
const controller = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/mfa", controller.verifyMFA);
router.get("/me", verifyToken, controller.getMe);
router.get("/dashboard", verifyToken, controller.dashboard);
router.post("/fcm-token", verifyToken, controller.updateFCMToken);
router.post("/test-fcm", controller.testFCM);
router.get("/test-fcm", controller.testFCM);

module.exports = router;
