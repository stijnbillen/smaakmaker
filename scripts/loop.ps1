# Bouwloop: werkt taken uit PROGRESS.md één voor één af met vier agents
# (analist, tester, ontwikkelaar, reviewer). Alles wat per project verschilt staat in loop-config.psd1.
#
# Gebruik (PowerShell 7, vanuit de projectroot):
#   ./scripts/loop.ps1 -DryRun                          # toont welke taak als volgende komt, doet niets
#   ./scripts/loop.ps1 -TaakId T-001                    # één specifieke taak
#   ./scripts/loop.ps1 -MaxTaken 3                      # de eerstvolgende drie taken
#   ./scripts/loop.ps1 -TaakId T-001 -HervatBijTester   # slaat de analyse over (taakbrief is er al)
#   ./scripts/loop.ps1 -TaakId T-001 -HervatBijCode     # slaat analyse en tests over, haalt de stash van de taak terug
#
# Het script bouwt en test zelf: wat een model zegt over slagen telt niet.
# Het pusht nooit en werkt alleen op de werkbranch uit de configuratie.

param(
    [string]$TaakId,
    [int]$MaxTaken = 1,
    [switch]$DryRun,
    [switch]$HervatBijTester,
    [switch]$HervatBijCode
)

$ErrorActionPreference = 'Stop'
# Let op: PowerShell-variabelen zijn niet hoofdlettergevoelig. Een parameter $Taak en een variabele $taak
# zijn dezelfde variabele; daarom heet de parameter $TaakId.
Set-Location (Split-Path -Parent $PSScriptRoot)

$cfg = Import-PowerShellDataFile (Join-Path $PSScriptRoot 'loop-config.psd1')
$Voortgang = 'PROGRESS.md'
$LogMap = 'logs'
$LoopLog = 'docs/loop-log.md'
if ($cfg.JavaHome -and -not $env:JAVA_HOME) { $env:JAVA_HOME = $cfg.JavaHome }
New-Item -ItemType Directory -Force -Path $LogMap, 'docs/taken' | Out-Null

function Schrijf-Log($taak, $rol, $resultaat) {
    $regel = '- {0:yyyy-MM-dd HH:mm} {1} {2}: {3}' -f (Get-Date), $taak, $rol, $resultaat
    Add-Content -Path $LoopLog -Value $regel -Encoding utf8
    Write-Host $regel
}

# --- PROGRESS.md lezen en bijwerken -----------------------------------------

function Lees-Taken {
    $taken = @()
    foreach ($regel in Get-Content $Voortgang -Encoding utf8) {
        if ($regel -match '^- \[(.)\] \*\*(T-\d+)\*\* — (.*)$') {
            # Eerst vastleggen: de tweede -match hieronder overschrijft $Matches.
            $status, $id, $titel = $Matches[1], $Matches[2], $Matches[3]
            $deps = @()
            # Elk T-nummer tussen de haakjes na 'afhankelijk van' telt als afhankelijkheid. Noem dus nooit een
            # ander taaknummer binnen die haakjes, anders ontstaat een dode lock.
            if ($regel -match 'afhankelijk van ([^)]*)\)') {
                $deps = [regex]::Matches($Matches[1], 'T-\d+') | ForEach-Object { $_.Value }
            }
            $taken += [pscustomobject]@{ Status = $status; Id = $id; Titel = $titel; Deps = $deps }
        }
    }
    return $taken
}

function Zet-Status($id, $teken, $reden = '') {
    $inhoud = Get-Content $Voortgang -Raw -Encoding utf8
    $inhoud = $inhoud -replace "\[.\] \*\*$id\*\*", "[$teken] **$id**"
    if ($teken -ne '!') {
        # Een oude blokkeerreden hoort niet mee te gaan in titel of commit zodra de taak weer loopt of klaar is.
        $inhoud = $inhoud -replace "(?m)^(- \[$([regex]::Escape($teken))\] \*\*$id\*\*.*?) — reden:[^\r\n]*(\r?)$", '$1$2'
    }
    if ($reden) {
        # De reden komt aan het eind van de regel, zodat PROGRESS.md ook op een telefoon leesbaar blijft.
        $inhoud = $inhoud -replace "(?m)^(- \[$([regex]::Escape($teken))\] \*\*$id\*\*.*?)( — reden:[^\r\n]*)?(\r?)$", "`$1 — reden: $reden`$3"
    }
    Set-Content -Path $Voortgang -Value $inhoud -NoNewline -Encoding utf8
}

function Is-Beantwoord($id) {
    # Een geblokkeerde taak met een beantwoorde vraag in VRAGEN.md mag opnieuw.
    if (-not (Test-Path 'VRAGEN.md')) { return $false }
    $tekst = Get-Content 'VRAGEN.md' -Raw -Encoding utf8
    return [bool]($tekst -match "(?s)## $id\b.*?Status:\s*beantwoord")
}

