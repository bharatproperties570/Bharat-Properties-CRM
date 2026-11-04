# HSVP Permission Record — User-Reported Confirmation

**Recorded:** 2026-11-02  
**Source:** User statement in the Bharat Properties CRM project conversation.  
**Authority:** Haryana Shehri Vikas Pradhikaran (HSVP).  
**Authority role reported:** Chief Administrator.  
**User-reported scope:** Public portal, read-only property information retrieval; user states that permission has been allowed.  
**Portal:** https://hsvphry.org.in/Home/PlotStatusEnquiry

## Evidence status

This record captures the user's confirmation; no approval letter, official email, reference number, date, expiry, approved field list, storage/retention terms, or request quota has been provided in this workspace. Those values must not be fabricated.

The current HSVP Terms of Use at https://hsvphry.org.in/Home/Terms state that commercial reproduction/copying/distribution requires prior written approval from the Chief Administrator (section 4) and reserve access restriction for disruptive crawlers/spiders/scrapers (section 5). The project must retain the approval artifact/reference that resolves this requirement and confirms the intended automated read-only CRM use before live collection is enabled.

## Required CRM evidence fields

- `permissionStatus: GRANTED` only after the authority approval artifact is reviewed.
- `approvalReference`: official letter/email/reference identifier.
- `approvalDate` and optional `approvalExpiryDate`.
- `approvedAccessMethod: AUTHORIZED_PUBLIC_PORTAL_AUTOMATION` (requires an enum/schema extension and reviewer sign-off).
- Explicit permission for automated read-only search and commercial/internal CRM use.
- Authority-approved canonical fields, retention/caching policy, requests/day, requests/minute, minimum interval and max concurrency.
- Independent reviewer identity and review timestamp.

## Safety invariants

No authentication/login attempt, CAPTCHA handling/bypass, proxy rotation, stealth/identity masking, rate escalation, or retry after 403/429/challenge/policy block. Owner/allottee names, phone numbers and personal addresses remain excluded unless a separately reviewed legal/privacy basis and explicit authority scope permit them.
