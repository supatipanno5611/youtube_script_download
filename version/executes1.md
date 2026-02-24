```ts
import { Plugin, MarkdownView } from 'obsidian';

export default class ExecutesPlugin extends Plugin {
    async onload() {
        // executes
        this.addCommand({
            id: 'execute-undo',
            name: '실행 취소',
            icon: 'lucide-undo-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Z" }],
            callback: () => this.executeUndo(),
        });
        this.addCommand({
            id: 'execute-redo',
            name: '다시 실행',
            icon: 'lucide-redo-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Y" },
                { modifiers: ["Mod", "Shift"], key: "Z" }],
            callback: () => this.executeRedo(),
        });
        this.addCommand({
            id: 'execute-delete-paragraph',
            name: '단락 제거',
            icon: 'lucide-trash-2',
            hotkeys: [{ modifiers: ["Mod"], key: "Delete" }],
            callback: () => this.executeDeleteParagraph(),
        });
    }

    // 실행 취소
    private executeUndo() {
        // 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 undo 실행
            (view as any).editor.undo();
        }
    }
    // 다시 실행
    private executeRedo() {
		// 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 redo 실행
            (view as any).editor.redo();
        }
    }
    // 단락 제거
    private executeDeleteParagraph() {
		// 활성화된 마크다운 뷰를 가져옵니다.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            // 옵시디언 에디터 객체에서 직접 단락 제거 실행
            (this.app as any).commands.executeCommandById('editor:delete-paragraph');
        }
    }
}
```