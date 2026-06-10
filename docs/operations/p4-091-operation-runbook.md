# P4 / 091 操作手册:卡住情形与安全推进规则

> 目的:把 091 / C3B / rollback-B 这段执行中已经发生的卡住点单独沉淀成操作手册。
> 后续继续 P4 时,先读本文件,再动生产数据。

## 0. 当前警戒状态

- 目标文档:`customer_trips/bf757c4c6a2054f800350a925147b32e`
- 行程号:`2026XBC091`
- 客户可见版本:仍应以 `published_snapshot` v24 为准。
- rollback-B 已获得用户批准,但执行中出现过多次工具/路径卡住。
- 最近一次 token 分支调用返回 `success:true`,但它使用了当前 `trip091CardSystem.buildTrip091CardSystem()` 生成 rollback draft。
- 关键问题:当前 builder 已经不是 pre-C3B 的 33 卡来源,因此这次 token 分支结果显示 `draft=36`,不是目标 `draft=33`。
- 独立 split readback 尚未完成时,不得宣称 rollback-B 完成。

## 1. 总原则

1. 生产写入、发布、上传、历史清理、权限变更必须拆开批准。
2. 每次只执行一个最小动作:部署代码、写数据、验证、发布,不能混在一起。
3. 云函数返回成功不等于任务完成;必须做独立 readback。
4. 任何 rollback 都必须先明确恢复源:
   - 历史恢复源 = pre-C3B backup 或当前 `published_snapshot` v24;
   - 不能默认调用当前 builder,因为 builder 代码会漂移。
5. 对 091 的 `published_snapshot` 改动需要单独批准;rollback-B 目标是不改客户可见版本。
6. 遇到工具卡住时,先记录原因和证据,再换路径;不要盲目重复执行。
7. 任何临时代码或 token 分支,部署后必须记录,后续要么删除,要么明确保留为 ops-only 入口。

## 2. 本段执行中已经出现的卡住情形

### 2.1 客户端整文档 `set` 被 512KB 限制拦截

表现:

```text
record size must be less than 512 KB
```

原因:

- 微信小程序客户端数据库写入有单条记录参数大小限制。
- 091 文档整份超过这个限制。

规则:

- 不要再用客户端 `db.collection(...).doc(id).set({ data: fullDoc })` 恢复整份 091。
- 大文档恢复必须走服务端云函数或 CloudBase 控制台/CLI 服务端能力。

### 2.2 客户端整文档读取超过 1MB

表现:

```text
database query result size exceed limit (1MB)
response size exceeded 1MB
```

原因:

- 091 文档含大 `draft_snapshot` / `published_snapshot`。

规则:

- 只读验证必须用 `.field()` 拆字段。
- 必要时分两次读:
  - 状态 + `published_snapshot`
  - 状态 + `draft_snapshot`
- 不要在 Console 里直接读整份 091 文档。

### 2.3 客户端 update 没有生效但没有直接报权限错误

表现:

- projected restore 脚本打印 BEFORE / AFTER 一样。
- `review_status` 仍是 `needs_review`, `draft` 仍是 36。
- post-validation 报失败。

原因判断:

- 客户端数据库写权限/更新权限不足或更新被云开发规则限制。

规则:

- 客户端数据库 update 不可作为生产恢复路径。
- 如果 BEFORE / AFTER 一样,直接判定"未写入",不要继续基于该路径重试。

### 2.4 `buildCustomerTripVisibleDraft` 默认调用 3 秒超时

表现:

```text
cloud.callFunction:fail errCode: -504003
Invoking task timed out after 3 seconds
```

原因:

- 091 构建路径会生成大快照并写 audit backup,超出当前 3 秒云函数 timeout。

规则:

- 不要把"重新 build 091"当成紧急 rollback 路径。
- 若必须用该函数服务端写,返回值必须只返回 summary,不能返回完整 snapshot。
- 更长期可把云函数 timeout 提高,但这是部署/配置变更,要单独批准。

### 2.5 DevTools CLI `deploy --remote-npm-install` 长时间无输出

表现:

- 停在 `upload cloud function ... preparing` 或类似阶段。
- 多轮轮询无新输出。

规则:

- 超过合理时间无输出,记录并停止该部署进程。
- 优先使用 `cloud functions inc-deploy --file index.js` 做小范围增量部署。
- 不要在部署卡住时并发启动第二个生产写入。

