const router = require("express").Router();
const userController = require("./user.controller");
const { verifyToken, isAdmin } = require("../../middleware/auth.middleware");

// These routes should be protected by Super Admin middleware. 
// Using the existing verifyToken and isAdmin as placeholder for Super Admin.
router.get("/", verifyToken, isAdmin, userController.getAllUsers);
router.put("/:id/approve", verifyToken, isAdmin, userController.approveUser);
router.put("/:id/features", verifyToken, isAdmin, userController.updateUserFeatures);
router.delete("/:id", verifyToken, isAdmin, userController.deleteUser);

module.exports = router;
