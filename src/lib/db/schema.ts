/**
 * 물리 스키마. SRS §7 의 데이터 논리 계약을 실현한다.
 *
 * 지켜야 하는 것(SDD §2 불변조건):
 *  - candidates 와 records 는 서로 다른 표다. 확인 동작 없이 records 에 들어가는 길이 없다.
 *  - records.category_id 는 분류의 '식별자'를 참조한다. 이름을 참조하지 않는다.
 *  - 삭제는 records.deleted_at 표시로 하고 행을 지우지 않는다.
 */

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001-init',
    sql: `
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  seeded      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  -- 삭제는 보관 처리다. 행을 지우면 그 분류에 속했던 기록의 귀속이 끊겨
  -- NFR-CAT-01(변경·삭제 전후 귀속 보존)이 깨진다. 선택지에서만 빠진다.
  archived_at TEXT
);
-- 이름 중복 금지는 '살아 있는' 분류에만 적용한다. 보관된 이름은 다시 쓸 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_dir_name
  ON categories(direction, name) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  rel_path   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  note        TEXT NOT NULL DEFAULT '',
  merchant    TEXT,
  image_id    TEXT REFERENCES images(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_records_date  ON records(date)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_records_cat   ON records(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_records_dir   ON records(direction)   WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS candidates (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL CHECK (source IN ('text','image','recurring','manual')),
  raw_input    TEXT NOT NULL DEFAULT '',
  date         TEXT,
  amount       INTEGER,
  direction    TEXT CHECK (direction IN ('income','expense')),
  category_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  -- 해석이 처음 배정한 분류. 확인 단계에서 사용자가 이것을 바꿨는지 판단해
  -- FR-CAT-07 의 학습 규칙을 남길지 정한다.
  suggested_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  merchant     TEXT,
  note         TEXT NOT NULL DEFAULT '',
  image_id     TEXT REFERENCES images(id) ON DELETE SET NULL,
  unresolved   TEXT NOT NULL DEFAULT '[]',
  provider     TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period_key  TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_budget ON budgets(category_id, period_key);

CREATE TABLE IF NOT EXISTS recurring (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  note        TEXT NOT NULL DEFAULT '',
  merchant    TEXT,
  anchor_day  INTEGER NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

-- 반복 항목이 어느 기간에 대해 이미 후보를 냈는지. 같은 달에 두 번 내지 않기 위한 것이며,
-- 사용자가 후보를 받아들이지 않아도 이 표시는 남는다(PRD US-04-01 수용 조건 3).
CREATE TABLE IF NOT EXISTS recurring_emissions (
  recurring_id TEXT NOT NULL REFERENCES recurring(id) ON DELETE CASCADE,
  period_key   TEXT NOT NULL,
  emitted_at   TEXT NOT NULL,
  PRIMARY KEY (recurring_id, period_key)
);

-- FR-CAT-07 의 판정 근거. 같은 거래 대상에 대해 가장 나중의 것이 우선한다.
CREATE TABLE IF NOT EXISTS merchant_rules (
  merchant    TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  updated_at  TEXT NOT NULL
);
`,
  },
];

export const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 4000',
];
