```ts
import { Plugin, MarkdownView } from 'obsidian';

export default class DiagPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'diag-link-offset',
            name: 'Link offset 진단',
            callback: async () => {
                const file = this.app.workspace.getActiveFile();
                if (!file) return;

                const cache = this.app.metadataCache.getFileCache(file);
                const links = cache?.links;
                if (!links || links.length === 0) return;

                const content = await this.app.vault.read(file);
                const lines: string[] = ['\n\n---\n## diag'];

                for (const link of links) {
                    const sliced = content.substring(link.position.start.offset, link.position.end.offset);
                    lines.push(`- original: \`${link.original}\``);
                    lines.push(`- sliced:   \`${sliced}\``);
                    lines.push(`- match: ${link.original === sliced}`);
                    lines.push('');
                }

                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;
                const editor = view.editor;
                editor.replaceRange(lines.join('\n'), { line: editor.lineCount(), ch: 0 });
            }
        });
    }
}
```
