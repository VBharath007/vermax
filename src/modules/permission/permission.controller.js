const { db } = require("../../config/firebase");
const permissionsCollection = db.collection("permissions");

// ── Create a new permission / leave request (employee) ──────────────────────
exports.createPermission = async (req, res) => {
    try {
        const { type, fromDate, toDate, reason } = req.body;
        if (!type || !fromDate || !reason) {
            return res.status(400).json({ message: "type, fromDate, and reason are required" });
        }

        const doc = {
            empID:      req.user.empID,
            employeeId: req.user.id,
            type,           // "permission" | "leave" | "halfday" | "casual_leave" | "sick_leave"
            fromDate,
            toDate:     toDate || fromDate,
            reason,
            status:     "Pending",   // Pending | Approved | Rejected
            tenant_id:  req.tenantId,
            createdAt:  new Date().toISOString(),
        };

        // Fetch employee name for display
        try {
            const userSnap = await db.collection("users").doc(req.user.id).get();
            if (userSnap.exists) {
                doc.employeeName = userSnap.data().name || req.user.empID;
            }
        } catch (_) {}

        const ref = await permissionsCollection.add(doc);
        res.status(201).json({ success: true, data: { id: ref.id, ...doc } });
    } catch (err) {
        console.error("[createPermission]", err.message);
        res.status(500).json({ message: err.message });
    }
};

// ── Employee: Get own permission requests ────────────────────────────────────
exports.getMyPermissions = async (req, res) => {
    try {
        let query = permissionsCollection
            .where("employeeId", "==", req.user.id);

        if (req.tenantId && req.tenantId !== "GLOBAL") {
            query = query.where("tenant_id", "==", req.tenantId);
        }

        const snap = await query.orderBy("createdAt", "desc").get().catch(async () => {
            // Fallback without orderBy if index missing
            return await query.get();
        });

        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort in memory if Firestore sorted for us already; otherwise sort here
        data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("[getMyPermissions]", err.message);
        res.status(500).json({ message: err.message });
    }
};

// ── Admin: Get all permission requests for tenant ────────────────────────────
exports.getAllPermissions = async (req, res) => {
    try {
        let query = permissionsCollection;
        if (req.tenantId && req.tenantId !== "GLOBAL") {
            query = query.where("tenant_id", "==", req.tenantId);
        }

        const snap = await query.get();
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("[getAllPermissions]", err.message);
        res.status(500).json({ message: err.message });
    }
};

// ── Admin: Approve or Reject a request ──────────────────────────────────────
exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminRemark } = req.body;

        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ message: "status must be Approved or Rejected" });
        }

        const ref = permissionsCollection.doc(id);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).json({ message: "Request not found" });

        await ref.update({
            status,
            adminRemark: adminRemark || "",
            updatedAt: new Date().toISOString(),
        });

        res.status(200).json({ success: true, message: `Request ${status}` });
    } catch (err) {
        console.error("[updateStatus]", err.message);
        res.status(500).json({ message: err.message });
    }
};

// ── Admin: Delete a request ──────────────────────────────────────────────────
exports.deletePermission = async (req, res) => {
    try {
        const ref = permissionsCollection.doc(req.params.id);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).json({ message: "Request not found" });
        await ref.delete();
        res.status(200).json({ success: true, message: "Deleted" });
    } catch (err) {
        console.error("[deletePermission]", err.message);
        res.status(500).json({ message: err.message });
    }
};
