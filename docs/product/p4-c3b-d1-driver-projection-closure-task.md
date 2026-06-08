# P4 C3B · D-1 司机投影收口任务(给 Codex)

> **目标:** 在**不发布、不写生产数据**的前提下,确定"发布无身份通用草稿后,091 invite 是否能从
> `transport_orders` 投影出司机",从而解开 D-1;或明确记录"接受 pending"。
> **状态:** 当前 D-1 仍未验证(见 `66f9179`)。上次 invite 测试看到的司机来自 v24 硬编码透传
> (`status_text=车辆与司机已确认` ≠ 投影输出 `已分配司机`),**不是** `0c2d7c0` 的投影。

---

## 0. 为什么不能"对草稿重测 invite"

`getCustomerTripByInvite` 服务的是 `published_snapshot`,现在还是 **v24(旧硬编码,自带司机)**。
新的 36 卡通用草稿在 `draft_snapshot`,**未发布**。所以:
- 用 invite 测,永远测到的是 v24 → 假阳性(司机来自硬编码,非投影)。
- 要让 invite 服务通用草稿,**必须先发布**——而发布正是 D-1 要先回答的事(鸡生蛋)。

**因此 D-1 收口 = 数据核查 + 本地投影单测,两条都只读、不发布。**

---

## 1. Step 1 · 只读核查 091 的 transport 数据

读 `transport_orders` 和 `ride_requests`,找与 091 关联且 `assigned`/`confirmed` 的行。**只 `.get()`,不写。**

- 按 `trip_id` / `external_trip_id` / `trip_no = 2026XBC091` 查 `ride_requests`(charter/包车类)。
- 对每个 request,查 `transport_orders`(`request_id` + `order_status ∈ {assigned, confirmed}`)。
- 也可直接按 trip 关联查 `transport_orders`(若有 trip 字段)。

**报告(每条):** `request_id`、`order_status`、`driver_name`、`driver_phone` 是否齐、
`vehicle_model`/`vehicle_color`/`plate_number` 是否齐、`service_date`/`pickup` 等。

> 关键判据:**`toCustomerDriver` 要返回非 null,必须有 `driver_name` 或 `driver_phone`(`hasAssignedTransportDetails`)。**
> 没有任何 assigned/confirmed 行 → 发布后投影不触发 → 司机必然 pending。

---

## 2. Step 2 · 本地投影单测(不碰生产、不发布)

证明"无身份快照 + 真实 transport 行 → 投影出司机、`status_text=已分配司机`"。一次性脚本即可:

1. 取一份**无身份**的 091 通用快照作输入(可用 091B 实验产出的 generic snapshot,或把 091 `draft_snapshot` 读出来——它已是无身份)。
2. 用 VM 载入 `getCustomerTripByInvite/index.js`(stub `wx-server-sdk`,与 091B 脚本同法),取出投影函数
   `applyAssignedCharterTransport` / `applyAssignedTransportToDay`。
3. 喂入 Step 1 查到的真实 transport 行(或其字段)。
4. **断言:**
   - 命中天的 `transport_summary.status_text === '已分配司机'`(= 投影真触发,**不是** `车辆与司机已确认`);
   - `transport_summary.driver.name` / `.phone` 来自该行;
   - `driver_visibility === 'assigned'`;
   - 整份输出 `sensitive_key_hits === []`(无 openid/cost 等)。
5. 若 transport 行无车辆字段 → 车辆为空属预期,记录"vehicle 待补"。

> 这样就在**不发布**的情况下证明了投影逻辑对无身份输入有效。剩下的唯一变量就是 Step 1 的"行是否存在"。

---

## 3. Step 3 · 决策矩阵(写回 C3B publish gate)

| Step 1 结果 | Step 2 结果 | D-1 结论 | 可否发布 |
| --- | --- | --- | --- |
| 有 assigned/confirmed 行且 driver 齐 | 投影断言通过 | **D-1 满足**:发布后司机由 `transport_orders` 投影显示 | 可进入发布批准(仍需你单独批准) |
| 有行但缺 driver_name/phone | 投影返回 null → pending | 行不完整 | 补全该行(单独批准)或接受 pending |
| 无任何 assigned/confirmed 行 | 投影必 pending | 发布后司机 **pending(消失)** | 需先建行(单独批准)或**显式接受 pending** |

---

## 4. 硬约束

- **只读**:仅 `.get()` 查 `transport_orders` / `ride_requests`。**不写**任何集合。
- **不发布**:不调 `publishCustomerTrip`,不改 `published_snapshot`。
- **不建/不改 transport 数据**:若 Step 3 要建 transport_orders 行,那是**另一个需单独批准**的写任务,不在本任务内。
- 本地单测产物写 `/tmp`,不进仓库;仅可提交脚本 + 结论文档。

---

## 5. 验收

- [ ] Step 1 报告:091 是否有 assigned/confirmed transport 行 + 字段齐全度。
- [ ] Step 2 单测:无身份快照 + 真实/构造行 → `status_text=已分配司机`、driver 来自行、sensitive `[]`。
- [ ] Step 3 决策按矩阵记入 `p4-c3b-091-live-switch-execution-checklist.md` 的 publish gate。
- [ ] 全程零生产写入、零发布。

> 收口后,publish gate 的 D-1 项才能从"未验证"变成"满足 / 已接受 pending",发布决策才有依据。
