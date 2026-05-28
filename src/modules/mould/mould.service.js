const { db, admin } = require("../../config/firebase");
const dayjs = require("dayjs");

const MOULD_PURCHASES = "mould_purchases";
const MOULD_RENTALS = "mould_rentals";
const MOULDS = "moulds"; // New collection for general mould inventory

const nowIST = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

/**
 * Seed limit reference (to prevent exceeding original quantities)
 */
const SEED_LIMITS = [
    { materialName: "CENTRING SHEET", size: "3'0\" X 2'0\"", maxQuantity: 400 },
    { materialName: "SHEET", size: "3'0\" X 1'6\"", maxQuantity: 250 },
    { materialName: "JOCKEY", size: "2 METER", maxQuantity: 450 },
    { materialName: "SPAN", size: "2.5 METER", maxQuantity: 90 },
    { materialName: "SPAN", size: "3 METER", maxQuantity: 60 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "2'0\" X 1'0\" X 7'0\" HEIGHT", maxQuantity: 1 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "2'0\" X 1'6\" X 7'0\" HEIGHT", maxQuantity: 6 },
    { materialName: "SHOE (ANGLE TYPE)", size: "1'6\" X 9\"", maxQuantity: 17 },
    { materialName: "SHOE (ANGLE TYPE)", size: "2'0\" X 1'0\"", maxQuantity: 1 },
    { materialName: "SHOE (ANGLE TYPE)", size: "2'0\" X 1'6\"", maxQuantity: 5 },
    { materialName: "CUPLOCK", size: "3 METER", maxQuantity: 60 },
    { materialName: "CUPLOCK", size: "2 METER", maxQuantity: 80 },
    { materialName: "LEDGER", size: "2 METER", maxQuantity: 300 },
    { materialName: "LEDGER", size: "1.2 METER", maxQuantity: 180 },
    { materialName: "EARTH BEAM SHEET", size: "4'0\" X 1'6\"", maxQuantity: 60 },
    { materialName: "EARTH BEAM SHEET", size: "5'0\" X 1'6\"", maxQuantity: 50 },
    { materialName: "EARTH BEAM SHEET", size: "6'0\" X 1'6\"", maxQuantity: 60 },
    { materialName: "EARTH BEAM SHEET", size: "7'0\" X 1'6\"", maxQuantity: 20 },
    { materialName: "EARTH BEAM SHEET", size: "8'0\" X 1'6\"", maxQuantity: 20 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "9\" X 9\" X 4'0\" HEIGHT", maxQuantity: 20 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'0\" X 9\" X 4'0\" HEIGHT", maxQuantity: 15 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'3\" X 9\" X 4'0\" HEIGHT", maxQuantity: 5 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'6\" X 9\" X 4'0\" HEIGHT", maxQuantity: 5 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "9\" X 9\" X 7'0\" HEIGHT", maxQuantity: 22 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'0\" X 9\" X 7'0\" HEIGHT", maxQuantity: 15 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'3\" X 9\" X 7'0\" HEIGHT", maxQuantity: 5 },
    { materialName: "COLUMN BOX (L-TYPE)", size: "1'6\" X 9\" X 7'0\" HEIGHT", maxQuantity: 5 },
    { materialName: "BASE PLATE (SCAFFOLDING)", size: "-", maxQuantity: 20 },
    { materialName: "ADJUSTABLE SHEET", size: "1'6\" X 1'0\"", maxQuantity: 20 },
    { materialName: "ADJUSTABLE SHEET", size: "1'6\" X 1'6\"", maxQuantity: 20 },
    { materialName: "ADJUSTABLE SHEET", size: "1'6\" X 2'0\"", maxQuantity: 20 },
    { materialName: "ADJUSTABLE SHEET", size: "1'6\" X 3'0\"", maxQuantity: 50 },
    { materialName: "EARTH BEAM CLAMP", size: "1'6\" X 9\"", maxQuantity: 200 },
    { materialName: "TOP CLAMP", size: "1'6\" X 9\"", maxQuantity: 50 }
];

