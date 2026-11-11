# 2026 Q4旺季经营总控台

实际 Next.js / React / TypeScript / Tailwind / Recharts 项目。只读 Google Sheets；没有演示数据回退。当前采用用户确认的公开 GitHub Pages 方案：仅公布看板所需汇总数值；原始明细和凭据不公开。

## GitHub Pages（当前发布方式）

- `npm run build:pages` 在隔离的 `.pages-build` 目录导出原有UI，不包含API、登录代理或原始明细。本地 `npm run dev` 仍使用原服务端模式。
- `.github/workflows/pages.yml` 在main更新、手动Run workflow、每天北京时间09:17和17:17运行。页面“读取最新快照”仅重新下载已发布数据；管理员需要立即读取Sheets时，在仓库Actions选择 **Sync and deploy Q4 dashboard → Run workflow**。
- 当前同步入口为 GAS Web App，完整代码在 `gas/Code.gs`。Actions不再注入Google服务账号/OAuth凭据，只注入 `GAS_WEB_APP_URL` 和 `GAS_SHARED_KEY`；旧Google Secrets可删除。密钥只放POST请求体，不进入URL、前端、构建产物或日志。
- Settings → Pages → Source选 **GitHub Actions**。无需自购域名；使用GitHub免费HTTPS网址。
- `pages-seed/`是经过字段白名单筛选的首次汇总缓存；后续每日状态持久化在 **data-state分支**，包含历史日销售汇总、真实每日快照、最后成功数据及同步状态。该分支也是公开的，不存ERP明细、ASIN、完整负责人表或凭据。恢复时优先读取此分支，不使用会过期的Actions缓存保存业务数据。
- 正常同步仅批量读取`01_经营目标`的8个范围；历史缓存缺失/版本不符时停止同步，保留旧数据，不自动全量扫描历史或ERP。同日快照覆盖更新，缺失日期保持缺失。
- 同步失败仍保留最后成功数值及原时间，并在网页标注；首次没有可用数据则停止部署。构建或发布失败时GitHub保留原站点。
- 后续更新：修改源码并推送main即可自动构建发布；不要直接修改data-state业务数值。所有任务串行执行，避免覆盖快照。
- 仅使用免费标准Linux runner。GitHub定时任务可能延迟，公开仓库长期无活动可能暂停计划任务；管理员应检查Actions执行记录。未配置GAS Secrets时只能发布最后成功缓存，不能宣称已完成实时同步。

### GAS设置（无需Google Cloud控制台）

1. 将 `gas/Code.gs` 全文复制到Apps Script的Code.gs并保存。项目设置 → 脚本属性新增 `Q4_SPREADSHEET_ID`，填原表链接中 `/d/` 与 `/edit` 之间的ID。
2. 在编辑器选择 `authorizeReader`，点击运行并由表格可访问账号完成Google授权。该函数只读取T11，并在未配置时生成64字符共享密钥。返回项目设置，复制脚本属性 `Q4_SHARED_KEY`；不将密钥发送到聊天或写进代码。
3. 部署 → 新部署 → 类型“网页应用”：执行身份选择“我”；访问权限选择“任何人”（无需登录），由代码里的密钥校验保护读取。授权界面由你本人确认；若公司账号禁用匿名网页应用，需要管理员允许。不要选择仅Google账号可访问，否则Actions会收到登录页面。
4. 复制部署返回的正式 `/exec` URL（不用 `/dev`，不加查询参数）。打开GitHub仓库Settings → Secrets and variables → Actions，添加 `GAS_WEB_APP_URL`＝该URL、`GAS_SHARED_KEY`＝脚本属性里相同的密钥。Google表格ID仅保存在GAS脚本属性，无需再添加到GitHub。
5. Actions → Sync and deploy Q4 dashboard → Run workflow。摘要必须显示 `synchronized: true` 才是实际同步成功；仅工作流绿色可能表示旧数据回退成功。检查网页最近成功同步时间及T11截止日期。
6. 修改Code.gs后必须“部署 → 管理部署 → 编辑 → 新版本 → 部署”，保留原URL。只改脚本属性里的密钥不需新版本，但要同步更新GitHub Secret。

GAS仅允许POST `readTargets`，固定读取8个目标表范围，使用`getValues()`读取公式结果；拒绝任意工作表/范围请求，不读取ERP。日期按表格时区转成YYYY-MM-DD。GAS的SpreadsheetApp可能申请较宽的表格权限，但本代码不执行任何表格写入；不要把脚本项目共享给无关人员。

