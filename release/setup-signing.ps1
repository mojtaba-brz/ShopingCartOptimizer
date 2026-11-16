# Run once on the publisher's Windows computer. Never commit this key.
param([string]$Keystore = "$env:LOCALAPPDATA\SabadchinPublisher\sabadchin.jks", [string]$Alias = 'sabadchin')
$ErrorActionPreference = 'Stop'
Get-Command keytool, gh -ErrorAction Stop | Out-Null
$repo = 'mojtaba-brz/ShopingCartOptimizer'
$password = Read-Host 'Keystore password (keep it with your private backup)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
    $env:CARTWISE_SETUP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (!(Test-Path -LiteralPath $Keystore)) {
        New-Item -ItemType Directory -Force -Path (Split-Path $Keystore) | Out-Null
        & keytool -genkeypair -keystore $Keystore -storetype JKS -alias $Alias -keyalg RSA -keysize 3072 -validity 10000 -storepass:env CARTWISE_SETUP_PASSWORD -keypass:env CARTWISE_SETUP_PASSWORD -dname 'CN=Sabadchin Publisher'
        if ($LASTEXITCODE -ne 0) { throw 'Key generation failed.' }
    }
    & keytool -list -keystore $Keystore -alias $Alias -storepass:env CARTWISE_SETUP_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Existing key/password did not validate; nothing uploaded.' }
    # Send values through stdin, never through command arguments or log output.
    $secrets = @{
        CARTWISE_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Keystore))
        CARTWISE_KEYSTORE_PASSWORD = $env:CARTWISE_SETUP_PASSWORD
        CARTWISE_KEY_PASSWORD = $env:CARTWISE_SETUP_PASSWORD
        CARTWISE_KEY_ALIAS = $Alias
    }
    foreach ($name in $secrets.Keys) {
        $secrets[$name] | & gh secret set $name --repo $repo
        if ($LASTEXITCODE -ne 0) { throw "Could not configure $name." }
    }
    Write-Host "Signing secrets configured. Keep a separate private backup of $Keystore and its password."
    Write-Host 'Never regenerate this key for an update. Use the same app signing key for Bazaar and Play App Signing.'
} finally {
    Remove-Item Env:CARTWISE_SETUP_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    if ($secrets) { $secrets.Clear() }
}
