import Retell from "retell-sdk";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";

export const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
