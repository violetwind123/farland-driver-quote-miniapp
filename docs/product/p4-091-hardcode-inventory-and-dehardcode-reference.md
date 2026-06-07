# P4 · 091 硬编码总清单 与 去硬编码参考(给 Codex 的总参考)

> **性质:参考 / 地图,不是立即执行任务。** 用途:在动手"091B 实验"或"去硬编码"前,先有一份完整、准确的耦合面地图。
> 由它派生三件事:① P4-D0 卡片 schema 还要补哪些字段;② 091B 实验怎么设计才干净;③ 去硬编码时的删除清单。
>
> **当前不要据此改任何 091 文件。** 091 的构建层与渲染层正在被另一条 UI 迭代主动修改(未提交)。
> 本参考用于"量",清理要等 091 UI 定稿 + 基线提交后另起任务。

---

## 0. 核心结论

091 的"效果"不是单点硬编码,而是**三层叠加**,其中渲染层有一套**按内容匹配的"已知值兜底库"**,
专门补卡片数据里缺的东西(酒店日期、预订号、路线元数据、客户名)。

```
① 构建层  trip091CardSystem.js              生成富卡片(整文件硬编码)
② 渲染层(id 键)  trip_no==='2026XBC091' / card_id 以 '091_*' 开头   注入客户名、Day7、路线 override
③ 渲染层(内容键)resolveKnownTrip091Hotel*  按酒店品牌名 / stay_ 前缀注入"已知"酒店日期 / 预订号
```

**最关键认知:第③层证明数据模型不完整。** 渲染端之所以要"按品牌名兜底注入酒店日期",
是因为卡片数据里没带 `check_in_date` / `check_out_date` / 预订信息。**去硬编码的本质 = 把这些数据补进卡片(P4-D0 schema 已加槽位),
再删掉渲染兜底**,而不是简单"把 trip091CardSystem.js 搬成 JSON"。

> ⚠️ 第③层按内容(hyatt/hilton/riu/glover/renaissance/`stay_`)触发,**与 trip id 无关**。
> 所以"091B 换个 id"躲不掉它——这是 091B 实验设计必须处理的点(见 §4)。

---

## 1. 构建层(build)

| 位置 | 内容 |
| --- | --- |
| `cloudfunctions/buildCustomerTripVisibleDraft/trip091CardSystem.js`(整文件 ~1800 行) | 091 全部卡片内容:实体档案(学校/酒店/地标/博物馆)、maps/waze 行车时间表、references、`buildCard` 卡片结构、`HOTEL_STAYS`、`TRIP091_CONFIRMED_DRIVER` 等,全是 JS 字面量 |
| `…/trip091CardSystem.js:1124 isTrip091()` | 判定:`[trip_no, trip_id, external_trip_id, _id]` 中**精确等于** `2026XBC091`(`Array.includes`,非子串) |
| `…/index.js:655` 分支 | `useTrip091CardSystem ? buildTrip091CardSystem(trip) : normalizeSnapshotV2(trip)` |
| `…/index.js` 守卫 | `isStrictTrip091Target`(docId `bf757c4c6a2054f800350a925147b32e` + trip_no/external 双等)、`validateTrip091WriteSnapshot`(校验 day 卡数 `[4,3,6,4,3,4,7,2]` 等)、`backupTrip091OriginalDoc`、`resolveTrip091WarningCodes` |

> 构建层 `isTrip091` 是**精确匹配**,所以新 id 的 091B 在构建侧安全走通用 `normalizeSnapshotV2`。

---

## 2. 渲染层 · id 键(按 trip_no / card_id 前缀)

| 位置 | 触发条件 | 注入内容 |
| --- | --- | --- |
| `home/home-page-config.js:765` | `text === '2026XBC091'` | 客户名 `刘女士` |
| `home/home-page-config.js:4` | 默认值 | `loadingCustomerName: '刘女士'`(加载态默认名) |
| `home/home-page-config.js:1178 get091RouteMetaOverride` + `:1278` 注入 | `card_id ∈ { '091_day7_white_house', '091_day7_lincoln_memorial', '091_day7_us_capitol', '091_day7_capitol_hill', '091_day7_library_of_congress', '091_day7_supreme_court_exterior', '091_day7_glover_georgetown' }` | Day7(华盛顿)各卡的路线元数据 override |
| `day-detail/day-detail.js:611 isTrip091Day7Card` + `:626` | `card_id` 以 `091_day7_` 开头 | Day7 卡特殊文案处理 |
| `day-detail/day-detail.js:928` | `trip_no !== '2026XBC091'` 直接 return | 某 091 专属文案 |
| `day-detail/day-detail.js:1213-1218` | 写死访校 card_id 列表(`091_day1_boston_college` / `babson` / `amherst` / `091_day2_brown` / `yale` / `091_day4_columbia`) | 访校卡特殊处理 |

