```ts
import { 
    Plugin, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch, MarkdownView
} from 'obsidian';

interface SymbolsSettings {
    symbolTrigger: string;
    symbolLimit: number;
    symbols: SymbolItem[];
    pairs: Record<string, string>;
    recentSymbols: Record<string, number>;
}

interface SymbolItem { id: string; symbol: string; closing?: string; }

const DEFAULT_SETTINGS: SymbolsSettings = {
    symbolTrigger: "/",
    symbolLimit: 5,
    symbols: [
        { id: ".", symbol: "⋯" },
        { id: "-", symbol: "—" },
        { id: ",", symbol: "·" },
        { id: "\"", symbol: "“", closing: "”" },
        { id: "'", symbol: "‘", closing: "’" },
        { id: ">>", symbol: "”" },
        { id: ">", symbol: "’" },
        { id: "낫", symbol: "｢", closing: "｣" },
        { id: "낫2", symbol: "｣" },
        { id: "겹", symbol: "『", closing: "』" },
        { id: "겹2", symbol: "』" },
    ],
    pairs: {
        "“": "”",
        "‘": "’",
        "｢": "｣",
        "『": "』"
    },
    recentSymbols: {}
}

export default class SymbolPlugin extends Plugin {
    settings: SymbolsSettings;
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
        this.registerEditorSuggest(new SymbolSuggestions(this));

        // 백스페이스 이벤트 핸들러 분리 등록
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            this.handleSmartBackspace(evt);
        }, true);
    }
    // [Common] Data
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

    // 스마트 삭제 로직을 별도 메서드로 분리
    private handleSmartBackspace(evt: KeyboardEvent) {
        if (evt.key !== 'Backspace') return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        
        // 커서 앞뒤 문자가 PAIRS에 정의된 쌍인지 확인
        if (cursor.ch > 0 && cursor.ch < line.length) {
            const prevChar = line[cursor.ch - 1];
            const nextChar = line[cursor.ch];
            
            if (prevChar && nextChar && this.settings.pairs[prevChar] === nextChar) {
                editor.replaceRange("", 
                    { line: cursor.line, ch: cursor.ch - 1 }, 
                    { line: cursor.line, ch: cursor.ch + 1 }
                );
                evt.preventDefault();
                evt.stopPropagation();
            }
        }
    }
}
// symbols
// EditorSuggest 를 상속해서 Obsidian suggestion 시스템에 연결
class SymbolSuggestions extends EditorSuggest<SymbolItem> {
    // 메인 플러그인 인스턴스 보관
    plugin: SymbolPlugin;
    private autoInserted = false; // 자동 삽입이 같은 trigger 사이클 안에서 여러 번 실행되는 것을 막기 위한 플래그
    
    // 생성자 — plugin 에서 app 을 꺼내 EditorSuggest 에 전달
    constructor(plugin: SymbolPlugin) {
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
        const trigger = this.plugin.settings.symbolTrigger;
        // 트리거 + 이후 단어를 정규식으로 변환(헬퍼 함수 호출)
        const match = line.match(buildTriggerRegex(trigger));
        // 매칭되면 suggestion 시작/끝 위치와 query 반환
        return match ? {
            start: { line: cursor.line, ch: match.index! }, // 트리거 시작 위치
            end: cursor, // 현재 커서 위치
            query: match[1] ?? "" // 입력된 검색어
        } : null; // 매칭 없으면 suggest 안 띄움
    }

    // gestSuggestions에서는 fuzzy 계산만 실행
    getSuggestions(ctx: EditorSuggestContext): SymbolItem[] {
        // symbolLimit가 0일 경우 가드
        if (this.plugin.settings.symbolLimit < 1) return [];        
        // 입력된 query 소문자화
        const query = ctx.query.toLowerCase();
        // Obsidian fuzzy 검색 준비
        const fuzzy = prepareFuzzySearch(query);

        // 최근 사용 가중치 (아주 작게 줘서 fuzzy 우선 유지)
        const SYMBOL_RECENT_WEIGHT = 0.0000001;
        // 모든 symbol 을 대상으로 점수 계산
        const suggestions: SymbolItem[] = this.plugin.settings.symbols
            .map(item => {
                const result = fuzzy(item.id.toLowerCase()); // fuzzy 점수 계산
                const lastUsed = this.plugin.settings.recentSymbols[item.id] ?? 0; // 최근 사용 timestamp 가져오기
                return {
                    item, // 실제 삽입될 내용
                    score: result ? result.score : -1, // fuzzy 점수
                    recent: lastUsed // 최근 사용 시간
                };
            })
            // fuzzy 실패한 항목 제거
            .filter(res => res.score !== -1)
            // fuzzy 점수 + recent 가중치를 합쳐 최종 점수 생성
            .map(res => ({
                item: res.item,
                finalScore: res.score + res.recent * SYMBOL_RECENT_WEIGHT
            }))
            // 최종 점수 기준 내림차순 정렬
            .sort((a, b) => b.finalScore - a.finalScore)
            // 최대 표시 개수 제한
            .slice(0, this.plugin.settings.symbolLimit)
            // SymbolsItem 배열로 변환
            .map(res => res.item);

        // [변경됨] 자동 삽입 로직을 onOpen에서 여기로 이동
        if (query.length > 0 && suggestions.length === 1 && !this.autoInserted) {
            const targetItem = suggestions[0];
            
            // TypeScript 방어 코드
            if (!targetItem) return suggestions;

            const trigger = this.plugin.settings.symbolTrigger;

            // 무한 루프 방지: 심볼 자체에 트리거 문자가 포함된 경우 자동완성 스킵
            if (targetItem.symbol.includes(trigger)) {
                return suggestions;
            }

            // 플래그를 true로 설정하여 중복 실행 방지
            this.autoInserted = true;

            setTimeout(() => {
                // 실행 시점에 Context 유효성 체크
                if (!this.context) return;

                // 기존 selectSuggestion 메서드 재활용 (closing 처리 포함)
                this.selectSuggestion(targetItem);
                
                // 명시적으로 UI 닫기
                this.close();
            }, 0);

            // [핵심] UI 유지를 위해 suggestions 반환 (빈 배열 아님)
            return suggestions;
        }
    return suggestions;
    }

    // suggestion UI 렌더링
    renderSuggestion(item: SymbolItem, el: HTMLElement) {
        el.setText(`${item.id} ${item.symbol}`); // 리스트에 id와 symbol 표시
    }

    // 사용자가 suggestion 을 선택했을 때 호출
    selectSuggestion(item: SymbolItem) {
        if (!this.context) return;

        const { editor, start, end } = this.context;

        // closing 심볼 처리
        if (item.closing) {
            const selection = editor.getSelection();

            if (selection) {
                editor.replaceRange(item.symbol + selection + item.closing, start, end);
            } else {
                editor.replaceRange("", start, end);
                editor.replaceSelection(item.symbol + item.closing);

                // 커서를 중간으로 이동
                const cursor = editor.getCursor();
                editor.setCursor({
                    line: cursor.line,
                    ch: cursor.ch - item.closing.length
                });
            }
        } else {
            editor.replaceRange(item.symbol, start, end);
        }

        this.recordRecent(item);
    }

    // 최근 사용 기록 로직
    private recordRecent(item: SymbolItem) {
        // 최근 사용 기록 객체
        const recent = this.plugin.settings.recentSymbols;
        // 현재 선택한 symbol timestamp 저장
        recent[item.id] = Date.now();
        // recent 최대 개수 = symbolLimit
        const limit = this.plugin.settings.symbolLimit;
        // 최신순 정렬 후 limit 만큼만 유지
        this.plugin.settings.recentSymbols = Object.fromEntries(
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