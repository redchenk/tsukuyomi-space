#!/bin/bash

# 🌙 Tsukuyomi Space - 快速部署脚本
# 使用此脚本快速部署到服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
SERVER_HOST="${SERVER_HOST:-your-server-ip}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
FRONTEND_PATH="/var/www/tsukuyomi-space"
BACKEND_PATH="/opt/tsukuyomi-api"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🌙 Tsukuyomi Space 部署脚本         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# 函数：打印信息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查依赖
check_dependencies() {
    print_info "检查依赖..."
    
    if ! command -v git &> /dev/null; then
        print_error "Git 未安装，请先安装 Git"
        exit 1
    fi
    
    if ! command -v ssh &> /dev/null; then
        print_error "SSH 未安装，请先安装 SSH"
        exit 1
    fi
    
    print_success "依赖检查通过"
}

# 部署前端
deploy_frontend() {
    print_info "部署前端文件..."
    
    # 创建远程目录
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "mkdir -p $FRONTEND_PATH"
    
    # 同步文件
    rsync -avz -e "ssh -p $SERVER_PORT" \
        --exclude '.git' \
        --exclude '.github' \
        --exclude 'node_modules' \
        --exclude '*.db' \
        --exclude '*.log' \
        --exclude 'backend/' \
        ./ $SERVER_USER@$SERVER_HOST:$FRONTEND_PATH/
    
    # 设置权限
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "chmod -R 755 $FRONTEND_PATH"
    
    # 重载 Nginx
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "systemctl reload nginx"
    
    print_success "前端部署完成"
}

# 部署后端
deploy_backend() {
    print_info "部署后端服务..."
    
    # 创建远程目录
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "mkdir -p $BACKEND_PATH"
    
    # 同步后端文件
    rsync -avz -e "ssh -p $SERVER_PORT" \
        --exclude 'node_modules' \
        --exclude '*.db' \
        --exclude '*.log' \
        ./backend/ $SERVER_USER@$SERVER_HOST:$BACKEND_PATH/
    
    # 安装依赖
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "cd $BACKEND_PATH && npm install --production"
    
    # 重启服务
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST "pm2 restart tsukuyomi-api || echo 'PM2 未运行'"
    
    print_success "后端部署完成"
}

# 验证部署
verify_deployment() {
    print_info "验证部署..."
    
    # 检查前端
    if curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_HOST/" | grep -q "200"; then
        print_success "前端访问正常"
    else
        print_warning "前端访问可能有问题"
    fi
    
    # 检查后端
    if curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_HOST:3000/api/health" | grep -q "200"; then
        print_success "后端 API 正常"
    else
        print_warning "后端 API 可能有问题"
    fi
}

# 主函数
main() {
    echo ""
    print_info "开始部署..."
    echo ""
    
    check_dependencies
    
    echo ""
    deploy_frontend
    
    echo ""
    deploy_backend
    
    echo ""
    verify_deployment
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   🎉 部署完成！                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "前端地址：${BLUE}http://$SERVER_HOST/${NC}"
    echo -e "后端 API: ${BLUE}http://$SERVER_HOST:3000/api${NC}"
    echo -e "管理后台：${BLUE}http://$SERVER_HOST/terminal.html${NC}"
    echo ""
    echo -e "${YELLOW}默认管理员账号:${NC}"
    echo -e "  用户名：admin"
    echo -e "  密码：admin123"
    echo ""
    echo -e "${RED}⚠️  请首次登录后立即修改密码！${NC}"
    echo ""
}

# 运行主函数
main
