# Security Policy

AI System 6 handles local project material and optional model-provider
credentials. Security reports are treated as product defects, not support
questions.

## Supported versions

Security fixes target the latest public beta and the live desktop. Older beta
artifacts may not receive backports; upgrade to the newest release before
testing a report.

## Report a vulnerability

Use GitHub's **Report a vulnerability** flow on the Security tab when it is
available. If private vulnerability reporting is unavailable, contact the
maintainers through the project owner's GitHub profile and ask for a private
reporting channel.

Do not open a public issue for a vulnerability. Do not include working secrets,
private documents, personal data, or destructive proof-of-concept payloads in
an initial report.

A useful report contains:

- affected release, browser, or Mac version;
- the smallest reproducible path;
- expected and actual security boundaries;
- realistic impact and prerequisites;
- a safe proof of concept, if one is needed;
- whether the issue is already public.

## Response

The maintainers will try to acknowledge a complete report within seven days,
validate it, agree on disclosure timing, and credit the reporter if requested.
Timelines depend on severity and release complexity; please allow a reasonable
remediation window before disclosure.

## In scope

- credential exposure or persistence outside the documented boundary;
- cross-site scripting, unsafe HTML or Markdown rendering, and injection;
- unauthorized access to local project data or files;
- server-side request forgery or unsafe proxy behavior;
- release, update, or published-asset integrity failures.

Ordinary bugs, model quality, provider outages, and social-engineering reports
without a product vulnerability belong in the issue tracker.

## Safe harbor

Good-faith research that avoids privacy violations, service disruption, data
destruction, persistence, and access beyond what is necessary to demonstrate
the issue is welcome. Stop and report if testing could affect another person or
a production service.
