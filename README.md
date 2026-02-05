# MineServer Hub (Local UI)

로컬에서 마인크래프트 서버를 **설치/실행/관리**할 수 있는 간단한 웹 UI입니다.  
외부 공개 없이 **PC 내부에서만** 사용하도록 설계되었습니다.

## 주요 기능
- 서버 설치(버전 선택) + 자동 다운로드
- 서버 시작/중지/삭제
- 실시간 로그 보기 + 콘솔 명령 전송
- `server.properties` 전체 편집
- 화이트리스트/OP/벤 목록 관리
- 로컬/외부 접속 정보 표시

## 요구 사항
- Windows 10/11
- Node.js (권장: LTS)
- Java (서버 실행용, 권장: 17 이상)

## 폴더 구조 (기본)
- 서버 파일: `./server`
- 앱 설정: `data/app-config.json` (자동 생성)
- 정적 UI: `public/`

## 설치
1. 프로젝트 폴더로 이동
```powershell
cd "C:\Users\user0\Desktop\개발\기타 프로그렘\minecraft-server-UI"
```

2. 의존성 설치
```powershell
npm install
```

## 실행 (개발 모드)
```powershell
npm run dev
```

실행 후 브라우저에서 아래 주소로 접속:
- `http://127.0.0.1:3030`

## 사용법 (상세)

### 1) 첫 실행
- `./server` 폴더가 없으면 **설치 카드**가 표시됩니다.
- 서버 종류(예: Vanilla / Paper)와 버전을 선택해 다운로드합니다.
- 다운로드 완료 후 필요하면 **EULA 동의**를 진행합니다.

### 2) 서버 시작/중지
- 상단의 **Start** 버튼을 누르면 서버가 실행됩니다.
- **Stop** 버튼으로 안전하게 종료합니다.
- 서버가 오래 응답하지 않으면 자동으로 강제 종료가 시도됩니다.

### 3) 로그 확인 & 명령 전송
- 화면 하단 로그 창에서 실시간 로그를 확인합니다.
- 명령 입력창에 `say hello` 같은 명령을 넣고 전송할 수 있습니다.

### 4) 서버 설정 변경
- **Config** 메뉴에서 `server.properties`를 편집할 수 있습니다.
- 파일이 없으면 표시되지 않으니, 서버를 한 번 이상 실행해 생성하세요.

### 5) 플레이어 목록 관리
- 화이트리스트/OP/밴 목록을 UI에서 관리합니다.
- 저장 시 JSON 파일로 자동 반영됩니다.

## 설정 파일 설명

### `data/app-config.json`
앱에서 사용하는 설정이 저장됩니다. 예시:
- `serverDir`: 서버 폴더 경로 (기본 `./server`)
- `jar`: 서버 jar 파일명 (기본 `server.jar`)
- `memory`: 자바 메모리 설정 (`xms`, `xmx`)
- `nogui`: `true`면 nogui로 실행
- `logLines`: 로그 표시 줄 수

## 주의 사항
- **로컬 전용**으로 사용하세요. 외부 공개는 권장하지 않습니다.
- **서버 삭제**는 `./server` 폴더 전체를 삭제합니다. (월드/설정/로그 포함)
- Java가 설치되어 있어야 서버 실행이 가능합니다.

## 문제 해결

### 브라우저에서 접속이 안 될 때
- `npm run dev`가 실행 중인지 확인
- 주소가 `http://127.0.0.1:3030`인지 확인
- 다른 프로그램이 3030 포트를 사용 중이면 `server.js`의 `PORT`를 변경하세요

### 서버 실행이 실패할 때
- Java 설치 여부 확인
- `./server/server.jar` 존재 여부 확인
- EULA 동의 여부 확인 (`./server/eula.txt`)

## 라이선스
[MIT](https://github.com/boulmyong/MineServer_Hub?tab=MIT-1-ov-file#)
