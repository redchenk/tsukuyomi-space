#!/bin/bash
# 月読空間 - 语言切换功能部署脚本

echo "🌙 月読空間 - 语言切换功能部署"
echo "================================"
echo ""

# 配置
SERVER_HOST="112.124.111.228"
SERVER_USER="root"
SERVER_PORT="22"
LOCAL_PATH="/home/node/.openclaw/workspace/moon-reader-space"
REMOTE_PATH="/var/www/html"

echo "📋 部署配置:"
echo "  服务器：$SERVER_USER@$SERVER_HOST:$SERVER_PORT"
echo "  远程路径：$REMOTE_PATH"
echo ""

# 检查文件是否存在
echo "🔍 检查本地文件..."
if [ ! -f "$LOCAL_PATH/i18n.js" ]; then
    echo "❌ 错误：i18n.js 不存在"
    exit 1
fi
echo "✅ i18n.js 存在"

if [ ! -f "$LOCAL_PATH/editor.html" ]; then
    echo "❌ 错误：editor.html 不存在"
    exit 1
fi
echo "✅ editor.html 存在"

echo ""
echo "📤 开始上传文件..."
echo ""

# 上传 i18n.js
echo "1️⃣  上传 i18n.js..."
cat "$LOCAL_PATH/i18n.js" | ssh -o StrictHostKeyChecking=no -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "cat > $REMOTE_PATH/i18n.js"
if [ $? -eq 0 ]; then
    echo "   ✅ i18n.js 上传成功"
else
    echo "   ❌ i18n.js 上传失败"
    echo "   提示：请检查 SSH 连接或手动上传"
fi
echo ""

# 上传 editor.html
echo "2️⃣  上传 editor.html..."
cat "$LOCAL_PATH/editor.html" | ssh -o StrictHostKeyChecking=no -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "cat > $REMOTE_PATH/editor.html"
if [ $? -eq 0 ]; then
    echo "   ✅ editor.html 上传成功"
else
    echo "   ❌ editor.html 上传失败"
    echo "   提示：请检查 SSH 连接或手动上传"
fi
echo ""

# 验证
echo "🔍 验证远程文件..."
ssh -o StrictHostKeyChecking=no -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "ls -lh $REMOTE_PATH/i18n.js $REMOTE_PATH/editor.html"
echo ""

echo "================================"
echo "🎉 部署完成！"
echo ""
echo "📋 下一步:"
echo "1. 访问 http://$SERVER_HOST/editor.html"
echo "2. 点击右上角的语言切换器"
echo "3. 测试中文/日文切换"
echo ""
echo "📖 详细文档：LANG_DEPLOY.md"
echo ""
