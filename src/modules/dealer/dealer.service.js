const { db } = require("../../config/firebase");
const dayjs = require("dayjs");

const materialReceivedCollection = db.collection("materialReceived");
const paymentsCollection = db.collection("dealerPayments");
const projectsCollection = db.collection("projects");
const siteExpensesCollection = db.collection("siteExpenses");
const banksCollection = db.collection("banks");

// ─── Date Helper ──────────────────────────────────────────────────────────────
const _formatD = (d) => {
    if (!d) return null;
    const parsed = dayjs(d);
    if (!parsed.isValid()) {
        // Handle DD-MM-YYYY or other formats manually if dayjs fails on them directly
        const parts = String(d).split("-");
        if (parts.length === 3) {
            // Already seems to be in some dash format, try to rearrange if needed or just return if it's already DD-MM-YYYY
            if (parts[2].length === 4 && parts[0].length === 2) return d; 
        }
        return d;
    }
    return parsed.format("DD-MM-YYYY");
};

// ─── Internal helper ──────────────────────────────────────────────────────────
const getPhoneVariations = (phone) => {
    if (!phone) return [];
    const digits = String(phone).replace(/\D/g, "");
    let base = digits;
    if (digits.length === 12 && digits.startsWith("91")) base = digits.substring(2);
    else if (digits.length > 10 && digits.startsWith("0")) base = digits.substring(1);
    
    return [...new Set([
        String(phone), 
        base, 
        `+91 ${base}`, 
        `+91${base}`, 
        `91${base}`
    ])].slice(0, 10);
};

// Batch-fetch projectName for every unique projectNo in a single Firestore read.
// Returns map: { "PRJ001": "Kumar Villa", "PRJ002": "Office Build" }
// Falls back to projectNo if projectName field is missing.
// ─────────────────────────────────────────────────────────────────────────────
async function _getProjectNames(projectNos) {
    const uniqueNos = [...new Set(projectNos)].filter(Boolean);
    if (uniqueNos.length === 0) return {};

    const nameMap = {};
    for (let i = 0; i < uniqueNos.length; i += 30) {
        const chunk = uniqueNos.slice(i, i + 30);
        const snap = await projectsCollection
            .where("projectNo", "in", chunk).get();
        snap.forEach(doc => {
            const d = doc.data();
            nameMap[d.projectNo] = d.projectName || d.projectNo;
        });
    }
    return nameMap;
}


// =============================================================================
// getAllDealers
//
//  DEALER LIST SCREEN (Sketch image — first screen box)
//
//  Flutter renders one tile per dealer:
//    dealerName        ← BIG primary text
//    phoneNumber       ← smaller secondary text
//    remainingAmount   ← shown below
//    status badge      ← "Pending" or "Fully Paid"
// =============================================================================
exports.getAllDealers = async (tenant_id) => {
    let query = materialReceivedCollection;
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    if (snapshot.empty) return [];

    const dealerMap = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        const phone = data.dealerContact;
        if (!phone) return;

        if (!dealerMap[phone]) {
            dealerMap[phone] = {
                dealerName: data.dealerName || "",
                phoneNumber: phone,
                projects: new Set(),
                totalAmount: 0,
                advancedPayment: 0,
                remainingAmount: 0,
                transactionCount: 0,
            };
        }

        const d = dealerMap[phone];
        const totalAmt = Number(data.totalAmount) || 0;
        const paidAmt = Number(data.paidAmount) || 0;

        d.totalAmount += totalAmt;
        d.advancedPayment += paidAmt;
        d.remainingAmount += (totalAmt - paidAmt);
        d.transactionCount += 1;
        d.projects.add(data.projectNo);

        if (!d.dealerName && data.dealerName) d.dealerName = data.dealerName;
    });

    const dealers = Object.values(dealerMap).map(d => ({
        dealerName: d.dealerName,       // PRIMARY — shown as card title
        phoneNumber: d.phoneNumber,
        projectCount: d.projects.size,
        totalAmount: d.totalAmount,
        advancedPayment: d.advancedPayment,
        remainingAmount: d.remainingAmount,
        transactionCount: d.transactionCount,
        status: d.remainingAmount <= 0 ? "Fully Paid" : "Pending",
    }));

    // ── Calculate Overall Summary ─────────────────────────────────────────────
    const overallTotal = dealers.reduce((sum, d) => sum + d.totalAmount, 0);
    const overallPaid = dealers.reduce((sum, d) => sum + d.advancedPayment, 0);
    const overallBalance = dealers.reduce((sum, d) => sum + d.remainingAmount, 0);

    return {
        dealers,
        summary: {
            totalAmount: overallTotal,
            totalPaid: overallPaid,
            totalBalance: overallBalance,
            totalDealers: dealers.length
        }
    };
};


