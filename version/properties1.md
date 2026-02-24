```ts
import { Plugin, Editor, Notice, parseYaml } from 'obsidian';

// 1. 설정 인터페이스 정의
interface ATOZSettings {
    userproperties: Record<string, string>;
}

// 2. 기본값 정의
const DEFAULT_SETTINGS: ATOZSettings = {
    userproperties: {
        "aliases": "[]",
        "base": "[]",
        "tags": "[]"
    }
}

export default class AddTagsPlugin extends Plugin {
    settings: ATOZSettings;

    async onload() {
        // [중요 수정] 플러그인 로드 시 설정을 불러와야 합니다.
        // 이 부분이 없으면 this.settings가 비어있어서 에러가 납니다.
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // 명령어 등록
        this.addCommand({
            id: "insert-properties",
            name: "속성 삽입",
            icon: "info",
            // editorCallback을 사용하면 에디터가 활성화된 상태에서만 명령어가 작동합니다.
            editorCallback: (editor: Editor) => this.handleInsertProperties(editor),
        });
    }

    // [Properties]
    async handleInsertProperties(editor: Editor) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("속성을 추가할 마크다운 파일을 찾을 수 없습니다.");
            return;
        }

        try {
            await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                const userProps = this.settings.userproperties;

                // 1. [값 추가] 누락된 키에 기본값 채워넣기 (기존 로직 동일)
                for (const [key, settingVal] of Object.entries(userProps)) {
                    if (frontmatter[key] === undefined) {
                        try {
                            const trimmedVal = settingVal.trim();
                            if (trimmedVal.startsWith("[") || trimmedVal.startsWith("{")) {
                                frontmatter[key] = parseYaml(trimmedVal);
                            } else {
                                frontmatter[key] = settingVal;
                            }
                        } catch (e) {
                            frontmatter[key] = settingVal;
                        }
                    }
                }

                // 2. [순서 정렬] 저장되는 순서를 고정하기 위한 재배치 로직
                // 현재 frontmatter에 있는 모든 키를 가져와서 알파벳순으로 정렬합니다.
                // (aliases -> base -> tags 순서는 알파벳순이므로 sort()로 해결됩니다)
                const sortedKeys = Object.keys(frontmatter).sort();

                // 임시 저장소에 값들을 백업해둡니다.
                const tempEntries: Record<string, any> = {};
                for (const key of sortedKeys) {
                    tempEntries[key] = frontmatter[key];
                    delete frontmatter[key]; // 원본 객체에서 키를 삭제합니다.
                }

                // 정렬된 순서대로 다시 집어넣습니다.
                // 이렇게 하면 YAML 생성 시 이 순서대로 기록됩니다.
                for (const key of sortedKeys) {
                    frontmatter[key] = tempEntries[key];
                }
            });

            // new Notice("속성 정렬 및 추가 완료");

        } catch (error) {
            new Notice("속성 처리 중 오류가 발생했습니다.");
        }
    }
}
```