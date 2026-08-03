# Publishing guide (do it yourself, step by step)

This walks you through publishing BBModel Unpack to the Visual Studio Marketplace under **your**
identity. Verified against the official documentation in August 2026:
[Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
and [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest).

## 1. One-time setup

### Create a publisher

1. Sign in at <https://marketplace.visualstudio.com/manage> with a Microsoft account.
2. Create a publisher. The **ID** (registered: `Kaioga`) is permanent and public; the display
   name can change later.
3. Put that exact ID in `package.json` → `"publisher"`. The extension's Marketplace identity
   becomes `<publisher>.<name>` — here `Kaioga.bbmodel-unpack` — and must be unique on the
   Marketplace. If your publisher ID ever differs, update the field before packaging.

### Get an access token

1. Open Azure DevOps (<https://dev.azure.com>) → User settings → **Personal Access Tokens**.
2. New token: Organization = **All accessible organizations**, Scopes = **Marketplace → Manage**.
3. Copy the token once; it cannot be shown again.

> Microsoft is retiring global PATs (announced retirement December 2026) in favor of Entra
> ID–based authentication. Check the publishing docs above for the current recommended flow if
> the PAT screen looks different.

### Install the tooling

```bash
npm install -g @vscode/vsce
```

(`vsce` is also a devDependency here, so `npx vsce …` works without a global install.)

## 2. Publish the first version

```bash
vsce login <your-publisher-id>   # paste the PAT when prompted
vsce package                     # sanity check: builds bbmodel-unpack-<version>.vsix
vsce publish                     # uploads the current version
```

`vsce` runs `vscode:prepublish` (compile) automatically, validates the manifest, and will refuse
to publish without `publisher`, `engines.vscode`, README, and a valid icon. Before publishing,
double-check:

- [ ] `publisher` matches your registered ID
- [ ] `repository`, `bugs`, `homepage` URLs point at your real repo
- [ ] README renders well (it becomes the Marketplace page) and CHANGELOG is current
- [ ] `media/icon.png` exists (128px minimum; this project ships 256px)
- [ ] `vsce ls` shows only intended files (the `.vscodeignore` here excludes sources, tests,
      fixtures, docs and scripts)
- [ ] Version in `package.json` is what you mean to release

The extension appears on the Marketplace a few minutes after upload (there is an automated
malware/verification scan on new publishers that can take longer the first time).

## 3. Updates and versioning

Use semantic versioning (`major.minor.patch` — the Marketplace does not support pre-release
*suffixes* like `-beta`):

- **patch** — fixes, no behavior change users must know about
- **minor** — new features, backward compatible (new commands, new settings)
- **major** — breaking changes (renamed commands/settings, changed output layout)

`vsce` can bump for you:

```bash
vsce publish patch    # 0.1.0 -> 0.1.1, commits a version bump if in git
vsce publish minor    # 0.1.0 -> 0.2.0
vsce publish 1.0.0    # explicit
```

For experimental builds, the Marketplace supports a separate **pre-release channel**:
`vsce publish --pre-release` (requires `engines.vscode` ≥ 1.63, satisfied here). Users opt in per
extension.

## 4. Unpublishing and deprecating

- `vsce unpublish <publisher>.<name>` removes the extension entirely (confirmation required;
  installs stop updating). Prefer deprecation for anything people already use.
- Deprecation (a Marketplace-level flag, optionally pointing to a replacement extension or
  setting) is requested through the VS Code team's process linked from the publishing docs —
  currently a comment on their GitHub discussion for extension deprecation.
- You can also mark a release as broken by quickly publishing a fixed higher version — users
  update automatically.

## 5. Support links and hygiene

The manifest fields drive the Marketplace sidebar:

- `repository` → "Repository" link, `bugs.url` → "Issues", `homepage` → "Project Details".
- Enable GitHub Issues on the repo and mention response expectations in the README.
- Add a `SECURITY.md`/contact if you want private vulnerability reports.
- Q&A on the Marketplace listing is on by default (`qna` field controls it).

## 6. Protecting tokens

- Treat the PAT like a password: never commit it, never put it in `package.json`, scripts, or CI
  logs. `vsce login` stores it in your OS credential store.
- In CI, inject it as a masked secret env var (`VSCE_PAT`) and run
  `vsce publish -p "$VSCE_PAT"`; rotate it if it ever leaks and give it the shortest sensible
  expiry.
- Scope tokens to Marketplace **Manage** only — never "Full access".

## 7. Trademark & copyright checklist for this extension

- The name "BBModel Unpack", tagline, icon and all artwork are original — no Blockbench,
  Minecraft, Mojang, Microsoft or VS Code branding is reused. Keep it that way in screenshots
  (don't crop other products' logos into the gallery images).
- "Blockbench" and "Minecraft" appear only as factual references, with a non-affiliation
  disclaimer in the README. Don't use them at the *start* of the extension display name — names
  like "Blockbench Extractor" invite both trademark trouble and Marketplace confusion.
- The converters are an independent implementation that *follows the behavior of* Blockbench's
  GPL-3.0 exporters; no Blockbench source code is copied. The project itself is licensed
  GPL-3.0 (the author's choice), which would also remain compatible if GPL code were ever
  incorporated — still, keeping the implementation independent is the cleaner position.
- Fixture models and textures are generated by `scripts/generate-fixtures.js`, so no third-party
  assets are shipped.
