export function cleanContent(str: string): string {
	return str.replaceAll(
		`<@${Deno.env.get("DISCORD_ID")})>`,
		`@${Deno.env.get("ASSISTANT_NAME")}`,
	);
}
