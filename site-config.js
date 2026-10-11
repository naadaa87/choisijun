/* =========================================================
   최시준 홈페이지 — 기능 설정 파일
   ---------------------------------------------------------
   문의 접수 · 회원가입 · 게시판을 실제로 작동시키는 값을 넣는 곳입니다.
   GitHub에서 이 파일만 열어 따옴표 사이에 값을 붙여넣고 Commit 하면 됩니다.
   자세한 순서: 기능활성화-가이드.md

   ※ 이 파일은 홈페이지를 새 버전으로 올릴 때 덮어쓰지 마세요.
     (한 번 넣은 값이 지워집니다. 새 버전 zip에서 이 파일은 빼고 올리세요.)
   ========================================================= */
window.SITE_CONFIG = {

  /* 1) Supabase — 회원가입 · 로그인 · 게시판 · 문의 기록
        Supabase → Project Settings → API Keys 에서 복사
        - supabaseUrl : https://xxxxxxxx.supabase.co
        - supabaseKey : Publishable key(sb_publishable_…) 또는 anon public 키
        ※ secret / service_role 키는 절대 넣지 마세요. */
  supabaseUrl: '',
  supabaseKey: '',

  /* 2) Web3Forms — 문의가 들어오면 메일로 바로 받기
        https://web3forms.com 에서 받는 이메일을 넣으면 키가 메일로 옵니다 */
  formAccessKey: '',

  /* 3) 문의를 받는 이메일 (화면에 보이는 주소이기도 합니다) */
  contactEmail: 'runactivator@naver.com',

  /* 4) 간편 로그인 — Supabase에서 켠 것만 넣으세요. 예: ['kakao', 'google']
        비워두면 이메일 가입만 보입니다. */
  socialLogin: [],

  /* 5) Supabase를 연결하기 전(데모 상태)에만 쓰는 레퍼런스 등록 코드.
        Supabase를 연결하면 관리자 계정으로 로그인해야 등록할 수 있습니다. */
  demoAdminCode: 'sijun-2026'
};
