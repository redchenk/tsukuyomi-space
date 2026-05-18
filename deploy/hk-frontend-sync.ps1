param(
    [string]$HostName = "207.57.132.225",
    [int]$Port = 29687,
    [string]$User = "root",
    [string]$KeyPath = "E:\visualstudio\codex.pem",
    [string]$RemoteRoot = "/opt/1panel/www/sites/yachiyo-space/frontend",
    [string]$OpenRestyContainer = "1Panel-openresty-7BcJ"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDist = Join-Path $repoRoot "dist\frontend"
$nginxConf = Join-Path $repoRoot "deploy\hk-frontend-openresty.conf"

if (!(Test-Path $frontendDist)) {
    throw "Missing frontend build: $frontendDist. Run npm run build:web first."
}

ssh -i $KeyPath -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$HostName" "mkdir -p '$RemoteRoot'"
scp -i $KeyPath -P $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -r "$frontendDist\*" "$User@$HostName`:$RemoteRoot/"
scp -i $KeyPath -P $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$nginxConf" "$User@$HostName`:/opt/1panel/www/conf.d/yachiyo-space.conf"
ssh -i $KeyPath -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$HostName" "docker exec $OpenRestyContainer nginx -t && docker exec $OpenRestyContainer nginx -s reload"
