import { Notice, Plugin } from "obsidian";

import { createScriptFile } from "./files/create-script-file";
import { chooseCaptionTrack } from "./modals/caption-track-suggest-modal";
import { promptForYouTubeUrl } from "./modals/url-prompt-modal";
import { loadPluginSettings } from "./settings";
import { formatScript } from "./transcript/format-script";
import { parseCaptionXml } from "./transcript/parse-caption-xml";
import { downloadCaptionXml, getCaptionTracks } from "./youtube/captions";
import { fetchPlayerData } from "./youtube/innertube";
import { extractVideoIdFromUrl } from "./youtube/url";

export default class StrictPlugin extends Plugin {
	onload(): void {
		this.addCommand({
			id: "import-youtube-script",
			name: "Import YouTube script",
			callback: () => {
				void this.importYouTubeScript();
			},
		});
	}

	private async importYouTubeScript(): Promise<void> {
		const url = await promptForYouTubeUrl(this.app);
		if (url === null) return;

		const videoId = extractVideoIdFromUrl(url);
		if (videoId === null) {
			new Notice("Enter a valid YouTube URL.");
			return;
		}

		try {
			const settings = await loadPluginSettings(this);
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
			const file = await createScriptFile(
				this.app,
				settings.outputFolder,
				markdown,
			);
			await this.app.workspace.getLeaf(false).openFile(file);
			new Notice(`Created ${file.path}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			new Notice(`Failed to import YouTube script: ${message}`);
		}
	}
}
