import type { TranscriptLine } from "../types";

const TEXT_TAG_PATTERN =
	/<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
const P_TAG_PATTERN = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;

export function parseCaptionXml(xmlContent: string): TranscriptLine[] {
	const textTagLines = parseTextTagLines(xmlContent);
	if (textTagLines.length > 0) {
		return textTagLines;
	}

	return parseParagraphTagLines(xmlContent);
}

function parseTextTagLines(xmlContent: string): TranscriptLine[] {
	const lines: TranscriptLine[] = [];

	for (const match of xmlContent.matchAll(TEXT_TAG_PATTERN)) {
		const start = match[1];
		const duration = match[2];
		const rawText = match[3];
		if (start === undefined || duration === undefined || rawText === undefined) {
			continue;
		}

		const text = cleanCaptionText(rawText);
		if (text.length === 0) continue;

		lines.push({
			text,
			offset: Math.round(Number.parseFloat(start) * 1000),
			duration: Math.round(Number.parseFloat(duration) * 1000),
		});
	}

	return lines;
}

function parseParagraphTagLines(xmlContent: string): TranscriptLine[] {
	const lines: TranscriptLine[] = [];

	for (const match of xmlContent.matchAll(P_TAG_PATTERN)) {
		const start = match[1];
		const duration = match[2];
		const rawText = match[3];
		if (start === undefined || duration === undefined || rawText === undefined) {
			continue;
		}

		const text = cleanCaptionText(rawText);
		if (text.length === 0) continue;

		lines.push({
			text,
			offset: Number.parseInt(start, 10),
			duration: Number.parseInt(duration, 10),
		});
	}

	return lines;
}

function cleanCaptionText(text: string): string {
	return decodeHtmlEntities(text.replace(/<[^>]+>/g, ""))
		.replace(/\n/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCharCode(Number.parseInt(code, 10)),
		)
		.replace(/&#x([a-fA-F0-9]+);/g, (_, code: string) =>
			String.fromCharCode(Number.parseInt(code, 16)),
		);
}
