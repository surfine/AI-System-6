// Consumer-facing failures are a pair: what happened, then what to do next.
// Diagnostics keep the original exception in the console, not in product UI.

const userRecoveryMessageKeys = Object.freeze({
  cloudConnection: Object.freeze({
    message: "cloud_connection_failed_message",
    action: "cloud_connection_failed_action",
  }),
  localConnection: Object.freeze({
    message: "local_connection_failed_message",
    action: "local_connection_failed_action",
  }),
  projectStorage: Object.freeze({
    message: "project_storage_unavailable_message",
    action: "project_storage_unavailable_action",
  }),
});

function userRecoveryMessage(kind) {
  const entry = userRecoveryMessageKeys[kind];
  return entry ? `${t(entry.message)} ${t(entry.action)}` : "";
}

window.AISystem6UserRecoveryMessages = Object.freeze({
  keys: userRecoveryMessageKeys,
  text: userRecoveryMessage,
});
