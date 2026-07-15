# CLAUDE.md — SAM Scheduler

이 프로젝트의 아키텍처 규칙·정책·개발 제약·트러블슈팅은 모두 `AGENTS.md`에 정리되어 있습니다.
Claude Code는 아래 임포트로 그 내용을 그대로 읽어들입니다. **AGENTS.md가 단일 원본**이며,
규칙을 바꿀 때는 이 파일이 아니라 `AGENTS.md`를 수정하세요. (agy·Cline 등 다른 도구도 AGENTS.md를 봅니다.)

@AGENTS.md

---

## Claude Code 환경 보강

위 임포트 내용에 더해, Claude Code 환경에서만 해당하는 사항입니다.

- **셸 작업 디렉터리**: AGENTS.md의 "`cd` 사용 금지" 규칙은 Claude Code에서도 유효합니다.
  독립적인 `cd`로 디렉터리를 바꾸지 말고, **절대 경로**를 쓰거나 도구의 작업 디렉터리 지정으로 실행하세요.
  워크스페이스 명령은 루트에서 `pnpm -F <pkg> ...` 형태로 실행하는 것을 권장합니다.
- **수정 후 검증**: 코드 변경 뒤 반드시 `pnpm -r typecheck`로 컴파일 에러를 확인합니다 (AGENTS.md 4.1).
- **DB 변경 알림**: 스키마/마이그레이션 변경 시 사용자에게 상세히 공유합니다 (AGENTS.md 7, `.clinerules`와 동일 규칙).
- **Playwright MCP**: 브라우저 자동화용 Playwright MCP 서버는 프로젝트 `.mcp.json`에 정의되어 있습니다
  (기존 `.agents/mcp_config.json`과 동일 설정). 브라우저 스냅샷/로그는 `.playwright-mcp/`에 떨어지며
  `.gitignore`에 등록되어 있습니다.
