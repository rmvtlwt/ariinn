import type { API, APIMessage } from "@discordjs/core";
import { RunCreateParams } from "openai/resources/beta/threads/runs/runs.ts";

export const data: RunCreateParams.AssistantToolsFunction = {
	type: "function",
	function: {
		name: "set_slowmode",
		description: "Set slowmode in the channel",
		parameters: {
			type: "object",
			properties: {
				time_in_seconds: {
					type: "number",
					description:
						"The length of time slowmode (in seconds) you want to apply",
				},
			},
			required: ["time_in_seconds"],
		},
	},
};

export async function fn(
	api: API,
	message: APIMessage,
	{ time_in_seconds }: { time_in_seconds: number },
): Promise<string> {
	const moderators = [
		"931499365833535488",
	];

	if (moderators.includes(message.author.id)) {
		try {
			await api.channels.edit(Deno.env.get("DISCORD_CHAT_CHANNEL")!, {
				rate_limit_per_user: time_in_seconds ?? 0,
			});
			return `Slowmode telah diubah ke ${time_in_seconds} detik.`;
		} catch (_error) {
			console.log(_error);
			return `Gagal mengubah slowmode.`;
		}
	} else {
		return "Kamu bukan moderator.";
	}
}
