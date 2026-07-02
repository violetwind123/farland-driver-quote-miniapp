# P4-13 · Simplify Operator Trip Publish Page

## Product Decision

`customer-trip-detail` is first a focused operator publish workflow page, not a full trip debug console.

The primary visible workflow is:

```text
1. 更新完整行程 JSON
2. 生成客户可见草稿
3. 预览客户页面
4. 确认发布
5. 生成 / 转发客户分享卡
```

Do not add single-day JSON update.

Do not add hotel-only JSON update.

Copy path remains a fallback / internal debugging action. Customer-facing delivery should use WeChat share cards.

## Page Structure

Primary page:

- Trip status header
- Five publish workflow cards

Secondary folded areas:

- 草稿内容审阅
- 每日管理 / 评价卡
- 高级操作

Advanced operations may contain operational metadata such as customer / family ownership, trip id copy, and technical status. These should not compete with the publish workflow.

## Implementation Notes

- Full-trip JSON overwrite moved from `高级操作` into workflow step 1.
- Ownership editor moved out of the first viewport into `高级操作`.
- Existing draft review and daily management stay folded.
- No backend schema or Cloud Function behavior changed.
- No single-day or hotel-specific update UI was added.
