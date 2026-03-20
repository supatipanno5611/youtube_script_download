```ts
import { App, Notice, Plugin, TFile } from "obsidian";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const FOLDER_1 = "content";
const FOLDER_2 = "private";

// ─── 플러그인 ─────────────────────────────────────────────────────────────────

export default class MoveFilePlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "move-to-content",
			name: "Move current file to content folder",
			callback: () => this.moveActiveFileTo(FOLDER_1),
		});

		this.addCommand({
			id: "move-to-private",
			name: "Move current file to private folder",
			callback: () => this.moveActiveFileTo(FOLDER_2),
		});
	}

	// ─── 진입점 ────────────────────────────────────────────────────────────────

	private async moveActiveFileTo(targetFolder: string): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		if (this.isAlreadyInFolder(file, targetFolder)) {
			new Notice(`Already in "${targetFolder}" folder.`);
			return;
		}

		await this.ensureFolderExists(targetFolder);

		const newPath = this.buildNewPath(targetFolder, file.name);
		await this.renameFile(file, newPath);

		new Notice(`Moved "${file.name}" → ${targetFolder}/`);
	}

	// ─── 유틸 ──────────────────────────────────────────────────────────────────

	private getActiveFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file.");
			return null;
		}
		return file;
	}

	private isAlreadyInFolder(file: TFile, targetFolder: string): boolean {
		const currentFolder = file.parent?.path ?? "";
		return currentFolder === targetFolder;
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const exists = this.app.vault.getAbstractFileByPath(folderPath);
		if (!exists) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	private buildNewPath(targetFolder: string, fileName: string): string {
		return `${targetFolder}/${fileName}`;
	}

	private async renameFile(file: TFile, newPath: string): Promise<void> {
		await this.app.fileManager.renameFile(file, newPath);
	}
}
```
