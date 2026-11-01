// Browser-shared modules under apps/desktop/app/core/ run in the page and are
// also read by the server typecheck. They guard their UMD root with
// `typeof self !== "undefined"`, but the server's ES2022 lib knows no `self`.
// The server itself never touches it, so an opaque declaration is enough.
declare var self: any;
