import type { TranscriptLine } from "../types";
import { formatTimestamp } from "./timestamp";

export function formatScript(lines: TranscriptLine[]): string {
	return lines
		.map((line) => `▶ ${formatTimestamp(line.offset)} ${line.text}`)
		.join("\n");
}