### 2.6 本地 `node_modules` 部署触发 `EISDIR`

表现:

```text
Error: EISDIR: illegal operation on a directory, read
```

原因:

- DevTools 打包本地函数目录的 `node_modules` 时读目录出错。

规则:

- 清掉函数目录下本地 `node_modules` / `package-lock.json`。
- 使用 `inc-deploy --file index.js` 只增量部署代码文件。
- `node_modules` / lockfile 已在 `.gitignore`,不要提交。

### 2.7 DevTools Console prompt 焦点和粘贴不稳定

表现:

- 代码没有进入 prompt。
- `set_value` 看似成功但没有执行。
- `type_text` 可能丢空格或破坏 JS 代码。

规则:

1. 先点击底部 `>` prompt。
2. 用 `pbcopy < script.js` + `Cmd+V` + `Enter`。
3. 必须看到 `*_START` 日志再认为脚本已提交。
4. 结果必须看到 `*_RESULT` 或 `*_FAILED`。

### 2.8 Claude / review blocking 不是"卡住"

表现:

- review 返回 blocking issue,但执行方想跳过。

规则:

- blocking review 是有效产出,不是卡住。
- 要么修 blocking,要么用户明确接受风险并覆盖规则。
- 不可把"review 不允许提交"理解成工具失败。

### 2.9 Heartbeat 空转

表现:

- 定时循环反复检查,但当前唯一下一步是生产写入批准。

规则:

- 若没有安全可推进项,应暂停 heartbeat。
- 恢复循环前必须有明确下一步。

### 2.10 D-1 司机验证假阳性

表现:

- invite 页面能看到司机,但 status 文案是 `车辆与司机已确认`,不是投影层输出的 `已分配司机`。

原因:

- 司机来自 v24 hardcoded snapshot 透传,不是 `transport_orders` 运行时投影。

规则:

- 判断投影是否生效,必须看字段来源和 status 文案。
- 不能把 v24 内嵌司机显示当作通用 draft 发布后的司机验证。

### 2.11 rollback-B 分支误用当前 builder

表现:

- token 分支返回 `success:true`。
- `review_status=approved`,但 summary 显示 `draft.day_destination_counts=[4,3,9,4,3,4,7,2]`,即 36 卡。

原因:

- `trip091CardSystem.buildTrip091CardSystem()` 当前已经生成 36 卡,不是 pre-C3B 33 卡。

规则:

- rollback-B 不能再调用当前 builder 作为历史恢复源。
- 正确口径:
  - `draft_snapshot = existing published_snapshot`(v24/33),或
  - `draft_snapshot = pre-C3B backup.draft_snapshot`。
- 同时设置:
  - `review_status='approved'`
  - `visibility_status='published'`
  - `warning_codes=[]`
  - `critical_warning_codes=[]`
- 不改 `published_snapshot`。

## 3. 091 / C3B 后续恢复的安全步骤

### Step A:只读确认当前状态

必须先做 split readback,不要整文档读取。

要确认:

- `trip_no === 2026XBC091`
- `external_trip_id === 2026XBC091`
- `published_version === 24`
- `published_snapshot.destination_cards.length === 33`
- `draft_snapshot.destination_cards.length` 当前到底是 36 还是 33
- `review_status` 当前到底是 `approved` 还是 `needs_review`

### Step B:如果继续 rollback-B

只允许做下面这种服务端写:

```js
draft_snapshot = trip.published_snapshot
review_status = 'approved'
visibility_status = 'published'
warning_codes = []
critical_warning_codes = []
```

禁止:

```js
draft_snapshot = trip091CardSystem.buildTrip091CardSystem(trip)
```

### Step C:写后独立验证

写后必须重新 split readback:

- draft top = 33
- published top = 33
- draft day counts = `[4,3,6,4,3,4,7,2]`
- published day counts = `[4,3,6,4,3,4,7,2]`
- review_status = `approved`
- visibility_status = `published`
- published_version = 24

只有这些全过,才可记录 rollback-B complete。

## 4. 临时代码治理

当前本地可能存在 rollback-B 临时代码:

```text
cloudfunctions/buildCustomerTripVisibleDraft/index.js
```

规则:

