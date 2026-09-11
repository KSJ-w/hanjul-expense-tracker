import type {
  InterpretInput,
  InterpretOutcome,
  InterpretProvider,
  InterpretedItem,
  QueryInput,
  QueryOutcome,
  QueryPart,
  QueryTerm,
} from './types';
import { isISODate } from '../domain/date';
import type { RecordQuery } from '../domain/types';

/**
 * 외부 해석 수단 — ADR-010(ADR-003 을 Superseded 한 결정).
 *
 * **이 파일이 제품에서 네트워크로 나가는 유일한 지점이다.**
 * SDD §2 불변조건 2 이며, test/boundary.test.ts 가 다른 곳에 나가는 호출이 없는지 검사한다.
 * 여기에 호출을 하나 더 늘리면 FR-ENTRY-15 의 판정 근거가 무너진다.
 *
 * 키가 없으면 isAvailable() 이 false 다. 그때는 경계가 기기 안 수단으로 넘긴다.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 기본 모델.
 *
 * `gemini-2.5-flash` 는 목록 조회에는 나오지만 **새로 발급한 키로 호출하면 404** 다
 * ("no longer available to new users"). 그 응답이 후속으로 지목한 것이 이 모델이다.
 * 더 새 모델(3.7·3.8-flash)도 이 키로 열려 있으나, 공급자가 문서로 지목한 이전 경로를
 * 기본값으로 둔다 — 무료 등급의 한도는 모델마다 다르고 우리가 통제할 수 없다.
 * 바꾸려면 코드가 아니라 `GEMINI_MODEL` 환경 변수를 쓴다.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const TIMEOUT_MS = 15_000;

function apiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

/**
 * 잠깐 막힌 것과 정말 안 되는 것 — 앞의 것은 **다시 물으면 된다.**
 *
 * 429(너무 잦음)와 5xx(과부하·일시 장애)는 우리가 잘못한 것이 아니라 그쪽이
 * 지금 바쁜 것이다. 여기서 한 번도 다시 묻지 않으면 그때마다 기기 안 규칙으로
 * 떨어지고, 사용자는 **자유롭게 적은 문장이 통하지 않는다**고 느낀다
 * (실제로 겪음 — 503 이 이어지는 동안 규칙 기반만 돌았다).
 */
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRIES = 2;
const RETRY_WAIT_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Asked =
  | { ok: true; raw: string }
  | { ok: false; failure: 'no-response' | 'unparseable'; detail: string };

/**
 * **제품에서 네트워크로 나가는 유일한 자리.** 기록 해석과 조회 해석이 함께 쓴다.
 * 호출을 다른 함수로 옮기더라도 이 파일 밖으로 내보내지 않는다(§2 불변조건 1).
 */
async function askGemini(
  key: string,
  parts: Record<string, unknown>[],
  schema: unknown,
  what: string,
): Promise<Asked> {
  let lastDetail = '';

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastDetail = `HTTP ${res.status} ${shorten(text)}`;
        if (RETRY_STATUS.has(res.status) && attempt < RETRIES) {
          console.warn(`[interpret:${what}] ${lastDetail} — ${RETRY_WAIT_MS}ms 뒤 다시 물어본다 (${attempt + 1}/${RETRIES})`);
          clearTimeout(timer);
          await sleep(RETRY_WAIT_MS * (attempt + 1));
          continue;
        }
        return { ok: false, failure: 'no-response', detail: lastDetail };
      }

      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return { ok: false, failure: 'unparseable', detail: '응답에 본문이 없다' };
      return { ok: true, raw };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastDetail = msg === 'The operation was aborted.' ? `${TIMEOUT_MS}ms 안에 응답이 없었다` : msg;
      // 끊긴 것도 다시 물어볼 값이 있다 — 다만 마지막 시도였으면 여기서 끝낸다.
      if (attempt < RETRIES) {
        await sleep(RETRY_WAIT_MS * (attempt + 1));
        continue;
      }
      return { ok: false, failure: 'no-response', detail: lastDetail };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, failure: 'no-response', detail: lastDetail || '알 수 없는 실패' };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD. 알 수 없으면 빈 문자열' },
          amount: { type: 'integer', description: '원 단위 정수. 알 수 없으면 0' },
          // enum 에 빈 문자열을 넣으면 400 이다("enum[2]: cannot be empty").
          // 그래서 '모름'은 빈 값이 아니라 **항목을 빼는 것**으로 표현한다 —
          // required 에서 direction 을 뺀 이유가 이것이다. normalize() 가 없는 값을 null 로 받는다.
          direction: { type: 'string', enum: ['income', 'expense'] },
          categoryName: { type: 'string', description: '주어진 분류 목록에 있는 이름만. 없으면 빈 문자열' },
          merchant: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['date', 'amount', 'categoryName', 'merchant', 'note'],
      },
    },
  },
  required: ['items'],
} as const;

