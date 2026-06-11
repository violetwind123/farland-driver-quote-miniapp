# P4-D4 · Trip Ownership And Travel Party Management

> Executor: Codex. This task is self-contained and should be reviewed before implementation.
> Goal: let operators assign the intended customer / family / travel party for a trip without creating customer access.

---

## 0. Product Decision

`customer_trips` should describe who the trip belongs to operationally.
`customer_trip_access` should describe which WeChat users actively saved / bound the trip.

These are separate concepts:

```text
trip ownership / intended customers = operator-managed trip metadata
customer_trip_access = customer-initiated save / binding state
```

Do not use access rows as the source of truth for trip ownership.
Do not create access rows when assigning a customer to a trip.

---

## 1. Current Repository Reality

Some ownership fields already exist or are partially supported:

```text
customer_trips.primary_customer_user_id
customer_trips.customer_user_id
customer_trips.customer_user_ids
customer_trips.customer_profile_id
customer_trips.customer
customer_trips.customer_display_name
customer_trips.customer_name
customer_trips.customer_phone
customer_trips.customer_wechat_id
customer_trips.party_name
```

Existing behavior:

- `importCustomerTripJSON` can merge ownership when an import is explicitly associated with a customer / request.
- `listOperatorTrips` already reads `party_name` and `primary_customer_name`.
- `createCustomerTripInvite` records intended-customer metadata on the invite, but no longer writes `customer_trip_access`.
- `searchCustomersForOperator` can search customers and already looks at trip ownership fields.

Missing behavior:

- No operator-facing editor exists on `customer-trip-detail`.
- No dedicated cloud function exists for updating trip ownership safely.
- No clear validation / audit contract exists for updating ownership.

---

## 2. Scope

Implement an operator-only ownership editor on the single trip management page.

Allowed files:

```text
cloudfunctions/updateOperatorTripOwnership/index.js
cloudfunctions/updateOperatorTripOwnership/package.json
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.js
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.wxml
miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.wxss
docs/product/p4-master-roadmap.md
```

Do not add a new page unless the existing detail page becomes unreasonably crowded.
Expected: no `app.json` change for MVP, because this should be an inline section on the existing detail page.

Do not modify:

```text
customer_trip_access
saveCustomerTripToProfile
getCustomerTripByInvite
getCustomerHome
publishCustomerTrip
payment
map tracking
hotel request form
content_entities
091 publish / rollback code paths
```

---

## 3. Data Contract

The operator editor should write only trip-level ownership metadata.

Canonical fields:

```js
{
  primary_customer_user_id: string,
  customer_user_id: string,              // compatibility alias for primary_customer_user_id
  customer_user_ids: string[],
  customer_profile_id: string,
  party_name: string,
  traveler_names: string[],
  customer: {
    customer_profile_id: string,
    display_name: string,
    name: string
  },
  customer_display_name: string,
  customer_name: string,
  customer_phone: string,
  customer_wechat_id: string,
  ownership_updated_at: string,
  ownership_updated_by: string
}
```

Rules:

- `primary_customer_user_id` is optional, but if present it must reference an active `users` document with `role: "customer"`.
- `customer_user_ids` must be unique and may include additional family members / assistants.
- `traveler_names` are free-text traveler names. They do not imply app access.
- `traveler_names` should be trimmed, de-duplicated, capped at 20 names, and each name capped at 30 characters.
- `party_name` is the customer-facing family / party label used in operator lists.
- If `primary_customer_user_id` is provided, mirror it into `customer_user_id` for backwards compatibility.
- `customer_profile_id` should be derived from the selected primary customer user server-side, not trusted from frontend input.
- `customer` must be merged into the existing object by safe keys only. Do not wholesale replace the existing `customer` object.
- The `customer` child object must not contain `phone` or `wechat_id`, because `buildCustomerTripVisibleDraft` copies `trip.customer` into customer-visible snapshots.
- If phone / WeChat values are needed for operator metadata, write them only to top-level `customer_phone` / `customer_wechat_id`.
- Update semantics: omitted fields mean no change; explicit empty string / empty array means clear that field.
- Do not store OPENID in `customer_trips`.
- Do not write `customer_trip_access`.

---

## 4. Cloud Function

Create:

```text
cloudfunctions/updateOperatorTripOwnership
```

Input:

```js
{
  trip_id: string,
  primary_customer_user_id: string,
  customer_user_ids: string[],
  party_name: string,
  traveler_names: string[]
}
```

Permission:

```text
operator / super_admin only
```

Behavior:

1. Verify operator role.
2. Resolve `trip_id` against `customer_trips` using the same trip id aliases used by other operator functions:
   - document `_id`
   - `trip_id`
   - `external_trip_id`
   - `trip_no`
3. Validate every non-empty customer user id:
   - exists in `users`
   - `role === "customer"`
   - `status === "active"`
4. Build a trip ownership patch using the canonical fields in section 3.
5. Update only `customer_trips`.
6. Add an `audit_logs` row.
7. Return the updated ownership projection.

Return:

```js
{
  success: true,
  ownership: {
    primary_customer_user_id,
    customer_user_id,
    customer_user_ids,
    customer_profile_id,
    party_name,
    traveler_names,
    customer,
    customer_display_name,
    customer_name,
    customer_phone,
    customer_wechat_id
  }
}
```

