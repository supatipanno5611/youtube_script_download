```ts
import {
    Plugin,
    TFile,
    Notice,
    normalizePath,
    moment
 } from 'obsidian';

interface DataJsonSettings {
    MAX_REPEAT: number; // savemd
    autoSaveTrigger: number; // savemd
    autoSaveTarget: string; // savemd
    SAVE_FOLDER_PATH: string; // savemd
    SAVE_DATE_FORMAT: string; // savemd
}

const DEFAULT_SETTINGS: DataJsonSettings = {
    MAX_REPEAT: 80,
    autoSaveTrigger: 500,
    autoSaveTarget: "",
    SAVE_FOLDER_PATH: "save",
    SAVE_DATE_FORMAT: "YYYYMMDDHHmmss"
}

export default class DataJsonPlugin extends Plugin {
    settings: DataJsonSettings;
    // savemd 입력 카운트 초기화
    private lastKey: string = "";
    private repeatCount: number = 0;
    // savemd 누적 입력 카운트
    private totalKeyCount: number = 0;

    async onload() {
        await this.loadSettings();
        // savemd
        // 리본 아이콘: 수동 save 파일 생성
        this.addRibbonIcon("lucide-save", "세이브 파일 만들기", () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.createSaveFile(activeFile);
            } else {
                new Notice("활성화된 파일이 없습니다.");
            }
        });
        // 수동 저장
        this.addCommand({
            id: "create-save-file",
            name: "현재 문서의 세이브 파일 만들기",
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === "md") {
                    if (!checking) {
                        this.createSaveFile(activeFile);
                    }
                    return true;
                }
                return false;
            },
        });
        // 자동 저장 대상 지정
        this.addCommand({
            id: 'set-auto-save-target',
            name: '현재 문서를 n타마다 자동 세이브 대상으로 지정',
            callback: () => this.handleSetAutoSaveTarget()
        });

        // 자동 저장 대상 해제
        this.addCommand({
            id: 'unset-auto-save-target',
            name: '현재 문서를 n타마다 자동 세이브 대상에서 해제',
            callback: () => this.handleUnsetAutoSaveTarget()
        });
       // 키보드 입력 감지 (비정상 입력 & 자동 저장)
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleAbnormalInput(evt);
            this.handleAutoSaveInput(evt);
        });
        // 파일 메뉴에 명령어 등록
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                // file이 TFile인지 검사
                if (file instanceof TFile){
                    menu.addItem((item) => {
                    item
                        .setTitle("현재 문서의 세이브 파일 만들기")
                        .setIcon("save")
                        .onClick(async () => {
                            await this.createSaveFile(file);
                        });
                });
                }
            })
        );
    }
    
    // data 불러오고 저장하는 메서드
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
    await this.saveData(this.settings);
    }

    // 자동 저장 대상 지정 메서드
    async handleSetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("마크다운 문서가 아닙니다.");
            return;
        }

        // 이미 다른 문서가 지정되어 있는지 확인
        if (this.settings.autoSaveTarget !== "") {
            // 경로에서 파일명만 추출해서 보여줌
            const currentTargetName = this.settings.autoSaveTarget.split('/').pop();
            new Notice(`이미 지정된 문서가 있습니다: ${currentTargetName}\n먼저 해제해주세요.`);
            return;
        }

        // 설정 저장
        this.settings.autoSaveTarget = activeFile.path;
        this.totalKeyCount = 0; // 카운트 초기화
        await this.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 시작되었습니다.\n(${this.settings.autoSaveTrigger}타 마다 저장)`);
    }

    // 자동 저장 대상 해제 메서드
    async handleUnsetAutoSaveTarget() {
        const activeFile = this.app.workspace.getActiveFile();
        
        // 현재 지정된 타겟이 없는 경우
        if (this.settings.autoSaveTarget === "") {
            new Notice("⚠️ 현재 자동 저장 대상으로 지정된 문서가 없습니다.");
            return;
        }

        // 활성 파일이 없거나, 지정된 타겟과 경로가 다를 경우
        if (!activeFile || activeFile.path !== this.settings.autoSaveTarget) {
            const currentTargetName = this.settings.autoSaveTarget.split('/').pop();
            new Notice(`⚠️ 이 문서는 자동 저장 대상이 아닙니다.\n(현재 대상: ${currentTargetName})`);
            return;
        }

        // 해제 로직
        this.settings.autoSaveTarget = "";
        this.totalKeyCount = 0; // 카운트 초기화
        await this.saveSettings();

        new Notice(`[${activeFile.basename}] 자동 저장이 해제되었습니다.`);
    }

    // 비정상 입력 감지 관련 코드
    private handleAbnormalInput(evt: KeyboardEvent) {
        // 현재 활성화된 뷰가 마크다운 에디터인지 확인
        const activeView = this.app.workspace.getActiveFile();
        if (!activeView || activeView.extension !== "md") return;

        // 포커스가 실제 에디터 입력창(.cm-content)에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 조합 중인 키(한글 입력 등)나 특수 기능키(Shift, Ctrl 등)는 1차 제외
        if (evt.isComposing || evt.key.length > 1) {
            // 단, 백스페이스나 엔터는 연속 입력 감지에 포함하고 싶다면 예외 처리 가능
            if (evt.key !== "Backspace" && evt.key !== "Enter") return;
        }

        // 연속 입력 로직
        if (this.lastKey === evt.key) {
            this.repeatCount++;
        } else {
            this.lastKey = evt.key;
            this.repeatCount = 1;
        }

        // 임계치 도달 시 긴급 조치
        if (this.repeatCount >= this.settings.MAX_REPEAT) {
            this.emergencyAction(activeView);
        }
    }
    // 자동 저장 입력 감지 로직
    private handleAutoSaveInput(evt: KeyboardEvent) {
        // 1. 기능이 비활성화(0)거나 타겟이 설정되지 않았으면 즉시 종료
        if (this.settings.autoSaveTrigger <= 0 || this.settings.autoSaveTarget === "") return;

        // 2. Modifier 키 제외
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(evt.key)) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        // 3. [핵심] 현재 문서가 지정된 타겟 문서와 일치하는지 확인 (경로 비교)
        if (activeFile.path !== this.settings.autoSaveTarget) return;

        // 포커스가 에디터에 있는지 확인
        const isEditor = (evt.target as HTMLElement).closest('.cm-content');
        if (!isEditor) return;

        // 4. 카운트 증가 및 저장 실행
        this.totalKeyCount++;

        if (this.totalKeyCount >= this.settings.autoSaveTrigger) {
            this.totalKeyCount = 0; // 카운트 리셋
            this.createSaveFile(activeFile);
            // Notice 메시지에 자동 저장됨을 명시하면 더 좋습니다 (선택사항)
            new Notice(`${this.settings.autoSaveTrigger}타 자동 저장`);
        }
    }
    private async emergencyAction(file: TFile) {
        // 무한 루프 방지를 위한 카운트 초기화
        this.repeatCount = 0;
        this.lastKey = "";

        // 1. 즉시 백업 파일 생성
        await this.createSaveFile(file);

        // 2. 에디터 포커스 강제 해제 (추가 입력 방지)
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        new Notice(`⚠️ 비정상 입력 감지: '${file.basename}' 백업 후 포커스를 해제했습니다.`);
    }
    // 세이브 파일 생성 로직
    private async createSaveFile(file: TFile) {
        const folderPath = this.settings.SAVE_FOLDER_PATH;
        const ts = moment().format(this.settings.SAVE_DATE_FORMAT);
        const newPath = normalizePath(`${folderPath}/${file.basename}_save_${ts}.md`);

        try {
            const { vault } = this.app;
            
            // 폴더가 없으면 생성
            if (!(await vault.adapter.exists(folderPath))) {
                await vault.createFolder(folderPath);
            }

            // 파일 복사
            await vault.copy(file, newPath);
            new Notice(`세이브 파일 저장됨: ${file.basename}_save_${ts}`);
        } catch (error) {
            new Notice("파일 복사 중 오류가 발생했습니다.");
        }
    }
}
```