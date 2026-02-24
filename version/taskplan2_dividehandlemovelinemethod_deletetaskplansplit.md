```ts
import {
    Plugin, TFile, Notice, MarkdownView, Editor, SuggestModal, App,
    EditorPosition
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
            this.openFile(this.settings.taskFilePath);
        });
        this.addRibbonIcon('lucide-book-text', '계획 문서 열기', () => {
            this.openFile(this.settings.planFilePath);
        });

        this.addCommand({
            id: 'open-task-file',
            name: '할 일 문서 열기',
            callback: () => this.openFile(this.settings.taskFilePath),
        });
        this.addCommand({
            id: 'open-plan-file',
            name: '계획 문서 열기',
            callback: () => this.openFile(this.settings.planFilePath),
        });

        this.addCommand({
            id: 'move-line-taskplan',
            name: '할 일 이동',
            icon: 'lucide-arrow-left-right',
            editorCallback: (editor: Editor, view: MarkdownView) =>
                this.handleLineMove(editor, view),
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    // 파일 열기: 이미 열린 leaf가 있으면 활성화, 없으면 현재 leaf에서 열기
    private async openFile(path: string) {
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) {
            new Notice(`파일을 찾을 수 없습니다: ${path}`);
            return;
        }

        const existingLeaf = this.app.workspace
            .getLeavesOfType('markdown')
            .find(l => (l.view as MarkdownView).file?.path === path);

        const leaf = existingLeaf ?? this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { active: true });
    }

    // 행(또는 다중 행) 옮기는 로직 — 각 단계를 전용 메서드에 위임
    private async handleLineMove(editor: Editor, view: MarkdownView) {
        const route = this.resolveRoute(view);
        if (!route) return;

        const selection = this.extractSelection(editor);
        if (!selection) return;

        const { contentToMove, startLine, endLine } = selection;

        const targetFile = this.getTargetFile(route.targetPath);
        if (!targetFile) return;

        await this.moveContent(
            editor, route, targetFile, contentToMove, startLine, endLine
        );
    }

    // 현재 파일이 task/plan인지 판별하고 이동 방향을 반환
    private resolveRoute(
        view: MarkdownView
    ): { isFromTask: boolean; targetPath: string } | null {
        const currentPath = view.file?.path;
        if (!currentPath) return null;

        const isFromTask = currentPath === this.settings.taskFilePath;
        const isFromPlan = currentPath === this.settings.planFilePath;
        if (!isFromTask && !isFromPlan) return null;

        const targetPath = isFromTask
            ? this.settings.planFilePath
            : this.settings.taskFilePath;

        return { isFromTask, targetPath };
    }

    // 선택 영역 또는 커서 행의 내용과 범위를 추출
    private extractSelection(
        editor: Editor
    ): { contentToMove: string; startLine: number; endLine: number } | null {
        const selection = editor.listSelections()[0];
        let startLine: number;
        let endLine: number;

        if (editor.somethingSelected() && selection) {
            startLine = Math.min(selection.anchor.line, selection.head.line);
            endLine = Math.max(selection.anchor.line, selection.head.line);
        } else {
            startLine = editor.getCursor().line;
            endLine = startLine;
        }

        const lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            lines.push(editor.getLine(i));
        }
        const contentToMove = lines.join('\n');

        if (!contentToMove.trim()) return null;

        return { contentToMove, startLine, endLine };
    }

    // 대상 파일을 vault에서 찾아 반환
    private getTargetFile(targetPath: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(targetPath);
        if (!(file instanceof TFile)) {
            new Notice('대상 파일을 찾을 수 없습니다.');
            return null;
        }
        return file;
    }

    // 이동 방향에 따라 내용을 대상 파일에 삽입
    private async moveContent(
        editor: Editor,
        route: { isFromTask: boolean; targetPath: string },
        targetFile: TFile,
        contentToMove: string,
        startLine: number,
        endLine: number
    ) {
        if (route.isFromTask) {
            await this.moveToplan(
                editor, targetFile, route.targetPath, contentToMove, startLine, endLine
            );
        } else {
            await this.prependToTopOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, route.targetPath);
        }
    }

    // task → plan: 섹션 목록을 읽고 모달로 삽입 위치를 결정
    private async moveToplan(
        editor: Editor,
        targetFile: TFile,
        targetPath: string,
        contentToMove: string,
        startLine: number,
        endLine: number
    ) {
        const content = await this.app.vault.read(targetFile);
        const sections = content.split('\n').filter(l => l.startsWith('#'));

        if (sections.length === 0) {
            await this.appendToEndOfFile(targetFile, contentToMove);
            this.finalizeMove(editor, startLine, endLine, targetPath);
            return;
        }

        new MoveLinetoPlanSuggestModal(
            this.app,
            sections,
            async (selectedSection) => {
                await this.insertAfterSection(targetFile, selectedSection, contentToMove);
                this.finalizeMove(editor, startLine, endLine, targetPath);
            }
        ).open();
    }

    // 선택한 섹션의 마지막 비어있지 않은 줄 직후에 삽입
    private async insertAfterSection(file: TFile, section: string, text: string) {
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const sectionIdx = lines.findIndex(l => l === section);

            if (sectionIdx === -1) {
                lines.push(...text.split('\n'));
                return lines.join('\n');
            }

            // 섹션 범위(sectionIdx+1 ~ 다음 헤더 직전)에서 마지막 비어있지 않은 줄 탐색
            const nextSectionIdx = lines.findIndex(
                (l, i) => i > sectionIdx && l.startsWith('#')
            );
            const sectionEnd = nextSectionIdx === -1 ? lines.length : nextSectionIdx;

            let lastNonEmptyIdx = sectionIdx;
            for (let i = sectionIdx + 1; i < sectionEnd; i++) {
                if ((lines[i] ?? '').trim() !== '') lastNonEmptyIdx = i;
            }

            lines.splice(lastNonEmptyIdx + 1, 0, ...text.split('\n'));
            return lines.join('\n');
        });
    }

    private async appendToEndOfFile(file: TFile, text: string) {
        await this.app.vault.process(file, (data) => {
            const needsNewline = data.length > 0 && !data.endsWith('\n');
            return data + (needsNewline ? '\n' : '') + text;
        });
    }

    // task 파일 맨 윗줄에 삽입
    private async prependToTopOfFile(file: TFile, text: string) {
        await this.app.vault.process(file, (data) => {
            const needsNewline = text.length > 0 && !text.endsWith('\n');
            return text + (needsNewline ? '\n' : '') + data;
        });
    }

    private finalizeMove(
        editor: Editor,
        startLine: number,
        endLine: number,
        targetPath: string
    ) {
        // 삭제 범위 계산
        const from: EditorPosition = { line: startLine, ch: 0 };
        const to: EditorPosition = { line: endLine + 1, ch: 0 };

        // 마지막 줄 포함 시 예외 처리
        if (endLine === editor.lineCount() - 1) {
            if (startLine > 0) {
                from.line = startLine - 1;
                from.ch = editor.getLine(startLine - 1).length;
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            } else {
                to.line = endLine;
                to.ch = editor.getLine(endLine).length;
            }
        }

        editor.replaceRange('', from, to);

        // 이동 후 대상 파일 열고 포커스
        this.openFile(targetPath);
    }
}

class MoveLinetoPlanSuggestModal extends SuggestModal<string> {
    sections: string[];
    onSubmit: (selectedSection: string) => void;

    constructor(
        app: App,
        sections: string[],
        onSubmit: (selectedSection: string) => void
    ) {
        super(app);
        this.sections = sections;
        this.onSubmit = onSubmit;
        this.setPlaceholder('이동할 섹션을 선택하세요...');
    }

    getSuggestions(query: string): string[] {
        return this.sections.filter(s =>
            s.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(section: string, el: HTMLElement) {
        el.createEl('div', { text: section.replace(/^#+\s+/, '') });
    }

    onChooseSuggestion(section: string, _evt: MouseEvent | KeyboardEvent) {
        this.onSubmit(section);
    }
}
```