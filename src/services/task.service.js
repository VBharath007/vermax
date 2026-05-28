const { db } = require('../config/firebase');
const admin = require('firebase-admin');

const COLLECTION = 'tasks';

// Helper to format timestamps
function formatDoc(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    const id = doc.id;

    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
    }
    if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        data.updatedAt = data.updatedAt.toDate().toISOString();
    }
    return { id, ...data };
}

// 🟢 CREATE: Add Task (Daily / Weekly / Monthly)
exports.saveTask = async (taskData) => {
    const now = new Date().toISOString();

    let taskObject = {
        taskName: taskData.taskName || '',
        priority: taskData.priority || 'Medium',
        status: taskData.status || 'Pending',
        type: taskData.type || taskData.section || 'Daily', // Daily, Weekly, Monthly
        createdAt: now,
        updatedAt: now
    };

    // --- Section logic ---
    if (taskObject.type === 'Daily') {
        taskObject.startTime = taskData.startTime || '';
        taskObject.endTime = taskData.endTime || '';
    } else {
        // For Weekly and Monthly
        taskObject.startDate = taskData.startDate || '';
        taskObject.endDate = taskData.endDate || '';
    }

    const docRef = await db.collection(COLLECTION).add(taskObject);
    const snap = await docRef.get();
    return formatDoc(snap);
};

// 🔵 READ: Get History by Type
exports.getTasksByType = async (type) => {
    const snapshot = await db.collection(COLLECTION)
        .where('type', '==', type)
        .get();

    const tasks = snapshot.docs.map(doc => formatDoc(doc));
    // Sort in memory: newest first (createdAt descending)
    tasks.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return tasks;
};

// 🟡 UPDATE: Edit Task
exports.updateTask = async (id, updateData) => {
    const docRef = db.collection(COLLECTION).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) throw new Error('Task not found');

    const data = {
        ...updateData,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(data);
    const updatedSnap = await docRef.get();
    return formatDoc(updatedSnap);
};

// 🔴 DELETE: Remove task
exports.deleteTask = async (id) => {
    await db.collection(COLLECTION).doc(id).delete();
    return { id, message: "Task deleted successfully" };
};