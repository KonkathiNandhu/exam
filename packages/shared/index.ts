import { z } from "zod";
export const accessibleQuestionSchema = z
  .object({
    text: z.string().trim().min(5).max(24000),
    choices: z.array(z.string().trim().min(1).max(3000)).min(2).max(8),
  })
  .strict();
export type AccessibleQuestion = z.infer<typeof accessibleQuestionSchema>;
export const questionSchema = z
  .object({
    question: z.string().trim().min(5).max(6000),
    options: z.record(z.string().trim().min(1).max(3000)),
    number: z.string().max(30).optional(),
  })
  .superRefine((q, c) => {
    const keys = Object.keys(q.options);
    if (
      keys.length < 2 ||
      keys.length > 8 ||
      keys.some((k) => !/^([A-H]|[1-8])$/.test(k))
    )
      c.addIssue({ code: "custom", message: "Invalid or missing options" });
  });
export type Question = z.infer<typeof questionSchema> & { questionId: string };
export type Answer = {
  questionId: string;
  selectedOption: string | null;
  answer: string;
  explanation: string;
  status: "answered" | "uncertain";
};
export type State =
  | "IDLE"
  | "PAIRING"
  | "CONNECTED"
  | "CAPTURING"
  | "PROCESSING"
  | "DISCONNECTED"
  | "EXPIRED"
  | "ERROR";
export type Snapshot = {
  requestId?: string;
  pendingPair?: { id: string; code: string; expiresAt: number };
  state: State;
  expiresAt: number;
  mobileConnected: boolean;
  captureActive: boolean;
  question: Question | null;
  answer: Answer | null;
  history: { question: Question; answer: Answer }[];
  message: string;
};