function buildPrompt(input: InterpretInput): string {
  const names = input.categories.map((c) => `${c.name}(${c.direction})`).join(', ');
  return [
    '너는 한국어 가계부 입력을 구조화하는 도구다.',
    `오늘은 ${input.today} 이다. "어제", "지난주 금요일" 같은 표현은 이 날짜를 기준으로 계산한다.`,
    '금액은 원 단위 정수로 바꾼다. "3만5천원"은 35000 이다.',
    `분류는 반드시 다음 목록 안의 이름만 쓴다. 목록에 맞는 것이 없으면 빈 문자열로 둔다: ${names}`,
    '목록에 없는 분류 이름을 새로 만들어서는 안 된다.',
    '한 입력에 거래가 여러 건이면 각각을 items 의 별개 원소로 만든다.',
    '확실하지 않은 항목은 지어내지 말고 빈 값(빈 문자열 또는 0)으로 둔다.',
    '수입인지 지출인지 확실하지 않으면 direction 항목 자체를 빼고 응답한다.',
  ].join('\n');
}

export const geminiProvider: InterpretProvider = {
  name: 'gemini',
  usesNetwork: true,
  /*
   * FR-ENTRY-16 — 여기 적힌 것이 설정 화면이 보여 주는 '나가는 항목'이다.
   * 나가는 길이 둘(기록 입력·내역 검색)이 되었으므로 항목마다 **어느 길에서**
   * 나가는지를 함께 적는다. 코드가 늘고 이 목록이 그대로면 안내와 실제가 어긋난다(§8).
   */
  outboundFields: [
    { key: 'text', label: '적으신 문장', detail: '기록 입력창·내역 검색창에 적은 내용 그대로' },
    { key: 'image', label: '첨부한 이미지', detail: '영수증·결제 내역 이미지 원본 (기록 입력에서만)' },
    { key: 'categories', label: '태그 이름 목록', detail: '태그의 이름만. 기록 내용은 포함하지 않음' },
    { key: 'today', label: '오늘 날짜', detail: '상대적인 날짜·기간 표현을 계산하기 위한 기준일' },
  ],

  isAvailable: () => apiKey() !== undefined,

  async interpret(input: InterpretInput): Promise<InterpretOutcome> {
    const started = Date.now();
    const key = apiKey();
    if (!key) {
      return {
        items: [],
        providerName: geminiProvider.name,
        degraded: false,
        failure: 'unavailable',
        elapsedMs: Date.now() - started,
      };
    }

    const parts: Record<string, unknown>[] = [{ text: buildPrompt(input) }];
    if (input.text) parts.push({ text: `입력: ${input.text}` });
    if (input.image) {
      parts.push({ inline_data: { mime_type: input.image.mime, data: input.image.base64 } });
    }

    const asked = await askGemini(key, parts, RESPONSE_SCHEMA, 'record');
    if (!asked.ok) return fail(started, asked.failure, asked.detail);

    try {
      const parsed = JSON.parse(asked.raw) as { items?: unknown[] };
      const items = normalize(parsed.items ?? [], input);
      return {
        items,
        providerName: geminiProvider.name,
        degraded: false,
        failure: items.length === 0 ? 'unparseable' : undefined,
        elapsedMs: Date.now() - started,
      };
    } catch (e) {
      return fail(started, 'unparseable', e instanceof Error ? e.message : String(e));
    }
  },

  /**
   * 조회 문장을 조건으로 바꾼다 — FR-VIEW-13.
   *
   * 기록 해석과 **같은 파일 안의 같은 종류의 호출**이다. 나가는 길을 다른 파일로
   * 늘리는 것이 아니라 여기 머무는 것이 §2 불변조건 1 이 요구하는 것이다.
   */
  async interpretQuery(input: QueryInput): Promise<QueryOutcome> {
    const started = Date.now();
    const key = apiKey();
    const empty = { parts: [] as QueryPart[] };
    if (!key) {
      return {
        ...empty,
        providerName: geminiProvider.name,
        degraded: false,
        failure: 'unavailable',
        elapsedMs: Date.now() - started,
      };
    }

    const asked = await askGemini(
      key,
      [{ text: buildQueryPrompt(input) }, { text: `찾을 것: ${input.text}` }],
      QUERY_SCHEMA,
      'query',
    );
    if (!asked.ok) return { ...empty, ...failQuery(started, asked.failure, asked.detail) };

    try {
      const parts = normalizeParts(JSON.parse(asked.raw), input);
      return {
        parts,
        providerName: geminiProvider.name,
        degraded: false,
        failure: parts.length === 0 ? 'unparseable' : undefined,
        elapsedMs: Date.now() - started,
      };
    } catch (e) {
      return { ...empty, ...failQuery(started, 'unparseable', e instanceof Error ? e.message : String(e)) };
    }
  },
};

