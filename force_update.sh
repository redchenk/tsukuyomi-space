#!/bin/bash
# 强制更新并重启 Nginx

echo "=== 开始更新 ==="

# 删除旧文件
ssh root@112.124.111.228 "rm -f /var/www/html/stage.html /var/www/html/editor.html /var/www/html/login.html"
echo "✅ 旧文件已删除"

# 上传新文件
cat /home/node/.openclaw/workspace/moon-reader-space/stage_final.html | ssh root@112.124.111.228 "cat > /var/www/html/stage.html"
echo "✅ stage.html 已上传"

cat /home/node/.openclaw/workspace/moon-reader-space/editor.html | ssh root@112.124.111.228 "cat > /var/www/html/editor.html"
echo "✅ editor.html 已上传"

cat /home/node/.openclaw/workspace/moon-reader-space/login.html | ssh root@112.124.111.228 "cat > /var/www/html/login.html"
echo "✅ login.html 已上传"

# 重启 Nginx
ssh root@112.124.111.228 "systemctl restart nginx"
echo "✅ Nginx 已重启"

# 验证
echo "=== 验证 ==="
curl -s "http://112.124.111.228/stage.html" | grep -o "lang-switcher" | head -1 && echo "✅ stage.html 有切换器"
curl -s "http://112.124.111.228/stage.html" | grep -o "i18n.js" | head -1 && echo "✅ stage.html 有 i18n.js"

echo "=== 更新完成 ==="
