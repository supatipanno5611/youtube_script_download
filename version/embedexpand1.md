```ts
import { Plugin, MarkdownView, Notice, TFile, parseLinktext } from 'obsidian';

// =================================================================
// 플러그인 개요
//
// 옵시디언 문서의 ![[...]] 임베드를 재귀적으로 펼쳐
// 새로운 노트로 만들어주는 플러그인.
//
// 기존 "클립보드 복사" 방식에서 "새 노트 생성" 방식으로 전환한 이유:
//  - 사용자가 결과를 눈으로 확인할 수 있어 부분 실패 UX 문제가 자연스럽게 해소됨
//  - 순환 참조나 깊이 초과된 임베드는 원문(![[...]])을 그대로 남겨두면 충분함
//  - 클립보드 타이밍, 부분 실패 누적, Notice 메시지 설계 등 불필요한 복잡도 제거
//
// 코드 블록 보호 방식도 변경:
//  - 기존: 마스킹(임시 키로 치환) → 변환 → 언마스킹
//  - 신규: 라인 단위 상태 머신으로 코드 블록 안/밖을 추적하며
//          코드 블록 바깥에서만 ![[...]]를 처리
//  → 마스킹/언마스킹 로직 전체 제거
// =================================================================

export default class EmbedExpandPlugin extends Plugin {

    // 재귀 깊이 상한선. 이 값을 초과하면 해당 임베드를 원문 그대로 둔다.
    readonly MAX_DEPTH = 10;

    async onload() {
        this.addCommand({
            id: 'create-expanded-note',
            name: '임베드 펼쳐서 새 노트 만들기',
            // editorCallback의 view는 MarkdownView | MarkdownFileInfo 유니온 타입이다.
            // createExpandedNote는 MarkdownView의 file 프로퍼티가 필요하므로 타입 가드로 좁힌다.
            editorCallback: (editor, view) => {
                if (view instanceof MarkdownView) {
                    this.createExpandedNote(editor, view);
                }
            },
        });
    }

    // =================================================================
    // 진입점: 새 노트 생성
    // =================================================================

    async createExpandedNote(editor: any, view: MarkdownView) {
        const rootFile = view.file;
        if (!rootFile) return;

        // 선택 영역이 있으면 선택 영역만, 없으면 전체 문서를 처리한다
        const sourceText = editor.getSelection() || editor.getValue();

        // 순환 참조 감지를 위한 방문 경로 추적.
        // Set을 사용해 O(1)로 포함 여부를 확인한다.
        const visited = new Set<string>([rootFile.path]);

        const expanded = await this.expandText(sourceText, rootFile.path, visited, 0);

        // 생성할 노트 이름: "원본파일명 (expanded).md", Vault 루트에 위치
        const newFileName = `${rootFile.basename} (expanded).md`;

        // 같은 이름의 파일이 이미 있으면 내용을 덮어쓴다
        const existing = this.app.vault.getAbstractFileByPath(newFileName);
        let newFile: TFile;
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, expanded);
            newFile = existing;
        } else {
            newFile = await this.app.vault.create(newFileName, expanded);
        }

        // 생성된 노트를 새 탭으로 열어준다
        await this.app.workspace.getLeaf(true).openFile(newFile);

        new Notice(`✅ 노트 생성 완료: ${newFileName}`, 4000);
    }

    // =================================================================
    // 핵심 1: 텍스트 펼치기 — 라인 단위 상태 머신
    // =================================================================

    /**
     * 주어진 텍스트 안의 ![[...]] 임베드를 재귀적으로 펼쳐 반환한다.
     *
     * 코드 블록 보호 방식:
     *  - 라인을 하나씩 읽으면서 펜스 블록(``` 또는 ~~~) 상태를 추적한다.
     *  - 펜스 블록 안에 있는 줄은 임베드 처리 없이 그대로 통과시킨다.
     *  - 같은 방식으로 인라인 코드(`...`)도 별도 함수에서 처리한다.
     *
     * @param text            처리할 텍스트
     * @param currentFilePath 이 텍스트가 속한 파일의 경로 (임베드 링크 해석에 사용)
     * @param visited         현재 재귀 경로상의 파일 경로 집합 (순환 참조 감지용)
     * @param depth           현재 재귀 깊이
     */
    async expandText(
        text: string,
        currentFilePath: string,
        visited: Set<string>,
        depth: number,
    ): Promise<string> {
        // Windows(\r\n)와 Unix(\n) 줄바꿈을 통일한다
        const lines = text.replace(/\r\n/g, '\n').split('\n');
        const resultLines: string[] = [];

        let inFencedBlock = false;
        // 현재 열린 펜스 블록을 시작한 문자열. 예: "```", "~~~~"
        let fenceMarker = '';

        for (const line of lines) {

            if (!inFencedBlock) {
                // 펜스 시작 탐지: 줄 앞 공백 0~3개 허용, ``` 또는 ~~~ 3개 이상
                const fenceMatch = line.match(/^( {0,3})(```+|~~~+)/);
                if (fenceMatch) {
                    inFencedBlock = true;
                    // fenceMatch[2]는 정규식 캡처 그룹이라 이론상 항상 존재하지만,
                    // TypeScript strict 모드에서 undefined 가능성을 열어두므로 ?? '' 로 안전하게 처리한다
                    fenceMarker = fenceMatch[2] ?? '';
                    // 펜스 시작 줄은 그대로 출력
                    resultLines.push(line);
                    continue;
                }

                // 펜스 블록 밖: 임베드 처리 대상
                const expandedLine = await this.expandEmbedsInLine(
                    line, currentFilePath, visited, depth,
                );
                resultLines.push(expandedLine);

            } else {
                // 펜스 블록 안: 닫힘 여부만 감지하고 줄을 그대로 통과
                const closingChar = fenceMarker[0]; // ` 또는 ~
                // 닫힘 조건: 같은 문자 종류, 시작과 동일한 개수 이상, 그 외 공백만 허용
                const closingRe = new RegExp(
                    `^\\s*\\${closingChar}{${fenceMarker.length},}\\s*$`
                );
                if (closingRe.test(line)) {
                    inFencedBlock = false;
                    fenceMarker = '';
                }
                resultLines.push(line);
            }
        }

        return resultLines.join('\n');
    }

    // =================================================================
    // 핵심 2: 한 줄 안의 임베드 처리
    // =================================================================

    /**
     * 한 줄 안의 ![[...]] 임베드를 모두 찾아 펼친다.
     *
     * 인라인 코드(`...`) 범위를 먼저 파악하여,
     * 그 범위 안에 있는 ![[...]]는 건드리지 않는다.
     */
    async expandEmbedsInLine(
        line: string,
        currentFilePath: string,
        visited: Set<string>,
        depth: number,
    ): Promise<string> {
        // 인라인 코드의 [시작 오프셋, 끝 오프셋] 목록
        const codeRanges = this.getInlineCodeRanges(line);

        const embedRegex = /!\[\[(.*?)\]\]/g;
        let match: RegExpExecArray | null;
        let result = '';
        let lastIndex = 0;

        while ((match = embedRegex.exec(line)) !== null) {
            const matchStart = match.index;

            // 인라인 코드 범위 안이면 임베드가 아닌 일반 텍스트로 취급
            const isInsideCode = codeRanges.some(
                ([start, end]) => matchStart >= start && matchStart < end
            );
            if (isInsideCode) {
                // 매칭된 범위 전체를 그대로 결과에 포함하고 건너뜀
                result += line.slice(lastIndex, embedRegex.lastIndex);
                lastIndex = embedRegex.lastIndex;
                continue;
            }

            // 임베드 앞의 일반 텍스트를 먼저 추가
            result += line.slice(lastIndex, matchStart);

            // 임베드 해석 및 펼치기
            // match[1]: ![[...]] 안의 텍스트. 정규식 구조상 항상 존재하지만 strict 모드 대응으로 ?? '' 처리
            const replacement = await this.resolveEmbed(
                match[1] ?? '', currentFilePath, visited, depth,
            );
            result += replacement;
            lastIndex = embedRegex.lastIndex;
        }

        // 마지막 임베드 이후의 나머지 텍스트
        result += line.slice(lastIndex);
        return result;
    }

    /**
     * 한 줄에서 인라인 코드(`...`)의 [시작, 끝] 오프셋 목록을 반환한다.
     * 백틱 여러 개(``코드``)도 정확히 지원한다.
     */
    getInlineCodeRanges(line: string): [number, number][] {
        const ranges: [number, number][] = [];
        const re = /(`+)([\s\S]*?)\1/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
            ranges.push([m.index, m.index + m[0].length]);
        }
        return ranges;
    }

    // =================================================================
    // 핵심 3: 단일 임베드 해석
    // =================================================================

    /**
     * 임베드 링크 텍스트를 해석하여 펼쳐진 내용(또는 원문)을 반환한다.
     *
     * 처리 흐름:
     *  1. 파일을 찾지 못하면 → 원문 유지
     *  2. 미디어 파일(이미지, PDF 등)이면 → (basename) 또는 (basename|alias)
     *  3. 깊이 제한 초과이면 → 원문 유지
     *  4. 순환 참조이면 → 원문 유지
     *  5. 마크다운 파일이면 → 내용 읽기 → 정제 → 재귀 펼치기
     *
     * 원문을 유지하는 경우, 생성된 노트에서 해당 임베드가 그대로 보이므로
     * 사용자가 직접 확인할 수 있다.
     *
     * @param linkText        ![[...]] 안의 텍스트. 예: "파일명", "파일명#헤딩", "파일명|별칭"
     * @param currentFilePath 이 임베드가 위치한 파일의 경로
     * @param visited         순환 참조 감지용 방문 경로 집합
     * @param depth           현재 재귀 깊이
     */
    async resolveEmbed(
        linkText: string,
        currentFilePath: string,
        visited: Set<string>,
        depth: number,
    ): Promise<string> {
        const originalSyntax = `![[${linkText}]]`;

        // alias 추출: "파일명|별칭" 또는 "파일명#헤딩|별칭" 구조에서 | 이후 텍스트
        // parseLinktext는 | 를 인식하지 못하므로, alias를 먼저 분리한 뒤에 호출해야 한다.
        // 순서가 바뀌면 "report.pdf|별칭" 전체가 path로 들어가 파일을 찾지 못한다.
        const pipeIndex = linkText.indexOf('|');
        const alias = pipeIndex !== -1 ? linkText.slice(pipeIndex + 1) : '';
        const linkTextWithoutAlias = pipeIndex !== -1 ? linkText.slice(0, pipeIndex) : linkText;

        // parseLinktext: Obsidian 내장 함수. "파일명#섹션" 을 { path, subpath } 로 분리한다.
        // alias를 제거한 문자열을 전달해야 path가 올바르게 추출된다.
        const { path, subpath } = parseLinktext(linkTextWithoutAlias);

        // Obsidian의 링크 해석 엔진으로 실제 파일 객체를 가져온다
        const targetFile = this.app.metadataCache.getFirstLinkpathDest(path, currentFilePath);

        // 1. 파일을 찾을 수 없음: 원문 유지
        if (!targetFile) return originalSyntax;

        // 2. 미디어 파일: 파일명(+ 별칭)으로 변환
        //    확장자를 포함한 전체 파일명을 사용한다. 파일 종류를 명확히 하기 위해 확장자를 유지한다.
        //    별칭이 있으면 "(별칭|파일명.확장자)", 없으면 "(파일명.확장자)" 형태로 출력한다.
        if (targetFile.extension !== 'md') {
            const filename = `${targetFile.basename}.${targetFile.extension}`;
            return alias
                ? `(${alias}|${filename})`
                : `(${filename})`;
        }

        // 3. 깊이 제한 초과: 원문 유지
        //    생성된 노트에서 사용자가 해당 임베드 위치를 식별할 수 있다
        if (depth >= this.MAX_DEPTH) return originalSyntax;

        // 4. 순환 참조: 원문 유지
        if (visited.has(targetFile.path)) return originalSyntax;

        // 5. 마크다운 파일: 재귀적으로 펼치기
        // 새 visited 집합을 만들어 현재 경로를 추가한다 (원본 집합 불변 유지)
        const newVisited = new Set(visited);
        newVisited.add(targetFile.path);

        let content = await this.app.vault.read(targetFile);
        content = content.replace(/\r\n/g, '\n');

        // ① YAML frontmatter만 먼저 제거한다.
        //    removeFrontmatter는 원본 파일 기준의 cache offset을 사용하므로
        //    반드시 파일을 읽은 직후 원본 텍스트 상태에서 호출해야 한다.
        content = this.removeFrontmatter(content, targetFile);

        // ② 섹션을 추출한다. (Block ID 마커가 아직 살아있어야 ^blockid 탐색이 가능하다)
        //    extractSection은 정규식 기반이므로 YAML 제거 후 offset이 달라져도 정확하게 동작한다.
        content = this.extractSection(content, subpath);

        // ③ 섹션 추출 후 Block ID 마커를 제거한다.
        //    extractSection이 ^blockid를 이미 활용한 뒤이므로 이 시점에 지워도 안전하다.
        content = this.removeBlockIds(content);

        // 재귀 펼치기
        return await this.expandText(content, targetFile.path, newVisited, depth + 1);
    }

    // =================================================================
    // 보조: 내용 정제 — YAML 제거
    // =================================================================

    /**
     * YAML frontmatter만 제거하여 반환한다.
     *
     * Block ID 제거는 반드시 extractSection 이후에 수행해야 하므로
     * 이 함수에서는 YAML 제거만 담당하고 removeBlockIds를 별도로 분리했다.
     *
     * YAML 제거 전략:
     *  1순위: metadataCache.frontmatterPosition 활용
     *     - BOM(\uFEFF) 등 특수 문자가 있어도 정확하게 동작한다
     *     - Obsidian이 이미 파싱한 위치 정보를 그대로 사용하므로 가장 신뢰도가 높다
     *  2순위: 문자열 기반 fallback (캐시가 없는 경우)
     */
    removeFrontmatter(text: string, file: TFile): string {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatterPosition) {
            // frontmatterPosition.end.offset: 닫는 --- 라인 다음의 문자 위치
            const endOffset = cache.frontmatterPosition.end.offset;
            return text.slice(endOffset).replace(/^\n+/, '');
        }

        // fallback: BOM 제거 후 --- 구분선 기반 탐지
        const stripped = text.replace(/^\uFEFF/, '');
        if (stripped.startsWith('---\n')) {
            const endYaml = stripped.indexOf('\n---', 4);
            if (endYaml !== -1) {
                return stripped.slice(endYaml + 4).replace(/^\n+/, '');
            }
        }

        return text;
    }

    // =================================================================
    // 보조: 내용 정제 — Block ID 제거
    // =================================================================

    /**
     * 줄 끝의 Block ID 마커( ^abcdef)를 제거하여 반환한다.
     *
     * extractSection이 ^blockid 마커를 탐색에 활용한 뒤에 호출해야 한다.
     * 코드 블록 내부는 expandText의 라인 상태 머신이 이미 보호하므로
     * 여기서는 단순 정규식 제거로 충분하다.
     */
    removeBlockIds(text: string): string {
        return text.replace(/\s\^[a-zA-Z0-9-]+$/gm, '').trim();
    }

    // =================================================================
    // 보조: 섹션 추출
    // =================================================================

    /**
     * subpath에 따라 YAML 제거 후의 텍스트에서 특정 부분만 추출한다.
     *
     * cache offset 대신 정규식/라인 기반으로 탐색하는 이유:
     *  - cleanContent()로 YAML을 제거하고 나면 원본 파일의 offset과 현재 텍스트의 offset이 달라진다.
     *  - 정규식 기반 탐색은 텍스트 자체를 직접 읽으므로 offset 불일치 문제가 구조적으로 없다.
     *
     * @param content YAML 제거 후의 텍스트
     * @param subpath ![[파일#subpath]] 에서의 subpath. 없으면 빈 문자열.
     *
     * 패턴:
     *  - subpath 없음    → 전체 내용 반환
     *  - "#헤딩 이름"    → 해당 헤딩 줄부터 다음 동급/상위 헤딩 직전까지
     *  - "#^blockid"     → 해당 Block ID가 달린 줄 (줄 끝의 ^id 제거 후 반환)
     */
    extractSection(content: string, subpath: string): string {
        // subpath가 없으면 전체 내용을 그대로 사용
        if (!subpath) return content;

        const lines = content.split('\n');

        // 대소문자 및 공백 무시 비교를 위한 정규화 함수
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

        // ── 헤딩 임베드: "#헤딩 이름" ────────────────────────────────────────
        // "#^blockid" 패턴은 이 분기에서 제외한다
        if (subpath.startsWith('#') && !subpath.startsWith('#^')) {
            const headingName = normalize(subpath.slice(1));

            // 헤딩 줄을 파싱하는 헬퍼: "## 제목" → { level: 2, text: "제목" }
            const parseHeading = (line: string): { level: number; text: string } | null => {
                const m = line.match(/^(#{1,6})\s+(.+)/);
                if (!m || !m[1] || !m[2]) return null;
                return { level: m[1].length, text: m[2].trim() };
            };

            // 목표 헤딩 줄의 인덱스를 찾는다
            const targetLineIdx = lines.findIndex(line => {
                const h = parseHeading(line);
                return h !== null && normalize(h.text) === headingName;
            });

            // 목표 헤딩을 찾지 못한 경우 전체 내용 반환
            if (targetLineIdx === -1) return content;

            const targetLine = lines[targetLineIdx];
            if (!targetLine) return content;

            const targetHeading = parseHeading(targetLine);
            if (!targetHeading) return content;

            // 다음 동급(같은 레벨) 또는 상위 레벨 헤딩이 나오는 줄을 끝 지점으로 삼는다
            let endLineIdx = lines.length;
            for (let i = targetLineIdx + 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line) continue;
                const h = parseHeading(line);
                if (h && h.level <= targetHeading.level) {
                    endLineIdx = i;
                    break;
                }
            }

            return lines.slice(targetLineIdx, endLineIdx).join('\n').trim();
        }

        // ── 블록 임베드: "#^blockid" ─────────────────────────────────────────
        if (subpath.startsWith('#^')) {
            const blockId = subpath.slice(2);
            // Block ID는 줄 끝에 " ^blockid" 형태로 붙어 있다
            const targetLine = lines.find(line =>
                line.trimEnd().endsWith(` ^${blockId}`)
            );
            if (!targetLine) return content;

            // 반환 시 Block ID 마커 자체는 제거한다 (cleanContent와 동일한 방침)
            return targetLine.replace(/\s\^[a-zA-Z0-9-]+$/, '').trim();
        }

        // 어느 패턴에도 해당하지 않으면 전체 내용 반환
        return content;
    }
}
```