验证：`npm test`；`PAGES_BASE_PATH=/q4-operations-dashboard npm run build:pages`（PowerShell先设置同名环境变量）。静态文件在`.pages-build/out`，实际网页仅加载`dashboard.json`。旧容器/SSO配置保留备用，不属于当前发布流程。

## 本地运行

需要 Node.js 22+（本机验证 Node 24）。在当前项目目录执行：

```powershell
npm ci
# 新机器首次配置；不要覆盖已有 .env.local
Copy-Item .env.example .env.local
npm run dev
```

访问 http://127.0.0.1:3000 。当前机器已创建 `.env.local`，已通过现有 Google Drive 连接只读导入真实数据。开发服务只绑定 127.0.0.1；开发模式显式设置 `DASHBOARD_LOCAL_ONLY=true` 时允许本机访问。不要用开发模式暴露内网/公网。

```powershell
npm test
npm run typecheck
npm run build
npm start
```

生产模式即使设置 LOCAL_ONLY 也会要求认证。页面和 API 均验证 HTTP Basic 凭据，账号取 `DASHBOARD_USERNAME`，密码取 `DASHBOARD_PASSWORD`（至少20字符）。没有配置则返回401。生产必须配合HTTPS，建议再加公司VPN/SSO反向代理和速率限制。Basic是第一期共享管理账号，不替代企业账号审计、按人撤权和细粒度权限。

## Google Sheets 只读授权

聊天内 Google Drive 授权可以检查和导入数据，但不是服务器后台的持续授权。自动刷新需要下面任一种配置，**不需要把表格发布到互联网，也不要发密钥到聊天里**。

### 方式一：服务账号（建议内部服务器）

1. 在 Google Cloud 项目启用 Google Sheets API。
2. 创建专用服务账号。将目标工作簿共享给该账号的 `client_email`，权限仅“查看者”。不要授予编辑权限。
3. 将服务账号JSON保存在服务器密钥目录，文件仅应用运行账号可读。
4. 在服务器环境变量或 `.env.local` 设置 `GOOGLE_APPLICATION_CREDENTIALS` 为文件绝对路径；或通过部署平台的Secret设置 `GOOGLE_SERVICE_ACCOUNT_JSON`。两者选一种。
5. 设置 `GOOGLE_SPREADSHEET_ID`，本项目示例已填入用户指定ID。重启服务，然后点击“刷新数据”。

### 方式二：OAuth 离线授权

