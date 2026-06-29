"use client";

import { useState } from "react";
import styles from "./vip-prototype.module.css";

type View = "hub" | "levels" | "rewards";

const tiers = [
  {
    name: "Bronze",
    state: "Base",
    requirement: "Start of VIP journey",
    perks: ["Entry weekly pack", "Basic VIP missions", "Entry support line"],
  },
  {
    name: "Silver",
    state: "Active",
    requirement: "500 VIP points / 30 days",
    perks: ["Improved weekly pack", "Extra mission drops", "Faster response queue"],
  },
  {
    name: "Gold",
    state: "Current",
    requirement: "750 VIP points / 30 days",
    perks: ["Weekly premium pack", "Priority queue", "Tailored offers"],
  },
  {
    name: "Platinum",
    state: "Target",
    requirement: "1,000 VIP points / 30 days",
    perks: ["Higher weekly packs", "Faster support SLA", "Exclusive CRM campaigns"],
  },
  {
    name: "Diamond",
    state: "Premium",
    requirement: "1,500 VIP points / 30 days",
    perks: ["High-value packs", "Dedicated VIP routing", "Higher-value retention drops"],
  },
  {
    name: "Elite",
    state: "Invite",
    requirement: "Invitation or top-tier activity",
    perks: ["Top-tier rewards", "White-glove handling", "Private VIP campaigns"],
  },
];

const benefits = [
  {
    icon: "✦",
    title: "Weekly premium pack",
    text: "Free spins pack refreshes every Friday at 18:00.",
  },
  {
    icon: "∞",
    title: "Fast-lane support",
    text: "Gold players go to the priority queue in live chat and support.",
  },
  {
    icon: "◌",
    title: "Personalized offers",
    text: "VIP-only cashback and mission drops appear in the offers feed.",
  },
];