/**
 * MOULD PURCHASE MANAGEMENT
 */

exports.createPurchase = async (data, tenant_id) => {
    const { materialName, size, totalQuantity, unitType, rent } = data;
    const now = nowIST();

    // Check if same name + same size already exists → update stock
    let query = db.collection(MOULD_PURCHASES)
        .where("materialName", "==", materialName)
        .where("size", "==", size);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0];
        const existingData = existingDoc.data();

        const currentStock = existingData.stock || {
            totalQuantity: existingData.totalQuantity || 0,
            availableStock: existingData.availableStock || 0,
            usedStock: existingData.usedStock || 0
        };

        // FIX: define seedItem before using it
        const seedItem = SEED_LIMITS.find(
            s => s.materialName === materialName && s.size === size
        );

        if (seedItem) {
            if (currentStock.totalQuantity >= seedItem.maxQuantity) {
                return existingData; // Already at max, skip
            }
            const newTotal = currentStock.totalQuantity + totalQuantity;
            if (newTotal > seedItem.maxQuantity) {
                throw new Error(`Cannot exceed max limit of ${seedItem.maxQuantity} for ${materialName} (${size})`);
            }
        }

        const newTotal = currentStock.totalQuantity + totalQuantity;
        const newAvailable = currentStock.availableStock + totalQuantity;

        await existingDoc.ref.update({
            "stock.totalQuantity": newTotal,
            "stock.availableStock": newAvailable,
            "stock.usedStock": currentStock.usedStock || 0,
            updatedAt: now
        });

        const updated = await existingDoc.ref.get();
        return updated.data();
    }

    // Create new material
    const docRef = db.collection(MOULD_PURCHASES).doc();
    const purchaseData = {
        id: docRef.id,
        materialName,
        size,
        unitType,
        stock: {
            totalQuantity,
            availableStock: totalQuantity,
            usedStock: 0
        },
        rent: {
            rentType: rent?.rentType || "MONTH",
            rentAmount: rent?.rentAmount || 0
        },
        createdAt: now,
        updatedAt: now,
        tenant_id
    };

    await docRef.set(purchaseData);
    return purchaseData;
};

exports.getAllPurchases = async (tenant_id) => {
    let query = db.collection(MOULD_PURCHASES);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data());
};

