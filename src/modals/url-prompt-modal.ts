import { App, ButtonComponent, Modal, TextComponent } from "obsidian";

export function promptForYouTubeUrl(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new UrlPromptModal(app, resolve);
		modal.open();
	});
}

class UrlPromptModal extends Modal {
	private value = "";
	private resolved = false;

	constructor(
		app: App,
		private readonly resolveValue: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("YouTube URL");

		const textInput = new TextComponent(this.contentEl);
		textInput.inputEl.addClass("yt-script-url-input");
		textInput.inputEl.placeholder = "https://www.youtube.com/watch?v=...";
		textInput.onChange((value) => {
			this.value = value;
		});
		textInput.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				this.submit();
			}
		});

		const buttonContainerEl = this.contentEl.createDiv();
		buttonContainerEl.addClass("modal-button-container");

		const submitButton = new ButtonComponent(buttonContainerEl);
		submitButton.buttonEl.addClass("mod-cta");
		submitButton.setButtonText("Import").onClick(() => this.submit());

		textInput.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolveValue(null);
		}
	}

	private submit(): void {
		this.resolved = true;
		this.resolveValue(this.value.trim());
		this.close();
	}
}
