// ============================================================
// lemon-squeezy-webhook/index.ts
// Supabase Edge Function
// 接收 Lemon Squeezy 的 Webhook，验证签名后更新用户付费状态
// 部署命令: supabase functions deploy lemon-squeezy-webhook --no-verify-jwt
// ============================================================

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// ----- 环境变量（在 Supabase Dashboard > Edge Functions 中设置） -----
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LS_WEBHOOK_SECRET    = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ----- Lemon Squeezy 签名验证 -----
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expected = hmac.digest("hex");
    return crypto.timingSafeEqual(
      new TextEncoder().encode(signature),
      new TextEncoder().encode(expected)
    );
  } catch {
    return false;
  }
}

// ----- 查询用户邮箱对应的 Supabase 用户 -----
async function findUserByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("listUsers error:", error.message);
    return null;
  }
  const user = data.users.find((u) => u.email === email);
  return user?.id ?? null;
}

// ----- 更新用户付费状态 -----
async function setUserPaid(userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ paid_status: true })
    .eq("id", userId);
  if (error) {
    console.error("update profile error:", error.message);
    return false;
  }
  return true;
}

// ----- HTTP Handler -----
serve(async (req: Request) => {
  // 仅接受 POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1. 获取原始请求体（必须先在读取前拿到原始文本，用于签名验证）
  const rawBody = await req.text();

  // 2. 验证签名
  //    Lemon Squeezy 将签名放在 X-Signature 头中
  //    格式为 HMAC-SHA256 的 hex 字符串
  const signature = req.headers.get("X-Signature") ?? "";
  if (!verifySignature(rawBody, signature, LS_WEBHOOK_SECRET)) {
    console.warn("签名验证失败，可能来源不合法");
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. 解析 JSON
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const eventName = event.meta?.event_name;
  console.log(`收到事件: ${eventName}`);

  // 4. 只处理支付成功事件
  //    Lemon Squeezy 的事件名是 "order_created"
  //    更多事件参考: https://docs.lemonsqueezy.com/help/webhooks#event-types
  if (eventName !== "order_created") {
    console.log(`忽略非支付事件: ${eventName}`);
    return new Response("OK - ignored", { status: 200 });
  }

  // 5. 获取下单用户邮箱
  const customerEmail = event.data?.attributes?.user_email
    ?? event.data?.attributes?.customer_email
    ?? "";

  if (!customerEmail) {
    console.error("事件数据中未找到用户邮箱");
    return new Response("Missing email", { status: 400 });
  }

  // 6. 查找 Supabase 用户
  const userId = await findUserByEmail(customerEmail);
  if (!userId) {
    console.error(`未找到邮箱 ${customerEmail} 对应的 Supabase 用户`);
    return new Response("User not found", { status: 404 });
  }

  // 7. 更新付费状态
  const updated = await setUserPaid(userId);
  if (!updated) {
    return new Response("Failed to update", { status: 500 });
  }

  console.log(`用户 ${customerEmail} (${userId}) 已标记为付费用户`);
  return new Response("OK", { status: 200 });
});

// ----- 本地开发启动命令 -----
// deno serve --allow-net --allow-env index.ts
//
// 或者使用 Supabase CLI:
// supabase functions serve lemon-squeezy-webhook --no-verify-jwt --env-file ./supabase/.env.local
//
// 部署:
// supabase functions deploy lemon-squeezy-webhook --no-verify-jwt
