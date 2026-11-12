"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "What is Capita?",
    a: "Capita gives you one unified place to view balances, discover verified yields, and execute deposits across Base, Arbitrum, and NEAR.",
  },
  {
    q: "Does Capita take custody of my funds?",
    a: "No. Capita is non-custodial. We never ask for or store your private keys or seed phrases. You approve every transaction from your own wallet.",
  },
  {
    q: "How are trades executed?",
    a: "Cross-chain operations settle using 1Click intent routing. Your funds move directly from your wallet to the destination contract in a single step without manual bridging.",
  },
  {
    q: "What are guardrails?",
    a: "Guardrails are rules you define to protect your portfolio, including maximum allocation limits per protocol, minimum liquid cash reserves, and strict slippage caps.",
  },
  {
    q: "Which networks and assets are supported?",
    a: "Base and Arbitrum One are supported out of the box for lending, vaults, and stablecoin liquidity pools, with USDC as the primary quote asset.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-20 md:py-28 bg-canvas border-b border-line">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center space-y-3 mb-14">
          <p className="eyebrow">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Frequently asked questions
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary">
            Common questions about custody, execution, and security.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.q}
                className="rounded-2xl border border-line bg-surface transition-colors overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="w-full flex items-center justify-between p-5 text-left cursor-pointer hover:bg-surface-raised/40 transition-colors"
                >
                  <span className="text-sm sm:text-base font-semibold text-ink pr-4">
                    {faq.q}
                  </span>
                  <div
                    className={`size-7 rounded-full bg-canvas border border-line flex items-center justify-center shrink-0 text-ink-muted transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <ChevronDown className="size-4" />
                  </div>
                </button>

                {isOpen ? (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-ink-secondary leading-relaxed border-t border-line/60">
                    {faq.a}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
