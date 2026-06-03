const { db } = require("../../config/firebase");
const dayjs = require("dayjs");
const cloudinary = require("cloudinary").v2;

// Ensure Cloudinary is configured
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

exports.uploadImage = async (projectNo, file, metadata) => {
    try {
        if (!file) {
            throw new Error("No image file provided");
        }

        const timestamp = Date.now();
        const extension = file.originalname.split(".").pop();
        const imageId = `img_${timestamp}`;
        const folder = `projects/${projectNo}/images`;

        // Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder, resource_type: "auto" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(file.buffer);
        });

        const imageUrl = uploadResult.secure_url;
        const storagePath = `cloudinary:${uploadResult.public_id}`;

        const imageRecord = {
            projectNo,
            imageId,
            imageName: file.originalname,
            imageUrl,
            imageType: metadata.imageType || "others",
            uploadedBy: metadata.uploadedBy || "admin",
            uploadedAt: dayjs().format("YYYY-MM-DD"),
            storagePath
        };

        await db.collection("projectImages").doc(imageId).set(imageRecord);

        return imageRecord;

    } catch (error) {
        throw new Error(`Failed to upload image: ${error.message}`);
    }
};

exports.getProjectImages = async (projectNo) => {
    try {

        const snapshot = await db
            .collection("projectImages")
            .where("projectNo", "==", projectNo)
            .get();

        const images = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            delete data.storagePath;
            images.push(data);
        });

        return images;

    } catch (error) {
        throw new Error(`Failed to fetch images: ${error.message}`);
    }
};

exports.getImageById = async (imageId) => {
    try {

        const doc = await db.collection("projectImages").doc(imageId).get();

        if (!doc.exists) {
            throw new Error("Image not found");
        }

        const data = doc.data();
        delete data.storagePath;

        return data;

    } catch (error) {
        throw new Error(`Failed to fetch image: ${error.message}`);
    }
};

exports.getAllImages = async () => {
    try {

        const snapshot = await db.collection("projectImages").get();

        const images = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            delete data.storagePath;
            images.push(data);
        });

        return images;

    } catch (error) {
        throw new Error(`Failed to fetch images: ${error.message}`);
    }
};

exports.deleteImage = async (imageId) => {
    try {

        const docRef = db.collection("projectImages").doc(imageId);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new Error("Image not found");
        }

        const imageData = doc.data();

        if (imageData.storagePath && imageData.storagePath.startsWith("cloudinary:")) {
            const publicId = imageData.storagePath.replace("cloudinary:", "");
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudinaryErr) {
                console.error("Failed to delete image from Cloudinary:", cloudinaryErr.message);
            }
        }

        await docRef.delete();

        return { message: "Image deleted successfully" };

    } catch (error) {
        throw new Error(`Failed to delete image: ${error.message}`);
    }
};