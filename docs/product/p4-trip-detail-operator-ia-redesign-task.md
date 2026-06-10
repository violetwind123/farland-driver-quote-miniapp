# P4 · customer-trip-detail 信息架构重构(给 Codex)

> **一句话定位:`customer-trip-detail` 应该是"单个行程运营管理页",不是"发布调试页"。**
> 重构后运营打开页面,只需回答三个问题:**这个行程现在什么状态?客户现在能看到什么?我下一步点哪个按钮?**
>
> 范围:**纯前端重组**,只改 `customer-trip-detail.{wxml,js,wxss}` 三个文件。
> 不改任何云函数、不加新云调用(除剪贴板)、不削弱任何既有护栏(D2C 覆盖护栏 / 091 锁 / 分享卡锁全保留)。

---

## 0. 现状问题(对照当前 wxml 行号)

| 问题 | 现状位置 |
| --- | --- |
| 页面语言技术化:`CUSTOMER TRIP RELEASE` kicker、raw `review/visibility/version` 三格 | hero `:11`、status-grid `:31-44` |
| `flight_segment_detected` 等裸 warning 码直接展示 | 警告列表 `:46-59`(critical/需复核/changed 三个 box) |
| `needs_review + published + v24` 并排,运营分不清"发了没" | `:33-43` |
| JSON 覆盖(危险操作)排第 2 个 panel,一进页面就是大文本框 | `:75-142` |
| 分享卡(`:144`)排在客户预览(`:168`)前,与"先预览后分享"流程相反 | `:144-166` |
| 草稿审阅长得像客户页(customer-hero),运营会误以为是客户最终页面 | `:196-204` |
| 日期可能漏 raw ISO:`display_date_range` 优先取 `hero.date_range`,**它缺失时**回退拼接 raw `start_at - end_at`(js `:448`) | 需统一 `formatDate` 兜底 |
| 无每日管理卡、无评价卡入口 | 全缺(对应 `p4-operator-flow-spec` 缺口②③) |

---

## 1. 新页面结构(模块顺序)

```
顶部 · 行程状态卡(业务语言)
模块一 · 发布流程(三步:审阅草稿 → 预览客户页面 → 发布/分享)
模块二 · 草稿内容审阅(运营视角,含 tabs)
模块三 · 每日管理(每天一张运营卡 + 评价卡占位)
模块四 · 高级操作(默认折叠:JSON 覆盖 / 复制 trip_id / 技术状态)
footer · 返回行程管理
```

---

## 2. 顶部 · 行程状态卡

**显示(全部业务语言):**
```
{display_title}                                      [刷新]
{trip_no} ｜ 2026/06/05 - 2026/06/12 ｜ 8 天
{city_route_text(若有)}

当前客户可见:已发布 v24 的内容 / 客户暂时看不到此行程
草稿状态:有新草稿待复核 / 草稿与发布版一致 / 尚未生成草稿
下一步:审阅新草稿 → 预览 → 重新发布
```

**业务状态推导表(核心资产——加进 js,扩展现有 `getStateCopy()`):**

| 条件(用 `result` 已有字段) | 状态文案 | 客户现在看到 | 下一步 |
| --- | --- | --- | --- |
| `!hasDraft && !hasPublished` | 已导入,待生成草稿 | 看不到此行程 | 生成客户可见草稿 |
| `hasDraft && visibility!=='published'` | 草稿待审阅,尚未发布 | 等待页(无内容) | 审阅草稿 → 预览 → 发布 |
| `published && review_status==='approved'` | 已发布 v{N},内容已确认 | 当前发布版 v{N} | 生成 / 转发客户分享卡 |
| `published && review_status==='needs_review'` | 已发布 v{N},**有新草稿待复核** | **仍是上一版 v{N}**(新草稿未发布) | 审阅新草稿 → 重新发布 |
| 其它(如 `discarded` / 未知组合) | 回退到现有 `getStateCopy()` 文案 | 按 visibility 判断 | 显示"联系开发核查" |

推导函数返回 `{ state_text, customer_seeing_text, next_step_text, flow_step }`(`flow_step ∈ 1|2|3` 驱动模块一的步骤高亮)。

**日期格式化(js 新增工具):**
- `formatDate(iso)` → `YYYY/MM/DD`(无效输入原样返回);
- 日期范围优先用 `trip_summary.date_range_text`,否则 `formatDate(start_at) - formatDate(end_at)`;
- 天数:`trip_summary.days_count || itinerary_days.length`;
- 城市路线:`trip_summary.city_route_text`(已有派生字段,直接用)。
- **全页禁止 raw ISO**:验收时 `grep 'T[0-9]{2}:' ` 渲染输出无残留。

