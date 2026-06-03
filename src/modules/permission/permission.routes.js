const express = require("express");
const router = express.Router();
const ctrl = require("./permission.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth      = [verifyToken, tenantContext];
const isAdmin     = [verifyToken, authorize(["admin"]), tenantContext];
const isEmployee  = [verifyToken, authorize(["employee"]), tenantContext];

// Employee — submit, view their own requests
router.post("/",            isEmployee, ctrl.createPermission);
router.get("/my",           isEmployee, ctrl.getMyPermissions);

// Admin — view all, approve/reject
router.get("/",             isAdmin, ctrl.getAllPermissions);
router.put("/:id/status",   isAdmin, ctrl.updateStatus);
router.delete("/:id",       isAdmin, ctrl.deletePermission);

module.exports = router;
