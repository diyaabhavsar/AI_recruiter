import Groq from "groq-sdk";
import { groq } from "./services/clients.js";

// ── Seniority detection ───────────────────────────────────────────────────────
function detectSeniority(jdLower, resumeLower) {
    const combined = jdLower + " " + resumeLower;
    if (/\b(intern|trainee|fresher|graduate|entry.?level|0.?year)\b/.test(combined)) return "intern";
    if (/\b(junior|jr\.?|associate|\b1.?year|\b2.?year)\b/.test(combined)) return "junior";
    if (/\b(senior|sr\.?|lead|principal|architect|manager|\b[5-9].?year|\d{2,}.?year)\b/.test(combined)) return "senior";
    return "mid";
}

// ── Depth guides ──────────────────────────────────────────────────────────────
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

// ── Flow maps (12 real questions + 1 wrap-up = 13 items) ─────────────────────
const flowMap = {
    intern: [
        "Ask about ONE specific project from their introduction — what they built, their exact role, and the outcome. Reference something they just said in their intro.",
        "Ask about ONE primary technical skill from the JD — have they used it? In what specific context or project?",
        "Ask about ONE secondary skill from the JD — any hands-on exposure, even from coursework or tutorials.",
        "Ask about a specific bug or technical problem they faced in any project — what caused it and how did they debug it?",
        "Follow up on their vaguest or shortest answer so far — ask them to go one level deeper with specifics.",
        "Ask about a third skill or tool mentioned in the JD — have they used it? Even briefly?",
        "Ask: when they encounter a technology they have never used before, how do they go about learning it?",
        "Ask: what do they do when they have been stuck on a problem for over an hour and cannot figure it out?",
        "Ask about ONE requirement in the JD that the candidate has NOT mentioned yet — test whether they are aware of it.",
        "Ask what specifically about this role or the work it involves excites them the most.",
        "Ask about a second project from their resume — what was their contribution and what did they learn from it?",
        "Ask: do they have any questions about the role, the team, or the work? If they ask about company projects say: I cannot disclose project details.",
    ],
    junior: [
        "Ask about ONE specific feature or module they mentioned in their introduction — what it did, how they built it, and what the outcome was.",
        "Ask about ONE primary JD skill — a real task or feature they used it for at work.",
        "Ask about ONE secondary JD skill — how they have used it hands-on, even in a small way.",
        "Ask about a bug that took longer than expected to fix — what made it hard and what was the fix?",
        "Follow up on their vaguest or weakest answer so far — push for one more level of detail.",
        "Ask about ONE JD requirement not clearly on their resume — have they encountered it at all?",
        "Ask: how do they handle a task when the requirements keep changing or are never fully clear?",
        "Ask about something they built at work that they are most proud of — why that one specifically?",
        "Ask about a time something they shipped caused an unexpected issue — how did they handle it?",
        "Ask: when they review someone else code or get their own code reviewed, what do they focus on?",
        "Ask about the most complex end-to-end flow they have owned in any of their projects.",
        "Ask: do they have any questions about the role or the team? If they ask about company projects say: I cannot disclose project details.",
    ],
    mid: [
        "Ask about the most complex thing they mentioned in their introduction — what was their role, the decisions they made, and the outcome?",
        "Ask about ONE primary JD skill — a real decision they made while using it and why they made that call.",
        "Ask about ONE secondary JD skill — what trade-offs or problems did they face while using it?",
        "Ask about a technical decision they made with incomplete or unclear information — how did they decide?",
        "Follow up on their weakest or most vague answer so far — push for specifics not generalities.",
        "Ask about ONE JD requirement that is not clearly visible on their resume — what is their exposure to it?",
        "Ask about something they built that broke in production — what happened, how did they find out, and what did they do?",
        "Ask about how they approach code quality, pull request reviews, and keeping standards high on their team.",
        "Ask about a time they disagreed with a technical decision on their team — how did they handle it?",
        "Ask about how they balance speed of delivery versus quality when under deadline pressure.",
        "Ask about the most impactful technical improvement they made in any project — what was the before and after?",
        "Ask: do they have any questions about the role or the team? If they ask about company projects say: I cannot disclose project details.",
    ],
    senior: [
        "Ask about the most architecturally complex system they mentioned in their introduction — what were the key decisions and why?",
        "Ask about ONE primary JD skill used at scale or under a hard constraint — what was the approach and what did not work?",
        "Ask about ONE secondary JD skill — how did they drive its adoption or handle a major failure involving it?",
        "Ask about an architectural decision they would make differently today — and specifically why.",
        "Ask about ONE gap: a JD requirement not clearly on their resume — what is their depth there?",
        "Ask: how do they make build vs buy vs integrate decisions when evaluating a new technical need?",
        "Ask about a time they pushed back on a bad technical direction from above — what happened?",
        "Ask about how they have grown or mentored other engineers — specific examples of impact.",
        "Ask about a system or service they owned that had a serious incident — how did they respond and what changed after?",
        "Ask about how they approach technical debt — how do they decide what to address and when?",
        "Ask about a time they had to bring multiple teams or stakeholders to agreement on a technical direction.",
        "Ask: do they have any questions about the role or the team? If they ask about company projects say: I cannot disclose project details.",
    ],
};

