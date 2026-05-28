const { db } = require("../../config/firebase");

// Get all users (except super_admin)
exports.getAllUsers = async (req, res) => {
    try {
        const adminsSnap = await db.collection("admins").get();
        let users = [];

        adminsSnap.forEach((doc) => {
            const data = doc.data();
            if (data.role !== 'super_admin') {
                users.push({ id: doc.id, ...data });
            }
        });

        // Optionally, fetch regular employees from 'users' collection if needed
        // For now, Super Admin manages 'admin' level accounts for the companies.
        
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Approve a user and assign them to a company
exports.approveUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenant_id } = req.body;

        if (!tenant_id) {
            return res.status(400).json({ success: false, message: "tenant_id is required to approve a user." });
        }

        const userRef = db.collection("admins").doc(id);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        await userRef.update({
            status: 'active',
            tenant_id: tenant_id,
            updatedAt: new Date().toISOString()
        });

        res.status(200).json({ success: true, message: "User approved and assigned to company." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a user
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userRef = db.collection("admins").doc(id);

        const doc = await userRef.get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        await userRef.delete();
        res.status(200).json({ success: true, message: "User deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update user-specific feature access
exports.updateUserFeatures = async (req, res) => {
    try {
        const { id } = req.params;
        const { features } = req.body;

        if (!Array.isArray(features)) {
            return res.status(400).json({ success: false, message: "Features must be an array of strings." });
        }

        const userRef = db.collection("admins").doc(id);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        await userRef.update({
            features: features,
            updatedAt: new Date().toISOString()
        });

        res.status(200).json({ success: true, message: "User features updated successfully.", features });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
