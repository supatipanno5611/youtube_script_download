```ts
import { Plugin, Editor, EditorSelection } from 'obsidian';

export default class SelectionExpander extends Plugin {
    async onload() {

        // 왼쪽 1칸
        this.addCommand({
            id: 'expand-selection-left',
            name: '선택 범위 왼쪽으로 한 칸 늘리기',
            icon: "lucide-chevron-left",
            hotkeys: [{ modifiers: ["Mod"], key: "ArrowLeft"}],
            editorCallback: (editor: Editor) => this.expandLeft(editor),
        });

        // 왼쪽 행 시작까지
        this.addCommand({
            id: 'expand-selection-left-end',
            name: '선택 범위 행 시작까지 늘리기',
            icon: "lucide-chevrons-left",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowLeft"}],
            editorCallback: (editor: Editor) => this.expandLeftEnd(editor),
        });

        // 오른쪽 1칸
        this.addCommand({
            id: 'expand-selection-right',
            name: '선택 범위 오른쪽으로 한 칸 늘리기',
            icon: "lucide-chevron-right",
            hotkeys: [{ modifiers: ["Mod"], key: "ArrowRight"}],
            editorCallback: (editor: Editor) => this.expandRight(editor),
        });

        // 오른쪽 행 끝까지
        this.addCommand({
            id: 'expand-selection-right-end',
            name: '선택 범위 행 끝까지 늘리기',
            icon: "lucide-chevrons-right",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "ArrowRight"}],
            editorCallback: (editor: Editor) => this.expandRightEnd(editor),
        });
    }

    // 오른쪽 1칸
    expandRight(editor: Editor) {
        const selections = editor.listSelections().map(sel => ({
            anchor: sel.anchor,
            head: {
                line: sel.head.line,
                ch: sel.head.ch + 1
            }
        }));

        editor.setSelections(selections);
    }
    // 왼쪽 1칸
    expandLeft(editor: Editor) {
        const selections: EditorSelection[] = editor.listSelections().map(sel => {
            let { line, ch } = sel.head;

            if (ch > 0) {
                ch--;
            } else if (line > 0) {
                line--;
                ch = editor.getLine(line)?.length ?? 0;
            }

            return {
                anchor: sel.anchor,
                head: { line, ch }
            };
        });

        editor.setSelections(selections);
    }

    // 왼쪽 행 시작까지
    expandLeftEnd(editor: Editor) {
        const selections = editor.listSelections().map(sel => ({
            anchor: sel.anchor,
            head: {
                line: sel.head.line,
                ch: 0
            }
        }));

        editor.setSelections(selections);
    }

    // 오른쪽 행 끝까지
    expandRightEnd(editor: Editor) {
        const selections = editor.listSelections().map(sel => {
            const line = sel.head.line;
            const lineLength = editor.getLine(line)?.length ?? 0;

            return {
                anchor: sel.anchor,
                head: {
                    line,
                    ch: lineLength
                }
            };
        });

        editor.setSelections(selections);
    }
}
```