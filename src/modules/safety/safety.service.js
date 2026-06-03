const { db } = require("../../config/firebase");
const { SAFETY_COMPLIANCE } = require("../../models/firestore.collections");

const safetyCollection = db.collection(SAFETY_COMPLIANCE);

// Helper to filter query by type and tenant_id
const getQuery = (type, tenant_id) => {
    let query = safetyCollection.where("type", "==", type);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    return query;
};

// ─── TOOLBOX BRIEFINGS CRUD ───

exports.addBriefing = async (data, tenant_id) => {
    const { topic, conductedBy, checkedItems, date } = data;
    if (!topic || !conductedBy) throw new Error("Topic and conductedBy are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newBriefing = {
        type: "briefing",
        topic: topic.trim(),
        conductedBy: conductedBy.trim(),
        checkedItems: checkedItems || [],
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await safetyCollection.add(newBriefing);
    return { id: docRef.id, ...newBriefing };
};

exports.getBriefings = async (tenant_id) => {
    const snapshot = await getQuery("briefing", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.updateBriefing = async (id, data, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "briefing") throw new Error("Briefing not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = {
        topic: data.topic ? data.topic.trim() : doc.data().topic,
        conductedBy: data.conductedBy ? data.conductedBy.trim() : doc.data().conductedBy,
        checkedItems: data.checkedItems !== undefined ? data.checkedItems : doc.data().checkedItems,
        date: data.date || doc.data().date,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.deleteBriefing = async (id, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "briefing") throw new Error("Briefing not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Briefing deleted successfully", id };
};

// ─── INCIDENT LOGS CRUD ───

exports.addIncident = async (data, tenant_id) => {
    const { severity, location, description, date } = data;
    if (!severity || !location || !description) throw new Error("Severity, location, and description are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newIncident = {
        type: "incident",
        severity: severity.trim().toLowerCase(),
        location: location.trim(),
        description: description.trim(),
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await safetyCollection.add(newIncident);
    return { id: docRef.id, ...newIncident };
};

exports.getIncidents = async (tenant_id) => {
    const snapshot = await getQuery("incident", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.updateIncident = async (id, data, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "incident") throw new Error("Incident not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = {
        severity: data.severity ? data.severity.trim().toLowerCase() : doc.data().severity,
        location: data.location ? data.location.trim() : doc.data().location,
        description: data.description ? data.description.trim() : doc.data().description,
        date: data.date || doc.data().date,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.deleteIncident = async (id, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "incident") throw new Error("Incident not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Incident deleted successfully", id };
};

// ─── PPE WORKERS CRUD ───

exports.addWorker = async (data, tenant_id) => {
    const { name, role, helmet, shoes, vest } = data;
    if (!name || !role) throw new Error("Name and role are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newWorker = {
        type: "worker",
        name: name.trim(),
        role: role.trim(),
        helmet: helmet === true,
        shoes: shoes === true,
        vest: vest === true,
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await safetyCollection.add(newWorker);
    return { id: docRef.id, ...newWorker };
};

exports.getWorkers = async (tenant_id) => {
    const snapshot = await getQuery("worker", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Return a default list if no workers exist yet
    if (results.length === 0) {
        const defaults = [
            { name: "Ravi Kumar", role: "Head Mason", helmet: true, shoes: true, vest: true },
            { name: "Selvam", role: "Helper", helmet: true, shoes: false, vest: true },
            { name: "Mani", role: "Carpenter", helmet: false, shoes: true, vest: true },
            { name: "Karthik", role: "Bar Bender", helmet: true, shoes: true, vest: false },
            { name: "Subbu", role: "Plumber", helmet: false, shoes: false, vest: true }
        ];

        const createdDefaults = [];
        for (const worker of defaults) {
            const added = await exports.addWorker(worker, tenant_id);
            createdDefaults.push(added);
        }
        return createdDefaults;
    }

    return results.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
};

exports.updateWorker = async (id, data, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "worker") throw new Error("Worker not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = {
        name: data.name ? data.name.trim() : doc.data().name,
        role: data.role ? data.role.trim() : doc.data().role,
        helmet: data.helmet !== undefined ? data.helmet === true : doc.data().helmet,
        shoes: data.shoes !== undefined ? data.shoes === true : doc.data().shoes,
        vest: data.vest !== undefined ? data.vest === true : doc.data().vest,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.deleteWorker = async (id, tenant_id) => {
    const docRef = safetyCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "worker") throw new Error("Worker not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Worker deleted successfully", id };
};
