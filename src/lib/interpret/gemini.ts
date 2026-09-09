import type { InterpretInput, InterpretOutcome, InterpretProvider, InterpretedItem } from './types';
import { isISODate } from '../domain/date';

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
  outboundFields: [
    { key: 'text', label: '적으신 문장', detail: '입력창에 적은 내용 그대로' },
    { key: 'image', label: '첨부한 이미지', detail: '영수증·결제 내역 이미지 원본' },
    { key: 'categories', label: '분류 이름 목록', detail: '분류의 이름만. 기록 내용은 포함하지 않음' },
    { key: 'today', label: '오늘 날짜', detail: '상대적 날짜 표현을 계산하기 위한 기준일' },
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
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return fail(started, 'no-response', `HTTP ${res.status} ${shorten(text)}`);
      }
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return fail(started, 'unparseable', '응답에 본문이 없다');

      const parsed = JSON.parse(raw) as { items?: unknown[] };
      const items = normalize(parsed.items ?? [], input);
      return {
        items,
        providerName: geminiProvider.name,
        degraded: false,
        failure: items.length === 0 ? 'unparseable' : undefined,
        elapsedMs: Date.now() - started,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(started, 'no-response', msg === 'The operation was aborted.' ? `${TIMEOUT_MS}ms 안에 응답이 없었다` : msg);
    } finally {
      clearTimeout(timer);
    }
  },
};

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
