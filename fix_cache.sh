#!/bin/bash
# 彻底解决缓存问题脚本

echo "=== 开始清除缓存 ==="

# 1. 停止 Nginx
echo "停止 Nginx..."
systemctl stop nginx

# 2. 清除所有缓存
echo "清除 Nginx 缓存..."
rm -rf /var/cache/nginx/*
rm -rf /var/lib/nginx/cache/*
rm -rf /var/lib/nginx/fastcgi/*
rm -rf /var/lib/nginx/proxy/*
rm -rf /var/lib/nginx/scgi/*
rm -rf /var/lib/nginx/uwsgi/*

# 3. 重新创建缓存目录
mkdir -p /var/cache/nginx
mkdir -p /var/lib/nginx/cache
mkdir -p /var/lib/nginx/fastcgi
mkdir -p /var/lib/nginx/proxy
mkdir -p /var/lib/nginx/scgi
mkdir -p /var/lib/nginx/uwsgi

# 4. 设置权限
chown -R www-data:www-data /var/cache/nginx
chown -R www-data:www-data /var/lib/nginx

# 5. 强制更新 hub.html
echo "更新 hub.html..."
cp /home/node/.openclaw/workspace/moon-reader-space/hub_final.html /var/www/html/hub.html
chmod 644 /var/www/html/hub.html
chown www-data:www-data /var/www/html/hub.html

# 6. 创建禁用缓存配置
echo "创建禁用缓存配置..."
cat > /etc/nginx/conf.d/disable-cache.conf << 'EOF'
# 全局禁用缓存
add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
add_header Pragma "no-cache";
add_header Expires "0";

# 对 HTML 文件强制禁用缓存
location ~* \.(html|htm)$ {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}
EOF

# 7. 启动 Nginx
echo "启动 Nginx..."
systemctl start nginx

# 8. 验证
echo "验证文件..."
ls -lh /var/www/html/hub.html
md5sum /var/www/html/hub.html
head -30 /var/www/html/hub.html | grep -E "island|waterfall|moon"

echo ""
echo "=== 缓存清除完成 ==="
echo "请访问：http://112.124.111.228/hub.html"
echo "按 Ctrl+Shift+Delete 清除浏览器缓存"
echo "按 Ctrl+F5 强制刷新"
