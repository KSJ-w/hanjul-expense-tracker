'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { searchTurnAction, type SearchGroup, type SearchHit } from '../actions';
import { formatSigned } from '@/lib/domain/money';

/**
 * 내역 — **대화**로 찾는다(ADR-041).
 *
 * 묻고 답하는 흐름이므로 대화는 화면에 쌓인다. 주소에 실을 수 없어서
 * (ADR-040 ④ 를 여기서 거둔다) 대신 `sessionStorage` 에 둔다 — 결과를 눌러
 * 달력으로 갔다가 돌아왔을 때 대화가 통째로 사라지면 안 되기 때문이다.
 * 기기 안에 머무는 저장소라 나가는 것은 없다.
 *
 * ## 화면이 말하지 않는 것
 *
 * 무엇으로 찾았는지를 **상시로 적지 않는다**(ADR-031). 바로 위에 사용자의
 * 말풍선이 있고 그것이 이미 그 일을 한다. 다만 **0 건일 때는 적는다** —
 * 그때만은 '못 찾음'과 '잘못 알아들음'이 갈리고, 어떻게 알아들었는지를
 * 모르면 다시 적어 볼 수도 없다(SDD §2 불변조건 6 · US-08-01 수용 조건 5).
 */

interface Turn {
  said: string;
  ok: boolean;
  groups: SearchGroup[];
  degraded: boolean;
  failureDetail?: string;
}

/**
 * 담아 둔 대화의 **모양에 번호를 붙인다**(ADR-042).
 *
 * 턴의 모양을 바꿨는데 열쇠가 그대로면, 지난 모양으로 담긴 대화가 새 화면으로
 * 복원되어 터진다 — 실제로 겪었다(`Cannot read properties of undefined
 * (reading 'map')`: 답이 `items` 하나였던 시절의 턴에는 `groups` 가 없다).
 * 열쇠에 번호를 달면 지난 것은 **읽히지 않고** 그대로 버려진다.
 */
const STORE = 'hanjul.search.turns.v2';
const MD = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * 담긴 것을 그대로 믿지 않는다. 번호를 올리는 것을 잊어도 **모양이 맞는 턴만**
 * 살려 화면이 터지지 않게 한다 — 저장소의 값은 우리가 쓴 것이지만 언제 쓴
 * 것인지는 알 수 없다.
 */
function sane(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is Turn =>
      typeof t === 'object' &&
      t !== null &&
      typeof (t as Turn).said === 'string' &&
      Array.isArray((t as Turn).groups),
  );
}

