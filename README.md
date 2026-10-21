# FiveM Medical Division — uddannelsesportal

Et responsivt dansk UI til FiveM akutlæge- og operationsuddannelser.

## Funktioner
- Tilmelding med RP-navn, ingame-rank, P-nummer og frivillige hensyn/noter.
- Offentlig visning af åbne træninger og antal tilmeldte (menneskeikon + tal).
- Admin-login, oprettelse/redigering/skjulning/sletning af træninger og kapacitetsstyring.
- Admin ser kun aggregerede tilmeldingstal, aldrig deltagernes navne, P-numre eller noter.
- Server-side secrets, login-rate-limit, signup-rate-limit, session-cookie med HttpOnly/SameSite, Helmet.
- Data gemmes i JSON på en vedvarende disk, når den deployes på Render med den medfølgende disk-konfiguration.

## Deploy uden Cloudflare: Render
1. Upload alle filer og mapper i dette projekt til roden af et GitHub-repository. Bevar `public/` og `data/`.
2. Gå til https://render.com/ og forbind GitHub.
3. Opret en ny **Web Service** fra repository'et. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
4. For persistent data skal du bruge en Render-plan, der understøtter persistent disk, og konfigurere en disk monteret på `/var/data`. Render-plan/pris kan ændres, så kontrollér de aktuelle muligheder før du vælger.
5. Tilføj Environment Variables i Render:
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/var/data`
   - `ADMIN_USERNAME` = `ducki`
   - `ADMIN_PASSWORD` = vælg/indsæt din admin-adgangskode i Render-dashboardet, ikke i GitHub
   - `SESSION_SECRET` = en lang, tilfældig hemmelig værdi (fx genereret af Render eller password manager)
6. Deploy, og åbn Render-URL'en.

## Vigtigt
- Loginoplysninger ligger ikke i kildekoden. Indsæt dem som Render environment variables. Brug den adgangskode, du vil have til admin, men skift den hvis den er blevet delt andre steder.
- Fordi tilmeldinger indeholder RP-navn, P-nummer og noter, beskyt dashboardet, begræns adgangen til linket, og fastsæt en slettepolitik. Admin API'en eksponerer kun antal, ikke individuelle tilmeldinger.
- Denne startversion har ikke e-mailverifikation, CAPTCHA eller avanceret anti-spam. Overvej Turnstile/reCAPTCHA eller en godkendelsesregel, før du deler linket offentligt.
- Standard session store er Express MemoryStore. Det er acceptabelt til en lille startversion, men logins kan blive nulstillet ved genstart, og større produktion bør bruge en persistent session store.
- Render free instances may sleep/restart and do not provide persistent disk on all plans; confirm current platform terms and pricing.
