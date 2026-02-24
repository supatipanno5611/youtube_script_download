```ts
import {
    Plugin, TFile, Notice, MarkdownView, Editor, SuggestModal, App,
    FileView, EditorPosition
} from 'obsidian';

interface TaskPlanSettings {
    taskFilePath: string;
    planFilePath: string;
}

const DEFAULT_SETTINGS: TaskPlanSettings = {
    taskFilePath: 'task.md',
    planFilePath: 'plan.md'
};

export default class TaskPlanPlugin extends Plugin {
    settings: TaskPlanSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('lucide-square-check', '할 일 문서 열기', () => {
            this.openFileNormal(this.settings.taskFilePath);
        });
        this.addRibbonIcon('lucide-map', '계획 문서 열기', () => {
            this.openFileNormal(this.settings.planFilePath);
        });
        
        this.addCommand({
            id: 'open-task-file',
            name: '할 일 문서 열기',
            callback: () => this.openFileNormal(this.settings.taskFilePath),
        });
        this.addCommand({
            id: 'open-plan-file',
            name: '계획 문서 열기',
            callback: () => this.openFileNormal(this.settings.planFilePath),
        });

        this.addRibbonIcon("lucide-list-check", "task-plan 열기", () => this.openSplitFiles());
        
        this.addCommand({
            id: 'open-split-taskplan',
            name: '할 일-계획 문서 열기',
            callback: () => this.openSplitFiles(),
        });

        this.addCommand({
            id: 'move-line-taskplan',
            name: '할 일 이동',
            icon: "lucide-arrow-left-right",
            editorCallback: (editor: Editor, view: MarkdownView) => this.handleLineMove(editor, view)
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // 단일 파일 열기 로직
    private async openFileNormal(path: string) { // 파일 경로를 받아 노트를 여는 비동기 메서드 선언
    const file = this.app.vault.getAbstractFileByPath(path); // Vault에서 해당 경로의 파일(또는 폴더)을 가져옴

    if (!(file instanceof TFile)) { // 가져온 객체가 실제 파일(TFile)이 아니라면
        new Notice(`파일을 찾을 수 없습니다: ${path}`); // 사용자에게 파일이 없다는 알림 표시
        return; // 더 이상 진행하지 않고 함수 종료
    }

    const workspace = this.app.workspace; // app에서 workspace 객체를 가져옴

    const leaf = // 파일을 열 때 사용할 leaf(탭)를 결정
        this.settings.openNewTab // 설정에서 새 탭 열기가 켜져 있다면
            ? workspace.getLeavesOfType("markdown").find(l => // 현재 열려 있는 모든 markdown leaf 중에서
                  l.view instanceof FileView && l.view.file?.path === path // 같은 경로의 파일을 보여주는 leaf를 찾음
              ) ?? workspace.getLeaf("tab") // 있으면 그 leaf 사용, 없으면 새 탭 leaf 생성
            : workspace.getLeaf(false); // 새 탭 설정이 꺼져 있으면 현재 활성 leaf 사용

    await leaf.openFile(file, { active: true }); // 선택된 leaf에서 파일을 열고 해당 탭을 활성화
    }

    // 스플릿 열기 로직
    async openSplitFiles() {
        const { workspace, vault } = this.app; // Obsidian 앱에서 workspace와 vault 객체를 구조 분해로 가져옴
        const taskPath = this.settings.taskFilePath; // 설정에서 task 파일 경로를 가져옴
        const planPath = this.settings.planFilePath; // 설정에서 plan 파일 경로를 가져옴

        const taskFile = vault.getAbstractFileByPath(taskPath) as TFile; // task 경로로 vault에서 파일 객체를 찾아 TFile로 캐스팅
        const planFile = vault.getAbstractFileByPath(planPath) as TFile; // plan 경로로 vault에서 파일 객체를 찾아 TFile로 캐스팅

        // 둘 중 하나라도 없으면 안내 메시지를 띄우고 함수 종료
        if (!taskFile || !planFile) {
            new Notice('설정된 파일을 찾을 수 없습니다. 경로를 확인해주세요.');
            return;
        }

        // 현재 열려 있는 모든 markdown leaf들을 가져옴
        const allLeaves = workspace.getLeavesOfType('markdown');
        // 특정 경로의 파일이 이미 열려 있는 leaf를 찾는 헬퍼 함수
        const getLeafForFile = (path: string) => 
            allLeaves.find(l => (l.view as MarkdownView).file?.path === path);

        // task 파일이 열려 있는 leaf 검색
        let taskLeaf = getLeafForFile(taskPath);
        // plan 파일이 열려 있는 leaf 검색
        let planLeaf = getLeafForFile(planPath);

        // ===== 둘 다 이미 열려 있는 경우 포커스 전환 ===== 
        if (taskLeaf && planLeaf) {
            const activeView = workspace.getActiveViewOfType(MarkdownView); // 현재 활성화된 Markdown 뷰를 가져옴

            // 타겟이 될 Leaf를 결정 (현재 task면 plan으로, 아니면 task로)
            const targetLeaf = (activeView?.file?.path === taskPath) ? planLeaf : taskLeaf;

            // 해당 Leaf를 활성화 (화면 전환 및 포커스)
            workspace.setActiveLeaf(targetLeaf, { focus: true });

            // 해당 Leaf의 에디터 객체를 가져와서 스크롤
            const targetEditor = (targetLeaf.view as MarkdownView).editor;
            await this.scrollToBottomforothermethod(targetEditor);

            return;
        }

        // ===== 하나만 열려 있거나, 둘 다 안 열려 있는 경우 =====
        // 새 메인 Leaf 생성
        const leaf = workspace.getLeaf(true);

        // 방금 만든 leaf를 제외한 나머지 markdown leaf 전부 닫기
        workspace.getLeavesOfType('markdown').forEach(l => {
        if (l !== leaf) l.detach();
        });

        // 왼쪽: Task 파일 열기
        await leaf.openFile(taskFile);

        // 오른쪽: Plan 파일 열기 (세로 분할)
        const rightLeaf = workspace.getLeaf('split', 'vertical'); // task leaf 기준으로 오른쪽(세로) 분할 leaf 생성
        await rightLeaf.openFile(planFile); // 분할된 leaf에 plan 파일 열기

        const taskEditor = (leaf.view as MarkdownView).editor; // task leaf에 에디터 생성
        await this.scrollToBottomforothermethod(taskEditor); // 스크롤 함수에 에디터 전달
    }

    // 행(또는 다중 행) 옮기는 로직
    private async handleLineMove(editor: Editor, view: MarkdownView) {
        const currentPath = view.file?.path;
        if (!currentPath) return;

        const isFromTask = currentPath === this.settings.taskFilePath;
        const isFromPlan = currentPath === this.settings.planFilePath;
        
        if (!isFromTask && !isFromPlan) return;

        const targetPath = isFromTask ? this.settings.planFilePath : this.settings.taskFilePath;
        
        // --- [변경됨] 선택 영역 확인 및 텍스트 추출 로직 시작 ---
        const cursor = editor.getCursor();
        let startLine: number;
        let endLine: number;
        let contentToMove: string;

        // [수정됨] selection 변수를 먼저 정의하고 안전하게 확인합니다.
        const selection = editor.listSelections()[0];

        if (editor.somethingSelected() && selection) {
            // 선택 방향(위->아래, 아래->위)에 따라 정렬
            startLine = Math.min(selection.anchor.line, selection.head.line);
            endLine = Math.max(selection.anchor.line, selection.head.line);
        } else {
            // 선택이 없거나 예외적인 경우 현재 커서 라인만 대상
            startLine = cursor.line;
            endLine = cursor.line;
        }

        // 선택된 줄들의 전체 내용을 가져옴 (부분 선택이어도 줄 전체 포함)
        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            lines.push(editor.getLine(i));
        }
        contentToMove = lines.join('\n');
        
        if (!contentToMove.trim()) return;
        // --- [변경됨] 로직 끝 ---

        const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
        if (!(targetFile instanceof TFile)) {
            new Notice("대상 파일을 찾을 수 없습니다.");
            return;
        }

        if (isFromTask) {
            const content = await this.app.vault.read(targetFile);
            const sections = content.split("\n").filter(l => l.startsWith("#"));

            if (sections.length === 0) {
                await this.appendToEndOfFile(targetFile, contentToMove);
                // lineIdx 대신 startLine, endLine을 넘김
                this.finalizeMove(editor, startLine, endLine, targetPath);
            } else {
                new MoveLinetoPlanSuggestModal(this.app, sections, async (selectedSection) => {
                    await this.insertAfterSection(targetFile, selectedSection, contentToMove);
                    this.finalizeMove(editor, startLine, endLine, targetPath);
                }).open();
            }
        } else {
            await this.appendToEndOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, targetPath);
        }
    }

    private async insertAfterSection(file: TFile, section: string, text: string) {
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lines.findIndex(l => l === section);
            if (idx !== -1) {
                // 여러 줄 텍스트가 들어와도 splice가 처리하기 쉽도록, 배열로 만들지 않고 텍스트 그대로 삽입
                lines.splice(idx + 1, 0, text);
            } else {
                lines.push(text);
            }
            return lines.join('\n');
        });
    }

    private async appendToEndOfFile(file: TFile, text: string) {
        await this.app.vault.process(file, (data) => {
            const needsNewline = data.length > 0 && !data.endsWith("\n");
            return data + (needsNewline ? "\n" : "") + text;
        });
    }

    // --- [변경됨] 범위 삭제를 위해 인자 변경 (lineIdx -> startLine, endLine) ---
    private finalizeMove(editor: Editor, startLine: number, endLine: number, targetPath: string) {
        // 기본 삭제 범위: startLine의 시작부터 endLine의 다음 줄 시작까지 (그래야 줄바꿈까지 깔끔하게 지워짐)
        const from = { line: startLine, ch: 0 };
        const to = { line: endLine + 1, ch: 0 };
        
        // 파일의 마지막 줄이 포함된 경우에 대한 예외 처리
        if (endLine === editor.lineCount() - 1) {
            if (startLine > 0) {
                // 마지막 줄들을 지우는데 위쪽에 내용이 있다면, 
                // 윗줄의 끝(줄바꿈)부터 지워서 공백 라인이 남지 않게 함
                from.line = startLine - 1;
                from.ch = editor.getLine(startLine - 1).length;
                
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            } else {
                // 파일 전체를 지우는 경우
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            }
        }
        
        editor.replaceRange("", from, to);

        const targetLeaf = this.app.workspace.getLeavesOfType('markdown')
            .find(l => (l.view as MarkdownView).file?.path === targetPath);
            
        if (targetLeaf) {
            this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        }
    }
    // 재사용 가능한 커서 이동 메서드
    private async scrollToBottomforothermethod(editor: Editor) {
        editor.focus();

        // 문서의 가장 마지막 줄과 그 줄의 마지막 글자 위치 계산
        const lastLine = editor.lineCount() - 1;
        const lastChar = editor.getLine(lastLine).length;
        const finalPos: EditorPosition = { line: lastLine, ch: lastChar };

        // 커서 설정 및 스크롤
        editor.setCursor(finalPos);
        editor.scrollIntoView({ from: finalPos, to: finalPos }, true);

        this.toggleCursorCenter();
    }
}

class MoveLinetoPlanSuggestModal extends SuggestModal<string> {
    sections: string[];
    onSubmit: (selectedSection: string) => void;

    constructor(app: App, sections: string[], onSubmit: (selectedSection: string) => void) {
        super(app);
        this.sections = sections;
        this.onSubmit = onSubmit;
        this.setPlaceholder("이동할 섹션을 선택하세요...");
    }

    getSuggestions(query: string): string[] {
        return this.sections.filter((section) =>
            section.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(section: string, el: HTMLElement) {
        const cleanText = section.replace(/^#+\s+/, '');
        el.createEl("div", { text: cleanText });
    }

    onChooseSuggestion(section: string, _evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(section);
    }
}
```