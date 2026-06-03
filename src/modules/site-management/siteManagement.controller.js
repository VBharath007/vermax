const siteService = require("./siteManagement.service");

// ─── MATERIALS LOG ───

exports.getMaterialStocks = async (req, res, next) => {
    try {
        const result = await siteService.getMaterialStocks(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateMaterialStock = async (req, res, next) => {
    try {
        const { stock } = req.body;
        const result = await siteService.updateMaterialStock(req.params.id, stock, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.createMaterialLog = async (req, res, next) => {
    try {
        const result = await siteService.addMaterialLog(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getMaterialLogs = async (req, res, next) => {
    try {
        const result = await siteService.getMaterialLogs(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteMaterialLog = async (req, res, next) => {
    try {
        const result = await siteService.deleteMaterialLog(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── DAILY DIARY ───

exports.createDiaryEntry = async (req, res, next) => {
    try {
        const result = await siteService.addDiaryEntry(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getDiaryEntries = async (req, res, next) => {
    try {
        const result = await siteService.getDiaryEntries(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updateDiaryEntry = async (req, res, next) => {
    try {
        const result = await siteService.updateDiaryEntry(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deleteDiaryEntry = async (req, res, next) => {
    try {
        const result = await siteService.deleteDiaryEntry(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── PUNCH LIST ───

exports.createPunchItem = async (req, res, next) => {
    try {
        const result = await siteService.addPunchItem(req.body, req.tenantId);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getPunchItems = async (req, res, next) => {
    try {
        const result = await siteService.getPunchItems(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updatePunchItem = async (req, res, next) => {
    try {
        const result = await siteService.updatePunchItem(req.params.id, req.body, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deletePunchItem = async (req, res, next) => {
    try {
        const result = await siteService.deletePunchItem(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── PROGRESS PHOTOS ───

exports.uploadPhoto = async (req, res, next) => {
    try {
        const { title } = req.body;
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const result = await siteService.uploadPhoto(req.file, title, req.tenantId, baseUrl);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getPhotos = async (req, res, next) => {
    try {
        const result = await siteService.getPhotos(req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.updatePhoto = async (req, res, next) => {
    try {
        const { title } = req.body;
        const result = await siteService.updatePhoto(req.params.id, title, req.tenantId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.deletePhoto = async (req, res, next) => {
    try {
        const result = await siteService.deletePhoto(req.params.id, req.tenantId);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};