---

## 3. 模块一 · 发布流程(三步卡)

步骤条:`1 审阅草稿 → 2 预览客户页面 → 3 发布 / 分享`,当前步骤按 `flow_step` 高亮。

**按钮(全部复用现有 handler,不改逻辑):**
- `生成客户可见草稿`(`buildDraft`;无草稿时为主按钮)
- `审阅草稿`(切到模块二 draft tab + 锚点滚动;新 handler 只做 `selectSnapshot('draft')` + `wx.pageScrollTo`)
- `进入客户真实页面`(`openCustomerFacingPreview`)
- `确认发布`(`publishTrip`,`canPublish` 控制不变;发布备注 textarea 保留在此)
- 警告区(critical / 需复核 / 与已发布版本不同)保留在本模块——它们是发布 gate 信息;**裸 warning code 加中文映射**(`flight_segment_detected → 检测到航班段,请核对航班信息`,未知码原样显示)。

> ⚠️ **必须写进按钮副文案的语义(防误导):**
> "进入客户真实页面"显示的是**客户此刻真正看到的页面**——未发布时是等待页;已发布时是**当前发布版,不是新草稿**。
> (依据:云函数 `getOperatorCustomerHomePreview` 内部 helper `getOperatorPreviewSnapshot`——
> `index.js:935` `isPublished = visibility==='published' && hasSnapshot(published_snapshot)`,published 时取 `published_snapshot`,否则等待页。)
> 所以副文案写:`显示客户此刻所见(已发布版);新草稿请在"草稿内容审阅"中核对`。

**分享卡子块(发布后解锁,保留现有锁逻辑 `:146`):**
- 未发布:保留现状锁文案"发布后可生成客户分享卡"。
- `published && approved`:显示 `准备客户分享卡`(`createTripInvite`)/ 已有 invite 显示转发 + **新增"复制客户路径"按钮**(新 handler `copyInvitePath`:`wx.setClipboardData(invitePath)`)。
- `published && needs_review`:**禁用"准备客户分享卡"按钮**并显示原因(`有新草稿待复核,建议先发布再生成新分享卡`);**但已有 invite 的复制/转发保持可用**,并加提示:`分享卡指向已发布的 v{N},新草稿发布前客户不会看到变化`。
  (理由:invite 永远服务 published 内容,旧卡依然有效;硬锁复制只添堵不加安全。)

---

## 4. 模块二 · 草稿内容审阅(运营视角)

- 标题改:`草稿内容审阅(运营核对用)`;顶部一行说明:`此为运营字段核对视图,不是客户最终页面;客户页面请用上方"进入客户真实页面"`。
- tabs 文案改:`新草稿` / `已发布 v{N}`(替代"草稿预览/已发布版本")。
- 现有 sections(整体概览 / 每日摘要卡 / 每日行程 / 酒店 / 航班 / 用车)**保留**,渲染逻辑不动;customer-hero 块顶部加小标签 `运营审阅` 以示区别。
- 区内日期经 `formatDate`。

---

## 5. 模块三 · 每日管理(新增)

数据源:`activeSnapshot.itinerary_days`(每天一张卡),辅以 `daily_summary_cards`(badge)与 `hotel_cards`。

> 🔴 **酒店按天匹配的前置修正(对抗校验发现):** compact 后的 `hotel_cards` **当前不带任何按天关联字段**——
> 草稿构建器只产 `linked_day_no`(`buildCustomerTripVisibleDraft/index.js:546`)、091 硬编码产 `linked_day_nos`(复数数组),
> 而 `compactHotelCard` 白名单(`getOperatorTripPreview/index.js:160-175`)两者都没保留(只有一个永远为空的 `day_no` 键)。
> **修法(本任务允许的唯一云函数改动):给 `compactHotelCard` 白名单追加 `'linked_day_no', 'linked_day_nos'` 两个 key**
> (一行、加法、仅运营载荷),并重新部署 `getOperatorTripPreview`。
> 前端匹配规则:`hotel.linked_day_no === day.day_no || (hotel.linked_day_nos || []).includes(day.day_no)`;
> 两字段都缺时回退 `daily_summary_cards` 同天的 `hotel_badge`;再缺则省略该行(容忍缺失,不报错)。

