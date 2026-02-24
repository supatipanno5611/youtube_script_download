```ts
import { Editor, Plugin, MarkdownView } from 'obsidian';

// 1. 저장할 데이터 구조 정의
interface CursorCenterSettings {
    isEnabled: boolean;
}

// 2. 기본값 설정 (처음 설치 시 Off 상태)
const DEFAULT_SETTINGS: CursorCenterSettings = {
    isEnabled: false
}

export default class CursorCenterPlugin extends Plugin {
    settings: CursorCenterSettings;

    async onload() {
        // 설정 로드
        await this.loadSettings();

        // 토글 명령 등록
        this.addCommand({
            id: 'toggle-cursor-center',
            name: '커서 중앙 유지 토글',
            callback: () => this.toggleCursorCenter()
        });

        // 실시간 중앙 유지 이벤트 등록
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                if (this.settings.isEnabled) {
                    this.scrollToCursorCenter(editor);
                }
            })
        );
    }

    async toggleCursorCenter() {
        // 상태 반전 및 저장
        this.settings.isEnabled = !this.settings.isEnabled;
        await this.saveSettings();

        // 활성화 시 즉시 중앙 정렬 실행
        if (this.settings.isEnabled) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                this.scrollToCursorCenter(view.editor);
            }
        }
    }

    // 커서 이동 로직
    private scrollToCursorCenter(editor: Editor) {
        const cursor = editor.getCursor();
        // true 인자는 수직 중앙(Center) 정렬을 의미합니다.
        editor.scrollIntoView({ from: cursor, to: cursor }, true);
    }

    // 설정 데이터 로드 함수
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // 설정 데이터 저장 함수
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
```