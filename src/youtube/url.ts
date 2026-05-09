const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = [
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"mobile.youtube.com",
];
const SHORT_HOSTS = ["youtu.be", "www.youtu.be"];

export function extractVideoIdFromUrl(input: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		return null;
	}

	const hostname = parsed.hostname.toLowerCase();
	if (SHORT_HOSTS.indexOf(hostname) !== -1) {
		return extractShortUrlVideoId(parsed);
	}

	if (YOUTUBE_HOSTS.indexOf(hostname) === -1) {
		return null;
	}

	if (parsed.pathname === "/watch") {
		const videoId = parsed.searchParams.get("v");
		return isVideoId(videoId) ? videoId : null;
	}

	const shortsPrefix = "/shorts/";
	if (parsed.pathname.indexOf(shortsPrefix) === 0) {
		const videoId = parsed.pathname.slice(shortsPrefix.length).split("/")[0];
		return isVideoId(videoId) ? videoId : null;
	}

	return null;
}

function extractShortUrlVideoId(url: URL): string | null {
	const videoId = url.pathname.split("/").filter(Boolean)[0];
	return isVideoId(videoId) ? videoId : null;
}

function isVideoId(value: string | null | undefined): value is string {
	return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}
