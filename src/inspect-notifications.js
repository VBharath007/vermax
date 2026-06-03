const { db } = require("./config/firebase");

async function run() {
    try {
        console.log("=== EMPLOYEES ===");
        const usersSnap = await db.collection("users").where("role", "==", "employee").get();
        usersSnap.forEach(doc => {
            console.log(`ID: ${doc.id} | Name: ${doc.data().name} | empID: ${doc.data().empID}`);
        });

        console.log("\n=== NOTIFICATIONS FOR BHARATH (N4uJ7K5aFHfToiX9uz6N) ===");
        const notifSnap = await db.collection("users").doc("N4uJ7K5aFHfToiX9uz6N").collection("notifications").get();
        if (notifSnap.empty) {
            console.log("No notifications found for this user.");
        } else {
            notifSnap.forEach(doc => {
                console.log(`Notification ID: ${doc.id} | Data:`, doc.data());
            });
        }

        console.log("\n=== TASKS IN DB ===");
        const tasksSnap = await db.collection("tasks").get();
        tasksSnap.forEach(doc => {
            console.log(`Task ID: ${doc.id} | Data:`, doc.data());
        });

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
