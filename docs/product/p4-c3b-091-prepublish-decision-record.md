# P4-C3B · 091 发布前决策记录

> 状态:只读核查完成,产品选择 **B · 先回退到一致**。  
> 范围:只记录当前地面真相和下一步分叉;不执行生产写入、不发布、不上传。

---

## 1. 当前结论

091 目前不是"可以直接发布"状态。

当前线上状态显示:

```text
trip_no: 2026XBC091
visibility_status: published
review_status: needs_review
published_version: 24
```

`draft_snapshot` 已经是 36 卡通用结构:

```text
snapshot_model_version: 2
top-level destination_cards: 36
day destination counts: [4,3,9,4,3,4,7,2]
day timeline counts:     [4,3,9,4,3,4,7,2]
```

这说明 C3B 通用构建已经写入过 draft。

但是发布前仍有两个阻断点:

1. 司机/车辆来源没有被证明已经从真实 `transport_orders` 投影。
2. 线上 36 卡 draft 的 `transport_summary` 仍显示司机/电话/车牌字段存在,和早先"通用 draft 无身份"的分析不一致。

---

## 2. 已完成的只读核查

### Q1 · main 与当前分支差异

当前分支 `codex/091-customer-card-ui` 与 `origin/main` 差异很大:

```text
origin/main...HEAD: 1 / 43
```

`origin/main` 的 `cloudfunctions/buildCustomerTripVisibleDraft/` 不含:

```text
trip091CardSystem.js
TRIP091_GENERIC_SWITCH_TOKEN
sanitizeTransportSummary
validateTrip091WriteSnapshot
36-card guard
```

因此不能用 `origin/main` 推断线上已部署函数行为。线上函数版本必须按已部署源码或线上数据结果判断。

### Q2/Q3 · 线上 091 snapshot 状态

通过微信开发者工具 Console 只读查询 `customer_trips/bf757c4c6a2054f800350a925147b32e` 的窄字段:

```text
draft top destination_cards = 36
draft day counts = [4,3,9,4,3,4,7,2]
published_version = 24
visibility_status = published
review_status = needs_review
```

关键修正:

```text
draft transport_summary:
  status_text = 车辆与司机已确认
  driver_visibility = assigned
  has_driver_name = true
  has_driver_phone = true
  has_plate = true
```

所以旧说法"36 卡通用 draft 无司机身份"不再作为发布依据。当前地面真相是:

```text
draft 是 36 卡通用结构,但 transport_summary 仍存在司机/车辆身份字段。
```

这可能来自迁移前的原始 day transport_summary 透传、硬编码残留,或通用 normalizer 的 transport_summary 处理缺口。发布前必须厘清并修正。

### D-1 · 真实用车投影状态

只读查询结果:

```text
ride_requests_count = 0
transport_orders detailed query = collection not found / no verifiable complete row
```

早先本地单测已证明:

```text
identity-free snapshot + complete transport_orders row
=> getCustomerTripByInvite 会投影为 已分配司机
```

但线上没有可验证的完整 assigned/confirmed row,所以不能证明发布后司机会从真实订单投影恢复。

---

## 3. 发布风险

如果现在直接把 36 卡 draft 发布到 `published_snapshot`,风险有两类:

### 风险 A · 司机显示不可信

如果 draft 里的司机字段继续存在:

```text
客户可能看到来自 snapshot 的司机/车牌身份,而不是 transport_orders 安全投影。
```

这违背了"司机/车辆身份不进 snapshot"的目标。

如果后续清掉 draft 里的司机字段但不补真实 `transport_orders`:

```text
客户可能看到 pending / 无司机。
```

### 风险 B · 091 半迁移状态继续扩大

当前 091 已处于:

```text
published = v24 硬编码
draft = 36 卡通用结构
```

继续发布前,必须明确是:

```text
往前切到底:发布 36 卡通用并补齐运行时司机来源
```

还是:

```text
短期回退:恢复 draft/published 同源,先消除半迁移
```

不能继续靠默认按钮或临时 token 混用两套路径。

---

## 4. 决策选项

### 选项 A · 往前切到底

适合目标:

```text
让 091 正式进入数据驱动路径。
```

发布前必须完成:

```text
1. 修正 buildCustomerTripVisibleDraft / normalizer,确保 36 卡 draft 不携带 driver_name / driver_phone / plate_number 等身份字段。
2. 建立或确认真实 assigned/confirmed transport_orders 行,字段包含司机、电话、车型、颜色、车牌、上车点等客户安全投影所需字段。
3. 重新生成 091 generic draft。
4. 只读验证:
   - destination_cards = 36
   - day counts = [4,3,9,4,3,4,7,2]
   - snapshot 中无司机/车牌身份字段
   - invite/customer read path 能通过 transport_orders 投影显示司机
5. 再单独申请 publish approval。
```