- 不要直接提交临时代码。
- 如果继续使用,先修成 `draft_snapshot = published_snapshot` 的安全版本。
- 如果不继续使用,应恢复/删除临时 rollback 分支。
- 云端若已 inc-deploy 临时代码,必须在最终收尾时重新部署干净版本或明确保留 ops-only 入口。

## 5. 每次生产操作记录模板

```text
Action:
Target doc:
Environment:
Approval text:
Backup path/hash:
Code version deployed:
Write method:
Expected before:
Expected after:
Readback result:
Customer-visible change:
Rollback path:
Operator:
Timestamp:
```

## 6. 快速决策表

| 情况 | 继续? | 处理 |
| --- | --- | --- |
| 只读验证字段超 1MB | 是 | 拆 field split readback |
| 客户端 update 无变化 | 否 | 改服务端写 |
| 云函数 3 秒超时 | 否 | 减小返回/调 timeout/换服务端恢复路径 |
| deploy remote npm 卡住 | 否 | 停止进程,用 inc-deploy |
| token 分支返回 success 但 summary 不符合目标 | 否 | 视为未完成,修逻辑后再写 |
| review 返回 blocking | 否 | 修 blocking 或用户明确覆盖 |
| 需要发布客户可见版本 | 否 | 单独批准 |

## 7. 可复制脚本与命令

### 7.1 split readback 只读脚本

用途:确认当前 091 状态。此脚本只读,可在 DevTools Console 执行。

```js
(async () => {
  const db = wx.cloud.database();
  const id = 'bf757c4c6a2054f800350a925147b32e';
  const expectedV24 = [4, 3, 6, 4, 3, 4, 7, 2];
  const counts = (snapshot) => {
    const days = Array.isArray(snapshot && snapshot.itinerary_days) ? snapshot.itinerary_days : [];
    return days.map((day) => (
      Array.isArray(day.destination_cards)
        ? day.destination_cards.length
        : (Array.isArray(day.timeline_items) ? day.timeline_items.length : 0)
    ));
  };
  const top = (snapshot) => (
    Array.isArray(snapshot && snapshot.destination_cards)
      ? snapshot.destination_cards.length
      : null
  );

  const statusRes = await db.collection('customer_trips').doc(id).field({
    trip_no: true,
    external_trip_id: true,
    visibility_status: true,
    review_status: true,
    published_version: true,
    source_type: true,
    warning_codes: true,
    updated_at: true,
  }).get();

  const draftRes = await db.collection('customer_trips').doc(id).field({
    draft_snapshot: true,
  }).get();

  const publishedRes = await db.collection('customer_trips').doc(id).field({
    published_snapshot: true,
  }).get();

  const data = {
    id,
    ...statusRes.data,
    draft_top: top(draftRes.data.draft_snapshot),
    published_top: top(publishedRes.data.published_snapshot),
    draft_counts: counts(draftRes.data.draft_snapshot),
    published_counts: counts(publishedRes.data.published_snapshot),
  };

  data.rollback_b_complete =
    data.trip_no === '2026XBC091' &&
    data.external_trip_id === '2026XBC091' &&
    data.visibility_status === 'published' &&
    data.review_status === 'approved' &&
    data.published_version === 24 &&
    data.draft_top === 33 &&
    data.published_top === 33 &&
    JSON.stringify(data.draft_counts) === JSON.stringify(expectedV24) &&
    JSON.stringify(data.published_counts) === JSON.stringify(expectedV24);

  console.log('C3B_ROLLBACKB_SPLIT_READBACK', JSON.stringify(data));
})().catch((err) => {
  console.error('C3B_ROLLBACKB_SPLIT_READBACK_FAILED', err && (err.stack || err.message || err));
});
```

### 7.2 DevTools Console 粘贴执行方式

推荐方式:

```bash
pbcopy < /tmp/script.js
osascript -e 'tell application "wechatwebdevtools" to activate' \
  -e 'delay 0.1' \
  -e 'tell application "System Events" to keystroke "v" using command down' \
  -e 'delay 0.2' \
  -e 'tell application "System Events" to key code 36'
```

注意:

- 执行前必须点击 Console 底部 `>` prompt。
- 如果看不到 `*_START`,说明脚本没有真正提交。
- 如果只看到 `Promise {<pending>}`,要等待 `*_RESULT` / `*_FAILED`。

### 7.3 云函数增量部署命令

只更新一个文件时优先用:

