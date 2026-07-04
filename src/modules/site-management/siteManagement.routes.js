const express = require("express");
const router = express.Router();
const siteController = require("./siteManagement.controller");
const { verifyToken, isSiteManager } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");
const upload = require("../../middleware/upload.middleware");

const isAuth = [verifyToken, tenantContext, isSiteManager];

// ─── Materials Log ───
router.get("/materials/stock", isAuth, siteController.getMaterialStocks);
router.put("/materials/stock/:id", isAuth, siteController.updateMaterialStock);
router.post("/materials", isAuth, siteController.createMaterialLog);
router.get("/materials", isAuth, siteController.getMaterialLogs);
router.delete("/materials/:id", isAuth, siteController.deleteMaterialLog);

// ─── Daily Diary ───
router.post("/diary", isAuth, siteController.createDiaryEntry);
router.get("/diary", isAuth, siteController.getDiaryEntries);
router.put("/diary/:id", isAuth, siteController.updateDiaryEntry);
router.delete("/diary/:id", isAuth, siteController.deleteDiaryEntry);

// ─── Punch List ───
router.post("/punch-list", isAuth, siteController.createPunchItem);
router.get("/punch-list", isAuth, siteController.getPunchItems);
router.put("/punch-list/:id", isAuth, siteController.updatePunchItem);
router.delete("/punch-list/:id", isAuth, siteController.deletePunchItem);

// ─── Progress Photos ───
router.post("/photos", isAuth, upload.single("image"), siteController.uploadPhoto);
router.get("/photos", isAuth, siteController.getPhotos);
router.put("/photos/:id", isAuth, siteController.updatePhoto);
router.delete("/photos/:id", isAuth, siteController.deletePhoto);

module.exports = router;
