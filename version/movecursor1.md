```ts
import { Plugin, Editor, EditorPosition } from 'obsidian';

export default class MoveCurSorPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'move-cursor-to-end',
            name: '커서를 문서 끝으로 이동',
            editorCallback: (editor: Editor) => this.moveCursorToEnd(editor)
        });
        this.addCommand({
            id: 'move-cursor-to-start',
            name: '커서를 문서 처음으로 이동',
            editorCallback: (editor: Editor) => this.moveCursorToStart(editor)
        });
    }

    private moveCursorToEnd(editor: Editor) {
        editor.focus();
        const line = editor.lineCount() - 1;
        const pos: EditorPosition = { line, ch: editor.getLine(line).length };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }
    private moveCursorToStart(editor: Editor) {
        editor.focus();
        const pos: EditorPosition = { line: 0, ch: 0 };
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
    }
}
```