// =============================================================================
// getDealerHistory
//
//  DEALER DETAIL SCREEN (Sketch image — second screen box)
//
//  Top section:
//    dealerName      ← heading
//    phoneNumber     ← below the name
//
//  Body — ONE CARD PER PROJECT:
//    [ Project 1 Card ]
//      projectName
//      material rows: materialName | qty | total | adv | bal
//      project subtotal row
//
//    [ Project 2 Card ]
//      projectName
//      material rows ...
//      project subtotal row
//
//  Bottom: overall summary
// =============================================================================
exports.getDealerHistory = async (phoneNumber, tenant_id) => {
    if (!phoneNumber) throw new Error("Phone number is required");

    let query = materialReceivedCollection
        .where("dealerContact", "in", getPhoneVariations(phoneNumber));
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    if (snapshot.empty) throw new Error("No dealer found with this phone number");

    let dealerName = "";
    const projectMap = {};
    const projectNos = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const totalAmt = Number(data.totalAmount) || 0;
        const paidAmt = Number(data.paidAmount) || 0;
        const remAmt = totalAmt - paidAmt;
        const projectNo = data.projectNo;

        if (!dealerName && data.dealerName) dealerName = data.dealerName;
        projectNos.push(projectNo);

        if (!projectMap[projectNo]) {
            projectMap[projectNo] = {
                projectNo,
                projectName: "",   // resolved after name lookup
                materials: [],
                projectTotalAmount: 0,
                projectPaidAmount: 0,
            };
        }

        projectMap[projectNo].materials.push({
            receiptId: doc.id,
            materialId: data.materialId,
            materialName: data.materialName,
            unit: data.unit || "",
            rate: data.rate || 0,
            quantity: data.quantity || 0,
            totalAmount: totalAmt,
            paidAmount: paidAmt,
            remainingAmount: remAmt,
            date: _formatD(data.date || data.createdAt),
            createdAt: data.createdAt,
            status: remAmt <= 0 ? "Fully Paid"
                : paidAmt > 0 ? "Partially Paid" : "Pending",
        });

        projectMap[projectNo].projectTotalAmount += totalAmt;
        projectMap[projectNo].projectPaidAmount += paidAmt;
    });

    // Single batch read for all project names
    const nameMap = await _getProjectNames(projectNos);

    const projects = Object.values(projectMap).map(p => {
        const balance = p.projectTotalAmount - p.projectPaidAmount;
        return {
            projectNo: p.projectNo,
            projectName: nameMap[p.projectNo] || p.projectNo,  // card header title
            materials: p.materials.sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            ),
            projectSummary: {
                totalAmount: p.projectTotalAmount,
                paidAmount: p.projectPaidAmount,
                remainingAmount: balance,
                status: balance <= 0 ? "Fully Paid" : "Pending",
            },
        };
    });

    const overallTotal = projects.reduce((s, p) => s + p.projectSummary.totalAmount, 0);
    const overallPaid = projects.reduce((s, p) => s + p.projectSummary.paidAmount, 0);
    const overallRemaining = projects.reduce((s, p) => s + p.projectSummary.remainingAmount, 0);

    return {
        dealerDetails: {
            dealerName,    // heading on detail screen
            phoneNumber,   // subheading
        },
        projects,          // array of project cards — Project 1, Project 2 ...
        overallSummary: {
            totalProjects: projects.length,
            totalAmount: overallTotal,
            totalPaid: overallPaid,
            totalBalance: overallRemaining,
            status: overallRemaining <= 0 ? "Fully Paid" : "Pending",
        },
    };
};


