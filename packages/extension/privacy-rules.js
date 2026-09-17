// privacy-rules.js — the single source of truth for what ctx refuses to look at.
//
// Loaded as a plain script (no modules, no build step) in two places:
//   1. content.js, via the content_scripts array in manifest.json — both files
//      share one isolated world, so this global is visible to content.js.
//   2. popup/popup.html, so the Privacy tab describes the rules that actually
//      run instead of a hand-maintained copy that drifts out of date.
//
// Bias: every rule here errs toward blocking. A false block costs one untracked
// page. A false allow writes something private to disk. Those are not the same
// mistake, so the patterns below are deliberately broad.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Explicit domains. Matched against the hostname with the leading "www."
  // stripped; an entry also covers every subdomain of itself.
  // ---------------------------------------------------------------------------

  const WEBMAIL = [
    "mail.google.com", "inbox.google.com", "outlook.live.com", "outlook.com",
    "outlook.office.com", "outlook.office365.com", "hotmail.com",
    "mail.yahoo.com", "mail.aol.com", "mail.proton.me", "protonmail.com",
    "proton.me", "icloud.com", "fastmail.com", "mail.zoho.com", "zohomail.com",
    "mail.com", "gmx.com", "gmx.net", "tutanota.com", "tuta.com", "hey.com",
    "mail.yandex.com", "roundcube.net", "mailfence.com", "posteo.de",
    "runbox.com", "migadu.com", "purelymail.com", "soverin.net",
  ];

  const MESSAGING = [
    "web.whatsapp.com", "whatsapp.com", "app.slack.com", "slack.com",
    "discord.com", "discordapp.com", "web.telegram.org", "telegram.org",
    "messenger.com", "teams.microsoft.com", "teams.live.com", "chat.google.com",
    "web.skype.com", "skype.com", "app.element.io", "element.io",
    "signal.org", "groupme.com", "wire.com", "threema.ch", "viber.com",
    "line.me", "kakao.com", "wechat.com", "web.wechat.com", "zoom.us",
    "app.getmatter.com", "instagram.com", "web.icq.com",
  ];

  const BANKING = [
    // North America
    "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com",
    "citibank.com", "usbank.com", "pnc.com", "capitalone.com", "discover.com",
    "americanexpress.com", "amex.com", "ally.com", "chime.com", "sofi.com",
    "truist.com", "regions.com", "fifththird.com", "huntington.com",
    "synchronybank.com", "marcus.com", "varomoney.com", "current.com",
    "rbcroyalbank.com", "rbc.com", "td.com", "tdbank.com", "scotiabank.com",
    "cibc.com", "bmo.com", "tangerine.ca", "simplii.com", "eqbank.ca",
    "desjardins.com", "nbc.ca", "nationalbank.ca", "atb.com", "coastcapital.com",
    "wealthsimple.com", "questrade.com",
    // UK / EU
    "barclays.co.uk", "hsbc.com", "hsbc.co.uk", "lloydsbank.com",
    "halifax.co.uk", "natwest.com", "santander.com", "santander.co.uk",
    "nationwide.co.uk", "monzo.com", "starlingbank.com", "revolut.com",
    "n26.com", "bunq.com", "ing.com", "rabobank.nl", "abnamro.nl",
    "deutsche-bank.de", "commerzbank.de", "sparkasse.de", "bnpparibas.com",
    "societegenerale.fr", "creditagricole.fr", "unicredit.it", "intesasanpaolo.com",
    "bbva.com", "caixabank.es",
    // APAC / other
    "commbank.com.au", "nab.com.au", "anz.com", "anz.com.au", "westpac.com.au",
    "bendigobank.com.au", "asb.co.nz", "bnz.co.nz", "kiwibank.co.nz",
    "dbs.com.sg", "ocbc.com", "uob.com.sg", "icicibank.com", "hdfcbank.com",
    "sbi.co.in", "axisbank.com", "kotak.com", "paytm.com", "phonepe.com",
    // Brokerages & retirement
    "schwab.com", "fidelity.com", "vanguard.com", "etrade.com", "tdameritrade.com",
    "robinhood.com", "interactivebrokers.com", "merrilledge.com", "empower.com",
    "principal.com", "tiaa.org", "voya.com",
  ];

  const PAYMENTS = [
    "paypal.com", "stripe.com", "dashboard.stripe.com", "squareup.com",
    "square.com", "cash.app", "venmo.com", "zellepay.com", "wise.com",
    "remitly.com", "westernunion.com", "moneygram.com", "payoneer.com",
    "adyen.com", "klarna.com", "afterpay.com", "clearpay.co.uk", "affirm.com",
    "sezzle.com", "plaid.com", "gocardless.com", "checkout.com", "braintreegateway.com",
    "mollie.com", "razorpay.com", "billdesk.com", "interac.ca",
    // Crypto — custodial balances are financial records
    "coinbase.com", "binance.com", "binance.us", "kraken.com", "gemini.com",
    "crypto.com", "blockchain.com", "bitstamp.net", "kucoin.com", "okx.com",
    "bybit.com", "ledger.com", "trezor.io", "metamask.io", "phantom.app",
    // Credit & identity bureaus
    "creditkarma.com", "experian.com", "equifax.com", "transunion.com",
    "annualcreditreport.com", "nerdwallet.com", "mint.com",
  ];

  const HEALTH = [
    "mychart.com", "myhealthrecord.com", "healthcare.gov", "medicare.gov",
    "kaiserpermanente.org", "cigna.com", "aetna.com", "uhc.com",
    "myuhc.com", "anthem.com", "bcbs.com", "humana.com", "oscar.com",
    "teladoc.com", "onemedical.com", "zocdoc.com", "goodrx.com",
    "cvs.com", "walgreens.com", "riteaid.com", "express-scripts.com",
    "labcorp.com", "questdiagnostics.com", "23andme.com", "ancestry.com",
    "patientaccess.com", "nhs.uk", "myhealth.alberta.ca", "telushealth.com",
    "drugs.com", "webmd.com", "psychologytoday.com", "betterhelp.com",
    "talkspace.com", "headspace.com", "plannedparenthood.org",
  ];

  const GOVERNMENT_AND_TAX = [
    "irs.gov", "ssa.gov", "id.me", "login.gov", "usa.gov", "uscis.gov",
    "travel.state.gov", "dmv.org", "usps.com", "sam.gov", "va.gov",
    "canada.ca", "cra-arc.gc.ca", "servicecanada.gc.ca", "ircc.canada.ca",
    "gov.uk", "hmrc.gov.uk", "dvla.gov.uk", "gov.scot", "gov.wales",
    "my.gov.au", "ato.gov.au", "servicesaustralia.gov.au",
    "govt.nz", "ird.govt.nz", "india.gov.in", "incometax.gov.in", "uidai.gov.in",
    // Tax prep
    "turbotax.intuit.com", "intuit.com", "hrblock.com", "taxact.com",
    "freetaxusa.com", "taxslayer.com", "jacksonhewitt.com", "ufile.ca",
    "simpletax.ca", "wealthsimple.com",
  ];

  const IDENTITY_AND_SECRETS = [
    "accounts.google.com", "myaccount.google.com", "login.microsoftonline.com",
    "account.microsoft.com", "appleid.apple.com", "account.apple.com",
    "signin.aws.amazon.com", "console.aws.amazon.com", "okta.com", "onelogin.com",
    "auth0.com", "duosecurity.com", "1password.com", "lastpass.com",
    "bitwarden.com", "vaultwarden.com", "dashlane.com", "keepersecurity.com",
    "nordpass.com", "roboform.com", "enpass.io", "authy.com",
  ];

  const SENSITIVE_DOMAINS = [].concat(
    WEBMAIL, MESSAGING, BANKING, PAYMENTS, HEALTH, GOVERNMENT_AND_TAX, IDENTITY_AND_SECRETS
  );

  // ---------------------------------------------------------------------------
  // Hostname patterns. These catch the long tail no hardcoded list can reach:
  // the credit union in one town, a hospital's patient portal, any government
  // domain in any country.
  // ---------------------------------------------------------------------------

  const SENSITIVE_HOST_PATTERNS = [
    // Any government TLD or second-level government domain, worldwide.
    /(^|\.)gov(\.[a-z]{2,3})?$/,
    /(^|\.)gc\.ca$/,
    /(^|\.)govt?\.[a-z]{2}$/,
    /(^|\.)mil$/,
    // Mail and account subdomains: mail.*, webmail.*, imap.*, sso.*, login.* …
    /^(mail|email|webmail|mailbox|imap|smtp)\./,
    /^(login|signin|sign-in|auth|sso|idp|oauth|id|secure|account|accounts|my)\./,
    // Online banking subdomains and any host with "bank" as its own word.
    /^(bank|banking|ebanking|onlinebanking|netbank|ibank|online)\./,
    /(^|[.-])(bank|banque|banco|bancorp|bausparkasse)([.-]|$)/,
    /credit-?union|(^|[.-])[a-z]{2,6}fcu([.-]|$)/,
    // Health and patient portals.
    /(^|[.-])(mychart|patientportal|patient|myhealth|healthrecord|medical|clinic|hospital|pharmacy|telehealth)([.-]|$)/,
    // Payroll, HR and benefits systems hold compensation and identity data.
    /(^|[.-])(payroll|benefits|hrportal|workday|paychex|adp)([.-]|$)/,
  ];

  // ---------------------------------------------------------------------------
  // URL path/query patterns. Matched with segment boundaries so that "auth" hits
  // /auth/callback but not /authors/jane — the old substring check blocked every
  // author page on the web.
  // ---------------------------------------------------------------------------

  // "Strong" words name an auth, payment or credential route almost wherever
  // they appear. "Weak" words (bank, tax, patient, card…) are just as common in
  // an article slug as in an app route, so they only count as a whole path
  // segment near the root of the site. That split is what keeps
  // /blog/2026/my-banking-app-rewrite trackable while /account/transactions is
  // not.

  const STRONG_URL_WORDS = [
    "login", "log-in", "signin", "sign-in", "signup", "sign-up", "register",
    "auth", "oauth", "sso", "saml", "logout", "session",
    "password", "passwd", "reset-password", "forgot-password", "change-password",
    "credentials", "verify", "verification", "2fa", "mfa", "otp", "one-time-code",
    "recover", "recovery", "unlock", "onboarding",
    "checkout", "payment", "payments", "billing", "invoice", "invoices",
    "receipt", "receipts", "payout", "payouts",
    "tax-return", "self-assessment", "health-record", "healthrecord",
    "lab-results", "test-results", "insurance-claim", "birth-certificate",
    "visa-application", "national-id", "driver-license", "drivers-licence",
    "api-keys", "apikeys",
  ];

  const WEAK_URL_WORDS = [
    "pay", "card", "cards", "wallet", "subscription", "subscriptions",
    "bank", "banking", "transfer", "transfers", "transaction", "transactions",
    "statement", "statements", "balance", "refund", "refunds", "accounts",
    "tax", "taxes", "w2", "1099", "t4",
    "medical", "patient", "patients", "prescription", "prescriptions",
    "diagnosis", "records", "chart", "portal",
    "ssn", "sin", "passport", "immigration", "admin", "security",
  ];

  const SENSITIVE_QUERY_KEYS = [
    "code", "token", "access_token", "id_token", "refresh_token", "auth",
    "session", "session_id", "sessionid", "sid", "api_key", "apikey", "key",
    "secret", "password", "passwd", "pwd", "otp", "state", "signature", "sig",
    "email", "ssn", "account", "card",
  ];

  const FILE_EXTENSION = /\.(php|html?|aspx?|jsp|do|cgi|action)$/i;

  // A strong word matches a segment it makes up, or one it heads or tails in a
  // short hyphenated name ("user-login", "login.php") — but not one buried in a
  // long prose slug ("how-we-rebuilt-checkout").
  function strongSegmentMatch(segment, word) {
    const seg = segment.replace(FILE_EXTENSION, "");
    if (seg === word) return true;
    if (word.includes("-")) return false;
    const parts = seg.split("-").filter(Boolean);
    return parts.length <= 3 && parts.includes(word);
  }

  // ---------------------------------------------------------------------------
  // Title/heading phrases. The blocklist has no way to know that a page on an
  // unremarkable domain is a lab result or a tax return; the page says so in its
  // own title. Phrases are multi-word on purpose — a bare "tax" or "passport"
  // would blank out half of any news site.
  // ---------------------------------------------------------------------------

  const SENSITIVE_TITLE_PATTERNS = [
    // Health records
    /\b(patient|medical|health)\s+(portal|record|records|history|chart)\b/i,
    /\bmy\s?chart\b/i,
    /\b(lab|test|blood|imaging|biopsy|pathology)\s+results?\b/i,
    /\b(prescription|medication)\s+(list|history|refill|refills)\b/i,
    /\b(visit|discharge|after[- ]visit)\s+summary\b/i,
    /\b(immunization|vaccination)\s+record\b/i,
    /\bexplanation of benefits\b/i,
    /\binsurance\s+(claim|claims|policy)\b/i,
    // Government identity
    /\b(passport|visa|green card|citizenship)\s+(application|status|renewal)\b/i,
    /\b(driver'?s?\s+(licence|license)|real id)\s+(renewal|application|record)?\b/i,
    /\b(social security|social insurance|national insurance)\s+(number|statement|account)\b/i,
    /\b(birth|marriage|death)\s+certificate\b/i,
    /\b(voter|electoral)\s+registration\b/i,
    /\bbenefits?\s+(claim|statement|application)\b/i,
    // Tax filing
    /\btax\s+(return|filing|refund|assessment|statement|documents?|year)\b/i,
    /\bfile\s+(your|my)\s+taxes\b/i,
    /\b(w-?2|1099-[a-z]{1,4}|t4\s+slip|p60|self[- ]assessment)\b/i,
    /\bnotice of assessment\b/i,
    // Money
    /\b(account|bank|credit card)\s+(balance|statement|summary|activity)\b/i,
    /\b(online|internet)\s+banking\b/i,
    /\bwire\s+transfer\b/i,
    // Credentials
    /\b(sign|log)\s?in\b/i,
    /\b(create|verify)\s+(an?\s+)?account\b/i,
    /\btwo[- ]factor\b/i,
    /\bone[- ]time\s+(code|password)\b/i,
  ];

  // ---------------------------------------------------------------------------
  // DOM signals. Checked at capture time, not just once at load, so a login form
  // rendered by JavaScript after document_idle still blocks the page.
  // ---------------------------------------------------------------------------

  const SENSITIVE_SELECTORS = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
    'input[autocomplete="one-time-code"]',
    'input[autocomplete^="cc-"]',
    'input[name*="creditcard" i]',
    'input[name*="cardnumber" i]',
    'input[name*="cvv" i]',
    'input[name*="cvc" i]',
    'input[name*="ssn" i]',
    'input[name*="sin" i]',
    'input[id*="cardnumber" i]',
    'iframe[src*="js.stripe.com"]',
    'iframe[src*="checkout.paypal"]',
    'iframe[src*="recaptcha"][title*="verify" i]',
    'form[action*="/login" i]',
    'form[action*="/signin" i]',
    'form[action*="/payment" i]',
  ];

  // ---------------------------------------------------------------------------
  // Highlight content filter. Even on a page ctx is allowed to read, a selection
  // can contain the one thing on the page worth protecting.
  // ---------------------------------------------------------------------------

  const SECRET_TEXT_PATTERNS = [
    /\b(?:\d[ -]*?){13,19}\b/,                       // card-number-shaped digit runs
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/,                 // US SSN
    /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/,                 // CA SIN
    /\b[A-Z]{2}\d{2}[ ]?[A-Z0-9]{4}[ ]?[A-Z0-9]{4}/, // IBAN
    /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/,     // Stripe-style keys
    /\b(gh[pousr]|xox[baprs])_[A-Za-z0-9]{10,}/,     // GitHub / Slack tokens
    /\bAKIA[0-9A-Z]{16}\b/,                          // AWS access key id
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,            // PEM private key
    /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,  // JWT
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // email address
    /\b[a-f0-9]{40,}\b/i,                            // long hex blobs / hashes
    /\bpassword\s*[:=]/i,
  ];

  function normalizeHost(hostname) {
    return String(hostname || "").toLowerCase().replace(/^www\./, "");
  }

  function domainIsSensitive(host, extraList) {
    const domain = normalizeHost(host);
    if (!domain) return false;
    const lists = extraList && extraList.length ? [SENSITIVE_DOMAINS, extraList] : [SENSITIVE_DOMAINS];
    for (const list of lists) {
      for (const entry of list) {
        const d = normalizeHost(entry);
        if (d && (domain === d || domain.endsWith("." + d))) return true;
      }
    }
    return SENSITIVE_HOST_PATTERNS.some((re) => re.test(domain));
  }

  function urlIsSensitive(href) {
    let parsed;
    try {
      parsed = new URL(href);
    } catch {
      return true; // unparseable URL — do not capture it
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;

    let path;
    try {
      path = decodeURIComponent(parsed.pathname);
    } catch {
      path = parsed.pathname;
    }
    const segments = path.toLowerCase().split("/").filter(Boolean);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (STRONG_URL_WORDS.some((w) => strongSegmentMatch(seg, w))) return true;
      // Weak words only count as a bare segment in app-route position.
      if (i < 3 && WEAK_URL_WORDS.includes(seg.replace(FILE_EXTENSION, ""))) return true;
    }

    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) return true;
    }
    if (parsed.username || parsed.password) return true;
    return false;
  }

  function titleIsSensitive(title) {
    const t = String(title || "");
    if (!t) return false;
    return SENSITIVE_TITLE_PATTERNS.some((re) => re.test(t));
  }

  function textLooksSecret(text) {
    const t = String(text || "");
    return SECRET_TEXT_PATTERNS.some((re) => re.test(t));
  }

  // Returns null when the page may be captured, or a short machine-readable
  // reason string when it may not. The reason never leaves the browser; it is
  // only used for the popup's "why was this blocked" line.
  function evaluate(input) {
    const { url, host, title, customBlocklist, document: doc } = input;

    if (urlIsSensitive(url)) return "url";
    if (domainIsSensitive(host, customBlocklist)) return "domain";
    if (titleIsSensitive(title)) return "title";
    if (doc) {
      for (const sel of SENSITIVE_SELECTORS) {
        let hit = null;
        try {
          hit = doc.querySelector(sel);
        } catch {
          hit = null; // malformed selector in an exotic engine — ignore
        }
        if (hit) return "form";
      }
    }
    return null;
  }

  globalThis.CTX_PRIVACY = {
    evaluate,
    domainIsSensitive,
    urlIsSensitive,
    titleIsSensitive,
    textLooksSecret,
    normalizeHost,
    // Exposed so the popup can describe the live rules instead of a stale copy.
    categories: [
      { label: "Webmail", count: WEBMAIL.length, sample: ["mail.google.com", "outlook.live.com", "mail.proton.me"] },
      { label: "Messaging", count: MESSAGING.length, sample: ["web.whatsapp.com", "app.slack.com", "discord.com"] },
      { label: "Banking & brokerage", count: BANKING.length, sample: ["chase.com", "td.com", "monzo.com"] },
      { label: "Payments & crypto", count: PAYMENTS.length, sample: ["paypal.com", "stripe.com", "coinbase.com"] },
      { label: "Health & pharmacy", count: HEALTH.length, sample: ["mychart.com", "cvs.com", "nhs.uk"] },
      { label: "Government & tax", count: GOVERNMENT_AND_TAX.length, sample: ["irs.gov", "canada.ca", "gov.uk"] },
      { label: "Logins & password vaults", count: IDENTITY_AND_SECRETS.length, sample: ["accounts.google.com", "1password.com", "okta.com"] },
    ],
    stats: {
      domains: SENSITIVE_DOMAINS.length,
      hostPatterns: SENSITIVE_HOST_PATTERNS.length,
      urlPatterns: STRONG_URL_WORDS.length + WEAK_URL_WORDS.length,
      titlePatterns: SENSITIVE_TITLE_PATTERNS.length,
      formSelectors: SENSITIVE_SELECTORS.length,
      secretPatterns: SECRET_TEXT_PATTERNS.length,
    },
  };
})();
