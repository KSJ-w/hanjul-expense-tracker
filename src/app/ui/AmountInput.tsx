'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { groupDigits } from '@/lib/domain/money';
import { inputClass } from './atoms';

export { groupDigits };

/**
 * 금액을 적는 칸 — 적는 동안 **1000 이 아니라 1,000 으로 보인다**(ADR-026).
 *
 * 이 제품의 다른 곳은 금액을 늘 자릿점과 함께 보여 준다(`Money`). 적는 칸만
 * 맨 숫자면 같은 값이 **적을 때와 보일 때 다른 모양**을 갖고, 자릿수가 많을수록
 * 제대로 적었는지 세어 봐야 한다.
 *
 * 자릿점을 넣으면 글자 수가 바뀌므로 **글자 자리(caret)를 직접 되돌려 놓아야
 * 한다.** 그러지 않으면 가운데를 고칠 때마다 커서가 맨 뒤로 튄다. 앞쪽에 있던
 * **숫자의 개수**를 세어 두었다가 다시 그 개수만큼 지난 자리로 옮긴다.
 *
 * 값은 늘 자릿점이 찍힌 문자열로 오간다. 받는 쪽은 이미 숫자가 아닌 글자를
 * 걷어내고 읽으므로(`replace(/[^\d]/g, '')`) 그대로 넘겨도 된다.
 */
export function AmountInput({
  value,
  defaultValue,
  onChange,
  ref: outerRef,
  className = '',
  ...rest
}: {
  /** 밖에서 값을 쥐는 경우. `onChange` 와 함께 쓴다. */
  value?: string;
  /** 밖에서 값을 쥐지 않는 경우의 처음 값(폼 안에서 `name` 과 함께). */
  defaultValue?: string;
  onChange?: (formatted: string) => void;
  /** 밖에서도 이 칸을 잡아야 할 때(열자마자 포커스 주기 등). */
  ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'ref'>) {
  // 안쪽 ref 는 글자 자리를 되돌리는 데 쓴다. 밖에서 준 ref 에도 같이 채워 준다.
  const ref = useRef<HTMLInputElement>(null);
  const attachRef = (el: HTMLInputElement | null) => {
    ref.current = el;
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) (outerRef as React.RefObject<HTMLInputElement | null>).current = el;
  };
  const caret = useRef<number | null>(null);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(() => groupDigits(defaultValue ?? ''));
  const shown = controlled ? value : inner;

  // 값이 다시 그려진 **뒤에** 자리를 옮긴다. 그리기 전에 옮기면 덮어써진다.
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const digitsBefore = el.value.slice(0, el.selectionStart ?? 0).replace(/\D/g, '').length;
    const formatted = groupDigits(el.value);

    let seen = 0;
    let pos = digitsBefore === 0 ? 0 : formatted.length;
    for (let i = 0; i < formatted.length && digitsBefore > 0; i++) {
      if (formatted[i] >= '0' && formatted[i] <= '9') {
        seen += 1;
        if (seen === digitsBefore) {
          pos = i + 1;
          break;
        }
      }
    }
    caret.current = pos;
    if (!controlled) setInner(formatted);
    onChange?.(formatted);
  }

  return (
    <input
      {...rest}
      ref={attachRef}
      type="text"
      inputMode="numeric"
      value={shown}
      onChange={handle}
      className={`${inputClass} tabular ${className}`}
    />
  );
}
