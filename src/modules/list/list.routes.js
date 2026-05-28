const router = require("express").Router();
const ctrl = require("./list.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { tenantContext } = require("../../middleware/tenant.middleware");

const isAuth = [verifyToken, tenantContext];

router.get("/",          isAuth, ctrl.getLists);
router.post("/",         isAuth, ctrl.createList);
router.put("/:id",       isAuth, ctrl.updateList);
router.delete("/:id",    isAuth, ctrl.deleteList);

module.exports = router;