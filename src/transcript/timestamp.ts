export function formatTimestamp(offsetMs: number): string {
	const safeOffset = Math.max(0, offsetMs);
	const totalSeconds = Math.floor(safeOffset / 1000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	if (hours > 0) {
		return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	}

	return `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}
