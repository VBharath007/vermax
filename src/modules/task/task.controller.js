const service = require("./task.service");

exports.createTask = async (req, res, next) => {
  try {
    const data = await service.createTask(req.body, req.tenantId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getAllTasks = async (req, res, next) => {
  try {
    const data = await service.getAll(req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getTaskById = async (req, res, next) => {
  try {
    const data = await service.getTaskById(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.updateTask = async (req, res, next) => {
  try {
    const data = await service.updateTask(req.params.id, req.body, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const data = await service.deleteTask(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.completeTask = async (req, res, next) => {
  try {
    const data = await service.completeTask(req.params.id, req.body.completed ?? true, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getToday = async (req, res, next) => {
  try {
    const data = await service.getToday(req.tenantId);
    res.json({ success: true, count: data.length, data });
  } catch (err) { next(err); }
};

exports.getScheduled = async (req, res, next) => {
  try {
    const data = await service.getScheduled(req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getFlagged = async (req, res, next) => {
  try {
    const data = await service.getFlagged(req.tenantId);
    res.json({ success: true, count: data.length, data });
  } catch (err) { next(err); }
};

exports.getCompleted = async (req, res, next) => {
  try {
    const data = await service.getCompleted(req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getSmartCounts = async (req, res, next) => {
  try {
    const data = await service.getSmartCounts(req.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getByList = async (req, res, next) => {
  try {
    const data = await service.getByList(req.params.listId, req.tenantId);
    res.json({ success: true, count: data.length, data });
  } catch (err) { next(err); }
};