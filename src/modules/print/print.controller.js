const PDFDocument = require("pdfkit");
const admin = require("firebase-admin");
const db = admin.firestore();
const numberToWords = require("../../utils/numberToWords");

// Helper to fetch image URL as buffer
async function fetchImageBuffer(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        console.error("Failed to fetch image URL for PDF:", url, e.message);
        return null;
    }
}

// Write print log for audit trail
async function logPrint(tenantId, user, documentType, documentId) {
    try {
        await db.collection("printLogs").add({
            tenant_id: tenantId || "GLOBAL",
            userId: user?.id || user?.empID || "unknown",
            userName: user?.name || user?.username || "System",
            documentType,
            documentId,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Failed to write print audit log:", e.message);
    }
}

// Common header generator
async function generateHeader(doc, companyProfile, titleText) {
    let y = 40;
    
    // Draw Logo on left if available
    let logoBuffer = null;
    if (companyProfile?.logoUrl) {
        logoBuffer = await fetchImageBuffer(companyProfile.logoUrl);
    }
    
    if (logoBuffer) {
        try {
            doc.image(logoBuffer, 40, y, { width: 60 });
        } catch (imgErr) {
            console.error("PDFKit error inserting image, rendering as text:", imgErr.message);
            doc.rect(40, y, 60, 60).strokeColor("#cbd5e1").lineWidth(1).stroke();
            doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text("Logo", 45, y + 25);
        }
        doc.font("Helvetica-Bold").fontSize(18).fillColor("#1e293b").text(companyProfile.companyName || "Company Name", 115, y);
        doc.font("Helvetica").fontSize(9).fillColor("#475569");
        if (companyProfile.address) doc.text(companyProfile.address, 115, y + 22, { width: 440 });
        let contactInfo = "";
        if (companyProfile.contactNumber) contactInfo += `Phone: ${companyProfile.contactNumber}  `;
        if (companyProfile.contactEmail) contactInfo += `Email: ${companyProfile.contactEmail}`;
        if (contactInfo) doc.text(contactInfo, 115, y + 36);
        if (companyProfile.gstNo) doc.text(`GSTIN: ${companyProfile.gstNo}`, 115, y + 50);
    } else {
        doc.font("Helvetica-Bold").fontSize(20).fillColor("#1e293b").text(companyProfile.companyName || "Company Name", 40, y);
        doc.font("Helvetica").fontSize(9).fillColor("#475569");
        if (companyProfile.address) doc.text(companyProfile.address, 40, y + 25, { width: 515 });
        let contactInfo = "";
        if (companyProfile.contactNumber) contactInfo += `Phone: ${companyProfile.contactNumber}  `;
        if (companyProfile.contactEmail) contactInfo += `Email: ${companyProfile.contactEmail}`;
        if (contactInfo) doc.text(contactInfo, 40, y + 37);
        if (companyProfile.gstNo) doc.text(`GSTIN: ${companyProfile.gstNo}`, 40, y + 49);
    }
    
    // Double lines
    doc.moveTo(40, 115).lineTo(555, 115).strokeColor("#cbd5e1").lineWidth(1).stroke();
    doc.moveTo(40, 118).lineTo(555, 118).strokeColor("#94a3b8").lineWidth(0.5).stroke();
    
    // Title Banner
    doc.rect(40, 130, 515, 24).fill("#f1f5f9");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(titleText, 45, 137, { align: "center", width: 505 });
    
    doc.y = 170;
}

// Common footer/signature generator
async function generateFooter(doc, companyProfile) {
    const footerY = 700;
    
    // Divider
    doc.moveTo(40, footerY - 10).lineTo(555, footerY - 10).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
    
    // Signatures
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
    doc.text("Prepared By", 40, footerY);
    doc.text("Authorized Signature", 400, footerY);
    
    // Signature / Stamp image if available
    let sigBuffer = null;
    if (companyProfile?.signatureUrl) {
        sigBuffer = await fetchImageBuffer(companyProfile.signatureUrl);
    }
    
    if (sigBuffer) {
        try {
            doc.image(sigBuffer, 380, footerY - 45, { width: 100, height: 40 });
        } catch (imgErr) {
            console.error("PDFKit error inserting signature image:", imgErr.message);
        }
    }
    
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text(companyProfile?.adminName ? `${companyProfile.adminName} (${companyProfile.adminDesignation || "Admin"})` : "", 400, footerY + 15);
    
    // System metadata
    const nowStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    doc.text(`Printed on: ${nowStr} | Generated via Vermax Construction Cloud ERP`, 40, 770);
    doc.text("Page 1 of 1", 500, 770);
}

// =============================================================================
// 1. PRINT PROJECT SUMMARY
// =============================================================================
exports.printProjectSummary = async (req, res) => {
    try {
        const { projectNo } = req.params;
        const tenantId = req.tenantId;

        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }

        // Fetch Tenant Company Settings
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) return res.status(404).json({ success: false, message: "Tenant not found." });
        
        const tenantData = tenantDoc.data() || {};
        const companyProfile = tenantData.companyProfile || {};
        if (!companyProfile.companyName) {
            companyProfile.companyName = tenantData.name || "Company Name";
        }

        // Fetch Project
        const projSnap = await db.collection("projects")
            .where("tenant_id", "==", tenantId)
            .where("projectNo", "==", projectNo)
            .limit(1)
            .get();

        if (projSnap.empty) return res.status(404).json({ success: false, message: "Project not found." });
        const project = projSnap.docs[0].data();
        const projectId = projSnap.docs[0].id;

        // Fetch Expenses and Advances in parallel
        const [expenseSnap, advanceSnap] = await Promise.all([
            db.collection("siteExpenses").where("tenant_id", "==", tenantId).where("projectNo", "==", projectNo).get(),
            db.collection("advances").where("tenant_id", "==", tenantId).where("projectNo", "==", projectNo).get()
        ]);

        let totalExpenses = 0;
        expenseSnap.forEach(d => {
            totalExpenses += Number(d.data().amount) || 0;
        });

        let totalReceived = 0;
        advanceSnap.forEach(d => {
            totalReceived += Number(d.data().amountReceived) || Number(d.data().amount) || 0;
        });

        // Fallback to static advance if dynamic advances are zero
        if (totalReceived === 0) {
            totalReceived = Number(project.paymentDetails?.advancedPaid) || Number(project.advancedPaid) || 0;
        }

        // Project Value / Contract Value mapping
        const contractValue = Number(project.paymentDetails?.totalBudget) || Number(project.totalBudget) || Number(project.budget) || 0;
        const outstandingBalance = contractValue - totalReceived;

        // Site Location formatted
        let siteLocation = "N/A";
        if (project.location) {
            const parts = [];
            if (project.location.area) parts.push(project.location.area);
            if (project.location.city) parts.push(project.location.city);
            if (parts.length > 0) siteLocation = parts.join(", ");
        }

        // Audit Log
        await logPrint(tenantId, req.user, "project_summary", projectNo);

        // PDF Generation
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=project_summary_${projectNo}.pdf`);
        doc.pipe(res);

        // Header
        await generateHeader(doc, companyProfile, "PROJECT SUMMARY REPORT");

        // Body Content
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b");
        
        let curY = doc.y;
        
        // Row 1
        doc.text("Project ID:", 40, curY);
        doc.font("Helvetica").text(project.projectNo || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Project Name:", 300, curY);
        doc.font("Helvetica").text(project.projectName || "N/A", 400, curY, { width: 155 });
        curY += 25;

        // Row 2
        doc.font("Helvetica-Bold").text("Client Name:", 40, curY);
        doc.font("Helvetica").text(project.clientName || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Site Location:", 300, curY);
        doc.font("Helvetica").text(siteLocation, 400, curY, { width: 155 });
        curY += 25;
        
        // Row 3
        doc.font("Helvetica-Bold").text("Start Date:", 40, curY);
        doc.font("Helvetica").text(project.startDate || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("End Date:", 300, curY);
        doc.font("Helvetica").text(project.endDate || "N/A", 400, curY);
        curY += 25;
        
        // Row 4
        doc.font("Helvetica-Bold").text("Project Status:", 40, curY);
        doc.font("Helvetica").text(project.projectStatus || project.status || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Supervisor/Head:", 300, curY);
        doc.font("Helvetica").text(project.siteEngineer || project.approvedBy || "N/A", 400, curY);
        curY += 35;

        // Financial Overview block
        doc.rect(40, curY, 515, 110).fill("#f8fafc");
        const gridY = curY + 12;
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a").text("Financial Breakdown", 55, gridY);
        
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
        doc.text("Contract Value:", 55, gridY + 22);
        doc.text("Total Amount Received:", 55, gridY + 42);
        doc.text("Outstanding Balance:", 55, gridY + 62);
        
        doc.text("Total Direct Expenses:", 300, gridY + 22);
        doc.text("Project Net Margin (Est.):", 300, gridY + 42);
        
        doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
        doc.text(`Rs. ${contractValue.toLocaleString('en-IN')}`, 175, gridY + 22);
        doc.text(`Rs. ${totalReceived.toLocaleString('en-IN')}`, 175, gridY + 42);
        doc.text(`Rs. ${outstandingBalance.toLocaleString('en-IN')}`, 175, gridY + 62);
        
        doc.text(`Rs. ${totalExpenses.toLocaleString('en-IN')}`, 430, gridY + 22);
        const profit = contractValue - totalExpenses;
        doc.font("Helvetica-Bold").fillColor(profit >= 0 ? "#16a34a" : "#dc2626");
        doc.text(`Rs. ${profit.toLocaleString('en-IN')}`, 430, gridY + 42);
        
        curY = gridY + 115;
        
        // Scope of Work
        if (project.scopeOfWork) {
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text("Scope of Work:", 40, curY);
            doc.font("Helvetica").fontSize(9).fillColor("#334155").text(project.scopeOfWork, 40, curY + 15, { width: 515 });
        }

        // Footer
        await generateFooter(doc, companyProfile);
        doc.end();

    } catch (error) {
        console.error("Print project summary error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


// =============================================================================
// 2. PRINT APPROVAL VOUCHER
// =============================================================================
exports.printApproval = async (req, res) => {
    try {
        const { approvalId } = req.params;
        const tenantId = req.tenantId;

        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }

        // Fetch Tenant Company Settings
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) return res.status(404).json({ success: false, message: "Tenant not found." });
        const tenantData = tenantDoc.data() || {};
        const companyProfile = tenantData.companyProfile || {};
        if (!companyProfile.companyName) {
            companyProfile.companyName = tenantData.name || "Company Name";
        }

        // Fetch Approval Doc
        const appDoc = await db.collection("approvals").doc(approvalId).get();
        if (!appDoc.exists) return res.status(404).json({ success: false, message: "Approval record not found." });
        const approval = appDoc.data();
        if (approval.tenant_id !== tenantId) return res.status(403).json({ success: false, message: "Unauthorized." });

        // Audit Log
        await logPrint(tenantId, req.user, "approval", approvalId);

        // PDF Generation
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=approval_voucher_${approvalId}.pdf`);
        doc.pipe(res);

        // Header
        await generateHeader(doc, companyProfile, "OFFICIAL APPROVAL VOUCHER");

        // Body Content
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b");
        
        let curY = doc.y;
        
        // Two-column layout
        doc.text("Approval Ref No:", 40, curY);
        doc.font("Helvetica").text(approvalId, 150, curY);
        doc.font("Helvetica-Bold").text("Voucher Date:", 300, curY);
        doc.font("Helvetica").text(approval.createdAt ? approval.createdAt.split("T")[0] : "N/A", 400, curY);
        curY += 25;

        doc.font("Helvetica-Bold").text("Project Link:", 40, curY);
        doc.font("Helvetica").text(approval.projectNo || "N/A", 150, curY);
        doc.font("Helvetica-Bold").text("Status:", 300, curY);
        doc.font("Helvetica-Bold").fillColor(approval.status === "Approved" ? "#16a34a" : (approval.status === "Rejected" ? "#dc2626" : "#ea580c")).text(approval.status || "Pending", 400, curY);
        curY += 25;

        doc.fillColor("#1e293b");
        doc.font("Helvetica-Bold").text("Item Description:", 40, curY);
        doc.font("Helvetica").text(approval.approvedItem || "N/A", 150, curY, { width: 380 });
        curY += 35;

        // Details grid
        doc.rect(40, curY, 515, 60).fill("#f8fafc");
        const detailsY = curY + 12;
        
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
        doc.text("Amount Approved:", 55, detailsY);
        doc.text("Requested By:", 55, detailsY + 20);
        
        doc.text("Amount in Words:", 300, detailsY);
        doc.text("Approved By:", 300, detailsY + 20);
        
        doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
        doc.text(`Rs. ${Number(approval.amount || 0).toLocaleString('en-IN')}`, 155, detailsY);
        doc.text(approval.requestedBy || "Supervisor", 155, detailsY + 20);
        
        const words = numberToWords(approval.amount || 0);
        doc.text(words, 385, detailsY, { width: 160 });
        doc.text(approval.approvedBy || "Administrator", 385, detailsY + 20);
        
        curY += 80;

        if (approval.remarks || approval.reason) {
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text("Remarks / Justification:", 40, curY);
            doc.font("Helvetica").fontSize(9).fillColor("#334155").text(approval.remarks || approval.reason || "", 40, curY + 15, { width: 515 });
        }

        // Footer
        await generateFooter(doc, companyProfile);
        doc.end();

    } catch (error) {
        console.error("Print approval error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =============================================================================
// 3. PRINT DEALER PAYMENT RECEIPT
// =============================================================================
exports.printDealerPayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const tenantId = req.tenantId;

        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }

        // Fetch Tenant Company Settings
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) return res.status(404).json({ success: false, message: "Tenant not found." });
        const tenantData = tenantDoc.data() || {};
        const companyProfile = tenantData.companyProfile || {};
        if (!companyProfile.companyName) {
            companyProfile.companyName = tenantData.name || "Company Name";
        }

        // Fetch Payment
        const payDoc = await db.collection("dealerPayments").doc(paymentId).get();
        if (!payDoc.exists) return res.status(404).json({ success: false, message: "Payment record not found." });
        const payment = payDoc.data();
        if (payment.tenant_id !== tenantId) return res.status(403).json({ success: false, message: "Unauthorized." });

        // Fetch Dealer Info from materialReceived using phone
        const materialSnap = await db.collection("materialReceived")
            .where("tenant_id", "==", tenantId)
            .where("dealerContact", "==", payment.dealerContact)
            .limit(1)
            .get();
        
        const dealerName = !materialSnap.empty ? materialSnap.docs[0].data().dealerName : "Registered Dealer";

        // Audit Log
        await logPrint(tenantId, req.user, "dealer_receipt", paymentId);

        // PDF Generation
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=dealer_receipt_${paymentId}.pdf`);
        doc.pipe(res);

        // Header
        await generateHeader(doc, companyProfile, "DEALER PAYMENT RECEIPT");

        // Body Content
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b");
        
        let curY = doc.y;
        
        doc.text("Receipt No:", 40, curY);
        doc.font("Helvetica").text(payment.receiptNo || `DEP-${paymentId.substring(0, 6).toUpperCase()}`, 140, curY);
        doc.font("Helvetica-Bold").text("Payment Date:", 300, curY);
        doc.font("Helvetica").text(payment.date ? payment.date.split("T")[0] : "N/A", 400, curY);
        curY += 25;

        doc.font("Helvetica-Bold").text("Dealer Name:", 40, curY);
        doc.font("Helvetica").text(dealerName, 140, curY);
        doc.font("Helvetica-Bold").text("Dealer Contact:", 300, curY);
        doc.font("Helvetica").text(payment.dealerContact || "N/A", 400, curY);
        curY += 25;

        doc.font("Helvetica-Bold").text("Project Linked:", 40, curY);
        doc.font("Helvetica").text(payment.projectNo || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Payment Mode:", 300, curY);
        doc.font("Helvetica").text((payment.method || "cash").toUpperCase(), 400, curY);
        curY += 25;

        if (payment.method === "bank" && (payment.bankName || payment.bankTransactionId)) {
            doc.font("Helvetica-Bold").text("Bank Details:", 40, curY);
            doc.font("Helvetica").text(`${payment.bankName || ""} ${payment.bankTransactionId ? `(Txn: ${payment.bankTransactionId})` : ""}`, 140, curY, { width: 380 });
            curY += 25;
        }

        doc.fillColor("#1e293b");
        doc.font("Helvetica-Bold").text("Paid Amount:", 40, curY);
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e3a8a").text(`Rs. ${Number(payment.amountPaid || 0).toLocaleString('en-IN')}`, 140, curY - 2);
        
        doc.fontSize(10).fillColor("#1e293b");
        doc.font("Helvetica-Bold").text("Amount in Words:", 300, curY);
        doc.font("Helvetica").fontSize(9).text(numberToWords(payment.amountPaid || 0), 400, curY, { width: 155 });
        curY += 45;

        if (payment.remark) {
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text("Remarks:", 40, curY);
            doc.font("Helvetica").fontSize(9).fillColor("#334155").text(payment.remark, 40, curY + 15, { width: 515 });
        }

        // Footer
        await generateFooter(doc, companyProfile);
        doc.end();

    } catch (error) {
        console.error("Print dealer payment error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =============================================================================
// 4. PRINT LABOUR PAYMENT RECEIPT
// =============================================================================
exports.printLabourPayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const tenantId = req.tenantId;

        if (!tenantId || tenantId === 'GLOBAL') {
            return res.status(400).json({ success: false, message: "Tenant context required." });
        }

        // Fetch Tenant Company Settings
        const tenantDoc = await db.collection("tenants").doc(tenantId).get();
        if (!tenantDoc.exists) return res.status(404).json({ success: false, message: "Tenant not found." });
        const tenantData = tenantDoc.data() || {};
        const companyProfile = tenantData.companyProfile || {};
        if (!companyProfile.companyName) {
            companyProfile.companyName = tenantData.name || "Company Name";
        }

        // Fetch Labour Payment
        const payDoc = await db.collection("labourPayments").doc(paymentId).get();
        if (!payDoc.exists) return res.status(404).json({ success: false, message: "Payment record not found." });
        const payment = payDoc.data();
        if (payment.tenant_id !== tenantId) return res.status(403).json({ success: false, message: "Unauthorized." });

        // Fetch Labour details for contact number
        const labourDoc = await db.collection("labourMaster").doc(payment.labourId).get();
        const contactNumber = labourDoc.exists ? (labourDoc.data().contact || "N/A") : "N/A";

        // Audit Log
        await logPrint(tenantId, req.user, "labour_receipt", paymentId);

        // PDF Generation
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=labour_receipt_${paymentId}.pdf`);
        doc.pipe(res);

        // Header
        await generateHeader(doc, companyProfile, "LABOUR / MESTRI WAGE RECEIPT");

        // Body Content
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b");
        
        let curY = doc.y;
        
        doc.text("Receipt No:", 40, curY);
        doc.font("Helvetica").text(payment.receiptNo || `LBP-${paymentId.substring(0, 6).toUpperCase()}`, 140, curY);
        doc.font("Helvetica-Bold").text("Payment Date:", 300, curY);
        doc.font("Helvetica").text(payment.date ? payment.date.split("T")[0] : "N/A", 400, curY);
        curY += 25;

        doc.font("Helvetica-Bold").text("Labour/Mestri:", 40, curY);
        doc.font("Helvetica").text(payment.labourName || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Contact No:", 300, curY);
        doc.font("Helvetica").text(contactNumber, 400, curY);
        curY += 25;

        doc.font("Helvetica-Bold").text("Project Site:", 40, curY);
        doc.font("Helvetica").text(payment.projectNo || "N/A", 140, curY);
        doc.font("Helvetica-Bold").text("Payment Mode:", 300, curY);
        doc.font("Helvetica").text((payment.method || "cash").toUpperCase(), 400, curY);
        curY += 25;

        if (payment.fromDate || payment.toDate) {
            doc.font("Helvetica-Bold").text("Wage Period:", 40, curY);
            doc.font("Helvetica").text(`${payment.fromDate || "Start"} to ${payment.toDate || "End"}`, 140, curY);
            curY += 25;
        }

        if (payment.method === "bank" && (payment.bankName || payment.bankTransactionId)) {
            doc.font("Helvetica-Bold").text("Bank Details:", 40, curY);
            doc.font("Helvetica").text(`${payment.bankName || ""} ${payment.bankTransactionId ? `(Txn: ${payment.bankTransactionId})` : ""}`, 140, curY, { width: 380 });
            curY += 25;
        }

        doc.fillColor("#1e293b");
        doc.font("Helvetica-Bold").text("Paid Amount:", 40, curY);
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e3a8a").text(`Rs. ${Number(payment.amountPaid || 0).toLocaleString('en-IN')}`, 140, curY - 2);
        
        doc.fontSize(10).fillColor("#1e293b");
        doc.font("Helvetica-Bold").text("Amount in Words:", 300, curY);
        doc.font("Helvetica").fontSize(9).text(numberToWords(payment.amountPaid || 0), 400, curY, { width: 155 });
        curY += 45;

        if (payment.remark) {
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text("Remarks:", 40, curY);
            doc.font("Helvetica").fontSize(9).fillColor("#334155").text(payment.remark, 40, curY + 15, { width: 515 });
        }

        // Footer
        await generateFooter(doc, companyProfile);
        doc.end();

    } catch (error) {
        console.error("Print labour payment error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