在组织批准的OAuth应用里获得用户同意，scope限定 `https://www.googleapis.com/auth/spreadsheets.readonly`，以离线方式获得refresh token；设置 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REFRESH_TOKEN`。代码使用 google-auth-library 自动更新access token。应用不提供OAuth授权管理后台，授权同意流程由组织管理员完成。

没有任何 `NEXT_PUBLIC_` 密钥。接口只返回汇总，原始ASIN交易行不进入客户端。已认证风险证据可能包含少量归属冲突产品标识。

## 正常刷新、历史缓存与每日快照

正常刷新只执行一次Sheets `values.batchGet`，读取 `01_经营目标` 的：

- `T11:T12`
- `A13:T16`
- `A21:T23`
- `A29:T31`
- `A37:T39`
- `A45:T47`

使用 `UNFORMATTED_VALUE` 获取公式计算结果，而非公式字符串。O/P/Q/R、利润率与目标均原值读取；准目标默认直接采用S列，其他档位完成率为O列÷所选目标。T列作为当前日期历史进度，并与缓存点交叉核验。F—N为三个月各档位目标。

正常刷新不访问2025明细、10月财务或11/12月ERP。内存/持久化快照缓存15分钟，同步请求合并，一分钟刷新冷却。每日记录以组别和T11业务日期为唯一键，同日覆盖更新；10月31日锚点来自P列，11月起来自O列。缺失日期留空，不插值、不重复回填。

`CACHE_DIR` 默认项目下 `.private`，不会进入Git或静态资源：

| 文件                   | 用途                                                      |
| ---------------------- | --------------------------------------------------------- |
| `history-v2.json`      | 2025年92天汇总、历史缓存校验结果和版本                    |
| `actual-daily-v2.json` | 公司与四组按业务日期保存的权威累计快照                    |
| `snapshot-v2.json`     | 最后成功读取的目标指标及图表响应                          |
| `details-v2.json`      | 按需读取的负责人/ERP汇总结果，独立时间戳                  |
| `raw/`                 | 本机首次通过现有连接取得的真实导入，仅初始化/显式核验使用 |

历史缓存不按时间自动全量重扫。首次初始化读取元数据和历史表并分批聚合，之后直接复用。历史源发生变化时，管理员修改 `HISTORY_SOURCE_REVISION` 并重启，或明确运行：

```powershell
npx tsx scripts/rebuild-history.ts
# 仅需重新处理本机既有真实导入时
npx tsx scripts/rebuild-history.ts --local-import
```

离线定时同步可用操作系统计划任务，在项目工作目录执行 `npx tsx scripts/sync.ts`（读取.env.local），建议每小时一次。不要在日常任务中调用重建历史脚本。

刷新失败保留最后成功结果及原时间，页面明确标记。历史缓存失败不影响权威经营指标；单组目标异常有旧数据时只保留该组旧值并提示，不覆盖该组当天记录。首次完全缺乏目标数据时返回503，绝不使用模拟数据。

这是单实例文件持久化方案，原子替换并串行化同进程快照更新。部署时挂载持久卷并限制运行账号权限；多实例部署需迁移数据库/分布式锁。不要把同步脚本与多个应用进程同时写同一CACHE_DIR；定时同步与网站选择单一写入者，或串行调度。

## ERP与财务口径

目标表所有指标及10月财务数据不折算。只有后台 `lib/erp.ts` 对原始ERP销售额乘0.9、利润乘0.85，执行一次后聚合；缓存读取不再次处理。2025历史分子分母采用一致规则，历史进度比例不受统一比例变化影响。网页不展示系数或折算说明。

负责人明细点击“加载 / 刷新负责人明细”后独立读取，缓存15分钟。10月财务净利润和ERP销售净毛利分列，ERP利润率采用处理后的利润÷销售额；不覆盖目标表官方利润率。明细对账先处理口径、再按T11限制日期，与Q列比较；剩余差异保留，不调整系数配平。重复候选、缺失、未归属提示只影响明细，不能阻断官方实际曲线。

12月明细接入设置 `DECEMBER_SHEET_NAME`；必须包含日期、ASIN、国家、销售额、销售净毛利、运营负责人、组别。实际曲线和日常更新无需读取12月ERP，直接读取目标O列快照。

## 曲线、榜单和风险

- 历史：公司用国家每日，各组用父单每日；保留未归属并对账。当前点采用T列。
- 实际：P列10月31日锚点 + 每日O列权威快照。首次仅有锚点和当前业务日，其间缺失日期保持空值。
- 计划：F—N月目标按2025同月每日销售权重分配；缺少完整历史月份时计划缺失，不当作实际。
- 近7天：从连续8个每日快照端点计算累计差值和差距改善，不足则显示“数据不足”。不会为排行榜补造数据。
- 利润、销售风险依据权威目标表；ERP异常不压制官方风险判断。阈值统一在 `lib/config.ts`。
- 目标表时区保留America/Los_Angeles；业务日期不做跨时区偏移，读取时间显示Asia/Shanghai。T11须由业务维护为已确认完整日期。

## 内部部署

HTTPS反向代理部署时设置 `APP_ORIGIN` 为员工访问的完整源（例如 `https://q4.company.internal`），用于刷新请求同源校验。

已准备 `Dockerfile` 和 `deploy/compose.yaml`：单台 Linux VM 上运行 Caddy HTTPS、OAuth2 Proxy 企业 OIDC 登录、Next.js 单实例。仅80/443映射到宿主机，3000/4180不对公网开放。应用同时校验网关密钥和成员邮箱文件，不能仅伪造邮件头访问。全站（包括API）经过网关；应用没有经营数据写入接口。Sheets服务账号仅授予该表查看权限。

上线前需要确认云平台/区域及费用、服务器SSH权限、域名DNS权限、公司OIDC应用、授权成员邮箱、独立Google服务账号。尚未创建云资源或发布正式网址。机房必须能访问 Google Sheets API；国内团队的实际网络连通性须上线试测，不能仅凭区域保证。

部署步骤（Linux，源码置于 `/opt/q4`，Docker Compose v2）：