/** 조회 해석의 실패. 기록 해석과 같은 이유로 서버 로그에 남긴다 — 조용히 삼키지 않는다. */
function failQuery(started: number, failure: 'no-response' | 'unparseable', detail: string) {
  console.warn(`[interpret:query] ${geminiProvider.name}(${MODEL}) 실패: ${failure} — ${detail}`);
  return {
    providerName: geminiProvider.name,
    degraded: false,
    failure,
    failureDetail: detail,
    elapsedMs: Date.now() - started,
  };
}

/**
 * 조회 조건의 응답 모양 — FR-VIEW-13.
 *
 * `enum` 에 빈 문자열을 넣을 수 없으므로(HTTP 400) '모름'은 **항목을 빼는 것**으로
 * 표현한다 — direction 이 required 에 없는 이유가 그것이다(입력 해석 스키마와 같다).
 */
const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      description: '조회 하나마다 한 원소. 나눠 달라는 말이 없으면 원소 하나다',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: "나눠 볼 때 이 몫의 이름('지출'·'수입' 등). 나누지 않았으면 빈 문자열" },
          from: { type: 'string', description: 'YYYY-MM-DD. 기간의 시작. 없으면 빈 문자열' },
          to: { type: 'string', description: 'YYYY-MM-DD. 기간의 끝. 없으면 빈 문자열' },
          direction: { type: 'string', enum: ['income', 'expense'] },
          categoryName: { type: 'string', description: '주어진 태그 목록에 있는 이름만. 없으면 빈 문자열' },
          amountMin: { type: 'integer', description: '이 금액 이상. 없으면 0' },
          amountMax: { type: 'integer', description: '이 금액 이하. 없으면 0' },
          text: { type: 'string', description: '기록의 내용에서 찾을 낱말. 없으면 빈 문자열' },
        },
        required: ['label', 'from', 'to', 'categoryName', 'amountMin', 'amountMax', 'text'],
      },
    },
  },
  required: ['parts'],
} as const;

/**
 * 조회 프롬프트 — FR-VIEW-13.
 *
 * **조회할 표의 생김새를 알려 준다.** 전에는 "조건을 뽑아라"라고만 했더니
 * '이번달 사용 내역'에서 '사용'이 내용 검색어로 새어 0 건이 나왔다(실제로 겪음).
 * 무엇을 어디서 찾는지 모르면 남는 말을 전부 검색어로 밀어 넣게 된다.
 *
 * 그래서 셋을 함께 준다: ① 표의 칸과 그 칸에 무엇이 들어 있는지 ② 같은 뜻으로
 * 볼 말의 목록 ③ **조건이 아닌 말**의 목록. ③ 이 빠지면 '내역'·'보여줘' 같은
 * 꼬리말이 기록의 내용에서 찾을 낱말이 되어 아무것도 찾지 못한다.
 */
