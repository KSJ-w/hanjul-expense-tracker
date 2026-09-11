/**
 * VIEW — 같은 화면 안의 이동은 화면을 통째로 다시 그리지 않는다(ADR-038).
 *
 * 이 시험은 **소스를 훑는다.** `boundary.test.ts` 가 fetch 를 훑는 것과 같은
 * 이유다: 이 규칙은 한 곳에서 지키는 것이 아니라 화면을 만들 때마다 새로 지켜야
 * 하는 것이고, 어기면 화면이 조용히 맨 위로 튀기만 할 뿐 아무 것도 실패하지
 * 않는다. 글로 적어 두면 지켜질 확률만 오르므로 기계에 맡긴다.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(process.cwd(), 'src', 'app');

/** 파일이 맡는 라우트. `src/app/dashboard/page.tsx` → `/dashboard` */
const ROUTE_OF: Record<string, string> = {
  'page.tsx': '/',
  'dashboard/page.tsx': '/dashboard',
  'search/page.tsx': '/search',
  'settings/page.tsx': '/settings',
};

function read(rel: string): string {
  return fs.readFileSync(path.join(APP, rel), 'utf8');
}

/** `<Link ... >` 하나하나를 통째로 끊어 낸다. 여는 태그만 보면 된다. */
function linkTags(source: string): string[] {
  return [...source.matchAll(/<Link\b[\s\S]*?>/g)].map((m) => m[0]);
}

/** href 에서 경로만 남긴다. `` `/dashboard?p=${x}` `` → `/dashboard` */
function pathOf(tag: string): string | null {
  const m = /href=(?:\{`([^`]*)`\}|"([^"]*)"|\{'([^']*)'\})/.exec(tag);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  if (raw == null || !raw.startsWith('/')) return null;
  return raw.split(/[?#]/)[0].replace(/\/$/, '') || '/';
}

describe('VIEW 같은 화면 안의 이동', () => {
  it('[TC-VIEW-48] FR-VIEW-06: 같은 라우트로 가는 링크와 이동은 보던 자리를 지킨다', () => {
    const offenders: string[] = [];

    for (const [file, route] of Object.entries(ROUTE_OF)) {
      const source = read(file);

      for (const tag of linkTags(source)) {
        const target = pathOf(tag);
        const declared = /scroll=\{(true|false)\}/.test(tag);
        const where = tag.replace(/\s+/g, ' ').slice(0, 80);

        /*
         * 주소를 계산해서 만든 링크(`href={move(-1)}`)는 어디로 가는지 정적으로
         * 알 수 없다. 그러면 **분명히 말하게** 한다 — 빠뜨린 것과 일부러 맨 위로
         * 보내는 것을 구별할 수 있어야 한다. 이 갈래가 없었을 때 실제로
         * `href={spanHref(...)}` 세 개가 검사를 그냥 지나쳤다.
         */
        if (target === null) {
          if (!declared) offenders.push(`${file}: 계산한 주소의 링크가 scroll 을 말하지 않는다 — ${where}`);
          continue;
        }
        if (target !== route) continue; // 다른 화면으로 가는 것은 맨 위가 맞다
        if (!/scroll=\{false\}/.test(tag)) {
          offenders.push(`${file}: 같은 라우트 링크에 scroll={false} 가 없다 — ${where}`);
        }
      }
    }

    /*
     * `router.push` 도 같다. 어느 화면으로 가는지는 값이라 정적으로 알 수 없으므로,
     * **모든** push 가 scroll 을 분명히 말하게 한다 — 빠뜨린 것과 일부러 맨 위로
     * 보내는 것을 구별할 수 있어야 한다.
     */
    for (const dir of ['', 'ui']) {
      const base = path.join(APP, dir);
      for (const name of fs.readdirSync(base)) {
        if (!name.endsWith('.tsx')) continue;
        const rel = path.join(dir, name);
        const source = fs.readFileSync(path.join(base, name), 'utf8');
        for (const m of source.matchAll(/router\.(push|replace)\([\s\S]{0,200}?\);/g)) {
          if (!/scroll:\s*(true|false)/.test(m[0])) {
            offenders.push(`${rel}: router.${m[1]} 이 scroll 을 말하지 않는다`);
          }
        }
      }
    }

    /*
     * 네이티브 GET 폼은 브라우저가 문서를 통째로 다시 받는다. 전송을 가로채는
     * `QueryForm` 한 곳만 그것을 가질 수 있다.
     */
    for (const [file] of Object.entries(ROUTE_OF)) {
      if (/<form\b[^>]*method=["']get["']/.test(read(file))) {
        offenders.push(`${file}: 네이티브 GET 폼이 있다 — QueryForm 을 쓴다`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('VIEW 이동하는 동안의 탭 이름', () => {
  it('[TC-VIEW-49] FR-VIEW-06: 제목은 metadata 가 아니라 레이아웃이 갖는다', () => {
    const layout = fs.readFileSync(path.join(APP, 'layout.tsx'), 'utf8');

    /*
     * Next 는 화면마다 metadata 를 따로 흘려보낸다. 제목이 거기 있으면 같은
     * 화면에서 조건만 바꿔도 `<title>` 이 한 번 지워졌다가 다시 꽂히고, 그 사이
     * 문서에 제목이 없어 브라우저 탭이 **주소**를 보여 준다(실제로 겪음, 60ms).
     * 레이아웃은 같은 라우트 안에서 다시 그려지지 않으므로 여기 두면 지워지지 않는다.
     */
    const metadataBlock = /export const metadata[\s\S]*?\n};/.exec(layout)?.[0] ?? '';
    expect(metadataBlock).not.toMatch(/\btitle\s*:/);
    expect(layout).toMatch(/<title>[^<]+<\/title>/);

    // 화면 쪽에서 제목을 다시 metadata 로 들이지 않는다 — 같은 깜빡임이 돌아온다.
    for (const file of Object.keys(ROUTE_OF)) {
      const block = /export const metadata[\s\S]*?\n};/.exec(read(file))?.[0] ?? '';
      expect(block).not.toMatch(/\btitle\s*:/);
    }
  });
});