exports.getPurchaseById = async (id, tenant_id) => {
    const doc = await db.collection(MOULD_PURCHASES).doc(id).get();
    if (!doc.exists) throw new Error("Purchase item not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    return doc.data();
};

exports.updatePurchase = async (id, updates, tenant_id) => {
    const docRef = db.collection(MOULD_PURCHASES).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Purchase item not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const now = nowIST();
    const updatedData = { ...updates, updatedAt: now };
    await docRef.update(updatedData);
    return { ...doc.data(), ...updatedData };
};

exports.deletePurchase = async (id, tenant_id) => {
    const docRef = db.collection(MOULD_PURCHASES).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Purchase item not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    await docRef.delete();
};

/**
 * RENTAL MANAGEMENT
 */

exports.createRental = async (mouldId, data, tenant_id) => {
    const {
        customerName,
        phoneNumber,
        customerLocation,
        rentalBasis,
        quantity,
        rate,
        approxReturnDate,
        actualReturnDate,
        amountPaid,
        paymentStatus
    } = data;

    const now = nowIST();

    // Look up Mould to automatically link the exactly correct name and actual mouldId
    let computedMouldName = "";
    let computedMouldId = mouldId || "";
    let firestoreMouldId = mouldId || "";

    if (mouldId) {
        // Try fetching it as a Firestore Document ID
        let mouldDoc = await db.collection(MOULDS).doc(mouldId).get();

        // If not found, try fetching it as a custom mouldId (e.g. "MLD-77824")
        if (!mouldDoc.exists) {
            const snapshot = await db.collection(MOULDS).where("mouldId", "==", mouldId).get();
            if (!snapshot.empty) {
                mouldDoc = snapshot.docs[0];
            }
        }

        if (mouldDoc && mouldDoc.exists) {
            const mData = mouldDoc.data();
            computedMouldName = mData.mouldName || "";
            // Keep the clean custom ID (overwriting the Firestore hash ID) if available
            computedMouldId = mData.mouldId || mouldId;
            firestoreMouldId = mouldDoc.id;
        }
    }

    const docRef = db.collection(MOULD_RENTALS).doc();

    // Perform server-side calculations
    const qtyNum = Number(quantity || 0);
    const rateNum = Number(rate || 0);
    const amountPaidNum = Number(amountPaid || 0);

    const calculatedTotalAmount = qtyNum * rateNum;
    const calculatedBalanceToPay = calculatedTotalAmount - amountPaidNum;

    // Setup flat rental record representing the UI segments
    const rentalData = {
        id: docRef.id,
        mouldId: computedMouldId,
        mouldName: computedMouldName,
        customerName: customerName || "",
        phoneNumber: phoneNumber || "",
        customerLocation: customerLocation || "",
        rentalTerms: {
            rentalBasis: rentalBasis || "Day",
            quantity: qtyNum,
            rate: rateNum
        },
        trackingDates: {
            approxReturnDate: approxReturnDate || "",
            actualReturnDate: actualReturnDate || ""
        },
        paymentDetails: {
            totalAmount: calculatedTotalAmount,
            amountPaid: amountPaidNum,
            balanceToPay: calculatedBalanceToPay,
            paymentStatus: paymentStatus || "Pending"
        },
        status: paymentStatus === "Paid" && actualReturnDate ? "COMPLETED" : "ACTIVE",
        createdAt: now,
        updatedAt: now,
        tenant_id
    };

    await docRef.set(rentalData);
    return rentalData;
};


exports.getAllRentals = async (tenant_id) => {
    let query = db.collection(MOULD_RENTALS);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => {
        const d = doc.data();
        return {
            id: d.id,
            clientName: d.clientName || d.customerName,
            status: d.status,
            rentalPeriod: d.rentalPeriod,
            payment: {
                pendingAmount: d.payment?.pendingAmount ?? d.pendingAmount ?? 0
            }
        };
    });
};

exports.getRentalById = async (id, tenant_id) => {
    const doc = await db.collection(MOULD_RENTALS).doc(id).get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    return doc.data();
};

/**
 * Add Payment or Update Rental (PUT /rental/:id)
 * FIX: Sum from paymentHistory to avoid stale payment object bug
 */
