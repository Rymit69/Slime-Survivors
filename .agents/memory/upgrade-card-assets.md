---
name: Upgrade card assets
description: The supplied upgrade-card PNG contains large transparent margins around its visible frame.
---

Before stretching the upgrade-card texture into a UI card, trim its transparent margins or render only its non-transparent bounds; otherwise the visible border stays short inside a tall card.

**Why:** The source image is a 128×128 canvas, but the visible frame occupies only a centered strip, so scaling the full canvas produces the short inner outline seen on mobile.

**How to apply:** Keep the visible frame crop as the runtime texture, and apply tinting separately to the frame, question icon, and filled/empty level markers.