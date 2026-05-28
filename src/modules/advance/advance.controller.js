// src/modules/advance/advance.controller.js

const advanceService = require("./advance.service");

/**
 * POST /api/advances
 * Create a new advance payment
 */
exports.createAdvance = async (req, res, next) => {
    try {
        const result = await advanceService.createAdvance(req.body, req.tenantId);
        res.status(201).json({ 
            success: true, 
            data: result,
            message: `Advance created successfully${result.paymentMethod === 'BANK' ? ' and bank balance updated with transaction record' : ''}`
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/advances
 * GET /api/advances?projectNo=P001
 * GET /api/advances/project/:projectNo
 * Get advances for a project or all advances
 */
exports.getAdvances = async (req, res, next) => {
    try {
        const projectNo = req.params.projectNo || req.query.projectNo;
        const result = await advanceService.getAdvances(projectNo, req.tenantId);
        res.status(200).json({ 
            success: true, 
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/advances/:id
 * Update an advance record
 * If amount or paymentMethod changes, bank balance and transactions are updated
 */
exports.updateAdvance = async (req, res, next) => {
    try {
        const result = await advanceService.updateAdvance(req.params.id, req.body, req.tenantId);
        res.status(200).json({ 
            success: true, 
            data: result,
            message: "Advance updated successfully and bank transactions adjusted if applicable"
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /api/advances/:id
 * Delete an advance record
 * If paymentMethod was BANK, the bank balance will be reverted with transaction record
 */
exports.deleteAdvance = async (req, res, next) => {
    try {
        const result = await advanceService.deleteAdvance(req.params.id, req.tenantId);
        res.status(200).json({ 
            success: true, 
            ...result,
            message: "Advance deleted successfully and bank balance adjusted with reverse transaction"
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/advances/bank/:bankId/transactions
 * Get transaction history for a specific bank account
 */
exports.getBankTransactionHistory = async (req, res, next) => {
    try {
        const { bankId } = req.params;
        const result = await advanceService.getBankTransactionHistory(bankId, req.tenantId);
        res.status(200).json({ 
            success: true, 
            data: result,
            message: "Bank transaction history retrieved successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = exports;