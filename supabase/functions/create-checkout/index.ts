// ============================================================
// create-checkout/index.ts
// Supabase Edge Function
// 创建一个 Lemon Squeezy 支付 Checkout 会话，返回支付链接
// 前端调用此函数获取 Checkout URL 后跳转过去
// 部署命令: supabase functions deploy create-checkout
// ============================================================

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LS_API_KEY           = Deno.env.get("LEMON_SQUEEZY_API_KEY")!;

// ----- 你的 Lemon Squeezy Store ID（在 Lemon Squeezy Dashboard 中查看）-----
const STORE_ID = Deno.env.get("LEMON_SQUEEZY_STORE_ID")!;
// ----- 你的 Lemon Squeezy Variant ID（即产品规格的 ID）-----
const VARIANT_ID = Deno.env.get("LEMON_SQUEEZY_VARIANT_ID")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CheckoutRequest {
  userId?: string;           // Supabase 用户 ID
  userEmail?: string;        // 用户邮箱（Lemon Squeezy 用它来关联订单和用户）
  redirectUrl?: string;      // 支付完成后跳转回前端的 URL
}

serve(async (req: Request) => {
  // 只允许 POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // 解析请求体
  const body: CheckoutRequest = await req.json();
  const userEmail = body.userEmail;
  const redirectUrl = body.redirectUrl ?? "https://你的网站.com/dashboard";

  if (!userEmail) {
    return new Response(
      JSON.stringify({ error: "缺少 userEmail 参数" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 调用 Lemon Squeezy API 创建 Checkout
  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Bearer ${LS_API_KEY}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: userEmail,
              custom: {
                // 这里可以传自定义数据，Lemon Squeezy 会在 Webhook 中原样返回
                user_id: body.userId ?? "",
              },
            },
            product_options: {
              enabled_variants: [Number(VARIANT_ID)],
              redirect_url: redirectUrl,
            },
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: String(STORE_ID),
              },
            },
            variant: {
              data: {
                type: "variants",
                id: String(VARIANT_ID),
              },
            },
          },
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Lemon Squeezy API error:", result);
      return new Response(
        JSON.stringify({ error: "创建支付链接失败", detail: result }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 返回 Checkout URL 给前端
    const checkoutUrl = result.data?.attributes?.url ?? result.data?.attributes?.checkout_url ?? "";
    return new Response(
      JSON.stringify({ url: checkoutUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Request error:", err);
    return new Response(
      JSON.stringify({ error: "内部错误" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// 部署: supabase functions deploy create-checkout
