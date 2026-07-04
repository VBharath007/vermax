const projectService = require("./project.service");
const { db } = require("../../config/firebase");
const { isGlobalTenant } = require("../../middleware/tenant.middleware");
const cache = require("../../utils/cache");

// Build a per-tenant cache key
const _ck = (tenantId) => `projects_${tenantId || 'global'}`;

exports.createProject = async (req, res, next) => {
    try {
        if (!isGlobalTenant(req)) {
            req.body.tenant_id = req.tenantId;
        }
        const result = await projectService.createProject(req.body);
        // ✅ Invalidate list cache so next GET reflects new project
        cache.invalidate(_ck(req.tenantId));
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getAllProjects = async (req, res) => {
  try {
    const cacheKey = _ck(req.tenantId);

    // ✅ PERF: Serve from memory if available (< 30s old) — skips Firestore entirely
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, fromCache: true });
    }

    let projectQuery = db.collection("projects");
    let imageQuery = db.collection("projectImages");

    if (!isGlobalTenant(req)) {
        projectQuery = projectQuery.where("tenant_id", "==", req.tenantId);
        imageQuery = imageQuery.where("tenant_id", "==", req.tenantId);
    }

    const [projectSnap, imageSnap] = await Promise.all([
      projectQuery.get(),
      imageQuery.get(),
    ]);

    // Build imageMap
    const imageMap = {};
    imageSnap.forEach((doc) => {
      const data = doc.data();
      delete data.storagePath;
      if (!imageMap[data.projectNo]) imageMap[data.projectNo] = [];
      imageMap[data.projectNo].push(data);
    });

    let projects = [];
    projectSnap.forEach((doc) => {
      const data = doc.data();
      const num = parseInt((data.projectNo || "VVP000").replace("VVP", "")) || 0;
      projects.push({ ...data, images: imageMap[data.projectNo] || [], _index: num });
    });

    projects.sort((a, b) => b._index - a._index);
    projects = projects.map((p) => { delete p._index; return p; });

    // ✅ Cache for 5 minutes (invalidated on any write)
    cache.set(cacheKey, projects, 300_000);

    res.json({ success: true, data: projects });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};


exports.getNextProjectNo = async (req, res) => {
    try {
        const snapshot = await db.collection("projects").get();

        let max = 0;

        snapshot.forEach(doc => {
            const pNo = doc.data().projectNo || "VVP000";
            const num = parseInt(pNo.replace("VVP", "")) || 0;

            if (num > max) max = num;
        });

        const next = max + 1;
        const nextProjectNo = `VVP${String(next).padStart(3, "0")}`;

        res.json({
            success: true,
            projectNo: nextProjectNo,
        });
    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message,
        });
    }
};

