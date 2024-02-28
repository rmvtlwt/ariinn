import { REST } from "@discordjs/rest";
import {
	Client,
	GatewayDispatchEvents,
	GatewayIntentBits,
} from "@discordjs/core";
import { WebSocketManager } from "npm:@discordjs/ws";

import { OpenAI } from "openai/mod.ts";
import { MessageContentText } from "openai/resources/beta/threads/messages/mod.ts";

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

client.on(
	GatewayDispatchEvents.MessageCreate,
	async ({ api, data: message }) => {
		if (
			!message.author.bot &&
			message.channel_id === Deno.env.get("DISCORD_CHAT_CHANNEL") &&
			message.content
		) {
			await api.channels.showTyping(message.channel_id);
			const kvKey = ["threads", message.channel_id];
			let threadId = (await kv.get<string>(kvKey)).value;

			if (!threadId) {
				const newThread = await ai.beta.threads.create();
				threadId = newThread.id;
				await kv.set(kvKey, newThread.id);
			}

			await ai.beta.threads.messages.create(threadId, {
				content: message.content,
				role: "user",
				metadata: { username: message.author.username },
			});

			let run = await ai.beta.threads.runs.create(threadId, {
				assistant_id: Deno.env.get("ASSISTANT_ID")!,
			});

			while (run.status != "completed") {
				run = await ai.beta.threads.runs.retrieve(threadId, run.id);
			}

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
