const { db } = require("../../config/firebase");

const siteExpensesCollection = db.collection("siteExpenses");
const advancesCollection = db.collection("advances");
const banksCollection = db.collection("banks");

// ─── Create Expense ───────────────────────────────────────────────────────────
//
//  Only for MANUAL site expenses entered by the user.
//  Material payment expenses are auto-created by material_service.js.
//  We block type="materialPayment" here to prevent accidental duplication.
//
exports.createExpense = async (expenseData, tenant_id) => {
    if (!expenseData.projectNo) {
        throw new Error("projectNo is required");
    }
    if (!tenant_id) throw new Error("tenant_id is required");

    if (!expenseData.amount) {
        throw new Error("amount is required");
    }

    if (!expenseData.paymentMethod) {
        throw new Error("paymentMethod is required (CASH or BANK)");
    }

    const validMethods = ["CASH", "BANK"];
    if (!validMethods.includes(expenseData.paymentMethod)) {
        throw new Error("Invalid payment method");
    }

    expenseData.createdAt = new Date().toISOString();
    expenseData.amount = Number(expenseData.amount) || 0;
    expenseData.type = expenseData.type || "siteExpense";

    // 🔥 BANK LOGIC START
    if (expenseData.paymentMethod === "BANK") {
        if (!expenseData.bankId) {
            throw new Error("bankId is required for BANK payment");
        }

        const bankDoc = await db.collection("banks").doc(expenseData.bankId).get();

        if (!bankDoc.exists) {
            throw new Error("Bank not found");
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);

        if (currentBalance < expenseData.amount) {
            throw new Error("Insufficient bank balance");
        }

        const newBalance = currentBalance - expenseData.amount;

        // 1️⃣ Update bank balance
        await db.collection("banks").doc(expenseData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // 2️⃣ Create transaction
        const txnData = {
            type: "DEBIT", // 🔥 expense = DEBIT
            amount: expenseData.amount,
            projectNo: expenseData.projectNo,
            remark: expenseData.remark || "Expense payment",
            date: expenseData.date || new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "EXPENSE",
            createdAt: new Date().toISOString(),
            relatedExpenseId: null
        };

        const txnRef = await db
            .collection("banks")
            .doc(expenseData.bankId)
            .collection("transactions")
            .add(txnData);

        expenseData.bankTransactionId = txnRef.id;
        expenseData.bankName = bankData.accountName || "Unknown Bank";
    }
    // 🔥 BANK LOGIC END


    // 🔁 calculate pastExpense (your existing logic)
    const snapshot = await siteExpensesCollection
        .where("projectNo", "==", expenseData.projectNo)
        .get();

    let totalPrevious = 0;
    snapshot.forEach(doc => {
        totalPrevious += Number(doc.data().amount || 0);
    });

    expenseData.pastExpense = totalPrevious;

    // 💾 save expense
    expenseData.tenant_id = tenant_id;
    const docRef = await siteExpensesCollection.add(expenseData);

    // 🔁 update transaction with reference
    if (expenseData.paymentMethod === "BANK" && expenseData.bankTransactionId) {
        await db
            .collection("banks")
            .doc(expenseData.bankId)
            .collection("transactions")
            .doc(expenseData.bankTransactionId)
            .update({
                relatedExpenseId: docRef.id
            });
    }

    return { expenseId: docRef.id, ...expenseData };
};


// ─── Get Expenses ─────────────────────────────────────────────────────────────
//
//  Returns all siteExpenses for a project split into:
//    manualExpenses    → entered by user
//    materialPayments  → auto-created from material receipts
//
//  The totals on the response let the Flutter screen show:
//    "Site Expenses:     ₹X"
//    "Material Payments: ₹Y"   ← auto-deducted from advance
//    "Total Expense:     ₹Z"
//    "Amount Left:       ₹(advance − Z)"
//
exports.getExpenses = async (projectNo, tenant_id) => {
    let query = siteExpensesCollection;
    if (projectNo) {
        query = query.where("projectNo", "==", projectNo);
    }
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    const manualExpenses = [];
    const materialPayments = [];
    let manualTotal = 0;
    let materialPayTotal = 0;

    // "2026-03-17" → "17-03-2026"
    const formatDate = (raw) => {
        if (!raw) return null;
        const d = raw.split("T")[0];          // strip time if ISO string
        const [yyyy, mm, dd] = d.split("-");
        return `${dd}-${mm}-${yyyy}`;
    };

    snapshot.forEach((doc) => {
        const data = doc.data();
        const amount = Number(data.amount) || 0;
        const rawDate = data.date || data.createdAt?.split("T")[0];

        const entry = {
            expenseId: doc.id,
            ...data,
            amount,
            remark: data.remark || data.particular || "Expense",
            date: formatDate(rawDate),   // "17-03-2026"
            amountReceived: amount,
        };

        if (data.type === "materialPayment") {
            entry.displayLabel = data.particular || `Material Payment – ${data.materialId || ""}`;
            materialPayTotal += amount;
            materialPayments.push(entry);
        } else {
            entry.displayLabel = data.particular || data.remark || "Site Expense";
            manualTotal += amount;
            manualExpenses.push(entry);
        }
    });

    const totalExpense = manualTotal + materialPayTotal;

    // Sort all lists latest first (createdAt descending)
    const sortLatestFirst = (a, b) =>
        new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);

    manualExpenses.sort(sortLatestFirst);
    materialPayments.sort(sortLatestFirst);
    const allExpenses = [...manualExpenses, ...materialPayments]
        .sort(sortLatestFirst);

    return {
        manualExpenses,
        materialPayments,
        expenses: allExpenses,   // latest entry first
        totalManualExpense: manualTotal,
        totalMaterialPayment: materialPayTotal,
        totalExpense,
    };
};


