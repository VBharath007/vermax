const { db } = require("./config/firebase");

async function run() {
    try {
        const snapshot = await db.collection("users")
            .where("role", "==", "employee")
            .where("empID", "==", "EMP001")
            .get();

        if (snapshot.empty) {
            console.log("Not found!");
        } else {
            console.log("Employee Bharath document data:", snapshot.docs[0].data());
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
