import { App, Modal } from "obsidian";

export function promptForYouTubeUrl(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new UrlPromptModal(app, resolve);
		modal.open();
	});
}

class UrlPromptModal extends Modal {
	private inputEl!: HTMLInputElement;
	private resolved = false;

	constructor(
		app: App,
		private readonly resolveValue: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("YouTube URL");
		this.inputEl = this.contentEl.createEl("input", {
			type: "text",
			placeholder: "https://www.youtube.com/watch?v=...",
		});
		this.inputEl.addClass("yt-script-url-input");
		this.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				this.submit();
			}
		});

		const buttonEl = this.contentEl.createEl("button", {
			text: "Import",
		});
		buttonEl.addEventListener("click", () => this.submit());
		this.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolveValue(null);
		}
	}

	private submit(): void {
		this.resolved = true;
		this.resolveValue(this.inputEl.value.trim());
		this.close();
	}
}