1. 配置域名A记录到服务器；防火墙仅开放80/443及限定管理员来源的SSH。将持久磁盘挂载到 `/srv/q4`，确保重启自动挂载。
2. 建立 `/srv/q4/data`（UID1000可写）和 `/srv/q4/secrets`（仅管理员及运行UID可读）。从本机 `.private` **通过SSH单独传输** `history-v2.json`、`actual-daily-v2.json`、`snapshot-v2.json`、`actual-backfill-v1.json`、`backfill-unmatched.json`，可选 `details-v2.json`。不上传原始ERP明细，不将缓存放入镜像或仓库。已有数据迁移时先停止app，不能覆盖线上新快照。
3. Google项目启用Sheets API；创建专用服务账号，将原表以“查看者”共享给其邮箱。密钥文件放 `/srv/q4/secrets/google-service-account.json`，只读挂载，不发到聊天中。secrets目录归UID1000所有、权限0700；Google密钥归UID1000所有、权限0600。邮箱名单文件设0644，允许OAuth2 Proxy容器的非root用户读取其单文件挂载（名单不含密码）；主机目录本身仍仅管理员/UID1000可遍历。
4. OIDC配置回调 `https://你的域名/oauth2/callback`，必须提供可信的已验证email声明。创建 `/srv/q4/secrets/allowed-emails.txt`，每行一个授权邮箱，禁止通配符。复制 `deploy/.env.example` 为 `deploy/.env`，填入OIDC配置，分别生成独立网关/同步密钥及cookie密钥，文件权限0600。
5. 在 `/opt/q4/deploy` 执行 `docker compose config --quiet`、`docker compose build`、`docker compose up -d`。Caddy自动申请/续期HTTPS证书，证书保存在独立Docker命名卷。先验收授权/未授权账号，再开放团队使用。
6. 将 `deploy/q4-sync.service`、`deploy/q4-sync.timer` 安装至 `/etc/systemd/system/`，执行 `systemctl daemon-reload`、`systemctl enable --now q4-sync.timer`、`systemctl start q4-sync.service`。每天北京时间09:00无人访问也会同步；服务器停机错过触发会在恢复后补执行，失败每15分钟重试。它调用同一应用进程的内部刷新接口，沿用8个目标表范围，避免额外写进程；网关拒绝外部访问此接口。

成员增删：修改 `allowed-emails.txt`，应用每次请求重新检查，删除后旧会话也无法读取数据；执行 `docker compose restart oauth2` 让网关同步更新名单。新增成员默认只读，不授予服务器或表格编辑权限。更换OIDC或Cookie密钥需重建相应容器；管理权限仅授予运维人员。

存储及监控：`/srv/q4/data` 保留现有JSON缓存和快照，重新部署镜像不会删除；`sync-status.json` 记录最近尝试及结果。使用 `systemctl status q4-sync.timer`、`journalctl -u q4-sync.service` 和 `docker compose logs` 检查同步。服务器磁盘故障仍需备份恢复：启用云盘快照或将停写后的data备份到公司独立私有备份存储，备份频率/保留期及费用上线时确认。不要把密钥混入普通备份或日志。

更新：先备份持久数据，在 `/opt/q4` 更新源码，然后在deploy目录执行 `docker compose build app` 和 `docker compose up -d --no-deps app`；保留旧镜像以便回退。仅运行一个app实例，不运行独立 `scripts/sync.ts` 写同一目录。升级不覆盖 `/srv/q4/data` 和secrets，严禁 `docker compose down -v` 删除证书卷。验收重启前后快照条数与金额一致、定时任务成功后再交付。

不要静态导出部署到公开静态站点；那样无法安全运行读取与认证。不要上传 `.private`、`.env.local` 或账号JSON到源码仓库/公开站点。此交付未向任何公网发布。

## 代码与验证

`lib/sheets.ts` 只读接口与范围；`lib/model.ts` 权威指标/曲线/风险；`lib/erp.ts` 原始明细处理；`lib/store.ts` 持久化；`lib/data.ts` 刷新编排；`app/api/details/route.ts` 按需明细；`components/dashboard.tsx` 保留原布局与交互。

`npm test`覆盖公式结果直接采用、三档×五范围、ERP仅处理一次/财务不处理、P/O曲线空缺、T列权威点、单日持久化更新、仅目标表批量请求、缓存复用、未授权失败和旧快照保留。`npm run build`包含TypeScript检查。

部署准备验证：`npm run build` 后执行 `node scripts/verify-production.mjs`。该脚本以真实缓存的临时副本启动生产服务，检查页面/API拒绝未授权、撤销成员即时生效、同步失败保留缓存、进程重启后快照不变；不修改真实缓存、不验证公网TLS/OIDC或真实云定时任务。最终上线仍须用授权/未授权账号及手机/电脑访问正式域名，运行一次systemd同步并重建容器确认磁盘数据保留。

官方参考：[Sheets values API](https://developers.google.com/workspace/sheets/api/guides/values)、[Next.js访问控制](https://nextjs.org/docs/app/guides/authentication)。
