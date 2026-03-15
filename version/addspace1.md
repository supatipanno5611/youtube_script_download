```ts
import { Editor, MarkdownView, Plugin } from "obsidian";

export default class AddTrailingSpacesPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "add-trailing-spaces",
			name: "현재 문서의 모든 기본 행의 맨 끝에 스페이스 두 개 추가",
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				const original = editor.getValue();
				const result = addTrailingSpaces(original);

				if (result !== original) {
					editor.setValue(result);
				}
			},
		});
	}
}

// ─── 상태 타입 ────────────────────────────────────────────────────────────────

type BlockState = {
	inFrontmatter: boolean;
	frontmatterClosed: boolean;
	inFencedCode: boolean;
	inMathBlock: boolean;
};

// ─── 메인 변환 함수 ───────────────────────────────────────────────────────────

function addTrailingSpaces(text: string): string {
	const lines = text.split("\n");
	const state: BlockState = {
		inFrontmatter: false,
		frontmatterClosed: false,
		inFencedCode: false,
		inMathBlock: false,
	};

	const result = lines.map((line, index) => {
		// ── 1단계: 블록 경계 감지 및 상태 전환 ──────────────────────────────

		// Frontmatter: 문서 첫 줄이 "---"인 경우에만 시작
		if (index === 0 && line.trim() === "---") {
			state.inFrontmatter = true;
			return line;
		}

		if (state.inFrontmatter) {
			if (line.trim() === "---" || line.trim() === "...") {
				state.inFrontmatter = false;
				state.frontmatterClosed = true;
			}
			return line;
		}

		// 수식 블록: $$ 경계
		if (line.trim() === "$$") {
			state.inMathBlock = !state.inMathBlock;
			return line;
		}

		// 펜스 코드 블록: ``` 또는 ~~~ 경계
		if (/^(`{3,}|~{3,})/.test(line)) {
			state.inFencedCode = !state.inFencedCode;
			return line;
		}

		// ── 2단계: 블록 내부이면 스킵 ──────────────────────────────────────

		if (state.inFrontmatter || state.inFencedCode || state.inMathBlock) {
			return line;
		}

		// ── 3단계: 일반 텍스트 단락 판별 후 공백 추가 ───────────────────────

		if (isPlainParagraph(line)) {
			return line.trimEnd() + "  ";
		}

		return line;
	});

	return result.join("\n");
}

// ─── 단락 판별 함수 ───────────────────────────────────────────────────────────

function isPlainParagraph(line: string): boolean {
	// 빈 줄 또는 공백만 있는 줄
	if (line.trim() === "") return false;

	// ATX 제목: # 으로 시작
	if (/^#{1,6}\s/.test(line)) return false;

	// 블록쿼트: > 로 시작
	if (/^>/.test(line)) return false;

	// 비순서 리스트: - / * / + 뒤에 공백
	if (/^[-*+]\s/.test(line)) return false;

	// 순서 리스트: 숫자. 또는 숫자) 뒤에 공백
	if (/^\d+[.)]\s/.test(line)) return false;

	// 테이블 행: | 로 시작
	if (/^\|/.test(line)) return false;

	// HTML 블록: < 로 시작
	if (/^</.test(line)) return false;

	// 링크 정의: [label]: url
	if (/^\[.+\]:\s/.test(line)) return false;

	// 들여쓰기 코드 블록: 4스페이스 또는 탭으로 시작
	if (/^( {4}|\t)/.test(line)) return false;

	// 수평선 / Setext 밑줄: ---, ===, ***, ___ 만으로 구성
	if (/^([-*_=])\1{2,}\s*$/.test(line.trim())) return false;

	return true;
}
```
