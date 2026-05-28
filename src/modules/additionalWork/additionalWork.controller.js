const additionalWorkService = require("./additionalWork.service");

exports.createAdditionalWork = async (req, res, next) => {
    try {
        const result = await additionalWorkService.addAdditionalWork(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getAllAdditionalWorks = async (req, res, next) => {
    try {
        const { projectNo } = req.query;
        const result = await additionalWorkService.getAdditionalWorks(projectNo, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getAdditionalWorkById = async (req, res, next) => {
    try {
        const result = await additionalWorkService.getAdditionalWorkById(req.params.id, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateAdditionalWork = async (req, res, next) => {
    try {
        const result = await additionalWorkService.updateAdditionalWork(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteAdditionalWork = async (req, res, next) => {
    try {
        const result = await additionalWorkService.deleteAdditionalWork(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};
