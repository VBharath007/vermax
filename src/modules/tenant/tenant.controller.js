const admin = require("firebase-admin");

exports.createTenant = async (req, res) => {
    try {
        const { name, domain, plan, features } = req.body;
        
        if (!name || !domain) {
            return res.status(400).json({ message: "Tenant name and domain are required." });
        }

        const db = admin.firestore();
        const tenantRef = db.collection("tenants").doc();
        
        const newTenant = {
            id: tenantRef.id,
            name,
            domain,
            plan: plan || "basic",
            status: "active",
            features: features || ["dashboard", "project_management"], // Defaults
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await tenantRef.set(newTenant);

        res.status(201).json({ 
            message: "Tenant created successfully.",
            tenant: newTenant 
        });
    } catch (error) {
        console.error("Error creating tenant:", error);
        res.status(500).json({ message: "Failed to create tenant.", error: error.message });
    }
};

exports.getAllTenants = async (req, res) => {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection("tenants").get();
        
        const tenants = [];
        snapshot.forEach(doc => {
            tenants.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(tenants);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch tenants.", error: error.message });
    }
};

exports.updateTenantFeatures = async (req, res) => {
    try {
        const { id } = req.params;
        const { features } = req.body;

        if (!Array.isArray(features)) {
            return res.status(400).json({ message: "Features must be an array of strings." });
        }

        const db = admin.firestore();
        const tenantRef = db.collection("tenants").doc(id);

        const doc = await tenantRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: "Tenant not found." });
        }

        await tenantRef.update({
            features: features,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ message: "Tenant features updated successfully.", features });
    } catch (error) {
        res.status(500).json({ message: "Failed to update tenant features.", error: error.message });
    }
};

exports.toggleTenantStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'active' or 'suspended'

        if (!["active", "suspended"].includes(status)) {
            return res.status(400).json({ message: "Invalid status. Use 'active' or 'suspended'." });
        }

        const db = admin.firestore();
        const tenantRef = db.collection("tenants").doc(id);

        const doc = await tenantRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: "Tenant not found." });
        }

        await tenantRef.update({
            status: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ message: `Tenant marked as ${status}.` });
    } catch (error) {
        res.status(500).json({ message: "Failed to update tenant status.", error: error.message });
    }
};

exports.deleteTenant = async (req, res) => {
    try {
        const { id } = req.params;
        const db = admin.firestore();
        const tenantRef = db.collection("tenants").doc(id);

        const doc = await tenantRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: "Tenant not found." });
        }

        await tenantRef.delete();

        res.status(200).json({ message: "Tenant deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete tenant.", error: error.message });
    }
};