// =============================================================================
// getDealerPaymentLog  (NEW)
//
//  PAYMENT HISTORY SCREEN (Sketch image — third screen box)
//  Shows every payment logged by updateDealerPayment, latest first.
//  Includes running total and per-project outstanding balance.
// =============================================================================
exports.getDealerPaymentLog = async (phoneNumber, tenant_id) => {
    if (!phoneNumber) throw new Error("Phone number is required");

    const variations = getPhoneVariations(phoneNumber);
    let paymentQuery = paymentsCollection.where("dealerContact", "in", variations);
    let billQuery = materialReceivedCollection.where("dealerContact", "in", variations);
    
    if (tenant_id && tenant_id !== 'GLOBAL') {
        paymentQuery = paymentQuery.where("tenant_id", "==", tenant_id);
        billQuery = billQuery.where("tenant_id", "==", tenant_id);
    }

    const [paymentSnap, billSnap] = await Promise.all([
        paymentQuery.get(),
        billQuery.get(),
    ]);

    if (billSnap.empty && paymentSnap.empty) {
        throw new Error("No dealer found with this phone number");
    }

    let dealerName = "";
    let totalBilled = 0;
    const projectNos = [];

    billSnap.forEach(doc => {
        const data = doc.data();
        if (!dealerName && data.dealerName) dealerName = data.dealerName;
        totalBilled += Number(data.totalAmount) || 0;
        projectNos.push(data.projectNo);
    });

    const nameMap = await _getProjectNames(projectNos);

    // Sort payments oldest→newest for running total calculation
    const rawPayments = [];
    paymentSnap.forEach(doc => {
        const data = doc.data();
        rawPayments.push({
            paymentId: doc.id,
            amountPaid: Number(data.amountPaid) || 0,
            date: data.date,
            displayDate: data.date ? data.date.split("T")[0] : null,
            remark: data.remark || "Dealer Payment",
        });
    });
    rawPayments.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningTotal = 0;
    const paymentLog = rawPayments.map(p => {
        runningTotal += p.amountPaid;
        return {
            paymentId: p.paymentId,
            date: p.displayDate,
            amountPaid: p.amountPaid,
            totalPaidSoFar: runningTotal,
            remainingAfterThis: totalBilled - runningTotal,
            remark: p.remark,
        };
    });

    paymentLog.reverse(); // latest first for Flutter list

    // Per-project outstanding
    const projectBreakdown = {};
    billSnap.forEach(doc => {
        const data = doc.data();
        const pNo = data.projectNo;
        const totalAmt = Number(data.totalAmount) || 0;
        const paidAmt = Number(data.paidAmount) || 0;

        if (!projectBreakdown[pNo]) {
            projectBreakdown[pNo] = {
                projectNo: pNo,
                projectName: nameMap[pNo] || pNo,
                totalBilled: 0,
                totalPaid: 0,
                balance: 0,
                bills: []
            };
        }
        projectBreakdown[pNo].totalBilled += totalAmt;
        projectBreakdown[pNo].totalPaid += paidAmt;
        projectBreakdown[pNo].balance += (totalAmt - paidAmt);
        projectBreakdown[pNo].bills.push({
            id: doc.id,
            materialName: data.materialName,
            quantity: data.quantity,
            totalAmount: totalAmt,
            paidAmount: paidAmt,
            remaining: totalAmt - paidAmt,
            date: _formatD(data.date || data.createdAt)
        });
    });

    let actualGlobalPaid = 0;
    Object.values(projectBreakdown).forEach(p => {
        actualGlobalPaid += p.totalPaid;
    });

    return {
        dealerDetails: { dealerName, phoneNumber },
        projectBreakdown: Object.values(projectBreakdown),
        summary: {
            totalAmount: totalBilled,
            totalPaid: actualGlobalPaid,
            totalBalance: totalBilled - actualGlobalPaid,
        },
    };
};


