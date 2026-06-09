# P4 · 091 回退到一致态(方案 B 执行任务)

> ⛔ **这是计划,不是执行许可。** 本任务**会写线上 091 生产数据**(恢复文档),必须:
> 先备份当前态 → 校验旧备份 → **运营显式批准** → 恢复 → 验证。任何写库前都要批准。
>
> 目标行程:091 · docId `bf757c4c6a2054f800350a925147b32e` · trip_no/external `2026XBC091`。

---

## 0. 目标(一句话)

把 091 从"**半迁移**"(draft=36卡通用 / published=v24硬编码 / 运营默认硬编码)**回退到 C3B 之前的一致态**
(draft=33卡硬编码 / published=v24硬编码,同源一致),用一次恢复把当前所有 091 症状一次清掉。

---

## 1. 为什么(5 个症状同根,一次消除)

| 当前症状 | 回退后 |
| --- | --- |
| `buildCustomerTripVisibleDraft` 超时风险叠加误覆盖 | draft 已与硬编码一致,运营按钮不再有"覆盖通用草稿"风险 |
| draft 通用 / published 硬编码 并存 | 两者同源一致(都 v24 硬编码) |
| 运营按钮默认硬编码 = 回退方向 | 与现状一致,不再互相打架 |
| 司机三来源(硬编码/剥离/投影) | 统一回硬编码内嵌(v24 既有行为) |
| D-1 假阳性 / 司机可能 pending | 不再有"无身份通用草稿"待发布,D-1 暂时不适用 |

> C3B 的 36 卡通用草稿成果**不丢**:保存在「当前态备份(Step 1)」+ canonical source 文件 + 091B 沙盒里,
> 将来用**干净、不半切**的方式正式去硬编码时可重做。

---

## 2. 改什么 / 不改什么

- **改:** 把 091 `customer_trips` 文档恢复成 **C3B 写入前的完整备份**(下方 §4 那份)。
- **不改 / 零客户影响:** `published_snapshot` 本来就是 v24,备份里也是 v24 → **恢复后客户所见不变**(全程 v24)。本操作不发布、不重建。
- **不改部署代码:** C3B 开关(默认关)、`getCustomerTripByInvite` 投影(091 无 transport 行 → 空操作)都**保持原样**,只恢复文档。

---

## 3. 执行前置条件

- [ ] 运营**明确批准**本次生产写入(记录批准人 + 时间)。
- [ ] 旧备份文件可访问且可解析(§4)。
- [ ] 已读 `p4-d0-091-card-pipeline-state-analysis`,理解这是"放弃半切、回到一致",而非修复迁移。

---

## 4. Step 1 · 先备份「当前半迁移态」(覆盖前必做)

恢复本身是破坏性写,先把**现在**这份(draft=36卡通用)备份下来,以便回退-的-回退:
- [ ] 读整份 091 文档 → 导出到带时间戳文件,例如
  `/tmp/farland-091-rollbackB-backup/customer_trips_bf757c4c..._<ts>.json`;
- [ ] 记录 sha256 + 字节数 + 当前 `draft_destination_cards`(应=36)/`published_version`(应=24);
- [ ] 也写一条 `audit_logs`(action: `customer_trip_091_pre_rollbackB_backup`)。

---

## 5. Step 2 · 校验「C3B 写入前的旧备份」(要恢复成它)

**恢复源(用写入前最近的一份):**
`/tmp/farland-091-c3b-backup/customer_trips_bf757c4c6a2054f800350a925147b32e_20260608-080353Z.json`
(同目录另有更早的 `…225729.json`,内容也是 33/33/v24/approved,可作第二参照。)

> ⚠️ **记录的 sha256 已过期,不能用作校验门。** C3B 证据记的是
> `5b79c767…` / 1361431 字节;该文件**实际**已变为 `da69f973…` / 1359515 字节
> ——文件在记录之后被重新序列化/改动过,"不可变备份 + 哈希冻结"保证已破一次。
> 因此 **改用内容验证作为门**(下方),并把这次"备份非不可变"记进风险。

