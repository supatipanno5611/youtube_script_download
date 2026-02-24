```ts
import { 
    Plugin, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch, Notice
} from 'obsidian';

interface SnippetsSettings {
    snippetTrigger: string;
    snippetLimit: number;
    snippets: string[];
    recentSnippets: Record<string, number>;
}

interface SnippetsItem { content: string; }

const DEFAULT_SETTINGS: SnippetsSettings = {
    snippetTrigger: "\\",
    snippetLimit: 5,
    snippets: ["하나", "둘", "셋"],
    recentSnippets: {}
}

export default class SnippetsPlugin extends Plugin {
    settings: SnippetsSettings;
    // snippets/symbols debounce savesettings 선언
    private saveTimer: number | null = null;
    debouncedSave() {
        if (this.saveTimer) window.clearTimeout(this.saveTimer);

        this.saveTimer = window.setTimeout(() => {
            this.saveSettings();
            this.saveTimer = null;
        }, 300);
    }
    async onload() {
        await this.loadSettings();
        // 서제스트 등록
        this.registerEditorSuggest(new SnippetsSuggestions(this));

        // snippets
        this.addCommand({
            id: 'add-to-snippets',
            name: '조각글 추가',
            icon: 'lucide-clipboard-plus',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                this.addSnippet(selection);
            }
        });
        this.addCommand({
            id: 'remove-from-snippets',
            name: '조각글 제거',
            icon: 'lucide-clipboard-minus',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                this.removeSnippet(selection);
            }
        });
    }
    // [Common] Data
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

    async addSnippet(content: string) {
        // 1. 내용이 아예 없는 경우만 체크합니다.
        if (!content || content.length === 0) {
            new Notice("추가할 텍스트를 선택해주세요.");
            return;
        }

        // 2. .trim()을 제거하여 사용자가 선택한 공백/줄바꿈을 그대로 보존합니다.
        if (this.settings.snippets.includes(content)) {
            new Notice("이미 존재하는 조각글입니다.");
            return;
        }

        // 3. 배열에 추가하고 저장합니다.
        this.settings.snippets.push(content);
        await this.saveSettings();
    
        // 알림창에서는 가독성을 위해 앞뒤 공백을 제거하고 보여줄 수 있습니다.
        new Notice(`조각글 등록 완료: "${content.trim()}"`);
    }

    async removeSnippet(content: string) {
        if (!content || content.length === 0) {
            new Notice("제거할 텍스트를 선택해주세요.");
            return;
        }

        // 목록에 존재하는지 확인
        if (!this.settings.snippets.includes(content)) {
            new Notice("조각글 목록에 일치하는 텍스트가 없습니다.");
            return;
        }

        // 해당 텍스트를 제외한 나머지만 남김
        this.settings.snippets = this.settings.snippets.filter(item => item !== content);
        
        await this.saveSettings();
        new Notice(`조각글 제거 완료: "${content.trim()}"`);
    }
}
// snippets
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SnippetsSuggestions extends EditorSuggest<SnippetsItem> {
    plugin: SnippetsPlugin; // 메인 플러그인 인스턴스 보관
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그

    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: SnippetsPlugin) { 
        super(plugin.app); // Obsidian suggest 시스템 초기화
        this.plugin = plugin; // plugin 참조 저장
    }

    // 커서 이동 / 입력 시 호출
    // suggestion 을 띄울지 판단하는 트리거 함수
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        // 새로운 trigger 가 시작될 때마다 autoInserted 를 리셋
        this.autoInserted = false;
        // 현재 커서 위치까지의 텍스트 추출
        const line = editor.getLine(cursor.line).substring(0, cursor.ch);
        // 설정에서 트리거 문자 가져오기
        const trigger = this.plugin.settings.snippetTrigger;
        // 트리거 + 이후 단어를 정규식으로 변환(헬퍼 함수 호출)
        const match = line.match(buildTriggerRegex(trigger));
        // 매칭되면 suggestion 시작/끝 위치와 query 반환
        return match ? {
            start: { line: cursor.line, ch: match.index! }, // 트리거 시작 위치
            end: cursor, // 현재 커서 위치
            query: match[1] ?? "" // 입력된 검색어
        } : null; // 매칭 없으면 suggest 안 띄움
    }

    // gestSuggestions에서 자동삽입까지 처리
    getSuggestions(ctx: EditorSuggestContext): SnippetsItem[] {
        // snippetLimit가 0일 경우 가드
        if (this.plugin.settings.snippetLimit < 1) return [];        
        // 입력된 query 소문자화
        const query = ctx.query.toLowerCase();
        // Obsidian fuzzy 검색 준비
        const fuzzy = prepareFuzzySearch(query);

        // 최근 사용 가중치 (아주 작게 줘서 fuzzy 우선 유지)
        const SNIPPETS_RECENT_WEIGHT = 0.0000001;
        // 모든 snippet 을 대상으로 점수 계산
        const suggestions = this.plugin.settings.snippets
            .map(text => {
                const result = fuzzy(text.toLowerCase()); // fuzzy 점수 계산
                const lastUsed = this.plugin.settings.recentSnippets[text] ?? 0; // 최근 사용 timestamp 가져오기
                return {
                    item: { content: text }, // 실제 삽입될 내용
                    score: result ? result.score : -1, // fuzzy 점수
                    recent: lastUsed // 최근 사용 시간
                };
            })
            // fuzzy 실패한 항목 제거
            .filter(res => res.score !== -1)
            // fuzzy 점수 + recent 가중치를 합쳐 최종 점수 생성
            .map(res => ({
                item: res.item,
                finalScore: res.score + res.recent * SNIPPETS_RECENT_WEIGHT
            }))
            // 최종 점수 기준 내림차순 정렬
            .sort((a, b) => b.finalScore - a.finalScore)
            // 최대 표시 개수 제한
            .slice(0, this.plugin.settings.snippetLimit)
            // SnippetsItem 배열로 변환
            .map(res => res.item);
        // 자동 삽입 로직
        // [조건] 검색어 존재, 결과 1개, 아직 자동삽입 안함
        if (query.length > 0 && suggestions.length === 1 && !this.autoInserted) {
            const targetItem = suggestions[0];
            // targetItem이 undefined일 가능성을 TypeScript에게 없다고 확인시켜줌
            if (!targetItem) return suggestions;

            const triggerChar = this.plugin.settings.snippetTrigger;

            // [핵심 4] 삽입할 내용에 트리거가 포함되어 있다면 자동완성 포기 (무한 루프 방지)
            if (targetItem.content.includes(triggerChar)) {
                return suggestions; 
            }

            // 플래그를 먼저 true로 설정하여 후속 호출 차단
            this.autoInserted = true;

            setTimeout(() => {
                // [핵심 3] 실행 시점에 Context가 유효한지, 그리고 사용자가 닫지 않았는지 확인
                // this.context가 없으면(null) 이미 닫힌 상태임
                if (!this.context) return; 
                this.selectSuggestion(targetItem);
                
                // close()는 selectSuggestion 내부 로직이나 Obsidian에 의해 
                // 처리되도록 두는 것이 더 안전할 수 있으나, 명시적으로 닫으려면:
                this.close();
            }, 0);

            // [핵심 2] UI를 띄우지 않기 위해 빈 배열 반환
            return suggestions;
        }

        return suggestions;
    }

    // suggestion UI 렌더링
    renderSuggestion(item: SnippetsItem, el: HTMLElement) {
        el.setText(`${item.content}`); // 리스트에 snippet 내용 표시
    }

    // 사용자가 suggestion 을 수동 선택했을 때 호출
    selectSuggestion(item: SnippetsItem) {
        // selectSuggestion은 Obsidian이 호출할 때 this.context를 보장하지만,
        // setTimeout에서 직접 호출할 때는 this.context 체크가 필수
        if (!this.context) return;

        const { editor, start, end } = this.context;
        
        // 에디터 수정
        editor.replaceRange(item.content, start, end);

        // 최근 사용 기록 저장 로직
        this.recordRecent(item.content);
    }

    // 최근 사용 기록 로직
    private recordRecent(content: string) {
        // 최근 사용 기록 객체
        const recent = this.plugin.settings.recentSnippets;
        // 현재 선택한 snippet timestamp 저장
        recent[content] = Date.now();
        // recent 최대 개수 = snippetLimit
        const limit = this.plugin.settings.snippetLimit;
        // 최신순 정렬 후 limit 만큼만 유지
        this.plugin.settings.recentSnippets = Object.fromEntries(
            Object.entries(recent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
        );

        // settings 저장
        this.plugin.debouncedSave();
    }
}

// snippets, symbols 공통 helper 함수
// 트리거 regex 기호 escape 함수
function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);

    // character class 는 반드시 single char 기준
    const first = escaped[0];

    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}
```