> 这些按 id/card_id 触发,091B 用**全新 id + 重映射 card_id(脱离 `091_*` 前缀)** 即可不触发。

---

## 3. 渲染层 · 内容键(按酒店品牌 / stay_ 前缀)⚠️ 最难

**同一套"已知酒店值兜底"在 3 个文件各实现一份(三处重复):**

| 文件 | 函数 | 用处 |
| --- | --- | --- |
| `home/home-page-config.js:1912 / 1945` | `resolveKnownTrip091HotelDates` / `resolveKnownTrip091HotelBookingInfo` | 首页酒店卡日期/预订兜底(用于 :1903 / :1969 / :1978) |
| `day-detail/day-detail.js:828 / 871` | 同名两函数 | 每日页酒店卡兜底(用于 :799 / :900 / :914) |
| `hotel-detail/hotel-detail.js:69 / 102` | 同名两函数 | 酒店详情页兜底(用于 :60 / :126 / :135) |

**触发键(`day-detail.js:844`,其它同构):**
```js
key = [tripNo, stay_id, hotel_id, card.title, name_en, name_zh, hotel.name, ...].join(' ').toLowerCase();
// 命中以下任一即注入写死的酒店日期/预订:
key.includes('2026xbc091') || key.includes('stay_')
  || key.includes('hyatt') || key.includes('renaissance')
  || key.includes('hilton') || key.includes('riu') || key.includes('glover')
```
→ **任何带这些酒店的行程都会被注入**,与 trip id 无关。091B 因为用同样的酒店,**也会被注入**,
从而**掩盖卡片数据里的酒店日期/预订是否真的存在**。

---

## 4. 操作侧 091 引用(可保留,非客户渲染债)

以下是运营工具 / 守卫,不是客户渲染硬编码,**去硬编码时一般可保留**(但需确认不误伤 091B):

| 位置 | 性质 |
| --- | --- |
| `operator/customer-trip-detail.js`(D2C `isTrip091`) | 把 091 排除出"覆盖 JSON"流,合理 |
| `operator/customer-home-preview.js`(TRIP091_EXAMPLE 等) | 运营预览的检测范例,调试用 |

---

## 5. 这份清单 → 喂 P4-D0 卡片 schema

渲染兜底注入的每类数据 = 卡片 schema 应有的槽位。对照检查:

| 兜底注入的数据 | P4-D0 schema 是否已有槽 | 行动 |
| --- | --- | --- |
| 酒店 `check_in_date` / `check_out_date` | ✅ 已有(§3 卡片 schema) | JSON 填上即可,删兜底 |
| 酒店预订号 `confirmation_no` | ✅ 已有(默认 fail-closed 隐藏) | JSON 填上 + 视情况开 `confirmation_no_visible` |
| `room_summary` / `room_type` | ✅ 已有 | JSON 填上 |
| Day7 路线元数据(get091RouteMetaOverride) | ⚠️ 需确认 `travel_snapshot` 能否容纳 | 不够则补 schema 字段 |
| 客户名(刘女士) | 顶层 `customer.display_name`(snapshot 顶层) | 由 JSON `customer` 提供,删 id 硬编码 |
| 访校卡特殊处理(card_id 列表) | `card_type: school_visit_card` + `display_snapshot` | 改为按 card_type 渲染,不按 card_id |

> 结论:大部分槽位 P4-D0 已经定义。主要缺口可能是**路线元数据**与**Day7 文案**——需在 091B 实验中确认。

---

## 6. 091B 实验设计(干净 A/B 的关键)

> Gate: only after C1 has frozen the current 091 UI baseline. Use a new 091B trip only; do not apply these steps to live 091.

