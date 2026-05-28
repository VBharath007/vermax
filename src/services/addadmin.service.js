const { db } = require("../config/firebase");
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const jwt = require("jsonwebtoken");

const USERS = "users";

class AdminService {

    // Create Admin (defaultAdmin only)
    static async addAdmin({ name, email, empID, labourType, wagesType, salaryPerDay, isDefault = false }) {
        // Validate required fields before hitting Firestore
        if (!empID || !email) {
            throw new Error("empID and email are required");
        }
        // Check duplicates
        const empCheck = await db.collection(USERS).where("empID", "==", empID).get();
        if (!empCheck.empty) throw new Error("EmpID already exists");

        const emailCheck = await db.collection(USERS).where("email", "==", email).get();
        if (!emailCheck.empty) throw new Error("Email already exists");

        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const docRef = await db.collection(USERS).add({
            name,
            email,
            empID,
            labourType,
            wagesType,
            salaryPerDay: Number(salaryPerDay),
            password: hashedPassword,
            role: "admin",
            firstLogin: true,
            defaultAdmin: isDefault,
            mfaVerified: false,
            createdAt: new Date()
        });

        return { id: docRef.id, tempPassword };
    }

    static async register({ name, email, password, phone, role }) {
        if (!email || !password) {
            throw new Error("email and password are required");
        }
        // Check email duplicate
        const emailCheck = await db.collection(USERS).where("email", "==", email).get();
        if (!emailCheck.empty) throw new Error("Email already exists");

        // Generate empID (ADM-XXXX)
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const empID = `ADM-${randomDigits}`;

        const hashedPassword = await bcrypt.hash(password, 10);

        const docRef = await db.collection(USERS).add({
            name,
            email,
            empID,
            phone,
            password: hashedPassword,
            role: role || "admin",
            firstLogin: true,
            mfaVerified: false,
            defaultAdmin: false,
            createdAt: new Date()
        });

        return { id: docRef.id, empID };
    }



    // Fetch all admins
    static async getAllAdmins() {
        const snapshot = await db
            .collection(USERS)
            .where("role", "==", "admin")
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();

            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt
                    ? dayjs(data.createdAt.toDate()).format("YYYY-MM-DD HH:mm:ss")
                    : null
            };
        });
    }

    // Update admin
    static async updateAdmin(docRef, updates) {
        // Prevent normal admin from updating default admin
        const adminData = (await docRef.get()).data();
        if (adminData.defaultAdmin && !updates.forceUpdate) {
            throw new Error("Cannot update default admin");
        }
        await docRef.update(updates);
    }

    // Delete admin
    static async deleteAdmin(docRef) {
        const adminData = (await docRef.get()).data();
        if (adminData.defaultAdmin) throw new Error("Cannot delete default admin");
        await docRef.delete();
    }

    // Set new admin password after MFA
    static async setAdminPassword(docRef, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await docRef.update({ password: hashedPassword, mfaVerified: true, firstLogin: false });
    }




}



const findAdmin = async (email, empID) => {
    // Guard: Firestore throws if undefined is passed to .where()
    if (!email || !empID) {
        return null;
    }
    const snapshot = await db.collection("users")
        .where("email", "==", email)
        .where("empID", "==", empID)
        .where("role", "==", "admin")
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
};

// 🔐 Create MFA Password
const createMfaPassword = async (userId, mfaPassword) => {
    const hashed = await bcrypt.hash(mfaPassword, 10);
    await db.collection("users").doc(userId).update({
        mfaPassword: hashed
    });
};

// 🔐 Verify MFA
const verifyMfaPassword = async (user, mfaPassword) => {
    return await bcrypt.compare(mfaPassword, user.mfaPassword);
};

// 🎟 Generate Login Token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            empID: user.empID,   // 🔥 MUST INCLUDE
            role: user.role,
            defaultAdmin: user.defaultAdmin
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
};

// 🎟 Generate MFA Setup Token
const generateMfaSetupToken = (user) => {
    return jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );
};

const getAdminByEmpID = async (empID) => {
    const snapshot = await db.collection("users")
        .where("empID", "==", empID)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];

    return {
        docId: doc.id,
        ...doc.data()
    };
};

module.exports = {
    AdminService,
    findAdmin,
    createMfaPassword,
    verifyMfaPassword,
    generateToken,
    generateMfaSetupToken,
    getAdminByEmpID
};