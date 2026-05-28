const { db } = require("../../config/firebase");
const dayjs = require("dayjs");

const labourPaymentsCol = db.collection("labourPayments");
const siteExpensesCol   = db.collection("siteExpenses");

const now   = () => dayjs().format("DD-MM-YY HH:mm");
const today = () => dayjs().format("DD-MM-YYYY");

async function _resolveLabourName(labourId) {
  if (!labourId) return "Unknown";
  try {
    const labourService = require("../labour/labour.service");
    const master = await labourService.getLabourMasterById(labourId);
    return master?.name || "Unknown";
  } catch (_) { return "Unknown"; }
}

async function _syncToSiteExpense(paymentId, data) {
  await siteExpensesCol.doc(paymentId).set({
    projectNo:  data.projectNo,
    type:       "labourPayment",
    labourId:   data.labourId,
    labourName: data.labourName,
    amount:     Number(data.amount) || 0,
    remark:     data.remark || `Labour Payment – ${data.labourName}`,
    particular: `Labour Payment – ${data.labourName}`,
    date:       data.paidDate || today(),
    fromDate:   data.fromDate || null,
    toDate:     data.toDate   || null,
    paymentId,
    createdAt:  data.createdAt,
    updatedAt:  data.updatedAt || null,
    tenant_id:  data.tenant_id,
  }, { merge: true });
}

exports.createPayment = async (data, tenant_id) => {
  if (!data.labourId)  throw new Error("labourId is required");
  if (!data.projectNo) throw new Error("projectNo is required");
  if (!data.amount)    throw new Error("amount is required");
  if (!tenant_id) throw new Error("tenant_id is required");

  const labourName = await _resolveLabourName(data.labourId);

  const payload = {
    labourId:  data.labourId,
    labourName,
    projectNo: data.projectNo,
    fromDate:  data.fromDate || null,
    toDate:    data.toDate   || null,
    amount:    Number(data.amount) || 0,
    remark:    (data.remark || "").trim(),
    paidDate:  today(),
    createdAt: now(),
    tenant_id,
  };

  const ref = await labourPaymentsCol.add(payload);
  await _syncToSiteExpense(ref.id, payload);
  return { paymentId: ref.id, ...payload };
};

exports.getPayments = async ({ labourId, projectNo } = {}, tenant_id) => {
  let query = labourPaymentsCol;

  // Only filter by labourId — old documents may not have projectNo
  if (labourId) query = query.where("labourId", "==", labourId);
  if (tenant_id && tenant_id !== 'GLOBAL') {
      query = query.where("tenant_id", "==", tenant_id);
  }

  const snap = await query.get();
  console.log("PAYMENTS FOUND:", snap.size, { labourId, projectNo });

  let rawPayments = snap.docs.map(doc => ({ paymentId: doc.id, ...doc.data() }));

  // Filter by projectNo in JS — handles old docs without projectNo field
  if (projectNo) {
    rawPayments = rawPayments.filter(p => !p.projectNo || p.projectNo === projectNo);
  }

  const payments = await Promise.all(
    rawPayments.map(async (p) => ({
      ...p,
      labourName: await _resolveLabourName(p.labourId),
    }))
  );

  payments.sort((a, b) =>
    dayjs(b.createdAt, "DD-MM-YY HH:mm").valueOf() -
    dayjs(a.createdAt, "DD-MM-YY HH:mm").valueOf()
  );

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid || p.amount) || 0), 0);
  return { payments, totalPaid };
};

exports.getPaymentById = async (paymentId, tenant_id) => {
  const doc = await labourPaymentsCol.doc(paymentId).get();
  if (!doc.exists) throw new Error("Payment not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
  const data = doc.data();
  return { paymentId: doc.id, ...data, labourName: await _resolveLabourName(data.labourId) };
};

exports.updatePayment = async (paymentId, updateData, tenant_id) => {
  const ref = labourPaymentsCol.doc(paymentId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Payment not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");

  const allowed = { updatedAt: now() };
  if (updateData.amount   !== undefined) allowed.amount   = Number(updateData.amount) || 0;
  if (updateData.remark   !== undefined) allowed.remark   = updateData.remark.trim();
  if (updateData.fromDate !== undefined) allowed.fromDate = updateData.fromDate;
  if (updateData.toDate   !== undefined) allowed.toDate   = updateData.toDate;

  await ref.update(allowed);
  const updated = { paymentId, ...((await ref.get()).data()) };
  await _syncToSiteExpense(paymentId, updated);
  return updated;
};

exports.deletePayment = async (paymentId, tenant_id) => {
  const ref = labourPaymentsCol.doc(paymentId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Payment not found");
  if (tenant_id && tenant_id !== 'GLOBAL' && doc.data().tenant_id !== tenant_id) throw new Error("Unauthorized");
  await ref.delete();
  const expDoc = await siteExpensesCol.doc(paymentId).get();
  if (expDoc.exists) await siteExpensesCol.doc(paymentId).delete();
  return { message: "Payment deleted successfully" };
};