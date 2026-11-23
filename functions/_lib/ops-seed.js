/* =========================================================
   운영 현황 기본값 (2026-11-19 점검 기준)
   - 처음 한 번만 넣는다. 이후에는 관리자 화면에서 고친 내용이 기준
   - SITE_OPS: 사이트별 운영 현황 · 특이사항 · 문의 받는 방식
   - TASK_SEED: [사이트, 구분, 할 일, 담당, 상태] — 사이트 '*' 는 전체 공통
   ========================================================= */
export const OPS_STATES = ['정상 운영', '점검 필요', '개발·준비 중', '보류', '종료 검토'];
export const TASK_KINDS = ['개선', '고도화', '결정', '공통'];
export const TASK_OWNERS = ['대표님', 'Claude', '함께'];
export const TASK_STATUS = ['대기', '진행 중', '검토', '완료', '보류'];
export const SEED_DONE_AT = '2026-11-19T08:00:00.000Z';

export const SITE_OPS = {
 "choisijun": {
  "ops": "정상 운영",
  "note": "허브. 전체 사이트·전체 KPI·전체 문의를 여기서 관리",
  "inquiry_via": "자체 문의 표(choisijun-db)"
 },
 "ssople": {
  "ops": "정상 운영",
  "note": "예약은 네이버 예약. 쏘플창업은 B2B 입구로 분리 검토",
  "inquiry_via": "D1 문의 + 공간 입점 신청"
 },
 "playtion": {
  "ops": "점검 필요",
  "note": "체험 모드로 운영 중. 회원·PASS·결제는 실서비스 키(Supabase·토스·솔라피) 입력 후 전환. 고객 문의는 최시준이 대신 받음",
  "inquiry_via": "최시준 대신 접수 (체험 모드)"
 },
 "restel": {
  "ops": "정상 운영",
  "note": "네이버 미등록. 12개 언어판",
  "inquiry_via": "D1 문의"
 },
 "megaspot": {
  "ops": "정상 운영",
  "note": "대관 문의가 가장 많이 쌓이는 곳",
  "inquiry_via": "D1 대관 문의"
 },
 "socialfactory": {
  "ops": "정상 운영",
  "note": "세미나실·코워킹·주차 온라인 결제",
  "inquiry_via": "D1 문의"
 },
 "mezzanine": {
  "ops": "정상 운영",
  "note": "11/19 mezzanine.life 연결, 예전 workers.dev 주소는 새 주소로 이동. 네이버 미등록",
  "inquiry_via": "D1 대관 문의·소개서 요청·공간 제휴 신청"
 },
 "minglecafe": {
  "ops": "정상 운영",
  "note": "손님 문의는 카카오 채널. 사이트에 문의 폼 없음",
  "inquiry_via": "문의 폼 없음 (카카오 채널)"
 },
 "todaypartyroom": {
  "ops": "개발·준비 중",
  "note": "등록된 파티룸이 아직 없음. 도메인 미연결, 관리자 비밀값 입력 확인 필요",
  "inquiry_via": "D1 문의·신고"
 },
 "pvit": {
  "ops": "정상 운영",
  "note": "운영 프로젝트는 pvit-web. 예전 업로드 프로젝트 'pvit'는 도메인이 빠진 채 남아 있음",
  "inquiry_via": "KV 호스트 입점·예약 요청·문의"
 },
 "honplace": {
  "ops": "점검 필요",
  "note": "관리자 비밀값(ADMIN_KEY) 입력 확인 필요",
  "inquiry_via": "D1 공간 제보"
 },
 "bagstop": {
  "ops": "개발·준비 중",
  "note": "도메인 미연결. 화면을 자바스크립트로만 그려 검색 노출이 약함",
  "inquiry_via": "D1 문의"
 },
 "vacancy": {
  "ops": "정상 운영",
  "note": "B2B 공실개발 본진",
  "inquiry_via": "D1 공실개발 문의"
 },
 "blankspaceindex": {
  "ops": "개발·준비 중",
  "note": "도메인 미연결(index.vacancy.co.kr 이전 예정). 진단 신청은 메일로만 받음",
  "inquiry_via": "메일(mailto)"
 },
 "guspacedev": {
  "ops": "점검 필요",
  "note": "11/19 DB 새로 연결(그전 문의는 저장되지 않음). 사이트 관리자 비밀번호 입력 필요",
  "inquiry_via": "D1 문의 (11/19 새로 연결)"
 },
 "orbis-estate": {
  "ops": "정상 운영",
  "note": "매일 인사이트 글",
  "inquiry_via": "D1 상담 접수"
 },
 "coremood": {
  "ops": "정상 운영",
  "note": "",
  "inquiry_via": "D1 문의"
 },
 "seuseurolab": {
  "ops": "점검 필요",
  "note": "관리자 비밀값(ADMIN_KEY) 입력 확인 필요",
  "inquiry_via": "D1 상담 접수"
 },
 "wonsangtaero": {
  "ops": "개발·준비 중",
  "note": "도메인 미연결. 화면을 자바스크립트로만 그려 검색 노출이 약함",
  "inquiry_via": "D1 상담 접수"
 },
 "proppeer": {
  "ops": "개발·준비 중",
  "note": "도메인 미연결. 문의는 최시준이 대신 받음",
  "inquiry_via": "최시준 대신 접수"
 },
 "ksba-web": {
  "ops": "보류",
  "note": "협회 창립 확정 전 — 널리 알리지 않음",
  "inquiry_via": "문의 폼 없음"
 },
 "gusystem": {
  "ops": "정상 운영",
  "note": "㈜지유코퍼레이션 내부 업무 시스템. 검색 차단 유지",
  "inquiry_via": "내부용"
 },
 "myworks": {
  "ops": "정상 운영",
  "note": "네이버 미등록",
  "inquiry_via": "D1 사용자 의견"
 },
 "yeongyeoljeom": {
  "ops": "보류",
  "note": "저장소는 비공개인데 사이트는 공개·색인 허용 상태 — 공개 시점 결정 필요",
  "inquiry_via": "최시준 대신 접수"
 },
 "passionstore": {
  "ops": "정상 운영",
  "note": "",
  "inquiry_via": "D1 가입·장날 신청"
 },
 "mychallenge": {
  "ops": "정상 운영",
  "note": "",
  "inquiry_via": "D1 참가 신청"
 },
 "factanddo": {
  "ops": "개발·준비 중",
  "note": "네이버 미등록. 공개 문의 폼 없음",
  "inquiry_via": "공개 문의 폼 없음"
 },
 "bfconsulting": {
  "ops": "정상 운영",
  "note": "도메인 미연결. 상담 신청은 최시준이 대신 받음(BFC 메일함 사본 여부 결정 필요)",
  "inquiry_via": "최시준 대신 접수"
 },
 "hantang-web": {
  "ops": "정상 운영",
  "note": "업주 등록 신청은 KV에 쌓임. 승인 가동 전",
  "inquiry_via": "KV 업소 등록 신청"
 },
 "rulerule": {
  "ops": "점검 필요",
  "note": "관리자 비밀값(ADMIN_PASSWORD) 입력 확인 필요",
  "inquiry_via": "D1 문의"
 },
 "bareunbp": {
  "ops": "점검 필요",
  "note": "관리자 비밀값(ADMIN_KEY·REVIEWER_KEY·SESSION_SECRET) 입력 확인 필요",
  "inquiry_via": "D1 제휴·문의"
 },
 "eightletters-web": {
  "ops": "정상 운영",
  "note": "네이버 미등록. 유료 리포트 준비 중",
  "inquiry_via": "D1 문의 + 출시 알림 신청"
 },
 "mongcrew": {
  "ops": "개발·준비 중",
  "note": "도메인 미연결",
  "inquiry_via": "최시준 대신 접수"
 },
 "fleating-web": {
  "ops": "개발·준비 중",
  "note": "시제품. 화면을 자바스크립트로만 그림",
  "inquiry_via": "문의 폼 없음 (메일)"
 },
 "sajupick-web": {
  "ops": "종료 검토",
  "note": "여덟글자로 합칠 예정",
  "inquiry_via": "없음 (시제품)"
 },
 "todaysfortune-web": {
  "ops": "종료 검토",
  "note": "좋은 기능만 여덟글자로 옮길 예정",
  "inquiry_via": "없음 (시제품)"
 },
 "yuntoworld": {
  "ops": "보류",
  "note": "개인 프로젝트",
  "inquiry_via": "없음"
 },
 "writerchoi": {
  "ops": "정상 운영",
  "note": "작가 의사 확인 후 도메인 연결",
  "inquiry_via": "D1 문의"
 }
};