function buildQueryPrompt(input: QueryInput): string {
  const names = input.categories.map((c) => c.name).join(' · ') || '(없음)';
  return [
    '너는 한국어 가계부의 **검색 조건 추출기**다. 기록을 만들지 않는다.',
    '',
    '## 찾을 표 (SQLite `records`)',
    '- `date` TEXT — YYYY-MM-DD. 거래가 일어난 날',
    '- `amount` INTEGER — 원 단위 **양수**. 수입인지 지출인지는 `direction` 이 갖는다',
    "- `direction` TEXT — 'income'(수입) 또는 'expense'(지출)",
    '- `category_id` TEXT — 태그. 아래 목록에 있는 것만 쓴다',
    '- `note` TEXT — 사용자가 적은 한 줄. **가게 이름·품목**이 여기 들어간다',
    `- 태그 목록: ${names}`,
    '',
    `## 오늘은 ${input.today} 이다`,
    '"지난달"·"이번 주"·"어제" 같은 말은 이 날짜를 기준으로 **시작일과 끝일 두 날짜**로 바꾼다.',
    '"8월"처럼 해가 없으면 올해로 본다. "최근 3개월"은 오늘부터 거슬러 센다.',
    '',
    '## 같은 뜻으로 보는 말',
    "- 지출 = 사용 · 소비 · 쓴 · 썼 · 나간 · 나감 · 결제 · 출금 · 낸 · 지불 → direction 'expense'",
    "- 수입 = 들어온 · 받은 · 번 · 벌었 · 입금 · 수령 → direction 'income'",
    '- 금액 = "3만원 넘게/이상/초과" → amountMin 30000 · "5천원 미만/이하/아래" → amountMax 5000',
    '- 태그는 **비슷한 말을 목록의 이름으로 옮긴다.** 예: 밥·점심·저녁·외식 → 식비 계열,',
    '  커피·카페·간식 → 카페/간식 계열, 버스·지하철·택시 → 교통 계열, 병원·약국 → 의료 계열.',
    '  **목록에 없는 이름을 지어내지 않는다.** 마땅한 것이 없으면 빈 문자열로 둔다.',
    '',
    '## 조건이 아닌 말 (절대 text 에 넣지 않는다)',
    '내역 · 사용 내역 · 이용 내역 · 목록 · 리스트 · 기록 · 거래 · 내용 ·',
    '보여줘 · 알려줘 · 찾아줘 · 검색 · 조회 · 얼마 · 얼마나 · 뭐 · 뭘 · 무엇 · 어디 ·',
    '그리고 모든 조사와 어미.',
    '',
    '## text 에 넣을 것',
    '`note` 에 **적혀 있을 법한 말**만이다 — 가게 이름, 품목 이름처럼.',
    '기간·방향·태그·금액으로 이미 설명된 말은 넣지 않는다.',
    '넣을 것이 없으면 빈 문자열로 둔다. **빈 문자열이 정상이다.**',
    '',
    '## 나눠 보기 (parts)',
    "'따로' · '각각' · '나눠서' · '구분해서' 라고 하거나, **수입과 지출을 둘 다** 말하면",
    '조회를 **나눈다.** 그때 parts 는 둘이고 각각 direction 과 label 을 갖는다',
    "(label 은 '지출' · '수입'). 기간·태그·금액·내용 같은 나머지 조건은 **두 몫이 함께 쓴다** —",
    '나누라고 한 것은 방향이지 기간이 아니다.',
    "태그 둘을 각각 보자고 하면 같은 방식으로 태그별로 나누고 label 에 태그 이름을 쓴다.",
    '나누라는 말이 없으면 parts 는 **원소 하나**이고 label 은 빈 문자열이다.',
    '',
    '## 마지막 규칙',
    '문장에 없는 조건을 지어내지 않는다. 수입인지 지출인지 문장이 말하지 않으면',
    'direction 항목 자체를 빼고 응답한다. 어떤 조건도 찾을 수 없을 때만 parts 를 빈 배열로 둔다.',
  ].join('\n');
}