**内容验证门(全部为真才可恢复)——已实测通过:**
- [ ] JSON 可解析;
- [ ] identity 三等:`_id=bf757c4c6a2054f800350a925147b32e`、`trip_no=external_trip_id=2026XBC091`;
- [ ] `visibility_status=published`、`review_status=approved`、`published_version=24`;
- [ ] `draft_snapshot.destination_cards.length=33`、`published_snapshot.destination_cards.length=33`(即真正的 pre-C3B 一致态);
- [ ] `published_snapshot` 与**当前线上**的 `published_snapshot` 内容一致(确认恢复不会改客户所见 v24)。
- [ ] **恢复前再算一次该文件 sha256 并记下**(da69f973…),作为本次操作的新基准,连同 Step 1 当前态备份一起留存。
- [ ] 若该 /tmp 文件丢失:停,改用 `audit_logs` 里 `before_091_snapshot_refresh` 的 `original_doc`,同样走内容验证门。

---

## 6. Step 3 · 批准门(进入写之前)

- [ ] Step 1 当前态备份已取 + 可还原;
- [ ] Step 2 旧备份校验全过;
- [ ] 向运营确认这句并取得明确批准:

```text
Approve restoring customer_trips/bf757c4c6a2054f800350a925147b32e to its pre-C3B backup
(draft back to 33-card hardcode, review_status=approved)? published_snapshot stays v24
(no customer-visible change). This discards the live 36-card generic draft (kept in backups).
```

---

## 7. Step 4 · 恢复写(仅批准后)

- [ ] 写前再读一次目标文档,确认 `_id`/`trip_no`/`external_trip_id` 正确;
- [ ] 用旧备份**整份覆盖**该文档:`db.collection('customer_trips').doc('bf757c4c…').set({ data: <旧备份> })`
  (用 `set` 整份恢复,而非局部 update,确保字段集完全回到 C3B 前);
- [ ] 不碰其它集合 / 文档;不发布。

---

## 8. Step 5 · 恢复后验证

- [ ] 重读文档:`draft_destination_cards=33`、`published_version=24`、`review_status=approved`、`visibility_status=published`;
- [ ] **`published_snapshot` 与恢复前一致**(v24,客户零变化)——逐字段或 hash 比对;
- [ ] 运营单行程页打开 091:状态/草稿/已发布均显示 v24 硬编码,**draft 与 published 同源一致**;
- [ ] 客户 invite/已保存页打开 091:仍是 v24,无变化。

---

## 9. Step 6 · 回退-的-回退(若恢复出错)

- [ ] 停止一切写;
- [ ] 用 **Step 1 的当前态备份**整份 `set` 回去,回到半迁移态;
- [ ] 重读校验 identity + draft=36;记录时间戳。
- 即:Step 1 备份保证本操作**完全可逆**。

---

## 10. B 不做什么(明确边界)

- ❌ 不修云函数超时(那是另一件事;后续可在控制台把 `buildCustomerTripVisibleDraft` 超时调到 20s。回退后超时已**无危险**,因为 draft 本就是硬编码,重建不再覆盖通用草稿)。
- ❌ 不删 / 不动 C3B 开关代码、不动 invite 投影代码(都默认无害)。
- ❌ 不做去硬编码(那是 A / C 轨道,等准备好用干净方式一次性做)。
- ❌ 不发布、不动客户可见版本。

---

## 11. 收尾

回退完成后:
- 091 = 纯硬编码、一致、客户零影响;**当前混乱清空**。
- 主流程(普通行程:缺口①②③)正常推进,不被 091 拖累。
- 把"091 正式去硬编码"另起干净一轮(D-1 真实 transport_orders 行 → 默认位切换 → 重建发布 → 删渲染兜底),不再半切。
- 更新 `p4-master-roadmap.md`:C3B 标为"已回退至一致态,留待正式去硬编码";`p4-d0-091-card-pipeline-state-analysis` 记录本次回退。
