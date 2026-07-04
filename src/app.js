const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',   // Set FRONTEND_URL in Railway to lock down CORS
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: false, // Let images be fetched on other ports/domains
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Cache invalidation middleware for mutations (POST/PUT/DELETE)
app.use((req, res, next) => {
    if (req.method !== "GET") {
        const cache = require("./utils/cache");
        cache.invalidatePrefix("projects_");
        cache.invalidatePrefix("wh_");
        cache.invalidatePrefix("user_profile_");
        cache.invalidatePrefix("approvals_");
    }
    next();
});

app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Routes
app.use("/api/super/tenants", require("./modules/tenant/tenant.routes"));
app.use("/api/super/users", require("./modules/user/user.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/attendance", require("./routes/attendance.routes"));
app.use("/api/employee", require("./routes/employee.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/addadmin", require("./routes/addadmin.routes"));
app.use("/api/mould", require("./modules/mould/mould.routes"));
app.use("/api/tenant", require("./routes/tenant.routes"));


// New Modular Architecture Routes
app.use("/api/projects", require("./modules/project/project.routes"));
app.use("/api/banks", require("./modules/bank/bank.routes"));
app.use("/api/works", require("./modules/work/work.routes"));
app.use("/api/materials", require("./modules/material/material.routes"));
app.use("/api/advances", require("./modules/advance/advance.routes"));
app.use("/api/site-expenses", require("./modules/expense/expense.routes"));
app.use("/api/dealers", require("./modules/dealer/dealer.routes"));
app.use("/api/approvals", require("./modules/approval/approval.routes"));
app.use("/api/labours", require("./modules/labour/labour.routes"));
app.use("/api/payments", require("./modules/payment/payment.routes"));
app.use("/api/tasks", require("./modules/task/task.routes"));
app.use("/api/lists", require("./modules/list/list.routes"));
app.use("/api/extra-works", require("./modules/extraWork/extraWork.routes"));
app.use("/api/additional-works", require("./modules/additionalWork/additionalWork.routes"));
app.use("/api/safety", require("./modules/safety/safety.routes"));
app.use("/api/site-management", require("./modules/site-management/siteManagement.routes"));
app.use("/api/permissions", require("./modules/permission/permission.routes"));
app.use("/api/print", require("./modules/print/print.routes"));
app.use("/api/document-scan", require("./modules/document-scan/documentScan.routes"));

// Error Middleware
app.use(require("./middleware/error.middleware").errorHandler);
module.exports = app;
