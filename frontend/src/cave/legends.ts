export type Legend = {
  key: string
  name: string
  years: string
  photo: string
  credit: { author: string; license: string; licenseUrl: string; source: string }
}

const BY2 = { license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0' }

export const LEGENDS: Legend[] = [
  {
    key: 'rooney',
    name: 'Wayne Rooney',
    years: '2004–2017',
    photo: '/images/legends/rooney.jpg',
    credit: {
      author: 'Станислав Ведмидь',
      license: 'CC BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Wayne_Rooney_144855.jpg',
    },
  },
  {
    key: 'ronaldo',
    name: 'Cristiano Ronaldo',
    years: '2003–2009, 2021–2022',
    photo: '/images/legends/ronaldo.jpg',
    credit: {
      author: 'Ray Booysen',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Ronaldo_-_Manchester_United_vs_Chelsea.jpg',
    },
  },
  {
    key: 'giggs',
    name: 'Ryan Giggs',
    years: '1991–2014',
    photo: '/images/legends/giggs.jpg',
    credit: {
      author: 'Gordon Flood',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Ryan_Giggs_vs_Everton-5.jpg',
    },
  },
  {
    key: 'scholes',
    name: 'Paul Scholes',
    years: '1994–2013',
    photo: '/images/legends/scholes.jpg',
    credit: {
      author: 'James Adams',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:P_Scholes.jpg',
    },
  },
  {
    key: 'neville',
    name: 'Gary Neville',
    years: '1992–2011',
    photo: '/images/legends/neville.jpg',
    credit: {
      author: 'Austin Osuide',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Gary_Neville_crop.jpg',
    },
  },
  {
    key: 'ferdinand',
    name: 'Rio Ferdinand',
    years: '2002–2014',
    photo: '/images/legends/ferdinand.jpg',
    credit: {
      author: 'Gordon Flood',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Rio_Ferdinand.jpg',
    },
  },
  {
    key: 'vidic',
    name: 'Nemanja Vidić',
    years: '2006–2014',
    photo: '/images/legends/vidic.jpg',
    credit: {
      author: 'Austin Osuide',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Nemanja_Vidi%C4%87_(cropped).jpg',
    },
  },
  {
    key: 'vandersar',
    name: 'Edwin van der Sar',
    years: '2005–2011',
    photo: '/images/legends/vandersar.jpg',
    credit: {
      author: 'Austin Osuide',
      ...BY2,
      source:
        'https://commons.wikimedia.org/wiki/File:Edwin_van_derSar_playing_for_MUFC_cropped.jpg',
    },
  },
  {
    key: 'carrick',
    name: 'Michael Carrick',
    years: '2006–2018',
    photo: '/images/legends/carrick.jpg',
    credit: {
      author: 'Gordon Flood',
      ...BY2,
      source:
        'https://commons.wikimedia.org/wiki/File:Michael_Carrick_cropped_(cropped_smaller).jpg',
    },
  },
  {
    key: 'evra',
    name: 'Patrice Evra',
    years: '2006–2014',
    photo: '/images/legends/evra.jpg',
    credit: {
      author: 'Gordon Flood',
      ...BY2,
      source: 'https://commons.wikimedia.org/wiki/File:Patrice_Evra_2008_(cropped).jpeg',
    },
  },
]
