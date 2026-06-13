#!/bin/bash
# ============================================================
# 晚川电子 - 一键部署脚本
# 1. 创建 Supabase 项目
# 2. 运行数据库迁移
# 3. 部署 Edge Functions
# 4. 配置 Lemon Squeezy Webhook
# 5. 推送到 GitHub Pages
# ============================================================
set -e

echo "========================================"
echo " 🌐 晚川电子 · 一键部署脚本"
echo "========================================"

# 1. 检查 Supabase CLI
if ! command -v supabase &> /dev/null; then
  echo "❌ 需要安装 Supabase CLI"
  echo "   brew install supabase/tap/supabase"
  exit 1
fi

# 2. 检查环境变量
if [ ! -f .env ]; then
  echo "❌ 请先创建 .env 文件（参考 .env.example）"
  exit 1
fi
source .env

# 3. 初始化 Supabase（如果还没做）
if [ ! -f supabase/config.toml ]; then
  supabase init
fi

# 4. 链接远程项目
echo "📋 请先创建 Supabase 项目:"
echo "   1. 打开 https://supabase.com/dashboard"
echo "   2. 点击 New project"
echo "   3. 填写项目名称（如 wanchuan-store）"
echo "   4. 创建完成后，复制 Project Reference ID"
echo ""
read -p "👉 输入你的 Supabase Project Reference ID: " PROJECT_REF
supabase link --project-ref "$PROJECT_REF"

# 5. 运行数据库迁移
echo ""
echo "📦 运行数据库迁移..."
supabase db push

# 6. 部署 Edge Functions
echo ""
echo "🚀 部署 Edge Functions..."
supabase functions deploy create-checkout
supabase functions deploy lemon-squeezy-webhook --no-verify-jwt

# 7. 设置环境变量
echo ""
echo "⚙️  设置 Edge Functions 环境变量..."
supabase secrets set LEMON_SQUEEZY_API_KEY="$LEMON_SQUEEZY_API_KEY"
supabase secrets set LEMON_SQUEEZY_STORE_ID="$LEMON_SQUEEZY_STORE_ID"
supabase secrets set LEMON_SQUEEZY_VARIANT_ID="$LEMON_SQUEEZY_VARIANT_ID"
supabase secrets set LEMON_SQUEEZY_WEBHOOK_SECRET="$LEMON_SQUEEZY_WEBHOOK_SECRET"

# 8. 替换前端中的占位配置
echo ""
echo "🔧 替换前端配置..."
SUPABASE_FUNC_URL="${SUPABASE_URL}/functions/v1"
sed -i '' "s|https://你的项目.supabase.co|$SUPABASE_URL|g" index.html
sed -i '' "s|你的anon-key|$SUPABASE_ANON_KEY|g" index.html

# 9. 推送到 GitHub
echo ""
echo "🔄 推送到 GitHub Pages..."
git add -A
git commit -m "feat: 集成 Supabase Auth + Lemon Squeezy 支付"
git push origin main

echo ""
echo "========================================"
echo " ✅ 部署完成！"
echo "========================================"
echo ""
echo "最后一步：配置 Lemon Squeezy Webhook"
echo "1. 打开 https://app.lemonsqueezy.com/settings/webhooks"
echo "2. 创建 Webhook，URL:"
echo "   ${SUPABASE_FUNC_URL}/lemon-squeezy-webhook"
echo "3. 选择事件: order_created"
echo "4. 生成并复制 Signing Secret"
echo "5. 在 Supabase Dashboard 设置环境变量:"
echo "   supabase secrets set LEMON_SQUEEZY_WEBHOOK_SECRET=你的secret"
