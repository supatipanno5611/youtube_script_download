```ts
import {
    Plugin, TFile, Notice, WorkspaceLeaf
} from 'obsidian';

interface OpenWorkFileSettings {
    openNewTab?: boolean; // 새 탭에서 열지 여부 (기본값: false)
    cleanupOnStartup: boolean;
    workFilePath: string;
}

const DEFAULT_SETTINGS: OpenWorkFileSettings = {
    openNewTab: false,
    cleanupOnStartup: false, // workmd
    workFilePath: 'work.md'
};

export default class OpenWorkFilePlugin extends Plugin {
    settings: OpenWorkFileSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', () => {
            this.openFileWithCleanup(this.settings.workFilePath);
        });

        this.addCommand({
            id: 'open-work-file',
            name: '작업 문서 열기',
            callback: () => this.openFileWithCleanup(this.settings.workFilePath),
        });

        // 워크스페이스 레이아웃이 준비되면 현재 설정에 맞게 패치 적용
        this.app.workspace.onLayoutReady(() => {
            // workmd 시작 시 정리 옵션 처리
            if (this.settings.cleanupOnStartup && this.settings.workFilePath) {
                // 약간의 딜레이를 주어 안정성 확보
                setTimeout(async () => {
                    await this.openFileWithCleanup(this.settings.workFilePath);
                }, 100); 
            }
		});
    }

    async loadSettings() {
        // loadData로 가져온 값이 없으면 기본값을 사용합니다.
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    private async openFileWithCleanup(path: string) {
    const { workspace, vault } = this.app;
    const { openNewTab } = this.settings;
    const targetFile = vault.getAbstractFileByPath(path);

    if (!(targetFile instanceof TFile)) {
        new Notice('파일을 찾을 수 없습니다.');
        return;
    }

    let targetLeaf: WorkspaceLeaf;

    if (openNewTab) {
        // [case: true] 새 탭을 먼저 생성합니다.
        targetLeaf = workspace.getLeaf('tab');
    } else {
        // [case: false] 현재 활성화된 리프를 재사용합니다.
        targetLeaf = workspace.getLeaf(false);
    }

    // 1. 타겟 리프에 파일을 엽니다.
    await targetLeaf.openFile(targetFile);

    // 2. 타겟 리프를 제외한 메인 영역의 모든 탭을 수집하여 제거합니다.
    const leavesToClose: WorkspaceLeaf[] = [];
    workspace.iterateAllLeaves((leaf) => {
        if (leaf.getRoot() === workspace.rootSplit && leaf !== targetLeaf) {
            leavesToClose.push(leaf);
        }
    });

    leavesToClose.forEach(leaf => leaf.detach());

    // 3. 최종적으로 타겟 리프에 포커스를 줍니다.
    workspace.setActiveLeaf(targetLeaf, { focus: true });
    }
}
```