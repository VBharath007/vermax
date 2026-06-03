const { db } = require("../../config/firebase");

const materialsCollection = db.collection("materials");
const materialReceivedCollection = db.collection("materialReceived");
const materialUsedCollection = db.collection("materialUsed");
const stockCollection = db.collection("stock");
const materialRequiredCollection = db.collection("materialRequired");
const materialPlanCollection = db.collection("materialPlan");
const siteExpensesCollection = db.collection("siteExpenses");
const materialAdvancesCollection = db.collection("materialAdvances");
const banksCollection = db.collection("banks");
const dayjs = require("dayjs");

const getFormattedDate = (date) =>
    date ? dayjs(date).format("DD-MM-YYYY") : dayjs().format("DD-MM-YYYY");

// ─── Default Materials ────────────────────────────────────────────────────────

const DEFAULT_MATERIALS = [
    "MSAND", "PSAND", "RIVERSAND", "BRICKS", "FLYESH BRICKS",
    "RENACON BLOCKS", "CEMENT", "STEEL-8MM", "STEEL-6MM",
    "STEEL-10MM", "STEEL-12MM", "STEEL-16MM", "STEEL-20MM",
    "AGGREGATE-20MM", "AGGREGATE-40MM", "BABY CHIPS", "GRAVEL"
];

const initializeMaterials = async () => {
    try {
        const snap = await materialsCollection.limit(1).get();
        if (snap.empty) {
            const batch = db.batch();
            DEFAULT_MATERIALS.forEach(name => {
                // ✅ FIX 4: doc ID = materialId → consistent lookup everywhere
                const materialId = name.replace(/\s+/g, '_').toUpperCase();
                const docRef = materialsCollection.doc(materialId);
                batch.set(docRef, {
                    materialId,
                    materialName: name.toUpperCase(),
                    isDefault: true,
                    createdAt: new Date().toISOString()
                });
            });
            await batch.commit();
            console.log("Default materials initialized.");
        }
    } catch (error) {
        console.error("Failed to initialize materials:", error);
    }
};

initializeMaterials();

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function _createMaterialExpense(receiptId, receivedData, paidAmount) {
    const isoNow = new Date().toISOString();

    const expenseData = {
        projectNo: receivedData.projectNo,
        amount: paidAmount,
        particular: `Material Purchase: ${receivedData.materialName}`,
        remark: receivedData.dealerName
            ? `Material Purchase: ${receivedData.materialName} (Dealer: ${receivedData.dealerName})`
            : `Material Purchase: ${receivedData.materialName}`,
        type: "materialPayment",
        materialId: receivedData.materialId,
        receiptId,
        date: isoNow,
        createdAt: isoNow,
        // ✅ FIX: Save tenant_id so tenant-filtered queries can find this expense
        tenant_id: receivedData.tenant_id || null,
    };

    const snap = await siteExpensesCollection
        .where("projectNo", "==", receivedData.projectNo).get();
    let totalPrevious = 0;
    snap.forEach(doc => { totalPrevious += Number(doc.data().amount) || 0; });
    expenseData.pastExpense = totalPrevious;

    await siteExpensesCollection.add(expenseData);
}

async function _updateMaterialExpense(receiptId, newPaidAmount) {
    const snap = await siteExpensesCollection
        .where("receiptId", "==", receiptId)
        .where("type", "==", "materialPayment")
        .get();
    if (snap.empty) return;
    const expenseRef = snap.docs[0].ref;
    if (newPaidAmount <= 0) {
        await expenseRef.delete();
    } else {
        await expenseRef.update({ amount: newPaidAmount, updatedAt: new Date().toISOString() });
    }
}

async function _deleteMaterialExpense(receiptId) {
    const snap = await siteExpensesCollection
        .where("receiptId", "==", receiptId)
        .where("type", "==", "materialPayment")
        .get();
    await Promise.all(snap.docs.map(doc => doc.ref.delete()));
}

// ─── Material Master ──────────────────────────────────────────────────────────

exports.createMaterial = async (materialData, tenant_id) => {
    if (!materialData.materialId) throw new Error("materialId is required");
    if (!tenant_id) throw new Error("tenant_id is required");
    const docRef = materialsCollection.doc(materialData.materialId);
    const doc = await docRef.get();
    if (doc.exists) throw new Error("Material with this materialId already exists");
    
    materialData.tenant_id = tenant_id;
    await docRef.set(materialData);
    return materialData;
};

exports.getMaterials = async (tenant_id) => {
    let query = materialsCollection;
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    results.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
    return results;
};

// ─── Material Received ────────────────────────────────────────────────────────

