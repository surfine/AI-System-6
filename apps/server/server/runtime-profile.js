// Runtime deployment profile.
//
// `local` preserves the desktop and local-Web behavior. `public` exposes only
// the explicitly selected public route surface from router.js.

"use strict";

const LOCAL_PROFILE = "local";
const PUBLIC_PROFILE = "public";

const configuredProfile = String(
  process.env.AI_SYSTEM6_DEPLOYMENT_PROFILE || LOCAL_PROFILE
).trim().toLowerCase();

if (configuredProfile !== LOCAL_PROFILE && configuredProfile !== PUBLIC_PROFILE) {
  throw new Error(
    "AI_SYSTEM6_DEPLOYMENT_PROFILE must be either \"local\" or \"public\"."
  );
}

const deploymentProfile = configuredProfile;
const isPublicDeployment = deploymentProfile === PUBLIC_PROFILE;
const deploymentTarget = isPublicDeployment
  ? "vps"
  : String(process.env.AI_SYSTEM6_SHELL || "").trim().toLowerCase() === "macos"
    ? "mac"
    : "local";

// The public deployment does not carry the guest bridge unless the owner asks
// for it. Off, /mcp is not in the public route table at all, so the live site
// behaves exactly as it did before the bridge existed.
const publicGuestBridgeEnabled = isPublicDeployment
  && String(process.env.AI_SYSTEM6_PUBLIC_MCP || "").trim() === "1";

module.exports = {
  LOCAL_PROFILE,
  publicGuestBridgeEnabled,
  PUBLIC_PROFILE,
  deploymentProfile,
  deploymentTarget,
  isPublicDeployment,
};
