import { Editor, MarkdownView, Notice, Plugin } from "obsidian";

import { chooseCaptionTrack } from "./modals/caption-track-suggest-modal";
import { promptForYouTubeUrl } from "./modals/url-prompt-modal";
import { formatScript } from "./transcript/format-script";
import { parseCaptionXml } from "./transcript/parse-caption-xml";
import { downloadCaptionXml, getCaptionTracks } from "./youtube/captions";
import { fetchPlayerData } from "./youtube/innertube";
import { extractVideoIdFromUrl } from "./youtube/url";

export default class StrictPlugin extends Plugin {
	onload(): void {
		this.addCommand({
			id: "insert-youtube-script",
			name: "유튜브 자막 스크립트 삽입",
			icon: "lucide-youtube",
			editorCallback: (editor) => {
				void this.importYouTubeScript(editor);
			},
		});
	}

	private async importYouTubeScript(editor: Editor): Promise<void> {
		const url = await promptForYouTubeUrl(this.app);
		if (url === null) return;

		const videoId = extractVideoIdFromUrl(url);
		if (videoId === null) {
			new Notice("Enter a valid YouTube URL.");
			return;
		}

		try {
			const playerData = await fetchPlayerData(videoId);
			const tracks = getCaptionTracks(playerData);

			if (tracks.length === 0) {
				new Notice("No captions are available for this video.");
				return;
			}

			const track = await chooseCaptionTrack(this.app, tracks);
			if (track === null) return;

			const captionXml = await downloadCaptionXml(track);
			const lines = parseCaptionXml(captionXml);
			if (lines.length === 0) {
				new Notice("The selected caption track is empty.");
				return;
			}

			const markdown = formatScript(lines);
			this.insertScript(editor, markdown);
			new Notice("Inserted YouTube script.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			new Notice(`Failed to insert YouTube script: ${message}`);
		}
	}

	private insertScript(editor: Editor, markdown: string): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeEditor = activeView?.editor ?? editor;
		activeEditor.focus();
		activeEditor.replaceSelection(markdown);
	}
}
