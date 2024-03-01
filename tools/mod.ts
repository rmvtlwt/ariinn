import { RunCreateParams } from "openai/resources/beta/threads/runs/runs.ts";
import * as setSlowmode from "./set_slowmode.ts";

export default {
	set_slowmode: setSlowmode,
} as Record<
	string,
	{ data: Tools; fn(...args: unknown[]): string | Promise<string> }
>;

type Tools =
	| RunCreateParams.AssistantToolsCode
	| RunCreateParams.AssistantToolsFunction
	| RunCreateParams.AssistantToolsRetrieval;
