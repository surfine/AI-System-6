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

module.exports = {
  LOCAL_PROFILE,
  PUBLIC_PROFILE,
  deploymentProfile,
  deploymentTarget,
  isPublicDeployment,
};
