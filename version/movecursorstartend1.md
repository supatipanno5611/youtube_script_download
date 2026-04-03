```ts
import { Plugin, Editor } from 'obsidian';

export default class LineCursorPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: 'go-to-line-start',
			name: 'Go to line start',
			editorCallback: (editor: Editor) => this.goToLineStart(editor),
		});

		this.addCommand({
			id: 'go-to-line-end',
			name: 'Go to line end',
			editorCallback: (editor: Editor) => this.goToLineEnd(editor),
		});
	}

	private goToLineStart(editor: Editor) {
		const cursor = editor.getCursor();
		editor.setCursor({ line: cursor.line, ch: 0 });
	}

	private goToLineEnd(editor: Editor) {
		const cursor = editor.getCursor();
		editor.setCursor({ line: cursor.line, ch: editor.getLine(cursor.line).length });
	}
}
```
