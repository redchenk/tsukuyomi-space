param(
    [Parameter(Mandatory = $true)]
    [string]$HostName,
    [int]$Port = 29687,
    [string]$User = "root",
    [Parameter(Mandatory = $true)]
    [string]$KeyPath,
    [string]$RemoteRoot = "/opt/1panel/www/sites/yachiyo-space/frontend",
    [Parameter(Mandatory = $true)]
    [string]$OriginHost,
    [string]$OriginRoot = "/var/www/tsukuyomi-space",
    [Parameter(Mandatory = $true)]
    [string]$OpenRestyContainer
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDist = Join-Path $repoRoot "dist\frontend"
$nginxConf = Join-Path $repoRoot "deploy\hk-frontend-openresty.conf"
$securityHeaders = Join-Path $repoRoot "deploy\security-headers.inc"
$renderedNginxConf = Join-Path ([System.IO.Path]::GetTempPath()) "tsukuyomi-hk-openresty-$PID.conf"

if (!(Test-Path $frontendDist)) {
    throw "Missing frontend build: $frontendDist. Run npm run build:web first."
}

ssh -i $KeyPath -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$HostName" "mkdir -p '$RemoteRoot'"
scp -i $KeyPath -P $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -r "$frontendDist\*" "$User@$HostName`:$RemoteRoot/"
$renderedConfig = (Get-Content -LiteralPath $nginxConf -Raw).Replace('__ORIGIN_HOST__', $OriginHost)
[System.IO.File]::WriteAllText($renderedNginxConf, $renderedConfig, [System.Text.UTF8Encoding]::new($false))
scp -i $KeyPath -P $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$securityHeaders" "$User@$HostName`:/opt/1panel/www/conf.d/_tsukuyomi-security-headers.inc"
scp -i $KeyPath -P $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$renderedNginxConf" "$User@$HostName`:/opt/1panel/www/conf.d/yachiyo-space.conf"

$resourceArchiveCommand = "cd '$OriginRoot' && tar -czf - assets/music assets/video assets/audio models lib"
$resourceExtractCommand = "mkdir -p '$RemoteRoot' && tar -xzf - -C '$RemoteRoot'"
ssh -i $KeyPath -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$OriginHost" $resourceArchiveCommand |
    ssh -i $KeyPath -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$HostName" $resourceExtractCommand

ssh -i $KeyPath -p $Port -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL "$User@$HostName" "docker exec $OpenRestyContainer nginx -t && docker exec $OpenRestyContainer nginx -s reload"
Remove-Item -LiteralPath $renderedNginxConf -Force -ErrorAction SilentlyContinue
