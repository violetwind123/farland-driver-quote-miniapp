async function writeAuditLog(db, data) {
  await db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  });
}

module.exports = { writeAuditLog };
