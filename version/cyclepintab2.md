```ts
import { Plugin, WorkspaceLeaf } from 'obsidian';

export default class CyclePinnedTabsPlugin extends Plugin {
    // 마지막으로 활성화되었던 탭들을 추적
    private lastPinnedLeaf: WorkspaceLeaf | null = null;
    private lastUnpinnedLeaf: WorkspaceLeaf | null = null;

    // 플러그인에 의한 탭 이동인지 확인하는 플래그 (이벤트 루프 방지)
    private isInternalNavigation: boolean = false;

    async onload() {
        // 1. [이벤트 리스너] 탭 변경 감지 및 기록
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (this.isInternalNavigation || !leaf) return;
                this.recordLeafHistory(leaf);
            })
        );

        // 2. [이벤트 리스너] 레이아웃 변경 시 닫힌 탭의 참조 정리
        //    탭을 닫을 때 lastPinnedLeaf/lastUnpinnedLeaf가 무효 참조를 갖지 않도록 방지
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.pruneInvalidLeafRefs();
            })
        );

        // 3. [명령어] 상황별 탭 순환 (Context-Aware Cycle)
        this.addCommand({
            id: 'cycle-tabs-context-aware',
            name: '고정 탭 또는 일반 탭 순환',
            callback: () => this.cycleTabsContextAware(),
        });

        // 4. [명령어] 영역 건너가기 (Smart Jump)
        this.addCommand({
            id: 'jump-between-pinned-unpinned',
            name: '고정 탭과 일반 탭 사이 건너가기',
            callback: () => this.smartJump(),
        });
    }

    onunload() {
        this.lastPinnedLeaf = null;
        this.lastUnpinnedLeaf = null;
    }

    // --- [핵심 로직 1] 상황별 순환 (Context-Aware Cycle) ---
    private cycleTabsContextAware() {
        const activeLeaf = this.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isPinned = this.getLeafPinnedState(activeLeaf);
        const targetLeaves = this.getLeavesByState(isPinned);

        if (targetLeaves.length <= 1) return;

        const currentIndex = targetLeaves.indexOf(activeLeaf);

        // [엣지 케이스] currentIndex가 -1이면 getMostRecentLeaf()가 반환한 leaf가
        // iterateRootLeaves 범위 밖(사이드바, 특수 뷰 등)에 있는 것이므로 동작 중단
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + 1) % targetLeaves.length;
        const targetLeaf = targetLeaves[nextIndex];

        if (targetLeaf) {
            this.activateLeafSafe(targetLeaf);
        }
    }

    // --- [핵심 로직 2] 영역 건너가기 (Smart Jump) ---
    private smartJump() {
        const activeLeaf = this.app.workspace.getMostRecentLeaf();
        if (!activeLeaf) return;

        const isCurrentPinned = this.getLeafPinnedState(activeLeaf);

        if (isCurrentPinned) {
            // [상황 A] 고정 -> 일반으로 점프
            if (this.isValidLeaf(this.lastUnpinnedLeaf)) {
                this.activateLeafSafe(this.lastUnpinnedLeaf!);
                return;
            }
            // 2순위: iterateRootLeaves 순서에 의존하는 대신,
            // getMostRecentLeaf()와 같은 기준으로 "가장 최근 사용된 일반 탭"을 찾음
            const unpinnedLeaves = this.getLeavesByState(false);
            const fallback = this.pickMostRecentLeaf(unpinnedLeaves);
            if (fallback) this.activateLeafSafe(fallback);

        } else {
            // [상황 B] 일반 -> 고정으로 점프
            if (this.isValidLeaf(this.lastPinnedLeaf)) {
                this.activateLeafSafe(this.lastPinnedLeaf!);
                return;
            }
            const pinnedLeaves = this.getLeavesByState(true);
            const fallback = this.pickMostRecentLeaf(pinnedLeaves);
            if (fallback) this.activateLeafSafe(fallback);
        }
    }

    // --- [헬퍼 함수] ---

    // 탭의 고정 여부를 안전하게 반환
    private getLeafPinnedState(leaf: WorkspaceLeaf): boolean {
        const state = leaf.getViewState ? leaf.getViewState() : null;
        return state ? (state.pinned ?? false) : false;
    }

    // 특정 상태(고정/일반)인 탭들만 리스트로 반환
    private getLeavesByState(wantPinned: boolean): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [];
        this.app.workspace.iterateRootLeaves((leaf) => {
            if (this.getLeafPinnedState(leaf) === wantPinned) {
                leaves.push(leaf);
            }
        });
        return leaves;
    }

    // 이력 기록
    private recordLeafHistory(leaf: WorkspaceLeaf) {
        if (this.getLeafPinnedState(leaf)) {
            this.lastPinnedLeaf = leaf;
        } else {
            this.lastUnpinnedLeaf = leaf;
        }
    }

    // 탭 유효성 검사
    // @ts-ignore 없이 DOM 연결 여부로 판단: 탭이 실제로 화면에 존재하는지 확인하는 가장 안정적인 방법
    private isValidLeaf(leaf: WorkspaceLeaf | null): boolean {
        if (!leaf) return false;
        return !!(leaf.view && leaf.view.containerEl.isConnected);
    }

    // layout-change 시 무효가 된 참조를 null로 초기화
    private pruneInvalidLeafRefs() {
        if (!this.isValidLeaf(this.lastPinnedLeaf)) {
            this.lastPinnedLeaf = null;
        }
        if (!this.isValidLeaf(this.lastUnpinnedLeaf)) {
            this.lastUnpinnedLeaf = null;
        }
    }

    // 주어진 leaf 목록 중 "가장 최근 사용된" 탭을 반환
    // iterateRootLeaves의 순회 순서에 의존하는 대신, Obsidian의 recentLeaves 기준을 활용
    private pickMostRecentLeaf(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
        if (leaves.length === 0) return null;

        // getRecentLeaves()는 최근 사용 순서로 정렬된 leaf 배열을 반환
        // 이를 통해 "가장 마지막에 사용된 탭"을 UI 순서가 아닌 사용 이력 기준으로 선택
        const recentLeaves: WorkspaceLeaf[] = (this.app.workspace as any).getRecentLeaves?.() ?? [];

        for (const recent of recentLeaves) {
            if (leaves.includes(recent)) return recent;
        }

        // getRecentLeaves를 지원하지 않는 버전에서의 최후 폴백
        return leaves[0] ?? null;
    }

    // 안전하게 탭 활성화 (이벤트 루프 차단)
    // Obsidian의 workspace 이벤트는 동기적으로 발생하므로,
    // setActiveLeaf 호출 전후로 플래그를 관리하면 setTimeout 없이도 안전하게 처리 가능
    private activateLeafSafe(leaf: WorkspaceLeaf) {
        this.isInternalNavigation = true;
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        this.isInternalNavigation = false;
    }
}
```