const jwt = require("jsonwebtoken");



exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader) {
        token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // contains id, role, empID
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};


exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Admin only." });
    }
};

exports.isSiteManager = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "No token provided" });
    }
    const role = req.user.role;
    const labourType = (req.user.labourType || "").toLowerCase();
    
    if (role === "admin" || ["manager", "supervisor", "engineer"].includes(labourType)) {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Site Manager level required." });
    }
};
