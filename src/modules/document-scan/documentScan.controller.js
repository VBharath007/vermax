const service = require("./documentScan.service");

exports.analyzeDocument = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded. Please send a file with field name 'file'." });
        }

        const tenant_id = req.tenantId || "GLOBAL";
        const uploadedBy = req.user?.id || "unknown";

        const result = await service.analyzeDocument(req.file, tenant_id, uploadedBy);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getScanHistory = async (req, res, next) => {
    try {
        const tenant_id = req.tenantId || "GLOBAL";
        const data = await service.getScanHistory(tenant_id);
        res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

exports.deleteScan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tenant_id = req.tenantId || "GLOBAL";
        const result = await service.deleteScan(id, tenant_id);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};
