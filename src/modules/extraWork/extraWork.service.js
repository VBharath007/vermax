const { db } = require("../../config/firebase");
const { EXTRA_WORKS } = require("../../models/firestore.collections");

const extraWorksCollection = db.collection(EXTRA_WORKS);

/**
 * Add a new extra work entry/note
 * @param {Object} data 
 * @returns {Object} created document
 */
exports.addExtraWork = async (data, tenant_id) => {
    const { title, description, projectNo, amount, balance, date, type } = data;
    
    if (!title) throw new Error("Title is required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newEntry = {
        title: title.trim(),
        description: description || "",
        projectNo: projectNo || "N/A",
        amount: Number(amount) || 0,
        balance: Number(balance) || 0,
        type: type || "General", // e.g., "Addition Work", "Material Receipt", etc.
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await extraWorksCollection.add(newEntry);
    return { id: docRef.id, ...newEntry };
};

/**
 * Get all extra work entries, optionally filtered by project
 * @param {string} projectNo 
 * @returns {Array} list of entries
 */
exports.getExtraWorks = async (projectNo = null, tenant_id) => {
    let query = extraWorksCollection;
    
    if (projectNo) {
        query = query.where("projectNo", "==", projectNo);
    }
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }

    const snapshot = await query.get();
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sort manually by createdAt desc to avoid composite index requirement
    results.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
    });

    return results;
};

/**
 * Get a single extra work entry by ID
 * @param {string} id 
 * @returns {Object} entry
 */
exports.getExtraWorkById = async (id, tenant_id) => {
    const doc = await extraWorksCollection.doc(id).get();
    if (!doc.exists) throw new Error("Extra work entry not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    return { id: doc.id, ...doc.data() };
};

/**
 * Update an extra work entry
 * @param {string} id 
 * @param {Object} data 
 * @returns {Object} updated entry
 */
exports.updateExtraWork = async (id, data, tenant_id) => {
    const docRef = extraWorksCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Extra work entry not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = { ...data, updatedAt: new Date().toISOString() };
    delete updates.id;
    delete updates.createdAt;

    // Ensure numeric fields are numbers
    if (updates.amount !== undefined) updates.amount = Number(updates.amount);
    if (updates.balance !== undefined) updates.balance = Number(updates.balance);

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

/**
 * Delete an extra work entry
 * @param {string} id 
 * @returns {Object} status message
 */
exports.deleteExtraWork = async (id, tenant_id) => {
    const docRef = extraWorksCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Extra work entry not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Extra work entry deleted successfully", id };
};
