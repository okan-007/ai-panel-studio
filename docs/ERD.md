# Entity-Relationship Diagram -- AI Panel Studio

> Database: SQLite (better-sqlite3) | ORM: None (raw SQL)

---

## 1. ER Diagram

```mermaid
erDiagram
    DISCUSSIONS ||--o{ AGENTS : "has"
    DISCUSSIONS ||--o{ MESSAGES : "contains"
    DISCUSSIONS ||--o{ CONSENSUS_ITEMS : "produces"
    DISCUSSIONS ||--o{ SUMMARIES : "generates"

    DISCUSSIONS {
        TEXT    id              PK "UUID v4"
        TEXT    title           "讨论话题"
        TEXT    background      "背景说明"
        TEXT    status          "draft|ready|running|paused|completed|stopped"
        INTEGER max_rounds      "最大轮次 (1-5)"
        INTEGER current_round   "当前轮次"
        INTEGER agent_count     "嘉宾总数 (含主持人)"
        INTEGER speech_count    "发言总数"
        TEXT    topic_focus     "当前讨论焦点"
        TEXT    template        "debate|roundtable|expert-panel"
        TEXT    created_at      "创建时间 ISO 8601"
        TEXT    updated_at      "更新时间 ISO 8601"
    }

    AGENTS {
        TEXT    id              PK "UUID v4"
        TEXT    discussion_id   FK "关联讨论"
        TEXT    name            "Agent 名称"
        TEXT    title           "职业/头衔"
        TEXT    stance          "核心立场描述"
        TEXT    color           "标识颜色 hex"
        INTEGER is_host         "是否主持人 (0|1)"
        INTEGER sort_order      "排序"
    }

    MESSAGES {
        TEXT    id              PK "UUID v4"
        TEXT    discussion_id   FK "关联讨论"
        TEXT    agent_id        "发言人ID (nullable)"
        TEXT    agent_name      "发言人名称"
        TEXT    agent_role      "发言人角色"
        TEXT    agent_color     "发言人颜色"
        INTEGER round_number    "所属轮次"
        TEXT    type            "opening|speech|closing|system|thinking"
        TEXT    content         "发言内容"
        INTEGER is_streaming    "是否流式推送中"
        TEXT    created_at      "创建时间"
    }

    CONSENSUS_ITEMS {
        TEXT    id                  PK "UUID v4"
        TEXT    discussion_id       FK "关联讨论"
        TEXT    content             "共识/争议内容"
        TEXT    agreed_agent_ids    "同意者ID列表 JSON Array"
        TEXT    disagreed_agent_ids "反对者ID列表 JSON Array"
        INTEGER round_number        "所属轮次"
        TEXT    status              "proposed|agreed|contested"
    }

    SUMMARIES {
        TEXT    id              PK "UUID v4"
        TEXT    discussion_id   FK "关联讨论"
        TEXT    type            "final|round"
        INTEGER round_number    "轮次编号 (round summary)"
        TEXT    content         "总结内容 (Markdown)"
        TEXT    created_at      "创建时间"
    }
```

---

## 2. Table Design Notes

### 2.1 Discussions

- `status` 枚举对应讨论状态机: `draft → ready → running ⇄ paused → completed / stopped`
- `template` 影响嘉宾生成策略 (辩论模式强调对立、圆桌模式强调多样)
- `agent_count` 包含主持人 (如 1 host + 4 guests = 5)

### 2.2 Agents

- 通过 `discussion_id` 外键关联，CASCADE 删除
- `is_host = 1` 只有一条记录 (主持人)
- `sort_order = -1` 确保主持人排在最前

### 2.3 Messages

- `agent_id` 可为 NULL (系统消息)
- `is_streaming` 标记消息是否还在推送中 (SSE 增量更新)
- `type` 区分消息类型，前端可据此渲染不同样式

### 2.4 Consensus Items

- `agreed_agent_ids` / `disagreed_agent_ids` 以 JSON 数组存储
- `status = 'contested'` 且 `disagreed_agent_ids` 非空 = 存在分歧

### 2.5 Summaries

- `type = 'round'` 为轮次总结，`type = 'final'` 为最终总结
- `content` 以 Markdown 格式存储

---

## 3. Index Strategy

| Index | Purpose |
|-------|---------|
| `idx_agents_discussion` | 按讨论ID快速查询 Agent 列表 |
| `idx_messages_discussion` | 按讨论ID查询 Transcript |
| `idx_consensus_discussion` | 按讨论ID查询共识项 |
| `idx_summaries_discussion` | 按讨论ID查询总结 |

所有索引均建在 `discussion_id` 外键上，因为所有查询都以讨论为维度。

---

## 4. Data Lifecycle

```
[创建讨论] → INSERT discussion + INSERT agents
[启动讨论] → UPDATE discussion.status = 'running'
[发言生成] → INSERT message (is_streaming=1)
            → UPDATE message (is_streaming=0) when complete
[共识提炼] → INSERT consensus_item
[生成总结] → INSERT summary
[讨论结束] → UPDATE discussion.status = 'completed'
[删除讨论] → DELETE discussion (CASCADE 删除所有关联数据)
```
