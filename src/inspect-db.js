const { db } = require("./config/firebase");
const dayjs = require("dayjs");

async function run() {
    try {
        console.log("=== USERS IN DB ===");
        const usersSnap = await db.collection("users").get();
        usersSnap.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id} | Name: ${data.name} | Role: ${data.role} | EmpID: ${data.empID} | Tenant: ${data.tenant_id}`);
        });

        console.log("\n=== ADMINS IN DB ===");
        const adminsSnap = await db.collection("admins").get();
        adminsSnap.forEach(doc => {
            const data = doc.data();
            console.log(`ID: ${doc.id} | Name: ${data.name} | Role: ${data.role} | EmpID: ${data.empID} | Tenant: ${data.tenant_id}`);
        });

        console.log("\n=== ATTENDANCE IN DB ===");
        const today = dayjs().format("YYYY-MM-DD");
        const month = dayjs().format("YYYY-MM");
        console.log(`Today's Date: ${today}, Month: ${month}`);

        // Get all attendance documents for today
        const users = usersSnap.docs.map(d => d.data());
        for (const user of users) {
            if (user.empID) {
                const attSnap = await db.collection("attendance").doc(user.empID).collection(month).doc(today).get();
                if (attSnap.exists) {
                    console.log(`Attendance for ${user.name} (${user.empID}):`, attSnap.data());
                } else {
                    console.log(`No attendance for ${user.name} (${user.empID}) today.`);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
