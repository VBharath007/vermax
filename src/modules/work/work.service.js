const { db } = require("../../config/firebase");
const { WORKS } = require("../../models/firestore.collections");
const labourService = require("../labour/labour.service");
const dayjs = require("dayjs");

const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");

dayjs.extend(isSameOrBefore);

const worksCollection = db.collection(WORKS);

// ─── Helpers ────────────────────────────────────────────────────────────────
const now = () => dayjs().format("DD-MM-YY HH:mm");

/**
 * Builds a live labourDetails object for enrichment.
 * Resolves the head labour's current name/contact from the registry.
 * Uses the stored counts if available, otherwise returns zeros.
 */
const buildLabourDetails = async (storedLabourDetails, preloadedMasters, preloadedSubTypes) => {
    if (
        !storedLabourDetails ||
        typeof storedLabourDetails !== "object" ||
        Object.keys(storedLabourDetails).length === 0
    ) {
        return {};
    }

    const masters = preloadedMasters || await labourService.getLabourMasters();
    const subTypes = preloadedSubTypes || await labourService.getSubLabourTypes();

    const fetchMasterInfo = (hId) => {
        let name = "N/A", phone = "N/A";
        const m = masters.find(x => x.id === hId);
        if (m) { name = m.name; phone = m.contact; }
        return { name, phone };
    };

    const processEntry = (entry) => {
        const subMap = {};
        subTypes.forEach(t => subMap[t.typeName] = 0);
        if (entry.subLabourDetails) {
            Object.keys(entry.subLabourDetails).forEach(k => {
                subMap[k] = entry.subLabourDetails[k];
            });
        }
        let { name, phone } = fetchMasterInfo(entry.headLabourId);

        return {
            headLabourId: entry.headLabourId,
            headLabourName: name !== "N/A" ? name : (entry.headLabourName || "N/A"),
            headLabourPhoneNumber: phone !== "N/A" ? phone : (entry.headLabourPhoneNumber || "N/A"),
            subLabourDetails: subMap,
            totalLabourCount: Object.values(subMap).reduce((s, v) => s + v, 0)
        };
    };

    // LEGACY SUPPORT: If old data hasn't been migrated yet, it will be a single flat object
    if (storedLabourDetails.headLabourId && typeof storedLabourDetails.headLabourId === 'string') {
        const processed = processEntry(storedLabourDetails);
        return { [processed.headLabourId]: processed };
    }

    // MULTIPLE HEAD LABOUR SUPPORT (Keyed Map)
    const newMap = {};
    for (const key of Object.keys(storedLabourDetails)) {
        newMap[key] = processEntry(storedLabourDetails[key]);
    }
    return newMap;
};

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LEGACY DATA MIGRATION: Convert old labour format to new structure
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Migrates legacy labour data into the new labourDetails structure.
 * 
 * OLD FORMAT (at root level):
 *   labourName: "Siva"
 *   labourPhone: "9876543210"
 *   labourEntries: [{sno: 1, workType: "FC", quantity: 2}, ...]
 *   labour: "FC (2), MC (3)"
 * 
 * NEW FORMAT (nested in labourDetails):
 *   labourDetails: {
 *     "labourId": {
 *       headLabourName: "Siva",
 *       headLabourPhoneNumber: "9876543210",
 *       subLabourDetails: { "FC": 2, "MC": 3 },
 *       totalLabourCount: 5
 *     }
 *   }
 */
