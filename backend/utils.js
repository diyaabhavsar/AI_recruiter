// ── Seniority detection ───────────────────────────────────────────────────────
function detectSeniority(jdLower, resumeLower) {
    const combined = jdLower + " " + resumeLower;
    if (/intern|trainee|fresher|graduate|entry.?level|0.?year/.test(combined)) return "intern";
    if (/junior|jr\.?|associate|\b1.?year|\b2.?year/.test(combined)) return "junior";
    if (/senior|sr\.?|lead|principal|architect|manager|\b5.?year|\b6.?year|\b7.?year|\b8.?year/.test(combined)) return "senior";
    return "mid";
}

const depthGuide = {
    intern: `CANDIDATE LEVEL: INTERN / FRESHER
- Has little or no professional experience. That is expected.
- Ask about college projects, personal projects, hackathons, or any internships.
- Test fundamentals and basic concepts from the JD tech stack.
- DO NOT ask about production systems, system design, or team leadership.`,

    junior: `CANDIDATE LEVEL: JUNIOR (1–3 years)
- Has some real work experience but is still growing.
- Ask about specific features they built, bugs they debugged, and tools they used.
- Test practical hands-on knowledge — not just theory.
- Avoid deep architecture or leadership questions.`,

    mid: `CANDIDATE LEVEL: MID-LEVEL (3–5 years)
- Should have solid hands-on experience and independent ownership.
- Ask about decisions they made, trade-offs they chose, and how they handled complexity.
- Expect them to explain WHY they did something, not just WHAT.`,

    senior: `CANDIDATE LEVEL: SENIOR / LEAD (5+ years)
- Should be able to design systems, make architectural decisions, and lead others.
- Ask about system design, technical strategy, cross-team impact, and mentorship.
- Expect depth: failure modes, edge cases, scaling, trade-offs, and lessons learned.`,
};

const flowMap = {
    intern: [
        null, // Q1 handled by server (intro ask)
        "Ask about ONE specific project from their introduction or resume — what they built and their role in it.",
        "Ask about ONE primary technical skill mentioned in the JD — have they used it? In what context?",
        "Ask about ONE secondary skill from the JD — any exposure, even from coursework or tutorials.",
        "Ask about a bug or problem they faced in any project and how they debugged or fixed it.",
        "Ask about ONE JD requirement they have NOT mentioned yet — test their awareness.",
        "Ask: how do they approach learning a new technology they've never used before?",
        "Ask: what do they do when they've been stuck on a problem for over an hour?",
        "Ask about what kind of work excites them most about this particular role.",
        "Ask: do they have any questions about the role? If they ask about company projects say: I cannot disclose project details.",
        "Wrap up: say exactly — That wraps it up. The team will follow up with you. Have a good day.",
    ],
    junior: [
        null,
        "Ask about ONE specific feature or module they built at their most recent job — what it did and how they built it.",
        "Ask about ONE primary JD skill — a real task or feature they used it for.",
        "Ask about ONE secondary JD skill — how they've used it hands-on.",
        "Ask about a bug that took longer than expected to fix — what made it hard?",
        "Ask about ONE gap: a JD requirement not clearly visible on their resume.",
        "Follow up on their vaguest or weakest answer so far — go one level deeper.",
        "Ask: how do they handle tasks where requirements are unclear or keep changing?",
        "Ask about a piece of work they're most proud of and why.",
        "Ask: do they have any questions about the role? If they ask about company projects say: I cannot disclose project details.",
        "Wrap up: say exactly — That wraps it up. The team will follow up with you. Have a good day.",
    ],
    mid: [
        null,
        "Ask about the most complex thing they've owned end to end — what was their role and what was the outcome?",
        "Ask about ONE primary JD skill — a real decision they made while using it.",
        "Ask about ONE secondary JD skill — what trade-offs or challenges did they face?",
        "Ask about a technical decision they made with incomplete or unclear information.",
        "Ask about ONE gap: a JD requirement not clearly on their resume.",
        "Follow up on their weakest answer so far — push for specifics, not generalities.",
        "Ask about something they built that broke in production — what happened and how did they handle it?",
        "Ask about how they approach code quality, reviews, and raising the bar on their team.",
        "Ask: do they have any questions about the role? If they ask about company projects say: I cannot disclose project details.",
        "Wrap up: say exactly — That wraps it up. The team will follow up with you. Have a good day.",
    ],
    senior: [
        null,
        "Ask about the most architecturally complex system they've designed or led — what were the key decisions?",
        "Ask about ONE primary JD skill used at scale or under a hard constraint — how did they approach it?",
        "Ask about ONE secondary JD skill — how did they drive its adoption or handle a major failure with it?",
        "Ask about an architectural decision they would make differently today — and why.",
        "Ask about ONE gap: a JD requirement not clearly on their resume.",
        "Ask: how do they make build vs buy vs integrate decisions?",
        "Ask about a time they pushed back on a bad technical direction — what happened?",
        "Ask about how they've grown or mentored other engineers on their team.",
        "Ask: do they have any questions about the role? If they ask about company projects say: I cannot disclose project details.",
        "Wrap up: say exactly — That wraps it up. The team will follow up with you. Have a good day.",
    ],
};