exports.updateRental = async (id, body, tenant_id) => {
    const docRef = db.collection(MOULD_RENTALS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const rental = doc.data();
    const now = nowIST();

    // If endDate is being updated, recalculate rentSummary
    if (body.endDate !== undefined) {
        const startDate = rental.rentalPeriod?.startDate || rental.startDate;
        const endDate = body.endDate;
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        const usedDays = Math.max(1, end.diff(start, "day") + 1);
        const daysInMonth = start.daysInMonth();

        let totalMonthlyRent = 0;
        let totalUsedRent = 0;

        for (const item of rental.items || []) {
            const perItemRent = (item.rent?.totalrentAmount) || 0;
            totalMonthlyRent += perItemRent * daysInMonth;
            totalUsedRent += perItemRent * usedDays;
        }

        const paid = Math.round(totalMonthlyRent);
        const balance = paid - Math.round(totalUsedRent);

        const updatedData = {
            "rentalPeriod.endDate": endDate,
            "rentalPeriod.usedDays": usedDays,
            "rentalPeriod.daysInMonth": daysInMonth,
            rentSummary: {
                monthlyTotal: paid,
                usedRent: Math.round(totalUsedRent),
                paid,
                balance
            },
            updatedAt: now
        };

        // Carry over any other fields from body (excluding endDate which we already handled)
        const { endDate: _ignored, ...otherFields } = body;
        Object.assign(updatedData, Object.fromEntries(
            Object.entries(otherFields).map(([k, v]) => [k, v])
        ));

        await docRef.update(updatedData);
        return { ...rental, ...updatedData };
    }

    if (body.addPayment !== undefined) {
        const addAmt = Number(body.addPayment);

        const totalAmount = rental.paymentDetails?.totalAmount ?? 0;
        const currentPaid = rental.paymentDetails?.amountPaid ?? 0;
        const balanceToPay = totalAmount - currentPaid;

        if (addAmt > balanceToPay) {
            const err = new Error(`Payment failed. Total amount is ${totalAmount}, you already paid ${currentPaid}. Your remaining balance is ${balanceToPay}. You cannot pay more than the balance.`);
            err.statusCode = 400;
            throw err;
        }

        const newAmountPaid = currentPaid + addAmt;
        const newBalanceToPay = Math.max(0, totalAmount - newAmountPaid);
        const newPaymentStatus = newBalanceToPay <= 0 ? "Paid" : "Pending";

        const updatedHistory = [
            ...(rental.paymentHistory || []),
            { amount: addAmt, date: now, note: body.note || "Payment Added" }
        ];

        const updatedPaymentDetails = {
            totalAmount,
            amountPaid: newAmountPaid,
            balanceToPay: newBalanceToPay,
            paymentStatus: newPaymentStatus
        };

        const updatePayload = {
            paymentDetails: updatedPaymentDetails,
            paymentHistory: updatedHistory,
            updatedAt: now,

            // CLEANUP: Delete legacy cluttered fields
            payment: admin.firestore.FieldValue.delete(),
            totalCalculatedRent: admin.firestore.FieldValue.delete(),
            totalPaidAmount: admin.firestore.FieldValue.delete(),
            pendingAmount: admin.firestore.FieldValue.delete(),
            balance: admin.firestore.FieldValue.delete(),
            rentSummary: admin.firestore.FieldValue.delete(),
            initialPayment: admin.firestore.FieldValue.delete(),
            totalUsedAmount: admin.firestore.FieldValue.delete(),
            calculation: admin.firestore.FieldValue.delete()
        };

        await docRef.update(updatePayload);

        // Fetch fresh record to return clean response structure (without Deleted fields)
        const freshDoc = await docRef.get();
        return freshDoc.data();
    }

    // Generic update
    const updatedData = { ...body, updatedAt: now };
    await docRef.update(updatedData);
    return { ...rental, ...updatedData };
};


exports.deleteRental = async (id, tenant_id) => {
    const docRef = db.collection(MOULD_RENTALS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const rental = doc.data();
    const now = nowIST();

    for (const item of rental.items) {
        const purchaseRef = db.collection(MOULD_PURCHASES).doc(item.materialId);
        const purchaseDoc = await purchaseRef.get();
        if (purchaseDoc.exists) {
            const pd = purchaseDoc.data();
            const stock = pd.stock || { availableStock: pd.availableStock || 0, usedStock: pd.usedStock || 0 };
            await purchaseRef.update({
                "stock.availableStock": (stock.availableStock || 0) + item.quantity,
                "stock.usedStock": Math.max(0, (stock.usedStock || 0) - item.quantity),
                updatedAt: now
            });
        }
    }

    await docRef.delete();
};

exports.paymentUpdate = async (id, body, tenant_id) => {
    const { balance: payAmount, note } = body;
    const docRef = db.collection(MOULD_RENTALS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const rental = doc.data();
    const now = nowIST();

    const currentBalance = rental.paymentDetails?.balanceToPay ?? 0;
    const totalAmount = rental.paymentDetails?.totalAmount ?? 0;
    const currentPaid = rental.paymentDetails?.amountPaid ?? 0;

    const payAmtNum = Number(payAmount || 0);
    if (payAmtNum > currentBalance) {
        const err = new Error(`Payment failed. You have already completed the payment process or the amount (₹${payAmtNum}) exceeds the remaining balance (₹${currentBalance}).`);
        err.statusCode = 400;
        throw err;
    }

    const newAmountPaid = currentPaid + payAmtNum;
    const newBalanceToPay = Math.max(0, totalAmount - newAmountPaid);
    const newPaymentStatus = newBalanceToPay <= 0 ? "Paid" : "Pending";

    const updatedPaymentDetails = {
        totalAmount,
        amountPaid: newAmountPaid,
        balanceToPay: newBalanceToPay,
        paymentStatus: newPaymentStatus
    };

    const updatedHistory = [
        ...(rental.paymentHistory || []),
        { amount: payAmount, note: note || "Manual Balance Update", date: now }
    ];

    const newStatus = (newBalanceToPay <= 0 && rental.trackingDates?.actualReturnDate) ? "COMPLETED" : rental.status;

    const updatePayload = {
        paymentDetails: updatedPaymentDetails,
        paymentHistory: updatedHistory,
        status: newStatus,
        updatedAt: now,

        // CLEANUP: Delete legacy cluttered fields
        payment: admin.firestore.FieldValue.delete(),
        totalCalculatedRent: admin.firestore.FieldValue.delete(),
        totalPaidAmount: admin.firestore.FieldValue.delete(),
        pendingAmount: admin.firestore.FieldValue.delete(),
        balance: admin.firestore.FieldValue.delete(),
        rentSummary: admin.firestore.FieldValue.delete(),
        initialPayment: admin.firestore.FieldValue.delete(),
        totalUsedAmount: admin.firestore.FieldValue.delete(),
        calculation: admin.firestore.FieldValue.delete()
    };

    await docRef.update(updatePayload);

    return { success: true, message: "Payment successfully updated", data: updatedPaymentDetails };
};

exports.addPayment = async (rentalId, paymentInfo, tenant_id) => {
    const { amount, date, note } = paymentInfo;
    const docRef = db.collection(MOULD_RENTALS).doc(rentalId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const rental = doc.data();
    const now = nowIST();

    const currentDetails = rental.paymentDetails || {
        totalAmount: rental.rentSummary?.monthlyTotal ?? 0,
        amountPaid: rental.rentSummary?.paid ?? 0,
        balanceToPay: rental.rentSummary?.balance ?? 0,
        paymentStatus: "Pending"
    };

    const payAmount = Number(amount || 0);
    if (payAmount > currentDetails.balanceToPay) {
        const err = new Error(`Payment failed. You have already completed the payment process or the amount (₹${payAmount}) exceeds the remaining balance (₹${currentDetails.balanceToPay}).`);
        err.statusCode = 400;
        throw err;
    }
    const newAmountPaid = (currentDetails.amountPaid || 0) + payAmount;
    const newBalanceToPay = Math.max(0, (currentDetails.totalAmount || 0) - newAmountPaid);
    const newPaymentStatus = newBalanceToPay <= 0 ? "Paid" : "Pending";

    const updatedPaymentDetails = {
        totalAmount: currentDetails.totalAmount || 0,
        amountPaid: newAmountPaid,
        balanceToPay: newBalanceToPay,
        paymentStatus: newPaymentStatus
    };

    const updatedHistory = [
        ...(rental.paymentHistory || []),
        { amount: payAmount, date: date || now, note: note || "Manual Payment" }
    ];

    await docRef.update({
        paymentDetails: updatedPaymentDetails,
        paymentHistory: updatedHistory,
        updatedAt: now,

        // CLEANUP: Delete legacy cluttered fields
        payment: admin.firestore.FieldValue.delete(),
        totalCalculatedRent: admin.firestore.FieldValue.delete(),
        totalPaidAmount: admin.firestore.FieldValue.delete(),
        pendingAmount: admin.firestore.FieldValue.delete(),
        balance: admin.firestore.FieldValue.delete(),
        rentSummary: admin.firestore.FieldValue.delete(),
        initialPayment: admin.firestore.FieldValue.delete(),
        totalUsedAmount: admin.firestore.FieldValue.delete(),
        calculation: admin.firestore.FieldValue.delete()
    });

    const freshDoc = await docRef.get();
    return freshDoc.data();
};

exports.closeRental = async (rentalId, tenant_id) => {
    const docRef = db.collection(MOULD_RENTALS).doc(rentalId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Rental record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const rental = doc.data();
    const now = nowIST();

    for (const item of rental.items) {
        const purchaseRef = db.collection(MOULD_PURCHASES).doc(item.materialId);
        const purchaseDoc = await purchaseRef.get();
        if (purchaseDoc.exists) {
            const pd = purchaseDoc.data();
            const stock = pd.stock || { availableStock: pd.availableStock || 0, usedStock: pd.usedStock || 0 };
            await purchaseRef.update({
                "stock.availableStock": (stock.availableStock || 0) + item.quantity,
                "stock.usedStock": Math.max(0, (stock.usedStock || 0) - item.quantity),
                updatedAt: now
            });
        }
    }

    await docRef.update({ status: "COMPLETED", updatedAt: now });
};

exports.getClientMaterialHistory = async (clientName, materialId, tenant_id) => {
    let query = db.collection(MOULD_RENTALS).where("clientName", "==", clientName);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    const history = [];
    snapshot.docs.forEach(doc => {
        const rental = doc.data();
        const matchedItems = rental.items.filter(i => i.materialId === materialId);
        if (matchedItems.length > 0) {
            history.push({
                rentalId: rental.id,
                rentalPeriod: rental.rentalPeriod,
                status: rental.status,
                payment: rental.payment,
                items: matchedItems,
                createdAt: rental.createdAt
            });
        }
    });

    history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return history;
};

exports.getCustomerLedger = async (phoneNumber, tenant_id) => {
    let query = db.collection(MOULD_RENTALS).where("phoneNumber", "==", phoneNumber);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    const historyList = [];
    let activeTransaction = null;
    let customerName = "";
    let customerLocation = "";

    snapshot.docs.forEach(doc => {
        const rental = doc.data();
        if (!customerName && rental.customerName) customerName = rental.customerName;
        if (!customerLocation && rental.customerLocation) customerLocation = rental.customerLocation;

        const isLegacy = !rental.rentalTerms && rental.items && rental.items.length > 0;

        let extractedMouldId = rental.mouldId || "UNKNOWN-ID";
        let extractedMouldName = rental.mouldName || "Unknown Mould (Legacy DB Record)";
        let extractedQuantity = rental.rentalTerms?.quantity || 0;
        let extractedRentType = rental.rentalTerms?.rentalBasis || "Day";
        let extractedTotal = rental.paymentDetails?.totalAmount || 0;
        let extractedPaid = rental.paymentDetails?.amountPaid || 0;
        let extractedBalance = rental.paymentDetails?.balanceToPay || 0;
        let extractedPaymentStatus = rental.paymentDetails?.paymentStatus || "Unpaid";

        if (isLegacy) {
            extractedMouldId = rental.items[0]?.materialId || "";
            extractedMouldName = rental.items[0]?.materialName || "Legacy Mould Item";
            extractedQuantity = rental.items[0]?.quantity || 1;
            extractedRentType = "Month"; // Legacy was typically monthly logic
            extractedTotal = rental.rentSummary?.monthlyTotal || 0;
            extractedPaid = rental.rentSummary?.paid || 0;
            extractedBalance = rental.rentSummary?.balance || 0;
            extractedPaymentStatus = extractedBalance <= 0 ? "Paid" : "Pending";
        }

        const formattedRecord = {
            id: rental.id,
            mouldId: extractedMouldId,
            mouldName: extractedMouldName,
            date: rental.createdAt ? rental.createdAt.split(",")[0] : "",
            createdAt: rental.createdAt || "",
            quantity: extractedQuantity,
            rentType: extractedRentType,
            totalAmount: extractedTotal,
            amountPaid: extractedPaid,
            balanceToPay: extractedBalance,
            status: rental.status,
            paymentStatus: extractedPaymentStatus
        };

        // Date parser since en-IN emits DD/MM/YYYY which JS standard Date doesn't always handle
        const getTimestamp = (dStr) => {
            if (!dStr) return 0;
            const parts = dStr.split(", ");
            if (parts.length === 2) {
                const [d, m, y] = parts[0].split("/");
                return new Date(`${m}/${d}/${y} ${parts[1]}`).getTime();
            }
            return new Date(dStr).getTime() || 0;
        };

        if (rental.status === "ACTIVE") {
            // Keep the most recent active transaction
            if (!activeTransaction || getTimestamp(rental.createdAt) > getTimestamp(activeTransaction.createdAt)) {
                if (activeTransaction) historyList.push(activeTransaction); // Move older active to history
                activeTransaction = formattedRecord;
            } else {
                historyList.push(formattedRecord); // Push directly if it is older
            }
        } else {
            historyList.push(formattedRecord);
        }
    });

    historyList.sort((a, b) => {
        const getTimestamp = (dStr) => {
            if (!dStr) return 0;
            const parts = dStr.split(", ");
            if (parts.length === 2) {
                const [d, m, y] = parts[0].split("/");
                return new Date(`${m}/${d}/${y} ${parts[1]}`).getTime();
            }
            return new Date(dStr).getTime() || 0;
        };
        return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
    });

    return {
        customerInfo: {
            customerName,
            phoneNumber,
            customerLocation
        },
        activeTransaction,
        historyList
    };
};

exports.calculateRental = async (data, tenant_id) => {
    const { clientName, startDate, endDate, initialPayment, items } = data;
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const totalDays = Math.max(1, end.diff(start, "day") + 1);

    let totalRentalAmount = 0;
    const materials = [];

    for (const item of items) {
        const purchaseRef = db.collection(MOULD_PURCHASES).doc(item.materialId);
        const purchaseDoc = await purchaseRef.get();
        if (!purchaseDoc.exists) throw new Error(`Material with ID ${item.materialId} not found`);

        const purchaseData = purchaseDoc.data();
        const dailyRent = purchaseData.rent?.rentAmount || 0;
        const totalItemRent = dailyRent * item.quantity * totalDays;

        totalRentalAmount += totalItemRent;

        materials.push({
            materialId: item.materialId,
            materialName: purchaseData.materialName,
            size: purchaseData.size,
            unitType: purchaseData.unitType,
            quantity: item.quantity,
            dailyRent,
            totalItemRent
        });
    }

    const diff = totalRentalAmount - initialPayment;
    const pendingAmount = Math.max(0, diff);
    const balance = Math.max(0, -diff);

    let status = "NO_BALANCE";
    if (pendingAmount > 0) status = "PAYABLE";
    else if (balance > 0) status = "REFUND";

    return {
        clientName,
        rentalPeriod: {
            startDate,
            endDate,
            totalDays
        },
        materials,
        calculation: {
            initialPayment,
            totalRentalAmount,
            pendingAmount,
            balance,
            status
        }
    };
};

/**
 * 🟡 ADD NEW MOULD (General Inventory)
 * Based on user requested structure
 */
exports.addNewMould = async (data, tenant_id) => {
    const now = nowIST();
    const docRef = db.collection(MOULDS).doc();
    if (!tenant_id) throw new Error("tenant_id is required");

    const mouldData = {
        id: docRef.id,
        mouldId: data.mouldId || `MLD-${Date.now()}`,
        mouldName: data.mouldName || "",
        specifications: {
            dimensions: {
                length: data.dimensions?.length || "0",
                width: data.dimensions?.width || "0",
                height: data.dimensions?.height || "0"
            },
            location: data.location || "",
            materialType: data.materialType || "Steel" // Steel / Aluminium / Composite / Wood
        },
        inventory: {
            stockUnits: Number(data.stockUnits || 0),
            unitPrice: Number(data.unitPrice || 0)
        },
        createdAt: now,
        updatedAt: now,
        tenant_id
    };

    await docRef.set(mouldData);
    return mouldData;
};

exports.getAllMoulds = async (tenant_id) => {
    let query = db.collection(MOULDS);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data());
};
