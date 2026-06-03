const safetyService = require("./safety.service");

// ─── TOOLBOX BRIEFINGS ───

exports.createBriefing = async (req, res, next) => {
    try {
        const result = await safetyService.addBriefing(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getBriefings = async (req, res, next) => {
    try {
        const result = await safetyService.getBriefings(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateBriefing = async (req, res, next) => {
    try {
        const result = await safetyService.updateBriefing(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteBriefing = async (req, res, next) => {
    try {
        const result = await safetyService.deleteBriefing(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── INCIDENT LOGS ───

exports.createIncident = async (req, res, next) => {
    try {
        const result = await safetyService.addIncident(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getIncidents = async (req, res, next) => {
    try {
        const result = await safetyService.getIncidents(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateIncident = async (req, res, next) => {
    try {
        const result = await safetyService.updateIncident(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteIncident = async (req, res, next) => {
    try {
        const result = await safetyService.deleteIncident(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── PPE WORKERS ───

exports.createWorker = async (req, res, next) => {
    try {
        const result = await safetyService.addWorker(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getWorkers = async (req, res, next) => {
    try {
        const result = await safetyService.getWorkers(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateWorker = async (req, res, next) => {
    try {
        const result = await safetyService.updateWorker(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteWorker = async (req, res, next) => {
    try {
        const result = await safetyService.deleteWorker(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};
