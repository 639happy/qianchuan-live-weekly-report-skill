---
name: qianchuan-live-weekly-report
description: 为Codex用户生成和验收抖音电商千川直播周报，支持用户提供官方数据文件或通过已登录Chrome自动取数，并交付Excel或飞书电子表格。用于用户要求整理罗盘或千川周数据、计算直播漏斗、自然流撬动系数、千次观看支付、生成直播经营周报或诊断周度经营表现时。
---

# 千川直播周报

为一个直播间账号生成一周的可回查经营数据，不把数据不足的草稿冒充完整周报。

## 固定原则

- 一次只问一个会改变结果的问题。
- 先确认报告完整度，再确认数据获取模式，最后确认交付目标。
- 文件模式和全自动模式都必须询问最终交付是Excel还是飞书电子表格。
- 每次都先生成并验收本地Excel底座。
- 用户要求飞书时，必须完成飞书写入和同一用户身份回读。
- 飞书失败时不得静默回退；等待用户明确确认后才能把Excel作为最终交付。
- 不绕过登录、验证码、二维码、滑块、风控和平台权限。
- 不读取或要求用户提供密码、Cookie、token、验证码或浏览器会话。
- 不混合账号、周期、退款成熟度和罗盘/千川真相源。
- 缺失数据保留空值并标明状态，不猜测、不补0。

## 第一次运行

完整读取[首次引导](references/onboarding.md)，按顺序收集答案并由Codex写入用户工作区的`report-config.json`。不要让用户手写JSON。

正式取数前展示运行确认卡：

- 账号名称和抖音号
- 周期与时区
- 报告完整度
- 数据获取模式
- 用户请求的交付目标
- 已满足与未满足的前提
- 能生成和不能生成的指标
- 退款成熟度和数据抓取时间

用户确认后再继续。

## 按模式读取资料

- 始终读取[指标、字段与真相源](references/metrics-and-sources.md)和[质量与错误处理](references/quality-and-errors.md)。
- `data_acquisition_mode=files`时读取[文件模式数据清单](references/data-checklist.md)，先给清单和补数模板，再等待文件。
- `data_acquisition_mode=automated`时读取[全自动Chrome模式](references/automated-mode.md)，逐项预检并先跑2—3场。
- `delivery_target_requested=feishu`时读取[飞书交付](references/feishu-delivery.md)，检查CLI、用户身份、权限和回读。
- 用户选择Excel时不要读取飞书流程，也不要要求安装`lark-cli`。

## 数据处理

1. 校验`report-config.json`。
2. 校验罗盘账号、日期、字段结构和行数。
3. 保留原始列顺序和值。
4. 匹配逐场详情；稳定ID优先，受保护的开始时间匹配次之。
5. 校验千川数据与同账号、同完整周期一致。
6. 使用脚本计算单场和分组指标。
7. 生成`场次核心明细`、`周报汇总`、`数据底表`和`数据字典`。
8. 回读xlsx并检查工作表、原始值、行列数、ID文本和公式错误。

先加载Codex工作区Node与电子表格依赖。依赖不可用时要求Codex刷新工作区运行环境，不要求非技术用户执行`npm install`。

## 交付判定

- Excel请求：本地xlsx回读通过后，`delivery_status=complete`。
- 飞书请求：本地xlsx只是备份；同身份飞书回读通过后，`delivery_status=complete`。
- 飞书最终失败：设置`delivery_status=awaiting_user_decision`并提出固定回退问题。
- 用户确认回退：设置`delivery_target_actual=excel`和`delivery_fallback_confirmed=true`。
- 用户拒绝或未确认：保留备份，但不得声明最终交付完成。

最终回执必须列出：

- 数据完整度
- Excel状态
- 飞书状态（如适用）
- 用户请求与实际交付目标
- 未匹配场次和待核验指标
- 公式与结构验收结果
- 数据抓取时间和退款成熟度
