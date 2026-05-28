const workService = require("./work.service");
const labourService = require("../labour/labour.service");
const { db } = require("../../config/firebase");
const { WORKS } = require("../../models/firestore.collections");




exports.createWork = async (req, res, next) => {
    try {
        const result = await workService.createWork(req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getWorks = async (req, res, next) => {
    try {
        const projectNo = req.params.projectNo || req.query.projectNo;
        const result = await workService.getWorks(projectNo, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWorkById = async (req, res, next) => {
    try {
        const { workId, projectNo } = req.params;
        const result = await workService.getWorkById(workId, projectNo, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};


exports.updateWork = async (req, res, next) => {
    try {
        const result = await workService.updateWork(req.params.workId, req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteWork = async (req, res, next) => {
    try {
        const result = await workService.deleteWork(req.params.workId, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getWorkByDate = async (req, res) => {
    try {
        const { projectNo, date } = req.params;

        if (!projectNo || !date) {
            return res.status(400).json({ success: false, message: "projectNo and date are required" });
        }

        const result = await workService.getWorkByDate(projectNo, date, req.tenantId);

        // If result is empty, we still return success: true but with an empty list
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getWorksByWeek = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: "Query params 'from' and 'to' are required"
            });
        }

        const result = await workService.getWorksByWeek(projectNo, from, to, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Hierarchical Labour Assignment
// POST /api/works/project/:projectNo/:workId/master
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Accepts EITHER:
 *   { "headLabourId": "<doc ID>" }
 * OR:
 *   { "name": "ALAGAR", "contact": "1234567890" }
 *
 * If name is given:
 *   - Looks up existing master by name.
 *   - If not found, auto-registers a new master, then links.
 *
 * Optional: "subLabourDetails": { "MASON": 4, "MC": 3 }
 */
exports.assignLabourToWork = async (req, res) => {
    try {
        const { projectNo, workId } = req.params;
        let { headLabourId, name, contact, subLabourDetails } = req.body;

        // Resolve headLabourId from name if not provided directly
        if (!headLabourId && name) {
            let master;
            try {
                master = await labourService.getLabourMasterByName(name);
            } catch (_) {
                // Master not found → auto-register
                master = await labourService.addLabourMaster({ name, contact: contact || "N/A" });
            }
            headLabourId = master.id;
        }

        if (!headLabourId) {
            return res.status(400).json({
                success: false,
                message: "Provide either 'headLabourId' or 'name' in request body"
            });
        }

        const result = await workService.assignLabourToWork(
            projectNo, workId, headLabourId, subLabourDetails, req.tenantId
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Update Sub-Labour Counts
// POST /api/works/project/:projectNo/:workId/sublabour
// ═══════════════════════════════════════════════════════════════════════════
exports.updateSubLabourForWork = async (req, res) => {
    try {
        const { projectNo, workId, labourId } = req.params;
        const { subLabourDetails } = req.body;

        if (!subLabourDetails || typeof subLabourDetails !== 'object') {
            return res.status(400).json({ success: false, message: "subLabourDetails (object) is required" });
        }

        const result = await workService.updateSubLabourForWork(
            projectNo, workId, labourId, subLabourDetails, req.tenantId
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};



// ═══════════════════════════════════════════════════════════════════════════
// Project-Based Labour Retrieval
// GET /api/works/project/:projectNo/labour
// ═══════════════════════════════════════════════════════════════════════════
exports.getLabourByProject = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const works = await workService.getWorks(projectNo, req.tenantId);

        const labourMap = {};

        works.forEach(w => {
            const lmap = w.labourDetails || {};

            const addLabour = (lEntry) => {
                if (!lEntry.headLabourName) return;

                const key = lEntry.headLabourId || lEntry.headLabourName;

                if (!labourMap[key]) {
                    labourMap[key] = {
                        headLabourId: lEntry.headLabourId,
                        headLabourName: lEntry.headLabourName,
                        headLabourPhone: lEntry.headLabourPhoneNumber,
                        distribution: {},
                        totalLabourCount: 0,
                    };
                }

                const dest = labourMap[key];

                // Aggregate sub-labours
                if (lEntry.subLabourDetails) {
                    Object.entries(lEntry.subLabourDetails).forEach(([type, count]) => {
                        dest.distribution[type] = (dest.distribution[type] || 0) + (Number(count) || 0);
                    });
                }

                dest.totalLabourCount += (lEntry.totalLabourCount ?? 0);
            };

            // Legacy single-object support
            if (lmap.headLabourId && typeof lmap.headLabourId === 'string') {
                addLabour(lmap);
                return;
            }

            // Multi-head-labour support (keyed map)
            Object.values(lmap).forEach(l => addLabour(l));
        });

        const projectLabourHistory = Object.values(labourMap).map(l => ({
            headLabourId: l.headLabourId,
            headLabour: l.headLabourName,
            headLabourPhone: l.headLabourPhone,
            distribution: l.distribution,
            totalLabourCount: l.totalLabourCount
        }));

        res.json({ success: true, projectNo, history: projectLabourHistory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// ═══════════════════════════════════════════════════════════════════════════
// Global Labour Retrieval (All Projects)
// GET /api/works/labour
// ═══════════════════════════════════════════════════════════════════════════
exports.getAllLabour = async (req, res) => {
    try {
        const works = await workService.getWorks(null, req.tenantId); // null means all projects

        const labourMap = {};

        works.forEach(w => {
            const lmap = w.labourDetails || {};

            const addLabour = (lEntry) => {
                if (!lEntry.headLabourName) return;

                const key = lEntry.headLabourId || lEntry.headLabourName;

                if (!labourMap[key]) {
                    labourMap[key] = {
                        headLabourId: lEntry.headLabourId,
                        headLabourName: lEntry.headLabourName,
                        headLabourPhone: lEntry.headLabourPhoneNumber,
                        distribution: {},
                        totalLabourCount: 0,
                    };
                }

                const dest = labourMap[key];

                if (lEntry.subLabourDetails) {
                    Object.entries(lEntry.subLabourDetails).forEach(([type, count]) => {
                        dest.distribution[type] = (dest.distribution[type] || 0) + (Number(count) || 0);
                    });
                }

                dest.totalLabourCount += (lEntry.totalLabourCount ?? 0);
            };

            if (lmap.headLabourId && typeof lmap.headLabourId === 'string') {
                addLabour(lmap);
                return;
            }

            Object.values(lmap).forEach(l => addLabour(l));
        });

        const globalLabourHistory = Object.values(labourMap).map(l => ({
            headLabourId: l.headLabourId,
            headLabour: l.headLabourName,
            headLabourPhone: l.headLabourPhone,
            distribution: l.distribution,
            totalLabourCount: l.totalLabourCount
        }));

        res.json({ success: true, history: globalLabourHistory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Edit one sub-labour type count
// PUT /api/works/project/:projectNo/:workId/sublabour/:type
// Body: { "count": 5 }
// ═══════════════════════════════════════════════════════════════════════════
exports.editSubLabourCount = async (req, res) => {
    try {
        const { projectNo, workId, labourId, type } = req.params;
        const { count } = req.body;

        if (count === undefined || count === null) {
            return res.status(400).json({ success: false, message: "'count' is required in body" });
        }

        const result = await workService.editSubLabourCount(projectNo, workId, labourId, type, count, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Delete one sub-labour type from a work
// DELETE /api/works/project/:projectNo/:workId/sublabour/:type
// ═══════════════════════════════════════════════════════════════════════════
exports.deleteSubLabourType = async (req, res) => {
    try {
        const { projectNo, workId, labourId, type } = req.params;
        const result = await workService.deleteSubLabourType(projectNo, workId, labourId, type, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/works/project/:projectNo/week?from=16-03-2026&to=21-03-2026
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorksByWeek = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: "Query params 'from' and 'to' are required (DD-MM-YYYY)"
            });
        }

        const result = await workService.getWorksByWeek(projectNo, from, to, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/labours/master/:labourId/works  (handled via work routes)
// ═══════════════════════════════════════════════════════════════════════════
exports.getWorksByLabour = async (req, res) => {
    try {
        const { labourId } = req.params;
        const result = await workService.getWorksByLabour(labourId, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};








exports.updateWorkDate = async (req, res) => {
    try {
        const { projectNo, workId } = req.params;
        const { date } = req.body;

        const result = await workService.updateWorkDate(projectNo, workId, date, req.tenantId);
        res.status(200).json({
            success: true,
            message: "Work date updated successfully",
            data: result,
        });
    } catch (err) {
        console.error("Update work date error:", err);
        res.status(400).json({
            success: false,
            message: err.message,
        });
    }
};