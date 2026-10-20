$npmPath = "C:\Users\PARTHASARATHI\AppData\Roaming\npm"
$current = [Environment]::GetEnvironmentVariable("Path", "User")
if ($current -notlike "*$npmPath*") {
    $updated = $current.TrimEnd(';') + ';' + $npmPath
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
    Write-Output "Successfully added npm to User PATH."
} else {
    Write-Output "npm is already in User PATH."
}
