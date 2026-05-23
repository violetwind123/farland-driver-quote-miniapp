# P2 Device QA Record

## 1. Repository Status

Latest commit: `9e88ac2 Polish customer quote amounts and operator selection buttons`

Local status: only `docs/design-assets/` remains untracked.

Configuration status:

- `app.json`: unchanged
- `tabBar`: unchanged
- `project.config.json`: unchanged

## 2. Local Validation Results

- `node --check cloudfunctions/getCustomerHome/index.js`: pass
- `node --check cloudfunctions/getCustomerTransportQuotes/index.js`: pass
- `node --check miniprogram/pages/operator/request-detail/request-detail.js`: pass
- `node --check miniprogram/pages/customer/transfer-detail/transfer-detail.js`: pass
- `git diff --check`: pass
- `grep wx.cloud.database in miniprogram`: no matches
- `grep OPENID in miniprogram`: no matches
- `grep driver_quotes in miniprogram/pages/customer`: no matches
- `image size check`: no `miniprogram` image asset over 200KB

## 3. Manual Deployment Required

Cloud functions that must be redeployed manually through WeChat DevTools / CloudBase console:

- `getCustomerHome`
- `getCustomerTransportQuotes`

Reason: both were modified in commit `9e88ac2` to format customer-facing quote amounts to two decimal places.

Mini Program frontend must be previewed / uploaded again because this file changed:

- `miniprogram/pages/operator/request-detail/request-detail.wxss`

## 4. Manual Device QA Checklist

### Customer Quote Amount Formatting

Test pages:

- `pages/customer/home/home`
- `pages/customer/transfer-detail/transfer-detail`

Verify:

- `driver_quote_amount` shows two decimals
- `farland_service_fee_amount` shows two decimals
- `client_total` shows two decimals
- `client_visible_total` shows two decimals
- No `NaN`
- No blank totals

Example expected display:

- `220.00`
- `22.00`
- `242.00`

### Temporary Invite View

Test:

1. Operator generates customer invite.
2. Customer opens invite card.
3. Shared trip / quote is visible.
4. Customer can view quote detail.
5. Customer has not saved yet.

Expected:

- Temporary invite view works.
- Customer can see customer-safe quote/trip content.
- No internal data is exposed.

### Save-Before-Select Flow

Test:

1. Customer opens quote detail from invite.
2. Customer tries to select quote before saving.
3. Page prompts customer to save to Farland trip first.
4. Customer taps `保存到我的 Farland 行程`.
5. Customer enters display name.
6. Save succeeds.
7. Customer selects quote after saving.

Expected:

- Temporary viewer cannot persistently select quote before saving.
- Saved customer can select quote.
- `selectCustomerQuote` does not perform identity binding.

### Operator Request Detail

Test page:

- `pages/operator/request-detail/request-detail`

Verify:

- Quote cards display normally.
- `选择司机 / 确认司机` button is more prominent.
- Review / draft / publish logic still works.
- Customer invite area still works.
- Driver quote flow is not broken.

### Regression Flows

Verify:

- driver quick quote token entry
- operator request hall
- operator request detail
- customer invite generation
- customer transfer detail
- customer home
- hotel request page

## 5. Security QA

Confirm:

- No frontend `wx.cloud.database()`
- No frontend `OPENID` trust
- Customer pages do not read `driver_quotes`
- Customer pages do not expose `internal_note`
- Customer pages do not expose `driver_cost`
- Customer pages do not expose `margin`

## Final QA Result

Cloud functions redeployed:

- getCustomerHome: yes / no
- getCustomerTransportQuotes: yes / no

Mini Program preview/upload completed:

- yes / no

Customer quote amount formatting:

- pass / fail

Temporary invite view:

- pass / fail

Save-before-select flow:

- pass / fail

Operator selection button:

- pass / fail

Regression flows:

- pass / fail

Issues found:

- none / list issues

Next recommended step:

- no new feature until QA passes
