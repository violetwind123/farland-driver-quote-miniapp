# TEST CASES

1. 运营可创建报价单。
2. 运营可生成群共享 token。
3. 分享路径格式为 `/pages/driver/quick-quote/quick-quote?token=...`。
4. 未注册司机打开链接后显示司机和车辆录入表单。
5. 未注册司机提交后，`users`、`drivers`、`vehicles`、`driver_quotes` 都写入。
6. 已注册司机再次打开同一链接时，自动显示司机和车辆信息。
7. 同一司机重复报价时，更新原报价而不是新增重复记录。
8. `driver_quotes` 保存司机和车辆快照字段。
9. 司机端不返回 `internal_note`。
10. 司机端不返回其他司机报价。