// =============================================================================
// getDealerPaymentHistory  ← UNTOUCHED (your original code)
// =============================================================================
exports.getDealerPaymentHistory = async (phoneNumber, tenant_id) => {
    if (!phoneNumber) {
        throw new Error("Phone number is required");
    }

    let query = materialReceivedCollection.where("dealerContact", "in", getPhoneVariations(phoneNumber));
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    if (snapshot.empty) {
        throw new Error("No transactions found for this dealer phone number");
    }

    let dealerName = "";
    const paymentHistory = [];
    let totalBilled = 0;
    let totalPaid = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (!dealerName && data.dealerName) {
            dealerName = data.dealerName;
        }

        const totalAmt = Number(data.totalAmount) || 0;
        const paidAmt = Number(data.paidAmount) || 0;
        const balance = totalAmt - paidAmt;

        paymentHistory.push({
            receiptId: doc.id,
            projectNo: data.projectNo,
            materialId: data.materialId,
            materialName: data.materialName,
            billDate: data.createdAt,
            totalAmount: totalAmt,
            paidAmount: paidAmt,
            balance: balance,
            status: balance <= 0 ? "Fully Paid" : (paidAmt > 0 ? "Partially Paid" : "Pending")
        });

        totalBilled += totalAmt;
        totalPaid += paidAmt;
    });

    return {
        dealerDetails: { dealerName, phoneNumber },
        paymentHistory,
        summary: {
            totalBilled,
            totalPaid,
            totalBalance: totalBilled - totalPaid
        }
    };
};


// =============================================================================
// updateDealerPayment  ← UNTOUCHED (your original code)
// =============================================================================
exports.updateDealerPayment = async (phoneNumber, amountPaid, tenant_id) => {
    if (!phoneNumber || !amountPaid || amountPaid <= 0) {
        throw new Error("Valid phone number and positive amountPaid are required");
    }

    let query = materialReceivedCollection
        .where("dealerContact", "in", getPhoneVariations(phoneNumber));
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    const paymentRef = paymentsCollection.doc();
    const paymentData = {
        dealerContact: phoneNumber,
        amountPaid: Number(amountPaid),
        date: new Date().toISOString(),
        type: "Payment"
    };
    if (tenant_id && tenant_id !== 'GLOBAL') paymentData.tenant_id = tenant_id;
    await paymentRef.set(paymentData);

    const bills = [];
    snapshot.forEach(doc => bills.push({ id: doc.id, ref: doc.ref, data: doc.data() }));
    bills.sort((a, b) => new Date(a.data.createdAt || 0) - new Date(b.data.createdAt || 0));

    let remainingPaymentToApply = Number(amountPaid);
    const batch = db.batch();

    for (const bill of bills) {
        if (remainingPaymentToApply <= 0) break;
        const pendingAmt = (Number(bill.data.totalAmount) || 0) - (Number(bill.data.paidAmount) || 0);

        if (pendingAmt > 0) {
            const apply = Math.min(pendingAmt, remainingPaymentToApply);
            batch.update(bill.ref, { paidAmount: (Number(bill.data.paidAmount) || 0) + apply });
            remainingPaymentToApply -= apply;
        }
    }
    await batch.commit();

    return { message: "Payment recorded successfully" };
};


