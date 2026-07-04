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

const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");

cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

exports.getCompanyProfile = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }
        const db = admin.firestore();
        const doc = await db.collection("tenants").doc(tenantId).get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Tenant not found." });
        }
        const data = doc.data();
        res.status(200).json({ success: true, data: data.companyProfile || {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateCompanyProfile = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }
        const db = admin.firestore();
        const tenantRef = db.collection("tenants").doc(tenantId);
        
        await tenantRef.update({
            companyProfile: req.body,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.status(200).json({ success: true, message: "Company profile updated successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.uploadCompanyFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file provided." });
        }
        
        const file = req.file;
        let imageUrl = "";
        
        try {
            // Upload to Cloudinary using upload_stream
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: `tenant_${req.tenantId || "global"}` },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(file.buffer);
            });
            imageUrl = uploadResult.secure_url;
        } catch (err) {
            console.warn("⚠️ Cloudinary upload failed for company file, falling back to local storage:", err.message);
            const uploadDir = path.join(__dirname, "../../../public/uploads");
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const filename = `company_${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
            const localPath = path.join(uploadDir, filename);
            fs.writeFileSync(localPath, file.buffer);
            
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            imageUrl = `${protocol}://${host}/uploads/${filename}`;
        }
        
        res.status(200).json({ success: true, url: imageUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
