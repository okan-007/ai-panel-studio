/**
 * Database Initialisation Script
 *
 * Creates all tables and populates them with high-quality seed data
 * (5 preset discussions with complete agent lineups).
 *
 * Usage:
 *   npx tsx src/db/init.ts                    # create tables + seed data
 *   npx tsx src/db/init.ts --seed-only        # seed only (tables must exist)
 *   npx tsx src/db/init.ts --reset            # drop all + recreate + seed
 */

import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import path from "node:path";

// =============================================================================
// Configuration
// =============================================================================

const DB_PATH =
  process.env.DB_PATH ?? path.join(import.meta.dirname, "..", "..", "data", "ai-panel.db");

const RESET = process.argv.includes("--reset");
const SEED_ONLY = process.argv.includes("--seed-only");

// =============================================================================
// Database connection
// =============================================================================

// Ensure data directory exists
import fs from "node:fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// =============================================================================
// Schema
// =============================================================================

function createTables(): void {
  if (RESET) {
    console.log("[db] Dropping all tables...");
    db.exec(`
      DROP TABLE IF EXISTS summaries;
      DROP TABLE IF EXISTS consensus_items;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS agents;
      DROP TABLE IF EXISTS discussions;
    `);
  }

  console.log("[db] Creating tables...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS discussions (
      id            TEXT PRIMARY KEY,
      title         TEXT    NOT NULL,
      background    TEXT    NOT NULL DEFAULT '',
      status        TEXT    NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','ready','running','paused','completed','stopped')),
      max_rounds    INTEGER NOT NULL DEFAULT 3,
      current_round INTEGER NOT NULL DEFAULT 0,
      agent_count   INTEGER NOT NULL DEFAULT 0,
      speech_count  INTEGER NOT NULL DEFAULT 0,
      topic_focus   TEXT    NOT NULL DEFAULT '',
      template      TEXT             DEFAULT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id             TEXT PRIMARY KEY,
      discussion_id  TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
      name           TEXT    NOT NULL,
      title          TEXT    NOT NULL,
      stance         TEXT    NOT NULL,
      color          TEXT    NOT NULL,
      is_host        INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id             TEXT PRIMARY KEY,
      discussion_id  TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
      agent_id       TEXT,
      agent_name     TEXT    NOT NULL,
      agent_role     TEXT    NOT NULL DEFAULT '',
      agent_color    TEXT    NOT NULL DEFAULT '#6B7280',
      round_number   INTEGER NOT NULL DEFAULT 1,
      type           TEXT    NOT NULL DEFAULT 'speech'
                            CHECK (type IN ('opening','speech','closing','system','thinking')),
      content        TEXT    NOT NULL DEFAULT '',
      is_streaming   INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consensus_items (
      id                TEXT PRIMARY KEY,
      discussion_id     TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
      content           TEXT    NOT NULL,
      agreed_agent_ids  TEXT    NOT NULL DEFAULT '[]',
      disagreed_agent_ids TEXT   NOT NULL DEFAULT '[]',
      round_number      INTEGER NOT NULL DEFAULT 1,
      status            TEXT    NOT NULL DEFAULT 'proposed'
                                CHECK (status IN ('proposed','agreed','contested'))
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id            TEXT PRIMARY KEY,
      discussion_id TEXT    NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
      type          TEXT    NOT NULL DEFAULT 'final',
      round_number  INTEGER,
      content       TEXT    NOT NULL DEFAULT '',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agents_discussion     ON agents(discussion_id);
    CREATE INDEX IF NOT EXISTS idx_messages_discussion    ON messages(discussion_id);
    CREATE INDEX IF NOT EXISTS idx_consensus_discussion   ON consensus_items(discussion_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_discussion   ON summaries(discussion_id);
  `);

  console.log("[db] Tables created successfully.");
}

// =============================================================================
// Seed Data -- 5 high-quality preset discussions
// =============================================================================

interface SeedAgent {
  name: string;
  title: string;
  stance: string;
  color: string;
  isHost: boolean;
  sortOrder: number;
}

interface SeedDiscussion {
  title: string;
  background: string;
  template: string;
  maxRounds: number;
  status: string;
  agents: SeedAgent[];
}

const SEED_DISCUSSIONS: SeedDiscussion[] = [
  // -------------------------------------------------------------------------
  // 1. AI & Employment
  // -------------------------------------------------------------------------
  {
    title: "人工智能是否会大规模取代人类工作？",
    background:
      "随着GPT等大语言模型的快速发展，AI正在渗透到翻译、编程、设计、法律等多个白领领域。本次讨论旨在从技术、经济、社会三个维度探讨AI对就业市场的深远影响。",
    template: "debate",
    maxRounds: 3,
    status: "completed",
    agents: [
      {
        name: "AI主持人",
        title: "资深科技媒体人",
        stance: "围绕AI与就业议题保持中立客观，引导各方充分表达观点。",
        color: "#6B7280",
        isHost: true,
        sortOrder: -1,
      },
      {
        name: "张明远",
        title: "AI伦理研究所所长",
        stance: "AI将取代部分重复性工作，但同时会创造新岗位。关键在于建立全民再教育体系，帮助劳动者完成技能转型。",
        color: "#3B82F6",
        isHost: false,
        sortOrder: 0,
      },
      {
        name: "王晓峰",
        title: "计算机科学AI研究员",
        stance: "技术迭代速度远超社会适应速度。未来5年内，约30%的白领工作流程将被AI重塑，我们必须加速制定应对方案。",
        color: "#EF4444",
        isHost: false,
        sortOrder: 1,
      },
      {
        name: "赵雪梅",
        title: "社会学公共政策教授",
        stance: "关注AI对低收入群体的冲击最为严重。政策制定应以保护弱势劳动者为首要目标，建立AI过渡期社会保障机制。",
        color: "#8B5CF6",
        isHost: false,
        sortOrder: 2,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 2. Climate Change
  // -------------------------------------------------------------------------
  {
    title: "全球气候变化：碳减排目标能否如期实现？",
    background:
      "2024年全球平均气温再创历史新高，极端天气事件频发。尽管《巴黎协定》设定了1.5°C温控目标，但各国减排承诺与实际行动之间存在巨大鸿沟。",
    template: "roundtable",
    maxRounds: 3,
    status: "completed",
    agents: [
      {
        name: "AI主持人",
        title: "环境议题资深主持人",
        stance: "围绕气候议题保持中立客观立场，引导各方探讨可行的减排路径。",
        color: "#6B7280",
        isHost: true,
        sortOrder: -1,
      },
      {
        name: "李思齐",
        title: "环境政策研究所主任",
        stance: "当前各国NDC减排承诺总和仍不足以实现1.5°C目标。需要建立更强的国际约束机制和碳定价体系。",
        color: "#10B981",
        isHost: false,
        sortOrder: 0,
      },
      {
        name: "陈志强",
        title: "新能源企业CEO",
        stance: "技术创新是破局关键。光伏和储能成本在过去十年下降了90%，市场力量正在推动能源转型加速。",
        color: "#06B6D4",
        isHost: false,
        sortOrder: 1,
      },
      {
        name: "刘雨桐",
        title: "国际气候谈判专家",
        stance: "发展中国家面临发展与减排的双重压力，发达国家应兑现每年1000亿美元的气候资金承诺，建立公平的转型机制。",
        color: "#F97316",
        isHost: false,
        sortOrder: 2,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 3. Digital Currency
  // -------------------------------------------------------------------------
  {
    title: "央行数字货币CBDC：金融体系的未来还是过度监管的起点？",
    background:
      "全球已有超过130个国家探索CBDC，中国数字人民币试点已覆盖26个城市。CBDC在提升支付效率和金融普惠的同时，也引发了隐私保护和政府过度监控的担忧。",
    template: "debate",
    maxRounds: 3,
    status: "ready",
    agents: [
      {
        name: "AI主持人",
        title: "财经频道主持人",
        stance: "围绕数字货币议题保持中立，平衡技术创新与风险防范的双重视角。",
        color: "#6B7280",
        isHost: true,
        sortOrder: -1,
      },
      {
        name: "张明远",
        title: "央行数字货币研究所高级研究员",
        stance: "CBDC是货币形态演进的必然方向，可编程货币将大幅提升货币政策传导效率和金融监管精准度。",
        color: "#3B82F6",
        isHost: false,
        sortOrder: 0,
      },
      {
        name: "李思齐",
        title: "金融科技法律事务所合伙人",
        stance: "必须建立严格的隐私保护法律框架。CBDC的可追踪特性若缺乏制衡，可能导致公民金融隐私权的全面侵蚀。",
        color: "#F59E0B",
        isHost: false,
        sortOrder: 1,
      },
      {
        name: "陈志强",
        title: "区块链金融科技公司创始人",
        stance: "去中心化金融与CBDC可以共存互补。政府应鼓励创新沙盒，而非用CBDC排挤民间金融创新。",
        color: "#EC4899",
        isHost: false,
        sortOrder: 2,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 4. Remote Work
  // -------------------------------------------------------------------------
  {
    title: "远程办公：后疫情时代的工作模式革命",
    background:
      "新冠疫情彻底改变了全球工作方式。2025年，全球仍有约40%的知识工作者采用混合办公模式。企业面临管理效率、团队凝聚力与员工自由度之间的再平衡。",
    template: "expert-panel",
    maxRounds: 3,
    status: "ready",
    agents: [
      {
        name: "AI主持人",
        title: "组织管理专栏主持人",
        stance: "围绕远程办公议题保持客观，引导各方从管理、心理、技术角度展开讨论。",
        color: "#6B7280",
        isHost: true,
        sortOrder: -1,
      },
      {
        name: "王晓峰",
        title: "组织行为学教授",
        stance: "混合办公是未来趋势，但需要重新设计绩效评估体系——从'工时导向'转向'成果导向'。",
        color: "#EF4444",
        isHost: false,
        sortOrder: 0,
      },
      {
        name: "赵雪梅",
        title: "职业心理健康咨询师",
        stance: "远程办公模糊了工作与生活的边界，导致隐性过劳和社交孤立。企业需建立数字断联权和心理健康支持机制。",
        color: "#8B5CF6",
        isHost: false,
        sortOrder: 1,
      },
      {
        name: "刘雨桐",
        title: "企业数字化转型顾问",
        stance: "异步协作工具和AI办公助手正在消除远程协作的效率瓶颈。未来属于'数字优先'的组织形态。",
        color: "#06B6D4",
        isHost: false,
        sortOrder: 2,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 5. Gene Editing Ethics
  // -------------------------------------------------------------------------
  {
    title: "基因编辑技术CRISPR：科学进步还是伦理危机？",
    background:
      "CRISPR-Cas9技术使基因编辑变得廉价而高效，为遗传病治疗带来革命性突破。但2018年'基因编辑婴儿'事件引发全球震惊，人类胚胎基因编辑的伦理边界在哪里？",
    template: "debate",
    maxRounds: 3,
    status: "ready",
    agents: [
      {
        name: "AI主持人",
        title: "科学伦理议题主持人",
        stance: "围绕基因编辑议题保持中立客观，引导各方在科学进步与伦理约束之间寻找平衡点。",
        color: "#6B7280",
        isHost: true,
        sortOrder: -1,
      },
      {
        name: "张明远",
        title: "分子生物学研究所主任",
        stance: "CRISPR在体细胞基因治疗领域已展现巨大潜力，镰刀型细胞贫血症等遗传病有望被治愈。应严格区分体细胞编辑与生殖细胞编辑。",
        color: "#3B82F6",
        isHost: false,
        sortOrder: 0,
      },
      {
        name: "李思齐",
        title: "生命伦理委员会副主任",
        stance: "人类胚胎基因编辑不可逾越红线。'设计婴儿'将加剧社会不平等，必须建立具有法律约束力的国际伦理框架。",
        color: "#F59E0B",
        isHost: false,
        sortOrder: 1,
      },
      {
        name: "赵雪梅",
        title: "医学社会学家",
        stance: "基因编辑技术的可及性将重塑社会公平。如果不加以规制，可能催生'基因阶层'——富人可以购买更优质的基因，而穷人被进一步边缘化。",
        color: "#8B5CF6",
        isHost: false,
        sortOrder: 2,
      },
    ],
  },
];

// =============================================================================
// Seed function
// =============================================================================

function seedDatabase(): void {
  console.log("[db] Seeding database with preset discussions...");

  const insertDiscussion = db.prepare(`
    INSERT OR REPLACE INTO discussions (id, title, background, status, max_rounds, current_round, agent_count, speech_count, template)
    VALUES (@id, @title, @background, @status, @max_rounds, @current_round, @agent_count, @speech_count, @template)
  `);

  const insertAgent = db.prepare(`
    INSERT OR REPLACE INTO agents (id, discussion_id, name, title, stance, color, is_host, sort_order)
    VALUES (@id, @discussion_id, @name, @title, @stance, @color, @is_host, @sort_order)
  `);

  const insertAll = db.transaction(() => {
    for (const disc of SEED_DISCUSSIONS) {
      const discussionId = uuid();
      const now = new Date().toISOString();
      const agentCount = disc.agents.length;

      // Generate some mock speech counts for completed discussions
      const speechCount = disc.status === "completed" ? agentCount * (disc.maxRounds || 3) : 0;
      const currentRound = disc.status === "completed" ? disc.maxRounds : 0;

      insertDiscussion.run({
        id: discussionId,
        title: disc.title,
        background: disc.background,
        status: disc.status,
        max_rounds: disc.maxRounds,
        current_round: currentRound,
        agent_count: agentCount,
        speech_count: speechCount,
        template: disc.template,
      });

      for (const agent of disc.agents) {
        insertAgent.run({
          id: uuid(),
          discussion_id: discussionId,
          name: agent.name,
          title: agent.title,
          stance: agent.stance,
          color: agent.color,
          is_host: agent.isHost ? 1 : 0,
          sort_order: agent.sortOrder,
        });
      }

      console.log(`  [seed] ${disc.title} (${agentCount} agents, ${disc.template})`);
    }
  });

  insertAll();
  console.log(`[db] Seeded ${SEED_DISCUSSIONS.length} discussions.`);
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  console.log("[db] AI Panel Studio -- Database Initialisation");
  console.log(`[db] Database path: ${DB_PATH}`);

  if (!SEED_ONLY) {
    createTables();
  }

  seedDatabase();

  console.log("[db] Done.");
  db.close();
}

main();
