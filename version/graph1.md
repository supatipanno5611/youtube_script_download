```ts
import {
    Plugin
} from 'obsidian';

export default class LocalGraphPlugin extends Plugin {
    async onload() {
        this.addRibbonIcon("lucide-git-fork", "로컬 그래프 열기", () => this.openLocalGraphInSidebar());
        this.addCommand({
            id: 'open-localgraph-in-sidebar',
            name: '오른쪽 사이드바에 로컬그래프 열기',
            callback: () => this.openLocalGraphInSidebar(),
        });
    }
    
    private async openLocalGraphInSidebar() {
    const leaf = this.app.workspace.getLeavesOfType('localgraph')[0] || this.app.workspace.getRightLeaf(false);

    // leaf가 존재하는지 확인
    if (leaf) {
        await leaf.setViewState({ type: 'localgraph', active: true });
        this.app.workspace.revealLeaf(leaf);
    }
    }
}
```