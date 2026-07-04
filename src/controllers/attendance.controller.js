const attendanceService = require("../services/attendance.service");
const { db } = require("../config/firebase");
const { ATTENDANCE } = require("../models/firestore.collections");
const dayjs = require("dayjs");


exports.checkIn = async (req, res, next) => {
    try {
        const empID = req.user.empID; // Authenticated employee
        if (!empID) return res.status(400).json({ message: "Employee ID not found in token" });
        const { latitude, longitude, locationName } = req.body;
        const result = await attendanceService.checkIn(empID, latitude, longitude, locationName);
        const cache = require("../utils/cache");
        cache.invalidate(`attendance_today_all_${req.tenantId || 'GLOBAL'}`);
        res.json(result);
    } catch (err) {
        next(err);
    }
};

exports.checkOut = async (req, res, next) => {
    try {
        const empID = req.user.empID;
        if (!empID) return res.status(400).json({ message: "Employee ID not found in token" });
        const result = await attendanceService.checkOut(empID);
        const cache = require("../utils/cache");
        cache.invalidate(`attendance_today_all_${req.tenantId || 'GLOBAL'}`);
        res.json(result);
    } catch (err) {
        next(err);
    }
};

exports.getTodayAttendance = async (req, res, next) => {
    try {
        const empID = req.user.empID;
        if (!empID) return res.status(400).json({ message: "Employee ID not found in token" });
        const result = await attendanceService.getTodayAttendance(empID);
        res.json(result);
    } catch (err) {
        next(err);
    }
};

exports.getAttendanceByMonth = async (req, res) => {
    try {
        const { empID, month } = req.params;

        const snapshot = await db
            .collection(ATTENDANCE)
            .doc(empID)
            .collection(month)
            .get();

        const attendance = snapshot.docs.map(doc => {
            const data = doc.data();

            return {
                ...data,
                startTime: data.startTime
                    ? dayjs(data.startTime.toDate()).format("DD-MM-YYYY HH:mm:ss")
                    : null,
                endTime: data.endTime
                    ? dayjs(data.endTime.toDate()).format("DD-MM-YYYY HH:mm:ss")
                    : null,
                createdAt: data.createdAt
                    ? dayjs(data.createdAt.toDate()).format("DD-MM-YYYY HH:mm:ss")
                    : null
            };
        });

        res.json({ attendance });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAllTodayAttendance = async (req, res, next) => {
    try {
        const cache = require("../utils/cache");
        const tId = req.tenantId || 'GLOBAL';
        const cacheKey = `attendance_today_all_${tId}`;
        
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({ success: true, data: cachedData });
        }

        const today = dayjs();
        const date = today.format("YYYY-MM-DD");
        const month = today.format("YYYY-MM");

        // 1. Fetch all employees in the admin's tenant (or all employees if global/no tenant restriction)
        const employeesSnapshot = await db.collection("users").where("role", "==", "employee").get();
        
        const employeeList = [];
        employeesSnapshot.forEach(doc => {
            const data = doc.data();
            if (req.tenantId && req.tenantId !== "GLOBAL") {
                if (data.tenant_id === req.tenantId || !data.tenant_id) {
                    employeeList.push({ id: doc.id, ...data });
                }
            } else {
                employeeList.push({ id: doc.id, ...data });
            }
        });

        // 2. Build doc references for batch fetch
        const docRefs = employeeList.map(emp => 
            db.collection(ATTENDANCE).doc(emp.empID).collection(month).doc(date)
        );

        const attDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];

        // 3. Process attendance list using the batch-fetched documents
        const results = employeeList.map((emp, index) => {
            const attDoc = attDocs[index];
            if (attDoc && attDoc.exists) {
                const attData = attDoc.data();
                
                // Format the sessions list
                const sessions = attData.sessions || [];
                const formattedSessions = sessions.map(s => {
                    const sStartTime = s.startTime ? (s.startTime.toDate ? s.startTime.toDate() : new Date(s.startTime)) : null;
                    const sEndTime = s.endTime ? (s.endTime.toDate ? s.endTime.toDate() : new Date(s.endTime)) : null;
                    return {
                        startTime: sStartTime ? dayjs(sStartTime).format("YYYY-MM-DD HH:mm:ss") : null,
                        endTime: sEndTime ? dayjs(sEndTime).format("YYYY-MM-DD HH:mm:ss") : null,
                        locationName: s.locationName || "Unknown Location",
                        latitude: s.latitude || null,
                        longitude: s.longitude || null,
                        workedHours: s.workedHours || 0
                    };
                });

                return {
                    empID: emp.empID,
                    name: emp.name,
                    email: emp.email,
                    labourType: emp.labourType || 'Labour',
                    checkedIn: true,
                    status: attData.status,
                    startTime: attData.startTime ? dayjs(attData.startTime.toDate()).format("YYYY-MM-DD HH:mm:ss") : null,
                    endTime: attData.endTime ? dayjs(attData.endTime.toDate()).format("YYYY-MM-DD HH:mm:ss") : null,
                    locationName: attData.locationName || "Unknown Location",
                    latitude: attData.latitude || null,
                    longitude: attData.longitude || null,
                    sessions: formattedSessions
                };
            } else {
                return {
                    empID: emp.empID,
                    name: emp.name,
                    email: emp.email,
                    labourType: emp.labourType || 'Labour',
                    checkedIn: false,
                    status: "Absent",
                    startTime: null,
                    endTime: null,
                    locationName: null,
                    latitude: null,
                    longitude: null,
                    sessions: []
                };
            }
        });

        cache.set(cacheKey, results, 5 * 60 * 1000); // 5 mins cache
        res.json({ success: true, data: results });
    } catch (err) {
        next(err);
    }
};

exports.resetTodayAttendance = async (req, res, next) => {
    try {
        const empID = req.user.empID;
        if (!empID) {
            return res.status(400).json({ message: "empID missing in token" });
        }
        
        const dayjs = require("dayjs");
        const today = dayjs();
        const date = today.format("YYYY-MM-DD");
        const month = today.format("YYYY-MM");
        const { ATTENDANCE } = require("../models/firestore.collections");

        const docRef = db.collection(ATTENDANCE).doc(empID).collection(month).doc(date);
        await docRef.delete();

        const cache = require("../utils/cache");
        cache.invalidate(`attendance_today_all_${req.tenantId || 'GLOBAL'}`);

        res.json({ success: true, message: "Today's attendance reset successfully" });
    } catch (err) {
        next(err);
    }
};

