import type { Plugin } from "obsidian";

import type { PluginSettings } from "./types";

const DEFAULT_SETTINGS: PluginSettings = {
	outputFolder: "yt-script",
};

interface StoredSettings {
	outputFolder?: unknown;
}

export async function loadPluginSettings(
	plugin: Plugin,
): Promise<PluginSettings> {
	const data = (await plugin.loadData()) as StoredSettings | null;
	const outputFolder =
		typeof data?.outputFolder === "string"
			? data.outputFolder.trim()
			: DEFAULT_SETTINGS.outputFolder;

	return {
		outputFolder,
	};
}