export const TASK_SEED = [
  ["choisijun", "개선", "전체 사이트·전체 KPI·전체 문의 화면 구축, 문의별 확인·회신 표시와 메모", "Claude", "완료"],
  ["choisijun", "개선", "문의 저장소가 없는 사이트의 문의를 대신 받는 /api/lead 운영 시작", "Claude", "완료"],
  ["choisijun", "개선", "새 문의 알림 메일 설정 확인 (RESEND_API_KEY · NOTIFY_EMAIL)", "대표님", "대기"],
  ["choisijun", "고도화", "브랜드 페이지에서 사업군별 사이트 소개, 각 사이트 바닥글에 허브 링크(쌍방향)", "Claude", "대기"],
  ["ssople", "개선", "공간 입점 신청(space_apps)을 전체 문의에 연결", "Claude", "완료"],
  ["ssople", "개선", "지점 사진 대체텍스트 390개 채우기", "Claude", "대기"],
  ["ssople", "개선", "네이버 플레이스에 홈페이지·예약 링크 맞추기", "대표님", "대기"],
  ["ssople", "고도화", "쏘플창업을 B2B 입구로 분리, 커뮤니티 기능 축소", "대표님", "검토"],
  ["playtion", "개선", "창업·제휴 문의, 고객 문의, 기기 문의, 행사 신청이 전체 문의로 들어오게 연결 (전엔 고객 브라우저에만 저장)", "Claude", "완료"],
  ["playtion", "개선", "실서비스 전환: Supabase·토스페이먼츠·솔라피 키 입력", "대표님", "대기"],
  ["playtion", "개선", "사진 대체텍스트 341개", "Claude", "대기"],
  ["playtion", "고도화", "신촌·건대 지역 페이지 확대, 창업 문의를 리드로 관리", "Claude", "대기"],
  ["restel", "개선", "네이버 서치어드바이저 등록·사이트맵 제출", "대표님", "대기"],
  ["restel", "고도화", "외국어판(K-REST)과 한탕·백스톱 서로 소개", "Claude", "대기"],
  ["megaspot", "개선", "입점 공간 사이트맵 구글 재수집 확인", "Claude", "진행 중"],
  ["megaspot", "고도화", "목적별(워크숍·송년회) 견적 바로 보기", "Claude", "대기"],
  ["socialfactory", "개선", "사진 대체텍스트 81개", "Claude", "대기"],
  ["socialfactory", "고도화", "건대입구 로컬 검색어(세미나실·공유오피스) 페이지 정리", "Claude", "대기"],
  ["mezzanine", "개선", "mezzanine.life 연결, 예전 주소 이동, 구글·Bing 등록, 대관 장소 구조화 데이터", "Claude", "완료"],
  ["mezzanine", "개선", "네이버 서치어드바이저 등록", "대표님", "대기"],
  ["mezzanine", "고도화", "대관 사례마다 브랜드·규모·연출 기록 (팝업 공간 대관 검색)", "Claude", "대기"],
  ["minglecafe", "개선", "사진 대체텍스트 167개", "Claude", "대기"],
  ["minglecafe", "개선", "네이버 플레이스 링크 맞추기", "대표님", "대기"],
  ["minglecafe", "고도화", "창업·제휴 문의 폼을 만들어 전체 문의로 받기", "Claude", "대기"],
  ["todaypartyroom", "개선", "첫 화면·검색 설명의 '0곳' 문구 정리", "Claude", "완료"],
  ["todaypartyroom", "개선", "SESSION_SECRET 입력, 도메인 결정·연결", "대표님", "대기"],
  ["todaypartyroom", "고도화", "쏘플 지점 빈 시간부터 올려 빈 화면 없애기", "함께", "대기"],
  ["pvit", "개선", "KV에 쌓이는 입점 신청·예약 요청·문의를 전체 문의에 연결", "Claude", "완료"],
  ["pvit", "개선", "예전 업로드 프로젝트 'pvit'(도메인 빠진 상태) 정리 여부 결정", "대표님", "검토"],
  ["pvit", "고도화", "예약은 오늘의파티룸·메가스팟으로 넘기는 상단 입구로 자리 잡기", "Claude", "대기"],
  ["honplace", "개선", "ADMIN_KEY 입력", "대표님", "대기"],
  ["honplace", "고도화", "혼술바·혼밥 같은 검색어 모음 글, 제휴 수익", "Claude", "대기"],
  ["bagstop", "개선", "도메인 결정·구입", "대표님", "대기"],
  ["bagstop", "개선", "정적 HTML 전환 (원본 HTML이 거의 비어 있음)", "Claude", "대기"],
  ["bagstop", "고도화", "한탕·레스텔과 서로 소개", "Claude", "대기"],
  ["vacancy", "고도화", "B2B 본진으로 사례 페이지 확대, 다른 B2B 사이트와 문맥 링크 설계", "함께", "검토"],
  ["blankspaceindex", "개선", "메뉴의 '준비 중' 항목 감추기", "Claude", "대기"],
  ["blankspaceindex", "개선", "진단 신청을 메일 대신 전체 문의로 받기", "Claude", "대기"],
  ["blankspaceindex", "고도화", "index.vacancy.co.kr 로 이전 (DNS 변경 승인 필요)", "대표님", "검토"],
  ["guspacedev", "개선", "DB가 없어 문의가 저장되지 않던 문제 해결 (guspacedev-db 생성·연결)", "Claude", "완료"],
  ["guspacedev", "개선", "사이트 관리자 화면용 ADMIN_PASSWORD 입력", "대표님", "대기"],
  ["orbis-estate", "개선", "사진 대체텍스트 76개", "Claude", "대기"],
  ["orbis-estate", "고도화", "강남 동네별·업종별 매매·임대 글", "Claude", "대기"],
  ["coremood", "개선", "대체텍스트 38개", "Claude", "대기"],
  ["coremood", "고도화", "업종×지역 프로젝트 페이지 (성수 카페 인테리어 등)", "Claude", "대기"],
  ["seuseurolab", "개선", "구조화 데이터 37페이지 추가", "Claude", "완료"],
  ["seuseurolab", "개선", "ADMIN_KEY 입력", "대표님", "대기"],
  ["seuseurolab", "고도화", "원상복구 메뉴는 원상태로 연결로 바꾸기", "Claude", "대기"],
  ["wonsangtaero", "개선", "정적 HTML 전환·대표 주소", "Claude", "대기"],
  ["wonsangtaero", "개선", "도메인 결정", "대표님", "대기"],
  ["proppeer", "개선", "상담·진단·질문·가입 신청이 실제로 접수되게 연결 (전엔 쓰지 않는 메일 주소로 초안만 열림)", "Claude", "완료"],
  ["proppeer", "개선", "도메인 결정, 빠진 대표 주소·구조화 데이터 보완", "함께", "대기"],
  ["ksba-web", "결정", "협회 창립 확정 후 도메인·공개", "대표님", "보류"],
  ["myworks", "개선", "네이버 등록", "대표님", "대기"],
  ["myworks", "개선", "소프트웨어 구조화 데이터", "Claude", "대기"],
  ["myworks", "고도화", "공간 운영자 대상 기능 페이지 (파티룸 청소 관리, 무인매장 정산)", "Claude", "대기"],
  ["yeongyeoljeom", "개선", "기업 도입 문의가 실제로 접수되게 연결", "Claude", "완료"],
  ["yeongyeoljeom", "결정", "공개 시점 결정 (지금 159페이지가 공개·색인 허용 상태)", "대표님", "검토"],
  ["passionstore", "개선", "대체텍스트 81개, 장날 행사 구조화 데이터", "Claude", "대기"],
  ["mychallenge", "개선", "대체텍스트 88개", "Claude", "대기"],
  ["mychallenge", "고도화", "프로젝트 페이퍼(결과 사례) 공개", "Claude", "대기"],
  ["factanddo", "개선", "네이버 등록", "대표님", "대기"],
  ["factanddo", "개선", "사전등록 양식을 연결할 때 전체 문의로 받기", "Claude", "대기"],
  ["bfconsulting", "개선", "상담 신청을 바로 접수 (전엔 메일 앱을 열어 고객이 직접 보내야 함), 공유 이미지·구조화 데이터", "Claude", "완료"],
  ["bfconsulting", "개선", "BFC 메일함(bfc0118)에도 사본을 보낼지 결정", "대표님", "검토"],
  ["bfconsulting", "개선", "도메인 결정", "대표님", "대기"],
  ["hantang-web", "개선", "업소 등록 신청(KV)을 전체 문의에 연결", "Claude", "완료"],
  ["hantang-web", "고도화", "업주 등록 승인 가동, '인증 업장' 수익 모델 시작", "함께", "대기"],
  ["rulerule", "개선", "ADMIN_PASSWORD 입력", "대표님", "대기"],
  ["rulerule", "고도화", "매장 QR을 플레이션·쏘플파티룸 매장에 실제 설치", "대표님", "대기"],
  ["bareunbp", "개선", "ADMIN_KEY · REVIEWER_KEY · SESSION_SECRET 입력", "대표님", "대기"],
  ["bareunbp", "개선", "대체텍스트 32개", "Claude", "대기"],
  ["eightletters-web", "개선", "제목·설명에 '사주·오늘의 운세', H1 없던 9페이지 보완, 출시 알림 신청 연결", "Claude", "완료"],
  ["eightletters-web", "개선", "네이버 등록", "대표님", "대기"],
  ["eightletters-web", "개선", "본문이 짧은 32페이지 보강", "Claude", "대기"],
  ["eightletters-web", "결정", "사주픽·오늘의사주를 여덟글자로 합치기", "대표님", "검토"],
  ["mongcrew", "개선", "대기등록·입점 문의가 실제로 접수되게 연결 (전엔 화면 안내만)", "Claude", "완료"],
  ["mongcrew", "개선", "대표 주소·구조화 데이터·사이트맵·robots, 공유 이미지 절대주소", "Claude", "완료"],
  ["mongcrew", "개선", "도메인 결정", "대표님", "대기"],
  ["fleating-web", "개선", "정적 HTML 전환, 사이트맵", "Claude", "대기"],
  ["sajupick-web", "결정", "여덟글자로 합치고 닫기", "대표님", "검토"],
  ["todaysfortune-web", "결정", "시간대 테마만 여덟글자로 옮기고 닫기", "대표님", "검토"],
  ["writerchoi", "결정", "작가 의사 확인 후 도메인·책 구조화 데이터", "대표님", "검토"],
  ["*", "공통", "개인정보처리방침에 방문 통계(최시준 수집 코드) 안내 문구 추가", "Claude", "대기"],
  ["*", "공통", "사이트별 관리자 비밀값 입력 후 각 관리자 화면 점검", "대표님", "대기"],
  ["*", "공통", "도메인 미연결 사이트 도메인 결정·구입, 연결은 Claude", "대표님", "대기"]
];

