const { db, storage } = require("../../config/firebase");
const { SITE_MANAGEMENT } = require("../../models/firestore.collections");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

const siteCollection = db.collection(SITE_MANAGEMENT);

// Helper to filter query by type and tenant_id
const getQuery = (type, tenant_id) => {
    let query = siteCollection.where("type", "==", type);
    if (tenant_id && tenant_id !== 'GLOBAL') {
        query = query.where("tenant_id", "==", tenant_id);
    }
    return query;
};

// ─── MATERIALS LOG CRUD ───

// Get active stock levels (initialize if they don't exist)
exports.getMaterialStocks = async (tenant_id) => {
    const snapshot = await getQuery("material_stock", tenant_id).get();
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (results.length === 0) {
        const defaults = [
            { materialId: 'cement', name: 'Cement (OPC 53)', stock: 142.0, unit: 'Bags' },
            { materialId: 'sand', name: 'M-Sand', stock: 2.4, unit: 'Loads' },
            { materialId: 'steel', name: 'Steel Rods (12mm)', stock: 0.8, unit: 'Tons' },
            { materialId: 'aggregate', name: 'Coarse Aggregate', stock: 4.1, unit: 'Loads' },
        ];

        const createdDefaults = [];
        for (const item of defaults) {
            const doc = {
                type: "material_stock",
                ...item,
                createdAt: new Date().toISOString(),
                tenant_id
            };
            const docRef = await siteCollection.add(doc);
            createdDefaults.push({ id: docRef.id, ...doc });
        }
        return createdDefaults;
    }

    return results;
};

