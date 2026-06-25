// Centrale configuratie voor prijzen en limieten.
// Pas deze waarden hier aan -- ze worden gebruikt op de prijspagina en (later) bij de Stripe-koppeling.
// Tip: verander hier de cijfers, niet in pricing.html zelf.

const PRICING_CONFIG = {
  currency: '€',
  plans: [
    {
      id: 'gratis',
      name: 'Gratis proefversie',
      price: 0,
      period: '',
      maxCharsPerStory: 2000,
      sessionsIncluded: 1,
      includesFollowups: false,
      includesCheckins: false,
      description: 'Probeer Middlepoint één keer, met een beperkte verhaallengte.',
      cta: 'Start gratis',
      ctaLink: '/new.html',
    },
    {
      id: 'los',
      name: 'Eén gesprek',
      price: 12,
      period: 'eenmalig',
      maxCharsPerStory: 8000,
      sessionsIncluded: 1,
      includesFollowups: true,
      includesCheckins: true,
      description: 'Volledige toegang voor één conflict, inclusief vervolgvragen en groeidocument.',
      cta: 'Binnenkort beschikbaar',
      ctaLink: null, // wordt een Stripe-checkout-link
    },
    {
      id: 'abo',
      name: 'Onbeperkt',
      price: 9,
      period: '/maand',
      maxCharsPerStory: 8000,
      sessionsIncluded: null, // null = onbeperkt
      includesFollowups: true,
      includesCheckins: true,
      description: 'Voor wie Middlepoint structureel wil gebruiken -- onbeperkt aantal gesprekken.',
      cta: 'Binnenkort beschikbaar',
      ctaLink: null,
      highlight: true,
    },
    {
      id: 'pro',
      name: 'Pro (therapeuten, HR, advocaten)',
      price: 29,
      period: '/maand',
      maxCharsPerStory: 8000,
      sessionsIncluded: null,
      includesFollowups: true,
      includesCheckins: true,
      description: 'Meerdere actieve cases tegelijk beheren, met organisator-dashboard.',
      cta: 'Contacteer ons',
      ctaLink: 'mailto:hello@middlepoint.net',
    },
  ],
};

if (typeof module !== 'undefined') module.exports = PRICING_CONFIG;