// ─── Update Expense ───────────────────────────────────────────────────────────
//
//  Only manual siteExpense records can be updated here.
//  To update a material payment, update the paidAmount on the material receipt.
//
exports.updateExpense = async (id, updateData, tenant_id) => {
    const docRef = siteExpensesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Expense record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    if (doc.data().type === "materialPayment") {
        throw new Error(
            "Material payment expenses cannot be edited here. " +
            "Update the paidAmount on the material receipt instead."
        );
    }

    if (doc.data().type === "labourPayment") {
        throw new Error(
            "Labour payment expenses cannot be edited here. " +
            "Use PUT /api/payments/:paymentId instead."
        );
    }

    // ── Build clean update object — only fields explicitly sent ────────────────
    // amount மட்டும் send பண்ணா → remark, particular untouched
    // undefined, null, "" — எதுவும் Firestore-க்கு போகாது
    const cleanData = {};

    if (updateData.amount !== undefined && updateData.amount !== null) {
        cleanData.amount = Number(updateData.amount);
    }
    if (updateData.remark !== undefined && updateData.remark !== null && updateData.remark !== "") {
        cleanData.remark = updateData.remark;
    }
    if (updateData.particular !== undefined && updateData.particular !== null && updateData.particular !== "") {
        cleanData.particular = updateData.particular;
    }
    if (updateData.date !== undefined && updateData.date !== null && updateData.date !== "") {
        cleanData.date = updateData.date;
    }
    if (updateData.type !== undefined && updateData.type !== null) {
        cleanData.type = updateData.type;
    }

    if (Object.keys(cleanData).length === 0) {
        throw new Error("No valid fields to update. Send at least one of: amount, remark, particular, date");
    }

    cleanData.updatedAt = new Date().toISOString();

    await docRef.update(cleanData);
    const updatedDoc = await docRef.get();
    return { expenseId: id, ...updatedDoc.data() };
};


// ─── Delete Expense ───────────────────────────────────────────────────────────
//
//  Only manual siteExpense records can be deleted here.
//  Material payment entries are deleted automatically when the receipt is deleted.
//
exports.deleteExpense = async (id, tenant_id) => {
    const docRef = siteExpensesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Expense record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    // Guard: prevent manual deletion of auto-generated entries
    if (doc.data().type === "materialPayment") {
        throw new Error(
            "Material payment expenses are managed automatically. " +
            "Delete the material receipt or set paidAmount to 0 instead."
        );
    }

    // Guard: prevent manual deletion of auto-generated labour payment entries
    if (doc.data().type === "labourPayment") {
        throw new Error(
            "Labour payment expenses are managed automatically. " +
            "Use DELETE /api/payments/:paymentId instead."
        );
    }

    await docRef.delete();
    return { message: "Expense record deleted successfully" };
};


// ─── Financial History ────────────────────────────────────────────────────────
//  Delegates to project_service which owns the single source of truth.
exports.getFinancialHistory = async (projectNo, tenant_id) => {
    const projectService = require("../project/project.service");
    return projectService.getFinancialHistory(projectNo, tenant_id);
};