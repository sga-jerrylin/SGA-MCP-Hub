# SGA MCP Hub — 选择性暴露层设计文档

**日期**: 2026-02-27
**状态**: 已定稿，待实现
**参与方**: Claude（架构）+ Codex（后端评审 8/10）

---

## 背景与目标

### 为什么要做这个

Hub 现在是"全量暴露"：所有工具通过 `/api/mcp` 一个端点出去，导致：

- AI IDE（Claude Code / Cursor）连上来拿到100个工具定义，LLM context 撑爆，工具选择困难
- Skill Creator 前端没有工具目录浏览能力，无法按分类/包逐层筛选

### 核心使用场景

**这套系统是为 claw-agent 团队而生。**

claw 是一个 AI agent 团队，可以自己写 skill 或通过 Skill Creator 生成 skill。每个 skill 是一个可复用的 agent 工作流，内部可能使用来自不同工具包的 10~20 个工具。

**关键洞察：**
- Skill 在创建时就知道自己需要哪些工具
- Skill 运行时应该只给 LLM 看到它需要的工具，不是全量
- 这样每个 skill session 的 LLM context 是干净的、精准的

---

## 完整数据流

### 场景一：Skill 创建（人工交互）

```
Skill Creator UI
  │
  ├─ 第一轮: GET /api/catalog
  │   → 返回分类列表 + 每类包数量
  │   → ["search(3)", "data(5)", "communication(2)", ...]
  │
  ├─ 第一轮展开: GET /api/catalog/:category
  │   → 返回该分类下的包列表
  │   → [{ id: "sga_search", name: "SGA搜索", toolCount: 3 }, ...]
  │
  ├─ 第二轮: GET /api/catalog/:packageId/tools
  │   → 返回包内具体工具 + 完整 inputSchema
  │   → 用户看到：a分类 → b工具包 → 第3号工具
  │
  ├─ 跨分类搜索: GET /api/catalog/search?q=excel
  │   → 全局搜索，返回工具+所在包+分类
  │
  └─ 用户选完工具 → skill manifest 写入 tools[]
      {
        "id": "quarterly-report",
        "tools": ["excel-tools.create_workbook", "sga_search.web_search", "pdf.extract_text"]
      }
```

### 场景二：Skill 运行时（Agent 驱动）

```
Skill 运行
  │
  ├─ 读取 manifest.tools[]
  │
  ├─ 连接 Hub MCP Gateway（带工具列表）
  │   GET /api/mcp?tools=excel-tools.create_workbook,sga_search.web_search,pdf.extract_text
  │   或 POST initialize 时带 params.tools[]
  │
  ├─ Hub 创建 session，仅暴露这 3 个工具
  │   → tools/list 只返回 3 个工具定义
  │
  └─ LLM context 干净，精准执行 skill 逻辑
```

### 场景三：人工 AI IDE 接入（Claude Code / Cursor）

```
用户在 Hub UI 创建 Bundle（选工具包）
  → 生成 URL: http://hub/api/mcp?servers=excel-tools,sga_search
  → 填入 .claude.json
  → LLM 只看到这两个包的工具
```

---

## API 设计

### 工具目录（Skill Creator 用，REST）

```
GET  /api/catalog
     → { categories: [{ id, name, packageCount, toolCount }] }

GET  /api/catalog/:category
     → { packages: [{ id, name, description, toolCount, tags }] }

GET  /api/catalog/:packageId/tools
     → { tools: [{ name, description, inputSchema, category, tags }] }

GET  /api/catalog/search?q=&category=&limit=
     → { tools: [{ name, description, serverId, serverName, category, inputSchema }], total }
```

### MCP Gateway（AI Agent / AI IDE 用）

```
GET  /api/mcp                              → 全量 SSE session（Skill Creator 调试用）
GET  /api/mcp?tools=pkg.tool,pkg.tool2     → 过滤 session（Skill 运行时用）
GET  /api/mcp?servers=pkg1,pkg2            → 按包过滤 session（人工 IDE 用）

POST /api/mcp?sessionId=xxx               → JSON-RPC 入口（现有逻辑保留）
```

---

## 数据模型变更

### manifest.json 扩展（CLI publish 端写入）

```json
{
  "id": "excel-tools",
  "name": "Excel 工具集",
  "category": "data",
  "tags": ["excel", "spreadsheet", "office"],
  "tools": [
    {
      "name": "create_workbook",
      "description": "创建新的 Excel 工作簿",
      "inputSchema": {
        "type": "object",
        "properties": {
          "filename": { "type": "string", "description": "文件名" },
          "sheets": { "type": "array" }
        },
        "required": ["filename"]
      }
    }
  ]
}
```

