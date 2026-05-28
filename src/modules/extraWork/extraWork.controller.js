const extraWorkService = require("./extraWork.service");

exports.createExtraWork = async (req, res, next) => {
    try {
        const result = await extraWorkService.addExtraWork(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getAllExtraWorks = async (req, res, next) => {
    try {
        const { projectNo } = req.query;
        const result = await extraWorkService.getExtraWorks(projectNo, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getExtraWorkById = async (req, res, next) => {
    try {
        const result = await extraWorkService.getExtraWorkById(req.params.id, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateExtraWork = async (req, res, next) => {
    try {
        const result = await extraWorkService.updateExtraWork(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteExtraWork = async (req, res, next) => {
    try {
        const result = await extraWorkService.deleteExtraWork(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

