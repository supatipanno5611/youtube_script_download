import { App, normalizePath, TFile, TFolder } from "obsidian";

export async function createScriptFile(
	app: App,
	outputFolder: string,
	videoTitle: string,
	content: string,
): Promise<TFile> {
	const folderPath = normalizeFolderPath(outputFolder);
	await ensureFolder(app, folderPath);

	const filePath = getAvailableScriptPath(app, folderPath, videoTitle);
	return app.vault.create(filePath, content);
}

function normalizeFolderPath(outputFolder: string): string {
	const trimmed = outputFolder.trim();
	if (trimmed === "") return "";

	return normalizePath(trimmed).replace(/^\/+|\/+$/g, "");
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (folderPath === "") return;

	const parts = folderPath.split("/").filter(Boolean);
	let currentPath = "";

	for (const part of parts) {
		currentPath = currentPath === "" ? part : `${currentPath}/${part}`;
		const existing = app.vault.getAbstractFileByPath(currentPath);

		if (existing instanceof TFolder) {
			continue;
		}
		if (existing !== null) {
			throw new Error(`${currentPath} exists and is not a folder`);
		}

		await app.vault.createFolder(currentPath);
	}
}

function getAvailableScriptPath(
	app: App,
	folderPath: string,
	videoTitle: string,
): string {
	const baseName = sanitizeFileName(videoTitle) || "script";
	let index = 0;

	while (true) {
		const fileName =
			index === 0 ? `${baseName}.md` : `${baseName} (${index}).md`;
		const filePath =
			folderPath === "" ? fileName : `${folderPath}/${fileName}`;

		if (app.vault.getAbstractFileByPath(filePath) === null) {
			return filePath;
		}

		index += 1;
	}
}

function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[\\/:*?"<>|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
