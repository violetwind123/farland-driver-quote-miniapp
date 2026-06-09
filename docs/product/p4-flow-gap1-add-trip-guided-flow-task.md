# P4 · 缺口① 增加行程引导流(Codex 执行任务)

> 目标:把"增加行程"从 6 步手动串成连续流——运营导入标准 JSON、写入并自动建草稿后,
> **直接落在该行程的单行程管理页**(`customer-trip-detail`),即可"进入客户真实页面 / 发布 / 生成分享卡"。
> 见 `p4-operator-flow-spec.md` §3。

---

## 0. 范围

**只改:** `miniprogram/pages/operator/customer-import/customer-import.js`(`applyImport` 成功后的落点)。
**不改:** 任何云函数、`customer-trip-detail`、`importCustomerTripJSON` / `buildCustomerTripVisibleDraft` 逻辑、091 相关。

---

## 1. 现状(已做了一半)

`applyImport()`(:483)流程:
1. `wx.showModal` 确认写入;
2. `callImport(false)` 应用导入 → 拿 `tripId`;
3. **已经**调 `buildCustomerTripVisibleDraft({ trip_id: tripId })` 建草稿(:512);
4. 之后 `setData({ importStage: 'draft_ready', ... })`,**停在导入页**,只提供 `openDraftCustomerPreviewFromImport()` 按钮(:575,跳旧 `customer-trip-mobile-preview`)。

**问题:** 草稿已建好,但运营没被带到统一的单行程管理页,得自己回列表再找、再开——流程断。

---

## 2. 改法

在 `applyImport()` 中,**`buildCustomerTripVisibleDraft` 成功之后**(即现 :527 附近 `importStage:'draft_ready'` 处),
新增:**跳转到该行程的单行程管理页**:

```js
// 草稿已建好,直接进入单行程管理页(状态/预览/发布/分享卡都在那)
wx.redirectTo({
  url: `/pages/operator/customer-trip-detail/customer-trip-detail?trip_id=${encodeURIComponent(tripId)}`,
  fail: (error) => {
    console.error('[customer-import] open trip detail failed', error);
    // 兜底:留在导入页的 draft_ready 状态,运营仍可用现有按钮
    wx.showToast({ title: '已写入,请在行程管理打开该行程', icon: 'none' });
  },
});
return;
```

要点:
- **用 `redirectTo`(不是 navigateTo)**:导入页用完即弃,替换出栈 → 返回栈变 `trip-management → customer-trip-detail`,返回干净。
- **不要重复建草稿**:草稿在第 3 步已建好;`customer-trip-detail` 的 `onLoad` 自己会 `loadPreview` 读 `getOperatorTripPreview` 显示。
- **保留兜底**:`redirectTo` 失败时,维持现有 `draft_ready` 状态与按钮,不让运营卡死。
- 旧的 `openDraftCustomerPreviewFromImport()` 可暂时保留(兜底用),不必删。

---

## 3. 结果流程(验收时应是这样)

```
行程管理列表 → [导入] → customer-import
  → 粘贴标准 JSON → [预览](dry-run 校验)
  → [写入](确认)→ 自动建草稿
  → 自动进入 customer-trip-detail(该行程)
      → 状态头部 / 草稿预览 / [进入客户真实页面] / [发布] / [客户分享卡]
```

---

## 4. 约束 / 注意

- **091 不走这条**:091 不是通过导入新建的;且 091 的 `buildCustomerTripVisibleDraft` 会超时(见 `p4-d0-091-card-pipeline-state-analysis`)。本任务只服务普通行程导入,无需对 091 做任何处理。
- 不改 `importCustomerTripJSON` 的 action/写入语义;不发布(写入只到草稿)。
- 不动 `customer-trip-detail`(它已具备落地所需的全部能力)。

---

## 5. 验收标准

- [ ] 导入一份普通标准 JSON → 预览 → 写入 → **自动落在该行程的 `customer-trip-detail`**,可见状态头部 + 草稿预览。
- [ ] 该页可直接"进入客户真实页面 / 发布 / 生成分享卡"。
- [ ] `redirectTo` 失败时,运营仍停在导入页 `draft_ready` 状态(兜底不丢)。
- [ ] 未新增云函数调用;`node`/小程序编译无报错;只改 `customer-import.js`。
- [ ] 普通行程的导入→草稿→发布全程无需手动回列表再找。
