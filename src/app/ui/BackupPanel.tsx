'use client';

import { useRef, useState, useTransition } from 'react';
import { importBundleAction } from '../actions';
import { btn } from './atoms';

/**
 * 백업 — FR-VIEW-10 / FR-VIEW-11 / NFR-VIEW-03.
 * 내보내기 파일 하나로 복원된다(ADR-008). 겹치는 기록은 건너뛴다.
 */
export function BackupPanel({ dataDir }: { dataDir: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export" className={btn.primary} download>
          내보내기
        </a>
        <a href="/api/export/csv" className={btn.soft} download>
          CSV
        </a>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
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
          className={btn.soft}
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          {pending ? '처리 중' : '들여오기'}
        </button>
      </div>

      {msg ? (
        <p className="mt-3 rounded-[var(--r-sm)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink-2)]">
          {msg}
        </p>
      ) : null}

      <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink-3)]">
        저장 위치 <code className="rounded bg-[var(--bg)] px-1.5 py-0.5">{dataDir}</code>
      </p>
    </div>
  );
}
