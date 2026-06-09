# SuiShip — Hackathon Demo Video Plan

**Target: 5:00 total · hard ceiling 5:30**  
**Submission: SUI Overflow 2025 · Walrus Track**

---

## Act 1 — The Hook (0:00–0:30)

Cold open. No logo intro. No music yet — silence or a single ambient tone.

**On screen:** A close-up of a paper bill of lading. Slow zoom in. Voiceover:

> "Every day, $42 billion worth of global trade moves on documents that can be forged in minutes."

Hard cut to black. SuiShip logo appears with tagline:

> **"One verified passport for every global shipment."**

Music begins — low, cinematic.

---

## Act 2 — Why This, Why Now (0:30–1:15)

Voiceover over slow scroll of the landing page + abstract blockchain motion graphics (blurred grid lines, nodes):

**Market gap (8 sec):**
> "Trade finance runs on trust and email. No single source of truth. No audit trail. No fraud detection across shipments."

**Why Sui (10 sec):**
> "Sui gives us sub-second finality and object-centric ownership — each shipment becomes a permanent, programmable NFT with a live custody chain."

_[Cut to: Sui logo animation / brief Sui explorer shot of ShipmentPassport object]_

**Why Walrus (10 sec):**
> "Walrus keeps the actual PDFs off-chain — erasure-coded across nodes — and stores their IDs on Sui, so content is verifiable without bloating the ledger."

_[Cut to: walrus_blob_ids array in a passport object on explorer]_

**Why SEAL (10 sec):**
> "SEAL gives us threshold encryption for confidential manifests. Key servers check on-chain endorsement before releasing a single decryption share — no custodian required."

_[Cut to: SEAL logo / diagram of threshold key release]_

**Why MemWal (10 sec):**
> "And MemWal gives our validation agent persistent memory. It remembers who your exporter is — across every shipment — so it can catch fraud that only appears over time."

_[Cut to: terminal showing recall_party_memory tool call trace from the landing page hero]_

---

## Act 3 — The Product Reveal (1:15–1:45)

Cut from b-roll to landing page hero shot in the browser.

Voiceover:
> "This is SuiShip."

Mouse hovers the "Start Building" CTA. Click. Transition into the app dashboard.

Voiceover:
> "Let's ship something."

---

## Act 4 — Live Demo (1:45–4:15)

_Pre-write the full narration script. Rehearse 3× before recording. Record screen at 1080p/60fps. No bookmarks bar, clean browser profile, cursor size increased._

### Part 1 — Primary user flow (1:45–2:45, ~60 sec)

**What we're showing:** Create a shipment → upload PDFs → extract fields → view results.

Script outline:
- Navigate to `/create`. "I'm an exporter — Acme Robotics, shipping industrial tablets from Los Angeles to Shanghai."
- Fill the form quickly (use pre-filled Scenario C defaults). "Trade parties, route, Incoterms, cargo value."
- Upload 4 PDFs. "Commercial invoice, packing list, bill of lading, certificate of origin."
- Trigger extraction. "Claude Haiku reads every document in parallel — extracting HS codes, trade values, party names, ports."
- Show extraction results. "Four documents. Every field pulled out. Takes about two seconds per doc."

### Part 2 — The differentiating feature: SEAL + Walrus + MemWal validation (2:45–3:30, ~45 sec)

**What we're showing:** The validation agent's cross-shipment memory recall and anomaly detection.

Script outline:
- Click "Run Validation". "Now the validation agent runs — but this isn't just field matching."
- Show the tool call trace. "It calls `recall_party_memory` — pulling Acme Robotics's history from MemWal."
- Show the `flag_anomaly` calls. "It found something. Bank account changed. And this bill of lading? Already used in a prior shipment — duplicate detected."
- Show the verdict. "Two critical anomalies. Shipment blocked. This is fraud detection that only works because of persistent memory across shipments."

### Part 3 — Mint the passport + fast retrieval (3:30–4:00, ~30 sec)

**What we're showing:** Mint to Sui, Walrus blob IDs in the passport, fast recall.

Script outline:
- Click "Mint Passport". "For a clean shipment — verification score above 85 — we mint."
- Show the transaction loading. "The documents are packaged and uploaded to Walrus. The passport NFT is minted on Sui testnet."
- Show the minted passport. "Here's the ShipmentPassport object. Immutable document hashes. Walrus blob IDs. MemWal space ID. All anchored on-chain."
- Click to retrieve the Walrus manifest. "Sub-second retrieval from MemWal's hot cache — this is what the importer sees when they scan the QR code."

