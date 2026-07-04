const { db } = require("../../config/firebase");

const projectsCollection = db.collection("projects");
const worksCollection = db.collection("works");
const materialReceivedCollection = db.collection("materialReceived");
const materialUsedCollection = db.collection("materialUsed");
const siteExpensesCollection = db.collection("siteExpenses");
const advancesCollection = db.collection("advances");
const { ADDITIONAL_WORKS } = require("../../models/firestore.collections");
const additionalWorksCollection = db.collection(ADDITIONAL_WORKS);

const safeDelete = async (collectionName, projectNo) => {
  try {
    const collectionRef = db.collection(collectionName);

    const snapshot = await collectionRef
      .where("projectNo", "==", projectNo)
      .get();

    if (snapshot.empty) {
      console.log(`No ${collectionName} found — skipping`);
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    console.log(`Deleted ${snapshot.size} from ${collectionName}`);
    return snapshot.size;

  } catch (err) {
    console.log(`Skipping ${collectionName}`);
    return 0;
  }
};

// ─── Shared Financial Helper ──────────────────────────────────────────────────
//
//  SINGLE SOURCE OF TRUTH — used by getProjectSummary AND getFinancialHistory.
//  Numbers will NEVER differ between the two screens.
//
//  FINANCIAL LOGIC:
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  totalAdvance        = SUM(advances.amountReceived)                     │
//  │                        (fallback → project.paymentDetails.advancedPaid) │
//  │                                                                         │
//  │  siteExpenseTotal    = SUM(siteExpenses WHERE type ≠ "materialPayment") │
//  │  materialPayTotal    = SUM(siteExpenses WHERE type  = "materialPayment") │
//  │  totalExpense        = siteExpenseTotal + materialPayTotal               │
//  │                                                                         │
//  │  amountLeft (balance) = totalAdvance − totalExpense                     │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  EXPENSE TYPES stored in siteExpenses:
//    "materialPayment"  → auto-created by material_service when paidAmount > 0
//    (anything else)    → manually entered site expenses
//
// ─────────────────────────────────────────────────────────────────────────────
async function _getFinancials(projectNo, projectData) {
    // Parallel fetch for performance
    const [advanceSnap, expenseSnap] = await Promise.all([
        advancesCollection.where("projectNo", "==", projectNo).get(),
        siteExpensesCollection.where("projectNo", "==", projectNo).get(),
    ]);

    // ── 1. Build Advance history ──────────────────────────────────────────────
    const advances = [];
    let totalAdvance = 0;

    advanceSnap.forEach(doc => {
        const data = doc.data();
        const amount = Number(data.amountReceived) || 0;
        totalAdvance += amount;
        advances.push({
            id: doc.id,
            type: "Advance",
            amount,
            remark: data.remark || "Project Advance",
            date: data.date || data.createdAt?.split("T")[0],
            createdAt: data.createdAt,
            modeOfPayment: data.modeOfPayment,
            sno: data.sno,
        });
    });

    // Fallback: no dynamic advances yet → use static field on project doc
    if (totalAdvance === 0 && projectData) {
        const staticAdvance = Number(projectData.paymentDetails?.advancedPaid) || 0;
        if (staticAdvance > 0) {
            totalAdvance = staticAdvance;
            advances.push({
                id: "initial",
                type: "Advance",
                amount: staticAdvance,
                remark: "Initial Advance",
                date: projectData.createdAt?.split("T")[0],
                createdAt: projectData.createdAt,
                modeOfPayment: "Initial",
                sno: 1,
            });
        }
    }

    // ── 2. Build Expense history (split by type) ──────────────────────────────
    const siteExpenses = [];   // manual expenses entered by user
    const materialPayments = [];   // auto-created from material paidAmount
    let siteExpenseTotal = 0;
    let materialPayTotal = 0;

    expenseSnap.forEach(doc => {
        const data = doc.data();
        const amount = Number(data.amount) || 0;

        const entry = {
            id: doc.id,
            amount,
            remark: data.remark || data.particular || "Expense",
            particular: data.particular,
            date: data.date || data.createdAt?.split("T")[0],
            createdAt: data.createdAt,
            materialId: data.materialId || null,
            receiptId: data.receiptId || null,
            labourId: data.labourId || null,
            labourName: data.labourName || null,
        };

        if (data.type === "materialPayment") {
            // ── Material payment: advance paid to supplier ─────────────────
            entry.type = "MaterialPayment";
            entry.remark = data.remark || `Material Payment – ${data.particular || data.materialId}`;
            materialPayTotal += amount;
            materialPayments.push(entry);
        } else if (data.type === "labourPayment") {
            // ── Labour payment: weekly payment to labour ───────────────────
            entry.type = "LabourPayment";
            entry.remark = data.remark || `Labour Payment – ${data.labourName || data.labourId}`;
            siteExpenseTotal += amount;
            siteExpenses.push(entry);
        } else {
            // ── Regular site expense ───────────────────────────────────────
            entry.type = "Expense";
            siteExpenseTotal += amount;
            siteExpenses.push(entry);
        }
    });

    // Combined expense list for history view (both types together)
    const allExpenses = [...siteExpenses, ...materialPayments];
    const totalExpense = siteExpenseTotal + materialPayTotal;
    const balance = totalAdvance - totalExpense;

    // ── 3. Full combined timeline sorted latest-first ─────────────────────────
    const history = [...advances, ...allExpenses].sort((a, b) =>
        new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );

    return {
        totalAdvance,
        siteExpenseTotal,      // manual site expenses only
        materialPayTotal,      // material supplier payments only
        totalExpense,          // siteExpenseTotal + materialPayTotal
        balance,               // amountLeft = totalAdvance − totalExpense
        advances,
        siteExpenses,
        materialPayments,
        expenses: allExpenses, // backward-compatible: all expenses combined
        history,
    };
}


// ─── Project CRUD ─────────────────────────────────────────────────────────────

exports.createProject = async (projectData) => {
    if (!projectData.projectNo) throw new Error("projectNo is required");

    const docRef = projectsCollection.doc(projectData.projectNo);
    const doc = await docRef.get();
    if (doc.exists) throw new Error("Project with this projectNo already exists");

    projectData.createdAt = projectData.createdAt || new Date().toISOString();

    // ── Save project as-is (paymentDetails structure preserved) ──────────────
    await docRef.set(projectData);

    let advanceRecord = null;

    // ── Extract advance from paymentDetails.advancedPaid ─────────────────────
    const advancedPaid = Number(projectData?.paymentDetails?.advancedPaid || 0);

    if (advancedPaid > 0) {
        const advanceData = {
            projectNo: projectData.projectNo,
            amountReceived: advancedPaid,
            pastAdvance: 0,
            remark: "Initial advance on project creation",
            date: projectData.startDate || new Date().toISOString().split("T")[0],
            createdAt: new Date().toISOString(),
            tenant_id: projectData.tenant_id || "GLOBAL",
        };

        const advanceRef = await advancesCollection.add(advanceData);
        advanceRecord = { advanceId: advanceRef.id, ...advanceData };
    }

    return {
        ...projectData,
        advance: advanceRecord,
    };
};

exports.getAllProjects = async () => {
  // ✅ Parallel fetch — projects + all images same time
  const [projectSnap, imageSnap] = await Promise.all([
    projectsCollection.get(),
    db.collection("projectImages").get(),
  ]);

  // Build imageMap: { projectNo: [img1, img2, ...] }
  const imageMap = {};
  imageSnap.forEach((doc) => {
    const data = doc.data();
    delete data.storagePath;
    if (!imageMap[data.projectNo]) imageMap[data.projectNo] = [];
    imageMap[data.projectNo].push(data);
  });

  // Attach images to each project
  const projects = [];
  projectSnap.forEach((doc) => {
    const project = doc.data();
    project.images = imageMap[project.projectNo] || [];
    projects.push(project);
  });

  return projects;
};

exports.getProjectByNo = async (projectNo) => {
    const docRef = projectsCollection.doc(projectNo);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Project not found");
    return doc.data();
};

exports.updateProject = async (projectNo, updateData) => {
    const docRef = projectsCollection.doc(projectNo);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Project not found");

    delete updateData.projectNo;
    delete updateData.createdAt;

    await docRef.update(updateData);
    // ✅ PERF: Don't re-read the doc after update — Flutter ignores this response
    return { projectNo, updated: true };
};

exports.deleteProject = async (projectNo) => {
    const docRef = db.collection("projects").doc(projectNo);
    const doc = await docRef.get();

    if (!doc.exists) {
        throw new Error(`Project '${projectNo}' not found`);
    }

    const BATCH_LIMIT = 450;

    // ── Helper: chunked, fault-tolerant delete ───────────────────────────────
    const deleteQuery = async (collectionName) => {
        try {
            const snap = await db
                .collection(collectionName)
                .where("projectNo", "==", projectNo)
                .get();

            if (snap.empty) {
                console.log(`[${projectNo}] No ${collectionName} found — skipping`);
                return { label: collectionName, deleted: 0, status: "skipped" };
            }

            const docs = snap.docs;
            let deletedCount = 0;

            // Chunk into batches of 450 (Firestore hard limit = 500)
            for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
                const batch = db.batch();
                const chunk = docs.slice(i, i + BATCH_LIMIT);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deletedCount += chunk.length;
            }

            console.log(`[${projectNo}] Deleted ${deletedCount} ${collectionName}`);
            return { label: collectionName, deleted: deletedCount, status: "success" };
        } catch (err) {
            // Oru collection fail aanalum meethi ellame continue aagum
            console.error(`[${projectNo}] Failed to delete ${collectionName}:`, err.message);
            return { label: collectionName, deleted: 0, status: "failed", error: err.message };
        }
    };

    // ── All project-related collections (Firestore collection names) ─────────
    const collections = [
        "works",
        "materialReceived",
        "materialUsed",
        "siteExpenses",
        "advances",
        "labourPayments",
        "materialRequired",
        "stock"
    ];

    // ── Parallel execution — ovvoru deletion-um independent ──────────────────
    const results = await Promise.all(
        collections.map(name => deleteQuery(name))
    );

    // ── Build response summary ───────────────────────────────────────────────
    const deleted = {};
    const failed = [];

    results.forEach(r => {
        deleted[r.label] = r.deleted;
        if (r.status === "failed") {
            failed.push({ module: r.label, error: r.error });
        }
    });

    // ── Finally delete the project document itself ──────────────────────────
    try {
        await docRef.delete();
        console.log(`[${projectNo}] Project document deleted successfully`);
    } catch (err) {
        console.error(`[${projectNo}] Failed to delete project doc:`, err.message);
        failed.push({ module: "project", error: err.message });
    }

    return {
        message: failed.length
            ? `Project '${projectNo}' deleted with ${failed.length} module failure(s)`
            : `Project '${projectNo}' and all related data deleted successfully`,
        deleted,
        failed,
    };
};


