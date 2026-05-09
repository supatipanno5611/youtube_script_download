import { App, SuggestModal } from "obsidian";

import type { CaptionTrack } from "../types";

export function chooseCaptionTrack(
	app: App,
	tracks: CaptionTrack[],
): Promise<CaptionTrack | null> {
	return new Promise((resolve) => {
		const modal = new CaptionTrackSuggestModal(app, tracks, resolve);
		modal.open();
	});
}

class CaptionTrackSuggestModal extends SuggestModal<CaptionTrack> {
	private selected = false;

	constructor(
		app: App,
		private readonly tracks: CaptionTrack[],
		private readonly resolveValue: (track: CaptionTrack | null) => void,
	) {
		super(app);
		this.setPlaceholder("Choose a caption language");
	}

	getSuggestions(query: string): CaptionTrack[] {
		const normalizedQuery = query.toLowerCase();
		return this.tracks.filter((track) =>
			track.label.toLowerCase().includes(normalizedQuery),
		);
	}

	renderSuggestion(track: CaptionTrack, el: HTMLElement): void {
		el.setText(track.label);
	}

	onChooseSuggestion(track: CaptionTrack): void {
		this.selected = true;
		this.resolveValue(track);
	}

	onClose(): void {
		super.onClose();
		if (!this.selected) {
			this.resolveValue(null);
		}
	}
}
