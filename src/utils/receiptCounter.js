const { db } = require("../config/firebase");

/**
 * Gets the next sequential receipt number for a tenant and payment type.
 * Runs in a Firestore transaction to ensure safety against concurrent calls.
 * 
 * @param {string} tenantId - The ID of the tenant
 * @param {string} prefix - 'DEP' (Dealer Payment) or 'LBP' (Labour Payment)
 * @returns {Promise<string>} The formatted receipt number, e.g., 'DEP-1001'
 */
exports.getNextReceiptNo = async (tenantId, prefix) => {
    const tenantKey = tenantId || "global";
    const counterRef = db.collection("counters").doc(tenantKey);
    
    let nextNum = 1000;
    
    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterRef);
        const fieldName = prefix === 'DEP' ? 'dealerReceiptCounter' : 'labourReceiptCounter';
        
        if (doc.exists) {
            const data = doc.data();
            const current = data[fieldName] || 999;
            nextNum = current + 1;
            transaction.update(counterRef, { [fieldName]: nextNum });
        } else {
            nextNum = 1000;
            transaction.set(counterRef, { [fieldName]: nextNum }, { merge: true });
        }
    });
    
    return `${prefix}-${nextNum}`;
};