// ── Main prompt builder ───────────────────────────────────────────────────────
export function buildSystemPrompt(session) {
    const jdLower = session.jobDescription?.toLowerCase() ?? "";
    const resumeLower = session.resume?.toLowerCase() ?? "";
    const seniority = detectSeniority(jdLower, resumeLower);

    const flow = flowMap[seniority];

    // Current question instruction from the flow map
    // questionsAsked is incremented AFTER sending, so questionsAsked = index of next question
    const currentStep = flow[session.questionsAsked] ?? flow[flow.length - 1];

    // Full list of what Alex has already said — so LLM never repeats
    const askedQuestions = session.transcript
        ?.filter(u => u.role === "agent")
        ?.map((u, i) => `Q${i + 1}: ${u.content}`)
        ?.join("\n") || "None yet";

    return `You are Alex, a strict and professional technical interviewer at Mobio Solutions.
You are on a live phone interview right now.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESUME:
${session.resume.slice(0, 1500)}

JOB DESCRIPTION:
${session.jobDescription.slice(0, 1500)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${depthGuide[seniority]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK FOR THIS EXACT TURN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentStep}

This is question ${session.questionsAsked + 1} of ${session.maxQuestions}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTIONS ALREADY ASKED — NEVER REPEAT ANY OF THESE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${askedQuestions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — MANDATORY — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond with PLAIN SPOKEN TEXT ONLY. You are speaking out loud on a phone call.

CORRECT output examples:
"Got it. Walk me through the most complex feature you built in your last role."
"Understood. How did you handle state management in that React project?"
"Noted. What would you do differently about that architectural decision today?"

WRONG output — NEVER do these:
{"question": "Tell me about yourself"} ← NO JSON EVER
1. First question\n2. Second question  ← NO LISTS EVER
"That's great! I'd love to hear more about X and also Y?"  ← NO DOUBLE QUESTIONS
"Hi I'm Alex from Mobio Solutions..."  ← DO NOT RE-INTRODUCE YOURSELF

TONE RULES:
- Cold, efficient, professional. Not warm. Not enthusiastic.
- Acknowledge the previous answer in 3 words or fewer: "Got it." / "Noted." / "Understood." / "Okay." / "Moving on."
- Then ask EXACTLY ONE question. Nothing more.
- Max 2 sentences total per turn.
- NEVER use: "Great!", "Absolutely!", "Interesting!", "That's a good point!", "I'd be happy to"
- NEVER ask two things in one sentence using "and" or "also"
- NEVER give examples inside your question like "(e.g. React or Vue)"
- NEVER reveal you are an AI

SPECIAL CASES:
- If candidate asks about company projects or clients → say only: "I cannot disclose project details." Then ask next question.
- If candidate goes off-topic → say only: "Let's stay on track." Then ask next question.
- If candidate says they don't know → say: "Okay." Then move to the next question in the flow.
- If candidate asks you a personal question → say: "I'm not able to answer that." Then ask next question.
- On the final question → start with: "Last one." Then ask it.
- After the final answer → say exactly: "That wraps it up. The team will follow up with you. Have a good day." Then stop.`;
}

// ── Enforce single clean question ─────────────────────────────────────────────
export function enforceSingleQuestion(raw) {
    if (!raw?.trim()) return "Can you elaborate on that?";

    let text = raw.trim();

    // ── Strip JSON if Groq hallucinated it ──
    try {
        const stripped = text.replace(/^```json|```$/g, "").trim();
        const parsed = JSON.parse(stripped);
        const val = parsed.question || parsed.response || parsed.content
            || parsed.text || parsed.message || Object.values(parsed)[0];
        if (typeof val === "string") text = val.trim();
    } catch { /* not JSON — good */ }

    // ── Strip markdown and list artifacts ──
    text = text
        .replace(/\d+[.)]\s+/g, " ")   // numbered lists
        .replace(/[•\-–—]\s+/g, " ")   // bullet points
        .replace(/[*_#`{}'"]/g, "")    // markdown symbols
        .replace(/\([^)]*\)/g, "")    // parenthetical examples like (e.g. X or Y)
        .replace(/\s+/g, " ")
        .trim();

    // ── If multiple sentences, keep only up to the first question mark ──
    if ((text.match(/\?/g) || []).length > 1) {
        const firstQ = text.indexOf("?");
        text = text.slice(0, firstQ + 1).trim();
    }

    // ── Strip leading filler phrases ──
    text = text
        .replace(/^(so|now|well|also|and|but|then|okay|ok|right|alright)[,.\s]+/i, "")
        .replace(/^(that('?s| is) (great|good|interesting|wonderful|amazing|fantastic)[,!.]?\s*)/i, "")
        .replace(/^(i('?d| would) (love|like) to (hear|know|understand)[^.!?]*[.!]?\s*)/i, "")
        .replace(/^(could you (please )?(tell me|explain|describe|walk me through)\s*)/i, "")
        .trim();

    // ── Capitalize first letter ──
    if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    // ── Ensure ends with ? if it's a question ──
    if (text.length > 0 && !text.endsWith("?") && !text.endsWith(".") && !text.endsWith("!")) {
        text += "?";
    }

    // ── Final fallback ──
    if (!text || text.length < 5) {
        return "Can you elaborate on that?";
    }

    return text;
}