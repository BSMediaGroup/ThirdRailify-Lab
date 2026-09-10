# POC validation record

## Runtime and automated tests

Executed with Node **22.16.0** in the build environment. Final automated result: **13 tests passed, zero failed**. JavaScript syntax checks passed.

Commands:

```text
node --check server.mjs
node --check lib/core.mjs
node --check lib/providers.mjs
node --check public/app.js
node --test
```

The package uses native Node APIs and has no third-party runtime dependencies.

Automated coverage includes dotenv parsing/preservation; exact model references and schema normalization; supported image bytes and size checks; exact output-host allowlisting; secret redaction; raw-byte webhook HMAC/timestamps; actual local HTTP server security/config routes; Replicate model lookup/search/prediction polling; local output persistence; concurrent duplicate submissions; project saving; provider-specific image request bodies; uncertain POST handling without automatic retries; and actual SSE text forwarding without invented reasoning.

These tests inject simulated provider HTTP responses into the **real server/adapters**. They do not require tokens, access a paid provider, or consume credit. Test credential strings are synthetic. Temporary data is removed after tests.

## Browser/UI validation

The environment's installed Chromium has an administrator URL-block policy that prevents ordinary navigation, including localhost. No browser/system policies were changed.

Browser testing therefore loaded the actual HTML/CSS/JavaScript into a Playwright page, with a test bridge sending browser API calls to the **real running localhost Node server**. Asset responses were rendered through test-only data URLs, and existing system fonts were substituted in memory because font networking was also blocked. None of those harness changes are part of the distributed application.

Verified in that environment:
- no page JavaScript exceptions during the exercised workflow;
- settings open/Escape close;
- local authored layout import;
- thumbnail title editing and Canvas composition;
- real project persistence and export-image persistence through the server;
- library/model-picker rendering;
- Google Images external-link construction;
- sidebar collapse, keyboard resizing and pointer-drag resizing;
- 1440, 768 and 390px layout containment;
- desktop image-workspace, composer and mobile screenshots visually inspected.

Normal headed navigation in the user's Windows browser, exact local Third Railify fonts, an actual browser download dialog, and a real billable image generation have **not** been observed here. Exported file bytes were saved through the actual server. This is not a claim of full Windows or live-provider acceptance.

## What Daniel should verify first

Launch `START-LAB.cmd`, use Try a layout, save/reopen a thumbnail and export it. Then save/test the Replicate token and make one low-risk generation with a single output. Confirm the provider reports success and the resulting original still opens from Library after the Lab is restarted.

Try optional GPT/Grok generation and chat only with models available to the corresponding API account. The documented defaults are configurable, not a guarantee of entitlement.

## No deployment

No changes were made to any user repository, production Cloudflare project, DNS, account database, Bot process or provider account during creation of this downloadable package. There is no production login implementation yet.
