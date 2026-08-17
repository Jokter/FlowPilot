# FlowPilot MVP 实施计划

> 依据：[需求到交付流程平台设计](../specs/2026-08-18-requirement-delivery-platform-design.md)
> 日期：2026-08-18
> 状态：待审阅
> 目标：实现从需求提交到 GitHub 草稿 PR 的单机 Windows 内网 MVP。
> 约束：本计划只描述实施顺序，不授权自动合并、部署生产或使用 Codex `:danger-full-access`。

## 1. 实施原则

1. 先让每个关键行为拥有可失败的测试，再补最小实现。
2. 保持一个 Spring Boot 部署单元，不提前拆微服务。
3. 外部依赖全部经过端口接口：Codex、Git、GitHub、时钟和文件系统都可替换为测试实现。
4. PostgreSQL 中的 WorkflowRun、NodeRun、Artifact、Evidence 和 AuditEvent 是业务事实源。
5. Codex Thread、Git 提交和 GitHub PR 只作为外部引用关联，不成为流程主键。
6. 每个阶段结束时运行全量验证，避免把结构性问题拖到最后。
7. 每次提交只包含当前任务范围，不顺手重构相邻代码。

## 2. 目录与构建假设

采用以下单仓库布局：

```text
FlowPilot/
├── server/                    # Java 21 / Spring Boot 4.1
│   ├── pom.xml
│   └── src/
├── web/                       # React 19 / TypeScript / Vite
├── skills/                    # 平台测试用 Skill Suite；正式套件可从配置路径加载
├── scripts/                   # Windows 启动与验证脚本
├── docs/
└── prototypes/                # 一次性原型，不参与产品构建
```

构建工具采用 Maven Wrapper 和 npm。生产构建时，React `dist/` 被复制到 Spring Boot 静态资源目录；开发时前后端分别启动。

## 3. 总体验收命令

计划完成后必须支持：