// ── Main prompt builder ───────────────────────────────────────────────────────
export function buildSystemPrompt(session, fullTranscript = []) {
    const jdLower = session.jobDescription?.toLowerCase() ?? "";
    const resumeLower = session.resume?.toLowerCase() ?? "";
    const seniority = detectSeniority(jdLower, resumeLower);

    const flow = flowMap[seniority];
    // questionsAsked is CLEAN — only real LLM questions increment it
    // stepIndex maps directly to flow array
    const stepIndex = Math.min(session.questionsAsked, flow.length - 1);
    const currentStep = flow[stepIndex];

    // Candidate intro — use the validated intro saved in session
    const candidateIntro = session.candidateIntro
        ? `"${session.candidateIntro.slice(0, 400)}"`
        : "(Candidate has not introduced themselves yet)";

    const candidateUtterances = fullTranscript.filter(u => u.role === "user");
    const lastAnswer = candidateUtterances.length > 0
        ? candidateUtterances[candidateUtterances.length - 1].content
        : "(No answer yet)";
    const lastAnswerIsGarbage = !isValidAnswer(lastAnswer);

    // ── PHASE 1: First question — intro only, NO resume/JD ───────────────────
    // This prevents Claude from referencing the resume before the intro phase
    if (session.questionsAsked === 0) {
        return `You are Alex, a strict technical interviewer conducting a live phone interview.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL CONTEXT — READ THIS FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The call is already in progress. You have already greeted the candidate and asked them to introduce themselves.
The candidate has just finished their introduction — it is shown below.
Your ONLY job is to ask ONE question based SOLELY on what the candidate said in their introduction.

STRICT OPENING RULES — NO EXCEPTIONS:
- Do NOT say hello, hi, hey, greetings, or any welcome phrase.
- Do NOT re-introduce yourself or mention Mobio Solutions.
- Do NOT say "Thanks for that" or any pleasantry.
- Begin with a max 3-word cold transition OR go straight into the question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE INTRODUCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${candidateIntro}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK — QUESTION 1 of 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentStep}

GROUNDING — MANDATORY:
- Your question MUST reference something specific the candidate mentioned in their introduction above.
- Do NOT reference any resume, job description, or external information — you have not seen those yet.
- Pick one specific project, role, technology, or experience they mentioned and dig into it.
${lastAnswerIsGarbage ? `
GARBAGE INPUT: The last utterance was filler or inaudible.
DO NOT acknowledge it. Ask the first question grounded in the candidate intro above.` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAIN SPOKEN TEXT ONLY. You are on a phone call.
No JSON. No markdown. No lists. No numbering. No asterisks.
Maximum 2 sentences. One short transition + one question.

TONE:
- Cold, efficient, professional. Not warm. Not friendly.
- NEVER start with a greeting word of any kind. Ever.
- Allowed transitions: "Got it." / "Noted." / "Okay." / "Understood."
- NEVER: "Great!", "Absolutely!", "Interesting!", "That is a good point!"
- NEVER ask two things in one turn
- NEVER give examples like "(e.g. React or Vue)"
- NEVER reveal you are an AI

WRONG — NEVER do these:
"Hi I am Alex..." — ABSOLUTELY FORBIDDEN
"I see your resume mentions..." — NO resume yet. Only use their intro.
{"question": "..."} — NO JSON`;
    }

    // ── PHASE 2: Q2+ — full context with resume + JD ─────────────────────────
    // Only agent turns that are real questions (not greeting/intro/re-ask)
    // skip: greeting+intro (1 turn) + optional re-ask (1 turn)
    const introTurnsToSkip = session.introReAsked ? 3 : 2;
    const agentTurns = fullTranscript
        .filter(u => u.role === "agent")
        .slice(introTurnsToSkip)
        .map((u, i) => `Q${i + 1}: ${u.content}`)
        .join("\n") || "None yet";

    // Only valid candidate answers — no filler
    const validAnswers = candidateUtterances
        .filter(u => isValidAnswer(u.content))
        .slice(-6)
        .map((u, i) => `- Answer ${i + 1}: "${u.content.slice(0, 250)}"`)
        .join("\n") || "- No substantive answers yet";

    return `You are Alex, a strict technical interviewer at Mobio Solutions conducting a live phone interview.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL CONTEXT — READ THIS FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The call is already in progress. You have already greeted the candidate.
The candidate has already introduced themselves — their intro is shown below.
Your ONLY job right now is to ask the next interview question from the flow.

STRICT OPENING RULES — NO EXCEPTIONS:
- Do NOT say hello, hi, hey, greetings, or any welcome phrase.
- Do NOT re-introduce yourself as Alex or mention Mobio Solutions again.
- Do NOT say "Welcome", "Thanks for joining", or any pleasantry.
- Do NOT acknowledge the start of the call in any way.
- Begin with a max 3-word cold transition ("Got it." / "Noted." / "Okay.") OR go straight into the question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTI-HALLUCINATION RULES — HIGHEST PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ONLY reference facts from RESUME, JOB DESCRIPTION, CANDIDATE INTRO, or ANSWERS below.
- NEVER invent, assume, or fabricate anything the candidate said, did, or claimed.
- NEVER reference a technology, project, or experience NOT in their transcript or resume.
- If unsure about something, ask the candidate directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESUME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${session.resume.slice(0, 1500)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JOB DESCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${session.jobDescription.slice(0, 1500)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE INTRODUCTION (use this as context for all questions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${candidateIntro}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT THE CANDIDATE HAS SAID IN THIS INTERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${validAnswers}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE'S MOST RECENT UTTERANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"${lastAnswer}"
${lastAnswerIsGarbage ? `
GARBAGE INPUT: The above is filler or not a real answer.
DO NOT acknowledge it. Do NOT say "You mentioned Hello" or similar.
Ask the next question from the flow directly — no transition needed.` : ""}

${depthGuide[seniority]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK FOR THIS EXACT TURN (question ${session.questionsAsked + 1} of 12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentStep}

QUESTION GROUNDING — MANDATORY:
${lastAnswerIsGarbage ? `
- Skip transition. Ask the next flow question grounded in resume or JD.` : `
- MUST reference either their last answer, a specific resume item, or a specific JD requirement.
- If last answer was vague, probe DEEPER on the same topic — do NOT move on yet.
- Only advance to the next flow item after a substantive answer.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTIONS ALREADY ASKED — NEVER REPEAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${agentTurns}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAIN SPOKEN TEXT ONLY. You are on a phone call.
No JSON. No markdown. No lists. No numbering. No asterisks.
Maximum 2 sentences. One short transition + one question.

CORRECT examples:
"You mentioned working on a CPA dashboard chatbot. What was the most difficult part of building the retrieval pipeline for it?"
"Your resume lists LangChain. How did you handle context window limits in your RAG implementation?"
"The JD mentions vector databases. Which ones have you worked with and in what context?"

WRONG — NEVER do these:
{"question": "..."} — NO JSON
"That is interesting! And also tell me about..." — NO ENTHUSIASM, NO DOUBLE QUESTIONS
"You mentioned Hello?" — NEVER reference garbage input
"Hi I am Alex from Mobio..." — ABSOLUTELY FORBIDDEN — no greeting of any kind
"Hello again!" / "Hi there!" / "Welcome!" — ALL FORBIDDEN — call already started
"I see your resume mentions..." — DO NOT say "I see" — just ask the question
"Can you tell me about..." / "Could you walk me through..." — DO NOT use these openers

TONE:
- Cold, efficient, professional. Not warm. Not friendly. Not enthusiastic.
- NEVER start with a greeting word of any kind. Ever.
- Max 3-word cold transition OR go straight to the question — nothing else before it.
- Allowed transitions: "Got it." / "Noted." / "Okay." / "Understood." / "Fair enough."
- NEVER: "Great!", "Absolutely!", "Interesting!", "That is a good point!", "Sure!"
- NEVER ask two things in one turn
- NEVER give examples like "(e.g. React or Vue)"
- NEVER reveal you are an AI
- NEVER explain what you are about to ask — just ask it

SPECIAL CASES:
- Candidate asks for help / hints / explanations → say only: "Let us stay on track." Then next question. DO NOT provide any hint, answer, or explanation.
- Candidate asks about company projects/clients → say only: "I cannot disclose project details." Then next question.
- Candidate goes off-topic → say only: "Let us stay on track." Then next question.
- Candidate says they do not know → say only: "Okay." Then move to next flow question. DO NOT explain or hint.
- Candidate asks a personal question about you → "I am not able to answer that." Then next question.
- Candidate asks you to repeat or rephrase → repeat the exact same question once, no changes.
- Question 12 (final) → start with: "Last one." Then ask it.`;
}

// ── Filter filler / garbage utterances ───────────────────────────────────────
export function isValidAnswer(text) {
    if (!text?.trim()) return false;
    const cleaned = text.trim().toLowerCase();
    if (cleaned.split(/\s+/).length < 4) return false;

    const fillerPatterns = [
        /^(hello+[\.\?\s]*)+$/i,
        /^(hi+[\.\?\s]*)+$/i,
        /^are you there[\?\.]?$/i,
        /^can you hear me[\?\.]?$/i,
        /^(hello\s*)+(are you there|can you hear)[\?\.]?$/i,
        /^\(inaudible.*\)$/i,
        /^\(.*\)$/i,
        /^yeah[\.\?]?\s*$/i,
        /^okay[\.\?]?\s*$/i,
        /^yes[\.\?]?\s*$/i,
        /^no[\.\?]?\s*$/i,
        /^(hello|hi|hey)\s*(there|love|sir|ma'?a?m)?\s*[\.\?]?$/i,
        /^could you (please )?ask me (a |the )?(next )?question[\?\.]?$/i,
        /^(please )?(ask me|next question|move on)[\?\.]?$/i,
        /^some\s+write[\?\.]?$/i,
        /^(hello[\?\.\s]*){2,}$/i,
        /^(hi[\?\.\s]*){2,}$/i,
    ];

    return !fillerPatterns.some(p => p.test(cleaned));
}

// ── Enforce single clean question ─────────────────────────────────────────────
export function enforceSingleQuestion(raw) {
    if (!raw?.trim()) return "Can you elaborate on that?";
    let text = raw.trim();

    try {
        const stripped = text.replace(/^```json|```$/g, "").trim();
        const parsed = JSON.parse(stripped);
        const val = parsed.question || parsed.response || parsed.content
            || parsed.text || parsed.message || Object.values(parsed)[0];
        if (typeof val === "string") text = val.trim();
    } catch { }

    text = text
        .replace(/\d+[.)]\s+/g, " ")
        .replace(/[•\-–—]\s+/g, " ")
        .replace(/[*_#`{}']/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if ((text.match(/\?/g) || []).length > 1) {
        text = text.slice(0, text.indexOf("?") + 1).trim();
    }

    text = text
        .replace(/^(so|now|well|also|and|but|then|okay|ok|right|alright)[,.\s]+/i, "")
        .replace(/^(that('?s| is) (great|good|interesting|wonderful|amazing|fantastic)[,!.]?\s*)/i, "")
        .replace(/^(i('?d| would) (love|like) to (hear|know|understand)[^.!?]*[.!]?\s*)/i, "")
        .replace(/^(could you (please )?(tell me|explain|describe|walk me through)\s*)/i, "")
        .replace(/^(i see (your resume|that you|you have)[^.!?]*[.!?]?\s*)/i, "")
        .trim();

    if (text.length > 0) text = text.charAt(0).toUpperCase() + text.slice(1);
    if (text.length > 0 && !text.endsWith("?") && !text.endsWith(".") && !text.endsWith("!")) text += "?";

    // Safety: strip any wrap-up / closing phrases the LLM might add after the question
    text = text
        .replace(/[.!]?\s*(that wraps (it|this) up|have a good day|good luck|thank you for your time|thanks for your time|take care|goodbye|best of luck)[^.!?]*[.!]?/gi, "")
        .replace(/[.!]?\s*(the team will follow up|we will be in touch|someone will reach out)[^.!?]*[.!]?/gi, "")
        .trim();

    if (text.length > 0 && !text.endsWith("?") && !text.endsWith(".") && !text.endsWith("!")) text += "?";

    return text || "Can you elaborate on that?";
}

// ── Strip JSON wrapper ────────────────────────────────────────────────────────
export function extractPlainText(raw) {
    if (!raw?.trim()) return "";
    let text = raw.trim();

    try {
        const stripped = text.replace(/^```json|```$/g, "").trim();
        const parsed = JSON.parse(stripped);
        const val = parsed.question || parsed.response || parsed.content
            || parsed.text || parsed.message || Object.values(parsed)[0];
        if (typeof val === "string") text = val.trim();
    } catch { }

    text = text
        .replace(/^\{.*?"[^"]*":\s*"/s, "")
        .replace(/"\s*\}$/s, "")
        .replace(/^["']|["']$/g, "")
        .trim();

    return text;
}

// ── String similarity — Jaccard on words ─────────────────────────────────────
function stringSimilarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 1 : intersection / union;
}

// ── Merge Retell transcript ───────────────────────────────────────────────────
export function mergeTranscript(full, incoming) {
    for (const utterance of incoming) {
        upsertTranscriptUtterance(full, utterance);
    }
}

export function upsertTranscriptUtterance(full, utterance) {
    const content = utterance.content?.trim();
    if (!content) return;

    const role = utterance.role;
    const normalized = { role, content };

    let lastSameRoleIdx = -1;
    for (let i = full.length - 1; i >= 0; i--) {
        if (full[i].role === role) { lastSameRoleIdx = i; break; }
    }

    if (lastSameRoleIdx === -1) { full.push(normalized); return; }

    const existing = full[lastSameRoleIdx];
    const existingContent = existing.content.trim();

    if (content === existingContent) return;
    if (content.startsWith(existingContent)) { existing.content = content; return; }
    if (existingContent.startsWith(content)) { existing.content = content; return; }

    const similarity = stringSimilarity(existingContent, content);
    if (similarity > 0.7) {
        existing.content = content.length >= existingContent.length ? content : existingContent;
        return;
    }

    const hasAgentTurnBetween = full.slice(lastSameRoleIdx + 1).some(u => u.role === "agent");
    if (hasAgentTurnBetween) {
        full.push(normalized);
    } else {
        existing.content = content.length >= existingContent.length ? content : existingContent;
    }
}

// ── Score answer async (non-blocking) ────────────────────────────────────────
export async function scoreAnswer(session, question, answer) {
    try {
        const groqClient = session.groqKey ? new Groq({ apiKey: session.groqKey }) : groq;

        const res = await groqClient.chat.completions.create({
            model: "llama-3.1-8b-instant",
            max_tokens: 250,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [{
                role: "user",
                content: `Evaluate this interview answer strictly. Respond ONLY with JSON.
QUESTION: ${question}
CANDIDATE ANSWER: ${answer}
{
  "score": <0-10>,
  "quality": "<poor|fair|good|excellent>",
  "reasoning": "<one sentence why>",
  "idealModel": "<what a great answer would include>",
  "coaching": "<one tip for the candidate>"
}`,
            }],
        });

        const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
        session.answerScores.push({ ...parsed, question, answer });

        if (parsed.score >= 8) session.difficulty = Math.min(3, session.difficulty + 1);
        else if (parsed.score <= 3) session.difficulty = Math.max(1, session.difficulty - 1);

        console.log(`📊 Score: ${parsed.score}/10 (${parsed.quality}) | difficulty → ${session.difficulty}`);
    } catch (e) {
        console.warn("Scoring failed (non-fatal):", e.message);
    }
}