每张 Day 卡:
```
Day {day_no} ｜ {formatDate(date)} {weekday}        [状态 chip:跟随行程状态]
{title / city}
行程:{timeline_items 前 2-3 个 title,“ / ”拼接}
酒店:{当日 hotel name(有则显示)}
用车:{daily_summary_cards 对应天的 transport_badge(有则显示)}

[查看 Day 详情]  [生成 Day{N} 评价卡(待上线)]  [复制评价卡路径(待上线)]  [查看反馈(待上线)]
```
- `查看 Day 详情` = 展开/折叠该天完整 timeline(默认折叠——顺手实现 `p4-operator-flow-spec` 缺口③;新 data `expandedDayNo`)。
- **评价卡三个按钮为占位:`disabled` + "待上线" 标注,不接任何云调用**(E1 实现后接管,见 flow-spec 缺口②)。

---

## 6. 模块四 · 高级操作(默认折叠,页面底部)

折叠 panel(新 data `advancedOpen:false`,点击标题展开),内含:
1. **更新行程 JSON(覆盖)——整块原样搬移**(`:75-142` 全部 wxml + 现有全部 data/handler)。**护栏零改动**:dry-run 先行、`action===update`+id 匹配强校验、textarea 变更作废、二次确认弹窗、091 排除文案。只是位置 + 默认折叠。
2. `复制 trip_id`(从 footer `:305` 移入)。
3. **技术状态**(原 `review/visibility/version` 三格 + raw warning codes 列表搬到这里,供排查;主界面只显示业务翻译)。

footer 只留 `返回行程管理`。

---

## 7. JS 改动清单(汇总)

**新增:** `formatDate/formatDateRange`、`deriveBusinessState()`(扩展 `getStateCopy`,返回四元组)、`translateWarningCode()` 映射表、`buildDayCards()`(itinerary_days+hotel_cards+daily_summary_cards 合并)、`copyInvitePath`、`toggleAdvanced`、`toggleDayExpand`、`scrollToReview`。
**不动:** `loadPreview / normalizeSnapshot / buildDraft / publishTrip / createTripInvite / onTripInviteShareTap / openCustomerFacingPreview / selectSnapshot / refreshPreview / backToTripManagement / 全套 overwrite 函数 / isTrip091 锁`。

---

## 8. 约束(硬性)

- 只改 `customer-trip-detail.{wxml,js,wxss}` + **唯一允许的云函数改动:`getOperatorTripPreview` 的 `compactHotelCard` 白名单追加 `linked_day_no/linked_day_nos` 两个 key**(见模块三,加法、需重部署);其余云函数零改动。新增系统调用仅 `wx.setClipboardData` / `wx.pageScrollTo`。
- **D2C 覆盖护栏逐条不变**(dry-run→update+id 校验→textarea 作废→showModal→apply→rebuild,不自动发布)。
- **091 锁不变**(覆盖排除);091 在新状态语言下无需特例——它当前恰好就是"已发布 v24,有新草稿待复核,客户仍看 v24"。
- 分享卡:未发布锁定逻辑保留;`needs_review` 仅禁用**创建**,已有 invite 复制/转发可用。
- 不做评价卡后端(占位即止);不改 getOperatorTripPreview compact 字段集(新 UI 只用已保留字段:`trip_summary.{date_range_text,city_route_text,days_count,...}`、`daily_summary_cards.{hotel_badge,transport_badge,highlight_items}`、`itinerary_days`、`hotel_cards.day_no` 等,全部已在 compact 白名单内)。

---

## 9. 验收清单

- [ ] 打开页面 3 秒内能答三问:状态 / 客户所见 / 下一步(顶部状态卡)。
- [ ] `published + needs_review` 显示"已发布 v{N},有新草稿待复核;客户仍看 v{N}"——不再出现裸 `needs_review/published/v24` 并排歧义。
- [ ] JSON 覆盖默认不可见;展开后按 D2C 验收清单逐条复测通过(包括 091 排除)。
- [ ] 分享卡:未发布=锁;published+approved=可创建+可复制路径;published+needs_review=创建禁用但旧 invite 可复制/转发(含指向提示)。
- [ ] "进入客户真实页面"副文案写明显示的是已发布版/等待页。
- [ ] Day 卡逐日渲染、可展开收起;评价卡按钮禁用占位、无云调用。
- [ ] 全页无 raw ISO 时间;warning code 有中文翻译。
- [ ] `node --check` 通过;DevTools 用 091(published+needs_review)与一条普通行程(草稿态)各过一遍。
- [ ] 091 页面照常打开(compact 预览不超 1MB 已由 051c9c8 保证),所有 091 锁仍生效。
