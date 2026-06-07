# P4-D2C · Customer Trip JSON Overwrite Panel (in customer-trip-detail)

> **执行者:Codex** · 自包含任务。
> **目标:** 让运营在「行程管理 → 对应行程编号(`customer-trip-detail`)」内,粘贴新标准 JSON **覆盖当前行程**,
> 经 dry-run 预览 + 显式确认后 apply,自动重建客户可见草稿,**但不自动发布**;客户在运营手动发布前仍看旧版。
>
> **风险高于 D0A:此操作会触发行程覆盖。以下硬边界必须写死,任何一条缺失即视为未完成。**

---

## 0. 范围

**改:**
```
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.js
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.wxml
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.wxss
```
**不新建云函数。** 复用现成:`importCustomerTripJSON`(dry_run/apply)、`buildCustomerTripVisibleDraft`、`publishCustomerTrip`。

**不要改:** 任何云函数 / 客户端其它页 / `trip091CardSystem.js` / 发布分享逻辑本身 / `ride_requests` / `transport_orders` / schema / 存量数据。

---

## 1. 硬边界(MUST / MUST NOT)

1. **入口只在 `customer-trip-detail`。** 不在 dashboard / customer-import 加新入口。
2. **只允许覆盖当前 trip。** 粘贴 JSON 的 dry-run 结果必须满足:`action === 'update'` **且**
   返回的 `external_trip_id`(`normalized_preview.external_trip_id` 或 `result.external_trip_id`)
   **等于当前行程的 external_trip_id**。任一不满足 → **禁用 apply**,显示阻止原因。
   - `action === 'create'` 或 id 不匹配 → 这是"新建/动别的行程",**必须拦死**。
   - `action === 'no_change'` → 显示"内容未变化",无需 apply。
3. **必须先 dry-run 再 apply。** 不允许跳过预览直接覆盖。
4. **dry-run 预览必须显示:** `action`(update)、目标 `external_trip_id` / `trip_no`、`warnings`(及 `critical_warning_codes` 若有)、**day count**。
5. **必须显式二次确认后才 apply。** apply 前弹确认(`wx.showModal` 或专门确认按钮),文案明确"将覆盖当前行程源数据"。
6. **apply 成功后自动 `buildCustomerTripVisibleDraft`**(重建草稿),刷新本页预览。
7. **MUST NOT 自动 publish。** apply + build 之后停在草稿态;发布仍是运营手动点现有「发布」按钮。
8. **旧 `published_snapshot` 保持对客户可见**,直到运营手动发布(此为 `importCustomerTripJSON` 既有行为:
   覆盖只置 `review_status = needs_review`、保留旧 published,**不要去动这套生命周期**)。
9. **091 排除。** 当前 trip 命中 091(见 §5)时,**不渲染覆盖面板**,显示一行说明:091 暂未迁移到数据驱动,不支持 JSON 覆盖。

---

## 2. 交互流程

```
customer-trip-detail 内「更新行程 JSON(覆盖)」折叠面板
  └─ textarea 粘贴标准 JSON
  └─ [预览覆盖] → importCustomerTripJSON({ trip, dry_run: true })
        ├─ 失败 / action≠update / id 不匹配 → 显示错误,apply 禁用
        └─ 成功且 action=update 且 id 匹配 → 显示预览卡:
              action=update · 目标 external_trip_id/trip_no · day count · warnings
              [确认覆盖] 可点
  └─ [确认覆盖] → wx.showModal 二次确认
        └─ 确认 → importCustomerTripJSON({ trip, dry_run: false })   // apply 覆盖
              └─ 成功 → buildCustomerTripVisibleDraft({ trip_id })   // 自动重建草稿
                    └─ 成功 → 刷新本页 loadPreview();toast「已覆盖并重建草稿,请复核后手动发布」
  └─ (面板内不出现 publish 按钮;发布走页面既有「发布」按钮)
```

---

## 3. 云函数契约(复用,照此调用)

### 3.1 `importCustomerTripJSON`(dry_run 与 apply 同一函数)
```js
// 调用(payload key 为 trip,与 customer-import 一致)
const { result } = await wx.cloud.callFunction({
  name: 'importCustomerTripJSON',
  data: { trip /* 解析后的 JSON 对象 */, dry_run: true /* 或 false */ },
});
```
**dry_run = true 返回(关键字段):**
```jsonc
{
  "success": true, "dry_run": true,
  "action": "update | create | no_change",
  "trip_id": "", "external_trip_id": "",
  "warnings": [], "warning_codes": [], "critical_warning_codes": [],
  "preview": { /* buildCanonicalPreview,含 day_count */ },
  "normalized_preview": {
    "trip_id": "", "external_trip_id": "", "trip_type": "", "title": "",
    "status": "", "start_at": "", "end_at": "", "customer_display_name": "", "source_hash": ""
  }
}
```
- **day count 取值:** `result.preview?.day_count ?? result.normalized_preview?.day_count ?? 0`
  (与 `customer-import.js:411` 同源;若两处都无,回退为解析 JSON 自身 `itinerary_days/daily_itinerary` 长度)。
- **apply 即 `dry_run: false`**,同函数;成功后按 §2 触发 build。

### 3.2 `buildCustomerTripVisibleDraft` / `publishCustomerTrip`
本页已有 `buildDraft()`(调 `buildCustomerTripVisibleDraft`,`{ trip_id }`)与 `publishTrip()`(调 `publishCustomerTrip`)。
**apply 后调用与 `buildDraft()` 相同的云函数即可**;publish 不在本流程内自动触发。

