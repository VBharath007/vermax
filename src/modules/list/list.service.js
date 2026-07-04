const { db } = require("../../config/firebase");
const taskService = require("../task/task.service");

const COLLECTION = "lists";
const listsCol = () => db.collection(COLLECTION);
const listRef  = (id) => db.collection(COLLECTION).doc(id);

// ── In-Memory Cache ───────────────────────────────────────────────────────────
const memoryCache = {
  lists: new Map()
};
const CACHE_TTL = 5 * 60 * 1000;

const clearListCache = (tenant_id) => {
  const tId = tenant_id || 'GLOBAL';
  memoryCache.lists.delete(tId);
};

const getLists = async (tenant_id) => {
  const tId = tenant_id || 'GLOBAL';
  let cachedLists = memoryCache.lists.get(tId);

  if (!cachedLists || (Date.now() - cachedLists.timestamp >= CACHE_TTL)) {
      let listQuery = listsCol();
      if (tenant_id && tenant_id !== 'GLOBAL') {
          listQuery = listQuery.where("tenant_id", "==", tenant_id);
      }
      const listsSnap = await listQuery.get();
      cachedLists = {
          data: listsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          timestamp: Date.now()
      };
      memoryCache.lists.set(tId, cachedLists);
  }

  // Get tasks from task.service (which is already cached!)
  const incompleteTasks = await taskService.getAll(tenant_id);

  // Count tasks per listId in JS — no extra queries
  const countMap = {};
  incompleteTasks.forEach((d) => {
    const lid = d.listId || "default";
    countMap[lid] = (countMap[lid] || 0) + 1;
  });

  return cachedLists.data.map((d) => ({
    ...d,
    taskCount: countMap[d.id] || 0,
  }));
};

const createList = async (data, tenant_id) => {
  if (!tenant_id) throw new Error("tenant_id is required");
  const now = new Date().toISOString();
  const payload = {
    name: data.name,
    color: data.color || "#007AFF",
    icon: data.icon || "list",
    createdAt: now,
    updatedAt: now,
    tenant_id,
  };
  const ref = await listsCol().add(payload);
  clearListCache(tenant_id);
  return { id: ref.id, ...payload, taskCount: 0 };
};

const updateList = async (id, data, tenant_id) => {
  const doc = await listRef(id).get();
  if (!doc.exists) throw new Error("List not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

  const updates = { ...data, updatedAt: new Date().toISOString() };
  delete updates.userId;
  await listRef(id).update(updates);
  const snap = await listRef(id).get();
  clearListCache(tenant_id);
  return { id: snap.id, ...snap.data() };
};

const deleteList = async (id, tenant_id) => {
  const doc = await listRef(id).get();
  if (!doc.exists) throw new Error("List not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

  let taskQuery = db.collection("tasks").where("listId", "==", id);
  if (tenant_id && tenant_id !== 'GLOBAL') {
      taskQuery = taskQuery.where("tenant_id", "==", tenant_id);
  }
  const taskSnap = await taskQuery.get();
  const batch = db.batch();
  taskSnap.docs.forEach((doc) => {
    batch.update(doc.ref, { listId: "default", listName: "Reminders" });
  });
  batch.delete(listRef(id));
  await batch.commit();
  clearListCache(tenant_id);
  return { deleted: true, tasksReassigned: taskSnap.size };
};

module.exports = { getLists, createList, updateList, deleteList };