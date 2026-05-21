async function writeAuditLog(db, data) {
  return db.collection('audit_logs').add({ data });
}

module.exports = { writeAuditLog };
