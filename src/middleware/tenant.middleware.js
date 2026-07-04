const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

// ✅ FIX #7: In-memory tenant cache — avoids repeated Firestore reads on every protected route
// Cache entries expire after 5 minutes (300,000 ms)
const _tenantCache = new Map();
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _getCachedTenant(tenantId) {
    const entry = _tenantCache.get(tenantId);
    if (!entry) return null;
    if (Date.now() - entry.time > TENANT_CACHE_TTL_MS) {
        _tenantCache.delete(tenantId); // expired — remove it
        return null;
    }
    return entry.data;
}

function _setCachedTenant(tenantId, data) {
    _tenantCache.set(tenantId, { data, time: Date.now() });
}

/**
 * Advanced Middleware: Extracts tenant context from the verified token.
 * Ensures the user belongs to a valid tenant or is a super admin.
 */
exports.tenantContext = (req, res, next) => {
    // We assume verifyToken middleware runs before this and sets req.user
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required before checking tenant context." });
    }

    // Normalize tenant_id. Default to "GLOBAL" for backward compatibility and global users.
    req.tenantId = req.user.tenant_id || "GLOBAL";
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

            // ✅ FIX #7: Check in-memory cache first — skip Firestore read if recently fetched
            let tenantData = _getCachedTenant(req.tenantId);

            if (!tenantData) {
                // Cache miss — fetch from Firestore and cache the result
                const db = admin.firestore();
                const tenantDoc = await db.collection("tenants").doc(req.tenantId).get();

                if (!tenantDoc.exists) {
                    return res.status(404).json({ message: "Tenant account not found or suspended." });
                }

                tenantData = tenantDoc.data();
                _setCachedTenant(req.tenantId, tenantData); // cache for next 5 minutes
            }

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
