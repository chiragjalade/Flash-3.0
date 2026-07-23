import { useEffect, useRef, useState } from "react";
import { icons } from "../icons";
import ResearchDesk from "./ResearchDesk";
import "./ChatPanel.css";

export default function ChatPanel() {
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [deskUp, setDeskUp] = useState(false);
  const [bounce, setBounce] = useState(false); // transient landing-bounce class
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const deskScrollRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0); // throttle toggles during the transition
  const firstRun = useRef(true);

  // Play the settle/stretch bounce whenever the desk rises or lowers.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setBounce(true);
    const t = window.setTimeout(() => setBounce(false), 900);
    return () => clearTimeout(t);
  }, [deskUp]);

  // Grow the prompt field vertically as the user types (wrap, no h-scroll).
  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Scrolling is a second way to bring the desk up / back down.
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now < lockUntil.current) return;

    if (!deskUp) {
      if (e.deltaY > 12) {
        setDeskUp(true);
        lockUntil.current = now + 900;
      }
      return;
    }

    // Desk is up: let it scroll internally; collapse only when scrolling
    // up while already at the top.
    const el = deskScrollRef.current;
    if (e.deltaY < -12 && (!el || el.scrollTop <= 0)) {
      setDeskUp(false);
      lockUntil.current = now + 900;
    }
  };

  return (
    <section className="chat">
      <div className="chat__tabs">
        <button
          type="button"
          className={`chat__tab${activeTab === "chat" ? " chat__tab--active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={`chat__tab${activeTab === "history" ? " chat__tab--active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      <div
        className={`chat__stage${deskUp ? " chat__stage--up" : ""}${bounce ? " chat__stage--bounce" : ""}`}
        onWheel={onWheel}
      >
        {/* Hero: headline + prompt + tagline (slides up & out when desk is raised) */}
        <div className="chat__hero">
          <h1 className="chat__headline">
            Research deeper. Understand faster.
            <br />
            Start with a question.
          </h1>

          <form className="prompt" onSubmit={(e) => e.preventDefault()}>
            <textarea
              ref={inputRef}
              className="prompt__input"
              rows={1}
              placeholder="Add prompt instructions"
              onInput={autoGrow}
            />
            <div className="prompt__row">
              <button type="button" className="prompt__attach" aria-label="Attach">
                +
              </button>
              <button type="submit" className="prompt__send" aria-label="Send">
                <img src={icons.sendArrow} alt="" />
              </button>
            </div>
          </form>

          <p className="chat__tagline">The AI that gets it right. Every single time.</p>
        </div>

        {/* Pull-up button — cycles the Research Desk up / back down */}
        <button
          type="button"
          className="chat__pull"
          onClick={() => setDeskUp((v) => !v)}
          aria-label={deskUp ? "Lower research desk" : "Raise research desk"}
          aria-expanded={deskUp}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path
              d="M3.5 8.5 7 5 10.5 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Research Desk — peeks from the bottom, rises to fill on pull-up */}
        <div className="chat__desk">
          <div className="chat__desk-scroll" ref={deskScrollRef}>
            <ResearchDesk />
          </div>
        </div>

        {/* BlurLayer — bottom fade-to-white scrim with backdrop blur */}
        <div className="chat__blur" aria-hidden />
      </div>
    </section>
  );
}