export function VipPrototype() {
  const [view, setView] = useState<View>("hub");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState("Platinum");
  const currentPoints = 780;
  const targetPoints = 1000;
  const pointsLeft = targetPoints - currentPoints;
  const progress = 78;
  const selectedTierData = tiers.find((tier) => tier.name === selectedTier) ?? tiers[3];
  const currentTierData = tiers.find((tier) => tier.name === "Gold") ?? tiers[2];
  const unionPerks = [
    ...currentTierData.perks,
    ...selectedTierData.perks.filter((perk) => !currentTierData.perks.includes(perk)),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Casino / Player Cabinet</p>
            <h1 className={styles.title}>VIP Club</h1>
            <p className={styles.subtitle}>Current tier, next tier, and progress in one glance.</p>
          </div>
        </header>

        <div className={styles.content}>
          <aside className={styles.sidebar}>
            <p className={styles.sidebarLabel}>Player surface</p>
            <nav className={styles.nav}>
              <NavButton
                title="VIP Hub"
                hint="Hero, progress, perks"
                active={view === "hub"}
                onClick={() => setView("hub")}
              />
              <NavButton
                title="Levels & benefits"
                hint="Tier ladder"
                active={view === "levels"}
                onClick={() => setView("levels")}
              />
              <NavButton
                title="Rewards history"
                hint="Claims and reward timeline"
                active={view === "rewards"}
                onClick={() => setView("rewards")}
              />
            </nav>

            <div className={styles.sidebarActions}>
              <button type="button" className={styles.primaryButton} onClick={() => setModalOpen(true)}>
                Open upgrade popup
              </button>
            </div>
          </aside>

          <main className={styles.body}>
            {view === "hub" && (
              <>
                <section className={styles.hero}>
                  <div className={`${styles.panel} ${styles.heroPanel} ${styles.span8}`}>
                    <p className={styles.sectionLabel}>VIP Hub</p>
                    <h2 className={styles.heroTitle}>Current tier: Gold</h2>
                    <p className={styles.heroText}>Next target: Platinum</p>

                    <div className={styles.heroStats}>
                      <button
                        type="button"
                        className={`${styles.statCard} ${styles.interactiveStatCard} ${styles.statCardCurrent}`}
                        onClick={() => {
                          setSelectedTier("Gold");
                          setView("levels");
                        }}
                      >
                        <span className={styles.statLabel}>Current tier now</span>
                        <span className={styles.statValue}>Gold</span>
                        <span className={styles.statFoot}>3 active benefits are already enabled for your account.</span>
                        <span className={styles.inlineLink}>View Gold benefits</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.statCard} ${styles.interactiveStatCard}`}
                        onClick={() => {
                          setSelectedTier("Platinum");
                          setView("levels");
                        }}
                      >
                        <span className={styles.statLabel}>Next tier</span>
                        <span className={`${styles.statValue} ${styles.statValueCompact}`}>Platinum</span>
                        <span className={styles.statFoot}>Open the Platinum card to see requirements and unlocked perks.</span>
                        <span className={styles.inlineLink}>Open Platinum details</span>
                      </button>
                    </div>

                    <div className={styles.progressSummary}>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>VIP points</span>
                        <span className={styles.summaryValue}>{currentPoints} / {targetPoints}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Points left</span>
                        <span className={styles.summaryValue}>{pointsLeft}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Activation</span>
                        <span className={styles.summaryValue}>Auto</span>
                      </div>
                    </div>
                  </div>

                  <aside className={`${styles.panel} ${styles.progressCard} ${styles.progressCardStrong} ${styles.span4}`}>
                    <p className={styles.sectionLabel}>Tier progress overview</p>
                    <div className={styles.tierHeadline}>
                      <span className={styles.tierNow}>Gold</span>
                      <span className={styles.tierArrow}>→</span>
                      <span className={styles.tierNext}>Platinum</span>
                    </div>
                    <div className={styles.ringWrap}>
                      <div className={styles.ring}>
                        <div className={styles.ringInner}>
                          <span className={styles.ringValue}>{progress}%</span>
                          <span className={styles.ringLabel}>to Platinum</span>
                        </div>
                      </div>
                      <div className={styles.ringMeta}>Progress in current 30-day cycle</div>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} />
                    </div>
                    <p className={styles.caption}>Platinum unlocks automatically at {targetPoints} points.</p>
                  </aside>
                </section>

                <section className={styles.grid}>
                  <div id="benefits-section" className={`${styles.panel} ${styles.span12}`}>
                    <p className={styles.sectionLabel}>Gold benefits</p>
                    <div className={styles.benefitsGrid}>
                      {benefits.map((benefit) => (
                        <article key={benefit.title} className={styles.benefitCard}>
                          <div className={styles.benefitIcon}>{benefit.icon}</div>
                          <h3 className={styles.benefitTitle}>{benefit.title}</h3>
                          <p className={styles.benefitText}>{benefit.text}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            {view === "levels" && (
              <>
                <section className={`${styles.panel} ${styles.heroPanel}`}>
                  <div className={styles.tierHeader}>
                    <div>
                      <p className={styles.sectionLabel}>Levels</p>
                      <h2 className={styles.heroTitle}>VIP levels</h2>
                      <p className={styles.heroText}>See the ladder, pick the next target, compare perks and entry rules.</p>
                    </div>
                    <span className={styles.compareLabel}>
                      Compare tiers
                    </span>
                  </div>

                  <div className={styles.tierLine}>
                    {tiers.map((tier) => (
                      <button
                        type="button"
                        key={tier.name}
                        className={`${styles.tierCard} ${
                          tier.name === "Gold" ? styles.tierCurrent : ""
                        } ${tier.name === selectedTier ? styles.tierSelected : ""}`}
                        onClick={() => setSelectedTier(tier.name)}
                        aria-pressed={tier.name === selectedTier}
                        title={`Open ${tier.name} perks`}
                      >
                        <span className={styles.tierName}>{tier.name}</span>
                        <span className={styles.tierState}>{tier.state}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className={styles.compareGrid}>
                  <article className={styles.compareCard}>
                    <span className={styles.compareKicker}>Selected tier</span>
                    <h3 className={styles.compareTitle}>{selectedTierData.name}</h3>
                    <div className={styles.compareRequirement}>Requirement: {selectedTierData.requirement}</div>
                    <ul className={styles.benefitList}>
                      {selectedTierData.perks.map((perk) => (
                        <li key={perk}>{perk}</li>
                      ))}
                    </ul>
                  </article>

                  <article className={styles.compareCard}>
                    <span className={styles.compareKicker}>Perk check</span>
                    <h3 className={styles.compareMatrixTitle}>
                      {currentTierData.name}
                      <span className={styles.compareVs}> vs </span>
                      {selectedTierData.name}
                    </h3>
                    <div className={styles.compareMatrix} role="table" aria-label="Perk comparison">
                      <div className={styles.compareMatrixRow} role="row">
                        <div className={styles.compareMatrixPerk} role="columnheader">
                          Perk
                        </div>
                        <div className={`${styles.compareMatrixMark} ${styles.compareMatrixHeadMark}`} role="columnheader">
                          {currentTierData.name}
                          <span className={styles.youTag}>You</span>
                        </div>
                        <div className={`${styles.compareMatrixMark} ${styles.compareMatrixHeadMark}`} role="columnheader">
                          {selectedTierData.name}
                        </div>
                      </div>
                      {unionPerks.map((perk) => (
                        <div key={perk} className={styles.compareMatrixRow} role="row">
                          <div className={styles.compareMatrixPerk} role="cell">
                            {perk}
                          </div>
                          <div className={styles.compareMatrixMark} role="cell" aria-label={currentTierData.perks.includes(perk) ? "Included" : "Not included"}>
                            {currentTierData.perks.includes(perk) ? (
                              <span className={styles.markYes}>✓</span>
                            ) : (
                              <span className={styles.markNo}>—</span>
                            )}
                          </div>
                          <div className={styles.compareMatrixMark} role="cell" aria-label={selectedTierData.perks.includes(perk) ? "Included" : "Not included"}>
                            {selectedTierData.perks.includes(perk) ? (
                              <span className={styles.markYes}>✓</span>
                            ) : (
                              <span className={styles.markNo}>—</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedTierData.name !== currentTierData.name ? (
                      <p className={styles.compareMatrixFoot}>
                        {`${pointsLeft} VIP points left this cycle to reach ${selectedTierData.name}. `}
                        Requirement: {selectedTierData.requirement}.
                      </p>
                    ) : (
                      <p className={styles.compareMatrixFoot}>You are viewing your current tier.</p>
                    )}
                  </article>
                </section>
              </>
            )}

            {view === "rewards" && (
              <section className={styles.grid}>
                <div className={`${styles.panel} ${styles.span12}`}>
                  <p className={styles.sectionLabel}>Rewards history</p>
                  <div className={styles.activityList}>
                    <div className={styles.activityItem}>
                      <span className={styles.bullet} />
                      <div>
                        <h3 className={styles.activityTitle}>2026-04-21 18:00: Weekly premium pack</h3>
                        <p className={styles.activityText}>Gold perk, activated and credited automatically.</p>
                      </div>
                    </div>
                    <div className={styles.activityItem}>
                      <span className={styles.bullet} />
                      <div>
                        <h3 className={styles.activityTitle}>2026-04-14 12:40: Cashback mission reward</h3>
                        <p className={styles.activityText}>Mission completed, reward added to account balance.</p>
                      </div>
                    </div>
                    <div className={styles.activityItem}>
                      <span className={styles.bullet} />
                      <div>
                        <h3 className={styles.activityTitle}>2026-04-07 09:15: Tier upgrade welcome reward</h3>
                        <p className={styles.activityText}>Triggered automatically after reaching Gold threshold.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="vip-upgrade-title">
          <div className={styles.modalCard}>
            <p className={styles.eyebrow}>Tier upgrade event</p>
            <h2 id="vip-upgrade-title" className={styles.modalTitle}>
              Platinum unlocked
            </h2>
            <p className={styles.modalText}>New perks are active. Claim the welcome reward and return to your VIP hub.</p>

            <div className={styles.modalPerks}>
              <div className={styles.modalPerk}>Priority support is now active</div>
              <div className={styles.modalPerk}>Weekly premium pack unlocked</div>
              <div className={styles.modalPerk}>Seasonal VIP offers added to your account</div>
            </div>

            <div className={styles.ctaRow} style={{ marginTop: 22 }}>
              <button type="button" className={styles.primaryButton} onClick={() => setModalOpen(false)}>
                Claim welcome reward
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setView("hub");
                  setModalOpen(false);
                }}
              >
                Go to VIP Hub
              </button>
            </div>

            <p className={styles.footerNote}>Prototype state only.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({
  title,
  hint,
  active,
  onClick,
}: {
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`${styles.navButton} ${active ? styles.navActive : ""}`}>
      <span>
        <span className={styles.navTitle}>{title}</span>
        <span className={styles.navHint}>{hint}</span>
      </span>
      <span className={styles.navArrow}>↗</span>
    </button>
  );
}