$script:Gestopt = @()

function Volgende-Taak {
    # Taken die in deze run al zijn gestopt, slaan we over, anders blijft een beantwoorde maar falende taak terugkomen.
    $alle = Lees-Taken
    $klaar = $alle | Where-Object { $_.Status -eq 'x' } | ForEach-Object { $_.Id }
    foreach ($t in $alle) {
        if ($t.Id -in $script:Gestopt) { continue }
        $open = ($t.Status -eq ' ') -or ($t.Status -eq '!' -and (Is-Beantwoord $t.Id))
        if ($open -and -not ($t.Deps | Where-Object { $_ -notin $klaar })) { return $t }
    }
    return $null
}

# --- Agents en controles ----------------------------------------------------

function Roep-Agent($rol, $taak, $prompt) {
    $bestand = Join-Path $LogMap ('{0}-{1}-{2:HHmmss}.log' -f $taak, $rol, (Get-Date))
    $toegestaan = @('Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git log:*)')
    if ($rol -eq 'tester' -and $cfg.TestCompileCommando) { $toegestaan += "Bash($($cfg.TestCompileCommando):*)" }
    if ($rol -eq 'ontwikkelaar') { foreach ($c in $cfg.ToegestaneCommandos) { $toegestaan += "Bash($($c):*)" } }
    $argumenten = @(
        '-p', $prompt, '--agent', $rol,
        '--permission-mode', 'acceptEdits',
        '--allowedTools') + $toegestaan + @(
        '--max-budget-usd', $cfg.BudgetPerAgent,
        '--output-format', 'text')
    # Zit het abonnement tegen een gebruikslimiet, dan is de taak niet geblokkeerd: we wachten en proberen opnieuw.
    # Zonder deze regel zette een limiet in één ronde elke taak ten onrechte op 'geblokkeerd'.
    for ($wacht = 0; ; $wacht++) {
        $uitvoer = & claude @argumenten 2>&1 | Out-String
        if ($uitvoer -notmatch "(session|usage|rate|weekly) limit|hit your .{0,20}limit") { break }
        Schrijf-Log $taak $rol "limiet bereikt, wacht $($cfg.WachtMinutenBijLimiet) min (poging $($wacht + 1) van $($cfg.MaxWachtPogingen))"
        if ($wacht + 1 -ge $cfg.MaxWachtPogingen) { Zet-Status $taak ' '; Schrijf-Log $taak $rol 'limiet blijft; loop stopt'; exit 3 }
        Start-Sleep -Seconds ($cfg.WachtMinutenBijLimiet * 60)
    }
    Set-Content -Path $bestand -Value $uitvoer -Encoding utf8
    # De eindmarkering is de laatste regel die ermee begint. Een agent mag daarna nog toelichting schrijven;
    # alleen de allerlaatste regel nemen gaf eerder valse stops.
    $regels = $uitvoer -split "\r?\n" | Where-Object { $_.Trim() }
    $laatste = $regels | Where-Object { $_ -match '^(KLAAR|VRAAG:|BLOKKADE:|GOEDGEKEURD|BEVINDINGEN:)' } | Select-Object -Last 1
    if (-not $laatste) { $laatste = 'BLOKKADE: agent gaf geen eindmarkering. Laatste regel: ' + ($regels | Select-Object -Last 1) }
    Schrijf-Log $taak $rol $laatste
    return $laatste
}

function Draai-Build($taak) {
    $bestand = Join-Path $LogMap ('{0}-build-{1:HHmmss}.log' -f $taak, (Get-Date))
    Invoke-Expression $cfg.BouwCommando *> $bestand
    $ok = ($LASTEXITCODE -eq 0)
    # Een vitest-worker die op Windows bij het opstarten crasht (exitcode 3221226505) is geen testfout: alle
    # testbestanden die wel liepen slaagden. Dan één keer opnieuw, maar alleen als er geen test faalde.
    if (-not $ok -and (Select-String -Path $bestand -Pattern 'Worker exited unexpectedly with exit code 3221226505' -Quiet) -and -not (Select-String -Path $bestand -Pattern '^\s*(FAIL|×)\s' -Quiet)) {
        Schrijf-Log $taak 'build' 'worker-crash (geen testfout), opnieuw'
        # De crash kan een test midden in zijn opruimstap gestopt hebben; testresten in de gedeelde databank laten de herhaling falen.
        npx supabase db reset --local *> $null
        Invoke-Expression $cfg.BouwCommando *> $bestand
        $ok = ($LASTEXITCODE -eq 0)
    }
    Schrijf-Log $taak 'build' ($(if ($ok) { 'geslaagd' } else { 'mislukt' }))
    # Compileren de tests zelf niet, dan ontbreekt er meestal een testnaad in de code; dat is geen afwijking in gedrag.
    $compileFout = $false
    if ($cfg.CompileFoutPatroon) { $compileFout = [bool](Select-String -Path $bestand -Pattern $cfg.CompileFoutPatroon -Quiet) }
    return [pscustomobject]@{ Ok = $ok; CompileFout = $compileFout; Staart = (Get-Content $bestand -Tail 60 | Out-String) }
}