exports.recordMaterialReceived = async (receivedData, tenant_id) => {
    const normalizedId = receivedData.materialId ? receivedData.materialId.trim().toUpperCase() : null;
    const normalizedName = receivedData.materialName ? receivedData.materialName.trim().toUpperCase() : null;

    if (!receivedData.projectNo || !normalizedId) throw new Error("projectNo and materialId are required");
    if (!normalizedName) throw new Error("materialName is required");
    if (!tenant_id) throw new Error("tenant_id is required");

    // Ensure material exists in master list
    const matRef = materialsCollection.doc(normalizedId);
    const matDoc = await matRef.get();
    if (!matDoc.exists) {
        await matRef.set({
            materialId: normalizedId,
            materialName: normalizedName,
            isDefault: false,
            createdAt: new Date().toISOString()
        });
    }

    // Stock consistency check
    const stockId = `${receivedData.projectNo}_${normalizedId}`;
    const stockRef = stockCollection.doc(stockId);
    const stockDoc = await stockRef.get();

    if (stockDoc.exists) {
        const existingName = stockDoc.data().materialName;
        if (existingName.toUpperCase() !== normalizedName) {
            throw new Error(`Material ID '${normalizedId}' already registered as '${existingName}'.`);
        }
    }

    const receiptDate = getFormattedDate(receivedData.date);
    const quantity = Number(receivedData.quantity) || 0;
    const rate = Number(receivedData.rate) || 0;
    const paidAmount = Number(receivedData.paidAmount) || 0;
    const totalAmount = quantity * rate;

    const finalData = {
        ...receivedData,
        materialId: normalizedId,
        materialName: normalizedName,
        date: receiptDate,
        quantity,
        rate,
        totalAmount,
        paidAmount,
        dueAmount: Math.max(0, totalAmount - paidAmount),
        method: (receivedData.method || "cash").toLowerCase(),
        bankId: receivedData.bankId || null,
        bankName: null,
        bankTransactionId: null,
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await materialReceivedCollection.add(finalData);
    const receiptId = docRef.id;

    // Stock update (EXISTING — unchanged)
    if (stockDoc.exists) {
        const s = stockDoc.data();
        await stockRef.update({
            receivedQuantity: (Number(s.receivedQuantity) || 0) + quantity,
            stock: (Number(s.stock) || 0) + quantity,
            updatedAt: receiptDate
        });
    } else {
        await stockRef.set({
            projectNo: finalData.projectNo,
            materialId: normalizedId,
            materialName: normalizedName,
            receivedQuantity: quantity,
            usedQuantity: 0,
            stock: quantity,
            createdAt: receiptDate,
            tenant_id
        });
    }

    // 🏦 BANK DEBIT: If paid via bank, deduct and record transaction
    if (finalData.method === "bank" && finalData.bankId && paidAmount > 0) {
        const result = await handleBankTransaction({
            bankId: finalData.bankId,
            amount: paidAmount,
            type: "DEBIT",
            remark: `Material Purchase: ${normalizedName} - ${receiptId}`,
            transactionType: "MATERIAL_PAYMENT",
            relatedId: receiptId
        });
        // Update the receipt with bank details
        await docRef.update({
            bankName: result.bankName,
            bankTransactionId: result.transactionId
        });
        finalData.bankName = result.bankName;
        finalData.bankTransactionId = result.transactionId;
    }

    // Expense tracking (EXISTING — unchanged)
    if (paidAmount > 0) {
        await _createMaterialExpense(receiptId, finalData, paidAmount);
    }

    return { receiptId, ...finalData };
};

exports.getMaterialReceived = async (projectNo, tenant_id) => {
    let query = materialReceivedCollection;
    if (projectNo) query = query.where("projectNo", "==", projectNo);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    
    // Fetch first, then sort in memory to avoid needing a Firestore composite index
    const snapshot = await query.get();
    let data = snapshot.docs.map(doc => ({ receiptId: doc.id, ...doc.data() }));
    
    data.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
    return data;
};

exports.getMaterialReceivedByMaterialId = async (materialId, tenant_id) => {
    let query = materialReceivedCollection.where("materialId", "==", materialId);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    if (snapshot.empty) throw new Error(`No received records found for material ID '${materialId}'`);
    return snapshot.docs.map(doc => ({ receiptId: doc.id, ...doc.data() }));
};

exports.updateReceiptPayment = async (receiptId, paymentData, tenant_id) => {
    const docRef = materialReceivedCollection.doc(receiptId);
    const doc = await docRef.get();

    if (!doc.exists) throw new Error("Material received record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const existingData = doc.data();

    const totalAmount = Number(existingData.totalAmount) || 0;
    const oldPaidAmount = Number(existingData.paidAmount) || 0;
    const newPaidAmount = Number(paymentData.paidAmount) || 0;

    const newMethod = (paymentData.method || "cash").toLowerCase();
    const oldMethod = (existingData.method || "cash").toLowerCase();
    const newBankId = paymentData.bankId || null;
    const oldBankId = existingData.bankId || null;

    if (newPaidAmount > totalAmount) {
        throw new Error(`Paid amount (${newPaidAmount}) cannot exceed total amount (${totalAmount})`);
    }

    // ─────────────────────────────
    // 🏦 BANK LOGIC — handles all 4 method transitions
    // ─────────────────────────────
    let bankName = null;
    let bankTransactionId = null;

    const diffAmount = newPaidAmount - oldPaidAmount;

    // CASE 1: bank → bank (same method, amount changed)
    if (oldMethod === "bank" && newMethod === "bank") {
        const bankId = newBankId || oldBankId;
        if (!bankId) throw new Error("bankId is required");

        if (diffAmount !== 0) {
            const result = await handleBankTransaction({
                bankId,
                amount: Math.abs(diffAmount),
                type: diffAmount > 0 ? "DEBIT" : "CREDIT",
                remark: diffAmount > 0
                    ? `Material Payment - ${receiptId}`
                    : `Material Payment Refund - ${receiptId}`,
                transactionType: diffAmount > 0 ? "MATERIAL_PAYMENT" : "MATERIAL_PAYMENT_REFUND",
                relatedId: receiptId
            });
            bankTransactionId = result.transactionId;
            bankName = result.bankName;
        } else {
            bankName = existingData.bankName || null;
            bankTransactionId = existingData.bankTransactionId || null;
        }
    }

    // CASE 2: cash → bank (switch method — debit full new amount)
    if (oldMethod === "cash" && newMethod === "bank") {
        if (!newBankId) throw new Error("bankId is required when switching to bank");

        if (newPaidAmount > 0) {
            const result = await handleBankTransaction({
                bankId: newBankId,
                amount: newPaidAmount,
                type: "DEBIT",
                remark: `Material Payment (switched to Bank) - ${receiptId}`,
                transactionType: "MATERIAL_PAYMENT",
                relatedId: receiptId
            });
            bankTransactionId = result.transactionId;
            bankName = result.bankName;
        }
    }

    // CASE 3: bank → cash (switch method — credit back old amount)
    if (oldMethod === "bank" && newMethod === "cash" && oldBankId) {
        if (oldPaidAmount > 0) {
            await handleBankTransaction({
                bankId: oldBankId,
                amount: oldPaidAmount,
                type: "CREDIT",
                remark: `Material Payment Reversed (switched to Cash) - ${receiptId}`,
                transactionType: "MATERIAL_PAYMENT_REVERSED",
                relatedId: receiptId
            });
        }
        bankTransactionId = null;
        bankName = null;
    }

    // CASE 4: cash → cash — no bank action needed

    // ─────────────────────────────
    // 💾 EXISTING LOGIC (UNCHANGED)
    // ─────────────────────────────
    const dueAmount = Math.max(0, totalAmount - newPaidAmount);

    await docRef.update({
        paidAmount: newPaidAmount,
        dueAmount,
        updatedAt: new Date().toISOString(),

        // ✅ Payment method fields
        method: newMethod,
        bankId: newMethod === "bank" ? (newBankId || oldBankId || null) : null,
        bankName: newMethod === "bank" ? bankName : null,
        bankTransactionId: newMethod === "bank" ? bankTransactionId : null,
    });

    // 🔁 EXISTING EXPENSE UPDATE (KEEP SAME)
    if (newPaidAmount !== oldPaidAmount) {
        await _updateMaterialExpense(receiptId, newPaidAmount);
    }

    const updatedDoc = await docRef.get();

    return {
        receiptId: updatedDoc.id,
        ...updatedDoc.data()
    };
};

async function handleBankTransaction({
    bankId,
    amount,
    type, // "DEBIT" or "CREDIT"
    remark,
    transactionType,
    relatedId
}) {
    const bankDoc = await banksCollection.doc(bankId).get();
    if (!bankDoc.exists) throw new Error("Bank not found");

    const bank = bankDoc.data();
    const currentBalance = Number(bank.currentBalance || 0);

    let newBalance;

    if (type === "DEBIT") {
        if (currentBalance < amount) {
            throw new Error("Insufficient bank balance");
        }
        newBalance = currentBalance - amount;
    } else {
        newBalance = currentBalance + amount;
    }

    // update bank
    await banksCollection.doc(bankId).update({
        currentBalance: newBalance,
        closingBalance: newBalance,
        updatedAt: new Date().toISOString()
    });

    // create transaction
    const txnRef = await banksCollection
        .doc(bankId)
        .collection("transactions")
        .add({
            type,
            amount,
            remark,
            transactionType,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString(),
            relatedId
        });

    return {
        bankName: bank.accountName || null,
        transactionId: txnRef.id
    };
}   

exports.updateMaterialReceived = async (receiptId, updateData, tenant_id) => {
    const docRef = materialReceivedCollection.doc(receiptId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Material received record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const oldData = doc.data();
    const oldQty = Number(oldData.quantity) || 0;
    const oldRate = Number(oldData.rate) || 0;
    const oldTotalAmount = oldQty * oldRate;
    const oldPaidAmount = Number(oldData.paidAmount) || 0;

    const newQty = updateData.quantity !== undefined ? Number(updateData.quantity) : oldQty;
    const newRate = updateData.rate !== undefined ? Number(updateData.rate) : oldRate;
    const newTotalAmount = newQty * newRate;
    const newPaidAmount = updateData.paidAmount !== undefined ? Number(updateData.paidAmount) : oldPaidAmount;

    if (newPaidAmount > newTotalAmount) {
        throw new Error(`Paid amount (${newPaidAmount}) cannot exceed total amount (${newTotalAmount})`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 🏦 BANK PAYMENT LOGIC (added — mirrors updateReceiptPayment pattern)
    // ─────────────────────────────────────────────────────────────────────
    const newMethod = updateData.method ? updateData.method.toLowerCase() : (oldData.method || "cash");
    const oldMethod = (oldData.method || "cash").toLowerCase();
    const newBankId = updateData.bankId || oldData.bankId || null;
    const oldBankId = oldData.bankId || null;
    const paidDiff = newPaidAmount - oldPaidAmount;

    let bankTransactionId = oldData.bankTransactionId || null;
    let bankName = oldData.bankName || null;

    // CASE A: Was BANK, staying BANK — handle amount difference
    if (oldMethod === "bank" && newMethod === "bank" && oldBankId && paidDiff !== 0) {
        const bankId = newBankId || oldBankId;
        const result = await handleBankTransaction({
            bankId,
            amount: Math.abs(paidDiff),
            type: paidDiff > 0 ? "DEBIT" : "CREDIT",
            remark: paidDiff > 0
                ? `Material Payment Increase - ${receiptId}`
                : `Material Payment Decrease - ${receiptId}`,
            transactionType: paidDiff > 0 ? "MATERIAL_PAYMENT" : "MATERIAL_PAYMENT_REFUND",
            relatedId: receiptId
        });
        bankTransactionId = result.transactionId;
        bankName = result.bankName;
    }

    // CASE B: Was CASH, switching to BANK — debit the full new paid amount
    if (oldMethod === "cash" && newMethod === "bank" && newBankId) {
        if (newPaidAmount > 0) {
            const result = await handleBankTransaction({
                bankId: newBankId,
                amount: newPaidAmount,
                type: "DEBIT",
                remark: `Material Payment (switched to Bank) - ${receiptId}`,
                transactionType: "MATERIAL_PAYMENT",
                relatedId: receiptId
            });
            bankTransactionId = result.transactionId;
            bankName = result.bankName;
        }
    }

    // CASE C: Was BANK, switching to CASH — credit back the old paid amount
    if (oldMethod === "bank" && newMethod === "cash" && oldBankId) {
        if (oldPaidAmount > 0) {
            await handleBankTransaction({
                bankId: oldBankId,
                amount: oldPaidAmount,
                type: "CREDIT",
                remark: `Material Payment Reversed (switched to Cash) - ${receiptId}`,
                transactionType: "MATERIAL_PAYMENT_REVERSED",
                relatedId: receiptId
            });
        }
        bankTransactionId = null;
        bankName = null;
    }

    const updatedRecord = {
        ...updateData,
        quantity: newQty,
        rate: newRate,
        totalAmount: newTotalAmount,
        paidAmount: newPaidAmount,
        dueAmount: Math.max(0, newTotalAmount - newPaidAmount),
        method: newMethod,
        bankId: newMethod === "bank" ? (newBankId || null) : null,
        bankName: newMethod === "bank" ? bankName : null,
        bankTransactionId: newMethod === "bank" ? bankTransactionId : null,
        updatedAt: new Date().toISOString(),
    };

    // Stock diff-based update (EXISTING — unchanged)
    const qtyDiff = newQty - oldQty;
    if (qtyDiff !== 0) {
        const stockId = `${oldData.projectNo}_${oldData.materialId}`;
        const stockRef = stockCollection.doc(stockId);
        const stockDoc = await stockRef.get();
        if (stockDoc.exists) {
            const s = stockDoc.data();
            await stockRef.update({
                receivedQuantity: Math.max(0, (Number(s.receivedQuantity) || 0) + qtyDiff),
                stock: Math.max(0, (Number(s.stock) || 0) + qtyDiff),
                updatedAt: new Date().toISOString(),
            });
        }
    }

    // Strip undefined before Firestore update
    const cleanRecord = Object.fromEntries(
        Object.entries(updatedRecord).filter(([_, v]) => v !== undefined)
    );
    await docRef.update(cleanRecord);

    // Expense update (EXISTING — unchanged)
    if (newPaidAmount !== oldPaidAmount) {
        await _updateMaterialExpense(receiptId, newPaidAmount);
    }

    const updatedDoc = await docRef.get();
    return { receiptId: updatedDoc.id, ...updatedDoc.data() };
};

exports.deleteMaterialReceived = async (receiptId, tenant_id) => {
    const docRef = materialReceivedCollection.doc(receiptId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Receipt not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const data = doc.data();
    const quantity = Number(data.quantity) || 0;
    const stockId = `${data.projectNo}_${data.materialId}`;
    const stockRef = stockCollection.doc(stockId);
    const stockDoc = await stockRef.get();

    if (stockDoc.exists && quantity > 0) {
        const s = stockDoc.data();
        await stockRef.update({
            receivedQuantity: Math.max(0, (s.receivedQuantity || 0) - quantity),
            stock: Math.max(0, (s.stock || 0) - quantity),
        });
    }

    // 🏦 BANK REVERSAL: If this receipt was paid via bank, credit back
    const paidAmount = Number(data.paidAmount) || 0;
    const method = (data.method || "cash").toLowerCase();
    if (method === "bank" && data.bankId && paidAmount > 0) {
        await handleBankTransaction({
            bankId: data.bankId,
            amount: paidAmount,
            type: "CREDIT",
            remark: `Material Receipt Deleted - ${receiptId}`,
            transactionType: "MATERIAL_PAYMENT_REVERSED",
            relatedId: receiptId
        });
    }

    await _deleteMaterialExpense(receiptId);
    await docRef.delete();
    return { message: "Material receipt deleted and stock/expense/bank restored", receiptId };
};

// ─── Material Used ────────────────────────────────────────────────────────────

// ✅ FIX 1+2: Only ONE definition, receiptDate replaced with usedDate
exports.recordMaterialUsed = async (usedData, tenant_id) => {
    const normalizedId = usedData.materialId ? usedData.materialId.trim().toUpperCase() : null;

    if (!usedData.projectNo || !normalizedId)
        throw new Error("projectNo and materialId are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const qtyUsed = Number(usedData.quantityUsed) || 0;
    const stockId = `${usedData.projectNo}_${normalizedId}`;
    const stockRef = stockCollection.doc(stockId);
    const stockDoc = await stockRef.get();

    if (!stockDoc.exists)
        throw new Error(`Material '${normalizedId}' not found in stock. Please receive it first.`);

    const currentStock = stockDoc.data();
    const availableStock = Number(currentStock.stock) || 0;

    if (qtyUsed > availableStock) {
        throw new Error(
            `Stock is ${availableStock}, you cannot use ${qtyUsed}. ` +
            `Please add material received first.`
        );
    }

    // ✅ usedDate defined locally — no dependency on outer scope
    const usedDate = getFormattedDate(usedData.date);

    const finalUsedData = {
        ...usedData,
        materialId: normalizedId,
        materialName: currentStock.materialName,
        quantityUsed: qtyUsed,
        createdAt: usedDate,
        tenant_id
    };

    const docRef = await materialUsedCollection.add(finalUsedData);

    await stockRef.update({
        usedQuantity: (Number(currentStock.usedQuantity) || 0) + qtyUsed,
        stock: availableStock - qtyUsed,
        updatedAt: usedDate,
    });

    return { usageId: docRef.id, ...finalUsedData };
};

exports.deleteMaterialUsed = async (usageId, tenant_id) => {
    const docRef = materialUsedCollection.doc(usageId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Material used record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const data = doc.data();
    const qtyUsed = Number(data.quantityUsed) || 0;
    const stockId = `${data.projectNo}_${data.materialId}`;
    const stockRef = stockCollection.doc(stockId);
    const stockDoc = await stockRef.get();

    if (stockDoc.exists && qtyUsed > 0) {
        const s = stockDoc.data();
        await stockRef.update({
            usedQuantity: Math.max(0, (Number(s.usedQuantity) || 0) - qtyUsed),
            stock: (Number(s.stock) || 0) + qtyUsed,
        });
    }

    await docRef.delete();
    return { message: "Material used record deleted and stock restored", usageId };
};

exports.updateMaterialUsed = async (usageId, updateData, tenant_id) => {
    const docRef = materialUsedCollection.doc(usageId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Material used record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const existingData = doc.data();
    const oldQtyUsed = Number(existingData.quantityUsed) || 0;
    const newQtyUsed = Number(updateData.quantityUsed) || oldQtyUsed;

    const stockId = `${existingData.projectNo}_${existingData.materialId}`;
    const stockRef = stockCollection.doc(stockId);
    const stockDoc = await stockRef.get();

    if (!stockDoc.exists) {
        throw new Error("Stock record not found");
    }

    const currentStock = stockDoc.data();
    const availableStock = Number(currentStock.stock) || 0;
    const qtyDiff = newQtyUsed - oldQtyUsed;

    if (qtyDiff > availableStock) {
        throw new Error(
            `Stock is ${availableStock}, you cannot use additional ${qtyDiff}.`
        );
    }

    await docRef.update({
        quantityUsed: newQtyUsed,
        updatedAt: new Date().toISOString(),
    });

    if (qtyDiff !== 0) {
        await stockRef.update({
            usedQuantity: Math.max(0, (Number(currentStock.usedQuantity) || 0) + qtyDiff),
            stock: Math.max(0, availableStock - qtyDiff),
            updatedAt: new Date().toISOString(),
        });
    }

    const updatedDoc = await docRef.get();
    return { usageId: updatedDoc.id, ...updatedDoc.data() };
};

// ─── Material Stock ───────────────────────────────────────────────────────────

exports.getMaterialStock = async (projectNo, tenant_id) => {
    let query = stockCollection;
    if (projectNo) {
        query = query.where("projectNo", "==", projectNo);
    }
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snap = await query.get();
    const results = snap.docs.map(doc => doc.data());
    results.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
    return results;
};

// ─── Material Required ────────────────────────────────────────────────────────

exports.addMaterialRequired = async (data, tenant_id) => {
    if (!data.projectNo || !data.materialId) throw new Error("projectNo and materialId are required");
    if (!data.materialName) throw new Error("materialName is required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const qty = Number(data.requiredQuantity) || 0;
    if (qty <= 0) throw new Error("requiredQuantity must be a positive number");

    const existingSnap = await materialRequiredCollection
        .where("projectNo", "==", data.projectNo)
        .where("materialId", "==", data.materialId)
        .get();

    let requiredDocId, newRequiredQuantity;

    if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        const currentQty = Number(existingDoc.data().requiredQuantity) || 0;
        newRequiredQuantity = currentQty + qty;
        await existingDoc.ref.update({
            requiredQuantity: newRequiredQuantity,
            updatedAt: new Date().toISOString(),
        });
        requiredDocId = existingDoc.id;
    } else {
        newRequiredQuantity = qty;
        data.createdAt = new Date().toISOString();
        data.requiredQuantity = qty;
        data.tenant_id = tenant_id;
        const docRef = await materialRequiredCollection.add(data);
        requiredDocId = docRef.id;
    }

    return {
        id: requiredDocId,
        projectNo: data.projectNo,
        materialId: data.materialId,
        materialName: data.materialName,
        requiredQuantity: newRequiredQuantity,
    };
};

exports.getAllMaterialRequired = async (tenant_id) => {
    let query = materialRequiredCollection;
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get all material required entries for a project
 * GET /api/materials/required?projectNo=VVP010
 */
exports.getMaterialRequired = async (projectNo, tenant_id) => {
    if (!projectNo) {
        throw new Error("projectNo is required");
    }

    let query = materialRequiredCollection.where("projectNo", "==", projectNo);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }

    // Fetch first, then sort in memory to avoid needing a Firestore composite index
    const snapshot = await query.get();

    if (snapshot.empty) {
        return [];
    }

    let data = snapshot.docs.map(doc => ({
        id: doc.id,
        requiredId: doc.id,  // ← Also include as requiredId for consistency
        ...doc.data()
    }));
    
    data.sort((a, b) => (a.materialName || "").localeCompare(b.materialName || ""));
    return data;
};

// ═════════════════════════════════════════════════════════════════════════════
// ──── MATERIAL ADVANCE PAYMENT (WITH BANK INTEGRATION) ────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Create a material advance payment
 * If paymentMethod === "CASH": Only save to materialAdvances collection
 * If paymentMethod === "BANK": 
 *   - DEDUCT from bank balance (opposite of advance which adds)
 *   - Create transaction in banks/{bankId}/transactions subcollection
 *   - Save to materialAdvances collection
 */
exports.createMaterialAdvance = async (advanceData, tenant_id) => {
    if (!advanceData.projectNo) {
        throw new Error("projectNo is required");
    }
    if (!tenant_id) throw new Error("tenant_id is required");
    
    if (!advanceData.amountAdvance) {
        throw new Error("amountAdvance is required");
    }

    if (!advanceData.paymentMethod) {
        throw new Error("paymentMethod is required (CASH or BANK)");
    }

    // Validate paymentMethod
    const validMethods = ["CASH", "BANK"];
    if (!validMethods.includes(advanceData.paymentMethod)) {
        throw new Error(`paymentMethod must be one of: ${validMethods.join(", ")}`);
    }

    // Default values
    advanceData.createdAt = new Date().toISOString();
    advanceData.amountAdvance = Number(advanceData.amountAdvance) || 0;

    // If BANK payment, validate bankId is provided
    if (advanceData.paymentMethod === "BANK" && !advanceData.bankId) {
        throw new Error("bankId is required for BANK payment method");
    }

    // Recalculate pastAdvance from DB (sum of all previous material advances for this project)
    const snapshot = await materialAdvancesCollection
        .where("projectNo", "==", advanceData.projectNo)
        .get();
    let totalPrevious = 0;
    snapshot.forEach(doc => {
        totalPrevious += (Number(doc.data().amountAdvance) || 0);
    });
    advanceData.pastAdvance = totalPrevious;

    // If BANK payment: DEDUCT from bank balance AND create transaction
    if (advanceData.paymentMethod === "BANK") {
        const bankDoc = await banksCollection.doc(advanceData.bankId).get();
        if (!bankDoc.exists) {
            throw new Error(`Bank account with ID ${advanceData.bankId} not found`);
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);
        const newBalance = currentBalance - advanceData.amountAdvance; // DEDUCT for material advance

        if (newBalance < 0) {
            throw new Error(`Insufficient bank balance. Current: ${currentBalance}, Required: ${advanceData.amountAdvance}`);
        }

        // 1. Update bank balance (DEDUCT)
        await banksCollection.doc(advanceData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // 2. Create transaction in subcollection: banks/{bankId}/transactions
        const transactionData = {
            type: "DEBIT", // DEBIT for advance paid out
            amount: advanceData.amountAdvance,
            projectNo: advanceData.projectNo,
            remark: advanceData.remark || "Material advance payment",
            date: advanceData.date || new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "MATERIAL_ADVANCE_PAID",
            createdAt: new Date().toISOString(),
            relatedMaterialAdvanceId: null // Will be set after advance is created
        };

        const transactionRef = await banksCollection
            .doc(advanceData.bankId)
            .collection("transactions")
            .add(transactionData);

        // Store transaction ID and bank name in advance record
        advanceData.bankName = bankData.accountName || "Unknown Bank";
        advanceData.bankTransactionId = transactionRef.id;
    }

    // 3. Save advance record to materialAdvances collection
    advanceData.tenant_id = tenant_id;
    const docRef = await materialAdvancesCollection.add(advanceData);

    // 4. If BANK payment, update transaction with advance ID reference
    if (advanceData.paymentMethod === "BANK" && advanceData.bankTransactionId) {
        await banksCollection
            .doc(advanceData.bankId)
            .collection("transactions")
            .doc(advanceData.bankTransactionId)
            .update({
                relatedMaterialAdvanceId: docRef.id
            });
    }

    return { materialAdvanceId: docRef.id, ...advanceData };
};

/**
 * Get all material advances for a project or globally
 */
exports.getMaterialAdvances = async (projectNo, tenant_id) => {
    let query = materialAdvancesCollection;
    if (projectNo) {
        query = query.where("projectNo", "==", projectNo);
    }
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    const advances = [];
    let totalProjectAmount = 0;

    snapshot.forEach((doc) => {
        const data = doc.data();
        const amountAdvance = Number(data.amountAdvance) || 0;
        const pastAdvance = Number(data.pastAdvance) || 0;

        // Per-row overall total (cumulative)
        const rowTotal = amountAdvance + pastAdvance;

        totalProjectAmount += amountAdvance; // Sum only current to avoid double counting

        advances.push({
            materialAdvanceId: doc.id,
            ...data,
            rowTotal: rowTotal
        });
    });

    // Sort in memory: newest first (createdAt descending)
    advances.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
        advances,
        totalAdvance: totalProjectAmount
    };
};

/**
 * Update a material advance record
 * If amount or paymentMethod changes, update bank balance and transactions accordingly
 */
exports.updateMaterialAdvance = async (id, updateData, tenant_id) => {
    const docRef = materialAdvancesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Material advance record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const existingData = doc.data();

    // Clean data
    if (updateData.amountAdvance !== undefined) {
        updateData.amountAdvance = Number(updateData.amountAdvance);
    }
    delete updateData.materialAdvanceId;
    delete updateData.createdAt;
    delete updateData.bankTransactionId; // Don't allow updating this

    // CASE 1: Amount changed (for BANK payment)
    if (updateData.amountAdvance !== undefined && 
        updateData.amountAdvance !== existingData.amountAdvance &&
        existingData.paymentMethod === "BANK" &&
        existingData.bankId) {
        
        const amountDifference = updateData.amountAdvance - existingData.amountAdvance;
        
        const bankDoc = await banksCollection.doc(existingData.bankId).get();
        if (!bankDoc.exists) {
            throw new Error(`Bank account with ID ${existingData.bankId} not found`);
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);
        const newBalance = currentBalance - amountDifference; // DEDUCT for material advance

        if (newBalance < 0) {
            throw new Error(`Insufficient bank balance after adjustment. Current: ${currentBalance}, Difference: ${amountDifference}`);
        }

        // Update bank balance
        await banksCollection.doc(existingData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // Create adjustment transaction in subcollection
        const adjustmentData = {
            type: amountDifference > 0 ? "DEBIT" : "CREDIT",
            amount: Math.abs(amountDifference),
            projectNo: existingData.projectNo,
            remark: `Material advance adjustment: ${existingData.remark || "N/A"}`,
            date: new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "MATERIAL_ADVANCE_ADJUSTMENT",
            createdAt: new Date().toISOString(),
            relatedMaterialAdvanceId: id,
            originalTransactionId: existingData.bankTransactionId
        };

        await banksCollection
            .doc(existingData.bankId)
            .collection("transactions")
            .add(adjustmentData);
    }

    // CASE 2: Payment method changed from CASH to BANK
    if (updateData.paymentMethod === "BANK" && 
        existingData.paymentMethod === "CASH" &&
        updateData.bankId) {
        
        if (!updateData.bankId) {
            throw new Error("bankId is required when changing paymentMethod to BANK");
        }

        const bankDoc = await banksCollection.doc(updateData.bankId).get();
        if (!bankDoc.exists) {
            throw new Error(`Bank account with ID ${updateData.bankId} not found`);
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);
        const amount = Number(updateData.amountAdvance || existingData.amountAdvance);
        const newBalance = currentBalance - amount; // DEDUCT

        if (newBalance < 0) {
            throw new Error(`Insufficient bank balance. Current: ${currentBalance}, Required: ${amount}`);
        }

        // Update bank balance
        await banksCollection.doc(updateData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // Create transaction in new bank's subcollection
        const transactionData = {
            type: "DEBIT",
            amount: amount,
            projectNo: existingData.projectNo,
            remark: updateData.remark || existingData.remark || "Material advance payment",
            date: updateData.date || existingData.date || new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "MATERIAL_ADVANCE_PAID",
            createdAt: new Date().toISOString(),
            relatedMaterialAdvanceId: id
        };

        const transactionRef = await banksCollection
            .doc(updateData.bankId)
            .collection("transactions")
            .add(transactionData);

        updateData.bankName = bankData.accountName || "Unknown Bank";
        updateData.bankTransactionId = transactionRef.id;
    }

    // CASE 3: Payment method changed from BANK to CASH
    if (updateData.paymentMethod === "CASH" && 
        existingData.paymentMethod === "BANK" &&
        existingData.bankId) {
        
        const bankDoc = await banksCollection.doc(existingData.bankId).get();
        if (bankDoc.exists) {
            const bankData = bankDoc.data();
            const currentBalance = Number(bankData.currentBalance || 0);
            const amount = Number(existingData.amountAdvance);
            const newBalance = currentBalance + amount; // CREDIT back (reverse the debit)

            // Revert bank balance
            await banksCollection.doc(existingData.bankId).update({
                currentBalance: newBalance,
                closingBalance: newBalance,
                updatedAt: new Date().toISOString()
            });

            // Create credit transaction in subcollection (reversing the debit)
            const reverseData = {
                type: "CREDIT",
                amount: amount,
                projectNo: existingData.projectNo,
                remark: `Material advance reversed to CASH: ${existingData.remark || "N/A"}`,
                date: new Date().toISOString().split("T")[0],
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                transactionType: "MATERIAL_ADVANCE_REVERSED",
                createdAt: new Date().toISOString(),
                relatedMaterialAdvanceId: id,
                originalTransactionId: existingData.bankTransactionId
            };

            await banksCollection
                .doc(existingData.bankId)
                .collection("transactions")
                .add(reverseData);
        }

        delete updateData.bankId;
        delete updateData.bankName;
        delete updateData.bankTransactionId;
    }

    // Update advance record
    await docRef.update(updateData);
    const updatedDoc = await docRef.get();
    return { materialAdvanceId: id, ...updatedDoc.data() };
};

/**
 * Delete a material advance record
 * If paymentMethod was BANK, revert the bank balance and create reverse transaction
 */
exports.deleteMaterialAdvance = async (id, tenant_id) => {
    const docRef = materialAdvancesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Material advance record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const advanceData = doc.data();

    // If this was a BANK payment, revert the bank balance and create reverse transaction
    if (advanceData.paymentMethod === "BANK" && advanceData.bankId) {
        const bankDoc = await banksCollection.doc(advanceData.bankId).get();
        if (bankDoc.exists) {
            const bankData = bankDoc.data();
            const currentBalance = Number(bankData.currentBalance || 0);
            const amountToRevert = Number(advanceData.amountAdvance || 0);
            const newBalance = currentBalance + amountToRevert; // CREDIT back
            
            // Revert bank balance
            await banksCollection.doc(advanceData.bankId).update({
                currentBalance: newBalance,
                closingBalance: newBalance,
                updatedAt: new Date().toISOString()
            });

            // Create deletion transaction in subcollection
            const deletionData = {
                type: "CREDIT",
                amount: amountToRevert,
                projectNo: advanceData.projectNo,
                remark: `Material advance deleted: ${advanceData.remark || "N/A"}`,
                date: new Date().toISOString().split("T")[0],
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                transactionType: "MATERIAL_ADVANCE_DELETED",
                createdAt: new Date().toISOString(),
                relatedMaterialAdvanceId: id,
                originalTransactionId: advanceData.bankTransactionId
            };

            await banksCollection
                .doc(advanceData.bankId)
                .collection("transactions")
                .add(deletionData);
        }
    }

    // Delete advance record
    await docRef.delete();
    return { message: "Material advance record deleted successfully" };
};


// ═══════════════════════════════════════════════════════════════════════════════
// ADD THIS CODE TO material_service.js
// PASTE AFTER LINE 770 (after getMaterialRequired method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update a material required record
 * PUT /api/materials/required/:requiredId
 * 
 * Body: { requiredQuantity?, materialName?, remark? }
 */
exports.updateMaterialRequired = async (requiredId, updateData, tenant_id) => {
    const docRef = materialRequiredCollection.doc(requiredId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        throw new Error("Material required record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const cleanData = {};
    
    // Only update fields that are explicitly provided
    if (updateData.requiredQuantity !== undefined && updateData.requiredQuantity !== null) {
        const qty = Number(updateData.requiredQuantity);
        if (qty < 0) throw new Error("Quantity cannot be negative");
        cleanData.requiredQuantity = qty;
    }
    
    if (updateData.materialName !== undefined && updateData.materialName !== null && updateData.materialName !== "") {
        cleanData.materialName = updateData.materialName;
    }
    
    if (updateData.remark !== undefined && updateData.remark !== null && updateData.remark !== "") {
        cleanData.remark = updateData.remark;
    }

    if (Object.keys(cleanData).length === 0) {
        throw new Error("No valid fields to update. Send at least one of: requiredQuantity, materialName, remark");
    }

    cleanData.updatedAt = new Date().toISOString();

    await docRef.update(cleanData);
    const updatedDoc = await docRef.get();
    
    return { 
        id: requiredId, 
        ...updatedDoc.data()
    };
};

/**
 * Delete a material required record
 * DELETE /api/materials/required/:requiredId
 */
exports.deleteMaterialRequired = async (requiredId, tenant_id) => {
    const docRef = materialRequiredCollection.doc(requiredId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        throw new Error("Material required record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const data = doc.data();

    await docRef.delete();
    
    return { 
        message: "Material required record deleted successfully",
        deletedRecord: {
            id: requiredId,
            projectNo: data.projectNo,
            materialName: data.materialName,
            requiredQuantity: data.requiredQuantity
        }
    };
};
/**
 * Get bank transaction history for a specific bank (used by advance service)
 */
exports.getBankTransactionHistoryForMaterialAdvance = async (bankId, tenant_id) => {
    try {
        let query = banksCollection.doc(bankId).collection("transactions");
        // We cannot filter easily here if transactions don't store tenant_id 
        // But the bankId itself is scoped. We can just verify the bank belongs to the tenant.
        const bankDoc = await banksCollection.doc(bankId).get();
        if (bankDoc.exists && tenant_id && tenant_id !== 'GLOBAL' && bankDoc.data().tenant_id !== tenant_id) {
            throw new Error("Unauthorized");
        }

        const snapshot = await query
            .orderBy("createdAt", "desc")
            .get();

        const transactions = [];
        let totalCredit = 0;
        let totalDebit = 0;

        snapshot.forEach((doc) => {
            const data = doc.data();
            const amount = Number(data.amount || 0);

            if (data.type === "CREDIT") {
                totalCredit += amount;
            } else {
                totalDebit += amount;
            }

            transactions.push({
                transactionId: doc.id,
                ...data
            });
        });

        return {
            transactions,
            summary: {
                totalCredit,
                totalDebit,
                netChange: totalCredit - totalDebit
            }
        };
    } catch (error) {
        throw new Error(`Failed to fetch bank transactions: ${error.message}`);
    }
};

module.exports = exports;