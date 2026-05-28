const labourService = require("./labour.service");
const workService = require("../work/work.service");

// ─── Head Labour Master CRUD ────────────────────────────────────────────────

exports.addMasterLabour = async (req, res) => {
    try {
        if (!req.body.name) {
            return res.status(400).json({ error: "name is required" });
        }
        const result = await labourService.addLabourMaster(req.body, req.tenantId);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};



exports.updateMasterLabour = async (req, res) => {
    try {
        const result = await labourService.updateLabourMaster(req.params.id, req.body, req.tenantId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteMasterLabour = async (req, res) => {
    try {
        const result = await labourService.deleteLabourMaster(req.params.id, req.tenantId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getAllHeadLabours = async (req, res) => {
    try {
        const result = await labourService.getLabourMasters(req.tenantId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getHeadLabourById = async (req, res) => {
    try {
        const result = await labourService.getLabourMasterById(req.params.id, req.tenantId);
        res.json(result);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ NEW: Get filtered work details for specific labour
// GET /api/labours/master/:labourId/projects/:projectNo/works/:workId
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Returns work details filtered to show ONLY the specified labour's contribution.
 * 
 * Route: Suresh → PRO001 → Work123
 * Response: Shows ONLY Suresh's details in Work123, NOT other labours
 */
// exports.getLabourWorkDetails = async (req, res) => {
//     try {
//         const { labourId, projectNo, workId } = req.params;

//         // Get full work details
//         const work = await workService.getWorkById(workId, projectNo);

//         // Filter to show ONLY this labour's details
//         const filteredWork = {
//             workId: work.workId,
//             projectNo: work.projectNo,
//             work: work.work,
//             workName: work.workName,
//             date: work.date,
//             tomorrowWork: work.tomorrowWork,
//             materialUsed: work.materialUsed,
//             materialRequired: work.materialRequired,
//             materialSummary: work.materialSummary,
//             materialReceived: work.materialReceived,
//             inStock: work.inStock,
//             status: work.status,
//             siteExpenses: work.siteExpenses,
//             remainingBalance: work.remainingBalance,
//             advanceReceived: work.advanceReceived,
//             createdAt: work.createdAt,
//             updatedAt: work.updatedAt,
//             // ⚠️ CRITICAL: Only include THIS labour's details
//             labourDetails: {}
//         };

//         // Extract only the specific labour's data from labourDetails
//         if (work.labourDetails && work.labourDetails[labourId]) {
//             filteredWork.labourDetails = {
//                 [labourId]: work.labourDetails[labourId]
//             };
//         }

//         res.status(200).json({
//             success: true,
//             data: filteredWork
//         });
//     } catch (error) {
//         res.status(404).json({
//             success: false,
//             error: error.message
//         });
//     }
// };

// ─── Sub-Labour Type CRUD ───────────────────────────────────────────────────

exports.addOtherType = async (req, res) => {
    try {
        const typeName = req.body.labourType || req.body.typeName;

        if (!typeName) {
            return res.status(400).json({ error: "labourType or typeName is required" });
        }

        const result = await labourService.addOtherSubLabourType(typeName);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getAllSubTypes = async (req, res) => {
    try {
        const result = await labourService.getSubLabourTypes();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── Sub-Labour Type Edit & Delete ──────────────────────────────────────────

exports.updateSubType = async (req, res) => {
    try {
        const result = await labourService.updateSubLabourType(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteSubType = async (req, res) => {
    try {
        const result = await labourService.deleteSubLabourType(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.getWorksByLabour = async (req, res) => {
    try {
        const { labourId } = req.params;
        const result = await workService.getWorksByLabour(labourId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getLabourProjectWorks = async (req, res) => {
    try {
        const { labourId, projectNo } = req.params;
        
        // Get all works by this labour
        const allData = await workService.getWorksByLabour(labourId);
        
        // Filter to specific project
        const project = allData.projects.find(p => p.projectNo === projectNo);
        
        if (!project) {
            return res.status(404).json({
                success: false,
                message: `Labour has no work in project ${projectNo}`
            });
        }
        
        res.status(200).json({
            success: true,
            data: {
                labourId,
                projectNo,
                projectName: project.projectName,
                works: project.works,
                totalWorks: project.totalWorks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};// ═════════════════════════════════════════════════════════════════════════════
// ─── LABOUR PAYMENTS (ADD THIS TO THE END OF labour.controller.js) ────────
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/labours/:labourId/:projectNo/payment
 * Record a new labour payment
 */
exports.recordPayment = async (req, res) => {
    try {
        const { labourId, projectNo } = req.params;

        if (!labourId || !projectNo) {
            return res.status(400).json({
                success: false,
                message: "labourId and projectNo are required"
            });
        }

        const result = await labourService.recordLabourPayment(
            labourId,
            projectNo,
            req.body,
            req.tenantId
        );

        res.status(201).json({
            success: true,
            message: "Payment recorded successfully",
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET /api/labours/:labourId/:projectNo/payments
 * Get all payments for a labour in a specific project
 */
exports.getProjectPayments = async (req, res) => {
    try {
        const { labourId, projectNo } = req.params;

        if (!labourId || !projectNo) {
            return res.status(400).json({
                success: false,
                message: "labourId and projectNo are required"
            });
        }

        const result = await labourService.getLabourPaymentsByProject(
            labourId,
            projectNo,
            req.tenantId
        );

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET /api/labours/:labourId/payments
 * Get all payments for a labour (across all projects)
 */
exports.getPaymentHistory = async (req, res) => {
    try {
        const { labourId } = req.params;

        if (!labourId) {
            return res.status(400).json({
                success: false,
                message: "labourId is required"
            });
        }

        const result = await labourService.getLabourPayments(labourId, req.tenantId);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET /api/labours/payment/:paymentId
 * Get payment details by ID
 */
exports.getPaymentDetails = async (req, res) => {
    try {
        const { paymentId } = req.params;

        const result = await labourService.getPaymentById(paymentId, req.tenantId);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * PUT /api/labours/payment/:paymentId
 * Update a labour payment
 */
exports.updatePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;

        const result = await labourService.updateLabourPayment(
            paymentId,
            req.body,
            req.tenantId
        );

        res.status(200).json({
            success: true,
            message: "Payment updated successfully",
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * DELETE /api/labours/payment/:paymentId
 * Delete a labour payment
 */
exports.deletePayment = async (req, res) => {
    try {
        const { paymentId } = req.params;

        const result = await labourService.deleteLabourPayment(paymentId, req.tenantId);

        res.status(200).json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = exports;