Failure codes:

```text
FORBIDDEN
TRIP_NOT_FOUND
CUSTOMER_NOT_FOUND
INVALID_CUSTOMER_ROLE
UPDATE_TRIP_OWNERSHIP_FAILED
```

---

## 5. Operator UI

Add a compact section to `customer-trip-detail`:

```text
客户 / 家庭归属
家庭名称
主要客户
随行成员 / 旅客
```

Suggested display:

```text
客户 / 家庭归属
刘女士家庭
主要客户: 刘女士
旅客: Tina / Devon / Julia

[编辑归属]
```

Edit mode:

```text
家庭名称: [刘女士家庭]
主要客户: [搜索/选择客户]
旅客姓名: [Tina, Devon, Julia]

[保存归属] [取消]
```

Implementation notes:

- Reuse `searchCustomersForOperator` for customer lookup if practical.
- A simple text input for `party_name` and comma/newline-separated `traveler_names` is enough for MVP.
- The editor must clearly state that assigning a customer does not save the trip to that customer's app.
- After save, refresh the current trip preview and the trip-management list will naturally show the updated party/customer fields on next load.

---

## 6. Safety Rules

Must not:

- create, update, or delete `customer_trip_access`
- create a customer invite
- mark an invite as viewed
- save the trip to a customer profile
- publish or rebuild trip snapshots
- mutate `published_snapshot` or `draft_snapshot`
- expose OPENID in frontend data

Must:

- use operator-only cloud function permission checks
- validate customer user ids server-side
- preserve existing trip status / review / visibility fields
- audit the before/after ownership fields

---

## 7. Acceptance Criteria

Operator:

- Can open a trip detail page and see current trip ownership.
- Can set / edit `party_name`.
- Can assign a primary customer from existing active customer users.
- Can enter traveler names.
- Save updates `customer_trips` only.
- Trip management list shows updated party / customer name after refresh.

Data boundary:

- No `customer_trip_access` row is created or changed.
- No invite is created.
- No snapshot is rebuilt or published.
- No OPENID is returned to the frontend.

Regression:

- Existing import / publish / share-link workflow still works.
- Existing trip detail preview and overwrite panel still work.
- Existing review card actions still work.
- 091 publish state is untouched.

---

## 8. Validation

Run:

```bash
node --check cloudfunctions/updateOperatorTripOwnership/index.js
node --check miniprogram/pages/operator/customer-trip-detail/customer-trip-detail.js
git diff --check
git status --short
```

Security checks:

```bash
grep -R "customer_trip_access" cloudfunctions/updateOperatorTripOwnership miniprogram/pages/operator/customer-trip-detail || true
grep -R "OPENID" miniprogram/pages/operator/customer-trip-detail || true
```

Expected:

```text
No frontend database access.
No frontend OPENID trust.
No writes to customer_trip_access.
docs/design-assets/ remains untracked unless separately requested.
```

Manual QA:

```text
1. Open Operator Dashboard.
2. Open 行程管理.
3. Open one non-091 trip detail.
4. Edit ownership.
5. Save.
6. Confirm trip detail shows updated ownership.
7. Return to 行程管理 and confirm list party/customer label updates.
8. Confirm active saved user count does not change.
```

---

## 9. Claude / Review Questions Before Implementation

Ask review to confirm:

1. Is `updateOperatorTripOwnership` the right boundary, rather than extending import or invite functions?
2. Should `customer_user_id` remain as a compatibility alias, or should new code only write `primary_customer_user_id`?
3. Is storing `customer_phone` / `customer_wechat_id` on `customer_trips` still acceptable, given this is operator-only metadata?
4. Should traveler names be purely free text for MVP, or linked to `users` when possible?

---

## 10. Copy-Paste Review Request

```markdown
# Claude Review Request: P4-D4 Trip Ownership Spec

Please review the proposed docs-only task spec:

- docs/product/p4-d4-trip-ownership-task.md
- docs/product/p4-master-roadmap.md

Context:

- P4 C3B / 091 publishing remains gated and is not part of this change.
- This is a safe parallel D-track planning step only.
- Goal: define operator-managed trip ownership / travel party metadata on customer_trips, strictly separate from customer_trip_access.
- No implementation code is included yet.

Key proposed boundary:

- Add future cloud function updateOperatorTripOwnership.
- It updates customer_trips ownership metadata only.
- It must not write customer_trip_access, create invites, rebuild snapshots, publish trips, or expose OPENID to frontend.
- UI would live inline in customer-trip-detail as a compact ownership editor.
- MVP should not require app.json changes.

Please return Markdown with:

## Review verdict

## Blocking issues

## Non-blocking suggestions

## Commit readiness

## Recommended commit scope/message

Specific questions:

1. Is updateOperatorTripOwnership the right boundary, rather than extending import or invite functions?
2. Should customer_user_id remain as a compatibility alias, or should new code only write primary_customer_user_id?
3. Is storing customer_phone / customer_wechat_id on customer_trips acceptable as operator-only metadata, or should D4 avoid adding/updating these fields?
4. Should traveler_names be free text for MVP, or linked to users when possible?
```
