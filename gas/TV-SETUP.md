# 电视投屏：GAS 手动启用

GitHub 页面：`https://blackblancakeep62-crypto.github.io/q4-operations-dashboard/tv/`。

## 需要您执行（未自动修改 GAS）

1. 在**原 Apps Script 项目**内更新 `Code.gs` 为本仓库 `gas/Code.gs`，新增 `Television.gs` 并复制 `gas/Television.gs`。保留已有 `Scheduler.gs`、所有脚本属性及原来的两个每日触发器。
2. 点击「部署 → 管理部署 → 原 Web App 的编辑 → 版本：新版本 → 部署」。保持原执行身份、访问权限和 `/exec` 地址；无需创建新的共享密钥或 PAT，也不用更改 GitHub Secrets。已有授权若要求补充同一账号的表格/外部请求权限，完成授权。
3. 手动运行 `testTvDispatch()`。在 GitHub Actions 查看对应 `tv_test`：同步步骤必须输出 `TV synchronized=true`，build、deploy、verify-tv-test 三个任务全部成功。网页应显示新的最近成功同步时间，Q4 数据与「电视投屏数据」对应；黑五网一空缺仍显示「进度待更新」。失败先检查部署是否选择了新版本，不要安装触发器。
4. 测试成功后运行 `installTvHourlyTimer()`。检查触发器列表：新增一个 `q4TvHourlyTimer`（每小时），原 `q4MorningTimer`、`q4EveningTimer` 保持存在。重复安装只替换电视触发器。
5. 下次小时任务后核对 Actions 的 `tv_timer` 成功、`data-state` 仅更新 `tv-snapshot-v1.json`，电视网页在最多约 3 分钟后自动显示新快照。确认原 AM/PM 任务仍按原计划成功。

停用电视小时同步：运行 `removeTvHourlyTimer()`，不会影响每日任务。

## 实现及边界

- GAS 仅读取指定文件/工作表 `A3:F7` 和 `A12:C16`，共 45 个单元格；`getValues()` 返回公式结果。请求须通过原共享密钥校验；不读取 ERP，不修改原表。
- B/C/D/E/F 分别直映去年同期、销售准/进阶、利润准/进阶。唯一展示计算是准目标与 B 列的百分点差。文字、错误、空值转换为 null；真实数值 0 保留为 0.00%。
- 首次发布的电视种子快照来自 2026-11-18 对指定子表的只读核对，记录实际读取时间；不会在构建时伪造新同步时间。启用 GAS 后由独立快照接替。超过 90 分钟会提示延迟。
- `tv_timer`/`tv_test` 复用 `pages.yml`，不执行 `sync:pages`，只写电视文件；每日任务只更新原快照，保留已存在的电视文件。构建同时携带两套最新快照。
- 同一工作流级 `q4-pages-sync` 并发锁覆盖恢复状态、写入、构建及部署，运行中的发布不被取消。开始时检出最新 main，避免旧排队代码回退部署。GitHub 同一并发组只保留一个待运行任务；异常积压时新的请求可能替换待运行请求，需通过 Actions 确认或重跑被取消的每日任务；正常构建远短于 1 小时。
- 网页每 180 秒无缓存拉取，失败保留当前数据，立即显示延迟；后台每 30 秒检查最近成功时间是否超过 90 分钟。切回页面或网络恢复也检查新快照。无须用户操作或整页重载。
- GAS 调度和 GitHub 排队可能有偏差，不保证整点或严格 60 分钟。云端执行不依赖电脑开机；未添加服务或付费订阅。
- 同步失败会发布失败状态及旧快照，成功时间不变；如果整个工作流/发布失败，现网旧快照超过 90 分钟后显示延迟。

## 开发验收

`npm test`、`npm run typecheck`、`npm run build:pages`。

浏览器验收脚本：`scripts/verify-tv.mjs`，用 Playwright 和 Windows Edge（其他平台用 Chromium）对静态构建验证 1920×1080 与 1366×768：页面无双向滚动、元素无溢出、数据及待更新状态正确、180 秒自动更新、失败保留当前值及延迟提示、新窗口入口正确。截图位于本地 `.private/tv-qa/`，不提交。

本地构建设置 `CACHE_DIR=pages-seed`、`PAGES_BASE_PATH=/q4-operations-dashboard`。浏览器脚本可通过 `PLAYWRIGHT_MODULE` 指定已有 Playwright 的 `index.mjs`，或临时安装 `npm install --no-save --package-lock=false playwright`；脚本不读取密钥。
