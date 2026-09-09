import type { Category, Direction } from '../domain/types';

/**
 * 낱말 → 분류 이름 힌트.
 * 여기서 나온 이름은 **사용자가 실제로 가진 분류와 이름이 같을 때만** 쓰인다.
 * 없는 분류를 만들어 배정하지 않는다(FR-CAT-06).
 * 사용자가 분류 이름을 바꿨다면 매칭되지 않고 분류는 미확정으로 남는다 — 지어내는 것보다 낫다.
 */
const HINTS: { category: string; direction: Direction; words: string[] }[] = [
  {
    category: '식비',
    direction: 'expense',
    words: ['점심', '저녁', '아침', '식당', '밥', '한식', '중식', '일식', '양식', '김밥', '국밥', '백반', '치킨', '피자', '햄버거', '분식', '떡볶이', '삼겹살', '고깃집', '초밥', '회', '파스타', '짜장', '짬뽕', '라면', '도시락', '배달', '배민', '요기요', '쿠팡이츠', '맥도날드', '버거킹', '롯데리아', '김밥천국', '한솥', '순대', '칼국수', '냉면', '뷔페'],
  },
  {
    category: '카페/간식',
    direction: 'expense',
    words: ['커피', '카페', '아메리카노', '라떼', '스타벅스', '이디야', '투썸', '메가커피', '빽다방', '컴포즈', '할리스', '디저트', '케이크', '베이커리', '파리바게뜨', '뚜레쥬르', '아이스크림', '빙수', '음료', '스무디'],
  },
  {
    category: '교통',
    direction: 'expense',
    words: ['버스', '지하철', '택시', '기차', 'ktx', 'srt', '교통카드', '주유', '기름', '주차', '톨게이트', '하이패스', '카카오택시', '따릉이', '항공', '비행기', '고속버스'],
  },
  {
    category: '생활용품',
    direction: 'expense',
    words: ['다이소', '마트', '이마트', '홈플러스', '롯데마트', '코스트코', '생필품', '휴지', '세제', '편의점', 'cu', 'gs25', '세븐일레븐', '이마트24', '쿠팡', '생활용품'],
  },
  {
    category: '주거/통신',
    direction: 'expense',
    words: ['월세', '전세', '관리비', '전기세', '전기요금', '가스', '수도', '인터넷', '통신', '휴대폰', '핸드폰', 'skt', 'kt', '유플러스', '넷플릭스', '유튜브', '구독', '왓챠', '디즈니플러스', '스포티파이'],
  },
  {
    category: '의료/건강',
    direction: 'expense',
    words: ['병원', '약국', '치과', '한의원', '건강검진', '헬스', '피트니스', '요가', '필라테스', '영양제', '진료', '처방'],
  },
  {
    category: '문화/여가',
    direction: 'expense',
    words: ['영화', 'cgv', '메가박스', '롯데시네마', '공연', '전시', '뮤지컬', '서점', '교보문고', '게임', '스팀', '여행', '숙박', '호텔', '펜션', '노래방', '피시방', '볼링', '캠핑'],
  },
  {
    category: '의류/미용',
    direction: 'expense',
    words: ['의류', '신발', '미용실', '헤어', '화장품', '올리브영', '네일', '유니클로', '자라', '무신사', '에이블리', '커트', '염색'],
  },
  {
    category: '경조사',
    direction: 'expense',
    words: ['축의금', '조의금', '부의금', '결혼식', '장례식', '돌잔치', '선물', '생일선물'],
  },
  { category: '급여', direction: 'income', words: ['월급', '급여', '봉급', '상여', '보너스', '연봉'] },
  { category: '용돈', direction: 'income', words: ['용돈'] },
  {
    category: '부수입',
    direction: 'income',
    words: ['부수입', '알바', '아르바이트', '과외', '환급', '캐시백', '이자', '배당', '당근', '중고'],
  },
];

/**
 * 문장에서 분류를 추정한다.
 * 반환값은 사용자가 실제로 가진 분류의 식별자이거나 null 이다.
 */
export function guessCategoryId(
  text: string,
  direction: Direction,
  categories: Category[],
): string | null {
  const t = text.toLowerCase().replace(/\s/g, '');
  const pool = categories.filter((c) => c.direction === direction);
  if (pool.length === 0) return null;

  // 1) 분류 이름이 문장에 그대로 들어 있으면 그것이 가장 확실하다.
  //    긴 이름부터 본다 — '식비'가 '카페/간식'보다 먼저 걸리는 것을 막는다.
  for (const c of [...pool].sort((a, b) => b.name.length - a.name.length)) {
    const name = c.name.toLowerCase().replace(/\s/g, '');
    if (name.length >= 2 && t.includes(name)) return c.id;
  }

  // 2) 낱말 힌트 → 같은 이름의 분류가 있을 때만 채택
  let best: { id: string; wordLen: number } | null = null;
  for (const h of HINTS) {
    if (h.direction !== direction) continue;
    const target = pool.find((c) => c.name === h.category);
    if (!target) continue;
    for (const w of h.words) {
      if (t.includes(w) && (!best || w.length > best.wordLen)) {
        best = { id: target.id, wordLen: w.length };
      }
    }
  }
  return best?.id ?? null;
}