优点:

```text
长期正确,解锁 091 数据驱动。
```

缺点:

```text
需要补 transport 数据和清理 normalizer,发布前步骤更多。
```

### 选项 B · 先回退到一致

适合目标:

```text
先让 091 回到稳定的一套路径,客户继续看到 v24。
```

执行前必须完成:

```text
1. 确认可用 pre-C3B 备份。
2. 恢复 draft_snapshot 与 published_snapshot 同源,不要改变客户当前 published 内容。
3. 记录 C3B 实验成果和 091B 数据副本,后续再按完整路径重做 A。
```

优点:

```text
客户风险最低,快速消除半迁移混乱。
```

缺点:

```text
091 数据驱动延期。
```

---

## 5. 决策

已选择:

```text
B. 先回退到一致:恢复 091 draft/published 同源,客户继续看 v24。
```

选择 B 的原因:

```text
1. 当前 36 卡 draft 虽然存在,但 transport_summary 仍含司机/车辆身份字段,不能直接发布。
2. 线上没有可验证的真实 assigned/confirmed transport_orders 行,发布通用快照后司机来源不可靠。
3. B 可以先结束半迁移状态,客户继续看到当前 v24 published 内容。
```

---

## 6. B 执行前置核查

### 旧备份文件

恢复源:

```text
/tmp/farland-091-c3b-backup/customer_trips_bf757c4c6a2054f800350a925147b32e_20260608-080353Z.json
```

本地内容验证已通过:

```text
bytes: 1359515
sha256: da69f973b79e6af92051913ecc8be8fc7993dc65c6d7bce5c05b35a27493395a
_id: bf757c4c6a2054f800350a925147b32e
trip_no: 2026XBC091
external_trip_id: 2026XBC091
visibility_status: published
review_status: approved
published_version: 24
draft_top_destination_cards: 33
published_top_destination_cards: 33
draft_day_destination_counts: [4,3,6,4,3,4,7,2]
published_day_destination_counts: [4,3,6,4,3,4,7,2]
draft_model: 2
published_model: 2
```

第二参照文件也存在并通过 33/33/v24 校验:

```text
/tmp/farland-091-c3b-backup/customer_trips_bf757c4c6a2054f800350a925147b32e_20260607-225729.json
sha256: c12df14c24eec9ed28511076a7d005a980b9527f388f55cdaa174e855623b0aa
```

### 当前态备份注意事项

当前半迁移态整文档超过 1MB,微信开发者工具 Console 里直接:

```js
db.collection('customer_trips').doc(id).get()
```

会触发:

```text
response size exceeded 1MB
```

因此正式执行 B 前,不能依赖一次性 `.get()` 备份当前态。需要采用分段只读备份:

```text
1. 读 base fields(不含 draft_snapshot / published_snapshot)
2. 单独读 draft_snapshot
3. 单独读 published_snapshot
4. 在 Console 内拼回完整对象并 copy 到本地备份文件
5. 计算 sha256 / bytes / draft=36 / published_version=24
```

如果任一分段仍超过 1MB,停止执行 B,不要写库。

---

## 7. 当前推荐

推荐先走 **选项 A 的准备步骤**,但不要立刻发布:

```text
1. 修 normalizer / snapshot 清理,阻止 transport_summary 司机身份进入 36 卡 draft。
2. 补或确认 091 的真实 transport_orders assigned row。
3. 重新生成 36 卡 draft。
4. 模拟器验证客户可见司机来自运行时投影。
5. 再申请独立 publish approval。
```

该推荐已被产品决策覆盖:当前执行方向为 **B · 先回退到一致**。

---

## 8. 明确禁止

在没有新批准前,不要执行:

```text
publishCustomerTrip
buildCustomerTripVisibleDraft publish_now
正式 091 覆盖/恢复写入
删除或清理历史数据
上传小程序版本
```

---

## 9. 下一步待拍板

执行 B 仍需要最后一次写库确认。确认语句:

```text
Approve restoring customer_trips/bf757c4c6a2054f800350a925147b32e to its pre-C3B backup
(draft back to 33-card hardcode, review_status=approved)? published_snapshot stays v24
(no customer-visible change). This discards the live 36-card generic draft (kept in backups).
```
