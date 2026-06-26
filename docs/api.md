# API Reference -- AI Panel Studio

> Base URL: `http://localhost:3001/api` | Content-Type: `application/json`

---

## 1. Discussions

### 1.1 List Discussions

```
GET /api/discussions
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | - | Filter: `draft`, `ready`, `running`, `paused`, `completed`, `stopped` |
| `search` | string | - | Search in title and background |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 100) |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "人工智能是否会取代人类工作？",
      "background": "...",
      "status": "completed",
      "max_rounds": 3,
      "current_round": 3,
      "agent_count": 4,
      "speech_count": 12,
      "created_at": "2026-06-26T07:00:00.000Z",
      "updated_at": "2026-06-26T07:15:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

### 1.2 Create Discussion

```
POST /api/discussions
```

**Request Body:**

```json
{
  "topic": "人工智能是否应该拥有法律人格？",
  "guestCount": 4,
  "background": "探讨AI的法律地位及相关的权利与责任问题",
  "template": "debate",
  "maxRounds": 3
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `topic` | string | **Yes** | - | Discussion topic (max 200 chars) |
| `guestCount` | number | No | `4` | Number of guests (2-6) |
| `background` | string | No | `""` | Background context (max 2000 chars) |
| `template` | string | No | - | `debate`, `roundtable`, or `expert-panel` |
| `maxRounds` | number | No | `3` | Max discussion rounds (1-5) |

**Response `201`:**

Returns full discussion detail (see 1.3).

---

### 1.3 Get Discussion Detail

```
GET /api/discussions/:id
```

**Response `200`:**

```json
{
  "id": "uuid",
  "title": "人工智能是否应该拥有法律人格？",
  "background": "...",
  "status": "ready",
  "max_rounds": 3,
  "current_round": 0,
  "agent_count": 5,
  "speech_count": 0,
  "topic_focus": "",
  "template": "debate",
  "created_at": "...",
  "updated_at": "...",
  "agents": [
    {
      "id": "uuid",
      "name": "AI主持人",
      "title": "圆桌讨论引导者",
      "stance": "保持中立客观立场...",
      "color": "#6B7280",
      "is_host": 1,
      "sort_order": -1
    }
  ],
  "messages": [],
  "consensus_items": [],
  "summaries": []
}
```

---

### 1.4 Delete Discussion

```
DELETE /api/discussions/:id
```

**Response `200`:**

```json
{ "message": "Discussion deleted" }
```

---

## 2. Agents (Lineup)

### 2.1 Configure / Regenerate Agent Lineup

```
POST /api/discussions/:id/agents
```

**Request Body (manual assignment):**

```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "张明远",
      "title": "AI伦理学家",
      "stance": "支持渐进式赋权...",
      "color": "#3B82F6",
      "isHost": false,
      "sortOrder": 0
    }
  ]
}
```

**Request Body (auto-regenerate, empty body):**

```json
{}
```

**Response `200`:** Returns full discussion detail with updated agents.

---

### 2.2 Generate Lineup (Standalone)

```
POST /api/discussions/generate-lineup
```

**Request Body:**

```json
{
  "topic": "人工智能与就业",
  "guestCount": 4,
  "background": "...",
  "template": "debate"
}
```

**Response `200`:**

```json
{
  "host": {
    "id": "uuid",
    "name": "AI主持人",
    "title": "资深媒体人",
    "stance": "中立客观...",
    "color": "#3B82F6",
    "isHost": true,
    "sortOrder": -1
  },
  "guests": [
    {
      "id": "uuid",
      "name": "张明远",
      "title": "AI伦理研究所所长",
      "stance": "...",
      "color": "#10B981",
      "isHost": false,
      "sortOrder": 0
    }
  ]
}
```

---

## 3. Discussion Control

### 3.1 Start Discussion

```
POST /api/discussions/:id/start
```

Starts the discussion. The server responds immediately and then begins the async discussion engine in the background, pushing events via SSE.

**Response `200`:**

```json
{
  "message": "Discussion started",
  "status": "running",
  "current_round": 1
}
```

**Error `400`:** If fewer than 3 agents (1 host + 2 guests) are configured.

---

### 3.2 Pause Discussion

```
POST /api/discussions/:id/pause
```

**Response `200`:** `{ "message": "Discussion paused", "status": "paused" }`

---

### 3.3 Resume Discussion

```
POST /api/discussions/:id/resume
```

Resumes a paused discussion. The discussion engine restarts from where it left off.

**Response `200`:** `{ "message": "Discussion resumed", "status": "running" }`

---

### 3.4 Stop Discussion

```
POST /api/discussions/:id/stop
```

**Response `200`:** `{ "message": "Discussion stopped", "status": "stopped" }`

---

### 3.5 Advance to Next Round

```
POST /api/discussions/:id/next-round
```

Manually advances the discussion to the next round.

**Response `200`:**

```json
{
  "message": "Advanced to next round",
  "status": "running",
  "current_round": 2
}
```

---

## 4. Real-time Events (SSE)

### 4.1 Connect to SSE Stream

```
GET /api/discussions/:id/events
```

**Response `200`:** `Content-Type: text/event-stream`

Persistent connection. Server pushes named events:

| Event | Data | Description |
|-------|------|-------------|
| `connected` | `{ "discussion_id": "..." }` | Initial connection confirmation |
| `status_change` | `{ "status": "running" }` | Discussion status changed |
| `round_change` | `{ "round_number": 2, "topic_focus": "第2轮" }` | New round started |
| `message` | `{ "id": "...", "agent_id": "...", "content": "...", "is_streaming": true }` | Streaming speech content |
| `message_complete` | `{ "id": "...", "content": "...", "is_streaming": false }` | Speech finished |
| `consensus_new` | `{ "id": "...", "content": "...", "agreed_agent_ids": [...], "disagreed_agent_ids": [...], "round_number": 1 }` | New consensus item |
| `summary_new` | `{ "type": "final", "content": "## 讨论总结\n\n..." }` | Summary generated |
| `error` | `{ "code": "ENGINE_ERROR", "message": "..." }` | Error event |

**Connection lifecycle:**
- Heartbeat every 30 seconds (`: heartbeat\n\n`)
- Auto-reconnect supported by client-side `SSEConnection` class
- Connection closes when discussion ends or client disconnects

---

## 5. Transcript & Messages

### 5.1 Get Transcript (Messages)

```
GET /api/discussions/:id/transcript
GET /api/discussions/:id/messages
```

Both endpoints are equivalent.

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "discussion_id": "uuid",
      "agent_id": "uuid",
      "agent_name": "AI主持人",
      "agent_role": "引导者",
      "agent_color": "#6B7280",
      "round_number": 1,
      "type": "opening",
      "content": "欢迎各位专家来到今天的圆桌讨论...",
      "is_streaming": 0,
      "created_at": "2026-06-26T07:01:00.000Z"
    }
  ],
  "total": 12
}
```

---

## 6. Consensus

### 6.1 Get Consensus Items

```
GET /api/discussions/:id/consensus
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "discussion_id": "uuid",
      "content": "AI将显著改变就业结构，需要提前准备",
      "agreed_agent_ids": ["uuid-1", "uuid-2", "uuid-3"],
      "disagreed_agent_ids": [],
      "round_number": 1,
      "status": "agreed"
    },
    {
      "id": "uuid",
      "discussion_id": "uuid",
      "content": "政府是否应通过立法限制AI应用速度",
      "agreed_agent_ids": ["uuid-2"],
      "disagreed_agent_ids": ["uuid-1"],
      "round_number": 2,
      "status": "contested"
    }
  ],
  "total": 2
}
```

---

## 7. Summary

### 7.1 Generate Summary

```
POST /api/discussions/:id/summarize
```

Triggers Deepseek API to generate a Markdown summary from the full transcript and consensus items.

**Response `201`:**

```json
{
  "id": "uuid",
  "type": "final",
  "content": "## 讨论总结\n\n### 核心观点\n- 张明远认为..."
}
```

### 7.2 Get Summaries

```
GET /api/discussions/:id/summaries
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "final",
      "round_number": null,
      "content": "## 讨论总结\n\n...",
      "created_at": "2026-06-26T07:15:00.000Z"
    }
  ],
  "total": 1
}
```

---

## 8. Agent Templates

### 8.1 List Agent Templates

```
GET /api/agent-templates
```

**Response `200`:**

```json
{
  "data": [
    { "id": "tpl-1", "name": "理性分析师", "role": "分析师", "avatar": "analyst", "is_preset": true },
    { "id": "tpl-2", "name": "科技法律顾问", "role": "法律顾问", "avatar": "law", "is_preset": true },
    { "id": "tpl-3", "name": "社会学家", "role": "学者", "avatar": "scholar", "is_preset": true },
    { "id": "tpl-4", "name": "企业家", "role": "企业家", "avatar": "ceo", "is_preset": true },
    { "id": "tpl-5", "name": "政策分析师", "role": "分析师", "avatar": "policy", "is_preset": true },
    { "id": "tpl-6", "name": "主持人", "role": "主持人", "avatar": "host", "is_preset": true }
  ]
}
```

---

## 9. Health Check

### 9.1 Health

```
GET /api/health
```

**Response `200`:**

```json
{
  "status": "ok",
  "uptime": 123.456,
  "sseClients": {
    "discussion-uuid-1": 2,
    "discussion-uuid-2": 1
  }
}
```

---

## 10. Error Responses

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

**HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request (validation error) |
| `404` | Not Found |
| `500` | Internal Server Error |
