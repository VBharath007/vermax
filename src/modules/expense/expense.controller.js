const expenseService = require("./expense.service");

exports.createExpense = async (req, res, next) => {
    try {
        const result = await expenseService.createExpense(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getExpenses = async (req, res, next) => {
    try {
        const projectNo = req.params.projectNo || req.query.projectNo;
        const result = await expenseService.getExpenses(projectNo, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateExpense = async (req, res, next) => {
    try {
        const result = await expenseService.updateExpense(req.params.id, req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deleteExpense = async (req, res, next) => {
    try {
        const result = await expenseService.deleteExpense(req.params.id, req.tenantId);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getFinancialHistory = async (req, res, next) => {
    try {
        const projectNo = req.params.projectNo || req.query.projectNo;
        const result = await expenseService.getFinancialHistory(projectNo, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
