# 飞书表格交付

仅当用户明确选择“飞书表格”作为最终交付时读取本页。选择 Excel 时，不检查也不安装 `lark-cli`。

## 交付完成的定义

同时满足以下条件，才可把飞书交付标记为 `complete`：

1. 本地周报已通过数据完整性和公式校验。
2. 使用用户选择的飞书用户身份完成创建和写入。
3. 使用同一用户身份回读表格。
4. 回读的工作表名称、关键表头、总场次数和校验值与本地周报一致。

“创建成功”或“写入命令返回成功”都不等于交付完成。

## 安装前说明

飞书交付需要：

- 可执行终端命令的 Codex 环境。
- 可访问飞书开放平台的网络。
- 一个可用的飞书账号。
- 用户有权安装或配置飞书自建应用，并为应用开通表格相关权限。
- 用户愿意在浏览器中完成一次设备授权。

官方 CLI 的公开安装方式：

```bash
npx @larksuite/cli@latest install
```

安装来源：

- `https://www.npmjs.com/package/@larksuite/cli`
- `https://github.com/larksuite/cli`

安装后先核验：

```bash
lark-cli --version
lark-cli profile list
```

如果命令仍不可用，不得自动改成交付 Excel；应继续排查安装，或进入“显式回退”流程。

## 初始化与身份确认

首次使用：

```bash
lark-cli config init --new
```

该命令返回的 `verification_url`、`verification_uri_complete` 或 `console_url` 必须原样转发给用户，不得编码、改写或重新拼接。

随后检查：

```bash
lark-cli profile list
lark-cli config show --profile "<用户选择的profile>"
```

默认必须使用 `--as user`。不得因为权限不足、资源不可见或写入失败而自动切换为 bot。只有用户明确要求由应用身份创建资源时，才允许使用 `--as bot`，并需要说明资源归属差异。

## 最小权限授权

用户身份同时需要：

1. 飞书开发者后台已为应用开通所需 scope。
2. 用户通过 `auth login` 授权这些 scope。

遇到缺少权限时，读取错误中的 `permission_violations`、`hint` 和 `console_url`，按缺失项最小化补权。Agent 发起授权时使用非阻塞流程：

```bash
lark-cli auth login --scope "<错误提示中的缺失scope>" --no-wait --json
```

把返回的授权 URL 原样交给用户，并暂停当前步骤。用户确认授权完成后再继续：

```bash
lark-cli auth login --device-code "<原命令返回的device_code>"
```

不得把 app secret、access token 或 refresh token写入日志、报告或仓库。

## 创建、写入与回读

所有命令均显式指定用户选择的 profile 和 `--as user`。以下占位符不得原样执行。

本地Excel回读验收通过后，将其导入为飞书表格。这样可以保留四张工作表，避免在云端重复拼装：

```bash
lark-cli sheets +workbook-import \
  --file "<本地已验收的xlsx路径>" \
  --name "<报告标题>" \
  --profile "<用户选择的profile>" \
  --as user
```

获取表格和工作表信息：

```bash
lark-cli sheets +workbook-info \
  --url "<创建命令返回的表格URL>" \
  --profile "<用户选择的profile>" \
  --as user
```

写入完成后，必须使用同一用户身份回读：

```bash
lark-cli sheets +cells-get \
  --url "<表格URL>" \
  --sheet-id "<sheet_id>" \
  --range "<覆盖表头和校验单元格的范围>" \
  --profile "<用户选择的profile>" \
  --as user
```

回读至少核对：

- 工作表名称和数量。
- 主表表头。
- 场次总数。
- 周期起止日期。
- 支付金额、消耗、ROI 等核心校验值。
- 无 `#REF!`、`#VALUE!`、`#DIV/0!` 等公式错误。

## 失败与显式回退

以下情况都先排查，不得自动回退：

- `lark-cli` 未安装或版本不可用。
- 配置尚未初始化。
- 用户 profile 未选择。
- 用户授权未完成。
- scope 或目标文件夹权限不足。
- 写入成功但回读失败。
- 回读数据与本地结果不一致。

无法继续时，把状态标记为 `awaiting_user_decision`，保留本地已通过校验的 Excel，然后逐字询问：

> 飞书表格当前无法完成，是否确认将本次最终交付回退为Excel文件？

只有用户明确确认后，才可把 `delivery_target_actual` 改为 `excel`。用户未回复、拒绝或要求继续排查时，交付状态都不能标记为完成。
