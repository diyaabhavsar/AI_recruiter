import Retell from "retell-sdk";

const retell = new Retell({ apiKey: "key_29446043338d01d19290f7aadbda" });
const LLM_ID = "llm_2e689659c8a04ddbbe9052c3d4a8";
const GREETING = "Hi there! I'm Alex from Mobio Solutions. Thanks for joining today's interview. Could you start by introducing yourself?";

const result = await retell.llm.update(LLM_ID, {
    begin_message: GREETING
});

console.log("✅ LLM updated!");
console.log("   begin_message:", result.begin_message);