/** 외부에서 온 값을 그대로 믿지 않는다. 태그는 반드시 우리 태그 집합 안으로 좁힌다. */
function normalizePart(raw: unknown, input: QueryInput): QueryPart | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const query: RecordQuery = {};
  const terms: QueryTerm[] = [];

  const from = typeof o.from === 'string' && isISODate(o.from) ? o.from : undefined;
  const to = typeof o.to === 'string' && isISODate(o.to) ? o.to : undefined;
  if (from || to) {
    query.from = from;
    query.to = to;
    const label = from && to ? `${from} ~ ${to}` : from ? `${from}부터` : `${to}까지`;
    terms.push({ key: 'period', label });
  }

  if (o.direction === 'income' || o.direction === 'expense') {
    query.direction = o.direction;
    terms.push({ key: 'direction', label: o.direction === 'income' ? '수입만' : '지출만' });
  }

  if (typeof o.categoryName === 'string' && o.categoryName.trim()) {
    const wanted = o.categoryName.trim();
    const match = input.categories.find((c) => c.name === wanted);
    if (match) {
      query.categoryId = match.id;
      terms.push({ key: 'category', label: `태그 ${match.name}` });
    }
  }

  for (const [key, word] of [['amountMin', '이상'], ['amountMax', '이하']] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      query[key] = Math.round(v);
      terms.push({ key: 'amount', label: `${Math.round(v).toLocaleString('ko-KR')}원 ${word}` });
    }
  }

  if (typeof o.text === 'string' && o.text.trim()) {
    query.text = o.text.trim();
    terms.push({ key: 'text', label: `내용 "${o.text.trim()}"` });
  }

  if (terms.length === 0) return null;
  return { label: typeof o.label === 'string' ? o.label.trim() : '', query, terms };
}

/** 몫이 하나뿐이면 이름을 지운다 — 나뉘지 않았는데 이름을 적으면 나뉜 것처럼 보인다. */
function normalizeParts(raw: unknown, input: QueryInput): QueryPart[] {
  const list = Array.isArray((raw as { parts?: unknown })?.parts) ? ((raw as { parts: unknown[] }).parts) : [];
  const parts = list.map((r) => normalizePart(r, input)).filter((p): p is QueryPart => p !== null);
  if (parts.length === 1) parts[0].label = '';
  return parts;
}

function shorten(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

function fail(
  started: number,
  failure: 'no-response' | 'unparseable',
  detail?: string,
): InterpretOutcome {
  // 서버 로그에 남긴다. 조용히 폴백하면 "왜 안 되는가"를 아무도 알 수 없다.
  // 키는 담기지 않는다 — detail 은 응답 본문과 오류 메시지에서만 온다.
  console.warn(`[interpret] ${geminiProvider.name}(${MODEL}) 실패: ${failure}${detail ? ` — ${detail}` : ''}`);
  return {
    items: [],
    providerName: geminiProvider.name,
    degraded: false,
    failure,
    failureDetail: detail,
    elapsedMs: Date.now() - started,
  };
}

/** 지금 쓰이는 모델 이름. 설정 화면이 보여 준다. 밖으로 나가는 호출이 아니다. */
export function geminiModelName(): string {
  return MODEL;
}

/** 외부에서 온 값을 그대로 믿지 않는다. 분류는 반드시 우리 분류 집합 안으로 좁힌다(FR-CAT-06). */
function normalize(raw: unknown[], input: InterpretInput): InterpretedItem[] {
  const out: InterpretedItem[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;

    const dateStr = typeof o.date === 'string' && isISODate(o.date) ? o.date : null;
    const amountNum =
      typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount > 0
        ? Math.round(o.amount)
        : null;
    const dir = o.direction === 'income' || o.direction === 'expense' ? o.direction : null;
    const merchant = typeof o.merchant === 'string' && o.merchant.trim() ? o.merchant.trim() : null;
    const note = typeof o.note === 'string' ? o.note : '';

    let categoryId: string | null = null;
    if (typeof o.categoryName === 'string' && o.categoryName.trim()) {
      const match = input.categories.find(
        (c) => c.name === (o.categoryName as string).trim() && (!dir || c.direction === dir),
      );
      categoryId = match?.id ?? null;
    }

    out.push({ date: dateStr, amount: amountNum, direction: dir, categoryId, merchant, note });
  }
  return out;
}