```powershell
# 后端单元、模块、数据库与契约测试
server\mvnw.cmd -f server\pom.xml verify

# 前端单元测试与生产构建
npm --prefix web run test:run
npm --prefix web run build

# 浏览器端到端测试
npm --prefix web run test:e2e

# 一键验证
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

## 4. 任务清单

### 任务 1：建立可构建的后端与前端骨架

**目标**：仓库具备可重复的 Java、React 和 CI 构建入口，但尚不实现业务。

**新增文件**：

- `server/pom.xml`
- `server/mvnw.cmd`
- `server/.mvn/wrapper/*`
- `server/src/main/java/com/flowpilot/FlowPilotApplication.java`
- `server/src/test/java/com/flowpilot/FlowPilotApplicationTest.java`
- `web/package.json`
- `web/package-lock.json`
- `web/tsconfig.json`
- `web/vite.config.ts`
- `web/src/main.tsx`
- `web/src/App.tsx`
- `web/src/App.test.tsx`
- `.editorconfig`
- `.gitignore`
- `scripts/verify.ps1`
- `.github/workflows/verify.yml`

**测试先行**：

1. 写 Spring 上下文测试，预期因应用入口不存在而失败。
2. 写 React 首屏测试，预期因 `App` 不存在而失败。
3. 添加最小应用入口，使两项测试通过。

**最小实现**：

- Java 21、Spring Boot 4.1.x、Spring Modulith、Spring Security、Spring Data JPA、Validation、Actuator、Flyway 和 PostgreSQL 驱动；
- 测试依赖包含 JUnit 5、AssertJ、Testcontainers 和 Spring Modulith Test；
- React 19.2、TypeScript、Vite、React Router、TanStack Query、Vitest 和 Testing Library；
- CI 分别执行 Maven verify、前端测试和前端 build；
- 原型目录不加入产品构建。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml test
npm --prefix web ci
npm --prefix web run test:run
npm --prefix web run build
```

**建议提交**：`初始化 FlowPilot 应用骨架`

---

### 任务 2：建立模块边界与通用测试约束

**目标**：先固定模块依赖方向，防止模块化单体退化为包级耦合。

**新增文件**：

- `server/src/main/java/com/flowpilot/identity/package-info.java`
- `server/src/main/java/com/flowpilot/requirement/package-info.java`
- `server/src/main/java/com/flowpilot/workflow/definition/package-info.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/package-info.java`
- `server/src/main/java/com/flowpilot/humantask/package-info.java`
- `server/src/main/java/com/flowpilot/skill/package-info.java`
- `server/src/main/java/com/flowpilot/thread/package-info.java`
- `server/src/main/java/com/flowpilot/artifact/package-info.java`
- `server/src/main/java/com/flowpilot/github/package-info.java`
- `server/src/main/java/com/flowpilot/audit/package-info.java`
- `server/src/test/java/com/flowpilot/ArchitectureTest.java`

**测试先行**：

1. 使用 Spring Modulith 检测所有业务模块。
2. 断言不存在环形依赖。
3. 断言 `workflow-runtime` 不依赖 Codex 或 GitHub 的具体实现包。

**最小实现**：

- 为每个模块声明允许依赖；
- 公共类型只通过模块 API 包暴露；
- 暂不建立通用 `common` 业务包；只有 ID、时钟等纯基础设施类型可进入 `shared`。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=ArchitectureTest test
```

**建议提交**：`建立模块化单体边界`

---

### 任务 3：实现数据库基线与四个预置用户

**目标**：提供本地账号登录所需的数据结构和可重复初始化。

**新增文件**：

- `server/src/main/resources/db/migration/V001__identity_and_audit.sql`
- `server/src/main/java/com/flowpilot/identity/PlatformUser.java`
- `server/src/main/java/com/flowpilot/identity/PlatformRole.java`
- `server/src/main/java/com/flowpilot/identity/UserRepository.java`
- `server/src/main/java/com/flowpilot/identity/DefaultUserSeeder.java`
- `server/src/test/java/com/flowpilot/identity/DefaultUserSeederTest.java`
- `server/src/test/java/com/flowpilot/identity/IdentityPersistenceTest.java`

**测试先行**：

1. 空数据库启动后必须存在 `platform-admin`、`workflow-admin`、`member`、`approver`。
2. 重复启动不能重复插入用户。
3. 数据库中不能保存明文密码。
4. 缺少任一默认密码环境配置时，应用应拒绝以非测试 Profile 启动。

**最小实现**：

- 使用 BCrypt 保存密码摘要；
- 四个账号与角色一一对应；
- 初始密码从 `FLOWPILOT_*_PASSWORD` 环境变量读取；
- 建立追加式审计表的最小字段，但本任务不实现完整审计服务。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*Identity*Test,*DefaultUserSeederTest test
```

**建议提交**：`添加预置角色用户`

---

### 任务 4：实现登录、会话与角色授权

**目标**：四个默认用户能够登录，后端能够拒绝越权操作。

**新增文件**：

- `server/src/main/java/com/flowpilot/identity/SecurityConfiguration.java`
- `server/src/main/java/com/flowpilot/identity/LoginController.java`
- `server/src/main/java/com/flowpilot/identity/CurrentUserController.java`
- `server/src/main/java/com/flowpilot/identity/RolePolicy.java`
- `server/src/test/java/com/flowpilot/identity/LoginApiTest.java`
- `server/src/test/java/com/flowpilot/identity/RoleAuthorizationTest.java`

**测试先行**：

1. 正确密码登录成功并建立 Session。
2. 错误密码返回统一错误，不泄露账号是否存在。
3. 未登录访问业务 API 返回 401。
4. `member` 不能发布流程；`workflow-admin` 可以。
5. `member` 不能完成审批者专属业务确认。

**最小实现**：

- 提供 JSON 登录、登出和当前用户端点；
- 使用 HttpOnly、SameSite Cookie；
- 对状态改变请求保留 CSRF 防护；
- 不实现注册、改角色、找回密码和用户管理。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*LoginApiTest,*RoleAuthorizationTest test
```

**建议提交**：`实现本地账号登录与角色授权`

---

### 任务 5：实现 Skill 与 Skill Suite 目录

**目标**：从配置路径加载兼容 Agent Skills 的套件，校验并发布不可变版本。

**新增文件**：

- `server/src/main/resources/db/migration/V002__skill_catalog.sql`
- `server/src/main/java/com/flowpilot/skill/SkillSuite.java`
- `server/src/main/java/com/flowpilot/skill/SkillSuiteVersion.java`
- `server/src/main/java/com/flowpilot/skill/SkillDescriptor.java`
- `server/src/main/java/com/flowpilot/skill/SkillSuiteLoader.java`
- `server/src/main/java/com/flowpilot/skill/SkillSuiteService.java`
- `server/src/main/java/com/flowpilot/skill/SkillSuiteController.java`
- `server/src/test/java/com/flowpilot/skill/SkillSuiteLoaderTest.java`
- `server/src/test/java/com/flowpilot/skill/SkillSuiteVersioningTest.java`
- `skills/test-suite/suite.yaml`
- `skills/test-suite/skills/requirement-analysis/SKILL.md`

**测试先行**：

1. 缺少 `suite.yaml` 或 `SKILL.md` 时校验失败。
2. 发布版本保存所有文件的稳定内容摘要。
3. 修改已发布目录后，运行前摘要校验失败。
4. 新发布版本不修改旧版本内容。
5. 节点引用不存在于套件的 Skill 时发布失败。

**最小实现**：

- 套件根路径通过配置给出；
- 解析 `suite.yaml` 和 Skill 入口；
- 摘要按规范化相对路径和文件内容计算；
- 第一版只读取文件，不提供在线编辑 SKILL.md；
- 不解析 OpenSpec CLI 或 Schema。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*SkillSuite*Test test
```

**建议提交**：`实现 Skill Suite 版本目录`

---

### 任务 6：实现流程定义、校验与发布

**目标**：流程管理员能够创建受限流程草稿并发布不可变版本。

**新增文件**：

- `server/src/main/resources/db/migration/V003__workflow_definition.sql`
- `server/src/main/java/com/flowpilot/workflow/definition/WorkflowTemplate.java`
- `server/src/main/java/com/flowpilot/workflow/definition/WorkflowVersion.java`
- `server/src/main/java/com/flowpilot/workflow/definition/StageDefinition.java`
- `server/src/main/java/com/flowpilot/workflow/definition/NodeDefinition.java`
- `server/src/main/java/com/flowpilot/workflow/definition/NodeType.java`
- `server/src/main/java/com/flowpilot/workflow/definition/TransitionDefinition.java`
- `server/src/main/java/com/flowpilot/workflow/definition/WorkflowValidator.java`
- `server/src/main/java/com/flowpilot/workflow/definition/WorkflowDefinitionService.java`
- `server/src/main/java/com/flowpilot/workflow/definition/WorkflowDefinitionController.java`
- `server/src/test/java/com/flowpilot/workflow/definition/WorkflowValidatorTest.java`
- `server/src/test/java/com/flowpilot/workflow/definition/WorkflowVersioningTest.java`

**测试先行**：

1. 必须恰有一个 START 且至少一个 END。
2. 不可达节点、未知节点类型和无目标转换必须拒绝。
3. 普通前进图禁止环；返工边只能指向显式返工入口。
4. 所有 CODEX 节点必须引用固定 SkillSuiteVersion 内的 Skill。
5. 发布版本不可修改，修改草稿只能生成新版本。

**最小实现**：

- 节点类型限于设计文档中的七类；
- 流程定义以结构化 JSON 保存，同时将关键索引关系落表；
- 发布时保存定义摘要、Skill Suite 摘要和发布人；
- 提供默认六阶段流程的初始化定义。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*WorkflowValidatorTest,*WorkflowVersioningTest test
```

**建议提交**：`实现受限流程定义与发布`

---

### 任务 7：实现需求、流程运行与集中状态机

**目标**：需求能够绑定一个流程版本启动，并且只能按合法转换推进。

**新增文件**：

- `server/src/main/resources/db/migration/V004__requirement_and_workflow_runtime.sql`
- `server/src/main/java/com/flowpilot/requirement/Requirement.java`
- `server/src/main/java/com/flowpilot/requirement/RequirementService.java`
- `server/src/main/java/com/flowpilot/requirement/RequirementController.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/WorkflowRun.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/NodeRun.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/NodeRunStatus.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/WorkflowTransitionService.java`
- `server/src/test/java/com/flowpilot/workflow/runtime/WorkflowTransitionServiceTest.java`
- `server/src/test/java/com/flowpilot/workflow/runtime/ConcurrentTransitionTest.java`

**测试先行**：

1. 启动时固定 WorkflowVersion 与 SkillSuiteVersion。
2. `PENDING → READY → RUNNING` 合法，跳过 READY 非法。
3. 用户不能激活后续节点或跳过当前节点。
4. 两个并发完成请求只能成功一次。
5. 返工只能到流程定义声明的入口。
6. AI Turn 完成不能自动令 NodeRun 成功。

**最小实现**：

- 所有状态更新集中到一个领域服务；
- 使用乐观锁和期望版本防止重复推进；
- Controller、Webhook 和适配器不能直接保存状态；
- 创建需求时绑定一个现有 GitHub 仓库标识，但尚不创建 worktree。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*WorkflowTransitionServiceTest,*ConcurrentTransitionTest test
```

**建议提交**：`实现需求流程运行状态机`

---

### 任务 8：实现产物、证据、人工任务与业务确认

**目标**：节点完成由可验证产物和人工确认驱动，而不是由聊天文本驱动。

**新增文件**：

- `server/src/main/resources/db/migration/V005__artifact_human_task.sql`
- `server/src/main/java/com/flowpilot/artifact/Artifact.java`
- `server/src/main/java/com/flowpilot/artifact/Evidence.java`
- `server/src/main/java/com/flowpilot/artifact/ArtifactService.java`
- `server/src/main/java/com/flowpilot/humantask/HumanTask.java`
- `server/src/main/java/com/flowpilot/humantask/BusinessConfirmation.java`
- `server/src/main/java/com/flowpilot/humantask/HumanTaskService.java`
- `server/src/test/java/com/flowpilot/artifact/ArtifactGateTest.java`
- `server/src/test/java/com/flowpilot/humantask/BusinessConfirmationTest.java`

**测试先行**：

1. 缺少必需 Artifact 或 Evidence 时节点不能完成。
2. 业务确认绑定具体内容摘要。
3. 产物内容变化后旧确认失效。
4. Codex 权限批准不能替代业务确认。
5. 申请人不能完成需要 `approver` 的确认。

**最小实现**：

- 数据库存储 Artifact 元数据和内容摘要；
- 小型 Markdown/JSON 可存专用文件目录，大型代码仍在 Git；
- HumanTask 支持待处理、完成和驳回到固定返工节点；
- 不实现转派、代理、SLA 和例外跳过。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*ArtifactGateTest,*BusinessConfirmationTest test
```

**建议提交**：`添加产物门禁与人工确认`

---

### 任务 9：实现可靠命令队列、租约和审计

**目标**：数据库提交与外部 Codex/GitHub 操作解耦，并可在进程重启后恢复。

**新增文件**：

- `server/src/main/resources/db/migration/V006__command_queue_and_audit.sql`
- `server/src/main/java/com/flowpilot/workflow/runtime/ExternalCommand.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/ExternalCommandRepository.java`
- `server/src/main/java/com/flowpilot/workflow/runtime/CommandLeaseService.java`
- `server/src/main/java/com/flowpilot/audit/AuditEvent.java`
- `server/src/main/java/com/flowpilot/audit/AuditService.java`
- `server/src/test/java/com/flowpilot/workflow/runtime/CommandLeaseServiceTest.java`
- `server/src/test/java/com/flowpilot/audit/AuditTransactionTest.java`

**测试先行**：

1. 状态转换、审计和外部命令在同一事务提交。
2. 同一 operation key 只能存在一个有效命令。
3. 未过期租约不能被其他 Worker 领取。
4. 过期租约可以恢复领取。
5. 可重试失败按次数和 `nextAttemptAt` 延迟。

**最小实现**：

- 使用 PostgreSQL 行锁或 `SKIP LOCKED` 领取命令；
- Worker 轮询频率可配置；
- 默认最多两个 Codex Turn 命令并发；
- 审计只追加，不提供更新和删除 API。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*CommandLeaseServiceTest,*AuditTransactionTest test
```

**建议提交**：`实现可靠命令队列与审计`

---

### 任务 10：实现 Codex App Server 协议适配层

**目标**：Java 能够监督固定版本 App Server 子进程并可靠收发 JSONL/JSON-RPC。

**新增文件**：

- `server/src/main/java/com/flowpilot/thread/CodexClient.java`
- `server/src/main/java/com/flowpilot/thread/CodexAppServerProcess.java`
- `server/src/main/java/com/flowpilot/thread/CodexJsonRpcClient.java`
- `server/src/main/java/com/flowpilot/thread/CodexProtocolMessage.java`
- `server/src/main/java/com/flowpilot/thread/CodexConfigurationCatalog.java`
- `server/src/test/java/com/flowpilot/thread/CodexJsonRpcClientTest.java`
- `server/src/test/java/com/flowpilot/thread/CodexProcessRecoveryTest.java`
- `server/src/test/resources/fake-codex-app-server.mjs`

**测试先行**：

1. 客户端必须完成 `initialize/initialized` 握手后才能发送业务请求。
2. 请求 ID 与响应必须正确关联。
3. 服务端反向请求不能被误当作通知。
4. 子进程退出后，未完成请求转为可恢复失败。
5. 无效 JSONL 事件被隔离并记录，不破坏后续消息解析。
6. 模型和权限 Profile 从 App Server 动态取得，不使用硬编码列表。

**最小实现**：

- 使用 `ProcessBuilder` 启动配置的 Codex 二进制；
- 默认 stdio JSONL，不启用实验性 WebSocket；
- 固定二进制路径和版本，启动时验证版本；
- 读写循环使用独立受控线程，不占用 HTTP 请求线程；
- 假 App Server 支持正常、延迟、反向审批和崩溃场景。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*CodexJsonRpcClientTest,*CodexProcessRecoveryTest test
```

**建议提交**：`接入 Codex App Server 协议`

---

### 任务 11：实现 Thread、Turn、压缩与权限请求

**目标**：在当前需求内支持新建、恢复、分叉和多轮对话，并把 Codex 权限请求映射到 Web。

**新增文件**：

- `server/src/main/resources/db/migration/V007__codex_thread_runtime.sql`
- `server/src/main/java/com/flowpilot/thread/ThreadLink.java`
- `server/src/main/java/com/flowpilot/thread/TurnRecord.java`
- `server/src/main/java/com/flowpilot/thread/ItemRecord.java`
- `server/src/main/java/com/flowpilot/thread/CodexPermissionRequest.java`
- `server/src/main/java/com/flowpilot/thread/ThreadRuntimeService.java`
- `server/src/main/java/com/flowpilot/thread/ThreadController.java`
- `server/src/test/java/com/flowpilot/thread/ThreadRuntimeServiceTest.java`
- `server/src/test/java/com/flowpilot/thread/ThreadReusePolicyTest.java`
- `server/src/test/java/com/flowpilot/thread/CodexPermissionRequestTest.java`

**测试先行**：

1. 新建 Thread 保存外部 threadId。
2. 只能恢复或分叉当前需求内的 Thread。
3. worktree、仓库或权限环境不兼容时拒绝复用。
4. Skill Chain 每个 Skill 产生独立 Turn，并在同一 Thread 顺序执行。
5. 压缩请求关联正确 Thread，完成事件写入记录。
6. 权限请求绑定 NodeRun、Thread、Turn 和 Item。
7. 第一版拒绝 `acceptForSession` 和 `:danger-full-access`。

**最小实现**：

- 启动 Turn 时显式传入已固定的 Skill；
- 保存 Thread/Turn/Item 外部 ID、最终状态、关键输出和用量；
- 仅聚合或短期保存增量文本；
- 用户批准或拒绝后，将决定返回 App Server；
- Codex Turn 完成只令 NodeRun 进入 `WAITING_USER`。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*ThreadRuntimeServiceTest,*ThreadReusePolicyTest,*CodexPermissionRequestTest test
```

**建议提交**：`实现 Codex 多轮 Thread 运行时`

---

### 任务 12：实现安全的 Git worktree 与分支管理

**目标**：每条需求只在专属工作区和隔离分支修改代码。

**新增文件**：

- `server/src/main/java/com/flowpilot/github/GitClient.java`
- `server/src/main/java/com/flowpilot/github/ProcessGitClient.java`
- `server/src/main/java/com/flowpilot/github/WorktreeService.java`
- `server/src/main/java/com/flowpilot/github/WorktreeRecord.java`
- `server/src/test/java/com/flowpilot/github/WorktreeServiceTest.java`
- `server/src/test/java/com/flowpilot/github/WorktreePathSafetyTest.java`

**测试先行**：

1. 分支名由需求 ID 派生且可重复计算。
2. 工作区必须位于配置的绝对根目录内。
3. 试图通过 `..`、符号链接或错误仓库逃逸时拒绝。
4. 同一需求重复创建返回已有 worktree。
5. 任何清理操作先验证解析后的绝对路径仍位于专用根目录。

**最小实现**：

- 使用参数列表调用 Git，不拼接 shell 命令字符串；
- 一需求一仓库、一 worktree、一分支；
- 仓库不存在或工作区不干净时停止并给出可操作错误；
- 本任务不实现自动删除工作区，只实现可验证的归档标记。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*WorktreeServiceTest,*WorktreePathSafetyTest test
```

**建议提交**：`实现需求隔离 Git 工作区`

---

### 任务 13：实现 GitHub 草稿 PR 交付适配器

**目标**：推送隔离分支、读取 Actions 状态并幂等创建草稿 PR。

**新增文件**：

- `server/src/main/resources/db/migration/V008__github_delivery.sql`
- `server/src/main/java/com/flowpilot/github/GitHubClient.java`
- `server/src/main/java/com/flowpilot/github/GhCliClient.java`
- `server/src/main/java/com/flowpilot/github/GitHubDelivery.java`
- `server/src/main/java/com/flowpilot/github/GitHubDeliveryService.java`
- `server/src/main/java/com/flowpilot/github/GitHubWebhookController.java`
- `server/src/test/java/com/flowpilot/github/GitHubDeliveryServiceTest.java`
- `server/src/test/java/com/flowpilot/github/GitHubReconciliationTest.java`
- `server/src/test/java/com/flowpilot/github/GitHubWebhookTest.java`
- `server/src/test/java/com/flowpilot/github/GitHubWebhookSignatureTest.java`

**测试先行**：

1. `gh auth status` 不可用时系统状态明确失败，不尝试匿名操作。
2. 同一需求重复交付只得到一个草稿 PR。
3. 外部 PR 已创建但响应丢失时，对账能够恢复编号和 URL。
4. Webhook delivery ID 重复时只处理一次。
5. Webhook 签名缺失或错误时拒绝处理。
6. 非草稿 PR 或 head SHA 不匹配时不能把流程标记完成。
7. 平台永不调用合并或部署操作。

**最小实现**：

- `GhCliClient` 以结构化 JSON 输出调用 `gh`；
- 保存仓库、head/base、head SHA、PR 编号和 URL；
- Actions 检查转换为 Evidence；
- Draft PR 成功创建并保存后允许最终完成 WorkflowRun；
- Webhook 使用独立密钥验证 GitHub 签名，日志不记录密钥；
- 提供定时对账入口。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*GitHubDeliveryServiceTest,*GitHubReconciliationTest,*GitHubWebhookTest,*GitHubWebhookSignatureTest test
```

**建议提交**：`实现 GitHub 草稿 PR 交付`

---

### 任务 14：实现可重放 SSE 与应用 API

**目标**：浏览器刷新或断线后能恢复流程与 Codex 事件，不依赖内存连接状态。

**新增文件**：

- `server/src/main/resources/db/migration/V009__event_stream.sql`
- `server/src/main/java/com/flowpilot/audit/StreamEvent.java`
- `server/src/main/java/com/flowpilot/audit/StreamEventService.java`
- `server/src/main/java/com/flowpilot/audit/EventStreamController.java`
- `server/src/main/java/com/flowpilot/requirement/RequirementQueryController.java`
- `server/src/test/java/com/flowpilot/audit/EventStreamReplayTest.java`
- `server/src/test/java/com/flowpilot/audit/EventStreamAuthorizationTest.java`

**测试先行**：

1. 事件 ID 单调递增。
2. `Last-Event-ID` 后只重放缺失事件。
3. 重连不会重复推进业务状态。
4. 无权用户不能订阅管理员事件。
5. 心跳事件不写业务状态。

**最小实现**：

- REST 处理登录、需求、节点、Thread、权限和确认命令；
- SSE 按需求或系统范围订阅；
- 使用 `SseEmitter`，不切换整个后端到 WebFlux；
- 规范化事件持久化后再推送。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Dtest=*EventStreamReplayTest,*EventStreamAuthorizationTest test
```

**建议提交**：`添加可恢复的流程事件流`

---

### 任务 15：实现前端认证、导航与员工工作台

**目标**：实现已确认的 A 布局，并让 `member` 能完成需求的人工与 Codex 节点操作。

**新增文件**：

- `web/src/app/router.tsx`
- `web/src/app/api.ts`
- `web/src/app/session.ts`
- `web/src/pages/LoginPage.tsx`
- `web/src/pages/DashboardPage.tsx`
- `web/src/pages/RequirementPage.tsx`
- `web/src/features/workflow/StageRail.tsx`
- `web/src/features/thread/CodexConversation.tsx`
- `web/src/features/thread/ThreadSelector.tsx`
- `web/src/features/thread/CodexConfigSelector.tsx`
- `web/src/features/artifact/CompletionPanel.tsx`
- `web/src/features/event/useRequirementEvents.ts`
- 对应的 `*.test.tsx`

**测试先行**：

1. 未登录只显示登录页。
2. `member` 首页显示待办、已发起需求和最近 Thread。
3. 当前节点工作台严格呈现左流程、中对话、右门禁与产物。
4. 后续节点不可点击启动。
5. 权限请求出现时显示 Codex 原始摘要和批准/拒绝按钮。
6. SSE 重连后按事件 ID 去重。
7. 缺少完成证据时提交按钮禁用并解释原因。

**最小实现**：

- 使用 React Router 和 TanStack Query；
- 页面视觉语言以已选 A 原型为依据，但重新实现生产组件；
- 不复制一次性原型代码；
- 支持 Thread 新建、恢复、分叉、压缩、模型与权限 Profile 选择；
- 增量输出与最终产物分区显示。

**验证**：

```powershell
npm --prefix web run test:run
npm --prefix web run build
```

**建议提交**：`实现员工需求与 Codex 工作台`

---

### 任务 16：实现流程、Skill 与系统管理页面

**目标**：三个预置管理角色能完成第一版范围内的管理操作。

**新增文件**：

- `web/src/pages/WorkflowTemplatesPage.tsx`
- `web/src/pages/WorkflowEditorPage.tsx`
- `web/src/features/workflow/RestrictedFlowEditor.tsx`
- `web/src/pages/SkillSuitesPage.tsx`
- `web/src/pages/SkillSuiteDetailPage.tsx`
- `web/src/pages/SystemStatusPage.tsx`
- `web/src/pages/AuditPage.tsx`
- 对应的 `*.test.tsx`

**测试先行**：

1. `workflow-admin` 可创建、校验和发布草稿。
2. `member` 看不到管理导航，也不能直接访问管理 API。
3. 流程画布只能创建受支持节点和转换。
4. 发布前错误以具体节点和规则展示。
5. Skill 页面只读展示文件、摘要和版本，不在线编辑 SKILL.md。
6. 系统状态显示 Codex、GitHub、PostgreSQL 和队列状态。

**最小实现**：

- 使用 React Flow 实现受限图编辑器；
- 前端即时校验仅用于体验，后端校验是权威结果；
- 不实现用户管理页面；
- 不实现完整 BPMN 导入导出。

**验证**：

```powershell
npm --prefix web run test:run
npm --prefix web run build
```

**建议提交**：`实现流程与 Skill 管理界面`

---

### 任务 17：实现跨模块端到端测试

**目标**：使用假 Codex 和假 GitHub 完整走通默认流程，并覆盖恢复场景。

**新增文件**：

- `server/src/test/java/com/flowpilot/e2e/RequirementDeliveryJourneyTest.java`
- `server/src/test/java/com/flowpilot/e2e/ServiceRestartRecoveryTest.java`
- `server/src/test/java/com/flowpilot/e2e/DuplicateCallbackRecoveryTest.java`
- `web/playwright.config.ts`
- `web/e2e/requirement-delivery.spec.ts`
- `web/e2e/role-boundaries.spec.ts`

**测试先行**：

完整场景必须覆盖：

1. `member` 登录并提交需求；
2. 系统执行需求分析 Skill；
3. `member` 多轮补充并确认需求；
4. 系统生成 SDD，`approver` 审批；
5. 系统拆分计划并在隔离 worktree 开发测试；
6. 独立 Thread 执行代码评审；
7. 人工确认交付；
8. 假 GitHub 创建唯一草稿 PR；
9. WorkflowRun 进入 COMPLETED。

恢复场景覆盖：Java 重启、App Server 崩溃、SSE 断线、重复完成、重复 Webhook、PR 响应丢失和并发操作同一节点。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml verify
npm --prefix web run test:e2e
```

**建议提交**：`覆盖需求交付端到端流程`

---

### 任务 18：连接真实 Codex CLI 与 GitHub 测试仓库

**目标**：在受控环境中验证真实外部契约，不扩大产品权限。

**新增文件**：

- `server/src/test/java/com/flowpilot/smoke/RealCodexContractTest.java`
- `server/src/test/java/com/flowpilot/smoke/RealGitHubDraftPrTest.java`
- `server/src/test/resources/application-smoke.yml`
- `docs/runbooks/windows-local-pilot.md`

**测试先行**：

1. 未显式启用 `smoke` Profile 时，真实外部测试不得执行。
2. Codex 版本与配置版本不匹配时测试明确失败。
3. 真实测试只允许 `:workspace` 或更严格 Profile。
4. GitHub 测试只允许指定测试仓库，并且只创建 Draft PR。

**最小实现**：

- 记录经过验证的 Codex CLI 版本；
- 从真实 App Server 动态读取模型和权限 Profile；
- 使用最小测试 Skill 进行 Thread start/resume/fork/compact 验证；
- 使用测试仓库创建并清理测试分支；
- PR 保持 Draft，清理由测试运行手册明确执行，不自动合并。

**验证**：

```powershell
server\mvnw.cmd -f server\pom.xml -Psmoke -Dtest=RealCodexContractTest test
server\mvnw.cmd -f server\pom.xml -Psmoke -Dtest=RealGitHubDraftPrTest test
```

**建议提交**：`验证真实 Codex 与 GitHub 契约`

---

### 任务 19：完成 Windows 单机打包与恢复演练

**目标**：在一台 Windows 内网主机上可安装、启动、备份和恢复 MVP。

**新增文件**：

- `scripts/build.ps1`
- `scripts/start.ps1`
- `scripts/stop.ps1`
- `scripts/backup.ps1`
- `scripts/restore.ps1`
- `server/src/main/resources/application.yml`
- `server/src/main/resources/application-pilot.yml`
- `docs/runbooks/installation.md`
- `docs/runbooks/backup-and-recovery.md`
- `docs/runbooks/codex-upgrade.md`

**测试先行**：

1. 缺少 PostgreSQL、Codex、Git 或 gh 时启动前检查失败并给出中文说明。
2. 工作区根目录不是绝对路径时拒绝启动。
3. 备份后恢复到空环境，流程、审计和外部引用仍可查询。
4. 服务重启后未完成命令和 Thread 可恢复。

**最小实现**：

- 前端构建结果打入 Spring Boot JAR；
- 启动脚本只读取环境配置，不生成明文密钥文件；
- 备份覆盖 PostgreSQL 和平台 Artifact 文件目录；
- Git 仓库和 Codex rollout 按外部数据源处理，并在恢复文档中说明依赖；
- 提供 Codex 固定版本升级检查表。

**验证**：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

**建议提交**：`完成 Windows 内网试点打包`

## 5. 里程碑与停止点

| 里程碑 | 包含任务 | 可验证结果 |
| --- | --- | --- |
| M1：应用骨架 | 1–4 | 四个角色用户可登录，模块与 CI 基线通过 |
| M2：流程核心 | 5–9 | 固定 Skill Suite 的需求流程可在假适配器下可靠推进 |
| M3：Codex 闭环 | 10–12 | Web 可进行真实语义的多轮 Thread 协作，代码仅写隔离 worktree |
| M4：GitHub 交付 | 13–16 | 员工与管理员页面完整，流程可生成唯一 Draft PR |
| M5：试点就绪 | 17–19 | 端到端、故障恢复、真实 CLI 契约和 Windows 打包通过 |

每个里程碑完成后先评审测试结果和实际 diff，再进入下一个里程碑。不得因为后续任务存在而跳过当前验证。

## 6. 实施前检查

开始任务 1 前必须确认：

- 当前分支不是受保护的远端 `main` 直接开发分支；
- 创建隔离功能分支或 worktree；
- Java 21、Node.js、npm、Git 和 Maven Wrapper 可运行；
- 开发机可使用 PostgreSQL 测试实例或 Testcontainers；
- 本地 Codex 和 GitHub 凭据不会提交到仓库；
- 一次性原型仍只作为视觉参考，不被复制为生产实现。

## 7. 完成定义

MVP 只有同时满足以下条件才能宣称完成：

1. `scripts/verify.ps1` 全部通过；
2. 默认流程无法被跳过或非法推进；
3. 跨需求 Thread 复用被拒绝；
4. Codex 权限批准不能替代业务确认；
5. Codex、Java、浏览器和 GitHub 故障恢复场景通过；
6. 真实测试仓库成功生成且只生成一个 Draft PR；
7. 工作区无未解释的改动；
8. 安装、备份、恢复和 Codex 升级手册经过一次实际演练。
