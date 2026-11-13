"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What is Capita?",
    a: "One place to see your crypto across Base, Arbitrum and Ethereum, find opportunities in vaults, lending, liquidity pools, arbitrage and tokenized stocks, get an AI-built strategy, and execute it within limits you set.",
  },
  {
    q: "Does Capita hold my funds or keys?",
    a: "No. Capita never asks for or stores a seed phrase or private key. Every transaction is signed in your own wallet.",
  },
  {
    q: "What does the AI decide?",
    a: "Nothing that moves money. The model proposes allocation weights and explains trade-offs. Deterministic, tested code turns them into exact amounts and checks your guardrails, and you approve every step.",
  },
  {
    q: "How do funds move between chains?",
    a: "Through NEAR Intents 1Click. Capita gets a fresh quote with its fees and deadline, you send the deposit from your wallet, and Capita tracks the settlement status. A strategy with several steps runs as separate legs, each confirmed on its own.",
  },
  {
    q: "Are the rates guaranteed?",
    a: "No. APYs are variable, stablecoins can depeg, arbitrage can lose money, and tokenized stocks carry issuer and off-hours price risks. Every rate shows its source and when it was observed.",
  },
  {
    q: "Which networks are supported?",
    a: "Execution runs on Base and Arbitrum One, with tokenized stocks and Tether Gold on Ethereum. Support is checked against the live 1Click token catalogue, not a fixed list.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="section border-t border-line bg-surface">
      <div className="mx-auto max-w-[760px]">
        <div className="section-head">
          <p className="eyebrow">FAQ</p>
          <h2 className="type-h2 text-ink">Questions, answered</h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            const panelId = `faq-panel-${idx}`;
            return (
              <div key={faq.q} className="panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="type-h6 text-ink">{faq.q}</span>
                  <ChevronDown
                    className={`size-5 shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <p id={panelId} className="type-body-md px-6 pb-6 text-ink-secondary">
                    {faq.a}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
