const { db } = require("./src/config/firebase");

async function test() {
    const tenant_id = "plaojxVEa1WUNPmyIve4";
    console.log("Testing fetchAllIncomplete query...");
    try {
        let query = db.collection("tasks").where("completed", "==", false);
        query = query.where("tenant_id", "==", tenant_id);
        const snap = await query.get();
        console.log("Success! Found incomplete tasks:", snap.size);
    } catch (e) {
        console.error("Failed fetchAllIncomplete query:", e);
    }

    console.log("Testing getCompleted query...");
    try {
        let query = db.collection("tasks").where("completed", "==", true);
        query = query.where("tenant_id", "==", tenant_id);
        const snap = await query.get();
        console.log("Success! Found completed tasks:", snap.size);
    } catch (e) {
        console.error("Failed getCompleted query:", e);
    }

    console.log("Testing notifications query...");
    try {
        const userId = "N4uJ7K5aFHfToiX9uz6N"; // bharath
        const snap = await db.collection('users').doc(userId).collection('notifications')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        console.log("Success! Found notifications:", snap.size);
    } catch (e) {
        console.error("Failed notifications query:", e);
    }
}

test();
