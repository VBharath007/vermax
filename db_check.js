require('dotenv').config();
const { db } = require("./src/config/firebase");

async function checkLabourMasters() {
    try {
        console.log("Fetching labourMaster collection...");
        const snap = await db.collection("labourMaster").get();
        console.log(`Fetched ${snap.size} documents.`);
        snap.forEach(doc => {
            console.log(`ID: ${doc.id}`);
            console.log(JSON.stringify(doc.data(), null, 2));
            console.log("--------------------------------------");
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkLabourMasters();
