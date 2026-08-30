---
name: Capacitor routing base
description: Offline Capacitor builds use relative asset URLs but should not use the relative URL as the client router base.
---

For Capacitor builds, keep Vite's `base: './'` for packaged assets, but normalize the router base to an empty string rather than passing `"."`.

**Why:** The packaged WebView loads the app from local `https://localhost` assets; treating `"."` as a URL path base can prevent the route tree from resolving correctly even when the bundle itself is present.

**How to apply:** Use the relative Vite base only when constructing asset URLs. Pass an absolute configured path to Wouter for web previews, and `''` for the Capacitor build.