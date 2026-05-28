const mouldService = require("./mould.service");
const { validationResult } = require("express-validator");

const checkValidation = (req) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error("Validation failed");
        error.statusCode = 400;
        error.data = errors.array();
        console.log("VALIDATION ERRORS:", errors.array());
        throw error;
    }
};

/**
 * PURCHASE CONTROLLERS
 */

exports.createPurchase = async (req, res, next) => {
    try {
        checkValidation(req);
        const purchase = await mouldService.createPurchase(req.body, req.tenantId);
        res.status(201).json({ success: true, data: purchase });
    } catch (error) {
        next(error);
    }
};

exports.getAllPurchases = async (req, res, next) => {
    try {
        const purchases = await mouldService.getAllPurchases(req.tenantId);
        res.status(200).json({ success: true, data: purchases });
    } catch (error) {
        next(error);
    }
};

exports.getPurchaseById = async (req, res, next) => {
    try {
        const purchase = await mouldService.getPurchaseById(req.params.id, req.tenantId);
        res.status(200).json({ success: true, data: purchase });
    } catch (error) {
        next(error);
    }
};

exports.updatePurchase = async (req, res, next) => {
    try {
        const purchase = await mouldService.updatePurchase(req.params.id, req.body, req.tenantId);
        res.status(200).json({ success: true, data: purchase });
    } catch (error) {
        next(error);
    }
};

exports.deletePurchase = async (req, res, next) => {
    try {
        await mouldService.deletePurchase(req.params.id, req.tenantId);
        res.status(200).json({ success: true, message: "Purchase item deleted" });
    } catch (error) {
        next(error);
    }
};

/**
 * RENTAL CONTROLLERS
 */

exports.createRental = async (req, res, next) => {
    try {
        checkValidation(req);
        const rental = await mouldService.createRental(req.params.id, req.body, req.tenantId);
        res.status(201).json({ success: true, data: rental });
    } catch (error) {
        next(error);
    }
};

exports.getAllRentals = async (req, res, next) => {
    try {
        const rentals = await mouldService.getAllRentals(req.tenantId);
        res.status(200).json({ success: true, data: rentals });
    } catch (error) {
        next(error);
    }
};

exports.getRentalById = async (req, res, next) => {
    try {
        const rental = await mouldService.getRentalById(req.params.id, req.tenantId);
        res.status(200).json({ success: true, data: rental });
    } catch (error) {
        next(error);
    }
};

// PUT /rental/:id — supports addPayment or generic update
exports.updateRental = async (req, res, next) => {
    try {
        const result = await mouldService.updateRental(req.params.id, req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.deleteRental = async (req, res, next) => {
    try {
        await mouldService.deleteRental(req.params.id, req.tenantId);
        res.status(200).json({ success: true, message: "Rental deleted and stock restored" });
    } catch (error) {
        next(error);
    }
};

/**
 * PAYMENT & CLOSING
 */

exports.addPayment = async (req, res, next) => {
    try {
        checkValidation(req);
        const rental = await mouldService.addPayment(req.params.id, req.body, req.tenantId);
        res.status(200).json({ success: true, data: rental });
    } catch (error) {
        next(error);
    }
};

exports.closeRental = async (req, res, next) => {
    try {
        await mouldService.closeRental(req.params.id, req.tenantId);
        res.status(200).json({ success: true, message: "Rental closed successfully" });
    } catch (error) {
        next(error);
    }
};

/**
 * CLIENT + MATERIAL HISTORY
 * GET /rental/history?clientName=ABC&materialId=PUR001
 */
exports.getClientMaterialHistory = async (req, res, next) => {
    try {
        const { clientName, materialId } = req.query;
        if (!clientName || !materialId) {
            return res.status(400).json({ success: false, message: "clientName and materialId are required" });
        }
        const history = await mouldService.getClientMaterialHistory(clientName, materialId, req.tenantId);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
};

exports.getCustomerLedger = async (req, res, next) => {
    try {
        const { phoneNumber } = req.params;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: "phoneNumber is required" });
        }
        // Properly decode the phone number just in case the UI sends it URL encoded (like %2B91)
        const decodedPhone = decodeURIComponent(phoneNumber);
        const ledger = await mouldService.getCustomerLedger(decodedPhone, req.tenantId);
        res.status(200).json({ success: true, data: ledger });
    } catch (error) {
        next(error);
    }
};

exports.calculateRental = async (req, res, next) => {
    try {
        checkValidation(req);
        const result = await mouldService.calculateRental(req.body, req.tenantId);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.paymentUpdate = async (req, res, next) => {
    try {
        checkValidation(req);
        const result = await mouldService.paymentUpdate(req.params.id, req.body, req.tenantId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * MOULD GENERAL INVENTORY
 */
exports.addNewMould = async (req, res, next) => {
    try {
        checkValidation(req);
        const mould = await mouldService.addNewMould(req.body, req.tenantId);
        res.status(201).json({ success: true, data: mould });
    } catch (error) {
        next(error);
    }
};

exports.getAllMoulds = async (req, res, next) => {
    try {
        const moulds = await mouldService.getAllMoulds(req.tenantId);
        res.status(200).json({ success: true, data: moulds });
    } catch (error) {
        next(error);
    }
};
