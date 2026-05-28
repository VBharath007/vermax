const { db } = require("../../config/firebase");

const COLLECTION = "lists";
const listsCol = () => db.collection(COLLECTION);
const listRef  = (id) => db.collection(COLLECTION).doc(id);

const getLists = async (tenant_id) => {
  let listQuery = listsCol();
  let taskQuery = db.collection("tasks").where("completed", "==", false);

  if (tenant_id && tenant_id !== 'GLOBAL') {
      listQuery = listQuery.where("tenant_id", "==", tenant_id);
      taskQuery = taskQuery.where("tenant_id", "==", tenant_id);
  }

  const [listsSnap, tasksSnap] = await Promise.all([
    listQuery.get(),
    taskQuery.get(),
  ]);

  // Count tasks per listId in JS — no extra queries
  const countMap = {};
  tasksSnap.docs.forEach((d) => {
    const lid = d.data().listId || "default";
    countMap[lid] = (countMap[lid] || 0) + 1;
  });

  return listsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
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
  return { deleted: true, tasksReassigned: taskSnap.size };
};

module.exports = { getLists, createList, updateList, deleteList };