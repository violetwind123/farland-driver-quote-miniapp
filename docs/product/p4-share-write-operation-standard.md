# P4 · 分享写入操作标准

## 1. 适用范围

本标准适用于所有客户可打开、可转发的 Mini Program 分享入口:

- 客户行程分享卡
- 每日评价卡
- 后续新增的客户侧服务卡片

核心原则:

```text
先持久化 invite / share record
再使用已存 share_path 做微信转发
打开 / 转发 / 预览本身不创建 customer_trip_access
```

## 2. 标准流程

### 2.1 运营生成分享对象

运营端按钮不得临时拼接未落库的客户路径。必须先调用对应 Cloud Function:

| 分享对象 | 写入集合 | Cloud Function | 主锚点 |
| --- | --- | --- | --- |
| 客户行程分享卡 | `customer_trip_invites` | `createCustomerTripInvite` | `trip_id` |
| 每日评价卡 | `service_review_invites` | `createRideReviewInvite` | `trip_id + day_no` |

Cloud Function 必须:

- 校验 operator / super_admin 权限。
- 校验目标对象可分享,例如行程已发布、Day 存在于 `published_snapshot`。
- 创建或复用一条有效 invite。
- 返回持久化后的 `share_path`。
- 写 audit log。
- 不创建 `customer_trip_access`。

### 2.2 运营转发

前端只在 invite 已存在且有 `share_path` 后展示微信转发入口:

```text
生成 / 复用 invite -> 得到 share_path -> open-type="share"
```

复制路径可以保留为兜底,但不是主分享路径。

### 2.3 客户打开 / 转发

客户打开分享路径时:

- 只根据 invite 读取客户安全上下文。
- 可以记录必要的打开事件,例如评价卡的 `service_review_events`。
- 不创建 `customer_trip_access`。
- 不把打开行为等同于保存到我的 Farland 行程。

客户页面如允许继续转发,必须继续使用当前 invite 的 `share_path` 参数,不得生成新的未持久化路径。

## 3. 客户行程分享卡规则

客户行程分享卡使用 `customer_trip_invites`。

允许:

- 群转发。
- 多个家庭成员临时打开同一张卡。
- 用户主动点击「保存到我的 Farland 行程」后,由 `saveCustomerTripToProfile` 创建 `customer_trip_access`。

禁止:

- 生成分享卡时预写 `customer_trip_access`。
- 打开分享卡时自动保存。
- 运营预览时创建 invite / access / viewed 标记。

## 4. 每日评价卡规则

每日评价卡使用 `service_review_invites`。

每个 Day 独立:

```text
Day 1 -> 独立 invite / share_path
Day 2 -> 独立 invite / share_path
Day 3 -> 独立 invite / share_path
```

允许:

- 微信群转发。
- 同一家庭群多位成员打开。
- 每个 OPENID 对同一 `trip_id + day_no` 提交一次。
- 客户评价页继续转发同一张评价卡。

禁止:

- 打开评价卡创建 `customer_trip_access`。
- 提交评价创建 `customer_trip_access`。
- 给未发布 Day 生成评价卡。
- 用草稿 Day 生成客户可打开的评价卡。

## 5. 前端交互标准

运营端:

- 未生成 invite 时显示「生成评价卡」或「准备分享卡」。
- 已有 invite 时显示「转发...」和「复制路径」。
- `open-type="share"` 必须使用已存 `share_path`。
- 复制路径按钮仅复制 Cloud Function 返回或列表函数返回的 `share_path`。

客户端:

- 可打开页面可以提供「转发...」按钮。
- `onShareAppMessage` 必须复用当前 invite 参数。
- 不在客户前端创建任何绑定关系。

## 6. 审核清单

每次新增分享类功能,review 时必须确认:

- [ ] 是否有持久化 invite / share record。
- [ ] 是否由 Cloud Function 负责创建 / 复用。
- [ ] 是否有 operator / super_admin 权限校验(运营写入口)。
- [ ] 是否只分享已发布客户可见内容。
- [ ] 前端是否只使用已返回的 `share_path`。
- [ ] 打开 / 转发是否不创建 `customer_trip_access`。
- [ ] 复制路径是否只是兜底。
- [ ] 客户页面继续转发时是否复用同一 invite。
