const axios = require('axios');

async function runTests() {
    console.log("🚀 Starting Multi-Tenant Architecture Tests...\n");
    
    // We assume the server is running locally on port 5000 (update if different)
    const BASE_URL = 'http://localhost:5000/api';
    
    // 1. You will need a Super Admin token to test this.
    // Replace this with a valid token generated from your auth/login endpoint.
    const SUPER_ADMIN_TOKEN = "YOUR_SUPER_ADMIN_JWT_TOKEN_HERE"; 
    
    try {
        console.log("1️⃣ Testing Super Admin: Creating a new Company (Tenant)...");
        const createRes = await axios.post(`${BASE_URL}/super/tenants`, {
            name: "Larsen & Toubro",
            domain: "lt.constructionapp.com",
            plan: "enterprise",
            features: ["dashboard", "project_management", "payroll"]
        }, {
            headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` }
        });
        
        console.log("✅ Success! Tenant Created:", createRes.data.tenant.id);
        const newTenantId = createRes.data.tenant.id;

        console.log("\n2️⃣ Testing Super Admin: Fetching all Companies...");
        const getRes = await axios.get(`${BASE_URL}/super/tenants`, {
            headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` }
        });
        console.log(`✅ Success! Found ${getRes.data.length} companies.`);

        console.log("\n3️⃣ Testing Super Admin: Toggling off 'payroll' feature...");
        const updateRes = await axios.put(`${BASE_URL}/super/tenants/${newTenantId}/features`, {
            features: ["dashboard", "project_management"] // Removed payroll
        }, {
            headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` }
        });
        console.log("✅ Success! Features updated:", updateRes.data.features);

        console.log("\n🎉 All Multi-Tenant Admin tests passed! Architecture is working.");
        
    } catch (error) {
        console.error("❌ Test Failed.");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Message:", error.response.data);
            if (error.response.status === 401) {
                console.log("\n💡 Note: You need to replace 'YOUR_SUPER_ADMIN_JWT_TOKEN_HERE' with a real token to run this successfully.");
            }
        } else {
            console.error(error.message);
        }
    }
}

runTests();