// ─── Project Summary ──────────────────────────────────────────────────────────
//
//  Returns:
//    materialStock   – per-material received / used / stock breakdown
//    financialSummary:
//      totalMaterialPayment  – total paid to suppliers (from material receipts)
//      totalSiteExpense      – total manual site expenses
//      totalExpense          – sum of both above
//      advancedPaid          – total advance received from client
//      amountLeft            – advancedPaid − totalExpense
//
exports.getProjectSummary = async (projectNo) => {
    const docRef = projectsCollection.doc(projectNo);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Project not found");
    const project = doc.data();

    // ── Material stock ────────────────────────────────────────────────────────
    const [receivedSnap, usedSnap] = await Promise.all([
        materialReceivedCollection.where("projectNo", "==", projectNo).get(),
        materialUsedCollection.where("projectNo", "==", projectNo).get(),
    ]);

    const receivedMap = {};
    const dealerMap = {};

    receivedSnap.forEach(doc => {
        const data = doc.data();
        if (!receivedMap[data.materialId]) {
            receivedMap[data.materialId] = {
                materialName: data.materialName,
                receivedQuantity: 0,
                usedQuantity: 0,
                totalAmount: 0,   // total value of material received
                totalPaid: 0,   // total paid to supplier so far
            };
        }
        receivedMap[data.materialId].receivedQuantity += Number(data.quantity) || 0;
        receivedMap[data.materialId].totalAmount += Number(data.totalAmount) || 0;
        receivedMap[data.materialId].totalPaid += Number(data.paidAmount) || 0;

        // ── Dealer-wise balance calculation ──
        const dealerPhone = data.dealerContact || "Unknown";
        if (!dealerMap[dealerPhone]) {
            dealerMap[dealerPhone] = {
                dealerName: data.dealerName || "N/A",
                dealerPhone: dealerPhone,
                totalAmount: 0,
                totalPaid: 0,
                balance: 0
            };
        }
        dealerMap[dealerPhone].totalAmount += Number(data.totalAmount) || 0;
        dealerMap[dealerPhone].totalPaid += Number(data.paidAmount) || 0;
        dealerMap[dealerPhone].balance = dealerMap[dealerPhone].totalAmount - dealerMap[dealerPhone].totalPaid;
    });

    usedSnap.forEach(doc => {
        const data = doc.data();
        if (!receivedMap[data.materialId]) {
            receivedMap[data.materialId] = {
                materialName: data.materialName,
                receivedQuantity: 0,
                usedQuantity: 0,
                totalAmount: 0,
                totalPaid: 0,
            };
        }
        receivedMap[data.materialId].usedQuantity += Number(data.quantityUsed) || 0;
    });

    const materialStock = Object.values(receivedMap).map(m => ({
        materialName: m.materialName,
        receivedQuantity: m.receivedQuantity,
        usedQuantity: m.usedQuantity,
        stock: m.receivedQuantity - m.usedQuantity,
        totalAmount: m.totalAmount,
        totalPaid: m.totalPaid,
        dueAmount: m.totalAmount - m.totalPaid,  // still owed to supplier
    }));

    // ── Additional Work Summary ──────────────────────────────────────────────
    const additionalWorkSnap = await additionalWorksCollection.where("projectNo", "==", projectNo).get();
    let totalAdditionalWorkAmount = 0;
    let totalAdditionalWorkReceived = 0;

    additionalWorkSnap.forEach(doc => {
        const data = doc.data();
        totalAdditionalWorkAmount += Number(data.totalAmount) || 0;
        totalAdditionalWorkReceived += Number(data.receivedAmount) || 0;
    });

    // ── Financial summary via shared helper ───────────────────────────────────
    const financials = await _getFinancials(projectNo, project);

    const dealers = Object.values(dealerMap);
    const totalDealerBalance = dealers.reduce((sum, d) => sum + d.balance, 0);

    return {
        projectDetails: project,
        materialStock,
        dealerSummary: {
            dealers: dealers,
            totalBalance: totalDealerBalance
        },
        additionalWorkSummary: {
            totalAmount: totalAdditionalWorkAmount,
            totalReceived: totalAdditionalWorkReceived,
            totalBalance: totalAdditionalWorkAmount - totalAdditionalWorkReceived,
        },
        financialSummary: {
            // ── Expense breakdown ──────────────────────────────────────────
            totalMaterialPayment: financials.materialPayTotal,  // paid to suppliers
            totalSiteExpense: financials.siteExpenseTotal,  // manual site expenses
            totalExpense: financials.totalExpense,      // combined total
            // ── Advance & balance ──────────────────────────────────────────
            advancedPaid: financials.totalAdvance,
            amountLeft: financials.balance,           // advance − totalExpense
        },
    };
};


// ─── Financial History ────────────────────────────────────────────────────────
//
//  Returns the full timeline of advances, site expenses, and material payments.
//  The `summary` block mirrors the numbers shown on the Project Summary screen.
//
exports.getFinancialHistory = async (projectNo) => {
    if (!projectNo) throw new Error("projectNo is required");

    const projectDoc = await projectsCollection.doc(projectNo).get();
    const projectData = projectDoc.exists ? projectDoc.data() : null;

    const financials = await _getFinancials(projectNo, projectData);

    return {
        projectNo,
        summary: {
            totalAdvance: financials.totalAdvance,
            totalMaterialPayment: financials.materialPayTotal,
            totalSiteExpense: financials.siteExpenseTotal,
            totalExpense: financials.totalExpense,
            amountLeft: financials.balance,     // ← this is what Flutter shows as "Amount Left"
        },
        history: financials.history,          // combined timeline, latest first
        advances: financials.advances,
        siteExpenses: financials.siteExpenses,     // manual expenses only
        materialPayments: financials.materialPayments, // auto-expenses from material receipts
        expenses: financials.expenses,         // all expenses combined (backward-compat)
    };
};