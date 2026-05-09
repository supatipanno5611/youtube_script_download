import { requestUrl } from "obsidian";

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
const IOS_USER_AGENT =
	"com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)";

export interface PlayerData {
	captions?: {
		playerCaptionsTracklistRenderer?: {
			captionTracks?: RawCaptionTrack[];
		};
	};
	playabilityStatus?: {
		status?: string;
		reason?: string;
	};
}

export interface RawCaptionTrack {
	baseUrl?: string;
	languageCode?: string;
	kind?: string;
	name?: {
		simpleText?: string;
		runs?: Array<{
			text?: string;
		}>;
	};
}

export async function fetchPlayerData(videoId: string): Promise<PlayerData> {
	const response = await requestUrl({
		url: INNERTUBE_PLAYER_URL,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": IOS_USER_AGENT,
		},
		body: JSON.stringify({
			context: {
				client: {
					clientName: "IOS",
					clientVersion: "20.10.38",
					hl: "en",
					gl: "US",
				},
			},
			videoId,
		}),
	});

	const data = JSON.parse(response.text) as PlayerData;
	checkPlayability(data);
	return data;
}

function checkPlayability(data: PlayerData): void {
	const status = data.playabilityStatus;
	if (!status) return;

	if (status.status === "ERROR") {
		throw new Error(status.reason ?? "Video unavailable");
	}
	if (status.status === "LOGIN_REQUIRED") {
		throw new Error("This video requires login to view");
	}
	if (status.status === "UNPLAYABLE") {
		throw new Error(status.reason ?? "Video is unplayable");
	}
}
