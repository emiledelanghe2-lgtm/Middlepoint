// Hulplijnen per land/regio. Voeg gerust meer landen toe.
const CRISIS_RESOURCES = {
  BE: {
    suicide: { name: 'Zelfmoordlijn 1813', phone: '1813', url: 'https://www.zelfmoord1813.be' },
    violence: { name: '1712 — Geweld, Misbruik, Kindermishandeling', phone: '1712', url: 'https://www.1712.be' },
    general: { name: 'CAW (Centrum Algemeen Welzijnswerk)', phone: '', url: 'https://www.caw.be' },
  },
  NL: {
    suicide: { name: '113 Zelfmoordpreventie', phone: '0800-0113', url: 'https://www.113.nl' },
    violence: { name: 'Veilig Thuis', phone: '0800-2000', url: 'https://www.veiligthuis.nl' },
    general: { name: 'De Luisterlijn', phone: '088-0767000', url: 'https://www.deluisterlijn.nl' },
  },
  DEFAULT: {
    suicide: { name: 'Internationale hulplijnen overzicht', phone: '', url: 'https://findahelpline.com' },
    violence: { name: 'Internationale hulplijnen overzicht', phone: '', url: 'https://findahelpline.com' },
    general: { name: 'Internationale hulplijnen overzicht', phone: '', url: 'https://findahelpline.com' },
  },
};

module.exports = { CRISIS_RESOURCES };