// =============================================================================
// getDealerProjectPaymentLog
//
//  Called when user TAPS a project card (e.g. "Kumar Villa") on the
//  dealer detail screen.
//
//  Shows the full bill-by-bill payment history for THIS dealer + THIS project:
//    - Every material receipt (bill) for this dealer+project
//    - Each bill's totalAmount, paidAmount, remainingAmount, status
//    - Sorted oldest → newest (so payment progress is clear)
//    - Project-level summary at the bottom
//
//  WHY NOT dealerPayments collection:
//    dealerPayments stores { dealerContact, amountPaid, date } only.
//    It has NO projectNo — payments are applied FIFO across all projects.
//    So the per-project payment truth lives in materialReceived.paidAmount.
//
//  ROUTE:  GET /api/dealers/:phoneNumber/project/:projectNo/payment-log
// =============================================================================
exports.getDealerProjectPaymentLog = async (phoneNumber, projectNo, tenant_id) => {
    if (!phoneNumber) throw new Error("Phone number is required");
    if (!projectNo) throw new Error("projectNo is required");

    // ── Helper: "2026-03-17" → "17-03-2026" ──────────────────────────────────
    const formatDate = (isoString) => {
        if (!isoString) return null;
        const d = isoString.split("T")[0]; // "2026-03-17"
        const [yyyy, mm, dd] = d.split("-");
        return `${dd}-${mm}-${yyyy}`;      // "17-03-2026"
    };

    const variations = getPhoneVariations(phoneNumber);
    
    let billQuery = materialReceivedCollection
        .where("dealerContact", "in", variations)
        .where("projectNo", "==", projectNo);
        
    let paymentQuery = paymentsCollection
        .where("dealerContact", "in", variations)
        .where("projectNo", "==", projectNo);
        
    if (tenant_id && tenant_id !== 'GLOBAL') {
        billQuery = billQuery.where("tenant_id", "==", tenant_id);
        paymentQuery = paymentQuery.where("tenant_id", "==", tenant_id);
    }

    const [billSnap, paymentSnap, projectDoc] = await Promise.all([
        billQuery.get(),
        paymentQuery.get(),
        projectsCollection.doc(projectNo).get(),
    ]);


    console.log("Input Phone:", phoneNumber);
    console.log("Input Project:", projectNo);
    console.log("Bills found:", billSnap.size);
    console.log("Payments found:", paymentSnap.size);

    if (billSnap.empty) {
        // Let's see one document from the collection to check field names
        const sample = await materialReceivedCollection.limit(1).get();
        if (!sample.empty) {
            console.log("Schema Hint: Document fields are:", Object.keys(sample.docs[0].data()));
        }
    }

    // Resolve names
    let dealerName = "";
    const projectName = projectDoc.exists
        ? (projectDoc.data().projectName || projectNo)
        : projectNo;

    // ── Build bill list ───────────────────────────────────────────────────────
    const bills = [];
    let totalBilled = 0;
    let totalPaid = 0;

    billSnap.forEach(doc => {
        const data = doc.data();
        const totalAmt = Number(data.totalAmount) || 0;
        const paidAmt = Number(data.paidAmount) || 0;
        const balance = totalAmt - paidAmt;

        if (!dealerName && data.dealerName) dealerName = data.dealerName;

        bills.push({
            receiptId: doc.id,
            materialName: data.materialName,
            materialId: data.materialId,
            unit: data.unit || "",
            rate: data.rate || 0,
            quantity: data.quantity || 0,
            date: formatDate(data.date
                ? data.date + "T00:00:00"
                : data.createdAt),
            totalAmount: totalAmt,
            paidAmount: paidAmt,
            remainingAmount: balance,
            status: balance <= 0
                ? "Fully Paid"
                : paidAmt > 0 ? "Partially Paid" : "Pending",
            createdAt: data.createdAt,
        });

        totalBilled += totalAmt;
        totalPaid += paidAmt;
    });

    bills.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // ── Build payment history from dealerPayments collection ─────────────────
    // payDealerProjectPayment saves each payment with projectNo → query it here
    const rawPayments = [];
    paymentSnap.forEach(doc => {
        const data = doc.data();
        rawPayments.push({
            paymentId: doc.id,
            amount: Number(data.amountPaid) || 0,
            date: formatDate(data.date),   // "17-03-2026"
            method: data.method || "cash",
            createdAt: data.date,               // raw ISO for sorting
        });
    });

    // Sort latest payment first for Flutter list
    rawPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Running total (calculated oldest→newest then reversed)
    const forRunning = [...rawPayments].reverse();
    let running = 0;
    const runningMap = {};
    forRunning.forEach(p => {
        running += p.amount;
        runningMap[p.paymentId] = running;
    });

    const paymentHistory = rawPayments.map(p => ({
        paymentId: p.paymentId,
        date: p.date,              // "17-03-2026"
        amount: p.amount,
        method: p.method,
        totalPaidSoFar: runningMap[p.paymentId],
        remainingAfterThis: totalBilled - runningMap[p.paymentId],
    }));

    const totalRemaining = totalBilled - totalPaid;

    return {
        dealerDetails: {
            dealerName,
            phoneNumber,
        },
        projectDetails: {
            projectNo,
            projectName,
        },
        // ── Bill breakdown ────────────────────────────────────────────────────
        bills,
        // ── Payment history (each payment entry, latest first) ────────────────
        paymentHistory,
        // ── Summary ───────────────────────────────────────────────────────────
        summary: {
            totalBills: bills.length,
            totalAmount: totalBilled,
            paidAmount: totalPaid,
            remainingBalance: totalRemaining,
            paymentCount: paymentHistory.length,
            status: totalRemaining <= 0 ? "Fully Paid"
                : totalPaid > 0 ? "Partially Paid" : "Pending",
        },
    };
};


