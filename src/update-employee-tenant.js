const { db } = require("./config/firebase");

async function run() {
    try {
        console.log("Updating employee bharath (EMP001) tenant_id...");
        const snapshot = await db.collection("users")
            .where("role", "==", "employee")
            .where("empID", "==", "EMP001")
            .get();

        if (snapshot.empty) {
            console.log("Employee not found!");
            process.exit(1);
        }

        const doc = snapshot.docs[0];
        // We'll update the tenant_id to 'plaojxVEa1WUNPmyIve4' (matching the admin bharath's tenant ID)
        await doc.ref.update({
            tenant_id: "plaojxVEa1WUNPmyIve4"
        });

        console.log("Success! Employee tenant_id updated to 'plaojxVEa1WUNPmyIve4'.");
    } catch (e) {
        console.error("Error updating:", e);
    }
    process.exit(0);
}

run();