### Part 4 — Developer moment (4:00–4:15, ~15 sec)

**What we're showing:** The API surface — clean, REST, real endpoints.

Script outline:
- Switch to the terminal/API section of the landing page (or show a quick curl or Postman screenshot).
- "Everything is a REST endpoint. POST to mint, validate, chat, scan risk. Integrate into your existing trade ops stack."

---

## Act 5 — The Close (4:15–5:00)

Cut back to clean dark screen. Three lines appear one at a time, white on black, centered:

1. **"Built a full AI-validated, blockchain-anchored shipment passport system."**
2. **"Running on Sui testnet. Walrus live. MemWal persistence enabled."**
3. **"Next: SEAL encryption in production · mainnet deployment · bank API integration."**

Hold 1 second. Fade to SuiShip logo + tagline:

> **"Ship on Sui. Stored on Walrus. Secured by SEAL."**

URL: `[your-deployment-url]`  
"Built for SUI Overflow 2025 · Walrus Track"

Hold 2 seconds. End.

---

## Production Checklist

- [ ] **Script**: Write full VO script from this outline. Read aloud and time it — cut until it fits. Target 4:45 to leave buffer.
- [ ] **VO recording**: Record in a quiet room. AirPods Pro in a closet beats laptop mic. Record separate from screen.
- [ ] **Screen recording**: 1080p minimum, 60fps. Hide bookmarks bar. Use a clean browser profile. Increase cursor size in Accessibility settings.
- [ ] **Music**: One track, low and consistent, ducked under VO by ~15dB. Epidemic Sound or Artlist. Avoid free YouTube library tracks.
- [ ] **Editing**: DaVinci Resolve (free) or CapCut. Cuts on beat. No static frame longer than 3 seconds.
- [ ] **Color**: Subtle grade — lift dark scenes slightly, match the landing page's deep navy/blue palette.
- [ ] **Captions**: Burn in lowercase captions. Judges often watch muted on judging platforms.
- [ ] **Thumbnail**: Design one even if not required. Judges click thumbnails.
- [ ] **Export**: H.264, 1080p, ~20Mbps, MP4.

---

## Recording Order

_Do NOT record in script order — record in this order:_

1. **Screen demo first** (Acts 3–4) — hardest, most retakes, record silent
2. **VO for Acts 3–4** — narrate over your already-recorded demo footage
3. **VO for Acts 1, 2, 5** — record separately
4. **B-roll and motion graphics** — landing page scroll, Sui explorer, diagram animations
5. **Assemble in editor** — sync VO, lay music, add captions, color grade

---

## Recommended Tools

| Task | Tool |
|------|------|
| Screen recording | ScreenStudio (Mac, gorgeous default output) or OBS |
| VO recording | QuickTime + Audacity for noise reduction (free) |
| Editing | DaVinci Resolve (free) |
| Motion graphics | Rive, After Effects, or Figma exports + Resolve Fusion |
| Music | Epidemic Sound or Artlist |
| Thumbnail | Figma |

---

## 3 Alternative Cold-Open Hooks (Ranked by Impact)

### #1 — The Number (Highest Impact)
_Best for: judges who skim. Instantly frames the scale of the problem._

White text on black. No voiceover yet. Just the number:

**`$42,000,000,000`**

It counts up slowly for 2 seconds. Then hard cut to:

**"That's how much trade finance fraud costs the global economy. Every. Single. Year."**

Then SuiShip logo. This works because the number is shocking, verifiable, and immediately establishes stakes.

---

### #2 — The Forgery (Medium-High Impact)
_Best for: technical judges who appreciate a concrete demonstration of the problem._

Open on a terminal. Someone runs a command that generates a fake bill of lading PDF. It takes 3 seconds. Voiceover:

> "Forging a bill of lading takes 3 seconds and a laptop. Banks accept them. Customs clears them. And no one finds out until the container arrives empty."

This is visceral. It makes the problem real without statistics.

---

### #3 — The Email Thread (Medium Impact)
_Best for: enterprise-facing judges. Relatable pain, not crypto-native._

Screen recording: An email thread with 47 replies. Subject line: "RE: RE: RE: FW: Updated BL docs for LAX-SHA shipment." Voiceover:

> "This is how $2 million of goods moves from LA to Shanghai today. 47 emails. Four PDF versions. Nobody knows which one is current."

Then cut to SuiShip. This hook works because every judge who has dealt with enterprise ops recognizes the pain instantly — no crypto knowledge required.
