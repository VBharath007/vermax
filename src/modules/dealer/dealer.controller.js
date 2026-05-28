const dealerService = require("./dealer.service");


exports.getAllDealers = async (req, res) => {
    try {
        const result = await dealerService.getAllDealers(req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 2. Get dealer detail — per-project cards ─────────────────────────────────
// GET /api/dealers/:phoneNumber
exports.getDealerHistory = async (req, res) => {
    try {
        const result = await dealerService.getDealerHistory(req.params.phoneNumber, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 3. Get bill-level payment status for a dealer ───────────────────────────
// GET /api/dealers/:phoneNumber/payments
exports.getDealerPaymentHistory = async (req, res) => {
    try {
        const result = await dealerService.getDealerPaymentHistory(req.params.phoneNumber, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 4. Get full payment log for a dealer (date + amount history) ─────────────
// GET /api/dealers/:phoneNumber/payment-log
exports.getDealerPaymentLog = async (req, res) => {
    try {
        const result = await dealerService.getDealerPaymentLog(req.params.phoneNumber, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 5. Get payment log for a specific project under a dealer ─────────────────
// GET /api/dealers/:phoneNumber/project/:projectNo/payment-log
exports.getDealerProjectPaymentLog = async (req, res) => {
    try {
        const result = await dealerService.getDealerProjectPaymentLog(
            req.params.phoneNumber,
            req.params.projectNo,
            req.tenantId
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 6. Apply payment to a specific project under a dealer (FIFO) ────────────
// PUT /api/dealers/:phoneNumber/project/:projectNo/payment
// Body: { amount: 5000, method: "bank" }
exports.payDealerProjectPayment = async (req, res) => {
    try {
        const { phoneNumber, projectNo } = req.params;
        const { amount, method, bankId } = req.body;

        const result = await dealerService.payDealerProjectPayment(
            phoneNumber,
            projectNo,
            amount,
            method,
            bankId,   // 🔥 IMPORTANT
            req.tenantId
        );

        res.status(200).json({
            success: true,
            data: result,
            message: `Dealer payment successful${
                method === "bank" ? " and bank balance updated" : ""
            }`
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

// ─── 7. Apply payment across ALL projects for a dealer (FIFO) ────────────────
// PUT /api/dealers/:phoneNumber/payment
// Body: { amountPaid: 5000 }
exports.updateDealerPayment = async (req, res) => {
    try {
        const result = await dealerService.updateDealerPayment(
            req.params.phoneNumber,
            req.body.amountPaid,
            req.tenantId
        );
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// ─── 8. Delete dealer and all associated records ──────────────────────────────
// DELETE /api/dealers/:phoneNumber
exports.deleteDealer = async (req, res) => {
    try {
        const result = await dealerService.deleteDealer(req.params.phoneNumber, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
}