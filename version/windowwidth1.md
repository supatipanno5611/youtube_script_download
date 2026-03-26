```ts
import { Plugin, Notice } from 'obsidian';

export default class CheckScreenPlugin extends Plugin {
    async onload() {
        this.addCommand({
            id: 'check-screen-width',
            name: '화면 너비 확인',
            callback: () => new Notice(`screen.width: ${window.screen.width}`)
        });
    }
}
```
