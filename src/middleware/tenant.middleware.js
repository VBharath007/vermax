const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

/**
 * Advanced Middleware: Extracts tenant context from the verified token.
 * Ensures the user belongs to a valid tenant or is a super admin.
 */
exports.tenantContext = (req, res, next) => {
    // We assume verifyToken middleware runs before this and sets req.user
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required before checking tenant context." });
    }

    // Backward Compatibility for existing "admin" role during development
    // Always normalize to "GLOBAL" when tenant_id is falsy — prevents undefined
    // from reaching Firestore .where() queries and causing a 500 error.
    if (req.user.role === "admin" || req.user.role === "super_admin") {
        req.tenantId = req.user.tenant_id || "GLOBAL";
        return next();
    }

    // Regular users must have a tenant_id
    if (!req.user.tenant_id) {
        return res.status(403).json({ message: "Access Denied: No tenant context found for this user." });
    }

    req.tenantId = req.user.tenant_id;
    next();
};

/**
 * Safe helper: returns true when the request is NOT scoped to a specific tenant.
 * Use this instead of `req.tenantId !== 'GLOBAL'` to avoid undefined slipping through.
 */
exports.isGlobalTenant = (req) => {
    return !req.tenantId || req.tenantId === "GLOBAL";
};

/**
 * Advanced Middleware: Dynamically checks if the tenant has paid for/enabled a feature.
 * @param {string} featureKey - The unique key of the feature (e.g., 'payroll', 'inventory')
 */
exports.featureGuard = (featureKey) => {
    return async (req, res, next) => {
        try {
            // Admins & Super admins can bypass feature lock for testing/backward compatibility
            if (req.user && (req.user.role === "super_admin" || req.user.role === "admin")) {
                return next();
            }

            if (!req.tenantId || req.tenantId === "GLOBAL") {
                return res.status(403).json({ message: "Access Denied: Missing tenant context." });
            }

            // Fetch tenant's enabled features from Firestore (with caching recommended in production)
            const db = admin.firestore();
            const tenantDoc = await db.collection("tenants").doc(req.tenantId).get();

            if (!tenantDoc.exists) {
                return res.status(404).json({ message: "Tenant account not found or suspended." });
            }

            const tenantData = tenantDoc.data();
            
            if (tenantData.status !== "active") {
                return res.status(403).json({ message: "Your company account is currently suspended or inactive." });
            }

            const enabledFeatures = tenantData.features || [];

            if (!enabledFeatures.includes(featureKey)) {
                return res.status(403).json({ 
                    message: `Feature Locked: '${featureKey}' is not enabled for your company's plan. Please contact your administrator to upgrade.` 
                });
            }

            next();
        } catch (error) {
            console.error("Feature Guard Error:", error);
            res.status(500).json({ message: "Internal server error while verifying feature access." });
        }
    };
};
