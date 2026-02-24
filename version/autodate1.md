```ts
import { Plugin, Notice, moment } from 'obsidian';

// 1. 설정 구조 업데이트: AutoDateCopyFormat 추가
interface AutoDateSettings {
    AutoDateCopyPaths: string[];
    AutoDateCopyFormat: string;
}

const DEFAULT_SETTINGS: AutoDateSettings = {
    AutoDateCopyPaths: [
        "how/viriya 운영법.md"
    ],
    AutoDateCopyFormat: "YYYY-MM-DD" // 기본 감지 및 변환 포맷 설정
}

export default class AutoDatePlugin extends Plugin {
    settings: AutoDateSettings;
    originalWriteText: any;

    async onload() {
        await this.loadSettings();

        // [기능 1] 드래그 + 단축키 복사 처리
        this.registerDomEvent(document, 'copy', (evt: ClipboardEvent) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile || !this.settings.AutoDateCopyPaths.includes(activeFile.path)) return;

            const selectionObj = window.getSelection();
            if (!selectionObj || selectionObj.rangeCount === 0) return;
            
            const selectionText = selectionObj.toString();
            const targetFormat = this.settings.AutoDateCopyFormat;

            // 설정된 포맷 문자열이 포함되어 있는지 확인
            if (!selectionText.includes(targetFormat)) return;

            const today = moment().format(targetFormat);
            
            // 정규식 특수문자 에러를 방지하기 위해 split.join을 사용해 전체 문자열 치환
            const newText = selectionText.split(targetFormat).join(today);

            if (evt.clipboardData) {
                evt.clipboardData.setData('text/plain', newText);
                evt.preventDefault(); 
                evt.stopPropagation(); 
                
                new Notice('단축키 복사: 날짜가 오늘로 변환되었습니다!');
            }
        }, { capture: true }); 

        // [기능 2] '복사' 버튼 처리 (클립보드 API 하이재킹)
        this.originalWriteText = navigator.clipboard.writeText; 
        
        navigator.clipboard.writeText = async (text: string) => {
            const activeFile = this.app.workspace.getActiveFile();
            const targetFormat = this.settings.AutoDateCopyFormat;
            
            // 지정된 경로 파일이고, 복사될 내용에 설정된 포맷이 있다면
            if (activeFile && this.settings.AutoDateCopyPaths.includes(activeFile.path) && text.includes(targetFormat)) {
                const today = moment().format(targetFormat);
                text = text.split(targetFormat).join(today);
                
                new Notice('버튼 복사: 날짜가 오늘로 변환되었습니다!');
            }
            
            return this.originalWriteText.call(navigator.clipboard, text);
        };
    }

    onunload() {
        if (this.originalWriteText) {
            navigator.clipboard.writeText = this.originalWriteText;
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        await this.saveData(this.settings);
    }
}
```