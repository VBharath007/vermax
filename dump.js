const { db } = require("./src/config/firebase");

async function main() {
    console.log("=== DB DUMP ===");
    
    console.log("\n--- Users ---");
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach(doc => {
        console.log(doc.id, JSON.stringify(doc.data(), null, 2));
    });

    console.log("\n--- Tasks ---");
    const tasksSnap = await db.collection("tasks").get();
    tasksSnap.forEach(doc => {
        console.log(doc.id, JSON.stringify(doc.data(), null, 2));
    });
}

main().catch(console.error);
