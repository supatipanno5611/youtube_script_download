```ts
import {
    Plugin
} from 'obsidian';

export default class LocalGraphPlugin extends Plugin {
    async onload() {
        this.addRibbonIcon("lucide-git-fork", "로컬 그래프 열기", () => this.openLocalGraphInSidebar());
        this.addCommand({
            id: 'open-localgraph-in-sidebar',
            name: '오른쪽 사이드바에 로컬그래프뷰 열기',
            callback: () => this.openLocalGraphInSidebar(),
        });
        this.addCommand({
            id: 'open-graph-in-sidebar',
            name: '오른쪽 사이드바에 그래프뷰 열기', // 명령어 팔레트에서 검색할 이름
            callback: () => this.openGlobalGraphInSidebar(),
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

    private async openGlobalGraphInSidebar() {
        // 이미 열려있는 전체 그래프가 있으면 가져오고, 없으면 오른쪽 사이드바 리프를 가져옴
        // 'graph'가 전체 그래프의 내부 ID입니다.
        const leaf = this.app.workspace.getLeavesOfType('graph')[0] || this.app.workspace.getRightLeaf(false);

        if (leaf) {
            await leaf.setViewState({ type: 'graph', active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }
}
```