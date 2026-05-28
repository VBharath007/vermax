const bankService = require("./bank.service");

// ─────────────────────────────────────────────
// 📊 GET ALL BANKS + DASHBOARD SUMMARY
// ─────────────────────────────────────────────
exports.getAllBanks = async (req, res) => {
  try {
    const result = await bankService.getAllBanksWithSummary(req.tenantId);

    res.status(200).json({
      success: true,
      data: result.banks,
      summary: result.summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// 🏦 GET SINGLE BANK
// ─────────────────────────────────────────────
exports.getBankById = async (req, res) => {
  try {
    const result = await bankService.getBankById(req.params.bankId, req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// 📜 GET BANK TRANSACTIONS
// ─────────────────────────────────────────────
exports.getBankTransactions = async (req, res) => {
  try {
    const result = await bankService.getBankTransactions(req.params.bankId, req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


exports.createBank = async (req, res) => {
  try {
    const data = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        message: "Request body is missing"
      });
    }

    const result = await bankService.createBank(data, req.tenantId);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



// ─────────────────────────────────────────────
// 📊 GET ALL TRANSACTIONS (ALL BANKS)
// ─────────────────────────────────────────────
exports.getGlobalTransactions = async (req, res) => {
  try {
    const result = await bankService.getGlobalTransactions(req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




exports.updateBank = async (req, res, next) => {
  try {
    const data = await bankService.updateBank(req.params.bankId, req.body, req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// exports.addTransaction = async (req, res, next) => {
//   try {
//     const data = await bankService.addTransaction(req.params.bankId, req.body);
//     res.status(201).json({ success: true, data });
//   } catch (err) {
//     next(err);
//   }
// };

exports.updateTransaction = async (req, res, next) => {
  try {
    const data = await bankService.updateTransaction(
      req.params.bankId,
      req.params.txId,
      req.body,
      req.tenantId
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.deleteBank = async (req, res, next) => {
  try {
    const result = await bankService.deleteBank(req.params.bankId, req.tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.deleteTransaction = async (req, res, next) => {
  try {
    const result = await bankService.deleteTransaction(
      req.params.bankId,
      req.params.txId,
      req.tenantId
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};