### Hub DB 新增（tool_catalog 表，从 manifest 解析存入）

```sql
tool_catalog (
  id           uuid PRIMARY KEY,
  package_id   varchar(255),     -- "excel-tools"
  package_name varchar(255),     -- "Excel 工具集"
  category     varchar(100),     -- "data"
  tags         text[],           -- ["excel", "spreadsheet"]
  tool_name    varchar(255),     -- "create_workbook"
  full_name    varchar(255),     -- "excel-tools.create_workbook"
  description  text,
  input_schema jsonb,
  updated_at   timestamp
)
```

---

## 实现优先级（Codex 评审后更新）

### P0a：manifest 契约 + 摄取管道（地基第一步）

- CLI publish 时静态写入完整 tool schema 到 manifest（**build-time，不做 runtime pull**）
- Hub 安装包时解析 manifest tools 写入 tool_catalog 表
- `runtime.service.ts` `toTools()` 保持双读路径：v2 manifest → toolsSummary → 占位符（向后兼容）
- manifest sidecar 新增 `manifestSchemaVersion` 字段

**DB 细节（Codex 补充）：**
```sql
tool_catalog (
  ...
  schema_version   varchar(10),         -- "v2" | "legacy"
  source           varchar(20),         -- "manifest" | "summary" | "legacy"
  UNIQUE(package_id, tool_name),
  UNIQUE(full_name)
)
-- 索引：GIN(tags)，可选 GIN(input_schema jsonb_path_ops)
-- 每行 input_schema 加 max size 守卫
```

### P0b：存量包回填（地基第二步）

- 对已安装的旧包运行 backfill job，用 toolsSummary 填 tool_catalog（source='legacy'）
- 达到数据质量指标后才移除 toolsSummary fallback

**没有 P0a+P0b，分类显示不了，工具详情没有，skill 无法选择。**

### P1：MCP Gateway 工具过滤

- `mcp.controller.ts` 解析/校验 `?tools=` 和 `?servers=` 参数（controller 层负责解析）
- `runtime.service.ts` `listServers()` 接收 filter 参数并执行过滤（service 层负责执行）
- SSE session 握手时绑定 filter scope，**tools/call 也必须在 scope 内校验**（防绕过）
- **P1 必须同时实现 max-tools-per-session 上限**（否则过滤后仍可能撑爆 context）

### P2：工具目录 REST API

- 新增 `catalog.module.ts` + `catalog.controller.ts`
- 接口：`/api/catalog`、`/api/catalog/:category`、`/api/catalog/:packageId/tools`、`/api/catalog/search`
- 数据来自 tool_catalog 表（P0 写入）

---

## 改动文件清单

| 优先级 | 文件 | 变更类型 | 说明 |
|--------|------|---------|------|
| P0 | `packages/backend/src/runtime/runtime.service.ts` | MODIFY | `toTools()` 读真实 manifest schema |
| P0 | `packages/backend/src/repo/repo.service.ts` | MODIFY | 安装包时解析 tools 写入 tool_catalog |
| P0 | `packages/cli/src/commands/publish.command.ts` | MODIFY | publish 时写完整 tool schema 到 manifest |
| P0 | DB migration | NEW | 新增 tool_catalog 表 |
| P1 | `packages/backend/src/mcp/mcp.controller.ts` | MODIFY | 支持 `?tools=` `?servers=` 过滤参数 |
| P1 | `packages/backend/src/runtime/runtime.service.ts` | MODIFY | `listServers()` 加 filter 参数 |
| P2 | `packages/backend/src/catalog/` | NEW | catalog.module/controller/service |
| P2 | `packages/shared/types/api.ts` | MODIFY | 新增 catalog 相关类型 |

**不动：** SSE session 机制、process pool、工具命名格式（pkg.tool）、Minio 存储结构、认证体系。

---

## 技术决策备注

- **为什么不用 Bundle DB**：Skill manifest 自己声明工具，不需要 Hub 端持久化"用户预选"——skill 本身就是最准确的工具声明
- **为什么 tools/list 用 query param 而不是 path param**：标准 MCP 客户端配置 URL，query param 是唯一可行的无侵入传参方式
- **为什么 catalog 用 REST 不用 MCP**：分类浏览、分页、搜索用 REST 更合适，不需要开 MCP session
- **tool_catalog 表 vs 实时从 Minio 读**：写入 DB 支持快速搜索和过滤，不用每次查询都读 Minio

---

*文档由 Claude + Codex 会诊后整理。下一步：Codex 实现 P0。*
