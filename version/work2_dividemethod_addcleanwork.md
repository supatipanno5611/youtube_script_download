```ts
import {
    Plugin, TFile, Notice, WorkspaceLeaf, moment
} from 'obsidian';

// 설정 데이터 인터페이스 정의
interface OpenWorkFileSettings {
    cleanupOnStartup: boolean;  // 시작 시 정리 로직 실행 여부
    workFilePath: string;       // 작업 파일 경로 (예: work.md)
    laterFilePath: string;      // 백업 파일 경로 (예: later.md)
    timestampFormat: string;    // moment.js 날짜 포맷 (data.json에서 수정 가능)
}

// 기본 설정값 정의
const DEFAULT_SETTINGS: OpenWorkFileSettings = {
    cleanupOnStartup: false,
    workFilePath: 'work.md',
    laterFilePath: 'later.md',
    timestampFormat: 'MM/DD HH:mm:ss', // 기본 포맷 (월-일 시:분:초)
};

export default class OpenWorkFilePlugin extends Plugin {
    settings: OpenWorkFileSettings;

    async onload() {
        await this.loadSettings();

        // 리본 아이콘 클릭 시: 작업 문서를 엽니다.
        this.addRibbonIcon('lucide-file-pen', '작업 문서 열기', async () => {
            await this.cleanupTabs();
            await this.cleanWorkAndBackup();
            await this.openWorkFile();
            await this.openLaterFile();
        });

        // 커맨드 팔레트 명령: 작업 문서를 엽니다.
        this.addCommand({
            id: 'open-work-file',
            name: '작업 문서 열기',
            callback: async () => {
                await this.cleanupTabs();
                await this.openWorkFile();
            },
        });

        this.addCommand({
            id: 'clean-work-file',
            name: '작업 문서 정리',
            callback: async () => {
                await this.cleanWorkAndBackup();
                await this.openWorkFile();
                await this.openLaterFile();
            },
        });

        // 앱이 준비되면 시작 로직 실행
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.cleanupOnStartup) {
                this.runStartupSequence();
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 시작 시 실행되는 순차 로직.
     * setTimeout 대신 onLayoutReady 이후 바로 실행하되,
     * 각 단계를 명시적으로 순서대로 await 처리합니다.
     */
    private async runStartupSequence() {
        await this.cleanupTabs();
        const success = await this.cleanWorkAndBackup();
        if (success) {
            await this.openWorkFile();
        }
    }

    /**
     * [메서드 1] cleanupTabs
     * 메인 워크스페이스의 탭을 정리합니다.
     * 단, '고정된(Pinned)' 탭은 닫지 않고 유지합니다.
     */
    async cleanupTabs() {
        const { workspace } = this.app;
        const leavesToClose: WorkspaceLeaf[] = [];

        workspace.iterateAllLeaves((leaf) => {
            // 1. 메인 영역(rootSplit)에 있는 탭인지 확인
            // 2. 고정(Pinned) 상태가 아닌지 확인
            const isPinned = leaf.getViewState().pinned;
            // rootSplit 하위이면서 고정되지 않은 탭만 수집
            // leftSplit, rightSplit은 제외됩니다.
            if (leaf.getRoot() === workspace.rootSplit && !isPinned) {
                leavesToClose.push(leaf);
            }
        });

        // 수집된 탭들을 일괄 제거
        leavesToClose.forEach(leaf => leaf.detach());
    }

    /**
     * [메서드 2] cleanWorkAndBackup
     * work.md의 내용을 later.md로 백업한 뒤 work.md를 비웁니다.
     * 백업 성공 여부를 boolean으로 반환합니다.
     * - later.md가 없으면 작업을 중단하고 내용을 유지합니다.
     * - 파일 I/O 오류 발생 시 사용자에게 알리고 false를 반환합니다.
     */
    async cleanWorkAndBackup() {
        const { vault } = this.app;
        const workPath = this.settings.workFilePath;
        const laterPath = this.settings.laterFilePath;

        try {
            // 작업 파일 객체 가져오기
            const workFile = vault.getAbstractFileByPath(workPath);

            // 파일이 존재하고 TFile 인스턴스인지 확인
            if (!(workFile instanceof TFile)) {
                new Notice(`작업 파일을 찾을 수 없습니다: ${workPath}`);
                return false;
            }

            // 현재 작업 내용 읽기
            const content = await vault.read(workFile);

            // 내용이 비어있으면 백업 불필요, 성공으로 처리
            if (!content.trim()) return true;

            // later.md 존재 여부를 먼저 확인 — 없으면 데이터 유실 방지를 위해 중단
            const laterFile = vault.getAbstractFileByPath(laterPath);
            if (!(laterFile instanceof TFile)) {
                new Notice(`백업 파일(${laterPath})이 존재하지 않아 정리를 중단합니다. 먼저 백업 파일을 생성해주세요.`);
                return false;
            }

            // 백업 내용 포맷팅 후 later.md에 추가
            const timestamp = moment().format(this.settings.timestampFormat);
            const isEffectivelyEmpty = content.trim().length === 0;
            const prefix = isEffectivelyEmpty ? '' : '\n';
            const backupContent = `${prefix}${timestamp}\n${content}`;
            await vault.append(laterFile, backupContent);

            // 백업 완료 후 work.md 비우기
            await vault.modify(workFile, '');
            return true;

        } catch (error) {
            new Notice('파일 처리 중 오류가 발생했습니다.');
            return false;
        }
    }

    /**
     * [메서드 3] openWorkFile
     * work.md 파일을 현재 탭에 엽니다.
     * cleanupTabs 이후 활성 탭이 없을 수 있으므로 getLeaf(false) 대신
     * getLeaf()로 안전하게 탭을 확보합니다.
     */
    async openWorkFile() {
        const { workspace, vault } = this.app;
        const path = this.settings.workFilePath;

        try {
            const targetFile = vault.getAbstractFileByPath(path);

            if (!(targetFile instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            // cleanupTabs 직후에는 활성 탭이 없을 수 있으므로
            // 인자 없이 호출해 항상 유효한 leaf를 확보합니다.
            const leaf = workspace.getLeaf();
            await leaf.openFile(targetFile);
            workspace.setActiveLeaf(leaf, { focus: true });

        } catch (error) {
            new Notice('작업 문서를 여는 중 오류가 발생했습니다.');
        }
    }

    /**
     * [메서드 4] openLaterFile
     * later.md 파일을 현재 탭에 엽니다.
     */
    async openLaterFile() {
        const { workspace, vault } = this.app;
        const path = this.settings.laterFilePath;

        try {
            const targetFile = vault.getAbstractFileByPath(path);

            if (!(targetFile instanceof TFile)) {
                new Notice(`파일을 찾을 수 없습니다: ${path}`);
                return;
            }

            const leaf = workspace.getLeaf(true);
            await leaf.openFile(targetFile);
        } catch (error) {
            new Notice('백업 문서를 여는 중 오류가 발생했습니다.');
        }
    }
}
```