/* 나중에 더한 사이트의 운영 현황 · 할 일 — 항목마다 한 번만 넣는다 (flag 로 구분, 빈 칸만 채움) */
export const OPS_ADDS = [
  {
    flag: 'ops_add_myeonmyeon_20261123',
    site: 'myeonmyeon',
    ops: {
      ops: '점검 필요',
      note: '2026-11-23 myeonmyeon.com 연결. 구글·빙 등록과 사이트맵 제출 완료, 네이버는 대표님 등록 예정. 관리자 비밀값(ADMIN_PASSWORD) 입력 전',
      inquiry_via: 'D1 문의 + 정보 제보'
    },
    tasks: [
      ['개선', 'ADMIN_PASSWORD 입력 (Cloudflare → myeonmyeon → 설정 → 변수 및 비밀)', '대표님', '대기'],
      ['개선', '네이버 서치어드바이저 등록: 소유확인 HTML 태그 값 전달 → site.config.json 반영, 사이트맵·RSS 제출', '대표님', '대기'],
      ['개선', 'myeonmyeon.com 연결, www → 대표 주소 넘김, pages.dev 검색 제외', 'Claude', '완료'],
      ['개선', '구글 서치 콘솔·빙 웹마스터 등록, 사이트맵 제출, IndexNow 자동 알림', 'Claude', '완료'],
      ['개선', '모아 보기 페이지 22쪽(종류·회사·편의점·매운 라면), 제목·구조화 데이터 정리', 'Claude', '완료'],
      ['결정', '공개 전 운영자 이름·연락 메일(site.config.json) 정하기', '대표님', '대기'],
      ['고도화', '쿠팡 파트너스 가입 명의 정하고 라면별 링크 넣기', '함께', '대기'],
      ['고도화', 'AI 조리 예시가 없는 해외 라면 77가지 그림 만들어 드라이브에 올리기', '대표님', '대기'],
      ['결정', '실물 사진 허락 요청 (오뚜기·농심·지영준 평론가부터)', '대표님', '대기']
    ]
  }
];