function Stuur-Melding($bericht) {
    if (-not $cfg.Meldingen) { return }
    # Werkt pas als de sessie aan een telefoon hangt (Remote Control); anders komt er hooguit een bureaubladmelding.
    try {
        & claude -p "Stuur met PushNotification (status proactive) exact dit bericht: $bericht" `
            --model haiku --allowedTools PushNotification --max-budget-usd 0.5 | Out-Null
    } catch { Write-Host "Melding niet verstuurd: $_" }
}

function Stop-Taak($taak, $reden, $wip) {
    $script:Gestopt += $taak.Id
    Schrijf-Log $taak.Id 'stop' $reden
    Zet-Status $taak.Id '!' $reden
    # Onafgewerkt werk gaat in een stash. Terughalen kan één taak tegelijk; voor meerdere taken liever opnieuw
    # vanaf de tester laten lopen, want stashes op een oude basis geven conflicten.
    if ($wip) { git stash push -u -m "$($taak.Id) niet geslaagd" -- @($cfg.BronPaden) | Out-Null }
    git add -- @($cfg.DocPaden) | Out-Null
    # Met expliciete paden, zodat andere gestagede bestanden (bv. IDE-bestanden) niet meegaan in het savepoint.
    git commit -m "$($taak.Id): geblokkeerd, $reden`n`n$($cfg.CoAuthor)" -- @($cfg.DocPaden) | Out-Null
    Stuur-Melding "$($cfg.ProjectNaam)-loop $($taak.Id) staat stil: $reden"
}

# --- Hoofdlus ---------------------------------------------------------------

if (-not $DryRun) {
    if (-not (git branch --list $cfg.Branch)) { git checkout -b $cfg.Branch | Out-Null } else { git checkout $cfg.Branch | Out-Null }
}

$verwerkt = 0
while ($verwerkt -lt $MaxTaken) {
    $taak = if ($TaakId) { Lees-Taken | Where-Object Id -eq $TaakId } else { Volgende-Taak }
    if (-not $taak) { Schrijf-Log '-' 'loop' 'geen taak meer'; Stuur-Melding "$($cfg.ProjectNaam)-loop: geen taken meer die kunnen."; break }
    if ($DryRun) { "Volgende taak: $($taak.Id) — $($taak.Titel)"; break }
    $verwerkt++
    $id = $taak.Id
    # Taken tot BestaandTotTaak leggen bestaand gedrag vast met tests (0 = geen zulke fase).
    $bestaand = ([int]($id -replace 'T-', '')) -le $cfg.BestaandTotTaak
    Zet-Status $id '~'
    $kern = "Taak $id uit PROGRESS.md: $($taak.Titel). Volg je rolinstructies."

    # Bij hervatten halen we het werk van de vorige poging terug uit de stash van deze taak.
    if ($HervatBijCode) {
        $stash = git stash list | Select-String "$id niet geslaagd" | Select-Object -First 1
        if ($stash) { git stash pop ($stash.ToString() -replace ':.*$', '') | Out-Null }
    }

    # 1. Analyse
    $r = if ($HervatBijCode -or $HervatBijTester) { 'KLAAR' } else { Roep-Agent 'analist' $id $kern }
    if ($r -notmatch '^KLAAR') { Stop-Taak $taak $r $false; if ($TaakId) { break } else { continue } }

    # 2. Tests vóór de code
    $r = if ($HervatBijCode) { 'KLAAR' } else { Roep-Agent 'tester' $id $kern }
    if ($r -notmatch '^KLAAR') { Stop-Taak $taak $r $true; if ($TaakId) { break } else { continue } }
    $eerstePrompt = $kern
    if ($bestaand) {
        # Bij bestaand gedrag betekenen falende tests een afwijking van de requirement. Heeft de eigenaar in
        # VRAGEN.md al toegestaan dat de code verandert, dan is de ontwikkelaar de volgende stap; anders beslist
        # de eigenaar eerst. Een compilatiefout in de tests is geen afwijking: er ontbreekt een testnaad.
        $b = Draai-Build $id
        if (-not $b.Ok) {
            if ($b.CompileFout) { $eerstePrompt = "$kern`nDe tests compileren nog niet: er ontbreekt een testnaad in de code (zie de tester en docs/taken/$id.md). Maak die naad met een refactor die het gedrag niet wijzigt, en wijzig de tests niet. Laatste uitvoer:`n$($b.Staart)" }
            elseif (Is-Beantwoord $id) { $eerstePrompt = "$kern`nTests op bestaand gedrag falen: dat is een afwijking van de requirement, en de eigenaar heeft codewijziging toegestaan (zie VRAGEN.md). Los de code op. Laatste uitvoer:`n$($b.Staart)" }
            else { Stop-Taak $taak 'BLOKKADE: test op bestaand gedrag faalt, afwijking van de requirement' $true; if ($TaakId) { break } else { continue } }
        }
    }

    # 3. Code, tot build en tests slagen
    $gelukt = $false
    $testHerstel = 0
    $prompt = $eerstePrompt
    for ($poging = 1; $poging -le $cfg.MaxBouwPogingen -and -not $gelukt; $poging++) {
        $r = Roep-Agent 'ontwikkelaar' $id $prompt
        if ($r -match '^(BLOKKADE|VRAAG)' -and $r -match 'test' -and $testHerstel -lt $cfg.MaxTesterHerstel) {
            # De ontwikkelaar mag de tests niet aanpassen. Wijst hij een fout in de tests aan, dan herstelt de tester die.
            $testHerstel++
            Roep-Agent 'tester' $id "$kern`nDe ontwikkelaar meldt een fout in de tests: $r`nHerstel alleen de tests, zonder het te toetsen gedrag te veranderen." | Out-Null
            continue
        }
        if ($r -match '^(VRAAG|BLOKKADE)') { Stop-Taak $taak $r $true; break }
        $b = Draai-Build $id
        if ($b.Ok) { $gelukt = $true } else { $prompt = "$kern`nDe controle faalde (poging $poging van $($cfg.MaxBouwPogingen)). Laatste uitvoer:`n$($b.Staart)" }
    }
    if (-not $gelukt) {
        if ((Get-Content $Voortgang -Raw) -notmatch "\[!\] \*\*$id\*\*") { Stop-Taak $taak "build of tests falen na $($cfg.MaxBouwPogingen) pogingen" $true }
        if ($TaakId) { break } else { continue }
    }

    # 4. Review, met herstelrondes
    $goedgekeurd = $false
    for ($ronde = 1; $ronde -le $cfg.MaxReviewRondes + 1 -and -not $goedgekeurd; $ronde++) {
        $r = Roep-Agent 'reviewer' $id $kern
        if ($r -match '^GOEDGEKEURD') { $goedgekeurd = $true; break }
        if ($r -match '^BLOKKADE' -or $ronde -gt $cfg.MaxReviewRondes) { break }
        # De tester kijkt eerst mee: bevindingen over ontbrekende of foute tests kan de ontwikkelaar niet oplossen.
        # Gaat er niets over de tests, dan antwoordt hij meteen KLAAR.
        Roep-Agent 'tester' $id "$kern`nLees docs/taken/$id-review.md. Herstel alleen de bevindingen (ernst hoog en middel) die over de tests gaan, zoals ontbrekende tests. Gaan ze niet over de tests, wijzig dan niets en antwoord KLAAR." | Out-Null
        $d = Roep-Agent 'ontwikkelaar' $id "$kern`nHerstel de bevindingen in docs/taken/$id-review.md (ernst hoog en middel)."
        if ($d -match '^BLOKKADE' -and $d -match 'test') {
            Roep-Agent 'tester' $id "$kern`nHerstel de bevindingen in docs/taken/$id-review.md die over de tests gaan (ernst hoog en middel). De ontwikkelaar meldt: $d" | Out-Null
            $d = Roep-Agent 'ontwikkelaar' $id "$kern`nDe tester heeft de tests aangevuld. Herstel de overige bevindingen in docs/taken/$id-review.md en laat de build slagen."
        }
        $b = Draai-Build $id
        if (-not $b.Ok) { break }
    }
    if (-not $goedgekeurd) { Stop-Taak $taak "review niet goedgekeurd na $($cfg.MaxReviewRondes) rondes" $true; if ($TaakId) { break } else { continue } }

    # 5. Savepoint: opnieuw bouwen, dan pas committen
    $b = Draai-Build $id
    if (-not $b.Ok) { Stop-Taak $taak 'eindcontrole faalt' $true; if ($TaakId) { break } else { continue } }
    Zet-Status $id 'x'
    $paden = @($cfg.BronPaden) + @($cfg.DocPaden)
    git add -- $paden | Out-Null
    git commit -m "${id}: $($taak.Titel)`n`n$($cfg.CoAuthor)" -- $paden | Out-Null
    Schrijf-Log $id 'savepoint' 'gecommit'
}
