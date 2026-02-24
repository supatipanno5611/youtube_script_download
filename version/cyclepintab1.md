```ts
import { Plugin, WorkspaceLeaf } from 'obsidian';

export default class CyclePinnedTabsPlugin extends Plugin {
    // 마지막으로 활성화되었던 탭들을 추적하기 위한 변수
    private lastPinnedLeaf: WorkspaceLeaf | null = null;
    private lastUnpinnedLeaf: WorkspaceLeaf | null = null;

    async onload() {

        // [이벤트 리스너] 탭이 변경될 때마다 위치를 기억합니다.
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                // 잎(Leaf)이 없으면 무시 (예: 앱 초기화 중 등)
                if (!leaf) return;

                const state = leaf.getViewState();
                
                if (state.pinned) {
                    // 고정된 탭으로 왔다면, '마지막 고정 탭' 갱신
                    this.lastPinnedLeaf = leaf;
                } else {
                    // 고정되지 않은 탭으로 왔다면, '마지막 일반 탭' 갱신
                    this.lastUnpinnedLeaf = leaf;
                }
            })
        );

        // 2. [명령어] 다음 고정 탭으로 순환 (Cycle Next)
        this.addCommand({
            id: 'cycle-next-pinned-tab',
            name: '다음 고정된 탭으로 순환',
            callback: () => {
                this.cycleNextPinnedTab();
            }
        });

        // 3. [명령어] 스마트 토글 (Smart Toggle / Return)
        // - 고정 탭에 있으면 -> 작업하던 일반 탭으로
        // - 일반 탭에 있으면 -> 보던 고정 탭으로
        this.addCommand({
            id: 'toggle-pinned-unpinned', // ID는 기능에 맞게 수정했습니다.
            name: '고정 탭 <-> 작업 탭 전환 (Smart Toggle)',
            callback: () => {
                this.smartToggleTab();
            }
        });
    }

    onunload() {
        console.log('Cycle Pinned Tabs 플러그인이 언로드되었습니다.');
    }

    // --- [기능 1] 다음 고정 탭 순환 ---
    private cycleNextPinnedTab() {
        const workspace = this.app.workspace;
        const pinnedLeaves = this.getPinnedLeaves();

        // 고정된 탭이 없으면 종료
        if (pinnedLeaves.length === 0) return;

        // 현재 활성 탭 가져오기 (오류 수정됨: null 체크 필수)
        const activeLeaf = workspace.getMostRecentLeaf();
        // activeLeaf가 없으면 여기서 확실히 종료해서 undefined 가능성 제거
        if (!activeLeaf) return;

        // 이제 activeLeaf는 무조건 WorkspaceLeaf 타입
        const currentIndex = pinnedLeaves.findIndex(leaf => leaf === activeLeaf);
        let nextIndex = 0;

        if (currentIndex === -1) {
            // 현재 고정되지 않은 탭을 보고 있다면 -> 첫 번째 고정 탭으로 이동
            nextIndex = 0;
        } else {
            // 현재 고정 탭을 보고 있다면 -> 다음 탭으로 이동 (순환)
            nextIndex = (currentIndex + 1) % pinnedLeaves.length;
        }

        const targetLeaf = pinnedLeaves[nextIndex];
        // targetLeaf가 존재할 때만 실행
        if (targetLeaf) {
            workspace.setActiveLeaf(targetLeaf, { focus: true });
        }
    }

    // --- [기능 2] 스마트 토글 (핵심 로직) ---
    private smartToggleTab() {
        const workspace = this.app.workspace;
        
        // 현재 탭 확인
        const activeLeaf = workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isCurrentPinned = activeLeaf.getViewState().pinned;

        if (isCurrentPinned) {
            // [상황 A] 현재 고정 탭임 -> "작업 탭으로 돌아가줘"
            const target = this.lastUnpinnedLeaf;
            if (target && this.isLeafAttached(target)) {
                workspace.setActiveLeaf(target, { focus: true });
            } else {
                // 기록된 일반 탭이 없거나 닫혔다면? 
                // (선택사항: 아무것도 안 하거나, 가장 최근의 일반 탭을 새로 찾음)
                // 여기서는 사용자 혼란 방지를 위해 아무것도 하지 않음.
                console.log("돌아갈 일반 작업 탭이 없습니다.");
            }
        } else {
            // [상황 B] 현재 일반 탭임 -> "아까 보던 고정 탭 보여줘"
            const target = this.lastPinnedLeaf;
            if (target && this.isLeafAttached(target)) {
                // 기억해둔 고정 탭이 살아있으면 거기로 이동
                workspace.setActiveLeaf(target, { focus: true });
            } else {
                // 기억해둔 게 없거나 닫혔다면? -> 첫 번째 고정 탭으로 이동 (Fallback)
                const pinnedLeaves = this.getPinnedLeaves();
                // 고정된 탭이 하나도 없으면 그냥 종료
                const firstPinned = pinnedLeaves[0];
                if (firstPinned) {
                    workspace.setActiveLeaf(firstPinned, { focus: true });
                }
            }
        }
    }

    // --- [헬퍼 함수] ---

    // 화면(Root)에 있는 고정된 탭만 수집
    private getPinnedLeaves(): WorkspaceLeaf[] {
        const pinnedLeaves: WorkspaceLeaf[] = [];
        this.app.workspace.iterateRootLeaves((leaf) => {
            if (leaf.getViewState().pinned) {
                pinnedLeaves.push(leaf);
            }
        });
        return pinnedLeaves;
    }

    // 탭이 실제로 닫히지 않고 살아있는지 확인 (Detach 여부 체크)
    // *상세*: leaf.view가 존재하고, rootSplit 등에 연결되어 있는지 간단히 체크
    private isLeafAttached(leaf: WorkspaceLeaf): boolean {
        // leaf가 null이면 false (혹시 모를 안전장치)
        if (!leaf) return false;
        // Obsidian API상 leaf의 parent가 null이면 닫힌 탭으로 간주 가능
        // 혹은 (leaf as any).parent 등으로 접근. 
        // 안전하게는 workspace에 해당 leaf가 여전히 iterate 가능한지 볼 수도 있으나,
        // activeLeaf 변경 시점과 맞물려 간단히 root에 있는지 체크하는 로직이 효율적.
        
        // 가장 간단한 생존 확인: view가 파괴되지 않았는지 확인
        return leaf.view && leaf.getRoot() === this.app.workspace.rootSplit;
    }
}
```