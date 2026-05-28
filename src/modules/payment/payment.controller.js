const paymentService = require("./payment.service");

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/payments
// ═══════════════════════════════════════════════════════════════════════════
exports.createPayment = async (req, res) => {
    try {
        const payload = {
            ...req.body,
            projectNo: req.params.projectNo,
            labourId: req.params.labourId,
        };
        const result = await paymentService.createPayment(payload, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/payments?labourId=xxx&projectNo=PROJ001
// ═══════════════════════════════════════════════════════════════════════════
exports.getPayments = async (req, res) => {
    try {
        const labourId = req.params.labourId || req.query.labourId;
        const projectNo = req.params.projectNo || req.query.projectNo;
        const result = await paymentService.getPayments({ labourId, projectNo }, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/payments/:paymentId
// ═══════════════════════════════════════════════════════════════════════════
exports.getPaymentById = async (req, res) => {
    try {
        const result = await paymentService.getPaymentById(req.params.paymentId, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/payments/:paymentId
// ═══════════════════════════════════════════════════════════════════════════
exports.updatePayment = async (req, res) => {
    try {
        const result = await paymentService.updatePayment(req.params.paymentId, req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/payments/:paymentId
// ═══════════════════════════════════════════════════════════════════════════
exports.deletePayment = async (req, res) => {
    try {
        const result = await paymentService.deletePayment(req.params.paymentId, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};