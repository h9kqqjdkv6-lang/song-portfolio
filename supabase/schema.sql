-- ============================================================================
-- 低空经济解决方案指挥台 · Supabase 数据库 Schema
-- ============================================================================

-- 1. 人物/企业库（mentor-tracker + 低空企业案例）
CREATE TABLE IF NOT EXISTS mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  initials TEXT DEFAULT '',
  title TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  domain_color TEXT DEFAULT '',
  avatar_grad TEXT DEFAULT '',
  hero_grad TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  last_active TEXT DEFAULT '',
  updates INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  sources TEXT[] DEFAULT '{}',
  is_company BOOLEAN DEFAULT FALSE,    -- true=企业案例, false=个人
  company_logo TEXT DEFAULT '',        -- 企业logo URL
  founded_year INTEGER,                -- 成立年份（企业）
  investment_total TEXT DEFAULT '',    -- 累计融资（企业）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 情报条目（动态信息：政策更新、行业事件、融资等）
CREATE TABLE IF NOT EXISTS intel_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT DEFAULT '',
  url TEXT DEFAULT '',
  date TEXT DEFAULT '',
  category TEXT DEFAULT '' CHECK (category IN ('policy','article','speech','interview','funding','product','other')),
  summary TEXT DEFAULT '',
  keywords TEXT[] DEFAULT '{}',
  mentor_id UUID REFERENCES mentors(id) ON DELETE SET NULL,
  scene_tags TEXT[] DEFAULT '{}',       -- 关联场景：高楼灭火/山林搜救/公安执法/医疗应急
  score INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,    -- 是否已验证来源
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 场景配置（替代静态 scenes.json）
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  theme_color TEXT DEFAULT '#F59E0B',
  subtitle TEXT DEFAULT '',
  aircraft_primary TEXT DEFAULT '',
  aircraft_reconnaissance TEXT DEFAULT '',
  policy_basis JSONB DEFAULT '[]'::jsonb,
  operation_flow JSONB DEFAULT '[]'::jsonb,
  compliance JSONB DEFAULT '[]'::jsonb,
  strategy_principles JSONB DEFAULT '{}'::jsonb,
  customer_scripts JSONB DEFAULT '{}'::jsonb,
  briefing_templates JSONB DEFAULT '{}'::jsonb,
  implementation_checklist JSONB DEFAULT '[]'::jsonb,
  tender_hints JSONB DEFAULT '[]'::jsonb,
  document_depth_hints JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 生成的方案
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  industry TEXT DEFAULT '',
  audience TEXT DEFAULT '政府',
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  model_used TEXT DEFAULT 'local',
  route_reason TEXT DEFAULT '',
  input_tokens_est INTEGER DEFAULT 0,
  output_tokens_est INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. API 用量日志
CREATE TABLE IF NOT EXISTS usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  endpoint TEXT DEFAULT '',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_cny NUMERIC(8,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_intel_scene_tags ON intel_items USING GIN (scene_tags);
CREATE INDEX IF NOT EXISTS idx_intel_keywords ON intel_items USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_intel_date ON intel_items (date DESC);
CREATE INDEX IF NOT EXISTS idx_intel_category ON intel_items (category);
CREATE INDEX IF NOT EXISTS idx_mentors_domain ON mentors (domain);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log (created_at DESC);

-- ============================================================================
-- RLS 策略（个人项目，允许 anon 读写）
-- ============================================================================

ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- mentors
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mentors' AND policyname = 'anon_all_mentors') THEN
    CREATE POLICY anon_all_mentors ON mentors FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- intel_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'intel_items' AND policyname = 'anon_all_intel') THEN
    CREATE POLICY anon_all_intel ON intel_items FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- scenes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scenes' AND policyname = 'anon_all_scenes') THEN
    CREATE POLICY anon_all_scenes ON scenes FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- proposals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proposals' AND policyname = 'anon_all_proposals') THEN
    CREATE POLICY anon_all_proposals ON proposals FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- usage_log
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'usage_log' AND policyname = 'anon_all_usage') THEN
    CREATE POLICY anon_all_usage ON usage_log FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 实时订阅（Supabase Realtime）
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE intel_items;
ALTER PUBLICATION supabase_realtime ADD TABLE mentors;
ALTER PUBLICATION supabase_realtime ADD TABLE scenes;
ALTER PUBLICATION supabase_realtime ADD TABLE proposals;
