const app = require("./src/app");
const createDefaultAdmin = require("./src/config/createDefaultAdmin");
const cron = require("node-cron");
const dayjs = require("dayjs");

const PORT = process.env.PORT || 5000;

// ─── Global crash guards ───────────────────────────────────────────────────
// Without these, ANY unhandled async error silently kills the process.
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Promise Rejection:", reason);
    // Do NOT call process.exit() here — let the server keep running.
    // If you want hard-crash on rejection, uncomment the line below:
    // process.exit(1);
});

process.on("uncaughtException", (err) => {
    console.error("❌ Uncaught Exception:", err);
    // Uncaught exceptions leave the app in undefined state, so exit + restart.
    process.exit(1);
});
// ──────────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);

    // Call createDefaultAdmin explicitly and catch any errors.
    try {
        await createDefaultAdmin();
        const { initDefaultSubLabourTypes } = require("./src/modules/labour/labour.service");
        await initDefaultSubLabourTypes();
    } catch (err) {
        console.error("❌ Initialization failed:", err.message);
    }
});


// ✅ FIX #8: In-memory FCM token cache — avoids fetching all users/admins on every cron run
let _fcmTokenCache = null;
let _fcmTokenCacheTime = 0;
const FCM_TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ⏰ Cron job: check task reminders and send FCM push notifications
// ✅ FIX #8: Changed "* * * * *" (every 1 min) → "*/5 * * * *" (every 5 min)
// Reduces unnecessary Firestore reads by 80%
cron.schedule("*/5 * * * *", async () => {
    try {
        const { db, admin } = require("./src/config/firebase");
        const dayjs = require("dayjs");
        
        const now = dayjs();
        const tasksSnap = await db.collection('tasks')
            .where('completed', '==', false)
            .get();

        const dueTasks = [];
        tasksSnap.forEach(doc => {
            const task = doc.data();
            if (task.dueTimestamp && !task.notified) {
                const dueTime = dayjs(task.dueTimestamp + "+05:30");
                if (dueTime.isBefore(now) || dueTime.isSame(now, 'minute')) {
                    dueTasks.push({ id: doc.id, ...task });
                }
            }
        });

        if (dueTasks.length === 0) return;

        // ✅ FIX #8: Use cached tokens if still fresh — skip re-fetching all users/admins
        let tokenList;
        if (_fcmTokenCache && Date.now() - _fcmTokenCacheTime < FCM_TOKEN_CACHE_TTL_MS) {
            tokenList = _fcmTokenCache;
            console.log(`⚡ Using cached FCM tokens (${tokenList.length} devices)`);
        } else {
            // Cache miss — fetch fresh tokens from Firestore and cache them
            const adminsSnap = await db.collection('admins').get();
            const usersSnap = await db.collection('users').get();

            const tokens = new Set();
            adminsSnap.forEach(doc => {
                const data = doc.data();
                if (data.fcmToken) tokens.add(data.fcmToken);
            });
            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.fcmToken) tokens.add(data.fcmToken);
            });

            tokenList = Array.from(tokens);
            _fcmTokenCache = tokenList;
            _fcmTokenCacheTime = Date.now();
            console.log(`🔄 Refreshed FCM token cache (${tokenList.length} devices)`);
        }

        if (tokenList.length === 0) {
            console.log(`⏰ ${dueTasks.length} tasks due, but no registered FCM tokens found.`);
            for (const task of dueTasks) {
                await db.collection('tasks').doc(task.id).update({ notified: true });
            }
            return;
        }

        console.log(`⏰ Found ${dueTasks.length} due tasks. Sending notifications to ${tokenList.length} devices...`);

        for (const task of dueTasks) {
            const message = {
                data: {
                    type: "reminder",
                    title: task.title,
                    notes: task.notes || "",
                },
                tokens: tokenList,
            };

            let notificationSuccess = false;
            let errorMsg = null;
            let responseDetails = null;

            try {
                const response = await admin.messaging().sendEachForMulticast(message);
                if (response.successCount > 0) {
                    console.log(`🟢 [FCM Trigger Success] FCM sent successfully for task "${task.title}".`);
                } else {
                    console.log(`📢 Sent notification for task "${task.title}": ${response.successCount} success, ${response.failureCount} failed.`);
                }
                notificationSuccess = response.successCount > 0;
                responseDetails = response.responses.map(r => ({
                    success: r.success,
                    messageId: r.messageId || null,
                    error: r.error ? { code: r.error.code, message: r.error.message } : null
                }));
                
                // Clean up stale tokens and invalidate cache if any are removed
                let tokenRemoved = false;
                if (response.responses) {
                    for (let i = 0; i < response.responses.length; i++) {
                        const res = response.responses[i];
                        if (!res.success && (
                            res.error?.code === 'messaging/invalid-registration-token' ||
                            res.error?.code === 'messaging/registration-token-not-registered'
                        )) {
                            const staleToken = tokenList[i];
                            console.log(`🗑️ Removing stale FCM token: ${staleToken}`);
                            // Re-fetch to get accurate snapshot for doc lookup
                            const adminsSnap2 = await db.collection('admins').get();
                            const usersSnap2 = await db.collection('users').get();
                            const adminDoc = adminsSnap2.docs.find(d => d.data().fcmToken === staleToken);
                            if (adminDoc) {
                                await db.collection('admins').doc(adminDoc.id).update({ fcmToken: admin.firestore.FieldValue.delete() });
                            } else {
                                const userDoc = usersSnap2.docs.find(d => d.data().fcmToken === staleToken);
                                if (userDoc) {
                                    await db.collection('users').doc(userDoc.id).update({ fcmToken: admin.firestore.FieldValue.delete() });
                                }
                            }
                            tokenRemoved = true;
                        }
                    }
                }
                // Invalidate cache so next cron run fetches fresh tokens
                if (tokenRemoved) {
                    _fcmTokenCache = null;
                    _fcmTokenCacheTime = 0;
                }
            } catch (err) {
                console.error(`❌ Failed to send multicast message for task "${task.title}":`, err.message);
                errorMsg = err.message;
            }

            // Mark task notification status in Firestore
            await db.collection('tasks').doc(task.id).update({ 
                notified: notificationSuccess ? true : 'failed',
                notificationError: errorMsg,
                responseDetails: responseDetails
            });
        }
    } catch (e) {
        console.error("❌ Cron check error:", e.message);
    }
});
