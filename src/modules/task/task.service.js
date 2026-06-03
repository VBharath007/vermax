const { db, admin } = require("../../config/firebase");

const COLLECTION = "tasks";
const tasksCol = () => db.collection(COLLECTION);
const taskRef = (id) => db.collection(COLLECTION).doc(id);

// ── Date helpers (DD-MM-YYYY format throughout) ───────────────────────────────
const todayFormatted = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`; // "09-04-2026"
};

const tomorrowFormatted = () => {
  const d = new Date(Date.now() + 86400000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// Parse DD-MM-YYYY → sortable number YYYYMMDD
const toSortable = (ddmmyyyy) => {
  if (!ddmmyyyy) return 0;
  const [dd, mm, yyyy] = ddmmyyyy.split("-");
  return Number(`${yyyy}${mm}${dd}`);
};

const buildDueTimestamp = (dueDate, dueTime) => {
  if (!dueDate) return null;
  // dueDate is DD-MM-YYYY, convert for timestamp string
  const [dd, mm, yyyy] = dueDate.split("-");
  return dueTime
    ? `${yyyy}-${mm}-${dd}T${dueTime}:00`
    : `${yyyy}-${mm}-${dd}T00:00:00`;
};

const formatDisplayDate = (ddmmyyyy) => {
  if (!ddmmyyyy) return "";
  const [dd, mm, yyyy] = ddmmyyyy.split("-");
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

const createTask = async (data, tenant_id) => {
  if (!tenant_id) throw new Error("tenant_id is required");
  const now = new Date().toISOString();
  const payload = {
    title: data.title,
    notes: data.notes || null,
    dueDate: data.dueDate || null,       // store as DD-MM-YYYY
    dueTime: data.dueTime || null,
    dueTimestamp: buildDueTimestamp(data.dueDate, data.dueTime),
    hasDueDate: !!data.dueDate,
    listId: data.listId || "default",
    listName: data.listName || "Reminders",
    flagged: data.flagged ?? false,
    assignedTo: data.assignedTo || null,
    assignedEmpID: data.assignedEmpID || null,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    tenant_id,
  };
  const ref = await tasksCol().add(payload);

  // Trigger Notification if assigned to a specific Employee ID
  if (data.assignedEmpID) {
    try {
      // Find user by empID
      const userQuery = await db.collection("users").where("empID", "==", data.assignedEmpID).get();
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0].data();
        const userId = userQuery.docs[0].id;
        
        // Save to user's notifications subcollection
        await db.collection("users").doc(userId).collection("notifications").add({
          title: "New Task Assigned",
          body: `You have been assigned a new task: ${data.notes || data.title || ""}`,
          taskId: ref.id,
          isRead: false,
          createdAt: new Date()
        });
        console.log(`[Notification] Saved notification to user ${userId} for task ${ref.id}`);

        if (userDoc.fcmToken) {
          const message = {
            data: {
              type: "new_task",
              taskId: ref.id,
              title: "New Task Assigned",
              body: `You have been assigned a new task: ${data.notes || data.title || ""}`,
            },
            token: userDoc.fcmToken,
          };
          await admin.messaging().send(message);
          console.log(`[FCM] Notification sent to ${data.assignedEmpID}`);
        }
      }
    } catch (fcmError) {
      console.error("[FCM/Notification] Error sending/saving notification:", fcmError);
    }
  }

  return { id: ref.id, ...payload };
};

const updateTask = async (id, data, tenant_id) => {
  const now = new Date().toISOString();
  const snap = await taskRef(id).get();
  if (!snap.exists) throw new Error("Task not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && snap.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
  const existing = snap.data();

  const updates = { ...data, updatedAt: now };
  if (data.dueDate !== undefined || data.dueTime !== undefined) {
    const newDate = data.dueDate !== undefined ? data.dueDate : existing.dueDate;
    const newTime = data.dueTime !== undefined ? data.dueTime : existing.dueTime;
    updates.dueTimestamp = buildDueTimestamp(newDate, newTime);
    updates.hasDueDate = !!newDate;
  }

  await taskRef(id).update(updates);
  const updated = await taskRef(id).get();
  return { id: updated.id, ...updated.data() };
};

const deleteTask = async (id, tenant_id) => {
  const snap = await taskRef(id).get();
  if (!snap.exists) throw new Error("Task not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && snap.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
  await taskRef(id).delete();
  return { deleted: true };
};

const getTaskById = async (id, tenant_id) => {
  const snap = await taskRef(id).get();
  if (!snap.exists) throw new Error("Task not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && snap.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
  return { id: snap.id, ...snap.data() };
};

const completeTask = async (id, completed, tenant_id) => {
  const snap = await taskRef(id).get();
  if (!snap.exists) throw new Error("Task not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && snap.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

  const now = new Date().toISOString();
  await taskRef(id).update({
    completed,
    completedAt: completed ? now : null,
    updatedAt: now,
  });
  const updatedSnap = await taskRef(id).get();
  return { id: updatedSnap.id, ...updatedSnap.data() };
};

// ── Shared fetch ──────────────────────────────────────────────────────────────
const fetchAllIncomplete = async (tenant_id) => {
  let query = tasksCol().where("completed", "==", false);
  if (tenant_id && tenant_id !== 'GLOBAL') {
      query = query.where("tenant_id", "==", tenant_id);
  }
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ── Smart Lists ───────────────────────────────────────────────────────────────

const getAll = async (tenant_id) => {
  const tasks = await fetchAllIncomplete(tenant_id);
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const getToday = async (tenant_id) => {
  const today = todayFormatted(); // "09-04-2026"
  const tasks = await fetchAllIncomplete(tenant_id);
  return tasks
    .filter((t) => t.dueDate === today)
    .sort((a, b) => (a.dueTimestamp || "").localeCompare(b.dueTimestamp || ""));
};

const getScheduled = async (tenant_id) => {
  const tasks = await fetchAllIncomplete(tenant_id);
  const withDate = tasks.filter((t) => t.hasDueDate && t.dueDate);

  // Sort by date using sortable number
  withDate.sort((a, b) => toSortable(a.dueDate) - toSortable(b.dueDate));

  const today = todayFormatted();
  const tomorrow = tomorrowFormatted();
  const grouped = {};

  for (const task of withDate) {
    const key = task.dueDate;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(task);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => toSortable(a) - toSortable(b))
    .map(([date, tasks]) => ({
      date,
      label: date === today ? "Today" : date === tomorrow ? "Tomorrow" : formatDisplayDate(date),
      tasks,
    }));
};

const getFlagged = async (tenant_id) => {
  const tasks = await fetchAllIncomplete(tenant_id);
  return tasks.filter((t) => t.flagged);
};

const getCompleted = async (tenant_id) => {
  let query = tasksCol().where("completed", "==", true);
  if (tenant_id && tenant_id !== 'GLOBAL') {
      query = query.where("tenant_id", "==", tenant_id);
  }
  const snap = await query.get();
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  tasks.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  const today = todayFormatted();
  const tomorrow = tomorrowFormatted();
  const grouped = {};

  for (const task of tasks) {
    // completedAt is ISO string "2026-04-09T..." → convert to DD-MM-YYYY
    let dateKey = "Unknown";
    if (task.completedAt) {
      const dt = new Date(task.completedAt);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      dateKey = `${dd}-${mm}-${dt.getFullYear()}`;
    }
    const label = dateKey === today ? "Today" : dateKey === tomorrow ? "Tomorrow" : formatDisplayDate(dateKey);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(task);
  }
  return grouped;
};

const getByList = async (listId, tenant_id) => {
  const tasks = await fetchAllIncomplete(tenant_id);
  return tasks.filter((t) => t.listId === listId);
};

const getSmartCounts = async (tenant_id) => {
  const today = todayFormatted(); // "09-04-2026"

  let incQuery = tasksCol().where("completed", "==", false);
  let compQuery = tasksCol().where("completed", "==", true);
  if (tenant_id && tenant_id !== 'GLOBAL') {
      incQuery = incQuery.where("tenant_id", "==", tenant_id);
      compQuery = compQuery.where("tenant_id", "==", tenant_id);
  }

  const [incompleteSnap, completedSnap] = await Promise.all([
    incQuery.get(),
    compQuery.count().get(),
  ]);

  const incomplete = incompleteSnap.docs.map((d) => d.data());

  return {
    today:     incomplete.filter((t) => t.dueDate === today).length,
    scheduled: incomplete.filter((t) => t.hasDueDate).length,
    all:       incomplete.length,
    flagged:   incomplete.filter((t) => t.flagged).length,
    completed: completedSnap.data().count,
  };
};

module.exports = {
  createTask, updateTask, deleteTask, getTaskById, completeTask,
  getAll, getToday, getScheduled, getFlagged, getCompleted, getByList, getSmartCounts,
};