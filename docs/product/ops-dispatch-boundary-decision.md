# 派单架构决策:网页端建单,小程序只做派发

> **决策(2026-07-03,产品拍板):** 用车服务(transfer)的**第一落点 = 网页端台账**(Cloudflare Pages + D1,含财务字段);
> **小程序 = 派发执行通道**(接收脱敏工作单 → 司机报价 → 选司机 → `transport_orders` → 客户可见)。
> 即 deep-research 整合报告的"D1 权威 + 受限投影"方向成立;`opsUpsertRideRequest`(`2c01856`)是该方向的第一块地基,继续推进。

---

## 1. 职责分界(单一真源表)

| 领域 | 权威归属 | 说明 |
| --- | --- | --- |
| transfer 身份 / 日期 / 路线 / 航班 / 客户 / **全部财务与结算** | **网页端 D1** | 建单、改单、财务都在台账 |
| 司机报价工作流(`ride_requests` / `driver_quotes`) | 小程序(执行态) | 由 D1 push 下发脱敏工作单;quotes 留在小程序本地 |
| 确认司机快照(客户可见) | 小程序 `transport_orders` | **既有不变量,保持**;选定后快照回流 D1(副本,非权威转移) |
| 客户行程 / 发布 / 分享卡 / 每日评价 | 小程序 `customer_trips` 体系 | **与本决策无关,零改动**(绑定边界、评价规则原样) |

## 2. 财务禁运清单(永不下发到小程序 / 司机 / 客户)

`charge_* / fx_rate / client_status / client_method / charge_date / cost_* / settle_* / margin / notes(内部)/ updated_by`。
下发白名单仅限工作单字段:日期/时间/路线/航班/人数/车型偏好/司机区域/报价截止/`dispatch_note`(司机安全文案)。

## 3. 决策派生的必做配套(缺一即双真源风险)

| # | 配套 | 性质 |
| --- | --- | --- |
| 1 | **小程序建单入口收口**:`operator/create-request` 降级为"应急手工建单"(明示不入台账、事后需补录)或从 dashboard 移除入口 | 小,防双入口 |
| 2 | **`2c01856` 事后深审 = 部署门槛**:`opsUpsertRideRequest` 已是正式地基,联调/部署前必须过审(重点:HMAC 验签路径、upsert 冲突语义、终态保护、客户读路径改动) | **阻塞部署** |
| 3 | 回流通道(Phase 2):`selectDriverQuote` 后 `transport_orders` 快照 + 状态回 D1(callback 或运营手动 pull 起步) | 下一阶段 |
| 4 | id 约定:`ops_transfer_id` 为跨系统共享键;小程序 doc `_id` 需 sanitize/hash(CloudBase doc id 字符集/长度约束,已有 `safeDocId` 前科) | 契约 |
| 5 | 终态保护:请求已 `assigned/confirmed` 后 D1 改单不得静默覆盖 → `conflict_locked` 人工裁决(报告规则,采纳) | 契约 |
| 6 | 灰度:先 1 笔 pilot transfer 全链路(网页建 → push → 报价 → 选派 → 回流),验证后再放量;存量 transfer 只回填未来+未派单的 | 上线纪律 |
| 7 | 评价司机归因受益:`opsUpsertRideRequest` 已给 `ride_requests` 写 `trip_id`——正是评价归因两步链缺的字段;pilot 时顺带验证归因命中 | 顺手收益 |

## 4. 不做(边界)

- 小程序不反向创建/修改台账 transfer(单向:D1 建单 → push;小程序只回流状态/司机快照)。
- `driver_quotes` 不同步到 D1(Phase 1/2 均不做,最多汇总计数)。
- 实时酒店 API、自动推送、支付仍在"当前不做"清单。

## 5. 与既有轨道的关系

- 本决策开新轨道 **F · 跨系统派单集成**(网页台账 ↔ 小程序派发)。
- 不影响 C(091 去硬编码)、D(客户绑定)、E(评价)——它们照常推进。
- roadmap"🚫 当前不做"中的"外部表格同步"护栏由本决策取代:**做,但按上述边界做**。
