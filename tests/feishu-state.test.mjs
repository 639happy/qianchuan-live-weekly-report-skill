import test from "node:test";
import assert from "node:assert/strict";
import {
  markFeishuReadbackResult,
  markFeishuWriteResult,
  nextFeishuAction,
} from "../qianchuan-live-weekly-report/scripts/feishu-state.mjs";

const readyProbe = {
  cli_available: true,
  initialized: true,
  user_profile: "example-user",
  identity_kind: "user",
  bot_explicitly_allowed: false,
  authorized: true,
  can_write: true,
};

test("missing CLI asks for installation instead of switching to Excel", () => {
  const result = nextFeishuAction({
    ...readyProbe,
    cli_available: false,
  });

  assert.deepEqual(result, {
    action: "install_cli",
    status: "blocked",
  });
});

test("missing profile asks for user initialization", () => {
  const result = nextFeishuAction({
    ...readyProbe,
    initialized: false,
    user_profile: null,
  });

  assert.equal(result.action, "initialize_cli");
  assert.equal(result.status, "blocked");
});

test("pending user auth returns the verification URL unchanged", () => {
  const verificationUrl = "https://example.invalid/device";
  const result = nextFeishuAction({
    ...readyProbe,
    authorized: false,
    verification_url: verificationUrl,
  });

  assert.equal(result.action, "await_user_authorization");
  assert.equal(result.verification_url, verificationUrl);
});

test("bot identity is rejected unless explicitly allowed", () => {
  const result = nextFeishuAction({
    ...readyProbe,
    identity_kind: "bot",
  });

  assert.equal(result.action, "use_user_identity");
  assert.equal(result.status, "blocked");
});

test("write success without readback is not delivery completion", () => {
  const result = markFeishuWriteResult(
    {
      delivery_target_requested: "feishu",
      delivery_target_actual: "pending",
      delivery_status: "blocked",
      feishu_publish_status: "blocked",
    },
    { ok: true, sheet_url: "https://example.invalid/sheet" },
  );

  assert.equal(result.feishu_publish_status, "blocked");
  assert.equal(result.delivery_status, "blocked");
  assert.equal(result.feishu_stage, "awaiting_readback");
});

test("same-user readback success completes Feishu delivery", () => {
  const result = markFeishuReadbackResult(
    {
      delivery_target_requested: "feishu",
      delivery_target_actual: "pending",
      delivery_status: "blocked",
      feishu_publish_status: "blocked",
      feishu_stage: "awaiting_readback",
    },
    { ok: true, same_user: true, matches_local: true },
  );

  assert.equal(result.feishu_publish_status, "complete");
  assert.equal(result.delivery_target_actual, "feishu");
  assert.equal(result.delivery_status, "complete");
});

test("failed readback waits for an explicit fallback decision", () => {
  const result = markFeishuReadbackResult(
    {
      delivery_target_requested: "feishu",
      delivery_target_actual: "pending",
      delivery_status: "blocked",
      feishu_publish_status: "blocked",
      feishu_stage: "awaiting_readback",
    },
    { ok: false, same_user: true, matches_local: false },
  );

  assert.equal(result.feishu_publish_status, "failed");
  assert.equal(result.delivery_status, "awaiting_user_decision");
  assert.equal(result.delivery_target_actual, "pending");
});
