/**
 * FR-ENTRY-18 — 이미지를 첨부할 때 보여 줄 안내.
 * 표시 시점은 "첨부 시점부터 해석 요청 이전까지"다(SRS §2.1).
 * 보내고 난 뒤에 뜨는 경고는 의미가 없다.
 */
export const IMAGE_ATTACH_NOTICE =
  '첨부 이미지는 해석을 위해 외부로 전송됨. 카드번호 등 민감한 부분은 가리고 올리기 권장.';

/** 외부 수단을 쓰지 않는 상태에서의 안내. 나가는 것이 없다는 사실을 그대로 말한다. */
export const IMAGE_ATTACH_NOTICE_LOCAL =
  '외부 해석 미사용. 첨부 이미지는 기기 밖으로 나가지 않음.';

/** 나가는 것이 없을 때 보여 줄 문구. */
export const NO_OUTBOUND_NOTICE = '밖으로 나가는 항목 없음.';
