// The single source of truth for every page's social card AND its link-preview
// tags. One entry per page in site/; render.mjs draws from it, apply-meta.mjs
// writes the og:/twitter: block from it.
//
// `head` is the printed headline, one array item per printed line, and the last
// line is set in italic blue. `title` is what the scrapers show ABOVE the
// picture, so it deliberately does not repeat the headline printed on it -- the
// two sit stacked in every preview and saying it twice wastes the line. `alt`
// describes the picture for a reader who cannot see it.
//
// An entry marked `screenshot: true` has its picture taken rather than drawn,
// so it carries no eyebrow, head, body or rail.
export const cards = [
  {
    // The index card is a screenshot of the page, drawn by shot-index.mjs --
    // there is no printed copy on it, so it carries no headline or rail.
    page: 'index.html',
    file: 'index-card.png',
    screenshot: true,
    title: "Insurance and retirement calculators",
    description: "Free calculators for coverage need, guaranteed income, long-term care and business continuation. No account, no sales call to get an answer.",
    alt: "The Quote-Bot calculators index — coverage, retirement income, long-term care and business continuation tools",
  },
  {
    page: 'careltccalculator.html',
    file: 'careltc-card.png',
    title: "Size your long-term care exposure with C.A.R.E.",
    description: "Use the C.A.R.E. framework to quantify your long-term care exposure and design the coverage to protect your retirement assets.",
    eyebrow: 'LONG-TERM CARE NEEDS',
    head: ["Maximize your plan", "use C.A.R.E. when planning", "Long Term Care"],
    body: 'The C.A.R.E. method: cover your Assets, protect your Retirement, preserve your Estate — four pillars, one exposure figure.',
    rail: [
      ['Assets', 'What care reaches for first'],
      ['Retirement', 'Income that has to keep going'],
      ['Estate', 'Whatever is still there after'],
    ],
    alt: 'The C.A.R.E. long-term care needs calculator from Quote-Bot',
  },
  {
    page: 'crosspurchasebuysellcalculator.html',
    file: 'crosspurchase-card.png',
    title: "Fund a cross-purchase buy-sell with life insurance",
    description: "Value your business five recognized ways, then see how much life insurance each partner needs on every other partner.",
    eyebrow: 'CROSS-PURCHASE BUY-SELL',
    head: ["Your business value", "a funded buy out", "through life insurance."],
    body: 'Value the business five recognised ways, then size the policy each owner needs on every other owner.',
    rail: [
      ['Five', 'Recognised valuation methods'],
      ['Every pair', 'Who insures whom, and for how much'],
      ['Funded', 'Not just agreed to on paper'],
    ],
    alt: 'Cross-purchase buy-sell funding calculator from Quote-Bot',
  },
  {
    page: 'dimeneedscalculator.html',
    file: 'dimeneeds-card.png',
    title: "How much life insurance you actually need",
    description: "The D.I.M.E. method — Debt, Income, Mortgage and Education — with a category-by-category breakdown and real carrier rates.",
    eyebrow: 'D.I.M.E. NEEDS ANALYSIS',
    head: ["What's your number?", "Your needs plan", "with Live Rates!"],
    body: 'Debt, Income, Mortgage, Education — four categories, added up in front of you instead of a rule of thumb.',
    rail: [
      ['Debt', 'What would still have to be paid'],
      ['Income', 'The years it has to replace'],
      ['Education', 'What you already promised them'],
    ],
    alt: 'D.I.M.E. life insurance needs calculator from Quote-Bot',
  },
  {
    page: 'fiaincomeridercalculator.html',
    file: 'fiaincomerider-card.png',
    title: "Model an FIA income rider before you buy one",
    description: "Set the roll-up rate, roll-up period, payout factor and rider charge, and see the lifetime income beside the real account value.",
    eyebrow: 'FIA INCOME RIDER',
    head: ["Maximize your retirement", "with income you", "can't outlive!"],
    body: 'Set the roll-up, the deferral period, the payout factor and the rider charge, then read the income beside the real account value.',
    rail: [
      ['Roll-up', 'The number the pitch leads with'],
      ['Payout', 'What it turns into for life'],
      ['Account value', 'What is actually still yours'],
    ],
    alt: 'Fixed indexed annuity income rider calculator from Quote-Bot',
  },
  {
    page: 'incomefloorcalculator.html',
    file: 'incomefloor-card.png',
    title: "Guarantee the income your fixed expenses require",
    description: "See what lump sum a lifetime income rider needs to cover your non-negotiable monthly expenses for life, and check it against best-interest concentration guardrails.",
    eyebrow: 'GUARANTEED INCOME FLOOR',
    head: ["In retirement", "Some bills don't care", "how the market did."],
    body: 'Size the lump sum a lifetime income rider needs to cover your non-negotiable monthly expenses — and check it against concentration guardrails.',
    rail: [
      ['Floor', 'The expenses that never stop'],
      ['Lump sum', 'What guaranteeing them costs'],
      ['Guardrails', 'Concentration limits, flagged'],
    ],
    alt: 'Guaranteed income floor calculator from Quote-Bot',
  },
  {
    page: 'keypersoncalculator.html',
    file: 'keyperson-card.png',
    title: "What a key employee is worth to your business",
    description: "Put a defensible dollar figure on what each key employee is worth, then see the coverage and quotes to protect it.",
    eyebrow: 'KEY PERSON VALUATION',
    head: ["How you value the", "loss of a key employee", "with live rates."],
    body: 'Put a defensible dollar figure on a key employee, then see the coverage and real carrier pricing to protect it.',
    rail: [
      ['Valuation', 'A figure you can defend'],
      ['Coverage', 'Sized to the actual loss'],
      ['Pricing', 'Real carriers, not a placeholder'],
    ],
    alt: 'Key person insurance valuation calculator from Quote-Bot',
  },
  {
    page: 'ltcannuitytaxillustration.html',
    file: 'ltcannuitytax-card.png',
    title: "Turn a low-basis annuity into tax-free care money",
    description: "See how a Pension Protection Act long-term care annuity pays distributions for qualified care income-tax-free, against a standard taxable distribution.",
    eyebrow: 'PPA LTC ANNUITY',
    head: ["Maximize the value", "of low cost basis", "annuities."],
    body: 'See how a Pension Protection Act annuity pays qualified long-term care costs income-tax-free, beside the same money taken as a taxable distribution.',
    rail: [
      ['Qualified', 'What the distribution must be for'],
      ['Tax-free', 'Under the Pension Protection Act'],
      ['Side by side', 'Against the taxable version'],
    ],
    alt: 'Pension Protection Act long-term care annuity tax illustration from Quote-Bot',
  },
  {
    page: 'mugcalculator.html',
    file: 'mug-card.png',
    title: "How much disability coverage to target",
    description: "Enter your mortgage, utilities and groceries and see how much monthly disability benefit covers them — and what that coverage might cost.",
    eyebrow: 'DISABILITY COVERAGE',
    head: ['Your income stops.', 'The three bills', 'do not.'],
    body: 'Mortgage, Utilities, Groceries — enter the three that never wait and see the disability coverage to target, and what it might cost.',
    rail: [
      ['Mortgage', 'Due on the first either way'],
      ['Utilities', 'Nobody pauses them for you'],
      ['Groceries', 'The one that is every week'],
    ],
    alt: 'M.U.G. disability coverage calculator from Quote-Bot',
  },
  {
    page: 'mygacalculator.html',
    file: 'myga-card.png',
    title: "Compare current MYGA rates by term",
    description: "See how much your money can grow in a Multi-Year Guaranteed Annuity. Compare current rates by duration and project the guaranteed maturity value.",
    eyebrow: 'MULTI-YEAR GUARANTEED ANNUITY',
    head: ['A rate that holds', 'for the whole term,', 'not just year one.'],
    body: 'Compare current MYGA rates by duration and project the guaranteed value at maturity, with no market risk in between.',
    rail: [
      ['Fixed', 'The same rate every year of it'],
      ['Guaranteed', 'A maturity value you can plan on'],
      ['No risk', 'Nothing to lose in a bad year'],
    ],
    alt: 'Multi-year guaranteed annuity rate calculator from Quote-Bot',
  },
  {
    page: 'retirementdistributioncalculator.html',
    file: 'retirementdistribution-card.png',
    title: "A tax-free retirement distribution strategy",
    description: "See how life insurance cash value can pay the retirement tax bill, leaving qualified and non-qualified accounts to compound longer.",
    eyebrow: 'RETIREMENT DISTRIBUTION',
    head: ['Pay the tax bill', 'from somewhere', 'that is not the nest egg.'],
    body: 'See how life insurance cash value can cover the tax, leaving qualified and non-qualified accounts to keep compounding.',
    rail: [
      ['Cash value', 'Where the tax bill comes from'],
      ['Compounding', 'What the accounts do meanwhile'],
      ['Sequence', 'Which bucket you draw first'],
    ],
    alt: 'Tax-efficient retirement distribution calculator from Quote-Bot',
  },
  {
    page: 'sequenceofreturnscalculator.html',
    file: 'sequenceofreturns-card.png',
    title: "Why the order of returns beats the average",
    description: "See how much cash value it takes to cover income during negative market years, so a down market is never the reason you have to sell.",
    eyebrow: 'SEQUENCE OF RETURNS',
    head: ["How do you reduce", "your risk of starting", "income in a down year?"],
    body: 'Find how much cash value it takes to cover income in the negative years, so a down market is never the reason you sell.',
    rail: [
      ['Down years', 'When selling costs the most'],
      ['Cash value', 'Income that is not the market'],
      ['Recovery', 'What is left to rebound'],
    ],
    alt: 'Sequence of returns cash value calculator from Quote-Bot',
  },
];
