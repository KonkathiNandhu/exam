import { useEffect, useState } from "react";
import { questions } from "./questions";
export default function Practice() {
  useEffect(() => {
    (navigator.mediaDevices as any).setCaptureHandleConfig?.({
      exposeOrigin: true,
      handle: "authorized-practice",
      permittedOrigins: [location.origin],
    });
  }, []);
  const [i, next] = useState(0);
  const [dark, theme] = useState(false);
  const [numeric, labels] = useState(false);
  const q = questions[i];
  return (
    <main className={"practice " + (dark ? "dark" : "")}>
      <p className="eyebrow">
        AUTHORIZED PRACTICE ASSESSMENT · {questions.length} QUESTIONS
      </p>
      <h1>Training knowledge check</h1>
      <section className="card">
        <p>
          Question {q.number} of {questions.length}
        </p>
        <h2>{q.question}</h2>
        {Object.entries(q.options).map(([k, v], index) => (
          <div className="option" key={k}>
            {numeric ? index + 1 : k}) {v}
          </div>
        ))}
      </section>
      <div className="actions">
        <button disabled={!i} onClick={() => next(i - 1)}>
          Previous
        </button>
        <button onClick={() => next((i + 1) % questions.length)}>
          Next question
        </button>
        <button onClick={() => theme(!dark)}>Toggle theme</button>
        <button onClick={() => labels(!numeric)}>Toggle numeric labels</button>
      </div>
      <p>
        Practice content only. Start screen sharing from the desktop assistant
        to test extraction.
      </p>
    </main>
  );
}
