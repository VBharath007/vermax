// src/modules/advance/advance.service.js

const { db } = require("../../config/firebase");

const advancesCollection = db.collection("advances");
const banksCollection = db.collection("banks");

/**
 * Create an advance payment
 * If paymentMethod === "CASH": Only save to advances collection
 * If paymentMethod === "BANK": 
 *   - Update bank balance
 *   - Create transaction in banks/{bankId}/transactions subcollection
 *   - Save to advances collection
 */
exports.createAdvance = async (advanceData, tenant_id) => {
    if (!advanceData.projectNo) {
        throw new Error("projectNo is required");
    }
    if (!tenant_id) throw new Error("tenant_id is required");
    
    if (!advanceData.amountReceived) {
        throw new Error("amountReceived is required");
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
    advanceData.amountReceived = Number(advanceData.amountReceived) || 0;

    // If BANK payment, validate bankId is provided
    if (advanceData.paymentMethod === "BANK" && !advanceData.bankId) {
        throw new Error("bankId is required for BANK payment method");
    }

    // Recalculate pastAdvance from DB (sum of all previous advances for this project)
    const snapshot = await advancesCollection
        .where("projectNo", "==", advanceData.projectNo)
        .get();
    let totalPrevious = 0;
    snapshot.forEach(doc => {
        totalPrevious += (Number(doc.data().amountReceived) || 0);
    });
    advanceData.pastAdvance = totalPrevious;

    // If BANK payment: Update bank balance AND create transaction
    if (advanceData.paymentMethod === "BANK") {
        const bankDoc = await banksCollection.doc(advanceData.bankId).get();
        if (!bankDoc.exists) {
            throw new Error(`Bank account with ID ${advanceData.bankId} not found`);
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);
        const newBalance = currentBalance + advanceData.amountReceived;

        // 1. Update bank balance
        await banksCollection.doc(advanceData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // 2. Create transaction in subcollection: banks/{bankId}/transactions
        const transactionData = {
            type: "CREDIT", // CREDIT for advance received
            amount: advanceData.amountReceived,
            projectNo: advanceData.projectNo,
            remark: advanceData.remark || "Advance payment",
            date: advanceData.date || new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "ADVANCE_RECEIVED",
            createdAt: new Date().toISOString(),
            relatedAdvanceId: null // Will be set after advance is created
        };

        const transactionRef = await banksCollection
            .doc(advanceData.bankId)
            .collection("transactions")
            .add(transactionData);

        // Store transaction ID and bank name in advance record
        advanceData.bankName = bankData.accountName || "Unknown Bank";
        advanceData.bankTransactionId = transactionRef.id;
    }

    // 3. Save advance record to main advances collection
    advanceData.tenant_id = tenant_id;
    const docRef = await advancesCollection.add(advanceData);

    // 4. If BANK payment, update transaction with advance ID reference
    if (advanceData.paymentMethod === "BANK" && advanceData.bankTransactionId) {
        await banksCollection
            .doc(advanceData.bankId)
            .collection("transactions")
            .doc(advanceData.bankTransactionId)
            .update({
                relatedAdvanceId: docRef.id
            });
    }

    return { advanceId: docRef.id, ...advanceData };
};

/**
 * Get all advances for a project or globally
 */
exports.getAdvances = async (projectNo, tenant_id) => {
    let query = advancesCollection;
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
        const amountReceived = Number(data.amountReceived) || 0;
        const pastAdvance = Number(data.pastAdvance) || 0;

        // Per-row overall total (cumulative)
        const rowTotal = amountReceived + pastAdvance;

        totalProjectAmount += amountReceived; // Sum only current to avoid double counting

        advances.push({
            advanceId: doc.id,
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
 * Update an advance record
 * If amount or paymentMethod changes, update bank balance and transactions accordingly
 */
exports.updateAdvance = async (id, updateData, tenant_id) => {
    const docRef = advancesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Advance record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const existingData = doc.data();

    // Clean data
    if (updateData.amountReceived !== undefined) {
        updateData.amountReceived = Number(updateData.amountReceived);
    }
    delete updateData.advanceId;
    delete updateData.createdAt;
    delete updateData.bankTransactionId; // Don't allow updating this

    // CASE 1: Amount changed (for BANK payment)
    if (updateData.amountReceived !== undefined && 
        updateData.amountReceived !== existingData.amountReceived &&
        existingData.paymentMethod === "BANK" &&
        existingData.bankId) {
        
        const amountDifference = updateData.amountReceived - existingData.amountReceived;
        
        const bankDoc = await banksCollection.doc(existingData.bankId).get();
        if (!bankDoc.exists) {
            throw new Error(`Bank account with ID ${existingData.bankId} not found`);
        }

        const bankData = bankDoc.data();
        const currentBalance = Number(bankData.currentBalance || 0);
        const newBalance = currentBalance + amountDifference;

        // Update bank balance
        await banksCollection.doc(existingData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // Create adjustment transaction in subcollection
        const adjustmentData = {
            type: amountDifference > 0 ? "CREDIT" : "DEBIT",
            amount: Math.abs(amountDifference),
            projectNo: existingData.projectNo,
            remark: `Advance adjustment: ${existingData.remark || "N/A"}`,
            date: new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance - amountDifference,
            balanceAfter: newBalance,
            transactionType: "ADVANCE_ADJUSTMENT",
            createdAt: new Date().toISOString(),
            relatedAdvanceId: id,
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
        const amount = Number(updateData.amountReceived || existingData.amountReceived);
        const newBalance = currentBalance + amount;

        // Update bank balance
        await banksCollection.doc(updateData.bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // Create transaction in new bank's subcollection
        const transactionData = {
            type: "CREDIT",
            amount: amount,
            projectNo: existingData.projectNo,
            remark: updateData.remark || existingData.remark || "Advance payment",
            date: updateData.date || existingData.date || new Date().toISOString().split("T")[0],
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            transactionType: "ADVANCE_RECEIVED",
            createdAt: new Date().toISOString(),
            relatedAdvanceId: id
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
            const amount = Number(existingData.amountReceived);
            const newBalance = Math.max(0, currentBalance - amount);

            // Revert bank balance
            await banksCollection.doc(existingData.bankId).update({
                currentBalance: newBalance,
                closingBalance: newBalance,
                updatedAt: new Date().toISOString()
            });

            // Create debit transaction in subcollection
            const reverseData = {
                type: "DEBIT",
                amount: amount,
                projectNo: existingData.projectNo,
                remark: `Advance reversed to CASH: ${existingData.remark || "N/A"}`,
                date: new Date().toISOString().split("T")[0],
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                transactionType: "ADVANCE_REVERSED",
                createdAt: new Date().toISOString(),
                relatedAdvanceId: id,
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
    return { advanceId: id, ...updatedDoc.data() };
};

/**
 * Delete an advance record
 * If paymentMethod was BANK, revert the bank balance and create reverse transaction
 */
exports.deleteAdvance = async (id, tenant_id) => {
    const docRef = advancesCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new Error("Advance record not found");
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const advanceData = doc.data();

    // If this was a BANK payment, revert the bank balance and create reverse transaction
    if (advanceData.paymentMethod === "BANK" && advanceData.bankId) {
        const bankDoc = await banksCollection.doc(advanceData.bankId).get();
        if (bankDoc.exists) {
            const bankData = bankDoc.data();
            const currentBalance = Number(bankData.currentBalance || 0);
            const amountToRevert = Number(advanceData.amountReceived || 0);
            const newBalance = Math.max(0, currentBalance - amountToRevert);
            
            // Revert bank balance
            await banksCollection.doc(advanceData.bankId).update({
                currentBalance: newBalance,
                closingBalance: newBalance,
                updatedAt: new Date().toISOString()
            });

            // Create deletion transaction in subcollection
            const deletionData = {
                type: "DEBIT",
                amount: amountToRevert,
                projectNo: advanceData.projectNo,
                remark: `Advance deleted: ${advanceData.remark || "N/A"}`,
                date: new Date().toISOString().split("T")[0],
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                transactionType: "ADVANCE_DELETED",
                createdAt: new Date().toISOString(),
                relatedAdvanceId: id,
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
    return { message: "Advance record deleted successfully" };
};

/**
 * Get bank transaction history for a specific bank
 */
exports.getBankTransactionHistory = async (bankId, tenant_id) => {
    try {
        const bankDoc = await banksCollection.doc(bankId).get();
        if (bankDoc.exists && tenant_id && tenant_id !== 'GLOBAL' && bankDoc.data().tenant_id !== tenant_id) {
            throw new Error("Unauthorized");
        }

        const snapshot = await banksCollection
            .doc(bankId)
            .collection("transactions")
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