const migrateLegacyLabourData = async (workData) => {
    // Check if migration is needed
    const hasLegacyData = workData.labourName || workData.labourEntries || workData.labour;
    const hasModernData = workData.labourDetails && Object.keys(workData.labourDetails).length > 0;

    // If already migrated or no legacy data, return as-is
    if (!hasLegacyData || hasModernData) {
        return workData;
    }

    // Build new labourDetails from legacy fields
    const labourName = workData.labourName || "Unknown Labour";
    const labourPhone = workData.labourPhone || "N/A";
    const labourEntries = workData.labourEntries || [];

    // Convert labourEntries to subLabourDetails
    const subLabourDetails = {};
    let totalLabourCount = 0;

    if (Array.isArray(labourEntries)) {
        labourEntries.forEach(entry => {
            const workType = (entry.workType || "UNKNOWN").toUpperCase();
            const quantity = Number(entry.quantity) || 0;
            subLabourDetails[workType] = (subLabourDetails[workType] || 0) + quantity;
            totalLabourCount += quantity;
        });
    }

    // Try to find the labour in master registry by name
    let headLabourId = `legacy_${labourName.toLowerCase().replace(/\s+/g, '_')}`;
    try {
        const master = await labourService.getLabourMasterByName(labourName);
        if (master && master.id) {
            headLabourId = master.id;
        }
    } catch (_) {
        // Labour not in registry, use legacy ID
    }

    // Create the new structure
    const newLabourDetails = {
        [headLabourId]: {
            headLabourId: headLabourId,
            headLabourName: labourName,
            headLabourPhoneNumber: labourPhone,
            subLabourDetails: subLabourDetails,
            totalLabourCount: totalLabourCount
        }
    };

    return {
        ...workData,
        labourDetails: newLabourDetails
    };
};

/**
 * Removes legacy labour fields from the root level.
 * These fields should only exist inside labourDetails.
 */
const cleanLegacyLabourFields = (workData) => {
    const legacyFields = [
        'labourPhone',
        'labourEntries',
        'labourName',
        'labour',
        'headLabourId',
        'headLabourName',
        'headLabourPhoneNumber'
    ];

    const cleaned = { ...workData };
    legacyFields.forEach(field => {
        delete cleaned[field];
    });

    return cleaned;
};

/**
 * CONCEPT:
 * - Each work name is UNIQUE per project (e.g. "Pillar shuttering" = 1 doc).
 * - Every day the user updates that work → same doc gets updated (date changes).
 * - tomorrowWork from today auto-fills as workName for next day on Flutter side.
 * - You CANNOT create two docs with the same workName for the same project.
 *
 * Upsert rule:
 * - workId provided                    → direct update by ID (edit flow).
 * - No workId, existing workName found → UPDATE that doc (regardless of date).
 * - No workId, new workName            → CREATE new doc.
 *
 * Example flow:
 *   Day 12: workName="Pillar shuttering", tomorrowWork="Ceiling shuttering" → NEW doc created
 *   Day 13: workName="Ceiling shuttering" (auto-filled from tomorrowWork)   → NEW doc created
 *   Day 13: workName="Pillar shuttering" again                               → UPDATES existing doc (not a new one)
 */
exports.createWork = async (workData, tenant_id) => {
    const { projectNo, work, tomorrowWork } = workData;
    if (!projectNo) throw new Error("projectNo is required");
    if (!tenant_id) throw new Error("tenant_id is required");

    if (!work || !work.trim()) {
        throw new Error("work (work name) is required. Please enter a work name before saving.");
    }

    const name = work.trim().toUpperCase();
    const workDate = dayjs().format("DD-MM-YYYY");

    const payload = {
        projectNo,
        work: name,
        workName: name,
        tomorrowWork: (tomorrowWork || "").trim(),
        date: workDate,
        createdAt: now(),
        labourDetails: {},
        tenant_id
    };

    let query = worksCollection
        .where("projectNo", "==", projectNo)
        .where("work", "==", name);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const existingSnapshot = await query.limit(1).get();

    if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        const updatePayload = { ...payload };
        delete updatePayload.createdAt;
        if (existingDoc.data().labourDetails !== undefined) {
            delete updatePayload.labourDetails;
        }
        updatePayload.updatedAt = now();

        await existingDoc.ref.update(updatePayload);
        const updated = await existingDoc.ref.get();
        const result = { workId: updated.id, ...updated.data() };
        delete result.labourDetails;  // ⚠️ REMOVE FROM RESPONSE
        return result;
    }

    const docRef = await worksCollection.add(payload);
    
    // If headLabourId was provided in workData, assign it immediately
    if (workData.headLabourId) {
        await exports.assignLabourToWork(projectNo, docRef.id, workData.headLabourId, workData.subLabourDetails);
        const finalDoc = await worksCollection.doc(docRef.id).get();
        const result = { workId: docRef.id, ...finalDoc.data() };
        delete result.labourDetails;
        return result;
    }

    const result = { workId: docRef.id, ...payload };
    delete result.labourDetails;  // ⚠️ REMOVE FROM RESPONSE
    return result;
};

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGN HEAD LABOUR TO A WORK  (Hierarchical Labour Assignment)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Links a headLabourId from the Master Registry to a specific work document.
 *
 * @param {string} projectNo   – must match the work's projectNo
 * @param {string} workId      – Firestore doc ID of the work
 * @param {string} headLabourId – Firestore doc ID from labourMaster collection
 * @param {object} [subLabourDetails] – optional override: { "MASON": 4, "MC": 3, ... }
 */
