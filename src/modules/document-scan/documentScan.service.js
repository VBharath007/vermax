const { db } = require("../../config/firebase");
const cloudinary = require("cloudinary").v2;
const https = require("https");
const http = require("http");

cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });

const COLLECTION = "document_scans";

// ── Gemini Vision API call ──────────────────────────────────────────────────
const callGeminiVision = (base64Data, mimeType) => {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return reject(new Error("GEMINI_API_KEY is not set in .env"));

        const prompt = `You are an expert document data extractor for a Construction ERP system.
Analyze this document (invoice, receipt, delivery note, quotation, or any construction-related document) and extract ALL available information.

Return a valid JSON object with this EXACT structure (use null for missing fields, empty arrays [] for missing lists):

{
  "documentType": "Invoice | Receipt | Delivery Note | Quotation | Work Order | Bill | Other",
  "confidence": "High | Medium | Low",
  "client": {
    "name": null,
    "phone": null,
    "email": null,
    "address": null,
    "gst": null
  },
  "vendor": {
    "name": null,
    "phone": null,
    "email": null,
    "address": null,
    "gst": null
  },
  "document": {
    "number": null,
    "date": null,
    "dueDate": null,
    "projectName": null,
    "projectNo": null,
    "poNumber": null
  },
  "items": [
    {
      "name": null,
      "description": null,
      "quantity": null,
      "unit": null,
      "rate": null,
      "amount": null
    }
  ],
  "financials": {
    "subtotal": null,
    "tax": null,
    "taxPercent": null,
    "discount": null,
    "totalAmount": null,
    "paidAmount": null,
    "dueAmount": null,
    "paymentMethod": null
  },
  "rawText": "Full extracted text from the document verbatim",
  "summary": "2-3 sentence human-readable summary of this document",
  "warnings": []
}

IMPORTANT:
- Extract EVERY piece of text you can see
- For amounts, extract numbers only (no currency symbols)
- Dates should be in DD-MM-YYYY format
- If you see construction materials (cement, sand, steel, etc.), list each as a separate item
- Be as accurate as possible
- Return ONLY the JSON, no explanation`;

        const body = JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                maxOutputTokens: 4096
            }
        });

        const options = {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) return reject(new Error(parsed.error.message));
                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    // Strip markdown code blocks if present
                    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                    const result = JSON.parse(clean);
                    resolve(result);
                } catch (e) {
                    reject(new Error("Failed to parse Gemini response: " + e.message));
                }
            });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
};

// ── Convert first PDF page to image using Cloudinary transformation ─────────
const uploadToCloudinaryAndGetBase64 = async (buffer, mimeType, tenant_id) => {
    const folder = `tenants/${tenant_id}/document-scans`;

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: mimeType === "application/pdf" ? "raw" : "image",
                format: mimeType === "application/pdf" ? "jpg" : undefined,
                transformation: mimeType === "application/pdf"
                    ? [{ page: 1, fetch_format: "jpg", quality: "auto" }]
                    : undefined
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(buffer);
    });

    return {
        secureUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        cloudinaryPublicId: uploadResult.public_id
    };
};

// ── Fetch image from URL and return base64 ──────────────────────────────────
const urlToBase64 = (url) => {
    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;
        client.get(url, (res) => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString("base64"));
            });
        }).on("error", reject);
    });
};

// ── Main service functions ──────────────────────────────────────────────────

exports.analyzeDocument = async (file, tenant_id, uploadedBy) => {
    const { buffer, mimetype, originalname } = file;

    let imageBase64;
    let imageUrl = null;
    let cloudinaryPublicId = null;
    let effectiveMimeType = mimetype;

    // Upload to Cloudinary for storage + get image URL
    try {
        const cloudResult = await uploadToCloudinaryAndGetBase64(buffer, mimetype, tenant_id);
        imageUrl = cloudResult.secureUrl;
        cloudinaryPublicId = cloudResult.cloudinaryPublicId;

        // For PDFs, Cloudinary converts to image - fetch it back for Gemini
        if (mimetype === "application/pdf") {
            // Get JPEG version from Cloudinary
            const jpegUrl = imageUrl.replace(/\.[^.]+$/, ".jpg");
            imageBase64 = await urlToBase64(jpegUrl).catch(() => null);
            effectiveMimeType = "image/jpeg";
        }
    } catch (uploadErr) {
        console.warn("[DocumentScan] Cloudinary upload failed, using buffer directly:", uploadErr.message);
    }

    // If we don't have base64 yet (no cloudinary / direct image), use buffer
    if (!imageBase64) {
        imageBase64 = buffer.toString("base64");
    }

    // Call Gemini Vision API
    const extractedData = await callGeminiVision(imageBase64, effectiveMimeType);

    // Build the scan record
    const now = new Date().toISOString();
    const scanRecord = {
        tenant_id,
        uploadedBy,
        fileName: originalname,
        fileType: mimetype,
        imageUrl: imageUrl || null,
        cloudinaryPublicId: cloudinaryPublicId || null,
        extractedData,
        documentType: extractedData.documentType || "Unknown",
        confidence: extractedData.confidence || "Low",
        totalAmount: extractedData.financials?.totalAmount || null,
        clientName: extractedData.client?.name || extractedData.vendor?.name || null,
        itemCount: extractedData.items?.length || 0,
        createdAt: now,
        updatedAt: now
    };

    const docRef = await db.collection(COLLECTION).add(scanRecord);
    return { id: docRef.id, ...scanRecord };
};

exports.getScanHistory = async (tenant_id) => {
    let query = db.collection(COLLECTION).orderBy("createdAt", "desc").limit(50);
    if (tenant_id && tenant_id !== "GLOBAL") {
        query = db.collection(COLLECTION)
            .where("tenant_id", "==", tenant_id)
            .orderBy("createdAt", "desc")
            .limit(50);
    }
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

exports.deleteScan = async (id, tenant_id) => {
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Scan record not found");
    if (tenant_id && tenant_id !== "GLOBAL" && doc.data().tenant_id !== tenant_id) {
        throw new Error("Unauthorized");
    }

    // Delete from Cloudinary if we have a public ID
    const data = doc.data();
    if (data.cloudinaryPublicId) {
        try {
            await cloudinary.uploader.destroy(data.cloudinaryPublicId, {
                resource_type: data.fileType === "application/pdf" ? "raw" : "image"
            });
        } catch (e) {
            console.warn("[DocumentScan] Cloudinary delete failed:", e.message);
        }
    }

    await docRef.delete();
    return { deleted: true, id };
};