exports.getProjectByNo = async (req, res, next) => {
    try {
        // ✅ Ultra-fast path: If the full project list is in memory, grab it from there
        const cacheKey = _ck(req.tenantId);
        const cachedList = cache.get(cacheKey);
        
        if (cachedList) {
            const found = cachedList.find(p => p.projectNo === req.params.projectNo);
            if (found) {
                return res.status(200).json({ success: true, data: found, fromCache: true });
            }
        }

        // Fallback if not cached or not found
        const result = await projectService.getProjectByNo(req.params.projectNo);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

exports.updateProject = async (req, res, next) => {
    try {
        const result = await projectService.updateProject(req.params.projectNo, req.body);
        // ✅ Invalidate cache so next GET shows updated status
        cache.invalidate(_ck(req.tenantId));
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const result = await projectService.deleteProject(projectNo);
        // ✅ Invalidate cache so deleted project disappears from list
        cache.invalidate(_ck(req.tenantId));
        res.status(200).json(result);
    } catch (err) {
        console.error("Delete project error:", err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};


exports.getProjectSummary = async (req, res, next) => {
    try {
        const result = await projectService.getProjectSummary(req.params.projectNo);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

exports.getWorkHistory = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const cacheKey = `wh_${req.tenantId || 'global'}_${projectNo}`;

        // 1. Try to serve from memory cache
        const cachedWH = cache.get(cacheKey);
        if (cachedWH) {
            return res.status(200).json({
                success: true,
                data: cachedWH
            });
        }

        // Fetch Project Document directly via key-value lookup (much faster than query)
        const projectDoc = await db.collection("projects").doc(projectNo).get();
        if (!projectDoc.exists) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        const project = projectDoc.data();
        if (!isGlobalTenant(req) && project.tenant_id !== req.tenantId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        let queryWorks = db.collection("works").where("projectNo", "==", projectNo);
        let queryReceived = db.collection("materialReceived").where("projectNo", "==", projectNo);
        let queryUsed = db.collection("materialUsed").where("projectNo", "==", projectNo);
        let queryAdvances = db.collection("advances").where("projectNo", "==", projectNo);
        let queryExpenses = db.collection("siteExpenses").where("projectNo", "==", projectNo);
        let queryRequired = db.collection("materialRequired").where("projectNo", "==", projectNo);
        let queryStock = db.collection("stock").where("projectNo", "==", projectNo);

        if (!isGlobalTenant(req)) {
            queryWorks = queryWorks.where("tenant_id", "==", req.tenantId);
            queryReceived = queryReceived.where("tenant_id", "==", req.tenantId);
            queryUsed = queryUsed.where("tenant_id", "==", req.tenantId);
            queryAdvances = queryAdvances.where("tenant_id", "==", req.tenantId);
            queryExpenses = queryExpenses.where("tenant_id", "==", req.tenantId);
            queryRequired = queryRequired.where("tenant_id", "==", req.tenantId);
            queryStock = queryStock.where("tenant_id", "==", req.tenantId);
        }

        const [
            worksSnap,
            receivedSnap,
            usedSnap,
            advanceSnap,
            expenseSnap,
            requiredSnap,
            stockSnap
        ] = await Promise.all([
            queryWorks.get(),
            queryReceived.get(),
            queryUsed.get(),
            queryAdvances.get(),
            queryExpenses.get(),
            queryRequired.get(),
            queryStock.get()
        ]);

        const works = worksSnap.docs.map(doc => ({ workId: doc.id, ...doc.data() }));
        const received = receivedSnap.docs.map(doc => ({ receiptId: doc.id, ...doc.data() }));
        const used = usedSnap.docs.map(doc => ({ usageId: doc.id, ...doc.data() }));
        const advances = advanceSnap.docs.map(doc => ({ advanceId: doc.id, ...doc.data() }));
        const expenses = expenseSnap.docs.map(doc => ({ expenseId: doc.id, ...doc.data() }));
        const requiredPlans = requiredSnap.docs.map(doc => doc.data());
        const stock = stockSnap.docs.map(doc => doc.data());

        // Material Required calculation
        const materialRequired = requiredPlans.map(plan => {
            const stockItem = stock.find(s => s.materialId === plan.materialId);
            const currentStock = stockItem ? stockItem.stock : 0;
            const plannedQty = Number(plan.plannedQuantity || plan.requiredQuantity) || 0;
            const requiredQty = plannedQty - currentStock;
            return {
                materialId: plan.materialId,
                materialName: plan.materialName,
                plannedQuantity: plannedQty,
                stock: currentStock,
                materialRequired: requiredQty > 0 ? requiredQty : 0
            };
        });

        // Totals
        const totalAdvance = advances.reduce(
            (sum, a) => sum + (Number(a.amountReceived) || 0), 0
        );
        const totalExpense = expenses.reduce(
            (sum, e) => sum + (Number(e.amount) || 0), 0
        );

        const staticAdvancedPaid = Number(project?.paymentDetails?.advancedPaid) || 0;
        const currentTotalAdvance = totalAdvance > 0 ? totalAdvance : staticAdvancedPaid;
        const remainingBalance = currentTotalAdvance - totalExpense;

        const payload = {
            projectNo,
            workHistory: works,
            materialReceived: received,
            materialUsed: used,
            stock,
            materialRequired,
            advanceReceivedHistory: advances,
            siteExpenseHistory: expenses,
            totalAdvance: currentTotalAdvance,
            totalExpense,
            remainingBalance
        };

        // Cache resolved work history for 5 minutes (300,000 ms)
        cache.set(cacheKey, payload, 300_000);

        res.status(200).json({
            success: true,
            data: payload
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};