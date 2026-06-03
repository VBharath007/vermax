const { db } = require("../config/firebase"); // 👈 destructure db
const bcrypt = require("bcryptjs");
const { generateToken } = require("../utils/jwt");



exports.register = async (req, res) => {
    try {
        const { email, password, name, phone, companyName } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and Password required" });
        }

        const adminSnap = await db.collection('admins').where('email', '==', email).get();
        const userSnap = await db.collection('users').where('email', '==', email).get();
        
        if (!adminSnap.empty || !userSnap.empty) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save as pending admin (they will act as the admin of their company once approved)
        const newUser = {
            email,
            password: hashedPassword,
            name: name || '',
            phone: phone || '',
            companyName: companyName || '',
            role: 'admin',
            status: 'pending',
            tenant_id: null,
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('admins').add(newUser);

        res.status(201).json({
            message: "Registration successful. Please wait for Super Admin approval.",
            userId: docRef.id
        });
    } catch (error) {
        console.error('[register]', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.registerEmployee = async (req, res) => {
    try {
        const { email, empID, name, phone, labourType, wagesType, salaryPerDay } = req.body;
        if (!email || !empID || !name) {
            return res.status(400).json({ message: "Name, Email, and Employee ID are required" });
        }

        const adminSnap = await db.collection('admins').where('email', '==', email).get();
        const userSnap = await db.collection('users').where('email', '==', email).get();
        const empIDSnap = await db.collection('users').where('empID', '==', empID).get();
        
        if (!adminSnap.empty || !userSnap.empty) {
            return res.status(400).json({ message: "User with this email already exists" });
        }

        if (!empIDSnap.empty) {
            return res.status(400).json({ message: "Employee ID already registered" });
        }

        const hashedPassword = await bcrypt.hash(empID, 10);
        
        const newEmployee = {
            email,
            empID,
            name,
            phone: phone || '',
            labourType: labourType || 'Labour',
            wagesType: wagesType || 'Daily',
            salaryPerDay: salaryPerDay ? Number(salaryPerDay) : 0,
            password: hashedPassword,
            role: 'employee',
            approved: false,
            firstLogin: true,
            createdAt: new Date()
        };

        const docRef = await db.collection('users').add(newEmployee);

        res.status(201).json({
            message: "Employee registration successful.",
            userId: docRef.id
        });
    } catch (error) {
        console.error('[registerEmployee]', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and Password required" });
        }

        // ── Step 1: Search in 'admins' collection ──────────────
        let userDoc = null;
        let userId = null;
        let source = 'admins';

        const adminSnap = await db
            .collection('admins')
            .where('email', '==', email)
            .get();

        if (!adminSnap.empty) {
            userId = adminSnap.docs[0].id;
            userDoc = adminSnap.docs[0].data();
        } else {
            // ── Step 2: Fall back to 'users' collection (employees) ──
            source = 'users';
            const userSnap = await db
                .collection('users')
                .where('email', '==', email)
                .get();

            if (userSnap.empty) {
                return res.status(404).json({ message: "User not found" });
            }
            userId = userSnap.docs[0].id;
            userDoc = userSnap.docs[0].data();
        }

        // ── Step 3: Password verification ──────────────────────
        let passwordMatch = false;
        if (userDoc.password && userDoc.password.startsWith('$2')) {
            // Hashed password (bcrypt) — all new employees and admins
            passwordMatch = await bcrypt.compare(password, userDoc.password);
        } else {
            // Legacy plain-text fallback
            passwordMatch = (password === userDoc.password) || (userDoc.role === 'employee' && password === userDoc.empID);
        }
        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        // ── Step 3.5: Check Pending Approval Status ────────────────
        if (userDoc.status === 'pending') {
            return res.status(403).json({ message: "Account pending Super Admin approval. Please wait." });
        }

        if (userDoc.role === 'employee' && userDoc.approved !== true) {
            return res.status(403).json({ message: "Account pending Admin approval. Please wait." });
        }

        // ── Step 4: Generate JWT ────────────────────────────────
        const token = generateToken({
            id: userId,
            role: userDoc.role,
            empID: userDoc.empID,
            tenant_id: userDoc.tenant_id || (userDoc.role === 'super_admin' ? 'GLOBAL' : null)
        });

        const safeUser = { id: userId, ...userDoc };
        delete safeUser.password;   // never send password in response

        // ── Fetch Features (User-specific or Tenant-wide) ──
        if (userDoc.features && Array.isArray(userDoc.features)) {
            safeUser.features = userDoc.features;
        } else if (safeUser.tenant_id && safeUser.tenant_id !== 'GLOBAL') {
            const tenantDoc = await db.collection("tenants").doc(safeUser.tenant_id).get();
            if (tenantDoc.exists) {
                safeUser.features = tenantDoc.data().features || [];
            }
        } else if (safeUser.role === 'super_admin' || safeUser.role === 'admin') {
            // Give all features to GLOBAL admins for local testing
            safeUser.features = ['dashboard', 'project_management', 'approvals', 'employee_management', 'dealer_management', 'bank_management', 'reminders'];
        }

        res.status(200).json({
            message: "Login successful",
            token,
            user: safeUser
        });

    } catch (error) {
        console.error('[login]', error.message);
        res.status(500).json({ message: error.message });
    }
};



exports.verifyMFA = async (req, res) => {
    const { mfaCode, user } = req.body;

    if (mfaCode !== process.env.MFA_DEFAULT)
        return res.status(400).json({ message: "Invalid MFA Code" });

    let userId = user.id || user.uid;
    if (user.role === 'admin' && (!userId || userId === 'admin123')) {
        userId = 'defaultAdmin';
    }

    // Ensure token gets tenant_id
    let tenant_id = user.tenant_id || (user.role === 'super_admin' ? 'GLOBAL' : null);
    
    // For local mock testing, give 'admin' GLOBAL access if no tenant_id exists
    if (!tenant_id && user.role === 'admin') {
        tenant_id = 'GLOBAL';
    }

    const token = generateToken({
        id: userId,
        role: user.role,
        empID: user.empID,
        tenant_id: tenant_id
    });

    let features = [];
    if (user.features && Array.isArray(user.features)) {
        features = user.features;
    } else if (tenant_id && tenant_id !== 'GLOBAL') {
        const tenantDoc = await db.collection("tenants").doc(tenant_id).get();
        if (tenantDoc.exists) {
            features = tenantDoc.data().features || [];
        }
    } else if (tenant_id === 'GLOBAL') {
        features = ['dashboard', 'project_management', 'approvals', 'employee_management', 'dealer_management', 'bank_management', 'reminders'];
    }

    res.json({ 
        token,
        tenant_id,
        features
    });
};

exports.getMe = async (req, res) => {
    try {
        // Try admins collection first, then users
        let userDoc = await db.collection('admins').doc(req.user.id).get();
        if (!userDoc.exists) {
            userDoc = await db.collection('users').doc(req.user.id).get();
        }
        if (!userDoc.exists) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = { id: userDoc.id, ...userDoc.data() };
        delete user.password;

        // Fetch Tenant Features if they are not explicitly overridden at the user level
        if (user.features && Array.isArray(user.features)) {
            // keep user features
        } else if (user.tenant_id && user.tenant_id !== 'GLOBAL') {
            const tenantDoc = await db.collection("tenants").doc(user.tenant_id).get();
            if (tenantDoc.exists) {
                user.features = tenantDoc.data().features || [];
            }
        } else if (user.role === 'super_admin' || user.role === 'admin') {
            user.features = ['dashboard', 'project_management', 'approvals', 'employee_management', 'dealer_management', 'bank_management', 'reminders'];
        }

        res.status(200).json({ data: user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/auth/dashboard  →  returns admin info + summary counts
// ─────────────────────────────────────────────────────────────────
exports.dashboard = async (req, res) => {
    try {
        // Get admin profile
        let userDoc = await db.collection('admins').doc(req.user.id).get();
        if (!userDoc.exists) {
            userDoc = await db.collection('users').doc(req.user.id).get();
        }

        const adminData = userDoc.exists ? { ...userDoc.data() } : {};
        delete adminData.password;

        // Get summary counts (parallel)
        const [employeesSnap, approvalsSnap, projectsSnap] = await Promise.all([
            db.collection('users').where('role', '==', 'employee').get(),
            db.collection('approvals').get(),
            db.collection('projects').get(),
        ]);

        res.status(200).json({
            success: true,
            admin: adminData,
            summary: {
                totalEmployees: employeesSnap.size,
                totalApprovals: approvalsSnap.size,
                totalProjects: projectsSnap.size,
            }
        });
    } catch (error) {
        console.error('[dashboard]', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.updateFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ message: "fcmToken required" });
        }
        
        let userDocRef = db.collection('admins').doc(req.user.id);
        let userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            userDocRef = db.collection('users').doc(req.user.id);
            userDoc = await userDocRef.get();
        }
        if (!userDoc.exists) {
            return res.status(404).json({ message: "User not found" });
        }
        
        await userDocRef.update({ fcmToken });
        res.status(200).json({ success: true, message: "FCM token updated successfully" });
    } catch (error) {
        console.error('[updateFCMToken]', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.testFCM = async (req, res) => {
    try {
        const { admin } = require("../config/firebase");
        
        // Fetch all active tokens
        const adminsSnap = await db.collection('admins').get();
        const usersSnap = await db.collection('users').get();

        const tokens = new Set();
        adminsSnap.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken) tokens.add(data.fcmToken);
        });
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken) tokens.add(data.fcmToken);
        });

        const tokenList = Array.from(tokens);
        if (tokenList.length === 0) {
            return res.status(400).json({ success: false, message: "No registered FCM tokens found in database." });
        }

        const message = {
            data: {
                type: "reminder",
                title: "Test Reminder",
                notes: "Kira Test notification work aagudhu பாருங்க",
            },
            tokens: tokenList,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        if (response.successCount > 0) {
            console.log("🟢 [FCM Trigger Success] Test notification sent successfully to all devices.");
        } else {
            console.log(`📢 Test notification status: ${response.successCount} success, ${response.failureCount} failed.`);
        }
        
        // Diagnostic Info
        const allTasksSnap = await db.collection('tasks').get();
        const tasksList = [];
        allTasksSnap.forEach(d => tasksList.push({ id: d.id, ...d.data() }));
        tasksList.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        
        const recentTasks = tasksList.slice(0, 5).map(t => ({
            id: t.id,
            title: t.title,
            createdAt: t.createdAt,
            dueTimestamp: t.dueTimestamp,
            notified: t.notified,
            notificationError: t.notificationError || null,
            responseDetails: t.responseDetails || null,
            completed: t.completed
        }));

        res.status(200).json({
            success: true,
            firebaseProjectId: admin.app().options.projectId || "unknown",
            totalTasksInDb: tasksList.length,
            recentTasksInDb: recentTasks,
            tokensSent: tokenList.length,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses
        });
    } catch (error) {
        console.error('[testFCM]', error.message);
        res.status(500).json({ message: error.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) return res.status(400).json({ message: "User ID not found in token" });

        const snap = await db.collection('users').doc(userId).collection('notifications')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const notifications = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null
        }));

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error('[getNotifications]', error.message);
        res.status(500).json({ message: error.message });
    }
};
