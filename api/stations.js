// All Cascais Line Stations (Real CP IDs)
const CASCAIS_LINE_STATIONS = [
  { id: "94-69005", name: "Cais do Sodre" },
  { id: "94-69013", name: "Santos" },
  { id: "94-69039", name: "Alcantara -  Mar" },
  { id: "94-69054", name: "Belem" },
  { id: "94-69088", name: "Alges" },
  { id: "94-69104", name: "Cruz Quebrada" },
  { id: "94-69120", name: "Caxias" },
  { id: "94-69146", name: "Paco de Arcos" },
  { id: "94-69161", name: "Santo Amaro" },
  { id: "94-69179", name: "Oeiras" },
  { id: "94-69187", name: "Carcavelos" },
  { id: "94-69203", name: "Parede" },
  { id: "94-69229", name: "Sao Pedro do Estoril" },
  { id: "94-69237", name: "Sao Joao do Estoril" },
  { id: "94-69245", name: "Estoril" },
  { id: "94-69252", name: "Monte Estoril" },
  { id: "94-69260", name: "Cascais" }
];

module.exports = (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Cache for 1 day
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    res.json(CASCAIS_LINE_STATIONS);
};

