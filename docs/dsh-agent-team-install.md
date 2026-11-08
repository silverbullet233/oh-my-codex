# DSH Agent Team：交给 Agent 执行的安装指南

用户可以把这份文件交给 Agent，并说明「按本指南安装 DSH Agent Team，工作目录是……，安装根目录是……」。Agent 在已授权范围内连续完成检查、安装和验证；遇到缺少权限、依赖、认证或必须重启客户端的边界时，保留进度并报告准确阻塞。本文是可执行流程，**没有另一个 `install.sh`、bootstrap 命令或自动 MCP 发现功能**。

## 归属与固定版本

DSH Agent Team 是 [silverbullet233/oh-my-codex](https://github.com/silverbullet233/oh-my-codex) 的 `plugins/dsh-agent-team`；独立的 [dsh-team-roles](https://github.com/silverbullet233/dsh-team-roles) 提供原生 DSH host/角色功能，不是 Codex marketplace。不要在后者修改 Codex 安装测试或从那里安装 Codex 插件。

2026-11-08 核实的组合如下。执行时重新读取两个仓库的 Release/tag/manifest；发布状态或内容不一致就停止，不自动选择最新版本。

| 用途 | Catalog / Codex plugin | 官方 DSH / Team Profile | dsh-team-roles host |
| --- | --- | --- | --- |
| 正常安装，已发布 | **v0.3.0 / 0.4.0** | **0.2.2-alpha.2** | **0.6.0** 的已构建 Release `.tgz` |
| 开发候选，未发布 | 0.3.1 / 0.4.3 | 0.2.2-alpha.3 | 匹配的未发布 0.6.1 候选构建 |

已发布 [catalog v0.3.0](https://github.com/silverbullet233/oh-my-codex/releases/tag/v0.3.0) 的源提交是 `2bb302f9ab75f7bccb9274f9cacedcfbe18d904c`，对应 [host v0.6.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0)。候选 **没有 v0.3.1 tag、Release 资产或 npm 发布**；禁止编造候选下载链接，禁止把 `main`、feature branch、`latest` 或 GitHub source archive 当成正常安装源。候选验证必须另行授权，在隔离位置使用明确提交及本地构建的匹配 host，并报告其来源和摘要；不能拿 host 0.6.0 替代。本文不授权发布、打 tag 或改变 marketplace 发布状态。

## 1. 权限、目标与前置检查

- 明确用户授权的已有项目绝对路径、安装根目录、Codex profile 和是否允许网络下载。默认使用**全新独立安装根目录和独立 `CODEX_HOME`**，只写该根目录；修改真实 Codex 安装必须已有明确授权。示例均针对独立 profile，不改个人 `~/.codex`、`~/.dsh` 或系统配置。
- 使用已有 Git、Node **>=24.9.0**、npm、支持 `codex plugin` 的 Codex CLI、curl 和 shasum；已验证 CLI **0.164.0**。检查 `node --version`、`npm --version`、`git --version`，在临时 `CODEX_HOME` 下检查 `codex --version` 及 `codex plugin marketplace add --help` / `codex plugin add --help`。缺少命令或版本不兼容就报告，**不运行 brew、sudo、全局 npm 安装、npx 自动下载或系统升级**。
- 检查路径的真实位置、当前用户所有权、权限、符号链接及可写范围。安装根目录不得位于现有 runtime、DSH Home、项目源码或其他应用状态目录内。不要用递归 chmod/chown 修理未知目录。
- 公开仓库通常不需要 GitHub 认证（2026-11-08 两个仓库均为 public）；私有镜像必须已通过现有 Git credential manager 获得访问。Git 和 `gh` 认证分别核实；认证失败就停止，不创建 token、不执行新的登录流程、不把凭证放进 URL、命令参数、MCP 配置、报告或临时 profile。不打印环境、npm 配置、个人配置或密钥，不复制个人 DSH/provider 配置。
- 安装授权只涵盖初始化和无推理健康检查，不涵盖工作 Team、付费模型请求、provider 凭证配置、浏览器自动打开或持久权限扩大。DSH 首次启动可能按其原生流程生成本地浏览器/API 授权状态；若用户禁止任何这类状态创建，停在静态校验，报告健康检查未执行。Agent 不自行生成或收集凭证。

## 2. 先检查幂等与冲突

若已有安装，先核对两个明确设置的 `DSH_AGENT_TEAM_RUNTIME` / `DSH_AGENT_TEAM_HOME`，以及目标 profile 的 `codex plugin marketplace list --json` 和 `codex plugin list --json`。不要把私密配置原文贴进报告。检查 marketplace URL、固定 ref、插件版本及 `installedPath`。同名 marketplace 的不同 URL/ref 或已安装的不同插件版本都是停止条件，不自动 remove/upgrade。

匹配 runtime 必须具有正确的包名和精确版本；专用 Home 的 `.codex-dsh-owner.json` 必须为 `version: 1`、`owner: oh-my-codex/dsh-agent-team` 且 `cwd` 是相同的规范化项目路径。Web profile 必须在该 Home 内，启用并安装上述精确 Team Profile 和 host。已安装且实际 MCP health 正常时直接复用，不重新下载/安装。不匹配、部分安装、未知进程、不同 workspace、符号链接逃逸或存活状态不确定时停止，不能借新 Home 绕过未确认的旧 writer。

以下命令块只用于**确认全新安装**。Agent 先替换两个绝对路径；在同一 shell 中执行。shell 变量和 JSON 只保存非秘密路径，不启用 `set -x`。

## 3. 安装已发布 Codex 插件和专用 runtime

```sh
set -eu
umask 077
dsh_workspace='/absolute/existing/authorized-project'
dsh_install_root='/absolute/authorized-parent/new-dsh-install'
test -d "$dsh_workspace"
test ! -e "$dsh_install_root"
test ! -L "$dsh_install_root"
mkdir -m 700 "$dsh_install_root"
mkdir -m 700 "$dsh_install_root/codex-profile" "$dsh_install_root/downloads" "$dsh_install_root/npm-cache" "$dsh_install_root/process-home"
: > "$dsh_install_root/npmrc"

CODEX_HOME="$dsh_install_root/codex-profile" codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.0 --json
CODEX_HOME="$dsh_install_root/codex-profile" codex plugin add dsh-agent-team@oh-my-codex --json > "$dsh_install_root/plugin-install.json"
dsh_plugin_root="$(node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.version!=="0.4.0" || typeof p.installedPath!=="string") process.exit(1); process.stdout.write(p.installedPath)' "$dsh_install_root/plugin-install.json")"
```

确认 `installedPath` 规范化后位于所选 `CODEX_HOME` 内，`plugin.json` 和 `package.json` 均为 `dsh-agent-team` / `0.4.0`，MCP entrypoint 是该安装目录下的 `src/mcp/main.mjs`。不要猜 Codex 的内部缓存路径。marketplace 通过固定 Git tag 安装，**不能**把 Release `.tgz` 交给 `codex plugin add`。先核对远端 tag 解析到上面的源提交，再继续；不改远端 tag。

以下进程使用空环境和私有 npm 配置/cache，避免把 provider/token 配置传给包安装。Node 必须可从当前已验证 PATH 解析。确实需要额外代理或 CA 时，只传已批准的必要设置；TLS/网络失败不能通过关闭验证或更换来源绕过。

```sh
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc" npm_config_globalconfig="$dsh_install_root/npmrc" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  npm install --prefix "$dsh_install_root/runtime" @deepseek-ai/dsh@0.2.2-alpha.2 \
  --save-exact --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
export DSH_AGENT_TEAM_RUNTIME="$dsh_install_root/runtime/node_modules/@deepseek-ai/dsh"
export DSH_AGENT_TEAM_HOME="$dsh_install_root/dsh-home"
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const p=JSON.parse(fs.readFileSync(path.join(process.argv[1],"package.json"))); if(p.name!=="@deepseek-ai/dsh" || p.version!=="0.2.2-alpha.2") process.exit(1)' "$DSH_AGENT_TEAM_RUNTIME"
```

不全局安装 DSH；后续 setup 直接调用这份 runtime 的原生 CLI。保留 lockfile 供审计；只固定顶层 DSH 版本不能承诺未来传递依赖逐字节一致。

## 4. 验证 host 资产并运行现有 setup

```sh
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/dsh-team-roles-0.6.0.tgz -o "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz"
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/SHA256SUMS -o "$dsh_install_root/downloads/SHA256SUMS"
(cd "$dsh_install_root/downloads" && shasum -a 256 -c SHA256SUMS)
printf '%s  %s\n' '5538a263d3d2e4f05e843153e524e1501f1564324951a9f21ed6470de5ade67e' "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz" | shasum -a 256 -c -
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc" npm_config_globalconfig="$dsh_install_root/npmrc" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  DSH_AGENT_TEAM_RUNTIME="$DSH_AGENT_TEAM_RUNTIME" DSH_AGENT_TEAM_HOME="$DSH_AGENT_TEAM_HOME" \
  node "$dsh_plugin_root/scripts/setup.mjs" "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz" "$dsh_workspace"
```

两个摘要校验都必须成功。不要安装 GitHub 自动生成的源码压缩包，它缺少构建后的 Web 资产。setup 在空专用 Home 安装固定官方 Team Profile 和 host，带 `--ignore-scripts --save-exact`；它不会安装 runtime 或下载资产。完整匹配安装可只读复用；部分失败不会自动回滚。

若固定公开 URL 因网络代理返回 504，可停止当前步骤，使用**已经可用且获授权的** GitHub CLI 在另一个全新下载目录获取同一 Release：`gh release download v0.6.0 --repo silverbullet233/dsh-team-roles --pattern dsh-team-roles-0.6.0.tgz --pattern SHA256SUMS --dir /absolute/new-empty-download-directory`。不发起新登录，不改资产或版本；仍须完成上面两个摘要校验，再将 setup 的 archive 参数指向该验证后的文件。2026-11-08 此命令及下载字节已验证；摘要与上面的固定值一致。

## 5. 分层校验与 MCP 连接

1. **静态包与 stdio**：用已验证 Node 执行实际安装的 MCP entrypoint，输入 `initialize`（协议 `2025-06-18`）和 `tools/list` 两条 JSON-RPC 请求。检查响应 ID、无 RPC 错误、`serverInfo={name: "dsh-agent-team", version: "0.4.0"}`、协议和工具名称。发布版是 **13 个**工具：`web, shutdown, health, create, send, status, result, stop, pending, answer, escalate, approval, wait`（都带 `dsh_team_` 前缀）。当前候选为 **18 个**，另外包含 `web_url, jobs, input, withdraw_input, turn_result`；数量不能替代精确名称和身份校验。此步骤不调用 host、不创建 Team。
2. **CLI health**：仅在允许本地 native 授权状态和 loopback 监听的前提下，用上一步的空环境、相同 runtime/Home 执行 `node "$dsh_plugin_root/scripts/client.mjs" health`。它会懒启动专用普通 Web host。要求 `owned: true`、原生业务 API 1、兼容 capability（含发布版 `create-permission-preset`）、正确 role catalog/绑定；检查专用所有权记录中的规范化 Home/runtime/workspace。不要把健康检查当作真实模型验收。
3. **实际 MCP**：在宿主支持的 per-server 控件中设置这两个非秘密环境变量，并使用受支持 Node 和该安装 entrypoint。不要静默编辑全局配置或已安装 manifest。新启动 CLI 可用下列进程级命令（会进入交互界面，不能当后台测试运行）：

   ```sh
   CODEX_HOME="$dsh_install_root/codex-profile" \
     DSH_AGENT_TEAM_RUNTIME="$DSH_AGENT_TEAM_RUNTIME" \
     DSH_AGENT_TEAM_HOME="$DSH_AGENT_TEAM_HOME" codex
   ```

   重新启动 MCP 后，调用该 server 的**实际 `dsh_team_health`**，再检查上述身份/能力。另一个终端里的 export 不会更新已运行的桌面客户端。若没有 per-server 配置或重启权限，交付两个路径和重启步骤，状态记为「CLI 已通过，实际 MCP 待连接」，不能宣称一键安装已全部成功。

初始化不调用 `dsh_team_create`、`dsh_team_web` 或候选的 `dsh_team_web_url`，不打开浏览器、不发送模型请求、不配置 provider；后续由用户通过原生 DSH 完成认证/角色配置。现有账号认证不能复制到专用 Home。

候选的权限默认是 `danger-full-access` / `never`、网络 enabled intent；它不自动继承 Codex sandbox/approval/network 限制，可能写入项目外。这个候选行为不能套用到发布版，也不能用于绕过外层 OS/进程/管理员限制。安装不设置更宽权限，不伪造签名/授权或自动批准原生请求。

## 6. 失败恢复与交付

- 下载或摘要失败：停止，保留失败文件用于诊断；不换版本、不继续 setup。只有确认是本流程尚未使用的下载文件，才可移除后重取相同固定资产。
- `INSTALL_FAILED` / `SETUP_INCOMPLETE` / `SETUP_MISMATCH` / `UNOWNED_HOME`：停止并检查本流程专用路径；不要在半安装 Home 上重跑、删目录或迁移个人数据。
- `STARTUP_PENDING` / `STARTUP_UNCERTAIN` / `OWNERSHIP_MISMATCH`：先确认现有进程身份和结果，不自动重启、kill 或创建第二 writer。日志只报告脱敏的错误码/诊断路径，不输出 launch URL、cookie、token 或原始环境。
- `RUNTIME_MISMATCH` / `CAPABILITY_MISMATCH`：报告实际与预期的非秘密版本；不自动升级 global runtime/host、放宽检查或降级连接路径。
- 安装后的健康检查启动的专用 host 独立于 MCP 存活。需要清理时，仅在明确归属本次安装且安全无活动/未知工作时调用 `dsh_team_shutdown`（或相同环境的 `scripts/client.mjs shutdown`），检查确认结果；拒绝则保留实例并报告。MCP EOF 不等于关闭 host。不得停止个人 Web 进程。
- 版本切换需既有明确授权：检查所有受影响插件，使用已验证发布组合，先 `codex plugin marketplace remove oh-my-codex`，再以显式 tag 重新 add marketplace 和 plugin，最后重启 MCP。不同 ref 的原地 add 会被 CLI 拒绝；`marketplace upgrade` 只刷新当前固定 ref。回退也需匹配的独立 runtime/Home，不自动迁移 DSH 数据。所有命令必须仍指向授权的 `CODEX_HOME`。
- 最终交付：catalog/plugin/runtime/Team Profile/host 精确版本和来源、安装根目录及 `installedPath`、两个非秘密 MCP 路径、校验摘要和结果、静态/CLI/实际 MCP 各自状态、专用 host 是否仍运行、未完成原因与恢复步骤。只读校验通过与可执行模型任务是不同状态；没有真实 MCP health 就保留明确阻塞。

维护者回归命令：`npm ci --ignore-scripts --no-audit --no-fund`、`npm test`、`npm run build`、`npm run pack:check`、`npm run release:prepare -- --output /absolute/new-empty-output`、`npm run test:install`。最后一项只在临时 `CODEX_HOME` 和本地 Git fixture 验证安装/刷新/升级/同版本替换/回退及实际 stdio 接口，fixture tag/版本不是历史发布物；不使用个人配置、远端 tag、provider 凭证或模型推理。
