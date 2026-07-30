# 质量与错误处理

## 四个独立状态

- `data_status`: `complete`、`partial`或`blocked`
- `local_report_status`: `complete`、`failed`或`not_started`
- `feishu_publish_status`: `complete`、`skipped`、`blocked`或`failed`
- `delivery_status`: `complete`、`awaiting_user_decision`、`blocked`或`failed`

不得用一个“成功/失败”覆盖整次任务。

## 固定阶段

`报告预期确认 → 数据模式选择 → 交付目标选择 → 前提预检 → 小样本验证 → 正式取数 → 标准化 → 计算 → Excel生成 → 本地验收 → 条件式飞书写入 → 同身份回读 → 交付判定 → 运行回执`

每完成一阶段就写入运行记录。相同源文件哈希和配置可以复用，不重复下载或计算。

## 三次差异化恢复

1. 按原路径重试，排除临时失败。
2. 刷新必要状态后重试，例如重读页面、重选账号周期或重新解析文件。
3. 使用同一官方数据源的替代粒度，例如按天导出、逐场补数或分工作表写入。

三次仍失败：

- 保存已确认的原始文件和中间结果。
- 标明停止阶段、错误和已经尝试的动作。
- 只要求用户完成最小必要动作。
- 不猜数、不补0、不声称完成。

## 数据不足

- 只有罗盘明细：生成基础草稿，标记缺少自然流和千川周期指标。
- 缺少部分逐场详情：保留全部场次，网页字段留空并列出未匹配场次。
- 缺少千川周期输入：综合ROI留空。
- 账号或日期窗口不一致：停止合并。
- 字段结构变化：停止旧映射并输出差异。

## 飞书回退

用户原请求为飞书而飞书最终不可用时，保留已验收Excel备份，并设置：

```json
{
  "feishu_publish_status": "blocked",
  "delivery_target_requested": "feishu",
  "delivery_target_actual": "pending",
  "delivery_fallback_confirmed": false,
  "delivery_status": "awaiting_user_decision"
}
```

固定询问：

> 飞书表格当前无法完成，是否确认将本次最终交付回退为Excel文件？

只有用户明确确认后才调用`confirmExcelFallback`。未确认时不得把Excel备份描述为最终交付。

## 验收

- 原始行数等于输出行数。
- 原始字段名、顺序和值未改变。
- 扩展19列顺序正确。
- `live_room_id`无科学计数法和精度损失。
- 项目计算付费观看不得小于0。
- 比率和加权均值使用正确分子、分母。
- 无Excel公式错误。
- 汇总可回查到底表。
- 请求的最终交付完成回读。
