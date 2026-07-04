const express = require("express");
const router = express.Router();
const multer = require("multer");
const ctrl = require("./documentScan.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

// Use memory storage so we can pass the buffer to Gemini/Cloudinary directly
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only images (JPEG, PNG, WEBP, HEIC) and PDF files are allowed"));
        }
    }
});

const isAuth = [verifyToken, tenantContext];

// POST /api/document-scan/analyze
router.post("/analyze", isAuth, upload.single("file"), ctrl.analyzeDocument);

// GET /api/document-scan/history
router.get("/history", isAuth, ctrl.getScanHistory);

// DELETE /api/document-scan/:id
router.delete("/:id", isAuth, ctrl.deleteScan);

module.exports = router;
