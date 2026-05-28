const projectService = require("./project.service");
const { db } = require("../../config/firebase");
const { isGlobalTenant } = require("../../middleware/tenant.middleware");

exports.createProject = async (req, res, next) => {
    try {
        if (!isGlobalTenant(req)) {
            req.body.tenant_id = req.tenantId;
        }
        const result = await projectService.createProject(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getAllProjects = async (req, res) => {
  try {
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
        const result = await projectService.getProjectByNo(req.params.projectNo);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

exports.updateProject = async (req, res, next) => {
    try {
        const result = await projectService.updateProject(req.params.projectNo, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const result = await projectService.deleteProject(projectNo);
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

        let queryProjects = db.collection("projects").where("projectNo", "==", projectNo);
        let queryWorks = db.collection("works").where("projectNo", "==", projectNo);
        let queryReceived = db.collection("materialReceived").where("projectNo", "==", projectNo);
        let queryUsed = db.collection("materialUsed").where("projectNo", "==", projectNo);
        let queryAdvances = db.collection("advances").where("projectNo", "==", projectNo);
        let queryExpenses = db.collection("siteExpenses").where("projectNo", "==", projectNo);
        let queryRequired = db.collection("materialRequired").where("projectNo", "==", projectNo);
        let queryStock = db.collection("stock").where("projectNo", "==", projectNo);

        if (!isGlobalTenant(req)) {
            queryProjects = queryProjects.where("tenant_id", "==", req.tenantId);
            queryWorks = queryWorks.where("tenant_id", "==", req.tenantId);
            queryReceived = queryReceived.where("tenant_id", "==", req.tenantId);
            queryUsed = queryUsed.where("tenant_id", "==", req.tenantId);
            queryAdvances = queryAdvances.where("tenant_id", "==", req.tenantId);
            queryExpenses = queryExpenses.where("tenant_id", "==", req.tenantId);
            queryRequired = queryRequired.where("tenant_id", "==", req.tenantId);
            queryStock = queryStock.where("tenant_id", "==", req.tenantId);
        }

        const [
            projectSnap,
            worksSnap,
            receivedSnap,
            usedSnap,
            advanceSnap,
            expenseSnap,
            requiredSnap,
            stockSnap
        ] = await Promise.all([
            queryProjects.get(),
            queryWorks.get(),
            queryReceived.get(),
            queryUsed.get(),
            queryAdvances.get(),
            queryExpenses.get(),
            queryRequired.get(),
            queryStock.get()
        ]);

        const project = projectSnap.docs[0]?.data();
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

        // ─── BUG FIX: wrap in { success: true, data: { ... } } ───────────────
        // Flutter does: historyResponse['data']['workHistory']
        // Without this wrapper, Flutter looks for body['data'] → null → crash
        res.status(200).json({
            success: true,
            data: {
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
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};