export function nextFeishuAction(probe) {
  if (!probe.cli_available) {
    return { action: "install_cli", status: "blocked" };
  }
  if (!probe.initialized) {
    return { action: "initialize_cli", status: "blocked" };
  }
  if (!probe.user_profile) {
    return { action: "select_user_profile", status: "blocked" };
  }
  if (probe.identity_kind === "bot" && !probe.bot_explicitly_allowed) {
    return { action: "use_user_identity", status: "blocked" };
  }
  if (!probe.authorized) {
    if (probe.verification_url) {
      return {
        action: "await_user_authorization",
        status: "blocked",
        verification_url: probe.verification_url,
      };
    }
    return { action: "authorize_user", status: "blocked" };
  }
  if (!probe.can_write) {
    return { action: "request_sheet_permission", status: "blocked" };
  }
  return { action: "write_sheet", status: "ready" };
}

export function markFeishuPreflightFailure(state, error) {
  return {
    ...state,
    feishu_publish_status: "failed",
    feishu_stage: "preflight_failed",
    delivery_status: "awaiting_user_decision",
    delivery_target_actual: "pending",
    feishu_error: error ?? "Feishu preflight failed",
  };
}

export function markFeishuWriteResult(state, result) {
  if (!result.ok) {
    return {
      ...state,
      feishu_publish_status: "failed",
      feishu_stage: "write_failed",
      delivery_status: "awaiting_user_decision",
      delivery_target_actual: "pending",
      feishu_error: result.error ?? "Feishu write failed",
    };
  }
  return {
    ...state,
    feishu_publish_status: "blocked",
    feishu_stage: "awaiting_readback",
    delivery_status: "blocked",
    delivery_target_actual: "pending",
    feishu_sheet_url: result.sheet_url,
  };
}

export function markFeishuReadbackResult(state, result) {
  if (result.ok && result.same_user && result.matches_local) {
    return {
      ...state,
      feishu_publish_status: "complete",
      feishu_stage: "complete",
      delivery_target_actual: "feishu",
      delivery_status: "complete",
    };
  }
  return {
    ...state,
    feishu_publish_status: "failed",
    feishu_stage: "readback_failed",
    delivery_target_actual: "pending",
    delivery_status: "awaiting_user_decision",
    feishu_error: result.error ?? "Feishu readback did not match local report",
  };
}
