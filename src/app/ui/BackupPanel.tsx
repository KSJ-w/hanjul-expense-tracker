'use client';

import { useRef, useState, useTransition } from 'react';
import { importBundleAction } from '../actions';
import { btn, StatusMessage } from './atoms';

/**
 * 데이터와 백업 — FR-VIEW-10 / FR-VIEW-11 / NFR-VIEW-03, ADR-020.
 *
 * 이름이 결과를 말하게 한다(§16·§17):
 *   백업 파일 저장 — 기록과 영수증을 한 묶음으로. 이 파일 하나로 되살릴 수 있다(ADR-008)
 *   CSV 내려받기 — 표 계산용. **되살리기용이 아니다**
 *   백업 가져오기 — 지금 기록에 **더한다**. 전체를 갈아엎지 않는다
 */
export function BackupPanel({ dataDir }: { dataDir: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/export" className={btn.primary} download>
            백업 파일 저장
          </a>
          <span className="text-[13px] text-[var(--ink-2)]">기록과 영수증 이미지를 한 파일에 담아요.</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/export/csv" className={btn.outline} download>
            CSV 내려받기
          </a>
          <span className="text-[13px] text-[var(--ink-2)]">
            표 계산용이에요. 이 파일로는 되살릴 수 없어요.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            id="backup-file"
            aria-label="백업 파일 고르기"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () =>
                startTransition(async () => {
                  const r = await importBundleAction(String(reader.result));
                  setMsg(r.message);
                  if (fileRef.current) fileRef.current.value = '';
                });
              reader.readAsText(f);
            }}
          />
          <button
            type="button"
            className={btn.outline}
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            {pending ? '가져오는 중' : '백업 가져오기'}
          </button>
          <span className="text-[13px] text-[var(--ink-2)]">
            지금 기록에 더해요. 같은 기록은 건너뛰고, 기존 기록을 지우지 않아요.
          </span>
        </div>
      </div>

      {msg ? <StatusMessage tone="info">{msg}</StatusMessage> : null}

      {/*
       * 파일을 고르면 곧바로 반영된다. 미리 보기(가져올 건수·중복 건수)는 아직 없다 —
       * 있는 것처럼 쓰지 않는다(§16).
       */}
      <p className="text-[13px] text-[var(--ink-3)]">
        파일을 고르면 바로 가져와요. 가져오기 전에 내용을 미리 보는 화면은 아직 없어요.
      </p>

      <details className="rounded-[var(--r-control)] bg-[var(--surface-2)] px-3 py-2">
        <summary className="cursor-pointer text-[13px] text-[var(--ink-2)]">저장 위치</summary>
        <p className="mt-2 break-all font-mono text-[13px] text-[var(--ink-2)]">{dataDir}</p>
      </details>
    </div>
  );
}
