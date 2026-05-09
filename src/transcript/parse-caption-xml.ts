import type { TranscriptLine } from "../types";

export function parseCaptionXml(xmlContent: string): TranscriptLine[] {
	const document = new DOMParser().parseFromString(xmlContent, "text/xml");
	if (document.getElementsByTagName("parsererror").length > 0) {
		return [];
	}

	const textTagLines = parseTextTagLines(document);
	if (textTagLines.length > 0) {
		return textTagLines;
	}

	return parseParagraphTagLines(document);
}

function parseTextTagLines(document: Document): TranscriptLine[] {
	const elements = document.getElementsByTagName("text");
	const lines: TranscriptLine[] = [];

	for (let index = 0; index < elements.length; index++) {
		const element = elements.item(index);
		if (element === null) continue;

		const offset = parseSeconds(element.getAttribute("start"));
		const duration = parseSeconds(element.getAttribute("dur"));
		if (offset === null || duration === null) continue;

		const text = cleanCaptionText(element.textContent ?? "");
		if (text.length === 0) continue;

		lines.push({ text, offset, duration });
	}

	return lines;
}

function parseParagraphTagLines(document: Document): TranscriptLine[] {
	const elements = document.getElementsByTagName("p");
	const lines: TranscriptLine[] = [];

	for (let index = 0; index < elements.length; index++) {
		const element = elements.item(index);
		if (element === null) continue;

		const offset = parseMilliseconds(element.getAttribute("t"));
		const durationValue = element.getAttribute("d");
		const duration =
			durationValue === null ? 0 : parseMilliseconds(durationValue);
		if (offset === null || duration === null) continue;

		const text = cleanCaptionText(element.textContent ?? "");
		if (text.length === 0) continue;

		lines.push({ text, offset, duration });
	}

	return lines;
}

function parseSeconds(value: string | null): number | null {
	if (value === null) return null;

	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed < 0) return null;

	return Math.round(parsed * 1000);
}

function parseMilliseconds(value: string | null): number | null {
	if (value === null) return null;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return null;

	return parsed;
}

function cleanCaptionText(text: string): string {
	return text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}