目标:用一条**全新数据驱动行程**复现 091,精确量出"纯数据能达到多少 / 渲染兜底补了多少"。

**命名硬约束(否则触发硬编码,A/B 不干净):**
- trip id:**既不等于也不包含** `2026XBC091`(避开构建层精确匹配 + 渲染层 `key.includes('2026xbc091')`)。
  例:用 `FARLAND-091B-DATA` 之类,**不要** `2026XBC091B`(后者含子串)。
- card_id:从 `091_*` **重映射**到别的前缀(如 `b91_*`),避开 §2 的 card_id 触发。

**仍躲不掉的内容键兜底(§3):** 091B 用同样的酒店品牌,`resolveKnownTrip091Hotel*` 仍会注入。
因此要得到"纯数据"真值,二选一:
- (A) **把酒店日期/预订在卡片数据里填全**,让兜底变冗余 → 对比时确认值来自数据(可临时在本地把兜底函数 return `{}` 验证);
- (B) 暂不验证酒店项,先量其它层差异。

**步骤:**
1. 一次性脚本(throwaway):`buildTrip091CardSystem(trip)` → 取 `itinerary_days` → 包成 canonical JSON
   (`schema_version:'1.0.0'`、新 id、新 card_id、`customer.display_name` 填上、酒店日期/预订填进卡片)。
   **剥掉司机/车辆身份**(`driver_name`/`phone`/`plate_number`/`vehicle_summary`),否则 `importCustomerTripJSON.findSensitiveKey` 拒绝导入。
2. `importCustomerTripJSON({trip, dry_run:true})` → 期望 `action:'create'`、`valid:true`;有 `SCHEMA_VALIDATION_FAILED` 就按 errors 修 JSON。
3. `dry_run:false` 应用 → `buildCustomerTripVisibleDraft` → `publishCustomerTrip`。
4. 并排对比 091B vs 091 客户页("进入客户真实页面"),逐项 diff。
5. 产出**差异清单**,按层归类(构建派生差异 / id 键差异 / 内容键兜底差异),每项给"补 schema / 填 JSON / 删兜底"的处置。

> 提醒:对比基线 091 仍在被 UI 迭代修改(未提交)。**最有意义的对比是针对已提交、稳定的 091。**
> 建议先把当前 091 UI WIP 在一个稳定点提交,再跑 091B 对比;否则是在追一个移动靶。

---

## 7. 去硬编码终态 与 删除清单(待 091B 验证后执行)

终态:091 走通用 `normalizeSnapshotV2`,渲染端无任何 091 分支。

**删除清单(每项以"数据已能提供"为前提):**
- [ ] `index.js:655` 091 分支 + `isStrictTrip091Target` / `validateTrip091WriteSnapshot` / `backupTrip091OriginalDoc` / `resolveTrip091WarningCodes`
- [ ] `trip091CardSystem.js` 整文件
- [ ] `home-page-config.js`:`:765` 客户名、`get091RouteMetaOverride`、`resolveKnownTrip091Hotel*`
- [ ] `day-detail.js`:`isTrip091Day7Card`、`:928` 文案门、`resolveKnownTrip091Hotel*`、`:1213-1218` 访校 card_id 列表
- [ ] `hotel-detail.js`:`resolveKnownTrip091Hotel*`
- [ ] 三处重复的酒店兜底统一删除(数据补全后)

**保留:** §4 运营侧工具/守卫(确认不误伤通用行程即可)。

**灰度方式(不一步删):** 通用管线能完整接收 → 091B 验证通过 → 用配置开关把真 091 切到通用路径(可切回)→ 稳定后再删上面清单。

---

## 8. 推荐顺序

```
(已完成) D0A 构建侧透传 + D2C 覆盖面板 + 文档,均已 commit
1. 091 UI WIP 在稳定点提交(给 091B 一个不动的对比基线)
2. 091B 实验(§6)→ 产出差异清单
3. 按差异清单补 P4-D0 卡片 schema 缺口(路线元数据 / Day7 文案等)
4. 让通用管线 + JSON 覆盖渲染兜底注入的全部数据
5. 灰度把真 091 切到通用路径
6. 删除 §7 清单,收口
```

> 不要跳过 1-2 直接删硬编码。先证明"纯数据能达到一样的效果",再删。