exports.updateMaterialStock = async (id, stock, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "material_stock") throw new Error("Material stock not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.update({ stock: Number(stock), updatedAt: new Date().toISOString() });
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.addMaterialLog = async (data, tenant_id) => {
    const { material, type, qty, by, date } = data;
    if (!material || !type || !qty) throw new Error("Material, type, and qty are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newLog = {
        type: "material_log",
        material,
        transactionType: type, // "Issue" or "Received"
        qty,
        by: by || "Admin",
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await siteCollection.add(newLog);
    return { id: docRef.id, ...newLog };
};

exports.getMaterialLogs = async (tenant_id) => {
    const snapshot = await getQuery("material_log", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.deleteMaterialLog = async (id, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "material_log") throw new Error("Material log not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Material log deleted successfully", id };
};

// ─── DAILY DIARY CRUD ───

exports.addDiaryEntry = async (data, tenant_id) => {
    const { weather, workers, notes, date } = data;
    if (!weather || !workers || !notes) throw new Error("Weather, workers count, and notes are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newEntry = {
        type: "diary",
        weather,
        workers: Number(workers) || 0,
        notes,
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await siteCollection.add(newEntry);
    return { id: docRef.id, ...newEntry };
};

exports.getDiaryEntries = async (tenant_id) => {
    const snapshot = await getQuery("diary", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.updateDiaryEntry = async (id, data, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "diary") throw new Error("Diary entry not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = {
        weather: data.weather || doc.data().weather,
        workers: data.workers !== undefined ? Number(data.workers) : doc.data().workers,
        notes: data.notes || doc.data().notes,
        date: data.date || doc.data().date,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.deleteDiaryEntry = async (id, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "diary") throw new Error("Diary entry not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Diary entry deleted successfully", id };
};

// ─── PUNCH LIST CRUD ───

exports.addPunchItem = async (data, tenant_id) => {
    const { desc, trade, status, date } = data;
    if (!desc || !trade) throw new Error("Description and trade category are required");
    if (!tenant_id) throw new Error("tenant_id is required");

    const newSnag = {
        type: "punch_item",
        desc: desc.trim(),
        trade: trade.trim(),
        status: status || "Open", // "Open", "In Progress", "Closed"
        date: date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await siteCollection.add(newSnag);
    return { id: docRef.id, ...newSnag };
};

exports.getPunchItems = async (tenant_id) => {
    const snapshot = await getQuery("punch_item", tenant_id).get();
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.updatePunchItem = async (id, data, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "punch_item") throw new Error("Punch list item not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const updates = {
        desc: data.desc ? data.desc.trim() : doc.data().desc,
        trade: data.trade ? data.trade.trim() : doc.data().trade,
        status: data.status || doc.data().status,
        date: data.date || doc.data().date,
        updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    return { id, ...updated.data() };
};

exports.deletePunchItem = async (id, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "punch_item") throw new Error("Punch list item not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.delete();
    return { message: "Punch item deleted successfully", id };
};

// ─── PROGRESS PHOTOS CRUD (With Cloudinary & Fallback) ───

exports.uploadPhoto = async (file, title, tenant_id, baseUrl) => {
    if (!file) throw new Error("No image file provided");
    if (!tenant_id) throw new Error("tenant_id is required");

    const timestamp = Date.now();
    const extension = file.originalname.split(".").pop() || "jpg";
    const folder = `tenants/${tenant_id}/site-management/photos`;

    let imageUrl;
    let storagePath;
    let fallbackToLocal = false;

    try {
        // Upload to Cloudinary using upload_stream
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: "auto",
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(file.buffer);
        });

        imageUrl = uploadResult.secure_url;
        storagePath = `cloudinary:${uploadResult.public_id}`;
    } catch (err) {
        console.warn("⚠️ Cloudinary upload failed, falling back to local file storage:", err.message);
        fallbackToLocal = true;
    }

    if (fallbackToLocal) {
        const uploadDir = path.join(__dirname, "../../../public/uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `photo_${timestamp}.${extension}`;
        const localPath = path.join(uploadDir, filename);
        fs.writeFileSync(localPath, file.buffer);

        imageUrl = `${baseUrl || "http://localhost:5000"}/uploads/${filename}`;
        storagePath = `local:${filename}`;
    }

    const photoRecord = {
        type: "photo",
        title: title || "Progress Update",
        imageUrl,
        storagePath,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        tenant_id
    };

    const docRef = await siteCollection.add(photoRecord);
    return { id: docRef.id, ...photoRecord };
};

exports.getPhotos = async (tenant_id) => {
    const snapshot = await getQuery("photo", tenant_id).get();
    const results = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, title: data.title, imageUrl: data.imageUrl, date: data.date, createdAt: data.createdAt };
    });
    return results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

exports.updatePhoto = async (id, title, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "photo") throw new Error("Photo record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    await docRef.update({ title: title.trim(), updatedAt: new Date().toISOString() });
    const updated = await docRef.get();
    return { id, title: updated.data().title, imageUrl: updated.data().imageUrl, date: updated.data().date };
};

exports.deletePhoto = async (id, tenant_id) => {
    const docRef = siteCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().type !== "photo") throw new Error("Photo record not found");
    if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

    const data = doc.data();

    if (data.storagePath) {
        if (data.storagePath.startsWith("cloudinary:")) {
            try {
                const publicId = data.storagePath.replace("cloudinary:", "");
                await cloudinary.uploader.destroy(publicId);
            } catch (err) {
                console.error(`Failed to delete from Cloudinary: ${err.message}`);
            }
        } else if (data.storagePath.startsWith("local:")) {
            try {
                const filename = data.storagePath.replace("local:", "");
                const localPath = path.join(__dirname, "../../../public/uploads", filename);
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                }
            } catch (err) {
                console.error(`Failed to delete local file: ${err.message}`);
            }
        } else {
            // Backward compatibility for Firebase
            try {
                const bucket = storage.bucket();
                const file = bucket.file(data.storagePath);
                await file.delete();
            } catch (err) {
                console.error(`Failed to delete file from Firebase Storage: ${err.message}`);
            }
        }
    }

    await docRef.delete();
    return { message: "Photo deleted successfully", id };
};