```bash
'/Applications/wechatwebdevtools.app/Contents/MacOS/cli' cloud functions inc-deploy \
  --project /Users/admin/farland-driver-quote-miniapp \
  --env cloud1-d3gmbz2bw024f051b \
  --name buildCustomerTripVisibleDraft \
  --file index.js
```

不要优先用:

```bash
cloud functions deploy --remote-npm-install
```

原因:本次出现过长时间无输出卡住。

### 7.4 安全 rollback-B 服务端逻辑要点

如果继续走 `buildCustomerTripVisibleDraft` 的 token 分支,核心逻辑必须是:

```js
if (useTrip091CardSystem && trip091RollbackBRequested) {
  const rollbackSnapshot = trip.published_snapshot;
  const rollbackSummary = summarizeSnapshot(rollbackSnapshot);
  const expectedCounts = [4, 3, 6, 4, 3, 4, 7, 2];

  if (
    rollbackSummary.top_destination_cards !== 33 ||
    JSON.stringify(rollbackSummary.day_destination_counts) !== JSON.stringify(expectedCounts)
  ) {
    return {
      success: false,
      code: 409,
      error_code: 'TRIP_091_ROLLBACK_B_PUBLISHED_SNAPSHOT_INVALID',
      message: 'published_snapshot 不是 v24/33 卡,已阻止回退',
    };
  }

  await db.collection('customer_trips').doc(trip._id).update({
    data: {
      draft_snapshot: rollbackSnapshot,
      review_status: 'approved',
      visibility_status: 'published',
      warning_codes: [],
      critical_warning_codes: [],
      updated_by: auth.user._id,
      updated_by_openid: auth.openid,
      updated_at: now,
    },
  });
}
```

明确禁止:

```js
const rollbackSnapshot = trip091CardSystem.buildTrip091CardSystem(trip);
```

## 8. Claude / Claude Code 复核报告模板

发给 Claude 的报告必须 ASCII/英文,便于复制和 diff。模板:

```text
Review request: P4 / 091 rollback-B operation

Scope:
- Target doc: customer_trips/bf757c4c6a2054f800350a925147b32e
- Trip: 2026XBC091
- Customer-visible published_snapshot must remain unchanged at v24.

What happened:
- Previous client set/update attempts failed or no-op due size/permission limits.
- Incremental deploy succeeded for buildCustomerTripVisibleDraft/index.js.
- A token-gated rollback branch was invoked.
- The branch returned success but used current trip091CardSystem builder, producing draft=36, not target draft=33.

Proposed correction:
- Do not use trip091CardSystem builder for rollback-B.
- Use existing published_snapshot as rollback source:
  draft_snapshot = published_snapshot
  review_status = approved
  visibility_status = published
  warning_codes = []
  critical_warning_codes = []
- Then split-readback verify draft/published both 33 and counts [4,3,6,4,3,4,7,2].

Please return Markdown with:
## Review verdict
## Blocking issues
## Non-blocking suggestions
## Commit/deploy readiness
## Required verification
```

## 9. 提交与部署规则

### 9.1 什么可以提交

可以提交:

- 文档 runbook。
- 经 review 通过的长期代码修复。
- 非临时、默认无害的 ops-only gate,但必须写明保留原因。

不应提交:

- 明知有逻辑错误的 rollback-B 临时代码。
- 只为一次恢复而写、且没有长期安全意义的 token 分支。
- 包含 token 的无审查临时脚本。

### 9.2 什么必须先清理

提交或继续前检查:

```bash
git status --short
git diff -- cloudfunctions/buildCustomerTripVisibleDraft/index.js
```

如果看到本地 `index.js` 仍含:

```js
trip091CardSystem.buildTrip091CardSystem(trip)
```

并且它位于 rollback-B 分支内,必须修掉或删除该分支。

## 10. 推荐收尾顺序

1. 暂停所有 heartbeat/自动循环。
2. 写完并提交本 runbook。
3. 做 split readback,确认当前真实状态。
4. 发 Claude review,确认纠正方案。
5. 修正 rollback-B 分支为 `draft_snapshot = published_snapshot`。
6. `node --check` + `git diff --check`。
7. `inc-deploy --file index.js`。
8. 重新调用 token 分支一次。
9. split readback 验证 `rollback_b_complete=true`。
10. 决定是否保留或清理 ops-only 分支。
11. 记录操作结果到 P4 文档。

