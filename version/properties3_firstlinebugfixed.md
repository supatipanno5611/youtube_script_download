```ts
import { Plugin, Editor, Notice, parseYaml, TFile } from 'obsidian';

// 플러그인 설정 인터페이스
// userproperties: key-value 형태로 저장되며
// key는 frontmatter 속성명, value는 YAML 문자열
interface PropertiesSettings {
    userproperties: Record<string, string>;
}

// 기본 설정값
// 각 값은 YAML 형식의 문자열로 저장된다.
// 예: "[]" → parseYaml 후 실제 배열로 변환됨
const DEFAULT_SETTINGS: PropertiesSettings = {
    userproperties: {
        "aliases": "[]",
        "base": "[]",
        "tags": "[]"
    }
}

export default class AddTagsPlugin extends Plugin {

    // 플러그인 설정 객체
    settings: PropertiesSettings;

    // 플러그인 로드 시 실행
    async onload() {

        // 저장된 데이터 불러오기 (없으면 undefined)
        const loadedData = await this.loadData();

        // 설정 병합
        // 얕은 병합으로 인해 userproperties 내부 객체가 덮어씌워지는 문제를 방지하기 위해
        // 중첩 객체를 별도로 병합한다.
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedData,
            userproperties: {
                ...DEFAULT_SETTINGS.userproperties,
                ...(loadedData?.userproperties ?? {})
            }
        };

        // 명령어 등록
        this.addCommand({
            id: "insert-properties",
            name: "속성 삽입",
            icon: "text-cursor-input",
            editorCallback: (editor: Editor) => this.handleInsertProperties(editor),
        });
    }

    /**
     * 현재 파일에 frontmatter가 없으면 빈 frontmatter를 생성한다.
     * 이미 "---"로 시작하면 frontmatter가 존재한다고 판단하고 종료한다.
     */
    async ensureFrontMatter(activeFile: TFile): Promise<void> {

        // 파일 전체 내용 읽기
        const content = await this.app.vault.read(activeFile);

        // 이미 frontmatter가 존재하면 아무 작업도 하지 않음
        if (content.startsWith("---")) return;

        // 파일 내용이 있든 없든 항상 기본 frontmatter 블록 추가
        // ---
        // ---
        const prefix = "---\n---\n";

        // frontmatter를 파일 맨 앞에 삽입
        await this.app.vault.modify(activeFile, prefix + content);
    }

    /**
     * 설정에 정의된 속성을 frontmatter에 삽입한다.
     * 이미 존재하는 속성은 건너뛴다.
     * 모든 작업 후 key를 알파벳 순으로 정렬한다.
     */
    async handleInsertProperties(editor: Editor) {

        // 현재 활성 파일 가져오기
        const activeFile = this.app.workspace.getActiveFile();

        // 마크다운 파일이 아니면 중단
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("속성을 추가할 마크다운 파일을 찾을 수 없습니다.");
            return;
        }

        // frontmatter가 없으면 먼저 생성
        await this.ensureFrontMatter(activeFile);

        try {
            // Obsidian의 안전한 frontmatter 수정 API 사용
            await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {

                // 설정에 정의된 모든 userproperties 순회
                for (const [key, settingVal] of Object.entries(this.settings.userproperties)) {

                    // 해당 key가 아직 frontmatter에 없을 경우만 추가
                    if (frontmatter[key] === undefined) {

                        try {
                            // 설정값을 YAML로 파싱
                            // 예: "[]" → []
                            frontmatter[key] = parseYaml(settingVal.trim());

                        } catch (e) {
                            // YAML 파싱 실패 시 문자열 그대로 저장
                            new Notice(`'${key}' 값의 YAML 파싱에 실패했습니다. 문자열로 저장합니다.`);
                            frontmatter[key] = settingVal;
                        }
                    }
                }

                // ----------------------------
                // key 정렬 로직
                // ----------------------------

                // 현재 frontmatter의 모든 key를 알파벳 순 정렬
                const sortedKeys = Object.keys(frontmatter).sort();

                // 정렬된 결과를 임시 객체에 저장
                const tempEntries: Record<string, any> = {};

                for (const key of sortedKeys) {
                    tempEntries[key] = frontmatter[key];
                    delete frontmatter[key]; // 기존 key 제거
                }

                // 정렬된 순서대로 다시 삽입
                for (const key of sortedKeys) {
                    frontmatter[key] = tempEntries[key];
                }
            });

        } catch (error) {

            // frontmatter 처리 중 오류 발생 시 로그 및 사용자 알림
            console.error("속성 처리 중 오류 발생:", error);
            new Notice("속성 처리 중 오류가 발생했습니다.");
        }
    }
}
```