import { cleanContent } from "./utils/cleanContent.ts";

import { REST } from "@discordjs/rest";
import {
	Client,
	GatewayDispatchEvents,
	GatewayIntentBits,
} from "@discordjs/core";
import { WebSocketManager } from "@discordjs/ws";

import { OpenAI } from "openai/mod.ts";
import type { MessageContentText } from "openai/resources/beta/threads/messages/mod.ts";

const token = Deno.env.get("DISCORD_TOKEN")!;

const rest = new REST().setToken(token);
const gateway = new WebSocketManager({
	rest,
	token,
	intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages |
		GatewayIntentBits.MessageContent,
});

const client = new Client({ rest, gateway });
const ai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const kv = await Deno.openKv();

let isRunning = false;

client.on(
	GatewayDispatchEvents.MessageCreate,
	async ({ api, data: message }) => {
		if (
			!isRunning &&
			!message.author.bot &&
			message.channel_id === Deno.env.get("DISCORD_CHAT_CHANNEL") &&
			message.content &&
			message.mentions.some((entity) =>
				entity.id === Deno.env.get("DISCORD_ID")
			)
		) {
			isRunning = true;

			await api.channels.showTyping(message.channel_id);
			const kvKey = ["threads", message.channel_id];
			let threadId = (await kv.get<string>(kvKey)).value;

			if (!threadId) {
				const newThread = await ai.beta.threads.create();
				threadId = newThread.id;
				await kv.set(kvKey, newThread.id);
			}

			const referencedMessage = message.referenced_message;

			if (referencedMessage) {
				const repliedMessage = await api.channels.getMessage(
					message.channel_id,
					referencedMessage.id,
				);
				await ai.beta.threads.messages.create(threadId, {
					content: cleanContent(
						`${
							referencedMessage.author.id ===
									Deno.env.get("DISCORD_ID")
								? `@${Deno.env.get("ASSISTANT_NAME")}`
								: `${repliedMessage.author.id} | @${repliedMessage.author.username}#${repliedMessage.author.discriminator}`
						}: ${
							repliedMessage.content ??
								"[Tidak dapat membaca pesan ini]"
						}`,
					),
					role: "user",
				});
			}

			await ai.beta.threads.messages.create(threadId, {
				content: cleanContent(
					`${message.author.id} | @${message.author.username}#${message.author.discriminator}: ${message.content}`,
				),
				role: "user",
			});

			let run = await ai.beta.threads.runs.create(threadId, {
				assistant_id: Deno.env.get("ASSISTANT_ID")!,
			});

			while (["in_progress", "queued"].includes(run.status)) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				run = await ai.beta.threads.runs.retrieve(threadId, run.id);
			}
			isRunning = false;

			const messages = await ai.beta.threads.messages.list(threadId, {
				limit: 1,
			});
			const response = messages.data[0].content[0] as MessageContentText;

			await api.channels.createMessage(message.channel_id, {
				content: response.text.value,
				message_reference: { message_id: message.id },
			});
		}
	},
);

gateway.connect();
