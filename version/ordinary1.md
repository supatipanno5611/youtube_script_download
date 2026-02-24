```ts
import {
    Plugin, TFile, MarkdownView, moment, Notice
} from 'obsidian';

interface OpenOrdinaryFileSettings {
    ordinaryFilePath: string;
}

const DEFAULT_SETTINGS: OpenOrdinaryFileSettings = {
    ordinaryFilePath: 'ordinary.md'
};

export default class OpenOrdinaryFilePlugin extends Plugin {
    settings: OpenOrdinaryFileSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('calendar', '일상노트 열기', () => {
            this.openFileOrdinary();
        });
        
        this.addCommand({
            id: 'open-ordinary-file',
            name: '일상노트 열기',
            callback: () => this.openFileOrdinary(),
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // [Ordinary]
    private async openFileOrdinary() {
        // ordinary 파일 경로 지정
        const path = this.settings.ordinaryFilePath;
        const file = this.app.vault.getAbstractFileByPath(path);

        // ordinary 파일이 없을 경우
        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        // 현재 cursorcenter 상태를 백업하고 잠시 끄기 (애니메이션이 겹치는 버그 수정)
        const originalState = this.settings.isEnabled;
        this.settings.isEnabled = false;

        // 이미 열려 있는 탭이 있다면 focus, 없으면 현재 탭(false)에서 열기
        const existingLeaf = this.app.workspace.getLeavesOfType("markdown")
            .find(leaf => (leaf.view as MarkdownView).file?.path === path);

        const targetLeaf = existingLeaf || this.app.workspace.getLeaf(false);
        await targetLeaf.openFile(file);

        // 에디터 작업 (헤더 추가 및 포커스)
        const editor = (targetLeaf.view as MarkdownView).editor;
        const header = `### ${moment().format("MM월 DD일 (ddd)")}`;
        const content = editor.getValue();
        
        if (!content.includes(header)) {
            const sep = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "";
            editor.replaceRange(`${sep}${header}\n`, { line: editor.lineCount(), ch: 0 });
        }

        // 커서를 마지막 행의 끝에 두고 포커스
        editor.setCursor(editor.lineCount(), 0);
        editor.focus();

        // 행 개수에 따른 동적 지연 시간 계산
        // 기본 150ms + 1행당 1ms 추가 (최대 10초 제한)
        const lineCount = editor.lineCount();
        const dynamicDelay = Math.max(150, lineCount * 1);

        // 지연 후 cursorcenter 상태를 복구
        setTimeout(async () => {
            this.settings.isEnabled = originalState;
            // 다시 켰을 때 현재 위치(맨 밑)를 부드럽게 중앙으로 잡기
            if (this.settings.isEnabled) {
                this.scrollToCursorCenter(editor);
            }
        }, dynamicDelay);
    }
}
```