---

## 4. "只覆盖当前 trip" 强校验(实现要点)

```js
// 当前行程 external_trip_id:优先用已加载预览的 canonical 值,回退 this.data.tripId
const currentExtId = (this.data.preview && (this.data.preview.external_trip_id || this.data.preview.trip_no))
  || this.data.tripId;

function dryRunTargetsCurrentTrip(result, currentExtId) {
  if (!result || result.success !== true) return false;
  if (result.action !== 'update') return false;                 // 只允许 update
  const ext = (result.normalized_preview && result.normalized_preview.external_trip_id)
    || result.external_trip_id || '';
  return Boolean(ext) && String(ext) === String(currentExtId);  // 必须命中当前行程
}
```
- 校验不过 → `canApplyOverwrite = false`,预览区显示阻止原因
  (例:`action=create` → "该 JSON 会新建行程,非覆盖当前行程,已阻止";id 不匹配 → "JSON 的 external_trip_id 与当前行程不一致")。
- **apply 前再校验一次**(防止用户改了 textarea 后直接点确认):apply 用的 trip 必须与已通过 dry-run 的同一份;
  建议把通过校验的解析对象缓存在 data,apply 时若 textarea 变了则要求重新预览。

---

## 5. 091 排除(实现要点)

当前 trip 命中以下任一即视为 091,**隐藏整个覆盖面板**:
```
trip_no === '2026XBC091'  ||  external_trip_id === '2026XBC091'  ||  trip docId === 'bf757c4c6a2054f800350a925147b32e'
```
- 判定数据来自本页已加载预览(`this.data.preview` 的 `trip_no` / `external_trip_id` / `display_trip_no`)及 `this.data.tripId`。
- 面板位置显示一行说明即可:「091 暂未迁移到数据驱动管线,暂不支持 JSON 覆盖(见 P4-D0 Step 4 灰度迁移)」。

---

## 6. 验收标准

- [ ] 面板只出现在 `customer-trip-detail`;dashboard / customer-import 无新增入口。
- [ ] 粘贴**当前行程**的修改版 JSON → 预览显示 `action: update` + 目标 `external_trip_id/trip_no` + day count + warnings;[确认覆盖] 可点。
- [ ] 粘贴**别的 external_trip_id** 的 JSON → 预览判定 `action=create` 或 id 不匹配 → **apply 被禁用**并提示原因。
- [ ] 未先预览 → 无法 apply。
- [ ] 点[确认覆盖] → 有 `wx.showModal` 二次确认;取消则不覆盖。
- [ ] 确认后 → `importCustomerTripJSON(dry_run:false)` 覆盖成功 → 自动 `buildCustomerTripVisibleDraft` → 本页预览刷新到新草稿。
- [ ] **覆盖 + 重建后未自动发布**:`visibility_status` 未变 published、`review_status` 为 `needs_review`。
- [ ] **客户端在发布前仍看旧版**:`published_snapshot` 未变,直到运营手动点「发布」。
- [ ] 当前 trip 为 091 → 覆盖面板不渲染,只显示排除说明。
- [ ] `node --check` 通过;仅改 `customer-trip-detail` 三个文件。

---

## 7. 边界与坑

- **payload key 是 `trip`**(解析后的对象),与 `customer-import.js:434` 一致;不要传字符串。
- **JSON 解析失败**要捕获并提示,不要把原始字符串直接送云函数。
- **apply 的输入必须等于通过 dry-run 的那份**:用户预览后又改了 textarea,必须要求重新预览(作废旧的 can-apply 状态)。
- **不要复制 `customer-import` 的"生成分享卡/绑定客户"逻辑**(那会触发 access 预绑定,属于另一条线 P4-D2B);本面板**只做覆盖 + 重建草稿**。
- **不要在本流程触发 publish**;也不要改 `importCustomerTripJSON` 的 needs_review / 保留旧 published 行为。
- **091 判定要 fail-safe**:拿不到 trip_no 时,若 `this.data.tripId` 命中 091 标识也要排除。

---

## 8. 代码位置速查

| 内容 | 位置 |
| --- | --- |
| 本页数据/方法(building / publishing / tripId) | `customer-trip-detail.js:5,6,9` |
| onLoad 取 trip_id | `customer-trip-detail.js:31` |
| 加载预览(getOperatorTripPreview) | `customer-trip-detail.js:58` |
| buildDraft(复用其云函数调用) | `customer-trip-detail.js:205` |
| publishTrip(本流程不自动触发) | `customer-trip-detail.js:235` |
| import 调用样式参考(payload=trip, dry_run) | `customer-import.js:421-461` |
| day_count 取值参考 | `customer-import.js:411` |
| 091 常量来源 | `buildCustomerTripVisibleDraft/index.js`(`TRIP091_NO='2026XBC091'` / `TRIP091_TARGET_DOC_ID='bf757c4c6a2054f800350a925147b32e'`) |

---

## 9. 上下文(为什么现在能做)

P4-D0A 已让卡片管线"默认忠实透传",覆盖进去的富字段(`travel_snapshot`/`ui_flags`/`source_refs`/`parent_group_*`/酒店富字段)
会经 `buildCustomerTripVisibleDraft` 完整进入草稿,不再被丢。后端 `importCustomerTripJSON` 早已支持按 `external_trip_id`
原地覆盖(同 doc update,保留版本历史,置 needs_review,保留旧 published)。因此本任务是**纯前端接线 + 强校验**,
不动后端、不动 091。
