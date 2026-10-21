// Pagine verificate. Senza accesso, ogni pagina mostra la schermata di login.
module.exports = {
  BASE: (process.env.BASE || 'https://papamike80.github.io/Navibeta/').replace(/\/?$/, '/'),
  PAGES: [
    ['home', 'index.html'],
    ['oggi', 'oggi.html'],
    ['turni', 'naviturni.html'],
    ['cambio-turno', 'cambi_turno.html'],
    ['diaria', 'navidiaria.html'],
    ['distinta', 'navidistinta.html'],
    ['impostazioni', 'impostazioni.html'],
    ['agenti', 'agenti.html']
  ],
  PROFILES: { iphone: 'iPhone 14', pixel: 'Pixel 7', desktop: null }
};
