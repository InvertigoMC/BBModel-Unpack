# Credit, attribution, and ownership

How to make sure you are clearly and honestly credited as this extension's author, and what your
realistic options are around licensing and money.

## Where your name lives

| Place | Field / file | What it signals |
| --- | --- | --- |
| `package.json` | `"publisher"` | Your **Marketplace identity** — the account that controls the listing. Not necessarily authorship. |
| `package.json` | `"author": {"name": …}` | Conventional npm-style authorship statement (shown in some tooling, not prominently on the Marketplace). |
| `package.json` | `"repository"`, `"homepage"`, `"bugs"` | Links users follow to *your* GitHub — usually the strongest public association. |
| `package.json` | `"license"` | Must match the LICENSE file (`MIT` here). |
| `LICENSE` | copyright line | The legal copyright notice: `Copyright (c) 2026 Kaioga5`. Use the name (or handle) you want the claim under; a handle is legally fine if it identifies you. |
| `README.md` | credits section, `© Kaioga5` footer | What most humans actually read. |
| `CHANGELOG.md` | release notes | Ongoing evidence of stewardship. |
| Git history | commit author | Durable, timestamped authorship record. Commit with the email/name you want on record — and make the **first** commit yourself, so the root of history is yours. |

**Publisher identity vs. authorship vs. licensing** are three different things: the publisher ID
controls the Marketplace listing; authorship is a factual/legal claim recorded in copyright
notices and git history; the license is the permission you grant others. Keeping all three
consistent (same handle, same links) is what makes credit unambiguous.

## Open-source license choice

**GPL-3.0 (current)** is copyleft: anyone who redistributes this extension — modified or not —
must keep it under the GPL and provide source, so your attribution and the project's openness
travel with every fork. It also matches Blockbench's own license. Two practical notes:

- The GPL text itself carries no personal copyright line, so keep your authorship claim visible
  elsewhere — the README footer (`© 2026 Kaioga5`) does this; you can additionally add a
  copyright/permission header at the top of `LICENSE` or in source files if you want it stronger.
- This project only *reimplements observable behavior* of Blockbench's exporters, so the GPL
  choice is voluntary, not an obligation — but it stays compatible even if GPL code were ever
  incorporated.

Alternatives, briefly: **MIT** / **Apache-2.0** (permissive — maximizes reuse, including in
closed-source tools, while still requiring attribution; Apache adds a patent grant), or **dual
licensing** (only meaningful while you own all the code, heavyweight for a free developer tool).

If you change the license, update `LICENSE`, `package.json#license`, and the README together.

## Crediting others

- **Contributors:** once PRs arrive, add a "Contributors" section in the README or adopt
  all-contributors; git history preserves the authorship either way. For sizable contributions,
  keep their copyright lines intact.
- **Third-party dependencies:** the shipped extension currently has **zero runtime
  dependencies**, so there is nothing to attribute in the package. If you add one, ship its
  license text (a `THIRD-PARTY-NOTICES.md` generated with e.g. `license-checker`) and mention it
  in the README.
- **Reference works:** Blockbench and the Microsoft Bedrock schema docs are credited in
  README/docs as references. That's honest attribution without implying endorsement.
- **Assets:** icon and fixtures are original/generated — state that (already in the README) so
  nobody assumes borrowed art.

## Describing AI assistance (optional but recommended if asked)

If you want to disclose it, a single honest line is plenty, e.g. in the README credits:
*"Initial implementation developed with the help of an AI coding assistant; design, testing and
maintenance by Kaioga5."* Points to keep it truthful:

- You remain the author/maintainer of record; AI assistance is a tool, like a compiler or
  generator. Current U.S. Copyright Office guidance treats purely AI-generated material as
  uncopyrightable, while human selection, arrangement and modification are protectable — your
  curation, fixes and direction are the human authorship here.
- Don't claim certifications the project doesn't have; conversely you are not obligated to
  disclose tooling in the Marketplace listing at all.

## Money: what's realistic

Publishing on the VS Code Marketplace **pays nothing by itself** — there is no sales mechanism,
no royalties, no revenue share for free extensions. Realistic options:

1. **Donations/sponsorship** — `sponsor.url` in `package.json` (GitHub Sponsors, Ko-fi, etc.)
   adds a *Sponsor* button on the Marketplace page. Zero friction, modest income for most
   projects.
2. **Paid services around it** — support, custom pipeline work for Minecraft studios, priority
   features. The tool is the advert.
3. **Freemium/licensed builds** — the Marketplace has no built-in paywall; paid extensions
   implement their own license-key checks and ToS. Significant complexity and support burden;
   only worth it with proven demand.
4. **Dual licensing** — see above; only meaningful if a business wants terms other than MIT
   (unlikely for MIT-licensed tooling, since MIT already allows commercial use).

Marketplace rules to respect while monetizing: don't misrepresent what the extension does, keep
ads out of the editor UI (Marketplace policies prohibit disruptive ads), and any network calls or
telemetry must be disclosed (this extension makes none).

## Practical first-release checklist for credit

- [ ] `publisher`, `author.name`, LICENSE copyright line and README footer all say the identity
      you want (currently: publisher ID `Kaioga`, author/copyright `Kaioga5`)
- [ ] Repo pushed to your GitHub account, `repository`/`bugs`/`homepage` URLs correct
- [ ] First commit made by you, with your git identity
- [ ] Optional: add `"sponsor": {"url": "…"}` to package.json when you have a funding link
