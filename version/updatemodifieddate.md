```ts
import { Notice, Plugin, TFile, moment } from 'obsidian';

// 1. JSON 파일로 관리할 설정 인터페이스
interface DateUpdateSettings {
    dateUpdateFrontmatterKey: string;
    dateUpdateFormat: string;
}

// 2. data.json이 없을 때 적용될 기본값
const DEFAULT_SETTINGS: DateUpdateSettings = {
    dateUpdateFrontmatterKey: 'modified',
    dateUpdateFormat: 'YYYY-MM-DD'
}

export default class DateUpdatePlugin extends Plugin {
    settings: DateUpdateSettings;

    async onload() {
        // 설정 불러오기 (플러그인 폴더의 data.json을 읽음)
        await this.loadSettings();

        // 3-1. 리본 메뉴(좌측 사이드바) 아이콘 추가
        // 'calendar-clock'은 옵시디언 내장 아이콘 이름입니다.
        this.addRibbonIcon('lucide-calendar-sync', '마지막 수정일 업데이트', () => {
            this.updateDateInFrontmatter();
        });

        // 3-2. 명령어 팔레트 (Cmd/Ctrl + P) 추가
        this.addCommand({
            id: 'update-modified-date',
            name: '마지막 수정일 업데이트',
            // checkCallback은 명령어가 실행 가능한 상태인지 미리 확인합니다.
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                // 마크다운 파일이 열려있을 때만 명령어 활성화
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        this.updateDateInFrontmatter(activeFile);
                    }
                    return true;
                }
                return false;
            }
        });
    }

    // 4. 핵심 업데이트 로직
	async updateDateInFrontmatter(file?: TFile | null) {
    const targetFile = file ?? this.app.workspace.getActiveFile();

    if (!(targetFile instanceof TFile) || targetFile.extension !== 'md') {
        new Notice('마크다운 파일이 열려있지 않습니다.');
        return;
    }

    try {
        const today = moment().format(this.settings.dateUpdateFormat);
        let alreadyToday = false;

        await this.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
            const key = this.settings.dateUpdateFrontmatterKey;
            const currentValue = frontmatter[key];

            if (currentValue === today) {
                alreadyToday = true;
                return; // 값이 같으면 수정하지 않음
            }

            frontmatter[key] = today;
        });

        if (alreadyToday) {
            new Notice('이미 오늘 날짜입니다.');
        } else {
            new Notice(
                `${this.settings.dateUpdateFrontmatterKey} 날짜가 업데이트되었습니다.`
            );
        }

    } catch (error) {
        console.error('Frontmatter update failed:', error);
        new Notice('날짜 업데이트에 실패했습니다. (콘솔 확인)');
    }
}

    // 5. 설정 데이터 로드 (data.json과 연동)
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
}
```
