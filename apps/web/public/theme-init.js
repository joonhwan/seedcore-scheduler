/**
 * 첫 페인트 전에 다크 모드 클래스를 붙인다 (밝은 테마가 한 번 번쩍이고 바뀌는 것을 막는다).
 *
 * 원래 index.html 안에 인라인 <script> 로 있었는데, helmet 의 CSP 기본값이
 * script-src 'self' 라서 브라우저가 실행을 거부했다:
 *   Executing inline script violates the following Content Security Policy directive:
 *   "script-src 'self'"
 *
 * CSP 에 해시('sha256-...')나 nonce 를 넣어 인라인을 허용하는 방법도 있다. 그러지 않은 이유는
 * 해시 방식이 이 파일을 한 글자 고칠 때마다 CSP 의 해시도 같이 고쳐야 하고, 잊으면 다크 모드가
 * 조용히 죽어서 한동안 아무도 모르기 때문이다. 외부 파일로 두면 'self' 로 그냥 통과한다.
 *
 * public/ 에 두었으므로 Vite 가 내용을 건드리지 않고 dist 루트로 그대로 복사한다 — 파일 이름에
 * 해시가 붙지 않아 index.html 이 참조하는 경로가 빌드마다 바뀌지 않는다.
 * index.html 의 <head> 안에서 async/defer 없이 불러야 body 가 그려지기 전에 실행된다.
 */
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
