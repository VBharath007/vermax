const express = require("express");
const router = express.Router();
const projectController = require("./project.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext, featureGuard } = require("../../middleware/tenant.middleware");

// Include tenant isolation and feature toggling (e.g., 'project_management' feature)
const isAdmin = [verifyToken, authorize(["admin"]), tenantContext, featureGuard("project_management")];

const imageController = require("./image.controller");
const upload = require("../../middleware/upload.middleware");

// ✅ AUTO PROJECT NUMBER
router.get("/next-project-no", isAdmin, projectController.getNextProjectNo);

// Image routes
router.get("/images", isAdmin, imageController.getAllImages);
router.get("/images/:imageId", isAdmin, imageController.getImageById);
router.delete("/images/:imageId", isAdmin, imageController.deleteImage);

// Work history
router.get("/work-history/:projectNo", isAdmin, projectController.getWorkHistory);

// Project CRUD
router.post("/", isAdmin, projectController.createProject);
router.get("/", isAdmin, projectController.getAllProjects);

// Dynamic routes
router.get("/:projectNo", isAdmin, projectController.getProjectByNo);
router.put("/:projectNo", isAdmin, projectController.updateProject);
router.delete("/:projectNo", isAdmin, projectController.deleteProject);

router.get("/:projectNo/summary", isAdmin, projectController.getProjectSummary);

// Image APIs
router.post("/:projectNo/images", isAdmin, upload.single("image"), imageController.uploadImage);
router.get("/:projectNo/images", isAdmin, imageController.getProjectImages);

module.exports = router;