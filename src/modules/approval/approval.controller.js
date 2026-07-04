const approvalService = require("./approval.service");
const { db } = require("../../config/firebase");
const cache = require("../../utils/cache");
const approvalsCollection = db.collection("approvals");
const approvalAdvancesCollection = db.collection("approvalAdvances");
const approvalExpensesCollection = db.collection("approvalExpenses");
const projectTypeCollection = db.collection("projectTypeOptions");

exports.getNextApprovalNo = async (req, res) => {
  try {
    const nextNo = await approvalService.getNextApprovalNo(req.tenantId);

    res.json({
      success: true,
      projectNo: nextNo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
exports.createApproval = async (req, res) => {
    try {
        const result = await approvalService.createApproval(req.body, req.tenantId);
        res.status(201).json({ message: "Approval created successfully", data: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getApprovals = async (req, res) => {
    try {
        const cacheKey = `approvals_list_${req.tenantId || "global"}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.status(200).json(cached);
        }
        const result = await approvalService.getApprovals(req.tenantId);
        cache.set(cacheKey, result, 300_000);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getApprovalById = async (req, res) => {
    try {
        const cacheKey = `approvals_detail_${req.tenantId || "global"}_${req.params.id}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.status(200).json(cached);
        }
        const result = await approvalService.getApprovalById(req.params.id, req.tenantId);
        cache.set(cacheKey, result, 300_000);
        res.status(200).json(result);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

exports.updateApproval = async (req, res) => {
    try {
        const result = await approvalService.updateApproval(req.params.id, req.body, req.tenantId);
        res.status(200).json({ message: "Approval updated successfully", data: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- Advances --- //
exports.addAdvance = async (req, res) => {
    try {
        const result = await approvalService.addAdvance(req.params.id, req.body, req.tenantId);
        res.status(201).json({ message: "Advance payment(s) recorded successfully", data: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getAdvances = async (req, res) => {
    try {
        const result = await approvalService.getAdvances(req.params.id, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Expenses --- //
exports.addExpense = async (req, res) => {
    try {
        const result = await approvalService.addExpense(req.params.id, req.body, req.tenantId);
        res.status(201).json({ message: "Expense(s) recorded successfully", data: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getExpenses = async (req, res) => {
    try {
        const result = await approvalService.getExpenses(req.params.id, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Status Update --- //
exports.updateStatus = async (req, res) => {
    try {
        const { currentStatus } = req.body;
        if (!currentStatus) throw new Error("currentStatus is required");

        const result = await approvalService.updateStatus(req.params.id, currentStatus, req.tenantId);
        res.status(200).json({ message: "Status updated successfully", data: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateExpense = async (req, res) => {
    try {
        const { expenseId } = req.params;
        const result = await approvalService.updateExpense(expenseId, req.body, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        console.error("Update Expense Error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.deleteExpense = async (req, res) => {
    try {
        const { expenseId } = req.params;

        const docRef = approvalExpensesCollection.doc(expenseId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ message: "Expense not found" });
        }
        if (req.tenantId && req.tenantId !== 'GLOBAL' && doc.data().tenant_id !== req.tenantId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await docRef.delete();
        res.json({ message: "Expense deleted successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteApproval = async (req, res) => {
    try {
        const { id } = req.params;

        let approvalRef = approvalsCollection.doc(id);
        let approvalDoc = await approvalRef.get();

        if (!approvalDoc.exists) {
            let query = approvalsCollection.where("projectNo", "==", id);
            if (req.tenantId && req.tenantId !== 'GLOBAL') {
                query = query.where("tenant_id", "==", req.tenantId);
            }
            const snap = await query.get();
            if (snap.empty) {
                return res.status(404).json({ message: "Approval not found" });
            }
            approvalDoc = snap.docs[0];
            approvalRef = approvalDoc.ref;
        }
        if (req.tenantId && req.tenantId !== 'GLOBAL' && approvalDoc.data().tenant_id !== req.tenantId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const docId = approvalDoc.id;

        const advancesSnap = await approvalAdvancesCollection
            .where("approvalId", "==", docId)
            .get();

        const batch = db.batch();

        advancesSnap.forEach(doc => {
            batch.delete(doc.ref);
        });

        const expensesSnap = await approvalExpensesCollection
            .where("approvalId", "==", docId)
            .get();

        expensesSnap.forEach(doc => {
            batch.delete(doc.ref);
        });

        batch.delete(approvalRef);
        await batch.commit();

        res.json({ message: "Approval and related expenses & advances deleted successfully" });

    } catch (error) {
        console.error("Delete Approval Error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.updateAdvance = async (req, res) => {
    try {
        const { advanceId } = req.params;
        const { amountReceived, remark, date } = req.body;

        const docRef = approvalAdvancesCollection.doc(advanceId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ message: "Advance not found" });
        }
        if (req.tenantId && req.tenantId !== 'GLOBAL' && doc.data().tenant_id !== req.tenantId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const updateData = {};

        if (amountReceived !== undefined) updateData.amountReceived = Number(amountReceived);
        if (remark !== undefined) updateData.remark = remark;
        if (date !== undefined) updateData.date = date;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No valid fields provided for update" });
        }

        await docRef.update(updateData);
        res.json({ message: "Advance updated successfully" });

    } catch (error) {
        console.error("Update Advance Error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.deleteAdvance = async (req, res) => {
    try {
        const { advanceId } = req.params;

        const docRef = approvalAdvancesCollection.doc(advanceId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ message: "Advance not found" });
        }
        if (req.tenantId && req.tenantId !== 'GLOBAL' && doc.data().tenant_id !== req.tenantId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await docRef.delete();
        res.json({ message: "Advance deleted successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateTotalFees = async (req, res) => {
    try {
        const { id } = req.params;
        const { totalFees } = req.body;

        let docRef = approvalsCollection.doc(id);
        let doc = await docRef.get();

        if (!doc.exists) {
            let query = approvalsCollection.where("projectNo", "==", id);
            if (req.tenantId && req.tenantId !== 'GLOBAL') {
                query = query.where("tenant_id", "==", req.tenantId);
            }
            const snap = await query.get();
            if (snap.empty) {
                return res.status(404).json({ message: "Approval not found" });
            }
            doc = snap.docs[0];
            docRef = doc.ref;
        }
        if (req.tenantId && req.tenantId !== 'GLOBAL' && doc.data().tenant_id !== req.tenantId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        await docRef.update({
            "financialDetails.totalFees": Number(totalFees)
        });

        res.json({ message: "Total fees updated successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.addProjectType = async (req, res) => {
    try {
        const result = await approvalService.addProjectType(req.body.name, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.confirmProjectType = async (req, res) => {
    try {
        const result = await approvalService.confirmProjectType(req.params.id, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteProjectType = async (req, res) => {
    try {
        const result = await approvalService.deleteProjectType(req.params.id, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.getProjectTypes = async (req, res) => {
    try {
        const result = await approvalService.getProjectTypes(req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Date Range Summary --- //
exports.getSummaryByDateRange = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const result = await approvalService.getSummaryByDateRange(startDate, endDate, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};