// =============================================================================
// payDealerProjectPayment
//
//  ROUTE:  PUT /api/dealers/:phoneNumber/project/:projectNo/payment
//  BODY:   { amount: 5000, method: "bank" }   (method is optional, default "cash")
//
//  Applies payment FIFO only to bills of THIS project from THIS dealer.
//  Does NOT touch bills of other projects.
//
//  After applying:
//    • Logs entry in dealerPayments collection (with projectNo stored)
//    • Returns full updated payment log for this project
// =============================================================================
exports.payDealerProjectPayment = async (phoneNumber, projectNo, amount, method, bankId, tenant_id) => {
    if (!phoneNumber) throw new Error("phoneNumber is required");
    if (!projectNo) throw new Error("projectNo is required");
    if (!amount || Number(amount) <= 0)
        throw new Error("Valid positive amount is required");

    const paymentAmount = Number(amount);
    const paymentMethod = method || "cash";
    const paymentDate = new Date();
    const paymentDateISO = paymentDate.toISOString();
    const displayDate = paymentDateISO.split("T")[0];

    const variations = getPhoneVariations(phoneNumber);

    // ─────────────────────────────────────────────
    // 1. FETCH BILLS FIRST (IMPORTANT)
    // ─────────────────────────────────────────────
    let query = materialReceivedCollection
        .where("dealerContact", "in", variations)
        .where("projectNo", "==", projectNo);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    let totalPending = 0;
    let dealerName = "";

    if (!snapshot.empty) {
        snapshot.forEach(doc => {
            const d = doc.data();
            if (!dealerName && d.dealerName) dealerName = d.dealerName;
            totalPending += (Number(d.totalAmount) || 0) - (Number(d.paidAmount) || 0);
        });
    }

    // ─────────────────────────────────────────────
    // 2. VALIDATION FIRST (CRITICAL FIX)
    // ─────────────────────────────────────────────
    if (totalPending <= 0) {
        throw new Error("All bills already fully paid");
    }

    if (paymentAmount > totalPending) {
        throw new Error(`You can only pay up to ₹${totalPending}`);
    }

    // ─────────────────────────────────────────────
    // 3. BANK LOGIC (DEBIT)
    // ─────────────────────────────────────────────
    let bankData = null;
    let currentBalance = 0;
    let newBalance = 0;
    let bankTransactionId = null;

    if (paymentMethod === "bank") {
        if (!bankId) throw new Error("bankId is required for BANK payment");

        const bankDoc = await banksCollection.doc(bankId).get();
        if (!bankDoc.exists) throw new Error("Bank not found");

        bankData = bankDoc.data();
        currentBalance = Number(bankData.currentBalance || 0);

        if (currentBalance < paymentAmount) {
            throw new Error("Insufficient bank balance");
        }

        newBalance = currentBalance - paymentAmount;

        // Update bank
        await banksCollection.doc(bankId).update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        // Create DEBIT transaction
        const txnRef = await banksCollection
            .doc(bankId)
            .collection("transactions")
            .add({
                type: "DEBIT",
                amount: paymentAmount,
                projectNo,
                remark: `Dealer Payment - ${phoneNumber}`,
                date: displayDate,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                transactionType: "DEALER_PAYMENT",
                createdAt: new Date().toISOString(),
                relatedDealer: phoneNumber
            });

        bankTransactionId = txnRef.id;
    }

    // ─────────────────────────────────────────────
    // 4. FIFO PAYMENT APPLY
    // ─────────────────────────────────────────────
    const bills = [];
    snapshot.forEach(doc => bills.push({ id: doc.id, ref: doc.ref, data: doc.data() }));

    bills.sort((a, b) => new Date(a.data.createdAt || 0) - new Date(b.data.createdAt || 0));

    let remaining = paymentAmount;
    const updatedBills = [];

    for (const bill of bills) {
        if (remaining <= 0) break;

        const oldPaid = Number(bill.data.paidAmount) || 0;
        const total = Number(bill.data.totalAmount) || 0;
        const pending = total - oldPaid;

        if (pending <= 0) continue;

        const apply = Math.min(pending, remaining);
        const newPaid = oldPaid + apply;
        remaining -= apply;

        updatedBills.push({
            id: bill.id,
            ref: bill.ref,
            data: bill.data,
            newPaid
        });
    }

    // Batch update
    const batch = db.batch();

    for (const b of updatedBills) {
        batch.update(b.ref, {
            paidAmount: b.newPaid,
            dueAmount: (Number(b.data.totalAmount) || 0) - b.newPaid,
            updatedAt: paymentDateISO,
        });
    }

    await batch.commit();

    // ─────────────────────────────────────────────
    // 5. EXPENSE ENTRY (UNCHANGED)
    // ─────────────────────────────────────────────
    for (const b of updatedBills) {
        try {
            const appliedAmount = b.newPaid - (Number(b.data.paidAmount) || 0);
            if (appliedAmount <= 0) continue;

            const expenseDoc = {
                projectNo: b.data.projectNo,
                amount: appliedAmount,
                particular: `Material Payment – ${b.data.materialName}`,
                remark: b.data.dealerName
                    ? `Material Payment – ${b.data.materialName} (Dealer: ${b.data.dealerName})`
                    : `Material Payment – ${b.data.materialName}`,
                type: "materialPayment",
                materialId: b.data.materialId,
                dealerName: b.data.dealerName || "",
                dealerContact: b.data.dealerContact || "",
                receiptId: b.id,
                date: displayDate,
                createdAt: paymentDateISO,
                method: paymentMethod,
            };
            if (tenant_id && tenant_id !== 'GLOBAL') {
                expenseDoc.tenant_id = tenant_id;
            }

            await siteExpensesCollection.add(expenseDoc);
        } catch (err) {
            console.error("Expense sync failed:", err.message);
        }
    }

    // ─────────────────────────────────────────────
    // 6. STORE PAYMENT LOG
    // ─────────────────────────────────────────────
    const paymentDoc = {
        dealerContact: phoneNumber,
        projectNo,
        amountPaid: paymentAmount,
        method: paymentMethod,
        bankId: bankId || null,
        bankName: bankData?.accountName || null,
        bankTransactionId: bankTransactionId || null,
        date: paymentDateISO,
        type: "Payment",
    };
    if (tenant_id && tenant_id !== 'GLOBAL') {
        paymentDoc.tenant_id = tenant_id;
    }
    await paymentsCollection.add(paymentDoc);

    // ─────────────────────────────────────────────
    // 7. RESPONSE
    // ─────────────────────────────────────────────
    return {
        success: true,
        dealerName,
        projectNo,
        logs: [{
            amount: paymentAmount,
            date: displayDate,
            method: paymentMethod,
        }],
        summary: {
            totalPaid: paymentAmount,
            remainingBalance: totalPending - paymentAmount
        }
    };
};


