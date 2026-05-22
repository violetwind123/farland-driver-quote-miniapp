# Admin Web Auth Plan

## Purpose

The Web admin backend can be useful for customer directories, CSV/JSON import, dry-run preview, and audit review. It must not weaken the current Mini Program security model.

This plan must be settled before building a production `admin-web`.

## Non-Negotiable Rules

- CloudBase remains the source of truth.
- Web admin must not write directly to CloudBase collections.
- Web admin must call Cloud Functions for all reads and writes.
- Cloud Functions must enforce `operator` / `super_admin`.
- Frontend must not pass `openid`.
- Customer-facing and admin-facing APIs must not expose customer-unsafe fields to customer pages.
- Every import/apply/batch edit must write `audit_logs`.

## Identity Problem

Mini Program calls use:

```text
wx.cloud.callFunction
-> cloud.getWXContext().OPENID
-> users.openid
-> requireRole(["operator", "super_admin"])
```

Web admin calls do not automatically share the same Mini Program OPENID chain. Before the Web admin can use existing operator Cloud Functions, we must define how a Web session maps to an operator identity.

## Recommended Options

### Option A: Keep Admin Import In Mini Program First

Use the existing operator Mini Program identity and build the first JSON import page inside the Mini Program.

Pros:

- Reuses current `wx.cloud.callFunction` identity.
- Existing `requireRole` works without redesign.
- Lowest risk and fastest path to test `importCustomerTripJSON`.

Cons:

- Text editing and CSV handling are less comfortable than Web.
- Not a long-term full admin console.

Recommendation:

Use this for the first operational import UI if speed and security are the priority.

### Option B: Web Admin With CloudBase Web Auth

Build `admin-web` with CloudBase Web SDK and require an authenticated Web identity. Add a dedicated Web operator mapping layer.

Required backend changes:

- Add an operator auth resolver for Web calls.
- Store Web identity mapping in a dedicated collection, for example `admin_web_identities`.
- Map Web auth identity to a `users` row with `role = operator | super_admin`.
- Update admin Cloud Functions to support both Mini Program and Web auth contexts without accepting frontend-provided OPENID.

Recommended mapping shape:

```js
{
  web_uid: "",
  provider: "cloudbase_web",
  operator_user_id: "",
  operator_openid: "",
  role: "operator",
  status: "active",
  created_at: "",
  updated_at: ""
}
```

Pros:

- Better UX for CSV/JSON import and customer directory work.
- Can be deployed as a real internal admin console.

Cons:

- Requires auth setup and role-mapping work before business screens are safe.
- Existing `requireRole` cannot be assumed to work unchanged.

Recommendation:

Use this after the import workflow is proven.

### Option C: Enterprise WeChat / WeCom Auth

Use Enterprise WeChat identity for operators, then map the enterprise user to internal operator users.

Pros:

- Stronger internal identity management.
- Better fit for a larger operations team.

Cons:

- More setup.
- Requires clear enterprise account ownership and configuration.

Recommendation:

Defer unless the operations team already uses WeCom.

## Web Admin Architecture

```text
admin-web
-> CloudBase Web Auth
-> admin Cloud Functions
-> require web operator mapping
-> CloudBase collections
-> audit_logs
```

The Web admin should use dedicated admin APIs where possible:

- `importCustomerTripJSON`
- `adminListCustomers`
- `adminUpdateCustomerList`
- future `adminListTripImports`

It should not call customer-facing APIs directly for privileged reads.

## Current Repository Status

`admin-web/package.json` exists only as a placeholder scaffold. Dependencies have not been installed and no Web UI has been implemented.

Do not continue building `admin-web` until one auth option is chosen.

## Recommended Next Step

Build the first import UI inside the Mini Program operator area, because it reuses the current operator OPENID and `requireRole` path. Then revisit Web admin once the import workflow is validated.
