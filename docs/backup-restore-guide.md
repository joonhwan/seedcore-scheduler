# SAM Scheduler (seedcore) Air-gap Windows 운영 및 DB 백업/복구 가이드

본 문서는 외부 인터넷이 연결되지 않는 **Air-gap 폐쇄망 Windows 환경**에서 **SAM Scheduler (`sp-server.exe`)**를 단일 PC에 구동하고, 사내 네트워크(LAN) 타 PC 접속 및 DB 백업/복구를 수행하는 구체적인 운영 가이드입니다.

---

## 1. 단일 실행 파일 구성 (Executable Package)

단일 실행 파일 빌드(`pnpm build:exe`) 결과물은 `dist-exe/` 디렉터리에 3개의 독립 실행 파일(.exe) 및 사용 설명서(README.txt)로 구성됩니다.

| 실행 파일명 | 역할 및 설명 |
| :--- | :--- |
| **`sp-server.exe`** | **메인 서버**: 웹 SPA 서빙 + REST API + DB가 통합된 사내 전용 웹 서버 |
| **`sp-backup.exe`** | **백업/복구 CLI**: SQLite 데이터베이스 스냅샷 백업 및 특정 시점 복구 도구 |
| **`sp-reset-admin.exe`** | **암호 재설정 CLI**: 관리자(`admin`) 비밀번호 분실 시 즉시 재설정 및 계정 잠금 해제 |
| **`README.txt`** | **사용 설명서**: 관리자를 위한 서버 실행, 백업/복구 및 디렉터리 안내 문서 |

---

## 2. 서버 구동 및 사내 접속 방법

### 2.1. 서버 구동 (호스트 Windows PC 1대)
1. 준비된 Windows PC의 적절한 폴더(예: `C:\seedcore-scheduler\`)에 `sp-server.exe` 파일 및 보조 exe 파일들을 배치합니다.
2. `sp-server.exe`를 더블 클릭하여 실행합니다.
3. 최초 실행 시 데이터베이스 폴더(`./data/sam.db`)가 자동으로 생성되고 웹 서버가 시작됩니다.
4. 콘솔 화면에 다음과 같은 접속 안내 메시지가 표시됩니다:
   ```text
   ====================================================
     🚀 seedcore-scheduler (SAM Scheduler) 서버 구동 완료!
     - 로컬 접속 주소: http://localhost:3000
     - 사내 LAN 타 PC 접속 주소:
       👉 http://192.168.0.10:3000
     - DB 파일 경로: file:D:/seedcore-scheduler/data/sam.db
   ====================================================
   ```

### 2.2. 사내 네트워크(LAN) 타 사용자 접속
- 동일 사무실 LAN 네트워크 내 다른 사용자는 웹 브라우저(Edge, Chrome 등) 주소창에 콘솔에 표시된 IP 주소(`http://192.168.0.10:3000`)를 입력하여 접속합니다.

### 2.3. Windows 방화벽(Inbound Port 3000) 허용
사내 타 PC에서 접속이 안 될 경우, 호스트 PC의 Windows 방화벽에서 3000번 포트를 허용해야 합니다:
1. `Windows 검색` -> `성능 및 보안` -> `Windows Defender 방화벽` -> `고급 설정` 선택.
2. `인바운드 규칙` -> `새 규칙` 클릭.
3. `포트` 선택 -> `TCP`, 특정 로컬 포트: `3000` 입력 -> `연결 허용` -> 규칙 이름(`SAM Scheduler 3000`) 설정 후 완료.

---

## 3. DB 백업 및 특정 시점 복구 가이드

데이터베이스는 `sp-server.exe`가 실행된 위치의 `./data/sam.db` 파일에 저장됩니다.

### 3.1. 수동 백업 (`sp-backup.exe`)
명령 프롬프트(cmd) 또는 PowerShell에서 다음 명령어를 실행합니다:
```cmd
# 현재 DB를 ./backups/ 디렉터리에 타임스탬프 파일로 즉시 백업
sp-backup.exe backup
```
- 실행 시 `./backups/sam_YYYYMMDD_HHMMSS.db` 형태로 백업 스냅샷이 자동 생성됩니다.

### 3.2. 백업 파일 목록 조회
```cmd
sp-backup.exe list
```
- 출력 예시:
  ```text
  📁 백업 파일 목록 (D:\seedcore-scheduler\backups):
     - sam_20260723_140000.db  (256.0 KB, 2026. 7. 23. 오후 2:00:00)
     - sam_20260723_090000.db  (240.5 KB, 2026. 7. 23. 오전 9:00:00)
  ```

### 3.3. 특정 날짜 백업으로 복구 (Restore)
특정 백업 시점으로 데이터베이스를 복구하려면 아래 명령어를 실행합니다:
```cmd
sp-backup.exe restore sam_20260723_090000.db
```
- **안전장치**: 복구 실행 직전에 현재 DB가 `sam_before_restore_YYYYMMDD_HHMMSS.db`로 **자동 안전 백업**된 후 복구가 진행됩니다.
- 복구 완료 후, 구동 중인 `sp-server.exe`를 재시작하면 복구된 데이터가 즉시 적용됩니다.

### 3.4. Windows 작업 스케줄러를 통한 일일 자동 백업 등록
매일 정해진 시각(예: 매일 밤 11시)에 백업이 실행되도록 설정할 수 있습니다:
1. `Windows 검색` -> `작업 스케줄러` 실행.
2. `작업 만들기` 선택:
   - 이름: `Seedcore Scheduler Daily Backup`
   - 트리거: `매일` -> `오후 11:00:00`
   - 동작: `프로그램 시작` -> 프로그램/스크립트: `C:\seedcore-scheduler\sp-backup.exe`, 인수 추가: `backup`
3. 저장하면 매일 밤 자동 백업 스냅샷이 생성됩니다.

---

## 4. 관리자(`admin`) 비밀번호 재설정 가이드

`sp-reset-admin.exe`는 **`sp-server.exe`가 최초 1회 이상 실행되어 데이터베이스(`data/sam.db`)가 생성된 상태(또는 서버가 구동 중인 상태)**에서 동작합니다.

### 사용법
```cmd
# admin 계정의 비밀번호를 NewPassword123! 로 즉시 변경 및 잠금 해제
sp-reset-admin.exe NewPassword123!
```

- **실행 조건**: `sp-server.exe`가 구동 중인 상태에서도 즉시 실행 가능하며, 서버를 재시작할 필요 없이 새로 변경한 비밀번호로 바로 로그인할 수 있습니다.


---

## 5. 초기 관리자 계정 정보

- **기본 아이디**: `admin`
- **기본 비밀번호**: `ChangeMe!Now`
- **참고사항**: 최초 로그인 시 비밀번호 변경 화면으로 이동합니다.
