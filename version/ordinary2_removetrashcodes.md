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

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async openFileOrdinary() {
        const path = this.settings.ordinaryFilePath;
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        // 이미 열려 있는 탭이 있다면 focus, 없으면 현재 탭에서 열기
        const existingLeaf = this.app.workspace.getLeavesOfType("markdown")
            .find(leaf => (leaf.view as MarkdownView).file?.path === path);

        const targetLeaf = existingLeaf || this.app.workspace.getLeaf(false);
        await targetLeaf.openFile(file);

        // 헤더 추가
        const editor = (targetLeaf.view as MarkdownView).editor;
        const header = `### ${moment().format("MM월 DD일 (ddd)")}`;
        const content = editor.getValue();

        if (!content.includes(header)) {
            const sep = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "";
            editor.replaceRange(`${sep}${header}\n`, { line: editor.lineCount(), ch: 0 });
        }

        // 커서를 마지막 행 끝에 두고 포커스
        editor.setCursor(editor.lineCount(), 0);
        editor.focus();
    }
}
```