// =============================================================================
// deleteDealer
//
//  Permanently removes a dealer and ALL associated records:
//    - materialReceived (reverses stock)
//    - dealerPayments   (reverses bank if applicable)
//    - siteExpenses     (materialPayment type)
//
//  ROUTE: DELETE /api/dealers/:phoneNumber
// =============================================================================
exports.deleteDealer = async (phoneNumber, tenant_id) => {
    if (!phoneNumber) throw new Error("Phone number is required");

    const variations = getPhoneVariations(phoneNumber);
    
    let receiptQuery = materialReceivedCollection.where("dealerContact", "in", variations);
    let paymentQuery = paymentsCollection.where("dealerContact", "in", variations);
    let expenseQuery = siteExpensesCollection.where("dealerContact", "in", variations).where("type", "==", "materialPayment");

    if (tenant_id && tenant_id !== 'GLOBAL') {
        receiptQuery = receiptQuery.where("tenant_id", "==", tenant_id);
        paymentQuery = paymentQuery.where("tenant_id", "==", tenant_id);
        expenseQuery = expenseQuery.where("tenant_id", "==", tenant_id);
    }

    // 1. Fetch all related records
    const [receiptSnap, paymentSnap, expenseSnap] = await Promise.all([
        receiptQuery.get(),
        paymentQuery.get(),
        expenseQuery.get()
    ]);

    if (receiptSnap.empty && paymentSnap.empty) {
        throw new Error("No records found for this dealer");
    }

    const stockCollection = db.collection("stock");
    const batch = db.batch();

    // 2. Process Material Receipts (Stock Reversal + Bank Reversal + Delete)
    for (const doc of receiptSnap.docs) {
        const data = doc.data();
        
        // Stock reversal
        const quantity = Number(data.quantity) || 0;
        if (quantity > 0 && data.projectNo && data.materialId) {
            const stockId = `${data.projectNo}_${data.materialId}`;
            const stockRef = stockCollection.doc(stockId);
            const stockDoc = await stockRef.get();
            if (stockDoc.exists) {
                const s = stockDoc.data();
                batch.update(stockRef, {
                    receivedQuantity: Math.max(0, (Number(s.receivedQuantity) || 0) - quantity),
                    stock: Math.max(0, (Number(s.stock) || 0) - quantity),
                    updatedAt: new Date().toISOString()
                });
            }
        }

        // Bank Reversal for Receipts
        const paidAmount = Number(data.paidAmount) || 0;
        if ((data.method || "").toLowerCase() === "bank" && data.bankId && paidAmount > 0) {
            await _reverseBankTransaction(data.bankId, paidAmount, `Material Receipt Deleted (${doc.id})`);
        }

        batch.delete(doc.ref);
    }

    // 3. Process Dealer Payments (Bank Reversal + Delete)
    for (const doc of paymentSnap.docs) {
        const data = doc.data();
        const amountPaid = Number(data.amountPaid) || 0;
        if ((data.method || "").toLowerCase() === "bank" && data.bankId && amountPaid > 0) {
            await _reverseBankTransaction(data.bankId, amountPaid, `Dealer Payment Deleted (${doc.id})`);
        }
        batch.delete(doc.ref);
    }

    // 4. Process Site Expenses (Delete only - bank already handled by receipts/payments)
    for (const doc of expenseSnap.docs) {
        batch.delete(doc.ref);
    }

    await batch.commit();

    return {
        message: `Dealer '${phoneNumber}' deleted successfully`,
        summary: {
            receiptsDeleted: receiptSnap.size,
            paymentsDeleted: paymentSnap.size,
            expensesDeleted: expenseSnap.size
        }
    };
};

// Internal Helper for Bank Reversal
async function _reverseBankTransaction(bankId, amount, reason) {
    try {
        const bankRef = banksCollection.doc(bankId);
        const bankDoc = await bankRef.get();
        if (!bankDoc.exists) return;

        const data = bankDoc.data();
        const currentBalance = Number(data.currentBalance) || 0;
        const newBalance = currentBalance + amount;

        await bankRef.update({
            currentBalance: newBalance,
            closingBalance: newBalance,
            updatedAt: new Date().toISOString()
        });

        await bankRef.collection("transactions").add({
            type: "CREDIT",
            amount,
            remark: `System Reversal: ${reason}`,
            transactionType: "DEALER_RECORD_DELETED",
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString()
        });
    } catch (err) {
        console.error(`Bank reversal failed for ${bankId}:`, err.message);
    }
}