exports.assignLabourToWork = async (projectNo, workId, headLabourId, subLabourDetails, tenant_id) => {
    const workRef = worksCollection.doc(workId);
    const workDoc = await workRef.get();
    if (!workDoc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && workDoc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    const docData = workDoc.data();
    if (docData.projectNo !== projectNo) {
        throw new Error(`Work '${workId}' does not belong to project '${projectNo}'`);
    }

    const master = await labourService.getLabourMasterById(headLabourId);

    // Convert legacy object into a keyed map if necessary
    let map = docData.labourDetails || {};
    if (map.headLabourId && typeof map.headLabourId === 'string') {
        map = { [map.headLabourId]: map };
    }

    // Establish the isolated entry for this specific Head Labour
    const existingEntry = map[master.id] || {};

    map[master.id] = {
        ...existingEntry,
        headLabourId: master.id,
        headLabourName: master.name,
        headLabourPhoneNumber: master.contact
    };

    if (subLabourDetails && typeof subLabourDetails === 'object') {
        const subMap = {};
        for (const [key, val] of Object.entries(subLabourDetails)) {
            subMap[key.trim().toUpperCase()] = Number(val) || 0;
        }
        map[master.id].subLabourDetails = subMap;
        map[master.id].totalLabourCount = Object.values(subMap).reduce((s, v) => s + v, 0);
    }

    await workRef.update({
        [`labourDetails.${master?.id || headLabourId}`]: map[master?.id || headLabourId],
        updatedAt: now()
    });

    const updated = await workRef.get();
    const finalData = { workId: updated.id, ...updated.data() };
    finalData.labourDetails = await buildLabourDetails(finalData.labourDetails);

    return finalData;
};

/**
 * Updates ONLY the sub-labour counts for a specific work log.
 * Merges with existing sub-labour details.
 */
exports.updateSubLabourForWork = async (projectNo, workId, labourId, subLabourDetails, tenant_id) => {
    const workRef = worksCollection.doc(workId);
    const workDoc = await workRef.get();
    if (!workDoc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && workDoc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const docData = workDoc.data();
    if (docData.projectNo !== projectNo) {
        throw new Error(`Work '${workId}' does not belong to project '${projectNo}'`);
    }

    let map = docData.labourDetails || {};
    if (map.headLabourId && typeof map.headLabourId === 'string') {
        map = { [map.headLabourId]: map };
    }

    if (!map[labourId]) {
        throw new Error(`Head Labour ID '${labourId}' is not assigned to this work entry. Please assign them first.`);
    }

    const entry = map[labourId];
    const incomingSubMap = {};
    if (subLabourDetails && typeof subLabourDetails === 'object') {
        for (const [key, val] of Object.entries(subLabourDetails)) {
            const type = key.trim().toUpperCase();
            const count = Number(val) || 0;
            incomingSubMap[type] = count;
        }
    }

    // Merge with existing subLabourDetails
    entry.subLabourDetails = { ...(entry.subLabourDetails || {}), ...incomingSubMap };
    entry.totalLabourCount = Object.values(entry.subLabourDetails).reduce((s, v) => s + v, 0);

    await workRef.update({
        [`labourDetails.${labourId}`]: map[labourId],
        updatedAt: now()
    });

    const updated = await workRef.get();
    const finalData = { workId: updated.id, ...updated.data() };
    finalData.labourDetails = await buildLabourDetails(finalData.labourDetails);

    return finalData;
};

/**
 * Edit a single sub-labour type count
 */
exports.editSubLabourCount = async (projectNo, workId, labourId, type, count, tenant_id) => {
    const workRef = worksCollection.doc(workId);
    const workDoc = await workRef.get();
    if (!workDoc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && workDoc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const docData = workDoc.data();
    if (docData.projectNo !== projectNo) {
        throw new Error(`Work '${workId}' does not belong to project '${projectNo}'`);
    }

    let map = docData.labourDetails || {};
    if (map.headLabourId && typeof map.headLabourId === 'string') {
        map = { [map.headLabourId]: map };
    }

    if (!map[labourId]) {
        throw new Error(`Labour ID '${labourId}' not assigned to this work`);
    }

    const entry = map[labourId];
    const normalizedType = type.trim().toUpperCase();
    entry.subLabourDetails = entry.subLabourDetails || {};
    entry.subLabourDetails[normalizedType] = Number(count) || 0;
    entry.totalLabourCount = Object.values(entry.subLabourDetails).reduce((s, v) => s + v, 0);

    await workRef.update({
        [`labourDetails.${labourId}`]: map[labourId],
        updatedAt: now()
    });

    const updated = await workRef.get();
    const finalData = { workId: updated.id, ...updated.data() };
    finalData.labourDetails = await buildLabourDetails(finalData.labourDetails);

    return finalData;
};

/**
 * Delete a specific sub-labour type entry
 */
exports.deleteSubLabourType = async (projectNo, workId, labourId, type, tenant_id) => {
    const workRef = worksCollection.doc(workId);
    const workDoc = await workRef.get();
    if (!workDoc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && workDoc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const docData = workDoc.data();
    if (docData.projectNo !== projectNo) {
        throw new Error(`Work '${workId}' does not belong to project '${projectNo}'`);
    }

    let map = docData.labourDetails || {};
    if (map.headLabourId && typeof map.headLabourId === 'string') {
        map = { [map.headLabourId]: map };
    }

    if (!map[labourId]) {
        throw new Error(`Labour ID '${labourId}' not assigned to this work`);
    }

    const entry = map[labourId];
    const normalizedType = type.trim().toUpperCase();

    if (entry.subLabourDetails && entry.subLabourDetails[normalizedType] !== undefined) {
        delete entry.subLabourDetails[normalizedType];
        entry.totalLabourCount = Object.values(entry.subLabourDetails).reduce((s, v) => s + v, 0);
    }

    await workRef.update({
        labourDetails: map,
        updatedAt: now()
    });

    const updated = await workRef.get();
    const finalData = { workId: updated.id, ...updated.data() };
    finalData.labourDetails = await buildLabourDetails(finalData.labourDetails);

    return finalData;
};



// ═══════════════════════════════════════════════════════════════════════════
// GET WORKS (with live labour enrichment)
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorks = async (projectNo, tenant_id) => {
    let query = worksCollection;
    if (projectNo) {
        query = query.where("projectNo", "==", projectNo);
    }
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();
    let works = snapshot.docs.map((doc) => ({ workId: doc.id, ...doc.data() }));

    // Preload masters and subTypes in parallel to avoid duplicate DB calls in the loop
    const [masters, subTypes] = await Promise.all([
        labourService.getLabourMasters(),
        labourService.getSubLabourTypes()
    ]);

    // Migrate legacy data, enrich, and clean
    for (let i = 0; i < works.length; i++) {
        works[i] = await migrateLegacyLabourData(works[i]); // ⚠️ MIGRATE FIRST
        works[i].labourDetails = await buildLabourDetails(works[i].labourDetails, masters, subTypes);
        works[i] = cleanLegacyLabourFields(works[i]); // ⚠️ CLEAN LEGACY
    }


    // Sort by date DESC (Latest First), then work name ASC
    return works.sort((a, b) => {
        const valA = _parseD(a.date).valueOf();
        const valB = _parseD(b.date).valueOf();

        const isAValid = !isNaN(valA);
        const isBValid = !isNaN(valB);

        // Push invalid dates to the bottom
        if (!isAValid && !isBValid) return 0;
        if (!isAValid) return 1;
        if (!isBValid) return -1;

        // Latest First (DESC)
        if (valB !== valA) return valB - valA;
        
        return (a.work || "").localeCompare(b.work || "");
    });
};


// ═══════════════════════════════════════════════════════════════════════════
// OPTIMIZED: Fast getWorkById - Only process what exists
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorkById = async (workId, projectNo = null, tenant_id = null, labourId = null) => {
    const doc = await worksCollection.doc(workId).get();
    if (!doc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    let work = { workId: doc.id, ...doc.data() };

    if (projectNo && work.projectNo !== projectNo) {
        throw new Error(`Work log '${workId}' does not belong to project '${projectNo}'`);
    }

    // ⚠️ PERFORMANCE: Only process labour if it exists
    const hasLegacyLabour = work.labourName || work.labourEntries;
    const hasModernLabour = work.labourDetails && Object.keys(work.labourDetails).length > 0;

    if (hasLegacyLabour || hasModernLabour) {
        // Migrate legacy format if needed
        if (hasLegacyLabour && !hasModernLabour) {
            work = await migrateLegacyLabourData(work);
        }

        // Enrich ONLY if labour exists
        if (work.labourDetails && Object.keys(work.labourDetails).length > 0) {
            work.labourDetails = await buildLabourDetails(work.labourDetails);

            // Filter by labourId if provided
            if (labourId) {
                work.labourDetails = work.labourDetails[labourId]
                    ? { [labourId]: work.labourDetails[labourId] }
                    : {};
            }

            // Remove if empty after filter
            if (Object.keys(work.labourDetails).length === 0) {
                delete work.labourDetails;
            }
        } else {
            delete work.labourDetails;
        }

        // Clean legacy fields
        work = cleanLegacyLabourFields(work);
    } else {
        // No labour data - remove field completely
        delete work.labourDetails;
    }

    return work;
};





exports.updateWork = async (workId, updateData, tenant_id) => {
    const docRef = worksCollection.doc(workId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    delete updateData.workId;
    delete updateData.createdAt;
    updateData.updatedAt = now();

    // Normalize work names if being updated
    if (updateData.work) updateData.work = updateData.work.trim().toUpperCase();
    if (updateData.workName) updateData.workName = updateData.workName.trim().toUpperCase();
    // If labourDetails is provided in updateData, merge it with existing
    if (updateData.labourDetails && typeof updateData.labourDetails === 'object') {
        const existingData = doc.data();
        updateData.labourDetails = { ...(existingData.labourDetails || {}), ...updateData.labourDetails };
    }

    await docRef.update(updateData);
    const updated = await docRef.get();
    return { workId: updated.id, ...updated.data() };
};

exports.deleteWork = async (workId, tenant_id) => {
    const docRef = worksCollection.doc(workId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Work log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
    await docRef.delete();
    return { message: "Work log deleted successfully" };
};

// Date parsing helper to handle arbitrary YYYY-MM-DD or DD-MM-YYYY formats.
const _parseD = (dString) => {
    if (!dString) return null;
    const parts = String(dString).split("T")[0].split("-");
    if (parts.length === 3) {
        if (parts[0].length === 4) return dayjs(`${parts[0]}-${parts[1]}-${parts[2]}`);
        if (parts[2].length === 4) return dayjs(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return dayjs(dString);
};

// Generates both forward and inverse date string formats for Firestore querying.
const _generateDateVariations = (fromStr, toStr) => {
    const fromD = _parseD(fromStr);
    let toD = _parseD(toStr) || fromD;

    if (!fromD || !fromD.isValid()) return [];

    let current = fromD;
    const variations = [];
    while (current.valueOf() <= toD.valueOf()) {
        variations.push(current.format("DD-MM-YYYY"));
        variations.push(current.format("YYYY-MM-DD"));
        current = current.add(1, 'day');
    }
    return [...new Set(variations)];
};

// ═══════════════════════════════════════════════════════════════════════════
// FETCH WORK ON A SINGLE DATE
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorkByDate = async (projectNo, date, tenant_id) => {
    if (!projectNo) throw new Error("projectNo is required");
    if (!date) throw new Error("date is required (DD-MM-YYYY or YYYY-MM-DD format)");

    const parsedD = _parseD(date);
    if (!parsedD || !parsedD.isValid()) {
        throw new Error(`Invalid date format: ${date}. Use DD-MM-YYYY or YYYY-MM-DD`);
    }

    const ddMMYYYY = parsedD.format("DD-MM-YYYY");
    const yyyyMMDD = parsedD.format("YYYY-MM-DD");

    let query = worksCollection
        .where("projectNo", "==", projectNo)
        .where("date", "in", [ddMMYYYY, yyyyMMDD]);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    const snapshot = await query.get();

    if (snapshot.empty) return [];

    let works = snapshot.docs.map(doc => ({ workId: doc.id, ...doc.data() }));

    // Preload masters and subTypes in parallel to avoid duplicate DB calls in the loop
    const [masters, subTypes] = await Promise.all([
        labourService.getLabourMasters(),
        labourService.getSubLabourTypes()
    ]);

    // Migrate, enrich, and clean
    for (let i = 0; i < works.length; i++) {
        works[i] = await migrateLegacyLabourData(works[i]); // ⚠️ MIGRATE
        works[i].labourDetails = await buildLabourDetails(works[i].labourDetails, masters, subTypes);
        works[i] = cleanLegacyLabourFields(works[i]); // ⚠️ CLEAN
    }

    return works;
};

// ═══════════════════════════════════════════════════════════════════════════
// FETCH WORKS IN A DATE RANGE (Week View)
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorksByWeek = async (projectNo, fromDate, toDate, tenant_id) => {
    if (!projectNo) throw new Error("projectNo is required");
    if (!fromDate || !toDate) throw new Error("Both 'from' and 'to' dates are required");

    const fromD = _parseD(fromDate);
    const toD = _parseD(toDate);

    if (!fromD || !fromD.isValid() || !toD || !toD.isValid()) {
        throw new Error("Invalid date format. Use DD-MM-YYYY or YYYY-MM-DD");
    }

    const dateVariations = _generateDateVariations(fromDate, toDate);

    // Firestore "in" supports max 30 values
    const chunks = [];
    for (let i = 0; i < dateVariations.length; i += 30) {
        chunks.push(dateVariations.slice(i, i + 30));
    }

    const allSnaps = await Promise.all(
        chunks.map(chunk => {
            let query = worksCollection
                .where("projectNo", "==", projectNo)
                .where("date", "in", chunk);
            if (tenant_id && tenant_id !== 'GLOBAL') {
                query = query.where("tenant_id", "==", tenant_id);
            }
            return query.get();
        })
    );

    const workMap = new Map();
    allSnaps.forEach(snap => {
        snap.docs.forEach(doc => {
            workMap.set(doc.id, { workId: doc.id, ...doc.data() });
        });
    });

    let works = Array.from(workMap.values());

    // Preload masters and subTypes in parallel to avoid duplicate DB calls in the loop
    const [masters, subTypes] = await Promise.all([
        labourService.getLabourMasters(),
        labourService.getSubLabourTypes()
    ]);

    // Migrate, enrich, and clean
    for (let i = 0; i < works.length; i++) {
        works[i] = await migrateLegacyLabourData(works[i]); // ⚠️ MIGRATE
        works[i].labourDetails = await buildLabourDetails(works[i].labourDetails, masters, subTypes);
        works[i] = cleanLegacyLabourFields(works[i]); // ⚠️ CLEAN
    }

    // Sort by date ascending
    works.sort((a, b) => {
        const aD = _parseD(a.date);
        const bD = _parseD(b.date);
        if (!aD || !bD) return 0;
        return aD.valueOf() - bD.valueOf();
    });

    return works;
};

// ═══════════════════════════════════════════════════════════════════════════
// REVERSE LOOKUP — all works/projects a labour was assigned to
// GET /api/labours/master/:labourId/works
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorksByLabour = async (labourId, tenant_id) => {
    if (!labourId) throw new Error("labourId is required");

    // Fetch master labour to get name for legacy string-based query
    let master = null;
    try {
        master = await labourService.getLabourMasterById(labourId);
    } catch (_) { } // Proceed even if master not found

    let legacyNames = [];
    if (master && master.name) {
        const raw = master.name;
        const lower = raw.toLowerCase();
        const upper = raw.toUpperCase();
        const title = lower.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        legacyNames = Array.from(new Set([raw, lower, upper, title]));
    }

    let q1 = worksCollection.orderBy(`labourDetails.${labourId}.headLabourId`);
    let q2 = worksCollection.where("labourDetails.headLabourId", "==", labourId);

    if (tenant_id && tenant_id !== 'GLOBAL') {
        q1 = q1.where("tenant_id", "==", tenant_id);
        q2 = q2.where("tenant_id", "==", tenant_id);
    }

    const queries = [
        // Modern keyed-map format — uses orderBy as "field exists" check
        q1.get(),
        // Legacy flat format (pre-migration)
        q2.get(),
    ];

    if (legacyNames.length > 0) {
        let q3 = worksCollection.where("labourName", "in", legacyNames);
        if (tenant_id && tenant_id !== 'GLOBAL') {
            q3 = q3.where("tenant_id", "==", tenant_id);
        }
        queries.push(q3.get());
    }

    const snapshots = await Promise.all(queries);

    const worksMap = new Map();
    snapshots.forEach(snapshot => {
        if (!snapshot.empty) {
            snapshot.docs.forEach(doc => worksMap.set(doc.id, { workId: doc.id, ...doc.data() }));
        }
    });

    if (worksMap.size === 0) return { projects: [], totalWorks: 0 };

    const works = Array.from(worksMap.values());

    // Preload masters and subTypes in parallel to avoid duplicate DB calls in the loop
    const [masters, subTypes] = await Promise.all([
        labourService.getLabourMasters(),
        labourService.getSubLabourTypes()
    ]);

    // Enrich and Migrate each work entry to ensure consistent format
    for (let i = 0; i < works.length; i++) {
        works[i] = await migrateLegacyLabourData(works[i]);
        works[i].labourDetails = await buildLabourDetails(works[i].labourDetails, masters, subTypes);
        works[i] = cleanLegacyLabourFields(works[i]);
    }

    // Resolve project names (efficient batch fetch)
    const uniqueProjectNos = [...new Set(works.map(w => w.projectNo))];
    const projectNames = {};
    if (uniqueProjectNos.length > 0) {
        for (let i = 0; i < uniqueProjectNos.length; i += 30) {
            const chunk = uniqueProjectNos.slice(i, i + 30);
            const snap = await db.collection("projects").where("projectNo", "in", chunk).get();
            snap.forEach(doc => {
                projectNames[doc.data().projectNo] = doc.data().projectName;
            });
        }
    }

    // Group by projectNo
    const projectMap = {};
    works.forEach(w => {
        const pNo = w.projectNo;
        if (!projectMap[pNo]) {
            projectMap[pNo] = {
                projectNo: pNo,
                projectName: projectNames[pNo] || pNo, // Attach projectName here!
                works: [],
            };
        }

        // Identify correct entry
        let subLabourDetails = {};
        let totalLabourCount = 0;

        // Since we ran buildLabourDetails, it's a keyed map now
        if (w.labourDetails && w.labourDetails[labourId]) {
            subLabourDetails = w.labourDetails[labourId].subLabourDetails || {};
            totalLabourCount = w.labourDetails[labourId].totalLabourCount || 0;
        } else if (w.labourEntries && Array.isArray(w.labourEntries)) {
            // Handle legacy array "labourEntries" from Flutter app
            w.labourEntries.forEach(entry => {
                const type = (entry.workType || "UNKNOWN").toUpperCase();
                const qty = Number(entry.quantity) || 0;
                subLabourDetails[type] = (subLabourDetails[type] || 0) + qty;
                totalLabourCount += qty;
            });
        }

        // Only include this day if the labour actually participated with count > 0
        if (totalLabourCount > 0) {
            projectMap[pNo].works.push({
                workId: w.workId,
                work: w.work || w.workName,               // Fallback matching general API
                workName: w.work || w.workName,
                projectName: projectNames[pNo] || pNo, // Fallback project name
                date: w.date,
                tomorrowWork: w.tomorrowWork || "",
                subLabourDetails,                      // specific to THIS labour
                totalLabourCount,                      // specific to THIS labour
            });
        }
    });

    // Sort each project's works by date desc
    const projects = Object.values(projectMap).map(p => ({
        ...p,
        works: p.works.sort((a, b) => {
            const valA = _parseD(a.date).valueOf();
            const valB = _parseD(b.date).valueOf();
            
            const isAValid = !isNaN(valA);
            const isBValid = !isNaN(valB);

            if (!isAValid && !isBValid) return 0;
            if (!isAValid) return 1;
            if (!isBValid) return -1;

            return valB - valA; // Latest First (DESC)
        }),
        latestDate: p.works[0]?.date || null,
        totalWorks: p.works.length,
    }));

    // Remove any projects that ended up with 0 works after filtering
    const validProjects = projects.filter(p => p.totalWorks > 0);

    return {
        labourId,
        projects: validProjects,
        totalWorks: validProjects.reduce((sum, p) => sum + p.totalWorks, 0),
    };
};



exports.updateWorkDate = async (projectNo, workId, newDate, tenant_id) => {
    if (!projectNo) throw new Error("projectNo is required");
    if (!workId) throw new Error("workId is required");
    if (!newDate) throw new Error("date is required");

    // ── Manual DD-MM-YYYY validation (no dayjs dependency) ───────────────────
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = newDate.match(dateRegex);
    if (!match) {
        throw new Error("Invalid date format. Use DD-MM-YYYY (e.g., 05-04-2026)");
    }

    const [, dd, mm, yyyy] = match;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    const year = parseInt(yyyy, 10);

    // Validate actual calendar date
    const testDate = new Date(year, month - 1, day);
    if (
        testDate.getDate() !== day ||
        testDate.getMonth() !== month - 1 ||
        testDate.getFullYear() !== year
    ) {
        throw new Error("Invalid calendar date");
    }

    const formattedDate = `${dd}-${mm}-${yyyy}`;

    // ── Fetch work doc ───────────────────────────────────────────────────────
    const docRef = worksCollection.doc(workId);
    const doc = await docRef.get();

    if (!doc.exists) {
        throw new Error(`Work '${workId}' not found`);
    }

    if (doc.data().projectNo !== projectNo) {
        throw new Error(`Work '${workId}' does not belong to project '${projectNo}'`);
    }
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.update({
        date: formattedDate,
        updatedAt: now(),
    });

    const updated = await docRef.get();
    return { workId: updated.id, ...updated.data() };
};
