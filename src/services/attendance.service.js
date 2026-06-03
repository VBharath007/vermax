const dayjs = require("dayjs");
const { db } = require("../config/firebase");
const { ATTENDANCE } = require("../models/firestore.collections");

exports.checkIn = async (empID, latitude, longitude, locationName) => {
    try {
        const today = dayjs();
        const date = today.format("YYYY-MM-DD");
        const month = today.format("YYYY-MM");

        const docRef = db.collection(ATTENDANCE).doc(empID).collection(month).doc(date);
        const doc = await docRef.get();
        
        let sessions = [];
        let startTime = new Date();
        
        if (doc.exists) {
            const data = doc.data();
            sessions = data.sessions || [];
            
            // If there's an old record without sessions array but has startTime, migrate it
            if (sessions.length === 0 && data.startTime) {
                sessions.push({
                    startTime: data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime),
                    endTime: data.endTime ? (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime)) : null,
                    latitude: data.latitude || null,
                    longitude: data.longitude || null,
                    locationName: data.locationName || null,
                    workedHours: data.workedHours || 0
                });
            }
            
            // If the last session is active (no endTime), user is already checked in
            if (sessions.length > 0 && !sessions[sessions.length - 1].endTime) {
                return { message: "Already checked in", status: "Present" };
            }
            
            if (data.startTime) {
                startTime = data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime);
            }
        }

        const newSession = {
            startTime: new Date(),
            endTime: null,
            latitude: latitude || null,
            longitude: longitude || null,
            locationName: locationName || null,
            workedHours: 0
        };
        sessions.push(newSession);

        await docRef.set({
            status: "Present",
            startTime: startTime,
            date,
            createdAt: doc.exists ? (doc.data().createdAt || new Date()) : new Date(),
            sessions: sessions
        }, { merge: true });

        return { message: "Check-in successful", status: "Present" };
    } catch (err) {
        throw new Error(err.message);
    }
};

exports.checkOut = async (empID) => {
    try {
        const today = dayjs();
        const date = today.format("YYYY-MM-DD");
        const month = today.format("YYYY-MM");

        const docRef = db.collection(ATTENDANCE).doc(empID).collection(month).doc(date);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return { message: "Cannot check out without checking in first", status: "Error" };
        }

        const data = doc.data();
        let sessions = data.sessions || [];

        // Migrate old record if no sessions list
        if (sessions.length === 0 && data.startTime) {
            sessions.push({
                startTime: data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime),
                endTime: data.endTime ? (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime)) : null,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                locationName: data.locationName || null,
                workedHours: data.workedHours || 0
            });
        }

        if (sessions.length === 0) {
            return { message: "Cannot check out without checking in first", status: "Error" };
        }

        const activeSessionIndex = sessions.findIndex(s => !s.endTime);
        if (activeSessionIndex === -1) {
            return { message: "Cannot check out without checking in first", status: "Error" };
        }

        const activeSession = sessions[activeSessionIndex];
        const endTime = new Date();
        const sessionStartTime = activeSession.startTime.toDate ? activeSession.startTime.toDate() : new Date(activeSession.startTime);
        
        let workedHours = (endTime - sessionStartTime) / (1000 * 60 * 60);
        if (workedHours < 0) workedHours = 0;

        activeSession.endTime = endTime;
        activeSession.workedHours = workedHours;
        sessions[activeSessionIndex] = activeSession;

        // Calculate total hours for the day
        let totalWorkedHours = 0;
        sessions.forEach(s => {
            totalWorkedHours += s.workedHours || 0;
        });

        let status = "Absent";
        if (totalWorkedHours >= 8) {
            status = "Present";
        } else if (totalWorkedHours >= 4) {
            status = "Half Day";
        }

        await docRef.update({
            endTime: endTime,
            status: status,
            workedHours: totalWorkedHours,
            sessions: sessions
        });

        return { message: "Check-out successful", status, workedHours: totalWorkedHours };
    } catch (err) {
        throw new Error(err.message);
    }
};

exports.getTodayAttendance = async (empID) => {
    try {
        const today = dayjs();
        const date = today.format("YYYY-MM-DD");
        const month = today.format("YYYY-MM");

        const docRef = db.collection(ATTENDANCE).doc(empID).collection(month).doc(date);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return { checkedIn: false, checkedOut: false, data: null };
        }

        const data = doc.data();
        let sessions = data.sessions || [];

        // Migrate old record if no sessions list
        if (sessions.length === 0 && data.startTime) {
            sessions.push({
                startTime: data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime),
                endTime: data.endTime ? (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime)) : null,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                locationName: data.locationName || null,
                workedHours: data.workedHours || 0
            });
        }

        const hasActiveSession = sessions.length > 0 && !sessions[sessions.length - 1].endTime;
        const hasCompletedSession = sessions.length > 0 && !!sessions[sessions.length - 1].endTime;

        // Format sessions for JSON response
        const formattedSessions = sessions.map(s => {
            const sStart = s.startTime.toDate ? s.startTime.toDate().toISOString() : new Date(s.startTime).toISOString();
            const sEnd = s.endTime ? (s.endTime.toDate ? s.endTime.toDate().toISOString() : new Date(s.endTime).toISOString()) : null;
            return {
                ...s,
                startTime: sStart,
                endTime: sEnd
            };
        });

        const rootStart = data.startTime ? (data.startTime.toDate ? data.startTime.toDate().toISOString() : new Date(data.startTime).toISOString()) : null;
        const rootEnd = data.endTime ? (data.endTime.toDate ? data.endTime.toDate().toISOString() : new Date(data.endTime).toISOString()) : null;

        return {
            checkedIn: hasActiveSession,
            checkedOut: hasCompletedSession && !hasActiveSession,
            serverTime: new Date().toISOString(),
            data: {
                ...data,
                startTime: rootStart,
                endTime: rootEnd,
                sessions: formattedSessions
            }
        };
    } catch (err) {
        throw new Error(err.message);
    }
};