export function SearchChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  /*
   * 보낸 말은 **답보다 먼저** 화면에 선다(ADR-041). 답이 올 때까지 기다렸다가
   * 둘을 한꺼번에 붙이면, 보낸 직후 잠깐 동안 화면이 내가 무엇을 물었는지
   * 말하지 않는다 — 대화에서 그것은 말을 삼킨 것이다.
   */
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLDivElement>(null);

  /* 달력에 다녀와도 대화가 남아 있게 한다. 읽기는 첫 그림 전에 한 번뿐이다. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setTurns(sane(JSON.parse(raw)));
    } catch {
      /* 저장소를 쓸 수 없는 곳(사생활 보호 모드 등)에서는 그냥 빈 대화로 시작한다. */
    }
  }, []);

  useEffect(() => {
    try {
      if (turns.length > 0) sessionStorage.setItem(STORE, JSON.stringify(turns));
    } catch {
      /* 저장에 실패해도 화면은 그대로 돈다. */
    }
  }, [turns]);

  /*
   * 물으면 **그 물음으로 내려간다.** 이전 답을 보고 있었더라도 방금 한 말이
   * 화면 맨 위에 서야 그 아래로 답이 차오르는 것이 보인다.
   */
  useEffect(() => {
    if (pending === null) return;
    askRef.current?.scrollIntoView({ block: 'start' });
  }, [pending]);

  /*
   * 답이 오면 **답의 끝이 화면의 끝**이 된다.
   *
   * `scrollIntoView` 로는 안 된다. 끝을 뷰포트 바닥에 맞추는데 그 바닥은
   * 프롬프트 바가 덮고 있어 마지막 줄들이 가려진다(실제로 겪음).
   * `.has-dock` 이 바의 높이만큼 아래 여백을 이미 잡아 두었으므로,
   * **문서의 끝**으로 내리면 그 여백이 바의 자리가 되어 마지막 줄이 바로 위에 선다.
   * (`.has-dock` 의 `scroll-padding-bottom` 은 소용이 없다 — 실제로 구르는 것은
   * 그 칸이 아니라 문서다.)
   *
   * **`behavior: 'smooth'` 를 쓰지 않는다.** 미끄러지는 것은 그림이 그려지는
   * 박자에 실려 오므로 화면이 그려지지 않는 동안에는 **한 걸음도 나아가지 않는다**
   * (실제로 겪음 — 문서가 880px 남았는데 스크롤 위치가 0 그대로였다.
   * `ResizeObserver` 와 막대 차트의 등장 애니메이션이 멈춘 것과 같은 이유다).
   * 대화에서는 바로 뛰는 편이 오히려 맞다 — 새 말은 늘 아래에 있다.
   */
  useEffect(() => {
    if (turns.length === 0) return;
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [turns]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function submit() {
    const said = text.trim();
    if (busy || !said) return;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setPending(said);
    startTransition(async () => {
      const r = await searchTurnAction(said);
      setTurns((prev) => [...prev, { said, ...r }]);
      setPending(null);
    });
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        {/*
         * 아직 아무것도 묻지 않았을 때의 한 줄 — ADR-045.
         * 화면을 해설하는 말이 아니라 **부르는 말**이라 ADR-031 의 금지에 걸리지 않는다.
         * 대화가 시작되면 사라진다. 상시로 붙는 문장이 아니어야 한다는 것이 그 규칙의 요점이다.
         */}
        {turns.length === 0 && pending === null ? (
          <p className="text-[17px] text-[var(--ink-2)]">어떤 기록을 찾아 드릴까요?</p>
        ) : null}

        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Said>{t.said}</Said>

            {/* 답 — 왼쪽. 판의 폭을 다 쓰되 세로로는 조인다. */}
            <div className="flex justify-start">
              <div className="w-full min-w-0 rounded-[var(--r-prompt)] bg-[var(--surface-2)] px-3.5 py-2.5">
                {!t.ok ? (
                  <p className="text-[15px] text-[var(--ink-2)]">
                    무엇을 찾을지 알아듣지 못했어요. 기간·태그·금액 중 하나는 적어 주세요.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {t.groups.map((g, gi) => (
                      <Group key={gi} group={g} />
                    ))}
                  </div>
                )}

                {t.degraded ? (
                  <p className="mt-2 text-[13px] text-[var(--warn-ink)]">
                    외부 해석을 쓰지 못해 기기 안에서 처리했어요.
                    {t.failureDetail ? ` (${t.failureDetail})` : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {/*
         * 보낸 말과, 답이 올 자리. 말이 먼저 서고 그 아래에서 답을 기다린다 —
         * 자리를 미리 잡아 두므로 답이 와도 화면이 흔들리지 않는다(ADR-019).
         */}
        {pending !== null ? (
          <div ref={askRef} className="flex scroll-mt-4 flex-col gap-3">
            <Said>{pending}</Said>
            <div className="flex justify-start">
              <div className="flex items-center gap-2.5 rounded-[var(--r-prompt)] bg-[var(--surface-2)] px-4 py-3">
                <span aria-hidden className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-[var(--ink-3)]"
                      style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
                    />
                  ))}
                </span>
                <span className="text-[13px] text-[var(--ink-3)]" role="status">
                  기록을 찾고 있어요
                </span>
              </div>
            </div>
          </div>
        ) : null}

      </div>

      {/* 프롬프트 — 달력과 같은 자리, 같은 실루엣. 찾는 데에는 첨부가 없다. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[var(--dock-bottom)] z-20">
        <div className="pointer-events-auto mx-auto w-full max-w-[1056px] px-4 sm:px-6">
          <div className="prompt-bar flex items-end gap-2 rounded-[var(--r-prompt)] border border-[var(--field-line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-dock)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center text-[var(--ink-3)]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>

            <label htmlFor="search-text" className="sr-only">
              찾을 내용
            </label>
            <textarea
              id="search-text"
              ref={taRef}
              rows={1}
              value={text}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                grow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="지난달 카페에서 쓴 거"
              aria-describedby="search-help"
              className="max-h-[120px] min-h-11 flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[16px] leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus-visible:outline-none"
            />
            <p id="search-help" className="sr-only">
              기간·태그·금액·내용을 한 줄로 적어 주세요. Enter 키로 찾고, Shift와 Enter를 함께 누르면 줄을 바꿔요.
            </p>

            <button
              type="button"
              onClick={submit}
              disabled={busy || !text.trim()}
              aria-label="내역 찾기"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)] transition-colors hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] disabled:bg-[var(--line)] disabled:text-[var(--ink-3)]"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path
                  d="M12 19V5M12 5l-6 6M12 5l6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** 사용자가 보낸 말 — 오른쪽. 흰 바탕에 테마 색 테두리(ADR-041). */
function Said({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-[var(--r-prompt)] border border-[var(--primary)] bg-[var(--surface)] px-3.5 py-2 text-[15px] leading-6 text-[var(--ink)]">
        {children}
      </p>
    </div>
  );
}

/**
 * 답의 한 덩어리 — ADR-042.
 *
 * 나눠 물었으면 덩어리마다 이름이 붙고, 나뉘지 않았으면 이름 자리가 없다.
 * 나뉘지 않았는데 이름을 적으면 나뉜 것처럼 보인다.
 */
function Group({ group }: { group: SearchGroup }) {
  const count = group.truncated ? `최근 ${group.items.length}건` : `${group.items.length}건`;

  return (
    <section>
      <p className="flex items-baseline gap-2 pb-1">
        {group.label ? (
          <span className="text-[14px] font-semibold text-[var(--ink)]">{group.label}</span>
        ) : null}
        <span className="text-[13px] text-[var(--ink-3)]">{count}</span>
      </p>

      {group.items.length === 0 ? (
        <>
          <p className="text-[14px] text-[var(--ink-2)]">조건에 맞는 기록을 찾지 못했어요.</p>
          {/* 0 건일 때만 적는다 — 어떻게 알아들었는지 알아야 다시 적어 볼 수 있다. */}
          <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">{group.terms.join(' · ')}</p>
        </>
      ) : (
        <ul className="flex flex-col">
          {group.items.map((r) => (
            <li key={r.id} className="border-t border-[var(--line)]">
              <Link
                href={`/?d=${r.date}&r=${r.id}&back=1`}
                className="flex items-baseline gap-3 rounded-[var(--r-control)] px-2 py-1.5 transition-colors hover:bg-[var(--surface)]"
              >
                <span className="tabular w-10 shrink-0 text-[13px] text-[var(--ink-3)]">{MD(r.date)}</span>
                {/* 내용이 없으면 자리만 지키는 '-' 를 흐리게 둔다(ADR-028). */}
                <span
                  className={[
                    'min-w-0 flex-1 truncate text-[14px]',
                    r.note ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
                  ].join(' ')}
                  aria-label={r.note ? undefined : '내용 없음'}
                >
                  {r.note || '-'}
                </span>
                <span className="shrink-0 truncate text-[13px] text-[var(--ink-3)]">{r.tag}</span>
                <span
                  className={[
                    'tabular w-24 shrink-0 whitespace-nowrap text-right text-[14px] font-semibold',
                    r.direction === 'income' ? 'text-[var(--dir-income)]' : 'text-[var(--dir-expense)]',
                  ].join(' ')}
                >
                  {formatSigned(r.amount, r.direction)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
