import availableTools from "./tools/mod.ts";

import { REST } from "@discordjs/rest";
import {
	Client,
	GatewayDispatchEvents,
	GatewayIntentBits,
} from "@discordjs/core";
import { WebSocketManager } from "@discordjs/ws";

import { OpenAI } from "openai/mod.ts";
import type { MessageContentText } from "openai/resources/beta/threads/messages/mod.ts";
import { RunSubmitToolOutputsParams } from "openai/resources/beta/threads/runs/runs.ts";

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
					content:
						`${repliedMessage.author.id} | @${repliedMessage.author.username}#${repliedMessage.author.discriminator}: ${
							repliedMessage.content ??
								"[Tidak dapat membaca pesan ini]"
						}`,
					role: "user",
				});
			}

			await ai.beta.threads.messages.create(threadId, {
				content:
					`${message.author.id} | @${message.author.username}#${message.author.discriminator}: ${message.content}`,
				role: "user",
			});

			console.log("request ke openai");
			let run = await ai.beta.threads.runs.create(threadId, {
				assistant_id: Deno.env.get("ASSISTANT_ID")!,
				tools: Object.values(availableTools).map((tool) => tool.data),
			}, {
				timeout: 30_000,
			});
			console.log(run);

			while (
				["in_progress", "pending", "requires_action", "queued"]
					.includes(
						run.status,
					)
			) {
				console.log(run.status);
				if (run.status === "requires_action") {
					const toolOutputs: RunSubmitToolOutputsParams.ToolOutput[] =
						[];
					for (
						const toolCall of run.required_action!
							.submit_tool_outputs
							.tool_calls
					) {
						const tool = availableTools[toolCall.function.name];
						const args = JSON.parse(toolCall.function.arguments);

						console.log(args);

						const result = await tool.fn(api, message, args);
						toolOutputs.push({
							output: result,
							tool_call_id: toolCall.id,
						});
					}

					await ai.beta.threads.runs.submitToolOutputs(
						threadId,
						run.id,
						{ tool_outputs: toolOutputs },
					);
				}
				run = await ai.beta.threads.runs.retrieve(threadId, run.id);
			}

			isRunning = false;

			console.log("hasil", run.status);
			if (run.status !== "completed") return;

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
