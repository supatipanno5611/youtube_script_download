import { Editor, EditorChange, EditorSelection, Plugin } from "obsidian";

const TIMESTAMP_RE = /^(\u25b6\s+\d+:\d{2}(?::\d{2})?)\s*(.*)$/;

type GetLine = (line: number) => string;

interface LineRange {
	startLine: number;
	endLine: number;
}

function getSelectedLineRange(selection: EditorSelection): LineRange {
	return {
		startLine: Math.min(selection.anchor.line, selection.head.line),
		endLine: Math.max(selection.anchor.line, selection.head.line),
	};
}

function getLinesInRange(range: LineRange, getLine: GetLine): string[] {
	const lines: string[] = [];

	for (let line = range.startLine; line <= range.endLine; line++) {
		lines.push(getLine(line));
	}

	return lines;
}

export function mergeTimestampLines(lines: string[]): string {
	const firstLine = lines[0];
	const firstMatch = firstLine?.match(TIMESTAMP_RE);
	const timestamp = firstMatch?.[1];
	const textParts = lines
		.map((line) => {
			const match = line.match(TIMESTAMP_RE);
			return (match?.[2] ?? line).trim();
		})
		.filter((text) => text.length > 0);

	const mergedText = textParts.join(" ");
	return timestamp ? `${timestamp} ${mergedText}` : mergedText;
}

export function buildTimestampMergeChanges(
	selections: EditorSelection[],
	getLine: GetLine,
): EditorChange[] {
	const changes: EditorChange[] = [];

	for (const selection of selections) {
		const range = getSelectedLineRange(selection);

		if (range.startLine === range.endLine) {
			continue;
		}

		const lines = getLinesInRange(range, getLine);

		changes.push({
			from: { line: range.startLine, ch: 0 },
			to: { line: range.endLine, ch: getLine(range.endLine).length },
			text: mergeTimestampLines(lines),
		});
	}

	return changes;
}

export default class TimestampMergerPlugin extends Plugin {
	async onload(): Promise<void> {
		this.addCommand({
			id: "merge-timestamp-lines",
			name: "Merge timestamp lines",
			editorCallback: (editor: Editor) => {
				const changes = buildTimestampMergeChanges(editor.listSelections(), (line) =>
					editor.getLine(line),
				);

				if (changes.length === 0) {
					return;
				}

				editor.transaction({ changes });
			},
		});
	}
}
