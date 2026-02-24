```ts
import { Plugin, Editor, Notice, parseYaml } from 'obsidian';

// 설정 인터페이스 정의
interface PropertiesSettings {
    userproperties: Record<string, string>;
}

// 기본값 정의
const DEFAULT_SETTINGS: PropertiesSettings = {
    userproperties: {
        "aliases": "[]",
        "base": "[]",
        "tags": "[]"
    }
}

export default class AddTagsPlugin extends Plugin {
    settings: PropertiesSettings;

    async onload() {
        const loadedData = await this.loadData();

        // 중첩 객체인 userproperties를 별도로 병합하여 얕은 병합 문제를 방지합니다.
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedData,
            userproperties: {
                ...DEFAULT_SETTINGS.userproperties,
                ...(loadedData?.userproperties ?? {})
            }
        };

        this.addCommand({
            id: "insert-properties",
            name: "속성 삽입",
            icon: "text-cursor-input",
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

                // [값 추가] 누락된 키에 기본값 채워넣기
                for (const [key, settingVal] of Object.entries(userProps)) {
                    if (frontmatter[key] === undefined) {
                        // startsWith 분기 없이 항상 parseYaml을 시도합니다.
                        // YAML 파서는 단순 문자열도 그대로 반환하므로 안전합니다.
                        try {
                            frontmatter[key] = parseYaml(settingVal.trim());
                        } catch (e) {
                            // 파싱에 실패한 경우, 어떤 키가 문제인지 사용자에게 알립니다.
                            new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                            frontmatter[key] = settingVal;
                        }
                    }
                }

                // [순서 정렬] 키를 알파벳순으로 재배치합니다.
                // V8 엔진의 객체 키 삽입 순서 보장에 의존하는 방식입니다.
                const sortedKeys = Object.keys(frontmatter).sort();

                const tempEntries: Record<string, any> = {};
                for (const key of sortedKeys) {
                    tempEntries[key] = frontmatter[key];
                    delete frontmatter[key];
                }

                for (const key of sortedKeys) {
                    frontmatter[key] = tempEntries[key];
                }
            });

        } catch (error) {
            // 콘솔에 상세 오류를 기록하여 디버깅을 용이하게 합니다.
            console.error("속성 처리 중 오류 발생:", error);
            new Notice("속성 처리 중 오류가 발생했습니다.");
        }
    }
}
```