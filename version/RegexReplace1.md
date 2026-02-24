```ts
import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting } from 'obsidian';

export default class RegexReplacePlugin extends Plugin {
    async onload() {
        // 커맨드 팔레트에 'Regex Find and Replace' 명령어 추가
        this.addCommand({
            id: 'open-regex-replace-modal',
            name: 'Open Regex Find and Replace',
            // editorCallback을 사용하면 에디터가 활성화된 상태에서만 명령어가 실행됩니다.
            editorCallback: (editor: Editor, view: MarkdownView) => {
                new RegexReplaceModal(this.app, editor).open();
            }
        });
    }

    onunload() {
        // 플러그인이 비활성화될 때 필요한 정리 작업 (현재는 특별히 없음)
    }
}

class RegexReplaceModal extends Modal {
    editor: Editor;
    findStr: string = '';
    flagsStr: string = 'g'; // 기본적으로 전역(global) 탐색을 활성화
    replaceStr: string = '';
    
    previewContainerEl: HTMLElement;

    constructor(app: App, editor: Editor) {
        super(app);
        this.editor = editor;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Regex Find and Replace' });

        // 1. 찾을 내용 (정규식 패턴)
        new Setting(contentEl)
            .setName('Find (Regex)')
            .setDesc('입력할 정규표현식 패턴을 작성하세요. (예: \\d+)')
            .addText(text => text
                .setPlaceholder('Regex pattern')
                .setValue(this.findStr)
                .onChange(value => this.findStr = value));

        // 2. 플래그 (Flags)
        new Setting(contentEl)
            .setName('Flags')
            .setDesc('g(전역), i(대소문자 무시), m(여러 줄) 등을 입력하세요.')
            .addText(text => text
                .setPlaceholder('g, i, m...')
                .setValue(this.flagsStr)
                .onChange(value => this.flagsStr = value));

        // 3. 바꿀 내용 (치환 텍스트)
        new Setting(contentEl)
            .setName('Replace')
            .setDesc('치환할 텍스트를 입력하세요. 캡처 그룹($1, $2) 사용 가능.')
            .addText(text => text
                .setPlaceholder('Replacement text')
                .setValue(this.replaceStr)
                .onChange(value => this.replaceStr = value));

        // 4. 버튼 영역 (Preview, Replace, Cancel)
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Preview')
                .onClick(() => this.handlePreview()))
            .addButton(btn => btn
                .setButtonText('Replace')
                .setCta() // 강조 색상 (Call to Action)
                .onClick(() => this.handleReplace()))
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()));

        // 5. 미리보기 결과를 보여줄 숨겨진 컨테이너
        this.previewContainerEl = contentEl.createDiv('regex-preview-container');
        this.previewContainerEl.style.marginTop = '20px';
        this.previewContainerEl.style.padding = '10px';
        this.previewContainerEl.style.backgroundColor = 'var(--background-secondary)';
        this.previewContainerEl.style.borderRadius = '5px';
        this.previewContainerEl.style.display = 'none'; // 초기에는 숨김
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    // 미리보기 처리 로직
    handlePreview() {
        this.previewContainerEl.empty();
        this.previewContainerEl.style.display = 'block'; // 컨테이너 노출 (모달 확장)

        if (!this.findStr) {
            this.previewContainerEl.createEl('span', { text: '정규식 패턴을 입력해주세요.', cls: 'has-warning' });
            return;
        }

        try {
            const regex = new RegExp(this.findStr, this.flagsStr);
            const text = this.editor.getValue();
            const match = regex.exec(text);

            if (!match) {
                this.previewContainerEl.createEl('span', { text: '일치하는 항목이 없습니다.' });
                return;
            }

            // 첫 번째 매칭이 포함된 전체 행(Line) 추출
            const matchIndex = match.index;
            const lineStart = text.lastIndexOf('\n', matchIndex - 1) + 1;
            let lineEnd = text.indexOf('\n', matchIndex);
            if (lineEnd === -1) lineEnd = text.length;

            const originalLine = text.substring(lineStart, lineEnd);
            
            // 해당 행에만 가상으로 치환 적용
            const localRegex = new RegExp(this.findStr, this.flagsStr);
            const replacedLine = originalLine.replace(localRegex, this.replaceStr);

            // 결과 렌더링
            this.previewContainerEl.createEl('h4', { text: 'Preview (First Match)' });
            this.previewContainerEl.createEl('div', { text: `원본: ${originalLine}` }).style.marginBottom = '8px';
            this.previewContainerEl.createEl('div', { text: `결과: ${replacedLine}` }).style.color = 'var(--text-accent)';

        } catch (error) {
            // 1. error가 Error 객체인지 확인하여 타입 좁히기
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // 2. style은 직접 속성으로 부여하거나 attr 속성 내부에 작성
            this.previewContainerEl.createEl('span', { 
                text: `오류: 유효하지 않은 정규표현식입니다. (${errorMessage})`, 
                attr: { style: 'color: var(--text-error);' } 
            });
        }
    }

    // 실제 치환 처리 로직
    handleReplace() {
        if (!this.findStr) {
            new Notice('정규식 패턴을 입력해주세요.');
            return;
        }

        try {
            const regex = new RegExp(this.findStr, this.flagsStr);
            const text = this.editor.getValue();
            const newText = text.replace(regex, this.replaceStr);

            if (text === newText) {
                new Notice('일치하는 항목이 없어 변경되지 않았습니다.');
                return;
            }

            // editor.setValue()를 사용하여 편집 히스토리(Undo) 보존
            this.editor.setValue(newText);
            new Notice('성공적으로 치환되었습니다.');
            this.close(); // 모달 닫기

        } catch (error) {
            // 여기도 동일하게 error 타입 검사 적용
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`에러 발생: ${errorMessage}`);
        }
    }
}
```