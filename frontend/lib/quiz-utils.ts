import type { QuestionInput, QuizQuestion } from "@/lib/types";

let counter = 0;
/** Local-only id for a not-yet-saved question/option, used as a React key
 * and discarded on save — the backend assigns its own real ids. */
export function tempId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** trigger_time_sec stays null here even for a WATCH module's question —
 * the module editor sets it explicitly once the admin picks a timestamp;
 * leaving it null by default also means a question created but not yet
 * placed on the timeline fails the backend's required-for-WATCH check
 * loudly, rather than silently landing at 0s. */
export function newQuestion(type: QuizQuestion["type"] = "mcq"): QuizQuestion {
  if (type === "true_false") {
    return {
      id: tempId("q"), type, text: "New question", image_key: null, image_url: null,
      options: [
        { id: tempId("opt"), text: "True", image_key: null, image_url: null },
        { id: tempId("opt"), text: "False", image_key: null, image_url: null },
      ],
      correct_option_id: null, accepted_answers: [],
      trigger_time_sec: null, timer_seconds: null, points: 1,
    };
  }
  if (type === "short_answer") {
    return {
      id: tempId("q"), type, text: "New question", image_key: null, image_url: null,
      options: [], correct_option_id: null, accepted_answers: [""],
      trigger_time_sec: null, timer_seconds: null, points: 1,
    };
  }
  return {
    id: tempId("q"), type, text: "New question", image_key: null, image_url: null,
    options: [
      { id: tempId("opt"), text: "Option A", image_key: null, image_url: null },
      { id: tempId("opt"), text: "Option B", image_key: null, image_url: null },
    ],
    correct_option_id: null, accepted_answers: [],
    trigger_time_sec: null, timer_seconds: null, points: 1,
  };
}

/** Converts the authoring/display shape (QuizQuestion, as GET returns it)
 * into what PATCH .../modules/{id} and POST .../questions actually accept
 * (QuestionIn) — drops the server-assigned id and the presigned (expiring)
 * image_url fields, keeping only the permanent image_key references. */
export function toQuestionInput(q: QuizQuestion): QuestionInput {
  return {
    type: q.type,
    text: (q.text ?? "").trim() ? q.text : null,
    image_key: q.image_key ?? null,
    options: q.options.map((o) => ({
      id: o.id, text: (o.text ?? "").trim() ? o.text : null, image_key: o.image_key ?? null,
    })),
    correct_option_id: q.correct_option_id,
    accepted_answers: q.accepted_answers.filter((a) => a.trim()),
    trigger_time_sec: q.trigger_time_sec,
    timer_seconds: q.timer_seconds,
    points: q.points,
  };
}
