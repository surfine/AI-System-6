# Appearance QA Matrix

AI System 6 release-supported Appearance surface is all six appearances:

| Surface            | Classic / System 6 | Platinum | Aqua | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| Boot               | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Start Here         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Finder             | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Applications       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project Hard Disk  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| File Floppy        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft Desk         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Writing Studio     | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TeachText          | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Review Desk        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ClioTalk           | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Control Panel      | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| System Modal       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Menu Bar           | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phone Layout       | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

All six are release appearances (registry `releaseReady: true`) exposed in the
Control Panel Appearance selector and the Special menu; none is gated behind a
research switch. The four historical appearances are additionally held to
their pinned canonical references by `npm run verify:theme-lab:fidelity`.
`npm run verify:appearance-apps` separately renders Finder, Page Setup,
TeachText, Scrapbook, Liquid Cover, and Endfield Terminal under every
appearance, proving that ordinary and visually-special apps receive the same
system title-bar painter without conflating that propagation check with either
pixel regression or historical fidelity.

QA criteria per surface: no clipping, no unreadable text, no wrong contrast,
no broken focus, no wrong icon, and no malformed window chrome.
