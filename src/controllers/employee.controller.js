const bcrypt = require("bcryptjs");
const { db } = require("../config/firebase");
const { isGlobalTenant } = require("../middleware/tenant.middleware");
const USERS = "users";
const ATTENDANCE = "attendance";
const dayjs = require("dayjs");

/* ================================
   ADD EMPLOYEE (Admin Only)
================================ */

exports.addEmployee = async (req, res) => {
    try {
        const { name, email, empID, labourType, wagesType, salaryPerDay } = req.body;

        // Validate required fields before they hit Firestore (undefined crashes Firestore queries)
        if (!empID || !email || !name) {
            return res.status(400).json({ message: "name, email, and empID are required" });
        }

        // Check duplicates
        let empQuery = db.collection(USERS).where("empID", "==", empID);
        let emailQuery = db.collection(USERS).where("email", "==", email);

        if (!isGlobalTenant(req)) {
            empQuery = empQuery.where("tenant_id", "==", req.tenantId);
            emailQuery = emailQuery.where("tenant_id", "==", req.tenantId);
        }

        const empCheck = await empQuery.get();

        if (!empCheck.empty)
            return res.status(400).json({ message: "EmpID already exists in this company" });

        const emailCheck = await emailQuery.get();

        if (!emailCheck.empty)
            return res.status(400).json({ message: "Email already exists" });

        // Default password = empID
        const hashedPassword = await bcrypt.hash(empID, 10);

        const userPayload = {
            name,
            email,
            empID,
            labourType,
            wagesType,
            salaryPerDay: Number(salaryPerDay),
            password: hashedPassword,
            role: "employee",
            approved: true,
            firstLogin: true,
            createdAt: new Date()
        };

        if (!isGlobalTenant(req)) {
            userPayload.tenant_id = req.tenantId;
        }

        await db.collection(USERS).add(userPayload);

        const cache = require("../utils/cache");
        cache.invalidatePrefix("employees_");

        res.json({ message: "Employee Created Successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ================================
   GET ALL EMPLOYEES (Admin Only)
================================ */

exports.getAllEmployees = async (req, res) => {
    try {
        const cache = require("../utils/cache");
        const tId = req.tenantId || 'GLOBAL';
        const cacheKey = `employees_${tId}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({ success: true, data: cachedData });
        }

        const snapshot = await db.collection(USERS).where("role", "==", "employee").get();

        const employees = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            delete data.password;

            if (!isGlobalTenant(req)) {
                if (data.tenant_id === req.tenantId || !data.tenant_id) {
                    employees.push({ id: doc.id, ...data });
                }
            } else {
                employees.push({ id: doc.id, ...data });
            }
        });

        cache.set(cacheKey, employees, 5 * 60 * 1000); // 5 mins cache
        res.json({ success: true, data: employees });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


/* ================================
   DELETE EMPLOYEE (Admin Only)
================================ */

exports.deleteEmployee = async (req, res) => {
    try {
        const { empID } = req.params;

        if (!empID) {
            return res.status(400).json({ message: "empID is required" });
        }

        let query = db.collection(USERS).where("empID", "==", empID);
        const snapshot = await query.get();

        if (snapshot.empty)
            return res.status(404).json({ message: "Employee not found" });

        const doc = snapshot.docs[0];
        const employeeData = doc.data();

        if (!isGlobalTenant(req)) {
            if (employeeData.tenant_id && employeeData.tenant_id !== req.tenantId) {
                return res.status(403).json({ message: "Access denied" });
            }
        }

        await doc.ref.delete();

        const cache = require("../utils/cache");
        cache.invalidatePrefix("employees_");

        res.json({ message: "Employee Deleted Successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


/* ================================
   UPDATE EMPLOYEE
   Admin can update anyone
   Employee can update only self
================================ */

exports.updateEmployee = async (req, res) => {
    try {
        const { empID } = req.params;
        const updates = req.body;

        if (!empID) {
            return res.status(400).json({ message: "empID is required" });
        }

        let query = db.collection(USERS).where("empID", "==", empID);
        const snapshot = await query.get();

        if (snapshot.empty)
            return res.status(404).json({ message: "Employee not found" });

        const doc = snapshot.docs[0];
        const employeeData = doc.data();

        // 🔐 Authorization Check
        if (
            req.user.role !== "admin" &&
            req.user.empID !== employeeData.empID
        ) {
            return res.status(403).json({ message: "Access denied" });
        }

        // Check if employee belongs to another company
        if (req.user.role === "admin" && !isGlobalTenant(req)) {
            if (employeeData.tenant_id && employeeData.tenant_id !== req.tenantId) {
                return res.status(403).json({ message: "Access denied: Employee belongs to a different company" });
            }
        }

        const finalUpdates = { ...updates };
        // Dynamically assign tenant_id to the admin's tenant if they are approving a tenantless employee
        if (req.user.role === "admin" && !isGlobalTenant(req) && !employeeData.tenant_id) {
            finalUpdates.tenant_id = req.tenantId;
        }

        await doc.ref.update(finalUpdates);

        const cache = require("../utils/cache");
        cache.invalidatePrefix("employees_");

        res.json({ message: "Employee Updated Successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getDashboard = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId)
            return res.status(400).json({ message: "Invalid token data" });

        const userDoc = await db.collection(USERS).doc(userId).get();

        if (!userDoc.exists)
            return res.status(404).json({ message: "User not found" });

        const user = userDoc.data();

        if (!user.empID)
            return res.status(400).json({ message: "empID missing in user" });

        // ✅ Format profile createdAt
        if (user.createdAt) {
            user.createdAt = dayjs(user.createdAt.toDate())
                .format("YYYY-MM-DD HH:mm");
        }

        const currentMonth = dayjs().format("YYYY-MM");

        const attendanceSnapshot = await db
            .collection(ATTENDANCE)
            .doc(user.empID)
            .collection(currentMonth)
            .get();

        // ✅ Format attendance timestamps
        const attendance = attendanceSnapshot.docs.map(doc => {
            const data = doc.data();

            return {
                ...data,
                createdAt: data.createdAt
                    ? dayjs(data.createdAt.toDate()).format("YYYY-MM-DD HH:mm")
                    : null,
                startTime: data.startTime
                    ? dayjs(data.startTime.toDate()).format("YYYY-MM-DD HH:mm")
                    : null,
                endTime: data.endTime
                    ? dayjs(data.endTime.toDate()).format("YYYY-MM-DD HH:mm")
                    : null
            };
        });

        // The salary module was deleted, stub to empty array until re-implemented
        const salaryRaw = [];
        // ✅ Format salary timestamps
        const salary = salaryRaw.map(item => ({
            ...item,
            createdAt: item.createdAt
                ? dayjs(item.createdAt.toDate()).format("YYYY-MM-DD HH:mm")
                : null
        }));

        delete user.password;

        res.json({
            message: `Welcome ${user.name}`,
            dashboard: {
                profile: user,
                attendance,
                salary
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ message: err.message });
    }
};


