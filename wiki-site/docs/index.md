# UI/UX Design Wiki

A concept-organized knowledge base on UX design principles, mobile UX, and usability testing. All notes are sourced from industry articles and community discussions.

---

## UX Design Principles

Core philosophy and best practices for designing experiences users love — covering consistency, simplicity, accessibility, and human-centered design.

- [Key Principles of UX Design](ux-principles/ux-design-principles.md) — Baymard Institute's 10 research-backed UX principles for e-commerce sites and apps, grounded in 1,900+ usability test sessions
- [10 UX/UI Best Practices for Business Apps](ux-principles/10-ux-ui-best-practices-business-apps.md) — Human-centered design fundamentals: user focus, layout consistency, feedback loops, and flipping bad UX cycles to virtuous ones

### Key concepts
- Consistency as the foundation of intuitive design
- Simplicity: only show users what they need
- Accessibility: 94% of top e-commerce sites have compliance issues
- Iterative design process: research → design → test → repeat

### Related Concepts
- [Mobile UX Design](#mobile-ux-design) — Mobile applies these principles under tighter constraints (small screen, one hand, on-the-go)
- [Usability Testing: Methods & Process](#usability-testing-methods-process) — How to validate that your design actually follows these principles

---

## Mobile UX Design

How UX design changes when users are on a small screen, one-handed, distracted, and on the move. Covers iOS vs Android differences, the design process, and common pitfalls.

- [Mobile UX Design Tips](mobile-ux-design/mobile-ux-design-tips.md) — Deep dive into mobile vs desktop UX differences, the 5-step design process (planning → wireframe → prototype), iOS/Android guidelines, and best practices like gesture design, white space, and one-handed use

### Key concepts
- Mobile users task in short bursts; desktop users work in long sessions
- One-handed use: place essential buttons in thumb reach
- iOS: Human Interface Guidelines; Android: Material Design Principles
- Constraints: small storage, screen size, distractions, slow app updates (7-day Apple review)
- Design process: Planning → Research → Specification → Wireframing → Prototyping

### Related Concepts
- [UX Design Principles](#ux-design-principles) — The same core principles apply; mobile just makes every trade-off harder
- [Usability Testing: Methods & Process](#usability-testing-methods-process) — Mobile usability testing has unique challenges (physical devices, gesture recording)

---

## Usability Testing: Methods & Process

How to plan, conduct, analyze, and report on usability tests. Covers moderated vs unmoderated, remote vs in-person, prototype vs live app, and how to turn findings into shipped improvements.

- [Practical Guide & Testing Tools](usability-testing/mobile-usability-testing-practical-guide.md) — Step-by-step process from establishing goals through prototype building, user recruitment, session recording, analysis, and actionable reporting
- [Methods, Tools, Best Practices](usability-testing/mobile-usability-testing-methods-tools.md) — Comprehensive reference: all testing method types, usability metrics (task completion rate, time-on-task, error rate), data analysis, prioritizing severity, and the future of AI-driven testing
- [Tips for Effective UI Testing](usability-testing/tips-effective-ui-testing.md) — Practical tips: test early and often, define objectives, dry runs, recruit right, record sessions; includes prototype vs live app comparison table
- [App Testing Best Practices](usability-testing/app-testing-best-practices.md) — UX, performance, and security testing overview

### Key concepts
- **How many users?** 5 per flow is the industry standard (Nielsen's rule); add more if trends aren't emerging
- **When to test?** Early prototype → iterative → final pre-launch. Earlier = cheaper fixes
- **Moderated vs Unmoderated**: Moderated = rich qualitative insight; Unmoderated = scale and speed
- **Metrics**: Task completion rate, time on task, error rate, user satisfaction
- **Severity tiers**: Critical (blocks tasks) → Serious → Moderate → Minor
- **Report structure**: Executive summary, goals, process overview, categorized findings, prioritized issue list

### Related Concepts
- [UX Design Principles](#ux-design-principles) — Usability testing is how you validate that UX principles are working in practice
- [Testing Tools & Platforms](#testing-tools-platforms) — The specific tools used to run the methods described here

---

## Testing Tools & Platforms

What tools practitioners actually use for usability testing, recruiting, prototyping, and analysis — including community-sourced real-world recommendations.

- [Community Recommendations (Reddit)](tools-platforms/user-testing-platforms-reddit.md) — r/UXDesign thread: real practitioners share their platform choices, recruiting strategies, budget tips, and what actually works

### Tool categories

**Moderated & unmoderated testing platforms**

| Tool | Best for |
| --- | --- |
| UserTesting.com | Full platform: moderated + unmoderated, user panel, integrations |
| Maze | Prototype testing from Figma/Adobe; free tier available |
| Lookback | Live moderated interviews, session recording |
| UXArmy | Remote testing with panel; supports prototypes and live apps |
| Hotjar | Heatmaps, session recordings, surveys |
| Loop11 | Agile teams; heatmaps, funnels, Slack integration |
| Crazy Egg | Heatmaps, A/B testing, session recordings |

**Participant recruitment**

| Tool | Best for |
| --- | --- |
| UserInterviews.com | Vetted panel, scheduling + incentive management |
| Respondent | Niche/professional demographics |
| Dovetail / Marvin | Analysis and synthesis of research data |
| Fullstory / Pendo | In-product analytics (better for in-house teams) |

**Prototyping**

| Tool | Best for |
| --- | --- |
| Figma | Standard for most teams; collaborative, interactive |
| ProtoPie | Advanced gestures and animations |
| Framer / Webflow | Full-flow visual simulation, responsive layouts |

### Key insights from practitioners
- Tools are mostly feature-equivalent — match to your budget
- **Finding users is the hardest part**, not the tool choice
- Best recruitment order: your own users → business connections → support staff → research agencies → paid panels (last resort)
- Budget for participant compensation, even small amounts
- 5–8 users with think-aloud protocol surfaces 80%+ of usability issues

### Related Concepts
- [Usability Testing: Methods & Process](#usability-testing-methods-process) — The methods these tools are used to execute

---

## Quick Reference

### Testing method decision tree

```
Need rich qualitative insight?
  ↳ Yes → Moderated testing (UserTesting, Lookback)
  ↳ No  → Unmoderated testing (Maze, UXArmy, Hotjar)

Early stage prototype or late-stage live app?
  ↳ Prototype → Figma + Maze/UXArmy prototype testing
  ↳ Live app  → UXArmy / UserTesting live app testing

Budget constrained?
  ↳ Use Maze free tier or UXArmy free plan
  ↳ Recruit from your own user base or business contacts
  ↳ 5 users is enough to find most issues
```

### Usability issue severity

| Severity | Definition | Priority |
| --- | --- | --- |
| Critical | Blocks key task (e.g., can't complete checkout) | Fix immediately |
| Serious | Significantly impairs experience (e.g., confusing nav) | Fix before launch |
| Moderate | Minor efficiency impact (e.g., unclear error messages) | Fix in next sprint |
| Minor | Cosmetic (e.g., typos, formatting) | Backlog |

### 5-user rule
Nielsen's research shows 5 users per flow surfaces ~85% of usability issues. Add sessions only if patterns aren't recurring. Test the flows central to your value proposition first.
