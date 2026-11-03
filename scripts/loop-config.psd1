# Projectspecifieke instellingen voor scripts/loop.ps1 en de agents in .claude/agents/.
# Stack: React + TypeScript (Vite PWA), Supabase, Vitest (unit) en Playwright (UI, mobiele viewport).
# `npm test` moet eenmalig draaien (geen watch-modus), bv. `vitest run`.
@{
    ProjectNaam = 'Smaakmaker'

    # Bouwt en draait alle tests. Exitcode 0 = geslaagd.
    BouwCommando = 'npx supabase db reset --local && npm run build && npm test'

    # Controle dat de tests compileren (typecheck).
    TestCompileCommando = 'npx tsc --noEmit'

    # Herkent een compilatiefout van de TESTS in de buildlog.
    CompileFoutPatroon = 'error TS\d+'

    ToegestaneCommandos = @('npm', 'npx', 'node', 'supabase')

    JavaHome = ''

    BronPaden = @('src', 'tests', 'public', 'supabase', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', '.gitignore', 'scripts')

    DocPaden = @('docs', 'PROGRESS.md', 'VRAGEN.md', '.claude')

    # Nieuw project: geen taken die bestaand gedrag vastleggen.
    BestaandTotTaak = 0

    Branch = 'loop'

    MaxBouwPogingen = 3
    MaxReviewRondes = 2
    MaxTesterHerstel = 2
    BudgetPerAgent = 5

    WachtMinutenBijLimiet = 10
    MaxWachtPogingen = 18

    Meldingen = $false
    CoAuthor = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'
}
